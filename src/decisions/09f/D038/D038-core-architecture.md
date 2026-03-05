## D038 — Scenario Editor (OFP/Eden-Inspired, SDK)

**Revision note (2026-02-22):** Revised to formalize two advanced mission-authoring patterns requested for campaign-style scenarios: **Map Segment Unlock** (phase-based expansion of a pre-authored battlefield without runtime map resizing) and **Sub-Scenario Portal** (IC-native transitions into interior/mini-scenario spaces with optional cutscene/briefing bridges and explicit state handoff). This revision clarifies what is first-class in the editor versus what remains a future engine-level runtime-instance feature.

**Revision note (2026-02-27):** Added **SDK Live Tutorial (Interactive Guided Tours)** — a YAML-driven, step-by-step tour system for the Scenario Editor, Asset Studio, and Campaign Editor. Tours use spotlight overlays, action validation, resumable progress (SQLite), and integrate with the existing "Coming From" profile system. 10 tours ship with the SDK; modders can author additional tours via Workshop distribution. Also added: **Waypoints Mode** (OFP F4-style visual route authoring with waypoint types, synchronization lines, and route naming), **Mission Outcome Wiring** (named outcome triggers connecting scenarios to D021 campaign branches, `Mission.Complete()` Lua API), and **Export Pipeline Integration** (D066 cross-reference — export-safe authoring, trigger downcompilation, CLI export, extensible export targets for RA1/OpenRA/community engines).

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted (Revised 2026-02-27)
- **Phase:** Phase 6a (core editor + workflow foundation), Phase 6b (maturity features)
- **Canonical for:** Scenario Editor mission authoring model, SDK authoring workflow (`Preview` / `Test` / `Validate` / `Publish`), advanced scenario patterns, and SDK Live Tutorial guided tours
- **Scope:** `ic-editor`, `ic-sim` preview/test integration, `ic-render`, `ic-protocol`, SDK UX, creator validation/publish workflow
- **Decision:** IC ships a full visual RTS scenario editor (terrain + entities + triggers + modules + regions + layers + compositions) inside the separate SDK app, with Simple/Advanced modes sharing one underlying data model.
- **Why:** Layered complexity, emergent behavior from composable building blocks, and a fast edit→test loop are the proven drivers of long-lived mission communities.
- **Non-goals:** In-game player-facing editor UI in `ic-game`; mandatory scripting for common mission patterns; true runtime map resizing as a baseline feature.
- **Invariants preserved:** `ic-game` and `ic-editor` remain separate binaries; simulation stays deterministic and unaware of editor mode; preview/test uses normal `PlayerOrder`/`ic-protocol` paths.
- **Defaults / UX behavior:** `Preview` and `Test` remain one-click; `Validate` is async and optional before preview/test; `Publish` uses aggregated Publish Readiness checks.
- **Compatibility / Export impact:** Export-safe authoring and fidelity indicators (D066) are first-class editor concerns; target compatibility is surfaced before publish.
- **Advanced mission patterns:** `Map Segment Unlock` and `Sub-Scenario Portal` are editor-level authoring features; concurrent nested runtime sub-map instances remain deferred.
- **Public interfaces / types / commands:** `StableContentId`, `ValidationPreset`, `ValidationResult`, `PerformanceBudgetProfile`, `MigrationReport`, `ic git setup`, `ic content diff`
- **Affected docs:** `src/17-PLAYER-FLOW.md`, `src/04-MODDING.md`, `src/decisions/09c-modding.md`, `src/10-PERFORMANCE.md`
- **Revision note summary:** (2026-02-22) Added phase-based map expansion and interior/mini-scenario portal transitions. (2026-02-27) Added SDK Live Tutorial, Waypoints Mode (visual route authoring with sync lines), Mission Outcome Wiring (named outcomes → campaign branches), and Export Pipeline Integration (D066 cross-reference).
- **Keywords:** scenario editor, sdk, validate playtest publish, map segment unlock, sub-scenario portal, export-safe authoring, publish readiness, guided tour, sdk tutorial, editor onboarding, tour yaml, waypoints, synchronization, mission outcome, export, openra, ra1, trigger downcompile

**Resolves:** P005 (Map editor architecture)

**Decision:** Visual scenario editor — not just a map/terrain painter, but a full mission authoring tool inspired by Operation Flashpoint's mission editor (2001) and Arma 3's Eden Editor (2016). Ships as part of the **IC SDK** (separate application from the game — see D040 § SDK Architecture). Live isometric preview via shared Bevy crates. Combines terrain editing (tiles, resources, cliffs) with scenario logic editing (unit placement, triggers, waypoints, modules). Two complexity tiers: Simple mode (accessible) and Advanced mode (full power).

