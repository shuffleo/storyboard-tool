# Step 3: Companion Server

> **Estimate:** 2-3 days
> **Prerequisites:** Step 1 (parser/serializer)
> **Depends on:** `server/parser/` for parsing and serialization
> **Blocks:** Step 4 (PWA sync client), Step 5 (MCP server)

## Goal

Build a **Node.js companion server** that runs locally alongside the user's IDE. It:

1. **Watches** the project folder for file changes (markdown + assets)
2. **Parses** changed files into `ProjectState` and maintains an in-memory cache
3. **Computes diffs** between old and new state on every change
4. **Pushes diffs** to connected PWA clients via WebSocket
5. **Receives mutations** from the PWA via WebSocket and writes them back to markdown files
6. **Serves assets** over HTTP so the PWA can load images/audio/video

The companion is the **bridge** between file-based editing (agent, text editor) and the live PWA.

## Test Cases (write FIRST)

### File watcher

```typescript
// test: watcher emits 'change' when scene-001.md is modified
// test: watcher emits 'add' when scene-004.md is created
// test: watcher emits 'unlink' when scene-002.md is deleted
// test: watcher emits 'change' for project.md when modified
// test: watcher ignores non-markdown files in root (e.g. README.md, .gitignore)
// test: watcher detects new files in assets/ directory
// test: watcher debounces rapid changes (3 saves within 100ms -> 1 event)
// test: watcher ignores changes from own writes (self-write flag)
```

### State manager

```typescript
// test: loadFromDisk(path) reads all files, parses, returns ProjectState
// test: applyFileChange("scene-001.md", newContent) updates state and returns diff
// test: diff for changing a shot title -> { type: 'update', entity: 'shot', id, changes: { scriptText } }
// test: diff for adding a new shot -> { type: 'create', entity: 'shot', ... }
// test: diff for deleting a scene file -> { type: 'delete', entity: 'scene', id } + shot deletions
// test: diff for adding a new scene file -> { type: 'create', entity: 'scene', ... }
// test: diff for project.md change -> { type: 'update', entity: 'project', changes: { title } }
// test: applyMutation(mutation) writes correct markdown file and updates cache
// test: applyMutation for new scene creates new scene-XXX.md file
// test: applyMutation for delete scene removes scene file from disk
// test: concurrent file changes (two files saved simultaneously) produce correct merged state
// test: state after round-trip: file change -> parse -> serialize -> matches original
```

### WebSocket server

```typescript
// test: client connects -> receives full ProjectState as initial sync
// test: file changes -> connected client receives diff message
// test: client sends mutation -> state is updated and new markdown written
// test: client sends mutation -> other connected clients receive the diff
// test: client disconnects -> no errors, server continues
// test: multiple clients connected -> all receive diffs
// test: server sends ping, client responds pong (keepalive)
// test: reconnecting client gets full state sync
```

### Asset server

```typescript
// test: GET /assets/sc001-sh010-f01.png returns the file with correct Content-Type
// test: GET /assets/nonexistent.png returns 404
// test: GET /assets/../../../etc/passwd returns 403 (path traversal protection)
// test: serves correct MIME types for .png, .jpg, .webp, .mp4, .webm, .mp3, .wav
// test: supports Range requests for video/audio files
// test: CORS headers allow requests from any origin (PWA on GitHub Pages)
```

### Diff engine

```typescript
// test: diffProjectState(old, new) with no changes -> empty diff
// test: diffProjectState(old, new) with one shot title changed -> single update op
// test: diffProjectState(old, new) with shot added -> single create op
// test: diffProjectState(old, new) with shot removed -> single delete op
// test: diffProjectState(old, new) with scene reordered -> reorder op
// test: diffProjectState(old, new) with multiple changes -> all ops in correct order
// test: applyDiff(state, diff) produces the new state
// test: round-trip: diffProjectState(a, b) -> applyDiff(a, diff) -> equals b
```

