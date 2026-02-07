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
    llm:
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
    llm: Option<LlmMeta>,
    buildable: Option<BuildableInfo>,
    health: HealthInfo,
    mobile: Option<MobileInfo>,
    combat: Option<CombatInfo>,
}

/// LLM-readable metadata for any game resource.
/// Consumed by ra-llm (mission generation), ra-ai (skirmish AI),
/// and workshop search (semantic matching).
#[derive(Deserialize, Serialize)]
struct LlmMeta {
    summary: String,                    // one-line natural language description
    role: Vec<String>,                  // semantic tags: anti_infantry, scout, siege, etc.
    strengths: Vec<String>,             // what this unit is good at
    weaknesses: Vec<String>,            // what this unit is bad at
    tactical_notes: Option<String>,     // free-text tactical guidance for LLM
    counters: Vec<String>,              // unit types this is effective against
    countered_by: Vec<String>,          // unit types that counter this
}
```

### MiniYAML Migration & Runtime Loading

**Converter tool:** `ra-formats` includes a `miniyaml2yaml` CLI converter that translates existing OpenRA mod data to standard YAML. Available for permanent, clean migration.

**Runtime loading (D025):** MiniYAML files also load directly at runtime — no pre-conversion required. When `ra-formats` detects tab-indented content with `^` inheritance or `@` suffixes, it auto-converts in memory. The result is identical to what the converter would produce. This means existing OpenRA mods can be dropped into IC and played immediately.

```
┌─────────────────────────────────────────────────────────┐
│           MiniYAML Loading Pipeline                     │
│                                                         │
│  .yaml file ──→ Format detection                        │
│                   │                                     │
│                   ├─ Standard YAML → serde_yaml parse   │
│                   │                                     │
│                   └─ MiniYAML detected                  │
│                       │                                 │
│                       ├─ MiniYAML parser (tabs, ^, @)   │
│                       ├─ Intermediate tree              │
│                       ├─ Alias resolution (D023)        │
│                       └─ Typed Rust structs             │
│                                                         │
│  Both paths produce identical output.                   │
│  Runtime conversion adds ~10-50ms per mod (cached).     │
└─────────────────────────────────────────────────────────┘
```

### OpenRA Vocabulary Aliases (D023)

OpenRA trait names are accepted as aliases for IC-native YAML keys. Both forms are valid:

```yaml
# OpenRA-style (accepted via alias)
rifle_infantry:
    Armament:
        Weapon: M1Carbine
    Valued:
        Cost: 100

# IC-native style (preferred)
rifle_infantry:
    combat:
        weapon: m1_carbine
    buildable:
        cost: 100
```

The alias registry lives in `ra-formats` and maps all ~130 OpenRA trait names to IC components. When an alias is used, parsing succeeds with a deprecation warning: `"Armament" is accepted but deprecated; prefer "combat"`. Warnings can be suppressed per-mod.

### OpenRA Mod Manifest Loading (D026)

IC can parse OpenRA's `mod.yaml` manifest format directly. Point IC at an existing OpenRA mod directory:

```bash
# Run an OpenRA mod directly (auto-converts at load time)
ic mod run --openra-dir /path/to/openra-mod/

# Import for permanent migration
ic mod import /path/to/openra-mod/ --output ./my-ic-mod/
```

Sections like `Rules`, `Sequences`, `Weapons`, `Maps`, `Voices`, `Music` are mapped to IC equivalents. `Assemblies` (C# DLLs) are flagged as warnings — units using unavailable traits get placeholder rendering.

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

### Lua API — Strict Superset of OpenRA (D024)

Iron Curtain's Lua API is a **strict superset** of OpenRA's 16 global objects. All OpenRA Lua missions run unmodified — same function names, same parameter signatures, same return types.

**OpenRA-compatible globals (all supported identically):**

| Global           | Purpose                            |
| ---------------- | ---------------------------------- |
| `Actor`          | Create, query, manipulate actors   |
| `Map`            | Terrain, bounds, spatial queries   |
| `Trigger`        | Event hooks (OnKilled, AfterDelay) |
| `Media`          | Audio, video, text display         |
| `Player`         | Player state, resources, diplomacy |
| `Reinforcements` | Spawn units at edges/drops         |
| `Camera`         | Pan, position, shake               |
| `DateTime`       | Game time queries                  |
| `Objectives`     | Mission objective management       |
| `Lighting`       | Global lighting control            |
| `UserInterface`  | UI text, notifications             |
| `Utils`          | Math, random, table utilities      |
| `Beacon`         | Map beacon management              |
| `Radar`          | Radar ping control                 |
| `HSLColor`       | Color construction                 |
| `WDist`          | Distance unit conversion           |

**IC-exclusive extensions (additive, no conflicts):**

| Global     | Purpose                         |
| ---------- | ------------------------------- |
| `Campaign` | Branching campaign state (D021) |
| `Weather`  | Dynamic weather control (D022)  |
| `Workshop` | Mod metadata queries            |
| `LLM`      | LLM integration hooks (Phase 7) |

Each actor reference exposes properties matching its components (`.Health`, `.Location`, `.Owner`, `.Move()`, `.Attack()`, `.Stop()`, `.Guard()`, `.Deploy()`, etc.) — identical to OpenRA's actor property groups.

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
Campaign Graph    — branching mission graph with persistent state (not a linear sequence)
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
| `weather`         | type, intensity, trigger, duration, sim_effects        | Weather system — see weather effects below                     |
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

**`weather` scene template:**

Weather effects are GPU particle systems rendered by `ra-render`, with optional gameplay modifiers applied by `ra-sim`.

| Type        | Visual Effect                                                    | Optional Sim Effect (if `sim_effects: true`)                   |
| ----------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| `rain`      | GPU particle rain, puddle reflections, darkened ambient lighting | Reduced visibility range (−20%), slower wheeled vehicles       |
| `snow`      | GPU particle snowfall, accumulation on terrain, white fog        | Reduced movement speed (−15%), reduced visibility (−30%)       |
| `sandstorm` | Dense particle wall, orange tint, reduced draw distance          | Heavy visibility reduction (−50%), damage to exposed infantry  |
| `blizzard`  | Heavy snow + wind particles, near-zero visibility                | Severe speed/visibility penalty, periodic cold damage          |
| `fog`       | Volumetric fog shader, reduced contrast at distance              | Reduced visibility range (−40%), no other penalties            |
| `storm`     | Rain + lightning flashes + screen shake + thunder audio          | Same as rain + random lightning strikes (cosmetic or damaging) |

**Key design principle:** Weather is split into two layers:
- **Render layer** (`ra-render`): Always active. GPU particles, shaders, post-FX, ambient audio changes. Pure cosmetic, zero sim impact. Particle density scales with `RenderSettings` for lower-end devices.
- **Sim layer** (`ra-sim`): Optional, controlled by `sim_effects` parameter. When enabled, weather modifies visibility ranges, movement speeds, and damage — deterministically, so multiplayer stays in sync. When disabled, weather is purely cosmetic eye candy.

Weather can be set per-map (in map YAML), triggered mid-mission by Lua scripts, or composed via the `weather` scene template. An LLM generating a "blizzard defense" mission sets `type: blizzard, sim_effects: true` and gets both the visual atmosphere and the gameplay tension.

### Dynamic Weather System (D022)

The base weather system above covers static, per-mission weather. The **dynamic weather system** extends it with real-time weather transitions and terrain texture effects during gameplay — snow accumulates on the ground, rain darkens and wets surfaces, sunshine dries everything out.

#### Weather State Machine

Weather transitions are modeled as a state machine running inside `ra-sim`. The machine is deterministic — same schedule + same tick = identical weather on every client.

```
     ┌──────────┐      ┌───────────┐      ┌──────────┐
     │  Sunny   │─────▶│ Overcast  │─────▶│   Rain   │
     └──────────┘      └───────────┘      └──────────┘
          ▲                                     │
          │            ┌───────────┐            │
          └────────────│ Clearing  │◀───────────┘
                       └───────────┘            │
                            ▲           ┌──────────┐
                            └───────────│  Storm   │
                                        └──────────┘

     ┌──────────┐      ┌───────────┐      ┌──────────┐
     │  Clear   │─────▶│  Cloudy   │─────▶│   Snow   │
     └──────────┘      └───────────┘      └──────────┘
          ▲                                     │
          └─────────────────────────────────────┘
                    (melt / thaw)
