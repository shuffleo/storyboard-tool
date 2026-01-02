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
2. Look for the install icon in the address bar (or click the three-dot menu)
3. Click "Install" or "Install App" when prompted
4. The app will be added to your applications and can be launched like a native app

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


## Browser Support

Modern browsers with IndexedDB support:
- Chrome/Edge (latest)