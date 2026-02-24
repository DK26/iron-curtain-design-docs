## IC SDK & Editor Architecture (D038 + D040)

The IC SDK is the creative toolchain — a separate Bevy application that shares library crates with the game but ships as its own binary. Players never see editor UI. Creators download the SDK to build maps, missions, campaigns, and assets. This section covers the practical architecture: what the GUI looks like, what graphical resources it uses, how the UX flows, and how to start building it. For the full feature catalog (30+ modules, trigger system, campaign editor, dialogue trees, Game Master mode), see `decisions/09f/D038-scenario-editor.md` and `decisions/09f/D040-asset-studio.md`.

### SDK Application Structure

The SDK is a single Bevy application with tabbed workspaces:

```
┌───────────────────────────────────────────────────────────────────────┐
│  IC SDK                                              [_][□][X]        │
├──────────────┬────────────────────────────────────────────────────────┤
│              │  [Scenario Editor] [Asset Studio] [Campaign Editor]    │
│  MODE PANEL  ├────────────────────────────────────────┬───────────────┤
│              │                                        │               │
│  ┌─────────┐ │         ISOMETRIC VIEWPORT             │  PROPERTIES   │
│  │Terrain  │ │                                        │  PANEL        │
│  │Entities │ │    (same ic-render as the game —       │               │
│  │Triggers │ │     live preview of actual game        │  [Name: ___]  │
│  │Waypoints│ │     rendering)                         │  [Faction: _] │
│  │Modules  │ │                                        │  [Health: __] │
│  │Regions  │ │                                        │  [Script: _]  │
│  │Scripts  │ │                                        │               │
│  │Layers   │ │                                        │               │
│  └─────────┘ │                                        │               │
│              ├────────────────────────────────────────┤               │
│              │  BOTTOM PANEL (context-sensitive)       │               │
│              │  Triggers list / Script editor / Vars  │               │
│              ├────────────────────────────────────────┴───────────────┤
│              │  STATUS BAR: cursor pos │ cell info │ complexity meter │
└──────────────┴───────────────────────────────────────────────────────┘
```

**Four main areas:**

| Area                   | Technology                 | Purpose                                                                                                       |
| ---------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Mode panel (left)**  | Bevy UI or `egui`          | Editing mode selector (8–10 modes). Stays visible at all times. Icons + labels, keyboard shortcuts            |
| **Viewport (center)**  | `ic-render` (same as game) | The isometric map view. Renders terrain, sprites, trigger areas, waypoint lines, region overlays in real time |
| **Properties (right)** | Bevy UI or `egui`          | Context-sensitive inspector. Shows attributes of the selected entity, trigger, module, or region              |
| **Bottom panel**       | Bevy UI or `egui`          | Tabbed: trigger list, script editor (with syntax highlighting), variables panel, module browser               |

### GUI Technology Choice

The SDK faces a UI technology decision that the game does not: the game's UI is a themed, styled chrome layer (D032) built for immersion, while the SDK needs a dense, professional tool UI with text fields, dropdowns, tree views, scrollable lists, and property inspectors.

**Approach: Dual UI — `ic-render` viewport + `egui` panels**

| Concern                  | Technology      | Rationale                                                                                                              |
| ------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Isometric viewport**   | `ic-render`     | Must be identical to game rendering. Uses the same Bevy render pipeline, same sprite batching, same palette shaders    |
| **Tool panels (all)**    | `egui`          | Dense inspector UI, text input, dropdowns, tree views, scrollable lists. `bevy_egui` integrates cleanly into Bevy apps |
| **Script editor**        | `egui` + custom | Syntax-highlighted Lua editor with autocompletion. `egui` text edit with custom highlighting pass                      |
| **Campaign graph**       | Custom Bevy 2D  | Node-and-edge graph rendered in a 2D Bevy viewport (not isometric). Pan/zoom like a mind map                           |
| **Asset Studio preview** | `ic-render`     | Sprite viewer, palette preview, in-context preview all use the game's rendering                                        |

**Why `egui` for tool panels:** Bevy UI (`bevy_ui`) is designed for game chrome — styled panels, themed buttons, responsive layouts. The SDK needs raw productivity UI: property grids with dozens of fields, type-ahead search in entity palettes, nested tree views for trigger folders, side-by-side diff panels. `egui` provides all of these out of the box. `bevy_egui` is a mature integration crate. The game never shows `egui` (it uses themed `bevy_ui`); the SDK uses both.

