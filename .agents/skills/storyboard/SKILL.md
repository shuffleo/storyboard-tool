# Storyboard Markdown Format & MCP Tools

Use this skill when working with storyboard projects stored as markdown files,
or when calling storyboard MCP tools. Covers the markdown format spec, data
model, file conventions, and all available MCP tools.

## Folder Structure

```
my-storyboard/
├── project.md           # Project metadata (title, fps, aspect ratio, notes)
├── scene-001.md         # One file per scene, zero-padded 3-digit number
├── scene-002.md
├── scene-NNN.md
└── assets/              # Media files (images, audio, video)
    ├── sc001-sh010-f01.png
    └── custom-name.png
```

- Files sorted alphabetically by filename = scene order
- `project.md` is always present and always named exactly this
- Scene files match pattern `scene-NNN.md`
- Assets can use any filename; recommended: `sc{NNN}-sh{NNN}-f{NN}.{ext}`

## Markdown Format

### project.md

```markdown
---
id: <nanoid>
fps: 24
aspect_ratio: "16:9"
target_duration: 120       # seconds, optional
created_at: 2026-04-27T12:00:00Z
updated_at: 2026-04-27T12:00:00Z
---

# Project Title

## Style Notes

Visual style description here.

## Reference Links

- https://example.com/ref1
- https://example.com/ref2

## Global Notes

Production notes, constraints, etc.
```

### scene-NNN.md

```markdown
---
id: <nanoid>
scene_number: "1"
order_index: 0
---

# Scene 1: Scene Title

Summary paragraph(s) describing the scene.

## Notes

Director/production notes for this scene.

---

<!-- shot: {"id":"k7x2m","tags":["wide","establishing"]} -->
### 2s: Wide shot - city skyline

Script text describing the action in this shot.
Additional paragraphs of script text.

> Camera direction and general notes in blockquotes.

![frame-label](assets/sc001-sh010-f01.png "Caption text")

---

<!-- shot: {"id":"m9p3q","tags":["close-up"]} -->
### 500ms: Quick insert

Script text for the next shot.

![frame-1](assets/sc001-sh020-f01.png "First frame")
![frame-2](assets/sc001-sh020-f02.png "Second frame")
```

### Shot Heading Syntax

```
### {duration}{unit}: {title}
```

| Duration | Milliseconds | Notes |
|----------|-------------|-------|
| `2s` | 2000 | Seconds |
| `500ms` | 500 | Milliseconds |
| `1.5m` | 90000 | Minutes |
| `0.3s` | 300 | Minimum duration |

### Shot Metadata Comment

Place immediately before the `###` heading:

```html
<!-- shot: {"id":"k7x2m","tags":["wide","establishing"]} -->
```

- `id` (string, required): stable identifier for the shot
- `tags` (string array, optional): classification tags
- If missing, the parser auto-generates an id

### Frame Image Syntax

```markdown
![{label}](assets/{path} "{caption}")
```

Multiple frames per shot allowed. Order = appearance order in file.

## Data Model

| Markdown | Runtime Type | Key Fields |
|----------|-------------|------------|
| `project.md` frontmatter | `Project` | id, title, fps, aspectRatio, targetDuration |
| `scene-NNN.md` | `Scene` | id, sceneNumber, title, summary, notes |
| `### duration: title` block | `Shot` | id, title, scriptText, duration, tags, generalNotes |
| `![](path)` | `StoryboardFrame` | id, shotId, image (path), caption |

Shot codes (010, 020, 030) are computed from position, never stored in markdown.
`Sequence` and `Version` types are not used in markdown format.

## When to Edit Files Directly vs Use MCP Tools

**Edit files directly** for:
- Bulk text changes across multiple shots
- Find-and-replace operations
- Adding/removing entire scenes
- Restructuring the storyboard layout
- Any task where editing text is natural

**Use MCP tools** for:
- Atomic batch operations with validation
- Reading computed state (timeline with start/end times)
- Managing binary assets (images, audio, video)
- Triggering immediate live sync to the PWA
- Importing/exporting in structured formats