```

Each weather type has an **intensity** (fixed-point `0..1024`) that ramps up during transitions and down during clearing. The sim tracks this as a `WeatherState` resource:

```rust
/// ra-sim: deterministic weather state
pub struct WeatherState {
    pub current: WeatherType,
    pub intensity: FixedPoint,       // 0 = clear, 1024 = full
    pub transitioning_to: Option<WeatherType>,
    pub transition_progress: FixedPoint,  // 0..1024
    pub ticks_in_current: u32,
}
```

#### Weather Schedule (YAML)

Maps define a weather schedule — the rules for how weather evolves. Three modes:

```yaml
# maps/winter_assault/map.yaml
weather:
  schedule:
    mode: cycle           # cycle | random | scripted
    default: sunny
    seed_from_match: true # random mode uses match seed (deterministic)

    states:
      sunny:
        min_duration: 300   # minimum ticks before transition
        max_duration: 600
        transitions:
          - to: overcast
            weight: 60      # relative probability
          - to: cloudy
            weight: 40

      overcast:
        min_duration: 120
        max_duration: 240
        transitions:
          - to: rain
            weight: 70
          - to: sunny
            weight: 30
        transition_time: 30  # ticks to blend between states

      rain:
        min_duration: 200
        max_duration: 500
        transitions:
          - to: storm
            weight: 20
          - to: clearing
            weight: 80
        sim_effects: true    # enables gameplay modifiers

      snow:
        min_duration: 300
        max_duration: 800
        transitions:
          - to: clearing
            weight: 100
        sim_effects: true

      clearing:
        min_duration: 60
        max_duration: 120
        transitions:
          - to: sunny
            weight: 100
        transition_time: 60

    surface:
      snow:
        accumulation_rate: 2    # fixed-point units per tick while snowing
        max_depth: 1024
        melt_rate: 1            # per tick when not snowing
      rain:
        wet_rate: 4             # per tick while raining
        dry_rate: 2             # per tick when not raining
      temperature:
        base: 512              # 0 = freezing, 1024 = hot
        sunny_warming: 1       # per tick
        snow_cooling: 2        # per tick
```

- **`cycle`** — deterministic round-robin through states per the transition weights and durations.
- **`random`** — weighted random using the match seed. Same seed = same weather progression on all clients.
- **`scripted`** — no automatic transitions; weather changes only when Lua calls `Weather.transition_to()`.

Lua can override the schedule at any time:

```lua
-- Force a blizzard for dramatic effect at mission climax
Weather.transition_to("blizzard", 45)  -- 45-tick transition
Weather.set_intensity(900)             -- near-maximum

-- Query current state
local w = Weather.get_state()
print(w.current)     -- "blizzard"
print(w.intensity)   -- 900
print(w.surface.snow_depth)  -- per-map average
```

#### Terrain Surface State (Sim Layer)

When `sim_effects` is enabled, the sim maintains a per-cell `TerrainSurfaceGrid` — a compact grid tracking how weather has physically altered the terrain. This is **deterministic** and affects gameplay.

```rust
/// ra-sim: per-cell surface condition
pub struct SurfaceCondition {
    pub snow_depth: FixedPoint,   // 0 = bare ground, 1024 = deep snow
    pub wetness: FixedPoint,      // 0 = dry, 1024 = waterlogged
}

