### Media & Cinematics

Original Red Alert's campaign identity was defined as much by its media as its gameplay — FMV briefings before missions, the radar panel switching to a video feed during gameplay, Hell March driving the combat tempo, EVA voice lines as constant tactical feedback. A campaign editor that can't orchestrate media is a campaign editor that can't recreate what made C&C campaigns feel like C&C campaigns.

The modding layer (`04-MODDING.md`) defines the primitives: `video_playback` scene templates with display modes (`fullscreen`, `radar_comm`, `picture_in_picture`), `scripted_scene` templates, and the `Media` Lua global. The scenario editor surfaces all of these as **visual modules** — no Lua required for standard use, Lua available for advanced control.

#### Two Cutscene Types (Explicitly Distinct)

IC treats **video cutscenes** and **rendered cutscenes** as two different content types with different pipelines and different authoring concerns:

- **Video cutscene** (`Video Playback`): pre-rendered media (`.vqa`, `.mp4`, `.webm`) — classic RA/TD/C&C-style FMV.
- **Rendered cutscene** (`Cinematic Sequence`): a real-time scripted sequence rendered by the game engine in the active render mode (classic 2D, HD, or 3D if available) — Generals-style mission cinematics and in-engine character scenes.

Both are valid for:
- **between-mission** presentation (briefings, intros, transitions, debrief beats)
- **during-mission** presentation
- **character dialogue/talking** moments (at minimum: portrait + subtitle + audio via Dialogue/Radar Comm; optionally full video or rendered camera sequence)

The distinction is important for tooling, Workshop packaging, and fallback behavior:
- Video cutscenes are media assets with playback/display settings.
- Rendered cutscenes are authored sequence data + dependencies on maps/units/portraits/audio/optional render-mode assets.

#### Video Playback

The **Video Playback** module plays video files (`.vqa`, `.mp4`, `.webm`) at a designer-specified trigger point. Three display modes (from `04-MODDING.md`):

| Display Mode         | Behavior                                                                          | Inspiration                     |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------- |
| `fullscreen`         | Pauses gameplay, fills screen, letterboxed. Classic FMV briefing.                 | RA1 mission briefings           |
| `radar_comm`         | Video replaces the radar/minimap panel. Game continues. Sidebar stays functional. | RA2 EVA / commander video calls |
| `picture_in_picture` | Small floating video overlay in a corner. Game continues. Dismissible.            | Modern RTS cinematics           |

**Module properties in the editor:**

| Property         | Type                  | Description                                                       |
| ---------------- | --------------------- | ----------------------------------------------------------------- |
| **Video**        | file picker           | Video file reference (from mission assets or Workshop dependency) |
| **Display mode** | dropdown              | `fullscreen` / `radar_comm` / `picture_in_picture`                |
| **Trigger**      | connection            | When to play — connected to a trigger, module, or "mission start" |
| **Skippable**    | checkbox              | Whether the player can press Escape to skip                       |
| **Subtitle**     | text (optional)       | Subtitle text shown during playback (accessibility)               |
| **On Complete**  | connection (optional) | Trigger or module to activate when the video finishes             |

**Radar Comm** deserves special emphasis — it's the feature that makes in-mission storytelling possible without interrupting gameplay. A commander calls in during a battle, their face appears in the radar panel, they deliver a line, and the radar returns. The designer connects a Video Playback (mode: `radar_comm`) to a trigger, and that's it. No scripting, no timeline editor, no separate cinematic tool.

For missions without custom video, the **Radar Comm** module (separate from Video Playback) provides the same radar-panel takeover using a static portrait + audio + subtitle text — the RA2 communication experience without requiring video production.

#### Cinematic Sequences (Rendered Cutscenes / Real-Time Sequences)

Individual modules (Camera Pan, Video Playback, Dialogue, Music Trigger) handle single media events. A **Cinematic Sequence** chains them into a scripted multi-step sequence — the editor equivalent of a cutscene director.

This is the **rendered cutscene** path: a sequence runs in-engine, using the game's camera(s), entities, weather, audio, and overlays. In other words:
- **Video Playback** = pre-rendered cutscene (classic FMV path)
- **Cinematic Sequence** = real-time rendered cutscene (2D/HD/3D depending render mode and installed assets)

The sequence can still embed video steps (`play_video`) for hybrid scenes.

