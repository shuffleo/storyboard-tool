# Data Storage Guide

## Where is the data stored?

The Storyboard app uses **IndexedDB** to store all project data locally in your browser. This is a browser-based database that persists data on your local machine.

## IndexedDB Location on macOS

The exact location depends on which browser you're using:

### Google Chrome
```
~/Library/Application Support/Google/Chrome/Default/IndexedDB/
```
Or for specific profiles:
```
~/Library/Application Support/Google/Chrome/Profile [X]/IndexedDB/
```

### Microsoft Edge
```
~/Library/Application Support/Microsoft Edge/Default/IndexedDB/
```

### Safari
```
~/Library/Safari/IndexedDB/
```

### Firefox
```
~/Library/Application Support/Firefox/Profiles/[profile]/storage/default/
```

## Database Name

The app uses the database name: **`storyboard-db`**

So the full path would be something like:
```
~/Library/Application Support/Google/Chrome/Default/IndexedDB/chrome_storyboard-db_0.indexeddb.leveldb/
```

## Important Notes

⚠️ **IndexedDB files are binary and not directly readable** - they're stored in a LevelDB format that requires special tools to read.

⚠️ **Don't manually edit IndexedDB files** - this can corrupt your data.

## How to Access Your Data

### Method 1: Export from the App (Recommended)
1. Open the Storyboard app
2. Click **Export** → **IndexedDB** or **ZIP**
3. This downloads a complete backup file with all your project data
4. IndexedDB format is JSON and can be opened in any text editor

### Method 2: Browser DevTools
1. Open the app in your browser
2. Press `F12` (or `Cmd+Option+I` on Mac) to open DevTools
3. Go to the **Application** tab (Chrome/Edge) or **Storage** tab (Firefox)
4. Expand **IndexedDB** → **storyboard-db**
5. You can view and export data from here

### Method 3: Find the Database Files
1. Open Finder
2. Press `Cmd+Shift+G` to open "Go to Folder"
3. Paste one of the paths above (replace `~` with your home directory)
4. Navigate to the `storyboard-db` folder
5. **Note**: The files are binary and not human-readable

## Backup Your Data

**Always use the Export feature** to create backups:
- Export to IndexedDB for complete database backup (JSON format)
- Export to ZIP for full backup with images included
- Export to CSV for shot list
- Export to PDF for storyboard sheets

## Data Structure

The exported JSON contains:
- `project`: Project metadata (title, FPS, aspect ratio, etc.)
- `sequences`: Sequence data
- `scenes`: Scene data (scene numbers, titles, summaries)
- `shots`: Shot data (shot codes, script text, duration, etc.)
- `frames`: Storyboard frame images (stored as base64 data URLs)

## Troubleshooting

### Can't find the database?
- Make sure you've saved at least one project in the app
- Check which browser you're using
- The database is created when you first use the app

### Want to reset/clear data?
1. Use browser DevTools → Application → IndexedDB → Delete database
2. Or use the Export feature to backup, then clear browser data

### Want to move data to another computer?
1. Export to ZIP (includes images) or IndexedDB on the old computer
2. Import ZIP or IndexedDB on the new computer
3. ZIP format is recommended as it includes all images in a single file
4. IndexedDB format provides a complete database backup (JSON format)

## Technical Details

- **Database Name**: `storyboard-db`
- **Version**: 1
- **Storage Type**: IndexedDB (browser-native)
- **Persistence**: Data persists until you clear browser data or delete the database
- **Size Limit**: Browser-dependent (typically several GB available)
- **Persistent Storage**: App requests persistent storage on initialization to reduce data loss risk
- **PWA Support**: Installable as Progressive Web App for better data protection and offline access

