import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, unlinkSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createServer } from 'net';
import { WebSocket } from 'ws';
import { StateManager } from '../../server/stateManager.js';
import { startWsServer } from '../../server/wsServer.js';
import { startFileWatcher } from '../../server/fileWatcher.js';
import type { WsMessage, DiffOp, SyncFullPayload, SyncDiffPayload, MutationApplyPayload } from '../../server/protocol.js';
import type { ProjectState } from '../../src/types.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

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

export interface E2EContext {
  projectPath: string;
  stateManager: StateManager;
  wsPort: number;
  state: ProjectState;

  writeFile(name: string, content: string): void;
  readFile(name: string): string;
  deleteFile(name: string): void;
  waitForDiff(timeoutMs?: number): Promise<DiffOp[]>;
  sendMutation(ops: DiffOp[]): Promise<{ type: string; payload: unknown }>;
  getState(): ProjectState;
  cleanup(): Promise<void>;
}

export async function createE2EContext(opts?: {
  debounceMs?: number;
  skipWatcher?: boolean;
}): Promise<E2EContext> {
  const debounceMs = opts?.debounceMs ?? 50;

  const projectPath = mkdtempSync(join(tmpdir(), 'storyboard-e2e-'));
  mkdirSync(join(projectPath, 'assets'), { recursive: true });
  cpSync(join(FIXTURES_DIR, 'project.md'), join(projectPath, 'project.md'));
  cpSync(join(FIXTURES_DIR, 'scene-001.md'), join(projectPath, 'scene-001.md'));

  const stateManager = new StateManager(projectPath);
  stateManager.loadFromDisk();

  const wsPort = await getRandomPort();

  const diffBuffer: DiffOp[][] = [];
  let diffResolve: ((ops: DiffOp[]) => void) | null = null;

  const wsServer = startWsServer({
    port: wsPort,
    stateManager,
    onMutationApplied: () => {},
  });

  // Brief delay to let the WS server bind
  await new Promise((r) => setTimeout(r, 100));

  let watcher: ReturnType<typeof startFileWatcher> | null = null;
  if (!opts?.skipWatcher) {
    watcher = startFileWatcher({
      projectPath,
      debounceMs,
      stateManager,
      onDiff: (ops) => {
        wsServer.broadcastDiff(ops);
      },
    });
  }

  // Connect a test WebSocket client
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${wsPort}`);
    client.on('open', () => resolve(client));
    client.on('error', reject);
  });

  let initialState: ProjectState | null = null;

  // Wait for sync:full
  await new Promise<void>((resolve) => {
    const handler = (raw: Buffer) => {
      const msg: WsMessage = JSON.parse(raw.toString());
      if (msg.type === 'sync:full') {
        initialState = (msg.payload as SyncFullPayload).state;
        ws.off('message', handler);
        resolve();
      }
    };
    ws.on('message', handler);
  });

  // Set up diff listener for subsequent messages
  ws.on('message', (raw: Buffer) => {
    const msg: WsMessage = JSON.parse(raw.toString());
    if (msg.type === 'sync:diff') {
      const payload = msg.payload as SyncDiffPayload;
      if (diffResolve) {
        diffResolve(payload.ops);
        diffResolve = null;
      } else {
        diffBuffer.push(payload.ops);
      }
    }
  });

  const ctx: E2EContext = {
    projectPath,
    stateManager,
    wsPort,
    state: initialState!,

    writeFile(name: string, content: string) {
      writeFileSync(join(projectPath, name), content, 'utf-8');
    },

    readFile(name: string): string {
      return readFileSync(join(projectPath, name), 'utf-8');
    },

    deleteFile(name: string) {
      const p = join(projectPath, name);
      if (existsSync(p)) unlinkSync(p);
    },

    waitForDiff(timeoutMs = 3000): Promise<DiffOp[]> {
      if (diffBuffer.length > 0) {
        return Promise.resolve(diffBuffer.shift()!);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          diffResolve = null;
          reject(new Error(`waitForDiff timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        diffResolve = (ops) => {
          clearTimeout(timer);
          resolve(ops);
        };
      });
    },

    sendMutation(ops: DiffOp[]): Promise<{ type: string; payload: unknown }> {
      return new Promise((resolveMsg, reject) => {
        const msgId = `test_${Date.now()}`;
        const payload: MutationApplyPayload = {
          ops,
          clientVersion: stateManager.getVersion(),
        };
        const msg: WsMessage = { type: 'mutation:apply', id: msgId, payload };

        const timer = setTimeout(() => {
          reject(new Error('sendMutation timed out'));
        }, 5000);

        const handler = (raw: Buffer) => {
          const resp: WsMessage = JSON.parse(raw.toString());
          if (resp.id === msgId && (resp.type === 'mutation:ack' || resp.type === 'mutation:error')) {
            clearTimeout(timer);
            ws.off('message', handler);
            resolveMsg({ type: resp.type, payload: resp.payload });
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify(msg));
      });
    },

    getState(): ProjectState {
      return stateManager.getState();
    },

    async cleanup() {
      try { ws.terminate(); } catch {}
      if (watcher) {
        try { await watcher.close(); } catch {}
      }
      try { wsServer.close(); } catch {}
      await new Promise((r) => setTimeout(r, 150));
      try { rmSync(projectPath, { recursive: true, force: true }); } catch {}
    },
  };

  return ctx;
}
