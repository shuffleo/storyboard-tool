import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseProjectFolder, serializeProject, parsedToProjectState, projectStateToMarkdown, parseProjectMd, parseSceneMd } from './index.js';
import type { ParseResult } from './types.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

function makeFiles(...names: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of names) {
    map.set(name, readFixture(name));
  }
  return map;
}

// ── Round-trip tests ──────────────────────────────────────────────

describe('round-trip', () => {
  it('project.md parses and round-trips', () => {
    const files = makeFiles('project.md');
    const r1 = parseProjectFolder(files);
    const serialized = serializeProject(r1);
    const r2 = parseProjectFolder(serialized);

    expect(r2.project.id).toBe(r1.project.id);
    expect(r2.project.title).toBe(r1.project.title);
    expect(r2.project.fps).toBe(r1.project.fps);
    expect(r2.project.aspectRatio).toBe(r1.project.aspectRatio);
    expect(r2.project.targetDuration).toBe(r1.project.targetDuration);
    expect(r2.project.styleNotes).toBe(r1.project.styleNotes);
    expect(r2.project.referenceLinks).toEqual(r1.project.referenceLinks);
    expect(r2.project.globalNotes).toBe(r1.project.globalNotes);
  });

  it('scene with 3 shots round-trips', () => {
    const files = makeFiles('project.md', 'scene-001.md');
    const r1 = parseProjectFolder(files);
    expect(r1.scenes).toHaveLength(1);
    expect(r1.scenes[0].shots).toHaveLength(3);

    const serialized = serializeProject(r1);
    const r2 = parseProjectFolder(serialized);
    expect(r2.scenes[0].shots).toHaveLength(3);
    expect(r2.scenes[0].shots[0].id).toBe(r1.scenes[0].shots[0].id);
    expect(r2.scenes[0].shots[0].title).toBe(r1.scenes[0].shots[0].title);
    expect(r2.scenes[0].shots[0].durationMs).toBe(r1.scenes[0].shots[0].durationMs);
    expect(r2.scenes[0].shots[1].id).toBe(r1.scenes[0].shots[1].id);
    expect(r2.scenes[0].shots[2].id).toBe(r1.scenes[0].shots[2].id);
  });

  it('scene with multiple frames round-trips', () => {
    const files = makeFiles('project.md', 'scene-001.md');
    const r1 = parseProjectFolder(files);
    const shot2 = r1.scenes[0].shots[1];
    expect(shot2.frames).toHaveLength(2);
    expect(shot2.frames[0].path).toBe('assets/sc001-sh020-f01.png');
    expect(shot2.frames[1].path).toBe('assets/sc001-sh020-f02.png');

    const serialized = serializeProject(r1);
    const r2 = parseProjectFolder(serialized);
    const shot2b = r2.scenes[0].shots[1];
    expect(shot2b.frames).toHaveLength(2);
    expect(shot2b.frames[0].path).toBe(shot2.frames[0].path);
    expect(shot2b.frames[1].path).toBe(shot2.frames[1].path);
  });

  it('scene with no frames round-trips', () => {
    const files = makeFiles('project.md', 'scene-001.md');
    const r1 = parseProjectFolder(files);
    const shot3 = r1.scenes[0].shots[2];
    expect(shot3.frames).toHaveLength(0);

    const serialized = serializeProject(r1);
    const r2 = parseProjectFolder(serialized);
    expect(r2.scenes[0].shots[2].frames).toHaveLength(0);
  });

  it('empty style notes and reference links round-trip', () => {
    const files = new Map<string, string>();
    files.set('project.md', '---\nid: test\nfps: 24\naspect_ratio: "16:9"\ncreated_at: 2026-01-01T00:00:00Z\nupdated_at: 2026-01-01T00:00:00Z\n---\n\n# Empty Project\n\n## Style Notes\n\n\n\n## Reference Links\n\n\n\n## Global Notes\n\n\n');
    const r1 = parseProjectFolder(files);
    expect(r1.project.styleNotes).toBe('');
    expect(r1.project.referenceLinks).toEqual([]);

    const serialized = serializeProject(r1);
    const r2 = parseProjectFolder(serialized);
    expect(r2.project.styleNotes).toBe('');
    expect(r2.project.referenceLinks).toEqual([]);
  });
});

// ── Shot syntax parsing ──────────────────────────────────────────

