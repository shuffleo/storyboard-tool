# Step 7: End-to-End Testing

> **Estimate:** 1 day
> **Prerequisites:** Steps 1-6 (all components built)
> **Depends on:** Everything
> **Blocks:** Nothing (this is the final step)

## Goal

Validate the **full pipeline** works end-to-end: agent edits markdown -> companion detects -> parses -> diffs -> pushes via WebSocket -> PWA renders the change. And the reverse: user edits in PWA -> mutation sent via WebSocket -> companion writes markdown -> file is correct on disk.

These tests prove the entire system works together, catching integration issues that unit tests miss.

## Test Environment Setup

### Components to run

```
1. Project folder on disk (temp directory with scaffolded project)
2. Companion server (started programmatically in test setup)
3. PWA running in a browser (Playwright or headless Chrome)
4. Test runner acting as the "agent" (edits files + calls MCP tools)
```

### Test harness

```typescript
interface E2ETestContext {
  projectPath: string;           // temp directory
  companionProcess: ChildProcess; // or programmatic server instance
  wsClient: WebSocket;           // test WebSocket client (simulates PWA)
  mcpClient: McpClient;          // MCP client for tool calls
  browser?: Page;                // Playwright page (for visual tests)

  // Helpers
  writeFile(name: string, content: string): Promise<void>;
  readFile(name: string): Promise<string>;
  deleteFile(name: string): Promise<void>;
  waitForDiff(timeoutMs?: number): Promise<DiffOp[]>;
  getState(): Promise<ProjectState>;
}
```

### Setup / teardown

```typescript
beforeEach:
  1. Create temp directory
  2. Scaffold project: project.md + scene-001.md with 2 shots + assets/
  3. Start companion server pointing at temp directory
  4. Connect WebSocket test client
  5. Wait for sync:full message
  6. (Optional) Launch Playwright browser, navigate to PWA, connect to companion

afterEach:
  1. Disconnect WebSocket
  2. Stop companion server
  3. (Optional) Close browser
  4. Delete temp directory
```

## Test Cases

### Pipeline: File Edit -> PWA Update

```typescript
// E2E-1: Agent edits a shot title in markdown -> PWA receives diff with updated title
test("file edit propagates to PWA", async (ctx) => {
  // Read scene-001.md
  // Change "### 2s: Wide shot - city skyline at dawn" to "### 2s: Wide shot - mountain sunrise"
  // Write file
  // Wait for diff
  // Assert diff contains: { type: 'update', entity: 'shot', data: { title: 'Wide shot - mountain sunrise' } }
  // Assert getState().shots[0].title includes the new text
});

// E2E-2: Agent changes shot duration -> PWA reflects new duration
test("duration change propagates to PWA", async (ctx) => {
  // Change "### 2s:" to "### 3.5s:"
  // Wait for diff
  // Assert diff contains: { type: 'update', entity: 'shot', data: { duration: 3500 } }
});

// E2E-3: Agent adds a new shot to a scene file -> PWA gains new shot
test("new shot added to file appears in PWA", async (ctx) => {
  // Append a new shot block to scene-001.md (after existing shots)
  // Wait for diff
  // Assert diff contains: { type: 'create', entity: 'shot', ... }
  // Assert getState().shots.length increased by 1
});

// E2E-4: Agent creates a new scene file -> PWA gains new scene
test("new scene file appears in PWA", async (ctx) => {
  // Write scene-002.md with frontmatter + 1 shot
  // Wait for diff
  // Assert diff contains: { type: 'create', entity: 'scene', ... }
  // Assert getState().scenes.length === 2
});

// E2E-5: Agent deletes a scene file -> PWA removes scene and its shots
test("deleted scene file removed from PWA", async (ctx) => {
  // Delete scene-001.md
  // Wait for diff
  // Assert diff contains: { type: 'delete', entity: 'scene', ... }
  // Assert getState().scenes.length === 0
  // Assert getState().shots.length === 0
});

// E2E-6: Agent modifies project.md -> PWA project metadata updated
test("project.md change updates PWA metadata", async (ctx) => {
  // Change title in project.md from "# My Project" to "# Updated Project"
  // Wait for diff
  // Assert getState().project.title === "Updated Project"
});
```

