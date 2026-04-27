export interface SourceRange {
  from: number;
  to: number;
  line: number;
}

export interface ParsedProject {
  id: string;
  title: string;
  fps: number;
  aspectRatio: string;
  targetDuration?: number;
  styleNotes: string;
  referenceLinks: string[];
  globalNotes: string;
  createdAt: string;
  updatedAt: string;
  sourceRanges: {
    title: SourceRange;
    styleNotes: SourceRange;
    referenceLinks: SourceRange;
    globalNotes: SourceRange;
  };
}

export interface ParsedScene {
  id: string;
  sceneNumber: string;
  orderIndex: number;
  title: string;
  summary: string;
  notes: string;
  shots: ParsedShot[];
  sourceFile: string;
  sourceRanges: {
    title: SourceRange;
    summary: SourceRange;
    notes: SourceRange;
  };
}

export interface ParsedShot {
  id: string;
  durationMs: number;
  title: string;
  scriptText: string;
  generalNotes: string;
  tags: string[];
  frames: ParsedFrame[];
  sourceRanges: {
    whole: SourceRange;
    metadataComment: SourceRange;
    duration: SourceRange;
    title: SourceRange;
    scriptText: SourceRange;
    generalNotes: SourceRange;
  };
}

export interface ParsedFrame {
  id: string;
  label: string;
  path: string;
  caption: string;
  orderIndex: number;
  sourceRanges: {
    whole: SourceRange;
    path: SourceRange;
    caption: SourceRange;
  };
}

export interface ParseWarning {
  file: string;
  line: number;
  message: string;
  severity: 'warning' | 'error';
}

export interface ParseResult {
  project: ParsedProject;
  scenes: ParsedScene[];
  warnings: ParseWarning[];
}

export const NULL_RANGE: SourceRange = { from: 0, to: 0, line: 0 };
