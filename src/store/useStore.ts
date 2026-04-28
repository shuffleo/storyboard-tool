import { create } from 'zustand';
import { ProjectState, Shot, Scene, StoryboardFrame, Sequence, Project } from '../types';
import { db } from '../db/indexeddb';
import { nanoid } from 'nanoid';
import type { ProjectFolderHandle } from '../sync/fileSystemAccess';
import { loadProject, debouncedSaveProject } from '../sync/projectLoader';
import { SyncClient, type SyncStatus, type SyncConfig } from '../sync/wsClient';
import { applyDiff } from '../../server/diffEngine';
import type { DiffOp } from '../../server/protocol';
import { assetResolver } from '../sync/assetResolver';

export type ProjectSource = 'none' | 'fsa' | 'indexeddb' | 'companion';

interface Store extends ProjectState {
  // Actions
  init: () => Promise<void>;
  createProject: (title: string) => void;
  updateProject: (updates: Partial<Project>) => void;
  
  // Sequences
  createSequence: (name: string) => string;
  updateSequence: (id: string, updates: Partial<Sequence>) => void;
  deleteSequence: (id: string) => void;
  
  // Scenes
  createScene: (sequenceId?: string) => string;
  updateScene: (id: string, updates: Partial<Scene>) => void;
  deleteScene: (id: string) => void;
  reorderScenes: (sceneIds: string[]) => void;
  
  // Shots
  createShot: (sceneId?: string) => string;
  updateShot: (id: string, updates: Partial<Shot>) => void;
  deleteShot: (id: string, askDeleteScene?: boolean) => void;
  reorderShots: (shotIds: string[]) => void;
  splitShot: (shotId: string, atIndex: number) => string;
  mergeShots: (shotIds: string[]) => string;
  bulkUpdateShots: (shotIds: string[], updates: Partial<Shot>) => void;
  
  // Frames
  addFrame: (shotId: string, image: string, caption?: string) => string;
  updateFrame: (id: string, updates: Partial<StoryboardFrame>) => void;
  deleteFrame: (id: string) => void;
  reorderFrames: (shotId: string, frameIds: string[]) => void;
  
