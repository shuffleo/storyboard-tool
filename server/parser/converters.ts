import type { ParseResult, ParsedProject } from './types.js';
import type { ProjectState, Project, Scene, Shot, StoryboardFrame, Sequence, Version } from '../../src/types.js';
import { serializeProject } from './serialize.js';

export function parsedToProjectState(result: ParseResult): ProjectState {
  const p = result.project;

  const project: Project = {
    id: p.id,
    title: p.title,
    fps: p.fps,
    aspectRatio: p.aspectRatio,
    targetDuration: p.targetDuration,
    styleNotes: p.styleNotes,
    referenceLinks: p.referenceLinks,
    globalNotes: p.globalNotes,
    createdAt: new Date(p.createdAt).getTime() || Date.now(),
    updatedAt: new Date(p.updatedAt).getTime() || Date.now(),
  };

  const scenes: Scene[] = [];
  const shots: Shot[] = [];
  const frames: StoryboardFrame[] = [];

  let globalShotIndex = 0;

  for (const ps of result.scenes) {
    scenes.push({
      id: ps.id,
      sceneNumber: ps.sceneNumber,
      title: ps.title,
      summary: ps.summary,
      orderIndex: ps.orderIndex,
      notes: ps.notes,
      sequenceId: undefined,
    });

    for (let si = 0; si < ps.shots.length; si++) {
      const shot = ps.shots[si];
      const shotCode = String((si + 1) * 10).padStart(3, '0');

      shots.push({
        id: shot.id,
        sceneId: ps.id,
        orderIndex: globalShotIndex,
        shotCode,
        title: shot.title,
        scriptText: shot.scriptText,
        duration: shot.durationMs,
        tags: shot.tags,
        generalNotes: shot.generalNotes,
      });

      for (const frame of shot.frames) {
        frames.push({
          id: frame.id,
          shotId: shot.id,
          image: frame.path,
          caption: frame.caption,
          orderIndex: frame.orderIndex,
          version: 1,
          overlayData: undefined,
        });
      }

      globalShotIndex++;
    }
  }

  return {
    project,
    sequences: [] as Sequence[],
    scenes,
    shots,
    frames,
    versions: [] as Version[],
  };
}

export function projectStateToMarkdown(state: ProjectState): Map<string, string> {
  const now = new Date().toISOString();

  const project: ParsedProject = {
    id: state.project.id,
    title: state.project.title,
    fps: state.project.fps,
    aspectRatio: state.project.aspectRatio,
    targetDuration: state.project.targetDuration,
    styleNotes: state.project.styleNotes,
    referenceLinks: state.project.referenceLinks,
    globalNotes: state.project.globalNotes,
    createdAt: state.project.createdAt ? new Date(state.project.createdAt).toISOString() : now,
    updatedAt: state.project.updatedAt ? new Date(state.project.updatedAt).toISOString() : now,
    sourceRanges: {
      title: { from: 0, to: 0, line: 0 },
      styleNotes: { from: 0, to: 0, line: 0 },
      referenceLinks: { from: 0, to: 0, line: 0 },
      globalNotes: { from: 0, to: 0, line: 0 },
    },
  };

  const sceneMap = new Map<string, Scene>();
  for (const scene of state.scenes) {
    sceneMap.set(scene.id, scene);
  }

  const shotsByScene = new Map<string, Shot[]>();
  for (const shot of state.shots) {
    if (!shot.sceneId) continue;
    const list = shotsByScene.get(shot.sceneId) ?? [];
    list.push(shot);
    shotsByScene.set(shot.sceneId, list);
  }
  for (const list of shotsByScene.values()) {
    list.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  const framesByShot = new Map<string, StoryboardFrame[]>();
  for (const frame of state.frames) {
    const list = framesByShot.get(frame.shotId) ?? [];
    list.push(frame);
    framesByShot.set(frame.shotId, list);
  }
  for (const list of framesByShot.values()) {
    list.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  const nr = { from: 0, to: 0, line: 0 };
  const parsedScenes = state.scenes
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((scene): import('./types.js').ParsedScene => {
      const sceneShots = shotsByScene.get(scene.id) ?? [];
      return {
        id: scene.id,
        sceneNumber: scene.sceneNumber,
        orderIndex: scene.orderIndex,
        title: scene.title,
        summary: scene.summary,
        notes: scene.notes,
        sourceFile: `scene-${scene.sceneNumber.padStart(3, '0')}.md`,
        shots: sceneShots.map((shot): import('./types.js').ParsedShot => {
          const shotFrames = framesByShot.get(shot.id) ?? [];
          return {
            id: shot.id,
            durationMs: shot.duration,
            title: shot.title,
            scriptText: shot.scriptText,
            generalNotes: shot.generalNotes,
            tags: shot.tags,
            frames: shotFrames.map((frame, idx): import('./types.js').ParsedFrame => ({
              id: frame.id,
              label: `frame-${idx + 1}`,
              path: frame.image,
              caption: frame.caption,
              orderIndex: frame.orderIndex,
              sourceRanges: { whole: nr, path: nr, caption: nr },
            })),
            sourceRanges: {
              whole: nr, metadataComment: nr, duration: nr,
              title: nr, scriptText: nr, generalNotes: nr,
            },
          };
        }),
        sourceRanges: { title: nr, summary: nr, notes: nr },
      };
    });

  const result: ParseResult = { project, scenes: parsedScenes, warnings: [] };
  return serializeProject(result);
}
