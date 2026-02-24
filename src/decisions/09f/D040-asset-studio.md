## D040: Asset Studio — Visual Resource Editor & Agentic Generation

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 6a (Asset Studio Layers 1–2), Phase 6b (provenance/publish integration), Phase 7 (agentic generation Layer 3)
- **Canonical for:** Asset Studio scope, SDK asset workflow, format conversion bridge, and agentic asset-generation integration boundaries
- **Scope:** `ic-editor` (SDK), `ra-formats` codecs/read-write support, `ic-render`/`ic-ui` preview integration, Workshop publishing workflow
- **Decision:** IC ships an **Asset Studio** inside the separate SDK app for browsing, viewing, converting, validating, and preparing assets for gameplay use; agentic (LLM) generation is optional and layered on top.
- **Why:** Closes the "last mile" between external art tools and mod-ready assets, preserves legacy C&C asset workflows, and gives creators in-context preview instead of disconnected utilities.
- **Non-goals:** Replacing Photoshop/Aseprite/Blender; embedding creator tools in the game binary; making LLM generation mandatory.
- **Invariants preserved:** SDK remains separate from `ic-game`; outputs are standard/mod-ready formats (no proprietary editor-only format); game remains fully functional without LLM providers.
- **Defaults / UX behavior:** Asset Studio handles browse/view/edit/convert first; provenance/rights checks surface mainly at Publish Readiness, not as blocking editing popups.
- **Compatibility / Export impact:** D040 provides per-asset conversion foundations used by D066 whole-project export workflows and cross-game asset bridging.
- **Security / Trust impact:** Asset provenance and AI-generation metadata are captured in Asset Studio (Advanced mode) and enforced primarily at publish time.
- **Public interfaces / types / commands:** `AssetGenerator`, `AssetProvenance`, `AiGenerationMeta`, `VideoProvider`, `MusicProvider`, `SoundFxProvider`, `VoiceProvider`
- **Affected docs:** `src/04-MODDING.md`, `src/decisions/09c-modding.md`, `src/17-PLAYER-FLOW.md`, `src/05-FORMATS.md`
- **Revision note summary:** None
- **Keywords:** asset studio, sdk, ra-formats, conversion, vqa aud shp, provenance, ai asset generation, video pipeline, last-mile tooling

**Decision:** Ship an Asset Studio as part of the IC SDK — a visual tool for browsing, viewing, editing, and generating game resources (sprites, palettes, terrain tiles, UI chrome, 3D models). Optionally agentic: modders can describe what they want and an LLM generates or modifies assets, with in-context preview and iterative refinement. The Asset Studio is a tab/mode within the SDK application alongside the scenario editor (D038) — separate from the game binary.

**Context:** The current design covers the full lifecycle *around* assets — parsing (ra-formats), runtime loading (Bevy pipeline), in-game use (ic-render), mission editing (D038), and distribution (D030 Workshop) — but nothing for the creative work of making or modifying assets. A modder who wants to create a new unit sprite, adjust a palette, or redesign menu chrome has zero tooling in our chain. They use external tools (Photoshop, GIMP, Aseprite) and manually convert. The community's most-used asset tool is XCC Mixer (a 20-year-old Windows utility for browsing .mix archives). We can do better.

Bevy does not fill this gap. Bevy's asset system handles loading and hot-reloading at runtime. The in-development Bevy Editor is a scene/entity inspector, not an art tool. No Bevy ecosystem crate provides C&C-format-aware asset editing.

**What this is NOT:** A Photoshop competitor. The Asset Studio does not provide pixel-level painting or 3D modeling. Artists use professional external tools for that. The Asset Studio handles the last mile: making assets game-ready, previewing them in context, and bridging the gap between "I have a PNG" and "it works as a unit in the game."

### SDK Architecture — Editor/Game Separation

**The IC SDK is a separate application from the game.** Normal players never see editor UI. Creators download the SDK alongside the game (or as part of the `ic` CLI toolchain). This follows the industry standard: Bethesda's Creation Kit, Valve's Hammer/Source SDK, Epic's Unreal Editor, Blizzard's StarEdit/World Editor (bundled but launches separately).