**Rationale:**

The OFP mission editor is one of the most successful content creation tools in gaming history. It shipped with a $40 game in 2001 and generated thousands of community missions across 15 years — despite having no undo button. Its success came from three principles:

1. **Accessibility through layered complexity.** Easy mode hides advanced fields. A beginner places units and waypoints in minutes. An advanced user adds triggers, conditions, probability of presence, and scripting. Same data, different UI.
2. **Emergent behavior from simple building blocks.** Guard + Guarded By creates dynamic multi-group defense behavior from pure placement — zero scripting. Synchronization lines coordinate multi-group operations. Triggers with countdown/timeout timers and min/mid/max randomization create unpredictable encounters.
3. **Instant preview collapses the edit→test loop.** Place things on the actual map, hit "Test" to launch the game with your scenario loaded. Hot-reload keeps the loop tight — edit in the SDK, changes appear in the running game within seconds.

Eden Editor (2016) evolved these principles: 3D placement, undo/redo, 154 pre-built modules (complex logic as drag-and-drop nodes), compositions (reusable prefabs), layers (organizational folders), and Steam Workshop publishing directly from the editor. Arma Reforger (2022) added budget systems, behavior trees for waypoints, controller support, and a real-time Game Master mode.

**Iron Curtain applies these lessons to the RTS genre.** An RTS scenario editor has different needs than a military sim — isometric view instead of first-person, base-building and resource placement instead of terrain sculpting, wave-based encounters instead of patrol routes. But the underlying principles are identical: layered complexity, emergent behavior from simple rules, and zero barrier between editing and playing.

### Architecture

The scenario editor lives in the `ic-editor` crate and ships as part of the **IC SDK** — a separate Bevy application from the game (see D040 § SDK Architecture for the full separation rationale). It reuses the game's rendering and simulation crates: `ic-render` (isometric viewport), `ic-sim` (preview playback), `ic-ui` (shared UI components like panels and attribute editors), and `ic-protocol` (order types for preview). `ic-game` does NOT depend on `ic-editor` — the game binary has zero editor code. The SDK binary (`ic-sdk`) bundles the scenario editor, asset studio (D040), campaign editor, and Game Master mode in a single application with a tab-based workspace.

**Test/preview communication:** When the user hits "Test," the SDK serializes the current scenario and launches `ic-game` with it loaded, using a `LocalNetwork` (from `ic-net`). The game runs the scenario identically to normal gameplay — the sim never knows it was launched from the SDK. For quick in-SDK preview (without launching the full game), the SDK can also run `ic-sim` internally with a lightweight preview viewport. Editor-generated inputs (e.g., placing a debug unit mid-preview) are submitted as `PlayerOrder`s through `ic-protocol`. The hot-reload bridge watches for file changes and pushes updates to the running game test session.

```
┌─────────────────────────────────────────────────┐
│                 Scenario Editor                  │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │  Terrain  │  │  Entity   │  │   Logic       │ │
│  │  Painter  │  │  Placer   │  │   Editor      │ │
│  │           │  │           │  │               │ │
│  │ tiles     │  │ units     │  │ triggers      │ │
│  │ resources │  │ buildings │  │ waypoints     │ │
│  │ cliffs    │  │ props     │  │ modules       │ │
│  │ water     │  │ markers   │  │ regions       │ │
│  └──────────┘  └──────────┘  └───────────────┘ │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │            Attributes Panel               │   │
│  │  Per-entity properties (GUI, not code)    │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌─────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Layers  │  │ Comps    │  │ Workflow     │   │
│  │ Panel   │  │ Library  │  │ Buttons      │   │
│  └─────────┘  └──────────┘  └──────────────┘   │
│                                                  │
│  ┌─────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Script  │  │ Vars     │  │ Complexity   │   │
│  │ Editor  │  │ Panel    │  │ Meter        │   │
│  └─────────┘  └──────────┘  └──────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │           Campaign Editor                 │   │
│  │  Graph · State · Intermissions · Dialogue │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  Crate: ic-editor                                │
│  Uses:  ic-render (isometric view)               │
│         ic-sim   (preview playback)              │
│         ic-ui    (shared panels, attributes)     │
└─────────────────────────────────────────────────┘
```

### Editing Modes

