# Step 6: Agent Skills for OpenMontage

> **Estimate:** 1 day
> **Prerequisites:** Steps 1-5 (format defined, MCP tools working)
> **Depends on:** Markdown format spec (step 1), MCP tool schemas (step 5), OpenMontage skill architecture
> **Blocks:** Step 7 (E2E tests validate agent workflows)

## Goal

Write **agent skills** so the OpenMontage agent knows how to work with the storyboard system. Two skill files:

1. **Layer 3 skill** (`.agents/skills/storyboard/SKILL.md` in the storyboard repo): generic, project-independent knowledge about the markdown format, data model, and available MCP tools. Any agent can use this.
2. **Layer 2 skill** (`skills/core/storyboard.md` in the OpenMontage repo): project-specific workflow knowledge -- how OpenMontage orchestrates storyboard tasks, which tools to chain together, common patterns.

## Prerequisite: Understand OpenMontage Skill Architecture

Before writing skills, review the existing skill structure in the OpenMontage repo:

```
OpenMontage/
├── skills/
│   ├── INDEX.md              # Skill registry
│   └── core/                 # Layer 2 skills
│       ├── video-edit.md
│       └── storyboard.md     # NEW (this step)
├── .agents/
│   └── skills/               # Layer 3 skills
│       ├── video-edit/
│       │   └── SKILL.md
│       └── storyboard/       # NEW (this step)
│           └── SKILL.md
```

**Layer 3** = technology-level knowledge (any project can use)
**Layer 2** = project-level orchestration (OpenMontage-specific workflows)

## Files to Create

| File | Repo | Purpose |
|------|------|---------|
| `.agents/skills/storyboard/SKILL.md` | storyboard | Layer 3: format spec, data model, MCP tool reference |
| `skills/core/storyboard.md` | OpenMontage | Layer 2: workflow orchestration, tool chaining patterns |

## Implementation Sequence

### 6.1 Layer 3 Skill: Format and Tools Reference

This skill goes in the **storyboard repo** at `.agents/skills/storyboard/SKILL.md`. It teaches any AI agent how to read, write, and manage storyboard projects.

**Sections to include:**

#### Header / Trigger
```markdown
# Storyboard Markdown Format & MCP Tools

Use this skill when working with storyboard projects stored as markdown files,
or when calling storyboard MCP tools. Covers the markdown format spec, data
model, file conventions, and all available MCP tools.
```

#### Folder Structure
Document the project folder layout:
- `project.md` with frontmatter schema
- `scene-NNN.md` naming convention and ordering
- `assets/` directory conventions
- File naming patterns for assets (`sc001-sh010-f01.png`)

