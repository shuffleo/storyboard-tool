# Storyboard App - Implementation Guide

## Overview
This is a local-first web application for animation project management. All data persists in IndexedDB, and the app runs entirely in the browser with no backend.

## Architecture

### State Management
- **Zustand Store** (`src/store/useStore.ts`): Single source of truth for all project data
- **IndexedDB** (`src/db/indexeddb.ts`): Local persistence layer
- **History System**: Undo/Redo with 50 action limit

### Styling
- **Tailwind CSS**: Utility-first CSS framework
- **Dark Mode**: Explicitly forced to light mode in `src/index.css` to prevent system dark mode from causing UI issues (white text on white background)

### Views
1. **TableView** (`src/views/TableView.tsx`): Spreadsheet-like view for editing shots with scene grouping, compact mode, and bulk operations
2. **StoryboardView** (`src/views/StoryboardView.tsx`): Card-based visual storyboard with multi-select, keyboard navigation, and image carousel

## Critical Implementation Details

### Reordering System (IMPORTANT - DO NOT BREAK)

#### How It Works
- **NO drag-and-drop**: We use up/down arrow buttons instead
- **Store Function**: `reorderShots(shotIds: string[])` in `useStore.ts`
- **Auto-updates**: Shot codes are automatically recalculated when order changes

#### Implementation Pattern
```typescript
// 1. Get current order
const currentIndex = sortedShots.findIndex((s) => s.id === shotId);

// 2. Calculate new index
const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

// 3. Reorder array
const newOrder = Array.from(sortedShots.map((s) => s.id));
const [removed] = newOrder.splice(currentIndex, 1);
newOrder.splice(newIndex, 0, removed);

// 4. Call store function (this updates shot codes automatically)
reorderShots(newOrder);
```

#### Where Arrow Buttons Are Located
- **TableView**: Second column (after checkbox), in `ShotRow` component
- **StoryboardView**: Top-left of each card, next to shot code

#### CRITICAL: When Refactoring
- ✅ DO: Keep `handleMoveShot` function
- ✅ DO: Keep `canMoveUp` and `canMoveDown` props
- ✅ DO: Keep `onMoveUp` and `onMoveDown` callbacks
- ❌ DON'T: Remove arrow button UI elements
- ❌ DON'T: Remove `reorderShots` calls
- ❌ DON'T: Add drag-and-drop back (it doesn't work)

### TableView Structure

#### Key Components
1. **TableView** (main component)
   - Manages: cell editing, batch selection, image uploads
   - State: `selectedCell`, `editingCell`, `selectedRows`, `currentImageIndex`
   - **Sorting**: Scenes by `sceneNumber`, Shots by `sceneNumber` then `shotCode`

2. **ShotRow** (row component)
   - Props: `canMoveUp`, `canMoveDown`, `onMoveUp`, `onMoveDown` (for reordering)
   - Renders: checkbox, arrows, shot code, scene, script, thumbnail, actions

3. **ImageThumbnail** (thumbnail component)
   - Handles: multiple images, navigation arrows, hover preview
   - Shows image count (e.g., "1/3") in bottom overlay (no "Replace" text)
   - Navigation arrows are outside the image area for better accessibility

#### Column Structure (DO NOT CHANGE ORDER)
1. Checkbox (batch selection) - Hidden in compact mode
2. **Arrow buttons** (up/down for reordering) - CRITICAL, Hidden in compact mode
3. Shot code
4. Thumbnail (with external navigation arrows) - Shows image count (e.g., "1/3") without "Replace" overlay
5. Script
6. General Notes (editable textarea, like Script)
7. Actions (info icon + trash icon) - Hidden in compact mode

**Note**: Scene column was removed - scene information is shown in section headers instead.

#### Important Functions
- `handleMoveShot`: Moves a shot up/down in order
- `handleBatchMove`: Moves multiple selected shots up/down (Cmd/Ctrl+Arrow keys)
- `handleCellClick`: Starts editing a cell
- `handleCellBlur`: Saves cell changes
- `handleImageUpload`: Handles multiple image uploads
- `handleImageIndexChange`: Changes which image is displayed
- `handleImageHover`: Shows preview after 0.8-second hover
- `handleAddRowToScene`: Adds a new shot to a specific scene

### StoryboardView Structure

#### Key Components
1. **StoryboardView** (main component)
   - Manages: layout, density, selection, keyboard navigation, image carousel
   - State: `selectedShots`, `focusedIndex`, `layout`, `density`, `currentImageIndex`
   - Features: Add Shot/Scene buttons, multi-select, keyboard navigation
   - **Sorting**: Shots by `sceneNumber` then `shotCode`

