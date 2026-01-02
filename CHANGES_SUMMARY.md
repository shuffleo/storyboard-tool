# Changes Summary - January 2, 2025

## Summary of All Changes Made Today

### 1. PWA (Progressive Web App) Features
- **Service Worker**: Added `/public/sw.js` for offline caching and PWA functionality
- **Web App Manifest**: Added `/public/manifest.json` with app metadata, icons, and theme colors
- **Install Prompt**: Added "Install App" button in three-dot menu (white text color)
- **Persistent Storage**: Requested persistent storage on app initialization to reduce data loss risk
- **Service Worker Registration**: Only registers in production to avoid dev server 404 errors

### 2. Removed Google Drive Sync
- **TopBar Component**: Removed Google Drive connection/disconnection button and handlers
- **Store**: Removed all Google Drive state and functions:
  - `isGoogleDriveConnected`
  - `isGoogleSyncing`
  - `lastGoogleSync`
  - `connectGoogleDrive()`
  - `disconnectGoogleDrive()`
  - `syncToGoogleDrive()`
- **Documentation**: Removed Google Drive setup instructions from README.md
- **Cursor Docs**: Removed Google Drive references from IMPLEMENTATION.md

### 3. Made Brutal Mode the Default
- **Default Behavior**: Brutal mode (retro skin) now defaults to `true` if not set in localStorage
- **TopBar**: Removed toggle button (users can't disable it anymore)
- **App.tsx**: Updated initialization to default to Brutal mode
- **Styling**: Always applies `retro-skin` class on mount unless explicitly disabled in localStorage

### 4. Added IndexedDB Import/Export
- **New Functions**: Added `exportIndexedDB()` and `importIndexedDB()` in `src/utils/importExport.ts`
- **Export**: Exports complete database as JSON file with `-indexeddb.json` suffix
- **Import**: Imports IndexedDB backup and replaces all current data
- **UI**: Added "IndexedDB" option to both Import and Export modals
- **Documentation**: Updated DATA_STORAGE.md to mention IndexedDB export option

### 5. Changed Install App Button Color
- **Color Update**: Changed from `text-blue-400` to `text-slate-200` (white) to match other menu items

### 6. Made WebM Export Available from All Views
- **Removed Condition**: Removed `{currentView === 'animatics' &&` condition
- **Availability**: WebM Video export now shows in Export menu regardless of current view

### 7. Renamed MP4 to WebM Video
- **Button Label**: Changed "MP4 Video" to "WebM Video"
- **Error Messages**: Updated error messages to reference WebM instead of MP4
- **Function Comment**: Updated `exportAnimaticsToMP4()` function comment to mention WebM

### 8. Bug Fixes
- **TopBar Blank Screen**: Fixed `isGoogleSyncing is not defined` error that caused blank screen when opening three-dot menu
- **Service Worker 404**: Fixed Service Worker registration to only run in production

## Files Modified

### Source Files
- `src/components/TopBar.tsx` - Removed Google Drive, added IndexedDB import/export, removed Brutal mode toggle, fixed Install App color, made WebM available from all views
- `src/store/useStore.ts` - Removed all Google Drive functionality
- `src/utils/importExport.ts` - Added IndexedDB export/import functions, updated MP4 comment to WebM
- `src/App.tsx` - Made Brutal mode default
- `src/main.tsx` - Service Worker registration (production only)

### New Files
- `public/sw.js` - Service Worker for PWA
- `public/manifest.json` - Web App Manifest

### Documentation
- `README.md` - Removed Google Drive, added PWA features, updated export options (IndexedDB, WebM), added Brutal mode mention
- `cursor_docs/IMPLEMENTATION.md` - Removed Google Drive reference, added Brutal mode mention
- `cursor_docs/DATA_STORAGE.md` - Added PWA and persistent storage info, added IndexedDB export mention
- `tests/README.md` - Removed Google Drive test section, added IndexedDB/WebM export tests

## Testing Status
- All linter checks pass
- Unit tests don't reference removed features (Google Drive)
- Integration tests are placeholder tests, no updates needed
- E2E tests don't reference removed features

## Breaking Changes
- **Google Drive sync is completely removed** - Users who were using this feature will need to export their data before updating
- **Brutal mode is now always on by default** - Users can't disable it via UI (can still disable via localStorage)

## Migration Notes
- Users with Google Drive data should export before updating
- Users who had disabled Brutal mode will see it enabled on first load (can disable via localStorage if needed)
- IndexedDB export provides a new backup option for complete database backups

