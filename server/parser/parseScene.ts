import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import { parse as parseYaml } from 'yaml';
import { nanoid } from 'nanoid';
import type { Root, Heading } from 'mdast';
import type { ParsedScene, ParseWarning, SourceRange } from './types.js';
import { NULL_RANGE } from './types.js';
import { parseShotFromNodes } from './parseShot.js';

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

export function parseSceneMd(
  content: string,
  filename: string
): { scene: ParsedScene; warnings: ParseWarning[] } {
  const warnings: ParseWarning[] = [];
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .parse(content) as Root;

  let frontmatter: Record<string, any> = {};
  const yamlNode = tree.children.find((n) => n.type === 'yaml');
  if (yamlNode && yamlNode.type === 'yaml') {
    try {
      frontmatter = parseYaml(yamlNode.value) ?? {};
    } catch {
      warnings.push({ file: filename, line: 1, message: 'Invalid YAML frontmatter', severity: 'warning' });
    }
  } else {
    warnings.push({ file: filename, line: 1, message: 'Missing frontmatter', severity: 'warning' });
  }

  const id = frontmatter.id ?? nanoid();
  if (!frontmatter.id) {
    warnings.push({ file: filename, line: 1, message: 'Missing id in frontmatter, auto-generated', severity: 'warning' });
  }
  const sceneNumber = String(frontmatter.scene_number ?? '');
  const orderIndex = typeof frontmatter.order_index === 'number' ? frontmatter.order_index : 0;

  const contentNodes = tree.children.filter((n) => n.type !== 'yaml');

  let title = '';
  let titleRange: SourceRange = NULL_RANGE;
  let summaryParts: string[] = [];
  let summaryRange: SourceRange = NULL_RANGE;
  let notes = '';
  let notesRange: SourceRange = NULL_RANGE;

  // Phase 1: find the H1 heading
  let h1Index = -1;
  for (let i = 0; i < contentNodes.length; i++) {
    if (contentNodes[i].type === 'heading' && (contentNodes[i] as Heading).depth === 1) {
      h1Index = i;
      const h1 = contentNodes[i] as Heading;
      const fullText = extractTextContent(h1);
      const colonIdx = fullText.indexOf(': ');
      title = colonIdx >= 0 ? fullText.slice(colonIdx + 2) : fullText;
      titleRange = rangeFromNode(h1);
      break;
    }
  }

  // Phase 2: collect summary and notes (everything between H1 and first shot/thematic break that starts shots)
  let firstShotBreakIndex = contentNodes.length;
  let notesH2Index = -1;

  for (let i = h1Index + 1; i < contentNodes.length; i++) {
    const node = contentNodes[i];
    if (node.type === 'heading' && (node as Heading).depth === 2) {
      const text = extractTextContent(node).toLowerCase().trim();
      if (text === 'notes') {
        notesH2Index = i;
      }
    }
    // First thematic break after any ## Notes section (or after summary if no notes) marks shots start
    if (node.type === 'thematicBreak') {
      firstShotBreakIndex = i;
      break;
    }
    // An H3 (shot heading) without a preceding thematic break also starts shots
    if (node.type === 'heading' && (node as Heading).depth === 3) {
      firstShotBreakIndex = i;
      break;
    }
    // An HTML comment matching shot pattern also starts shots
    if (node.type === 'html' && /^<!--\s*shot:/.test((node as any).value)) {
      firstShotBreakIndex = i;
      break;
    }
  }

  // Summary: content between H1 and (## Notes or first shot break)
  const summaryEnd = notesH2Index >= 0 ? notesH2Index : firstShotBreakIndex;
  let firstSummaryNode: any = null;
  let lastSummaryNode: any = null;
  for (let i = h1Index + 1; i < summaryEnd; i++) {
    const node = contentNodes[i];
    const text = content.slice(node.position?.start?.offset ?? 0, node.position?.end?.offset ?? 0).trim();
    if (text) {
      summaryParts.push(text);
      if (!firstSummaryNode) firstSummaryNode = node;
      lastSummaryNode = node;
    }
  }
  if (firstSummaryNode && lastSummaryNode) {
    summaryRange = {
      from: firstSummaryNode.position?.start?.offset ?? 0,
      to: lastSummaryNode.position?.end?.offset ?? 0,
      line: firstSummaryNode.position?.start?.line ?? 0,
    };
  }

  // Notes: content between ## Notes heading and first shot break
  if (notesH2Index >= 0) {
    const notesParts: string[] = [];
    let firstNotesNode: any = null;
    let lastNotesNode: any = null;
    for (let i = notesH2Index + 1; i < firstShotBreakIndex; i++) {
      const node = contentNodes[i];
      const text = content.slice(node.position?.start?.offset ?? 0, node.position?.end?.offset ?? 0).trim();
      if (text) {
        notesParts.push(text);
        if (!firstNotesNode) firstNotesNode = node;
        lastNotesNode = node;
      }
    }
    notes = notesParts.join('\n');
    if (firstNotesNode && lastNotesNode) {
      notesRange = {
        from: firstNotesNode.position?.start?.offset ?? 0,
        to: lastNotesNode.position?.end?.offset ?? 0,
        line: firstNotesNode.position?.start?.line ?? 0,
      };
    }
  }

  // Phase 3: parse shots - split by thematic breaks after the first shot break
  const shotNodes = contentNodes.slice(firstShotBreakIndex);
  const shotGroups: any[][] = [];
  let currentGroup: any[] = [];

  for (const node of shotNodes) {
    if (node.type === 'thematicBreak') {
      if (currentGroup.length > 0) {
        shotGroups.push(currentGroup);
        currentGroup = [];
      }
      continue;
    }
    currentGroup.push(node);
  }
  if (currentGroup.length > 0) {
    shotGroups.push(currentGroup);
  }

  const shots = [];
  for (const group of shotGroups) {
    const hasH3 = group.some((n: any) => n.type === 'heading' && n.depth === 3);
    if (!hasH3) continue;

    const shot = parseShotFromNodes(
      { nodes: group, filename, sourceContent: content },
      warnings
    );
    if (shot) shots.push(shot);
  }

  return {
    scene: {
      id,
      sceneNumber,
      orderIndex,
      title,
      summary: summaryParts.join('\n'),
      notes,
      shots,
      sourceFile: filename,
      sourceRanges: {
        title: titleRange,
        summary: summaryRange,
        notes: notesRange,
      },
    },
    warnings,
  };
}
