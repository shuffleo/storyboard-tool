import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { parse as parseYaml } from 'yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import type { ParseWarning } from './parser/types.js';

const SCENE_RE = /^scene-\d+\.md$/;
const DURATION_RE = /^(\d+(?:\.\d+)?)(s|ms|m)$/;

export interface LintResult {
  warnings: ParseWarning[];
  fileCount: number;
}

export function lintProject(projectPath: string): LintResult {
  const absPath = resolve(projectPath);
  const entries = readdirSync(absPath);
  const warnings: ParseWarning[] = [];
  let fileCount = 0;

  const mdFiles = entries.filter(e => e.endsWith('.md'));

  for (const file of mdFiles) {
    if (file !== 'project.md' && !SCENE_RE.test(file)) {
      warnings.push({
        file,
        line: 0,
        message: `Non-standard file "${file}" in storyboard folder. Only project.md and scene-NNN.md are recognized. Move other files outside the storyboard folder.`,
        severity: 'warning',
      });
    }
  }

  if (!mdFiles.includes('project.md')) {
    warnings.push({ file: 'project.md', line: 0, message: 'Missing project.md', severity: 'error' });
  } else {
    const content = readFileSync(resolve(absPath, 'project.md'), 'utf-8');
    warnings.push(...lintProjectMd(content));
    fileCount++;
  }

  for (const file of mdFiles.filter(f => SCENE_RE.test(f))) {
    const content = readFileSync(resolve(absPath, file), 'utf-8');
    warnings.push(...lintSceneMd(file, content, absPath));
    fileCount++;
  }

  return { warnings, fileCount };
}

function lintProjectMd(content: string): ParseWarning[] {
  const warnings: ParseWarning[] = [];
  const fm = extractFrontmatter(content, 'project.md', warnings);

  if (fm) {
    if (!fm.id) warnings.push({ file: 'project.md', line: 1, message: 'Frontmatter missing required field "id"', severity: 'warning' });
    if (fm.fps === undefined) warnings.push({ file: 'project.md', line: 1, message: 'Frontmatter missing required field "fps"', severity: 'warning' });
  }

  return warnings;
}

function lintSceneMd(file: string, content: string, projectPath: string): ParseWarning[] {
  const warnings: ParseWarning[] = [];
  const fm = extractFrontmatter(content, file, warnings);

  if (fm) {
    if (!fm.id) warnings.push({ file, line: 1, message: 'Frontmatter missing required field "id"', severity: 'warning' });
    if (fm.scene_number === undefined) warnings.push({ file, line: 1, message: 'Frontmatter missing required field "scene_number"', severity: 'warning' });
    if (fm.order_index === undefined) warnings.push({ file, line: 1, message: 'Frontmatter missing required field "order_index"', severity: 'warning' });
  }

  const tree = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).parse(content);
  const lines = content.split('\n');

  for (const node of tree.children) {
    if (node.type === 'heading' && node.depth === 3) {
      const text = extractText(node);
      const colonIdx = text.indexOf(': ');
      if (colonIdx <= 0) {
        warnings.push({
          file,
          line: node.position?.start?.line ?? 0,
          message: `H3 heading "${text}" is not a valid shot heading. Expected format: "### {duration}: {title}". Every ### after the first --- is parsed as a shot.`,
          severity: 'error',
        });
      } else {
        const durationPart = text.slice(0, colonIdx).trim();
        if (!DURATION_RE.test(durationPart)) {
          warnings.push({
            file,
            line: node.position?.start?.line ?? 0,
            message: `Invalid duration "${durationPart}" in shot heading. Use formats like 2s, 500ms, 1.5m.`,
            severity: 'error',
          });
        }
      }
    }

    if (node.type === 'paragraph') {
      const text = extractText(node).trim();
      const hasImages = node.children?.some((c: any) => c.type === 'image');

      if (hasImages) {
        for (const child of node.children || []) {
          if (child.type !== 'image') continue;
          const imgUrl: string = child.url || '';
          const imgLine = child.position?.start?.line ?? 0;

          if (/^https?:\/\//.test(imgUrl)) continue;

          if (!imgUrl.startsWith('assets/')) {
            warnings.push({
              file, line: imgLine,
              message: `Image path "${imgUrl}" should start with "assets/". Use ![label](assets/path.png).`,
              severity: 'warning',
            });
          }

          const fullPath = resolve(join(projectPath, imgUrl));
          if (!existsSync(fullPath)) {
            warnings.push({
              file, line: imgLine,
              message: `Image file not found: "${imgUrl}". Check the path and filename.`,
              severity: 'error',
            });
          }
        }
      }

      if (!hasImages && text && /^[a-zA-Z0-9_-]+$/.test(text) && text.length < 40) {
        const line = node.position?.start?.line ?? 0;
        const prevLine = line > 1 ? lines[line - 2] : '';
        if (prevLine.startsWith('>') || prevLine.trim() === '') {
          warnings.push({
            file,
            line,
            message: `Bare text "${text}" looks like an asset placeholder. Use ![${text}](assets/${text}.png) or remove it. Bare text becomes script text, not a frame reference.`,
            severity: 'warning',
          });
        }
      }
    }
  }

  return warnings;
}

