# Step 4: PWA WebSocket Sync Client

> **Estimate:** 1-2 days
> **Prerequisites:** Step 2 (project folder flow), Step 3 (companion server)
> **Depends on:** `server/protocol.ts` (shared message types), `server/diffEngine.ts` (`applyDiff`), `src/sync/fileSystemAccess.ts`, `src/store/useStore.ts`
> **Blocks:** Step 5 (MCP tools trigger sync events)

## Goal

Add a **WebSocket client** to the PWA that connects to the companion server for live sync. This enables the second operating mode: **PWA + companion**.

When the companion is running:
1. PWA connects to `ws://localhost:PORT` on startup (after loading the project)
2. Receives full state sync on connect
3. Receives incremental diffs when files change on disk (agent or editor edits)
4. Sends mutations back to the companion when the user edits in the PWA
5. Reconnects automatically on disconnect

When the companion is NOT running:
1. PWA works in standalone mode (step 2: direct FSA read/write)
2. No errors, no degradation -- just no live external sync
3. Periodically retries connection in the background

## Test Cases (write FIRST)

### WebSocket client connection

```typescript
// test: connect() establishes WebSocket to ws://localhost:9800
// test: on connect, receives sync:full message and applies state to store
// test: on disconnect, status changes to 'disconnected', retry timer starts
// test: auto-reconnect after 2s on disconnect (exponential backoff: 2s, 4s, 8s, max 30s)
// test: connect() to unavailable server -> status 'disconnected', no error thrown
// test: explicit disconnect() stops reconnect timer
// test: isConnected() returns true only when WebSocket is open
```

### Receiving diffs from companion

```typescript
// test: sync:diff message with shot update -> store.shots updated, UI re-renders
// test: sync:diff message with scene create -> store.scenes gains new entry
// test: sync:diff message with shot delete -> store.shots loses entry
// test: sync:diff message with frame add -> store.frames gains new entry
// test: sync:diff message with project update -> store.project fields updated
// test: sync:diff with multiple ops -> all applied atomically
// test: sync:diff with version gap (missed messages) -> request full sync
// test: incoming diff does NOT trigger save-to-folder (companion already has the change)
```

### Sending mutations to companion

```typescript
// test: store mutation (updateShot) -> sends mutation:apply to companion
// test: mutation:ack received -> no additional action
// test: mutation:error received -> revert change in store, show error toast
// test: mutation sent while disconnected -> queued, sent on reconnect
// test: multiple rapid mutations -> batched into single message (100ms debounce)
// test: mutation does NOT trigger save-to-folder (companion writes the file)
```

### Asset resolution

```typescript
// test: resolveAssetUrl("assets/img.png") with companion -> "http://localhost:9801/assets/img.png"
// test: resolveAssetUrl("assets/img.png") without companion -> FSA blob URL from directory handle
// test: resolveAssetUrl("assets/img.png") without companion or FSA -> IndexedDB cached blob URL
// test: asset URL falls back gracefully through the chain
```

### Mode transitions

```typescript
// test: start in standalone mode -> companion starts -> PWA detects and switches to sync mode
// test: in sync mode -> companion stops -> PWA switches to standalone, keeps working
// test: in sync mode -> PWA mutations go through WebSocket, not direct file write
// test: in standalone mode -> PWA mutations go through FSA direct write
// test: transition from sync -> standalone preserves current state (no data loss)
```

## Types to Define

### WebSocket Client

```typescript
type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing';

interface SyncClient {
  status: SyncStatus;
  version: number;           // last received version from companion
  companionUrl: string;      // e.g. "ws://localhost:9800"
  assetBaseUrl: string;      // e.g. "http://localhost:9801"

  connect(): void;
  disconnect(): void;
  sendMutation(ops: DiffOp[]): void;
  onDiff(callback: (ops: DiffOp[]) => void): void;
  onStatusChange(callback: (status: SyncStatus) => void): void;
}

interface SyncConfig {
  wsPort: number;              // default 9800
  assetPort: number;           // default 9801
  reconnectBaseMs: number;     // default 2000
  reconnectMaxMs: number;      // default 30000
  mutationBatchMs: number;     // default 100
}
```

### Store Additions (beyond step 2)

