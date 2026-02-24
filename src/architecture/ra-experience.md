## Red Alert Experience Recreation Strategy

Making IC *feel* like Red Alert requires more than loading the right files. The graphics, sounds, menu flow, unit selection, cursor behavior, and click feedback must recreate the experience that players remember — verified against the actual source code. We have access to four authoritative reference codebases. Each serves a different purpose.

### Reference Source Strategy

| Source                                                                                                                  | License           | What We Extract                                                                                                                                                                                                                                                                                                                                                                                                 | What We Don't                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EA Original Red Alert** ([CnC_Red_Alert](https://github.com/electronicarts/CnC_Red_Alert))                            | GPL v3            | Canonical gameplay values (costs, HP, speeds, damage tables). Integer math patterns. Animation frame counts and timing constants. SHP draw mode implementations (shadow, ghost, fade, predator). Palette cycling logic. Audio mixing priorities. Event/order queue architecture. Cursor context logic.                                                                                                          | Don't copy rendering code verbatim — it's VGA/DirectDraw-specific. Don't adopt the architecture — `#ifdef` branching, global state, platform-specific rendering.                                         |
| **EA Remastered Collection** ([CnC_Remastered_Collection](https://github.com/electronicarts/CnC_Remastered_Collection)) | GPL v3 (C++ DLLs) | UX gold standard — the definitive modernization of the RA experience. F1 render-mode toggle (D048 reference). Sidebar redesign. HD asset pipeline (how classic sprites map to HD equivalents). Modern QoL additions. Sound mixing improvements. How they handled the classic↔modern visual duality.                                                                                                             | GPL covers C++ engine DLLs only — the HD art assets, remastered music, and Petroglyph's C# layer are **proprietary**. Never reference proprietary Petroglyph source. Never distribute remastered assets. |
| **OpenRA** ([OpenRA](https://github.com/OpenRA/OpenRA))                                                                 | GPL v3            | Working implementation reference for everything the community expects: sprite rendering order, palette handling, animation overlays, chrome UI system, selection UX, cursor contexts, EVA notifications, sound system integration, minimap rendering, shroud edge smoothing. OpenRA represents 15+ years of community refinement — what players consider "correct" behavior. Issue tracker as pain point radar. | Don't copy OpenRA's balance decisions verbatim (D019 — we offer them as a preset). Don't port OpenRA bugs. Don't replicate C# architecture — translate concepts to Rust/ECS.                             |
| **Bevy** ([bevyengine/bevy](https://github.com/bevyengine/bevy))                                                        | MIT               | How to BUILD it: sprite batching and atlas systems, `bevy_audio` spatial audio, `bevy_ui` layout, asset pipeline (async loading, hot reload), wgpu render graph, ECS scheduling patterns, camera transforms, input handling.                                                                                                                                                                                    | Bevy is infrastructure, not reference for gameplay feel. It tells us *how* to render a sprite, not *which* sprite at *what* timing with *what* palette.                                                  |

**The principle:** Original RA tells us what the values ARE. Remastered tells us what a modern version SHOULD feel like. OpenRA tells us what the community EXPECTS. Bevy tells us how to BUILD it.

### Visual Fidelity Checklist

These are the specific visual elements that make Red Alert look like Red Alert. Each must be verified against original source code constants, not guessed from screenshots.

#### Sprite Rendering Pipeline

| Element                             | Original RA Source Reference                                                                                                               | IC Implementation                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Palette-indexed rendering**       | `PAL` format: 256 × RGB in 6-bit VGA range (0–63). Convert to 8-bit: `value << 2`. See `05-FORMATS.md` § PAL                               | `ra-formats` loads `.pal`; `ic-render` applies via palette texture lookup (GPU shader)                                                                    |
| **SHP draw modes**                  | `SHAPE.H`: `SHAPE_NORMAL`, `SHAPE_SHADOW`, `SHAPE_GHOST`, `SHAPE_PREDATOR`, `SHAPE_FADING`. See `05-FORMATS.md` § SHP                      | Each draw mode is a shader variant in `ic-render`. Shadow = darkened ground sprite. Ghost = semi-transparent. Predator = distortion. Fading = remap table |
| **Player color remapping**          | Palette indices 80–95 (16 entries) are the player color remap range. The original modifies these palette entries per player                | GPU shader: sample palette, if index ∈ [80, 95] substitute from player color ramp. Same approach as OpenRA's `PlayerColorShift`                           |
| **Palette cycling**                 | Water animation: rotate palette indices periodically. Radar dish: palette-animated. From `ANIM.CPP` timing loops                           | `ic-render` system ticks palette rotation at the original frame rate. Cycling ranges are YAML-configurable per theater                                    |
| **Animation frame timing**          | Frame delays defined per sequence in original `.ini` rules (and OpenRA `sequences/*.yaml`). Not arbitrary — specific tick counts per frame | `sequences/*.yaml` in `mods/ra/` defines frame counts, delays, and facings. Timing constants verified against EA source `#define`s                        |
| **Facing quantization**             | 32 facings for vehicles/ships, 8 for infantry. SHP frame index = `facing / (256 / num_facings) * frames_per_facing`                        | `QuantizeFacings` component carries the facing count. Sprite frame index computed in render system. Matches OpenRA's `QuantizeFacingsFromSequence`        |
| **Building construction animation** | "Make" animation plays forward on build, reverse on sell. Specific frame order                                                             | `WithMakeAnimation` equivalent in `ic-render`. Frame order and timing from EA source `BUILD.CPP`                                                          |
| **Terrain theater palettes**        | Temperate, Snow, Interior — each with different palette and terrain tileset. Theater selected by map                                       | Per-map theater tag → loads matching `.pal` and terrain `.tmp` sprites. Same theater names as OpenRA                                                      |
| **Shroud / fog-of-war edges**       | Original RA: hard shroud edges. OpenRA: smooth blended edges. Remastered: smoothed                                                         | IC supports both styles via `ShroudRenderer` visual config — selectable per theme/render mode                                                             |
| **Building bibs**                   | Foundation sprites drawn under buildings (paved area)                                                                                      | Bib sprites from `.shp`, drawn at z-order below building body. Footprint from building definition                                                         |
| **Projectile sprites**              | Bullets, rockets, tesla bolts — each a separate SHP animation                                                                              | Projectile entities carry `SpriteAnimation` components. Render system draws at interpolated positions between sim ticks                                   |
| **Explosion animations**            | Multi-frame explosion sequences at impact points                                                                                           | `ExplosionEffect` spawned by combat system. `ic-render` plays the animation sequence then despawns                                                        |

#### Z-Order (Draw Order)

The draw order determines what renders on top of what. Getting this wrong makes the game look subtly broken — units clipping through buildings, shadows on top of vehicles, overlays behind walls. The canonical order (verified from original source and OpenRA):

```
Layer 0: Terrain tiles (ground)
Layer 1: Smudges (craters, scorch marks, oil stains)
Layer 2: Building bibs (paved foundations)
Layer 3: Building shadows + unit shadows
Layer 4: Buildings (sorted by Y position — southern buildings render on top)
Layer 5: Infantry (sub-cell positioned)
Layer 6: Vehicles / Ships (sorted by Y position)
Layer 7: Aircraft shadows (on ground)
Layer 8: Low-flying aircraft (sorted by Y position)
Layer 9: High-flying aircraft
Layer 10: Projectiles
Layer 11: Explosions / visual effects
Layer 12: Shroud / fog-of-war overlay
Layer 13: UI overlays (health bars, selection boxes, waypoint lines)
```

Within each layer, entities sort by Y-coordinate (south = higher draw order = renders on top). This is the standard isometric sort that prevents visual overlapping artifacts. Bevy's sprite z-ordering maps to this layer system via `Transform.translation.z`.

### Audio Fidelity Checklist

Red Alert's audio is iconic — the EVA voice, unit responses, Hell March, the tesla coil zap. Audio fidelity requires matching the original game's mixing behavior, not just playing the right files.

#### Sound Categories and Mixing

| Category                      | Priority   | Behavior                                                                                                                                     | Original RA Reference                                                                                                                           |
| ----------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **EVA voice lines**           | Highest    | Queue-based, one at a time, interrupts lower priority. "Building complete." "Unit lost." "Base under attack."                                | `AUDIO.CPP`: `Speak()` function, priority queue with cooldowns per notification type                                                            |
| **Unit voice responses**      | High       | Plays on selection and on command. Multiple selected units: random pick from group, don't overlap. "Acknowledged." "Yes sir." "Affirmative." | `AUDIO.CPP`: Voice mixing. Response set defined per unit type in rules                                                                          |
| **Weapon fire sounds**        | Normal     | Positional (spatial audio). Volume by distance from camera. Multiple simultaneous weapons don't clip — mixer clamps                          | `AUDIO.CPP`: Fire sounds tied to weapon in rules. Spatial attenuation                                                                           |
| **Impact / explosion sounds** | Normal     | Positional. Brief, one-shot.                                                                                                                 | Warhead-defined sounds in rules                                                                                                                 |
| **Ambient / environmental**   | Low        | Looping. Per-map or conditional (rain during storm weather, D022)                                                                            | Background audio layer                                                                                                                          |
| **Music**                     | Background | Sequential jukebox. Tracks play in order; player can pick from options menu. Missions can set a starting theme via scenario INI              | `THEME.CPP`: `Theme_Queue()`, theme attributes (tempo, scenario ownership). No runtime combat awareness — track list is fixed at scenario start |

**Original RA music system:** The original game's music was a straightforward sequential playlist. `THEME.CPP` manages a track list with per-theme attributes — each theme has a scenario owner (some tracks only play in certain missions) and a duration. In skirmish, the full soundtrack is available. In campaign, the scenario INI can specify a starting theme, but once playing, tracks advance sequentially and the player can pick from the jukebox in the options menu. There is no combat-detection system, no crossfades, and no dynamic intensity shifting. The Remastered Collection and OpenRA both preserve this simple jukebox model.

**IC enhancement — dynamic situational music:** While the original RA's engine didn't support dynamic music, IC's engine and SDK treat dynamic situational music as a first-class capability. Frank Klepacki designed the RA soundtrack with gameplay tempo in mind — high-energy industrial during combat, ambient tension during build-up (see `13-PHILOSOPHY.md` § Principle #11) — but the original engine didn't act on this intent. IC closes that gap at the engine level.

`ic-audio` provides three music playback modes, selectable per game module, per mission, or per mod:

```yaml
# audio/music_config.yaml
music_mode: dynamic               # "jukebox" | "sequential" | "dynamic"

# Jukebox mode (classic RA behavior):
jukebox:
  tracks: [BIGF226M, GRNDWIRE, HELLMARCH, MUDRA, JBURN_RG, TRENCHES, CC_THANG, WORKX_RG]
  order: sequential               # or "shuffle"
  loop: true

# Dynamic mode (IC engine feature — mood-tagged tracks with state-driven selection):
dynamic_playlist:
  ambient:
    tracks: [BIGF226M, MUDRA, JBURN_RG]
  build:
    tracks: [GRNDWIRE, WORKX_RG]
  combat:
    tracks: [HELLMARCH, TRENCHES, CC_THANG]
  tension:
    tracks: [RADIO2, FACE_THE_ENEMY]
  victory:
    tracks: [RREPORT]
  defeat:
    tracks: [SMSH_RG]
  crossfade_ms: 2000              # default crossfade between mood transitions
  combat_linger_s: 5              # stay in combat music 5s after last engagement
```

In dynamic mode, the engine monitors game state — active combat, base threat level, unit losses, objective progress — and crossfades between mood categories automatically. Designers tag tracks by mood; the engine handles transitions. No scripting required for basic dynamic music.

**Three layers of control** for mission/mod creators:

| Layer                     | Tool                                                                    | Capability                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **YAML configuration**    | `music_config.yaml`                                                     | Define playlists, mood tags, crossfade timing, mode selection — Tier 1 modding, no code                                       |
| **Scenario editor (SDK)** | Music Trigger + Music Playlist modules (D038)                           | Visual drag-and-drop: swap tracks on trigger activation, set dynamic playlists per mission phase, control crossfade timing    |
| **Lua scripting**         | `Media.PlayMusic()`, `Media.SetMusicPlaylist()`, `Media.SetMusicMode()` | Full programmatic control — force a specific track at a narrative beat, override mood category, hard-cut for dramatic moments |

The scenario editor's Music Playlist module (see `decisions/09f/D038-scenario-editor.md` "Dynamic Music") exposes the full dynamic system visually — a designer drags tracks into mood buckets and previews transitions without writing code. The Music Trigger module handles scripted one-shot moments ("play Hell March when the tanks breach the wall"). Both emit standard Lua that modders can extend.

The `music_mode` setting defaults to `dynamic` under the `iron_curtain` experience profile and `jukebox` under the `vanilla` profile for RA1's built-in soundtrack. Game modules and total conversions define their own default mode and mood-tagged playlists. This is Tier 1 YAML configuration — no recompilation, no Lua required for basic use.

#### Unit Voice System

Unit voice responses follow a specific pattern from the original game:

| Event                       | Voice Pool                | Original Behavior                                                                                              |
| --------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Selection** (first click) | `Select` voices           | Plays one random voice from pool. Subsequent clicks on same unit cycle through pool (don't repeat immediately) |
| **Move command**            | `Move` voices             | "Acknowledged", "Moving out", etc. One voice per command, not per selected unit                                |
| **Attack command**          | `Attack` voices           | Weapon-specific when possible. "Engaging", "Firing", etc.                                                      |
| **Harvest command**         | `Harvest` voices          | Harvester-specific responses                                                                                   |
| **Unable to comply**        | `Deny` voices             | "Can't do that", "Negative" — when order is invalid                                                            |
| **Under attack**            | `Panic` voices (infantry) | Only infantry. Played at low frequency to avoid spam                                                           |

**Implementation:** Unit voice definitions live in `mods/ra/rules/units/*.yaml` alongside other unit data:

```yaml
# In rules/units/vehicles.yaml
medium_tank:
  voices:
    select: [VEHIC1, REPORT1, YESSIR1]
    move: [ACKNO, AFFIRM1, MOVOUT1]
    attack: [AFFIRM1, YESSIR1]
    deny: [NEGAT1, CANTDO1]
  voice_interval: 200     # minimum ticks between voice responses (prevents spam)
```

### UX Fidelity Checklist

These are the interaction patterns that make RA *play* like RA. Each is a combination of input handling, visual feedback, and audio feedback.

#### Core Interaction Loop

| Interaction              | Input                             | Visual Feedback                                                                  | Audio Feedback                                                       | Source Reference                                                          |
| ------------------------ | --------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Select unit**          | Left-click on unit                | Selection box appears, health bar shows                                          | Unit voice response from `Select` pool                               | All three sources agree on this pattern                                   |
| **Box select**           | Left-click drag                   | Isometric diamond selection rectangle                                            | None (silent)                                                        | OpenRA: diamond-shaped for isometric. Original: rectangular but projected |
| **Move command**         | Right-click on ground             | Cursor changes to move cursor, then destination marker flashes briefly           | Unit voice from `Move` pool                                          | Original RA: right-click move. OpenRA: same                               |
| **Attack command**       | Right-click on enemy              | Cursor changes to attack cursor (crosshair)                                      | Unit voice from `Attack` pool                                        | Cursor context from `CursorProvider`                                      |
| **Force-fire**           | Ctrl + right-click                | Force-fire cursor (target reticle) on any location                               | Attack voice                                                         | Original RA: Ctrl modifier for force-fire                                 |
| **Force-move**           | Alt + right-click                 | Move cursor over units/buildings (crushes if able)                               | Move voice                                                           | OpenRA addition (not in original RA — QoL toggle)                         |
| **Deploy**               | Click deploy button or hotkey     | Unit plays deploy animation, transforms (e.g., MCV → Construction Yard)          | Deploy sound effect                                                  | `DEPLOY()` in original source                                             |
| **Sell building**        | Dollar-sign cursor + click        | Building plays "make" animation in reverse, then disappears. Infantry may emerge | Sell sound, "Building sold" EVA                                      | Original: reverse make animation + refund                                 |
| **Repair building**      | Wrench cursor + click             | Repair icon appears on building, health ticks up                                 | Repair sound loop                                                    | Original: consumes credits while repairing                                |
| **Place building**       | Click build-queue item when ready | Ghost outline follows cursor, green = valid, red = invalid. Click to place       | "Building" EVA on placement start, "Construction complete" on finish | Remastered: smoothest placement UX                                        |
| **Control group assign** | Ctrl + 0-9                        | Brief flash on selected units                                                    | Beep confirmation                                                    | Standard RTS convention                                                   |
| **Control group recall** | 0-9                               | Previously assigned units selected                                               | None                                                                 | Double-tap: camera centers on group                                       |

#### Sidebar System

The sidebar is the player's primary interface and the most recognizable visual element of Red Alert's UI. Three reference implementations exist:

| Element            | Original RA (1996)                             | Remastered (2020)               | OpenRA                    |
| ------------------ | ---------------------------------------------- | ------------------------------- | ------------------------- |
| **Position**       | Right side, fixed                              | Right side, resizable           | Right side (configurable) |
| **Build tabs**     | Two columns (structures/units), scroll buttons | Tabbed categories, larger icons | Tabbed, scrollable        |
| **Build progress** | Clock-wipe animation over icon                 | Progress bar + clock-wipe       | Progress bar              |
| **Power bar**      | Vertical bar, green/yellow/red                 | Same, refined styling           | Same concept              |
| **Credit display** | Top of sidebar, counts up/down                 | Same, with income rate          | Same concept              |
| **Radar minimap**  | Top of sidebar, player-colored dots            | Same, smoother rendering        | Same, click-to-scroll     |

IC's sidebar is YAML-driven (D032 themes), supporting all three styles as switchable presets. The Classic theme recreates the 1996 layout. The Remastered theme matches the modernized layout. The default IC theme takes the best elements of both.

**Credit counter animation:** The original RA doesn't jump to the new credit value — it counts up or down smoothly ($5000 → $4200 ticks down digit by digit). This is a small detail that contributes significantly to the game feel. IC replicates this with an interpolated counter in `ic-ui`.

**Build queue clock-wipe:** The clock-wipe animation (circular reveal showing build progress on the unit icon) is one of RA's most distinctive UI elements. `ic-render` implements this as a shader that masks the icon with a circular wipe driven by build progress percentage.

#### Verification Method

How we know the recreation is accurate — not "it looks about right" but "we verified against source":

| What                      | Method                                                                                                             | Tooling                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **Animation timing**      | Compare frame delay constants from EA source (`#define` values in C headers) against IC `sequences/*.yaml`         | `ic mod check` validates sequence timing against known-good values                          |
| **Palette correctness**   | Load `.pal`, apply 6-bit→8-bit conversion, compare rendered output against original game screenshot pixel-by-pixel | Automated screenshot comparison in CI (load map, render, diff against reference PNG)        |
| **Draw order**            | Render a test map with overlapping buildings, units, aircraft, shroud. Compare layer order against original/OpenRA | Visual regression test: render known scene, compare against golden screenshot               |
| **Sound mixing**          | Play multiple sound events simultaneously, verify EVA > unit voice > combat priority. Verify cooldown timing       | Automated audio event sequence tests, manual A/B listening                                  |
| **Cursor behavior**       | For each `CursorContext` (move, attack, enter, capture, etc.): hover over target, verify correct cursor appears    | Automated cursor context tests against known scenarios                                      |
| **Sidebar layout**        | Theme rendered at standard resolutions, compared against reference screenshots                                     | Screenshot tests per theme                                                                  |
| **UX sequences**          | Record a play session in original RA/OpenRA, replay the same commands in IC, compare visual/audio results          | Side-by-side video comparison (manual, community verification milestone)                    |
| **Behavioral regression** | Foreign replay import (D056): play OpenRA replays in IC, track divergence points                                   | `replay-corpus/` test harness: automated divergence detection with percentage-match scoring |

**Community verification:** Phase 3 exit criteria include "feels like Red Alert to someone who's played it before." This is subjective but critical — IC will release builds to the community for feel testing well before feature-completeness. The community IS the verification instrument for subjective fidelity.

### What Each Phase Delivers

| Phase        | Visual                                                                                                      | Audio                                                                                   | UX                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Phase 0**  | — (format parsing only)                                                                                     | — (`.aud` decoder in `ra-formats`)                                                      | —                                                                                        |
| **Phase 1**  | Terrain rendering, sprite animation, shroud, palette-aware shading, camera                                  | —                                                                                       | Camera controls only                                                                     |
| **Phase 2**  | Unit movement animation, combat VFX, projectiles, explosions, death animations                              | —                                                                                       | — (headless sim focus)                                                                   |
| **Phase 3**  | Sidebar, build queue chrome, minimap, health bars, selection boxes, cursor system, building placement ghost | EVA voice lines, unit responses, weapon sounds, ambient, music (jukebox + dynamic mode) | Full interaction loop: select, move, attack, build, sell, repair, deploy, control groups |
| **Phase 6a** | Theme switching, community visual mods                                                                      | Community audio mods                                                                    | Full QoL toggle system                                                                   |