## Types to Define

### WebSocket Protocol (`server/protocol.ts`)

```typescript
type WsMessageType =
  | 'sync:full'        // server -> client: full ProjectState on connect
  | 'sync:diff'        // server -> client: incremental state diff
  | 'mutation:apply'   // client -> server: apply a mutation
  | 'mutation:ack'     // server -> client: mutation applied successfully
  | 'mutation:error'   // server -> client: mutation failed
  | 'ping'             // bidirectional keepalive
  | 'pong';

interface WsMessage {
  type: WsMessageType;
  id: string;          // unique message id for ack correlation
  payload: unknown;
}

interface SyncFullPayload {
  state: ProjectState;
  version: number;     // monotonic state version counter
}

interface SyncDiffPayload {
  version: number;
  previousVersion: number;
  ops: DiffOp[];
}

interface DiffOp {
  type: 'create' | 'update' | 'delete' | 'reorder';
  entity: 'project' | 'scene' | 'shot' | 'frame';
  id?: string;
  parentId?: string;   // sceneId for shots, shotId for frames
  data?: Record<string, unknown>;
  orderedIds?: string[];
}

interface MutationApplyPayload {
  ops: DiffOp[];
  clientVersion: number;  // client's current version (for conflict detection)
}

interface MutationAckPayload {
  appliedOps: number;
  newVersion: number;
}

interface MutationErrorPayload {
  message: string;
  code: 'CONFLICT' | 'INVALID' | 'IO_ERROR';
}
```

### State Manager

```typescript
interface StateManager {
  getState(): ProjectState;
  getVersion(): number;
  getParseResult(): ParseResult;  // for source positions

  loadFromDisk(projectPath: string): Promise<void>;
  applyFileChange(filename: string, content: string): DiffOp[];
  applyFileDelete(filename: string): DiffOp[];
  applyFileAdd(filename: string, content: string): DiffOp[];
  applyMutation(ops: DiffOp[]): Promise<void>;  // writes to disk
}
```

### Server Config

```typescript
interface CompanionConfig {
  projectPath: string;      // absolute path to project folder
  wsPort: number;           // default 9800
  assetPort: number;        // default 9801
  debounceMs: number;       // file watcher debounce, default 300
}
```

## Files to Create

| File | Purpose |
|------|---------|
| `server/index.ts` | Main entry point: parse CLI args, start all servers |
| `server/config.ts` | Config parsing, defaults, CLI arg handling |
| `server/fileWatcher.ts` | chokidar-based file watcher with debounce and self-write exclusion |
| `server/stateManager.ts` | In-memory ProjectState cache, file change handler, mutation applier |
| `server/diffEngine.ts` | `diffProjectState(old, new)` and `applyDiff(state, diff)` |
| `server/wsServer.ts` | WebSocket server: client management, message routing, keepalive |
| `server/assetServer.ts` | HTTP server for serving assets with CORS, MIME types, path traversal protection |
| `server/protocol.ts` | Shared WebSocket message types (also imported by PWA in step 4) |
| `server/package.json` | Dependencies and scripts |
| `server/tsconfig.json` | TypeScript config for Node target |
| `server/fileWatcher.test.ts` | File watcher tests |
| `server/stateManager.test.ts` | State manager + diff engine tests |
| `server/wsServer.test.ts` | WebSocket server tests |
| `server/assetServer.test.ts` | Asset server tests |

## Dependencies

```json
{
  "chokidar": "^4.x",
  "ws": "^8.x",
  "mime-types": "^2.x",
  "nanoid": "^5.x",
  "vitest": "^2.x",
  "typescript": "^5.x",
  "tsx": "^4.x"
}
```

Also depends on the parser packages from step 1 (unified, remark-parse, etc.) via workspace reference or shared `node_modules`.

## Implementation Sequence

### 3.1 Protocol Types (`server/protocol.ts`)