**Sequence step types:**

| Step Type      | Parameters                                   | What It Does                                             |
| -------------- | -------------------------------------------- | -------------------------------------------------------- |
| `camera_pan`   | from, to, duration, easing                   | Smooth camera movement between positions                 |
| `camera_shake` | intensity, duration                          | Screen shake (explosion, impact)                         |
| `dialogue`     | speaker, portrait, text, audio_ref, duration | Character speech bubble / subtitle overlay               |
| `play_video`   | video_ref, display_mode                      | Video playback (any display mode)                        |
| `play_music`   | track, fade_in                               | Music change with crossfade                              |
| `play_sound`   | sound_ref, position (optional)               | Sound effect — positional or global                      |
| `wait`         | duration                                     | Pause between steps (in game ticks or seconds)           |
| `spawn_units`  | units[], position, faction                   | Dramatic unit reveal (reinforcements arriving on-camera) |
| `destroy`      | target                                       | Scripted destruction (building collapses, bridge blows)  |
| `weather`      | type, intensity, transition_time             | Weather change synchronized with the sequence            |
| `letterbox`    | enable/disable, transition_time              | Toggle cinematic letterbox bars                          |
| `set_variable` | name, value                                  | Set a mission or campaign variable during the sequence   |
| `lua`          | script                                       | Advanced: arbitrary Lua for anything not covered above   |

**Cinematic Sequence module properties:**

| Property        | Type                  | Description                                                   |
| --------------- | --------------------- | ------------------------------------------------------------- |
| **Steps**       | ordered list          | Sequence of steps (drag-to-reorder in the editor)             |
| **Trigger**     | connection            | When to start the sequence                                    |
| **Skippable**   | checkbox              | Whether the player can skip the entire sequence               |
| **Presentation mode** | dropdown         | `world` / `fullscreen` / `radar_comm` / `picture_in_picture` (phased support; see below) |
| **Pause sim**   | checkbox              | Whether gameplay pauses during the sequence (default: yes)    |
| **Letterbox**   | checkbox              | Auto-enter letterbox mode when sequence starts (default: yes) |
| **Render mode policy** | dropdown        | `current` / `prefer:<mode>` / `require:<mode>` with fallback policy (phased support; see D048 integration note below) |
| **On Complete** | connection (optional) | What fires when the sequence finishes                         |

**Visual editing:** Steps are shown as a vertical timeline in the module's expanded properties panel. Each step has a colored icon by type. Drag steps to reorder. Click a camera_pan step to see from/to positions highlighted on the map. Click "Preview from step" to test a subsequence without playing the whole thing.

##### Trigger-Driven Camera Scene Authoring (OFP-Style, Property-Driven)

IC should support an **OFP-style trigger-camera workflow** on top of `Cinematic Sequence`: designers can author a cutscene by connecting trigger conditions/properties to a camera-focused sequence without writing Lua.

This is a **D038 convenience layer**, not a separate runtime system:
- runtime playback still uses the same `Cinematic Sequence` data path
- trigger conditions still use the same D038 Trigger system
- advanced users can still author/override the same behavior in Lua

**Baseline camera-trigger properties (author-facing):**

| Property | Type | Description |
| --- | --- | --- |
| **Activation** | trigger connection / trigger preset | What starts the camera scene (`mission_start`, `objective_complete`, `enter_area`, `unit_killed`, `timer`, variable condition, etc.) |
| **Audience Scope** | dropdown | `local_player` / `all_players` / `allies` / `spectators` (multiplayer-safe visibility scope) |
| **Shot Preset** | dropdown | `intro_flyover`, `objective_reveal`, `target_focus`, `follow_unit`, `ambush_reveal`, `bridge_demolition`, `custom` |
| **Camera Targets** | target refs | Units, regions, markers, entities, composition anchors, or explicit points used by the shot |
| **Sequence Binding** | sequence ref / inline sequence | Use an existing `Cinematic Sequence` or author inline under the trigger panel |
| **Pause Policy** | dropdown | `pause`, `continue`, `authored_override` |
| **Skippable** | checkbox | Allow player skip (`true` by default outside forced tutorial moments) |
| **Interrupt Policy** | dropdown | `none`, `on_mission_fail`, `on_subject_death`, `on_combat_alert`, `authored` |
| **Cooldown / Once** | trigger policy | One-shot, repeat, cooldown ticks/seconds |
| **Fallback Presentation** | dropdown | `briefing_text`, `radar_comm`, `notification`, `none` if required target/assets unavailable |