/// Grid resource, one entry per map cell
pub struct TerrainSurfaceGrid {
    pub cells: Vec<SurfaceCondition>,
    pub width: u32,
    pub height: u32,
}
```

The `weather_surface_system` runs every tick (after weather state update, before movement):

| Condition               | Effect on Surface                                    |
| ----------------------- | ---------------------------------------------------- |
| Snowing                 | `snow_depth += accumulation_rate × intensity / 1024` |
| Not snowing, sunny      | `snow_depth -= melt_rate` (clamped at 0)             |
| Raining                 | `wetness += wet_rate × intensity / 1024`             |
| Not raining             | `wetness -= dry_rate` (clamped at 0)                 |
| Snow melting            | `wetness += melt_rate` (meltwater)                   |
| Temperature < threshold | Puddles freeze → wet cells become icy                |

**Sim effects from surface state (when `sim_effects: true`):**

| Surface State        | Gameplay Effect                                                      |
| -------------------- | -------------------------------------------------------------------- |
| Deep snow (> 512)    | Infantry −20% speed, wheeled −30%, tracked −10%                      |
| Ice (frozen wetness) | Water tiles become passable; all ground units slide (−15% turn rate) |
| Wet ground (> 256)   | Wheeled −15% speed; no effect on tracked/infantry                    |
| Muddy (wet + warm)   | Wheeled −25% speed, tracked −10%; infantry unaffected                |
| Dry / sunny          | No penalties; baseline movement                                      |

These modifiers stack with the weather-type modifiers from the base weather table. A blizzard over deep snow is brutal.

**Snapshot compatibility:** `TerrainSurfaceGrid` derives `Serialize, Deserialize` — surface state is captured in save games and snapshots per invariant #10.

#### Terrain Texture Effects (Render Layer)

`ra-render` reads the sim's `TerrainSurfaceGrid` and blends terrain visuals accordingly. This is **purely cosmetic** — it has no effect on the sim and runs at whatever quality the device supports.

Three rendering strategies, selectable via `RenderSettings`:

| Strategy            | Quality | Cost      | Description                                                                                                                                                   |
| ------------------- | ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Palette tinting** | Low     | Near-zero | Shift terrain palette toward white (snow) or darker (wet). Authentic to original RA palette tech. No extra assets needed.                                     |
| **Overlay sprites** | Medium  | One pass  | Draw semi-transparent snow/puddle/ice overlays on top of base terrain tiles. Requires overlay sprite sheets (shipped with engine or mod-provided).            |
| **Shader blending** | High    | GPU blend | Fragment shader blends between base texture and weather-variant texture per tile. Smoothest transitions, gradual accumulation. Requires variant texture sets. |

Default: **palette tinting** (works everywhere, zero asset requirements). Mods that ship weather-variant sprites get overlay or shader blending automatically.

**Accumulation visuals** (shader blending mode):
- Snow doesn't appear uniformly — it starts on tile edges, elevated features, and rooftops, then fills inward as `snow_depth` increases
- Rain creates puddle sprites in low-lying cells first, then spreads to flat ground
- Drying happens as a gradual desaturation back to base palette
- Blend factor = `surface_condition_value / 1024` — smooth interpolation

**Performance considerations:**
- Palette tinting: no extra draw calls, no extra textures, negligible GPU cost
- Overlay sprites: one additional sprite draw per affected cell — batched via Bevy's sprite batching
- Shader blending: texture array per terrain type (base + snow + wet variants), single draw call per terrain chunk with per-vertex blend weights
- Particle density for weather effects already scales with `RenderSettings` (existing design)
- Surface texture updates are amortized: only cells near weather transitions or visible cells update their blend factors each frame

#### Day/Night and Seasonal Integration

Dynamic weather composes naturally with other environmental systems:

- **Day/night cycle:** Ambient lighting shifts interact with weather — overcast days are darker, rain at night is nearly black with lightning flashes, sunny midday is brightest
- **Seasonal maps:** A map can set `temperature.base` low (winter map) so any rain becomes snow, or high (desert) where `sandstorm` replaces `rain` in the state machine
- **Map-specific overrides:** Arctic maps default to snow schedule; desert maps disable snow transitions; tropical maps always rain

#### Modding Weather

Weather is fully moddable at every tier:

- **Tier 1 (YAML):** Define custom weather schedules, tune surface rates, adjust sim effect values, choose blend strategy, create seasonal presets
- **Tier 2 (Lua):** Trigger weather transitions at story moments, query surface state for mission objectives ("defend until the blizzard clears"), create weather-dependent triggers
- **Tier 3 (WASM):** Implement custom weather types (acid rain, ion storms, radiation clouds) with new particles, new sim effects, and custom surface state logic

```yaml
# Example: Tiberian Sun ion storm (custom weather type via mod)
weather_types:
  ion_storm:
    particles: ion_storm_particles.shp
    palette_tint: [0.2, 0.8, 0.3]  # green tint
    sim_effects:
      aircraft_grounded: true
      radar_disabled: true
      lightning_damage: 50
      lightning_interval: 120  # ticks between strikes
    surface:
      contamination_rate: 1
      max_contamination: 512
    render:
      strategy: shader_blend
      variant_suffix: "_ion"
```

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

Scene templates and mission templates are both first-class workshop resource types — shared, rated, versioned, and downloadable like any other content. See the full resource category taxonomy in the [Workshop Resource Registry](#workshop-resource-registry--dependency-system-d030) section below.

| Type                  | Contents                                 | Examples                                         |
| --------------------- | ---------------------------------------- | ------------------------------------------------ |
| Mods                  | YAML rules + Lua scripts + WASM modules  | Total conversions, balance patches, new factions |
| Maps                  | `.oramap` or native map format           | Skirmish maps, campaign maps, tournament pools   |
| Missions              | YAML map + Lua triggers + briefing       | Hand-crafted or LLM-generated scenarios          |
| **Scene Templates**   | **Tera-templated Lua + schema**          | **Reusable sub-mission building blocks**         |
| **Mission Templates** | **Tera templates + scene refs + schema** | **Full parameterized mission blueprints**        |
| Campaigns             | Ordered mission sets + narrative         | Multi-mission storylines                         |
| Music                 | Audio tracks (`.ogg`, `.mp3`, `.flac`)   | Custom soundtracks, faction themes, menu music   |
| Sound Effects         | Audio clips                              | Weapon sounds, ambient loops, UI feedback        |
| Voice Lines           | Audio clips + trigger metadata           | EVA packs, unit responses, faction voice sets    |
| Sprites               | `.shp`, `.png`, sprite sheets            | HD unit packs, building sprites, effects packs   |
| Textures              | Terrain tiles, UI skins                  | Theater tilesets, seasonal terrain variants      |
| Palettes              | `.pal` files                             | Theater palettes, faction colors, seasonal       |
| Cutscenes / Video     | `.vqa`, `.mp4`, `.webm`                  | Custom briefings, cinematics, narrative videos   |
| UI Themes             | Chrome layouts, fonts, cursors           | Alternative sidebars, HD cursor packs            |
| Balance Presets       | YAML rule overrides                      | Competitive tuning, historical accuracy presets  |

## Campaign System (Branching, Persistent, Continuous)

*Inspired by Operation Flashpoint: Cold War Crisis / Resistance. See D021.*

OpenRA's campaigns are disconnected: each mission is standalone, you exit to menu between them, there's no flow. Our campaigns are **continuous, branching, and stateful** — a directed graph of missions with persistent state, multiple outcomes per mission, and no mandatory game-over screen.

### Core Principles

1. **Campaign is a graph, not a list.** Missions connect via named outcomes, forming branches, convergence points, and optional paths — not a linear sequence.
2. **Missions have multiple outcomes, not just win/lose.** "Won with bridge intact" and "Won but bridge destroyed" are different outcomes that lead to different next missions.
3. **Failure doesn't end the campaign.** A "defeat" outcome is just another edge in the graph. The designer chooses: branch to a fallback mission, retry with fewer resources, or skip ahead with consequences. "No game over" campaigns are possible.
4. **State persists across missions.** Surviving units, veterancy, captured equipment, story flags, resources — all carry forward based on designer-configured carryover rules.
5. **Continuous flow.** Briefing → mission → debrief → next mission. No exit to menu between levels (unless the player explicitly quits).

### Campaign Definition (YAML)

```yaml
# campaigns/allied/campaign.yaml
campaign:
  id: allied_campaign
  title: "Allied Campaign"
  description: "Drive back the Soviet invasion across Europe"
  start_mission: allied_01

  # What persists between missions (campaign-wide defaults)
  persistent_state:
    unit_roster: true          # surviving units carry forward
    veterancy: true            # unit experience persists
    resources: false           # credits reset per mission
    equipment: true            # captured vehicles/crates persist
    custom_flags: {}           # arbitrary Lua-writable key-value state

  missions:
    allied_01:
      map: missions/allied-01
      briefing: briefings/allied-01.yaml
      video: videos/allied-01-briefing.vqa
      carryover:
        from_previous: none    # first mission — nothing carries
      outcomes:
        victory_bridge_intact:
          description: "Bridge secured intact"
          next: allied_02a
          debrief: briefings/allied-01-debrief-bridge.yaml
          state_effects:
            set_flag: { bridge_status: intact }
        victory_bridge_destroyed:
          description: "Won but bridge was destroyed"
          next: allied_02b
          state_effects:
            set_flag: { bridge_status: destroyed }
        defeat:
          description: "Base overrun"
          next: allied_01_fallback
          state_effects:
            set_flag: { retreat_count: +1 }

    allied_02a:
      map: missions/allied-02a    # different map — bridge crossing
      briefing: briefings/allied-02a.yaml
      carryover:
        units: surviving          # units from mission 01 appear
        veterancy: keep           # their experience carries
        equipment: keep           # captured Soviet tanks too
      conditions:                 # optional entry conditions
        require_flag: { bridge_status: intact }
      outcomes:
        victory:
          next: allied_03
        defeat:
          next: allied_02_fallback

    allied_02b:
      map: missions/allied-02b    # different map — river crossing without bridge
      briefing: briefings/allied-02b.yaml
      carryover:
        units: surviving
        veterancy: keep
      outcomes:
        victory:
          next: allied_03         # branches converge at mission 03
        defeat:
          next: allied_02_fallback

    allied_01_fallback:
      map: missions/allied-01-retreat
      briefing: briefings/allied-01-retreat.yaml
      carryover:
        units: surviving          # fewer units since you lost
        veterancy: keep
      outcomes:
        victory:
          next: allied_02b        # after retreating, you take the harder path
          state_effects:
            set_flag: { morale: low }

    allied_03:
      map: missions/allied-03
      # ...branches converge here regardless of path taken
