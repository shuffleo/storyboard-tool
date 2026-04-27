# Deep Analysis: `storyboard-player`

> **Repo:** [https://github.com/deniskropp/storyboard-player](https://github.com/deniskropp/storyboard-player)
> **Author:** Denis Kropp (`dok@directfb1.org`)
> **Language:** Python 3.8+
> **License:** MIT
> **Analyzed:** 2026-04-27
> **Commit count:** 14 (small, early-stage project)

---

## 1. Markdown Format

### What syntax does it use?

The project uses **standard GitHub-Flavored Markdown** with a very minimal, implicit schema. There is **no frontmatter, no YAML metadata, no custom directives, and no explicit timing/duration markup**. The entire storyboard format relies on a specific *structural convention*:

```
## Title

* by Author

![alt text](image_url)

Scene description paragraph goes here. It can be multiple sentences.

![alt text](image_url)

Another scene description paragraph.
```

### Real example from `test/test-storyboard.md`

```markdown
## The Digital Symphony

* by DOK

![filted to load](https://ik.imagekit.io/storybird/images/.../1_....jpg?tr=q-80)

In the heart of a bustling digital workspace, vibrant neon lines pulse
rhythmically across the virtual ceiling, bathing the area in a soft,
colorful glow. Transparent interfaces float gracefully in mid-air...

![filted to load](https://ik.imagekit.io/storybird/images/.../2_....jpg?tr=q-80)

FizzEase (...) dances gracefully in the air, its luminous form reflecting
the colorful lights of the workspace...
```

### How scenes are defined

A "scene" is an **implicit pair** of:

1. An image (`![alt](url)`)
2. The paragraph of text that follows it

There are no scene markers, no `---` separators, no numbered scenes, and no explicit scene boundaries. The parser discovers scenes by looking for `<img>` → `<p>` pairs in the HTML output.

### How images are referenced

Images are standard markdown images pointing to **remote URLs** (specifically imagekit.io CDN URLs in the test file). There is no support for local image paths, relative paths, or any image metadata (dimensions, crop, position).

### How timing/duration is handled

**It isn't.** There is no timing metadata in the markdown at all. Scene duration is entirely derived at runtime from the length of the TTS-generated audio for each scene's description. Longer descriptions = longer scenes. This is an emergent property, not a designed feature.

### Frontmatter / metadata

**None.** The title is extracted from the first heading (`## Title`). The author line (`* by DOK`) is just a bullet point that gets ignored by the parser. There is no structured metadata for:

- Author
- Date
- Duration
- Aspect ratio
- Voice/TTS settings
- Tags or categories

---

## 2. Parser Architecture

### Parsing strategy: Markdown → HTML → Regex

The parser uses a **two-stage approach** that is the central architectural weakness of the project:

1. **Stage 1:** Convert markdown to HTML using Python's `markdown` library
2. **Stage 2:** Regex-match against the HTML output to find image+description pairs

```python
# Stage 1: markdown → HTML
html = markdown.markdown(markdown_content)

# Stage 2: regex against HTML
scene_pattern = re.compile(
    r'<img.*?src="(.*?)".*?>.*?<p>(.*?)</p>',
    re.DOTALL
)
matches = scene_pattern.findall(html)
```

### Title extraction

Also regex-based against the HTML:

```python
title_pattern = re.compile(r'<h.>(.*?)</h.>')
title_match = title_pattern.search(html)
```

This grabs the first heading of any level as the title.

### Post-processing

After extraction, the parser does one cleanup step — it strips parenthetical character descriptions from the text:

```python
cleaned_description = re.sub(r' \(.*?\)', '', description).strip()
```

This removes things like `(a 20-year-old holographic interface with...)` from TTS narration, which is a domain-specific feature for storyboard scripts that include character descriptions inline.

### Library used

- `**markdown**` (Python-Markdown) — converts markdown to HTML
- No AST-based parser, no `markdown-it`, no `remark`, no `unified`

### Robustness assessment: FRAGILE

The regex-based approach has many failure modes:


| Scenario                            | Result                                          |
| ----------------------------------- | ----------------------------------------------- |
| Image without a following paragraph | Scene is silently skipped                       |
| Paragraph without a preceding image | Not captured as a scene                         |
| Multiple paragraphs after one image | Only the first `<p>` is captured                |
| Nested HTML in descriptions         | Regex may break on nested tags                  |
| Image in a list or blockquote       | `<img>` not directly followed by `<p>` — missed |
| Local image paths (`./img/foo.png`) | Parser captures them but downloader may fail    |
| Multiple headings                   | Only first heading becomes the title            |
| Frontmatter (`---` delimited YAML)  | Treated as content, parsed as HTML              |
| Code blocks containing image syntax | Could be falsely captured                       |
| Images with `title` attribute       | Regex still works (matches `src` greedily)      |


### Edge cases explicitly handled

- File read errors (try/except around file open)
- Scene creation errors (try/except around Scene constructor)

### Edge cases NOT handled

- Empty files
- Files with no scenes
- Malformed markdown
- Encoding issues beyond UTF-8
- Very large files (no streaming, full file read)

---

## 3. Data Model

### Core types

The data model is simple and flat — 4 key classes with no inheritance:

#### `Storyboard` (storyboard.py)

```python
class Storyboard:
    filename: str               # Path to source .md file
    scenes: List[Scene]         # Ordered list of scenes
    title: str                  # Extracted from first heading
    tts_pipeline: TTSPipeline   # Shared TTS engine
```

#### `Scene` (scene.py)

```python
class Scene:
    description: str                # Cleaned text description
    image_url: Optional[str]        # Original remote URL
    image_downloader: ImageDownloader
    local_image_path: Optional[str] # Downloaded + converted local path
    local_sound_path: Optional[str] # Generated TTS audio path
    tts_pipeline: TTSPipeline       # Reference to shared TTS engine
```

#### `TTSPipeline` (pipeline.py)

```python
class TTSPipeline:
    pipeline: KPipeline   # Kokoro TTS engine instance
```

#### `Config` (config.py)

```python
class Config:
    DEFAULT_VOICE = 'af_bella'
    DEFAULT_SPEED = 1
    DEFAULT_SPLIT_PATTERN = r'\n+'
    DEFAULT_OUTPUT_VIDEO = 'output.mp4'
    IMAGES_DIR = 'images'
    SOUND_DIR = 'sound'
    TEMP_TEXT_FILE_PREFIX = "temp_text_"
    TEMP_VIDEO_FILE_PREFIX = "temp_video_"
    TEMP_LIST_FILE = "temp_list.txt"
    QML_OUTPUT_FILE = 'storyboard.qml'
```

### What's missing from the data model

- **No timing/duration field** on Scene — duration is implicit from audio
- **No scene ID or ordering field** — order is purely positional in the list
- **No metadata on Storyboard** — no author, date, tags
- **No transition types** — no fade, cut, dissolve
- **No layout/positioning** — text position is hardcoded in FFmpeg commands
- **No scene grouping** (acts, chapters)
- **No serialization** — can't round-trip back to markdown

---

## 4. Rendering Pipeline

### Overview

The rendering pipeline is a **linear, eager, side-effect-heavy process**:

```
Markdown file
    ↓ parse_markdown()
HTML string
    ↓ extract_scenes() via regex
List[Scene]
    ↓ Scene.__init__() (for each scene, eagerly):
    │   ├── Download image from URL → local file
    │   ├── Convert image to PNG via Pillow
    │   └── Generate TTS audio via Kokoro → WAV file
    ↓ Output options:
    ├── display()          → Console text output
    ├── display_gui()      → FreeSimpleGUI window
    ├── display_qml()      → Generate QML file + launch `qml` viewer
    └── render_to_video()  → FFmpeg per-scene → concat → MP4
```

### Video rendering detail (`VideoRenderer`)

1. For each scene, create a **text overlay file** (plain `.txt`)
2. Run **FFmpeg** to composite: static image + audio + text overlay → per-scene `.mp4`
3. Write a **concat list file** listing all scene videos
4. Run **FFmpeg concat** to join all segments into one output `.mp4`
5. Clean up temp files

The FFmpeg command for each scene:

```bash
ffmpeg \
  -i <image.png> \
  -i <audio.wav> \
  -vf "drawtext=textfile='<text.txt>':fontcolor=white:fontsize=24:
       box=1:boxcolor=black@0.5:boxborderw=5:
       x=(w-text_w)/2:y=h-th-10" \
  -pix_fmt yuv420p \
  -y <scene.mp4>
```

Key characteristics:

- Each scene is a **static image** (no pan/zoom/animation)
- Text is overlaid at **bottom-center** with a semi-transparent black box
- Duration is determined by the audio track length
- No transitions between scenes (hard cuts)
- FFmpeg is called via `**subprocess.run`** (not `ffmpeg-python` bindings despite being in requirements)

### TTS pipeline

- Uses **Kokoro** (`kokoro` package) with the `KPipeline` class
- Default voice: `af_bella`
- Output: 24kHz mono WAV files via `soundfile`
- TTS is run **eagerly during Scene construction** — even if you only want to display text

### GUI display

- Uses **FreeSimpleGUI** (a tkinter wrapper, fork of PySimpleGUI)
- Displays scenes one at a time with a 5-second timeout per scene
- Very basic: single image + text, no navigation, no playback controls

### QML generation

- Generates a Qt Quick/QML file with a ListView and per-scene Audio elements
- Uses hard-coded QML string building (no template engine)
- The generated QML uses `Qt.getExistingObjects()` which is **not a standard Qt API** — this is likely broken

### Dependencies


| Dependency             | Purpose                                 |
| ---------------------- | --------------------------------------- |
| `markdown`             | Markdown → HTML conversion              |
| `Pillow`               | Image format conversion (to PNG)        |
| `requests`             | HTTP image downloading                  |
| `soundfile`            | WAV audio file I/O                      |
| `FreeSimpleGUI`        | Simple GUI display                      |
| `kokoro`               | Text-to-speech (Kokoro TTS)             |
| `ffmpeg-python`        | Listed but not actually used in code    |
| `torch`                | Required by Kokoro (heavy dependency)   |
| **External:** `ffmpeg` | Video rendering (called via subprocess) |
| **External:** `qml`    | QML viewer (called via subprocess)      |


---

## 5. Strengths

### 5.1 Simplicity of the markdown format

The format is dead simple — standard markdown with images and paragraphs. Anyone can write it without learning a custom syntax. No special tooling needed to author.

### 5.2 Clean module separation

The codebase separates concerns well: `Scene`, `Storyboard`, `VideoRenderer`, `Sound`, `ImageDownloader`, `ImageConverter`, `TTSPipeline`, `Config`, `Logger` are all independent modules with clear responsibilities.

### 5.3 Shared TTS pipeline

The `TTSPipeline` is initialized once and shared across all scenes, avoiding the expensive repeated initialization of the Kokoro model. This is a good pattern for any heavyweight resource.

### 5.4 Eager caching of assets

Images and audio are cached to disk (`images/` and `sound/` directories). If a file already exists, it's not re-downloaded or re-generated. This makes re-runs fast.

### 5.5 Multiple output targets

The same parsed storyboard can be rendered to console, GUI, QML, or video. This output-agnostic internal representation is a good pattern.

### 5.6 Audio-driven duration

Using TTS audio length as scene duration is actually clever for narration-heavy storyboards — it guarantees the narration fits the scene.

---

## 6. Weaknesses

### 6.1 CRITICAL: Regex-over-HTML parsing

Converting markdown to HTML and then regex-matching the HTML is the single worst architectural decision. It's fragile, lossy, and makes it impossible to preserve or extend the markdown format. The correct approach is AST-based parsing (e.g., `markdown-it` in JS, or using `markdown`'s tree processor extension API in Python).