**Design rule:** The editor should expose common camera-scene patterns as trigger presets (property sheets), but always emit normal D038 trigger + cinematic data so the behavior stays transparent and portable across authoring surfaces.

**Phasing (trigger-camera authoring):**

- **`M6` / Phase 4 full (`P-Differentiator`) baseline:** property-driven trigger bindings for rendered cutscenes using `world` / `fullscreen` presentation and shot presets (`intro_flyover`, `objective_reveal`, `target_focus`, `follow_unit`)
  - **Depends on:** `M6.SP.MEDIA_VARIANTS_AND_FALLBACKS`, `M5.SP.CAMPAIGN_RUNTIME_SLICE`, `M6.UX.D038_TRIGGER_CAMERA_SCENES_BASELINE`
  - **Reason:** campaign/runtime cutscenes need designer-friendly trigger authoring before full SDK camera tooling maturity
  - **Not in current scope (M6 baseline):** spline rails, multi-camera shot graphs, advanced per-shot framing preview UI
  - **Validation trigger:** `G19.3` campaign media/cutscene validation includes at least one trigger-authored rendered camera scene (no Lua)
- **Deferred to `M10` / Phase 6b (`P-Creator`)**: advanced camera-trigger authoring UI (shot graph, spline/anchor tools, trigger-context preview/simulate-fire, framing overlays for `radar_comm`/PiP)
  - **Depends on:** `M10.SDK.D038_CAMPAIGN_EDITOR`, `M10.SDK.D038_CAMERA_TRIGGER_AUTHORING_ADVANCED`, `M10.UX.D038_RENDERED_CUTSCENE_DISPLAY_TARGETS`
  - **Reason:** requires mature campaign editor graph UX and advanced cutscene preview surfaces
  - **Not in current scope (M6):** spline camera rails and graph editing in the baseline campaign runtime path
  - **Validation trigger:** D038 preview can simulate trigger firing and preview shot framing against authored targets without running the entire mission

**Multiplayer fairness note (D048/D059/D070):**

Trigger-driven camera scenes must declare audience scope and may not reveal hidden information to unintended players. In multiplayer scenarios, `all_players` camera scenes are authored set-pieces; role/local scenes must remain visibility-safe and respect D048 information parity rules.

**Presentation targets and phasing (explicit):**

- **`M6` / Phase 4 full (`P-Differentiator`) baseline:** `world` and `fullscreen` rendered cutscenes (pause/non-pause + letterbox + dialogue/radar-comm integration)
  - **Depends on:** `M5.SP.CAMPAIGN_RUNTIME_SLICE`, `M3.CORE.AUDIO_EVA_MUSIC`, `M6.SP.MEDIA_VARIANTS_AND_FALLBACKS`
  - **Not in current scope (M6 baseline):** rendered `radar_comm` and rendered `picture_in_picture` capture-surface targets
  - **Validation trigger:** `G19.3` campaign media/cutscene validation includes at least one rendered cutscene intro and one in-mission rendered sequence
- **Deferred to `M10` / Phase 6b (`P-Creator`)**: rendered `radar_comm` and rendered `picture_in_picture` targets with SDK preview support
  - **Depends on:** `M10.SDK.D038_CAMPAIGN_EDITOR`, `M9.SDK.D040_ASSET_STUDIO`, `M10.UX.D038_RENDERED_CUTSCENE_DISPLAY_TARGETS`
  - **Reason:** requires capture-surface authoring UX, panel-safe framing previews, and validation hooks
  - **Validation trigger:** D038 preview and publish validation can test all four presentation modes for rendered cutscenes
- **Deferred to `M11` / Phase 7 (`P-Optional`)**: advanced `Render mode policy` controls (`prefer/require`) and authored 2D/3D cutscene render-mode variants
  - **Depends on:** `M11.VISUAL.D048_AND_RENDER_MOD_INFRA`
  - **Reason:** render-mode-specific cutscene variants rely on mature D048 visual infrastructure and installed asset compatibility checks
  - **Not in current scope (M6/M10):** hard failure on unavailable optional 3D-only cinematic mode without author-declared fallback
  - **Validation trigger:** render-mode parity tests + fallback tests prove no broken campaign flow when preferred render mode is unavailable