  // Undo/Redo
  history: ProjectState[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  
  // Persistence
  save: () => Promise<void>;
  loadProjectState: (state: ProjectState) => void;
  isSaving: boolean;
  lastSaved: number | null;
  
  // Project folder
  projectHandle: ProjectFolderHandle | null;
  projectSource: ProjectSource;
  openProjectFromHandle: (handle: ProjectFolderHandle) => Promise<void>;
  closeProject: () => void;
  
  // Sync
  syncClient: SyncClient | null;
  syncStatus: SyncStatus;
  agentEditing: boolean;
  projectFolderPath: string | null;
  initSync: (config?: Partial<SyncConfig>) => void;
  teardownSync: () => void;
  handleExternalDiff: (ops: DiffOp[]) => void;
  
  // Clear all content
  clearAllContent: () => Promise<void>;
}

const defaultProject: Project = {
  id: nanoid(),
  title: 'Untitled Project',
  fps: 24,
  aspectRatio: '16:9',
  styleNotes: '',
  referenceLinks: [],
  globalNotes: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const MAX_HISTORY = 100;

export const useStore = create<Store>((set, get) => ({
  project: defaultProject,
  sequences: [],
  scenes: [],
  shots: [],
  frames: [],
  versions: [],
  isSaving: false,
  lastSaved: null,
  history: [],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,
  projectHandle: null,
  projectSource: 'none',
  syncClient: null,
  syncStatus: 'disconnected' as SyncStatus,
  agentEditing: false,
  projectFolderPath: null,

  init: async () => {
    try {
      // Request persistent storage to reduce data loss risk
      if ('storage' in navigator && 'persist' in navigator.storage) {
        const isPersistent = await navigator.storage.persist();
        console.log(`Store: Persistent storage ${isPersistent ? 'granted' : 'denied'}`);
      }
      
      console.log('Store: Loading project from IndexedDB...');
      const saved = await db.loadProject();
      if (saved) {
        console.log('Store: Project loaded from IndexedDB');
        set({ ...saved, projectSource: 'indexeddb', history: [saved], historyIndex: 0, canUndo: false, canRedo: false });
      } else {
        console.log('Store: No saved project, creating default...');
        // Create default project with 3 scenes and 5 shots each
        const defaultScenes: Scene[] = [];
        const defaultShots: Shot[] = [];
        
        // Create 3 scenes with 5 shots each
        for (let sceneNum = 0; sceneNum < 3; sceneNum++) {
          const sceneId = nanoid();
          const scene: Scene = {
            id: sceneId,
            sequenceId: undefined,
            sceneNumber: String(sceneNum),
            title: `Scene ${sceneNum}`,
            summary: '',
            orderIndex: sceneNum,
            notes: '',
          };
          defaultScenes.push(scene);
          
          // Create 5 shots for this scene
          for (let shotNum = 0; shotNum < 5; shotNum++) {
            const shotId = nanoid();
            const shotCode = String((sceneNum * 5 + shotNum) * 10).padStart(3, '0');
            const shot: Shot = {
              id: shotId,
              sceneId: sceneId,
              orderIndex: sceneNum * 5 + shotNum,
              shotCode,
              title: '',
              scriptText: '',
              duration: 500, // Default 500ms
              tags: [],
              generalNotes: '',
            };
            defaultShots.push(shot);
          }
        }
        
        const state: ProjectState = {
          project: defaultProject,
          sequences: [],
          scenes: defaultScenes,
          shots: defaultShots,
          frames: [],
          versions: [],
        };
        set({ ...state, projectSource: 'indexeddb', history: [state], historyIndex: 0, canUndo: false, canRedo: false });
        await db.saveProject(state);
        console.log('Store: Default project created and saved');
      }
    } catch (error) {
      console.error('Store: Error during initialization:', error);
      // Set a minimal state even if DB fails
      const state: ProjectState = {
        project: defaultProject,
        sequences: [],
        scenes: [],
        shots: [],
        frames: [],
        versions: [],
      };
      set({ ...state, history: [state], historyIndex: 0, canUndo: false, canRedo: false });
    }
  },

  pushHistory: () => {
    const state = get();
    const currentState: ProjectState = {
      project: { ...state.project },
      sequences: [...state.sequences],
      scenes: [...state.scenes],
      shots: [...state.shots],
      frames: [...state.frames],
      versions: [...state.versions],
    };
    
    let history = state.history.slice(0, state.historyIndex + 1);
    history.push(currentState);
    
    // Limit to MAX_HISTORY
    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
    }
    
    const newIndex = history.length - 1;
    set({ 
      history,
      historyIndex: newIndex,
      canUndo: newIndex > 0,
      canRedo: false,
    });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex > 0) {
      const newIndex = state.historyIndex - 1;
      const previousState = state.history[newIndex];
      if (previousState) {
        set({
          project: { ...previousState.project },
          sequences: [...previousState.sequences],
          scenes: [...previousState.scenes],
          shots: [...previousState.shots],
          frames: [...previousState.frames],
          versions: [...previousState.versions],
          historyIndex: newIndex,
          canUndo: newIndex > 0,
          canRedo: newIndex < state.history.length - 1,
        });
        // Don't save on undo - we're restoring a previous state
        // The save will happen when user makes a new change
      }
    }
  },

  redo: () => {
    const state = get();
    if (state.historyIndex < state.history.length - 1) {
      const newIndex = state.historyIndex + 1;
      const nextState = state.history[newIndex];
      if (nextState) {
        set({
          project: { ...nextState.project },
          sequences: [...nextState.sequences],
          scenes: [...nextState.scenes],
          shots: [...nextState.shots],
          frames: [...nextState.frames],
          versions: [...nextState.versions],
          historyIndex: newIndex,
          canUndo: true,
          canRedo: newIndex < state.history.length - 1,
        });
        // Don't save on redo - we're restoring a previous state
        // The save will happen when user makes a new change
      }
    }
  },

  createProject: (title: string) => {
    const project: Project = {
      ...defaultProject,
      id: nanoid(),
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set({ project });
    get().save();
  },

  updateProject: (updates: Partial<Project>) => {
    get().pushHistory();
    set((state) => ({
      project: { ...state.project, ...updates },
    }));
    get().save();
  },

  createSequence: (name: string) => {
    get().pushHistory();
    const id = nanoid();
    const maxOrder = Math.max(0, ...get().sequences.map(s => s.orderIndex));
    const sequence: Sequence = {
      id,
      name,
      orderIndex: maxOrder + 1,
      notes: '',
    };
    set((state) => ({
      sequences: [...state.sequences, sequence],
    }));
    get().save();
    return id;
  },

  updateSequence: (id: string, updates: Partial<Sequence>) => {
    get().pushHistory();
    set((state) => ({
      sequences: state.sequences.map(s => s.id === id ? { ...s, ...updates } : s),
    }));
    get().save();
  },

  deleteSequence: (id: string) => {
    get().pushHistory();
    set((state) => ({
      sequences: state.sequences.filter(s => s.id !== id),
      scenes: state.scenes.map(s => s.sequenceId === id ? { ...s, sequenceId: undefined } : s),
    }));
    get().save();
  },

  createScene: (sequenceId?: string) => {
    get().pushHistory();
    const id = nanoid();
    const maxOrder = Math.max(0, ...get().scenes.map(s => s.orderIndex));
    const scene: Scene = {
      id,
      sequenceId,
      sceneNumber: String(maxOrder + 1),
      title: '',
      summary: '',
      orderIndex: maxOrder + 1,
      notes: '',
    };
    set((state) => ({
      scenes: [...state.scenes, scene],
    }));
    
    // Auto-create one shot for the new scene
    get().createShot(id);
    
    get().save();
    return id;
  },

  updateScene: (id: string, updates: Partial<Scene>) => {
    get().pushHistory();
    set((state) => ({
      scenes: state.scenes.map(s => s.id === id ? { ...s, ...updates } : s),
    }));
    get().save();
  },

  deleteScene: (id: string) => {
    get().pushHistory();
    set((state) => ({
      scenes: state.scenes.filter(s => s.id !== id),
      shots: state.shots.map(s => s.sceneId === id ? { ...s, sceneId: undefined } : s),
    }));
    get().save();
  },

  reorderScenes: (sceneIds: string[]) => {
    get().pushHistory();
    set((state) => {
      const sceneMap = new Map(state.scenes.map(s => [s.id, s]));
      const reordered = sceneIds.map((id, index) => {
        const scene = sceneMap.get(id);
        if (!scene) return null;
        return { ...scene, orderIndex: index, sceneNumber: String(index + 1) };
      }).filter((s): s is Scene => s !== null);
      
      return { scenes: reordered };
    });
    get().save();
  },

  createShot: (sceneId?: string) => {
    get().pushHistory();
    const state = get();
    
    // If no sceneId provided, find or create scene 0
    let targetSceneId = sceneId;
    if (!targetSceneId) {
      let scene0 = state.scenes.find((s) => s.sceneNumber === '0');
      if (!scene0) {
        const scene0Id = nanoid();
        scene0 = {
          id: scene0Id,
          sequenceId: undefined,
          sceneNumber: '0',
          title: 'Scene 0',
          summary: '',
          orderIndex: 0,
          notes: '',
        };
        set((s) => ({
          scenes: [...s.scenes, scene0!],
        }));
      }
      targetSceneId = scene0.id;
    }
    
    const id = nanoid();
    const maxOrder = Math.max(-1, ...state.shots.map(s => s.orderIndex));
    // Shot codes: 010, 020, 030... (orderIndex * 10)
    const shotCode = String((maxOrder + 1) * 10).padStart(3, '0');
    const shot: Shot = {
      id,
      sceneId: targetSceneId,
      orderIndex: maxOrder + 1,
      shotCode,
      title: '',
      scriptText: '',
      duration: 500, // Default 500ms
      tags: [],
      generalNotes: '',
    };
    set((s) => ({
      shots: [...s.shots, shot],
    }));
    get().save();
    return id;
  },

  updateShot: (id: string, updates: Partial<Shot>, skipHistory = false) => {
    if (!skipHistory) {
      get().pushHistory();
    }
    set((state) => ({
      shots: state.shots.map(s => s.id === id ? { ...s, ...updates } : s),
    }));
    get().save();
  },

  deleteShot: (id: string, _askDeleteScene: boolean = true) => {
    // Note: _askDeleteScene is kept for backward compatibility but dialogs are now handled in UI components
    // When _askDeleteScene is false, it means the dialog was already shown and user confirmed
    get().pushHistory();
    set((state) => ({
      shots: state.shots.filter(s => s.id !== id),
      frames: state.frames.filter(f => f.shotId !== id),
    }));
    get().save();
  },

  /**
   * CRITICAL: Reordering function - DO NOT MODIFY LOGIC
   * Reorders shots based on the provided shotIds array.
   * Automatically recalculates:
   * - orderIndex (0, 1, 2, ...)
   * - shotCode (010, 020, 030, ...)
   * 
   * This is called by arrow buttons in TableView and StoryboardView.
   * DO NOT remove the shot code recalculation - it's essential for maintaining
   * consistent shot numbering.
   */
  reorderShots: (shotIds: string[]) => {
    get().pushHistory();
    set((state) => {
      const shotMap = new Map(state.shots.map(s => [s.id, s]));
      const reordered = shotIds.map((id, index) => {
        const shot = shotMap.get(id);
        if (!shot) return null;
        return { ...shot, orderIndex: index };
      }).filter((s): s is Shot => s !== null);
      
      // CRITICAL: Update shot codes based on new order
      // This ensures shot codes (010, 020, 030) match the visual order
      reordered.forEach((shot, index) => {
        shot.shotCode = String(index * 10).padStart(3, '0');
      });
      
      return { shots: reordered };
    });
    get().save();
  },

  splitShot: (shotId: string, atIndex: number) => {
    const shot = get().shots.find(s => s.id === shotId);
    if (!shot) return '';
    
    const newId = nanoid();
    const newShot: Shot = {
      ...shot,
      id: newId,
      orderIndex: shot.orderIndex + 1,
      shotCode: String((shot.orderIndex + 1) * 10).padStart(3, '0'),
      scriptText: shot.scriptText.slice(atIndex), // Second half of text
    };
    
    set((state) => {
      const updatedShot = { ...shot, scriptText: shot.scriptText.slice(0, atIndex) }; // First half
      const updatedShots = state.shots.map(s => s.id === shotId ? updatedShot : s);
      const insertIndex = updatedShots.findIndex(s => s.id === shotId) + 1;
      updatedShots.splice(insertIndex, 0, newShot);
      
      // Reorder all shots after
      updatedShots.forEach((s, idx) => {
        s.orderIndex = idx;
        s.shotCode = String(idx * 10).padStart(3, '0');
      });
      
      return { shots: updatedShots };
    });
    get().save();
    return newId;
  },

  mergeShots: (shotIds: string[]) => {
    if (shotIds.length < 2) return '';
    
    const shots = get().shots.filter(s => shotIds.includes(s.id)).sort((a, b) => a.orderIndex - b.orderIndex);
    if (shots.length < 2) return '';
    
    // Merge: combine text fields, sum duration, dedupe tags
    const merged: Shot = {
      ...shots[0],
      scriptText: shots.map(s => s.scriptText).join('\n\n'),
      duration: shots.reduce((sum, s) => sum + s.duration, 0),
      tags: [...new Set(shots.flatMap(s => s.tags))],
      generalNotes: shots.map(s => s.generalNotes).filter(Boolean).join('\n\n'),
    };
    
    set((state) => {
      const remainingIds = shotIds.slice(1); // Keep first shot, remove others
      const updatedShots = state.shots
        .filter(s => !remainingIds.includes(s.id))
        .map(s => s.id === shots[0].id ? merged : s);
      
      // Reorder
      updatedShots.forEach((s, idx) => {
        s.orderIndex = idx;
        s.shotCode = String(idx * 10).padStart(3, '0');
      });
      
      // Reassign frames
      const framesToReassign = state.frames.filter(f => remainingIds.includes(f.shotId));
      const updatedFrames = state.frames
        .filter(f => !remainingIds.includes(f.shotId))
        .concat(framesToReassign.map(f => ({ ...f, shotId: merged.id })));
      
      return { shots: updatedShots, frames: updatedFrames };
    });
    get().save();
    return merged.id;
  },

  bulkUpdateShots: (shotIds: string[], updates: Partial<Shot>) => {
    set((state) => ({
      shots: state.shots.map(s => shotIds.includes(s.id) ? { ...s, ...updates } : s),
    }));
    get().save();
  },

  addFrame: (shotId: string, image: string, caption = '') => {
    get().pushHistory();
    const id = nanoid();
    const frames = get().frames.filter(f => f.shotId === shotId);
    const maxOrder = Math.max(-1, ...frames.map(f => f.orderIndex));
    const frame: StoryboardFrame = {
      id,
      shotId,
      image,
      caption,
      orderIndex: maxOrder + 1,
      version: 1,
    };
    set((state) => ({
      frames: [...state.frames, frame],
    }));
    get().save();
    return id;
  },

  updateFrame: (id: string, updates: Partial<StoryboardFrame>) => {
    get().pushHistory();
    set((state) => ({
      frames: state.frames.map(f => f.id === id ? { ...f, ...updates } : f),
    }));
    get().save();
  },

  deleteFrame: (id: string) => {
    get().pushHistory();
    set((state) => ({
      frames: state.frames.filter(f => f.id !== id),
    }));
    get().save();
  },

  reorderFrames: (shotId: string, frameIds: string[]) => {
    get().pushHistory();
    set((state) => {
      const frameMap = new Map(state.frames.filter(f => f.shotId === shotId).map(f => [f.id, f]));
      const reordered = frameIds.map((id, index) => {
        const frame = frameMap.get(id);
        if (!frame) return null;
        return { ...frame, orderIndex: index };
      }).filter((f): f is StoryboardFrame => f !== null);
      
      const otherFrames = state.frames.filter(f => f.shotId !== shotId);
      return { frames: [...otherFrames, ...reordered] };
    });
    get().save();
  },

  openProjectFromHandle: async (handle: ProjectFolderHandle) => {
    try {
      const { state } = await loadProject(handle);
      set({
        ...state,
        projectHandle: handle,
        projectSource: 'fsa',
        projectFolderPath: handle.directoryHandle.name,
        history: [state],
        historyIndex: 0,
        canUndo: false,
        canRedo: false,
      });
      await db.saveDirectoryHandle(handle.directoryHandle, state.project.title);
      await db.saveProject(state);
    } catch (error) {
      console.error('Failed to open project from folder:', error);
      throw error;
    }
  },

  closeProject: () => {
    const state = get();
    if (state.syncClient) {
      state.syncClient.disconnect();
    }
    if (state.projectSource === 'fsa' && state.projectHandle) {
      const currentState: ProjectState = {
        project: state.project,
        sequences: state.sequences,
        scenes: state.scenes,
        shots: state.shots,
        frames: state.frames,
        versions: state.versions,
      };
      debouncedSaveProject(state.projectHandle, currentState, 0);
    }
    assetResolver.revokeAll();
    set({
      project: defaultProject,
      sequences: [],
      scenes: [],
      shots: [],
      frames: [],
      versions: [],
      projectHandle: null,
      projectSource: 'none',
      projectFolderPath: null,
      syncClient: null,
      syncStatus: 'disconnected' as SyncStatus,
      history: [],
      historyIndex: -1,
      canUndo: false,
      canRedo: false,
    });
  },

  initSync: (config?: Partial<SyncConfig>) => {
    const state = get();
    if (state.syncClient) state.syncClient.disconnect();

    const client = new SyncClient(config);

    client.onStatusChange((status) => {
      set({ syncStatus: status });
      if (status === 'connected') {
        set({ projectSource: 'companion' });
        assetResolver.setCompanionUrl(client.assetBaseUrl);
      } else if (status === 'disconnected') {
        const current = get();
        if (current.projectSource === 'companion') {
          set({ projectSource: current.projectHandle ? 'fsa' : 'indexeddb' });
          assetResolver.setCompanionUrl(null);
        }
      }
    });

    client.onFullSync((newState) => {
      set({
        ...newState,
        history: [newState],
        historyIndex: 0,
        canUndo: false,
        canRedo: false,
        projectFolderPath: client.projectPath,
      });
    });

    client.onDiff((ops) => {
      get().handleExternalDiff(ops);
    });

    client.onAgentEditing((editing) => {
      set({ agentEditing: editing });
    });

    set({ syncClient: client });
    client.connect();
  },

  teardownSync: () => {
    const state = get();
    if (state.syncClient) {
      state.syncClient.disconnect();
      set({ syncClient: null, syncStatus: 'disconnected' as SyncStatus });
    }
  },

  handleExternalDiff: (ops: DiffOp[]) => {
    const state = get();
    const currentState: ProjectState = {
      project: state.project,
      sequences: state.sequences,
      scenes: state.scenes,
      shots: state.shots,
      frames: state.frames,
      versions: state.versions,
    };
    const newState = applyDiff(currentState, ops);
    set({
      project: newState.project,
      sequences: newState.sequences,
      scenes: newState.scenes,
      shots: newState.shots,
      frames: newState.frames,
      versions: newState.versions,
    });
  },

  save: async () => {
    set({ isSaving: true });
    try {
      const state = get();
      const projectState: ProjectState = {
        project: state.project,
        sequences: state.sequences,
        scenes: state.scenes,
        shots: state.shots,
        frames: state.frames,
        versions: state.versions,
      };

      await db.saveProject(projectState);

      if (state.projectSource === 'fsa' && state.projectHandle) {
        debouncedSaveProject(state.projectHandle, projectState);
      }

      const savedTime = Date.now();
      set({ lastSaved: savedTime, isSaving: false });
    } catch (error) {
      console.error('Save failed:', error);
      set({ isSaving: false });
    }
  },

  clearAllContent: async () => {
    // Create default project with 3 scenes and 5 shots each
    const defaultScenes: Scene[] = [];
    const defaultShots: Shot[] = [];
    
    for (let sceneNum = 0; sceneNum < 3; sceneNum++) {
      const sceneId = nanoid();
      const scene: Scene = {
        id: sceneId,
        sequenceId: undefined,
        sceneNumber: String(sceneNum),
        title: `Scene ${sceneNum}`,
        summary: '',
        orderIndex: sceneNum,
        notes: '',
      };
      defaultScenes.push(scene);
      
      for (let shotNum = 0; shotNum < 5; shotNum++) {
        const shotId = nanoid();
        const shotCode = String((sceneNum * 5 + shotNum) * 10).padStart(3, '0');
        const shot: Shot = {
          id: shotId,
          sceneId: sceneId,
          orderIndex: sceneNum * 5 + shotNum,
          shotCode,
          title: '',
          scriptText: '',
          duration: 1000,
          tags: [],
          generalNotes: '',
        };
        defaultShots.push(shot);
      }
    }
    
    const newProject: Project = {
      ...defaultProject,
      id: nanoid(),
      title: 'Untitled Project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    const state: ProjectState = {
      project: newProject,
      sequences: [],
      scenes: defaultScenes,
      shots: defaultShots,
      frames: [],
      versions: [],
    };
    
    set({ ...state, history: [state], historyIndex: 0, canUndo: false, canRedo: false });
    await db.saveProject(state);
  },

  loadProjectState: (state: ProjectState) => {
    set(state);
    get().save();
  },
}));

export function resolveAssetUrl(path: string | undefined): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  const state = useStore.getState();
  if (state.projectSource === 'companion' && state.syncClient) {
    return `${state.syncClient.assetBaseUrl}/${path}`;
  }
  return path;
}

if (typeof window !== 'undefined') {
  (window as any).__storyboardStore = useStore;
}

