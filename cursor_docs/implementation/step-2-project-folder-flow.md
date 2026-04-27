# Step 2: PWA Project Folder Flow

> **Estimate:** 2 days
> **Prerequisites:** Step 1 (parser/serializer)
> **Depends on:** `server/parser/` (for `parseProjectFolder`, `serializeProject`, `parsedToProjectState`, `projectStateToMarkdown`)
> **Blocks:** Step 4 (PWA sync client needs the project handle)

## Goal

Replace the current "auto-load single project from IndexedDB" startup with a **project-folder-first flow**:

1. App opens -> check for saved directory handle -> re-request permission -> load, OR
2. Show a **Landing Screen** with "Create Project" / "Open Project"
3. PWA reads/writes markdown files and assets directly via the **File System Access API**
4. Fallback: browsers without File System Access API (Firefox, Safari) keep current IndexedDB-only mode

This makes the PWA fully functional in **standalone mode** (no companion server) while still reading/writing the same markdown format the agent and companion will use.

## Test Cases (write FIRST)

### File System Access wrapper

```typescript
// test: openProjectFolder() returns a directory handle with project.md inside
// test: openProjectFolder() rejects if directory has no project.md (not a valid project)
// test: createProjectFolder() scaffolds project.md, assets/ directory
// test: createProjectFolder() writes valid frontmatter with generated id, default fps, aspect_ratio
// test: readProjectFiles() returns Map<filename, content> for project.md + all scene-*.md files
// test: writeProjectFile(handle, "scene-001.md", content) writes and is readable back identically
// test: readAsset(handle, "assets/img.png") returns a File/Blob
// test: writeAsset(handle, "assets/img.png", blob) writes and is readable back
// test: hasPermission(handle) returns true after granting, false after revoking
// test: requestPermission(handle) prompts user and returns result
```

### Project loader

```typescript
// test: loadProject(handle) parses all files -> returns valid ProjectState
// test: loadProject(handle) with empty project (no scenes) -> valid state with empty arrays
// test: loadProject(handle) with 5 scenes -> state.scenes has 5 entries in filename order
// test: loadProject(handle) resolves frame paths to asset handles
// test: saveProject(handle, state) writes markdown files that round-trip
// test: saveScene(handle, sceneState) writes only the changed scene file
// test: saveProject generates new scene files for new scenes (not yet on disk)
// test: saveProject removes scene files for deleted scenes
```

### Landing screen

```typescript
// test: renders "Create Project" and "Open Project" buttons
// test: "Create Project" calls showDirectoryPicker, scaffolds, loads project
// test: "Open Project" calls showDirectoryPicker, validates project.md, loads project
// test: shows error message if opened folder has no project.md
// test: shows fallback UI when File System Access API is unavailable
// test: recent projects list shows saved handles from IndexedDB
// test: clicking a recent project re-requests permission and loads
```

### Store integration

```typescript
// test: store.openProject(handle) sets projectHandle, loads state, pushes history
// test: store.closeProject() clears state, clears projectHandle, shows landing screen
// test: store.saveToFolder() writes current state to disk via File System Access API
// test: after any mutation, auto-save debounces and writes changed files to disk
```

## Types to Define

### File System Access Wrapper

```typescript
interface ProjectFolderHandle {
  directoryHandle: FileSystemDirectoryHandle;
  projectFilePath: string;  // always "project.md"
}

interface FSACapabilities {
  supported: boolean;          // File System Access API available?
  persistentPermissions: boolean;  // can store handle in IndexedDB?
}

function detectFSACapabilities(): FSACapabilities;
function openProjectFolder(): Promise<ProjectFolderHandle>;
function createProjectFolder(title: string): Promise<ProjectFolderHandle>;
function readProjectFiles(handle: ProjectFolderHandle): Promise<Map<string, string>>;
function writeProjectFile(handle: ProjectFolderHandle, filename: string, content: string): Promise<void>;
function readAsset(handle: ProjectFolderHandle, relativePath: string): Promise<Blob>;
function writeAsset(handle: ProjectFolderHandle, relativePath: string, blob: Blob): Promise<void>;
function deleteProjectFile(handle: ProjectFolderHandle, filename: string): Promise<void>;
function hasPermission(handle: FileSystemDirectoryHandle): Promise<boolean>;
function requestPermission(handle: FileSystemDirectoryHandle): Promise<boolean>;
```

### Store Additions

