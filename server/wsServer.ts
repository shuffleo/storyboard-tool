import { WebSocketServer, WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import type { StateManager } from './stateManager.js';
import type { WsMessage, DiffOp, SyncFullPayload, SyncDiffPayload, MutationApplyPayload, MutationAckPayload, MutationErrorPayload } from './protocol.js';

export interface WsServerOptions {
  port: number;
  stateManager: StateManager;
  onMutationApplied: (ops: DiffOp[]) => void;
}

export function startWsServer(options: WsServerOptions) {
  const { port, stateManager, onMutationApplied } = options;
  const clients = new Set<WebSocket>();

  const wss = new WebSocketServer({ port, host: '127.0.0.1' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`WS client connected (${clients.size} total)`);

    const fullPayload: SyncFullPayload = {
      state: stateManager.getState(),
      version: stateManager.getVersion(),
    };
    sendMessage(ws, { type: 'sync:full', id: nanoid(), payload: fullPayload });

    ws.on('message', async (raw) => {
      try {
        const msg: WsMessage = JSON.parse(raw.toString());
        await handleMessage(ws, msg);
      } catch (err) {
        console.error('WS message error:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`WS client disconnected (${clients.size} remaining)`);
    });

    ws.on('error', (err) => {
      console.error('WS client error:', err);
      clients.delete(ws);
    });
  });

  const pingInterval = setInterval(() => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        sendMessage(ws, { type: 'ping', id: nanoid(), payload: {} });
      }
    }
  }, 30000);

  async function handleMessage(sender: WebSocket, msg: WsMessage) {
    switch (msg.type) {
      case 'mutation:apply': {
        const payload = msg.payload as MutationApplyPayload;
        try {
          await stateManager.applyMutation(payload.ops);

          const ack: MutationAckPayload = {
            appliedOps: payload.ops.length,
            newVersion: stateManager.getVersion(),
          };
          sendMessage(sender, { type: 'mutation:ack', id: msg.id, payload: ack });

          const diffPayload: SyncDiffPayload = {
            version: stateManager.getVersion(),
            previousVersion: stateManager.getVersion() - 1,
            ops: payload.ops,
          };
          broadcast({ type: 'sync:diff', id: nanoid(), payload: diffPayload }, sender);

          onMutationApplied(payload.ops);
        } catch (err: any) {
          const error: MutationErrorPayload = {
            message: err.message || 'Unknown error',
            code: 'IO_ERROR',
          };
          sendMessage(sender, { type: 'mutation:error', id: msg.id, payload: error });
        }
        break;
      }

      case 'pong':
        break;

      default:
        break;
    }
  }

  function sendMessage(ws: WebSocket, msg: WsMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function broadcast(msg: WsMessage, exclude?: WebSocket) {
    const data = JSON.stringify(msg);
    for (const ws of clients) {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  function broadcastDiff(ops: DiffOp[]) {
    if (ops.length === 0) return;
    const payload: SyncDiffPayload = {
      version: stateManager.getVersion(),
      previousVersion: stateManager.getVersion() - 1,
      ops,
    };
    broadcast({ type: 'sync:diff', id: nanoid(), payload });
  }

  return {
    broadcastDiff,
    close: () => {
      clearInterval(pingInterval);
      for (const ws of clients) {
        try { ws.terminate(); } catch {}
      }
      clients.clear();
      wss.close();
    },
  };
}