```
┌──────────────────────────────┐     ┌──────────────────────────────┐
│         IC Game              │     │          IC SDK              │
│  (ic-game binary)            │     │  (ic-sdk binary)             │
│                              │     │                              │
│  • Play skirmish/campaign    │     │  ┌────────────────────────┐  │
│  • Online multiplayer        │     │  │   Scenario Editor      │  │
│  • Browse/install mods       │     │  │   (D038)               │  │
│  • Watch replays             │     │  ├────────────────────────┤  │
│  • Settings & profiles       │     │  │   Asset Studio         │  │
│                              │     │  │   (D040)               │  │
│  No editor UI.               │     │  ├────────────────────────┤  │
│  No asset tools.             │     │  │   Campaign Editor      │  │
│  Clean player experience.    │     │  │   (D038/D021)          │  │
│                              │     │  ├────────────────────────┤  │
│                              │     │  │   Game Master Mode     │  │
│                              │     │  │   (D038)               │  │
│                              │     │  └────────────────────────┘  │
│                              │     │                              │
│                              │     │  Shares: ic-render, ic-sim,  │
│                              │     │  ic-ui, ic-protocol,         │
│                              │     │  ra-formats                  │
└──────────────────────────────┘     └──────────────────────────────┘
         ▲                                      │
         │         ic mod run / Test button      │
         └───────────────────────────────────────┘
```

**Why separate binaries instead of in-game editor:**
- **Players aren't overwhelmed.** A player launches the game and sees: Play, Multiplayer, Replays, Settings. No "Editor" menu item they'll never use.
- **SDK can be complex without apology.** The SDK UI can have dense panels, multi-tab layouts, technical property editors. It's for creators — they expect professional tools.
- **Smaller game binary.** All editor systems, asset processing code, LLM integration, and creator UI are excluded from the game build. Players download less.
- **Industry convention.** Players expect an SDK. "Download the Creation Kit" is understood. "Open the in-game editor" confuses casual players who accidentally click it.

**Why this still works for fast iteration:**
- **"Test" button in SDK** launches `ic-game` with the current scenario/asset loaded. One click, instant playtest. Same `LocalNetwork` path as before — the preview is real gameplay.
- **Hot-reload bridge.** While the game is running from a Test launch, the SDK watches for file changes. Edit a YAML file, save → game hot-reloads. Edit a sprite, save → game picks up the new asset. The iteration loop is seconds, not minutes.
- **Shared Bevy crates.** The SDK reuses `ic-render` for its preview viewports, `ic-sim` for gameplay preview, `ic-ui` for shared components. It's the same rendering and simulation — just in a different window with different chrome.

**D069 shared setup-component reuse (player-first extension):** The SDK's own first-run setup and maintenance flows should reuse the D069 installation/setup component model (data-dir selection, content source detection, content transfer/verify progress UI, and repair/reclaim patterns) instead of inventing a separate "SDK installer UX." The SDK layers creator-specific steps on top — Git guidance, optional templates/toolchains, and export-helper dependencies — while preserving the separate `ic-editor` binary boundary.

**Crate boundary:** `ic-editor` contains all SDK functionality (scenario editor, asset studio, campaign editor, Game Master mode). It depends on `ic-render`, `ic-sim`, `ic-ui`, `ic-protocol`, `ra-formats`, and optionally `ic-llm` (via traits). `ic-game` does NOT depend on `ic-editor`. Both `ic-game` and `ic-editor` are separate binary targets in the workspace — they share library crates but produce independent executables.

**Game Master mode exception:** Game Master mode requires real-time manipulation of a live game session. The SDK connects to a running game as a special client — the Game Master's SDK sends `PlayerOrder`s through `ic-protocol` to the game's `NetworkModel`, same as any other player. The game doesn't know it's being controlled by an SDK — it receives orders. The Game Master's SDK renders its own view (top-down strategic overview, budget panel, entity palette) but the game session runs in `ic-game`. Open questions deferred to Phase 6b design: how matchmaking/lobby handles GM slots (dedicated GM slot vs. spectator-with-controls), whether GM can join mid-match, and how GM presence is communicated to players.

### Three Layers

