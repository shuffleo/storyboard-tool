# Storyboard App - Implementation Guide

## Overview
This is a local-first web application for animation project management. All data persists in IndexedDB, and the app runs entirely in the browser with no backend.

## Architecture

### State Management
- **Zustand Store** (`src/store/useStore.ts`): Single source of truth for all project data
- **IndexedDB** (`src/db/indexeddb.ts`): Local persistence layer
- **History System**: Undo/Redo with 100 action limit

### Styling
- **Tailwind CSS**: Utility-first CSS framework
- **Brutal Mode**: Bold, high-contrast design enabled by default
- **Dark Mode**: Explicitly forced to dark mode in `src/index.css` with neutral grayscale palette (slate colors)

### Views
1. **TableView** (`src/views/TableView.tsx`): Spreadsheet-like view for editing shots with scene grouping, compact mode, and bulk operations
2. **StoryboardView** (`src/views/StoryboardView.tsx`): Card-based visual storyboard with multi-select, keyboard navigation, drag-and-drop reordering, and image carousel
3. **AnimaticsView** (`src/views/AnimaticsView.tsx`): Timeline-based playback with video player, Inspector panel, keyboard shortcuts, zoom controls, and frame editing

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
   - Manages: layout, density, selection, keyboard navigation, image carousel, drag-and-drop
   - State: `selectedShots`, `focusedIndex`, `layout`, `density`, `currentImageIndex`, `dragShotId`
   - Features: Drag-and-drop reordering, multi-select, keyboard navigation
   - **Sorting**: Shots by `sceneNumber` then `shotCode`
   - **Removed**: Add Shot/Scene buttons (hidden in Storyboard view)

2. **Card Component** (inline, not separate)
   - Contains: arrow buttons, shot code, scene badge, image (with carousel), script
   - Removed: status label, duration display

#### Important Functions
- `handleMoveShot`: Moves a shot up/down (same as TableView)
- `handleCardClick`: Handles multi-select (Cmd/Ctrl+Click, Shift+Click) with validation and error handling
- `handleCardDragStart`: Starts drag operation for shot reordering
- `handleCardDrag`: Handles drag operation, validates scene matching
- `handleMoveSelected`: Moves multiple selected shots with arrow keys
- `handleImageUpload`: Opens file picker for image upload (with error handling)
- `handleImageDrop`: Handles drag-and-drop image uploads (with error handling)
- Image carousel: Navigation arrows outside image area for better accessibility

#### Arrow Button Location
- Top-left of each card, before shot code
- Vertical stack (up arrow on top, down arrow below)

### Text Field Editing

#### Auto-Resizing Textareas
- Script and General Notes fields use `AutoResizeTextarea` component
- Automatically grows to fit content (minimum 4rem height)
- Resizes in real-time as user types
- Prevents text field from shrinking when clicked

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
- Script textarea (auto-resizing)
- General Notes textarea (auto-resizing)
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

### Delete Shot/Scene Dialog

#### Last Shot Deletion
- When deleting the last shot in a scene, a modal dialog appears with 3 options:
  - "Delete row only" - Deletes only the shot
  - "Delete row and scene" - Deletes both the shot and the scene
  - "Cancel" - Cancels the deletion
- For non-last shots, a simple confirmation dialog appears
- Implemented in `TableView.tsx` with `deleteDialog` state
- Store's `deleteShot` function simplified to only handle deletion (no dialogs)

### Scene Management

#### Default Project Initialization
- New projects start with 3 scenes, each with 5 shots
- No project should start empty
- Located in `init` function in `useStore.ts`

#### Scene 0
- All new shots are assigned to Scene 0 by default
- Scene 0 is auto-created if it doesn't exist
- Located in `createShot` function in `useStore.ts`

#### Scene Creation
- When creating a new scene, at least one shot is automatically created for it
- Located in `createScene` function in `useStore.ts`

#### Scene Editing
- Scene names are editable inline in grouped view
- Click scene header to edit
- "+ Add Row" button in each scene section adds shots to that scene
- Scene header row spans edge-to-edge (no white gap for actions column)

#### Sorting
- **CRITICAL**: Scenes are sorted by `sceneNumber` (as number, low to high)
- **CRITICAL**: Shots are sorted by `sceneNumber` first, then by `shotCode` (as number, low to high)
- Shots within each scene are sorted by `shotCode` (as number, low to high)
- Sorting updates automatically when shots/scenes are added or modified
- Unassigned shots (no sceneId) appear last

### Compact Mode (TableView)

