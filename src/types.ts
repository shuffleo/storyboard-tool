// Canonical data model - single source of truth

export type ShotStatus = 'todo' | 'boarded' | 'animated' | 'needs-review';

export interface Project {
  id: string;
  title: string;
  fps: number;
  aspectRatio: string;
  targetDuration?: number;
  styleNotes: string;
  referenceLinks: string[];
  globalNotes: string;
  createdAt: number;
  updatedAt: number;
}

export interface Sequence {
  id: string;
  name: string;
  orderIndex: number;
  notes: string;
}

export interface Scene {
  id: string;
  sequenceId?: string;
  sceneNumber: string;
  title: string;
  summary: string;
  orderIndex: number;
  notes: string;
}

export interface Shot {
  id: string; // Stable, canonical ID
  sceneId?: string;
  orderIndex: number; // Global canonical order
  shotCode: string; // e.g. "010", "020", "030"
  scriptText: string;
  duration: number; // milliseconds, minimum 300ms
  status: ShotStatus;
  tags: string[];
  cameraNotes: string;
  animationNotes: string;
  generalNotes: string;
}

export interface StoryboardFrame {
  id: string;
  shotId: string;
  image: string; // base64 or blob URL
  caption: string;
  overlayData?: any; // arrows, markings
  orderIndex: number;
  version: number;
}

export interface Version {
  id: string;
  timestamp: number;
  description: string;
  snapshot: ProjectSnapshot;
}

export interface ProjectSnapshot {
  project: Project;
  sequences: Sequence[];
  scenes: Scene[];
  shots: Shot[];
  frames: StoryboardFrame[];
}

// Full project state
export interface ProjectState {
  project: Project;
  sequences: Sequence[];
  scenes: Scene[];
  shots: Shot[];
  frames: StoryboardFrame[];
  versions: Version[];
}