#### Layer 1 — Asset Browser & Viewer

Browse, search, and preview every asset the engine can load. This is the XCC Mixer replacement — but integrated into a modern Bevy-based UI with live preview.

| Capability              | Description                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Archive browser**     | Browse .mix archive contents, see file list, extract individual files or bulk export                                                               |
| **Sprite viewer**       | View .shp sprites with palette applied, animate frame sequences, scrub through frames, zoom                                                        |
| **Palette viewer**      | View .pal palettes as color grids, compare palettes side-by-side, see palette applied to any sprite                                                |
| **Terrain tile viewer** | Preview .tmp terrain tiles in grid layout, see how tiles connect                                                                                   |
| **Audio player**        | Play .aud/.wav/.ogg/.mp3 files directly, waveform visualization, spectral view, loop point markers, sample rate / bit depth / channel info display |
| **Video player**        | Play .vqa/.mp4/.webm cutscenes, frame-by-frame scrub, preview in all three display modes (fullscreen, radar_comm, picture_in_picture)              |
| **Chrome previewer**    | View UI theme sprite sheets (D032) with 9-slice visualization, see button states                                                                   |
| **3D model viewer**     | Preview GLTF/GLB models (and .vxl voxel models for future RA2 module) with rotation, lighting                                                      |
| **Asset search**        | Full-text search across all loaded assets — by filename, type, archive, tags                                                                       |
| **In-context preview**  | "Preview as unit" — see this sprite on an actual map tile. "Preview as building" — see footprint. "Preview as chrome" — see in actual menu layout. |
| **Dependency graph**    | Which assets reference this one? What does this mod override? Visual dependency tree.                                                              |

**Format support by game module:**

| Game          | Archive       | Sprites             | Models            | Palettes    | Audio          | Video      | Source                                   |
| ------------- | ------------- | ------------------- | ----------------- | ----------- | -------------- | ---------- | ---------------------------------------- |
| RA1 / TD      | .mix          | .shp                | —                 | .pal        | .aud           | .vqa       | EA GPL release — fully open              |
| RA2 / TS      | .mix          | .shp, .vxl (voxels) | .hva (voxel anim) | .pal        | .aud           | .bik       | Community-documented (XCC, Ares, Phobos) |
| Generals / ZH | .big          | —                   | .w3d (3D meshes)  | —           | —              | .bik       | EA GPL release — fully open              |
| OpenRA        | .oramap (ZIP) | .png                | —                 | .pal        | .wav/.ogg      | —          | Open source                              |
| IC native     | —             | .png, sprite sheets | .glb/.gltf        | .pal, .yaml | .wav/.ogg/.mp3 | .mp4/.webm | Our format                               |

**Minimal reverse engineering required.** RA1/TD and Generals/ZH are fully open-sourced by EA (GPL). RA2/TS formats are not open-sourced but have been community-documented for 20+ years — .vxl, .hva, .csf are thoroughly understood by the XCC, Ares, and Phobos projects. The `FormatRegistry` trait (D018) already anticipates per-module format loaders.

#### Layer 2 — Asset Editor

Scoped asset editing operations. Not pixel painting — structured operations on game asset types.