```

### Campaign Graph Visualization

```
                    ┌─────────────┐
                    │  allied_01  │
                    └──┬───┬───┬──┘
          bridge ok ╱   │       ╲ defeat
                  ╱     │         ╲
    ┌────────────┐  bridge   ┌─────────────────┐
    │ allied_02a │  destroyed│ allied_01_       │
    └─────┬──────┘      │   │ fallback         │
          │       ┌─────┴───┐└────────┬────────┘
          │       │allied_02b│        │
          │       └────┬─────┘        │
          │            │         joins 02b
          └─────┬──────┘
                │ converge
          ┌─────┴──────┐
          │  allied_03  │
          └─────────────┘
```

This is a **directed acyclic graph** (with optional cycles for retry loops). The engine validates campaign graphs at load time: no orphan nodes, all outcome targets exist, start mission is defined.

### Unit Roster & Persistence

Inspired by Operation Flashpoint: Resistance — surviving units are precious resources that carry forward, creating emotional investment and strategic consequences.

**Unit Roster:**
```rust
/// Persistent unit state that carries between campaign missions.
#[derive(Serialize, Deserialize, Clone)]
pub struct RosterUnit {
    pub unit_type: UnitTypeId,        // e.g., "medium_tank", "tanya"
    pub name: Option<String>,         // optional custom name
    pub veterancy: VeterancyLevel,    // rookie → veteran → elite → heroic
    pub kills: u32,                   // lifetime kill count
    pub missions_survived: u32,       // how many missions this unit has lived through
    pub equipment: Vec<EquipmentId>,  // OFP:R-style captured/found equipment
    pub custom_state: HashMap<String, Value>, // mod-extensible per-unit state
}
```

**Carryover modes** (per campaign transition):

| Mode        | Behavior                                                                                |
| ----------- | --------------------------------------------------------------------------------------- |
| `none`      | Clean slate — the next mission provides its own units                                   |
| `surviving` | All player units alive at mission end join the roster                                   |
| `extracted` | Only units inside a designated extraction zone carry over (OFP-style "get to the evac") |
| `selected`  | Lua script explicitly picks which units carry over                                      |
| `custom`    | Full Lua control — script reads unit list, decides what persists                        |

**Veterancy across missions:**
- Units gain experience from kills and surviving missions
- A veteran tank from mission 1 is still veteran in mission 5
- Losing a veteran unit hurts — they're irreplaceable until you earn new ones
- Veterancy grants stat bonuses (configurable in YAML rules, per balance preset)

**Equipment persistence (OFP: Resistance model):**
- Captured enemy vehicles at mission end go into the equipment pool
- Found supply crates add to available equipment
- Next mission's starting loadout can draw from the equipment pool
- Modders can define custom persistent items

### Campaign State

```rust
/// Full campaign progress — serializable for save games.
#[derive(Serialize, Deserialize, Clone)]
pub struct CampaignState {
    pub campaign_id: CampaignId,
    pub current_mission: MissionId,
    pub completed_missions: Vec<CompletedMission>,
    pub unit_roster: Vec<RosterUnit>,
    pub equipment_pool: Vec<EquipmentId>,
    pub resources: i64,               // persistent credits (if enabled)
    pub flags: HashMap<String, Value>, // story flags set by Lua
    pub stats: CampaignStats,         // cumulative performance
    pub path_taken: Vec<MissionId>,   // breadcrumb trail for replay/debrief
}

pub struct CompletedMission {
    pub mission_id: MissionId,
    pub outcome: String,              // the named outcome key
    pub time_taken: Duration,
    pub units_lost: u32,
    pub units_gained: u32,
    pub score: i64,
}
```

Campaign state is fully serializable (invariant #10 — snapshottable). Save games capture the entire campaign progress. Replays can replay an entire campaign run, not just individual missions.

### Lua Campaign API

Mission scripts interact with campaign state through a sandboxed API:

```lua
-- === Reading campaign state ===

-- Get the unit roster (surviving units from previous missions)
local roster = Campaign.get_roster()
for _, unit in ipairs(roster) do
    -- Spawn each surviving unit at a designated entry point
    local spawned = SpawnUnit(unit.type, entry_point)
    spawned:set_veterancy(unit.veterancy)
    spawned:set_name(unit.name)
end

-- Read story flags set by previous missions
if Campaign.get_flag("bridge_status") == "intact" then
    -- Bridge exists on this map — open the crossing
    bridge_actor:set_state("intact")
else
    -- Bridge was destroyed — it's rubble
    bridge_actor:set_state("destroyed")
end

-- Check cumulative stats
if Campaign.get_stat("total_units_lost") > 50 then
    -- Player has been losing lots of units — offer reinforcements
    trigger_reinforcements()
end

-- === Writing campaign state ===

-- Signal mission completion with a named outcome
function OnObjectiveComplete()
    if bridge:is_alive() then
        Campaign.complete("victory_bridge_intact")
    else
        Campaign.complete("victory_bridge_destroyed")
    end
end

-- Set custom flags for future missions to read
Campaign.set_flag("captured_radar", true)
Campaign.set_flag("enemy_morale", "broken")

-- Update roster: mark which units survived
-- (automatic if carryover mode is "surviving" — manual if "selected")
function OnMissionEnd()
    local survivors = GetPlayerUnits():alive()
    for _, unit in ipairs(survivors) do
        Campaign.roster_add(unit)
    end
end

-- Add captured equipment to persistent pool
function OnEnemyVehicleCaptured(vehicle)
    Campaign.equipment_add(vehicle.type)
end

-- Failure doesn't mean game over — it's just another outcome
function OnPlayerBaseDestroyed()
    Campaign.complete("defeat")  -- campaign graph decides what happens next
