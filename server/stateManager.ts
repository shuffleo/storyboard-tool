import { readFileSync, readdirSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ProjectState } from '../src/types.js';
import type { ParseResult } from './parser/types.js';
import type { DiffOp } from './protocol.js';
import { parseProjectFolder, parsedToProjectState } from './parser/index.js';
import { projectStateToMarkdown } from './parser/converters.js';
import { diffProjectState, applyDiff } from './diffEngine.js';

export class StateManager {
  private state: ProjectState | null = null;
  private parseResult: ParseResult | null = null;
  private version: number = 0;
  private projectPath: string;
  public selfWritePaths: Set<string> = new Set();

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  getState(): ProjectState {
    if (!this.state) throw new Error('State not loaded');
    return this.state;
  }

  getVersion(): number {
    return this.version;
  }

  getParseResult(): ParseResult {
    if (!this.parseResult) throw new Error('State not loaded');
    return this.parseResult;
  }

  loadFromDisk(): void {
    const files = new Map<string, string>();

    const entries = readdirSync(this.projectPath);
    for (const entry of entries) {
      if (entry.endsWith('.md') && (entry === 'project.md' || /^scene-\d+\.md$/.test(entry))) {
        const content = readFileSync(join(this.projectPath, entry), 'utf-8');
        files.set(entry, content);
      }
    }

    this.parseResult = parseProjectFolder(files);
    this.state = parsedToProjectState(this.parseResult);
    this.version = 0;
  }

  applyFileChange(filename: string, content: string): DiffOp[] {
    if (!this.state || !this.parseResult) {
      this.loadFromDisk();
      return [];
    }

    const oldState = this.state;
    const files = this.getCurrentFiles();
    files.set(filename, content);

    this.parseResult = parseProjectFolder(files);
    this.state = parsedToProjectState(this.parseResult);
    this.version++;

    return diffProjectState(oldState, this.state);
  }

  applyFileDelete(filename: string): DiffOp[] {
    if (!this.state) return [];

    const oldState = this.state;
    const files = this.getCurrentFiles();
    files.delete(filename);

    this.parseResult = parseProjectFolder(files);
    this.state = parsedToProjectState(this.parseResult);
    this.version++;

    return diffProjectState(oldState, this.state);
  }

  applyFileAdd(filename: string, content: string): DiffOp[] {
    return this.applyFileChange(filename, content);
  }

  async applyMutation(ops: DiffOp[]): Promise<void> {
    if (!this.state) throw new Error('State not loaded');

    this.state = applyDiff(this.state, ops);
    const mdFiles = projectStateToMarkdown(this.state);

    const existingScenes = readdirSync(this.projectPath)
      .filter(f => /^scene-\d+\.md$/.test(f));
    const newSceneFiles = new Set<string>();

    for (const [filename, content] of mdFiles) {
      const filepath = join(this.projectPath, filename);
      this.selfWritePaths.add(filepath);
      writeFileSync(filepath, content, 'utf-8');
      setTimeout(() => this.selfWritePaths.delete(filepath), 500);
      if (/^scene-\d+\.md$/.test(filename)) {
        newSceneFiles.add(filename);
      }
    }

    for (const existing of existingScenes) {
      if (!newSceneFiles.has(existing)) {
        const filepath = join(this.projectPath, existing);
        this.selfWritePaths.add(filepath);
        unlinkSync(filepath);
        setTimeout(() => this.selfWritePaths.delete(filepath), 500);
      }
    }

    // Re-parse for fresh source positions
    const files = new Map<string, string>();
    for (const [filename, content] of mdFiles) {
      files.set(filename, content);
    }
    this.parseResult = parseProjectFolder(files);
    this.version++;
  }

  private getCurrentFiles(): Map<string, string> {
    const files = new Map<string, string>();
    const entries = readdirSync(this.projectPath);
    for (const entry of entries) {
      if (entry.endsWith('.md') && (entry === 'project.md' || /^scene-\d+\.md$/.test(entry))) {
        const content = readFileSync(join(this.projectPath, entry), 'utf-8');
        files.set(entry, content);
      }
    }
    return files;
  }
}
