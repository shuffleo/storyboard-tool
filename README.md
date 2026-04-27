# Storyboard - Animation Pre-Production Tool

A **local-first, lightweight Progressive Web App (PWA)** for managing and iterating on animation projects during pre-production and animatic stages.

## Features

- **Three Synchronized Views**: Table (spreadsheet editing), Storyboard (visual cards), and Animatics (timeline playback) - all stay in sync
- **Progressive Web App**: Installable, works offline with persistent storage protection
- **Local-First**: All data stored in IndexedDB, auto-saves continuously, no backend required
- **Import/Export**: Multiple formats (CSV, ZIP, PDF, IndexedDB) with full data preservation
- **Animatics Playback**: Timeline-based video preview with duration controls and WebM export
- **Brutalist Design**: Bold, high-contrast interface 

## Tech Stack

- React + TypeScript
- Vite for build tooling
- Zustand for state management
- IndexedDB for persistence
- Tailwind CSS for styling


## Installing as a PWA on Desktop (Chrome/Edge)

This app can be installed as a Progressive Web App (PWA) on your device for a native app-like experience with offline support and better data protection.

1. Open the app in your browser
2. Click the three-dot menu (⋯) in the top bar
3. Click "Install App" from the menu
4. Follow the browser's installation prompt
5. The app will be added to your applications and can be launched like a native app

### Benefits of Installing

- **Offline Access**: Works without internet connection
- **Persistent Storage**: Better data protection against browser data clearing
- **App-like Experience**: Launches in its own window, no browser UI
- **Home Screen Access**: Quick access from your device's home screen

## Usage

### Creating a Project

When you first open the app, a default project is created with 3 scenes, each containing 5 shots. You can edit the project details in the Inspector panel.

### Adding Shots

- Click "+ Add Shot" in the Table view
- Shots are automatically numbered (010, 020, 030...)
- Edit shot details inline in the table or use the Inspector panel

### Adding Scenes

- Click "+ Add Scene" in the Table view
- New scenes automatically get at least one shot created
- Assign shots to scenes using the Scene dropdown in the table

### Storyboard Frames

- Drag and drop images onto shot cards in the Storyboard view
- Multiple frames per shot are supported


### Views

- **Table**: Best for detailed editing, bulk operations, and data entry. Features compact mode toggle (text button), scene grouping, inline editing, and auto-resizing textareas. Columns: Shot, Thumbnail, Script, General Notes.
- **Storyboard**: Best for visual review and quick reordering. Features multi-select, keyboard navigation, and image carousel.
- **Animatics**: Preview your storyboard as a timed animatic, adjust shot durations, zoom on the timeline, and export to video.


### Import/Export

- **Import**: CSV, ZIP, IndexedDB, or Images from the Import menu
  - ZIP import includes images from the exported ZIP file
- **Export**: 
  - **IndexedDB** (recommended): Complete database backup
  - **ZIP**: Full backup with all images included
  - **CSV**: Shot list only
  - **PDF**: Export as storyboard sheets
  - **WebM Video**: Export animatics as video
- **Delete All Content**: Available in three-dot menu with confirmation dialog. Options: Delete All Content, Export and Delete All Content, Cancel

## Data Model

All data is stored locally in IndexedDB. The canonical data structure includes:

- **Project**: Title, FPS, aspect ratio, notes
- **Sequences** (optional): Grouping for scenes
- **Scenes**: Scene numbers, titles, summaries
- **Shots**: Shot codes, script text, general notes, tags, scene assignment
- **Storyboard Frames**: Images, captions, overlay data

## Keyboard Shortcuts

- **Cmd/Ctrl+Z**: Undo
- **Cmd/Ctrl+Shift+Z** or **Cmd/Ctrl+Y**: Redo
- **Cmd/Ctrl+Arrow Up/Down**: Move selected shots up/down (in both views)
- **Arrow Up/Down**: Navigate between shots (Storyboard view)
- **Arrow Left/Right**: Navigate to previous/next frame (Animatics view)
- **Spacebar**: Play/pause (Animatics view, when not typing)
- **Cmd/Ctrl+Click**: Multi-select shots (Storyboard view)
- **Shift+Click**: Range select shots (Storyboard view)


## Agent Integration (MCP + Companion Server)

