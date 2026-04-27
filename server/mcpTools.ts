import { readdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync, statSync } from 'fs';
import { join, resolve, relative, basename } from 'path';
import { nanoid } from 'nanoid';
import mime from 'mime-types';
import type { StateManager } from './stateManager.js';
import type { DiffOp } from './protocol.js';

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function success(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function error(message: string): ToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

export function handleRead(
  stateManager: StateManager,
  params: { filter?: string }
): ToolResult {
  try {
    const state = stateManager.getState();
    const filter = params.filter || 'all';

    switch (filter) {
      case 'all': return success(state);
      case 'project': return success(state.project);
      case 'scenes': return success(state.scenes);
      case 'shots': return success(state.shots);
      case 'frames': return success(state.frames);
      default: return error(`Unknown filter: ${filter}`);
    }
  } catch (err: any) {
    return error(err.message);
  }
}

export async function handleWrite(
  stateManager: StateManager,
  broadcastDiff: (ops: DiffOp[]) => void,
  params: { operations: Array<{ action: string; entity_type: string; data: Record<string, any> }> }
): Promise<ToolResult> {
  try {
    if (!params.operations || params.operations.length === 0) {
      return error('No operations provided');
    }

    const ops: DiffOp[] = [];
    const idMap = new Map<string, string>();

    for (const op of params.operations) {
      const { action, entity_type, data } = op;
      if (!['create', 'update', 'delete'].includes(action)) {
        return error(`Invalid action: ${action}`);
      }
      if (!['scene', 'shot', 'frame'].includes(entity_type)) {
        return error(`Invalid entity_type: ${entity_type}`);
      }

      const resolvedData = { ...data };

      // Resolve placeholder IDs ($new_N)
      for (const [key, value] of Object.entries(resolvedData)) {
        if (typeof value === 'string' && value.startsWith('$new_')) {
          const resolved = idMap.get(value);
          if (resolved) resolvedData[key] = resolved;
        }
      }

      if (action === 'create') {
        const newId = nanoid();
        resolvedData.id = newId;
        if (data.id && data.id.startsWith('$new_')) {
          idMap.set(data.id, newId);
        }

        if (entity_type === 'shot') {
          resolvedData.orderIndex = resolvedData.orderIndex ?? stateManager.getState().shots.length;
          resolvedData.shotCode = resolvedData.shotCode ?? String(resolvedData.orderIndex * 10).padStart(3, '0');
          resolvedData.title = resolvedData.title ?? '';
          resolvedData.scriptText = resolvedData.scriptText ?? '';
          resolvedData.duration = Math.max(resolvedData.duration ?? 1000, 300);
          resolvedData.tags = resolvedData.tags ?? [];
          resolvedData.generalNotes = resolvedData.generalNotes ?? '';
        } else if (entity_type === 'scene') {
          resolvedData.orderIndex = resolvedData.orderIndex ?? stateManager.getState().scenes.length;
          resolvedData.sceneNumber = resolvedData.sceneNumber ?? String(resolvedData.orderIndex + 1);
          resolvedData.title = resolvedData.title ?? '';
          resolvedData.summary = resolvedData.summary ?? '';
          resolvedData.notes = resolvedData.notes ?? '';
        } else if (entity_type === 'frame') {
          resolvedData.orderIndex = resolvedData.orderIndex ?? 0;
          resolvedData.version = 1;
          resolvedData.image = resolvedData.image ?? '';
          resolvedData.caption = resolvedData.caption ?? '';
        }

        ops.push({
          type: 'create',
          entity: entity_type as DiffOp['entity'],
          id: newId,
          parentId: resolvedData.sceneId || resolvedData.shotId,
          data: resolvedData,
        });
      } else if (action === 'update') {
        if (!resolvedData.id) return error(`Update requires an 'id' in data`);
        ops.push({
          type: 'update',
          entity: entity_type as DiffOp['entity'],
          id: resolvedData.id,
          data: resolvedData,
        });
      } else if (action === 'delete') {
        if (!resolvedData.id) return error(`Delete requires an 'id' in data`);
        ops.push({
          type: 'delete',
          entity: entity_type as DiffOp['entity'],
          id: resolvedData.id,
        });
      }
    }

    await stateManager.applyMutation(ops);
    broadcastDiff(ops);

    const createdIds: Record<string, string> = {};
    for (const [placeholder, actual] of idMap) {
      createdIds[placeholder] = actual;
    }

    return success({ applied: ops.length, createdIds });
  } catch (err: any) {
    return error(err.message);
  }
}

export async function handleReorder(
  stateManager: StateManager,
  broadcastDiff: (ops: DiffOp[]) => void,
  params: { entity_type: string; ordered_ids: string[]; parent_id?: string }
): Promise<ToolResult> {
  try {
    const entity = params.entity_type === 'scenes' ? 'scene' :
                   params.entity_type === 'shots' ? 'shot' :
                   params.entity_type === 'frames' ? 'frame' : null;
    if (!entity) return error(`Invalid entity_type: ${params.entity_type}`);

    const ops: DiffOp[] = [{
      type: 'reorder',
      entity,
      orderedIds: params.ordered_ids,
      parentId: params.parent_id,
    }];

    await stateManager.applyMutation(ops);
    broadcastDiff(ops);
    return success({ reordered: params.ordered_ids.length });
  } catch (err: any) {
    return error(err.message);
  }
}

export function handleExport(
  stateManager: StateManager,
  params: { format: string; output_path?: string }
): ToolResult {
  try {
    const state = stateManager.getState();

    if (params.format === 'json') {
      const json = JSON.stringify(state, null, 2);
      if (params.output_path) {
        writeFileSync(params.output_path, json, 'utf-8');
        return success({ path: params.output_path });
      }
      return success(state);
    }

    if (params.format === 'csv') {
      const lines = ['Shot Code,Scene,Title,Script Text,Duration (s),Tags'];
      for (const shot of state.shots) {
        const scene = state.scenes.find(s => s.id === shot.sceneId);
        const sceneName = scene ? `Scene ${scene.sceneNumber}` : '';
        const durationS = (shot.duration / 1000).toFixed(2);
        const tags = shot.tags.join(';');
        lines.push(`${shot.shotCode},"${sceneName}","${shot.title}","${shot.scriptText.replace(/"/g, '""')}",${durationS},"${tags}"`);
      }
      const csv = lines.join('\n');
      if (params.output_path) {
        writeFileSync(params.output_path, csv, 'utf-8');
        return success({ path: params.output_path });
      }
      return { content: [{ type: 'text', text: csv }] };
    }

    return error(`Unknown format: ${params.format}`);
  } catch (err: any) {
    return error(err.message);
  }
}

export async function handleImport(
  stateManager: StateManager,
  broadcastDiff: (ops: DiffOp[]) => void,
  params: { format: string; data: string; replace?: boolean }
): Promise<ToolResult> {
  try {
    if (params.format === 'json') {
      const imported = JSON.parse(params.data);
      const ops: DiffOp[] = [];

      if (params.replace) {
        for (const scene of stateManager.getState().scenes) {
          ops.push({ type: 'delete', entity: 'scene', id: scene.id });
        }
      }

      if (imported.scenes) {
        for (const scene of imported.scenes) {
          ops.push({ type: 'create', entity: 'scene', id: scene.id, data: scene });
        }
      }
      if (imported.shots) {
        for (const shot of imported.shots) {
          ops.push({ type: 'create', entity: 'shot', id: shot.id, parentId: shot.sceneId, data: shot });
        }
      }
      if (imported.project) {
        ops.push({ type: 'update', entity: 'project', data: imported.project });
      }

      await stateManager.applyMutation(ops);
      broadcastDiff(ops);
      return success({ imported: ops.length });
    }

    if (params.format === 'csv') {
      const lines = params.data.split('\n').slice(1);
      const ops: DiffOp[] = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.match(/(?:^|,)("(?:[^"]*(?:""[^"]*)*)"|[^,]*)/g);
        if (!parts || parts.length < 4) continue;
        const clean = parts.map(p => p.replace(/^,?"?|"?$/g, '').replace(/""/g, '"'));
        const id = nanoid();
        ops.push({
          type: 'create',
          entity: 'shot',
          id,
          data: {
            id,
            shotCode: clean[0] || '010',
            title: clean[2] || '',
            scriptText: clean[3] || '',
            duration: Math.max(parseFloat(clean[4] || '1') * 1000, 300),
            tags: clean[5] ? clean[5].split(';').filter(Boolean) : [],
            generalNotes: '',
            orderIndex: stateManager.getState().shots.length + ops.filter(o => o.entity === 'shot').length,
          },
        });
      }

      await stateManager.applyMutation(ops);
      broadcastDiff(ops);
      return success({ imported: ops.length });
    }

    return error(`Unknown format: ${params.format}`);
  } catch (err: any) {
    return error(err.message);
  }
}

export function handleTimeline(
  stateManager: StateManager,
  broadcastDiff: (ops: DiffOp[]) => void,
  params: { action: string; durations?: Record<string, number> }
): ToolResult | Promise<ToolResult> {
  try {
    const state = stateManager.getState();

    if (params.action === 'get_timeline') {
      let currentMs = 0;
      const timeline = state.shots
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(shot => {
          const entry = {
            shotId: shot.id,
            shotCode: shot.shotCode,
            title: shot.title,
            sceneId: shot.sceneId,
            startMs: currentMs,
            endMs: currentMs + shot.duration,
            durationMs: shot.duration,
          };
          currentMs += shot.duration;
          return entry;
        });
      return success({ timeline, totalDurationMs: currentMs });
    }

    if (params.action === 'set_durations' && params.durations) {
      const ops: DiffOp[] = [];
      const warnings: string[] = [];
      for (const [shotId, durationMs] of Object.entries(params.durations)) {
        const clamped = Math.max(durationMs, 300);
        if (clamped !== durationMs) {
          warnings.push(`Shot ${shotId}: duration clamped from ${durationMs}ms to 300ms`);
        }
        ops.push({
          type: 'update',
          entity: 'shot',
          id: shotId,
          data: { duration: clamped },
        });
      }
      return stateManager.applyMutation(ops).then(() => {
        broadcastDiff(ops);
        return success({ updated: ops.length, warnings });
      });
    }

    return error(`Unknown action: ${params.action}`);
  } catch (err: any) {
    return error(err.message);
  }
}

export async function handleAssets(
  stateManager: StateManager,
  broadcastDiff: (ops: DiffOp[]) => void,
  projectPath: string,
  params: { action: string; file_path?: string; data?: string; filename?: string; shot_id?: string; frame_index?: number }
): Promise<ToolResult> {
  try {
    const assetsDir = join(projectPath, 'assets');

    if (params.action === 'list') {
      if (!existsSync(assetsDir)) return success({ files: [] });
      const files = readdirSync(assetsDir).map(name => {
        const fp = join(assetsDir, name);
        const stat = statSync(fp);
        return {
          name,
          size: stat.size,
          mimeType: mime.lookup(name) || 'application/octet-stream',
        };
      });
      return success({ files });
    }

    if (params.action === 'add') {
      let targetName = '';
      if (params.file_path) {
        const srcPath = resolve(params.file_path);
        if (!existsSync(srcPath)) return error(`File not found: ${params.file_path}`);
        targetName = params.filename || basename(srcPath);
        const targetPath = join(assetsDir, targetName);
        const rel = relative(assetsDir, targetPath);
        if (rel.startsWith('..')) return error('Path traversal detected');
        copyFileSync(srcPath, targetPath);
      } else if (params.data && params.filename) {
        targetName = params.filename;
        const targetPath = join(assetsDir, targetName);
        const rel = relative(assetsDir, targetPath);
        if (rel.startsWith('..')) return error('Path traversal detected');
        const buffer = Buffer.from(params.data, 'base64');
        writeFileSync(targetPath, buffer);
      } else {
        return error('Provide either file_path or data+filename');
      }

      if (params.shot_id) {
        const frameId = nanoid();
        const existingFrames = stateManager.getState().frames.filter(f => f.shotId === params.shot_id);
        const ops: DiffOp[] = [{
          type: 'create',
          entity: 'frame',
          id: frameId,
          parentId: params.shot_id,
          data: {
            id: frameId,
            shotId: params.shot_id,
            image: `assets/${targetName}`,
            caption: '',
            orderIndex: existingFrames.length,
            version: 1,
          },
        }];
        await stateManager.applyMutation(ops);
        broadcastDiff(ops);
        return success({ asset: `assets/${targetName}`, frameId });
      }

      return success({ asset: `assets/${targetName}` });
    }

    if (params.action === 'delete') {
      if (!params.file_path) return error('file_path required for delete');
      const targetPath = resolve(join(projectPath, params.file_path));
      const rel = relative(resolve(assetsDir), targetPath);
      if (rel.startsWith('..')) return error('Path traversal detected');
      if (existsSync(targetPath)) unlinkSync(targetPath);

      const ops: DiffOp[] = [];
      for (const frame of stateManager.getState().frames) {
        if (frame.image === params.file_path) {
          ops.push({ type: 'delete', entity: 'frame', id: frame.id });
        }
      }
      if (ops.length > 0) {
        await stateManager.applyMutation(ops);
        broadcastDiff(ops);
      }
      return success({ deleted: params.file_path, framesRemoved: ops.length });
    }

    if (params.action === 'get_path') {
      if (!params.shot_id) return error('shot_id required');
      const frames = stateManager.getState().frames
        .filter(f => f.shotId === params.shot_id)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      const idx = params.frame_index ?? 0;
      if (idx < 0 || idx >= frames.length) return error(`Frame index ${idx} out of range (0-${frames.length - 1})`);
      return success({ path: frames[idx].image });
    }

    return error(`Unknown action: ${params.action}`);
  } catch (err: any) {
    return error(err.message);
  }
}

export function handleSync(
  stateManager: StateManager,
  broadcastDiff: (ops: DiffOp[]) => void,
  projectPath: string,
  params: { action: string }
): ToolResult | Promise<ToolResult> {
  try {
    if (params.action === 'status') {
      return success({
        version: stateManager.getVersion(),
        projectPath,
      });
    }

    if (params.action === 'pull') {
      stateManager.loadFromDisk();
      return success({ pulled: true, version: stateManager.getVersion() });
    }

    if (params.action === 'push' || params.action === 'watch' || params.action === 'unwatch') {
      return success({ action: params.action, ok: true });
    }

    return error(`Unknown action: ${params.action}`);
  } catch (err: any) {
    return error(err.message);
  }
}
