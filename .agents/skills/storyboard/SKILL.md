# Storyboard Markdown Format & MCP Tools

Use this skill when working with storyboard projects stored as markdown files,
or when calling storyboard MCP tools. Covers the markdown format spec, data
model, file conventions, and all available MCP tools.

**MANDATORY: You MUST run the storyboard linter after every batch of file
edits and before every `storyboard_sync("pull")` call:**

```bash
npx tsx server/lint.ts --project /path/to/storyboard
```

**Do NOT sync or proceed if the linter reports errors.** Fix all errors first.

## Storyboard Folder Rules

**ONLY these items belong inside the storyboard folder:**

```
my-storyboard/
├── project.md           # Project metadata (required, exactly this name)
├── scene-001.md         # One file per scene, zero-padded 3-digit number
├── scene-002.md
├── scene-NNN.md
└── assets/              # Media files (images, audio, video)
    ├── char/            # Character references (optional subfolder)
    ├── scene/           # Scene/location art (optional subfolder)
    └── sc001-sh010-f01.png
```

**Everything else goes OUTSIDE the storyboard folder.** The companion server
ignores any `.md` file that isn't `project.md` or `scene-NNN.md`. Placing
other files (prompts, notes, shot lists) inside the storyboard folder is a
silent mistake — they won't appear in the tool.

Files sorted alphabetically by filename = scene order. Always zero-pad to
3 digits (`scene-001.md`, not `scene-1.md`).

## Frontmatter Rules

Frontmatter MUST be valid YAML between two `---` lines. No blank lines before
the first key. No markdown headings (`#`, `##`) inside the block.

**Correct:**

```yaml
---
id: sc001
scene_number: "1"
order_index: 0
---
```

**WRONG — do not do this:**

```yaml
---

## id: sc001
scene_number: "1"
order_index: 0

# Scene 1: Title
```

This breaks parsing: `## id:` is a markdown heading (not YAML), the title is
consumed as frontmatter, and the closing `---` is never found.

### Required fields


| File           | Required fields                     |
| -------------- | ----------------------------------- |
| `project.md`   | `id`, `fps`, `aspect_ratio`         |
| `scene-NNN.md` | `id`, `scene_number`, `order_index` |


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

## H3 Headings = Shots (Critical Rule)

**Every `###` heading in a scene file is parsed as a shot.** There are no
exceptions. If you use `### Clip Mapping` or `### Notes` or any other H3,
the parser creates a phantom shot with default 1000ms duration.

Use `##` (H2) for non-shot sections:

- `## Notes` — scene-level notes
- `## Clip Mapping` — audio/clip tables
- `## References` — any other metadata

Only `### {duration}: {title}` headings should appear in scene files.

### Shot Heading Syntax

```
### {duration}{unit}: {title}
```


| Duration | Milliseconds | Notes            |
| -------- | ------------ | ---------------- |
| `2s`     | 2000         | Seconds          |
| `500ms`  | 500          | Milliseconds     |
| `1.5m`   | 90000        | Minutes          |
| `0.3s`   | 300          | Minimum duration |


### Shot Metadata Comment

Place immediately before the `###` heading:

```html
<!-- shot: {"id":"k7x2m","tags":["wide","establishing"]} -->
```

- `id` (string, required): stable identifier for the shot
- `tags` (string array, optional): classification tags
- If missing, the parser auto-generates an id

## Image References

Use the standard markdown image syntax for local assets:

```markdown
![{label}](assets/{path} "{caption}")
```

External URLs are also supported:

```markdown
![reference](https://example.com/image.png "External reference")
```

Multiple frames per shot allowed. Order = appearance order in file.

Local image paths MUST start with `assets/` and the file must exist.
External URLs (http/https) are rendered directly without proxying through
the asset server. Use local assets for production frames and external URLs
for references or mood boards.

**Do NOT use bare text as image placeholders.** Writing `catchpit` or `taxi`
on a line by itself is parsed as script text, not a frame reference. If a
shot doesn't have images yet, simply omit the image line.

## Lint Before Sync (Mandatory)

**You MUST run the linter** after every batch of file edits, after adding
assets, and before every `storyboard_sync("pull")` call:

```bash
npx tsx server/lint.ts --project /path/to/storyboard
```

The linter validates:

- Frontmatter YAML syntax and required fields
- H3 headings follow `{duration}: {title}` format
- No non-standard `.md` files in the folder
- No bare text asset placeholders
- Image paths start with `assets/`
- Referenced image files actually exist on disk
- External URLs (http/https) are allowed and skipped for existence checks

**Do NOT call `storyboard_sync("pull")` if the linter reports errors.**
Fix all errors first, then re-lint until clean.

## Data Model


| Markdown                    | Runtime Type      | Key Fields                                          |
| --------------------------- | ----------------- | --------------------------------------------------- |
| `project.md` frontmatter    | `Project`         | id, title, fps, aspectRatio, targetDuration         |
| `scene-NNN.md`              | `Scene`           | id, sceneNumber, title, summary, notes              |
| `### duration: title` block | `Shot`            | id, title, scriptText, duration, tags, generalNotes |
| `![](path)`                 | `StoryboardFrame` | id, shotId, image (path), caption                   |


Shot codes (010, 020, 030) are computed from position, never stored in markdown.
`Sequence` and `Version` types are not used in markdown format.

## Recommended Project Layout

Keep the storyboard folder clean. Put supporting material outside:

```
my-project/
├── storyboard/              # ONLY project.md + scene-NNN.md + assets/
│   ├── project.md
│   ├── scene-001.md
│   ├── scene-002.md
│   └── assets/
│       ├── char/            # Character reference images
│       └── scene/           # Scene/location art
├── docs/                    # Domain bibles (outside storyboard)
│   ├── CHARACTERS.md
│   ├── GEOGRAPHY.md
│   ├── ART_STYLE.md
│   └── AUDIO_CLIPS.md
├── assets/                  # Source media, generation scripts
│   ├── refs/
│   │   ├── PROMPTS.md       # Image generation prompts
│   │   └── generate_all.py
│   └── clips/               # Audio clips
├── SHOT_LIST.md             # Full director-style breakdown
└── .agents/skills/          # Agent skill files
```

This separation keeps the storyboard tool's parser happy while organizing
all production materials.

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
- Run `npx tsx server/lint.ts --project /path` before syncing to catch errors
- Use `##` (H2) for non-shot sections, never `###` (H3) for metadata/tables

## Common Patterns

### Create a storyboard from a script

1. Parse the script into logical segments
2. Create `scene-NNN.md` files with titles and summaries
3. Add shots to each scene with duration estimates and script text
4. Run `npx tsx server/lint.ts --project /path` to validate
5. Call `storyboard_sync("pull")` if companion is running

### Generate images for all shots

1. `storyboard_read("shots")` to get all shots
2. Generate image prompts from script text and tags
3. Call image generation API
4. `storyboard_assets("add", { data, filename, shot_id })` for each image
5. Run `npx tsx server/lint.ts --project /path` to verify all paths resolve

### Adjust animatic timing

1. `storyboard_timeline("get_timeline")` to see current timing
2. `storyboard_timeline("set_durations", { ... })` to update
3. Preview in PWA animatics view