```typescript
// Additions to the existing Store interface in useStore.ts
interface StoreAdditions {
  projectHandle: ProjectFolderHandle | null;
  isStandaloneMode: boolean;  // true when using FSA without companion
  projectSource: 'none' | 'fsa' | 'indexeddb' | 'companion';

  openProject: (handle: ProjectFolderHandle) => Promise<void>;
  closeProject: () => void;
  createNewProject: (handle: ProjectFolderHandle, title: string) => Promise<void>;
  saveToFolder: () => Promise<void>;
}
```

### Landing Screen Props

```typescript
interface RecentProject {
  title: string;
  directoryHandle: FileSystemDirectoryHandle;
  lastOpened: number;  // timestamp
}

interface LandingScreenProps {
  onProjectLoaded: () => void;
  recentProjects: RecentProject[];
}
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/LandingScreen.tsx` | Create/Open project UI, recent projects list |
| `src/sync/fileSystemAccess.ts` | File System Access API wrapper (open, create, read, write, permissions) |
| `src/sync/projectLoader.ts` | Load project folder -> ProjectState; save ProjectState -> folder |
| `src/sync/fileSystemAccess.test.ts` | Tests for FSA wrapper (will need mocks for FileSystemDirectoryHandle) |
| `src/sync/projectLoader.test.ts` | Tests for project loader |

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Replace auto-load with: check handle -> request permission -> load OR show LandingScreen |
| `src/store/useStore.ts` | Add `projectHandle`, `projectSource`, `openProject()`, `closeProject()`, `createNewProject()`, `saveToFolder()`. Modify `save()` to write to FSA handle when in standalone mode. |
| `src/db/indexeddb.ts` | Add `saveDirectoryHandle(handle)` and `loadDirectoryHandle()` for session persistence. Add `saveRecentProjects(list)` and `loadRecentProjects()`. |
| `src/components/TopBar.tsx` | Add "Close Project" menu item. Show project source indicator ("Local Folder" vs "IndexedDB"). |

## Implementation Sequence

### 2.1 File System Access Wrapper (`src/sync/fileSystemAccess.ts`)

1. Implement `detectFSACapabilities()` -- check `window.showDirectoryPicker` exists
2. Implement `openProjectFolder()`:
   - Call `showDirectoryPicker({ mode: 'readwrite' })`
   - Verify `project.md` exists in the directory
   - Return `ProjectFolderHandle`
3. Implement `createProjectFolder(title)`:
   - Call `showDirectoryPicker({ mode: 'readwrite' })`
   - Create `project.md` with default frontmatter
   - Create `assets/` subdirectory
   - Return `ProjectFolderHandle`
4. Implement read/write helpers:
   - `readProjectFiles()` -- iterate directory entries, read `*.md` files, return Map
   - `writeProjectFile()` -- create writable, write content, close
   - `readAsset()` / `writeAsset()` -- same pattern for binary files
   - `deleteProjectFile()` -- remove entry from directory
5. Implement permission helpers:
   - `hasPermission()` -- `handle.queryPermission({ mode: 'readwrite' })`
   - `requestPermission()` -- `handle.requestPermission({ mode: 'readwrite' })`

### 2.2 Project Loader (`src/sync/projectLoader.ts`)

1. Import parser from step 1: `parseProjectFolder`, `parsedToProjectState`
2. Implement `loadProject(handle)`:
   - `readProjectFiles(handle)` -> `Map<string, string>`
   - `parseProjectFolder(files)` -> `ParseResult`
   - `parsedToProjectState(result)` -> `ProjectState`
   - Return `ProjectState` (and `ParseResult` for source positions)
3. Implement `saveProject(handle, state, previousParseResult?)`:
   - `projectStateToMarkdown(state)` -> `Map<string, string>`
   - Diff against current files on disk
   - Write only changed files
   - Delete scene files that no longer exist
   - Create new scene files for new scenes
4. Implement `saveScene(handle, sceneId, state)`:
   - Write only the single scene file (for incremental saves)

### 2.3 IndexedDB Additions (`src/db/indexeddb.ts`)

1. Add object store for directory handles (IndexedDB can store `FileSystemDirectoryHandle`)
2. `saveDirectoryHandle(handle, projectTitle)` -- store handle + metadata
3. `loadDirectoryHandle()` -- retrieve last-used handle
4. `saveRecentProjects(list)` / `loadRecentProjects()` -- for landing screen

### 2.4 Landing Screen (`src/components/LandingScreen.tsx`)

1. Full-screen component shown when no project is loaded
2. Layout:
   - App logo / title centered
   - Two primary buttons: "Create New Project" / "Open Existing Project"
   - Below: "Recent Projects" list (if any handles stored)
   - Below: fallback message if FSA not supported ("Your browser doesn't support direct folder access. The app will use internal storage.")