| Tool                        | What It Does                                                                                                                                                         | Example                                                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Palette editor**          | Remap colors, adjust faction-color ranges, create palette variants, shift hue/saturation/brightness per range                                                        | "Make a winter palette from temperate" — shift greens to whites                                                                                                                                                   |
| **Sprite sheet organizer**  | Reorder frames, adjust animation timing, add/remove frames, composite sprite layers, set hotpoints/offsets                                                           | Import 8 PNG frames → assemble into .shp-compatible sprite sheet with correct facing rotations                                                                                                                    |
| **Chrome / theme designer** | Visual editor for D032 UI themes — drag 9-slice panels, position elements, see result live in actual menu mockup                                                     | Design a new sidebar layout: drag resource bar, build queue, minimap into position. Live preview updates.                                                                                                         |
| **Terrain tile editor**     | Create terrain tile sets — assign connectivity rules, transition tiles, cliff edges. Preview tiling on a test map.                                                   | Paint a new snow terrain set: assign which tiles connect to which edges                                                                                                                                           |
| **Import pipeline**         | Convert standard formats to game-ready assets: PNG → palette-quantized .shp, GLTF → game model with LODs, font → bitmap font sheet                                   | Drag in a 32-bit PNG → auto-quantize to .pal, preview dithering options, export as .shp                                                                                                                           |
| **Batch operations**        | Apply operations across multiple assets: bulk palette remap, bulk resize, bulk re-export                                                                             | "Remap all Soviet unit sprites to use the Tiberium Sun palette"                                                                                                                                                   |
| **Diff / compare**          | Side-by-side comparison of two versions of an asset — sprite diff, palette diff, before/after                                                                        | Compare original RA1 sprite with your modified version, pixel-diff highlighted                                                                                                                                    |
| **Video converter**         | Convert between C&C video formats (.vqa) and modern formats (.mp4, .webm). Trim, crop, resize. Subtitle overlay. Frame rate control. Optional restoration/remaster prep passes and variant-pack export metadata. | Record a briefing in OBS → import .mp4 → convert to .vqa for classic feel, or keep as .mp4 for modern campaigns. Extract original RA1 briefings to .mp4 for remixing in Premiere/DaVinci, then package as original/clean/AI remaster variants. |
| **Audio converter**         | Convert between C&C audio format (.aud) and modern formats (.wav, .ogg). Trim, normalize, fade in/out. Sample rate conversion. Batch convert entire sound libraries. | Extract all RA1 sound effects to .wav for remixing in Audacity/Reaper. Record custom EVA lines → normalize → convert to .aud for classic feel. Batch-convert a voice pack from .wav to .ogg for Workshop publish. |

**Design rule:** Every operation the Asset Studio performs produces standard output formats. Palette edits produce .pal files. Sprite operations produce .shp or sprite sheet PNGs. Chrome editing produces YAML + sprite sheet PNGs. No proprietary intermediate format — the output is always mod-ready.

#### Asset Provenance & Rights Metadata (Advanced, Publish-Focused)

The Asset Studio is where creators import, convert, and generate assets, so it is the natural place to capture provenance metadata — but **not** to interrupt the core creative loop.

**Design goal:** provenance and rights checks improve trust and publish safety without turning Asset Studio into a compliance wizard.

**Phase 6b behavior (aligned with Publish Readiness in D038):**
- **Asset metadata panel (Advanced mode)** for source URL/project, author attribution, SPDX license, modification notes, and import method
- **AI generation metadata** (when Layer 3 is used): provider/model, generation timestamp, optional prompt hash, and a "human-edited" flag
- **Batch metadata operations** for large imports (apply attribution/license to a selected asset set)
- **Publish-time surfacing** — most provenance/rules issues appear in the Scenario/Campaign editor's **Publish Readiness** screen, not as blocking popups during editing
- **Channel-sensitive gating** — local saves and playtests never require complete provenance; release-channel Workshop publishing can enforce stricter metadata completeness than beta/private workflows

This builds on D030/D031/D047/D066 and keeps normal import/preview/edit/test workflows fast.

**Metadata contracts (Phase 6b):**

```rust
pub struct AssetProvenance {
    pub source_uri: Option<String>,
    pub source_author: Option<String>,
    pub license_spdx: Option<String>,
    pub import_method: AssetImportMethod, // imported / extracted / generated / converted
    pub modified_by_creator: bool,
    pub notes: Option<String>,
}

pub struct AiGenerationMeta {
    pub provider: String,
    pub model: String,
    pub generated_at: String,   // RFC 3339 UTC
    pub prompt_hash: Option<String>,
    pub human_edited: bool,
}
```

#### Optional AI-Enhanced Cutscene Remaster Workflow (D068 Integration)

IC can support "better remaster" FMV/cutscene packs, including generative AI-assisted enhancement, but the Asset Studio treats them as **optional presentation variants**, not replacements for original campaign media.

**Asset Studio design rules (when remastering original cutscenes):**