### 6.2 No explicit scene boundaries

Relying on `<img>...<p>` pairs means any structural variation in the markdown breaks parsing. There's no way to have a scene with multiple paragraphs, a scene without an image, or a scene with metadata.

### 6.3 Eager side effects during parsing

Scene construction immediately downloads images and generates TTS audio. This means:

- You can't parse without network access
- You can't parse without the Kokoro model loaded
- Parsing is extremely slow (TTS generation dominates)
- You can't preview or validate a storyboard without the full pipeline

### 6.4 No timing control

Authors have zero control over scene duration, pacing, pauses, or transitions. Everything is derived from description length.

### 6.5 No round-trip capability

The parser is read-only. There's no way to modify a storyboard programmatically and write it back to markdown. The internal model is too lossy (parenthetical descriptions are stripped, structure is lost).

### 6.6 Hardcoded everything

- Text overlay position: bottom-center, always
- Font size: 24px, always
- Video codec settings: hardcoded
- TTS voice: configurable but only via code
- Image dimensions: not controlled
- No transitions, no animation

### 6.7 Phantom dependency

`ffmpeg-python` is listed in requirements but never imported or used. FFmpeg is called via raw `subprocess.run()` with manually constructed command arrays.

### 6.8 No error recovery

If one scene fails (bad URL, TTS error), the entire storyboard may silently produce partial output. There's no validation step, no dry-run mode, no error summary.