```typescript
interface StoreSyncAdditions {
  syncClient: SyncClient | null;
  syncStatus: SyncStatus;
  pendingMutations: DiffOp[][];  // queued mutations when disconnected

  initSync(config?: Partial<SyncConfig>): void;
  teardownSync(): void;
  handleExternalDiff(ops: DiffOp[]): void;  // apply diff without triggering save
}
```

### Asset Resolver

```typescript
type AssetSource = 'companion' | 'fsa' | 'indexeddb' | 'none';

interface AssetResolver {
  resolveUrl(relativePath: string): Promise<string>;
  getSource(): AssetSource;
  prefetchAssets(paths: string[]): Promise<void>;
  revokeUrl(url: string): void;  // revoke blob URLs to prevent memory leaks
}
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/sync/wsClient.ts` | WebSocket client: connect, reconnect, send/receive messages, keepalive |
| `src/sync/assetResolver.ts` | Resolve asset relative paths to usable URLs based on current mode |
| `src/sync/wsClient.test.ts` | WebSocket client tests (using mock WebSocket) |
| `src/sync/assetResolver.test.ts` | Asset resolver tests |

## Files to Modify

| File | Change |
|------|--------|
| `src/store/useStore.ts` | Add `syncClient`, `syncStatus`, `pendingMutations`, `initSync()`, `teardownSync()`, `handleExternalDiff()`. Modify mutation actions to route through WebSocket when connected. |
| `src/App.tsx` | After project loads, call `store.initSync()` to attempt companion connection. Show sync status indicator. |
| `src/components/TopBar.tsx` | Show connection status badge: green dot (connected), yellow (connecting), grey (standalone). |
| `src/db/indexeddb.ts` | Cache assets fetched from companion for offline use. |

## Implementation Sequence

### 4.1 WebSocket Client (`src/sync/wsClient.ts`)

1. **Constructor:** accept `SyncConfig`, create internal state
2. **`connect()`:**
   - Create `new WebSocket(`ws://localhost:${config.wsPort}`)`
   - On `open`: set status `connected`, send any pending mutations
   - On `message`: parse `WsMessage`, route by type
   - On `close`: set status `disconnected`, start reconnect timer
   - On `error`: log, let `close` handler deal with reconnect
3. **Message handling:**
   - `sync:full`: replace entire store state, set version
   - `sync:diff`: validate version continuity (previousVersion === our version), apply diff ops, update version. If version gap, request full sync.
   - `mutation:ack`: resolve pending mutation promise
   - `mutation:error`: reject pending mutation promise, emit error event
   - `ping`: respond with `pong`
4. **`sendMutation(ops)`:**
   - If connected: send `mutation:apply` with ops and current clientVersion
   - If disconnected: queue in `pendingMutations`
5. **Reconnect logic:**
   - Start with `reconnectBaseMs` (2s)
   - Double on each failure, cap at `reconnectMaxMs` (30s)
   - Reset delay on successful connect
   - Stop retrying on explicit `disconnect()`
6. **Mutation batching:**
   - Buffer outgoing mutations for `mutationBatchMs` (100ms)
   - Merge multiple ops into a single `mutation:apply` message
   - This prevents flooding the companion with per-keystroke mutations

### 4.2 Asset Resolver (`src/sync/assetResolver.ts`)

1. **Priority chain:** companion HTTP > FSA directory handle > IndexedDB cache
2. **`resolveUrl(relativePath)`:**
   ```
   if companion connected:
     return `${assetBaseUrl}/${relativePath}`
   else if FSA handle available:
     file = await readAsset(projectHandle, relativePath)
     blobUrl = URL.createObjectURL(file)
     track blobUrl for later revocation
     return blobUrl
   else if asset cached in IndexedDB:
     return cached blob URL
   else:
     return placeholder image URL
   ```
3. **`prefetchAssets(paths)`:** preload assets for upcoming shots (animatics playback)
4. **`revokeUrl(url)`:** call `URL.revokeObjectURL()` for blob URLs to prevent memory leaks
5. **Companion asset caching:** when loading an asset from companion HTTP, also cache it in IndexedDB for offline use

### 4.3 Store Modifications (`src/store/useStore.ts`)

