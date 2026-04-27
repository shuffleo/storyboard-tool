import type { ProjectState, Project, Scene, Shot, StoryboardFrame } from '../src/types.js';
import type { DiffOp } from './protocol.js';

function diffObject(
  entity: DiffOp['entity'],
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  id?: string
): DiffOp | null {
  const changes: Record<string, unknown> = {};
  let hasChanges = false;

  for (const key of Object.keys(newObj)) {
    const oldVal = oldObj[key];
    const newVal = newObj[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[key] = newVal;
      hasChanges = true;
    }
  }

  if (!hasChanges) return null;
  return { type: 'update', entity, id, data: changes };
}

export function diffProjectState(oldState: ProjectState, newState: ProjectState): DiffOp[] {
  const ops: DiffOp[] = [];

  // Project-level diff
  const projectDiff = diffObject('project', oldState.project as any, newState.project as any, oldState.project.id);
  if (projectDiff) ops.push(projectDiff);

  // Scenes
  const oldSceneMap = new Map(oldState.scenes.map(s => [s.id, s]));
  const newSceneMap = new Map(newState.scenes.map(s => [s.id, s]));

  for (const scene of newState.scenes) {
    if (!oldSceneMap.has(scene.id)) {
      ops.push({ type: 'create', entity: 'scene', id: scene.id, data: scene as any });
    } else {
      const diff = diffObject('scene', oldSceneMap.get(scene.id) as any, scene as any, scene.id);
      if (diff) ops.push(diff);
    }
  }
  for (const scene of oldState.scenes) {
    if (!newSceneMap.has(scene.id)) {
      ops.push({ type: 'delete', entity: 'scene', id: scene.id });
    }
  }

  const oldSceneOrder = oldState.scenes.map(s => s.id).join(',');
  const newSceneOrder = newState.scenes.map(s => s.id).join(',');
  if (oldSceneOrder !== newSceneOrder && newState.scenes.length > 0) {
    ops.push({ type: 'reorder', entity: 'scene', orderedIds: newState.scenes.map(s => s.id) });
  }

  // Shots
  const oldShotMap = new Map(oldState.shots.map(s => [s.id, s]));
  const newShotMap = new Map(newState.shots.map(s => [s.id, s]));

  for (const shot of newState.shots) {
    if (!oldShotMap.has(shot.id)) {
      ops.push({ type: 'create', entity: 'shot', id: shot.id, parentId: shot.sceneId, data: shot as any });
    } else {
      const diff = diffObject('shot', oldShotMap.get(shot.id) as any, shot as any, shot.id);
      if (diff) ops.push(diff);
    }
  }
  for (const shot of oldState.shots) {
    if (!newShotMap.has(shot.id)) {
      ops.push({ type: 'delete', entity: 'shot', id: shot.id });
    }
  }

  // Frames
  const oldFrameMap = new Map(oldState.frames.map(f => [f.id, f]));
  const newFrameMap = new Map(newState.frames.map(f => [f.id, f]));

  for (const frame of newState.frames) {
    if (!oldFrameMap.has(frame.id)) {
      ops.push({ type: 'create', entity: 'frame', id: frame.id, parentId: frame.shotId, data: frame as any });
    } else {
      const diff = diffObject('frame', oldFrameMap.get(frame.id) as any, frame as any, frame.id);
      if (diff) ops.push(diff);
    }
  }
  for (const frame of oldState.frames) {
    if (!newFrameMap.has(frame.id)) {
      ops.push({ type: 'delete', entity: 'frame', id: frame.id });
    }
  }

  return ops;
}

export function applyDiff(state: ProjectState, ops: DiffOp[]): ProjectState {
  let result: ProjectState = {
    project: { ...state.project },
    sequences: [...state.sequences],
    scenes: [...state.scenes],
    shots: [...state.shots],
    frames: [...state.frames],
    versions: [...state.versions],
  };

  for (const op of ops) {
    switch (op.entity) {
      case 'project':
        if (op.type === 'update' && op.data) {
          result.project = { ...result.project, ...op.data } as Project;
        }
        break;

      case 'scene':
        if (op.type === 'create' && op.data) {
          result.scenes = [...result.scenes, op.data as unknown as Scene];
        } else if (op.type === 'update' && op.id && op.data) {
          result.scenes = result.scenes.map(s => s.id === op.id ? { ...s, ...op.data } as Scene : s);
        } else if (op.type === 'delete' && op.id) {
          result.scenes = result.scenes.filter(s => s.id !== op.id);
          result.shots = result.shots.filter(s => s.sceneId !== op.id);
          result.frames = result.frames.filter(f => {
            const shot = result.shots.find(s => s.id === f.shotId);
            return !!shot;
          });
        } else if (op.type === 'reorder' && op.orderedIds) {
          const sceneMap = new Map(result.scenes.map(s => [s.id, s]));
          result.scenes = op.orderedIds
            .map((id, idx) => {
              const scene = sceneMap.get(id);
              return scene ? { ...scene, orderIndex: idx } : null;
            })
            .filter((s): s is Scene => s !== null);
        }
        break;

      case 'shot':
        if (op.type === 'create' && op.data) {
          result.shots = [...result.shots, op.data as unknown as Shot];
        } else if (op.type === 'update' && op.id && op.data) {
          result.shots = result.shots.map(s => s.id === op.id ? { ...s, ...op.data } as Shot : s);
        } else if (op.type === 'delete' && op.id) {
          result.frames = result.frames.filter(f => f.shotId !== op.id);
          result.shots = result.shots.filter(s => s.id !== op.id);
        } else if (op.type === 'reorder' && op.orderedIds) {
          const shotMap = new Map(result.shots.map(s => [s.id, s]));
          result.shots = op.orderedIds
            .map((id, idx) => {
              const shot = shotMap.get(id);
              return shot ? { ...shot, orderIndex: idx } : null;
            })
            .filter((s): s is Shot => s !== null);
        }
        break;

      case 'frame':
        if (op.type === 'create' && op.data) {
          result.frames = [...result.frames, op.data as unknown as StoryboardFrame];
        } else if (op.type === 'update' && op.id && op.data) {
          result.frames = result.frames.map(f => f.id === op.id ? { ...f, ...op.data } as StoryboardFrame : f);
        } else if (op.type === 'delete' && op.id) {
          result.frames = result.frames.filter(f => f.id !== op.id);
        }
        break;
    }
  }

  return result;
}