### Pipeline: PWA Mutation -> File Update

```typescript
// E2E-7: PWA sends shot update mutation -> markdown file updated on disk
test("PWA mutation writes to file", async (ctx) => {
  // Send mutation:apply via WebSocket: update shot script text
  // Wait for mutation:ack
  // Read scene-001.md from disk
  // Assert file contains the updated script text
  // Assert file still has valid markdown structure
});

// E2E-8: PWA creates new scene -> new scene file appears on disk
test("PWA create scene writes new file", async (ctx) => {
  // Send mutation:apply: create scene with title "Beach Scene"
  // Wait for mutation:ack
  // Assert scene-002.md exists on disk
  // Parse scene-002.md -> assert title is "Beach Scene"
});

// E2E-9: PWA deletes a shot -> shot removed from markdown file
test("PWA delete shot modifies file", async (ctx) => {
  // Get current state, note first shot id
  // Send mutation:apply: delete shot
  // Wait for mutation:ack
  // Read scene-001.md, parse -> assert shot is gone
});
```

### Pipeline: MCP Tool -> File + PWA Update

```typescript
// E2E-10: storyboard_write via MCP creates shot -> file updated AND PWA updated
test("MCP write propagates to both file and PWA", async (ctx) => {
  // Call storyboard_write with create shot operation via MCP client
  // Wait for diff on WebSocket client
  // Assert diff contains create op
  // Read scene file from disk -> assert new shot exists in markdown
});

// E2E-11: storyboard_read returns current state after file edits
test("MCP read reflects file edits", async (ctx) => {
  // Edit scene-001.md directly (change title)
  // Wait 500ms for companion to detect and parse
  // Call storyboard_read("all") via MCP
  // Assert returned state contains the updated title
});

// E2E-12: storyboard_timeline returns correct computed times
test("MCP timeline computes correct times", async (ctx) => {
  // Initial state: shot1 = 2000ms, shot2 = 1500ms
  // Call storyboard_timeline("get_timeline")
  // Assert shot1: { startMs: 0, endMs: 2000 }
  // Assert shot2: { startMs: 2000, endMs: 3500 }
});

// E2E-13: storyboard_assets adds image file and frame
test("MCP asset add creates file and frame", async (ctx) => {
  // Create a small test PNG (1x1 pixel)
  // Call storyboard_assets("add", { data: base64png, filename: "test.png", shot_id: shotId })
  // Assert file exists at assets/test.png
  // Assert getState().frames includes new frame pointing to "assets/test.png"
});

// E2E-14: storyboard_sync pull re-reads from disk
test("MCP sync pull refreshes state from disk", async (ctx) => {
  // Bypass file watcher: directly write a modified scene file
  // State hasn't updated yet (watcher may be debouncing)
  // Call storyboard_sync("pull")
  // Assert state now matches the file on disk
});
```

### Resilience Tests

