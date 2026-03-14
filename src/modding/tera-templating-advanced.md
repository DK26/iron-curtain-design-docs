### Dynamic Mission Flow (Map Expansion, Sub-Maps, Phase Transitions)

Classic C&C missions — and especially OFP/ArmA missions — aren't static. The map *changes* as you play: new areas reveal when objectives are completed, units enter building interiors for infiltration sequences, briefings fire between phases. Iron Curtain makes all of this first-class, scriptable, and editor-friendly.

Three interconnected systems:

1. **Map Layers** — named groups of terrain, entities, and triggers that activate/deactivate at runtime. The map expansion primitive.
2. **Sub-Map Transitions** — enter a building or structure, transition to an interior map, complete objectives, return to the parent map.
3. **Phase Briefings** — mid-mission cutscenes and briefings that bridge expansion phases (builds on the existing `video_playback` and `scripted_scene` templates).

#### Map Layers & Dynamic Expansion

The map is authored as one large map with **named layers**. Each layer groups a region of terrain, entities, triggers, and camera bounds into a named set that starts active or inactive. When a Lua script activates a layer, the engine reveals shroud over that area, wakes dormant entities, extends the playable camera bounds, and activates triggers assigned to that layer.

**Key invariant:** The full map exists in the simulation from tick 0 — all cells, all terrain data. Layers control *visibility and activity*, not physical existence. This preserves determinism: every client has the same map data from the start; layer state is part of the sim state.

```rust
/// A named group of map content that can be activated/deactivated at runtime.
/// Entities assigned to an inactive layer are dormant: invisible, non-collidable,
/// non-targetable, and their Lua scripts don't fire. Activating the layer wakes them.
#[derive(Component)]
pub struct MapLayer {
    pub name: String,
    pub active: bool,
    pub bounds: Option<CellRect>,           // layer's spatial extent (for camera bounds expansion)
    pub activation_shroud: ShroudRevealMode,// how shroud lifts when activated
    pub activation_camera: CameraAction,    // what the camera does on activation
}

/// How shroud reveals when a layer activates.
pub enum ShroudRevealMode {
    Instant,                        // immediate full reveal (classic)
    Dissolve { duration_ticks: u32 }, // fade from black over N ticks (cinematic)
    Gradual { speed: i32 },         // shroud peels from activation edge outward
    None,                           // don't touch shroud (layer has no terrain, e.g. entity-only)
}

/// What the camera does when a layer activates.
pub enum CameraAction {
    Stay,                           // camera stays where it is
    PanTo { target: CellPos, duration_ticks: u32 }, // smooth pan to new area
    JumpTo { target: CellPos },     // instant jump (for hard cuts)
    FollowUnit { entity: Entity },  // lock camera to a specific unit
}

/// Bevy Resource tracking active layers and the current playable bounds.
#[derive(Resource)]
pub struct MapLayerState {
    pub layers: HashMap<String, bool>,  // name → active
    pub playable_bounds: CellRect,      // union of all active layer bounds
}

/// Marker component for entities assigned to a specific layer.
/// When the layer is inactive, the entity is dormant.
#[derive(Component)]
pub struct LayerMember {
    pub layer: String,
}
```

**YAML schema — layers defined in the mission file:**

```yaml
# mission map definition (inside map.yaml or scenario.yaml)
layers:
  phase_1_coastal:
    bounds: { x: 0, y: 0, w: 96, h: 64 }
    active: true                    # starting layer — player sees this area
  phase_2_beach:
    bounds: { x: 0, y: 64, w: 96, h: 48 }
    active: false
    activation_shroud: dissolve
    activation_camera: { pan_to: { x: 48, y: 88 }, duration: 90 }  # ~4.5 seconds at Normal ~20 tps
  phase_3_base:
    bounds: { x: 96, y: 0, w: 64, h: 112 }
    active: false
    activation_shroud: gradual
    activation_camera: stay

actors:
  # Entities can be assigned to layers. Inactive layer → entity dormant.
  - type: SovietBarracks
    position: { x: 120, y: 50 }
    owner: enemy
    layer: phase_3_base             # only appears when phase_3_base activates
  - type: Tanya
    position: { x: 10, y: 10 }
    owner: player
    # no layer → always active (part of the implicit "base" layer)
```