2. **Card Component** (inline, not separate)
   - Contains: arrow buttons, shot code, scene badge, image (with carousel), script
   - Removed: status label, duration display

#### Important Functions
- `handleMoveShot`: Moves a shot up/down (same as TableView)
- `handleCardClick`: Handles multi-select (Cmd/Ctrl+Click, Shift+Click)
- `handleMoveSelected`: Moves multiple selected shots with arrow keys
- `handleImageUpload`: Opens file picker for image upload
- `handleImageDrop`: Handles drag-and-drop image uploads
- Image carousel: Navigation arrows outside image area for better accessibility

#### Arrow Button Location
- Top-left of each card, before shot code
- Vertical stack (up arrow on top, down arrow below)

### Text Field Editing

#### Keyboard Shortcuts (CRITICAL - DO NOT BREAK)
All text fields MUST allow standard shortcuts:
- Cmd/Ctrl+A: Select all
- Cmd/Ctrl+C: Copy
- Cmd/Ctrl+V: Paste
- Cmd/Ctrl+X: Cut
- Cmd/Ctrl+Z: Undo

#### Implementation Pattern
```typescript
onKeyDown={(e) => {
  // Allow standard keyboard shortcuts
  if ((e.metaKey || e.ctrlKey) && ['a', 'c', 'v', 'x', 'z'].includes(e.key.toLowerCase())) {
    return; // Let browser handle these
  }
  // ... custom handlers
}}
```

#### Where This Applies
- Shot code input
- Script textarea
- Scene name input
- Any editable text field

### Image Management

#### Multiple Images Per Shot
- Each shot can have multiple storyboard frames
- `currentImageIndex` state tracks which image is displayed (Map<string, number>)
- Navigation arrows appear outside image area for better accessibility
- Hover preview shows after 0.8 seconds (800ms)
- TableView: Arrows on left/right of thumbnail
- StoryboardView: Arrows below image area

#### Image Upload
- Click "No image" or existing image to upload
- Supports multiple file selection
- Drag-and-drop also works for images
- Image count overlay shows "1/3" format (no "Replace" text in table view)
- Storyboard view: No "click to replace" hover text (images still clickable)

### Batch Operations

#### Selection
- Checkbox in first column (hidden in compact mode)
- `selectedRows` state tracks selected shots
- Batch actions appear when rows are selected

#### Available Actions
- Arrow up/down buttons (between "n selected" and "Move to scene...")
- Move to scene (dropdown)
- Delete (trash icon button)
- Keyboard: Cmd/Ctrl+Arrow Up/Down to move selected shots

### Scene Management

#### Scene 0
- All new shots are assigned to Scene 0 by default
- Scene 0 is auto-created if it doesn't exist
- Located in `createShot` function in `useStore.ts`

#### Scene Editing
- Scene names are editable inline in grouped view
- Click scene header to edit
- "+ Add Row" button in each scene section adds shots to that scene

#### Sorting
- **CRITICAL**: Scenes are sorted by `sceneNumber` (as number, low to high)
- **CRITICAL**: Shots are sorted by `sceneNumber` first, then by `shotCode` (as number, low to high)
- Shots within each scene are sorted by `shotCode` (as number, low to high)
- Sorting updates automatically when shots/scenes are added or modified
- Unassigned shots (no sceneId) appear last

### Compact Mode (TableView)

#### Features
- Toggle in top bar
- Hides: checkbox column, arrow buttons column, actions column
- Reduces row heights and padding
- Maintains all editing functionality

### Inspector Panel

#### Shot Fields (Removed)
- Status (removed from both card and side panel)
- Camera Notes (removed)
- Animation Notes (removed)
- Duration (seconds) (removed)

#### Remaining Fields
- Shot Code
- Scene (dropdown selector - NEW)
- Script Text
- Tags
- General Notes

## Common Refactoring Mistakes to Avoid

### ⚠️ CRITICAL: Removing Conditional Rendering

**When removing conditional rendering, ALWAYS remove BOTH branches completely.**

**WRONG** (causes syntax error):
```tsx
{groupByScene ? (
  Array.from(shotsByScene.entries()).map(...)
) : (
  // ❌ Removing conditional but leaving code = SYNTAX ERROR
  sortedShots.map((shot) => {
    const index = ...;  // Orphaned code!
    return <ShotRow ... />
  })
)}
```

**CORRECT**:
```tsx
{/* Always group by scene - no conditional */}
{Array.from(shotsByScene.entries()).map(([sceneId, sceneShots]) => {
  // All code properly inside map callback
  return (...);
})}
```

**See `REFACTORING_GUIDE.md` for detailed examples and rules.**

