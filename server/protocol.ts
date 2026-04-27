import type { ProjectState } from '../src/types.js';

export type WsMessageType =
  | 'sync:full'
  | 'sync:diff'
  | 'mutation:apply'
  | 'mutation:ack'
  | 'mutation:error'
  | 'agent:editing'
  | 'agent:done'
  | 'ping'
  | 'pong';

export interface WsMessage {
  type: WsMessageType;
  id: string;
  payload: unknown;
}

export interface SyncFullPayload {
  state: ProjectState;
  version: number;
}

export interface SyncDiffPayload {
  version: number;
  previousVersion: number;
  ops: DiffOp[];
}

export interface DiffOp {
  type: 'create' | 'update' | 'delete' | 'reorder';
  entity: 'project' | 'scene' | 'shot' | 'frame';
  id?: string;
  parentId?: string;
  data?: Record<string, unknown>;
  orderedIds?: string[];
}

export interface MutationApplyPayload {
  ops: DiffOp[];
  clientVersion: number;
}

export interface MutationAckPayload {
  appliedOps: number;
  newVersion: number;
}

export interface MutationErrorPayload {
  message: string;
  code: 'CONFLICT' | 'INVALID' | 'IO_ERROR';
}
