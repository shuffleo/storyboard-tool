# Markwhen: Deep Technical Analysis

> Analysis of [github.com/mark-when](https://github.com/mark-when) ecosystem  
> Date: 2026-04-27

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Syntax & Format](#2-syntax--format)
3. [Parser Architecture](#3-parser-architecture)
4. [Data Model](#4-data-model)
5. [View Architecture](#5-view-architecture)
6. [Editor Integration & Bidirectional Editing](#6-editor-integration--bidirectional-editing)
7. [Strengths](#7-strengths)
8. [Weaknesses](#8-weaknesses)
9. [Relevance to Our Storyboard Project](#9-relevance-to-our-storyboard-project)

---

## 1. Architecture Overview

Markwhen is decomposed into **5 separate repositories** with clear separation of concerns:


| Repository             | Role                                                            | Framework       | Open Source |
| ---------------------- | --------------------------------------------------------------- | --------------- | ----------- |
| `@markwhen/parser`     | Text → AST parser, published as npm package                     | Pure TS + Luxon | Yes         |
| `markwhen` (this repo) | **View Container** — hosts views in iframes, orchestrates state | Vue 3 + Pinia   | Yes         |
| `timeline`             | Timeline/Gantt view (rendered inside iframe)                    | Vue 3 + Pinia   | Yes         |
| `calendar`             | Calendar view                                                   | Vue 3           | Yes         |
| `view-client`          | Library for building custom views                               | Pure TS         | Yes         |
| Editor (markwhen.com)  | Web editor with text editing                                    | Proprietary     | **No**      |


The key architectural decision: **views run in sandboxed iframes** and communicate with the host (view container) via `postMessage`. The parser is a standalone npm package with zero UI dependencies. The web editor is closed-source.

---

## 2. Syntax & Format

### 2.1 Basic Structure

A Markwhen document has three parts: **header**, **tag definitions**, and **events**.

```markwhen
title: Welcome to Markwhen 👋
description: A text-to-timeline tool.
timezone: America/New_York

#Project1: #d336b1
#urgent: red

// Comments start with //

2023-01/2023-03: Sub task #John
2023-03/2023-06: Sub task 2 #Michelle
More info about sub task 2
- [ ] Checklist item
- [x] Done item

now: Current event
```

### 2.2 Date/Range Formats

Markwhen supports an extraordinary number of date formats:


| Format          | Example                               | Notes                                  |
| --------------- | ------------------------------------- | -------------------------------------- |
| ISO/EDTF        | `2023-01-15`                          | Primary format                         |
| ISO range       | `2023-01/2023-03`                     | Slash separator                        |
| ISO with time   | `2023-01-15 3pm`                      | 12h or 24h                             |
| American        | `01/15/2023`                          | M/D/Y                                  |
| European        | `15/01/2023`                          | D/M/Y (opt-in via `dateFormat: d/M/y`) |
| Casual month    | `January 15, 2023` or `15 Jan 2023`   | Full or abbreviated                    |
| Month-only      | `January 2023` or `01/2023`           | Granularity = month                    |
| Year-only       | `2023`                                | Granularity = year                     |
| ISO week        | `2023-W05` or `2023-W05-3`            | ISO week dates                         |
| BCE dates       | `300 BCE` or `50 BC–50 AD`            | Historical timelines                   |
| `now`           | `now: Event`                          | Current timestamp                      |
| Duration        | `2023-01/4 months`                    | End = start + duration                 |
| Relative        | `after !taskA 3 days`                 | Dependent on other event               |
| Relative before | `before !taskB 2 weeks`               | Before referenced event                |
| Recurrence      | `2023-01 every other week for 1 year` | Repeating events                       |


**Duration units**: milliseconds, seconds, minutes, hours, days, work days, weeks, months, years.

### 2.3 Groups & Sections

Two syntaxes exist for grouping:

**Legacy keyword syntax:**

```markwhen
section All Projects
group Project 1 #Project1
2023-01/2023-03: Task A
2023-03/2023-06: Task B
endGroup
endSection
```

**Markdown section syntax (newer, recommended):**

```markwhen
# All Projects

## Project 1 #Project1
2023-01/2023-03: Task A
2023-03/2023-06: Task B

## Project 2
2023-04/2023-06: Task C
```

Markdown sections are "greedy" — they auto-close when a same-level or higher-level heading appears. This is a significant design choice: sections are implicit rather than requiring explicit end markers.

### 2.4 Tags & Colors

```markwhen
#Design: #ff6b6b
#Engineering: blue

2023-01: Design phase #Design
2023-02: Build phase #Engineering #urgent
```

Tags serve dual purpose: categorization and coloring. Tag colors are defined in the header with `#tagName: colorValue`.

### 2.5 Event Properties (YAML-based)

Events can have YAML properties in a frontmatter-like block:

```markwhen
2023-01/2023-03: Task with properties
---
timezone: America/Chicago
assignee: John
priority: high
---
Description text continues here
```

Or without frontmatter delimiters (plain YAML key-value pairs on lines immediately following the event):

```markwhen
2023-01/2023-03: Task
timezone: America/Chicago
priority: high
```

### 2.6 Rich Content

```markwhen
2023-01: Event with rich content
![alt text](https://example.com/image.png)
[link text](https://example.com)
[Location Name](location)
- List item
- [ ] Unchecked checkbox
- [x] Checked checkbox
```

### 2.7 Event IDs and Relative References

```markwhen
2023-01-01/2023-02-01: Design phase !design
after !design 1 week: Implementation !impl
after !impl 2 days: Testing
before !impl 3 days: Code review
```

### 2.8 Recurrence

```markwhen
2023-01-03 every other week for 1 year: Biweekly meeting
2023-01 every 2 months x 6: Quarterly review
```

### 2.9 Pages

Documents can contain multiple pages separated by a specific delimiter, each with their own header.

### 2.10 How It Differs from Standard Markdown


| Feature          | Standard Markdown         | Markwhen                                                     |
| ---------------- | ------------------------- | ------------------------------------------------------------ |
| Headings (`#`)   | Document structure        | **Section/group boundaries**                                 |
| Lists (`-` )     | Display lists             | Supplemental event content                                   |
| Images (`![]()`) | Display images            | Attached to events                                           |
| Links (`[]()`)   | Hyperlinks                | Hyperlinks + location markers                                |
| Core syntax      | Paragraphs and formatting | `**dateRange: eventTitle`** — the colon is the key delimiter |
| Comments         | None                      | `// comment`                                                 |
| Frontmatter      | YAML header (some tools)  | YAML header + per-event properties                           |


The fundamental unit is `dateRange: eventText`, which has no equivalent in Markdown.

---

## 3. Parser Architecture

### 3.1 Strategy: Hand-Rolled Regex-Based Line Parser

The parser (`@markwhen/parser`) is **entirely hand-rolled** using complex composed regular expressions. It is NOT based on PEG grammars, parser generators, or formal grammar definitions.

**Parsing flow:**

```
Input string
  → split into lines (with character offset tracking)
  → parseHeader() — YAML header extraction
  → parsePastHeader() — line-by-line event/section parsing
    → for each line:
        1. checkNonEvents() — comments, tag definitions
        2. checkMarkdownSection() — `#` headings → groups
        3. Fast skip: reject lines without `:` (no date delimiter)
        4. checkEvent() — try 3 date format parsers in order:
           a. getDateRangeFromEDTFRegexMatch() — ISO/EDTF dates
           b. getDateRangeFromCasualRegexMatch() — "January 15" etc.
           c. getDateRangeFromBCEDateRegexMatch() — BCE/CE dates
        5. If date found → parse properties, description, list items
        6. Build Event object → push onto tree
  → ParsingContext.toTimeline()
```

### 3.2 The Regex System

The regex system is the most remarkable (and concerning) part. The main event regex `EVENT_START_REGEX` is built by **composing ~20 smaller regexes** into a single enormous pattern:

```typescript
// Simplified composition chain:
TIME_REGEX → START_OR_END_TIME_REGEX → DATE_RANGE_REGEX → EVENT_START_REGEX
```

The final `EVENT_START_REGEX` has **220+ named match indices** tracked via incrementing counters:

```typescript
let index = 0;
export const eventStartWhitespaceMatchIndex = ++index;
export const datePartMatchIndex = ++index;
export const from_matchIndex = ++index;
// ... 200+ more indices
export const eventTextMatchIndex = ++index;  // ~index 220
```

There are actually **three parallel regex systems**: one for casual dates (American/European), one for EDTF/ISO dates, and one for BCE dates. Each has its own set of match indices.

### 3.3 Line Position Tracking

The parser tracks character positions meticulously for bidirectional editing:

```typescript
const { lines, lengthAtIndex } = linesAndLengths(timelineString);
```

`lengthAtIndex[i]` stores the character offset where line `i` starts in the original string. Every parsed element records its `Range`:

```typescript
type Range = {
  from: number;   // character offset in source
  to: number;     // character offset in source  
  type: RangeType;
  content?: any;
};
```

This enables precise text manipulation: to edit an event's date, the editor can slice the raw string at `event.textRanges.datePart.from` and `.to`.

### 3.4 Incremental Parsing

The parser has a sophisticated incremental parsing mode (`incremental.ts`) that integrates with CodeMirror's `ChangeSet`:

```typescript
export function incrementalParse(
  previousText: string | Text,
  changes: ChangeSet,
  previousParse?: ParseResult,
  now?: DateTime
): ParseResult
```

The algorithm:

1. Iterate through the existing AST tree
2. Find nodes whose text ranges **overlap** with the changed regions
3. Re-parse only the affected region plus its siblings
4. **Splice** the new nodes back into the existing tree
5. **Map** all positions of unaffected nodes through the changeset
6. Falls back to full re-parse on edge cases (header changes, ID'd events, etc.)

This is built on CodeMirror's `ChangeSet.mapPos()` for position remapping, which is elegant but creates a hard dependency on `@codemirror/state`.

### 3.5 Caching

The parser uses an LRU cache keyed by timezone + date string:

```typescript
context.cache?.zone(context.timezone).ranges.set(datePart, {
  fromDateTimeIso, toDateTimeIso
});
```

This avoids re-parsing identical date strings (e.g., when the same date appears across edits).

### 3.6 Error Handling

Errors are collected as `ParseMessage` objects with source positions:

```typescript
interface ParseMessage {
  type: "error" | "warning";
  message: string;
  pos: [number, number];  // [from, to] character offsets
}
```

The parser is **fault-tolerant**: unparseable lines are silently skipped, and only specific conditions (invalid timezones, illogical date ranges, missing referenced events) produce error messages. This means malformed input never crashes the parser — it just ignores what it can't understand.

### 3.7 iCal Import

The parser can import iCalendar (`.ics`) files, converting them to Markwhen text or directly to the parsed data model.

---

## 4. Data Model

### 4.1 Core Types

```typescript
// The top-level parse result
type ParseResult = Timeline & {
  cache?: Caches;
  parser: { version: string; incremental?: boolean; };
};

// A single page/timeline
interface Timeline {
  ranges: Range[];                           // All syntax ranges for highlighting
  foldables: { [index: number]: Foldable };  // Code folding regions
  events: EventGroup;                        // Root of the event tree
  header: any;                               // Parsed YAML header
  ids: IdedEvents;                           // Event ID → path lookup
  parseMessages: ParseMessage[];             // Errors/warnings
  documentMessages: DocumentMessage[];       // Document-level messages
}
```

### 4.2 Event Tree

Events form a **tree structure** using `EventGroup` (branch nodes) and `Event` (leaf nodes):

```typescript
type Eventy = Event | EventGroup;

class EventGroup {
  title: string;
  children: Array<Event | EventGroup>;  // The tree structure
  tags: string[];
  properties: any;
  range?: GroupRange;
  style?: "section" | "group";
  startExpanded?: boolean;
  textRanges: {
    whole: Range;        // Full text extent
    definition: Range;   // The header line
    properties?: Range;  // YAML properties block
  };
}

class Event {
  firstLine: {
    full: string;        // Complete first line
    datePart?: string;   // "2023-01/2023-03"
    rest: string;        // "Task name #tag"
    restTrimmed: string; // Cleaned title
  };
  dateRangeIso: DateRangeIso;  // { fromDateTimeIso, toDateTimeIso }
  tags: string[];
  supplemental: MarkdownBlock[];  // Description, images, lists
  properties: any;                // YAML properties
  recurrence?: Recurrence;
  id?: string;                    // !eventId
  percent?: number;               // Completion percentage
  completed?: boolean;            // Checkbox state
  isRelative: boolean;            // Depends on another event
  textRanges: {
    whole: Range;        // Full event extent in source
    datePart: Range;     // Date portion
    definition: Range;   // Date + colon
    recurrence?: Range;  // Recurrence expression
    properties?: Range;  // YAML block
  };
}
```

### 4.3 Path-Based Addressing

Nodes are addressed via **integer array paths** (like DOM tree paths):

```typescript
type Path = number[];
// [0] = first child of root
// [0, 2] = third child of first group
// [1, 0, 3] = deeply nested
```

Tree operations:

- `get(root, path)` — retrieve node at path
- `push(node, root, path)` — insert node at path
- `iter(node)` — depth-first generator
- `flat(node)` — flatten to event array
- `getLast(node)` — get deepest-last node

### 4.4 Range Tracking

Every syntactic element tracks its source position for syntax highlighting and editing:

```typescript
enum RangeType {
  Comment, Tag, tagDefinition, Title, 
  Section, DateRange, DateRangeColon, Event,
  Recurrence, FrontmatterDelimiter, 
  HeaderKey, HeaderKeyColon, HeaderValue,
  PropertyKey, PropertyKeyColon, PropertyValue,
  EventDefinition, SectionDefinition, Properties,
  CheckboxItemIndicator, listItemIndicator, ListItemContents,
}
```

### 4.5 Supplemental Content

Event descriptions are parsed into a block model:

```typescript
enum BlockType { TEXT, LIST_ITEM, CHECKBOX, IMAGE }

class Block implements MarkdownBlock {
  type: BlockType;
  value?: any;     // For checkboxes: boolean
  raw: string;     // The text content
}

class Image implements MarkdownBlock {
  type = BlockType.IMAGE;
  altText: string;
  link: string;
}
```

---

## 5. View Architecture

### 5.1 iframe Sandboxing

Views are **completely isolated in iframes**. The view container loads view URLs:

```typescript
interface ViewProvider {
  id: string;              // "markwhen.timeline"
  url: string;             // "https://timeline.markwhen.com"
  name: string;
  capabilities?: {
    edit?: boolean;         // Can modify events
    hoveringEvent?: boolean;
    mobile?: boolean;
  };
  uses?: {
    tags?: boolean;
    sort?: boolean;
    pages?: boolean;
    jump?: boolean;
  };
}
```

Default configuration points to `https://timeline.markwhen.com` for the timeline view. For local development, you override the URL.

### 5.2 LPC (Local PostMessage Communication) Protocol

The view container and views communicate via a typed **request/response protocol** over `postMessage`:

**Messages from container → view:**

- `state` — full serialized state (parsed data, app state, hovering/detail paths)
- `jumpToRange` — scroll to a date range
- `jumpToPath` — scroll to an event

**Messages from view → container:**

- `setHoveringPath` — user hovering over an event
- `setDetailPath` — user selected an event for detail view
- `showInEditor` — request to scroll text editor to event
- `newEvent` — create a new event at a date range
- `editEventDateRange` — modify an event's date range

Each message has a typed structure:

```typescript
interface Message<T extends MessageType> {
  type: T;
  request?: boolean;
  response?: boolean;
  id: string;          // Nonce for request/response pairing
  params?: MessageParam<T>;
}
```

The protocol supports both iframe `postMessage` and WebSocket transport (for the VS Code extension).

### 5.3 View Client Library

The `@markwhen/view-client` npm package provides the view-side of the protocol:

```typescript
// In a custom view:
import { useLpc } from "@markwhen/view-client";

const { postRequest } = useLpc({
  appState(state) { /* handle app state updates */ },
  markwhenState(state) { /* handle parsed data updates */ },
  jumpToPath({ path }) { /* scroll to event */ },
  jumpToRange({ dateRangeIso }) { /* scroll to date range */ },
});

// Communicate back:
postRequest("setHoveringPath", eventPath);
postRequest("newEvent", { dateRangeIso, immediate: true });
```

The client library also supports VS Code's `acquireVsCodeApi()` for the VS Code extension.

### 5.4 State Serialization

The container serializes its complete state for views:

```typescript
interface State {
  app?: {
    isDark?: boolean;
    hoveringPath?: EventPaths;
    detailPath?: EventPath;
    pageIndex: number;
  };
  markwhen?: {
    rawText?: string;
    parsed?: Timeline[];
    page?: {
      parsed?: Timeline;
      transformed?: Node<NodeArray>;  // Filtered/sorted version
    };
  };
}
```

### 5.5 Transform Layer

Between parsing and rendering, there's a **transform layer** that applies filtering and sorting:

```typescript
const transformedEvents = computed(() =>
  transformRoot(
    pageStore.pageTimeline.events,
    filter.value,         // Active tag filters
    filterUntagged.value, // Include untagged events?
    sort.value            // "none" | "down" | "up"
  )
);
```

### 5.6 Timeline View Internals

The timeline view (`mark-when/timeline`) is a full Vue 3 application with:

- **Date-to-pixel mapping**: Scale-based conversion between dates and screen positions
- **Virtual scrolling**: Only renders visible events
- **Zoom levels**: From seconds to decades, with weight-based time marker display
- **Dual modes**: Timeline (cascading bars) and Gantt (aligned rows with sidebar)
- **Drag-to-resize**: Events can be resized by dragging handles, which sends `editEventDateRange` back to the container
- **Event creation**: Click-and-drag on empty space creates new events

---

## 6. Editor Integration & Bidirectional Editing

### 6.1 Text → Visual

1. User types in the text editor (closed-source web editor or VS Code extension)
2. Raw text is sent to the parser (synchronously via computed property, or async via Web Worker)
3. Parsed result flows through the transform layer
4. Serialized state is posted to the view iframe
5. View re-renders

### 6.2 Visual → Text

When a user manipulates events in the visual view (e.g., drag-resizing):

1. View sends `editEventDateRange` via LPC with the event path, new date range, and display scale
2. Container's `editorOrchestratorStore` receives the message
3. It uses the event's `textRanges.datePart` to locate the exact character positions
4. It **string-splices** the new date string into the raw text:

```typescript
const editEventDateRange = (event, range, scale, format) => {
  const inTextFrom = event.dateRangeInText.from;
  const inTextTo = event.dateRangeInText.to;
  const pre = timelineString.slice(0, inTextFrom);
  const post = timelineString.slice(inTextTo);
  const newString = pre + dateRangeToString(range, scale, format) + post;
  setText(newString);
};
```

1. The modified text triggers a re-parse, which updates the visual view

### 6.3 Event Creation from Visual

```typescript
const createEventFromRange = (range, scale, format) => {
  const dateRangeString = dateRangeToString(range, scale, format);
  const index = newEventInsertionIndex(); // End of current page
  const newString = es.slice(0, index) + `\n${dateRangeString}: Event\n` + es.slice(index);
  setText(newString);
};
```

### 6.4 Limitations of the Bidirectional Model

- The text editor is **closed source** — the open-source view container only provides the orchestration layer
- Editing is **text-centric**: visual changes are converted to text edits, then re-parsed
- There is no **OT (Operational Transform)** or **CRDT** — concurrent edits would conflict
- The incremental parser helps performance but adds significant complexity

---

## 7. Strengths

### 7.1 Parser as Standalone Package

The `@markwhen/parser` is a properly published npm package with no UI dependencies. Any project can `npm install @markwhen/parser` and get the full parsing capability. This is excellent library design.

### 7.2 Date Parsing Breadth

The range of supported date formats is extraordinary — ISO, EDTF, casual English, BCE/CE, relative dates, durations, recurrence. The `luxon` integration provides timezone-aware date arithmetic.

### 7.3 Precise Source Mapping

Every parsed element carries its character range in the source text. This enables syntax highlighting, code folding, and precise text edits from visual manipulations — all derived from the same parse tree.

### 7.4 iframe View Isolation

Running views in iframes provides:

- Security isolation
- Independent deployment
- Technology agnosticism (views could be React, Svelte, vanilla JS)
- Plugin architecture without runtime coupling

### 7.5 Incremental Parsing

The CodeMirror-based incremental parser is sophisticated engineering that avoids full re-parses on small edits.

### 7.6 Fault Tolerance

The parser never crashes on malformed input — it silently skips unparseable lines. This makes the editing experience smooth even with partially-written events.

### 7.7 Tree-Based Data Model

The `EventGroup` / `Event` tree with path-based addressing is clean and supports nested sections naturally.

---

## 8. Weaknesses

### 8.1 Regex Complexity Is Unmaintainable

The regex system is the parser's biggest liability. The main `EVENT_START_REGEX` is composed from ~20 sub-regexes into a single pattern with **220+ capture groups** tracked via manual index counting:

```typescript
let index = 0;
export const eventStartWhitespaceMatchIndex = ++index;
// ... 218 more lines of this
export const eventTextMatchIndex = ++index;
```

This has several problems:

- Adding a capture group anywhere requires re-numbering everything downstream
- The regex is not human-readable when composed
- Debugging match failures is extremely difficult
- Two parallel systems (casual + EDTF) duplicate the entire index scheme

A PEG grammar or recursive descent parser would be far more maintainable.

### 8.2 No Formal Grammar

There is no formal grammar specification — the syntax is defined implicitly by regex patterns. This makes it impossible to:

- Generate parsers for other languages
- Formally validate the language specification
- Catch ambiguities or conflicts

### 8.3 Closed-Source Editor

The actual text editor (markwhen.com) is closed source. The open-source view container is essentially a state management layer without an editor. This limits community contribution and makes it hard to build a fully self-hosted solution.

### 8.4 Vue-Only View Ecosystem

Despite the iframe architecture enabling technology agnosticism, all existing views (timeline, calendar, resume) are Vue 3. The view client library is framework-agnostic, but there are no React or Svelte view templates.

### 8.5 No Collaborative Editing Support

The text-centric editing model doesn't support concurrent users. Changes are full-string replacements (`setText(newString)`), which would lose data in multi-user scenarios.

### 8.6 Limited Validation

Event properties are untyped — they're parsed as generic YAML objects. There's no schema validation, property completion, or type checking.

### 8.7 Incremental Parser Fragility

The incremental parser has many bail-out conditions:

- Can't handle header changes
- Won't reparse over events with IDs
- Falls back to full reparse on many edge cases
- The graft/splice logic is complex and hard to verify

### 8.8 No Duration-First Syntax

Events are fundamentally **date-range-first**. There's no clean syntax for "this takes 3 minutes and plays after the previous item" without relative dates, which are verbose: `after !prev 0 days/3 minutes: Shot 5`. A storyboard tool needs duration-first sequential items.

---

## 9. Relevance to Our Storyboard Project

### 9.1 Context

Our project: a **React PWA storyboard tool** with:

- Markdown-file backend
- Animatics timeline view where shots have durations and play in sequence
- Bidirectional editing between text and visual views

### 9.2 What to Learn from Markwhen

#### (a) Text-Based Timeline Syntax

**Adopt:** The `dateOrDuration: title` pattern as the core event syntax. The colon delimiter is intuitive and easy to parse.

**Adapt:** For storyboard shots, we need **duration-first sequential syntax** rather than date-range-first:

```markdown
## Scene 1: The Chase

3s: Wide shot - car enters frame
![storyboard-001.png]

2s: Close-up - driver's face
![storyboard-002.png]

1.5s: Cut to - rearview mirror
```

This is simpler than Markwhen because:

- Shots are sequential by default (no need for explicit dates)
- Durations are the primary temporal unit, not dates
- We don't need timezone support, relative dates, recurrence, etc.

**Avoid:** The complexity of supporting 10+ date formats. For a storyboard tool, we need: durations (`3s`, `1.5s`, `200ms`, `2m`), and optionally absolute timecodes (`00:01:30.000`).

#### (b) Parser Design

**Adopt:**

- **Source position tracking** — every parsed element must carry `{ from, to }` character offsets for bidirectional editing. This is the single most important lesson.
- **Fault-tolerant parsing** — silently skip malformed lines rather than failing
- **Standalone parser package** — keep the parser as a pure library with no UI dependencies
- **Line-based parsing** — for our markdown-like format, line-by-line processing is appropriate

**Adapt:**

- Use a **proper parser** (PEG via `peggy`, or hand-rolled recursive descent) instead of composed regexes. Our syntax is much simpler than Markwhen's, so a clean recursive descent parser would be straightforward and maintainable.
- For incremental parsing, consider **tree-sitter** or **lezer** (CodeMirror's parser system) which provide incremental parsing out of the box with far less custom code.

**Avoid:**

- The composed-regex-with-220-capture-groups approach — this is the most maintainability-challenged part of Markwhen
- Manual match index tracking — use named capture groups at minimum, or a real parser

#### (c) Bidirectional Editing

**Adopt the core pattern:**

1. Parse text → AST with source ranges
2. Visual changes → compute new text via string splice at source ranges
3. New text → re-parse → re-render

This is exactly what Markwhen does in `editEventDateRange()`:

```typescript
const pre = timelineString.slice(0, event.textRanges.datePart.from);
const post = timelineString.slice(event.textRanges.datePart.to);
const newString = pre + newDateString + post;
```

**Key insight:** The AST must track **all mutable properties' positions** in the source. For us:

- Shot duration position (`3s` → the range `{from: 5, to: 7}`)
- Shot title position
- Shot image path position

**Adapt:**

- Use **CodeMirror 6** or **Monaco** as our text editor — both provide `ChangeSet` / edit tracking that pairs well with incremental re-parsing
- Consider whether we need true incremental parsing or if full re-parse is fast enough (our documents will be much smaller than Markwhen timelines)

**Avoid:**

- The iframe-based view isolation (overkill for our use case — we're a single React app)
- The complex incremental parser with graft/splice — measure first whether full re-parse at 60fps is achievable

#### (d) Extensible View Architecture

**Learn from, but don't adopt the iframe model.** For our React app:

**Adopt:**

- The concept of a **transform layer** between parsing and rendering (filter, sort, search)
- Separation between the **data store** (parsed AST) and **view store** (zoom level, scroll position, viewport state)
- The **ViewProvider** interface concept for registering view types

**Adapt for React:**

- Use React context or Zustand stores instead of Pinia
- Use React component composition instead of iframes
- Views as React components that consume the parsed AST via hooks:

```typescript
function useTimeline() {
  const { parsed } = useStoryboardStore();
  // Transform, filter, sort
  return { shots, scenes, totalDuration };
}
```

**Avoid:**

- iframe isolation — adds latency and complexity we don't need
- `postMessage` protocol — use direct function calls / React context
- Vue-specific patterns (Pinia, computed refs, watchers)

### 9.3 Concrete Recommendations


| Area                    | Recommendation                                                   | Priority |
| ----------------------- | ---------------------------------------------------------------- | -------- |
| **Syntax**              | `duration: title` with sequential-by-default semantics           | High     |
| **Parser**              | Hand-rolled recursive descent with source ranges, fault-tolerant | High     |
| **Source mapping**      | Track `{from, to}` for every editable element                    | Critical |
| **Bidirectional edits** | String-splice at source ranges, then re-parse                    | High     |
| **Parser package**      | Standalone, zero-UI-dependency npm package                       | Medium   |
| **State management**    | Zustand store with raw text + parsed AST + transform layer       | Medium   |
| **View components**     | React components consuming parsed data via hooks                 | Medium   |
| **Text editor**         | CodeMirror 6 with custom language mode for syntax highlighting   | Medium   |
| **Incremental parsing** | Defer — benchmark full re-parse first                            | Low      |
| **iframe views**        | Don't adopt — use React component composition                    | N/A      |


### 9.4 Proposed Shot Syntax (Inspired by Markwhen)

```markdown
---
title: Chase Sequence
fps: 24
---

# Scene 1: The Chase

3s: Wide shot - car enters frame
![boards/scene1/001.png]
Camera tracks left to right

2s: CU Driver's face  
![boards/scene1/002.png]
Tension in eyes, gripping wheel

500ms: Cut to rearview mirror
![boards/scene1/003.png]

# Scene 2: The Escape

4s: Aerial shot - car weaving through traffic #action
![boards/scene2/001.png]
Drone shot, high angle

1s: Insert - speedometer climbing #tension
![boards/scene2/002.png]
```

This borrows from Markwhen:

- YAML frontmatter for metadata
- `#` headings for scene grouping
- `duration: title` as the core pattern
- `#tags` for categorization
- `![image]()` for storyboard panels
- Indented text for notes/descriptions
- Sequential by default (no dates needed)

---

## Appendix: Repository Statistics


| Metric         | Parser                                             | View Container                      | Timeline View                   |
| -------------- | -------------------------------------------------- | ----------------------------------- | ------------------------------- |
| Language       | TypeScript                                         | TypeScript + Vue                    | TypeScript + Vue                |
| Source files   | ~30                                                | ~100                                | ~75                             |
| Dependencies   | luxon, yaml, ical.js, @codemirror/state, lru-cache | @markwhen/parser, vue, pinia, luxon | @markwhen/parser, vue, pinia    |
| Published as   | npm: `@markwhen/parser`                            | Docker image                        | Hosted at timeline.markwhen.com |
| Test framework | Jest                                               | Playwright + Vitest                 | —                               |
| License        | MIT                                                | MIT                                 | MIT                             |