describe('shot syntax parsing', () => {
  function parseShot(heading: string) {
    const md = `---\nid: test\nscene_number: "1"\norder_index: 0\n---\n\n# Scene 1: Test\n\n---\n\n<!-- shot: {"id":"test-shot"} -->\n${heading}\n\nScript text.\n`;
    const { scene } = parseSceneMd(md, 'scene-001.md');
    return scene.shots[0];
  }

  it('parses "### 2s: Wide shot title"', () => {
    const shot = parseShot('### 2s: Wide shot title');
    expect(shot.durationMs).toBe(2000);
    expect(shot.title).toBe('Wide shot title');
  });

  it('parses "### 500ms: Quick cut"', () => {
    const shot = parseShot('### 500ms: Quick cut');
    expect(shot.durationMs).toBe(500);
    expect(shot.title).toBe('Quick cut');
  });

  it('parses "### 1.5m: Long take"', () => {
    const shot = parseShot('### 1.5m: Long take');
    expect(shot.durationMs).toBe(90000);
    expect(shot.title).toBe('Long take');
  });

  it('parses "### 0.3s: Flash frame"', () => {
    const shot = parseShot('### 0.3s: Flash frame');
    expect(shot.durationMs).toBe(300);
    expect(shot.title).toBe('Flash frame');
  });

  it('heading without duration defaults to 1000ms with warning', () => {
    const md = `---\nid: test\nscene_number: "1"\norder_index: 0\n---\n\n# Scene 1: Test\n\n---\n\n<!-- shot: {"id":"test-shot"} -->\n### Just a title\n\nScript text.\n`;
    const { scene, warnings } = parseSceneMd(md, 'scene-001.md');
    expect(scene.shots[0].durationMs).toBe(1000);
    expect(warnings.some(w => w.message.includes('missing duration'))).toBe(true);
  });

  it('heading with invalid duration defaults to 1000ms with warning', () => {
    const md = `---\nid: test\nscene_number: "1"\norder_index: 0\n---\n\n# Scene 1: Test\n\n---\n\n<!-- shot: {"id":"test-shot"} -->\n### abc: Title\n\nScript text.\n`;
    const { scene, warnings } = parseSceneMd(md, 'scene-001.md');
    expect(scene.shots[0].durationMs).toBe(1000);
    expect(warnings.some(w => w.message.includes('Invalid duration'))).toBe(true);
  });
});

// ── Metadata comment parsing ─────────────────────────────────────

describe('metadata comment parsing', () => {
  it('parses shot metadata comment with id and tags', () => {
    const md = `---\nid: test\nscene_number: "1"\norder_index: 0\n---\n\n# Scene 1: Test\n\n---\n\n<!-- shot: {"id":"k7x2m","tags":["wide"]} -->\n### 2s: Test shot\n\nText.\n`;
    const { scene } = parseSceneMd(md, 'scene-001.md');
    expect(scene.shots[0].id).toBe('k7x2m');
    expect(scene.shots[0].tags).toEqual(['wide']);
  });

  it('shot without metadata comment auto-generates id', () => {
    const md = `---\nid: test\nscene_number: "1"\norder_index: 0\n---\n\n# Scene 1: Test\n\n---\n\n### 2s: No comment shot\n\nText.\n`;
    const { scene, warnings } = parseSceneMd(md, 'scene-001.md');
    expect(scene.shots[0].id).toBeTruthy();
    expect(scene.shots[0].id.length).toBeGreaterThan(0);
    expect(scene.shots[0].tags).toEqual([]);
    expect(warnings.some(w => w.message.includes('auto-generated'))).toBe(true);
  });

  it('malformed JSON in comment auto-generates id with warning', () => {
    const md = `---\nid: test\nscene_number: "1"\norder_index: 0\n---\n\n# Scene 1: Test\n\n---\n\n<!-- shot: {"id":"bad" broken -->\n### 2s: Bad json shot\n\nText.\n`;
    const { scene, warnings } = parseSceneMd(md, 'scene-001.md');
    expect(scene.shots[0].id).toBeTruthy();
    expect(warnings.some(w => w.message.includes('Malformed JSON'))).toBe(true);
  });

  it('non-shot HTML comment is ignored', () => {
    const md = `---\nid: test\nscene_number: "1"\norder_index: 0\n---\n\n# Scene 1: Test\n\n---\n\n<!-- This is just a regular comment -->\n<!-- shot: {"id":"real-shot"} -->\n### 2s: Test shot\n\nText.\n`;
    const { scene } = parseSceneMd(md, 'scene-001.md');
    expect(scene.shots[0].id).toBe('real-shot');
  });
});

