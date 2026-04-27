# Step 1: Markdown Format + Parser/Serializer

> **Estimate:** 2-3 days
> **Prerequisites:** None (this is the foundation)
> **Depends on:** Nothing
> **Blocks:** Steps 2, 3, 4, 5 (everything depends on the parser)
> **Naming rules:** See [schema-and-naming.md](schema-and-naming.md) for all field mappings, naming layers, and type conversions

## Goal

Design the canonical markdown storyboard format, then build a parser and serializer that can:

1. Parse `project.md` + `scene-*.md` files into a `ProjectState` object
2. Serialize a `ProjectState` back into markdown files (round-trip safe)
3. Track source positions (`{from, to}`) on every parsed element for bidirectional editing
4. Handle malformed input gracefully (skip bad shots, never crash)

The parser is a **pure library** with zero I/O, zero UI, and zero side effects. It is shared by the PWA (step 2) and the companion server (step 3).

## Test Cases (write these FIRST)

### Round-trip tests

```typescript
// test: parse a valid project.md -> serialize -> parse again -> deep equal
// test: parse a valid scene file with 3 shots -> serialize -> parse -> deep equal
// test: parse a scene with shots that have multiple frames -> round-trip
// test: parse a scene with shots that have no frames -> round-trip
// test: parse a project with empty style notes and reference links -> round-trip
// test: serialize produces files identical to well-formatted input (whitespace-stable)
```

### Shot syntax parsing

```typescript
// test: "### 2s: Wide shot title" -> { durationMs: 2000, title: "Wide shot title" }
// test: "### 500ms: Quick cut" -> { durationMs: 500, title: "Quick cut" }
// test: "### 1.5m: Long take" -> { durationMs: 90000, title: "Long take" }
// test: "### 0.3s: Flash frame" -> { durationMs: 300, title: "Flash frame" }
// test: heading without duration "### Just a title" -> warning, durationMs defaults to 1000
// test: heading with invalid duration "### abc: Title" -> warning, durationMs defaults to 1000
```

### Metadata comment parsing

```typescript
// test: '<!-- shot: {"id":"k7x2m","tags":["wide"]} -->' -> { id: "k7x2m", tags: ["wide"] }
// test: shot without metadata comment -> auto-generate id, empty tags
// test: malformed JSON in comment -> warning, auto-generate id
// test: HTML comment that isn't shot metadata -> ignored (not treated as shot metadata)
```

### Source position tracking

```typescript
// test: parsed shot has sourceRange.duration with correct {from, to} char offsets
// test: parsed shot has sourceRange.title with correct {from, to} char offsets
// test: parsed shot has sourceRange.scriptText with correct {from, to} char offsets
// test: parsed frame has sourceRange.path with correct {from, to} char offsets
// test: string-splice at sourceRange.duration replaces only the duration text
```

### Frontmatter parsing

```typescript
// test: project.md frontmatter extracts id, fps, aspect_ratio, target_duration, timestamps
// test: scene frontmatter extracts id, scene_number, order_index
// test: missing frontmatter -> generate defaults, emit warning
// test: partial frontmatter (missing fps) -> use default (24), emit warning
```

### Edge cases

```typescript
// test: empty scene file (frontmatter only, no shots) -> valid scene with empty shots array
// test: scene with no frontmatter -> auto-generate id, warn
// test: shot with unicode in script text -> preserved exactly
// test: shot with very long script text (>10KB) -> parsed correctly
// test: scene with 100 shots -> parsed correctly, ordering maintained
// test: malformed shot (missing --- separator) -> best-effort parse, warning
// test: image path with spaces -> preserved as-is
// test: multiple frames per shot -> all captured in order
// test: frame with caption in title attribute -> caption extracted
// test: frame without caption -> empty string caption
```

### Scene file ordering

```typescript
// test: parseProjectFolder with scene-001.md, scene-002.md, scene-003.md -> scenes in order 0,1,2
// test: parseProjectFolder with scene-010.md, scene-005.md -> scenes in order by filename
// test: parseProjectFolder with no scene files -> valid project with empty scenes array
```

