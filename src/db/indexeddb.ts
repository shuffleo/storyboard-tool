import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ProjectState, ProjectSnapshot } from '../types';

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
}

const DB_NAME = 'storyboard-db';
const DB_VERSION = 1;
const PROJECT_KEY = 'current-project';

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
}

export const db = new IndexedDBStorage();