Define all WebSocket message types, `DiffOp`, payloads. This is shared between server (this step) and client (step 4). Keep it dependency-free so it can be imported by the PWA.

### 3.2 Diff Engine (`server/diffEngine.ts`)

1. `diffProjectState(oldState, newState): DiffOp[]`
   - Compare `project` fields -> produce update ops for changed fields
   - Compare `scenes` arrays -> detect create/delete/update/reorder by id
   - Compare `shots` arrays -> detect create/delete/update/reorder by id, grouped by sceneId
   - Compare `frames` arrays -> detect create/delete/update/reorder by id, grouped by shotId
   - Return minimal list of ops
2. `applyDiff(state, ops): ProjectState`
   - Apply each op sequentially to produce new state
   - Used by the PWA to apply incoming diffs without full state replacement

Write tests for diffEngine first -- it's pure logic, easy to test in isolation.

### 3.3 State Manager (`server/stateManager.ts`)

1. `loadFromDisk(projectPath)`:
   - Read all `.md` files from the project directory
   - Parse with `parseProjectFolder()` from step 1
   - Convert to `ProjectState` with `parsedToProjectState()`
   - Store both `ParseResult` (for source positions) and `ProjectState` (for diffing)
   - Initialize version counter to 0
2. `applyFileChange(filename, content)`:
   - Re-parse the single changed file
   - Replace in current ParseResult
   - Rebuild ProjectState
   - Diff against previous state -> return DiffOps
   - Increment version
3. `applyFileDelete(filename)`:
   - Remove from ParseResult
   - Rebuild ProjectState
   - Diff -> return DiffOps (scene + shot + frame deletions)
4. `applyFileAdd(filename, content)`:
   - Parse new file
   - Add to ParseResult
   - Rebuild ProjectState
   - Diff -> return DiffOps (scene + shot + frame creations)
5. `applyMutation(ops)`:
   - Apply ops to current ProjectState
   - Serialize affected scenes back to markdown via `projectStateToMarkdown()`
   - Write changed files to disk (with self-write flag to avoid watcher loop)
   - Update ParseResult by re-parsing the written files (for fresh source positions)
   - Increment version

### 3.4 File Watcher (`server/fileWatcher.ts`)

1. Use `chokidar` to watch the project folder:
   - Watch `*.md` files in root
   - Watch `assets/**` for asset changes
   - Ignore `node_modules`, `.git`, etc.
2. Debounce events by 300ms (configurable):
   - Buffer rapid changes, emit single event after settle
3. Self-write exclusion:
   - Before writing a file (from `applyMutation`), set a `selfWritePaths` Set
   - When watcher fires, check if path is in `selfWritePaths` -> skip if so
   - Clear from Set after 500ms (safety timeout)
4. On file change: call `stateManager.applyFileChange()`, get DiffOps, broadcast to WebSocket clients
5. On file add: call `stateManager.applyFileAdd()`, broadcast
6. On file delete: call `stateManager.applyFileDelete()`, broadcast

### 3.5 WebSocket Server (`server/wsServer.ts`)

1. Create `ws.WebSocketServer` on configured port (default 9800)
2. On client connect:
   - Send `sync:full` with current `ProjectState` and version
   - Add client to active clients Set
3. On client message:
   - Parse as `WsMessage`
   - If `mutation:apply`: validate ops, call `stateManager.applyMutation(ops)`, send `mutation:ack` to sender, broadcast `sync:diff` to other clients
   - If `pong`: update client's last-seen timestamp
4. On client disconnect:
   - Remove from active clients Set
5. Keepalive:
   - Send `ping` every 30s
   - If no `pong` within 10s, terminate connection
6. Broadcast helper:
   - `broadcast(message, excludeClient?)` -- send to all connected clients except sender

### 3.6 Asset Server (`server/assetServer.ts`)