This storyboard tool can be controlled by AI agents via a local companion server that exposes an MCP (Model Context Protocol) interface and live WebSocket sync to the PWA.

### Architecture

```
┌─────────────┐    WebSocket     ┌──────────────────┐    File System    ┌─────────────────┐
│   PWA        │◄───────────────►│ Companion Server │◄────────────────►│ Markdown Files  │
│ (Browser)    │   live sync     │  (Node.js)       │   read/write     │ on disk         │
└─────────────┘                  └──────────────────┘                  └─────────────────┘
                                        ▲
                                        │ MCP (stdio)
                                        ▼
                                 ┌──────────────┐
                                 │  AI Agent    │
                                 │  (Cursor,    │
                                 │   Claude,    │
                                 │   etc.)      │
                                 └──────────────┘
```

### Quick Start

**1. Start the companion server** pointing to a project folder:

```bash
npx tsx server/index.ts --project /path/to/my-storyboard
```

This starts:
- WebSocket server on `ws://localhost:9800` (live sync)
- Asset server on `http://localhost:9801` (image serving)
- File watcher for automatic change detection

**2. Open the PWA** in Chrome/Edge. It auto-connects to the companion server and loads the project.

**3. The agent** uses MCP tools (via stdio) or edits markdown files directly. Changes sync to the PWA in real-time.

### Markdown Project Format

Projects are stored as plain markdown files — easy for agents to read and edit:

```
my-storyboard/
├── project.md           # Project metadata (title, fps, aspect ratio, notes)
├── scene-001.md         # One file per scene
├── scene-002.md
└── assets/              # Media files
    └── sc001-sh010-f01.png
```

**`project.md`** uses YAML frontmatter for metadata, with sections for Style Notes, Reference Links, and Global Notes.

**`scene-NNN.md`** contains scene metadata in frontmatter, a scene summary, and shots as `###` headings:

```markdown
<!-- shot: {"id":"k7x2m","tags":["wide"]} -->
### 2s: Wide shot - city skyline

Script text describing the action.

> Camera direction and general notes.

![frame](assets/sc001-sh010-f01.png "Caption")
```

### MCP Tools

Eight tools are available for structured operations:

| Tool | Purpose |
|------|---------|
| `storyboard_read` | Read project state (all, project, scenes, shots, frames) |
| `storyboard_write` | Batch create/update/delete operations |
| `storyboard_reorder` | Reorder scenes, shots, or frames |
| `storyboard_import` | Import from JSON or CSV |
| `storyboard_export` | Export to JSON or CSV |
| `storyboard_timeline` | Get computed timeline or set shot durations |
| `storyboard_assets` | List, add, or delete assets in the assets/ folder |
| `storyboard_sync` | Control sync state (status, pull, push, watch/unwatch) |

### When to Edit Files vs Use MCP Tools

**Edit markdown files directly** for bulk text changes, find-and-replace, adding/removing entire scenes, or restructuring. The file watcher picks up changes within ~500ms.

**Use MCP tools** for atomic batch operations with validation, reading computed state (timeline), managing binary assets, or triggering immediate sync.

### Agent Skill File

A comprehensive skill file is available at `.agents/skills/storyboard/SKILL.md` with:
- Full markdown format specification
- Data model reference
- All MCP tool schemas with examples
- Best practices and common workflow patterns

Point your agent to this file for complete documentation.

### Common Agent Workflows

**Create a storyboard from a script:**
1. Parse the script into scenes and shots
2. Write `scene-NNN.md` files with shot headings, script text, and durations
3. Call `storyboard_sync("pull")` to load into the companion

**Generate and attach images:**
1. `storyboard_read("shots")` to get all shots
2. Generate images from script text
3. `storyboard_assets("add", { data, filename, shot_id })` for each

**Adjust animatic timing:**
1. `storyboard_timeline("get_timeline")` to see current timing
2. `storyboard_timeline("set_durations", { "sh1": 3000, "sh2": 1500 })`

### Server Options

```bash
npx tsx server/index.ts --project /path/to/project [options]

Options:
  --ws-port <port>      WebSocket port (default: 9800)
  --asset-port <port>   Asset server port (default: 9801)
  --debounce <ms>       File watcher debounce (default: 300)
```

## Browser Support

Modern browsers with IndexedDB support:
- Chrome/Edge (latest)