end
```

### Adaptive Difficulty via Campaign State

Campaign state enables dynamic difficulty without an explicit slider:

```yaml
# In a mission's carryover config:
adaptive:
  # If player lost the previous mission, give them extra resources
  on_previous_defeat:
    bonus_resources: 2000
    bonus_units: [medium_tank, medium_tank, rifle_infantry, rifle_infantry]
  # If player blitzed the previous mission, make this one harder
  on_previous_fast_victory:    # completed in < 50% of par time
    extra_enemy_waves: 1
    enemy_veterancy_boost: 1
  # Scale to cumulative performance
  scaling:
    low_roster:                # < 5 surviving units
      reinforcement_schedule: accelerated
    high_roster:               # > 20 surviving units
      enemy_count_multiplier: 1.3
```

This is not AI-adaptive difficulty (that's D016/`ra-llm`). This is **designer-authored conditional logic** expressed in YAML — the campaign reacts to the player's cumulative performance without any LLM involvement.

### LLM Campaign Generation

The LLM (`ra-llm`) can generate entire campaign graphs, not just individual missions:

```
User: "Create a 5-mission Soviet campaign where you invade Alaska.
       The player should be able to lose a mission and keep going
       with consequences. Units should carry over between missions."

LLM generates:
  → campaign.yaml (graph with 5+ nodes, branching on outcomes)
  → 5-7 mission files (main path + fallback branches)
  → Lua scripts with Campaign API calls
  → briefing text for each mission
  → carryover rules per transition
```

The template/scene system makes this tractable — the LLM composes from known building blocks rather than generating raw code. Campaign graphs are validated at load time (no orphan nodes, all outcomes have targets).

### Configurable Workshop Server

The Workshop is a **universal artifact repository for game resources** — an Artifactory-style federated registry (D030). The client aggregates listings from multiple sources simultaneously via a virtual repository view, with priority-based deduplication.

Just as JFrog Artifactory stores Maven, npm, Docker, and PyPI artifacts under one roof with unified metadata and federation, our Workshop stores music, sprites, maps, mods, and every other game asset type under one registry with semver, license tracking, integrity verification, and multi-source resolution.

#### Repository Types (Artifactory Model)

The Workshop uses three repository types, directly inspired by Artifactory:

| Repository Type | Artifactory Analog | Description                                                                                                                                                                                                                                                 |
| --------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local**       | Local repository   | A directory on disk following Workshop structure. Stores artifacts you create. Used for development, LAN parties, offline play, pre-publish testing.                                                                                                        |
| **Remote**      | Remote repository  | A Workshop server (official or community-hosted). Artifacts are downloaded and cached locally on first access. Cache is used for subsequent requests — works offline after first pull.                                                                      |
| **Virtual**     | Virtual repository | The aggregated view across all configured sources. The `ic` CLI and in-game browser query the virtual repository — it merges listings from all local + remote sources, deduplicates by resource ID, and resolves version conflicts using priority ordering. |

```yaml
# settings.yaml
workshop:
  sources:
    - url: "https://workshop.ironcurtain.gg"     # remote: official (always included, default)
      priority: 1                                 # highest priority in virtual view
    - url: "https://mods.myclan.com/workshop"     # remote: community-hosted
      priority: 2
    - path: "C:/my-local-workshop"                # local: directory on disk
      priority: 3
  deduplicate: true               # same resource ID from multiple sources → highest priority wins
  cache_dir: "~/.ic/cache"        # local cache for remote artifacts
```

**Official server (remote):** We host one. Default for all players. Curated categories, search, ratings, download counts.

**Community servers (remote):** Anyone can host their own (open-source server binary, same Rust stack as relay/tracking servers). Clans, modding communities, tournament organizers. Useful for private content, regional servers, or alternative curation policies.

**Local directory (local):** A folder on disk that follows the Workshop directory structure. Works fully offline. Ideal for mod developers testing before publishing, or LAN-party content distribution.

**Virtual view:** The `ic` CLI and in-game browser always query the virtual repository — they never talk to raw servers directly. The virtual view merges all configured sources, handles deduplication, and respects priority ordering. This is transparent to the user.

#### Artifact Integrity

Every published artifact includes cryptographic checksums for integrity verification:

- **SHA-256 checksum** stored in the package manifest and on the Workshop server
- `ic mod install` verifies checksums after download — mismatch → abort + warning
- `ic.lock` records both version AND SHA-256 checksum for each dependency — guarantees byte-identical installs across machines
- Protects against: corrupted downloads, CDN tampering, mirror drift
- Workshop server computes checksums on upload; clients verify on download

#### Promotion & Maturity Channels

Artifacts can be published to maturity channels, allowing staged releases:

| Channel   | Purpose                         | Visibility                      |
| --------- | ------------------------------- | ------------------------------- |
| `dev`     | Work-in-progress, local testing | Author only (local repos only)  |
| `beta`    | Pre-release, community testing  | Opt-in (users enable beta flag) |
| `release` | Stable, production-ready        | Default (everyone sees these)   |

```
ic mod publish --channel beta     # visible only to users who opt in to beta
ic mod publish                    # release channel (default)
ic mod promote 1.3.0-beta.1 release  # promote without re-upload
ic mod install --include-beta     # pull beta resources
```

#### Replication & Mirroring

Community Workshop servers can replicate from the official server (pull replication, Artifactory-style):

- **Pull replication:** Community server periodically syncs popular artifacts from official. Reduces latency for regional players, provides redundancy.
- **Selective sync:** Community servers choose which categories/namespaces to replicate (e.g., replicate all Maps but not Mods)
- **Offline bundles:** `ic workshop export-bundle` creates a portable archive of selected resources for LAN parties or airgapped environments. `ic workshop import-bundle` loads them into a local repository.

### Workshop Resource Registry & Dependency System (D030)

The Workshop operates as a **universal artifact repository for game resources**. Any game asset — music, sprites, textures, cutscenes, maps, sound effects, voice lines, templates, balance presets — is individually publishable as a versioned, integrity-verified, licensed artifact. Others (including LLM agents) can discover, depend on, and pull resources automatically.

#### Resource Identity & Versioning

Every Workshop resource gets a globally unique identifier:

```
Format:  namespace/name@version
Example: alice/soviet-march-music@1.2.0
         community-hd-project/allied-infantry-sprites@2.1.0
         bob/desert-tileset@1.0.3
```

- **Namespace** = author username or organization
- **Name** = resource name, lowercase with hyphens
- **Version** = semantic versioning (semver)

#### Dependency Declaration in `mod.yaml`

Mods and resources declare dependencies on other Workshop resources:

```yaml
# mod.yaml
dependencies:
  - id: "community-project/hd-infantry-sprites"
    version: "^2.0"                    # semver range (cargo-style)
    source: workshop                   # workshop | local | url
  - id: "alice/soviet-march-music"
    version: ">=1.0, <3.0"
    source: workshop
    optional: true                     # soft dependency — mod works without it
  - id: "bob/desert-terrain-textures"
    version: "~1.4"                    # compatible with 1.4.x
    source: workshop
