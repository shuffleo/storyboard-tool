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

When you first open the app, a default project is created with 3 scenes, each containing 5 shots. You can edit the project details in the Inspector panel.

### Adding Shots

- Click "+ Add Shot" in the Table view
- Shots are automatically numbered (010, 020, 030...)
- Edit shot details inline in the table or use the Inspector panel

### Adding Scenes

- Click "+ Add Scene" in the Table view
- New scenes automatically get at least one shot created
- Assign shots to scenes using the Scene dropdown in the table
- When deleting the last shot in a scene, you'll be asked if you want to delete the scene as well

### Storyboard Frames

- Drag and drop images onto shot cards in the Storyboard view
- Or use the Inspector to add frames to a selected shot
- Multiple frames per shot are supported

### Reordering Shots

- **Table View**: Use arrow buttons or multi-select with Cmd/Ctrl+Arrow keys
- **Storyboard View**: Use arrow buttons or multi-select with Cmd/Ctrl+Arrow keys
- Shots are automatically sorted by scene (low to high) and within each scene by order (low to high)

### Views

- **Table**: Best for detailed editing, bulk operations, and data entry. Features compact mode toggle (text button), scene grouping, inline editing, and auto-resizing textareas. Columns: Shot, Thumbnail, Script, General Notes.
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
- **Cmd/Ctrl+Click**: Multi-select shots (Storyboard view)
- **Shift+Click**: Range select shots (Storyboard view)

## UI Features

### Auto-Resizing Text Fields
- Script and General Notes textareas automatically grow to fit content
- Minimum height of 4rem, expands as you type
- Prevents text fields from shrinking when clicked

### Delete Shot/Scene
- Deleting the last shot in a scene shows a dialog with options:
  - Delete row only
  - Delete row and scene
  - Cancel
- Deleting other shots shows a simple confirmation

### Compact Mode
- Toggle between Compact and Detailed views in Table view
- Text button toggle (matches StoryboardView style)
- Hides checkbox, arrow buttons, and actions columns in compact mode

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

## Google Drive Integration

The app supports Google Drive as a backend storage option. When connected, your project data syncs to Google Sheets and images are stored in scene-named folders on Google Drive.

### Setup

1. **Create Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the following APIs:
     - Google Drive API
     - Google Sheets API

2. **Create OAuth 2.0 Credentials**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - Add your domain to "Authorized JavaScript origins"
   - Copy the Client ID

3. **Get API Key**:
   - In "Credentials", create an API Key
   - Restrict it to Google Drive API and Google Sheets API (optional but recommended)

4. **Configure Environment Variables**:
   Create a `.env` file in the project root:
   ```
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=your-api-key
   ```

5. **Connect in App**:
   - Click the three-dot menu (⋮) in the top bar
   - Select "Connect to GDrive"
   - Authorize the app when prompted

### How It Works

- **Google Sheets**: Project table data (shots, scenes, script text, notes) syncs to a Google Sheet named "{Project Title} - Storyboard"
- **Google Drive Folders**: Images are organized in folders:
  - Main folder: "{Project Title} - Images"
  - Scene folders: "Scene {Number}: {Title}"
  - Images are named: "shot-{Code}-frame-{Index}.png"

The "Saved" time in the menu reflects the last Google Drive sync time when connected, otherwise it shows the local save time.

## License

MIT