### ❌ DO NOT:
1. Remove arrow buttons when "cleaning up" drag-and-drop code
2. Remove `handleMoveShot` function
3. Remove `canMoveUp`/`canMoveDown` props
4. Remove `onMoveUp`/`onMoveDown` callbacks
5. Block keyboard shortcuts in text fields
6. Remove `reorderShots` calls (shot codes won't update)
7. Change column order in TableView
8. Remove image navigation arrows
9. Remove hover preview functionality
10. Remove batch selection checkboxes
11. Remove scene grouping (always enabled)
12. Change hover preview delay from 0.8 seconds

### ✅ DO:
1. Keep all reordering logic intact
2. Preserve keyboard shortcut handling
3. Maintain image management features
4. Keep batch operations working
5. Test reordering after any changes
6. Verify shot codes update correctly
7. Check that arrow buttons are visible and functional

## Testing Checklist

After any refactoring, verify:
- [ ] Arrow buttons appear in TableView (hidden in compact mode)
- [ ] Arrow buttons appear in StoryboardView
- [ ] Clicking up/down arrows moves shots
- [ ] Shot codes update after reordering
- [ ] Text fields support Cmd+A, Cmd+C, Cmd+V, etc.
- [ ] Multiple images can be uploaded
- [ ] Image navigation arrows work (outside image area)
- [ ] Image count overlay shows (e.g., "1/3") without "Replace" text in table view
- [ ] Storyboard view has no "click to replace" hover text
- [ ] Hover preview appears after 0.8 seconds
- [ ] Batch selection works
- [ ] Batch delete works
- [ ] Batch move with Cmd/Ctrl+Arrow keys works
- [ ] Scene 0 is created automatically
- [ ] Scenes are always grouped and sorted correctly
- [ ] "+ Add Row" button appears in each scene section
- [ ] Compact mode hides appropriate columns (checkbox, arrows, actions)
- [ ] Storyboard view has Add Shot/Scene buttons
- [ ] Storyboard view has image carousel navigation
- [ ] Table view columns: Shot, Thumbnail, Script, General Notes (no Scene column)
- [ ] General Notes column is editable (like Script)
- [ ] Inspector panel shows Scene selector dropdown for shots
- [ ] ZIP export includes JSON and all images
- [ ] ZIP import works and restores images
- [ ] Import confirmation dialog appears (Replace vs Add)
- [ ] Dark mode doesn't break UI (forced light mode styling)

## File Structure

```
src/
├── store/
│   └── useStore.ts          # Zustand store - single source of truth
├── db/
│   └── indexeddb.ts         # IndexedDB persistence
├── views/
│   ├── TableView.tsx        # Spreadsheet view
│   └── StoryboardView.tsx   # Card view
├── components/
│   ├── TopBar.tsx           # Top navigation
│   └── Inspector.tsx        # Side panel for editing
└── types.ts                 # TypeScript definitions
```

## Import/Export

### Export Formats
- **JSON**: Full project data (no images)
- **ZIP**: Full project data with all images included (recommended for backups)
- **CSV**: Shot list only
- **PDF**: Storyboard sheets

### Import Formats
- **JSON**: Project data (no images)
- **ZIP**: Project data with images (extracts images from ZIP and restores them)
- **CSV**: Shot list import
- **Images**: Multiple images imported as separate shots in Scene 0

### Import Behavior
- All imports show a confirmation dialog: "Replace all existing content?"
  - **OK**: Replaces all existing data
  - **Cancel**: Adds to existing data (merges)
- ZIP import extracts images from `images/` folder and restores base64 data
- Image mapping file (`image-mapping.json`) links frame IDs to image filenames

## Key Dependencies

- `zustand`: State management
- `nanoid`: Unique ID generation
- `jszip`: ZIP file creation and extraction for export/import

## Notes

- All data is stored locally in IndexedDB
- No backend or API calls
- Undo/Redo supports up to 50 actions
- Shot codes are auto-generated based on order (010, 020, 030, etc.)
- Scene 0 is the default scene for all new shots
- Table view always groups by scene (toggle removed)
- Scenes and shots are automatically sorted by orderIndex
- Image carousel arrows are outside image area for better accessibility
- Hover preview delay is 0.8 seconds (800ms)
- Compact mode available in Table view
- Status, Camera Notes, Animation Notes, and Duration removed from UI
- Scene column removed from table (shown in section headers instead)
- General Notes column added to table (editable like Script)
- Scene selector added to Inspector panel
- ZIP export/import with images supported
- Dark mode styling forced to light mode to prevent UI issues
- Image count overlay improved (removed "Replace" text, better visibility)

