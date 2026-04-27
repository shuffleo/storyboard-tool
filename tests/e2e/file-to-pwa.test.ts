import { describe, test, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { StateManager } from '../../server/stateManager.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

function createTestProject() {
  const projectPath = mkdtempSync(join(tmpdir(), 'storyboard-f2p-'));
  mkdirSync(join(projectPath, 'assets'), { recursive: true });
  cpSync(join(FIXTURES_DIR, 'project.md'), join(projectPath, 'project.md'));
  cpSync(join(FIXTURES_DIR, 'scene-001.md'), join(projectPath, 'scene-001.md'));
  const sm = new StateManager(projectPath);
  sm.loadFromDisk();
  return { projectPath, sm };
}

describe('E2E: File edits -> PWA update', () => {
  const cleanups: string[] = [];

  afterEach(() => {
    for (const p of cleanups) {
      try { rmSync(p, { recursive: true, force: true }); } catch {}
    }
    cleanups.length = 0;
  });

  test('E2E-1: shot title edit produces diff', () => {
    const { projectPath, sm } = createTestProject();
    cleanups.push(projectPath);

    let scene = readFileSync(join(projectPath, 'scene-001.md'), 'utf-8');
    scene = scene.replace(
      '### 2s: Wide shot - city skyline at dawn',
      '### 2s: Wide shot - mountain sunrise'
    );
    writeFileSync(join(projectPath, 'scene-001.md'), scene, 'utf-8');

    const ops = sm.applyFileChange('scene-001.md', scene);

    const updateOps = ops.filter((op) => op.type === 'update' && op.entity === 'shot');
    expect(updateOps.length).toBeGreaterThan(0);

    const state = sm.getState();
    const updatedShot = state.shots.find((s) => s.title === 'Wide shot - mountain sunrise');
    expect(updatedShot).toBeDefined();
  });

  test('E2E-2: duration change produces correct diff', () => {
    const { projectPath, sm } = createTestProject();
    cleanups.push(projectPath);

    let scene = readFileSync(join(projectPath, 'scene-001.md'), 'utf-8');
    scene = scene.replace('### 2s:', '### 3.5s:');
    writeFileSync(join(projectPath, 'scene-001.md'), scene, 'utf-8');

    const ops = sm.applyFileChange('scene-001.md', scene);

    expect(ops.some((op) => op.type === 'update' && op.entity === 'shot')).toBe(true);

    const shot = sm.getState().shots.find((s) => s.title === 'Wide shot - city skyline at dawn');
    expect(shot).toBeDefined();
    expect(shot!.duration).toBe(3500);
  });

  test('E2E-3: new shot added to file produces create diff', () => {
    const { projectPath, sm } = createTestProject();
    cleanups.push(projectPath);

    const initialShotCount = sm.getState().shots.length;

    let scene = readFileSync(join(projectPath, 'scene-001.md'), 'utf-8');
    scene += `\n---\n\n<!-- shot: {"id":"e2e_new_shot","tags":["new"]} -->\n### 1s: New test shot\n\nThis is a new shot.\n`;
    writeFileSync(join(projectPath, 'scene-001.md'), scene, 'utf-8');

    const ops = sm.applyFileChange('scene-001.md', scene);

    expect(ops.some((op) => op.type === 'create' && op.entity === 'shot')).toBe(true);
    expect(sm.getState().shots.length).toBe(initialShotCount + 1);
  });

  test('E2E-4: new scene file produces create diff', () => {
    const { projectPath, sm } = createTestProject();
    cleanups.push(projectPath);

    const initialSceneCount = sm.getState().scenes.length;

    const newScene = `---\nid: e2e_scene_002\nscene_number: "2"\norder_index: 1\n---\n\n# Scene 2: The Journey\n\nThe character sets out.\n\n## Notes\n\nOutdoor lighting.\n\n---\n\n<!-- shot: {"id":"e2e_s2_shot1","tags":["wide"]} -->\n### 3s: Wide shot - open road\n\nA wide shot of the road.\n`;
    writeFileSync(join(projectPath, 'scene-002.md'), newScene, 'utf-8');

    const ops = sm.applyFileAdd('scene-002.md', newScene);

    expect(ops.some((op) => op.type === 'create' && op.entity === 'scene')).toBe(true);
    expect(sm.getState().scenes.length).toBe(initialSceneCount + 1);
  });

  test('E2E-5: deleted scene file produces delete diff', () => {
    const { projectPath, sm } = createTestProject();
    cleanups.push(projectPath);

    expect(sm.getState().scenes.length).toBeGreaterThan(0);
    const initialShotCount = sm.getState().shots.length;

    unlinkSync(join(projectPath, 'scene-001.md'));
    const ops = sm.applyFileDelete('scene-001.md');

    expect(ops.some((op) => op.type === 'delete')).toBe(true);
    expect(sm.getState().scenes.length).toBe(0);
    expect(sm.getState().shots.length).toBeLessThan(initialShotCount);
  });

  test('E2E-6: project.md change produces project update diff', () => {
    const { projectPath, sm } = createTestProject();
    cleanups.push(projectPath);

    let project = readFileSync(join(projectPath, 'project.md'), 'utf-8');
    project = project.replace('# E2E Test Project', '# Updated Project Title');
    writeFileSync(join(projectPath, 'project.md'), project, 'utf-8');

    const ops = sm.applyFileChange('project.md', project);

    expect(ops.some((op) => op.type === 'update' && op.entity === 'project')).toBe(true);
    expect(sm.getState().project.title).toBe('Updated Project Title');
  });
});
