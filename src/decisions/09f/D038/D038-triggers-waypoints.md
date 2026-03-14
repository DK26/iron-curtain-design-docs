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

### Mission Outcome Wiring (Scenario → Campaign)

D021 defines **named outcomes** at the campaign level (e.g., `victory_bridge_intact`, `victory_bridge_destroyed`, `defeat`). The scenario editor is where those outcomes are *authored and wired* to in-game conditions.

**Outcome Trigger type** — extends the existing Victory/Defeat trigger types:

| Attribute | Description |
|-----------|-------------|
| **Trigger Type** | `Outcome` (new, alongside existing Victory/Defeat) |
| **Outcome Name** | Named result string (dropdown populated from the campaign graph if the scenario is linked to a campaign; free-text if standalone) |
| **Priority** | Integer (default 0). If two outcome triggers fire on the same tick, the higher-priority outcome wins |
| **Debrief Override** | Optional per-outcome debrief text/audio/video that overrides the campaign-level debrief for this specific scenario |

**Lua API for script-driven outcomes:**

```lua
-- Fire a named outcome from any script context (trigger, module, init)
Mission.Complete("victory_bridge_intact")

-- Fire with metadata (optional — flows to campaign variables)
Mission.Complete("victory_bridge_destroyed", {
    bridge_status = "destroyed",
    civilian_casualties = Var.get("civ_deaths"),
})

-- Query available outcomes (useful for dynamic logic)
local outcomes = Mission.GetOutcomes()  -- returns list of named outcomes from campaign graph

-- Check if an outcome has fired (for multi-phase scenarios)
if Mission.IsComplete() then return end
```

**Design rules:**
- A scenario can define any number of Outcome triggers. The **first one to fire** determines the campaign branch — subsequent outcome triggers are ignored
- If a scenario is standalone (not linked to a campaign), Outcome triggers with names starting with `victory` behave as Victory, names starting with `defeat` behave as Defeat, and all others behave as Victory. This makes standalone playtesting natural
- Legacy `Victory` and `Defeat` trigger types still work — they map to the default outcomes `victory` and `defeat` respectively. Named outcomes are a strict superset

**Outcome validation (editor checks):**
- Warning if a scenario has no Outcome trigger and no Victory/Defeat trigger
- Warning if a scenario linked to a campaign has Outcome names that don't match any branch in the campaign graph
- Warning if a scenario has only one outcome (no branching potential — may be intentional for linear campaigns)
- Error if two Outcome triggers have the same name and the same priority (ambiguous)

**Example wiring:**

```
Campaign Graph (D021):          Scenario "bridge_mission":

  ┌─────────────┐              Trigger "bridge_secured":
  │ Bridge       │                Condition: allied_present in bridge_area
  │ Mission      │───►            AND NOT building_destroyed(bridge)
  │              │                Type: Outcome
  └──┬───────┬───┘                Outcome Name: victory_bridge_intact
     │       │
     ▼       ▼                Trigger "bridge_blown":
  ┌─────┐ ┌─────┐               Condition: building_destroyed(bridge)
  │ 02a │ │ 02b │               Type: Outcome
  │(int)│ │(des)│               Outcome Name: victory_bridge_destroyed
  └─────┘ └─────┘
                              Trigger "defeat":
                                Condition: all player units destroyed
                                Type: Outcome
                                Outcome Name: defeat
```

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

### Waypoints Mode (Visual Route Authoring)

OFP's F4 (Waypoints) mode let designers click the map to create movement orders for groups — the most intuitive way to choreograph AI behavior without scripting. IC adapts this for RTS with waypoint types tailored to base-building and resource-gathering gameplay.

#### Placing Waypoints

- **Click the map** in Waypoints mode to place a waypoint marker (numbered circle with directional arrow)
- **Click another position** while a waypoint is selected to create the next waypoint in the sequence — a colored line connects them
- **Right-click** to finish the current waypoint sequence
- Waypoints can be **moved** (drag), **deleted** (Del), and **reordered** (drag in the properties panel list)
- Each waypoint sequence is a **named route** with a variable name (e.g., `north_patrol`, `convoy_route`) usable in scripts and module parameters

#### Waypoint Types

| Type | Behavior | OFP Equivalent |
|------|----------|----------------|
| **Move** | Move to position, then continue to next waypoint | Move |
| **Attack** | Move to position, engage any enemies near waypoint before continuing | Seek and Destroy |
| **Guard** | Hold position, engage targets within radius, return when clear | Guard |
| **Patrol** | Cycle the entire route continuously (last waypoint links back to first) | Cycle |
| **Load** | Move to position, pick up passengers or cargo at a transport building | Get In |
| **Unload** | Move to position, drop off all passengers | Get Out |
| **Harvest** | Move to ore field, harvest until depleted or ordered elsewhere | N/A (RTS-specific) |
| **Script** | Execute Lua callback when the unit arrives at this waypoint | Scripted |
| **Wait** | Pause at position for a duration (min/mid/max randomized timer) | N/A |
| **Formation** | Reorganize the group into a specific formation before proceeding | Formation |