3. "Create New Project":
   - Show a title input dialog
   - Call `createProjectFolder(title)`
   - Call `store.createNewProject(handle, title)`
   - Navigate to main app
4. "Open Existing Project":
   - Call `openProjectFolder()`
   - If valid, call `store.openProject(handle)`
   - If invalid (no project.md), show error toast
   - Navigate to main app
5. "Recent Projects":
   - List of `{title, handle, lastOpened}` from IndexedDB
   - Click -> `requestPermission(handle)` -> if granted, load -> main app
   - If permission denied (handle expired), remove from list, show message

### 2.5 App.tsx Startup Flow

Replace current `init()` flow:

```typescript
// Current flow:
// App mounts -> store.init() -> db.loadProjectState() -> render main app

// New flow:
// App mounts
// -> check FSA support
// -> if supported:
//    -> loadDirectoryHandle() from IndexedDB
//    -> if handle found:
//       -> requestPermission(handle)
//       -> if granted: loadProject(handle) -> render main app
//       -> if denied: show LandingScreen
//    -> if no handle: show LandingScreen
// -> if FSA not supported:
//    -> db.loadProjectState() (current behavior)
//    -> render main app (IndexedDB-only mode)
```

State management:

```typescript
// New state in App.tsx or store
const [appState, setAppState] = useState<'loading' | 'landing' | 'project'>('loading');
```

### 2.6 Store Modifications (`src/store/useStore.ts`)

1. Add new state fields: `projectHandle`, `projectSource`, `isStandaloneMode`
2. Add `openProject(handle)`:
   - Set `projectHandle`
   - Call `loadProject(handle)` -> get `ProjectState`
   - Call `loadProjectState(state)` (existing method)
   - Set `projectSource: 'fsa'`
   - Save handle to IndexedDB
3. Add `closeProject()`:
   - Auto-save current state to folder
   - Clear all state back to defaults
   - Clear `projectHandle`
   - Set `projectSource: 'none'`
4. Add `createNewProject(handle, title)`:
   - Scaffold files via `createProjectFolder`
   - Load the scaffolded project
5. Modify `save()`:
   - If `projectSource === 'fsa'`: write to folder via `saveProject(handle, state)`
   - If `projectSource === 'indexeddb'`: current behavior
   - If `projectSource === 'companion'`: send via WebSocket (step 4)
   - Always cache in IndexedDB as backup
6. Add auto-save debounce on every mutation:
   - After `pushHistory()`, schedule `save()` with 1s debounce

### 2.7 TopBar Modifications (`src/components/TopBar.tsx`)

1. Add project source indicator (small badge): "Local Folder" / "Internal Storage"
2. Add "Close Project" to the menu (only when `projectSource !== 'none'`)
3. Add "Open Project..." to the menu (always available)

## Key Decisions

- **Auto-save, not manual save:** Every mutation triggers a debounced write to the project folder. No "Save" button -- changes are always persisted.
- **Incremental saves:** Only write files that changed, not the entire project. Track which scenes were modified since last save.
- **FSA handle persistence:** IndexedDB can store `FileSystemDirectoryHandle` objects. On re-open, re-request permission. Chrome may auto-grant after first use.
- **Graceful degradation:** Firefox/Safari users get the current IndexedDB-only experience. No feature is gated -- just the storage backend differs.
- **Parser imported as ESM:** The parser (step 1) is written as pure TypeScript with no Node.js APIs. It can be imported directly into the PWA bundle.

## Done Criteria

- [ ] Landing screen renders with Create/Open buttons
- [ ] "Create Project" scaffolds a valid project folder with `project.md` and `assets/`
- [ ] "Open Project" loads a markdown project folder into the app
- [ ] Edits in the app are auto-saved back to the folder within 1 second
- [ ] Adding a frame saves the image file to `assets/`
- [ ] Closing and re-opening the app remembers the last project folder
- [ ] Recent projects list works (persisted in IndexedDB)
- [ ] Firefox/Safari fall back to IndexedDB-only mode gracefully
- [ ] "Close Project" returns to landing screen
- [ ] All tests pass

## Cross-References

- **Step 1** provides the parser (`parseProjectFolder`, `parsedToProjectState`, `projectStateToMarkdown`)
- **Step 3** companion server watches the same folder the PWA writes to
- **Step 4** adds WebSocket sync; this step only handles standalone FSA mode
- **Step 5** MCP tools operate on the same folder structure
