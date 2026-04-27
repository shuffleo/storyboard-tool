# Schema and Naming Conventions

> **Purpose:** Single source of truth for all naming, field mapping, and data shape conventions. Every step plan MUST follow these rules. If a decision here contradicts a step plan, this document wins.

## 1. Naming Layers

There are three naming contexts in this project. Data flows between them via explicit converters.

| Layer | Convention | Example | Where Used |
|-------|-----------|---------|------------|
| Markdown frontmatter (YAML) | `snake_case` | `aspect_ratio`, `scene_number`, `order_index`, `created_at` | `project.md`, `scene-*.md` frontmatter blocks |
| TypeScript / runtime | `camelCase` | `aspectRatio`, `sceneNumber`, `orderIndex`, `createdAt` | `src/types.ts`, Zustand store, all `.ts` files |
| MCP tool params (JSON) | `snake_case` | `entity_type`, `shot_id`, `ordered_ids`, `parent_id`, `file_path` | MCP tool schemas in `server/mcpServer.ts` |

**Rule:** Never mix conventions within a layer. The parser converts snake_case frontmatter to camelCase TypeScript. MCP tool schemas use snake_case (matching the MCP SDK convention) but internal handler functions receive camelCase after conversion.

## 2. File Naming

### Project folder structure

```
my-storyboard/
├── project.md                 # Always exactly this name
├── scene-001.md               # Zero-padded 3-digit number
├── scene-002.md
├── scene-NNN.md
└── assets/
    ├── sc001-sh010-f01.png    # Scene-Shot-Frame naming
    ├── sc001-sh010-f02.png
    ├── sc001-sh020-f01.png
    └── custom-name.png        # User-provided names also allowed
```

### Scene file naming

- Pattern: `scene-{NNN}.md` where `NNN` is zero-padded to 3 digits
- Ordering: files sorted alphabetically by filename (which is numeric order due to zero-padding)
- The `NNN` in the filename SHOULD match the `scene_number` field in frontmatter, but the filename controls sort order
- When creating new scenes: find the highest existing number, increment by 1
- When reordering: rename files to maintain correct sort order

### Asset file naming

- **Recommended pattern:** `sc{NNN}-sh{NNN}-f{NN}.{ext}` (e.g., `sc001-sh010-f01.png`)
  - `sc{NNN}` = scene number (3 digits, matches scene file)
  - `sh{NNN}` = shot code (3 digits, computed from position: 010, 020, 030...)
  - `f{NN}` = frame index within shot (2 digits, 01-based)
  - `{ext}` = file extension matching MIME type
- **Custom names allowed:** agents and users can use any filename. The naming convention is a recommendation, not enforced by the parser.
- **Supported formats:**
  - Images: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`
  - Video: `.mp4`, `.webm`
  - Audio: `.mp3`, `.wav`, `.aac`

## 3. Markdown Format Schema

### project.md frontmatter

```yaml
---
id: <nanoid>                        # string, required, auto-generated if missing
fps: 24                             # number, default 24
aspect_ratio: "16:9"                # string, default "16:9"
target_duration: 120                # number (seconds), optional
created_at: 2026-04-27T12:00:00Z   # ISO 8601 string
updated_at: 2026-04-27T12:00:00Z   # ISO 8601 string
---
```

### project.md body sections

| Section | Markdown | Maps to |
|---------|----------|---------|
| Title | `# {title}` (H1) | `Project.title` |
| Style Notes | Content under `## Style Notes` | `Project.styleNotes` |
| Reference Links | List items under `## Reference Links` | `Project.referenceLinks: string[]` |
| Global Notes | Content under `## Global Notes` | `Project.globalNotes` |

Section order in the file: Title, Style Notes, Reference Links, Global Notes. Missing sections default to empty string / empty array.

### scene-NNN.md frontmatter

```yaml
---
id: <nanoid>                # string, required, auto-generated if missing
scene_number: "1"           # string (not number), required
order_index: 0              # number, required, 0-based
---
```

### scene-NNN.md body structure

```markdown
# Scene {N}: {title}          <- H1: scene title (everything after "Scene N: ")

{summary paragraphs}          <- body text before first --- or ## Notes

## Notes                       <- optional section

{notes content}                <- scene notes / director notes

---                            <- thematic break: start of shots section

<!-- shot: {"id":"...","tags":[...]} -->
### {duration}: {title}

{script text paragraphs}

> {general notes in blockquotes}

![{label}](assets/{path} "{caption}")

---                            <- separator between shots
```

