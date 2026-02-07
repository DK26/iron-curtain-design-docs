# 04 — Modding System

## Three-Tier Architecture

```
Ease of use ▲
             │  ┌─────────────────────────┐
             │  │  YAML rules / data       │  ← 80% of mods (Tier 1)
             │  │  (units, weapons, maps)  │
             │  ├─────────────────────────┤
             │  │  Lua scripts             │  ← missions, AI, abilities (Tier 2)
             │  │  (event hooks, triggers) │
             │  ├─────────────────────────┤
             │  │  WASM modules            │  ← new mechanics, total conversions (Tier 3)
             │  │  (Rust/C/AssemblyScript) │
             │  └─────────────────────────┘
Power      ▼
```

Each tier is optional. A modder who wants to change tank cost never sees code. A modder building a total conversion uses WASM.

## Tier 1: Data-Driven (YAML Rules)

### Decision: Real YAML, Not MiniYAML

OpenRA uses "MiniYAML" — a custom dialect that uses tabs, has custom inheritance (`^`, `@`), and doesn't comply with the YAML spec. Standard parsers choke on it.

**Our approach:** Standard YAML with `serde_yaml`, inheritance resolved at load time.

**Rationale:**
- `serde` + `serde_yaml` → typed Rust struct deserialization for free
- Every text editor has YAML support, linters, formatters
- JSON-schema validation catches errors before the game loads
- No custom parser to maintain

### Example Unit Definition

```yaml
# units/allies/infantry.yaml
units:
  rifle_infantry:
    inherits: _base_soldier
    display:
      name: "Rifle Infantry"
      icon: e1icon
      sequences: e1
    ai:
      summary: "Cheap expendable anti-infantry scout"
      role: [anti_infantry, scout, garrison]
      strengths: [cheap, fast_to_build, effective_vs_infantry]
      weaknesses: [fragile, useless_vs_armor, no_anti_air]
      tactical_notes: >
        Best used in groups of 5+ for early harassment or
        garrisoning buildings. Not cost-effective against
        anything armored. Pair with anti-tank units.
      counters: [tank, apc, attack_dog]
      countered_by: [tank, flamethrower, grenadier]
    buildable:
      cost: 100
      time: 5.0
      queue: infantry
      prerequisites: [barracks]
    health:
      max: 50
      armor: none
    mobile:
      speed: 56
      locomotor: foot
    combat:
      weapon: m1_carbine
      attack_sequence: shoot
```

### Inheritance System

Templates use `_` prefix convention (not spawnable units):

```yaml
# templates/_base_soldier.yaml
_base_soldier:
  mobile:
    locomotor: foot
    turn_speed: 5
  health:
    armor: none
  selectable:
    bounds: [12, 18]
    voice: generic_infantry
```

Inheritance is resolved at load time in Rust. Fields from `_base_soldier` are merged, then overridden by the child definition.

### Balance Presets

The same inheritance system powers **switchable balance presets** (D019). Presets are alternate YAML directories that override unit/weapon/structure values:

```
rules/
├── units/              # base definitions (always loaded)
├── weapons/
├── structures/
└── presets/
    ├── classic/        # EA source code values (DEFAULT)
    │   ├── units/
    │   │   └── tanya.yaml    # cost: 1200, health: 125, weapon_range: 5, ...
    │   └── weapons/
    ├── openra/         # OpenRA competitive balance
    │   ├── units/
    │   │   └── tanya.yaml    # cost: 1400, health: 80, weapon_range: 3, ...
    │   └── weapons/
    └── remastered/     # Remastered Collection tweaks
        └── ...
```

**How it works:**
1. Engine loads base definitions from `rules/`
2. Engine loads the selected preset directory, overriding matching fields via inheritance
3. Preset YAML files only contain fields that differ — everything else falls through to base

```yaml
# rules/presets/openra/units/tanya.yaml
# Only overrides what OpenRA changes — rest inherits from base definition
tanya:
  inherits: _base_tanya       # base definition with display, sequences, AI metadata, etc.
  buildable:
    cost: 1400                 # OpenRA nerfed from 1200
  health:
    max: 80                    # OpenRA nerfed from 125
  combat:
    weapon: tanya_pistol_nerfed  # references an OpenRA-balanced weapon definition
```

**Lobby integration:** Preset is selected in the game lobby alongside map and faction. All players in a multiplayer game use the same preset (enforced by the sim). The preset name is embedded in replays.