**Lua API — `Layer` global:**

```lua
-- Activate a layer: reveal shroud, wake entities, extend camera bounds
Layer.Activate("phase_2_beach")

-- Activate with a cinematic transition (overrides YAML defaults)
Layer.ActivateWithTransition("phase_2_beach", {
    shroud = "dissolve",
    shroud_duration = 120,          -- 4 seconds
    camera = "pan",
    camera_target = { x = 48, y = 88 },
    camera_duration = 90,
})

-- Deactivate: re-shroud, deactivate entities, contract bounds
Layer.Deactivate("phase_2_beach")

-- Query state
local active = Layer.IsActive("phase_2_beach")  -- true/false
local entities = Layer.GetEntities("phase_2_beach")  -- list of actor references

-- Modify bounds at runtime (rare, but useful for dynamic scenarios)
Layer.SetBounds("phase_2_beach", { x = 0, y = 64, w = 128, h = 48 })
```

**Lua API — `Map` global extensions:**

```lua
-- Directly manipulate playable camera bounds (independent of layers)
Map.SetPlayableBounds({ x = 0, y = 0, w = 192, h = 112 })
local bounds = Map.GetPlayableBounds()

-- Bulk shroud reveal (for custom reveal patterns, independent of layers)
Map.RevealShroud("named_region_from_editor")   -- reveal a D038 Named Region
Map.RevealShroud({ x = 10, y = 10, w = 30, h = 20 })  -- reveal a rectangle
Map.RevealShroudGradual("named_region", 90)     -- animated reveal over 3 seconds
```

**Worked example — "Operation Coastal Storm" (Tanya destroys AA → map expands):**

```lua
-- mission_coastal_storm.lua

local aa_sites_remaining = 3

function OnMissionStart()
    Objectives.Add("primary", "destroy_aa", "Destroy the 3 anti-air batteries")
    -- Player starts in phase_1_coastal (64-cell-tall strip)
    -- phase_2_beach is invisible, its entities dormant
end

Trigger.OnKilled("aa_site_1", function() OnAASiteDestroyed() end)
Trigger.OnKilled("aa_site_2", function() OnAASiteDestroyed() end)
Trigger.OnKilled("aa_site_3", function() OnAASiteDestroyed() end)

function OnAASiteDestroyed()
    aa_sites_remaining = aa_sites_remaining - 1
    UserInterface.SetMissionText("AA sites remaining: " .. aa_sites_remaining)

    if aa_sites_remaining == 0 then
        Objectives.Complete("destroy_aa")

        -- Phase transition: expand the map
        Layer.ActivateWithTransition("phase_2_beach", {
            shroud = "dissolve",
            shroud_duration = 120,
            camera = "pan",
            camera_target = { x = 48, y = 88 },
            camera_duration = 90,
        })

        -- Mid-expansion briefing (radar_comm — game doesn't pause)
        Media.PlayVideo("videos/commander-clear-skies.webm", "radar_comm")

        -- Reinforcements arrive at the newly revealed beach
        Trigger.AfterDelay(150, function()
            Reinforcements.Spawn("allies", {"Tank", "Tank", "APC", "Rifle", "Rifle"},
                                 "south_beach_entry")
            PlayEVA("reinforcements_arrived")
        end)

        -- New objective in the expanded area
        Objectives.Add("primary", "capture_port", "Capture the enemy port facility")
    end
end
```

#### Sub-Map Transitions (Building Interiors)

A `SubMapPortal` links a location on the main map to a secondary map file. When a qualifying unit enters the portal's trigger region, the engine:

