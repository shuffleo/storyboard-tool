# Step 5: MCP Server

> **Estimate:** 2 days
> **Prerequisites:** Step 3 (companion server)
> **Depends on:** `server/stateManager.ts`, `server/protocol.ts`, `server/diffEngine.ts`
> **Blocks:** Step 6 (agent skills reference these tools)

## Goal

Build a **thin MCP server** layer on top of the companion server. The MCP server exposes **8 tools** that the OpenMontage agent can call to inspect and modify the storyboard. It is NOT the primary way the agent works -- the agent can also edit markdown files directly. The MCP tools are for:

1. **Structured reads** (easier than parsing markdown for quick inspections)
2. **Atomic batch writes** (ensures valid markdown output)
3. **Live sync triggers** (companion pushes changes to PWA immediately)
4. **Timeline operations** (computed data the agent can't derive from markdown alone)
5. **Asset management** (binary file operations)

## Test Cases (write FIRST)

### storyboard_read

```typescript
// test: read("all") returns full ProjectState with all entities
// test: read("project") returns only project metadata
// test: read("scenes") returns scenes array with summary info
// test: read("shots") returns all shots grouped by scene
// test: read("frames") returns all frames grouped by shot
// test: read returns correct data after a mutation was applied
```

### storyboard_write

```typescript
// test: write([{action:"create", entity_type:"scene", data:{title:"New Scene"}}]) creates scene
// test: write([{action:"create", entity_type:"shot", data:{sceneId, scriptText:"..."}}]) creates shot
// test: write([{action:"update", entity_type:"shot", data:{id, scriptText:"updated"}}]) updates shot
// test: write([{action:"delete", entity_type:"shot", data:{id}}]) deletes shot
// test: write with multiple ops -> all applied atomically
// test: write returns created IDs for new entities
// test: write with invalid entity_type -> error
// test: write with missing required fields -> error with descriptive message
// test: write triggers diff broadcast to WebSocket clients
// test: write updates markdown files on disk
// test: write([{action:"create", entity_type:"scene"}, {action:"create", entity_type:"shot", data:{sceneId:"$new_0"}}]) -> shot references newly created scene via placeholder
```

### storyboard_reorder

```typescript
// test: reorder("scenes", ["id3","id1","id2"]) reorders scenes
// test: reorder("shots", ["s2","s1","s3"], parentId: sceneId) reorders shots within scene
// test: reorder("frames", ["f2","f1"], parentId: shotId) reorders frames within shot
// test: reorder with unknown ids -> error
// test: reorder with missing ids -> error (must include all ids in parent)
// test: reorder updates markdown files and broadcasts diff
```

### storyboard_import

```typescript
// test: import("json", jsonString) loads project from JSON
// test: import("csv", csvString) loads shots from CSV format
// test: import("json", data, replace:true) replaces entire project
// test: import("json", data, replace:false) merges into existing project
// test: import with invalid format -> error
// test: import with malformed data -> error with details
```

### storyboard_export

```typescript
// test: export("json") returns full project as JSON string
// test: export("csv") returns shots as CSV string
// test: export("json", outputPath) writes to file and returns path
// test: export with invalid format -> error
```

### storyboard_timeline

```typescript
// test: timeline("get_timeline") returns shots with computed start_ms, end_ms
// test: timeline("set_durations", {shotId: 3000}) updates shot duration
// test: timeline("set_durations") with duration < 300ms -> clamped to 300ms with warning
// test: timeline("get_timeline") returns correct cumulative times
// test: timeline operations update markdown and broadcast diff
```

### storyboard_assets

```typescript
// test: assets("list") returns all files in assets/ directory
// test: assets("add", {file_path:"/tmp/img.png", shot_id}) copies file to assets/ and adds frame
// test: assets("add", {data: base64String, filename:"img.png", shot_id}) writes from base64
// test: assets("delete", {file_path:"assets/img.png"}) removes file
// test: assets("get_path", {shot_id, frame_index}) returns asset path for a frame
// test: assets("add") with invalid shot_id -> error
// test: path traversal in file_path -> rejected
```

### storyboard_sync

```typescript
// test: sync("status") returns { connected_clients, version, project_path }
// test: sync("push") forces full state broadcast to all connected clients
// test: sync("pull") re-reads all files from disk and updates state
// test: sync("watch") starts/confirms file watching is active
// test: sync("unwatch") pauses file watching
```

## MCP Tool Schemas

### Tool 1: storyboard_read

```json
{
  "name": "storyboard_read",
  "description": "Read the current storyboard state. Returns project metadata, scenes, shots, and/or frames as JSON.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "filter": {
        "type": "string",
        "enum": ["all", "project", "scenes", "shots", "frames"],
        "default": "all",
        "description": "Which slice of the project to return"
      }
    }
  }
}
```

### Tool 2: storyboard_write

```json
{
  "name": "storyboard_write",
  "description": "Apply one or more create/update/delete operations atomically. All operations succeed or all fail. For batch changes, prefer this over editing markdown files directly.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "operations": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "action": { "type": "string", "enum": ["create", "update", "delete"] },
            "entity_type": { "type": "string", "enum": ["scene", "shot", "frame"] },
            "data": {
              "type": "object",
              "description": "Entity data. For create: initial fields. For update: id + changed fields. For delete: id only."
            }
          },
          "required": ["action", "entity_type", "data"]
        },
        "minItems": 1
      }
    },
    "required": ["operations"]
  }
}
```

### Tool 3: storyboard_reorder

```json
{
  "name": "storyboard_reorder",
  "description": "Reorder scenes, shots within a scene, or frames within a shot.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "entity_type": { "type": "string", "enum": ["scenes", "shots", "frames"] },
      "ordered_ids": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Complete list of entity IDs in desired order"
      },
      "parent_id": {
        "type": "string",
        "description": "Scene ID (for shots) or Shot ID (for frames). Not needed for scenes."
      }
    },
    "required": ["entity_type", "ordered_ids"]
  }
}
```

### Tool 4: storyboard_import

```json
{
  "name": "storyboard_import",
  "description": "Import a project from JSON or CSV data.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "format": { "type": "string", "enum": ["json", "csv"] },
      "data": { "type": "string", "description": "The import data as a string" },
      "replace": {
        "type": "boolean",
        "default": false,
        "description": "If true, replace entire project. If false, merge into existing."
      }
    },
    "required": ["format", "data"]
  }
}
```

### Tool 5: storyboard_export

```json
{
  "name": "storyboard_export",
  "description": "Export the project in a given format.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "format": { "type": "string", "enum": ["json", "csv"] },
      "output_path": {
        "type": "string",
        "description": "Optional file path to write the export to. If omitted, returns the data as a string."
      }
    },
    "required": ["format"]
  }
}
```

### Tool 6: storyboard_timeline

```json
{
  "name": "storyboard_timeline",
  "description": "Timeline/animatics operations: get computed timeline with start/end times, or set shot durations.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": { "type": "string", "enum": ["get_timeline", "set_durations"] },
      "durations": {
        "type": "object",
        "description": "Map of shot_id -> duration_ms. Only for set_durations action.",
        "additionalProperties": { "type": "number" }
      }
    },
    "required": ["action"]
  }
}
```

### Tool 7: storyboard_assets

```json
{
  "name": "storyboard_assets",
  "description": "Manage asset files (images, audio, video) in the project's assets/ folder.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": { "type": "string", "enum": ["list", "add", "delete", "get_path"] },
      "file_path": { "type": "string", "description": "Path to source file (for add) or asset to delete" },
      "data": { "type": "string", "description": "Base64-encoded file data (alternative to file_path for add)" },
      "filename": { "type": "string", "description": "Target filename in assets/ (for add with base64 data)" },
      "shot_id": { "type": "string", "description": "Shot to attach the asset to (for add) or get path from" },
      "frame_index": { "type": "number", "description": "Frame index within shot (for get_path)" }
    },
    "required": ["action"]
  }
}
```

### Tool 8: storyboard_sync

```json
{
  "name": "storyboard_sync",
  "description": "Control the live sync connection between the companion server and connected PWA clients.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": { "type": "string", "enum": ["status", "push", "pull", "watch", "unwatch"] }
    },
    "required": ["action"]
  }
}
```

## Files to Create

| File | Purpose |
|------|---------|
| `server/mcpServer.ts` | MCP server: tool registration, request handling, routing to stateManager |
| `server/mcpTools.ts` | Individual tool implementations (one function per tool) |
| `server/mcpServer.test.ts` | MCP tool tests |

## Dependencies

```json
{
  "@modelcontextprotocol/sdk": "^latest"
}
```

The MCP SDK provides `Server`, `StdioServerTransport`, and tool registration helpers.

## Implementation Sequence

### 5.1 MCP Server Setup (`server/mcpServer.ts`)

1. Import `@modelcontextprotocol/sdk` Server and StdioServerTransport
2. Create MCP server instance with metadata:
   ```typescript
   const server = new Server({
     name: "storyboard-companion",
     version: "0.1.0",
   });
   ```
3. Register all 8 tools with their schemas (from above)
4. Wire each tool handler to the corresponding function in `mcpTools.ts`
5. Connect via StdioServerTransport (the agent communicates via stdin/stdout)
6. Start the MCP server as part of the companion's `server/index.ts` startup

### 5.2 Tool Implementations (`server/mcpTools.ts`)

Each tool is a function that takes validated input and returns structured output:

```typescript
async function handleRead(
  stateManager: StateManager,
  params: { filter?: string }
): Promise<ToolResult>

async function handleWrite(
  stateManager: StateManager,
  wsServer: WsServer,
  params: { operations: Operation[] }
): Promise<ToolResult>
// ... etc for all 8 tools
```

**Implementation details per tool:**

1. **`storyboard_read`:** Simple projection from `stateManager.getState()`. Filter slices the state.

2. **`storyboard_write`:**
   - Validate each operation (required fields, entity exists for update/delete)
   - Support placeholder IDs: `$new_0`, `$new_1` so a create + update in the same batch can reference the new entity
   - Apply operations via `stateManager.applyMutation()`
   - This writes markdown files and updates state cache
   - WebSocket broadcast happens automatically via state change handler
   - Return created IDs mapping: `{ "$new_0": "actual_nanoid_1" }`

3. **`storyboard_reorder`:**
   - Validate all IDs exist and belong to the parent
   - Apply via `stateManager.applyMutation()` with reorder DiffOp

4. **`storyboard_import`:**
   - Parse input data based on format
   - For JSON: validate against ProjectState schema
   - For CSV: parse using the same logic as `src/utils/importExport.ts`
   - If replace: clear current state, load new
   - If merge: merge entities by ID
   - Write resulting markdown files to disk

5. **`storyboard_export`:**
   - Build output from current state
   - For JSON: `JSON.stringify(stateManager.getState())`
   - For CSV: generate using same column format as existing export
   - If `output_path`: write to file, return path
   - Else: return string content

6. **`storyboard_timeline`:**
   - `get_timeline`: compute cumulative start/end times for all shots:
     ```typescript
     let currentMs = 0;
     shots.map(shot => {
       const entry = { shotId: shot.id, startMs: currentMs, endMs: currentMs + shot.duration, ... };
       currentMs += shot.duration;
       return entry;
     });
     ```
   - `set_durations`: update shot durations (clamp to 300ms minimum), apply via stateManager

7. **`storyboard_assets`:**
   - `list`: read `assets/` directory, return file list with sizes and MIME types
   - `add` from file_path: copy file into `assets/`, optionally create frame in the specified shot
   - `add` from base64: decode and write to `assets/`, create frame
   - `delete`: remove file from `assets/`, remove referencing frames from shots
   - `get_path`: look up the frame in state, return its asset path
   - Security: validate all paths resolve within the project's `assets/` directory

8. **`storyboard_sync`:**
   - `status`: return `{ connectedClients, version, projectPath, watching }`
   - `push`: force `wsServer.broadcast(sync:full, stateManager.getState())`
   - `pull`: call `stateManager.loadFromDisk()`, broadcast full sync
   - `watch` / `unwatch`: start/stop file watcher

### 5.3 Error Handling

All tools follow the same error pattern:

```typescript
try {
  // validate inputs
  // execute operation
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
} catch (error) {
  return {
    content: [{ type: "text", text: `Error: ${error.message}` }],
    isError: true,
  };
}
```

Validation errors include:
- Missing required parameters
- Unknown entity IDs (for update/delete)
- Invalid enum values
- Path traversal attempts
- Duration below minimum (300ms)

### 5.4 Integration with Companion (`server/index.ts`)

Update the companion's main entry point:

```typescript
// Existing from step 3:
const stateManager = new StateManager();
await stateManager.loadFromDisk(config.projectPath);
const fileWatcher = new FileWatcher(config);
const wsServer = new WsServer(config.wsPort);
const assetServer = new AssetServer(config);

// New in step 5:
const mcpServer = createMcpServer(stateManager, wsServer, config);
mcpServer.start();  // listens on stdin/stdout
```

The MCP server runs in the same process as the companion. It shares the `stateManager` and `wsServer` instances -- no IPC needed.

### 5.5 Tests (`server/mcpServer.test.ts`)

Tests use the MCP SDK's test client to call tools programmatically:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory";

// Setup: create server + client connected via in-memory transport
// Each test: call a tool, assert response
```

## Key Decisions

- **Stdio transport:** The agent communicates with the MCP server via stdin/stdout (standard MCP pattern). The companion process is started by the agent's IDE or by the user manually.
- **Shared process:** MCP server runs in the same Node process as the companion. Avoids IPC complexity. The state manager is a shared singleton.
- **Placeholder IDs for cross-referencing:** `$new_0` syntax lets a batch create a scene and add shots to it in one call, without needing the generated nanoid.
- **No ZIP/PDF/WebM export via MCP:** These formats require complex binary generation. The agent can trigger them via the PWA UI or use other tools. MCP export focuses on JSON and CSV (text-based, useful for the agent).
- **Duration clamping:** The PWA has a 300ms minimum shot duration. MCP tools enforce the same constraint to prevent invalid states.

## Done Criteria

- [ ] All 8 MCP tools registered and callable
- [ ] `storyboard_read` returns accurate state in all filter modes
- [ ] `storyboard_write` with batch operations applies atomically and syncs to PWA
- [ ] `storyboard_reorder` correctly reorders entities
- [ ] `storyboard_import` loads JSON and CSV correctly
- [ ] `storyboard_export` produces valid JSON and CSV
- [ ] `storyboard_timeline` computes correct start/end times
- [ ] `storyboard_assets` manages files with path traversal protection
- [ ] `storyboard_sync` controls the companion's sync state
- [ ] All tools return descriptive errors on invalid input
- [ ] All tests pass
- [ ] MCP server integrates cleanly with companion process

## Cross-References

- **Step 1** parser types are used for markdown serialization in write operations
- **Step 3** provides `stateManager`, `wsServer` that MCP tools operate on
- **Step 4** WebSocket clients receive diffs triggered by MCP tool mutations
- **Step 6** agent skills document how to use these tools
- **Step 7** E2E tests call MCP tools and verify changes appear in the PWA