// ── Source position tracking ─────────────────────────────────────

describe('source position tracking', () => {
  const sceneMd = readFixture('scene-001.md');

  it('shot has sourceRange.duration with correct char offsets', () => {
    const { scene } = parseSceneMd(sceneMd, 'scene-001.md');
    const shot = scene.shots[0];
    const durationText = sceneMd.slice(shot.sourceRanges.duration.from, shot.sourceRanges.duration.to);
    expect(durationText).toBe('2s');
  });

  it('shot has sourceRange.title with correct char offsets', () => {
    const { scene } = parseSceneMd(sceneMd, 'scene-001.md');
    const shot = scene.shots[0];
    const titleText = sceneMd.slice(shot.sourceRanges.title.from, shot.sourceRanges.title.to);
    expect(titleText).toBe('Wide shot - city skyline at dawn');
  });

  it('string-splice at sourceRange.duration replaces only the duration text', () => {
    const { scene } = parseSceneMd(sceneMd, 'scene-001.md');
    const shot = scene.shots[0];
    const r = shot.sourceRanges.duration;
    const modified = sceneMd.slice(0, r.from) + '3s' + sceneMd.slice(r.to);
    const { scene: reparsed } = parseSceneMd(modified, 'scene-001.md');
    expect(reparsed.shots[0].durationMs).toBe(3000);
    expect(reparsed.shots[0].title).toBe('Wide shot - city skyline at dawn');
  });
});

// ── Frontmatter parsing ──────────────────────────────────────────

describe('frontmatter parsing', () => {
  it('project.md frontmatter extracts all fields', () => {
    const files = makeFiles('project.md');
    const r = parseProjectFolder(files);
    expect(r.project.id).toBe('proj_test_001');
    expect(r.project.fps).toBe(24);
    expect(r.project.aspectRatio).toBe('16:9');
    expect(r.project.targetDuration).toBe(120);
    expect(r.project.createdAt).toBe('2026-04-27T12:00:00Z');
    expect(r.project.updatedAt).toBe('2026-04-27T12:00:00Z');
  });

  it('scene frontmatter extracts id, scene_number, order_index', () => {
    const files = makeFiles('project.md', 'scene-001.md');
    const r = parseProjectFolder(files);
    expect(r.scenes[0].id).toBe('scene_test_001');
    expect(r.scenes[0].sceneNumber).toBe('1');
    expect(r.scenes[0].orderIndex).toBe(0);
  });

  it('missing frontmatter generates defaults with warning', () => {
    const files = new Map<string, string>();
    files.set('project.md', '# Bare Project\n');
    const r = parseProjectFolder(files);
    expect(r.project.fps).toBe(24);
    expect(r.project.id).toBeTruthy();
    expect(r.warnings.some(w => w.message.includes('Missing frontmatter'))).toBe(true);
  });

  it('partial frontmatter uses defaults', () => {
    const files = new Map<string, string>();
    files.set('project.md', '---\nid: partial\n---\n\n# Partial Project\n');
    const r = parseProjectFolder(files);
    expect(r.project.id).toBe('partial');
    expect(r.project.fps).toBe(24);
    expect(r.project.aspectRatio).toBe('16:9');
  });
});

// ── Edge cases ───────────────────────────────────────────────────