```typescript
// E2E-15: Companion offline -> PWA continues working
test("PWA works without companion", async (ctx) => {
  // Stop companion server
  // PWA should still function (using FSA or IndexedDB)
  // No error messages, graceful degradation
});

// E2E-16: Companion reconnect -> PWA re-syncs
test("PWA reconnects and syncs on companion restart", async (ctx) => {
  // Stop companion server
  // Wait for WebSocket client to detect disconnect
  // Edit a file directly on disk
  // Restart companion server
  // Wait for WebSocket client to reconnect
  // Assert PWA receives sync:full with current file state (including the edit)
});

// E2E-17: Concurrent edits don't corrupt state
test("concurrent file and PWA edits resolve correctly", async (ctx) => {
  // Agent edits shot 1 title via file
  // Simultaneously, PWA updates shot 2 duration via WebSocket
  // Wait for both to settle (500ms)
  // Assert final state has both changes
  // Assert markdown files reflect both changes
});

// E2E-18: Malformed markdown doesn't crash companion
test("malformed markdown handled gracefully", async (ctx) => {
  // Write a scene file with broken frontmatter
  // Wait for watcher event
  // Assert companion is still running
  // Assert WebSocket client is still connected
  // Assert a warning was logged (not an error crash)
  // Fix the file -> assert state updates correctly
});

// E2E-19: Large project performance
test("handles 50 scenes with 10 shots each", async (ctx) => {
  // Generate 50 scene files, each with 10 shots
  // Start companion
  // Measure time to parse and serve initial state
  // Assert initial sync completes within 5 seconds
  // Edit one shot in scene-025
  // Assert diff arrives within 1 second
});
```

### Browser Visual Tests (Playwright, optional)

```typescript
// E2E-20: Agent edit appears in the Storyboard view
test("visual: agent edit renders in browser", async (ctx) => {
  // Open PWA in Playwright
  // Navigate to Storyboard view
  // Agent edits shot title in markdown file
  // Wait for UI to update (assert text appears on screen)
  // Screenshot for visual regression
});

// E2E-21: PWA edit in Table view persists to disk
test("visual: table view edit writes to file", async (ctx) => {
  // Open PWA in Playwright
  // Navigate to Table view
  // Click on a script text cell, type new text
  // Wait for auto-save (1s debounce)
  // Read the scene file from disk
  // Assert the new text is in the file
});

// E2E-22: Animatics view shows correct timing
test("visual: animatics timeline matches durations", async (ctx) => {
  // Open PWA in Playwright
  // Navigate to Animatics view
  // Agent sets all shot durations via MCP
  // Assert timeline segments have correct widths (proportional to duration)
});
```

## Files to Create

| File | Purpose |
|------|---------|
| `tests/e2e/setup.ts` | Test harness: temp dir, companion start/stop, WebSocket client, helpers |
| `tests/e2e/file-to-pwa.test.ts` | Tests E2E-1 through E2E-6 (file edits -> PWA) |
| `tests/e2e/pwa-to-file.test.ts` | Tests E2E-7 through E2E-9 (PWA mutations -> files) |
| `tests/e2e/mcp-tools.test.ts` | Tests E2E-10 through E2E-14 (MCP tool -> file + PWA) |
| `tests/e2e/resilience.test.ts` | Tests E2E-15 through E2E-19 (offline, reconnect, concurrent, malformed) |
| `tests/e2e/visual.test.ts` | Tests E2E-20 through E2E-22 (Playwright browser tests, optional) |
| `tests/e2e/fixtures/` | Test project templates (scaffolded project.md, scene files, small test images) |

## Dependencies

```json
{
  "vitest": "^2.x",
  "@playwright/test": "^1.x",
  "ws": "^8.x",
  "@modelcontextprotocol/sdk": "^latest"
}
```

Playwright is optional -- the non-visual E2E tests are the priority.

## Implementation Sequence

### 7.1 Test Harness (`tests/e2e/setup.ts`)

1. `createTestProject()`:
   - Create temp directory via `fs.mkdtemp()`
   - Write `project.md` with test frontmatter
   - Write `scene-001.md` with 2 shots and frames
   - Copy a small test image to `assets/`
   - Return `{ path, cleanup }`