- **Preservation-first output:** original extracted media remains available and publishable as a separate variant pack
- **Variant packaging:** remastered outputs are packaged as `Original`, `Clean Remaster`, or `AI-Enhanced` media variants (aligned with D068 selective installs)
- **Clear labeling:** AI-assisted outputs are explicitly labeled in pack metadata and Publish Readiness summaries
- **Lineage metadata:** provenance records the original source media reference plus restoration/enhancement toolchain details
- **Human review required:** creators must preview timing, subtitle sync, and radar-comm/fullscreen presentation before publish
- **Fallback-safe:** campaigns continue using other installed variants or text/briefing fallback if the remaster pack is missing

**Quality guardrails (Publish Readiness surfaces warnings/advice):**

- frame-to-frame consistency / temporal artifact checks (where detectable)
- subtitle timing drift vs source timestamps
- audio/video duration mismatch and lip-sync drift
- excessive sharpening/denoise artifacts (advisory)
- missing "AI Enhanced" / "Experimental" labeling for AI-assisted remaster packs

This keeps the SDK open to advanced remaster workflows while preserving trust, legal review, and the original media.

#### Layer 3 — Agentic Asset Generation (D016 Extension, Phase 7)

LLM-powered asset creation for modders who have ideas but not art skills. Same BYOLLM pattern as D016 — user brings their own provider (DALL-E, Stable Diffusion, Midjourney API, local model), `ic-llm` routes the request.

| Capability             | How It Works                                                                      | Example                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sprite generation**  | Describe unit → LLM generates sprite sheet → preview on map → iterate             | "Soviet heavy tank, double barrel, darker than the Mammoth Tank" → generates 8-facing sprite sheet → preview as unit on map → "make the turret bigger" → re-generates |
| **Palette generation** | Describe mood/theme → LLM generates palette → preview applied to existing sprites | "Volcanic wasteland palette — reds, oranges, dark stone" → generates .pal → preview on temperate map sprites                                                          |
| **Chrome generation**  | Describe UI style → LLM generates theme elements → preview in actual menu         | "Brutalist concrete UI theme, sharp corners, red accents" → generates chrome sprite sheet → preview in sidebar                                                        |
| **Terrain generation** | Describe biome → LLM generates tile set → preview tiling                          | "Frozen tundra with ice cracks and snow drifts" → generates terrain tiles with connectivity → preview on test map                                                     |
| **Asset variation**    | Take existing asset + describe change → LLM produces variant                      | "Take this Allied Barracks and make a Nod version — darker, angular, with a scorpion emblem"                                                                          |
| **Style transfer**     | Apply visual style across asset set                                               | "Make all these units look hand-drawn like Advance Wars"                                                                                                              |

**Workflow:**
1. Describe what you want (text prompt + optional reference image)
2. LLM generates candidate(s) — multiple options when possible
3. Preview in-context (on map, in menu, as unit) — not just a floating image, but in the actual game rendering
4. Iterate: refine prompt, adjust, regenerate
5. Post-process: palette quantize, frame extract, format convert
6. Export as mod-ready asset → ready for Workshop publish

**Crate boundary:** `ic-editor` defines an `AssetGenerator` trait (input: text description + format constraints + optional reference → output: generated image data). `ic-llm` implements it by routing to the configured provider. `ic-game` wires them at startup in the SDK binary. Same pattern as `NarrativeGenerator` for the replay-to-scenario pipeline. The SDK works without an LLM — Layers 1 and 2 are fully functional. Layer 3 activates when a provider is configured. Asset Studio operations are also exposed through the LLM-callable editor tool bindings (see D016 § "LLM-Callable Editor Tool Bindings"), enabling conversational asset workflows beyond generation — e.g., "apply the volcanic palette to all terrain tiles in this map" or "batch-convert these PNGs to .shp with the Soviet palette."

**What the LLM does NOT replace:**
- Professional art. LLM-generated sprites are good enough for prototyping, playtesting, and small mods. Professional pixel art for a polished release still benefits from a human artist.
- Format knowledge. The LLM generates images. The Asset Studio handles palette quantization, frame extraction, sprite sheet assembly, and format conversion. The LLM doesn't need to know about .shp internals.
- Quality judgment. The modder decides if the result is good enough. The Asset Studio shows it in context so the judgment is informed.