describe('edge cases', () => {
  it('empty scene file (frontmatter only) -> valid scene with empty shots', () => {
    const files = makeFiles('project.md', 'empty-scene.md');
    // rename to match scene-NNN pattern
    const content = files.get('empty-scene.md')!;
    files.delete('empty-scene.md');
    files.set('scene-099.md', content);
    const r = parseProjectFolder(files);
    const scene = r.scenes.find(s => s.id === 'scene_empty');
    expect(scene).toBeTruthy();
    expect(scene!.shots).toHaveLength(0);
  });

  it('scene with no frontmatter auto-generates id with warning', () => {
    const files = new Map<string, string>();
    files.set('project.md', readFixture('project.md'));
    files.set('scene-001.md', '# Scene 1: No Frontmatter\n\n---\n\n<!-- shot: {"id":"s1"} -->\n### 2s: Test\n\nText.\n');
    const r = parseProjectFolder(files);
    expect(r.scenes[0].id).toBeTruthy();
    expect(r.warnings.some(w => w.message.includes('Missing frontmatter'))).toBe(true);
  });

  it('shot with unicode in script text is preserved', () => {
    const md = `---\nid: test\nscene_number: "1"\norder_index: 0\n---\n\n# Scene 1: Test\n\n---\n\n<!-- shot: {"id":"uni"} -->\n### 2s: Unicode test\n\n日本語のテキスト。中文测试。한국어 테스트.\n`;
    const { scene } = parseSceneMd(md, 'scene-001.md');
    expect(scene.shots[0].scriptText).toContain('日本語のテキスト');
    expect(scene.shots[0].scriptText).toContain('中文测试');
    expect(scene.shots[0].scriptText).toContain('한국어 테스트');
  });

  it('multiple frames per shot are all captured in order', () => {
    const files = makeFiles('project.md', 'scene-001.md');
    const r = parseProjectFolder(files);
    const shot2 = r.scenes[0].shots[1];
    expect(shot2.frames).toHaveLength(2);
    expect(shot2.frames[0].orderIndex).toBe(0);
    expect(shot2.frames[1].orderIndex).toBe(1);
    expect(shot2.frames[0].label).toBe('frame-1');
    expect(shot2.frames[1].label).toBe('frame-2');
  });

  it('frame with caption extracts caption', () => {
    const files = makeFiles('project.md', 'scene-001.md');
    const r = parseProjectFolder(files);
    expect(r.scenes[0].shots[0].frames[0].caption).toBe('Opening skyline');
  });

  it('malformed scene parses with warnings, never throws', () => {
    const files = new Map<string, string>();
    files.set('project.md', readFixture('project.md'));
    files.set('scene-050.md', readFixture('malformed-scene.md'));
    const r = parseProjectFolder(files);
    expect(r.scenes).toHaveLength(1);
    expect(r.warnings.length).toBeGreaterThan(0);
    // shots with invalid durations should still parse
    const scene = r.scenes[0];
    expect(scene.shots.length).toBeGreaterThan(0);
  });

  it('image path with spaces is preserved', () => {
    const md = `---\nid: test\nscene_number: "1"\norder_index: 0\n---\n\n# Scene 1: Test\n\n---\n\n<!-- shot: {"id":"sp"} -->\n### 2s: Spaces test\n\n![frame](assets/my%20image%20file.png "Caption")\n`;
    const { scene } = parseSceneMd(md, 'scene-001.md');
    expect(scene.shots[0].frames[0].path).toBe('assets/my%20image%20file.png');
  });
});

// ── Scene file ordering ──────────────────────────────────────────

describe('scene file ordering', () => {
  it('scenes are ordered by filename', () => {
    const files = makeFiles('project.md', 'scene-001.md', 'scene-002.md');
    const r = parseProjectFolder(files);
    expect(r.scenes).toHaveLength(2);
    expect(r.scenes[0].sceneNumber).toBe('1');
    expect(r.scenes[1].sceneNumber).toBe('2');
  });

  it('scenes sort correctly even when filenames are not sequential', () => {
    const files = new Map<string, string>();
    files.set('project.md', readFixture('project.md'));
    files.set('scene-010.md', readFixture('scene-002.md'));
    files.set('scene-005.md', readFixture('scene-001.md'));
    const r = parseProjectFolder(files);
    expect(r.scenes).toHaveLength(2);
    expect(r.scenes[0].sourceFile).toBe('scene-005.md');
    expect(r.scenes[1].sourceFile).toBe('scene-010.md');
  });

  it('no scene files -> valid project with empty scenes', () => {
    const files = makeFiles('project.md');
    const r = parseProjectFolder(files);
    expect(r.scenes).toHaveLength(0);
  });
});

// ── Converters ───────────────────────────────────────────────────