### Shot heading syntax

```
### {duration}{unit}: {title}
```

| Component | Pattern | Examples | Notes |
|-----------|---------|----------|-------|
| Duration value | `\d+(\.\d+)?` | `2`, `1.5`, `0.3`, `500` | Decimal allowed |
| Duration unit | `s` \| `ms` \| `m` | `2s`, `500ms`, `1.5m` | Required |
| Separator | `: ` | Always colon-space | Required between duration and title |
| Title | Free text | `Wide shot - city skyline` | Everything after `: ` |

**Duration parsing:**

| Input | Milliseconds | Notes |
|-------|-------------|-------|
| `2s` | 2000 | |
| `500ms` | 500 | |
| `1.5m` | 90000 | |
| `0.3s` | 300 | Minimum enforced by PWA |
| (missing) | 1000 | Default + warning |
| `abc` | 1000 | Invalid + warning |

**Duration regex:** `/^(\d+(?:\.\d+)?)(s|ms|m)$/`

### Shot metadata comment

```html
<!-- shot: {"id":"k7x2m","tags":["wide","establishing"]} -->
```

- Must be the line immediately before the `###` shot heading
- Must start with `<!-- shot: ` and end with ` -->`
- Content between is valid JSON
- Required fields: `id` (string)
- Optional fields: `tags` (string array)
- If comment is missing: parser auto-generates `id` via nanoid, sets `tags: []`, emits warning
- If JSON is malformed: parser auto-generates `id`, emits warning

### Frame image syntax

```markdown
![{label}](assets/{path} "{caption}")
```

| Component | Maps to | Required | Default |
|-----------|---------|----------|---------|
| `{label}` | `ParsedFrame.label` | No | `""` |
| `assets/{path}` | `ParsedFrame.path` | Yes | - |
| `"{caption}"` | `ParsedFrame.caption` | No | `""` |

Multiple frames per shot are allowed. Order = order of appearance in the file.

## 4. TypeScript Type Mapping

### ParsedProject -> Project

| ParsedProject field | Project field | Conversion |
|---------------------|--------------|------------|
| `id` | `id` | direct |
| `title` | `title` | direct |
| `fps` | `fps` | direct |
| `aspectRatio` | `aspectRatio` | direct (parser already converts from `aspect_ratio`) |
| `targetDuration` | `targetDuration` | direct (parser converts from `target_duration`) |
| `styleNotes` | `styleNotes` | direct |
| `referenceLinks` | `referenceLinks` | direct |
| `globalNotes` | `globalNotes` | direct |
| `createdAt` (ISO string) | `createdAt` (number) | `new Date(iso).getTime()` |
| `updatedAt` (ISO string) | `updatedAt` (number) | `new Date(iso).getTime()` |

### ParsedScene -> Scene

| ParsedScene field | Scene field | Conversion |
|-------------------|------------|------------|
| `id` | `id` | direct |
| `sceneNumber` | `sceneNumber` | direct (parser converts from `scene_number`) |
| `orderIndex` | `orderIndex` | direct (parser converts from `order_index`) |
| `title` | `title` | direct |
| `summary` | `summary` | direct |
| `notes` | `notes` | direct |
| (none) | `sequenceId` | `undefined` (sequences not used in markdown format) |

### ParsedShot -> Shot

| ParsedShot field | Shot field | Conversion |
|------------------|-----------|------------|
| `id` | `id` | direct |
| `durationMs` | `duration` | direct (both are milliseconds) |
| `title` | `shotCode` | **See note below** |
| `scriptText` | `scriptText` | direct |
| `generalNotes` | `generalNotes` | direct |
| `tags` | `tags` | direct |
| (none) | `sceneId` | Set from parent ParsedScene.id during flattening |
| (none) | `orderIndex` | Computed: global position across all scenes |

**Shot title handling:** The existing `Shot` type has `shotCode` (e.g., "010") but no `title` field. Two things happen:

1. `Shot.shotCode` is **computed** from position: shot at index 0 -> "010", index 1 -> "020", etc. It is NOT stored in markdown.
2. The shot heading title (`### 2s: Wide shot title`) needs a home. **Decision: add `title: string` to the `Shot` interface in `types.ts`.** This is a non-breaking addition -- existing code that doesn't reference `title` is unaffected.