2. `startCompanion(projectPath)`:
   - Start companion server programmatically (import and call, don't spawn process)
   - Return server instance with `.stop()` method
   - Alternative: spawn as child process for true isolation

3. `connectTestClient(port)`:
   - Create WebSocket client
   - Wait for `sync:full` message
   - Return client with helpers: `sendMutation()`, `waitForDiff()`, `getState()`

4. `connectMcpClient()`:
   - Create MCP client connected to companion's stdin/stdout
   - Return client with `callTool(name, params)` helper

5. `createE2EContext()`:
   - Compose all of the above into a single context object
   - Provide `cleanup()` that tears down everything

### 7.2 File-to-PWA Tests (`tests/e2e/file-to-pwa.test.ts`)

Implement E2E-1 through E2E-6. Each test:
1. Set up context
2. Modify a file on disk
3. Wait for diff via `ctx.waitForDiff()`
4. Assert diff contents
5. Assert `ctx.getState()` reflects the change
6. Clean up

### 7.3 PWA-to-File Tests (`tests/e2e/pwa-to-file.test.ts`)

Implement E2E-7 through E2E-9. Each test:
1. Set up context
2. Send mutation via `ctx.wsClient.sendMutation()`
3. Wait for `mutation:ack`
4. Read the file from disk
5. Parse and assert the change is present
6. Clean up

### 7.4 MCP Tool Tests (`tests/e2e/mcp-tools.test.ts`)

Implement E2E-10 through E2E-14. Each test:
1. Set up context (including MCP client)
2. Call MCP tool via `ctx.mcpClient.callTool()`
3. Assert tool response
4. Assert file on disk reflects the change
5. Assert WebSocket client received the diff
6. Clean up

### 7.5 Resilience Tests (`tests/e2e/resilience.test.ts`)

Implement E2E-15 through E2E-19. These tests involve starting/stopping the companion, concurrent operations, and performance checks. More complex setup but critical for production readiness.

### 7.6 Visual Tests (`tests/e2e/visual.test.ts`) -- OPTIONAL

Implement E2E-20 through E2E-22 using Playwright. These are optional but valuable for confidence:
1. Start companion
2. Launch Playwright browser
3. Navigate to PWA URL (localhost dev server or GitHub Pages)
4. Perform actions (agent edits file, user edits in UI)
5. Assert visual state via element queries or screenshots
6. Clean up

## Test Running

```bash
# Run all E2E tests (no browser)
npm run test:e2e

# Run with browser visual tests
npm run test:e2e:visual

# Run a specific test file
npx vitest run tests/e2e/file-to-pwa.test.ts
```

Add to `package.json` scripts:
```json
{
  "test:e2e": "vitest run tests/e2e/ --exclude '**/visual*'",
  "test:e2e:visual": "vitest run tests/e2e/"
}
```

## Key Decisions

- **Programmatic companion over subprocess:** Import the companion server directly in tests for faster startup and easier debugging. Fall back to subprocess if isolation is needed.
- **WebSocket test client, not browser:** For non-visual tests, use a raw WebSocket client instead of Playwright. Much faster, easier to assert on messages.
- **Playwright optional:** Visual tests are valuable but not blocking. Ship the non-visual E2E tests first.
- **Temp directories:** Each test gets a fresh temp directory. No shared state between tests.
- **Performance baselines:** E2E-19 establishes performance expectations (initial sync < 5s for 500 shots, single diff < 1s). These are guards against regressions.

## Done Criteria

- [ ] All non-visual E2E tests pass (E2E-1 through E2E-19)
- [ ] File-to-PWA pipeline works: edit file -> change appears via WebSocket within 1s
- [ ] PWA-to-file pipeline works: send mutation -> file updated on disk within 1s
- [ ] MCP tools produce correct file changes AND WebSocket diffs
- [ ] Companion survives: disconnect, malformed markdown, concurrent edits
- [ ] Performance: 500-shot project syncs in < 5s, single change in < 1s
- [ ] Test harness is reusable for future tests
- [ ] (Optional) Visual tests pass in Playwright

## Cross-References

- **Step 1** parser is tested indirectly via round-trip through the full pipeline
- **Step 2** FSA integration is tested in offline/standalone scenarios
- **Step 3** companion server is the central component under test
- **Step 4** WebSocket sync client behavior is validated end-to-end
- **Step 5** MCP tools are tested via the MCP client
- **Step 6** agent skills describe workflows that these tests validate