describe('parsedToProjectState', () => {
  it('produces valid ProjectState', () => {
    const files = makeFiles('project.md', 'scene-001.md', 'scene-002.md');
    const result = parseProjectFolder(files);
    const state = parsedToProjectState(result);

    expect(state.project.id).toBe('proj_test_001');
    expect(state.project.title).toBe('My Storyboard Project');
    expect(state.project.fps).toBe(24);
    expect(state.project.createdAt).toBeTypeOf('number');
    expect(state.project.updatedAt).toBeTypeOf('number');

    expect(state.scenes).toHaveLength(2);
    expect(state.shots).toHaveLength(4);
    expect(state.frames.length).toBeGreaterThan(0);
    expect(state.sequences).toEqual([]);
    expect(state.versions).toEqual([]);
  });

  it('computes shotCode from position', () => {
    const files = makeFiles('project.md', 'scene-001.md');
    const state = parsedToProjectState(parseProjectFolder(files));
    expect(state.shots[0].shotCode).toBe('010');
    expect(state.shots[1].shotCode).toBe('020');
    expect(state.shots[2].shotCode).toBe('030');
  });

  it('sets sceneId on shots', () => {
    const files = makeFiles('project.md', 'scene-001.md');
    const state = parsedToProjectState(parseProjectFolder(files));
    for (const shot of state.shots) {
      expect(shot.sceneId).toBe('scene_test_001');
    }
  });

  it('sets shotId on frames', () => {
    const files = makeFiles('project.md', 'scene-001.md');
    const state = parsedToProjectState(parseProjectFolder(files));
    const framesForShot1 = state.frames.filter(f => f.shotId === 'k7x2m');
    expect(framesForShot1.length).toBe(1);
    expect(framesForShot1[0].image).toBe('assets/sc001-sh010-f01.png');
  });

  it('sets title on shots', () => {
    const files = makeFiles('project.md', 'scene-001.md');
    const state = parsedToProjectState(parseProjectFolder(files));
    expect(state.shots[0].title).toBe('Wide shot - city skyline at dawn');
    expect(state.shots[1].title).toBe('Close-up - hand reaches for coffee');
  });
});

describe('projectStateToMarkdown', () => {
  it('produces valid markdown files from ProjectState', () => {
    const files = makeFiles('project.md', 'scene-001.md', 'scene-002.md');
    const result = parseProjectFolder(files);
    const state = parsedToProjectState(result);
    const mdFiles = projectStateToMarkdown(state);

    expect(mdFiles.has('project.md')).toBe(true);
    expect(mdFiles.has('scene-001.md')).toBe(true);
    expect(mdFiles.has('scene-002.md')).toBe(true);
  });

  it('round-trips through ProjectState', () => {
    const files = makeFiles('project.md', 'scene-001.md');
    const r1 = parseProjectFolder(files);
    const state = parsedToProjectState(r1);
    const mdFiles = projectStateToMarkdown(state);
    const r2 = parseProjectFolder(mdFiles);
    const state2 = parsedToProjectState(r2);

    expect(state2.project.title).toBe(state.project.title);
    expect(state2.scenes).toHaveLength(state.scenes.length);
    expect(state2.shots).toHaveLength(state.shots.length);
    expect(state2.frames).toHaveLength(state.frames.length);

    for (let i = 0; i < state.shots.length; i++) {
      expect(state2.shots[i].title).toBe(state.shots[i].title);
      expect(state2.shots[i].duration).toBe(state.shots[i].duration);
      expect(state2.shots[i].scriptText).toBe(state.shots[i].scriptText);
    }
  });
});

// ── Full project parsing ─────────────────────────────────────────

describe('full project parsing', () => {
  it('parses complete project with 2 scenes', () => {
    const files = makeFiles('project.md', 'scene-001.md', 'scene-002.md');
    const r = parseProjectFolder(files);

    expect(r.project.title).toBe('My Storyboard Project');
    expect(r.project.styleNotes).toContain('Retro anime');
    expect(r.project.referenceLinks).toHaveLength(2);
    expect(r.project.globalNotes).toContain('Production notes');

    expect(r.scenes).toHaveLength(2);
    expect(r.scenes[0].title).toBe('The Opening');
    expect(r.scenes[0].summary).toContain('quiet morning');
    expect(r.scenes[0].notes).toContain('Director notes');
    expect(r.scenes[0].shots).toHaveLength(3);
    expect(r.scenes[1].title).toBe('The Journey');
    expect(r.scenes[1].shots).toHaveLength(1);
  });

  it('shot general notes are parsed from blockquotes', () => {
    const files = makeFiles('project.md', 'scene-001.md');
    const r = parseProjectFolder(files);
    expect(r.scenes[0].shots[0].generalNotes).toContain('Camera pans left to right');
  });

  it('handles missing project.md with warning', () => {
    const files = new Map<string, string>();
    files.set('scene-001.md', readFixture('scene-001.md'));
    const r = parseProjectFolder(files);
    expect(r.warnings.some(w => w.message.includes('project.md not found'))).toBe(true);
    expect(r.project.title).toBe('Untitled Project');
  });
});
