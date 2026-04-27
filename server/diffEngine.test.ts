import { describe, it, expect } from 'vitest';
import { diffProjectState, applyDiff } from './diffEngine.js';
import type { ProjectState } from '../src/types.js';

function makeState(overrides?: Partial<ProjectState>): ProjectState {
  return {
    project: {
      id: 'proj1',
      title: 'Test Project',
      fps: 24,
      aspectRatio: '16:9',
      styleNotes: '',
      referenceLinks: [],
      globalNotes: '',
      createdAt: 1000,
      updatedAt: 1000,
    },
    sequences: [],
    scenes: [
      { id: 'sc1', sceneNumber: '1', title: 'Scene 1', summary: '', orderIndex: 0, notes: '' },
    ],
    shots: [
      { id: 'sh1', sceneId: 'sc1', orderIndex: 0, shotCode: '010', title: 'Wide shot', scriptText: 'Script A', duration: 2000, tags: ['wide'], generalNotes: '' },
      { id: 'sh2', sceneId: 'sc1', orderIndex: 1, shotCode: '020', title: 'Close up', scriptText: 'Script B', duration: 1500, tags: [], generalNotes: '' },
    ],
    frames: [
      { id: 'fr1', shotId: 'sh1', image: 'assets/img.png', caption: 'Frame 1', orderIndex: 0, version: 1 },
    ],
    versions: [],
    ...overrides,
  };
}

describe('diffProjectState', () => {
  it('no changes produces empty diff', () => {
    const state = makeState();
    const ops = diffProjectState(state, state);
    expect(ops).toHaveLength(0);
  });

  it('project title change produces single update op', () => {
    const old = makeState();
    const next = makeState({ project: { ...old.project, title: 'New Title' } });
    const ops = diffProjectState(old, next);
    const updates = ops.filter(o => o.type === 'update' && o.entity === 'project');
    expect(updates.length).toBe(1);
    expect(updates[0].data?.title).toBe('New Title');
  });

  it('shot title change produces single update op', () => {
    const old = makeState();
    const next = makeState({
      shots: [
        { ...old.shots[0], scriptText: 'Changed' },
        old.shots[1],
      ],
    });
    const ops = diffProjectState(old, next);
    const updates = ops.filter(o => o.type === 'update' && o.entity === 'shot');
    expect(updates.length).toBe(1);
    expect(updates[0].id).toBe('sh1');
    expect(updates[0].data?.scriptText).toBe('Changed');
  });

  it('shot added produces create op', () => {
    const old = makeState();
    const newShot = { id: 'sh3', sceneId: 'sc1', orderIndex: 2, shotCode: '030', title: 'New', scriptText: '', duration: 1000, tags: [], generalNotes: '' };
    const next = makeState({ shots: [...old.shots, newShot] });
    const ops = diffProjectState(old, next);
    const creates = ops.filter(o => o.type === 'create' && o.entity === 'shot');
    expect(creates.length).toBe(1);
    expect(creates[0].id).toBe('sh3');
  });

  it('shot removed produces delete op', () => {
    const old = makeState();
    const next = makeState({ shots: [old.shots[0]] });
    const ops = diffProjectState(old, next);
    const deletes = ops.filter(o => o.type === 'delete' && o.entity === 'shot');
    expect(deletes.length).toBe(1);
    expect(deletes[0].id).toBe('sh2');
  });

  it('multiple changes produce all ops', () => {
    const old = makeState();
    const next = makeState({
      project: { ...old.project, title: 'Changed' },
      shots: [{ ...old.shots[0], scriptText: 'New script' }],
    });
    const ops = diffProjectState(old, next);
    expect(ops.length).toBeGreaterThanOrEqual(2);
  });
});

describe('applyDiff', () => {
  it('applies update to project', () => {
    const state = makeState();
    const result = applyDiff(state, [
      { type: 'update', entity: 'project', data: { title: 'Updated' } },
    ]);
    expect(result.project.title).toBe('Updated');
  });

  it('applies create shot', () => {
    const state = makeState();
    const result = applyDiff(state, [
      { type: 'create', entity: 'shot', id: 'sh3', data: { id: 'sh3', sceneId: 'sc1', orderIndex: 2, shotCode: '030', title: 'New', scriptText: '', duration: 1000, tags: [], generalNotes: '' } as any },
    ]);
    expect(result.shots).toHaveLength(3);
    expect(result.shots[2].id).toBe('sh3');
  });

  it('applies delete shot and cascades frames', () => {
    const state = makeState();
    const result = applyDiff(state, [
      { type: 'delete', entity: 'shot', id: 'sh1' },
    ]);
    expect(result.shots).toHaveLength(1);
    expect(result.frames).toHaveLength(0);
  });

  it('round-trip: diff -> apply produces equivalent state', () => {
    const stateA = makeState();
    const stateB = makeState({
      project: { ...stateA.project, title: 'Different' },
      shots: [
        { ...stateA.shots[0], scriptText: 'Changed script' },
        stateA.shots[1],
      ],
    });
    const ops = diffProjectState(stateA, stateB);
    const applied = applyDiff(stateA, ops);
    expect(applied.project.title).toBe(stateB.project.title);
    expect(applied.shots[0].scriptText).toBe(stateB.shots[0].scriptText);
  });
});