After direct file edits, the companion's file watcher picks up changes within ~500ms. For immediate sync, call `storyboard_sync` with action `pull`.

## MCP Tools Reference

### storyboard_read

Read current project state.

```json
{ "filter": "all" }           // full state
{ "filter": "project" }       // project metadata only
{ "filter": "scenes" }        // scenes array
{ "filter": "shots" }         // all shots
{ "filter": "frames" }        // all frames
```

### storyboard_write

Atomic batch create/update/delete operations.

```json
{
  "operations": [
    { "action": "create", "entity_type": "scene", "data": { "title": "New Scene" } },
    { "action": "create", "entity_type": "shot", "data": { "sceneId": "sc1", "title": "Wide shot", "scriptText": "Description", "duration": 2000 } },
    { "action": "update", "entity_type": "shot", "data": { "id": "sh1", "scriptText": "Updated text" } },
    { "action": "delete", "entity_type": "shot", "data": { "id": "sh2" } }
  ]
}
```

Use placeholder IDs (`$new_0`, `$new_1`) to reference newly created entities within the same batch.

### storyboard_reorder

Reorder entities by providing the complete ordered ID list.

```json
{ "entity_type": "scenes", "ordered_ids": ["sc3", "sc1", "sc2"] }
{ "entity_type": "shots", "ordered_ids": ["sh2", "sh1"], "parent_id": "sc1" }
{ "entity_type": "frames", "ordered_ids": ["f2", "f1"], "parent_id": "sh1" }
```

### storyboard_import / storyboard_export

Import/export in JSON or CSV format.

```json
{ "format": "json", "data": "..." }                                // import
{ "format": "json", "data": "...", "replace": true }               // import replacing all
{ "format": "csv", "data": "..." }                                 // import
{ "format": "json" }                                                // export (returns data)
{ "format": "csv", "output_path": "/tmp/shots.csv" }               // export to file
```

`replace: true` deletes all existing scenes before importing.

### storyboard_timeline

Get computed timeline or set shot durations.

```json
{ "action": "get_timeline" }
{ "action": "set_durations", "durations": { "sh1": 3000, "sh2": 1500 } }
```

Timeline returns `{ timeline: [{ shotId, startMs, endMs, durationMs }], totalDurationMs }`.
Durations below 300ms are clamped automatically.

### storyboard_assets

Manage files in the assets/ directory.

```json
{ "action": "list" }
{ "action": "add", "file_path": "/tmp/image.png", "shot_id": "sh1" }
{ "action": "add", "data": "<base64>", "filename": "img.png", "shot_id": "sh1" }
{ "action": "delete", "file_path": "assets/old-image.png" }
{ "action": "get_path", "shot_id": "sh1", "frame_index": 0 }
```

### storyboard_sync

Control companion server sync state.

```json
{ "action": "status" }    // get version, project path
{ "action": "pull" }      // re-read all files from disk
{ "action": "push" }      // force broadcast to PWA clients
{ "action": "watch" }     // enable file watching
{ "action": "unwatch" }   // disable file watching
```

## Best Practices

- Always include shot metadata comments with explicit IDs for merge stability
- Keep images in `assets/`, never inline base64 in markdown
- Use git commits as checkpoints after major changes
- Prefer batch `storyboard_write` over many sequential single operations
- Use descriptive shot titles (they appear in the PWA timeline)
- Set duration in the heading (e.g., `### 2s: Shot title`), not via metadata

## Common Patterns

### Create a storyboard from a script

1. Parse the script into logical segments
2. Create `scene-NNN.md` files with titles and summaries
3. Add shots to each scene with duration estimates and script text
4. Call `storyboard_sync("pull")` if companion is running

### Generate images for all shots

1. `storyboard_read("shots")` to get all shots
2. Generate image prompts from script text and tags
3. Call image generation API
4. `storyboard_assets("add", { data, filename, shot_id })` for each image

### Adjust animatic timing

1. `storyboard_timeline("get_timeline")` to see current timing
2. `storyboard_timeline("set_durations", { ... })` to update
3. Preview in PWA animatics view
