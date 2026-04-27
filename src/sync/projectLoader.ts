import type { ProjectState } from '../types';
import type { ParseResult } from '../../server/parser/types';
import { parseProjectFolder, parsedToProjectState, projectStateToMarkdown } from '../../server/parser/index';
import { readProjectFiles, writeProjectFile, deleteProjectFile, listSceneFiles } from './fileSystemAccess';
import type { ProjectFolderHandle } from './fileSystemAccess';

export interface LoadProjectResult {
  state: ProjectState;
  parseResult: ParseResult;
}

export async function loadProject(handle: ProjectFolderHandle): Promise<LoadProjectResult> {
  const files = await readProjectFiles(handle);
  const parseResult = parseProjectFolder(files);
  const state = parsedToProjectState(parseResult);

  if (parseResult.warnings.length > 0) {
    console.warn('Project parse warnings:', parseResult.warnings);
  }

  return { state, parseResult };
}

export async function saveProject(
  handle: ProjectFolderHandle,
  state: ProjectState
): Promise<void> {
  const mdFiles = projectStateToMarkdown(state);
  const existingScenes = await listSceneFiles(handle);

  const newSceneFiles = new Set<string>();
  for (const [filename, content] of mdFiles) {
    await writeProjectFile(handle, filename, content);
    if (/^scene-\d+\.md$/.test(filename)) {
      newSceneFiles.add(filename);
    }
  }

  for (const existing of existingScenes) {
    if (!newSceneFiles.has(existing)) {
      await deleteProjectFile(handle, existing);
    }
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function debouncedSaveProject(
  handle: ProjectFolderHandle,
  state: ProjectState,
  delay: number = 1000
): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveProject(handle, state).catch((err) => {
      console.error('Auto-save failed:', err);
    });
  }, delay);
}