1. HTTP server on configured port (default 9801)
2. Serve files from `{projectPath}/assets/` directory
3. Security:
   - Resolve requested path against assets directory
   - Reject if resolved path escapes assets directory (path traversal protection)
4. CORS headers on all responses:
   - `Access-Control-Allow-Origin: *`
   - `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`
5. MIME type detection via `mime-types` package
6. Support `Range` header for video/audio (partial content / seeking)
7. Cache headers: `Cache-Control: no-cache` (asset content may change frequently during editing)

### 3.7 Main Entry Point (`server/index.ts`)

1. Parse CLI args: `--project <path>` (required), `--ws-port`, `--asset-port`
2. Validate project path exists and contains `project.md`
3. Initialize `stateManager.loadFromDisk(projectPath)`
4. Start file watcher
5. Start WebSocket server
6. Start asset server
7. Wire them together:
   - File watcher events -> state manager -> WebSocket broadcast
   - WebSocket mutations -> state manager -> file writes
8. Log startup info: project path, WebSocket URL, asset URL

### 3.8 Package Setup (`server/package.json`, `server/tsconfig.json`)

`package.json`:
```json
{
  "name": "storyboard-companion",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "tsx server/index.ts",
    "dev": "tsx watch server/index.ts",
    "test": "vitest run server/"
  }
}
```

Note: this may live at the repo root `package.json` as additional scripts rather than a separate `server/package.json`, depending on workspace setup. Decision: use repo root `package.json` with scripts prefixed `server:*` to avoid multiple `node_modules`. The `server/` directory has its own `tsconfig.json` for Node target settings.

`server/tsconfig.json`:
```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "../dist/server",
    "types": ["node"]
  },
  "include": ["**/*.ts"],
  "exclude": ["**/*.test.ts"]
}
```

## Key Decisions

- **Single process:** File watcher, WebSocket server, and asset HTTP server all run in one Node process. Simpler than microservices, easy to start/stop.
- **Version counter:** Monotonically increasing integer on every state change. Enables conflict detection (client sends `clientVersion`, server rejects if stale).
- **Last-write-wins per entity:** If a conflict is detected (client version < server version), the mutation is still applied but a warning is logged. This is simpler than OT/CRDT and acceptable for single-user workflows.
- **Self-write exclusion via Set:** When the server writes a file (from a PWA mutation), it temporarily adds the path to a Set. If the watcher fires for that path, the event is skipped. This prevents echo loops.
- **Debounce 300ms:** File watchers fire multiple events for a single save (write + rename on some platforms). 300ms debounce catches these without noticeable lag.
- **Asset server separate port:** Keeps WebSocket and HTTP traffic isolated. The PWA connects to WS on port 9800, fetches assets from HTTP on port 9801.
- **No authentication:** This is a local-only server. It listens on `127.0.0.1`, not `0.0.0.0`. No auth needed.

## Done Criteria

- [ ] `npm run server:start -- --project /path/to/project` starts the companion
- [ ] File changes in the project folder are detected and parsed within 500ms
- [ ] WebSocket client connecting to `ws://localhost:9800` receives full state
- [ ] File changes produce correct diffs broadcast to connected clients
- [ ] Client mutations are written back to markdown files correctly
- [ ] Asset server serves files with correct MIME types and CORS headers
- [ ] Path traversal attacks are rejected
- [ ] Self-write exclusion prevents echo loops
- [ ] All tests pass
- [ ] Server survives: client disconnect, malformed message, file permission error

## Cross-References

- **Step 1** provides the parser (`parseProjectFolder`, `serializeProject`, `parsedToProjectState`, `projectStateToMarkdown`)
- **Step 2** writes to the same folder the companion watches; in standalone mode (no companion), the PWA writes directly
- **Step 4** implements the WebSocket client that connects to this server
- **Step 5** builds the MCP server as an additional layer on top of this companion
- **Step 7** E2E tests verify the full pipeline: file edit -> watcher -> parse -> diff -> WebSocket -> PWA
