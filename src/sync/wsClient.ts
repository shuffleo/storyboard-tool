import type { ProjectState } from '../types';
import type { WsMessage, DiffOp, SyncFullPayload, SyncDiffPayload, MutationApplyPayload, MutationErrorPayload } from '../../server/protocol';
import { nanoid } from 'nanoid';

export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing';

export interface SyncConfig {
  wsPort: number;
  assetPort: number;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  mutationBatchMs: number;
}

const DEFAULT_CONFIG: SyncConfig = {
  wsPort: 9800,
  assetPort: 9801,
  reconnectBaseMs: 2000,
  reconnectMaxMs: 30000,
  mutationBatchMs: 100,
};

export class SyncClient {
  private ws: WebSocket | null = null;
  private config: SyncConfig;
  private _status: SyncStatus = 'disconnected';
  private _version: number = 0;
  private reconnectDelay: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect: boolean = true;
  private pendingMutations: DiffOp[][] = [];
  private mutationBatchTimer: ReturnType<typeof setTimeout> | null = null;
  private batchedOps: DiffOp[] = [];

  private diffCallbacks: Array<(ops: DiffOp[]) => void> = [];
  private statusCallbacks: Array<(status: SyncStatus) => void> = [];
  private fullSyncCallbacks: Array<(state: ProjectState, version: number) => void> = [];
  private agentEditingCallbacks: Array<(editing: boolean) => void> = [];

  constructor(config?: Partial<SyncConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reconnectDelay = this.config.reconnectBaseMs;
  }

  get status(): SyncStatus { return this._status; }
  get version(): number { return this._version; }
  get companionUrl(): string { return `ws://localhost:${this.config.wsPort}`; }
  get assetBaseUrl(): string { return `http://localhost:${this.config.assetPort}`; }
  get isConnected(): boolean { return this._status === 'connected'; }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.shouldReconnect = true;
    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.companionUrl);
    } catch {
      this.setStatus('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.setStatus('connected');
      this.reconnectDelay = this.config.reconnectBaseMs;
      this.flushPendingMutations();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data as string);
        this.handleMessage(msg);
      } catch (err) {
        console.error('WS message parse error:', err);
      }
    };

    this.ws.onclose = () => {
      this.setStatus('disconnected');
      this.ws = null;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.mutationBatchTimer) {
      clearTimeout(this.mutationBatchTimer);
      this.mutationBatchTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  sendMutation(ops: DiffOp[]): void {
    if (this._status === 'connected') {
      this.batchedOps.push(...ops);
      if (!this.mutationBatchTimer) {
        this.mutationBatchTimer = setTimeout(() => {
          this.mutationBatchTimer = null;
          const batch = [...this.batchedOps];
          this.batchedOps = [];
          this.sendMutationImmediate(batch);
        }, this.config.mutationBatchMs);
      }
    } else {
      this.pendingMutations.push(ops);
    }
  }

  onDiff(callback: (ops: DiffOp[]) => void): () => void {
    this.diffCallbacks.push(callback);
    return () => {
      this.diffCallbacks = this.diffCallbacks.filter(c => c !== callback);
    };
  }

  onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(c => c !== callback);
    };
  }

  onFullSync(callback: (state: ProjectState, version: number) => void): () => void {
    this.fullSyncCallbacks.push(callback);
    return () => {
      this.fullSyncCallbacks = this.fullSyncCallbacks.filter(c => c !== callback);
    };
  }

  onAgentEditing(callback: (editing: boolean) => void): () => void {
    this.agentEditingCallbacks.push(callback);
    return () => {
      this.agentEditingCallbacks = this.agentEditingCallbacks.filter(c => c !== callback);
    };
  }

  private handleMessage(msg: WsMessage): void {
    switch (msg.type) {
      case 'sync:full': {
        const payload = msg.payload as SyncFullPayload;
        this._version = payload.version;
        for (const cb of this.fullSyncCallbacks) cb(payload.state, payload.version);
        break;
      }
      case 'sync:diff': {
        const payload = msg.payload as SyncDiffPayload;
        if (payload.previousVersion !== this._version) {
          console.warn('Version gap detected, requesting full sync');
          // In a more robust impl, we'd send a request for full sync.
          // For now, just apply the diff anyway.
        }
        this._version = payload.version;
        for (const cb of this.diffCallbacks) cb(payload.ops);
        break;
      }
      case 'mutation:ack':
        break;
      case 'mutation:error': {
        const payload = msg.payload as MutationErrorPayload;
        console.error('Mutation error:', payload.message);
        break;
      }
      case 'agent:editing':
        for (const cb of this.agentEditingCallbacks) cb(true);
        break;
      case 'agent:done':
        for (const cb of this.agentEditingCallbacks) cb(false);
        break;
      case 'ping':
        this.send({ type: 'pong', id: nanoid(), payload: {} });
        break;
      default:
        break;
    }
  }

  private send(msg: WsMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private sendMutationImmediate(ops: DiffOp[]): void {
    if (ops.length === 0) return;
    const payload: MutationApplyPayload = {
      ops,
      clientVersion: this._version,
    };
    this.send({ type: 'mutation:apply', id: nanoid(), payload });
  }

  private flushPendingMutations(): void {
    const pending = [...this.pendingMutations];
    this.pendingMutations = [];
    for (const ops of pending) {
      this.sendMutationImmediate(ops);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.config.reconnectMaxMs);
      this.connect();
    }, this.reconnectDelay);
  }

  private setStatus(status: SyncStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const cb of this.statusCallbacks) cb(status);
  }
}
