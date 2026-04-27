# Technical Analysis: markdown-corkboard

**Repository**: [https://github.com/brsloan/markdown-corkboard](https://github.com/brsloan/markdown-corkboard)
**Analyzed**: 2026-04-27
**Commit**: `232e3ae` (latest as of analysis)

## Overview

Markdown Corkboard is a vanilla JavaScript web app for planning novels/stories/screenplays. It renders scene/chapter cards on a visual corkboard and stores everything as a plain-text markdown file that doubles as a readable outline. It was originally a component of the desktop app [WareWoolf](https://github.com/brsloan/warewoolf) and was extracted into a standalone browser tool.

**Codebase size**: ~900 lines across 4 source files. No build system, no dependencies, no framework.


| File                      | Lines | Role                                                            |
| ------------------------- | ----- | --------------------------------------------------------------- |
| `corkboard-controller.js` | 600   | UI controller: rendering, events, keyboard shortcuts, save/load |
| `corkboard-view.js`       | 88    | Parser: markdown ↔ card array serialization                     |
| `utils.js`                | 64    | DOM helpers, file download utility                              |
| `style.css`               | 334   | Styling with light/dark mode via `prefers-color-scheme`         |
| `index.html`              | 29    | Shell: menu bar, corkboard container, textarea for outline      |


---

## 1. Markdown Format

### Card Encoding

Each card is a level-1 heading (`#` ) followed by a blank line and a description paragraph. The simplest card:

```markdown
# Card Title

Card description goes here.
```

### Metadata Encoding: Color and Status

Two optional bracket tokens appear between `#` and the title text:


| Token          | Meaning                                   | Regex          |
| -------------- | ----------------------------------------- | -------------- |
| `[1]`–`[9]`    | Color index (maps to 9 CSS color classes) | `/^\[(\d)\] /` |
| `[x]` or `[X]` | Checked/completed status                  | `/^\[[xX]\] /` |


When both are present, color must come first:

```markdown
# [2] [x] Dr F: Creating Life

Mastering studies, starts to make a human
```

When a card has no color (`0` or absent) and is unchecked:

```markdown
# Plain Card

Just a description.
```

### Real Example (from `Frankenstein_corkboard_example.txt`)

```markdown
# [1] [x] Letter 1

Walton writes to sister about prep for trip to North Pole.

# [1] [x] Letter 2

Walton writes of loneliness.

# [2] [x] Dr F: Childhood

Frankenstein tells of his childhood and the adoption of Elizabeth.

This is a multiline card.

# [3] [x] Creature: Survival

C tells of how he initially figured out how to live
```

### Key Design Observations

- **No frontmatter or YAML**: Metadata is inline in the heading, not in a separate block.
- **No card IDs**: Cards are identified purely by array position. No UUIDs, no anchors.
- **No position data**: Cards have no x/y coordinates. Layout is derived from array order + column count.
- **Column count is not persisted**: `project.corkboardColumns` lives only in JS runtime memory — it's lost on reload (defaults to 3).
- **Multiline descriptions**: Descriptions can span multiple lines, but a blank line followed by `#`  signals the next card. This means descriptions cannot contain markdown headings.
- **Color palette is fixed**: 9 colors, hardcoded as CSS classes `corkboard-color1` through `corkboard-color9`.

---

## 2. Parser Architecture

### Parsing: `parseCardsString(str)` — Markdown → Cards

The parser in `corkboard-view.js` uses a regex-and-string-replacement strategy to convert markdown into a JSON string, then `JSON.parse()` that string. This is unusual and worth understanding.

**Step-by-step process:**

1. **Escape JSON-special characters** in the raw markdown: backslashes, forward slashes, double quotes, tabs.
2. **Regex-replace headings into JSON structure**:
  - First heading → `[{"label":"$1", "descr":"`
  - Subsequent headings → `"}, {"label":"$1", "descr":"`
  - Newlines → `\n`
  - Append `"}]`
3. `**JSON.parse()`** the constructed string into a `rawCards` array.
4. **Post-process** each card: extract `[N]` color and `[x]` checkmark from the label via regex, set defaults.

```javascript
// The core parsing pattern:
str = str.replace(firstLabel, '[{"label":"$1", "descr":"');
str = str.replace(label, '"}, {"label":"$1", "descr":"');
str = str.replace(newLines, '\\n');
str = str + '"}]';
var rawCards = JSON.parse(str);
```

**Key regexes:**

- Label detection: `/^# (.*)\n\n/gm` — requires `#`  at line start followed by a double newline
- Color extraction: `/^\[(\d)\] /` — single digit in brackets at start of label
- Check extraction: `/^\[[xX]\] /` — `[x]` or `[X]` at start of label (after color removal)

### Serialization: `generateCardsString(cards)` — Cards → Markdown

The serializer is straightforward — iterate cards, build the string:

```javascript
function generateCardsString(cards){
    var cardsString = '';
    for(i=0; i<cards.length; i++){
        let card = cards[i];
        cardsString += '# ';
        if(card.color && card.color != 0)
            cardsString += '[' + card.color + '] ';
        if(card.checked == true)
            cardsString += '[x] ';
        cardsString += card.label + '\n\n';
        cardsString += card.descr + '\n\n';
    }
    return cardsString;
}
```

### Round-Trip Fidelity

**What survives a round trip:**

- Card title, description, color (1–9), checked status
- Card ordering

**What is lost or fragile:**

- Any content before the first `#`  heading is discarded
- Trailing whitespace in descriptions is trimmed
- Descriptions that contain `#`  at the start of a line after a blank line will be misinterpreted as a new card
- Any markdown formatting within descriptions (bold, links, lists) is preserved as raw text but has no semantic meaning to the parser
- The column/division count is not persisted — always resets to 3

**Fragility:** The JSON-construction-via-string-replacement approach is brittle. If a description contains unescaped JSON characters that slip through the initial escaping pass, or if the heading format varies slightly (e.g., `##` instead of `#`), the entire parse fails. The error handler catches this and returns a single error card, but provides no recovery.

---

## 3. Data Model

### Card Object

The runtime card object is minimal:

```javascript
{
    label: "Dr F: Creating Life",   // string — card title
    descr: "Mastering studies...",   // string — card description  
    color: 2,                       // number 0–9, 0 = no color
    checked: true                   // boolean — completion status
}
```

That's it. No ID, no timestamps, no position, no tags, no links, no nested structure.

### Global State

```javascript
var loadedCards = [];          // The card array — the entire data model
var unsavedChanges = false;    // Dirty flag
var project = {
    corkboardColumns: 3        // Number of "board divisions" (columns)
}
```

### Ordering

Cards are ordered by array index. The "board divisions" (columns) are a pure presentation concept — they divide the array into N equal groups for visual layout:

```
cardsPerColumn = Math.ceil(loadedCards.length / numCols)
```

Column 0 gets cards `[0, cardsPerCol)`, column 1 gets `[cardsPerCol, 2*cardsPerCol)`, etc. Moving a card left/right within a column uses `Array.splice()` to reorder the flat array, then re-renders.

### No Hierarchical Structure

There are no acts, chapters, or nested groupings in the data model. "Board divisions" are visual-only column groups, determined at runtime by `project.corkboardColumns`. They are not serialized.

---

## 4. UI Architecture

### Framework: None

Pure vanilla JavaScript with imperative DOM manipulation. No React, no Vue, no templates. Every UI element is created via `document.createElement()`.

### Rendering Pipeline

The render cycle is simple and aggressive — full teardown + rebuild on every change:

```
User edits outline textarea
  → showCorkboard() called
    → parseCardsString(textarea.value)  // re-parse entire document
    → fillCorkboard(numCols)            // destroy and recreate all DOM nodes
    → assignLoadedCards()               // populate card DOM from data
```

Every structural change (insert, delete, move, recolor, check) triggers `resetCorkboard()` which does the same teardown/rebuild.

### Card Rendering

`createCardSpot(num, col, posInCol)` creates a card DOM element with:

- An `<input type="text">` for the label
- A `<textarea>` for the description
- An `<h2>` for the card number
- A `<div>` for the checkmark (CSS-drawn via borders)
- `data-index`, `data-owningCol`, `data-posInCol` attributes for position tracking

`assignLoadedCards()` then populates these with data and wires up `keyup` listeners that write back to `loadedCards[]` on every keystroke.

### Bidirectional Sync

The app maintains a split view: corkboard (left 75%) and outline textarea (right 25%).

- **Outline → Corkboard**: The textarea has an `input` event listener that calls `showCorkboard()`, fully re-parsing and re-rendering the corkboard on every keystroke.
- **Corkboard → Outline**: Each card's `keyup` handler writes to `loadedCards[i]`, then `cardCntrlEventsKeyUp()` calls `generateCardsString(loadedCards)` and writes it back to the textarea.

This is a two-way binding implemented manually. It works because the data flow is always: parse → in-memory array → render. There's no diffing, no virtual DOM, no incremental updates.

### "Drag and Drop"

There is no actual drag-and-drop. Card reordering is keyboard-only via `Cmd/Ctrl + Shift + Arrow`. The move functions (`moveCardLeft/Right/Up/Down`) use `Array.splice()` to reorder `loadedCards`, then `resetCorkboard()` rebuilds the entire UI.

### Layout

Cards are `display: inline-block` inside column `<div>`s, so they flow naturally. The number of cards per visual row within a column is determined by the column width ÷ card width (computed at runtime via `getCardsPerRow()`). This is used only for keyboard navigation, not for rendering.

---

## 5. Persistence

### Save

Save triggers a **browser file download** — it creates a Blob, generates an object URL, creates a temporary `<a>` element, and programmatically clicks it:

```javascript
function saveCards(cards){
    const projectName = document.getElementById('projectName').value;
    var filename = projectName != "" ? projectName + "_" : "";
    filename += 'corkboard_' + getPaddedDateTimeString() + '.txt';
    var fileString = generateCardsString(cards);
    downloadTextFile(fileString, filename);
}
```

Each save creates a **new timestamped file** (e.g., `MyNovel_corkboard_2026-04-27-201530.txt`). There is no in-place file saving, no overwrite, no autosave.

### Load

Load uses a file input dialog (`<input type="file" accept=".txt, .md">`), reads the file via `FileReader.readAsText()`, puts the content in the textarea, and calls `showCorkboard()`.

### No Server, No Database, No LocalStorage

There is zero persistence beyond the downloaded files. No IndexedDB, no localStorage, no service worker. Close the tab and everything is gone unless you saved a file.

---

## 6. Strengths

### 1. Elegant Format Simplicity

The markdown format is genuinely human-readable and human-writable. Someone can create or edit a corkboard in any text editor without knowing the app exists. The `# [2] [x] Title` syntax is minimal and learnable in seconds.

### 2. Markdown as Source of Truth

The plain text document is always the canonical state. The corkboard is a view of the document, not the other way around. This means the file is never in an inconsistent state — it's always valid (if potentially empty).

### 3. Bidirectional Live Editing

The real-time sync between outline and corkboard is useful UX. You can type in the markdown and see cards appear, or edit cards and see the markdown update. For a ~900-line vanilla JS app, this is well-executed.

### 4. Graceful Degradation

If the parser fails, you still have a text file. The format doesn't depend on the tool — any markdown renderer will display it as an outline with headings and paragraphs.

### 5. Zero Dependencies

No build step, no node_modules, no framework lock-in. The entire app can be hosted as static files or run from `file://`.

### 6. Color-as-Number Pattern

Using `[1]`–`[9]` instead of actual color names keeps the markdown clean while enabling semantic grouping. The mapping from number to color is a UI concern, not a data concern.

---

## 7. Weaknesses

### 1. Fragile Parser

The "build a JSON string via regex replacement and then JSON.parse it" approach is the app's biggest technical liability:

- Unescaped characters in card content can break the parse
- Any deviation from the expected format produces a complete parse failure
- Error recovery is all-or-nothing (single error card replaces entire board)
- The approach doesn't scale to richer metadata

### 2. No Card Identity

Cards have no stable IDs. They're identified by array index. This means:

- No way to reference a card from another card
- No conflict resolution if two people edit the same file
- No undo/redo with card-level granularity
- Moving a card changes all subsequent indices

### 3. Full Re-Render on Every Change

`showCorkboard()` and `resetCorkboard()` destroy and recreate the entire DOM tree on every change. This includes parsing the full markdown, clearing the corkboard, creating every card element, and re-binding all event listeners. Acceptable for 20-30 cards but would degrade with hundreds.

### 4. Board Divisions Not Persisted

The column count (`corkboardColumns`) resets to 3 on every load. If you carefully set up a 5-act structure, it's lost when you close the browser. This is a significant UX gap for a planning tool.

### 5. No Drag and Drop

Keyboard-only reordering (Cmd+Shift+Arrows) is functional but lacks the tactile feel that makes corkboard tools compelling. There's no mouse-based drag.

### 6. Description Content Restrictions

Because the parser splits on `#`  at line start after a blank line, descriptions cannot contain markdown headings. A card describing "use `# heading` syntax" would break parsing.

### 7. No Undo/Redo

No state history. No Cmd+Z support beyond the browser's built-in textarea undo, which doesn't extend to card operations (move, delete, insert).

### 8. No Autosave or In-Place Save

Every save produces a new timestamped file download. For an app about iterative editing, this creates file clutter and friction.

### 9. Global Variable Soup

`loadedCards`, `unsavedChanges`, and `project` are global mutable state. Loop variables (`i`, `r`) are implicitly global (no `let`/`const` in `for` loops). Event listeners are added but never removed (because the DOM is always rebuilt). This wouldn't scale to a larger codebase.

### 10. Single Heading Level

Only `#`  (h1) headings are recognized. There's no support for sub-scenes (`##`), beats (`###`), or any nested hierarchy.

---

## 8. Relevance to Our Project

Our project: A React PWA storyboard tool with markdown files as backend storage, a local companion server parsing markdown, and WebSocket sync to the PWA.

### Patterns to **Adopt**


| Pattern                         | Why                                                                                                                               | How to Adapt                                                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inline metadata in headings** | `# [2] [x] Title` is elegant, readable, and grep-friendly. Keeps metadata colocated with the card it describes.                   | Extend the bracket syntax for more properties: `# [color:blue] [status:done] [id:abc123] Title`. Or use a structured approach like `<!-- meta: {...} -->` HTML comments on the line before each heading. |
| **Markdown as source of truth** | The file should be the canonical state, with the UI as a derived view. This is the right architecture for file-based persistence. | Our companion server should parse the markdown file and push the parsed model to the PWA. The PWA should never hold state that isn't derivable from the file.                                            |
| **Human-readable-first format** | The file should be useful even without our tool. Corkboard's files are valid outlines in any markdown renderer.                   | Ensure our markdown format renders sensibly in GitHub, VS Code preview, Obsidian, etc. Metadata should be invisible or unobtrusive in standard renderers.                                                |
| **Color-as-semantic-token**     | Using numbers/names for colors instead of hex values keeps the format clean and lets the UI decide the actual rendering.          | Use semantic labels: `[color:protagonist]`, `[color:subplot-b]` — let the PWA map labels to colors via a theme.                                                                                          |


### Patterns to **Adapt**


| Pattern                | Corkboard's Approach                             | Our Adaptation                                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Board divisions**    | Runtime-only column count, not serialized        | Persist divisions as markdown structure: use `## Act 1`, `## Act 2` headings to create hierarchy. Cards under each h2 belong to that act.                                                                                                                                                              |
| **Bidirectional sync** | Full re-parse on every keystroke in the textarea | Use the companion server as the sync layer. Server watches the file, parses on change, pushes diffs via WebSocket. PWA sends mutations (move card, edit title) as operations, server applies them to the file. Avoid full re-render; use React's diffing.                                              |
| **Card ordering**      | Array position in the flat markdown file         | We should add explicit ordering metadata if we want to support reordering without restructuring the entire file. Consider: frontmatter `order: 5` or heading-level `[sort:5]`. Alternatively, accept that file order = card order (which is what corkboard does and it works fine for their use case). |
| **Metadata encoding**  | Bracket tokens `[1] [x]` in heading line         | For richer metadata, use HTML comments or YAML frontmatter per card section. HTML comments (`<!-- { "color": "red", "status": "done" } -->`) are invisible in rendered markdown and support arbitrary JSON.                                                                                            |


### Patterns to **Avoid**


| Pattern                                | Why It's Problematic                                                                                      | Our Alternative                                                                                                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JSON-via-string-replacement parser** | Fragile, no error recovery, breaks on unexpected content. This is the project's worst technical decision. | Use a proper markdown parser (remark/unified, markdown-it, or mdast). Parse into an AST, walk the tree, extract card data from heading nodes and their following content.                   |
| **No card IDs**                        | Can't reference cards, can't merge concurrent edits, can't build a dependency graph between scenes.       | Generate stable IDs (short UUIDs or nanoid) and persist them in the heading metadata: `# [id:k7x2m] Scene Title`.                                                                           |
| **Full DOM teardown/rebuild**          | O(n) render on every edit. Fine for 20 cards, unusable for 200.                                           | Use React with proper keys and memoization. Only re-render changed cards. Use `useMemo` / `React.memo` for card components.                                                                 |
| **Global mutable state**               | Impossible to test, impossible to reason about, impossible to extend.                                     | Use a proper state management approach: React Context + useReducer, or Zustand/Jotai for the card store. The state should flow unidirectionally.                                            |
| **File-download-as-save**              | Creates timestamped copies instead of saving in place. No autosave.                                       | Our companion server handles file I/O. The PWA sends mutations via WebSocket, the server writes to the file. Debounced autosave. Watch the file for external changes and push updates back. |
| **No undo/redo**                       | Critical for a creative tool                                                                              | Implement operation-based undo/redo. Each mutation (move, edit, delete, insert) is a reversible operation pushed onto a history stack.                                                      |


### Key Insight for Our Architecture

Markdown Corkboard proves that **the "rich UI state in plain text" problem is solvable for a simple enough data model**. Their format works because each card is essentially `(title, description, color, checked)` — four fields, all representable as text.

The moment you need:

- **Stable identity** → you need IDs in the markdown
- **Nested structure** → you need heading hierarchy (h1 > h2 > h3)
- **Arbitrary metadata** → you need a metadata encoding (HTML comments, frontmatter, or extended bracket syntax)
- **Concurrent editing** → you need operational transforms or CRDTs, which need stable IDs
- **Spatial layout** → you need position data, which is inherently non-textual

Our challenge is finding the right **metadata encoding** that:

1. Keeps the file readable in any markdown editor
2. Supports the metadata we need (IDs, colors, status, position, tags, links)
3. Is parseable with a standard markdown AST parser
4. Survives round-trips through external editors without data loss

**Recommended approach**: Use a markdown AST parser (remark/unified) and encode metadata as HTML comments immediately before each heading:

```markdown
<!-- card: {"id":"k7x2m","color":"blue","status":"draft","tags":["subplot-a"]} -->
## Scene: The Discovery

Description of what happens in this scene.
Supports **rich markdown** including lists, links, etc.
```

This gives us:

- HTML comments are invisible in rendered markdown
- JSON in comments supports arbitrary metadata
- A proper AST parser handles all the edge cases corkboard's regex parser can't
- Heading levels (`#` vs `##` vs `###`) provide free hierarchical structure (Act > Chapter > Scene)
- The file is a valid, readable outline without our tool

---

## Appendix: File Inventory

```
markdown-corkboard/
├── index.html                           # App shell (29 lines)
├── corkboard-controller.js              # UI logic, events, save/load (600 lines)  
├── corkboard-view.js                    # Parser: markdown ↔ cards (88 lines)
├── utils.js                             # DOM utilities (64 lines)
├── style.css                            # Styles with light/dark mode (334 lines)
├── Frankenstein_corkboard_example.txt   # Example corkboard file
├── markdown-corkboard_screenshot.png    # Screenshot
├── README.md                            # Documentation
└── LICENSE                              # MIT
```

