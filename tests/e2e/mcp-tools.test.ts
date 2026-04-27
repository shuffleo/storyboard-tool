import { describe, test, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, cpSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { StateManager } from '../../server/stateManager.js';
import {
  handleRead,
  handleWrite,
  handleTimeline,
  handleAssets,
  handleSync,
} from '../../server/mcpTools.js';
import type { DiffOp } from '../../server/protocol.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

function parseMcpResult(result: { content: Array<{ type: string; text: string }>; isError?: boolean }) {
  if (result.isError) throw new Error(result.content[0].text);
  return JSON.parse(result.content[0].text);
}

function createTestProject() {
  const projectPath = mkdtempSync(join(tmpdir(), 'storyboard-mcp-'));
  mkdirSync(join(projectPath, 'assets'), { recursive: true });
  cpSync(join(FIXTURES_DIR, 'project.md'), join(projectPath, 'project.md'));
  cpSync(join(FIXTURES_DIR, 'scene-001.md'), join(projectPath, 'scene-001.md'));
  const sm = new StateManager(projectPath);
  sm.loadFromDisk();
  return { projectPath, sm };
}

describe('E2E: MCP tools -> file + PWA update', () => {
  const cleanups: string[] = [];

  afterEach(() => {
    for (const p of cleanups) {
      try { rmSync(p, { recursive: true, force: true }); } catch {}
    }
    cleanups.length = 0;
  });

  test('E2E-10: MCP write creates shot -> file AND state updated', async () => {
    const { projectPath, sm } = createTestProject();
    cleanups.push(projectPath);

    const initialShotCount = sm.getState().shots.length;
    const sceneId = sm.getState().scenes[0].id;

    const broadcastOps: DiffOp[] = [];
    const broadcastDiff = (ops: DiffOp[]) => { broadcastOps.push(...ops); };

    const result = await handleWrite(sm, broadcastDiff, {
      operations: [
        {
          action: 'create',
          entity_type: 'shot',
          data: {
            sceneId,
            title: 'MCP created shot',
            scriptText: 'Created via MCP tool',
            duration: 2000,
            tags: ['test'],
          },
        },
      ],
    });

    const data = parseMcpResult(result);
    expect(data.applied).toBe(1);
    expect(broadcastOps.some((op) => op.type === 'create' && op.entity === 'shot')).toBe(true);

    const state = sm.getState();
    expect(state.shots.length).toBe(initialShotCount + 1);
    expect(state.shots.some((s) => s.title === 'MCP created shot')).toBe(true);

    // Verify file on disk was updated
    const { readFileSync } = await import('fs');
    const sceneContent = readFileSync(join(projectPath, 'scene-001.md'), 'utf-8');
    expect(sceneContent).toContain('MCP created shot');
    expect(sceneContent).toContain('Created via MCP tool');
  });

  test('E2E-11: MCP read reflects file state', () => {
    const { projectPath, sm } = createTestProject();
    cleanups.push(projectPath);

    const result = handleRead(sm, { filter: 'all' });
    const data = parseMcpResult(result);

    expect(data.project.title).toBe('E2E Test Project');
    expect(data.scenes.length).toBe(1);
    expect(data.shots.length).toBe(2);
  });

  test('E2E-12: MCP timeline computes correct times', () => {
    const { projectPath, sm } = createTestProject();
    cleanups.push(projectPath);

    const broadcastDiff = () => {};
    const result = handleTimeline(sm, broadcastDiff, { action: 'get_timeline' });
    const data = parseMcpResult(result as any);

    expect(data.timeline).toBeDefined();
    expect(data.timeline.length).toBe(2);

    expect(data.timeline[0].startMs).toBe(0);
    expect(data.timeline[0].durationMs).toBe(2000);
    expect(data.timeline[0].endMs).toBe(2000);

    expect(data.timeline[1].startMs).toBe(2000);
    expect(data.timeline[1].durationMs).toBe(1500);
    expect(data.timeline[1].endMs).toBe(3500);

    expect(data.totalDurationMs).toBe(3500);
  });

  test('E2E-13: MCP assets add creates file and frame', async () => {
    const { projectPath, sm } = createTestProject();
    cleanups.push(projectPath);

    const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const shotId = sm.getState().shots[0].id;

    const broadcastOps: DiffOp[] = [];
    const broadcastDiff = (ops: DiffOp[]) => { broadcastOps.push(...ops); };

    const result = await handleAssets(sm, broadcastDiff, projectPath, {
      action: 'add',
      data: base64Png,
      filename: 'test-asset.png',
      shot_id: shotId,
    });

    const data = parseMcpResult(result);
    expect(data.asset).toBe('assets/test-asset.png');
    expect(data.frameId).toBeDefined();

    expect(existsSync(join(projectPath, 'assets', 'test-asset.png'))).toBe(true);

    const state = sm.getState();
    const frame = state.frames.find((f) => f.image === 'assets/test-asset.png');
    expect(frame).toBeDefined();
    expect(frame!.shotId).toBe(shotId);

    expect(broadcastOps.some((op) => op.type === 'create' && op.entity === 'frame')).toBe(true);
  });

  test('E2E-14: MCP sync pull refreshes state from disk', () => {
    const { projectPath, sm } = createTestProject();
    cleanups.push(projectPath);

    const { readFileSync, writeFileSync } = require('fs');
    let scene = readFileSync(join(projectPath, 'scene-001.md'), 'utf-8');
    scene = scene.replace(
      '### 2s: Wide shot - city skyline at dawn',
      '### 4s: Wide shot - sunset over mountains'
    );
    writeFileSync(join(projectPath, 'scene-001.md'), scene, 'utf-8');

    // State still has old data (no watcher, no pull)
    const oldShot = sm.getState().shots.find((s) => s.title === 'Wide shot - city skyline at dawn');
    expect(oldShot).toBeDefined();

    const broadcastDiff = () => {};
    const result = handleSync(sm, broadcastDiff, projectPath, { action: 'pull' });
    const data = parseMcpResult(result as any);
    expect(data.pulled).toBe(true);

    const newShot = sm.getState().shots.find((s) => s.title === 'Wide shot - sunset over mountains');
    expect(newShot).toBeDefined();
    expect(newShot!.duration).toBe(4000);
  });
});