1. **Snapshots** the main map state (sim snapshot — D010)
2. **Transitions** visually (fade, iris wipe, or cut)
3. Optionally plays a **briefing** during the transition
4. **Loads** the sub-map and spawns the entering unit at the configured spawn point
5. Runs the sub-map as a **self-contained mission** with its own triggers, objectives, and Lua scripts
6. On sub-map completion (`SubMap.Exit(outcome)`), **returns** to the main map, restores the snapshot, applies outcome effects, and resumes simulation

**Determinism:** The main map snapshot is part of the sim state. Sub-map execution is fully deterministic. The sub-map's Lua environment is isolated — it cannot access main map entities directly, only through `SubMap.GetParentContext()`.

Inspired by: Commandos: Behind Enemy Lines (building interiors), Fallout 1/2 (location transitions), Jagged Alliance 2 (sector movement), and the "Tanya infiltrates the base" C&C mission archetype.

```rust
/// A portal linking the main map to a sub-map (building interior, underground, etc.)
#[derive(Component)]
pub struct SubMapPortal {
    pub name: String,
    pub sub_map: String,                    // path to sub-map file (e.g., "interiors/radar-station.yaml")
    pub entry_region: String,               // D038 Named Region on main map (trigger area)
    pub spawn_point: CellPos,               // where the unit appears in the sub-map
    pub exit_point: CellPos,                // where the unit appears on main map when exiting
    pub allowed_units: Vec<String>,         // unit type filter (empty = any unit)
    pub transition: SubMapTransitionEffect,
    pub on_enter_briefing: Option<String>,  // optional briefing during transition
    pub outcomes: HashMap<String, SubMapOutcome>, // named outcomes and their effects on parent
}

pub enum SubMapTransitionEffect {
    FadeBlack { duration_ticks: u32 },
    IrisWipe { duration_ticks: u32 },
    Cut,                                    // instant (no transition effect)
}

/// What happens on the parent map when the sub-map exits with a given outcome.
pub struct SubMapOutcome {
    pub set_flags: HashMap<String, bool>,   // campaign/mission flags to set
    pub activate_layers: Vec<String>,       // map layers to activate on return
    pub deactivate_layers: Vec<String>,     // map layers to deactivate
    pub spawn_units: Vec<SpawnSpec>,        // units to spawn on main map
    pub play_video: Option<String>,         // debrief video on return
}

/// Bevy Resource tracking the active sub-map state.
#[derive(Resource)]
pub struct SubMapState {
    pub active: bool,
    pub parent_snapshot: Option<SimSnapshot>,   // D010: frozen main map state
    pub entry_context: Option<SubMapContext>,    // which unit, which portal
    pub current_sub_map: Option<String>,         // active sub-map path
}

pub struct SubMapContext {
    pub entering_unit: Entity,
    pub portal_name: String,
    pub parent_map: String,
}
```

**YAML schema — portals defined in the mission file:**

```yaml
portals:
  radar_dome_interior:
    sub_map: interiors/radar-station.yaml
    entry_region: radar_door_zone           # D038 Named Region
    spawn_point: { x: 5, y: 12 }
    exit_point: { x: 48, y: 30 }           # where unit reappears on main map
    allowed_units: [spy, tanya, commando]
    transition: { fade_black: { duration: 60 } }
    on_enter_briefing: briefings/infiltrate-radar.yaml
    outcomes:
      sabotaged:
        set_flags: { radar_destroyed: true }
        activate_layers: [phase_2_north]
        play_video: videos/radar-destroyed.webm
      detected:
        set_flags: { alarm_triggered: true }
        spawn_units:
          - type: SovietDog
            count: 4
            position: { x: 50, y: 32 }
          - type: Rifle
            count: 8
            position: { x: 55, y: 28 }
      captured:
        set_flags: { radar_captured: true, radar_destroyed: false }
        activate_layers: [allied_radar_overlay]
```

**Sub-map file (the interior):**