This is the trickiest part -- mutation routing. The store needs to know WHERE to persist changes based on the current mode.

**Mutation flow diagram:**

```
User edits in PWA
  -> store.updateShot(id, changes)
  -> pushHistory()
  -> persistMutation():
       if syncClient connected:
         syncClient.sendMutation([{type:'update', entity:'shot', id, data: changes}])
         // companion writes file, companion broadcasts diff to other clients
         // do NOT call saveToFolder() -- companion handles file writes
       else if projectSource === 'fsa':
         saveToFolder()  // direct write via File System Access (step 2)
       else:
         save()  // IndexedDB only (original behavior)
```

**External diff handling:**

```
syncClient receives sync:diff
  -> store.handleExternalDiff(ops)
  -> applyDiff(currentState, ops) -> newState
  -> set(newState) WITHOUT pushing history (it's external)
  -> do NOT trigger persistMutation (change came from companion)
```

Key implementation details:

1. Add `_isExternalUpdate` flag to prevent mutation -> save -> watcher -> diff echo loops
2. `handleExternalDiff()` applies changes directly to state without creating undo history entries (external changes are not undoable by the user)
3. On reconnect with `sync:full`, replace the entire store state and clear undo history (full reset)

### 4.4 App.tsx Sync Initialization

After project loads (whether from FSA, IndexedDB, or companion):

```typescript
useEffect(() => {
  if (store.projectSource !== 'none') {
    store.initSync();  // try connecting to companion
  }
  return () => store.teardownSync();
}, [store.projectSource]);
```

`initSync()`:
1. Create `SyncClient` with default config
2. Connect (non-blocking; fails silently if companion not running)
3. On connect: set `projectSource` to `'companion'`
4. On disconnect: revert `projectSource` to `'fsa'` or `'indexeddb'`

### 4.5 TopBar Status Indicator

Add a small colored dot in the TopBar:

- **Green + "Live"**: connected to companion, real-time sync active
- **Yellow + "Connecting..."**: WebSocket connecting or reconnecting
- **Grey + "Local"**: standalone mode (no companion)

Clicking the indicator could show a popover with:
- Companion URL
- Last sync time
- Version number
- "Disconnect" / "Reconnect" button

## Key Decisions

- **No conflict resolution UI:** Last-write-wins. The companion is the arbiter. If both the user and agent edit the same shot simultaneously, the last write wins. This is acceptable for single-user workflows where the agent is typically told to work on specific areas.
- **External diffs are not undoable:** When the agent changes something and the diff arrives in the PWA, it's applied directly. The user cannot "undo" the agent's change via the PWA. They can, however, edit it manually afterward.
- **Mutation batching at 100ms:** Prevents per-keystroke WebSocket messages while keeping sync near-real-time. User doesn't notice 100ms delay.
- **Full sync on version gap:** If the client misses diffs (e.g., WebSocket briefly dropped and reconnected), it requests a full sync rather than trying to replay missed diffs. Simpler and more reliable.
- **Blob URL memory management:** The asset resolver tracks blob URLs and revokes them when components unmount. This prevents memory leaks from accumulated blob URLs during long sessions.

## Done Criteria

- [ ] PWA connects to companion WebSocket on startup (if companion is running)
- [ ] File changes on disk (agent edits) appear in the PWA within 500ms
- [ ] User edits in the PWA are written back to disk within 500ms (via companion)
- [ ] PWA works fine without companion (standalone mode, no errors)
- [ ] Companion going offline -> PWA switches to standalone gracefully
- [ ] Companion coming online -> PWA reconnects and receives full sync
- [ ] Asset images load from companion HTTP server
- [ ] Connection status indicator shows correct state
- [ ] No echo loops (PWA edit -> companion write -> watcher -> diff -> PWA)
- [ ] All tests pass

## Cross-References

- **Step 2** provides `projectSource`, `projectHandle`, `saveToFolder()` for standalone mode fallback
- **Step 3** provides the companion server this client connects to; `protocol.ts` is shared
- **Step 3** `diffEngine.ts` provides `applyDiff()` used by `handleExternalDiff()`
- **Step 5** MCP tools trigger state changes that flow through the companion to this client
- **Step 7** E2E tests verify the full pipeline including this sync client
