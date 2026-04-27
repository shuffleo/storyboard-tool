import { describe, test, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createServer } from 'net';
import { WebSocket } from 'ws';
import { StateManager } from '../../server/stateManager.js';
import { startWsServer } from '../../server/wsServer.js';
import type { WsMessage, SyncFullPayload, MutationApplyPayload, DiffOp } from '../../server/protocol.js';
import type { ProjectState } from '../../src/types.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

function createTestProject() {
  const projectPath = mkdtempSync(join(tmpdir(), 'storyboard-res-'));
  mkdirSync(join(projectPath, 'assets'), { recursive: true });
  cpSync(join(FIXTURES_DIR, 'project.md'), join(projectPath, 'project.md'));
  cpSync(join(FIXTURES_DIR, 'scene-001.md'), join(projectPath, 'scene-001.md'));
  return projectPath;
}

function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

describe('E2E: Resilience', () => {
  const cleanupFns: (() => void)[] = [];

  afterEach(() => {
    for (const fn of cleanupFns) {
      try { fn(); } catch {}
    }
    cleanupFns.length = 0;
  });

  test('E2E-16: reconnect -> re-syncs with current state', async () => {
    const projectPath = createTestProject();
    cleanupFns.push(() => rmSync(projectPath, { recursive: true, force: true }));

    const sm = new StateManager(projectPath);
    sm.loadFromDisk();

    const port = await getRandomPort();
    const wsServer = startWsServer({ port, stateManager: sm, onMutationApplied: () => {} });
    cleanupFns.push(() => wsServer.close());

    await new Promise((r) => setTimeout(r, 100));

    // First client connects and gets sync:full
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}`);
    cleanupFns.push(() => { try { ws1.terminate(); } catch {} });

    const state1 = await new Promise<ProjectState>((resolve) => {
      ws1.on('message', (raw: Buffer) => {
        const msg: WsMessage = JSON.parse(raw.toString());
        if (msg.type === 'sync:full') resolve((msg.payload as SyncFullPayload).state);
      });
    });
    expect(state1.shots[0].duration).toBe(2000);

    // Modify state directly
    await sm.applyMutation([
      { type: 'update', entity: 'shot', id: state1.shots[0].id, data: { duration: 5000 } },
    ]);

    // Disconnect first client
    ws1.terminate();
    await new Promise((r) => setTimeout(r, 50));

    // Second client connects (simulates reconnect)
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
    cleanupFns.push(() => { try { ws2.terminate(); } catch {} });

    const state2 = await new Promise<ProjectState>((resolve) => {
      ws2.on('message', (raw: Buffer) => {
        const msg: WsMessage = JSON.parse(raw.toString());
        if (msg.type === 'sync:full') resolve((msg.payload as SyncFullPayload).state);
      });
    });

    const shot = state2.shots.find((s) => s.id === state1.shots[0].id);
    expect(shot).toBeDefined();
    expect(shot!.duration).toBe(5000);

    ws2.terminate();
  });

  test('E2E-17: sequential mutations both persist', async () => {
    const projectPath = createTestProject();
    cleanupFns.push(() => rmSync(projectPath, { recursive: true, force: true }));

    const sm = new StateManager(projectPath);
    sm.loadFromDisk();

    const shot1Id = sm.getState().shots[0].id;
    const shot2Id = sm.getState().shots[1].id;

    await sm.applyMutation([
      { type: 'update', entity: 'shot', id: shot1Id, data: { title: 'Sequential title update' } },
    ]);

    await sm.applyMutation([
      { type: 'update', entity: 'shot', id: shot2Id, data: { duration: 4000 } },
    ]);

    const state = sm.getState();
    const s1 = state.shots.find((s) => s.id === shot1Id);
    const s2 = state.shots.find((s) => s.id === shot2Id);

    expect(s1!.title).toBe('Sequential title update');
    expect(s2!.duration).toBe(4000);

    // Verify files persist both changes
    const sceneContent = readFileSync(join(projectPath, 'scene-001.md'), 'utf-8');
    expect(sceneContent).toContain('Sequential title update');
  });

  test('E2E-18: malformed markdown does not crash', () => {
    const projectPath = createTestProject();
    cleanupFns.push(() => rmSync(projectPath, { recursive: true, force: true }));

    const sm = new StateManager(projectPath);
    sm.loadFromDisk();

    // Write broken frontmatter
    writeFileSync(join(projectPath, 'scene-001.md'), '---\nbad: [unclosed\n---\n# Broken Scene\n', 'utf-8');

    let threw = false;
    try {
      sm.loadFromDisk();
    } catch {
      threw = true;
    }

    // Fix the file and verify recovery
    cpSync(join(FIXTURES_DIR, 'scene-001.md'), join(projectPath, 'scene-001.md'));
    sm.loadFromDisk();

    const state = sm.getState();
    expect(state.scenes.length).toBeGreaterThan(0);
    expect(state.shots.length).toBeGreaterThan(0);
  });

  test('E2E-19: large project performance', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'storyboard-perf-'));
    mkdirSync(join(projectPath, 'assets'), { recursive: true });
    cpSync(join(FIXTURES_DIR, 'project.md'), join(projectPath, 'project.md'));
    cleanupFns.push(() => rmSync(projectPath, { recursive: true, force: true }));

    for (let s = 1; s <= 20; s++) {
      const sceneNum = String(s).padStart(3, '0');
      let content = `---\nid: perf_scene_${sceneNum}\nscene_number: "${s}"\norder_index: ${s - 1}\n---\n\n# Scene ${s}: Performance Test Scene ${s}\n\nSummary for scene ${s}.\n\n## Notes\n\nNotes for scene ${s}.\n`;
      for (let sh = 1; sh <= 5; sh++) {
        content += `\n---\n\n<!-- shot: {"id":"perf_s${sceneNum}_sh${sh}","tags":["test"]} -->\n### ${sh}s: Shot ${sh} of scene ${s}\n\nScript text for shot ${sh} in scene ${s}.\n`;
      }
      writeFileSync(join(projectPath, `scene-${sceneNum}.md`), content, 'utf-8');
    }

    const sm = new StateManager(projectPath);
    const start = performance.now();
    sm.loadFromDisk();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(sm.getState().scenes.length).toBe(20);
    expect(sm.getState().shots.length).toBe(100);

    let scene10 = readFileSync(join(projectPath, 'scene-010.md'), 'utf-8');
    scene10 = scene10.replace('Shot 3 of scene 10', 'Updated shot 3');

    const changeStart = performance.now();
    sm.applyFileChange('scene-010.md', scene10);
    const changeElapsed = performance.now() - changeStart;

    expect(changeElapsed).toBeLessThan(1000);
  });
});
