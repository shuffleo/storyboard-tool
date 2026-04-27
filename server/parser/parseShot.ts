import { nanoid } from 'nanoid';
import type { Heading, Html, Paragraph, Image } from 'mdast';
import type { ParsedShot, ParsedFrame, ParseWarning, SourceRange } from './types.js';
import { NULL_RANGE } from './types.js';

const DURATION_RE = /^(\d+(?:\.\d+)?)(s|ms|m)$/;
const SHOT_COMMENT_RE = /^<!--\s*shot:\s*(.*?)\s*-->$/s;

function rangeFromNode(node: { position?: { start: { offset?: number; line: number }; end: { offset?: number } } }): SourceRange {
  if (!node.position) return NULL_RANGE;
  return {
    from: node.position.start.offset ?? 0,
    to: node.position.end.offset ?? 0,
    line: node.position.start.line,
  };
}

function extractTextContent(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  if (node.children) return node.children.map(extractTextContent).join('');
  return '';
}

function parseDuration(raw: string): { ms: number; valid: boolean } {
  const match = raw.match(DURATION_RE);
  if (!match) return { ms: 1000, valid: false };
  const value = parseFloat(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'ms': return { ms: value, valid: true };
    case 's': return { ms: value * 1000, valid: true };
    case 'm': return { ms: value * 60000, valid: true };
    default: return { ms: 1000, valid: false };
  }
}

export interface ShotParseContext {
  nodes: any[];
  filename: string;
  sourceContent: string;
}

export function parseShotFromNodes(
  ctx: ShotParseContext,
  warnings: ParseWarning[]
): ParsedShot | null {
  const { nodes, filename, sourceContent } = ctx;
  if (nodes.length === 0) return null;

  let metadataComment: { id?: string; tags?: string[] } = {};
  let metadataCommentRange: SourceRange = NULL_RANGE;
  let headingNode: Heading | null = null;

  let startIdx = 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type === 'html') {
      const html = node as Html;
      const match = html.value.match(SHOT_COMMENT_RE);
      if (match) {
        try {
          metadataComment = JSON.parse(match[1]);
        } catch {
          warnings.push({ file: filename, line: rangeFromNode(html).line, message: 'Malformed JSON in shot metadata comment', severity: 'warning' });
        }
        metadataCommentRange = rangeFromNode(html);
        continue;
      }
    }
    if (node.type === 'heading' && (node as Heading).depth === 3) {
      headingNode = node as Heading;
      startIdx = i + 1;
      break;
    }
  }

  if (!headingNode) return null;

  const headingText = extractTextContent(headingNode);
  const headingRange = rangeFromNode(headingNode);

  let durationMs = 1000;
  let shotTitle = headingText;
  let durationRange: SourceRange = NULL_RANGE;
  let titleRange: SourceRange = NULL_RANGE;

  const colonIdx = headingText.indexOf(': ');
  if (colonIdx > 0) {
    const durationPart = headingText.slice(0, colonIdx).trim();
    const titlePart = headingText.slice(colonIdx + 2).trim();
    const { ms, valid } = parseDuration(durationPart);
    if (valid) {
      durationMs = ms;
      shotTitle = titlePart;

      const rawLine = sourceContent.slice(headingRange.from, headingRange.to);
      const hashEnd = rawLine.indexOf(' ') + headingRange.from;
      const durationStart = hashEnd + 1;
      const durationEnd = durationStart + durationPart.length;
      durationRange = { from: durationStart, to: durationEnd, line: headingRange.line };

      const titleStart = durationEnd + 2;
      titleRange = { from: titleStart, to: titleStart + titlePart.length, line: headingRange.line };
    } else {
      warnings.push({ file: filename, line: headingRange.line, message: `Invalid duration "${durationPart}", defaulting to 1000ms`, severity: 'warning' });
      shotTitle = headingText;
      titleRange = headingRange;
    }
  } else {
    warnings.push({ file: filename, line: headingRange.line, message: 'Shot heading missing duration, defaulting to 1000ms', severity: 'warning' });
    titleRange = headingRange;
  }

  const id = metadataComment.id ?? nanoid();
  if (!metadataComment.id) {
    warnings.push({ file: filename, line: headingRange.line, message: 'Shot missing metadata comment with id, auto-generated', severity: 'warning' });
  }
  const tags = metadataComment.tags ?? [];

  const bodyNodes = nodes.slice(startIdx);
  let scriptParagraphs: string[] = [];
  let scriptTextRange: SourceRange = NULL_RANGE;
  let generalNotes = '';
  let generalNotesRange: SourceRange = NULL_RANGE;
  const frames: ParsedFrame[] = [];

  let firstScriptNode: any = null;
  let lastScriptNode: any = null;

  for (const node of bodyNodes) {
    if (node.type === 'thematicBreak') continue;
    if (node.type === 'paragraph') {
      const images: Image[] = [];
      const textParts: string[] = [];
      for (const child of (node as Paragraph).children) {
        if (child.type === 'image') {
          images.push(child as Image);
        } else {
          textParts.push(extractTextContent(child));
        }
      }
      if (images.length > 0) {
        for (const img of images) {
          const frame: ParsedFrame = {
            id: `${id}-f${String(frames.length).padStart(2, '0')}`,
            label: img.alt ?? '',
            path: img.url,
            caption: img.title ?? '',
            orderIndex: frames.length,
            sourceRanges: {
              whole: rangeFromNode(img),
              path: rangeFromNode(img),
              caption: rangeFromNode(img),
            },
          };
          frames.push(frame);
        }
      }
      const textContent = textParts.join('').trim();
      if (textContent) {
        scriptParagraphs.push(textContent);
        if (!firstScriptNode) firstScriptNode = node;
        lastScriptNode = node;
      }
    } else if (node.type === 'blockquote') {
      generalNotes = extractTextContent(node).trim();
      generalNotesRange = rangeFromNode(node);
    } else if (node.type === 'html') {
      // skip non-shot html comments in body
    }
  }

  const scriptText = scriptParagraphs.join('\n');
  if (firstScriptNode && lastScriptNode) {
    scriptTextRange = {
      from: firstScriptNode.position?.start?.offset ?? 0,
      to: lastScriptNode.position?.end?.offset ?? 0,
      line: firstScriptNode.position?.start?.line ?? 0,
    };
  }

  const wholeFrom = metadataCommentRange.from !== 0 ? metadataCommentRange.from : headingRange.from;
  const lastNode = bodyNodes.length > 0 ? bodyNodes[bodyNodes.length - 1] : headingNode;
  const wholeTo = lastNode.position?.end?.offset ?? headingRange.to;

  return {
    id,
    durationMs,
    title: shotTitle,
    scriptText,
    generalNotes,
    tags,
    frames,
    sourceRanges: {
      whole: { from: wholeFrom, to: wholeTo, line: headingRange.line },
      metadataComment: metadataCommentRange,
      duration: durationRange,
      title: titleRange,
      scriptText: scriptTextRange,
      generalNotes: generalNotesRange,
    },
  };
}