```

Dependencies are **transitive** — if resource A depends on B, and B depends on C, installing A pulls all three.

#### Dependency Resolution

Cargo-inspired version solving with lockfile:

| Concept               | Behavior                                                                          |
| --------------------- | --------------------------------------------------------------------------------- |
| Semver ranges         | `^1.2` (>=1.2.0, <2.0.0), `~1.2` (>=1.2.0, <1.3.0), `>=1.0, <3.0`, exact `=1.2.3` |
| Lockfile (`ic.lock`)  | Records exact resolved versions + SHA-256 checksums for reproducible installs     |
| Transitive resolution | Pulled automatically; diamond dependencies resolved to compatible version         |
| Conflict detection    | Two deps require incompatible versions → error with suggestions                   |
| Deduplication         | Same resource from multiple dependents stored once in local cache                 |
| Optional dependencies | `optional: true` — mod works without it; UI offers to install if available        |
| Offline resolution    | Once cached, all dependencies resolve from local cache — no network required      |

#### CLI Commands for Dependency Management

These extend the `ic` CLI (D020):

```
ic mod resolve         # compute dependency graph, report conflicts
ic mod install         # download all dependencies to local cache (verifies SHA-256)
ic mod update          # update deps to latest compatible versions (respects semver)
ic mod tree            # display dependency tree (like `cargo tree`)
ic mod lock            # regenerate ic.lock from current mod.yaml
ic mod audit           # check dependency licenses for compatibility
ic mod promote         # promote artifact to a higher channel (beta → release)
ic workshop export-bundle  # export selected resources as portable offline archive
ic workshop import-bundle  # import offline archive into local repository
```

Example workflow:
```
$ ic mod install
  Resolving dependencies...
  Downloading community-project/hd-infantry-sprites@2.1.0 (12.4 MB)
  Downloading alice/soviet-march-music@1.2.0 (4.8 MB)
  Downloading bob/desert-terrain-textures@1.4.1 (8.2 MB)
  3 resources installed, 25.4 MB total
  Lock file written: ic.lock

$ ic mod tree
  my-total-conversion@1.0.0
  ├── community-project/hd-infantry-sprites@2.1.0
  │   └── community-project/base-palettes@1.0.0
  ├── alice/soviet-march-music@1.2.0
  └── bob/desert-terrain-textures@1.4.1

$ ic mod audit
  ✓ All 4 dependencies have compatible licenses
  ✓ Your mod (CC-BY-SA-4.0) is compatible with:
    - hd-infantry-sprites (CC-BY-4.0) ✓
    - soviet-march-music (CC0-1.0) ✓
    - desert-terrain-textures (CC-BY-SA-4.0) ✓
    - base-palettes (CC0-1.0) ✓
```

#### License System

**Every published Workshop resource MUST have a `license` field.** Publishing without one is rejected by the Workshop server and by `ic mod publish`.

```yaml
# In mod.yaml
mod:
  license: "CC-BY-SA-4.0"             # SPDX identifier (required for publishing)
```

- Uses [SPDX identifiers](https://spdx.org/licenses/) for machine-readable classification
- Workshop UI displays license prominently on every resource listing
- `ic mod audit` checks the full dependency tree for license compatibility
- Common licenses for game assets:

| License             | Allows commercial use | Requires attribution | Share-alike | Notes                       |
| ------------------- | --------------------- | -------------------- | ----------- | --------------------------- |
| `CC0-1.0`           | ✅                     | ❌                    | ❌           | Public domain equivalent    |
| `CC-BY-4.0`         | ✅                     | ✅                    | ❌           | Most permissive with credit |
| `CC-BY-SA-4.0`      | ✅                     | ✅                    | ✅           | Copyleft for creative works |
| `CC-BY-NC-4.0`      | ❌                     | ✅                    | ❌           | Non-commercial only         |
| `MIT`               | ✅                     | ✅                    | ❌           | For code assets             |
| `GPL-3.0-only`      | ✅                     | ✅                    | ✅           | For code (EA source compat) |
| `LicenseRef-Custom` | varies                | varies               | varies      | Link to full text required  |

#### Publishing Workflow

Publishing uses the existing `ic mod init` + `ic mod publish` flow — resources are packages with the appropriate `ResourceCategory`:

```
# Publish a single music track
ic mod init asset-pack
# Edit mod.yaml: set category to "Music", add license, add llm_meta
# Add audio files
ic mod check                   # validates license present, llm_meta recommended
ic mod publish                 # uploads to Workshop with dependency metadata
```

```yaml
# Example: publishing a music pack
mod:
  id: alice/soviet-march-music
  title: "Soviet March — Original Composition"
  version: "1.2.0"
  authors: ["alice"]
  description: "An original military march composition for Soviet faction missions"
  license: "CC-BY-4.0"
  category: Music

assets:
  media: ["audio/soviet-march.ogg"]

llm:
  summary: "Military march music, Soviet theme, 2:30 duration, orchestral"
  purpose: "Background music for Soviet mission briefings or victory screens"
  gameplay_tags: [soviet, military, march, orchestral, briefing]
  composition_hints: "Pairs well with Soviet faction voice lines for immersive briefings"
```

### LLM-Driven Resource Discovery (D030)

The `ra-llm` crate can search the Workshop programmatically and incorporate discovered resources into generated content:

**Discovery pipeline:**

```
  ┌─────────────────────────────────────────────────────────────────┐
  │ LLM generates mission concept                                  │
  │ ("Soviet ambush in snowy forest with dramatic briefing")        │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Identify needed assets                                          │
  │ → winter terrain textures                                       │
  │ → Soviet voice lines                                            │
  │ → ambush/tension music                                          │
  │ → briefing video (optional)                                     │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Search Workshop via WorkshopClient                              │
  │ → query="winter terrain", tags=["snow", "forest"]              │
  │ → query="Soviet voice lines", tags=["soviet", "military"]     │
  │ → query="tension music", tags=["ambush", "suspense"]          │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Evaluate candidates via llm_meta                                │
  │ → Read summary, purpose, composition_hints                      │
  │ → Filter by license compatibility                               │
  │ → Rank by gameplay_tags match score                             │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Add discovered resources as dependencies in generated mod.yaml │
  │ → Generated mission references assets by resource ID            │
  │ → Dependencies resolved at install time via `ic mod install`   │
  └─────────────────────────────────────────────────────────────────┘