| Mode            | Purpose                                                                                                                                                                                   | OFP Equivalent                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Terrain**     | Paint tiles, place resources (ore/gems), sculpt cliffs, water                                                                                                                             | N/A (OFP had fixed terrains)                           |
| **Entities**    | Place units, buildings, props, markers                                                                                                                                                    | F1 (Units) + F6 (Markers)                              |
| **Groups**      | Organize units into squads/formations, set group behavior                                                                                                                                 | F2 (Groups)                                            |
| **Triggers**    | Place area-based conditional logic (win/lose, events, spawns)                                                                                                                             | F3 (Triggers)                                          |
| **Waypoints**   | Assign movement/behavior orders to groups                                                                                                                                                 | F4 (Waypoints)                                         |
| **Connections** | Link triggers ↔ waypoints ↔ modules visually                                                                                                                                              | F5 (Synchronization)                                   |
| **Modules**     | Pre-packaged game logic nodes                                                                                                                                                             | F7 (Modules)                                           |
| **Regions**     | Draw named spatial zones reusable across triggers and scripts                                                                                                                             | N/A (AoE2/StarCraft concept)                           |
| **Layers**      | (Advanced) Create/manage named map layers for dynamic expansion. Draw layer bounds, assign entities to layers, configure shroud reveal and camera transitions. Preview layer activation.  | N/A (new — see `04-MODDING.md` § Dynamic Mission Flow) |
| **Portals**     | (Advanced) Place sub-map portal entities on buildings. Link to interior sub-map files (opens in new tab). Configure entry/exit points, allowed units, transition effects, outcome wiring. | N/A (new — see `04-MODDING.md` § Sub-Map Transitions)  |
| **Scripts**     | Browse and edit external `.lua` files referenced by inline scripts                                                                                                                        | OFP mission folder `.sqs`/`.sqf` files                 |
| **Campaign**    | Visual campaign graph — mission ordering, branching, persistent state                                                                                                                     | N/A (no RTS editor has this)                           |

### Entity Palette UX

The Entities mode panel provides the primary browse/select interface for all placeable objects. Inspired by Garry's Mod's spawn menu (`Q` menu) — the gold standard for navigating massive asset libraries — the palette includes:

- **Search-as-you-type** across all entities (units, structures, props, modules, compositions) — filters the tree in real time
- **Favorites list** — star frequently-used items; persisted per-user in SQLite (D034). A dedicated Favorites tab at the top of the palette
- **Recently placed** — shows the last 20 entities placed this session, most recent first. One click to re-select
- **Per-category browsing** with collapsible subcategories (faction → unit type → specific unit). Categories are game-module-defined via YAML
- **Thumbnail previews** — small sprite/icon preview next to each entry. Hovering shows a larger preview with stats summary

The same palette UX applies to the Compositions Library panel, the Module selector, and the Trigger type picker — search/favorites/recents are universal navigation patterns across all editor panels.

### Entity Attributes Panel

Every placed entity has a GUI properties panel (no code required). This replaces OFP's "Init" field for most use cases while keeping advanced scripting available.

**Unit attributes (example):**

| Attribute                   | Type              | Description                                |
| --------------------------- | ----------------- | ------------------------------------------ |
| **Type**                    | dropdown          | Unit class (filtered by faction)           |
| **Name**                    | text              | Variable name for Lua scripting            |
| **Faction**                 | dropdown          | Owner: Player 1–8, Neutral, Creeps         |
| **Facing**                  | slider 0–360      | Starting direction                         |
| **Stance**                  | enum              | Guard / Patrol / Hold / Aggressive         |
| **Health**                  | slider 0–100%     | Starting hit points                        |
| **Veterancy**               | enum              | None / Rookie / Veteran / Elite            |
| **Probability of Presence** | slider 0–100%     | Random chance to exist at mission start    |
| **Condition of Presence**   | expression        | Lua boolean (e.g., `difficulty >= "hard"`) |
| **Placement Radius**        | slider 0–10 cells | Random starting position within radius     |
| **Init Script**             | text (multi-line) | Inline Lua — the primary scripting surface |

**Probability of Presence** is the single most important replayability feature from OFP. Every entity — units, buildings, resource patches, props — can have a percentage chance of existing when the mission loads. Combined with Condition of Presence, this creates two-factor randomization: "50% chance this tank platoon spawns, but only on Hard difficulty." A player replaying the same mission encounters different enemy compositions each time. This is trivially deterministic — the mission seed determines all rolls.

### Named Regions