#### Features
- Text button toggle in top bar (matches StoryboardView style)
- Shows "Compact" when in detailed mode, "Detailed" when in compact mode
- Hides: checkbox column, arrow buttons column, actions column
- Reduces row heights and padding
- Maintains all editing functionality

### Inspector Panel

#### Shot Fields (Removed)
- Status (removed from both card and side panel)
- Camera Notes (removed)
- Animation Notes (removed)

#### Remaining Fields
- Shot Code (moved to header, editable inline)
- Scene (dropdown selector with 4px margin on arrow)
- Duration (milliseconds, minimum 300ms) - shown in Inspector only
- Script Text
- Tags
- General Notes
- Image Carousel (NEW): Shows all images with navigation, delete, and "Set as main" options

#### Header Layout
- Shot Code field moved to header next to "Shot" label
- Close button with proper spacing (gap-3)
- Close button hidden in Animatics view

### Undo/Redo System

#### History Management
- Supports up to 100 actions in history
- `pushHistory()` is called before state changes
- `undo()` and `redo()` restore previous states without saving
- `canUndo` and `canRedo` flags track available actions
- Fixed: `redo` now correctly calculates `canRedo` based on history position

### Error Handling and Click Safety

#### Blank Screen Prevention
- All `onSelect` calls wrapped in try-catch blocks
- Null/undefined checks before accessing frame/shot properties
- Validation of `id` and `type` parameters before state updates
- Event propagation properly stopped to prevent conflicts
- Invalid frame/shot data skipped during rendering

#### Click Handler Safety
- **AnimaticsView**: Frame clicks validated, drag/resize conflicts prevented
- **StoryboardView**: Card clicks ignore buttons/SVGs, bounds checking for array access
- **TableView**: Shot selection validated before calling `onSelect`
- **App.tsx**: `handleSelect` validates parameters before updating state

### AnimaticsView Structure

#### Key Components
1. **Timeline**: Time ruler (hidden scrollbar) and timeline track (visible scrollbar) with synchronized scrolling
2. **Video Player**: Displays current frame image with error handling
3. **Playback Controls**: Play/pause, seek, zoom controls
4. **Inspector Panel**: Reuses same Inspector component as other views

#### Important Functions
- `handleFrameClick`: Validates frame before selecting (prevents blank screen)
- `handleImageUpload` (AnimaticsView): Replaces corrupted images via file input dialog
- `handleImageError` (AnimaticsView): Detects corrupted images and stores frame ID for replacement
- Debug Logger: Comprehensive logging with categories, levels, timestamps, and error stack traces
- `handleShotDragStart`: Validates frame before starting drag
- `handleResizeStart`: Validates frame before starting resize
- `currentFrame`: Validates timeline frames, skips invalid entries
- `currentFrameImage`: Try-catch wrapped, handles missing images gracefully

#### Scrollbar Management
- Time ruler scrollbar hidden via CSS (`scrollbar-hide` class)
- Timeline track scrollbar visible
- Scroll events synchronized bidirectionally

## Common Refactoring Mistakes to Avoid

### ⚠️ CRITICAL: React Hooks and Temporal Dead Zone Errors

**NEVER reference variables in hooks before they are declared/initialized.**

#### The Mistake: Temporal Dead Zone Error
When adding `useEffect` hooks that depend on computed values, ensure those values are available when the hook runs.

**WRONG** (causes "Cannot access 'item' before initialization"):
```tsx
// ❌ BAD: useEffect references 'item' before it's declared
React.useEffect(() => {
  if (selectedType === 'shot' && item) {  // ERROR: item not declared yet!
    const shot = item as Shot;
    setDurationValue(String(shot.duration || ''));
  }
}, [selectedId, selectedType, item]);  // ERROR: item in dependency array

// Early return
if (!selectedId || !selectedType) {
  return <div>No selection</div>;
}

// item is declared here (too late!)
let item: Shot | null = null;
if (selectedType === 'shot') {
  item = shots.find(s => s.id === selectedId) || null;
}
```

**ALSO WRONG** (violates React hooks rules):
```tsx
// Early return
if (!selectedId || !selectedType) {
  return <div>No selection</div>;
}

// ❌ BAD: Hook after early return = conditional hook call
let item: Shot | null = null;
if (selectedType === 'shot') {
  item = shots.find(s => s.id === selectedId) || null;
}

React.useEffect(() => {
  // This hook is called conditionally (after early return)
  // Violates React's rules of hooks!
}, [item]);
```