## Types to Define

### Source Range (used by every parsed element)

```typescript
interface SourceRange {
  from: number;   // character offset in source file
  to: number;     // character offset in source file
  line: number;   // 1-based line number
}

interface SourceRanges {
  whole: SourceRange;          // the entire element
  [key: string]: SourceRange;  // named sub-ranges (duration, title, etc.)
}
```

### Parsed types (with source positions)

```typescript
interface ParsedProject {
  id: string;
  title: string;
  fps: number;
  aspectRatio: string;
  targetDuration?: number;
  styleNotes: string;
  referenceLinks: string[];
  globalNotes: string;
  createdAt: string;  // ISO timestamp
  updatedAt: string;
  sourceRanges: {
    title: SourceRange;
    styleNotes: SourceRange;
    referenceLinks: SourceRange;
    globalNotes: SourceRange;
  };
}

interface ParsedScene {
  id: string;
  sceneNumber: string;
  orderIndex: number;
  title: string;         // from H1 heading: "# Scene 1: The Opening" -> "The Opening"
  summary: string;       // body text after H1, before first ---
  notes: string;         // content under ## Notes heading
  shots: ParsedShot[];
  sourceFile: string;    // filename, e.g. "scene-001.md"
  sourceRanges: {
    title: SourceRange;
    summary: SourceRange;
    notes: SourceRange;
  };
}

interface ParsedShot {
  id: string;
  durationMs: number;
  title: string;          // from heading: "### 2s: Wide shot" -> "Wide shot"
  scriptText: string;     // paragraphs after heading
  generalNotes: string;   // blockquote content
  tags: string[];
  frames: ParsedFrame[];
  sourceRanges: {
    whole: SourceRange;
    metadataComment: SourceRange;
    duration: SourceRange;
    title: SourceRange;
    scriptText: SourceRange;
    generalNotes: SourceRange;
  };
}

interface ParsedFrame {
  id: string;            // generated from shot id + order index
  label: string;         // alt text from ![label](path)
  path: string;          // relative asset path
  caption: string;       // title from ![](path "caption")
  orderIndex: number;
  sourceRanges: {
    whole: SourceRange;
    path: SourceRange;
    caption: SourceRange;
  };
}

interface ParseWarning {
  file: string;
  line: number;
  message: string;
  severity: 'warning' | 'error';
}

interface ParseResult {
  project: ParsedProject;
  scenes: ParsedScene[];
  warnings: ParseWarning[];
}
```

### Conversion to/from existing ProjectState

The parser produces `ParseResult` (rich, with source positions). The app uses `ProjectState` (flat, no source info). Provide converters:

```typescript
function parsedToProjectState(result: ParseResult): ProjectState;
function projectStateToMarkdown(state: ProjectState): Map<string, string>;  // filename -> content
```

