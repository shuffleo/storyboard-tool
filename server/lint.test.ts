import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { lintProject } from './lint.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lint-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeFile(name: string, content: string) {
  writeFileSync(join(dir, name), content, 'utf-8');
}

const VALID_PROJECT = `---
id: proj1
fps: 24
aspect_ratio: "16:9"
---

# Test Project

## Style Notes

Some notes.

## Global Notes

Global.
`;

const VALID_SCENE = `---
id: sc001
scene_number: "1"
order_index: 0
---

# Scene 1: Opening

Summary here.

---

### 2s: Wide shot

Script text.

> Camera notes.

![frame](assets/frame.png "Caption")
`;

describe('Storyboard Linter', () => {
  it('should pass clean on valid project', () => {
    writeFile('project.md', VALID_PROJECT);
    writeFile('scene-001.md', VALID_SCENE);
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'frame.png'), 'fake-png');

    const result = lintProject(dir);
    expect(result.warnings).toHaveLength(0);
    expect(result.fileCount).toBe(2);
  });

  it('should warn on non-standard .md files', () => {
    writeFile('project.md', VALID_PROJECT);
    writeFile('scene-001.md', VALID_SCENE);
    writeFile('STORYBOARD-PROMPTS.md', '# Prompts');
    writeFile('notes.md', '# Notes');

    const result = lintProject(dir);
    const fileWarns = result.warnings.filter(w => w.message.includes('Non-standard file'));
    expect(fileWarns).toHaveLength(2);
    expect(fileWarns[0].severity).toBe('warning');
  });

  it('should error on missing project.md', () => {
    writeFile('scene-001.md', VALID_SCENE);

    const result = lintProject(dir);
    const err = result.warnings.find(w => w.message === 'Missing project.md');
    expect(err).toBeDefined();
    expect(err!.severity).toBe('error');
  });

  it('should error on broken frontmatter with ## id: syntax', () => {
    writeFile('project.md', VALID_PROJECT);
    writeFile('scene-001.md', `---

## id: sc001
scene_number: "1"
order_index: 0

# Scene 1: Opening

Summary.

---

### 2s: Wide shot

Script.
`);

    const result = lintProject(dir);
    const fmErrors = result.warnings.filter(w =>
      w.file === 'scene-001.md' && w.severity === 'error'
    );
    expect(fmErrors.length).toBeGreaterThan(0);
    expect(fmErrors.some(w =>
      w.message.includes('YAML') || w.message.includes('markdown headings')
    )).toBe(true);
  });

  it('should error on frontmatter missing closing ---', () => {
    writeFile('project.md', VALID_PROJECT);
    writeFile('scene-001.md', `---
id: sc001

# Scene 1

Summary.

### 2s: Shot

Script.
`);

    const result = lintProject(dir);
    const fmErrors = result.warnings.filter(w =>
      w.file === 'scene-001.md' && w.message.toLowerCase().includes('frontmatter')
    );
    expect(fmErrors.length).toBeGreaterThan(0);
  });

  it('should error on ### Clip Mapping (non-shot H3)', () => {
    writeFile('project.md', VALID_PROJECT);
    writeFile('scene-001.md', `---
id: sc001
scene_number: "1"
order_index: 0
---

# Scene 1: Opening

## Notes

Some notes.

### Clip Mapping

| Clip | Time |
|------|------|
| C1   | 0:00 |

---

### 2s: Wide shot

Script.
`);

    const result = lintProject(dir);
    const h3Errors = result.warnings.filter(w =>
      w.message.includes('Clip Mapping')
    );
    expect(h3Errors).toHaveLength(1);
    expect(h3Errors[0].severity).toBe('error');
    expect(h3Errors[0].message).toContain('not a valid shot heading');
  });

  it('should error on H3 with invalid duration', () => {
    writeFile('project.md', VALID_PROJECT);
    writeFile('scene-001.md', `---
id: sc001
scene_number: "1"
order_index: 0
---

# Scene 1: Opening

---

### abc: Bad duration shot

Script.
`);

    const result = lintProject(dir);
    const durErrors = result.warnings.filter(w =>
      w.message.includes('Invalid duration')
    );
    expect(durErrors).toHaveLength(1);
    expect(durErrors[0].severity).toBe('error');
  });

  it('should warn on bare text asset placeholders', () => {
    writeFile('project.md', VALID_PROJECT);
    writeFile('scene-001.md', `---
id: sc001
scene_number: "1"
order_index: 0
---

# Scene 1: Opening

---

### 2s: Shot with placeholder

Script text.

> Camera notes.

catchpit
`);

    const result = lintProject(dir);
    const bareWarns = result.warnings.filter(w =>
      w.message.includes('Bare text') && w.message.includes('catchpit')
    );
    expect(bareWarns).toHaveLength(1);
    expect(bareWarns[0].severity).toBe('warning');
  });

  it('should not flag normal paragraphs as bare text placeholders', () => {
    writeFile('project.md', VALID_PROJECT);
    writeFile('scene-001.md', `---
id: sc001
scene_number: "1"
order_index: 0
---

# Scene 1: Opening

---

### 2s: Normal shot

A sweeping vista of the mountains at dawn with birds flying overhead.

> Camera notes here.
`);

    const result = lintProject(dir);
    const bareWarns = result.warnings.filter(w => w.message.includes('Bare text'));
    expect(bareWarns).toHaveLength(0);
  });

  it('should warn on missing frontmatter fields', () => {
    writeFile('project.md', `---
fps: 24
---

# Untitled
`);
    writeFile('scene-001.md', `---
id: sc001
---

# Scene 1

---

### 2s: Shot

Script.
`);

    const result = lintProject(dir);
    const projWarn = result.warnings.find(w =>
      w.file === 'project.md' && w.message.includes('"id"')
    );
    expect(projWarn).toBeDefined();

    const sceneWarns = result.warnings.filter(w =>
      w.file === 'scene-001.md' && (w.message.includes('scene_number') || w.message.includes('order_index'))
    );
    expect(sceneWarns).toHaveLength(2);
  });

  it('should error when referenced image file does not exist', () => {
    writeFile('project.md', VALID_PROJECT);
    writeFile('scene-001.md', `---
id: sc001
scene_number: "1"
order_index: 0
---

# Scene 1: Opening

---

### 2s: Shot with missing image

Script text.

> Camera notes.

![frame](assets/nonexistent.png "Missing file")
`);

    const result = lintProject(dir);
    const imgErrors = result.warnings.filter(w =>
      w.message.includes('Image file not found')
    );
    expect(imgErrors).toHaveLength(1);
    expect(imgErrors[0].severity).toBe('error');
    expect(imgErrors[0].message).toContain('nonexistent.png');
  });

  it('should pass for images that exist on disk', () => {
    writeFile('project.md', VALID_PROJECT);
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'frame.png'), 'fake-png-data');
    writeFile('scene-001.md', VALID_SCENE);

    const result = lintProject(dir);
    const imgErrors = result.warnings.filter(w =>
      w.message.includes('Image file not found')
    );
    expect(imgErrors).toHaveLength(0);
  });

  it('should warn on image paths not starting with assets/', () => {
    writeFile('project.md', VALID_PROJECT);
    writeFile('scene-001.md', `---
id: sc001
scene_number: "1"
order_index: 0
---

# Scene 1: Opening

---

### 2s: Shot with wrong path

Script.

![frame](images/photo.png "Wrong prefix")
`);

    const result = lintProject(dir);
    const pathWarns = result.warnings.filter(w =>
      w.message.includes('should start with "assets/"')
    );
    expect(pathWarns).toHaveLength(1);
  });

  it('should skip external URLs for existence checks', () => {
    writeFile('project.md', VALID_PROJECT);
    writeFile('scene-001.md', `---
id: sc001
scene_number: "1"
order_index: 0
---

# Scene 1: Opening

---

### 2s: Shot with external ref

Script.

![ref](https://example.com/image.png "External")
`);

    const result = lintProject(dir);
    const imgErrors = result.warnings.filter(w =>
      w.message.includes('Image file not found') || w.message.includes('should start with')
    );
    expect(imgErrors).toHaveLength(0);
  });

  it('should handle multiple scenes', () => {
    writeFile('project.md', VALID_PROJECT);
    writeFile('scene-001.md', VALID_SCENE);
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'frame.png'), 'fake-png');
    writeFile('scene-002.md', `---
id: sc002
scene_number: "2"
order_index: 1
---

# Scene 2: Middle

Summary.

---

### 3s: Action shot

Script.

> Camera notes.
`);

    const result = lintProject(dir);
    expect(result.warnings).toHaveLength(0);
    expect(result.fileCount).toBe(3);
  });
});
