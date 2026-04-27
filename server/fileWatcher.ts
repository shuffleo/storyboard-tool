import { watch } from 'chokidar';
import { readFileSync } from 'fs';
import { basename, resolve } from 'path';
import type { StateManager } from './stateManager.js';
import type { DiffOp } from './protocol.js';

export interface FileWatcherOptions {
  projectPath: string;
  debounceMs: number;
  stateManager: StateManager;
  onDiff: (ops: DiffOp[]) => void;
  onEditingStart?: () => void;
  onEditingDone?: () => void;
}

export function startFileWatcher(options: FileWatcherOptions) {
  const { projectPath, debounceMs, stateManager, onDiff, onEditingStart, onEditingDone } = options;
  const absPath = resolve(projectPath);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isEditing = false;
  const pendingChanges = new Map<string, 'change' | 'add' | 'unlink'>();

  function flush() {
    const batch = new Map(pendingChanges);
    pendingChanges.clear();

    for (const [filePath, eventType] of batch) {
      const resolvedPath = resolve(filePath);
      if (stateManager.selfWritePaths.has(resolvedPath)) {
        continue;
      }

      const filename = basename(filePath);

      if (filename !== 'project.md' && !/^scene-\d+\.md$/.test(filename)) {
        continue;
      }

      let ops: DiffOp[] = [];
      try {
        if (eventType === 'unlink') {
          ops = stateManager.applyFileDelete(filename);
        } else {
          const content = readFileSync(resolvedPath, 'utf-8');
          if (eventType === 'add') {
            ops = stateManager.applyFileAdd(filename, content);
          } else {
            ops = stateManager.applyFileChange(filename, content);
          }
        }

        if (ops.length > 0) {
          onDiff(ops);
        }
      } catch (err) {
        console.error(`Error processing ${eventType} for ${filename}:`, err);
      }
    }
  }

  function scheduleFlush() {
    if (!isEditing) {
      isEditing = true;
      onEditingStart?.();
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      flush();
      isEditing = false;
      onEditingDone?.();
    }, debounceMs);
  }

  const watcher = watch(
    [
      `${absPath}/project.md`,
      `${absPath}/scene-*.md`,
    ],
    {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    }
  );

  watcher
    .on('change', (path: string) => {
      pendingChanges.set(path, 'change');
      scheduleFlush();
    })
    .on('add', (path: string) => {
      pendingChanges.set(path, 'add');
      scheduleFlush();
    })
    .on('unlink', (path: string) => {
      pendingChanges.set(path, 'unlink');
      scheduleFlush();
    });

  return {
    close: () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      return watcher.close();
    },
  };
}