```

The LLM sees workshop resources through their `llm_meta` fields. A music track tagged `summary: "Military march, Soviet theme, orchestral, 2:30"` and `composition_hints: "Pairs well with Soviet faction voice lines"` lets the LLM intelligently select and compose assets for a coherent mission experience.

**License-aware generation:** The LLM filters by license compatibility — if generating content for a CC-BY mod, it only pulls CC-BY-compatible resources (`CC0-1.0`, `CC-BY-4.0`), excluding `CC-BY-NC-4.0` or `CC-BY-SA-4.0` unless the mod's own license is compatible.

### Workshop API

```rust
pub trait WorkshopClient: Send + Sync {
    fn browse(&self, filter: &ResourceFilter) -> Result<Vec<ResourceListing>>;
    fn download(&self, id: &ResourceId, version: &VersionReq) -> Result<ResourcePackage>;
    fn publish(&self, package: &ResourcePackage) -> Result<ResourceId>;
    fn rate(&self, id: &ResourceId, rating: Rating) -> Result<()>;
    fn search(&self, query: &str, category: ResourceCategory) -> Result<Vec<ResourceListing>>;
    fn resolve(&self, deps: &[Dependency]) -> Result<DependencyGraph>;   // D030: dep resolution
    fn audit_licenses(&self, graph: &DependencyGraph) -> Result<LicenseReport>; // D030: license check
    fn promote(&self, id: &ResourceId, to_channel: Channel) -> Result<()>; // D030: channel promotion
    fn replicate(&self, filter: &ResourceFilter, target: &str) -> Result<ReplicationReport>; // D030: pull replication
}

/// Globally unique resource identifier: "namespace/name@version"
pub struct ResourceId {
    pub namespace: String,
    pub name: String,
    pub version: Version,             // semver
}

pub struct Dependency {
    pub id: String,                   // "namespace/name"
    pub version: VersionReq,          // semver range
    pub source: DependencySource,     // Workshop, Local, Url
    pub optional: bool,
}

pub struct ResourcePackage {
    pub id: ResourceId,               // globally unique identifier
    pub meta: ResourceMeta,           // title, author, description, tags
    pub license: String,              // SPDX identifier (REQUIRED)
    pub llm_meta: Option<LlmResourceMeta>, // LLM-readable description
    pub category: ResourceCategory,   // Music, Sprites, Map, Mod, etc.
    pub files: Vec<PackageFile>,      // the actual content
    pub checksum: Sha256Hash,         // artifact integrity (computed on publish)
    pub channel: Channel,             // dev | beta | release
    pub dependencies: Vec<Dependency>,// other workshop items this requires
    pub compatibility: VersionInfo,   // engine version + game module this targets
}

/// LLM-readable metadata for workshop resources.
/// Enables intelligent browsing, selection, and composition by ra-llm.
pub struct LlmResourceMeta {
    pub summary: String,              // one-line: "A 4-player desert skirmish map with limited ore"
    pub purpose: String,              // when/why to use this: "Best for competitive 2v2 with scarce resources"
    pub gameplay_tags: Vec<String>,   // semantic: ["desert", "2v2", "competitive", "scarce_resources"]
    pub difficulty: Option<String>,   // for missions/campaigns: "hard", "beginner-friendly"
    pub composition_hints: Option<String>, // how this combines with other resources
}

pub struct DependencyGraph {
    pub resolved: Vec<ResolvedDependency>, // all deps with exact versions
    pub conflicts: Vec<DependencyConflict>, // incompatible version requirements
}

pub struct LicenseReport {
    pub compatible: bool,
    pub issues: Vec<LicenseIssue>,    // e.g., "CC-BY-NC dep in CC-BY mod"
}
```

## Mod SDK & Developer Experience

*Inspired by studying the [OpenRA Mod SDK](https://github.com/OpenRA/OpenRAModSDK) — see D020.*

### Lessons from the OpenRA Mod SDK

The OpenRA Mod SDK is a template repository that modders fork. It includes:

| OpenRA SDK Feature                       | What's Good                                               | Our Improvement                                             |
| ---------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Fork-the-repo template                   | Zero-config starting point                                | `cargo-generate` template — same UX, better tooling         |
| `mod.config` (engine version pin)        | Reproducible builds                                       | `mod.yaml` manifest with typed schema + semver              |
| `fetch-engine.sh` (auto-download engine) | Modders never touch engine source                         | Engine ships as a binary crate, not compiled from source    |
| `Makefile` / `make.cmd`                  | Cross-platform build                                      | `ic` CLI tool — Rust binary, works everywhere               |
| `packaging/` (Win/Mac/Linux installers)  | Full distribution pipeline                                | Workshop publish + `cargo-dist` for standalone              |
| `utility.sh --check-yaml`                | Catches YAML errors                                       | `ic mod check` — validates YAML, Lua syntax, WASM integrity |
| `launch-dedicated.sh`                    | Dedicated server for mods                                 | `ic mod server` — first-class CLI command                   |
| `mod.yaml` manifest                      | Single entry point for mod composition                    | Real YAML manifest with typed `serde` deserialization       |
| Standardized directory layout            | Convention-based — chrome/, rules/, maps/                 | Adapted for our three-tier model                            |
| `.vscode/` included                      | IDE support out of the box                                | Full VS Code extension with YAML schema + Lua LSP           |
| C# DLL for custom traits                 | **Pain point:** requires .NET toolchain, IDE, compilation | Our YAML/Lua/WASM tiers eliminate this entirely             |
| GPL license on mod code                  | **Pain point:** all mod code must be GPL-compatible       | WASM sandbox + permissive engine license = modder's choice  |
| MiniYAML format                          | **Pain point:** no tooling, no validation                 | Real YAML with JSON Schema, serde, linting                  |
| No workshop/distribution                 | **Pain point:** manual file sharing, forum posts          | Built-in workshop with `ic mod publish`                     |
| No hot-reload                            | **Pain point:** recompile engine+mod for every change     | Lua + YAML hot-reload during development                    |

### The `ic` CLI Tool

A single Rust binary that replaces OpenRA's grab-bag of shell scripts:

```
ic mod init [template]     # scaffold a new mod from a template
ic mod check               # validate YAML rules, Lua syntax, WASM module integrity
ic mod test                # run mod in headless test harness (smoke test)
ic mod run                 # launch game with this mod loaded
ic mod server              # launch dedicated server for this mod
ic mod package             # build distributable packages (workshop or standalone)
ic mod publish             # publish to workshop
ic mod update-engine       # update engine version in mod.yaml
ic mod lint                # style/convention checks + llm: metadata completeness
ic mod watch               # hot-reload mode: watches files, reloads YAML/Lua on change
```

**Why a CLI, not just scripts:**
- Single binary — no Python, .NET, or shell dependencies
- Cross-platform (Windows, macOS, Linux) from one codebase
- Rich error messages with fix suggestions
- Integrates with the workshop API
- Can be embedded in CI/CD pipelines

### Mod Manifest (`mod.yaml`)

Every mod has a `mod.yaml` at its root — the single source of truth for mod identity and composition. Inspired by OpenRA's `mod.yaml` but using real YAML with typed deserialization:

```yaml
# mod.yaml
mod:
  id: my-total-conversion
  title: "Red Apocalypse"
  version: "1.2.0"
  authors: ["ModderName"]
  description: "A total conversion set in an alternate timeline"
  website: "https://example.com/red-apocalypse"
  license: "CC-BY-SA-4.0"            # modder's choice — no GPL requirement

engine:
  version: "^0.3.0"                  # semver — compatible with 0.3.x
  game_module: "ra1"                 # which GameModule this mod targets

