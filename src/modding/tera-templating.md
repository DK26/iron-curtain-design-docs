# Tera Templating

### Tera as the Template Engine

Tera is a Rust-native Jinja2-compatible template engine. **All first-party IC content uses it** — the default Red Alert campaign, built-in resource packs, and balance presets are all Tera-templated. This means the system is proven by the content that ships with the engine, not just an abstract capability. Core Tera integration (load-time `.yaml.tera` processing) ships in Phase 2–3 alongside the first-party content that depends on it. Advanced templating features (Workshop template distribution, in-game parameter editing UI, migration tooling) ship in Phase 6a.

For **third-party content creators, Tera is entirely optional.** Plain YAML is always valid and is the recommended starting point. Most community mods, resource packs, and maps work fine without any templating at all. Tera is there when you need it — not forced on you.

What Tera handles:

1. **YAML/Lua generation** — eliminates copy-paste when defining dozens of faction variants or bulk unit definitions
2. **Mission templates** — parameterized, reusable mission blueprints
3. **Resource packs** — switchable asset layers with configurable parameters (quality, language, platform)

Inspired by Helm's approach to parameterized configuration, but adapted to game content: parameters are defined in a `schema.yaml`, defaults are inline in the template, and user preferences are set through the in-game settings UI — not a separate values file workflow. The pattern stays practical to our use case rather than importing Helm's full complexity.

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

### Mission Templates (Parameterized Missions)

A mission template is a reusable mission blueprint with parameterized values. The template defines the structure (map layout, objectives, triggers, enemy composition); the user (or LLM) supplies values to produce a concrete, playable mission.

**Template structure:**

```
templates/
  bridge_defense/
    template.yaml        # Tera template for map + rules
    triggers.lua.tera    # Tera template for Lua trigger scripts
    schema.yaml          # Parameter definitions with inline defaults
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
2. **Fill in parameters** — the LLM generates parameter values against the `schema.yaml`, not an entire mission
3. **Validate** — schema constraints catch hallucinated values before rendering
4. **Compose** — chain multiple scene and mission templates for campaigns (e.g., "3 missions: base building → bridge defense → final assault")

This is dramatically more reliable than raw generation. The template constrains the LLM's output to valid parameter space, and the schema validates it. The LLM becomes a smart form-filler, not an unconstrained code generator.

> **Lifelong learning (D057):** Proven template parameter combinations — which `ambush` location choices, `defend_position` wave compositions, and multi-scene sequences produce missions that players rate highly — are stored in the **skill library** (`decisions/09f/D057-llm-skill-library.md`) and retrieved as few-shot examples for future generation. The template library provides the valid output space; the skill library provides accumulated knowledge about what works within that space.

### Scene Templates (Composable Building Blocks)

Inspired by Operation Flashpoint / ArmA's mission editor: scene templates are **sub-mission components** — reusable, pre-scripted building blocks that snap together inside a mission. Each scene template has its own trigger logic, AI behavior, and Lua scripts already written and tested. The user or LLM only fills in parameters.

> **Visual editor equivalent:** The IC SDK's scenario editor (D038) exposes these same building blocks as **modules** — drag-and-drop logic nodes with a properties panel. Scene templates are the YAML/Lua format; modules are the visual editor face. Same underlying data — a composition saved in the editor can be loaded as a scene template by Lua/LLM, and vice versa. See `decisions/09f/D038-scenario-editor.md`.

**Template hierarchy:**

```
Scene Template    — a single scripted encounter or event
  ↓ composed into
Mission Template  — a full mission assembled from scenes + overall structure
  ↓ sequenced into