See D019 in `src/09-DECISIONS.md` for full rationale.

### Rust Deserialization

```rust
#[derive(Deserialize)]
struct UnitDef {
    inherits: Option<String>,
    display: DisplayInfo,
    ai: Option<AiMeta>,
    buildable: Option<BuildableInfo>,
    health: HealthInfo,
    mobile: Option<MobileInfo>,
    combat: Option<CombatInfo>,
}

/// LLM/AI-readable metadata for any game resource.
/// Consumed by ra-llm (mission generation), ra-ai (skirmish AI),
/// and workshop search (semantic matching).
#[derive(Deserialize, Serialize)]
struct AiMeta {
    summary: String,                    // one-line natural language description
    role: Vec<String>,                  // semantic tags: anti_infantry, scout, siege, etc.
    strengths: Vec<String>,             // what this unit is good at
    weaknesses: Vec<String>,            // what this unit is bad at
    tactical_notes: Option<String>,     // free-text tactical guidance for AI/LLM
    counters: Vec<String>,              // unit types this is effective against
    countered_by: Vec<String>,          // unit types that counter this
}
```

### MiniYAML Migration

Part of `ra-formats` crate: a `miniyaml2yaml` converter tool that translates existing OpenRA mod data to standard YAML. One-time migration per mod.

### Why Not TOML / RON / JSON?

| Format | Verdict | Reason                                               |
| ------ | ------- | ---------------------------------------------------- |
| TOML   | Reject  | Awkward for deeply nested game data                  |
| RON    | Reject  | Modders won't know it, thin editor support           |
| JSON   | Reject  | Too verbose, no comments, miserable for hand-editing |
| YAML   | Accept  | Human-readable, universal tooling, serde integration |

## Tier 2: Lua Scripting

### Decision: Lua over Python

**Why Lua:**
- Tiny runtime (~200KB)
- Designed for embedding — exists for this purpose
- Deterministic (provide fixed-point math bindings, no floats)
- Trivially sandboxable (control exactly what functions are available)
- Industry standard: Factorio, WoW, Garry's Mod, Dota 2, Roblox
- `mlua` or `rlua` crates are mature
- Any modder can learn in an afternoon

**Why NOT Python:**
- Floating-point non-determinism breaks lockstep multiplayer
- GC pauses (reintroduces the problem Rust solves)
- 50-100x slower than native (hot paths run every tick for every unit)
- Embedding CPython is heavy (~15-30MB)
- Sandboxing is basically unsolvable — security disaster for community mods
- `import os; os.system("rm -rf /")` is one mod away

### Lua API Examples

```lua
-- Mission scripting
function OnPlayerEnterArea(player, area)
  if area == "bridge_crossing" then
    SpawnReinforcements("allies", {"Tank", "Tank"}, "north")
    PlayEVA("reinforcements_arrived")
  end
end

-- Custom unit behavior
Hooks.OnUnitCreated("ChronoTank", function(unit)
  unit:AddAbility("chronoshift", {
    cooldown = 120,
    range = 15,
    onActivate = function(target_cell)
      PlayEffect("chrono_flash", unit.position)
      unit:Teleport(target_cell)
      PlayEffect("chrono_flash", target_cell)
    end
  })
end)
```

### Lua Sandbox Rules

- Only engine-provided functions available (no `io`, `os`, `require` from filesystem)
- Fixed-point math provided via engine bindings (no raw floats)
- Execution time limits per tick
- Memory limits per mod

## Tier 3: WASM Modules

### Rationale

