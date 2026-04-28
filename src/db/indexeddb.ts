import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ProjectState, ProjectSnapshot } from '../types';

interface RecentProjectEntry {
  title: string;
  directoryHandle: FileSystemDirectoryHandle;
  lastOpened: number;
}

interface StoryboardDB extends DBSchema {
  project: {
    key: string;
    value: ProjectState;
  };
  versions: {
    key: string;
    value: { id: string; timestamp: number; description: string; snapshot: ProjectSnapshot };
    indexes: { 'by-timestamp': number };
  };
  handles: {
    key: string;
    value: { key: string; handle: FileSystemDirectoryHandle; title: string; lastOpened: number };
  };
  'image-cache': {
    key: string;
    value: { path: string; blob: Blob; lastAccessed: number };
  };
}

const DB_NAME = 'storyboard-db';
const DB_VERSION = 3;
const PROJECT_KEY = 'current-project';
const HANDLE_KEY = 'last-directory';
const RECENTS_KEY = 'recent-projects';

class IndexedDBStorage {
  private db: IDBPDatabase<StoryboardDB> | null = null;

  async init(): Promise<void> {
    this.db = await openDB<StoryboardDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('project')) {
          db.createObjectStore('project');
        }
        if (!db.objectStoreNames.contains('versions')) {
          const versionStore = db.createObjectStore('versions', { keyPath: 'id' });
          versionStore.createIndex('by-timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles');
        }
        if (!db.objectStoreNames.contains('image-cache')) {
          db.createObjectStore('image-cache', { keyPath: 'path' });
        }
      },
    });
  }

  async loadProject(): Promise<ProjectState | null> {
    try {
      if (!this.db) await this.init();
      const state = await this.db!.get('project', PROJECT_KEY);
      console.log('IndexedDB: Loaded project:', state ? 'found' : 'not found');
      return state || null;
    } catch (error) {
      console.error('IndexedDB: Error loading project:', error);
      return null;
    }
  }

  async saveProject(state: ProjectState): Promise<void> {
    if (!this.db) await this.init();
    const stateToSave = {
      ...state,
      project: {
        ...state.project,
        updatedAt: Date.now(),
      },
    };
    await this.db!.put('project', stateToSave, PROJECT_KEY);
  }

  async saveVersion(version: { id: string; timestamp: number; description: string; snapshot: ProjectSnapshot }): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.put('versions', version);
  }

  async loadVersions(): Promise<{ id: string; timestamp: number; description: string; snapshot: ProjectSnapshot }[]> {
    if (!this.db) await this.init();
    const index = this.db!.transaction('versions').store.index('by-timestamp');
    return await index.getAll();
  }

  async exportProject(): Promise<ProjectSnapshot> {
    const state = await this.loadProject();
    if (!state) throw new Error('No project to export');
    return {
      project: state.project,
      sequences: state.sequences,
      scenes: state.scenes,
      shots: state.shots,
      frames: state.frames,
    };
  }

  async importProject(snapshot: ProjectSnapshot): Promise<void> {
    const state: ProjectState = {
      ...snapshot,
      versions: [],
    };
    await this.saveProject(state);
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.clear('project');
    await this.db!.clear('versions');
  }

  async saveDirectoryHandle(handle: FileSystemDirectoryHandle, title: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.put('handles', {
      key: HANDLE_KEY,
      handle,
      title,
      lastOpened: Date.now(),
    }, HANDLE_KEY);
  }

  async loadDirectoryHandle(): Promise<{ handle: FileSystemDirectoryHandle; title: string } | null> {
    try {
      if (!this.db) await this.init();
      const entry = await this.db!.get('handles', HANDLE_KEY);
      if (entry) return { handle: entry.handle, title: entry.title };
      return null;
    } catch {
      return null;
    }
  }

  async saveRecentProjects(projects: RecentProjectEntry[]): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.put('handles', {
      key: RECENTS_KEY,
      handle: null as any,
      title: '',
      lastOpened: 0,
      ...({ recents: projects } as any),
    }, RECENTS_KEY);
  }

  async loadRecentProjects(): Promise<RecentProjectEntry[]> {
    try {
      if (!this.db) await this.init();
      const entry = await this.db!.get('handles', RECENTS_KEY);
      return (entry as any)?.recents ?? [];
    } catch {
      return [];
    }
  }

  async cacheImage(path: string, blob: Blob): Promise<void> {
    try {
      if (!this.db) await this.init();
      await this.db!.put('image-cache', { path, blob, lastAccessed: Date.now() });
    } catch (error) {
      console.warn('IndexedDB: Failed to cache image:', error);
    }
  }

  async getCachedImage(path: string): Promise<Blob | null> {
    try {
      if (!this.db) await this.init();
      const entry = await this.db!.get('image-cache', path);
      if (entry) {
        this.db!.put('image-cache', { ...entry, lastAccessed: Date.now() }).catch(() => {});
        return entry.blob;
      }
      return null;
    } catch {
      return null;
    }
  }

  async clearImageCache(): Promise<void> {
    try {
      if (!this.db) await this.init();
      await this.db!.clear('image-cache');
    } catch (error) {
      console.warn('IndexedDB: Failed to clear image cache:', error);
    }
  }
}

export const db = new IndexedDBStorage();

