import { describe, test, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { StateManager } from '../../server/stateManager.js';
import { parseProjectFolder, parsedToProjectState } from '../../server/parser/index.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

function createTestProject() {
  const projectPath = mkdtempSync(join(tmpdir(), 'storyboard-pwa-'));
  mkdirSync(join(projectPath, 'assets'), { recursive: true });
  cpSync(join(FIXTURES_DIR, 'project.md'), join(projectPath, 'project.md'));
  cpSync(join(FIXTURES_DIR, 'scene-001.md'), join(projectPath, 'scene-001.md'));
  const sm = new StateManager(projectPath);
  sm.loadFromDisk();
  return { projectPath, sm };
}

describe('E2E: PWA mutations -> file update', () => {
  const cleanups: string[] = [];

  afterEach(() => {
    for (const p of cleanups) {
      try { rmSync(p, { recursive: true, force: true }); } catch {}
    }
    cleanups.length = 0;
  });

  test('E2E-7: mutation writes shot update to file', async () => {
    const { projectPath, sm } = createTestProject();
    cleanups.push(projectPath);

    const shotId = sm.getState().shots[0].id;

    await sm.applyMutation([
      {
        type: 'update',
        entity: 'shot',
        id: shotId,
        data: { id: shotId, scriptText: 'Updated script from PWA mutation.' },
      },
    ]);

    const state = sm.getState();
    const updatedShot = state.shots.find((s) => s.id === shotId);
    expect(updatedShot).toBeDefined();
    expect(updatedShot!.scriptText).toBe('Updated script from PWA mutation.');

    const sceneContent = readFileSync(join(projectPath, 'scene-001.md'), 'utf-8');
    expect(sceneContent).toContain('Updated script from PWA mutation.');

    // Verify round-trip: re-parse should match
    const files = new Map<string, string>();
    files.set('project.md', readFileSync(join(projectPath, 'project.md'), 'utf-8'));
    files.set('scene-001.md', sceneContent);
    const parsed = parseProjectFolder(files);
    expect(parsed.warnings.length).toBe(0);
  });

  test('E2E-8: create scene writes new file', async () => {
    const { projectPath, sm } = createTestProject();
    cleanups.push(projectPath);

    const initialSceneCount = sm.getState().scenes.length;

    await sm.applyMutation([
      {
        type: 'create',
        entity: 'scene',
        id: 'pwa_new_scene',
        data: {
          id: 'pwa_new_scene',
          title: 'Beach Scene',
          sceneNumber: '2',
          orderIndex: 1,
          summary: 'A sunny day at the beach.',
          notes: '',
        },
      },
    ]);

    const state = sm.getState();
    expect(state.scenes.length).toBe(initialSceneCount + 1);
    const newScene = state.scenes.find((s) => s.title === 'Beach Scene');
    expect(newScene).toBeDefined();

    const entries = readdirSync(projectPath);
    const sceneFiles = entries.filter((e) => /^scene-\d+\.md$/.test(e));
    expect(sceneFiles.length).toBe(2);

    const files = new Map<string, string>();
    files.set('project.md', readFileSync(join(projectPath, 'project.md'), 'utf-8'));
    for (const sf of sceneFiles) {
      files.set(sf, readFileSync(join(projectPath, sf), 'utf-8'));
    }
    const parsed = parseProjectFolder(files);
    const parsedState = parsedToProjectState(parsed);
    expect(parsedState.scenes.find((s) => s.title === 'Beach Scene')).toBeDefined();
  });

  test('E2E-9: delete shot modifies file', async () => {
    const { projectPath, sm } = createTestProject();
    cleanups.push(projectPath);

    const initialShotCount = sm.getState().shots.length;
    const shotId = sm.getState().shots[0].id;

    await sm.applyMutation([
      { type: 'delete', entity: 'shot', id: shotId },
    ]);

    const state = sm.getState();
    expect(state.shots.length).toBe(initialShotCount - 1);
    expect(state.shots.find((s) => s.id === shotId)).toBeUndefined();

    const sceneContent = readFileSync(join(projectPath, 'scene-001.md'), 'utf-8');
    const files = new Map<string, string>();
    files.set('project.md', readFileSync(join(projectPath, 'project.md'), 'utf-8'));
    files.set('scene-001.md', sceneContent);
    const parsed = parseProjectFolder(files);
    const parsedState = parsedToProjectState(parsed);
    expect(parsedState.shots.find((s) => s.id === shotId)).toBeUndefined();
  });
});