- Near-native performance for complex mods
- Perfectly sandboxed by design (WASM's memory model)
- Deterministic execution (critical for multiplayer)
- Modders write in Rust, C, Go, AssemblyScript, or even Python compiled to WASM
- `wasmtime` or `wasmer` crates

### WASM Host API (Security Boundary)

```rust
// The WASM host functions are the ONLY API mods can call.
// The API surface IS the security boundary.

#[wasm_host_fn]
fn get_unit_position(unit_id: u32) -> Option<(i32, i32)> {
    let unit = sim.get_unit(unit_id)?;
    // CHECK: is this unit visible to the mod's player?
    if !sim.is_visible_to(mod_player, unit.position) {
        return None;  // Mod cannot see fogged units
    }
    Some(unit.position)
}

// There is no get_all_units() function.
// There is no get_enemy_state() function.
```

### Mod Capabilities System

```rust
pub struct ModCapabilities {
    pub read_own_state: bool,
    pub read_visible_state: bool,
    // Can NEVER read fogged state (API doesn't exist)
    pub issue_orders: bool,           // For AI mods
    pub filesystem: FileAccess,       // Usually None
    pub network: NetworkAccess,       // Usually None
}

pub enum NetworkAccess {
    None,                          // Most mods
    AllowList(Vec<String>),        // UI mods fetching assets
    // NEVER unrestricted
}
```

### 3D Rendering Mods (Tier 3 Showcase)

The most powerful example of Tier 3 modding: replacing the entire visual presentation with 3D rendering. A "3D Red Alert" mod swaps sprites for GLTF meshes and the isometric camera for a free-rotating 3D camera — while the simulation, networking, pathfinding, and rules are completely unchanged.

This works because Bevy already ships a full 3D pipeline. The mod doesn't build a 3D engine — it uses Bevy's existing 3D renderer through the WASM mod API.

**A 3D render mod implements:**

```rust
// WASM mod: replaces the default sprite renderer
impl Renderable for MeshRenderer {
    fn render(&self, entity: EntityId, state: &RenderState, ctx: &mut RenderContext) {
        let model = self.models.get(entity.unit_type);
        let animation = match state.activity {
            Activity::Idle => &model.idle,
            Activity::Moving => &model.walk,
            Activity::Attacking => &model.attack,
        };
        ctx.draw_mesh(model.mesh, state.world_pos, state.facing, animation);
    }
}

impl CameraController for FreeCam3D {
    fn screen_to_cell(&self, screen_pos: Vec2, terrain: &TerrainData) -> CellPos {
        // 3D raycast against terrain mesh → grid cell
        let ray = self.camera.screen_to_ray(screen_pos);
        terrain.raycast(ray).to_cell_pos()
    }
}
```

**Assets are mapped in YAML (mod overrides unit render definitions):**

```yaml
# 3d_mod/render_overrides.yaml
rifle_infantry:
  render:
    type: mesh
    model: models/infantry/rifle.glb
    animations:
      idle: Idle
      move: Run
      attack: Shoot
      death: Death

medium_tank:
  render:
    type: mesh
    model: models/vehicles/medium_tank.glb
    turret: models/vehicles/medium_tank_turret.glb
    animations:
      idle: Idle
      move: Drive
```

**Cross-view multiplayer is a natural consequence.** Since the mod only changes rendering, a player using the 3D mod can play against a player using classic isometric sprites. The sim produces identical state; each client just draws it differently. Replays are viewable in either mode.

See `02-ARCHITECTURE.md` § "3D Rendering as a Mod" for the full architectural rationale.

## Tera Templating & Mission Templates (Phase 6)

### Tera as the Template Engine

Tera is a Rust-native Jinja2-compatible template engine. It handles two roles in the modding system:

1. **YAML/Lua generation** — eliminates copy-paste for faction variants, bulk unit definitions
2. **Mission templates** — parameterized, reusable mission blueprints (like Helm charts for K8s)

Load-time only (zero runtime cost). Tera is the right fit because:
- Rust-native (`tera` crate), no external dependencies
- Jinja2 syntax — widely known, documented, tooling exists
- Supports loops, conditionals, includes, macros, filters, inheritance
- Deterministic output (no randomness unless explicitly seeded via context)

### Unit/Rule Templating (Original Use Case)

```jinja
{% for faction in ["allies", "soviet"] %}
{% for tier in [1, 2, 3] %}
{{ faction }}_tank_t{{ tier }}:
  inherits: _base_tank
  health:
    max: {{ 200 + tier * 100 }}
  buildable:
    cost: {{ 500 + tier * 300 }}
{% endfor %}
{% endfor %}
```

### Mission Templates (Helm-Style Parameterized Missions)

A mission template is a reusable mission blueprint with parameterized values. The template defines the structure (map layout, objectives, triggers, enemy composition); the user (or LLM) supplies values to produce a concrete, playable mission.

**Template structure:**

```
templates/
  bridge_defense/
    template.yaml        # Tera template for map + rules
    triggers.lua.tera    # Tera template for Lua trigger scripts
    values.yaml          # Default parameter values
    schema.yaml          # Parameter schema (names, types, constraints, descriptions)
    preview.png          # Thumbnail for workshop browser
    README.md            # Description, author, usage notes
```

**Schema (what parameters the template accepts):**

```yaml
# schema.yaml — defines the knobs for this template
parameters:
  map_size:
    type: enum
    options: [small, medium, large]
    default: medium
    description: "Overall map dimensions"
  
  player_faction:
    type: enum
    options: [allies, soviet]
    default: allies
    description: "Player's faction"
  
  enemy_waves:
    type: integer
    min: 3
    max: 20
    default: 8
    description: "Number of enemy attack waves"
  
  difficulty:
    type: enum
    options: [easy, normal, hard, brutal]
    default: normal
    description: "Controls enemy unit count and AI aggression"
  
  reinforcement_type:
    type: enum
    options: [infantry, armor, air, mixed]
    default: mixed
    description: "What reinforcements the player receives"
  
  enable_naval:
    type: boolean
    default: false
    description: "Include river crossings and naval units"
```

**Template (references parameters):**

```jinja
{# template.yaml — bridge defense mission #}
mission:
  name: "Bridge Defense — {{ difficulty | title }}"
  briefing: >
    Commander, hold the {{ map_size }} bridge crossing against
    {{ enemy_waves }} waves of {{ "Soviet" if player_faction == "allies" else "Allied" }} forces.
    {% if enable_naval %}Enemy naval units will approach from the river.{% endif %}

map:
  size: {{ {"small": [64, 64], "medium": [96, 96], "large": [128, 128]}[map_size] }}

actors:
  player_base:
    faction: {{ player_faction }}
    units:
      {% for i in range(end={"easy": 8, "normal": 5, "hard": 3, "brutal": 2}[difficulty]) %}
      - type: {{ reinforcement_type }}_defender_{{ i }}
      {% endfor %}

waves:
  count: {{ enemy_waves }}
  escalation: {{ {"easy": 1.1, "normal": 1.3, "hard": 1.5, "brutal": 2.0}[difficulty] }}
```

**Rendering a template into a playable mission:**

```rust
use tera::{Tera, Context};

pub fn render_mission_template(
    template_dir: &Path,
    values: &HashMap<String, Value>,
) -> Result<RenderedMission> {
    let schema = load_schema(template_dir.join("schema.yaml"))?;
    let merged = merge_with_defaults(values, &schema)?;  // fill in defaults
    validate_values(&merged, &schema)?;                   // check types, ranges, enums

    let mut tera = Tera::new(template_dir.join("*.tera").to_str().unwrap())?;
    let mut ctx = Context::new();
    for (k, v) in &merged {
        ctx.insert(k, v);
    }

    Ok(RenderedMission {
        map_yaml: tera.render("template.yaml", &ctx)?,
        triggers_lua: tera.render("triggers.lua.tera", &ctx)?,
        // Standard mission format — indistinguishable from hand-crafted
    })
}
```

### LLM + Templates

The LLM doesn't need to generate everything from scratch. It can:
1. **Select a template** from the workshop based on the user's description
2. **Fill in values** — the LLM generates a `values.yaml`, not an entire mission
3. **Validate** — schema constraints catch hallucinated values before rendering
4. **Compose** — chain multiple scene and mission templates for campaigns (e.g., "3 missions: base building → bridge defense → final assault")

This is dramatically more reliable than raw generation. The template constrains the LLM's output to valid parameter space, and the schema validates it. The LLM becomes a smart form-filler, not an unconstrained code generator.

### Scene Templates (Composable Building Blocks)

Inspired by Operation Flashpoint / ArmA's mission editor: scene templates are **sub-mission components** — reusable, pre-scripted building blocks that snap together inside a mission. Each scene template has its own trigger logic, AI behavior, and Lua scripts already written and tested. The user or LLM only fills in parameters.

**Template hierarchy:**

```
Scene Template    — a single scripted encounter or event
  ↓ composed into
Mission Template  — a full mission assembled from scenes + overall structure
  ↓ sequenced into
Campaign          — ordered mission sequence with narrative
```

**Built-in scene template library (examples):**

| Scene Template    | Parameters                                             | Pre-built Logic                                                |
| ----------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| `ambush`          | location, attacker_units, trigger_zone, delay          | Units hide until player enters zone, then attack from cover    |
| `patrol`          | waypoints, unit_composition, alert_radius              | Units cycle waypoints, engage if player detected within radius |
| `convoy_escort`   | route, convoy_units, ambush_points[], escort_units     | Convoy follows route, ambushes trigger at defined points       |
| `defend_position` | position, waves[], interval, reinforcement_schedule    | Enemies attack in waves with escalating strength               |
| `base_building`   | start_resources, available_structures, tech_tree_limit | Player builds base, unlocked structures based on tech level    |
| `timed_objective` | target, time_limit, failure_trigger                    | Player must complete objective before timer expires            |
| `reinforcements`  | trigger, units, entry_point, delay                     | Units arrive from map edge when trigger fires                  |
| `scripted_scene`  | actors[], dialogue[], camera_positions[]               | Non-interactive cutscene or briefing with camera movement      |
| `video_playback`  | video_ref, trigger, display_mode, skippable            | Play a video on trigger — see display modes below              |
| `extraction`      | pickup_zone, transport_type, signal_trigger            | Player moves units to extraction zone, transport arrives       |

**`video_playback` display modes:**

The `display_mode` parameter controls *where* the video renders:

| Mode                 | Behavior                                                                                | Inspiration                     |
| -------------------- | --------------------------------------------------------------------------------------- | ------------------------------- |
| `fullscreen`         | Pauses gameplay, fills screen. Classic FMV briefing between missions.                   | RA1 mission briefings           |
| `radar_comm`         | Video replaces the radar/minimap panel during gameplay. Game continues. RA2-style comm. | RA2 EVA / commander video calls |
| `picture_in_picture` | Small floating video overlay in a corner. Game continues. Dismissible.                  | Modern RTS cinematics           |

`radar_comm` is how RA2 handles in-mission conversations — the radar panel temporarily switches to a video feed of a character addressing the player, then returns to the minimap when the clip ends. The sidebar stays functional (build queues, power bar still visible). This creates narrative immersion without interrupting gameplay.

The LLM can use this in generated missions: a briefing video at mission start (`fullscreen`), a commander calling in mid-mission when a trigger fires (`radar_comm`), and a small notification video when reinforcements arrive (`picture_in_picture`).

**Scene template structure:**

```
scenes/
  ambush/
    scene.lua.tera       # Tera-templated Lua trigger logic
    schema.yaml          # Parameters: location, units, trigger_zone, etc.
    values.yaml          # Defaults
    README.md            # Usage, preview, notes
```

**Composing scenes into a mission template:**

```yaml
# mission_templates/commando_raid/template.yaml
mission:
  name: "Behind Enemy Lines — {{ difficulty | title }}"
  briefing: >
    Infiltrate the Soviet base. Destroy the radar, 
    then extract before reinforcements arrive.

scenes:
  - template: scripted_scene
    values:
      actors: [tanya]
      dialogue: ["Let's do this quietly..."]
      camera_positions: [{{ insertion_point }}]

  - template: patrol
    values:
      waypoints: {{ outer_patrol_route }}
      unit_composition: [guard, guard, dog]
      alert_radius: 5

  - template: ambush
    values:
      location: {{ radar_approach }}
      attacker_units: [guard, guard, grenadier]
      trigger_zone: { center: {{ radar_position }}, radius: 4 }

  - template: timed_objective
    values:
      target: radar_building
      time_limit: {{ {"easy": 300, "normal": 180, "hard": 120}[difficulty] }}
      failure_trigger: soviet_reinforcements_arrive

  - template: extraction
    values:
      pickup_zone: {{ extraction_point }}
      transport_type: chinook
      signal_trigger: radar_destroyed
```

**How this works at runtime:**
1. Mission template engine resolves scene references
2. Each scene's `schema.yaml` validates its parameters
3. Each scene's `scene.lua.tera` is rendered with its values
4. All rendered Lua scripts are merged into a single mission trigger file with namespaced functions (e.g., `scene_1_ambush_on_trigger()`)
5. Output is a standard mission — indistinguishable from hand-crafted

**For the LLM, this is transformative.** Instead of generating raw Lua trigger code (hallucination-prone, hard to validate), the LLM:
- Picks scene templates by name from a known catalog
- Fills in parameters that the schema validates
- Composes scenes in sequence — the wiring logic is already built into the templates

A "convoy escort with two ambushes and a base-building finale" is 3 scene template references with ~15 parameters total, not 200 lines of handwritten Lua.

### Templates as Workshop Resources

Scene templates and mission templates are both first-class workshop resource types — shared, rated, versioned, and downloadable like any other content.

| Type                  | Contents                                  | Examples                                          |
| --------------------- | ----------------------------------------- | ------------------------------------------------- |
| Mods                  | YAML rules + Lua scripts + WASM modules   | Total conversions, balance patches, new factions  |
| Maps                  | `.oramap` or native map format            | Skirmish maps, campaign maps                      |
| Missions              | YAML map + Lua triggers + briefing        | Hand-crafted or LLM-generated scenarios           |
| **Scene Templates**   | **Tera-templated Lua + schema**           | **Reusable sub-mission building blocks**          |
| **Mission Templates** | **Tera templates + scene refs + schema**  | **Full parameterized mission blueprints**         |
| Campaigns             | Ordered mission sets + narrative          | Multi-mission storylines                          |
| Assets                | Sprites, music, sounds, palettes          | HD unit packs, custom soundtracks, voice packs    |
| **Media**             | **Video files (`.vqa`, `.mp4`, `.webm`)** | **Custom briefings, cutscenes, narrative videos** |

### Configurable Workshop Server

The client connects to one workshop server at a time, configurable in settings. Players can point to the official server, a community server, or a local directory.

```yaml
# settings.yaml
workshop:
  # Choose one active source:
  url: "https://workshop.ironcurtain.gg"       # official (default)
  # url: "https://mods.myclan.com/workshop"     # community-hosted
  # path: "C:/my-local-workshop"                # local directory (offline/dev)
```

**Official server:** We host one. Default for all players. Curated categories, search, ratings.

**Community servers:** Anyone can host their own (open-source server). Clans, modding communities, tournament organizers. Useful for private content, regional servers, or alternative curation policies.

**Local directory:** A folder on disk that follows the same structure. Works offline. Ideal for mod developers testing before publishing, or LAN-party content distribution.

### Open Question: Single vs Multi-Source

> **Undecided:** Should the client support multiple active workshop sources simultaneously (merge listings from several servers), or limit to one at a time?
>
> - **Single source** — simpler UI, no conflict resolution, no duplicate detection. Switch between sources explicitly.
> - **Multi-source** — more flexible, but needs deduplication, priority ordering, and conflict handling when two sources provide the same resource.
>
> Leaning toward single source for simplicity. Revisit if community demand emerges.

### LLM Integration

The `ra-llm` crate can access workshop content as context for generation:
- Browse existing maps for terrain style inspiration
- Reference community unit definitions when generating missions
- Pull asset packs to use in generated content
- **Reference workshop media** (videos, cutscenes) in generated scenarios — e.g., an LLM-generated mission can include `video_playback` scene triggers that pull community-created briefing videos from the workshop
- Publish generated missions directly to the workshop for sharing

The LLM sees workshop resources through their `ai_meta` fields. A video tagged `summary: "Soviet commander briefing, urgent tone, 30 seconds"` lets the LLM intelligently select it for a mission's opening briefing trigger.

### Workshop API

```rust
pub trait WorkshopClient: Send + Sync {
    fn browse(&self, filter: &ResourceFilter) -> Result<Vec<ResourceListing>>;
    fn download(&self, id: &ResourceId) -> Result<ResourcePackage>;
    fn publish(&self, package: &ResourcePackage) -> Result<ResourceId>;
    fn rate(&self, id: &ResourceId, rating: Rating) -> Result<()>;
    fn search(&self, query: &str, category: ResourceCategory) -> Result<Vec<ResourceListing>>;
}

pub struct ResourcePackage {
    pub meta: ResourceMeta,           // name, author, version, description, tags
    pub ai_meta: Option<AiResourceMeta>, // LLM-readable description (see below)
    pub category: ResourceCategory,   // Mod, Map, Mission, MissionTemplate, Campaign, Asset
    pub files: Vec<PackageFile>,      // the actual content (YAML, Lua, sprites, etc.)
    pub dependencies: Vec<ResourceId>,// other workshop items this requires
    pub compatibility: VersionInfo,   // engine version + mod version this targets
}

/// LLM/AI-readable metadata for workshop resources.
/// Enables intelligent browsing, selection, and composition by ra-llm.
pub struct AiResourceMeta {
    pub summary: String,              // one-line: "A 4-player desert skirmish map with limited ore"
    pub purpose: String,              // when/why to use this: "Best for competitive 2v2 with scarce resources"
    pub gameplay_tags: Vec<String>,   // semantic: ["desert", "2v2", "competitive", "scarce_resources"]
    pub difficulty: Option<String>,   // for missions/campaigns: "hard", "beginner-friendly"
    pub composition_hints: Option<String>, // how this combines with other resources
}
```

## AI-Readable Resource Metadata

Every game resource — units, weapons, structures, maps, mods, templates — carries structured metadata designed for consumption by LLMs and AI systems. This is not documentation for humans (that's `display.name` and README files). This is **machine-readable semantic context** that enables AI to reason about game content.

### Why This Matters

Traditional game data is structured for the engine: cost, health, speed, damage. An LLM reading `cost: 100, health: 50, speed: 56, weapon: m1_carbine` can parse the numbers but cannot infer *purpose*. It doesn't know that rifle infantry is a cheap scout, that it's useless against tanks, or that it should be built in groups of 5+.

The `ai:` metadata block bridges this gap. It gives LLMs and AI systems the strategic and tactical context that experienced players carry in their heads.

### What Consumes It

| Consumer                          | How It Uses `ai:` Metadata                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ra-llm` (mission generation)** | Selects appropriate units for scenarios. "A hard mission" → picks units with `role: siege` and high counters. "A stealth mission" → picks units with `role: scout, infiltrator`. |
| **`ra-ai` (skirmish AI)**         | Reads `counters`/`countered_by` for build decisions. Knows to build anti-air when enemy has `role: air`. Reads `tactical_notes` for positioning hints.                           |
| **Workshop search**               | Semantic search: "a map for beginners" matches `difficulty: beginner-friendly`. "Something for a tank rush" matches `gameplay_tags: ["open_terrain", "abundant_resources"]`.     |
| **Future in-game AI advisor**     | "What should I build?" → reads enemy composition's `countered_by`, suggests units with matching `role`.                                                                          |
| **Mod compatibility analysis**    | Detects when a mod changes a unit's `role` or `counters` in ways that affect balance.                                                                                            |

### Metadata Format (on game resources)

The `ai:` block is optional on every resource type. It follows a consistent schema:

```yaml
# On units / weapons / structures:
ai:
  summary: "One-line natural language description"
  role: [semantic, tags, for, classification]
  strengths: [what, this, excels, at]
  weaknesses: [what, this, is, bad, at]
  tactical_notes: "Free-text tactical guidance for AI reasoning"
  counters: [unit_types, this, beats]
  countered_by: [unit_types, that, beat, this]

# On maps:
ai:
  summary: "4-player island map with contested center bridge"
  gameplay_tags: [islands, naval, chokepoint, 4player]
  tactical_notes: "Control the center bridge for resource access. Naval early game is critical."

# On weapons:
ai:
  summary: "Long-range anti-structure artillery"
  role: [siege, anti_structure]
  strengths: [long_range, high_structure_damage, area_of_effect]
  weaknesses: [slow_fire_rate, inaccurate_vs_moving, minimum_range]
```

### Metadata Format (on workshop resources)

Workshop resources carry `AiResourceMeta` in their package manifest:

```yaml
# workshop manifest for a mission template
ai_meta:
  summary: "Defend a bridge against 5 waves of Soviet armor"
  purpose: "Good for practicing defensive tactics with limited resources"
  gameplay_tags: [defense, bridge, waves, armor, intermediate]
  difficulty: "intermediate"
  composition_hints: "Pairs well with the 'reinforcements' scene template for a harder variant"
```

This metadata is indexed by the workshop server for semantic search. When an LLM needs to find "a scene template for an ambush in a forest," it searches `gameplay_tags` and `summary`, not filenames.

### Design Rules

1. **`ai:` is always optional.** Resources work without it. Legacy content and OpenRA imports won't have it initially — it can be added incrementally, by humans or by LLMs.
2. **Human-written is preferred, LLM-generated is acceptable.** When a modder publishes to the workshop without `ai_meta`, the system can offer to auto-generate it from the resource's data (unit stats, map layout, etc.). The modder reviews and approves.
3. **Tags use a controlled vocabulary.** `role`, `strengths`, `weaknesses`, `counters`, and `gameplay_tags` draw from a published tag dictionary (extensible by mods). This prevents tag drift where the same concept has five spellings.
4. **`tactical_notes` is free-text.** This is the field where nuance lives. "Build 5+ to be cost-effective" or "Position behind walls for maximum effectiveness" — advice that can't be captured in tags.
5. **Metadata is part of the YAML spec, not a sidecar.** It lives in the same file as the resource definition. No separate metadata files to lose or desync.
