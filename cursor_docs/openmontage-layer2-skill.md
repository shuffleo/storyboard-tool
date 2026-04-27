# Storyboard Orchestration (Layer 2)

> **NOTE:** This file is a draft for `skills/core/storyboard.md` in the OpenMontage repo.
> Copy it there once the OpenMontage repo is set up.

OpenMontage workflow patterns for storyboard creation and iteration.
Requires: Layer 3 storyboard skill, companion server running.

## Prerequisites

- Companion server running: `npm run server:start -- --project <path>`
- PWA open in browser for visual feedback (GitHub Pages or localhost)
- Layer 3 skill (`.agents/skills/storyboard/SKILL.md`) loaded for format details

## Workflow: Script to Storyboard

Convert a script, lyrics, or treatment into a structured storyboard.

1. **Analyze the source material**
   - Identify natural breaks (scenes, verses, acts, segments)
   - Estimate total duration and segment durations
   - Note any audio sync points or timing constraints

2. **Create scene files**
   - One `scene-NNN.md` per logical segment
   - Include title, summary, and any notes in each file
   - Set `order_index` in frontmatter to match desired order

3. **Break scenes into shots**
   - Add `### {duration}: {title}` blocks within each scene
   - Include `<!-- shot: {"id":"...","tags":[...]} -->` metadata comments
   - Write script text describing the action
   - Use blockquotes for camera/direction notes

4. **Generate initial image prompts**
   - Read all shots: `storyboard_read("shots")`
   - Generate prompts from script text, tags, and style notes
   - Use the project's style notes section for consistency

5. **Review timing**
   - Get timeline: `storyboard_timeline("get_timeline")`
   - Adjust durations to match audio/music if applicable
   - Apply: `storyboard_timeline("set_durations", {...})`

6. **Iterate**
   - Preview in PWA, gather user feedback
   - Refine prompts, timing, and structure
   - Checkpoint: `git commit -m "storyboard: initial structure complete"`

## Workflow: Image Generation Pipeline

Generate visual frames for all shots in the storyboard.

1. **Get shots needing images**
   ```
   storyboard_read("shots")
   ```
   Filter to shots with no frames or shots flagged for regeneration.

2. **Build image prompts**
   For each shot, combine:
   - Shot title and script text
   - Scene summary and style notes
   - Tag-based style modifiers (e.g., "wide" -> establishing shot composition)
   - Global style notes from `project.md`

3. **Generate images**
   Call image generation API (Seedance, DALL-E, Midjourney, etc.)
   with the constructed prompts.

4. **Save generated images**
   ```
   storyboard_assets("add", { data: "<base64>", filename: "sc001-sh010-f01.png", shot_id: "sh1" })
   ```

5. **Review and iterate**
   - Preview in PWA
   - Regenerate failed/unsatisfactory results
   - Use cheaper model for drafts, expensive for finals

6. **Checkpoint**
   ```
   git commit -m "storyboard: generated frames for scenes 1-3"
   ```

## Workflow: Animatic Timing

Refine shot durations for animatic playback.

1. **Get current timeline**
   ```
   storyboard_timeline("get_timeline")
   ```

2. **Analyze audio** (if music-driven)
   - Identify beats, bar boundaries, and phrase boundaries
   - Map segments to shots
   - Calculate duration for each shot to match audio

3. **Apply durations**
   ```
   storyboard_timeline("set_durations", {
     "sh1": 3000,
     "sh2": 1500,
     "sh3": 2000
   })
   ```
   Durations below 300ms are clamped automatically.

4. **Preview and fine-tune**
   - Watch the animatic in the PWA
   - Adjust individual shots as needed
   - Re-apply with another `set_durations` call

## Workflow: Iterative Refinement

Loop with the user for creative iteration.

1. **Make changes**
   - Direct file edit for text/structure changes
   - MCP tools for validated operations
   - Changes appear in PWA within ~500ms (file watcher) or immediately (MCP)

2. **Wait for user feedback**
   - The PWA shows changes live
   - User reviews in timeline, shot grid, or animatic view

3. **Apply feedback**
   - Parse feedback into specific actions
   - Execute changes
   - Verify in PWA

4. **Checkpoint**
   ```
   git commit -m "storyboard: applied feedback round 2"
   ```

## Tool Chaining Patterns

Common multi-tool sequences for OpenMontage pipelines:

### Read-Modify-Write
```
storyboard_read("shots")  →  process/transform  →  storyboard_write([operations])
```

### Roundtrip via External Tool
```
storyboard_export("json")  →  external processing  →  storyboard_import("json")
```

### Asset Pipeline
```
storyboard_read("shots")  →  generate images  →  storyboard_assets("add", ...)
```

### Bulk Edit + Force Sync
```
Direct file edits  →  storyboard_sync("pull")
```

### Reorder + Timeline Update
```
storyboard_reorder("shots", ordered_ids)  →  storyboard_timeline("set_durations", {...})
```

## Checkpoint Conventions

Create git checkpoints at these milestones:
- After initial scene/shot structure is created
- After each round of image generation
- After timing pass is complete
- Before and after major restructuring
- After applying user feedback rounds

**Commit message format:**
```
storyboard: <action> - <detail>
```

Examples:
```
storyboard: create - initial 5-scene structure from lyrics
storyboard: generate - frames for scenes 1-3
storyboard: timing - sync shots to audio beats
storyboard: refine - applied feedback round 2
storyboard: restructure - merged scenes 2 and 3
```

## Error Recovery

### MCP tool returns error
Read the error message carefully. Common causes:
- Invalid entity ID → re-read state to get current IDs
- Missing required field → check the tool schema in Layer 3 skill
- File not found → verify companion is watching the correct project path

### PWA not updating
1. Check companion status: `storyboard_sync("status")`
2. If disconnected, restart companion
3. Force re-read: `storyboard_sync("pull")`
4. Force broadcast: `storyboard_sync("push")`

### State seems corrupted
1. `storyboard_sync("pull")` to re-read from disk (source of truth)
2. If files are wrong: `git diff` to inspect changes
3. Recover: `git checkout -- .` to restore last commit

### Companion not starting
1. Check if port is in use: `lsof -i :PORT`
2. Check project path exists and contains `project.md`
3. Restart with verbose logging