function extractFrontmatter(content: string, file: string, warnings: ParseWarning[]): Record<string, any> | null {
  if (!content.startsWith('---')) {
    warnings.push({ file, line: 1, message: 'Missing frontmatter (--- delimited YAML block)', severity: 'error' });
    return null;
  }

  const lines = content.split('\n');
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeIdx = i;
      break;
    }
  }

  if (closeIdx === -1) {
    warnings.push({ file, line: 1, message: 'Frontmatter block not properly closed with ---. Ensure a line with only "---" appears after the YAML fields.', severity: 'error' });
    return null;
  }

  const fmLines = lines.slice(1, closeIdx);
  const hasMarkdownHeading = fmLines.some(l => /^#{1,3}\s/.test(l.trim()));
  if (hasMarkdownHeading) {
    warnings.push({
      file,
      line: 1,
      message: 'Frontmatter contains markdown headings (# or ##). Frontmatter must be plain YAML between --- delimiters with no markdown syntax.',
      severity: 'error',
    });
    return null;
  }

  const yamlStr = fmLines.join('\n');
  try {
    const parsed = parseYaml(yamlStr);
    if (typeof parsed !== 'object' || parsed === null) {
      warnings.push({ file, line: 1, message: 'Frontmatter YAML did not parse to an object', severity: 'error' });
      return null;
    }
    return parsed as Record<string, any>;
  } catch (e: any) {
    warnings.push({ file, line: 1, message: `Invalid YAML in frontmatter: ${e.message}`, severity: 'error' });
    return null;
  }
}

function extractText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  if (node.children) return node.children.map(extractText).join('');
  return '';
}

if (process.argv[1]?.endsWith('lint.ts') || process.argv[1]?.endsWith('lint.js')) {
  let projectPath = '';
  for (let i = 2; i < process.argv.length; i++) {
    if ((process.argv[i] === '--project' || process.argv[i] === '-p') && process.argv[i + 1]) {
      projectPath = process.argv[++i];
    } else if (!process.argv[i].startsWith('-') && !projectPath) {
      projectPath = process.argv[i];
    }
  }

  if (!projectPath) {
    console.error('Usage: tsx server/lint.ts --project /path/to/storyboard');
    process.exit(1);
  }

  const result = lintProject(projectPath);
  if (result.warnings.length === 0) {
    console.log(`Linted ${result.fileCount} files — no issues found.`);
  } else {
    const errors = result.warnings.filter(w => w.severity === 'error');
    const warns = result.warnings.filter(w => w.severity === 'warning');
    for (const w of result.warnings) {
      const prefix = w.severity === 'error' ? 'ERROR' : 'WARN';
      const loc = w.line > 0 ? `:${w.line}` : '';
      console.log(`${prefix}  ${w.file}${loc}  ${w.message}`);
    }
    console.log(`\nLinted ${result.fileCount} files — ${errors.length} error(s), ${warns.length} warning(s).`);
    if (errors.length > 0) process.exit(1);
  }
}