### 6.9 No tests

Despite having a GitHub Actions CI config with pytest, there are **zero test files** in the repository. The only test artifact is a sample storyboard and its pre-rendered output video.

### 6.10 Aspirational CHANGELOG

The CHANGELOG describes versions 1.0 through 1.5 with features like "cloud integration", "user authentication", "PDF export", and "JSON export" — none of which exist in the codebase. The actual version in `setup.py` is `0.1.0`.

### 6.11 Broken QML generation

The generated QML uses `Qt.getExistingObjects()` which is not a real Qt Quick API. The QML output would fail at runtime.

---

## 7. Relevance to Our Project

We're building a **React PWA storyboard tool** with markdown files as the backend storage format, a local companion server parsing the markdown, and WebSocket sync to the PWA. Here's what to adopt, adapt, and avoid from `storyboard-player`.

### ADOPT


| Pattern                                            | Why                                                                                      | How                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Markdown as source of truth**                    | The core idea — markdown files *are* the storyboard — aligns perfectly with our approach | Use markdown files as the canonical storage, not a database         |
| **Multiple output targets from one model**         | Console, GUI, video, QML — all from the same internal representation                     | Design our internal model to be renderer-agnostic from day one      |
| **Cached assets on disk**                          | Download-once, use-many pattern for images and audio                                     | Implement content-addressable caching for all derived assets        |
| **Shared expensive resources**                     | The TTSPipeline singleton pattern                                                        | Apply to any heavyweight service (AI models, WebSocket connections) |
| **Scene = image + description** as the atomic unit | Simple, intuitive mental model                                                           | Keep this as the base unit but allow richer composition             |