Updated Shot interface:

```typescript
export interface Shot {
  id: string;
  sceneId?: string;
  orderIndex: number;
  shotCode: string;      // computed from position, not stored in markdown
  title: string;         // NEW: from heading "### 2s: {title}"
  scriptText: string;
  duration: number;      // milliseconds, minimum 300ms
  tags: string[];
  generalNotes: string;
}
```

### ParsedFrame -> StoryboardFrame

| ParsedFrame field | StoryboardFrame field | Conversion |
|-------------------|----------------------|------------|
| `id` | `id` | direct (generated as `{shotId}-f{orderIndex}`) |
| `path` | `image` | direct (relative path replaces base64/blob semantics) |
| `caption` | `caption` | direct |
| `orderIndex` | `orderIndex` | direct |
| `label` | (none) | label is markdown-only (alt text), not stored in runtime type |
| (none) | `shotId` | Set from parent ParsedShot.id during flattening |
| (none) | `version` | Default: `1` |
| (none) | `overlayData` | Default: `undefined` |

**`StoryboardFrame.image` semantic change:** Currently `image` holds base64 data or a blob URL. With the markdown backend, it holds a relative asset path (e.g., `assets/sc001-sh010-f01.png`). The rendering layer (components) must resolve this path to a displayable URL via the `AssetResolver` (step 4). This is a breaking change to the field's semantics but not to its type (`string`).

### Entities NOT in markdown format

| Type | Status | Notes |
|------|--------|-------|
| `Sequence` | **Not mapped** | `ProjectState.sequences` is always `[]` when loading from markdown. Sequences are a future extension (could map to subdirectories or a `## Sequence` section in project.md). |
| `Version` | **Not mapped** | `ProjectState.versions` is always `[]`. Version history is handled by git, not by the markdown format. |

## 5. DiffOp Schema

Used in WebSocket protocol (step 3/4) and MCP storyboard_write (step 5).

```typescript
interface DiffOp {
  type: 'create' | 'update' | 'delete' | 'reorder';
  entity: 'project' | 'scene' | 'shot' | 'frame';
  id?: string;           // entity ID (required for update/delete)
  parentId?: string;     // sceneId for shots, shotId for frames
  data?: Record<string, unknown>;  // entity fields (for create/update)
  orderedIds?: string[]; // new order (for reorder)
}
```

**Field names in `data` use camelCase** (matching TypeScript types), not snake_case. The MCP tool layer converts from its snake_case params to camelCase before creating DiffOps.

## 6. Port Conventions

| Service | Default Port | CLI Flag | Env Var |
|---------|-------------|----------|---------|
| WebSocket server | 9800 | `--ws-port` | `STORYBOARD_WS_PORT` |
| Asset HTTP server | 9801 | `--asset-port` | `STORYBOARD_ASSET_PORT` |

Both servers bind to `127.0.0.1` (localhost only). No authentication.

## 7. MCP Tool Naming

All MCP tools use the `storyboard_` prefix. Tool names and params use `snake_case` (MCP convention):

| Tool | Params (snake_case) |
|------|---------------------|
| `storyboard_read` | `filter` |
| `storyboard_write` | `operations[].action`, `operations[].entity_type`, `operations[].data` |
| `storyboard_reorder` | `entity_type`, `ordered_ids`, `parent_id` |
| `storyboard_import` | `format`, `data`, `replace` |
| `storyboard_export` | `format`, `output_path` |
| `storyboard_timeline` | `action`, `durations` |
| `storyboard_assets` | `action`, `file_path`, `data`, `filename`, `shot_id`, `frame_index` |
| `storyboard_sync` | `action` |

Inside `operations[].data`, field names match the TypeScript camelCase convention (e.g., `scriptText`, not `script_text`), because data represents entity fields.

## 8. WebSocket Message Types

All message type strings use `namespace:action` pattern:

| Type | Direction | Payload |
|------|-----------|---------|
| `sync:full` | server -> client | `{ state: ProjectState, version: number }` |
| `sync:diff` | server -> client | `{ version, previousVersion, ops: DiffOp[] }` |
| `mutation:apply` | client -> server | `{ ops: DiffOp[], clientVersion: number }` |
| `mutation:ack` | server -> client | `{ appliedOps: number, newVersion: number }` |
| `mutation:error` | server -> client | `{ message: string, code: string }` |
| `ping` | bidirectional | `{}` |
| `pong` | bidirectional | `{}` |