**Why `ic-render` for the viewport:** The editor viewport must show exactly what the game will show — same sprite draw modes, same z-ordering, same palette application, same shroud rendering. If the editor used a simplified renderer, creators would encounter "looks different in-game" surprises. Reusing `ic-render` eliminates this class of bugs entirely.

### What Graphical Resources the Editor Uses

The SDK does not need its own art assets for the editor chrome — it uses `egui`'s default styling (suitable for professional tools) plus the game's own assets for content preview.

| Resource Category    | Source                                                                                        | Used For                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Editor chrome**    | `egui` default dark theme (or light theme, user-selectable)                                   | All panels, menus, inspectors, tree views, buttons, text fields                             |
| **Viewport content** | Player's installed RA assets (via `ra-formats` + content detection)                           | Terrain tiles, unit/building sprites, animations — the actual game art                      |
| **Editor overlays**  | Procedurally generated or minimal bundled PNGs                                                | Trigger zone highlights (colored rectangles), waypoint markers (circles), region boundaries |
| **Entity palette**   | Sprite thumbnails extracted from game assets at load time                                     | Small preview icons in the entity browser (Garry's Mod spawn menu style)                    |
| **Mode icons**       | Bundled icon set (~20 small PNG icons, original art, CC BY-SA licensed)                       | Mode panel icons, toolbar buttons, status indicators                                        |
| **Cursor overlays**  | Bundled cursor sprites (~5 cursor states for editor: place, select, paint, erase, eyedropper) | Editor-specific cursors (distinct from game cursors)                                        |

**Key point:** The SDK ships with minimal original art — just icons and cursors for the editor UI itself. All game content (sprites, terrain, palettes, audio) comes from the player's installed games. This is the same legal model as the game: IC never distributes copyrighted assets.

**Entity palette thumbnails:** When the SDK loads a game module, it renders a small thumbnail for every placeable entity type — a 48×48 preview showing the unit's idle frame. These are cached on disk after first generation. The entity palette (left panel in Entities mode) displays these as a searchable grid, with categories, favorites, and recently-placed lists. This is the "Garry's Mod spawn menu" UX described in D038 — search-as-you-type finds any entity instantly.

### UX Flow — How a Creator Uses the Editor

#### Creating a New Scenario (5-minute orientation)

1. **Launch SDK.** Opens to a start screen: New Scenario, Open Scenario, Open Campaign, Asset Studio, Recent Files.
2. **New Scenario.** Dialog: choose map size, theater (Temperate/Snow/Interior), game module (RA1/TD/custom mod). A blank map with terrain generates.
3. **Terrain mode (default).** Terrain brush active. Paint terrain tiles by clicking and dragging. Brush sizes 1×1 to 7×7. Elevation tools if the game module supports Z. Right-click to eyedrop a tile type.
4. **Switch to Entities mode (Tab or click).** Entity palette appears in the left panel. Search for "Medium Tank" → click to select → click on map to place. Properties panel on the right shows the entity's attributes: faction, facing, stance, health, veterancy, Probability of Presence, inline script.
5. **Switch to Triggers mode.** Draw a trigger area on the map. Set condition: "Any unit of Faction A enters this area." Set action: "Reinforcements module activates" (select a preconfigured module). Set countdown timer with min/mid/max randomization.
6. **Switch to Modules mode.** Browse built-in modules (Wave Spawner, Patrol Route, Reinforcements, Objectives). Drag a module onto the map or assign it to a trigger.
7. **Press Test.** SDK launches `ic-game` with this scenario via `LocalNetwork`. Play the mission. Close game → return to editor. Iterate.
8. **Press Publish.** Exports as `.oramap`-compatible package → uploads to Workshop (D030).

#### Simple ↔ Advanced Mode

D038 defines a Simple/Advanced toggle controlling which features are visible:

| Feature                  | Simple Mode | Advanced Mode |
| ------------------------ | ----------- | ------------- |
| Terrain painting         | Yes         | Yes           |
| Entity placement         | Yes         | Yes           |
| Basic triggers           | Yes         | Yes           |
| Modules (drag-and-drop)  | Yes         | Yes           |
| Waypoints                | Yes         | Yes           |
| Probability of Presence  | —           | Yes           |
| Inline scripts           | —           | Yes           |
| Variables panel          | —           | Yes           |
| Connections              | —           | Yes           |
| Scripts panel (external) | —           | Yes           |
| Compositions             | —           | Yes           |
| Custom Lua triggers      | —           | Yes           |
| Campaign editor          | —           | Yes           |

Simple mode hides 15+ features to present a clean, approachable interface. A new creator sees: terrain tools, entity palette, basic triggers, pre-built modules, waypoints, and a Test button. That's enough to build a complete mission. Advanced mode reveals the full power. Toggle at any time — no data loss.

### Editor Viewport — What Gets Rendered

The viewport is not just a map — it renders multiple overlay layers on top of the game's normal isometric view:

```
Layer 0:   Terrain tiles (from ic-render, same as game)
Layer 1:   Grid overlay (faint lines showing cell boundaries, toggle-able)
Layer 2:   Region highlights (named regions shown as colored overlays)
Layer 3:   Trigger areas (pulsing colored boundaries with labels)
Layer 4:   Entities (buildings, units — rendered via ic-render)
Layer 5:   Waypoint markers (numbered circles with directional arrows)
Layer 6:   Connection lines (links between triggers, modules, waypoints)
Layer 7:   Entity selection highlight (selected entity's bounding box)
Layer 8:   Placement ghost (translucent preview of entity being placed)
Layer 9:   Cursor tool overlay (brush circle for terrain, snap indicator)
```

Layers 1–3 and 5–9 are editor-only overlays drawn on top of the game rendering. They use basic 2D shapes (rectangles, circles, lines, text labels) rendered via Bevy's `Gizmos` system or a simple overlay pass. No complex art assets needed — colored geometric primitives with alpha transparency.

### Asset Studio GUI

The Asset Studio is a tab within the same SDK application. Its layout differs from the scenario editor:

```
┌───────────────────────────────────────────────────────────────────────┐
│  IC SDK  — Asset Studio                                               │
├───────────────────────┬───────────────────────────┬───────────────────┤
│                       │                           │                   │
│  ASSET BROWSER        │    PREVIEW VIEWPORT       │  PROPERTIES       │
│                       │                           │                   │
│  📁 conquer.mix       │   (sprite viewer with     │  Frames: 52       │
│    ├── e1.shp         │    palette applied,        │  Width: 50        │
│    ├── 1tnk.shp       │    animation controls,     │  Height: 39       │
│    └── ...            │    zoom, frame scrub)      │  Draw mode:       │
│  📁 temperat.mix      │                           │    [Normal ▾]     │
│    └── ...            │   ◄ ▶ ⏸ ⏮ ⏭  Frame 12/52 │  Palette:         │
│  📁 local assets      │                           │    [temperat ▾]   │
│    └── my_sprite.png  │                           │  Player color:    │
│                       │                           │    [Red ▾]        │
│  🔎 Search...         │                           │                   │
├───────────────────────┴───────────────────────────┼───────────────────┤
│  TOOLS:  [Import] [Export] [Batch] [Compare]      │  In-context:      │
│                                                    │  [Preview as unit]│
└────────────────────────────────────────────────────┴───────────────────┘
```

**Three columns:** Asset browser (tree view of loaded archives + local files), preview viewport (sprite/palette/audio/video viewer), and properties panel (metadata + editing controls). The bottom row has action buttons and the "preview as unit / building / chrome" in-context buttons that render the asset on an actual map tile (using `ic-render`).

### How to Start Building the Editor

The editor bootstraps on top of the game's rendering — so the first-runnable (§ "First Runnable" above) is a prerequisite. Once the engine can load and render RA maps, the editor development follows a clear sequence:

#### Phase 6a Bootstrapping (Editor MVP)

| Step | Deliverable                      | Dependencies                                           | Effort  |
| ---- | -------------------------------- | ------------------------------------------------------ | ------- |
| 1    | SDK binary scaffold              | Bevy app + `bevy_egui`, separate from `ic-game`        | 1 week  |
| 2    | Isometric viewport (read-only)   | `ic-render` as a Bevy plugin, loads a map, pan/zoom    | 1 week  |
| 3    | Terrain painting                 | Map data structure mutation + viewport re-render       | 2 weeks |
| 4    | Entity placement + palette       | Entity list from mod YAML, spawn/delete on click       | 2 weeks |
| 5    | Properties panel                 | `egui` inspector for selected entity attributes        | 1 week  |
| 6    | Save / load (YAML + map.bin)     | Serialize map state to `.oramap`-compatible format     | 1 week  |
| 7    | Trigger system (basic)           | Area triggers, condition/action UI, countdown timers   | 3 weeks |
| 8    | Module system (built-in presets) | Wave Spawner, Patrol Route, Reinforcements, Objectives | 2 weeks |
| 9    | Waypoints + connections          | Visual waypoint markers, drag to connect               | 1 week  |
| 10   | Test button                      | Launch `ic-game` with current scenario via subprocess  | 1 week  |
| 11   | Undo/redo + autosave             | Command pattern for all editing operations             | 2 weeks |
| 12   | Workshop publish                 | `ic mod publish` integration, package scenario         | 1 week  |

**Total: ~18 weeks for a functional scenario editor MVP.** This covers the "core scenario editor" deliverable from Phase 6a — everything a creator needs to build and publish a playable mission.

#### Asset Studio Bootstrapping

The Asset Studio can be developed in parallel once `ra-formats` is mature (Phase 0):

| Step | Deliverable                 | Dependencies                                   | Effort  |
| ---- | --------------------------- | ---------------------------------------------- | ------- |
| 1    | Archive browser + file list | `ra-formats` MIX parser, `egui` tree view      | 1 week  |
| 2    | Sprite viewer with palette  | SHP→RGBA conversion, animation scrubber        | 1 week  |
| 3    | Palette viewer/editor       | Color grid display, remap tools                | 1 week  |
| 4    | Audio player                | AUD→PCM→Bevy audio playback, waveform display  | 1 week  |
| 5    | In-context preview (on map) | `ic-render` viewport showing sprite on terrain | 1 week  |
| 6    | Import pipeline (PNG → SHP) | Palette quantization, frame assembly           | 2 weeks |
| 7    | Chrome/theme designer       | 9-slice editor, live menu preview              | 3 weeks |

**Total: ~10 weeks for Asset Studio Layer 1 (browser/viewer) + Layer 2 (basic editing).** Layer 3 (LLM generation) is Phase 7.

### Do We Have Enough Information?

**Yes — the design is detailed enough to build from.** The critical path is clear:

1. **Rendering engine (§ "First Runnable")** is the prerequisite. Without `ra-formats` and `ic-render`, there's no viewport.
2. **GUI framework (`egui`)** is a known, mature Rust crate. No research needed — it has property inspectors, tree views, text editors, and all the widget types the SDK needs.
3. **Viewport rendering** reuses `ic-render` — the same code that renders the game renders the editor viewport. This eliminates the hardest rendering problem.
4. **Editor overlays** (trigger zones, waypoints, grid lines) are simple 2D shapes on top of the game render. Bevy's `Gizmos` API handles this.
5. **Data model** is defined — scenarios are YAML + `map.bin` (OpenRA-compatible format), triggers are YAML structs, modules are YAML + Lua. No new format to invent.
6. **Feature scope** is defined in D038 (every module, every trigger type, every panel). The question is NOT "what should the editor do" — that's answered. The question is "in what order do we build it" — and that's answered by the phasing table above.

**What remains open:**
- P003 (audio library choice) affects the Asset Studio's audio player but not the scenario editor
- Exact `egui` widget customization for the entity palette (search UX, thumbnail rendering) needs prototyping
- Campaign graph editor's visual layout algorithm (auto-layout for mission nodes) needs implementation experimentation
- The precise line between `bevy_ui` and `egui` usage may shift during development — start with `egui` for everything, migrate specific widgets to `bevy_ui` only if styling needs demand it

See `decisions/09f/D038-scenario-editor.md` for the full scenario editor feature catalog, and `decisions/09f/D040-asset-studio.md` for the Asset Studio's three-layer architecture and format support tables.