**D048 integration (fairness / information parity):**

Rendered cutscenes may use different visual modes (2D/HD/3D), but they still obey D048's rule that render modes change presentation, not authoritative game-state information. A render-mode preference can change *how* a cinematic looks; it must not reveal sim information unavailable in the current mission state.

**Example — mission intro rendered cutscene (real-time):**

```
Cinematic Sequence: "Mission 3 Intro"
  Trigger: mission_start
  Skippable: yes
  Pause sim: yes

  Steps:
  1. [letterbox]   enable, 0.5s transition
  2. [camera_pan]  from: player_base → to: enemy_fortress, 3s, ease_in_out
  3. [dialogue]    Stavros: "The enemy has fortified the river crossing."
  4. [play_sound]  artillery_distant.wav (global)
  5. [camera_shake] intensity: 0.3, duration: 0.5s
  6. [camera_pan]  to: bridge_crossing, 2s
  7. [dialogue]    Tanya: "I see a weak point in their eastern wall."
  8. [play_music]  "hell_march_v2", fade_in: 2s
  9. [letterbox]   disable, 0.5s transition
```

This replaces what would be 40+ lines of Lua with a visual drag-and-drop sequence. The designer sees the whole flow, reorders steps, previews specific moments, and never touches code.

**Workshop / packaging model for rendered cutscenes (D030/D049/D068 integration):**

- Video cutscenes are typically packaged as media resources (video files + subtitles/CC + metadata).
- Rendered cutscenes are typically packaged as:
  - sequence definitions (`Cinematic Sequence` data / templates)
  - dialogue/portrait/audio dependencies
  - optional visual dependencies (HD/3D render-mode asset packs)
- Campaigns/scenarios can depend on either or both. Missing optional visual/media dependencies must degrade via the existing D068 fallback rules (briefing/text/radar-comm/static presentation), not hard-fail the campaign flow.

#### Dynamic Music

