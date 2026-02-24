## D038 — Scenario Editor (OFP/Eden-Inspired, SDK)

**Revision note (2026-02-22):** Revised to formalize two advanced mission-authoring patterns requested for campaign-style scenarios: **Map Segment Unlock** (phase-based expansion of a pre-authored battlefield without runtime map resizing) and **Sub-Scenario Portal** (IC-native transitions into interior/mini-scenario spaces with optional cutscene/briefing bridges and explicit state handoff). This revision clarifies what is first-class in the editor versus what remains a future engine-level runtime-instance feature.

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted (Revised 2026-02-22)
- **Phase:** Phase 6a (core editor + workflow foundation), Phase 6b (maturity features)
- **Canonical for:** Scenario Editor mission authoring model, SDK authoring workflow (`Preview` / `Test` / `Validate` / `Publish`), and advanced scenario patterns
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
- **Revision note summary:** Added first-class authoring support for phase-based map expansion and interior/mini-scenario portal transitions without changing the engine’s baseline runtime map model.
- **Keywords:** scenario editor, sdk, validate playtest publish, map segment unlock, sub-scenario portal, export-safe authoring, publish readiness

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

| Mode            | Purpose                                                               | OFP Equivalent                         |
| --------------- | --------------------------------------------------------------------- | -------------------------------------- |
| **Terrain**     | Paint tiles, place resources (ore/gems), sculpt cliffs, water         | N/A (OFP had fixed terrains)           |
| **Entities**    | Place units, buildings, props, markers                                | F1 (Units) + F6 (Markers)              |
| **Groups**      | Organize units into squads/formations, set group behavior             | F2 (Groups)                            |
| **Triggers**    | Place area-based conditional logic (win/lose, events, spawns)         | F3 (Triggers)                          |
| **Waypoints**   | Assign movement/behavior orders to groups                             | F4 (Waypoints)                         |
| **Connections** | Link triggers ↔ waypoints ↔ modules visually                          | F5 (Synchronization)                   |
| **Modules**     | Pre-packaged game logic nodes                                         | F7 (Modules)                           |
| **Regions**     | Draw named spatial zones reusable across triggers and scripts         | N/A (AoE2/StarCraft concept)           |
| **Layers**      | (Advanced) Create/manage named map layers for dynamic expansion. Draw layer bounds, assign entities to layers, configure shroud reveal and camera transitions. Preview layer activation. | N/A (new — see `04-MODDING.md` § Dynamic Mission Flow) |
| **Portals**     | (Advanced) Place sub-map portal entities on buildings. Link to interior sub-map files (opens in new tab). Configure entry/exit points, allowed units, transition effects, outcome wiring. | N/A (new — see `04-MODDING.md` § Sub-Map Transitions) |
| **Scripts**     | Browse and edit external `.lua` files referenced by inline scripts    | OFP mission folder `.sqs`/`.sqf` files |
| **Campaign**    | Visual campaign graph — mission ordering, branching, persistent state | N/A (no RTS editor has this)           |

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

### Trigger System (RTS-Adapted)

OFP's trigger system adapted for RTS gameplay:

| Attribute            | Description                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Area**             | Rectangle or ellipse on the isometric map (cell-aligned or free-form)                                                |
| **Activation**       | Who triggers it: Any Player / Specific Player / Any Unit / Faction Units / No Unit (condition-only)                  |
| **Condition Type**   | Present / Not Present / Destroyed / Built / Captured / Harvested                                                     |
| **Custom Condition** | Lua expression (e.g., `Player.cash(1) >= 5000`)                                                                      |
| **Repeatable**       | Once or Repeatedly (with re-arm)                                                                                     |
| **Timer**            | Countdown (fires after delay, condition can lapse) or Timeout (condition must persist for full duration)             |
| **Timer Values**     | Min / Mid / Max — randomized, gravitating toward Mid. Prevents predictable timing.                                   |
| **Trigger Type**     | None / Victory / Defeat / Reveal Area / Spawn Wave / Play Audio / Weather Change / Reinforcements / Objective Update |
| **On Activation**    | Advanced: Lua script                                                                                                 |
| **On Deactivation**  | Advanced: Lua script (repeatable triggers only)                                                                      |
| **Effects**          | Play music / Play sound / Play video / Show message / Camera flash / Screen shake / Enter cinematic mode             |

**RTS-specific trigger conditions:**