assets:
  rules: ["rules/**/*.yaml"]
  maps: ["maps/"]
  missions: ["missions/"]
  scripts: ["scripts/**/*.lua"]
  wasm_modules: ["wasm/*.wasm"]
  media: ["media/"]
  chrome: ["chrome/**/*.yaml"]
  sequences: ["sequences/**/*.yaml"]

dependencies:                        # other mods/workshop items required
  - id: "community-hd-sprites"
    version: "^2.0"
    source: workshop

balance_preset: classic              # default balance preset for this mod

llm:
  summary: "Alternate-timeline total conversion with new factions and units"
  gameplay_tags: [total_conversion, alternate_history, new_factions]
```

### Standardized Mod Directory Layout

```
my-mod/
├── mod.yaml                  # manifest (required)
├── rules/                    # Tier 1: YAML data
│   ├── units/
│   │   ├── infantry.yaml
│   │   └── vehicles.yaml
│   ├── structures/
│   ├── weapons/
│   ├── terrain/
│   └── presets/              # balance preset overrides
├── maps/                     # map files (.oramap or native)
├── missions/                 # campaign missions
│   ├── allied-01.yaml
│   └── allied-01.lua
├── scripts/                  # Tier 2: Lua scripts
│   ├── abilities/
│   └── triggers/
├── wasm/                     # Tier 3: WASM modules
│   └── custom_mechanics.wasm
├── media/                    # videos, cutscenes
├── chrome/                   # UI layout definitions
├── sequences/                # sprite sequence definitions
├── cursors/                  # custom cursor definitions
├── audio/                    # music, SFX, voice lines
├── templates/                # Tera mission/scene templates
└── README.md                 # human-readable mod description
```

### Mod Templates (via `cargo-generate`)

`ic mod init` uses `cargo-generate`-style templates. Built-in templates:

| Template           | Creates                               | For                                         |
| ------------------ | ------------------------------------- | ------------------------------------------- |
| `data-mod`         | mod.yaml + rules/ + empty maps/       | Simple balance/cosmetic mods (Tier 1 only)  |
| `scripted-mod`     | Above + scripts/ + missions/          | Mission packs, custom game modes (Tier 1+2) |
| `total-conversion` | Full directory layout including wasm/ | Total conversions (all tiers)               |
| `map-pack`         | mod.yaml + maps/                      | Map collections                             |
| `asset-pack`       | mod.yaml + media/ + sequences/        | Sprite/sound/video packs                    |

Community can publish custom templates to the workshop.

### Development Workflow

```
1. ic mod init scripted-mod          # scaffold
2. Edit YAML rules, write Lua scripts
3. ic mod watch                      # hot-reload mode
4. ic mod check                      # validate everything
5. ic mod test                       # headless smoke test
6. ic mod publish                    # push to workshop
```

Compare to OpenRA's workflow: install .NET SDK → fork SDK repo → edit MiniYAML → write C# DLL → `make` → `launch-game.sh` → manually package → upload to forum.

## LLM-Readable Resource Metadata

Every game resource — units, weapons, structures, maps, mods, templates — carries structured metadata designed for consumption by LLMs and AI systems. This is not documentation for humans (that's `display.name` and README files). This is **machine-readable semantic context** that enables AI to reason about game content.

### Why This Matters

Traditional game data is structured for the engine: cost, health, speed, damage. An LLM reading `cost: 100, health: 50, speed: 56, weapon: m1_carbine` can parse the numbers but cannot infer *purpose*. It doesn't know that rifle infantry is a cheap scout, that it's useless against tanks, or that it should be built in groups of 5+.

The `llm:` metadata block bridges this gap. It gives LLMs the strategic and tactical context that experienced players carry in their heads.

### What Consumes It

| Consumer                          | How It Uses `llm:` Metadata                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ra-llm` (mission generation)** | Selects appropriate units for scenarios. "A hard mission" → picks units with `role: siege` and high counters. "A stealth mission" → picks units with `role: scout, infiltrator`. |
| **`ra-ai` (skirmish AI)**         | Reads `counters`/`countered_by` for build decisions. Knows to build anti-air when enemy has `role: air`. Reads `tactical_notes` for positioning hints.                           |
| **Workshop search**               | Semantic search: "a map for beginners" matches `difficulty: beginner-friendly`. "Something for a tank rush" matches `gameplay_tags: ["open_terrain", "abundant_resources"]`.     |
| **Future in-game AI advisor**     | "What should I build?" → reads enemy composition's `countered_by`, suggests units with matching `role`.                                                                          |
| **Mod compatibility analysis**    | Detects when a mod changes a unit's `role` or `counters` in ways that affect balance.                                                                                            |

### Metadata Format (on game resources)

The `llm:` block is optional on every resource type. It follows a consistent schema:

```yaml
# On units / weapons / structures:
llm:
  summary: "One-line natural language description"
  role: [semantic, tags, for, classification]
  strengths: [what, this, excels, at]
  weaknesses: [what, this, is, bad, at]
  tactical_notes: "Free-text tactical guidance for LLM reasoning"
  counters: [unit_types, this, beats]
  countered_by: [unit_types, that, beat, this]

# On maps:
llm:
  summary: "4-player island map with contested center bridge"
  gameplay_tags: [islands, naval, chokepoint, 4player]
  tactical_notes: "Control the center bridge for resource access. Naval early game is critical."

# On weapons:
llm:
  summary: "Long-range anti-structure artillery"
  role: [siege, anti_structure]
  strengths: [long_range, high_structure_damage, area_of_effect]
  weaknesses: [slow_fire_rate, inaccurate_vs_moving, minimum_range]
```

### Metadata Format (on workshop resources)

Workshop resources carry `LlmResourceMeta` in their package manifest:

```yaml
# workshop manifest for a mission template
llm_meta:
  summary: "Defend a bridge against 5 waves of Soviet armor"
  purpose: "Good for practicing defensive tactics with limited resources"
  gameplay_tags: [defense, bridge, waves, armor, intermediate]
  difficulty: "intermediate"
  composition_hints: "Pairs well with the 'reinforcements' scene template for a harder variant"
```

This metadata is indexed by the workshop server for semantic search. When an LLM needs to find "a scene template for an ambush in a forest," it searches `gameplay_tags` and `summary`, not filenames.

### Design Rules

1. **`llm:` is always optional.** Resources work without it. Legacy content and OpenRA imports won't have it initially — it can be added incrementally, by humans or by LLMs.
2. **Human-written is preferred, LLM-generated is acceptable.** When a modder publishes to the workshop without `llm_meta`, the system can offer to auto-generate it from the resource's data (unit stats, map layout, etc.). The modder reviews and approves.
3. **Tags use a controlled vocabulary.** `role`, `strengths`, `weaknesses`, `counters`, and `gameplay_tags` draw from a published tag dictionary (extensible by mods). This prevents tag drift where the same concept has five spellings.
4. **`tactical_notes` is free-text.** This is the field where nuance lives. "Build 5+ to be cost-effective" or "Position behind walls for maximum effectiveness" — advice that can't be captured in tags.
5. **Metadata is part of the YAML spec, not a sidecar.** It lives in the same file as the resource definition. No separate metadata files to lose or desync.