```yaml
# interiors/radar-station.yaml — self-contained mini-mission
map:
  size: { w: 24, h: 16 }
  tileset: interior_concrete

actors:
  - type: SovietGuard
    position: { x: 10, y: 8 }
    owner: enemy
    stance: patrol
    patrol_route: [{ x: 10, y: 8 }, { x: 18, y: 8 }, { x: 18, y: 4 }]
  - type: RadarConsole
    position: { x: 20, y: 2 }
    owner: enemy
    # The objective target

triggers:
  - name: comm_array_destroyed
    condition: { killed: RadarConsole }
    action: { lua: "SubMap.Exit('sabotaged')" }
  - name: spy_detected
    condition: { any_enemy_sees: entering_unit, range: 3 }
    action: { lua: "SubMap.Exit('detected')" }
  - name: console_captured
    condition: { captured: RadarConsole }
    action: { lua: "SubMap.Exit('captured')" }
```

**Lua API — `SubMap` global:**

```lua
-- Programmatically enter a portal (alternative to unit walking into trigger region)
SubMap.Enter("radar_dome_interior")

-- Exit back to parent map with a named outcome
SubMap.Exit("sabotaged")           -- triggers the outcome effects defined in YAML

-- Query state
local is_inside = SubMap.IsActive()                     -- true if inside a sub-map
local context = SubMap.GetParentContext()                -- { unit = ..., portal = "radar_dome_interior" }
local entering_unit = SubMap.GetParentContext().unit     -- the unit that entered

-- Transfer additional units into the sub-map (e.g., reinforcements arrive inside)
SubMap.TransferUnit(some_unit, { x = 5, y = 14 })

-- Read parent map flags from within the sub-map (read-only)
local has_power = SubMap.GetParentFlag("enemy_power_down")
```

**Worked example — spy infiltration with multiple outcomes:**

```lua
-- interiors/radar-station.lua (runs inside the sub-map)

function OnMissionStart()
    local spy = SubMap.GetParentContext().unit
    Objectives.Add("primary", "disable_radar", "Reach the communications array")
    Objectives.Add("secondary", "capture_radar", "Capture the array instead of destroying it")

    -- Spy starts disguised — guards don't attack unless within detection range
    -- Detection range is smaller for spies (disguise mechanic from gameplay-systems.md)
end

-- Guard patrol detection
Trigger.OnEnteredProximity("soviet_guard_1", 3, function(detected_unit)
    if detected_unit == SubMap.GetParentContext().unit then
        UserInterface.SetMissionText("You've been detected!")
        PlayEVA("mission_compromised")
        Trigger.AfterDelay(30, function()
            SubMap.Exit("detected")  -- alarm on main map, enemy reinforcements
        end)
    end
end)

-- Destroy the console
Trigger.OnKilled("radar_console", function()
    Objectives.Complete("disable_radar")
    Camera.Shake(5)
    PlayEVA("objective_complete")
    Trigger.AfterDelay(60, function()
        SubMap.Exit("sabotaged")    -- radar goes offline, phase_2_north activates
    end)
end)

-- OR capture it (spy uses C4 vs. infiltration — player's choice)
Trigger.OnCaptured("radar_console", function()
    Objectives.Complete("capture_radar")
    PlayEVA("building_captured")
    Trigger.AfterDelay(60, function()
        SubMap.Exit("captured")     -- radar now works for allies
    end)
end)
```

#### Phase Briefings & Cutscene Integration

The existing `video_playback` scene template (fullscreen / radar_comm / picture_in_picture) and `scripted_scene` template already handle mid-mission cutscenes. The new `phase_briefing` scene template **combines** a briefing with layer activation and reinforcements into a single atomic "next phase" module:

```lua
-- phase_briefing: the "glue" between mission phases
-- Equivalent to manually chaining: video → layer activation → reinforcements → new objectives
-- but packaged as one drag-and-drop module in the D038 editor

function TriggerPhaseTransition(config)
    -- 1. Play briefing (if provided)
    if config.video then
        Media.PlayVideo(config.video, config.display_mode or "radar_comm", function()
            -- 2. Activate layer (if provided) — callback fires when video ends
            if config.layer then
                Layer.ActivateWithTransition(config.layer, config.transition or {})
            end
            -- 3. Spawn reinforcements (if provided)
            if config.reinforcements then
                for _, r in ipairs(config.reinforcements) do
                    Reinforcements.Spawn(r.faction, r.units, r.entry_point)
                end
            end
            -- 4. Add new objectives (if provided)
            if config.objectives then
                for _, obj in ipairs(config.objectives) do
                    Objectives.Add(obj.priority, obj.id, obj.text)
                end
            end
        end)
    end
end
```

`Media.PlayVideo` with a callback is the key addition — the existing video system plays the clip, and the callback fires when it ends (or when the player skips). This enables sequenced phase transitions: briefing → reveal → reinforcements → objectives, all timed correctly.

For `scripted_scene` (non-video cutscenes using in-engine camera movement and dialogue), the existing `Camera.Pan()` API chains naturally with `Layer.ActivateWithTransition()`:

```lua
-- Dramatic reveal: camera pans to newly expanded area while shroud dissolves
Layer.ActivateWithTransition("phase_2_beach", {
    shroud = "dissolve", shroud_duration = 120,
    camera = "pan", camera_target = { x = 48, y = 88 }, camera_duration = 90,
})
-- Letterbox bars appear for cinematic framing
Camera.SetLetterbox(true)
Trigger.AfterDelay(120, function()
    Camera.SetLetterbox(false)
    -- Player regains control in the newly revealed area
end)
```

#### Multi-Phase Mission Example (All Systems Combined)

This example shows how map expansion, sub-map transitions, and phase briefings compose into a sophisticated multi-phase mission — the kind of scenario the editor should make easy to build.

**"Operation Iron Veil" — 4-phase campaign mission:**

```
Phase 1: Small map. Tanya + squad. Destroy 3 AA positions.
    ↓ AA destroyed
Phase 2: Map expands north (beach). Briefing: "Clear skies! Sending the fleet."
         Transports arrive. Beach assault with armor.
    ↓ Beach secured
Phase 3: Spy enters enemy radar dome (sub-map transition).
         Interior infiltration: avoid patrols, sabotage or capture radar.
    ↓ Radar outcome
Phase 4: Map expands east (enemy HQ). Final assault.
         If radar sabotaged: enemy has no radar, reduced AI vision.
         If radar captured: player gets full map reveal.
         If spy detected: enemy is reinforced, harder fight.
```

Each phase transition uses the systems described above. The campaign state (D021) tracks outcomes: `Campaign.set_flag("radar_outcome", outcome)` persists into subsequent missions. A follow-up mission might reference whether the player captured vs. destroyed the radar.

#### Editor Support (D038)

The scenario editor exposes all three systems through its visual interface. These are **Advanced mode** features (hidden in Simple mode to keep it approachable).

| Editor Feature              | Mode     | Description                                                                                                                                                                                            |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Layer Panel**             | Advanced | Side panel listing all map layers. Create, rename, delete, toggle visibility. Click a layer to highlight its bounds and member entities. Drag entities into layers.                                    |
| **Layer Bounds Tool**       | Advanced | Draw/resize rectangles on the map to define layer spatial extents. Color-coded overlay per layer (semi-transparent tinting).                                                                           |
| **Preview Layer**           | Advanced | Toggle button per layer — shows what the map looks like with that layer active/inactive. Useful for testing expansion flow without running the mission.                                                |
| **Expansion Zone Module**   | Advanced | Drag-and-drop module in the Connections panel: wire a trigger condition → layer activation. Properties: shroud reveal mode, camera action, delay.                                                      |
| **Portal Placement**        | Advanced | Place a portal entity on a building footprint. Properties panel: linked sub-map file, spawn point, exit point, allowed unit types, transition effect, outcomes.                                        |
| **Sub-Map Tab**             | Advanced | Open a linked sub-map in a new editor tab. Edit the interior with all standard tools. Portal entry/exit markers shown as special gizmos.                                                               |
| **Portal Connections View** | Advanced | Overlay showing lines from portal entities to their sub-map files. Click to open. Visual indication of which outcomes are wired to which parent map effects.                                           |
| **Phase Briefing Module**   | Advanced | Drag-and-drop module: combines video/briefing reference + layer activation + reinforcement list + new objectives. The "next phase" button in module form.                                              |
| **Test Phase Flow**         | Advanced | Play button that runs through phase transitions in sequence — activates layers, plays briefings, spawns reinforcements — without running full AI/combat simulation. Quick iteration on mission pacing. |