Inspired by Age of Empires II's trigger areas and StarCraft's "locations" — both independently proved that named spatial zones are how non-programmers think about RTS mission logic. A **region** is a named area on the map (rectangle or ellipse) that can be referenced by name across multiple triggers, modules, and scripts.

Regions are NOT triggers — they have no logic of their own. They are spatial labels. A region named `bridge_crossing` can be referenced by:
- Trigger 1: "IF Player 1 faction present in `bridge_crossing` → activate reinforcements"
- Trigger 2: "IF `bridge_crossing` has no enemies → play victory audio"
- Lua script: `Region.unit_count("bridge_crossing", faction.allied) >= 5`
- Module: Wave Spawner configured to spawn at `bridge_crossing`

This separation prevents the common RTS editor mistake of coupling spatial areas to individual triggers. In AoE2, if three triggers need to reference the same map area, you create three identical areas. In IC, you create one region and reference it three times.

**Region attributes:**

| Attribute   | Type               | Description                                           |
| ----------- | ------------------ | ----------------------------------------------------- |
| **Name**    | text               | Unique identifier (e.g., `enemy_base`, `ambush_zone`) |
| **Shape**   | rect / ellipse     | Cell-aligned or free-form                             |
| **Color**   | color picker       | Editor visualization color (not visible in-game)      |
| **Tags**    | text[]             | Optional categorization for search/filter             |
| **Z-layer** | ground / air / any | Which unit layers the region applies to               |

### Inline Scripting (OFP-Style)

OFP's most powerful feature was also its simplest: double-click a unit, type a line of SQF in the Init field, done. No separate IDE, no file management, no project setup. The scripting lived *on the entity*. For anything complex, the Init field called an external script file — one line bridges the gap between visual editing and full programming.

IC follows the same model with Lua. The **Init Script** field on every entity is the primary scripting surface — not a secondary afterthought.

**Inline scripting examples:**

```lua
-- Simple: one-liner directly on the entity
this:set_stance("hold")

-- Medium: a few lines of inline behavior
this:set_patrol_route("north_road")
this:on_damaged(function() Var.set("alarm_triggered", true) end)

-- Complex: inline calls an external script file
dofile("scripts/elite_guard.lua")(this)

-- OFP equivalent of `nul = [this] execVM "patrol.sqf"`
run_script("scripts/convoy_escort.lua", { unit = this, route = "highway" })
```

This is exactly how OFP worked: most units have no Init script at all (pure visual placement). Some have one-liners. A few call external files for complex behavior. The progression is organic — a designer starts with visual placement, realizes they need a small tweak, types a line, and naturally graduates to scripting when they're ready. No mode switch, no separate tool.

**Inline scripts run at entity spawn time** — when the mission loads (or when the entity is dynamically spawned by a trigger/module). The `this` variable refers to the entity the script is attached to.

**Triggers and modules also have inline script fields:**
- Trigger **On Activation**: inline Lua that runs when the trigger fires
- Trigger **On Deactivation**: inline Lua for repeatable triggers
- Module **Custom Logic**: override or extend a module's default behavior

Every inline script field has:
- **Syntax highlighting** for Lua with IC API keywords
- **Autocompletion** for entity names, region names, variables, and the IC Lua API (D024)
- **Error markers** shown inline before preview (not in a crash log)
- **Expand button** — opens the field in a larger editing pane for multi-line scripts without leaving the entity's properties panel

### Script Files Panel

When inline scripts call external files (`dofile("scripts/ambush.lua")`), those files need to live somewhere. The **Script Files Panel** manages them — it's the editor for the external script files that inline scripts reference.

This is the same progression OFP used: Init field → `execVM "script.sqf"` → the .sqf file lives in the mission folder. IC keeps the external files *inside the editor* rather than requiring alt-tab to a text editor.

**Script Files Panel features:**
- **File browser** — lists all `.lua` files in the mission
- **New file** — create a script file, it's immediately available to inline `dofile()` calls
- **Syntax highlighting** and **autocompletion** (same as inline fields)
- **Live reload** — edit a script file during preview, save, changes take effect next tick
- **API reference sidebar** — searchable IC Lua API docs without leaving the editor
- **Breakpoints and watch** (Advanced mode) — pause the sim on a breakpoint, inspect variables

**Script scope hierarchy (mirrors the natural progression):**
```
Inline init scripts  — on entities, run at spawn (the starting point)
Inline trigger scripts — on triggers, run on activation/deactivation
External script files  — called by inline scripts for complex logic
Mission init script    — special file that runs once at mission start
```

