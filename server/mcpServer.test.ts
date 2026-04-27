import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { StateManager } from './stateManager.js';
import { handleRead, handleWrite, handleReorder, handleExport, handleImport, handleTimeline, handleAssets, handleSync } from './mcpTools.js';
import type { DiffOp } from './protocol.js';

const TEST_DIR = join(tmpdir(), `storyboard-mcp-test-${Date.now()}`);
let stateManager: StateManager;
const collectedDiffs: DiffOp[][] = [];
const broadcastDiff = (ops: DiffOp[]) => { collectedDiffs.push(ops); };

function setupProject() {
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'assets'), { recursive: true });

  writeFileSync(join(TEST_DIR, 'project.md'), `---
id: mcp-test
fps: 24
aspect_ratio: "16:9"
created_at: 2026-01-01T00:00:00Z
updated_at: 2026-01-01T00:00:00Z
---

# MCP Test Project

## Style Notes

Test style.

## Reference Links

## Global Notes

`);

  writeFileSync(join(TEST_DIR, 'scene-001.md'), `---
id: sc1
scene_number: "1"
order_index: 0
---

# Scene 1: Opening

---

<!-- shot: {"id":"sh1","tags":["wide"]} -->
### 2s: Wide shot

Script text for shot 1.

---

<!-- shot: {"id":"sh2","tags":[]} -->
### 1s: Close-up

Script text for shot 2.
`);

  stateManager = new StateManager(TEST_DIR);
  stateManager.loadFromDisk();
  collectedDiffs.length = 0;
}

beforeEach(() => {
  setupProject();
});

afterEach(() => {
  try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
});

describe('storyboard_read', () => {
  it('filter=all returns full state', () => {
    const result = handleRead(stateManager, { filter: 'all' });
    const data = JSON.parse(result.content[0].text);
    expect(data.project.id).toBe('mcp-test');
    expect(data.scenes).toHaveLength(1);
    expect(data.shots).toHaveLength(2);
  });

  it('filter=project returns only project', () => {
    const result = handleRead(stateManager, { filter: 'project' });
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe('mcp-test');
    expect(data.title).toBe('MCP Test Project');
  });

  it('filter=shots returns shots', () => {
    const result = handleRead(stateManager, { filter: 'shots' });
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe('sh1');
  });
});

describe('storyboard_write', () => {
  it('creates a scene', async () => {
    const result = await handleWrite(stateManager, broadcastDiff, {
      operations: [{ action: 'create', entity_type: 'scene', data: { title: 'New Scene' } }],
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.applied).toBe(1);
    expect(stateManager.getState().scenes).toHaveLength(2);
  });

  it('creates a shot', async () => {
    const result = await handleWrite(stateManager, broadcastDiff, {
      operations: [{ action: 'create', entity_type: 'shot', data: { sceneId: 'sc1', scriptText: 'New shot text', title: 'New shot' } }],
    });
    expect(result.isError).toBeFalsy();
    expect(stateManager.getState().shots).toHaveLength(3);
  });

  it('updates a shot', async () => {
    const result = await handleWrite(stateManager, broadcastDiff, {
      operations: [{ action: 'update', entity_type: 'shot', data: { id: 'sh1', scriptText: 'Updated script' } }],
    });
    expect(result.isError).toBeFalsy();
    expect(stateManager.getState().shots.find(s => s.id === 'sh1')?.scriptText).toBe('Updated script');
  });

  it('deletes a shot', async () => {
    await handleWrite(stateManager, broadcastDiff, {
      operations: [{ action: 'delete', entity_type: 'shot', data: { id: 'sh2' } }],
    });
    expect(stateManager.getState().shots).toHaveLength(1);
  });

  it('batch operations apply atomically', async () => {
    await handleWrite(stateManager, broadcastDiff, {
      operations: [
        { action: 'create', entity_type: 'shot', data: { sceneId: 'sc1', title: 'Shot A' } },
        { action: 'create', entity_type: 'shot', data: { sceneId: 'sc1', title: 'Shot B' } },
      ],
    });
    expect(stateManager.getState().shots).toHaveLength(4);
  });

  it('broadcasts diff after write', async () => {
    collectedDiffs.length = 0;
    await handleWrite(stateManager, broadcastDiff, {
      operations: [{ action: 'create', entity_type: 'shot', data: { sceneId: 'sc1', title: 'Broadcast test' } }],
    });
    expect(collectedDiffs.length).toBeGreaterThan(0);
  });

  it('rejects invalid entity_type', async () => {
    const result = await handleWrite(stateManager, broadcastDiff, {
      operations: [{ action: 'create', entity_type: 'invalid', data: {} }],
    });
    expect(result.isError).toBe(true);
  });
});

describe('storyboard_export', () => {
  it('exports JSON', () => {
    const result = handleExport(stateManager, { format: 'json' });
    const data = JSON.parse(result.content[0].text);
    expect(data.project.id).toBe('mcp-test');
  });

  it('exports CSV', () => {
    const result = handleExport(stateManager, { format: 'csv' });
    expect(result.content[0].text).toContain('Shot Code');
    expect(result.content[0].text).toContain('Wide shot');
  });
});

describe('storyboard_timeline', () => {
  it('get_timeline returns computed times', () => {
    const result = handleTimeline(stateManager, broadcastDiff, { action: 'get_timeline' });
    const data = JSON.parse(result.content[0].text);
    expect(data.timeline).toHaveLength(2);
    expect(data.timeline[0].startMs).toBe(0);
    expect(data.timeline[0].durationMs).toBe(2000);
    expect(data.timeline[1].startMs).toBe(2000);
    expect(data.totalDurationMs).toBe(3000);
  });

  it('set_durations clamps below 300ms', async () => {
    const result = await handleTimeline(stateManager, broadcastDiff, {
      action: 'set_durations',
      durations: { sh1: 100 },
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.warnings.length).toBeGreaterThan(0);
    expect(stateManager.getState().shots.find(s => s.id === 'sh1')?.duration).toBe(300);
  });
});

describe('storyboard_assets', () => {
  it('list returns files in assets/', async () => {
    writeFileSync(join(TEST_DIR, 'assets', 'test.png'), 'fake-png-data');
    const result = await handleAssets(stateManager, broadcastDiff, TEST_DIR, { action: 'list' });
    const data = JSON.parse(result.content[0].text);
    expect(data.files.length).toBeGreaterThan(0);
    expect(data.files[0].name).toBe('test.png');
  });

  it('add from base64 creates file', async () => {
    const b64 = Buffer.from('fake-image-data').toString('base64');
    const result = await handleAssets(stateManager, broadcastDiff, TEST_DIR, {
      action: 'add',
      data: b64,
      filename: 'new-img.png',
      shot_id: 'sh1',
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.asset).toBe('assets/new-img.png');
    expect(existsSync(join(TEST_DIR, 'assets', 'new-img.png'))).toBe(true);
  });
});

describe('storyboard_sync', () => {
  it('status returns version and path', () => {
    const result = handleSync(stateManager, broadcastDiff, TEST_DIR, { action: 'status' });
    const data = JSON.parse(result.content[0].text);
    expect(data.version).toBeTypeOf('number');
    expect(data.projectPath).toBe(TEST_DIR);
  });

  it('pull reloads from disk', () => {
    const result = handleSync(stateManager, broadcastDiff, TEST_DIR, { action: 'pull' });
    const data = JSON.parse(result.content[0].text);
    expect(data.pulled).toBe(true);
  });
});