Campaign Graph    — branching mission graph with persistent state (not a linear sequence)
```

**Built-in scene template library (examples):**

| Scene Template       | Parameters                                                          | Pre-built Logic                                                                                         |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `ambush`             | location, attacker_units, trigger_zone, delay                       | Units hide until player enters zone, then attack from cover                                             |
| `patrol`             | waypoints, unit_composition, alert_radius                           | Units cycle waypoints, engage if player detected within radius                                          |
| `convoy_escort`      | route, convoy_units, ambush_points[], escort_units                  | Convoy follows route, ambushes trigger at defined points                                                |
| `defend_position`    | position, waves[], interval, reinforcement_schedule                 | Enemies attack in waves with escalating strength                                                        |
| `base_building`      | start_resources, available_structures, tech_tree_limit              | Player builds base, unlocked structures based on tech level                                             |
| `timed_objective`    | target, time_limit, failure_trigger                                 | Player must complete objective before timer expires                                                     |
| `reinforcements`     | trigger, units, entry_point, delay                                  | Units arrive from map edge when trigger fires                                                           |
| `scripted_scene`     | actors[], dialogue[], camera_positions[]                            | Non-interactive cutscene or briefing with camera movement                                               |
| `video_playback`     | video_ref, trigger, display_mode, skippable                         | Play a video on trigger — see display modes below                                                       |
| `weather`            | type, intensity, trigger, duration, sim_effects                     | Weather system — see weather effects below                                                              |
| `extraction`         | pickup_zone, transport_type, signal_trigger                         | Player moves units to extraction zone, transport arrives                                                |
| `map_expansion`      | trigger, layer_name, transition, reinforcements[], briefing         | Activates a map layer — reveals shroud, extends bounds, wakes entities. See § Dynamic Mission Flow.     |
| `sub_map_transition` | portal_region, sub_map, allowed_units[], transition, outcomes{}     | Unit enters building → loads interior sub-map → outcomes affect parent map. See § Dynamic Mission Flow. |
| `phase_briefing`     | briefing_ref, video_ref, display_mode, layer_name, reinforcements[] | Combines briefing/video with layer activation and reinforcements — the "next phase" one-stop module.    |

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

Weather effects are GPU particle systems rendered by `ic-render`, with optional gameplay modifiers applied by `ic-sim`.

| Type        | Visual Effect                                                    | Optional Sim Effect (if `sim_effects: true`)                   |
| ----------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| `rain`      | GPU particle rain, puddle reflections, darkened ambient lighting | Reduced visibility range (−20%), slower wheeled vehicles       |
| `snow`      | GPU particle snowfall, accumulation on terrain, white fog        | Reduced movement speed (−15%), reduced visibility (−30%)       |
| `sandstorm` | Dense particle wall, orange tint, reduced draw distance          | Heavy visibility reduction (−50%), damage to exposed infantry  |
| `blizzard`  | Heavy snow + wind particles, near-zero visibility                | Severe speed/visibility penalty, periodic cold damage          |
| `fog`       | Volumetric fog shader, reduced contrast at distance              | Reduced visibility range (−40%), no other penalties            |
| `storm`     | Rain + lightning flashes + screen shake + thunder audio          | Same as rain + random lightning strikes (cosmetic or damaging) |

**Key design principle:** Weather is split into two layers:
- **Render layer** (`ic-render`): Always active. GPU particles, shaders, post-FX, ambient audio changes. Pure cosmetic, zero sim impact. Particle density scales with `RenderSettings` for lower-end devices.
- **Sim layer** (`ic-sim`): Optional, controlled by `sim_effects` parameter. When enabled, weather modifies visibility ranges, movement speeds, and damage — deterministically, so multiplayer stays in sync. When disabled, weather is purely cosmetic eye candy.

Weather can be set per-map (in map YAML), triggered mid-mission by Lua scripts, or composed via the `weather` scene template. An LLM generating a "blizzard defense" mission sets `type: blizzard, sim_effects: true` and gets both the visual atmosphere and the gameplay tension.

### Dynamic Weather System (D022)

The base weather system above covers static, per-mission weather. The **dynamic weather system** extends it with real-time weather transitions and terrain texture effects during gameplay — snow accumulates on the ground, rain darkens and wets surfaces, sunshine dries everything out.

#### Weather State Machine

Weather transitions are modeled as a state machine running inside `ic-sim`. The machine is deterministic — same schedule + same tick = identical weather on every client.

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
          ▲                  │                  │
          │                  ▼                  ▼
          │            ┌───────────┐      ┌──────────┐
          │            │    Fog    │      │ Blizzard │
          │            └───────────┘      └──────────┘
          │                  │                  │
          └──────────────────┴──────────────────┘
                    (melt / thaw / clear)

     Desert variant (temperature.base > threshold):
     Rain → Sandstorm, Snow → (not reachable)
```

Each weather type has an **intensity** (fixed-point `0..1024`) that ramps up during transitions and down during clearing. The sim tracks this as a `WeatherState` resource:

```rust
/// ic-sim: deterministic weather state
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
/// ic-sim: per-cell surface condition
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

The `weather_surface_system` runs every tick for visible cells and amortizes non-visible cells over 4 ticks (after weather state update, before movement — see D022 in `decisions/09c-modding.md` § "Performance"):

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

**Snapshot compatibility:** `TerrainSurfaceGrid` derives `Serialize, Deserialize` — surface state is captured in save games and snapshots per D010 (snapshottable sim state).

#### Terrain Texture Effects (Render Layer)

`ic-render` reads the sim's `TerrainSurfaceGrid` and blends terrain visuals accordingly. This is **purely cosmetic** — it has no effect on the sim and runs at whatever quality the device supports.

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
    schema.yaml          # Parameters + inline defaults: location, units, trigger_zone, etc.
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


---

## Sub-Pages

| Section             | Topic                                                                                                                                                                                             | File                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Advanced Templating | Dynamic mission flow, campaign integration, multiplayer template negotiation, Workshop template distribution, template debugging, LLM integration, migration from MiniYAML, implementation phases | [tera-templating-advanced.md](tera-templating-advanced.md) |
