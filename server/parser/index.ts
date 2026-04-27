import { parseProjectMd } from './parseProject.js';
import { parseSceneMd } from './parseScene.js';
import type { ParseResult, ParseWarning, ParsedProject, ParsedScene } from './types.js';

export function parseProjectFolder(files: Map<string, string>): ParseResult {
  const warnings: ParseWarning[] = [];

  const projectContent = files.get('project.md');
  let project: ParsedProject;

  if (projectContent !== undefined) {
    const result = parseProjectMd(projectContent, 'project.md');
    project = result.project;
    warnings.push(...result.warnings);
  } else {
    warnings.push({ file: 'project.md', line: 0, message: 'project.md not found', severity: 'error' });
    const { project: defaultProject } = parseProjectMd(
      '---\nfps: 24\n---\n\n# Untitled Project\n',
      'project.md'
    );
    project = defaultProject;
  }

  const sceneFiles = Array.from(files.keys())
    .filter((f) => /^scene-\d+\.md$/.test(f))
    .sort();

  const scenes: ParsedScene[] = [];
  for (const filename of sceneFiles) {
    const content = files.get(filename)!;
    const result = parseSceneMd(content, filename);
    scenes.push(result.scene);
    warnings.push(...result.warnings);
  }

  return { project, scenes, warnings };
}

export { serializeProject } from './serialize.js';
export { parsedToProjectState, projectStateToMarkdown } from './converters.js';
export { parseProjectMd } from './parseProject.js';
export { parseSceneMd } from './parseScene.js';
export type { ParseResult, ParseWarning, ParsedProject, ParsedScene } from './types.js';
export type { ParsedShot, ParsedFrame, SourceRange } from './types.js';