> **See also:** D016 § "Generative Media Pipeline" extends agentic generation beyond visual assets to audio and video: voice synthesis (`VoiceProvider`), music generation (`MusicProvider`), sound FX (`SoundFxProvider`), and video/cutscene generation (`VideoProvider`). The SDK integrates these as Tier 3 Asset Studio tools alongside visual generation. All media provider types use the same BYOLLM pattern and D047 task routing.

### Menu / Chrome Design Workflow

UI themes (D032) are YAML + sprite sheets. Currently there's no visual editor — modders hand-edit coordinates and pixel offsets. The Asset Studio's chrome designer closes this gap:

1. **Load a base theme** (Classic, Remastered, Modern, or any workshop theme)
2. **Visual element editor** — see the 9-slice panels, button states, scrollbar tracks as overlays on the sprite sheet. Drag edges to resize. Click to select.
3. **Layout preview** — split view: sprite sheet on left, live menu mockup on right. Every edit updates the mockup instantly.
4. **Element properties** — per-element: padding, margins, color tint, opacity, font assignment, animation (hover/press states)
5. **Full menu preview** — "Preview as: Main Menu / Sidebar / Build Queue / Lobby / Settings" — switch between all game screens to see the theme in each context
6. **Export** — produces `theme.yaml` + sprite sheet PNG, ready for `ic mod publish`
7. **Agentic mode** — describe desired changes: "make the sidebar narrower with a brushed metal look" → LLM modifies the sprite sheet + adjusts YAML layout → preview → iterate

### Cross-Game Asset Bridge

The Asset Studio understands multiple C&C format families and can convert between them:

| Conversion                 | Direction     | Use Case                                                                                                                                                   | Phase  |
| -------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| .shp (RA1) → .png          | Export        | Extract classic sprites for editing in external tools                                                                                                      | 6a     |
| .png → .shp + .pal         | Import        | Turn modern art into classic-compatible format                                                                                                             | 6a     |
| .vxl (RA2) → .glb          | Export        | Convert RA2 voxel models to standard 3D format for editing                                                                                                 | Future |
| .glb → game model          | Import        | Import artist-created 3D models for future 3D game modules                                                                                                 | Future |
| .w3d (Generals) → .glb     | Export        | Convert Generals models for viewing and editing                                                                                                            | Future |
| .vqa → .mp4/.webm          | Export        | Extract original RA/TD cutscenes to modern formats for viewing, remixing, or re-editing in standard video tools (Premiere, DaVinci, Kdenlive)              | 6a     |
| .mp4/.webm → .vqa          | Import        | Convert custom-recorded campaign briefings/cutscenes to classic VQA format (palette-quantized, VQ-compressed) for authentic retro feel                     | 6a     |
| .mp4/.webm passthrough     | Native        | Modern video formats play natively — no conversion required. Campaign creators can use .mp4/.webm directly for briefings and radar comms.                  | 4      |
| .aud → .wav/.ogg           | Export        | Extract original RA/TD sound effects, EVA lines, and music to modern formats for remixing or editing in standard audio tools (Audacity, Reaper, FL Studio) | 6a     |
| .wav/.ogg → .aud           | Import        | Convert custom audio recordings to classic Westwood AUD format (IMA ADPCM compressed) for authentic retro sound or OpenRA mod compatibility                | 6a     |
| .wav/.ogg/.mp3 passthrough | Native        | Modern audio formats play natively — no conversion required. Mod creators can use .wav/.ogg/.mp3 directly for sound effects, music, and EVA lines.         | 3      |
| Theme YAML ↔ visual        | Bidirectional | Edit themes visually or as YAML — changes sync both ways                                                                                                   | 6a     |

**ra-formats write support:** Currently `ra-formats` is read-only (parse .mix, .shp, .pal, .vqa, .aud). The Asset Studio requires write support — generating .shp from frames, writing .pal files, encoding .vqa video, encoding .aud audio, optionally packing .mix archives. This is an additive extension to `ra-formats` (no redesign of existing parsers), but non-trivial engineering: .shp writing requires correct header generation, frame offset tables, and optional LCW/RLE compression; .vqa encoding requires VQ codebook generation and frame differencing; .aud encoding requires IMA ADPCM compression with correct `AUDHeaderType` generation and `IndexTable`/`DiffTable` lookup table application; .mix packing requires building the file index and CRC hash table. All encoders reference the EA GPL source code implementations directly (see `05-FORMATS.md` § Binary Format Codec Reference). Budget accordingly in Phase 6a.