#### Waypoint Properties Panel

Each waypoint has a properties panel:

| Property | Type | Description |
|----------|------|-------------|
| **Name** | text | Variable name (e.g., `wp_bridge_cross_01`) — for referencing in scripts |
| **Type** | dropdown | Waypoint type from the table above |
| **Position** | cell coordinate | Map position (draggable in viewport) |
| **Radius** | slider (0–20 cells) | Engagement/guard radius; units reaching anywhere within this radius count as "arrived" |
| **Timer** | min/mid/max | Wait duration at this waypoint (for Wait type, or hold-time for Guard/Attack) |
| **Formation** | dropdown | Group formation while moving toward this waypoint (Line, Column, Wedge, Staggered Column, None) |
| **Speed** | enum | Movement speed: Unlimited / Limited / Forced March (affects stamina/readiness) |
| **Combat Mode** | enum | Rules of engagement en route: Never Fire / Hold Fire / Open Fire / Open Fire, Engage at Will |
| **Condition** | Lua expression | Optional condition that must be true before this waypoint activates (e.g., `Var.get("phase") >= 2`) |
| **On Arrival** | Lua (Advanced) | Script executed when the first unit in the group reaches this waypoint |

#### Visual Route Display

Waypoint routes are rendered as colored lines on the isometric viewport:

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│      ①───────────②──────────③                          │
│      Move        Attack     Guard                      │
│      (blue)      (red)      (yellow)                   │
│                                                        │
│          ④═══════⑤═══════⑥═══════④                     │
│          Patrol  Patrol  Patrol  (loop)                │
│          (green cycling arrows)                        │
│                                                        │
│      ⑦ · · · · · ⑧                                    │
│      Wait         Script                               │
│      (dotted, paused)                                  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

- **Color coding by type:** Move=blue, Attack=red, Guard=yellow, Patrol=green (with cycling arrows), Harvest=amber, Wait=dotted gray
- **Route labels** appear above the first waypoint showing the route name
- **Inactive routes** (assigned to entities not currently selected) appear faded
- **Active route** (selected entity's route) appears bright with animated directional arrows

#### Assigning Entities to Routes

- **Select an entity or group** → right-click a waypoint route → "Assign to Route"
- **Or:** Select entity → Properties panel → Route dropdown → pick from named routes
- **Or:** Module connection — a Patrol Route module references a named waypoint route
- Multiple entities/groups can share the same route (each follows it independently)
- Lua: `entity:set_route("north_patrol")` or `entity:set_patrol_route("north_patrol")` (existing API, now visually authored)

#### Synchronization Lines (Multi-Group Coordination)

OFP's synchronization concept — the single most powerful tool for coordinated AI behavior:

- **Draw a sync line** between waypoints of different groups by holding Shift and clicking two waypoints
- **Effect:** Both groups pause at their respective waypoints until *both* have arrived, then proceed simultaneously
- **Use case:** "Group Alpha waits at the north ridge, Group Bravo waits at the south bridge. When BOTH are in position, they attack from both sides at once."
- Synchronization lines appear as dashed white lines between the connected waypoints
- Can sync more than two groups — all must arrive before any proceed

```
Group Alpha route:     ①───②───③ (sync) ───④ Attack
                                  ╫
Group Bravo route:     ⑤───⑥───⑦ (sync) ───⑧ Attack
                                  ╫
Group Charlie route:   ⑨───⑩──⑪ (sync) ───⑫ Attack

All three groups wait at their sync waypoints until
the last group arrives, then all proceed to Attack.
```

This creates the "three-pronged attack" coordination that makes OFP missions feel alive. No scripting required — pure visual placement.

#### Relationship to Modules

Waypoint routes and modules work together:

- **Patrol Route module** = a module that wraps a named waypoint route with alert/response parameters. The module provides the "engage if threat detected, then return to route" logic; the waypoint route provides the path
- **Guard Position module** = a single Guard-type waypoint with radius and priority parameters wrapped in a module
- **Escort Convoy module** = entities following a waypoint route with "protect" behavior attached
- **Hunt and Destroy module** = entities cycling between random waypoints within an area

Waypoints mode gives designers **direct authoring** of the paths that modules reference. The same route can be used by a Patrol Route module, a custom Lua script, or a trigger's reinforcement entry path.

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