**CORRECT** (look up value directly from store/state):
```tsx
// ✅ GOOD: Look up value directly, hooks before early return
React.useEffect(() => {
  if (selectedType === 'shot' && selectedId) {
    // Look up directly from store instead of using 'item'
    const shot = shots.find(s => s.id === selectedId);
    if (shot) {
      setDurationValue(String(shot.duration || ''));
      setDurationError(false);
    }
  }
}, [selectedId, selectedType, shots]);  // Use store values, not computed 'item'

// Early return AFTER all hooks
if (!selectedId || !selectedType) {
  return <div>No selection</div>;
}

// item computed here (for use in JSX, not in hooks)
let item: Shot | null = null;
if (selectedType === 'shot') {
  item = shots.find(s => s.id === selectedId) || null;
}
```

#### Rules to Follow:
1. **All hooks must be called unconditionally** at the top level, before any early returns
2. **Never reference computed variables in hooks** that are declared later in the component
3. **Use store/state values directly** in hook dependencies instead of computed values
4. **If you need a computed value in a hook**, compute it inside the hook using the raw dependencies

#### Callback Memoization
**ALWAYS memoize callbacks passed as props** to prevent infinite re-render loops.

**WRONG** (causes infinite loops):
```tsx
// ❌ BAD: handleSelect recreated on every render
const handleSelect = (id: string, type: string) => {
  setSelectedId(id);
  setSelectedType(type);
};

// In child component:
useEffect(() => {
  onSelect(currentFrame.shotId, 'shot');  // Runs every render!
}, [currentFrame?.shotId, onSelect]);  // onSelect changes every render
```

**CORRECT**:
```tsx
// ✅ GOOD: Memoized with useCallback
const handleSelect = useCallback((id: string, type: string) => {
  setSelectedId(id);
  setSelectedType(type);
}, [selectedId, selectedType]);  // Only recreate when these change
```

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
- [ ] Textareas auto-resize to fit content (Script and General Notes)
- [ ] Delete last shot shows 3-option dialog (Delete row only / Delete row and scene / Cancel)
- [ ] Compact mode toggle is a text button (not checkbox)
- [ ] Undo/Redo works correctly for all actions (100 action limit)
- [ ] New projects start with 3 scenes and 5 shots each
- [ ] New scenes automatically get at least one shot
- [ ] Click handlers don't cause blank screens (Animatics, Storyboard, Table views)
- [ ] Image error handling shows error message instead of blank screen
- [ ] Animatics view loads without "Cannot access before initialization" errors
- [ ] Inspector component doesn't crash when switching views
- [ ] No infinite re-render loops when selecting items in Animatics view
- [ ] Scrollbar sync works in Animatics view (time ruler hidden, timeline visible)
- [ ] Drag-and-drop works in Storyboard and Animatics views with scene dimming
- [ ] Inspector panel shot code in header works correctly
- [ ] Inspector panel image carousel works (navigation, delete, set main)
- [ ] Delete All Content feature works with confirmation dialog
- [ ] Actions column heading is hidden in Table view

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
- **ZIP**: Full project data with all images included (recommended for backups)
- **CSV**: Shot list only
- **PDF**: Storyboard sheets

### Import Formats
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
- Auto-resizing textareas for Script and General Notes fields
- Delete shot/scene dialog with 3 options for last shot in scene
- Compact mode toggle changed from checkbox to text button (matches StoryboardView)
- Undo/Redo system fixed to correctly track history (100 action limit)
- Default project initialization: 3 scenes with 5 shots each
- New scenes automatically create at least one shot
- Click handler safety: All handlers validated to prevent blank screen crashes
- Error handling: Comprehensive null checks and try-catch blocks
- Scrollbar sync: Time ruler scrollbar hidden, timeline scrollbar visible and synchronized
- Drag-and-drop: Storyboard and Animatics views support drag reordering with scene dimming
- Inspector improvements: Shot code in header, image carousel, proper spacing
- Delete All Content: Available in three-dot menu with confirmation dialog
- Actions column: Heading hidden, column still functional
- Debug Panel: Persistent debug logging system with React Portal rendering (always visible, even during crashes)
- Debug Logger: Custom logging system with categories, levels, timestamps, and persistent storage
- React Hooks Fix: Fixed conditional hook calls in Inspector component (image carousel state management)
- Corrupted Image Handling: Animatics view detects corrupted images and provides "Upload New Image" button to replace them
- Verbose Logging: Comprehensive logging throughout critical UI interaction points for debugging