**Video pipeline:** The game engine natively plays .mp4 and .webm via standard media decoders (platform-provided or bundled). Campaign creators can use modern formats directly — no conversion needed. The .vqa ↔ .mp4/.webm conversion in the Asset Studio is for creators who *want* the classic C&C aesthetic (palette-quantized, low-res FMV look), who need to extract and remix original EA cutscenes, or who want to produce optional remaster variant packs (D068) from preserved source material. The conversion pipeline lives in `ra-formats` (VQA codec) + `ic-editor` (UI, preview, trim/crop tools). Someone recording a briefing with a webcam or screen recorder imports their .mp4, previews it in the Video Playback module's display modes (fullscreen, radar_comm, picture_in_picture), optionally converts to .vqa for retro feel, and publishes via Workshop (D030). Someone remastering classic RA1 briefings can extract `.vqa` to `.mp4`, perform restoration/enhancement (traditional or AI-assisted), validate subtitle/audio sync and display-mode previews in Asset Studio, then publish the result as a clearly labeled optional presentation variant pack instead of replacing the originals.

**Audio pipeline:** The game engine natively plays .wav, .ogg, and .mp3 via standard audio decoders (Bevy audio plugin + platform codecs). Modern formats are the recommended choice for new content — .ogg for music and voice lines (good compression, no licensing issues), .wav for short sound effects (zero decode latency). The .aud ↔ .wav/.ogg conversion in the Asset Studio is for creators who need to extract and remix original EA audio (hundreds of classic sound effects, EVA voice lines, and Hell March variations) or who want to encode custom audio in classic AUD format for OpenRA mod compatibility. The conversion pipeline lives in `ra-formats` (AUD codec — IMA ADPCM encode/decode using the original Westwood `IndexTable`/`DiffTable` from the EA GPL source) + `ic-editor` (UI, waveform preview, trim/normalize/fade tools). Someone recording custom EVA voice lines imports their .wav files, previews with waveform visualization, normalizes volume, optionally converts to .aud for classic feel or keeps as .ogg for modern mods, and publishes via Workshop (D030). Batch conversion handles entire sound libraries — extract all 200+ RA1 sound effects to .wav in one operation.

### Alternatives Considered

1. **Rely on external tools entirely** (Photoshop, Aseprite, XCC Mixer) — Rejected. Forces modders to learn multiple disconnected tools with no in-context preview. The "last mile" problem (PNG → game-ready .shp with correct palette, offsets, and facing rotations) is where most modders give up.
2. **Build a full art suite** (pixel editor, 3D modeler) — Rejected. Scope explosion. Aseprite and Blender exist. We handle the game-specific parts they can't.
3. **In-game asset tools** — Rejected. Same reasoning as the overall SDK separation: players shouldn't see asset editing tools. The SDK is for creators.
4. **Web-based editor** — Deferred. A browser-based asset viewer/editor is a compelling Phase 7+ goal (especially for the WASM target), but the primary tool ships as a native Bevy application in the SDK.

### Phase

- **Phase 0:** `ra-formats` delivers CLI asset inspection (dump/inspect/validate) — the text-mode precursor.
- **Phase 6a:** Asset Studio ships as part of the SDK alongside the scenario editor. Layer 1 (browser/viewer) and Layer 2 (editor) are the deliverables. Chrome designer ships alongside the UI theme system (D032).
- **Phase 6b:** Asset provenance/rights metadata panel (Advanced mode), batch provenance editing, and Publish Readiness integration (warnings/gating surfaced primarily at publish time, not during normal editing/playtesting).
- **Phase 7:** Layer 3 (agentic generation via `ic-llm`). Same phase as LLM text generation (D016).
- **Future:** .vxl/.hva write support (for RA2 module), .w3d viewing (for Generals module), browser-based viewer.

---

---