`ic-audio` supports dynamic music states (combat/ambient/tension) that respond to game state (see `13-PHILOSOPHY.md` — Klepacki's game-tempo philosophy). The editor exposes this through two mechanisms:

**1. Music Trigger module** — simple track swap on trigger activation. Already in the module table. Good for scripted moments ("play Hell March when the tanks roll out").

**2. Music Playlist module** — manages an active playlist with playback modes:

| Mode         | Behavior                                                                                |
| ------------ | --------------------------------------------------------------------------------------- |
| `sequential` | Play tracks in order, loop                                                              |
| `shuffle`    | Random order, no immediate repeats                                                      |
| `dynamic`    | Engine selects track based on game state — `combat` / `ambient` / `tension` / `victory` |

**Dynamic mode** is the key feature. The designer tags tracks by mood:

```yaml
music_playlist:
  combat:
    - hell_march
    - grinder
    - drill
  ambient:
    - fogger
    - trenches
    - mud
  tension:
    - radio_2
    - face_the_enemy
  victory:
    - credits
```

The engine monitors game state (active combat, unit losses, base threat, objective progress) and crossfades between mood categories automatically. No triggers required — the music responds to what's happening. The designer curates the playlist; the engine handles transitions.

**Crossfade control:** Music Trigger and Music Playlist modules both support `fade_time` — the duration of the crossfade between the current track and the new one. Default: 2 seconds. Set to 0 for a hard cut (dramatic moments).

#### Ambient Sound Zones

**Ambient Sound Zone** modules tie looping environmental audio to named regions. Walk units near a river — hear water. Move through a forest — hear birds and wind. Approach a factory — hear industrial machinery.

| Property    | Type          | Description                                                           |
| ----------- | ------------- | --------------------------------------------------------------------- |
| **Region**  | region picker | Named region this sound zone covers                                   |
| **Sound**   | file picker   | Looping audio file                                                    |
| **Volume**  | slider 0–100% | Base volume at the center of the region                               |
| **Falloff** | slider        | How quickly sound fades at region edges (sharp → gradual)             |
| **Active**  | checkbox      | Whether the zone starts active (can be toggled by triggers/Lua)       |
| **Layer**   | text          | Optional layer assignment — zone activates/deactivates with its layer |

Ambient Sound Zones are **render-side only** (`ic-audio`) — they have zero sim impact and are not deterministic. They exist purely for atmosphere. The sound is spatialized: the camera's position determines what the player hears and at what volume.

Multiple overlapping zones blend naturally. A bridge over a river in a forest plays water + birds + wind, with each source fading based on camera proximity to its region.

#### EVA Notification System

EVA voice lines are how C&C communicates game events to the player — "Construction complete," "Unit lost," "Enemy approaching." The editor exposes EVA as a module for custom notifications:

| Property       | Type        | Description                                          |
| -------------- | ----------- | ---------------------------------------------------- |
| **Event type** | dropdown    | `custom` / `warning` / `info` / `critical`           |
| **Text**       | text        | Notification text shown in the message area          |
| **Audio**      | file picker | Voice line audio file                                |
| **Trigger**    | connection  | When to fire the notification                        |
| **Cooldown**   | slider      | Minimum time before this notification can fire again |
| **Priority**   | dropdown    | `low` / `normal` / `high` / `critical`               |

Priority determines queuing behavior — critical notifications interrupt lower-priority ones; low-priority notifications wait. This prevents EVA spam during intense battles while ensuring critical alerts always play.

**Built-in EVA events** (game module provides defaults for standard events: unit lost, building destroyed, harvester under attack, insufficient funds, etc.). Custom EVA modules are for mission-specific notifications — "The bridge has been rigged with explosives," "Reinforcements are en route."

#### Letterbox / Cinematic Mode

The **Letterbox Mode** module toggles cinematic presentation:

- **Letterbox bars** — black bars at top and bottom of screen, creating a widescreen aspect ratio
- **HUD hidden** — sidebar, minimap, resource bar, unit selection all hidden
- **Input restricted** — player cannot issue orders (optional — some sequences allow camera panning)
- **Transition time** — bars slide in/out smoothly (configurable)

Letterbox mode is automatically entered by Cinematic Sequences when `letterbox: true` (the default). It can also be triggered independently — a Letterbox Mode module connected to a trigger enters cinematic mode for dramatic moments without a full sequence (e.g., a dramatic camera pan to a nuclear explosion, then back to gameplay).

#### Media in Campaigns

All media modules work within the campaign editor's intermission system:

- **Fullscreen video** before missions (briefing FMVs)
- **Music Playlist** per campaign node (each mission can have its own playlist, or inherit from the campaign default)
- **Dialogue with audio** in intermission screens — character portraits with voice-over
- **Ambient sound** in intermission screens (command tent ambiance, war room hum)

The campaign node properties (briefing, debriefing) support media references:

| Property           | Type             | Description                                         |
| ------------------ | ---------------- | --------------------------------------------------- |
| **Briefing video** | file picker      | Optional FMV played before the mission (fullscreen) |
| **Briefing audio** | file picker      | Voice-over for text briefing (if no video)          |
| **Briefing music** | track picker     | Music playing during the briefing screen            |
| **Debrief audio**  | file picker (×N) | Per-outcome voice-over for debrief screens          |
| **Debrief video**  | file picker (×N) | Per-outcome FMV (optional)                          |

This means a campaign creator can build the full original RA experience — FMV briefing → mission with in-game radar comms → debrief with per-outcome results — entirely through the visual editor.

#### Localization & Subtitle / Closed Caption Workbench (Advanced, Phase 6b)

Campaign and media-heavy projects need more than scattered text fields. The SDK adds a dedicated **Localization & Subtitle / Closed Caption Workbench** (Advanced mode) for creators shipping multi-language campaigns and cutscene-heavy mods.

**Scope (Phase 6b):**
- **String table editor** with usage lookup ("where is this key used?" across scenarios, campaign nodes, dialogue, EVA, radar comms)
- **Subtitle / closed-caption timeline editor** for video playback, radar comms, and dialogue modules (timing, duration, line breaks, speaker tags, optional SFX/speaker labels)
- **Pseudolocalization preview** to catch clipping/overflow in radar comm overlays, briefing panels, and dialogue UI before publish
- **RTL/BiDi preview and validation** for Arabic/Hebrew/mixed-script strings (shaping, line-wrap, truncation, punctuation/numeral behavior) in briefing/debrief/radar-comm/dialogue/subtitle/closed-caption surfaces
- **Layout-direction preview (`LTR` / `RTL`)** for relevant UI surfaces and D065 tutorial/highlight overlays so mirrored anchors and alignment rules can be verified without switching the entire system locale
- **Localized image/style asset checks** for baked-text image variants and directional icon policies (`mirror_in_rtl` vs fixed-orientation) where creators ship localized UI art
- **Coverage report** for missing translations per language / per campaign branch
- **Export-aware validation** for target constraints (RA1 string table limits, OpenRA Fluent export readiness)

This is an Advanced-mode tool and stays hidden unless localization assets exist or the creator explicitly enables it. Simple mode continues to use direct text fields.

**Execution overlay mapping:** runtime RTL/BiDi text/layout correctness lands in `M6`/`M7`; SDK baseline RTL-safe editor chrome and text rendering land in `M9`; this Workbench's authoring-grade RTL/BiDi preview and validation surfaces land in `M10` (`P-Creator`) and are not part of `M9` exit criteria.

**Validation fixtures:** The Workbench ships/uses the canonical `src/tracking/rtl-bidi-qa-corpus.md` fixtures (mixed-script chat/marker labels, subtitle/closed-caption/objective strings, truncation/bounds cases, and sanitization regression vectors) so runtime D059 communication behavior and authoring previews are tested against the same dataset.

#### Lua Media API (Advanced)

All media modules map to Lua functions for advanced scripting. The `Media` global (OpenRA-compatible, D024) provides the baseline; IC extensions add richer control:

```lua
-- OpenRA-compatible (work identically)
Media.PlaySpeech("eva_building_captured")    -- EVA notification
Media.PlaySound("explosion_large")           -- Sound effect
Media.PlayMusic("hell_march")                -- Music track
Media.DisplayMessage("Bridge destroyed!", "warning")  -- Text message

-- IC extensions (additive)
Media.PlayVideo("briefing_03.vqa", "fullscreen", { skippable = true })
Media.PlayVideo("commander_call.mp4", "radar_comm")
Media.PlayVideo("heli_arrives.webm", "picture_in_picture")

Media.SetMusicPlaylist({ "hell_march", "grinder" }, "shuffle")
Media.SetMusicMode("dynamic")    -- switch to dynamic mood-based selection
Media.CrossfadeTo("fogger", 3.0) -- manual crossfade with duration

Media.SetAmbientZone("forest_region", "birds_wind.ogg", { volume = 0.7 })
Media.SetAmbientZone("river_region", "water_flow.ogg", { volume = 0.5 })

-- Cinematic sequence from Lua (for procedural cutscenes)
local seq = Media.CreateSequence({ skippable = true, pause_sim = true })
seq:AddStep("letterbox", { enable = true, transition = 0.5 })
seq:AddStep("camera_pan", { to = bridge_pos, duration = 3.0 })
seq:AddStep("dialogue", { speaker = "Tanya", text = "I see them.", audio = "tanya_03.wav" })
seq:AddStep("play_sound", { ref = "artillery.wav" })
seq:AddStep("camera_shake", { intensity = 0.4, duration = 0.5 })
seq:AddStep("letterbox", { enable = false, transition = 0.5 })
seq:Play()
```

The visual modules and Lua API are interchangeable — a Cinematic Sequence created in the editor generates the same data as one built in Lua. Advanced users can start with the visual editor and extend with Lua; Lua-first users get the same capabilities without the GUI.

### Validate & Playtest (Low-Friction Default)

The default creator workflow is intentionally simple and fast:

```
[Preview] [Test ▼] [Validate] [Publish]
```

- **Preview** — starts the sim from current editor state in the SDK. No compilation, no export, no separate process.
- **Test** — launches `ic-game` with the current scenario/campaign content. One click, real playtest.
- **Validate** — optional one-click checks. Never required before Preview/Test.
- **Publish** — opens a single Publish Readiness screen (aggregated checks + warnings), and offers to run Publish Validate if results are stale.

This preserves the "zero barrier between editing and playing" principle while still giving creators a reliable pre-publish safety net.

**Preview/Test quality-of-life:**
- **Play from cursor** — start the preview with the camera at the current editor position (Eden Editor's "play from here")
- **Speed controls** — preview at 2x/4x/8x to quickly reach later mission stages
- **Instant restart** — reset to editor state without re-entering the editor

### Validation Presets (Simple + Advanced)

The SDK exposes validation as presets backed by the same core checks used by the CLI (`ic mod check`, `ic mod test`, `ic mod audit`, `ic export ... --dry-run/--verify`). The SDK is a UI wrapper, not a parallel validation implementation.

**Quick Validate (default `Validate` button, Phase 6a):**
- Target runtime: fast enough to feel instant on typical scenarios (guideline: ~under 2 seconds)
- Schema/serialization validity
- Missing references (entities, regions, layers, campaign node links)
- Unresolved assets
- Lua parse/sandbox syntax checks
- Duplicate IDs/names where uniqueness is required
- Obvious graph errors (dead links, missing mission outcomes)
- Export target incompatibilities (only if export-safe mode has a selected target)

**Publish Validate (Phase 6a, launched from Publish Readiness or Advanced panel):**
- Includes Quick Validate
- Dependency/license checks (`ic mod audit`-style)
- Export verification dry-run for selected target(s)
- Stricter warning set (discoverability/metadata completeness)
- Optional smoke test (headless `ic mod test` equivalent for playable scenarios)

**Advanced presets (Phase 6b):**
- `Export`
- `Multiplayer`
- `Performance`
- Batch validation for multiple scenarios/campaign nodes

### Validation UX Contract (Non-Blocking by Default)

To avoid the SDK "getting in the way," validation follows strict UX rules:

- **Asynchronous** — runs in the background; editing remains responsive
- **Cancelable** — long-running checks can be stopped
- **No full validate on save** — saving stays fast
- **Stale badge, not forced rerun** — edits mark prior results as stale; they do not auto-run heavy checks

**Status badge states (project/editor chrome):**
- `Valid`
- `Warnings`
- `Errors`
- `Stale`
- `Running`

**Validation output model (single UI, Phase 6a):**
- **Errors** — block publish until fixed
- **Warnings** — publish allowed with explicit confirmation (policy-dependent)
- **Advice** — non-blocking tips

Each issue includes severity, source object/file, short explanation, suggested fix, and a one-click focus/select action where possible.

**Shared validation interfaces (SDK + CLI):**

```rust
pub enum ValidationPreset { Quick, Publish, Export, Multiplayer, Performance }

pub struct ValidationRunRequest {
    pub preset: ValidationPreset,
    pub targets: Vec<String>, // "ic", "openra", "ra1"
}

pub struct ValidationResult {
    pub issues: Vec<ValidationIssue>,
    pub duration_ms: u64,
}

pub struct ValidationIssue {
    pub severity: ValidationSeverity, // Error / Warning / Advice
    pub code: String,
    pub message: String,
    pub location: Option<ValidationLocation>,
    pub suggestion: Option<String>,
}

pub struct ValidationLocation {
    pub file: String,
    pub object_id: Option<StableContentId>,
    pub field_path: Option<String>,
}
```

### Publish Readiness (Single Aggregated Screen)

Before publishing, the SDK shows one **Publish Readiness** screen instead of scattering warnings across multiple panels. It aggregates:

- Validation status (Quick / Publish)
- Export compatibility status (if an export target is selected)
- Dependency/license checks
- Missing metadata
- Quality/discoverability warnings

**Gating policy defaults:**
- **Phase 6a:** Errors block publish. Warnings allow publish with explicit confirmation.
- **Phase 6b (Workshop release channel):** Critical metadata gaps can block release publish; `beta` can proceed with explicit override.

### Profile Playtest (Advanced Mode)

Profiling is deliberately not a primary toolbar button. It is available from:
- `Test` dropdown → **Profile Playtest** (Advanced mode only)
- Advanced panel → **Performance** tab

**Profile Playtest goals (Phase 6a):**
- Provide creator-actionable measurements, not an engine-internals dump
- Complement (not replace) the Complexity Meter with measured evidence

**Measured outputs (summary-first):**
- Average and max sim tick time during playtest
- Top costly systems (grouped for creator readability)
- Trigger/module hotspots (by object ID/name where traceable)
- Entity count timeline
- Asset load/import spikes (Asset Studio profiling integration)
- Budget comparison (desktop default vs low-end target profile)

The first view is a simple pass/warn/fail summary card with the top 3 hotspots and a few short recommendations. Detailed flame/trace views remain optional in Advanced mode.

**Shared profiling summary interfaces (SDK + CLI/CI, Phase 6b parity):**

```rust
pub struct PerformanceBudgetProfile {
    pub name: String,          // "desktop_default", "low_end_2012"
    pub avg_tick_us_budget: u64,
    pub max_tick_us_budget: u64,
}

pub struct PlaytestPerfSummary {
    pub avg_tick_us: u64,
    pub max_tick_us: u64,
    pub hotspots: Vec<HotspotRef>,
}

pub struct HotspotRef {
    pub kind: String,          // system / trigger / module / asset_load
    pub label: String,
    pub object_id: Option<StableContentId>,
}
```

### UI Preview Harness (Cross-Device HUD + Tutorial Overlay, Advanced Mode)

To keep mobile/touch UX discoverable and maintainable (and to avoid "gesture folklore"), the SDK includes an **Advanced-mode UI Preview Harness** for testing gameplay HUD layouts and D065 tutorial overlays without launching a full match.

**What it previews:**
- Desktop / Tablet / Phone layout profiles (`ScreenClass`) with safe-area simulation
- Handedness mirroring (left/right thumb-zone layouts)
- Touch HUD clusters (command rail, minimap + bookmark dock, build drawer/sidebar)
- D065 semantic tutorial prompts (`highlight_ui` aliases resolved to actual widgets)
- Controls Quick Reference overlay states (desktop + touch variants)
- Accessibility variants: large touch targets, reduced motion, high contrast

**Design goals:**
- Validate UI anchor aliases and tutorial highlighting before shipping content
- Catch overlap/clipping issues (notches, safe areas, compact phone aspect ratios)
- Give modders and campaign creators a visual way to check tutorial steps and HUD hints

**Scope boundary:** This is a **preview harness**, not a second UI implementation. It renders the same `ic-ui` widgets/layout profiles used by the game and the same D065 prompt/anchor resolution model used at runtime.

### Simple vs Advanced Mode

Inspired by OFP's Easy/Advanced toggle:

| Feature                         | Simple Mode | Advanced Mode |
| ------------------------------- | ----------- | ------------- |
| Entity placement                | ✓           | ✓             |
| Faction/facing/health           | ✓           | ✓             |
| Basic triggers (win/lose/timer) | ✓           | ✓             |
| Waypoints (move/patrol/guard)   | ✓           | ✓             |
| Modules                         | ✓           | ✓             |
| `Validate` (Quick preset)       | ✓           | ✓             |
| Publish Readiness screen        | ✓           | ✓             |
| UI Preview Harness (HUD/tutorial overlays) | — | ✓       |
| Probability of Presence         | —           | ✓             |
| Condition of Presence           | —           | ✓             |
| Custom Lua conditions           | —           | ✓             |
| Init scripts per entity         | —           | ✓             |
| Countdown/Timeout timers        | —           | ✓             |
| Min/Mid/Max randomization       | —           | ✓             |
| Connection lines                | —           | ✓             |
| Layer management                | —           | ✓             |
| Campaign editor                 | —           | ✓             |
| Named regions                   | —           | ✓             |
| Variables panel                 | —           | ✓             |
| Inline Lua scripts on entities  | —           | ✓             |
| External script files panel     | —           | ✓             |
| Trigger folders & flow graph    | —           | ✓             |
| Media modules (basic)           | ✓           | ✓             |
| Video playback                  | ✓           | ✓             |
| Music trigger / playlist        | ✓           | ✓             |
| Cinematic sequences             | —           | ✓             |
| Ambient sound zones             | —           | ✓             |
| Letterbox / cinematic mode      | —           | ✓             |
| Lua Media API                   | —           | ✓             |
| Intermission screens            | —           | ✓             |
| Dialogue editor                 | —           | ✓             |
| Campaign state dashboard        | —           | ✓             |
| Multiplayer / co-op properties  | —           | ✓             |
| Game mode templates             | ✓           | ✓             |
| Git status strip (read-only)    | ✓           | ✓             |
| Advanced validation presets     | —           | ✓             |
| Profile Playtest                | —           | ✓             |

Simple mode covers 80% of what a casual scenario creator needs. Advanced mode exposes the full power. Same data format — a mission created in Simple mode can be opened in Advanced mode and extended.