**Key conversion rules** (full mapping in [schema-and-naming.md](schema-and-naming.md#4-typescript-type-mapping)):

- `ParsedProject.createdAt` (ISO string) -> `Project.createdAt` (number via `new Date().getTime()`)
- `ParsedShot.title` -> `Shot.title` (**requires adding `title: string` to `Shot` in `src/types.ts`**)
- `ParsedShot.durationMs` -> `Shot.duration` (direct, both ms)
- `ParsedShot` has no `sceneId` / `orderIndex` / `shotCode` -> computed during flattening
- `ParsedFrame.path` -> `StoryboardFrame.image` (relative path replaces base64/blob URL semantics)
- `ParsedFrame` has no `shotId` / `version` / `overlayData` -> set from parent / defaults
- `ProjectState.sequences` -> always `[]` (not mapped from markdown)
- `ProjectState.versions` -> always `[]` (git handles versioning)

## Files to Create

| File | Purpose |
|------|---------|
| `server/parser/types.ts` | All parsed types, SourceRange, ParseResult, ParseWarning |
| `server/parser/index.ts` | Main entry: `parseProjectFolder(files: Map<string, string>): ParseResult` and `serializeProject(result: ParseResult): Map<string, string>` |
| `server/parser/parseProject.ts` | Parse `project.md` content -> `ParsedProject` |
| `server/parser/parseScene.ts` | Parse a single `scene-*.md` content -> `ParsedScene` with shots |
| `server/parser/parseShot.ts` | Parse shot heading syntax (`### 2s: title`), metadata comments, frames |
| `server/parser/serialize.ts` | Serialize `ParseResult` back to markdown file contents |
| `server/parser/converters.ts` | `parsedToProjectState()` and `projectStateToMarkdown()` |
| `server/parser/index.test.ts` | All test cases listed above |
| `server/parser/fixtures/` | Test fixture markdown files (valid project, edge cases, malformed) |

## Dependencies

```json
{
  "unified": "^11.x",
  "remark-parse": "^11.x",
  "remark-stringify": "^11.x",
  "remark-frontmatter": "^5.x",
  "yaml": "^2.x",
  "nanoid": "^5.x",
  "vitest": "^2.x"
}
```

## Implementation Sequence

1. **Define types** (`types.ts`) -- all interfaces above
2. **Write test fixtures** -- create sample `project.md` and `scene-001.md` files in `fixtures/`
3. **Write ALL test cases** -- empty implementations, all tests should fail
4. **Implement `parseProject.ts`** -- frontmatter extraction via `remark-frontmatter`, heading/section parsing
5. **Implement `parseShot.ts`** -- duration regex (`/^(\d+(?:\.\d+)?)(s|ms|m)$/`), metadata comment JSON extraction, frame image parsing
6. **Implement `parseScene.ts`** -- walk MDAST tree, split at `---` thematic breaks, delegate shots to `parseShot`
7. **Implement `index.ts`** -- orchestrate: accept a `Map<filename, content>`, parse project.md, sort and parse scene files
8. **Implement `serialize.ts`** -- reverse: produce markdown strings from parsed types. Must be whitespace-stable.
9. **Implement `converters.ts`** -- map between parsed types (with source ranges) and flat `ProjectState` (for the existing Zustand store)
10. **Run tests, iterate** -- fix until all pass, especially round-trip tests

## Key Decisions

- **remark/unified over manual regex:** MDAST gives us an AST with built-in position tracking on every node. We walk the tree, we don't regex over strings.
- **Duration in heading, not in bullet list:** `### 2s: Wide shot` is more readable than `### Shot 010` + `- duration: 2000`. The duration IS the first word of the heading.
- **HTML comments for machine metadata:** `<!-- shot: {...} -->` keeps the rendered markdown clean. The parser extracts JSON from comments immediately preceding shot headings.
- **Shot code is derived, not stored:** Shot codes (`010`, `020`, `030`) are computed from shot position in the scene. They're not in the markdown -- they're a display concern for the PWA.
- **Source positions from remark:** remark's MDAST nodes have `.position.start.offset` and `.position.end.offset`. We map these to our `SourceRange` type.

## Done Criteria

- [ ] All test cases pass
- [ ] `parseProjectFolder` -> `serializeProject` -> `parseProjectFolder` produces identical `ParseResult` (round-trip)
- [ ] Source positions are accurate: string-splicing at a `SourceRange` modifies only the intended text
- [ ] Malformed input produces warnings, never throws
- [ ] Parser has zero dependencies on Node.js APIs, browser APIs, or I/O (pure library)
- [ ] `parsedToProjectState()` produces a valid `ProjectState` compatible with the existing Zustand store
- [ ] `projectStateToMarkdown()` produces valid, well-formatted markdown files

## Cross-References

- **Step 2** uses the parser in the browser via `projectLoader.ts` (shared code)
- **Step 3** uses the parser in the companion server via `stateManager.ts`
- **Step 4** uses source positions for bidirectional editing (PWA edits -> string splice -> file write)
- **Step 5** MCP tools use `parsedToProjectState()` for read operations and `projectStateToMarkdown()` for write operations
- **Step 6** agent skills document the markdown format defined here
