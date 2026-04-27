import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import { parse as parseYaml } from 'yaml';
import { nanoid } from 'nanoid';
import type { Root, Heading, List } from 'mdast';
import type { ParsedProject, ParseWarning, SourceRange } from './types.js';
import { NULL_RANGE as NR } from './types.js';

function rangeFromNode(node: { position?: { start: { offset?: number; line: number }; end: { offset?: number } } }): SourceRange {
  if (!node.position) return NR;
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

export function parseProjectMd(
  content: string,
  filename: string = 'project.md'
): { project: ParsedProject; warnings: ParseWarning[] } {
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
  const fps = typeof frontmatter.fps === 'number' ? frontmatter.fps : 24;
  const aspectRatio = frontmatter.aspect_ratio ?? '16:9';
  const targetDuration = typeof frontmatter.target_duration === 'number' ? frontmatter.target_duration : undefined;
  const createdAt = frontmatter.created_at ? String(frontmatter.created_at) : new Date().toISOString();
  const updatedAt = frontmatter.updated_at ? String(frontmatter.updated_at) : new Date().toISOString();

  const contentNodes = tree.children.filter((n) => n.type !== 'yaml');
  let title = '';
  let titleRange: SourceRange = NR;
  let styleNotes = '';
  let styleNotesRange: SourceRange = NR;
  let referenceLinks: string[] = [];
  let referenceLinksRange: SourceRange = NR;
  let globalNotes = '';
  let globalNotesRange: SourceRange = NR;

  type Section = { heading: string; headingRange: SourceRange; nodes: any[] };
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (const node of contentNodes) {
    if (node.type === 'heading') {
      const h = node as Heading;
      const text = extractTextContent(h);
      if (h.depth === 1) {
        title = text;
        titleRange = rangeFromNode(h);
      } else if (h.depth === 2) {
        currentSection = { heading: text, headingRange: rangeFromNode(h), nodes: [] };
        sections.push(currentSection);
      }
    } else if (currentSection) {
      currentSection.nodes.push(node);
    }
  }

  for (const section of sections) {
    const sectionText = section.nodes.map((n: any) => content.slice(n.position?.start?.offset ?? 0, n.position?.end?.offset ?? 0)).join('\n').trim();
    const firstNode = section.nodes[0];
    const lastNode = section.nodes[section.nodes.length - 1];
    const sectionRange: SourceRange = section.nodes.length > 0
      ? { from: firstNode?.position?.start?.offset ?? 0, to: lastNode?.position?.end?.offset ?? 0, line: firstNode?.position?.start?.line ?? 0 }
      : section.headingRange;

    const heading = section.heading.toLowerCase().trim();
    if (heading === 'style notes') {
      styleNotes = sectionText;
      styleNotesRange = sectionRange;
    } else if (heading === 'reference links') {
      referenceLinksRange = sectionRange;
      for (const node of section.nodes) {
        if (node.type === 'list') {
          for (const item of (node as List).children) {
            const itemText = extractTextContent(item).trim();
            if (itemText) referenceLinks.push(itemText);
          }
        }
      }
    } else if (heading === 'global notes') {
      globalNotes = sectionText;
      globalNotesRange = sectionRange;
    }
  }

  return {
    project: {
      id,
      title,
      fps,
      aspectRatio,
      targetDuration,
      styleNotes,
      referenceLinks,
      globalNotes,
      createdAt,
      updatedAt,
      sourceRanges: {
        title: titleRange,
        styleNotes: styleNotesRange,
        referenceLinks: referenceLinksRange,
        globalNotes: globalNotesRange,
      },
    },
    warnings,
  };
}
