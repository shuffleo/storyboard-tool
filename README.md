# Storyboard - Animation Pre-Production Tool

A **local-first, lightweight web application** for managing and iterating on animation projects during pre-production and animatic stages.

## Features

- **Single Source of Truth**: Edit once, see everywhere - all views are strictly synchronized
- **Two Synchronized Views**:
  - **Table View**: Spreadsheet-like editing with inline editing, scene grouping, compact mode, and bulk operations
  - **Storyboard View**: Card-based layout with multi-select, keyboard navigation, and image carousel
- **Local-First**: All data stored in IndexedDB, works fully offline
- **Auto-save**: Continuous autosave on every change
- **Import/Export**: JSON, CSV, ZIP (with images), PDF, and image import support
- **No Backend**: Runs entirely in the browser, perfect for GitHub Pages or local use

## Tech Stack

- React + TypeScript
- Vite for build tooling
- Zustand for state management
- IndexedDB for persistence
- Tailwind CSS for styling

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

The built files will be in the `dist` directory, ready for static hosting (GitHub Pages, Netlify, etc.).

## Usage

### Creating a Project

When you first open the app, a default project is created. You can edit the project details in the Inspector panel.

### Adding Shots

- Click "+ Add Shot" in the Table view
- Shots are automatically numbered (010, 020, 030...)
- Edit shot details inline in the table or use the Inspector panel

### Adding Scenes

- Click "+ Add Scene" in the Table view
- Assign shots to scenes using the Scene dropdown in the table

### Storyboard Frames

- Drag and drop images onto shot cards in the Storyboard view
- Or use the Inspector to add frames to a selected shot
- Multiple frames per shot are supported

### Reordering Shots

- **Table View**: Use arrow buttons or multi-select with Cmd/Ctrl+Arrow keys
- **Storyboard View**: Use arrow buttons or multi-select with Cmd/Ctrl+Arrow keys
- Shots are automatically sorted by scene (low to high) and within each scene by order (low to high)

### Views

- **Table**: Best for detailed editing, bulk operations, and data entry. Features compact mode, scene grouping, and inline editing. Columns: Shot, Thumbnail, Script, General Notes.
- **Storyboard**: Best for visual review and quick reordering. Features multi-select, keyboard navigation, and image carousel.

### Import/Export

- **Import**: JSON, CSV, ZIP, or Images from the Import menu
  - All imports ask: "Replace all existing content?" (OK = replace, Cancel = add to existing)
  - ZIP import includes images from the exported ZIP file
- **Export**: 
  - **ZIP** (recommended): Full backup with all images included
  - **JSON**: Full backup (no images)
  - **CSV**: Shot list only
  - **PDF**: Storyboard sheets

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

## Performance

Optimized for:
- ~500 shots
- ~2,000 storyboard frames
- Lazy-loaded thumbnails
- Efficient IndexedDB queries

## Browser Support

Modern browsers with IndexedDB support:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## License

MIT