> **Simple mode** users can still create multi-phase missions — they just use the pre-built `map_expansion`, `sub_map_transition`, and `phase_briefing` modules from the module library, filling in parameters via the properties panel. Advanced mode gives direct layer/portal manipulation for power users.

### Templates as Workshop Resources

Scene templates and mission templates are both first-class workshop resource types — shared, rated, versioned, and downloadable like any other content. See the full resource category taxonomy in the [Workshop Resource Registry](#workshop-resource-registry--dependency-system-d030) section below.

| Type                  | Contents                                                        | Examples                                         |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| Mods                  | YAML rules + Lua scripts + WASM modules                         | Total conversions, balance patches, new factions |
| Maps                  | `.oramap` or native IC YAML map format                          | Skirmish maps, campaign maps, tournament pools   |
| Missions              | YAML map + Lua triggers + briefing                              | Hand-crafted or LLM-generated scenarios          |
| **Scene Templates**   | **Tera-templated Lua + schema**                                 | **Reusable sub-mission building blocks**         |
| **Mission Templates** | **Tera templates + scene refs + schema**                        | **Full parameterized mission blueprints**        |
| Campaigns             | Ordered mission sets + narrative                                | Multi-mission storylines                         |
| Music                 | OGG Vorbis recommended (`.ogg`); also `.mp3`, `.flac`           | Custom soundtracks, faction themes, menu music   |
| Sound Effects         | WAV or OGG (`.wav`, `.ogg`); legacy `.aud` accepted             | Weapon sounds, ambient loops, UI feedback        |
| Voice Lines           | OGG Vorbis + trigger metadata; legacy `.aud` accepted           | EVA packs, unit responses, faction voice sets    |
| Sprites               | PNG recommended (`.png`); legacy `.shp`+`.pal` accepted         | HD unit packs, building sprites, effects packs   |
| Textures              | PNG or KTX2 (GPU-compressed); legacy `.tmp` accepted            | Theater tilesets, seasonal terrain variants      |
| Palettes              | `.pal` files (unchanged — 768 bytes, universal)                 | Theater palettes, faction colors, seasonal       |
| Cutscenes / Video     | WebM recommended (`.webm`); also `.mp4`; legacy `.vqa` accepted | Custom briefings, cinematics, narrative videos   |
| UI Themes             | Chrome layouts, fonts, cursors                                  | Alternative sidebars, HD cursor packs            |
| Balance Presets       | YAML rule overrides                                             | Competitive tuning, historical accuracy presets  |
| QoL Presets           | Gameplay behavior toggle sets (D033)                            | Custom QoL configurations, community favorites   |
| Experience Profiles   | Combined balance + theme + QoL (D019+D032+D033)                 | One-click full experience configurations         |

> **Format guidance (D049):** New Workshop content should use Bevy-native modern formats (OGG, PNG, WAV, WebM, KTX2, GLTF) for best compatibility, security, and tooling support. C&C legacy formats (.aud, .shp, .vqa, .tmp) are fully supported for backward compatibility but not recommended for new content. See `05-FORMATS.md` § Canonical Asset Format Recommendations and `decisions/09e/D049-workshop-assets.md` for full rationale.