| Condition               | Description                                                         | OFP Equivalent   |
| ----------------------- | ------------------------------------------------------------------- | ---------------- |
| `faction_present`       | Any unit of faction X is alive inside the trigger area              | Side Present     |
| `faction_not_present`   | No units of faction X inside trigger area                           | Side Not Present |
| `building_destroyed`    | Specific building is destroyed                                      | N/A              |
| `building_captured`     | Specific building changed ownership                                 | N/A              |
| `building_built`        | Player has constructed building type X                              | N/A              |
| `unit_count`            | Faction has ≥ N units of type X alive                               | N/A              |
| `resources_collected`   | Player has harvested ≥ N resources                                  | N/A              |
| `timer_elapsed`         | N ticks since mission start (or since trigger activation)           | N/A              |
| `area_seized`           | Faction dominates the trigger area (adapted from OFP's "Seized by") | Seized by Side   |
| `all_destroyed_in_area` | Every enemy unit/building inside the area is destroyed              | N/A              |
| `custom_lua`            | Arbitrary Lua expression                                            | Custom Condition |

**Countdown vs Timeout with Min/Mid/Max** is crucial for RTS missions. Example: "Reinforcements arrive 3–7 minutes after the player captures the bridge" (Countdown, Min=3m, Mid=5m, Max=7m). The player can't memorize the exact timing. In OFP, this was the key to making missions feel alive rather than scripted.

### Module System (Pre-Packaged Logic Nodes)

Modules are IC's equivalent of Eden Editor's 154 built-in modules — complex game logic packaged as drag-and-drop nodes with a properties panel. Non-programmers get 80% of the power without writing Lua.

**Built-in module library (initial set):**

| Category        | Module             | Parameters                                                           | Logic                                                                                                                                                                                                                                  |
| --------------- | ------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spawning**    | Wave Spawner       | waves[], interval, escalation, entry_points[]                        | Spawns enemy units in configurable waves                                                                                                                                                                                               |
| **Spawning**    | Reinforcements     | units[], entry_point, trigger, delay                                 | Sends units from map edge on trigger                                                                                                                                                                                                   |
| **Spawning**    | Probability Group  | units[], probability 0–100%                                          | Group exists only if random roll passes (visual wrapper around Probability of Presence)                                                                                                                                                |
| **AI Behavior** | Patrol Route       | waypoints[], alert_radius, response                                  | Units cycle waypoints, engage if threat detected                                                                                                                                                                                       |
| **AI Behavior** | Guard Position     | position, radius, priority                                           | Units defend location; peel to attack nearby threats (OFP Guard/Guarded By pattern)                                                                                                                                                    |
| **AI Behavior** | Hunt and Destroy   | area, unit_types[], aggression                                       | AI actively searches for and engages enemies in area                                                                                                                                                                                   |
| **AI Behavior** | Harvest Zone       | area, harvesters, refinery                                           | AI harvests resources in designated zone                                                                                                                                                                                               |
| **Objectives**  | Destroy Target     | target, description, optional                                        | Player must destroy specific building/unit                                                                                                                                                                                             |
| **Objectives**  | Capture Building   | building, description, optional                                      | Player must engineer-capture building                                                                                                                                                                                                  |
| **Objectives**  | Defend Position    | area, duration, description                                          | Player must keep faction presence in area for N ticks                                                                                                                                                                                  |
| **Objectives**  | Timed Objective    | target, time_limit, failure_consequence                              | Objective with countdown timer                                                                                                                                                                                                         |
| **Objectives**  | Escort Convoy      | convoy_units[], route, description                                   | Protect moving units along a path                                                                                                                                                                                                      |
| **Events**      | Reveal Map Area    | area, trigger, delay                                                 | Removes shroud from an area                                                                                                                                                                                                            |
| **Events**      | Play Briefing      | text, audio_ref, portrait                                            | Shows briefing panel with text and audio                                                                                                                                                                                               |
| **Events**      | Camera Pan         | from, to, duration, trigger                                          | Cinematic camera movement on trigger                                                                                                                                                                                                   |
| **Events**      | Weather Change     | type, intensity, transition_time, trigger                            | Changes weather on trigger activation                                                                                                                                                                                                  |
| **Events**      | Dialogue           | lines[], trigger                                                     | In-game dialogue sequence                                                                                                                                                                                                              |
| **Flow**        | Mission Timer      | duration, visible, warning_threshold                                 | Global countdown affecting mission end                                                                                                                                                                                                 |
| **Flow**        | Checkpoint         | trigger, save_state                                                  | Auto-save when trigger fires                                                                                                                                                                                                           |
| **Flow**        | Branch             | condition, true_path, false_path                                     | Campaign branching point (D021)                                                                                                                                                                                                        |
| **Flow**        | Difficulty Gate    | min_difficulty, entities[]                                           | Entities only exist above threshold difficulty                                                                                                                                                                                         |
| **Flow**        | Map Segment Unlock | segments[], reveal_mode, layer_ops[], camera_focus, objective_update | Unlocks one or more **pre-authored map segments** (phase transition): reveals shroud, opens routes, toggles layers, and optionally cues camera/objective updates. This creates the "map extends" effect without runtime map resize. |
| **Flow**        | Sub-Scenario Portal | target_scenario, entry_units, handoff, return_policy, pre/post_media | Transitions to a linked interior/mini-scenario (IC-native). Parent mission is snapshotted and resumed after return; outcomes flow back via variables/flags/roster deltas. Supports optional pre/post cutscene or briefing.         |
| **Effects**     | Explosion          | position, size, trigger                                              | Cosmetic explosion on trigger                                                                                                                                                                                                          |
| **Effects**     | Sound Emitter      | sound_ref, trigger, loop, 3d                                         | Play sound effect — positional (3D) or global                                                                                                                                                                                          |
| **Effects**     | Music Trigger      | track, trigger, fade_time                                            | Change music track on trigger activation                                                                                                                                                                                               |
| **Media**       | Video Playback     | video_ref, trigger, display_mode, skippable                          | Play video — fullscreen, radar_comm, or picture_in_picture (see 04-MODDING.md)                                                                                                                                                         |
| **Media**       | Cinematic Sequence | steps[], trigger, skippable                                          | Chain camera pans + dialogue + music + video + letterbox into a scripted sequence                                                                                                                                                      |
| **Media**       | Ambient Sound Zone | region, sound_ref, volume, falloff                                   | Looping positional audio tied to a named region (forest, river, factory hum)                                                                                                                                                           |
| **Media**       | Music Playlist     | tracks[], mode, trigger                                              | Set active playlist — sequential, shuffle, or dynamic (combat/ambient/tension)                                                                                                                                                         |
| **Media**       | Radar Comm         | portrait, audio_ref, text, duration, trigger                         | RA2-style comm overlay in radar panel — portrait + voice + subtitle (no video required)                                                                                                                                                |
| **Media**       | EVA Notification   | event_type, text, audio_ref, trigger                                 | Play EVA-style notification with audio + text banner                                                                                                                                                                                   |
| **Media**       | Letterbox Mode     | trigger, duration, enter_time, exit_time                             | Toggle cinematic letterbox bars — hides HUD, enters cinematic aspect ratio                                                                                                                                                             |
| **Multiplayer** | Spawn Point        | faction, position                                                    | Player starting location in MP scenarios                                                                                                                                                                                               |
| **Multiplayer** | Crate Drop         | position, trigger, contents                                          | Random powerup/crate on trigger                                                                                                                                                                                                        |
| **Multiplayer** | Spectator Bookmark | position, label, trigger, camera_angle                               | Author-defined camera bookmark for spectator/replay mode — marks key locations and dramatic moments. Spectators can cycle bookmarks with hotkeys. Replays auto-cut to bookmarks when triggered.                                        |
| **Tutorial**    | Tutorial Step      | step_id, title, hint, completion, focus_area, highlight_ui, eva_line | Defines a tutorial step with instructional overlay, completion condition, and optional camera/UI focus. Equivalent to `Tutorial.SetStep()` in Lua but configurable without scripting. Connects to triggers for step sequencing. (D065) |
| **Tutorial**    | Tutorial Hint      | text, position, duration, icon, eva_line, dismissable                | Shows a one-shot contextual hint. Equivalent to `Tutorial.ShowHint()` in Lua. Connect to a trigger to control when the hint appears. (D065)                                                                                            |
| **Tutorial**    | Tutorial Gate      | allowed_build_types[], allowed_orders[], restrict_sidebar            | Restricts player actions for pedagogical pacing — limits what can be built or ordered until a trigger releases the gate. Equivalent to `Tutorial.RestrictBuildOptions()` / `Tutorial.RestrictOrders()` in Lua. (D065)                  |
| **Tutorial**    | Skill Check        | action_type, target_count, time_limit                                | Monitors player performance on a specific action (selection speed, combat accuracy, etc.) and fires success/fail outputs. Used for skill assessment exercises and remedial branching. (D065)                                           |

Modules connect to triggers and other entities via **visual connection lines** — same as OFP's synchronization system. A "Reinforcements" module connected to a trigger means the reinforcements arrive when the trigger fires. No scripting required.

**Custom modules** can be created by modders — a YAML definition + Lua implementation, publishable via Workshop (D030). The community can extend the module library indefinitely.

### Compositions (Reusable Building Blocks)

Compositions are saved groups of entities, triggers, modules, and connections — like Eden Editor's custom compositions. They bridge the gap between individual entity placement and full scene templates (04-MODDING.md).

**Hierarchy:**

```
Entity           — single unit, building, trigger, or module
  ↓ grouped into
Composition      — reusable cluster (base layout, defensive formation, scripted encounter)
  ↓ assembled into
Scenario         — complete mission with objectives, terrain, all compositions placed
  ↓ sequenced into (via Campaign Editor)
Campaign         — branching multi-mission graph with persistent state, intermissions, and dialogue (D021)
```

**Built-in compositions:**

| Composition         | Contents                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| Soviet Base (Small) | Construction Yard, Power Plant, Barracks, Ore Refinery, 3 harvesters, guard units |
| Allied Outpost      | Pillbox ×2, AA Gun, Power Plant, guard units with patrol waypoints                |
| Ore Field (Rich)    | Ore cells + ore truck spawn trigger                                               |
| Ambush Point        | Hidden units + area trigger + attack waypoints (Probability of Presence per unit) |
| Bridge Checkpoint   | Bridge + guarding units + trigger for crossing detection                          |
| Air Patrol          | Aircraft with looping patrol waypoints + scramble trigger                         |
| Coastal Defense     | Naval turrets + submarine patrol + radar                                          |

**Workflow:**
1. Place entities, arrange them, connect triggers/modules
2. Select all → "Save as Composition" → name, category, description, tags, thumbnail
3. Composition appears in the Compositions Library panel (searchable, with favorites — same palette UX as the entity panel)
4. Drag composition onto any map to place a pre-built cluster
5. Publish to Workshop (D030) — community compositions become shared building blocks

**Compositions are individually publishable.** Unlike scenarios (which are complete missions), a single composition can be published as a standalone Workshop resource — a "Soviet Base (Large)" layout, a "Scripted Ambush" encounter template, a "Tournament Start" formation. Other designers browse and install individual compositions, just as Garry's Mod's Advanced Duplicator lets players share and browse individual contraptions independently of full maps. Composition metadata (name, description, thumbnail, tags, author, dependencies) enables a browsable composition library within the Workshop, not just a flat file list.

This completes the content creation pipeline: compositions are the visual-editor equivalent of scene templates (04-MODDING.md). Scene templates are YAML/Lua for programmatic use and LLM generation. Compositions are the same concept for visual editing. They share the same underlying data format — a composition saved in the editor can be loaded as a scene template by Lua/LLM, and vice versa.

### Layers

Organizational folders for managing complex scenarios:

- Group entities by purpose: "Phase 1 — Base Defense", "Phase 2 — Counterattack", "Enemy Patrols", "Civilian Traffic"
- **Visibility toggle** — hide layers in the editor without affecting runtime (essential when a mission has 500+ entities)
- **Lock toggle** — prevent accidental edits to finalized layers
- **Runtime show/hide** — Lua can show/hide entire layers at runtime: `Layer.activate("Phase2_Reinforcements")` / `Layer.deactivate(...)`. Activating a layer spawns all entities in it as a batch; deactivating despawns them. These are **sim operations** (deterministic, included in snapshots and replays), not editor operations — the Lua API name uses `Layer`, not `Editor`, to make the boundary clear. Internally, each entity has a `layer: Option<String>` field; activation toggles a per-layer `active` flag that the spawn system reads. Entities in inactive layers do not exist in the sim — they are serialized in the scenario file but not instantiated until activation. **Deactivation is destructive:** calling `Layer.deactivate()` despawns all entities in the layer — any runtime state (damage taken, position changes, veterancy gained) is lost. Re-activating the layer spawns fresh copies from the scenario template. This is intentional: layers model "reinforcement waves" and "phase transitions," not pausable unit groups. For scenarios that need to preserve unit state across activation cycles, use Lua variables or campaign state (D021) to snapshot and restore specific values

### Mission Phase Transitions, Map Segments, and Sub-Scenarios

Classic C&C-style campaign missions often feel like the battlefield "expands" mid-mission: an objective completes, reinforcements arrive, the camera pans to a new front, and the next objective appears in a region the player could not meaningfully access before. IC treats this as a **first-class authoring pattern**.

#### Map Segment Unlock (the "map extension" effect)

**Design rule:** A scenario's map dimensions are fixed at load. IC does **not** rely on runtime map resizing to create phase transitions. Instead, designers author a larger battlefield up front and unlock parts of it over time.

This preserves determinism and keeps pathfinding, spatial indexing, camera bounds, replays, and saves simple. The player still experiences an "extended map" because the newly unlocked region was previously hidden, blocked, or irrelevant.

**Map Segment** is a visual authoring concept in the Scenario Editor:

- A named region (or set of regions) tagged as a mission phase segment: `Beachhead`, `AA_Nest`, `City_Core`, `Soviet_Bunker_Interior_Access`
- Optional segment metadata:
  - shroud/fog reveal policy
  - route blockers/gates linked to triggers
  - default camera focus point
  - associated objective group(s)
  - layer activation/deactivation presets

The **Map Segment Unlock** module provides a visual one-shot transition for common patterns:

- complete objective → reveal next segment
- remove blockers / open bridge / power gate
- activate reinforcement layers
- fire Radar Comm / Dialogue / Cinematic Sequence
- update objective text and focus camera

This module is intentionally a high-level wrapper over systems that already exist (regions, layers, objectives, media, triggers). Designers can use it for speed, or wire the same behavior manually for full control.

**Example (Tanya-style phase unlock):**

1. Objective: destroy AA emplacements in segment `Harbor_AA`
2. Trigger fires `Map Segment Unlock`
3. Module reveals segment `Extraction_Docks`, activates `Phase2_Reinforcements`, deactivates `AA_Spotters`
4. Module triggers a `Cinematic Sequence` (camera pan + Radar Comm)
5. Objectives switch to "Escort reinforcements to dock"

#### Sub-Scenario Portal (interior/mini-mission transitions)

Some missions need more than a reveal — they need a different space entirely: "Tanya enters the bunker," "Spy infiltrates HQ," "commando breach interior," or a short puzzle/combat sequence that should not be represented on the same outdoor battlefield.

IC supports this as a **Sub-Scenario Portal** authoring pattern.

**What it is:** A visual module + scenario link that transitions the player from the current mission into a linked IC scenario (usually an interior or small specialized map), then returns with explicit outcomes.

**What it is not (in this revision):** A promise of fully concurrent nested map instances running simultaneously in the same mission timeline. The initial design is a **pause parent → run child → return** model, which is dramatically simpler and covers the majority of campaign use cases.

**Sub-Scenario Portal flow (author-facing):**

1. Place a portal trigger on a building/region/unit interaction (e.g., Tanya reaches `ResearchLab_Entrance`)
2. Link it to a target scenario (`m03_lab_interior.icscn`)
3. Define entry-unit filter (specific named character, selected unit set, or scripted roster subset)
4. Configure handoff payload (campaign variables, mission variables, inventory/key items, optional roster snapshot)
5. Choose return policy:
   - return on child mission `victory`
   - return on named child outcome (`intel_stolen`, `alarm_triggered`, `charges_planted`)
   - fail parent mission on child defeat (optional)
6. Optionally chain pre/post media:
   - pre: radar comm, fullscreen cutscene, briefing panel
   - post: debrief snippet, objective update, reinforcement spawn, map segment unlock

**Return payload model (explicit, not magic):**

- story flags (`lab_data_stolen = true`)
- mission variables (`alarm_level = 3`)
- named character state deltas (health, veterancy, equipment where applicable)
- inventory/item changes
- unlock tokens for the parent scenario (`unlock_segment = Extraction_Docks`)

This keeps author intent visible and testable. The editor should never hide critical state transfer behind implicit engine behavior.

#### Editor UX for sophisticated scenario management (Advanced mode)

To keep these patterns powerful without turning the editor into a scripting maze, the Scenario Editor exposes:

- **Segment overlay view** — color-coded map segments with names, objective associations, and unlock dependencies
- **Portal links view** — graph overlay showing parent scenario ↔ sub-scenario transitions and return outcomes
- **Phase transition presets** — one-click scaffolds like:
  - "Objective Complete → Radar Comm → Segment Unlock → Reinforcements → Objective Update"
  - "Enter Building → Cutscene → Sub-Scenario Portal"
  - "Return From Sub-Scenario → Debrief Snippet → Branch / Segment Unlock"
- **Validation checks** (used by `Validate & Playtest`) for:
  - portal links to missing scenarios
  - impossible return outcomes
  - segment unlocks that reveal no reachable path
  - objective transitions that leave the player with no active win path

These workflows are about **maximum creativity with explicit structure**: visual wrappers for common RTS storytelling patterns, with Lua still available for edge cases.

#### Compatibility and export implications

- **IC native:** Full support (target design)
- **OpenRA / RA1 export:** `Map Segment Unlock` may downcompile only partially (e.g., to reveal-area + scripted reinforcements), while `Sub-Scenario Portal` is generally IC-native and expected to be stripped, linearized, or exported as separate missions with fidelity warnings (see D066)

#### Phasing

- **Phase 6b:** Visual authoring support for `Map Segment Unlock` (module + segment overlays + validation)
- **Phase 6b–7:** `Sub-Scenario Portal` authoring and test/playtest integration (IC-native)
- **Future (only if justified by real usage):** True concurrent nested sub-map instances / seamless runtime map-stack transitions

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

### Campaign Editor

D021 defines the campaign *system* — branching mission graphs, persistent rosters, story flags. But a system without an editor means campaigns are hand-authored YAML, which limits who can create them. The Campaign Editor makes D021's full power visual.

Every RTS editor ever shipped treats missions as isolated units. Warcraft III's World Editor came closest — it had a campaign screen with mission ordering and global variables — but even that was a flat list with linear flow. No visual branching, no state flow visualization, no intermission screens, no dialogue trees. The result: almost nobody creates custom RTS campaigns, because the tooling makes it miserable.

The Campaign Editor operates at a level above the Scenario Editor. Where the Scenario Editor zooms into one mission, the Campaign Editor zooms out to see the entire campaign structure. Double-click a mission node → the Scenario Editor opens for that mission. Back out → you're at the campaign graph again.

#### Visual Campaign Graph

The core view: missions as nodes, outcomes as directed edges.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Campaign: Red Tide Rising                     │
│                                                                  │
│    ┌─────────┐   victory    ┌──────────┐   bridge_held           │
│    │ Mission │─────────────→│ Mission  │───────────────→ ...     │
│    │   1     │              │   2      │                         │
│    │ Beach   │   defeat     │ Bridge   │   bridge_lost           │
│    │ Landing │──────┐       │ Assault  │──────┐                  │
│    └─────────┘      │       └──────────┘      │                  │
│                     │                         │                  │
│                     ▼                         ▼                  │
│               ┌──────────┐             ┌──────────┐             │
│               │ Mission  │             │ Mission  │             │
│               │   1B     │             │   3B     │             │
│               │ Retreat  │             │ Fallback │             │
│               └──────────┘             └──────────┘             │
│                                                                  │
│   [+ Add Mission]  [+ Add Transition]  [Validate Graph]         │
└─────────────────────────────────────────────────────────────────┘
```

**Node (mission) properties:**

| Property         | Description                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Mission file** | Link to the scenario (created in Scenario Editor)                                          |
| **Display name** | Shown in campaign graph and briefing                                                       |
| **Outcomes**     | Named results this mission can produce (e.g., `victory`, `defeat`, `bridge_intact`)        |
| **Briefing**     | Text/audio/portrait shown before the mission                                               |
| **Debriefing**   | Text/audio shown after the mission, per outcome                                            |
| **Intermission** | Optional between-mission screen (see Intermission Screens below)                           |
| **Roster in**    | What units the player receives: `none`, `carry_forward`, `preset`, `merge`                 |
| **Roster out**   | Carryover mode for surviving units: `none`, `surviving`, `extracted`, `selected`, `custom` |

**Edge (transition) properties:**

| Property          | Description                                                                         |
| ----------------- | ----------------------------------------------------------------------------------- |
| **From outcome**  | Which named outcome triggers this transition                                        |
| **To mission**    | Destination mission node                                                            |
| **Condition**     | Optional Lua expression or story flag check (e.g., `Flag.get("scientist_rescued")`) |
| **Weight**        | Probability weight when multiple edges share the same outcome (see below)           |
| **Roster filter** | Override roster carryover for this specific path                                    |

#### Randomized and Conditional Paths

D021 defines deterministic branching — outcome X always leads to mission Y. The Campaign Editor extends this with weighted and conditional edges, enabling randomized campaign structures.

**Weighted random:** When multiple edges share the same outcome, weights determine probability. The roll is seeded from the campaign save (deterministic for replays).

```yaml
# Mission 3 outcome "victory" → random next mission
transitions:
  - from_outcome: victory
    to: mission_4a_snow      # weight 40%
    weight: 40
  - from_outcome: victory
    to: mission_4b_desert    # weight 60%
    weight: 60
```

Visually in the graph editor, weighted edges show their probability and use varying line thickness.

**Conditional edges:** An edge with a condition is only eligible if the condition passes. Conditions are evaluated before weights. This enables "if you rescued the scientist, always go to the lab mission; otherwise, random between two alternatives."

**Mission pools:** A pool node represents "pick N missions from this set" — the campaign equivalent of side quests. The player gets a random subset, plays them in any order, then proceeds. Enables roguelike campaign structures.

```
┌──────────┐         ┌─────────────────┐         ┌──────────┐
│ Mission  │────────→│   Side Mission   │────────→│ Mission  │
│    3     │         │   Pool (2 of 5)  │         │    4     │
└──────────┘         │                  │         └──────────┘
                     │ ☐ Raid Supply    │
                     │ ☐ Rescue POWs    │
                     │ ☐ Sabotage Rail  │
                     │ ☐ Defend Village │
                     │ ☐ Naval Strike   │
                     └─────────────────┘
```

Mission pools are a natural fit for the persistent roster system — side missions that strengthen (or deplete) the player's forces before a major battle.

#### Classic Globe Mission Select (RA1-Style)

The original Red Alert featured a **globe screen** between certain missions — the camera zooms to a region, and the player chooses between 2-3 highlighted countries to attack next. "Do we strike Greece or Turkey?" Each choice leads to a different mission variant, and the unchosen mission is skipped. This was one of RA1's most memorable campaign features — the feeling that *you* decided where the war went next. It was also one of the things OpenRA never reproduced; OpenRA campaigns are strictly linear mission lists.

IC supports this natively. It's not a special mode — it falls out of the existing building blocks:

**How it works:** A campaign graph node has multiple outgoing edges. Instead of selecting the next mission via a text menu or automatic branching, the campaign uses a **World Map intermission** to present the choice visually. The player sees the map with highlighted regions, picks one, and that edge is taken.

```yaml
# Campaign graph — classic RA globe-style mission select
nodes:
  mission_5:
    name: "Allies Regroup"
    # After completing this mission, show the globe
    post_intermission:
      template: world-map
      config:
        zoom_to: "eastern_mediterranean"
        choices:
          - region: greece
            label: "Strike Athens"
            target_node: mission_6a_greece
            briefing_preview: "Greek resistance is weak. Take the port city."
          - region: turkey
            label: "Assault Istanbul"
            target_node: mission_6b_turkey
            briefing_preview: "Istanbul controls the straits. High risk, strategic value."
        display:
          highlight_available: true      # glow effect on selectable regions
          show_enemy_strength: true      # "Light/Medium/Heavy resistance"
          camera_animation: globe_spin   # classic RA globe spin to region

  mission_6a_greece:
    name: "Mediterranean Assault"
    # ... mission definition

  mission_6b_turkey:
    name: "Straits of War"
    # ... mission definition
```

This is a **D021 branching campaign** with a **D038 World Map intermission** as the branch selector. The campaign graph has the branching structure; the world map is just the presentation layer for the player's choice. No strategic territory tracking, no force pools, no turn-based meta-layer — just a map that asks "where do you want to fight next?"

**Comparison to World Domination:**

| Aspect                 | Globe Mission Select (RA1-style)               | World Domination                   |
| ---------------------- | ---------------------------------------------- | ---------------------------------- |
| **Purpose**            | Choose between pre-authored mission variants   | Emergent strategic territory war   |
| **Number of choices**  | 2-3 per decision point                         | All adjacent regions               |
| **Missions**           | Pre-authored (designer-created)                | Generated from strategic state     |
| **Map role**           | Presentation for a branch choice               | Primary campaign interface         |
| **Territory tracking** | None — cosmetic only                           | Full (gains, losses, garrisons)    |
| **Complexity**         | Simple — just a campaign graph + map UI        | Complex — full strategic layer     |
| **OpenRA support**     | No                                             | No                                 |
| **IC support**         | Yes — D021 graph + D038 World Map intermission | Yes — World Domination mode (D016) |

The globe mission select is the **simplest** use of the world map component — a visual branch selector for hand-crafted campaigns. World Domination is the most complex — a full strategic meta-layer. Everything in between is supported too: a map that shows your progress through a linear campaign (locations lighting up as you complete them), a map with side-mission markers, a map that shows enemy territory shrinking as you advance.

**RA1 game module default:** The Red Alert game module ships with a campaign that recreates the original RA1 globe-style mission select at the same decision points as the original game. When the original RA1 campaign asked "Greece or Turkey?", IC's RA1 campaign shows the same choice on the same map — but with IC's modern World Map renderer instead of the original 320×200 pre-rendered globe FMV.

#### Persistent State Dashboard

The biggest reason campaign creation is painful in every RTS editor: you can't see what state flows between missions. Story flags are set in Lua buried inside mission scripts. Roster carryover is configured in YAML you never visualize. Variables disappear between missions unless you manually manage them.

The **Persistent State Dashboard** makes campaign state visible and editable in the GUI.

**Roster view:**
```
┌──────────────────────────────────────────────────────┐
│  Campaign Roster                                      │
│                                                       │
│  Mission 1 → Mission 2:  Carryover: surviving         │
│  ├── Tanya (named hero)     ★ Must survive            │
│  ├── Medium Tanks ×4        ↝ Survivors carry forward  │
│  └── Engineers ×2           ↝ Survivors carry forward  │
│                                                       │
│  Mission 2 → Mission 3:  Carryover: extracted          │
│  ├── Extraction zone: bridge_south                    │
│  └── Only units in zone at mission end carry forward  │
│                                                       │
│  Named Characters: Tanya, Volkov, Stavros              │
│  Equipment Pool: Captured MiG, Prototype Chrono        │
└──────────────────────────────────────────────────────┘
```

**Story flags view:** A table of every flag across the entire campaign — where it's set, where it's read, current value in test runs. See at a glance: "The flag `bridge_destroyed` is set in Mission 2's trigger #14, read in Mission 4's Condition of Presence on the bridge entity and Mission 5's briefing text."

| Flag                | Set in                | Read in                               | Type    |
| ------------------- | --------------------- | ------------------------------------- | ------- |
| `bridge_destroyed`  | Mission 2, trigger 14 | Mission 4 (CoP), Mission 5 (briefing) | switch  |
| `scientist_rescued` | Mission 3, Lua script | Mission 4 (edge condition)            | switch  |
| `tanks_captured`    | Mission 2, debrief    | Mission 3 (roster merge)              | counter |
| `player_reputation` | Multiple missions     | Mission 6 (dialogue branches)         | counter |

**Campaign variables:** Separate from per-mission variables (Variables Panel). Campaign variables persist across ALL missions. Per-mission variables reset. The dashboard shows which scope each variable belongs to and highlights conflicts (same name in both scopes).

#### Intermission Screens

Between missions, the player sees an intermission — not just a text briefing, but a customizable screen layout. This is where campaigns become more than "mission list" and start feeling like a *game within the game*.

**Built-in intermission templates:**

| Template              | Layout                                                                                                                                                                                                                                                                      | Use Case                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Briefing Only**     | Portrait + text + "Begin Mission" button                                                                                                                                                                                                                                    | Simple campaigns, classic RA style            |
| **Roster Management** | Unit list with keep/dismiss, equipment assignment, formation arrangement                                                                                                                                                                                                    | OFP: Resistance style unit management         |
| **Base Screen**       | Persistent base view — spend resources on upgrades that carry forward                                                                                                                                                                                                       | Between-mission base building (C&C3 style)    |
| **Shop / Armory**     | Campaign inventory + purchase panel + currency                                                                                                                                                                                                                              | RPG-style equipment management                |
| **Dialogue**          | Portrait + branching text choices (see Dialogue Editor below)                                                                                                                                                                                                               | Story-driven campaigns, RPG conversations     |
| **World Map**         | Map with mission locations — player chooses next mission from available nodes. In World Domination campaigns (D016), shows faction territories, frontlines, and the LLM-generated briefing for the next mission                                                             | Non-linear campaigns, World Domination        |
| **Debrief + Stats**   | Mission results, casualties, performance grade, story flag changes                                                                                                                                                                                                          | Post-mission feedback                         |
| **Credits**           | Auto-scrolling text with section headers, role/name columns, optional background video/image and music track. Supports contributor photos, logo display, and "special thanks" sections. Speed and style (classic scroll / paginated / cinematic) configurable per-campaign. | Campaign completion, mod credits, jam credits |
| **Custom**            | Empty canvas — arrange any combination of panels via the layout editor                                                                                                                                                                                                      | Total creative freedom                        |

Intermissions are defined per campaign node (between "finish Mission 2" and "start Mission 3"). They can chain: debrief → roster management → briefing → begin mission. A typical campaign ending chains: final debrief → credits → return to campaign select (or main menu).

**Intermission panels (building blocks):**

- **Text panel** — rich text with variable substitution (`"Commander, we lost {Var.get('casualties')} soldiers."`).
- **Portrait panel** — character portrait + name. Links to Named Characters.
- **Roster panel** — surviving units from previous mission. Player can dismiss, reorganize, assign equipment.
- **Inventory panel** — campaign-wide items. Drag onto units to equip. Purchase from shop with campaign currency.
- **Choice panel** — buttons that set story flags or campaign variables. "Execute the prisoner? [Yes] [No]" → sets `prisoner_executed` flag.
- **Map panel** — shows campaign geography. Highlights available next missions if using mission pools. In World Domination mode, renders the world map with faction-colored regions, animated frontlines, and narrative briefing panel. The LLM presents the next mission through the briefing; the player sees their territory and the story context, not a strategy game menu.
- **Stats panel** — mission performance: time, casualties, objectives completed, units destroyed.
- **Credits panel** — auto-scrolling rich text optimized for credits display. Supports section headers ("Cast," "Design," "Special Thanks"), two-column role/name layout, contributor portraits, logo images, and configurable scroll speed. The text source can be inline, loaded from a `credits.yaml` file (for reuse across campaigns), or generated dynamically via Lua. Scroll style options: `classic` (continuous upward scroll, Star Wars / RA1 style), `paginated` (fade between pages), `cinematic` (camera-tracked text over background video). Music reference plays for the duration. The panel emits a `credits_finished` event when scrolling completes — chain to a Choice panel ("Play Again?" / "Return to Menu") or auto-advance.
- **Custom Lua panel** — advanced panel that runs arbitrary Lua to generate content dynamically.

These panels compose freely. A "Base Screen" template is just a preset arrangement: roster panel on the left, inventory panel center, stats panel right, briefing text bottom. The Custom template starts empty and lets the designer arrange any combination.

**Per-player intermission variants:** In co-op campaigns, each intermission can optionally define per-player layouts. The intermission editor exposes a "Player Variant" selector: Default (all players see the same screen) or per-slot overrides (Player 1 sees layout A, Player 2 sees layout B). Per-player briefing text is always supported regardless of this setting. Per-player layouts go further — different panel arrangements, different choice options, different map highlights per player slot. This is what makes co-op campaigns feel like each player has a genuine role, not just a shared screen. Variant layouts share the same panel library; only the arrangement and content differ.

#### Dialogue Editor

Branching dialogue isn't RPG-exclusive — it's what separates a campaign with a story from a campaign that's just a mission list. "Commander, we've intercepted enemy communications. Do we attack now or wait for reinforcements?" That's a dialogue tree. The choice sets a story flag that changes the next mission's layout.

The Dialogue Editor is a visual branching tree editor, similar to tools like Twine or Ink but built into the scenario editor.

```
┌──────────────────────────────────────────────────────┐
│  Dialogue: Mission 3 Briefing                         │
│                                                       │
│  ┌────────────────────┐                               │
│  │ STAVROS:            │                               │
│  │ "The bridge is       │                               │
│  │  heavily defended." │                               │
│  └────────┬───────────┘                               │
│           │                                            │
│     ┌─────┴─────┐                                      │
│     │           │                                      │
│  ┌──▼───┐  ┌───▼────┐                                  │
│  │Attack│  │Flank   │                                  │
│  │Now   │  │Through │                                  │
│  │      │  │Forest  │                                  │
│  └──┬───┘  └───┬────┘                                  │
│     │          │                                       │
│  sets:       sets:                                     │
│  approach=   approach=                                 │
│  "direct"    "flank"                                   │
│     │          │                                       │
│  ┌──▼──────────▼──┐                                    │
│  │ TANYA:          │                                    │
│  │ "I'll take       │                                    │
│  │  point."         │                                    │
│  └─────────────────┘                                    │
└──────────────────────────────────────────────────────┘
```

**Dialogue node properties:**

| Property      | Description                                                        |
| ------------- | ------------------------------------------------------------------ |
| **Speaker**   | Character name + portrait reference                                |
| **Text**      | Dialogue line (supports variable substitution)                     |
| **Audio**     | Optional voice-over reference                                      |
| **Choices**   | Player responses — each is an outgoing edge                        |
| **Condition** | Node only appears if condition is true (enables adaptive dialogue) |
| **Effects**   | On reaching this node: set flags, adjust variables, give items     |

**Conditional dialogue:** Nodes can have conditions — "Only show this line if `scientist_rescued` is true." This means the same dialogue tree adapts to campaign state. A character references events from earlier missions without the designer creating separate trees per path.

**Dialogue in missions:** Dialogue trees aren't limited to intermissions. They can trigger during a mission — an NPC unit triggers a dialogue when approached or when a trigger fires. The dialogue pauses the game (or runs alongside it, designer's choice) and the player's choice sets flags that affect the mission in real-time.

#### Named Characters

A **named character** is a persistent entity identity that survives across missions. Not a specific unit instance (those die) — a character definition that can have multiple appearances.

| Property          | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| **ID**            | Stable identifier (`character_id`) used by campaign state, hero progression, and references; not shown to players |
| **Name**          | Display name ("Tanya", "Commander Volkov")                              |
| **Portrait**      | Image reference for dialogue and intermission screens                   |
| **Unit type**     | Default unit type when spawned (can change per mission)                 |
| **Traits**        | Arbitrary key-value pairs (strength, charisma, rank — designer-defined) |
| **Inventory**     | Items this character carries (from campaign inventory system)           |
| **Biography**     | Text shown in roster screen, updated by Lua as the campaign progresses  |
| **Presentation**  | Optional character-level overrides for portrait/icon/voice/skin/markers (convenience layer over unit defaults/resource packs) |
| **Must survive**  | If true, character death → mission failure (or specific outcome)        |
| **Death outcome** | Named outcome triggered if this character dies (e.g., `tanya_killed`)   |

Named characters bridge scenarios and intermissions. Tanya in Mission 1 is the same Tanya in Mission 5 — same `character_id`, same veterancy, same kill count, same equipment (even if the display name/portrait changes over time). If she dies in Mission 3 and doesn't have "must survive," the campaign continues without her — and future dialogue trees skip her lines via conditions.

This is the primitive that makes RPG campaigns possible. A designer creates 6 named characters, gives them traits and portraits, writes dialogue between them, and lets the player manage their roster between missions. That's an RPG party in an RTS shell — no engine changes required, just creative use of the campaign editor's building blocks.

**Optional character presentation overrides (convenience layer):** D038 should expose a character-level presentation override panel so designers can make a unit clearly read as a unique hero/operative **without** creating a full custom mod stack for every case. These overrides sit on top of the character's default unit type + resource pack selection and are intended for identity/readability:

- `portrait_override` (dialogue/intermission/hero sheet portrait)
- `unit_icon_override` (sidebar/build/roster icon where shown)
- `voice_set_override` (selection/move/attack/deny response set)
- `sprite_sequence_override` or `sprite_variant` (alternate sprite/sequence mapping for the same gameplay role)
- `palette_variant` / tint or marker style (e.g., elite trim, stealth suit tint, squad color accent)
- `selection_badge` / minimap marker variant (hero star, special task force glyph)

**Design rule:** gameplay-changing differences (weapons, stats, abilities) still belong in the unit definition + hero toolkit/skill system. The presentation override layer is a **creator convenience** for making unique characters legible and memorable. It can pair with a gameplay variant unit type, but it should not hide gameplay changes behind purely visual metadata.

**Scope and layering:** overrides may be defined as a campaign-wide default for a named character and optionally as mission-scoped variants (e.g., `disguise`, `winter_gear`, `captured_uniform`). Scenario bindings choose which variant to apply when spawning the character.

> **Canonical schema:** The shared `CharacterPresentationOverrides` / variant model used by D038 authoring surfaces is documented in `src/modding/campaigns.md` § "Named Character Presentation Overrides (Optional Convenience Layer)" so the SDK and campaign runtime/docs stay aligned.

#### Campaign Inventory

Persistent items that exist at the campaign level, not within any specific mission.

| Property       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| **Name**       | Item identifier (`prototype_chrono`, `captured_mig`)       |
| **Display**    | Name, icon, description shown in intermission screens      |
| **Quantity**   | Stack count (1 for unique items, N for consumables)        |
| **Category**   | Grouping for inventory panel (equipment, intel, resources) |
| **Effects**    | Optional Lua — what happens when used/equipped             |
| **Assignable** | Can be assigned to named characters in roster screen       |

Items are added via Lua (`Campaign.add_item("captured_mig", 1)`) or via debrief/intermission choices. They're spent, equipped, or consumed in later missions or intermissions.

Combined with named characters and the roster screen: a player captures enemy equipment in Mission 2, assigns it to a character in the intermission, and that character spawns with it in Mission 3. The system is general-purpose — "items" can be weapons, vehicles, intel documents, key cards, magical artifacts, or anything the designer defines.

#### Hero Campaign Toolkit (Optional, Built-In Layer)

Warcraft III-style hero campaigns (for example, Tanya gaining XP, levels, skills, and persistent equipment) **fit IC's campaign design** and should be authorable **without engine modding**. The common case should be handled entirely by D021 campaign state + D038 campaign/scenario/intermission tooling. Lua remains the escape hatch for unusual mechanics.

> **Canonical schema & Lua API:** The authoritative `HeroProfileState` struct, skill tree YAML schema, and Lua helper functions live in `src/modding/campaigns.md` § "Hero Campaign Toolkit". This section covers only the **editor/authoring UX** — what the designer sees in the Campaign Editor and Scenario Editor.

This is not a separate game mode. It's an **optional authoring layer** that sits on top of:
- **Named Characters** (persistent hero identities)
- **Campaign Inventory** (persistent items/loadouts)
- **Intermission Screens** (hero sheet, skill choice, armory)
- **Dialogue Editor** (hero-conditioned lines and choices)
- **D021 persistent state** (XP/level/skills/hero flags)

**Campaign Editor authoring surfaces (Advanced mode):**
- **Hero Roster & Progression tab** in the Persistent State Dashboard: hero list, level/xp preview, skill trees, death/injury policy, carryover rules
- **XP / reward authoring** on mission outcomes and debrief/intermission choices (award XP, grant item, unlock skill, set hero stat/flag)
- **Hero ability loadout editor** (which unlocked abilities are active in the next mission, if the campaign uses ability slots)
- **Skill tree editor** (graph or list view): prerequisites, costs, descriptions, icon, unlock effects
- **Character presentation override panel** (portrait/icon/voice/skin/marker variants) with "global default" + mission-scoped variants and in-context preview
- **Hero-conditioned graph validation**: warns if a branch requires a hero/skill that can never be obtained on any reachable path

**Scenario Editor integration (mission-level hooks):**
- Trigger actions/modules for common hero-campaign patterns:
  - `Award Hero XP`
  - `Unlock Hero Skill`
  - `Set Hero Flag`
  - `Modify Hero Stat`
  - `Branch on Hero Condition` (level/skill/flag)
- `Hero Spawn` / `Apply Hero Loadout` conveniences that bind a scenario actor to a D021 named character profile
- `Apply Character Presentation Variant` convenience (optional): switch a named character between authored variants (`default`, `disguise`, `winter_ops`, etc.) without changing the underlying gameplay profile
- Preview/test helpers to simulate hero states ("Start with Tanya level 3 + Satchel Charge Mk2")

**Concrete mission example (Tanya AA sabotage → reinforcements → skill-gated infiltration):**

This is a standard D038 scenario using built-in trigger actions/modules (no engine modding, no WASM required for the common case). See `src/modding/campaigns.md` for the full skill tree YAML schema that defines skills like `silent_step` referenced here.

```yaml
# Scenario excerpt (conceptual D038 serialization)
hero_bindings:
  - actor_tag: tanya_spawn
    character_id: tanya
    apply_campaign_profile: true      # loads level/xp/skills/loadout from D021 state

objectives:
  - id: destroy_aa_sites
    type: compound
    children: [aa_north, aa_east, aa_west]
  - id: infiltrate_lab
    hidden: true

triggers:
  - id: aa_sites_disabled
    when:
      objective_completed: destroy_aa_sites
    actions:
      - cinematic_sequence: aa_sabotage_success_pan
      - award_hero_xp:
          hero: tanya
          amount: 150
          reason: aa_sabotage
      - set_hero_flag:
          hero: tanya
          key: aa_positions_cleared
          value: true
      - spawn_reinforcements:
          faction: allies
          group_preset: black_ops_team
          entry_point: south_edge
      - objective_reveal:
          id: infiltrate_lab
      - objective_set_active:
          id: infiltrate_lab
      - dialogue_trigger:
          tree: tanya_aa_success_comm

  - id: lab_side_entrance_interact
    when:
      actor_interacted: lab_side_terminal
    branch:
      if:
        hero_condition:
          hero: tanya
          any_skill: [silent_step, infiltrator_clearance]
      then:
        - open_gate: lab_side_door
        - set_flag: { key: lab_entry_mode, value: stealth }
      else:
        - spawn_patrol: lab_side_response_team
        - set_flag: { key: lab_entry_mode, value: loud }
        - advice_popup: "Tanya needs a stealth skill to bypass this terminal quietly."

debrief_rewards:
  on_outcome: victory
  choices:
    - id: field_upgrade
      label: "Field Upgrade"
      grant_skill_choice_from: [silent_step, satchel_charge_mk2]
    - id: requisition_cache
      label: "Requisition Cache"
      grant_items:
        - { id: remote_detonator_pack, qty: 1 }
```

**Visual-editor equivalent (what the designer sees):**
- `Objective Completed (Destroy AA Sites)` → `Cinematic Sequence` → `Award Hero XP (Tanya, +150)` → `Spawn Reinforcements` → `Reveal Objective: Infiltrate Lab`
- `Interact: Lab Terminal` → `Branch on Hero Condition (Tanya has Silent Step OR Infiltrator Clearance)` → stealth path / loud path
- `Debrief Outcome: Victory` → `Skill Choice or Requisition Cache` (intermission reward panel)

**Intermission support (player-facing):**
- `Hero Sheet` panel/template — portrait, level, stats, abilities, equipment, biography/progression summary
- `Skill Choice` panel/template — choose one unlock from a campaign-defined set, spend points, preview effects
- `Armory + Hero` combined layout presets for RPG-style between-mission management

**Complexity policy (important):**
- Hidden in **Simple mode** by default (hero campaigns are advanced content)
- No hero progression UI appears unless the campaign enables the D021 hero toolkit
- Classic campaigns remain unaffected and as simple as today

**Compatibility / export note (D066):** Hero progression campaigns are often IC-native. Export to RA1/OpenRA may require flattening to flags/carryover stubs or manual rewrites; the SDK surfaces fidelity warnings in Export-Safe mode and Publish Readiness.

#### Campaign Testing

The Campaign Editor includes tools for testing campaign flow without playing every mission to completion:

- **Graph validation** — checks for dead ends (outcomes with no outgoing edge), unreachable missions, circular paths (unless intentional), and missing mission files
- **Jump to mission** — start any mission with simulated campaign state (set flags, roster, and inventory to test a specific path)
- **Fast-forward state** — manually set campaign variables and flags to simulate having played earlier missions
- **Hero state simulation** — set hero levels, skills, equipment, and injury flags for branch testing (hero toolkit campaigns)
- **Path coverage** — highlights which campaign paths have been test-played and which haven't. Color-coded: green (tested), yellow (partially tested), red (untested)
- **Campaign playthrough** — play the entire campaign with accelerated sim (or auto-resolve missions) to verify flow and state propagation
- **State inspector** — during preview, shows live campaign state: current flags, roster, inventory, hero progression state (if enabled), variables, which path was taken

#### Reference Material (Campaign Editors)

The campaign editor design draws from these (in addition to the scenario editor references above):

- **Warcraft III World Editor (2002):** The closest any RTS came to campaign editing — campaign screen with mission ordering, cinematic editor, global variables persistent across maps. Still linear and limited: no visual branching, no roster management, no intermission screen customization. IC takes WC3's foundation and adds the graph, state, and intermission layers.
- **RPG Maker (1992–present):** Campaign-level persistent variables, party management, item/equipment systems, branching dialogue. Proves these systems work for non-programmers. IC adapts the persistence model for RTS context.
- **Twine / Ink (interactive fiction tools):** Visual branching narrative editors. Twine's node-and-edge graph directly inspired IC's campaign graph view. Ink's conditional text ("You remember the bridge{bridge_destroyed: 's destruction| still standing}") inspired IC's variable substitution in dialogue.
- **Heroes of Might and Magic III (1999):** Campaign with carryover — hero stats, army, artifacts persist between maps. Proved that persistent state between RTS-adjacent missions creates investment. Limited to linear ordering.
- **FTL / Slay the Spire (roguelikes):** Randomized mission path selection, persistent resources, risk/reward side missions. Inspired IC's mission pools and weighted random paths.
- **OFP: Resistance (2002):** The gold standard for persistent campaigns — surviving soldiers, captured equipment, emotional investment. Every feature in IC's campaign editor exists because OFP: Resistance proved persistent campaigns are transformative.

### Game Master Mode (Zeus-Inspired)

A real-time scenario manipulation mode where one player (the Game Master) controls the scenario while others play. Derived from the scenario editor's UI but operates on a live game.

**Use cases:**
- **Cooperative campaigns** — a human GM controls the enemy faction, placing reinforcements, directing attacks, adjusting difficulty in real-time based on how players are doing
- **Training** — a GM creates escalating challenges for new players
- **Events** — community game nights with a live GM creating surprises
- **Content testing** — mission designers test their scenarios with real players while making live adjustments

**Game Master controls:**
- Place/remove units and buildings (from a budget — prevents flooding)
- Direct AI unit groups (attack here, retreat, patrol)
- Change weather, time of day
- Trigger scripted events (reinforcements, briefings, explosions)
- Reveal/hide map areas
- Adjust resource levels
- Pause sim for dramatic reveals (if all players agree)

**Not included at launch:** Player control of individual units (RTS is about armies, not individual soldiers). The GM operates at the strategic level — directing groups, managing resources, triggering events.

**Per-player undo:** In multiplayer editing contexts (and Game Master mode specifically), undo is scoped per-actor. The GM's undo reverts only GM actions, not player orders or other players' actions. This follows Garry's Mod's per-player undo model — in a shared session, pressing undo reverts YOUR last action, not the last global action. For the single-player editor, undo is global (only one actor).

**Phase:** Game Master mode is a Phase 6b deliverable. It reuses 90% of the scenario editor's systems — the main new work is the real-time overlay UI and budget/permission system.

### Publishing

Scenarios created in the editor export as standard IC mission format (YAML map + Lua scripts + assets). They can be:
- Saved locally
- Published to Workshop (D030) with one click
- Shared as files
- Used in campaigns (D021) — or created directly in the Campaign Editor
- Assembled into full campaigns and published as campaign packs
- Loaded by the LLM for remixing (D016)

### Replay-to-Scenario Pipeline

Replays are the richest source of gameplay data in any RTS — every order, every battle, every building placement, every dramatic moment. IC already stores replays as deterministic order streams and enriches them with structured gameplay events (D031) in SQLite (D034). The Replay-to-Scenario pipeline turns that data into editable scenarios.

Replays already contain what's hardest to design from scratch: pacing, escalation, and dramatic turning points. The pipeline extracts that structure into an editable scenario skeleton — a designer adds narrative and polish on top.

#### Two Modes: Direct Extraction and LLM Generation

**Direct extraction (no LLM required):** Deterministic, mechanical conversion of replay data into editor entities. This always works, even without an LLM configured.

| Extracted Element        | Source Data                                                | Editor Result                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Map & terrain**        | Replay's initial map state                                 | Full terrain imported — tiles, resources, cliffs, water                                                                                                                                                      |
| **Starting positions**   | Initial unit/building placements per player                | Entities placed with correct faction, position, facing                                                                                                                                                       |
| **Movement paths**       | `OrderIssued` (move orders) over time                      | Waypoints along actual routes taken — patrol paths, attack routes, retreat lines                                                                                                                             |
| **Build order timeline** | `BuildingPlaced` events with tick timestamps               | Building entities with `timer_elapsed` triggers matching the original timing                                                                                                                                 |
| **Combat hotspots**      | Clusters of `CombatEngagement` events in spatial proximity | Named regions at cluster centroids — "Combat Zone 1 (2400, 1800)," "Combat Zone 2 (800, 3200)." The LLM path (below) upgrades these to human-readable names like "Bridge Assault" using map feature context. |
| **Unit composition**     | `UnitCreated` events per faction per time window           | Wave Spawner modules mimicking the original army buildup timing                                                                                                                                              |
| **Key moments**          | Spikes in event density (kills/sec, orders/sec)            | Trigger markers at dramatic moments — editor highlights them in the timeline                                                                                                                                 |
| **Resource flow**        | `HarvestDelivered` events                                  | Resource deposits and harvester assignments matching the original economy                                                                                                                                    |

The result: a scenario skeleton with correct terrain, unit placements, waypoints tracing the actual battle flow, and trigger points at dramatic moments. It's mechanically accurate but has no story — no briefing, no objectives, no dialogue. A designer opens it in the editor and adds narrative on top.

**LLM-powered generation (D016, requires LLM configured):** The LLM reads the gameplay event log and generates the narrative layer that direct extraction can't provide.

| Generated Element     | LLM Input                                             | LLM Output                                                                                  |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Mission briefing**  | Event timeline summary, factions, map name, outcome   | "Commander, intelligence reports enemy armor massing at the river crossing..."              |
| **Objectives**        | Key events + outcome                                  | Primary: "Destroy the enemy base." Secondary: "Capture the tech center before it's razed."  |
| **Dialogue**          | Combat events, faction interactions, dramatic moments | In-mission dialogue triggered at key moments — characters react to what originally happened |
| **Difficulty curve**  | Event density over time, casualty rates               | Wave timing and composition tuned to recreate the original difficulty arc                   |
| **Story context**     | Faction composition, map geography, battle outcome    | Narrative framing that makes the mechanical events feel like a story                        |
| **Named characters**  | High-performing units (most kills, longest survival)  | Surviving units promoted to named characters with generated backstories                     |
| **Alternative paths** | What-if analysis of critical moments                  | Branch points: "What if the bridge assault failed?" → generates alternate mission variant   |

The LLM output is standard YAML + Lua — the same format as hand-crafted missions. Everything is editable in the editor. The LLM is a starting point, not a black box.

#### Workflow

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐     ┌──────────────┐
│   Replay    │────→│  Event Log       │────→│  Replay-to-Scenario │────→│   Scenario   │
│   Browser   │     │  (SQLite, D034)  │     │  Pipeline           │     │   Editor     │
└─────────────┘     └──────────────────┘     │                     │     └──────────────┘
                                             │  Direct extraction  │
                                             │  + LLM (optional)   │
                                             └────────────────────┘
```

1. **Browse replays** — open the replay browser, select a replay (or multiple — a tournament series, a campaign run)
2. **"Create Scenario from Replay"** — button in the replay browser context menu
3. **Import settings dialog:**

| Setting                | Options                                                    | Default              |
| ---------------------- | ---------------------------------------------------------- | -------------------- |
| **Perspective**        | Player 1's view / Player 2's view / Observer (full map)    | Player 1             |
| **Time range**         | Full replay / Custom range (tick start – tick end)         | Full replay          |
| **Extract waypoints**  | All movement / Combat movement only / Key maneuvers only   | Key maneuvers only   |
| **Combat zones**       | Mark all engagements / Major battles only (threshold)      | Major battles only   |
| **Generate narrative** | Yes (requires LLM) / No (direct extraction only)           | Yes if LLM available |
| **Difficulty**         | Match original / Easier / Harder / Let LLM tune            | Match original       |
| **Playable as**        | Player 1's faction / Player 2's faction / New player vs AI | New player vs AI     |

4. **Pipeline runs** — extraction is instant (SQL queries on the event log); LLM generation takes seconds to minutes depending on the provider
5. **Open in editor** — the scenario opens with all extracted/generated content. Everything is editable. The designer adds, removes, or modifies anything before publishing.

#### Perspective Conversion

The key design challenge: a replay is a symmetric record (both sides played). A scenario is asymmetric (the player is one side, the AI is the other). The pipeline handles this conversion:

- **"Playable as Player 1"** — Player 1's units become the player's starting forces. Player 2's units, movements, and build order become AI-controlled entities with waypoints and triggers mimicking the replay behavior.
- **"Playable as Player 2"** — reversed.
- **"New player vs AI"** — the player starts fresh. The AI follows a behavior pattern extracted from the better-performing replay side. The LLM (if available) adjusts difficulty so the mission is winnable but challenging.
- **"Observer (full map)"** — both sides are AI-controlled, recreating the entire battle as a spectacle. Useful for "historical battle" recreations of famous tournament matches.

Initial implementation targets 1v1 replays — perspective conversion maps cleanly to "one player side, one AI side." 2v2 team games work by merging each team's orders into a single AI side. FFA and larger multiplayer replays require per-faction AI assignment and are deferred to a future iteration. Observer mode is player-count-agnostic (all sides are AI-controlled regardless of player count).

#### AI Behavior Extraction

The pipeline converts a player's replay orders into AI modules that approximate the original behavior at the strategic level. The mapping is deterministic — no LLM required.

| Replay Order Type         | AI Module Generated  | Example                                                                         |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| Move orders               | Patrol waypoints     | Unit moved A→B→C → patrol route with 3 waypoints                                |
| Attack-move orders        | Attack-move zones    | Attack-move toward (2400, 1800) → attack-move zone centered on that area        |
| Build orders (structures) | Timed build queue    | Barracks at tick 300, War Factory at tick 600 → build triggers at those offsets |
| Unit production orders    | Wave Spawner timing  | 5 tanks produced ticks 800–1000 → Wave Spawner with matching composition        |
| Harvest orders            | Harvester assignment | 3 harvesters assigned to ore field → harvester waypoints to that resource       |

This isn't "perfectly replicate a human player" — it's "create an AI that does roughly the same thing in roughly the same order." The Probability of Presence system (per-entity randomization) can be applied on top, so replaying the scenario doesn't produce an identical experience every time.

**Crate boundary:** The extraction logic lives in `ic-ai` behind a `ReplayBehaviorExtractor` trait. `ic-editor` calls this trait to generate AI modules from replay data. `ic-game` wires the concrete implementation. This keeps `ic-editor` decoupled from AI internals — the same pattern as sim/net separation.

#### Use Cases

- **"That was an incredible game — let others experience it"** — import your best multiplayer match, add briefing and objectives, publish as a community mission
- **Tournament highlight missions** — import famous tournament replays, let players play from either side. "Can you do better than the champion?"
- **Training scenarios** — import a skilled player's replay, the new player faces an AI that follows the skilled player's build order and attack patterns
- **Campaign from history** — import a series of replays from a ladder season or clan war, LLM generates connecting narrative → instant campaign
- **Modder stress test** — import a replay with 1000+ units to create a performance benchmark scenario
- **Content creation** — streamers import viewer-submitted replays and remix them into challenge missions live

#### Batch Import: Replay Series → Campaign

Multiple replays can be imported as a connected campaign:

1. Select multiple replays (e.g., a best-of-5 tournament series)
2. Pipeline extracts each as a separate mission
3. LLM (if available) generates connecting narrative: briefings that reference previous missions, persistent characters who survive across matches, escalating stakes
4. Campaign graph auto-generated: linear (match order) or branching (win/loss → different next mission)
5. Open in Campaign Editor for refinement

This is the fastest path from "cool replays" to "playable campaign" — and it's entirely powered by existing systems (D016 + D021 + D031 + D034 + D038).

#### What This Does NOT Do

- **Perfectly reproduce a human player's micro** — AI modules approximate human behavior at the strategic level. Precise micro (target switching, spell timing, retreat feints) is not captured. The goal is "similar army, similar timing, similar aggression," not "frame-perfect recreation."
- **Work on corrupted or truncated replays** — the pipeline requires a complete event log. Partial replays produce partial scenarios (with warnings).
- **Replace mission design** — direct extraction produces a mechanical skeleton, not a polished mission. The LLM adds narrative, but a human designer's touch is what makes it feel crafted. The pipeline reduces the work from "start from scratch" to "edit and polish."

**Crate boundary for LLM integration:** `ic-editor` defines a `NarrativeGenerator` trait (input: replay event summary → output: briefing, objectives, dialogue YAML). `ic-llm` implements it. `ic-game` wires the implementation at startup — if no LLM provider is configured, the trait is backed by a no-op that skips narrative generation. `ic-editor` never imports `ic-llm` directly. This mirrors the sim/net separation: the editor knows it *can* request narrative, but has zero knowledge of how it's generated.

**Phase:** Direct extraction ships with the scenario editor in **Phase 6a** (it's just SQL queries + editor import — no new system needed). LLM-powered narrative generation ships in **Phase 7** (requires `ic-llm`). Batch campaign import is a **Phase 7** feature built on D021's campaign graph.

### Reference Material

The scenario editor design draws from:
- **OFP mission editor (2001):** Probability of Presence, triggers with countdown/timeout, Guard/Guarded By, synchronization, Easy/Advanced toggle. The gold standard for "simple, not bloated, not limiting."
- **OFP: Resistance (2002):** Persistent campaign — surviving soldiers, captured equipment, emotional investment. The campaign editor exists because Resistance proved persistent campaigns are transformative.
- **Arma 3 Eden Editor (2016):** 3D placement, modules (154 built-in), compositions, layers, Workshop integration, undo/redo
- **Arma Reforger Game Master (2022):** Budget system, real-time manipulation, controller support, simplified objectives
- **Age of Empires II Scenario Editor (1999):** Condition-effect trigger system (the RTS gold standard — 25+ years of community use), trigger areas as spatial logic. Cautionary lesson: flat trigger list collapses at scale — IC adds folders, search, and flow graph to prevent this.
- **StarCraft Campaign Editor / SCMDraft (1998+):** Named locations (spatial regions referenced by name across triggers). The "location" concept directly inspired IC's Named Regions. Also: open file format enabled community editors — validates IC's YAML approach.
- **Warcraft III World Editor:** GUI-based triggers with conditions, actions, and variables. IC's module system and Variables Panel serve the same role.
- **TimeSplitters 2/3 MapMaker (2002/2005):** Visible memory/complexity budget bar — always know what you can afford. Inspired IC's Scenario Complexity Meter.
- **Super Mario Maker (2015/2019):** Element interactions create depth without parameter bloat. Behaviors emerge from spatial arrangement. Instant build-test loop measured in seconds.
- **LittleBigPlanet 2 (2011):** Pre-packaged logic modules (drop-in game patterns). Directly inspired IC's module system. Cautionary lesson: server shutdown destroyed 10M+ creations — content survival is non-negotiable (IC uses local-first storage + Workshop export).
- **RPG Maker (1992–present):** Tiered complexity architecture (visual events → scripting). Validates IC's Simple → Advanced → Lua progression.
- **Halo Forge (2007–present):** In-game real-time editing with instant playtesting. Evolution from minimal (Halo 3) to powerful (Infinite) proves: ship simple, grow over iterations. Also: game mode prefabs (Strongholds, CTF) that designers customize — directly inspired IC's Game Mode Templates.
- **Far Cry 2 Map Editor (2008):** Terrain sculpting separated from mission logic. Proves environment creation and scenario scripting can be independent workflows.
- **Divinity: Original Sin 2 (2017):** Co-op campaign with persistent state, per-player dialogue choices that affect the shared story. Game Master mode with real-time scenario manipulation. Proved co-op campaign RPG works — and that the tooling for CREATING co-op content matters as much as the runtime support.
- **Doom community editors (1994–present):** Open data formats enable 30+ years of community tools. The WAD format's openness is why Doom modding exists — validates IC's YAML-based scenario format.
- **OpenRA map editor:** Terrain painting, resource placement, actor placement — standalone tool. IC improves by integrating a full creative toolchain in the SDK (scenario editor + asset studio + campaign editor)
- **Garry's Mod (2006–present):** Spawn menu UX (search/favorites/recents for large asset libraries) directly inspired IC's Entity Palette. Duplication system (save/share/browse entity groups) validates IC's Compositions. Per-player undo in multiplayer sessions informed IC's Game Master undo scoping. Community-built tools (Wire Mod, Expression 2) that became indistinguishable from first-party tools proved that a clean tool API matters more than shipping every tool yourself — directly inspired IC's Workshop-distributed editor plugins. Sandbox mode as the default creative environment validated IC's Sandbox template as the editor's default preview mode. Cautionary lesson: unrestricted Lua access enabled the Glue Library incident (malicious addon update) — reinforces IC's sandboxed Lua model (D004) and Workshop supply chain defenses (D030, `06-SECURITY.md` § Vulnerability 18)

### Multiplayer & Co-op Scenario Tools

Most RTS editors treat multiplayer as an afterthought — place some spawn points, done. Creating a proper co-op mission, a team scenario with split objectives, or a campaign playable by two friends requires hacking around the editor's single-player assumptions. IC's editor treats multiplayer and co-op as first-class authoring targets.

#### Player Slot Configuration

Every scenario has a **Player Slots panel** — the central hub for multiplayer setup.

| Property           | Description                                                                      |
| ------------------ | -------------------------------------------------------------------------------- |
| **Slot count**     | Number of human player slots (1–8). Solo missions = 1. Co-op = 2+.               |
| **Faction**        | Which faction each slot controls (or "any" for lobby selection)                  |
| **Team**           | Team assignment (Team 1, Team 2, FFA, Configurable in lobby)                     |
| **Spawn area**     | Starting position/area per slot                                                  |
| **Starting units** | Pre-placed entities assigned to this slot                                        |
| **Color**          | Default color (overridable in lobby)                                             |
| **AI fallback**    | What happens if this slot is unfilled: AI takes over, slot disabled, or required |

The designer places entities and assigns them to player slots via the Attributes Panel — a dropdown says "belongs to Player 1 / Player 2 / Player 3 / Any." Triggers and objectives can be scoped to specific slots or shared.

#### Co-op Mission Modes

The editor supports several co-op configurations. These are set per-mission in the scenario properties:

| Mode                 | Description                                                                                               | Example                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Allied Factions**  | Each player controls a separate allied faction with their own base, army, and economy                     | Player 1: Allies infantry push. Player 2: Soviet armor support.       |
| **Shared Command**   | Players share a single faction. Units can be assigned to specific players or freely controlled by anyone. | One player manages economy/production, the other commands the army.   |
| **Commander + Ops**  | One player has the base and production (Commander), the other controls field units only (Operations).     | Commander builds and sends reinforcements. Ops does all the fighting. |
| **Asymmetric**       | Players have fundamentally different gameplay. One does RTS, the other does Game Master or support roles. | Player 1 plays the mission. Player 2 controls enemy as GM.            |
| **Split Objectives** | Players have different objectives on the same map. Both must succeed for mission victory.                 | Player 1: capture the bridge. Player 2: defend the base.              |

#### Asymmetric Commander + Field Ops Toolkit (D070)

D070 formalizes a specific IC-native asymmetric co-op pattern: **Commander & Field Ops**. In D038, this is implemented as a **template + authoring toolkit**, not a hardcoded engine mode.

**Scenario authoring surfaces (v1 requirements):**
- **Role Slot editor** — configure role slots (`Commander`, `FieldOps`, future `CounterOps`/`Observer`) with min/max player counts, UI profile hints, and communication preset links
- **Control Scope painter** — assign ownership/control scopes for structures, factories, squads, and scripted attachments (who commands what by default)
- **Objective Channels** — mark objectives as `Strategic`, `Field`, `Joint`, or `Hidden` with visibility/completion-credit per role
- **SpecOps Task Catalog presets** — authoring shortcuts/templates for common D070 side-mission categories (economy raid, power sabotage, tech theft, expansion-site clear, superweapon delay, route control, VIP rescue, recon designation)
- **Support Catalog + Requisition Rules** — define requestable support actions (CAS/recon/reinforcements/extraction), costs, cooldowns, prerequisites, and UI labels
- **Operational Momentum / Agenda Board editor (optional)** — define agenda lanes (e.g., economy/power/intel/command-network/superweapon denial), milestones/rewards, and optional extraction-vs-stay prompts for "one more phase" pacing
- **Request/Response Preview Simulation** — in Preview/Test, simulate Field Ops requests and Commander responses to verify timing, cooldown, duplicate-request collapse, and objective wiring without a second human player
- **Portal Ops integration** — reuse D038 `Sub-Scenario Portal` authoring for optional infiltration micro-ops; portal return outcomes can feed Commander/Field/Joint objectives

**Validation profile (D070-aware) checks:**
- no role idle-start (both roles have meaningful actions in the first ~90s)
- joint objectives are reachable and have explicit role contributions
- every request type referenced by objectives maps to at least one satisfiable commander action path
- request/reward definitions specify a meaningful war-effort outcome category (economy/power/tech/map-state/timing/intel)
- commander support catalog has valid budget/cooldown definitions
- request spam controls are configured (duplicate collapse or cooldown rule) for missions with repeatable support asks
- if Operational Momentum is enabled, each agenda milestone declares explicit rewards and role visibility
- agenda foreground/timer limits are configured (or safe defaults apply) to avoid HUD overload warnings
- portal return outcomes are wired (success/fail/timeout)
- role communication mappings exist (D059/D065 integration)

**Scope boundary (v1):** D038 supports **same-map asymmetric co-op** and optional portal micro-ops using the existing `Sub-Scenario Portal` pattern. True concurrent nested sub-map runtime instances remain deferred (D070).

**Pacing guardrail (optional layer):** Operational Momentum / "one more phase" is an **optional template/preset-level pacing system** for D070 scenarios. It must not become a mandatory overlay on all asymmetric missions or a hidden source of unreadable timer spam.

#### D070-adjacent Commander Avatar / Assassination / Presence authoring (TA-style variants)

D070's adjacent **Commander Avatar** mode family (Assassination / Commander Presence / hybrid presets) should be exposed as template/preset-level authoring in D038, not as hidden Lua-only patterns.

**Authoring surfaces (preset extensions):**
- **Commander Avatar panel** — select the commander avatar unit/archetype, death policy (`ImmediateDefeat`, `DownedRescueTimer`, etc.), and warning/UI labels
- **Commander Presence profile** — define soft influence bonuses (radius, falloff, effect type, command-network prerequisites)
- **Command Network objectives** — tag comm towers/uplinks/relays and wire them to support quality, presence bonuses, or commander ability unlocks
- **Commander + SpecOps combo preset** — bind commander avatar rules to D070 role slots so the Commander role owns the avatar and the SpecOps role can support/protect it
- **Rescue Bootstrap pattern preset** (campaign-friendly) — starter trigger/objective wiring for "commander missing/captured -> rescue -> unlock command/building/support"

**Validation checks (v1):**
- commander defeat/death policy is explicitly configured and visible in briefing/lobby metadata
- commander avatar spawn is not trivially exposed without authored counterplay (warning, not hard fail)
- presence bonuses are soft effects by default (warn on hard control-denial patterns in v1 templates)
- command-network dependencies are wired (no orphan "requires network" rules)
- rescue-bootstrap unlocks show explicit UI/objective messaging when command/building becomes available

#### D070 Experimental Survival Variant Reuse (`Last Commando Standing` / `SpecOps Survival`)

D070's experimental SpecOps-focused last-team-standing variant (see D070 "Last Commando Standing / SpecOps Survival") is **not** the same asymmetric Commander/Field Ops mode, but it reuses part of the same toolkit:

- **SpecOps Task Catalog presets** for meaningful side-objectives (economy/power/tech/route/intel)
- **Field progression + requisition authoring** (session-local upgrades/supports)
- **Objective Channel** visibility patterns (often `Field` + `Hidden`, sometimes `Joint` for team variants)
- **Request/response preview** if the survival scenario includes limited support actions

Additional authoring presets for this experimental variant should be template-driven and optional:
- **Hazard Contraction Profiles** (radiation storm, artillery saturation, chrono distortion, firestorm/gas spread) with warning telegraphs and phase timing
- **Neutral Objective Clusters** (cache depots, power relays, tech uplinks, bridge controls, extraction points)
- **Elimination / Spectate / Redeploy policies** (prototype-specific and scenario-controlled)

**Scope boundary:** D038 should expose this as a **prototype-first template preset**, not a promise of a ranked-ready or large-scale battle-royale system.

#### Per-Player Objectives & Triggers

The key to good co-op missions: players need their own goals, not just shared ones.

- **Objective assignment** — each objective module has a "Player" dropdown: All Players, Player 1, Player 2, etc. Shared objectives require all assigned players to contribute. Per-player objectives belong to one player.
- **Trigger scoping** — triggers can fire based on a specific player's actions: "When Player 2's units enter this region" vs "When any allied unit enters this region." The trigger's faction/player filter handles this.
- **Per-player briefings** — the briefing module supports per-slot text: Player 1 sees "Commander, your objective is the bridge..." while Player 2 sees "Comrade, you will hold the flank..."
- **Split victory conditions** — the mission can require ALL players to complete their individual objectives, or ANY player, or a custom Lua condition combining them.

#### Co-op Campaigns

Co-op extends beyond individual missions into campaigns (D021). The Campaign Editor supports multi-player campaigns with these additional properties per mission node:

| Property          | Description                                                                      |
| ----------------- | -------------------------------------------------------------------------------- |
| **Player count**  | Min and max human players for this mission (1 for solo-compatible, 2+ for co-op) |
| **Co-op mode**    | Which mode applies (see table above)                                             |
| **Solo fallback** | How the mission plays if solo: AI ally, simplified objectives, or unavailable    |

**Shared roster management:** In persistent campaigns, the carried-forward roster is shared between co-op players. The intermission screen shows the combined roster with options for dividing control:

- **Draft** — players take turns picking units from the survivor pool (fantasy football for tanks)
- **Split by type** — infantry to Player 1, vehicles to Player 2 (configured by the scenario designer)
- **Free claim** — each player grabs what they want from the shared pool, first come first served
- **Designer-assigned** — the mission YAML specifies which named characters belong to which player slot

**Drop-in / drop-out:** If a co-op player disconnects mid-mission, their units revert to AI control (or a configurable fallback: pause, auto-extract, or continue without). Reconnection restores control.

#### Multiplayer Testing

Testing multiplayer scenarios is painful in every editor — you normally need to launch two game instances and play both yourself. IC reduces this friction:

- **Multi-slot preview** — preview the mission with AI controlling unfilled player slots. Test your co-op triggers and per-player objectives without needing a real partner.
- **Slot switching** — during preview, hot-switch between player viewpoints to verify each player's experience (camera, fog of war, objectives).
- **Network delay simulation** — preview with configurable artificial latency to catch timing-sensitive trigger issues in multiplayer.
- **Lobby preview** — see how the mission appears in the multiplayer lobby before publishing: slot configuration, team layout, map preview, description.

### Game Mode Templates

Almost every popular RTS game mode can be built with IC's existing module system + triggers + Lua. But discoverability matters — a modder shouldn't need to reinvent the Survival mode from scratch when the pattern is well-known.

**Game Mode Templates** are pre-configured scenario setups: a starting point with the right modules, triggers, variables, and victory conditions already wired. The designer customizes the specifics (which units, which map, which waves) without building the infrastructure.

**Built-in templates:**

| Template                | Inspired By                     | What's Pre-Configured                                                                                                            |
| ----------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Skirmish (Standard)** | Every RTS                       | Spawn points, tech tree, resource deposits, standard victory conditions (destroy all enemy buildings)                            |
| **Survival / Horde**    | They Are Billions, CoD Zombies  | Wave Spawners with escalation, base defense zone, wave counter variable, survival timer, difficulty scaling per wave             |
| **King of the Hill**    | FPS/RTS variants                | Central capture zone, scoreboard tracking cumulative hold time per faction, configurable score-to-win                            |
| **Regicide**            | AoE2                            | King/Commander unit per player (named character, must-survive), kill the king = victory, king abilities optional                 |
| **Treaty**              | AoE2                            | No-combat timer (configurable), force peace during treaty, countdown display, auto-reveal on treaty end                          |
| **Nomad**               | AoE2                            | No starting base — each player gets only an MCV (or equivalent). Random spawn positions. Land grab gameplay.                     |
| **Empire Wars**         | AoE2 DE                         | Pre-built base per player (configurable: small/medium/large), starting army, skip early game                                     |
| **Assassination**       | StarCraft UMS, Total Annihilation commander tension | Commander avatar unit per player (powerful but fragile), protect yours, kill theirs. Commander death = defeat (or authored downed timer). Optional D070-adjacent **Commander Presence** soft-bonus profile and command-network objective hooks. |
| **Tower Defense**       | Desktop TD, custom WC3 maps     | Pre-defined enemy paths (waypoints), restricted build zones, economy from kills, wave system with boss rounds                    |
| **Tug of War**          | WC3 custom maps                 | Automated unit spawning on timer, player controls upgrades/abilities/composition. Push the enemy back.                           |
| **Base Defense**        | They Are Billions, C&C missions | Defend a position for N minutes/waves. Pre-placed base, incoming attacks from multiple directions, escalating difficulty.        |
| **Capture the Flag**    | FPS tradition                   | Each player has a flag entity (or MCV). Steal the opponent's and return it to your base. Combines economy + raiding.             |
| **Free for All**        | Every RTS                       | 3+ players, no alliances allowed. Last player standing. Diplomacy module optional (alliances that can be broken).                |
| **Diplomacy**           | Civilization, AoE4              | FFA with dynamic alliance system. Players can propose/accept/break alliances. Shared vision opt-in. Betrayal is a game mechanic. |
| **Sandbox**             | Garry's Mod, Minecraft Creative | Unlimited resources, no enemies, no victory condition. Pure building and experimentation. Good for testing and screenshots.      |
| **Co-op Survival**      | Deep Rock Galactic, Helldivers  | Multiple human players vs escalating AI waves. Shared base. Team objectives. Difficulty scales with player count.                |
| **Commander & Field Ops Co-op** *(player-facing: "Commander & SpecOps")* | Savage, Natural Selection (role asymmetry lesson) | Commander role slot + Field Ops slot(s), split control scopes, strategic/field/joint objective channels, SpecOps task catalog presets, support request/requisition flows, request-status UI hooks, optional portal micro-op wiring. |
| **Last Commando Standing** *(experimental, D070-adjacent / player-facing alt: "SpecOps Survival")* | RTS commando survival + battle-royale-style tension | Commando-led squad per player/team, neutral objective clusters, hazard contraction phase presets (RA-themed), match-based field upgrades/requisition, elimination/spectate/redeploy policy hooks, short-round prototype tuning. |
| **Sudden Death**        | Various                         | No rebuilding — if a building is destroyed, it's gone. Every engagement is high-stakes. Smaller starting armies.                 |

**Templates are starting points, not constraints.** Open a template, add your own triggers/modules/Lua, publish to Workshop. Templates save 30–60 minutes of boilerplate setup and ensure the core game mode logic is correct.

**Phasing:** Not all templates ship simultaneously. **Phase 6b core set** (8 templates): Skirmish, Survival/Horde, King of the Hill, Regicide, Free for All, Co-op Survival, Sandbox, Base Defense — these cover the most common community needs and validate the template system. **Phase 7 / community-contributed** (remaining classic templates): Treaty, Nomad, Empire Wars, Assassination, Tower Defense, Tug of War, Capture the Flag, Diplomacy, Sudden Death. **D070 Commander & Field Ops Co-op** follows a separate path: prototype/playtest validation first, then promotion to a built-in IC-native template once role-clarity and communication UX are proven. The D070-adjacent **Commander Avatar / Assassination + Commander Presence** presets should ship only after the anti-snipe/readability guardrails and soft-presence tuning are playtested. The D070-adjacent **Last Commando Standing / SpecOps Survival** variant is even more experimental: prototype-first and community/Workshop-friendly before any first-party promotion. Scope to what you have (Principle #6); don't ship flashy asymmetric/survival variants before the tooling, onboarding, and playtest evidence are actually good.

**Custom game mode templates:** Modders can create new templates and publish them to Workshop (D030). A "Zombie Survival" template, a "MOBA Lanes" template, a "RPG Quest Hub" template — the community extends the library indefinitely. Templates use the same composition + module + trigger format as everything else.

**Community tools > first-party completeness.** Garry's Mod shipped ~25 built-in tools; the community built hundreds more that matched or exceeded first-party quality — because the tool API was clean enough that addon authors could. The same philosophy applies here: ship 8 excellent templates, make the authoring format so clean that community templates are indistinguishable from built-in ones, and let Workshop do the rest. The limiting factor should be community imagination, not API complexity.

**Sandbox as default preview.** The Sandbox template (unlimited resources, no enemies, no victory condition) doubles as the default environment when the editor's Preview button is pressed without a specific scenario loaded. This follows Garry's Mod's lesson: sandbox mode is how people **learn the tools** before making real content. A zero-pressure environment where every entity and module can be tested without mission constraints.

**Templates + Co-op:** Several templates have natural co-op variants. Co-op Survival is explicit, but most templates work with 2+ players if the designer adds co-op spawn points and per-player objectives.

### Workshop-Distributed Editor Plugins

Garry's Mod's most powerful pattern: community-created tools appear alongside built-in tools in the same menu. The community doesn't just create content — they **extend the creation tools themselves.** Wire Mod and Expression 2 are the canonical examples: community-built systems that became essential editor infrastructure, indistinguishable from first-party tools.

IC supports this explicitly. Workshop-published packages can contain:

| Plugin Type             | What It Adds                                                            | Example                                                     |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Custom modules**      | New entries in the Modules panel (YAML definition + Lua implementation) | "Convoy System" module — defines waypoints + spawn + escort |
| **Custom triggers**     | New trigger condition/action types                                      | "Music trigger" — plays specific track on activation        |
| **Compositions**        | Pre-built reusable entity groups (see Compositions section)             | "Tournament 1v1 Start" — balanced spawn with resources      |
| **Game mode templates** | Complete game mode setups (see Game Mode Templates section)             | "MOBA Lanes" — 3-lane auto-spawner with towers and heroes   |
| **Editor tools**        | New editing tools and panels (Lua-based UI extensions, Phase 7)         | "Formation Arranger" — visual grid formation editor tool    |
| **Terrain brushes**     | Custom terrain painting presets                                         | "River Painter" — places water + bank tiles + bridge snaps  |

All plugin types use the tiered modding system (invariant #3): YAML for data definitions, Lua for logic, WASM for complex tools. Plugins are sandboxed — an editor plugin cannot access the filesystem, network, or sim internals beyond the editor's public API. They install via Workshop like any other resource and appear in the editor's palettes automatically.

This aligns with philosophy principle #19 ("Build for surprise — expose primitives, not just parameterized behaviors"): the module/trigger/composition system is powerful enough that community extensions can create things the engine developers never imagined.

**Phase:** Custom modules and compositions are publishable from Phase 6a (they use the existing YAML + Lua format). Custom editor tools (Lua-based UI extensions) are a Phase 7 capability that depends on the editor's Lua plugin API.

### Editor Onboarding for Veterans

The IC editor's concepts — triggers, waypoints, entities, layers — aren't new. They're the same ideas that OFP, AoE2, StarCraft, and WC3 editors have used for decades. But each editor uses different names, different hotkeys, and different workflows. A 20-year AoE2 scenario editor veteran has deep muscle memory that IC shouldn't fight — it should channel.

**"Coming From" profile (first-launch):**

When the editor opens for the first time, a non-blocking welcome panel asks: "Which editor are you most familiar with?" Options:

| Profile             | Sets Default Keybindings | Sets Terminology Hints | Sets Tutorial Path                       |
| ------------------- | ------------------------ | ---------------------- | ---------------------------------------- |
| **New to editing**  | IC Default               | IC terms only          | Full guided tour, start with Simple mode |
| **OFP / Eden**      | F1–F7 mode switching     | OFP equivalents shown  | Skip basics, focus on RTS differences    |
| **AoE2**            | AoE2 trigger workflow    | AoE2 equivalents shown | Skip triggers, focus on Lua + modules    |
| **StarCraft / WC3** | WC3 trigger shortcuts    | Location→Region, etc.  | Skip locations, focus on compositions    |
| **Other / Skip**    | IC Default               | No hints               | Condensed overview                       |

This is a **one-time suggestion, not a lock-in.** Profile can be changed anytime in settings. All it does is set initial keybindings and toggle contextual hints.

**Customizable keybinding presets:**

Full key remapping with shipped presets:

```
IC Default   — Tab cycles modes, 1-9 entity selection, Space preview
OFP Classic  — F1-F7 modes, Enter properties, Space preview
Eden Modern  — Ctrl+1-7 modes, double-click properties, P preview
AoE2 Style   — T triggers, U units, R resources, Ctrl+C copy trigger
WC3 Style    — Ctrl+T trigger editor, Ctrl+B triggers browser
```

Not just hotkeys — mode switching behavior and right-click context menus adapt to the profile. OFP veterans expect right-click on empty ground to deselect; AoE2 veterans expect right-click to open a context menu.

**Terminology Rosetta Stone:**

A toggleable panel (or contextual tooltips) that maps IC terms to familiar ones:

| IC Term                 | OFP / Eden              | AoE2                         | StarCraft / WC3         |
| ----------------------- | ----------------------- | ---------------------------- | ----------------------- |
| Region                  | Trigger (area-only)     | Trigger Area                 | Location                |
| Module                  | Module                  | Looping Trigger Pattern      | GUI Trigger Template    |
| Composition             | Composition             | (Copy-paste group)           | Template                |
| Variables Panel         | (setVariable in SQF)    | (Invisible unit on map edge) | Deaths counter / Switch |
| Inline Script           | Init field (SQF)        | —                            | Custom Script           |
| Connection              | Synchronize             | —                            | —                       |
| Layer                   | Layer                   | —                            | —                       |
| Probability of Presence | Probability of Presence | —                            | —                       |
| Named Character         | Playable unit           | Named hero (scenario)        | Named hero              |

Displayed as **tooltips on hover** — when an AoE2 veteran hovers over "Region" in the UI, a tiny tooltip says "AoE2: Trigger Area." Not blocking, not patronizing, just a quick orientation aid. Tooltips disappear after the first few uses (configurable).

**Interactive migration cheat sheets:**

Context-sensitive help that recognizes familiar patterns:

- Designer opens Variables Panel → tip: "In AoE2, you might have used invisible units placed off-screen as variables. IC has native variables — no workarounds needed."
- Designer creates first trigger → tip: "In OFP, triggers were areas on the map. IC triggers work the same way, but you can also use Regions for reusable areas across multiple triggers."
- Designer writes first Lua line → tip: "Coming from SQF? Here's a quick Lua comparison: `_myVar = 5` → `local myVar = 5`. `hint \"hello\"` → `Game.message(\"hello\")`. Full cheat sheet: Help → SQF to Lua."

These only appear once per concept. They're dismissable and disable-all with one toggle. They're not tutorials — they're translation aids.

**Scenario import (partial):**

Full import of complex scenarios from other engines is unrealistic — but partial import of the most tedious-to-recreate elements saves real time:

- **AoE2 trigger import** — parse AoE2 scenario trigger data, convert condition→effect pairs to IC triggers + modules. Not all triggers translate, but simple ones (timer, area detection, unit death) map cleanly.
- **StarCraft trigger import** — parse StarCraft triggers, convert locations to IC Regions, convert trigger conditions/actions to IC equivalents.
- **OFP mission.sqm import** — parse entity placements, trigger positions, and waypoint connections. SQF init scripts flag as "needs Lua conversion" but the spatial layout transfers.
- **OpenRA .oramap entities** — already supported by the asset pipeline (D025/D026). Editor imports the map and entity placement directly.

Import is always **best-effort** with clear reporting: "Imported 47 of 52 triggers. 5 triggers used features without IC equivalents — see import log." Better to import 90% and fix 10% than to recreate 100% from scratch.

**The 30-minute goal:** A veteran editor from ANY background should feel productive within 30 minutes. Not expert — productive. They recognize familiar concepts wearing new names, their muscle memory partially transfers via keybinding presets, and the migration cheat sheet fills the gaps. The learning curve is a gentle slope, not a cliff.

### Embedded Authoring Manual & Context Help (D038 + D037 Knowledge Base Integration)

Powerful editors fail if users cannot discover what each flag, parameter, trigger action, module field, and script hook actually does. IC should ship an **embedded authoring manual** in the SDK, backed by the same D037 knowledge base content (no duplicate documentation system).

**Design goals:**
- **"What is possible?" discoverability** for advanced creators (OFP/ArmA-style reference depth)
- **Fast, contextual answers** without leaving the editor
- **Single source of truth** shared between web docs and SDK embedded help
- **Version-correct documentation** for the SDK version/project schema the creator is using

**Required SDK help surfaces:**
- **Global Documentation Browser** (`Help` / SDK Start Screen → `Documentation`)
  - searchable by term, alias, and old-engine vocabulary ("trigger area", "waypoint", "SQF equivalent", "OpenRA trait alias")
  - filters by domain (`Scenario Editor`, `Campaign Editor`, `Asset Studio`, `Lua`, `WASM`, `CLI`, `Export`)
- **Context Help (`F1`)**
  - opens the exact docs page/anchor for the selected field, module, trigger condition/action, command, or warning
- **Inline `?` tooltips / "What is this?"**
  - concise summary + constraints + defaults + "Open full docs"
- **Examples panel**
  - short snippets (YAML/Lua) and common usage patterns linked from the current feature

**Documentation coverage (authoring-focused):**
- every editor-exposed parameter/field: meaning, type, accepted values, default, range, side effects
- every trigger condition/action and module field
- every script command/API function (Lua, later WASM host calls)
- every CLI command/flag relevant to creator workflows (`ic mod`, `ic export`, validation, migration)
- export-safe / fidelity notes where a feature is IC-native or partially mappable (D066)
- deprecation/migration notes (`since`, `deprecated`, replacement)

**Generation/source model (same source as D037 knowledge base):**
- Reference pages are generated from schema + API metadata where possible
- Hand-written pages/cookbook entries provide rationale, recipes, and examples
- SDK embeds a versioned offline snapshot and can optionally open/update from the online docs
- SDK docs and web docs must not drift — they are different **views** of the same content set

**Editor metadata requirement (feeds docs + inline UX):**
- D038 module/trigger/field definitions should carry doc metadata (`summary`, `description`, constraints, examples, deprecation notes)
- Validation errors and warnings should link back to the same documentation anchors for fixes
- The same metadata should be available to future editor assistant features (D057) for grounded help

**UX guardrail:** Help must stay **non-blocking**. The editor should never force modal documentation before editing. Inline hints + F1 + searchable browser are the default pattern.

### Local Content Overlay & Dev Profile Run Mode (D020/D062 Integration)

Creators should be able to test local scenarios/mod content through the **real game runtime flow** without packaging or publishing on every iteration. The SDK should expose this as a first-class workflow rather than forcing a package/install loop.

**Principle: one runtime, two content-resolution contexts**
- The SDK does **not** launch a fake "editor-only runtime."
- `Play in Game` / `Run Local Content` launches the normal `ic-game` runtime path with a **local development profile / overlay** (D020 + D062).
- This keeps testing realistic (menus, loading, runtime init, D069 setup interactions where applicable) and avoids "works in preview, breaks in game" drift.

**Required workflow behavior:**
- **One-click local playtest from SDK** for the current scenario/campaign/mod context
- **Local overlay precedence** for the active project/session only (local files override installed content for that session)
- **Clear indicators** in the launched game and SDK session ("Local Content Overlay Active", profile name/source)
- **Optional hot-reload handoff** for YAML/Lua-friendly changes where supported (integrates with D020 `ic mod watch`)
- **No packaging/publish requirement** before local testing
- **No silent mutation** of installed Workshop packages or shared profiles

**Relation to existing D038 surfaces:**
- `Preview` remains the fastest in-editor loop
- `Test` / `Play in Game` uses the real runtime path with the local dev overlay
- `Validate` and `Publish` remain explicit downstream steps (Git-first and Publish Readiness rules unchanged)

**UX guardrail:** This workflow is a DX acceleration feature, not a new content source model. It must remain consistent with D062 profile/fingerprint boundaries and multiplayer compatibility rules (local dev overlays are local and non-canonical until packaged/published).

### Migration Workbench (SDK UI over `ic mod migrate`)

IC already commits to migration scripts and deprecation warnings at the CLI/API layer (see `04-MODDING.md` § "Mod API Stability & Compatibility"). The SDK adds a **Migration Workbench** as a visual wrapper over that same migration engine — not a second migration system.

**Phase 6a (read-only, low-friction):**
- **Upgrade Project** action on the SDK start screen and project menu
- **Deprecation dashboard** aggregating warnings from `ic mod check` / schema deprecations / editor file format deprecations
- **Migration preview** showing what `ic mod migrate` would change (read-only diff/report)
- **Report export** for code review or team handoff

**Phase 6b (apply mode):**
- Apply migration from the SDK using the same backend as the CLI
- Automatic rollback snapshot before apply
- Prompt to run `Validate` after migration
- Prompt to re-check export compatibility (OpenRA/RA1) if export-safe mode is enabled

The default SDK flow remains unchanged for casual creators. If a project opens cleanly, the Migration Workbench stays out of the way.

### Controller & Steam Deck Support

Steam Deck is a target platform (Invariant #10), so the editor must be usable without mouse+keyboard — but it doesn't need to be *equally* powerful. The approach: full functionality on mouse+keyboard, comfortable core workflows on controller.

- **Controller input mapping:** Left stick for cursor movement (with adjustable acceleration), right stick for camera pan/zoom. D-pad cycles editing modes. Face buttons: place (A), delete (B), properties panel (X), context menu (Y). Triggers: undo (LT), redo (RT). Bumpers: cycle selected entity type
- **Radial menus** — controller-optimized selection wheels for entity types, trigger types, and module categories (replacing mouse-dependent dropdowns)
- **Snap-to-grid** — always active on controller (optional on mouse) to compensate for lower cursor precision
- **Touch input (Steam Deck / mobile):** Tap to place, pinch to zoom, two-finger drag to pan. Long press for properties panel. Touch works as a complement to controller, not a replacement for mouse
- **Scope:** Core editing (terrain, entity placement, triggers, waypoints, modules, preview) is controller-compatible at launch. Advanced features (inline Lua editing, campaign graph wiring, dialogue tree authoring) require keyboard and are flagged in the UI: "Connect a keyboard for this feature." This is the same trade-off Eden Editor made — and Steam Deck has a built-in keyboard for occasional text entry

**Phase:** Controller input for the editor ships with Phase 6a. Touch input is Phase 7.

### Accessibility

The editor's "accessibility through layered complexity" principle applies to disability access, not just skill tiers. These features ensure the editor is usable by the widest possible audience.

**Visual accessibility:**
- **Colorblind modes** — all color-coded elements (trigger folders, layer colors, region colors, connection lines, complexity meter) use a palette designed for deuteranopia, protanopia, and tritanopia. In addition to color, elements use distinct **shapes and patterns** (dashed vs solid lines, different node shapes) so color is never the only differentiator
- **High contrast mode** — editor UI switches to high-contrast theme with stronger borders and larger text. Toggle in editor settings
- **Scalable UI** — all editor panels respect the game's global UI scale setting (50%–200%). Editor-specific elements (attribute labels, trigger text, node labels) scale independently if needed
- **Zoom and magnification** — the isometric viewport supports arbitrary zoom levels. Combined with UI scaling, users with low vision can work at comfortable magnification

**Motor accessibility:**
- **Full keyboard navigation** — every editor operation is reachable via keyboard. Tab cycles panels, arrow keys navigate within panels, Enter confirms, Escape cancels. No operation requires mouse-only gestures
- **Adjustable click timing** — double-click speed and drag thresholds are configurable for users with reduced dexterity
- **Sticky modes** — editing modes (terrain, entity, trigger) stay active until explicitly switched, rather than requiring held modifier keys

**Cognitive accessibility:**
- **Simple/Advanced mode** (already designed) is the primary cognitive accessibility feature — it reduces the number of visible options from 30+ to ~10
- **Consistent layout** — panels don't rearrange based on context. The attributes panel is always on the right, the mode selector always on the left. Predictable layout reduces cognitive load
- **Tooltips with examples** — every field in the attributes panel has a tooltip with a concrete example, not just a description. "Probability of Presence: 75" → tooltip: "75% chance this unit exists when the mission starts. Example: set to 50 for a coin-flip ambush."

**Phase:** Colorblind modes, UI scaling, and keyboard navigation ship with Phase 6a. High contrast mode and motor accessibility refinements ship in Phase 6b–7.

> **Note:** The accessibility features above cover the **editor** UI. **Game-level accessibility** — colorblind faction colors, minimap palettes, resource differentiation, screen reader support for menus, subtitle options for EVA/briefings, and remappable controls — is a separate concern that applies to `ic-render` and `ic-ui`, not `ic-editor`. Game accessibility ships in Phase 7 (see `08-ROADMAP.md`).

### Alternatives Considered

1. **In-game editor (original design, revised by D040):** The original D038 design embedded the editor inside the game binary. Revised to SDK-separate architecture — players shouldn't see creator tools. The SDK still reuses the same Bevy rendering and sim crates, so there's no loss of live preview capability. See D040 § SDK Architecture for the full rationale.
2. **Text-only editing (YAML + Lua):** Already supported for power users and LLM generation. The visual editor is the accessibility layer on top of the same data format.
3. **Node-based visual scripting (like Unreal Blueprints):** Too complex for the casual audience. Modules + triggers cover the sweet spot. Advanced users write Lua directly. A node editor is a potential Phase 7+ community contribution.
4. **LLM as editor assistant (structured tool-calling):** Not an alternative — a complementary layer. See D016 § "LLM-Callable Editor Tool Bindings" for the Phase 7 design that exposes editor operations as LLM-invokable tools. The editor command registry (Phase 6a) should be designed with this future integration in mind.

**Phase:** Core scenario editor (terrain + entities + triggers + waypoints + modules + compositions + preview + autosave + controller input + accessibility) ships in **Phase 6a** alongside the modding SDK and full Workshop. Phase 6a also adds the low-friction **Validate & Playtest** toolbar flow (`Preview` / `Test` / `Validate` / `Publish`), Quick/Publish validation presets, non-blocking validation execution with status badges, a Publish Readiness screen, Git-first collaboration foundations (stable IDs + canonical serialization + read-only Git status + semantic diff helper), Advanced-mode **Profile Playtest**, and the read-only Migration Workbench preview. **Phase 6b** ships campaign editor maturity features (graph/state/dashboard/intermissions/dialogue/named characters), game mode templates, multiplayer/co-op scenario tools, Game Master mode, advanced validation presets/batch validation, semantic merge helper + optional conflict resolver panel, Migration Workbench apply mode with rollback, and the Advanced-only Localization & Subtitle Workbench. Editor onboarding ("Coming From" profiles, keybinding presets, migration cheat sheets, partial import) and touch input ship in **Phase 7**. The campaign editor's graph, state dashboard, and intermission screens build on D021's campaign system (Phase 4) — the sim-side campaign engine must exist before the visual editor can drive it.

---

---