The tiered model: most users never write a script. Some write one-liners on entities. A few create external files. The progression is seamless — there's no cliff between "visual editing" and "programming," just a gentle slope that starts with `this:set_stance("hold")`.

### Variables Panel

AoE2 scenario designers used invisible units placed off-screen as makeshift variables. StarCraft modders abused the "deaths" counter as integer storage. Both are hacks because the editors lacked native state management.

IC provides a **Variables Panel** — mission-wide state visible and editable in the GUI. Triggers and modules can read/write variables without Lua.

| Variable Type | Example                     | Use Case                             |
| ------------- | --------------------------- | ------------------------------------ |
| **Switch**    | `bridge_destroyed` (on/off) | Boolean flags for trigger conditions |
| **Counter**   | `waves_survived` (integer)  | Counting events, tracking progress   |
| **Timer**     | `mission_clock` (ticks)     | Elapsed time tracking                |
| **Text**      | `player_callsign` (string)  | Dynamic text for briefings/dialogue  |

**Variable operations in triggers (no Lua required):**
- Set variable, increment/decrement counter, toggle switch
- Condition: "IF `waves_survived` >= 5 → trigger victory"
- Module connection: Wave Spawner increments `waves_survived` after each wave

Variables are visible in the Variables Panel, named by the designer, and referenced by name everywhere. Lua scripts access them via `Var.get("waves_survived")` / `Var.set("waves_survived", 5)`. All variables are deterministic sim state (included in snapshots and replays).

### Scenario Complexity Meter

Inspired by TimeSplitters' memory bar — a persistent, always-visible indicator of scenario complexity and estimated performance impact.

```
┌──────────────────────────────────────────────┐
│  Complexity: ████████████░░░░░░░░  58%       │
│  Entities: 247/500  Triggers: 34/200         │
│  Scripts: 3 files   Regions: 12              │
└──────────────────────────────────────────────┘
```

The meter reflects:
- **Entity count** vs recommended maximum (per target platform)
- **Trigger count** and nesting depth
- **Script complexity** (line count, hook count)
- **Estimated tick cost** — based on entity types and AI behaviors

The meter is a **guideline, not a hard limit**. Exceeding 100% shows a warning ("This scenario may perform poorly on lower-end hardware") but doesn't prevent saving or publishing. Power users can push past it; casual creators stay within safe bounds without thinking about performance.

### Trigger Organization

The AoE2 Scenario Editor's trigger list collapses into an unmanageable wall at 200+ triggers — no folders, no search, no visual overview. IC prevents this from day one:

- **Folders** — group triggers by purpose ("Phase 1", "Enemy AI", "Cinematics", "Victory Conditions")
- **Search / Filter** — find triggers by name, condition type, connected entity, or variable reference
- **Color coding** — triggers inherit their folder's color for visual scanning
- **Flow graph view** — toggle between list view and a visual node graph showing trigger chains, connections to modules, and variable flow. Read-only visualization, not a node-based editor (that's the "Alternatives Considered" item). Lets designers see the big picture of complex mission logic without reading every trigger.
- **Collapse / expand** — folders collapse to single lines; individual triggers collapse to show only name + condition summary

### Undo / Redo

OFP's editor shipped without undo. Eden added it 15 years later. IC ships with full undo/redo from day one.

- **Unlimited undo stack** (bounded by memory, not count)
- Covers all operations: entity placement/deletion/move, trigger edits, terrain painting, variable changes, layer operations
- **Redo** restores undone actions until a new action branches the history
- Undo history survives save/load within a session
- **Ctrl+Z / Ctrl+Y** (desktop), equivalent bindings on controller

### Workspace as Overlay Composition

The scenario editor's project workspace is modeled as a layered overlay — a pattern formalized by AnyFS's `Overlay<Base, Upper>` middleware (and already used in IC's mod namespace resolution, D062). Each workspace is a composition of read-only base layers with a single writable edit layer:

```
┌──────────────────────────────────────────┐
│  Writable Edit Layer (user changes)      │  ← writes go here
├──────────────────────────────────────────┤
│  Imported Assets (Workshop / local)      │  ← read-only overlay
├──────────────────────────────────────────┤
│  Active Mod Profile (D062 namespace)     │  ← read-only overlay
├──────────────────────────────────────────┤
│  Base Game (engine defaults)             │  ← read-only base
└──────────────────────────────────────────┘
    Reads: walk top → down (first hit wins)
    Writes: always to the top edit layer
```

This composition gives the editor several capabilities naturally:

- **Non-destructive editing:** The base game and mod sources are never modified. All editor changes land in the writable edit layer. Reverting means discarding the edit layer — the underlying data is untouched.
- **Per-source visibility:** The layer list UI (already designed for entity layers) extends to source layers. Designers can toggle visibility per source to see "what does this mod contribute?" or "what did I change?" independently.
- **Undo as layer snapshot:** Because the edit layer is a self-contained set of changes, the entire undo history is scoped to that layer. An undo checkpoint is a snapshot of just the edit layer — lighter than snapshotting the full workspace.
- **Hot-swap sources:** When editing a mod's YAML rules, only the changed source's layer is rebuilt (per D062 § Editor Integration). Other layers remain cached. This enables sub-second iteration during rule authoring without re-resolving the full namespace.

> **Prior art:** AnyFS's `Overlay<Base, Upper>` (read from upper → base, write to upper), Docker's image layers (read-only base + writable container layer), IC's own `VirtualNamespace` (D062). The editor workspace applies the same principle at a different scope: D062 composes mods for gameplay; the editor composes sources for authoring.

### Autosave & Crash Recovery

OFP's editor had no undo and no autosave — one misclick or crash could destroy hours of work. IC ships with both from day one.

- **Autosave** — configurable interval (default: every 5 minutes). Writes to a rotating set of 3 autosave slots so a corrupted save doesn't overwrite the only backup
- **Pre-preview save** — the editor automatically saves a snapshot before entering preview mode. If the game crashes during preview, the editor state is preserved
- **Recovery on launch** — if the editor detects an unclean shutdown (crash), it offers to restore from the most recent autosave: "The editor was not closed properly. Restore from autosave (2 minutes ago)? [Restore] [Discard]"
- **Undo history persistence** — the undo stack is included in autosaves. Restoring from autosave also restores the ability to undo recent changes
- **Manual save is always available** — Ctrl+S saves to the scenario file. Autosave supplements manual save, never replaces it

### Git-First Collaboration (No Custom VCS)

IC does **not** reinvent version control. Git is the source of truth for history, branching, remotes, and merging. The SDK's job is to make editor-authored content behave well *inside* Git, not replace it with a parallel timeline system.

**What IC adds (Git-friendly infrastructure, not a new VCS):**
- **Stable content IDs** on editor-authored objects (entities, triggers, modules, regions, waypoints, layers, campaign nodes/edges, compositions). Renames and moves diff as modifications instead of delete+add.
- **Canonical serialization** for editor-owned files (`.icscn`, `.iccampaign`, compositions, editor metadata) — deterministic key ordering, stable list ordering where order is not semantic, explicit persisted order fields where order *is* semantic (e.g., cinematic steps, campaign graph layout).
- **Semantic diff helpers** (`ic content diff`) that present object-level changes for review and CI summaries while keeping plain-text YAML/Lua as the canonical stored format.
- **Semantic merge helpers** (`ic content merge`, Phase 6b) for Git merge-driver integration, layered on top of canonical serialization and stable IDs.

**What IC explicitly does NOT add (Phase 6a/6b):**
- Commit/branch/rebase UI inside the SDK
- Cloud sync or repository hosting
- A custom history graph separate from Git

**SDK Git awareness (read-only, low friction):**
- Small status strip in project chrome: repo detected/not detected, current branch, dirty/clean status, changed file count, conflict badge
- Utility actions only: "Open in File Manager," "Open in External Git Tool," "Copy Git Status Summary"
- No modal interruptions to preview/test when a repo is dirty

**Data contracts (Phase 6a/6b):**

```rust
/// Stable identifier persisted in editor-authored files.
/// ULID string format for lexicographic sort + uniqueness.
pub type StableContentId = String;

pub enum EditorFileFormatVersion {
    V1,
    // future versions add migration paths; old files remain loadable via migration preview/apply
}

pub struct SemanticDiff {
    pub changes: Vec<SemanticChange>,
}

pub enum SemanticChange {
    AddObject { id: StableContentId, object_type: String },
    RemoveObject { id: StableContentId, object_type: String },
    ModifyField { id: StableContentId, field_path: String },
    RenameObject { id: StableContentId, old_name: String, new_name: String },
    MoveObject { id: StableContentId, from_parent: String, to_parent: String },
    RewireReference { id: StableContentId, field_path: String, from: String, to: String },
}
```

The SDK reads/writes plain files; Git remains the source of truth. `ic content diff` / `ic content merge` consume these semantic models while the canonical stored format remains YAML/Lua.