#### Markdown Format Spec
Exact syntax reference with examples:
- Project frontmatter fields (id, fps, aspect_ratio, target_duration, timestamps)
- Scene frontmatter fields (id, scene_number, order_index)
- Scene body structure (H1 title, summary paragraphs, ## Notes section)
- Shot syntax: `### {duration}: {title}` with duration units (s, ms, m)
- Shot metadata comments: `<!-- shot: {"id":"...","tags":[...]} -->`
- Shot body: script text (paragraphs), general notes (blockquotes), frames (images)
- Frame syntax: `![label](assets/path "caption")`
- Section separators: `---` between shots

#### Data Model Reference
Map between markdown and the internal `ProjectState` types:
- `Project` fields and where they live in `project.md`
- `Scene` fields and where they live in `scene-NNN.md`
- `Shot` fields: duration in heading, text in body, metadata in comment
- `StoryboardFrame` fields: image in `![](path)`, caption in title attribute
- Shot codes are computed (not stored): position 0 -> "010", position 1 -> "020"

#### Direct File Editing Guide
When to edit files directly vs use MCP tools:
- **Edit directly** for: bulk text changes, find-and-replace across shots, adding/removing scenes, restructuring the storyboard, any change an IDE/editor can do
- **Use MCP tools** for: atomic batch operations with validation, reading computed state (timeline), managing binary assets, triggering live sync to PWA
- **Always after direct edits:** call `storyboard_sync("pull")` to force the companion to re-read files if immediate PWA sync is needed (though the file watcher usually handles this within 500ms)

#### MCP Tool Reference
For each of the 8 tools, document:
- Tool name and one-line description
- When to use it (and when NOT to)
- Parameters with types and examples
- Return value format
- Common patterns / example calls

#### Best Practices
- Always set shot IDs in metadata comments (the parser generates them if missing, but explicit is better for merge stability)
- Use descriptive scene filenames matching the scene_number frontmatter
- Keep images in `assets/`, never inline base64 in markdown
- Use git commits as checkpoints after major changes
- Prefer batch `storyboard_write` over many sequential operations

#### Common Patterns
Example sequences for common agent tasks:
1. "Add 5 shots to a scene" -- create the shots block in the scene file
2. "Reorder all scenes" -- rename files + update frontmatter order_index
3. "Generate image prompts for all shots" -- read all shots, produce prompts, update scriptText
4. "Set timing for animatic" -- use `storyboard_timeline("set_durations", {...})`
5. "Import from CSV" -- use `storyboard_import("csv", data)`

### 6.2 Layer 2 Skill: OpenMontage Workflow Orchestration

This skill goes in the **OpenMontage repo** at `skills/core/storyboard.md`. It teaches the OpenMontage agent how to orchestrate storyboard workflows using its tool registry, pipeline system, and checkpoints.

**Sections to include:**

#### Header
```markdown
# Storyboard Orchestration (Layer 2)

OpenMontage workflow patterns for storyboard creation and iteration.
Requires: Layer 3 storyboard skill, companion server running.
```

#### Prerequisites
- Companion server must be running (`npm run server:start -- --project <path>`)
- PWA should be open in browser for visual feedback
- Layer 3 skill (`.agents/skills/storyboard/SKILL.md`) must be loaded

#### Workflow: Script to Storyboard
Step-by-step for converting a script/lyrics into a storyboard:
1. Parse the script into logical segments (scenes)
2. Create scene files with descriptive titles and summaries
3. Break each scene into shots with duration estimates
4. Generate initial image prompts for each shot
5. Review timing in the timeline view
6. Iterate on prompts and timing

#### Workflow: Image Generation Pipeline
How to generate images for storyboard frames:
1. Read all shots that need images (`storyboard_read("shots")`)
2. For each shot, use the script text and tags to generate prompts
3. Call image generation API (Seedance, DALL-E, etc.)
4. Save generated images via `storyboard_assets("add", ...)`
5. Review in PWA, iterate on failed/unsatisfactory results

#### Workflow: Animatic Timing
How to set and refine shot durations:
1. Get current timeline (`storyboard_timeline("get_timeline")`)
2. Adjust durations based on audio/music analysis
3. Apply via `storyboard_timeline("set_durations", {...})`
4. Preview in PWA animatics view
5. Fine-tune specific shots

#### Workflow: Iterative Refinement
How to loop with the user:
1. Make changes (direct file edit or MCP tools)
2. Wait for user feedback (the PWA shows changes live)
3. Apply feedback
4. Checkpoint with git commit

#### Tool Chaining Patterns
Common multi-tool sequences for OpenMontage pipelines:
- `storyboard_read -> process -> storyboard_write` (read-modify-write)
- `storyboard_export("json") -> external tool -> storyboard_import("json")` (roundtrip)
- `storyboard_read("shots") -> image gen -> storyboard_assets("add")` (asset pipeline)
- Direct file edit -> `storyboard_sync("pull")` (force sync after bulk edit)

#### Checkpoint Conventions
When and how to create git checkpoints:
- After initial scene/shot structure is created
- After each round of image generation
- After timing pass
- Before/after major restructuring
- Commit message format: `storyboard: <action> - <detail>`

#### Error Recovery
What to do when things go wrong:
- MCP tool returns error -> read the error message, fix input, retry
- PWA not updating -> check companion status with `storyboard_sync("status")`
- State seems corrupted -> `storyboard_sync("pull")` to re-read from disk
- Files seem wrong -> `git diff` to check, `git checkout` to recover

### 6.3 Update OpenMontage Skill Index

Add the new storyboard skill to `OpenMontage/skills/INDEX.md`:

```markdown
## Core Skills

| Skill | File | Description |
|-------|------|-------------|
| Video Edit | `core/video-edit.md` | Video editing workflows |
| Storyboard | `core/storyboard.md` | Storyboard creation and iteration |
```

## Validation (dry-run testing)

Since skills are documentation, "testing" means validating they work in practice:

1. **Format accuracy:** every markdown example in the skill must match the actual parser output. Verify by running the parser on the examples.
2. **Tool accuracy:** every MCP tool call example must match the actual tool schema. Cross-reference with `server/mcpServer.ts` tool registrations.
3. **Workflow completeness:** walk through each workflow step and verify each operation is possible with the described tools/file edits.
4. **Dry run:** have the agent read the skill and attempt a simple task (create a 3-scene storyboard from a paragraph description) without human guidance.

```typescript
// Validation checklist:
// [ ] All frontmatter fields in skill match types.ts
// [ ] All MCP tool names and params match mcpServer.ts
// [ ] Example markdown in skill round-trips through parser without warnings
// [ ] Workflow steps reference correct tool names and params
// [ ] Direct file editing examples produce valid markdown
// [ ] Asset naming conventions match what the companion expects
```

## Key Decisions

- **Layer 3 in storyboard repo, not OpenMontage:** The format spec skill lives with the format definition. Any agent (not just OpenMontage) can discover and use it.
- **Layer 2 in OpenMontage repo:** Workflow orchestration is project-specific. It knows about OpenMontage's pipeline system, checkpoints, and tool registry.
- **Explicit "when to use MCP vs direct edit" guidance:** The agent should prefer direct file edits for bulk text changes and MCP tools for structured/validated operations. This prevents unnecessary MCP overhead and uses the agent's natural strength (editing text files).
- **No hardcoded prompts or styles:** The skills describe the system's capabilities, not specific creative content. Styles, prompts, and visual approaches are user decisions.

## Done Criteria

- [ ] Layer 3 SKILL.md covers complete format spec with all markdown syntax
- [ ] Layer 3 SKILL.md documents all 8 MCP tools with examples
- [ ] Layer 2 storyboard.md covers all workflow patterns
- [ ] Layer 2 storyboard.md includes error recovery guidance
- [ ] All markdown examples in skills are parser-valid (verified by running parser)
- [ ] All MCP tool examples match actual schemas (verified by cross-reference)
- [ ] Dry-run: agent can create a simple storyboard using only the skill instructions
- [ ] OpenMontage skill index updated

## Cross-References

- **Step 1** defines the markdown format documented in Layer 3
- **Step 5** defines the MCP tool schemas documented in Layer 3
- **Step 7** E2E tests validate agent workflows described in Layer 2
- **OpenMontage repo** `docs/ARCHITECTURE.md` describes the skill layer system
- **OpenMontage repo** `.agents/skills/video-edit/SKILL.md` is a reference example