### ADAPT


| Pattern                       | What to change                                                   | Our approach                                                                        |
| ----------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Implicit scene boundaries** | Use explicit markers instead of relying on image→paragraph pairs | Use `---` (thematic break) or `## Scene N` headings as scene delimiters             |
| **No metadata**               | Add frontmatter for storyboard-level config                      | Use YAML frontmatter: `title`, `author`, `voice`, `aspect_ratio`, `created`, `tags` |
| **No timing control**         | Add optional timing metadata                                     | Support inline directives like `<!-- duration: 5s -->` or frontmatter defaults      |
| **Audio-driven duration**     | Keep as *default* but allow overrides                            | Default to TTS length, allow `duration` override per scene                          |
| **Flat data model**           | Add scene groups, transitions, metadata                          | Support acts/chapters via heading levels: `# Act`, `## Scene`                       |
| **Config as class constants** | Make it runtime-configurable                                     | Load config from the markdown frontmatter + a config file + CLI args (layered)      |


### AVOID


| Anti-pattern                           | Why it's bad                                             | Our approach                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Markdown → HTML → regex**            | Fragile, lossy, unexpandable                             | Use an AST-based parser (e.g., `remark`/`unified` in JS, or `markdown-it`) that gives us a syntax tree we can traverse, extend, and round-trip |
| **Eager side effects during parsing**  | Couples parsing to network/GPU, makes preview impossible | Strictly separate parsing (pure, fast, sync) from asset resolution (async, cached, lazy)                                                       |
| **Subprocess FFmpeg calls**            | Brittle, hard to test, platform-dependent                | Use `fluent-ffmpeg` or a WebAssembly-based approach, or delegate to a proper media service                                                     |
| **No scene IDs**                       | Can't reference scenes, can't sync updates               | Generate deterministic IDs from content hash or use explicit IDs in markdown                                                                   |
| **Stripping parenthetical text**       | Domain-specific hack that loses information              | Preserve all markdown content; use a separate "narration" field or a convention like `> narration text` in blockquotes                         |
| **Hardcoded layout/styling**           | No creative control                                      | Make styling configurable per-scene or per-storyboard via frontmatter/CSS                                                                      |
| **String-based code generation** (QML) | Unmaintainable, error-prone                              | Use proper template engines or JSX for any generated output                                                                                    |


### Recommended markdown format for our project

Based on what works and what doesn't in `storyboard-player`, here's a proposed format:

```markdown
---
title: "The Digital Symphony"
author: "DOK"
created: 2026-04-27
voice: af_bella
speed: 1.0
aspect_ratio: 16:9
tags: [sci-fi, demo]
---

# Act 1: Introduction

## Scene 1
<!-- duration: 8s | transition: fade -->

![A bustling digital workspace](./images/scene-01.png)

In the heart of a bustling digital workspace, vibrant neon lines
pulse rhythmically across the virtual ceiling.

> FizzEase shimmers to life at the center, casting an ethereal light.

**Characters:** FizzEase (holographic interface, 20), Denis (human, 30)

## Scene 2
<!-- transition: dissolve -->

![FizzEase greeting Denis](./images/scene-02.png)

FizzEase dances gracefully in the air, its luminous form reflecting
the colorful lights of the workspace.
```

Key differences from `storyboard-player`:

1. **YAML frontmatter** for storyboard-level metadata
2. **Explicit scene headings** (`## Scene N`) as delimiters
3. **HTML comments** for machine-readable directives (duration, transitions)
4. **Local image paths** as the default (companion server manages assets)
5. **Blockquotes** for narration/dialogue (distinct from description)
6. **Bold markers** for structured data (characters, locations)
7. **Heading hierarchy** for grouping (Act → Scene)
8. **Everything round-trippable** — the markdown is the source of truth that can be read, modified, and written back

### Architecture recommendations

```
┌─────────────────────────────────────────────────┐
│                   PWA (React)                   │
│  ┌───────────┐ ┌──────────┐ ┌───────────────┐  │
│  │  Editor   │ │ Preview  │ │   Timeline    │  │
│  │ (Monaco)  │ │ (Canvas) │ │   (Scenes)    │  │
│  └─────┬─────┘ └─────┬────┘ └───────┬───────┘  │
│        └──────────────┼──────────────┘          │
│                  WebSocket                      │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│              Companion Server (Node.js)          │
│  ┌─────────────────────────────────────────┐    │
│  │  Markdown Parser (remark/unified)       │    │
│  │  ├─ Parse to AST (pure, fast)           │    │
│  │  ├─ Extract scenes, metadata, timing    │    │
│  │  └─ Round-trip back to markdown         │    │
│  ├─────────────────────────────────────────┤    │
│  │  Asset Manager                          │    │
│  │  ├─ File watcher (chokidar)             │    │
│  │  ├─ Image optimization (sharp)          │    │
│  │  └─ Content-addressable cache           │    │
│  ├─────────────────────────────────────────┤    │
│  │  WebSocket Server                       │    │
│  │  ├─ Push updates on file change         │    │
│  │  ├─ Accept edits from PWA              │    │
│  │  └─ Conflict resolution                │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  ┌─ Markdown files (source of truth) ──────┐    │
│  │  storyboards/                            │    │
│  │    ├─ my-story.md                        │    │
│  │    ├─ my-story/                          │    │
│  │    │   ├─ images/                        │    │
│  │    │   └─ audio/                         │    │
│  │    └─ another-story.md                   │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

**Critical difference from `storyboard-player`:** The parsing layer must be **pure and fast** — no network calls, no TTS, no image processing. Asset resolution is a separate, async, lazily-triggered layer. This lets the PWA show a live preview instantly while assets load in the background.

---

## Appendix: File-by-file summary


| File                             | Lines    | Purpose                                     |
| -------------------------------- | -------- | ------------------------------------------- |
| `main.py`                        | 38       | CLI entry point, argparse, dispatch         |
| `storyboard/storyboard.py`       | 119      | Core: parsing, display, GUI, video dispatch |
| `storyboard/scene.py`            | 66       | Scene model + eager asset initialization    |
| `storyboard/pipeline.py`         | 44       | Kokoro TTS wrapper                          |
| `storyboard/video_renderer.py`   | 147      | FFmpeg-based video rendering                |
| `storyboard/sound.py`            | 59       | TTS generation + WAV saving                 |
| `storyboard/image_downloader.py` | 68       | HTTP image download with caching            |
| `storyboard/image_converter.py`  | 37       | PIL-based image → PNG conversion            |
| `storyboard/qml_generator.py`    | 141      | QML file string generation                  |
| `storyboard/config.py`           | 16       | Constants                                   |
| `storyboard/logger.py`           | 92       | Custom logging wrapper                      |
| `storyboard/utils.py`            | 58       | File/directory utilities                    |
| `test/test-storyboard.md`        | 14       | Sample storyboard (2 scenes)                |
| `setup.py`                       | 31       | Package setup                               |
| `requirements.txt`               | 7        | Dependencies                                |
| **Total**                        | **~937** | —                                           |