## 9. Computed vs Stored Fields

Some fields are derived at runtime, never stored in markdown:

| Field | Computed from | Notes |
|-------|--------------|-------|
| `Shot.shotCode` | Position in scene (0 -> "010", 1 -> "020") | Display only |
| `Shot.orderIndex` | Global position across all scenes | Flattened from nested structure |
| `Scene.orderIndex` | Position in filename sort order | Matches frontmatter `order_index` but filename is authoritative |
| `StoryboardFrame.shotId` | Parent shot during flattening | Needed for flat ProjectState |
| `StoryboardFrame.version` | Always `1` from markdown | Version tracking is not in markdown format |

## 10. ID Generation

- **IDs:** `nanoid()` with default length (21 chars)
- **When generated:** parser auto-generates IDs for entities missing them (with warning)
- **Stability:** once assigned, IDs never change. They are stored in frontmatter (scenes) or HTML comments (shots).
- **Frame IDs:** generated as `{shotId}-f{orderIndex}` (deterministic from parent and position). Not stored in markdown -- reconstructed on every parse.

## 11. Duration Constraints

| Constraint | Value | Enforced by |
|-----------|-------|-------------|
| Minimum shot duration | 300ms | PWA store, MCP tools, parser (warning only) |
| Default shot duration | 1000ms | Parser (when heading has no duration) |
| Duration units | `s`, `ms`, `m` | Parser |
| Duration display | Always in most natural unit | Serializer: `500ms`, `2s`, `1.5m` |

**Serialization rule for duration units:**

- If `ms < 1000`: serialize as `{ms}ms` (e.g., `300ms`, `500ms`)
- If `ms >= 1000` and `ms % 1000 === 0` and `ms < 60000`: serialize as `{s}s` (e.g., `2s`, `10s`)
- If `ms >= 1000` and `ms % 1000 !== 0` and `ms < 60000`: serialize as `{s}s` with decimal (e.g., `1.5s`, `2.3s`)
- if `ms >= 60000` and `ms % 60000 === 0`: serialize as `{m}m` (e.g., `1m`, `2m`)
- If `ms >= 60000` and `ms % 60000 !== 0`: serialize as `{s}s` (e.g., `90s` not `1.5m`)

## 12. Import/Export Format Support

### Via MCP tools (agent-facing)

Text-based formats only (agent can process the output):

| Format | Import | Export | Notes |
|--------|--------|--------|-------|
| JSON | Yes | Yes | Full ProjectState as JSON |
| CSV | Yes | Yes | Shots only: Shot Code, Scene, Script Text, Duration (seconds), Tags |

### Via PWA UI (user-facing, existing)

| Format | Import | Export | Notes |
|--------|--------|--------|-------|
| CSV | Yes | Yes | Same as MCP |
| ZIP | Yes | Yes | project.json + assets/ + image-mapping.json |
| JSON | Yes | Yes | IndexedDB format |
| PDF | No | Yes | Storyboard sheets |
| WebM | No | Yes | Animatic video |
| Images | Yes | No | Raw images added as frames |

Binary formats (ZIP, PDF, WebM) are NOT exposed via MCP tools. The agent can trigger these through the PWA UI if needed.

## 13. Cross-Reference: Where These Conventions Are Used

| Convention | Used in Step |
|-----------|-------------|
| Frontmatter snake_case | 1 (parser), 6 (agent skills) |
| TypeScript camelCase | 1 (parser types), 2 (store), 3 (state manager), 4 (sync client) |
| MCP snake_case | 5 (MCP server), 6 (agent skills) |
| Scene file naming | 1 (parser), 2 (project loader), 3 (file watcher), 6 (skills) |
| Asset file naming | 1 (parser), 5 (MCP assets tool), 6 (skills) |
| DiffOp schema | 3 (diff engine), 4 (sync client), 5 (MCP write tool) |
| Port conventions | 3 (companion), 4 (sync client) |
| Duration parsing | 1 (parser), 5 (MCP timeline tool) |
| ID generation | 1 (parser), 2 (store), 5 (MCP write tool) |
