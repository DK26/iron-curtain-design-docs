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
/// Consumed by ic-llm (mission generation), ic-ai (skirmish AI),
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

### Mod Load Order & Conflict Resolution

When multiple mods modify the same game data, deterministic load order and explicit conflict handling are essential. Bethesda taught the modding world this lesson: Skyrim's 200+ mod setups are only viable because community tools (LOOT, xEdit, Bashed Patches) compensate for Bethesda's vague native load order. IC builds deterministic conflict resolution into the engine from day one — no third-party tools required.

**Load order rules:**

1. **Engine defaults** load first (built-in RA1/TD rules).
2. **Balance preset** (D019) overlays next.
3. **Mods** load in dependency-graph order — if mod A depends on mod B, B loads first.
4. **Mods with no dependency relationship** between them load in lexicographic order by mod ID. Deterministic tiebreaker — no ambiguity.
5. **Within a mod**, files load in directory order, then alphabetical within each directory.

**Multiplayer enforcement:** In multiplayer, the lobby enforces identical mod sets, versions, and load order across all clients before the game starts (see `03-NETCODE.md` § `GameListing.required_mods`). The deterministic load order is sufficient *because* divergent mod configurations are rejected at join time — there is no scenario where two clients resolve the same mods differently.

**Conflict behavior (same YAML key modified by two mods):**

| Scenario                                                          | Behavior                                                    | Rationale                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| Two mods set different values for the same field on the same unit | Last-wins (later in load order) + warning in `ic mod check` | Modders need to know about the collision |
| Mod adds a new field to a unit also modified by another mod       | Merge — both additions survive                              | Non-conflicting additions are safe       |
| Mod deletes a field that another mod modifies                     | Delete wins + warning                                       | Explicit deletion is intentional         |
| Two mods define the same new unit ID                              | Error — refuses to load                                     | Ambiguous identity is never acceptable   |

**Tooling:**

- `ic mod check-conflicts [mod1] [mod2] ...` — reports all field-level conflicts between a set of mods before launch. Shows which mod "wins" each conflict and why.
- `ic mod load-order [mod1] [mod2] ...` — prints the resolved load order with dependency graph visualization.
- In-game mod manager shows conflict warnings with "which mod wins" detail when enabling mods.

**Conflict override file (optional):**

For advanced setups, a `conflicts.yaml` file in the **game's user configuration directory** (next to `settings.yaml`) lets the player explicitly resolve conflicts in their personal setup. This is a per-user file — it is not distributed with mods or modpacks, and it is not synced in multiplayer. Players who want to share their conflict resolutions can distribute the file manually or include it in a modpack manifest (the `modpack.conflicts` field serves the same purpose for published modpacks):

```yaml
# conflicts.yaml — explicit conflict resolution
overrides:
  - unit: heavy_tank
    field: health.max
    use_mod: "alice/tank-rebalance"     # force this mod's value
    reason: "Prefer Alice's balance for heavy tanks"
  - unit: rifle_infantry
    field: buildable.cost
    use_mod: "bob/economy-overhaul"
```

This is the manual equivalent of Bethesda's Bashed Patches — but declarative, version-controlled, and shareable.

**Phase:** Load order engine support in Phase 2 (part of YAML rule loading). Conflict detection CLI in Phase 4 (with `ic` CLI). In-game mod manager in Phase 6a.

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

| Global        | Purpose                              |
| ------------- | ------------------------------------ |
| `Campaign`    | Branching campaign state (D021)      |
| `Weather`     | Dynamic weather control (D022)       |
| `Layer`       | Runtime layer activation/deaction    |
| `Region`      | Named region queries                 |
| `Var`         | Mission/campaign variable access     |
| `Workshop`    | Mod metadata queries                 |
| `LLM`         | LLM integration hooks (Phase 7)      |
| `Achievement` | Achievement trigger/query API (D036) |

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
- `os.time()`, `os.clock()`, `os.date()` are removed entirely — Lua scripts read game time via `Trigger.GetTick()` and `DateTime.GameTime`
- Fixed-point math provided via engine bindings (no raw floats)
- Execution resource limits per tick (see `LuaExecutionLimits` below)
- Memory limits per mod

**Determinism note:** Lua's internal number type is `f64`, but this does not affect sim determinism. Lua has **read-only access** to game state and **write access exclusively through orders** (and campaign state writes like `Campaign.set_flag()`, which are themselves deterministic because they execute at the same pipeline step on every client). The sim processes orders deterministically — Lua cannot directly modify sim components. Lua evaluation produces identical results across all clients because it runs at the same point in the system pipeline (the `triggers` step, see system execution order in `02-ARCHITECTURE.md`), with the same game state as input, on every tick. Any Lua-driven campaign state mutations are applied deterministically within this step, ensuring save/load and replay consistency.

**Additional determinism safeguards:**

- **String hashing → deterministic `pairs()`:** Lua's internal string hash uses a randomized seed by default (since Lua 5.3.3). The sandbox initializes `mlua` with a fixed seed, making hash table slot ordering identical across all clients. Combined with our deterministic pipeline (same code, same state, same insertion order on every client), this makes `pairs()` iteration order deterministic without modification. No sorted wrapper is needed — `pairs()` runs at native speed (zero overhead). For mod authors who want *explicit* ordering for gameplay clarity (e.g., "process units alphabetically"), the engine provides `Utils.SortedPairs(t)` — but this is a convenience for readability, not a determinism requirement. `ipairs()` is already deterministic (sequential integer keys) and should be preferred for array-style tables.
- **Garbage collection timing:** Lua's GC is configured with a fixed-step incremental mode (`LUA_GCINC`) with identical parameters on all clients. Finalizers (`__gc` metamethods) are disabled in the sandbox — mods cannot register them. This eliminates GC-timing-dependent side effects.
- **`math.random()`:** Removed from the sandbox. Mods use the engine-provided `Utils.RandomInteger(min, max)` which draws from the sim's deterministic PRNG.

### Lua Execution Resource Limits

WASM mods have `WasmExecutionLimits` (see Tier 3 below). Lua scripts need equivalent protection — without execution budgets, a Lua `while true do end` would block the deterministic tick indefinitely, freezing all clients in lockstep.

The `mlua` crate supports instruction count hooks via `Lua::set_hook(HookTriggers::every_nth_instruction(N), callback)`. The engine uses this to enforce per-tick execution budgets:

```rust
/// Per-tick execution budget for Lua scripts, enforced via mlua instruction hooks.
/// Exceeding the instruction limit terminates the script's current callback —
/// the sim continues without the script's remaining contributions for that tick.
/// A warning is logged and the mod is flagged for the host.
pub struct LuaExecutionLimits {
    pub max_instructions_per_tick: u32,    // mlua instruction hook fires at this count
    pub max_memory_bytes: usize,           // mlua memory limit callback
    pub max_entity_spawns_per_tick: u32,   // Mirrors WASM limit — prevents chain-reactive spawns
    pub max_orders_per_tick: u32,          // Prevents order pipeline flooding
    pub max_host_calls_per_tick: u32,      // Bounds engine API call volume
}

impl Default for LuaExecutionLimits {
    fn default() -> Self {
        Self {
            max_instructions_per_tick: 1_000_000,  // ~1M Lua instructions — generous for missions
            max_memory_bytes: 8 * 1024 * 1024,     // 8 MB (Lua is lighter than WASM)
            max_entity_spawns_per_tick: 32,
            max_orders_per_tick: 64,
            max_host_calls_per_tick: 1024,
        }
    }
}
```

**Why this matters:** The same reasoning as WASM limits applies. In deterministic lockstep, a runaway Lua script on one client blocks the tick for all players (everyone waits for the slowest client). The instruction limit ensures Lua callbacks complete in bounded time. Because the limit is deterministic (same instruction budget, same cutoff point), all clients agree on when a script is terminated — no desync.

**Mod authors can request higher limits** via their mod manifest, same as WASM mods. The lobby displays requested limits and players can accept or reject. Campaign/mission scripts bundled with the game use elevated limits since they are trusted first-party content.

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

### WASM Execution Resource Limits

Capability-based API controls *what* a mod can do. Execution resource limits control *how much*. Without them, a mod could consume unbounded CPU or spawn unbounded entities — degrading performance for all players and potentially overwhelming the network layer (Bryant & Saiedian 2021 documented this in Risk of Rain 2: "procedurally generated effects combined to produce unintended chain-reactive behavior which may ultimately overwhelm the ability for game clients to render objects or handle sending/receiving of game update messages").

```rust
/// Per-tick execution budget enforced by the WASM runtime (wasmtime fuel metering).
/// Exceeding any limit terminates the mod's tick callback early — the sim continues
/// without the mod's remaining contributions for that tick.
pub struct WasmExecutionLimits {
    pub fuel_per_tick: u64,              // wasmtime fuel units (~1 per wasm instruction)
    pub max_memory_bytes: usize,         // WASM linear memory cap (default: 16 MB)
    pub max_entity_spawns_per_tick: u32, // Prevents chain-reactive entity explosions (default: 32)
    pub max_orders_per_tick: u32,        // AI mods can't flood the order pipeline (default: 64)
    pub max_host_calls_per_tick: u32,    // Bounds API call volume (default: 1024)
}

impl Default for WasmExecutionLimits {
    fn default() -> Self {
        Self {
            fuel_per_tick: 1_000_000,       // ~1M instructions — generous for most mods
            max_memory_bytes: 16 * 1024 * 1024,  // 16 MB
            max_entity_spawns_per_tick: 32,
            max_orders_per_tick: 64,
            max_host_calls_per_tick: 1024,
        }
    }
}
```

**Why this matters for multiplayer:** In deterministic lockstep, all clients run the same mods. A mod that consumes excessive CPU causes tick overruns on slower machines, triggering adaptive run-ahead increases for everyone. A mod that spawns hundreds of entities per tick inflates state size and network traffic. The execution limits prevent a single mod from degrading the experience — and because the limits are deterministic (same fuel budget, same cutoff point), all clients agree on when a mod is throttled.

**Mod authors can request higher limits** via their mod manifest. The lobby displays requested limits and players can accept or reject. Tournament/ranked play enforces stricter defaults.

### WASM Rendering API Surface

Tier 3 WASM mods that replace the visual presentation (e.g., a 3D render mod) need a well-defined rendering API surface. These are the WASM host functions exposed for render mods — they are the *only* way a WASM mod can draw to the screen.

```rust
// === Render Host API (ic_render_* namespace) ===
// Available only to mods with ModCapabilities.render = true

/// Register a custom Renderable implementation for an actor type.
#[wasm_host_fn] fn ic_render_register(actor_type: &str, renderable_id: u32);

/// Draw a sprite at a world position (default renderer).
#[wasm_host_fn] fn ic_render_draw_sprite(
    sprite_id: u32, frame: u32, position: WorldPos, facing: u8, palette: u32
);

/// Draw a 3D mesh at a world position (Bevy 3D pipeline).
#[wasm_host_fn] fn ic_render_draw_mesh(
    mesh_handle: u32, position: WorldPos, rotation: [i32; 4], scale: [i32; 3]
);

/// Draw a line (debug overlays, targeting lines).
#[wasm_host_fn] fn ic_render_draw_line(
    start: WorldPos, end: WorldPos, color: u32, width: f32
);

/// Play a skeletal animation on a mesh entity.
#[wasm_host_fn] fn ic_render_play_animation(
    mesh_handle: u32, animation_name: &str, speed: f32, looping: bool
);

/// Set camera position and mode.
#[wasm_host_fn] fn ic_render_set_camera(
    position: WorldPos, mode: CameraMode, fov: Option<f32>
);

/// Screen-to-world conversion (for input mapping).
#[wasm_host_fn] fn ic_render_screen_to_world(
    screen_x: f32, screen_y: f32
) -> Option<WorldPos>;

/// Load an asset (sprite sheet, mesh, texture) by path.
/// Returns a handle ID for use in draw calls.
#[wasm_host_fn] fn ic_render_load_asset(path: &str) -> Option<u32>;

/// Spawn a particle effect at a position.
#[wasm_host_fn] fn ic_render_spawn_particles(
    effect_id: u32, position: WorldPos, duration: u32
);

pub enum CameraMode {
    Isometric,          // fixed angle, zoom only
    FreeLook,           // full 3D rotation
    Orbital { target: WorldPos },  // orbit a point
}
```

**Render mod registration:** A render mod implements the `Renderable` and `ScreenToWorld` traits (see `02-ARCHITECTURE.md` § "3D Rendering as a Mod"). It registers via `ic_render_register()` for each actor type it handles. Unregistered actor types fall through to the default sprite renderer. This allows **partial** render overrides — a mod can replace tank rendering with 3D meshes while leaving infantry as sprites.

**Security:** Render host functions are gated by `ModCapabilities.render`. A gameplay mod (AI, scripting) cannot access `ic_render_*` functions. Render mods cannot access `ic_host_issue_order()` — they draw, they don't command. These capabilities are declared in the mod manifest and verified at load time.

### Mod Testing Framework

`ic mod test` is referenced throughout this document but needs a concrete assertion API and test runner design.

#### Test File Structure

```yaml
# tests/my_mod_tests.yaml
tests:
  - name: "Tank costs 800 credits"
    setup:
      map: test_maps/flat_8x8.oramap
      players: [{ faction: allies, credits: 10000 }]
    actions:
      - build: { actor: medium_tank, player: 0 }
      - wait_ticks: 500
    assertions:
      - entity_exists: { type: medium_tank, owner: 0 }
      - player_credits: { player: 0, less_than: 9300 }

  - name: "Tesla coil requires power"
    setup:
      map: test_maps/flat_8x8.oramap
      players: [{ faction: soviet, credits: 10000 }]
      buildings: [{ type: tesla_coil, player: 0, pos: [4, 4] }]
    actions:
      - destroy: { type: power_plant, player: 0 }
      - wait_ticks: 30
    assertions:
      - condition_active: { entity_type: tesla_coil, condition: "disabled" }
```

#### Lua Test API

For more complex test scenarios, Lua scripts can use test assertion functions:

```lua
-- tests/combat_test.lua
function TestTankDamage()
    local tank = Actor.Create("medium_tank", { Owner = Player.GetPlayer(0), Location = CellPos(4, 4) })
    local target = Actor.Create("light_tank", { Owner = Player.GetPlayer(1), Location = CellPos(5, 4) })

    -- Force attack
    tank.Attack(target)
    Trigger.AfterDelay(100, function()
        Test.Assert(target.Health < target.MaxHealth, "Target should take damage")
        Test.AssertRange(target.Health, 100, 350, "Damage should be in expected range")
        Test.Pass("Tank combat works correctly")
    end)
end

-- Test API globals (available only in test mode)
-- Test.Assert(condition, message)
-- Test.AssertEqual(actual, expected, message)
-- Test.AssertRange(value, min, max, message)
-- Test.AssertNear(actual, expected, tolerance, message)
-- Test.Pass(message)
-- Test.Fail(message)
-- Test.Log(message)
```

#### Test Runner (`ic mod test`)

```
$ ic mod test
Running 12 tests from tests/*.yaml and tests/*.lua...
  ✓ Tank costs 800 credits (0.3s)
  ✓ Tesla coil requires power (0.2s)
  ✓ Tank combat works correctly (0.8s)
  ✗ Harvester delivery rate (expected 100, got 0) (1.2s)
  ...
Results: 11 passed, 1 failed (2.5s total)
```

**Features:**
- `ic mod test` — run all tests in `tests/` directory
- `ic mod test --filter "combat"` — run matching tests
- `ic mod test --headless` — no rendering (CI/CD mode, used by modpack validation)
- `ic mod test --verbose` — show per-tick sim state for failing tests
- `ic mod test --coverage` — report which YAML rules are exercised by tests

**Headless mode:** The engine initializes `ic-sim` without `ic-render` or `ic-audio`. Orders are injected programmatically. This is the same `LocalNetwork` model used for automated testing of the engine itself. Tests run at maximum speed (no frame rate limit).

**Phase:** Basic test runner (YAML assertions) in Phase 4. Lua test API in Phase 4. Coverage reporting in Phase 6a.

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

impl ScreenToWorld for FreeCam3D {
    fn screen_to_world(&self, screen_pos: Vec2, terrain: &TerrainData) -> WorldPos {
        // 3D raycast against terrain mesh → world position
        let ray = self.camera.screen_to_ray(screen_pos);
        terrain.raycast(ray).to_world_pos()
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

## Tera Templating (Phase 6a)

### Tera as the Template Engine

Tera is a Rust-native Jinja2-compatible template engine. **All first-party IC content uses it** — the default Red Alert campaign, built-in resource packs, and balance presets are all Tera-templated. This means the system is proven by the content that ships with the engine, not just an abstract capability.

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

### Scene Templates (Composable Building Blocks)

Inspired by Operation Flashpoint / ArmA's mission editor: scene templates are **sub-mission components** — reusable, pre-scripted building blocks that snap together inside a mission. Each scene template has its own trigger logic, AI behavior, and Lua scripts already written and tested. The user or LLM only fills in parameters.

> **Visual editor equivalent:** The IC SDK's scenario editor (D038) exposes these same building blocks as **modules** — drag-and-drop logic nodes with a properties panel. Scene templates are the YAML/Lua format; modules are the visual editor face. Same underlying data — a composition saved in the editor can be loaded as a scene template by Lua/LLM, and vice versa. See `09-DECISIONS.md` § D038.

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

The `weather_surface_system` runs every tick for visible cells and amortizes non-visible cells over 4 ticks (after weather state update, before movement — see D022 in `09-DECISIONS.md` § "Performance"):

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

### Templates as Workshop Resources

Scene templates and mission templates are both first-class workshop resource types — shared, rated, versioned, and downloadable like any other content. See the full resource category taxonomy in the [Workshop Resource Registry](#workshop-resource-registry--dependency-system-d030) section below.

| Type                  | Contents                                        | Examples                                         |
| --------------------- | ----------------------------------------------- | ------------------------------------------------ |
| Mods                  | YAML rules + Lua scripts + WASM modules         | Total conversions, balance patches, new factions |
| Maps                  | `.oramap` or native map format                  | Skirmish maps, campaign maps, tournament pools   |
| Missions              | YAML map + Lua triggers + briefing              | Hand-crafted or LLM-generated scenarios          |
| **Scene Templates**   | **Tera-templated Lua + schema**                 | **Reusable sub-mission building blocks**         |
| **Mission Templates** | **Tera templates + scene refs + schema**        | **Full parameterized mission blueprints**        |
| Campaigns             | Ordered mission sets + narrative                | Multi-mission storylines                         |
| Music                 | Audio tracks (`.ogg`, `.mp3`, `.flac`)          | Custom soundtracks, faction themes, menu music   |
| Sound Effects         | Audio clips                                     | Weapon sounds, ambient loops, UI feedback        |
| Voice Lines           | Audio clips + trigger metadata                  | EVA packs, unit responses, faction voice sets    |
| Sprites               | `.shp`, `.png`, sprite sheets                   | HD unit packs, building sprites, effects packs   |
| Textures              | Terrain tiles, UI skins                         | Theater tilesets, seasonal terrain variants      |
| Palettes              | `.pal` files                                    | Theater palettes, faction colors, seasonal       |
| Cutscenes / Video     | `.vqa`, `.mp4`, `.webm`                         | Custom briefings, cinematics, narrative videos   |
| UI Themes             | Chrome layouts, fonts, cursors                  | Alternative sidebars, HD cursor packs            |
| Balance Presets       | YAML rule overrides                             | Competitive tuning, historical accuracy presets  |
| QoL Presets           | Gameplay behavior toggle sets (D033)            | Custom QoL configurations, community favorites   |
| Experience Profiles   | Combined balance + theme + QoL (D019+D032+D033) | One-click full experience configurations         |

## Resource Packs (Switchable Asset Layers)

Resource packs are **switchable asset override layers** — the player selects which version of a resource category to use (cutscenes, sprites, music, voice lines, etc.), and the engine swaps to those assets without touching gameplay. Same concept as Minecraft's resource packs or the Remastered Collection's SD/HD toggle, but generalized to any asset type.

This falls naturally out of the architecture. Every asset is referenced by **logical ID** in YAML (e.g., `video: videos/allied-01-briefing.vqa`). A resource pack overrides those references — mapping the same IDs to different files. No code, no mods, no gameplay changes. Pure presentation layer.

### Tera-Templated Resource Packs (Optional, for Complex Packs)

Most community resource packs are plain YAML (see "Most Packs Are Plain YAML" below). But **all first-party IC packs use Tera** — the built-in cutscene, sprite, and music packs are templated with configurable quality, language, and content selection. This dogfoods the system and provides working examples for pack authors who want to go beyond flat mappings.

For packs that need **configurable parameters** — quality tiers, language selection, platform-aware defaults — Tera templates use a `schema.yaml` that defines the available knobs. Defaults are inline in the template; users configure through the in-game settings UI.

**Pack structure:**

```
resource-packs/hd-cutscenes/
  pack.yaml.tera      # Tera template — generates the override map
  schema.yaml          # Parameter definitions with inline defaults
  assets/              # The actual replacement files
    videos/
      allied-01-briefing-720p.mp4
      allied-01-briefing-1080p.mp4
      allied-01-briefing-4k.mp4
      ...
```

**Schema (configurable knobs):**

```yaml
# schema.yaml
parameters:
  quality:
    type: enum
    options: [720p, 1080p, 4k]
    default: 1080p
    description: "Video resolution — higher needs more disk space"

  language:
    type: enum
    options: [en, de, fr, ru, es, ja]
    default: en
    description: "Subtitle/dub language"

  include_victory_sequences:
    type: boolean
    default: true
    description: "Also replace victory/defeat cinematics"

  style:
    type: enum
    options: [upscaled, redrawn, ai_generated]
    default: upscaled
    description: "Visual style of replacement cutscenes"
```

**Tera template (generates the override map from parameters):**

```jinja
{# pack.yaml.tera #}
resource_pack:
  name: "HD Cutscenes ({{ quality }}, {{ language }})"
  description: "{{ style | title }} briefing videos in {{ quality }}"
  category: cutscenes
  version: "2.0.0"

  assets:
    {% for mission in ["allied-01", "allied-02", "allied-03", "soviet-01", "soviet-02", "soviet-03"] %}
    videos/{{ mission }}-briefing.vqa: assets/videos/{{ mission }}-briefing-{{ quality }}.mp4
    {% endfor %}

    {% if include_victory_sequences %}
    {% for seq in ["allied-victory", "allied-defeat", "soviet-victory", "soviet-defeat"] %}
    videos/{{ seq }}.vqa: assets/videos/{{ seq }}-{{ quality }}.mp4
    {% endfor %}
    {% endif %}

    {# Language-specific subtitle tracks #}
    {% if language != "en" %}
    {% for mission in ["allied-01", "allied-02", "allied-03", "soviet-01", "soviet-02", "soviet-03"] %}
    subtitles/{{ mission }}.srt: assets/subtitles/{{ language }}/{{ mission }}.srt
    {% endfor %}
    {% endif %}
```

**User configuration (in-game settings, not CLI overrides):**

Players configure pack parameters through the Settings → Resource Packs UI. When a pack has a `schema.yaml`, the UI renders the appropriate controls (dropdowns for enums, checkboxes for booleans). The engine re-renders the Tera template whenever settings change, producing an updated override map. This is load-time only — zero runtime cost.

For CLI users, `ic resource-pack install hd-cutscenes` installs the pack with its defaults. Parameters are then adjusted in settings.

### Why Tera (Not Just Flat Mappings)

Flat override maps (`asset_a → asset_b`) work for simple cases, but fall apart when packs need to:

| Need                                                     | Flat Mapping                                              | Tera Template                               |
| -------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- |
| Quality tiers (720p/1080p/4k)                            | 3 separate packs with 90% duplicated YAML                 | One pack, `quality` parameter               |
| Language variants                                        | One pack per language × quality = combinatorial explosion | `{% if language != "en" %}` conditional     |
| Faction-specific overrides                               | Manual enumeration of every faction's assets              | `{% for faction in factions %}` loop        |
| Optional components (victory sequences, tutorial videos) | Separate packs or monolithic everything-pack              | Boolean parameters with `{% if %}`          |
| Platform-aware (mobile gets 720p, desktop gets 1080p)    | Separate mobile/desktop packs                             | `quality` defaults per `ScreenClass`        |
| Mod-aware (pack adapts to which game module is active)   | One pack per game module                                  | `{% if game_module == "ra2" %}` conditional |

This is the same reason Helm uses Go templates instead of static YAML — real-world configuration has conditionals, loops, and user-specific values. Our approach is inspired by Helm's parameterized templating, but the configuration surface is the in-game settings UI, not a CLI + values file workflow.

### Most Packs Are Plain YAML (No Templating)

The **default and recommended** way to create a resource pack is plain YAML — just list the files you're replacing. No template syntax, no schema, no values file. This is what `ic mod init resource-pack` generates:

```yaml
# resource-packs/retro-sounds/pack.yaml — plain YAML, no Tera
resource_pack:
  name: "Retro 8-bit Sound Effects"
  category: sound_effects
  version: "1.0.0"
  assets:
    sounds/explosion_large.wav: assets/explosion_large_8bit.wav
    sounds/rifle_fire.wav: assets/rifle_fire_8bit.wav
    sounds/tank_move.wav: assets/tank_move_8bit.wav
```

This covers the majority of resource packs. Someone replacing cutscenes, swapping in HD sprites, or providing an alternative soundtrack just lists the overrides — done.

**Tera templates are opt-in for complex packs** that need parameters (quality tiers, language selection, conditional content). Rename `pack.yaml` to `pack.yaml.tera`, add a `schema.yaml`, and the engine renders the template at install time. But this is a power-user feature — most content creators never need it.

The engine detects `.tera` extension → renders template; plain `.yaml` → loads directly.

### Resource Pack Categories

Players can mix and match one pack per category:

| Category      | What It Overrides                                                | Example Packs                                                         |
| ------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| Cutscenes     | Briefing videos, victory/defeat sequences, in-mission cinematics | Original `.vqa`, AI-upscaled HD, community remakes, humorous parodies |
| Sprites       | Unit art, building art, effects, projectiles                     | Classic `.shp`, HD sprite pack, hand-drawn style                      |
| Music         | Soundtrack, menu music, faction themes                           | Original, Frank Klepacki remastered, community compositions           |
| Voice Lines   | EVA announcements, unit responses                                | Original, alternative EVA voices, localized voice packs               |
| Sound Effects | Weapon sounds, explosions, ambient                               | Original, enhanced audio, retro 8-bit                                 |
| Terrain       | Theater tilesets, terrain textures                               | Classic, HD, seasonal (winter/desert variants)                        |

### Settings UI

```
Settings → Resource Packs
┌───────────────────────────────────────────────┐
│ Cutscenes:     [HD Upscaled ▾]     [⚙ Configure]
│                 Quality: [1080p ▾]            │
│                 Language: [English ▾]         │
│                 Victory sequences: [✓]        │
│                                               │
│ Music:         [Remastered ▾]                 │
│ Voice Lines:   [Original ▾]                   │
│ Sprites:       [HD Pack ▾]          [⚙ Configure]
│ Sound Effects: [Original ▾]                   │
│ Terrain:       [HD Pack ▾]                    │
└───────────────────────────────────────────────┘
```

The ⚙ Configure button appears when a pack has a `schema.yaml` with user-configurable parameters. Simple packs (no schema) just show the dropdown.

### Relationship to Existing Decisions

Resource packs generalize a pattern that already appears in several places:

| Decision        | What It Switches                              | Resource Pack Equivalent                                                                                   |
| --------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| D019            | Balance rule sets (Classic/OpenRA/Remastered) | Balance presets already work this way                                                                      |
| D029            | Classic/HD sprite rendering (dual asset)      | Sprite resource packs supersede this; D029's `classic:`/`hd:` YAML keys become the first two sprite packs  |
| D032            | UI chrome, menus, lobby (themes)              | UI themes are resource packs for the chrome category                                                       |
| Tera templating | Mission/scene templates                       | Resource packs use the same `template.tera` + `schema.yaml` pattern — one templating system for everything |

The underlying mechanism is the same: **YAML-level asset indirection with Tera rendering**. The `template.tera` + `schema.yaml` pattern appears in three places:

```
Mission Templates  → template.yaml.tera + schema.yaml = playable mission
Scene Templates    → triggers.lua.tera  + schema.yaml = scripted encounter
Resource Packs     → pack.yaml.tera     + schema.yaml = asset override layer
```

One templating engine (Tera), one pattern, three use cases. Defaults live inline in the schema. User preferences come from settings UI (resource packs) or from the LLM/user filling in parameters (mission templates). No separate values file needed in the common case.

### Workshop Distribution (D030)

Resource packs are publishable to the workshop like any other resource:
- `ic mod init resource-pack` → scaffolds a pack with asset manifest
- `ic mod publish` → uploads to workshop
- Players subscribe in-game or via CLI
- Packs from multiple authors can coexist — one per category, player's choice
- Dependencies work: a mission pack can require a specific cutscene pack (`depends: alice/hd-cutscenes@^1.0`)

### Cutscenes Specifically

Since cutscenes are what prompted this — the system is particularly powerful here:

1. **Original `.vqa` files** — ship with the game (from original RA install). Low-res but authentic.
2. **AI-upscaled HD** — community or first-party pack running the originals through video upscaling. Same content, better resolution.
3. **Community remakes** — fans re-creating briefings with modern tools, voice acting, or different artistic styles.
4. **AI-generated replacements** — using video generation AI to create entirely new briefing sequences. Same narrative beats (referenced from campaign YAML), different visuals.
5. **Humorous/parody versions** — because the community will absolutely do this, and we should make it easy.
6. **Localized versions** — same briefings with translated subtitles or dubbed audio.

The campaign system (D021) references cutscenes by logical ID in the `video:` field. Changing which pack is active changes which video plays — no campaign YAML edits needed.

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

Campaign state is fully serializable (D010 — snapshottable sim state). Save games capture the entire campaign progress. Replays can replay an entire campaign run, not just individual missions.

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

This is not AI-adaptive difficulty (that's D016/`ic-llm`). This is **designer-authored conditional logic** expressed in YAML — the campaign reacts to the player's cumulative performance without any LLM involvement.

### LLM Campaign Generation

The LLM (`ic-llm`) can generate entire campaign graphs, not just individual missions:

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

The `ic-llm` crate can search the Workshop programmatically and incorporate discovered resources into generated content:

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

### Steam Workshop Integration (D030)

Steam Workshop is an **optional distribution source**, not a replacement for the IC Workshop. Resources published to Steam Workshop appear in the virtual repository alongside IC Workshop and local resources. Priority ordering determines which source wins when the same resource exists in multiple places.

```yaml
# settings.yaml — Steam Workshop as an additional source
workshop:
  sources:
    - url: "https://workshop.ironcurtain.gg"     # official IC Workshop
      priority: 1
    - type: steam_workshop                        # Steam Workshop source
      app_id: 0000000                             # IC's Steam app ID
      priority: 2
    - path: "C:/my-local-workshop"
      priority: 3
```

**Key design constraints:**
- IC Workshop is always the primary source — Steam is additive, never required
- Resources can be published to both IC Workshop and Steam Workshop simultaneously via `ic mod publish --also-steam`
- Steam Workshop subscriptions sync to local cache automatically
- No Steam lock-in — the game is fully functional without Steam

### In-Game Workshop Browser (D030)

The in-game browser queries the virtual repository (all configured sources merged). UX inspired by CS:GO/Steam Workshop browser:

- **Search:** FTS5-powered full-text search across names, descriptions, tags, and `llm_meta` fields
- **Filter:** By category (map, mod, music, sprites, etc.), game module (RA1, TD, RA2), rating, download count, author, license
- **Sort:** By popularity, newest, highest rated, most downloaded, trending (recent velocity)
- **Preview:** Screenshot gallery, description, dependency tree, license info, author profile with reputation badge
- **One-click subscribe:** Adds to local cache, resolves dependencies automatically
- **Collections:** Curated bundles ("Best Soviet mods", "Tournament map pool Season 5")
- **Creator profiles:** Author page showing all published resources, reputation score, tip links (D035)

### Modpacks as First-Class Workshop Resources (D030)

A **modpack** is a Workshop resource that bundles a curated set of mods with pinned versions, load order, and configuration — published as a single installable artifact. This is the lesson from Minecraft's CurseForge and Modrinth: modpacks solve the three hardest problems in modding ecosystems — discovery ("what mods should I use?"), compatibility ("do these mods work together?"), and onboarding ("how do I install all of this?").

```yaml
# mod.yaml for a modpack
mod:
  id: alice/red-apocalypse-pack
  title: "Red Apocalypse Complete Experience"
  version: "2.1.0"
  authors: ["alice"]
  description: "A curated collection of 12 mods for an enhanced RA1 experience"
  license: "CC0-1.0"
  category: Modpack                    # distinct category from Mod

engine:
  version: "^0.5.0"
  game_module: "ra1"

# Modpack-specific: list of mods with pinned versions and load order
modpack:
  mods:
    - id: "bob/hd-sprites"
      version: "=2.1.0"               # exact pin — tested with this version
    - id: "carol/economy-overhaul"
      version: "=1.4.2"
    - id: "dave/ai-improvements"
      version: "=3.0.1"
    - id: "alice/tank-rebalance"
      version: "=1.1.0"
  
  # Explicit conflict resolutions (if any)
  conflicts:
    - unit: heavy_tank
      field: health.max
      use_mod: "alice/tank-rebalance"
  
  # Configuration overrides applied after all mods load
  config:
    balance_preset: classic
    qol_preset: iron_curtain
```

**Why modpacks matter:**
- **For players:** One-click install of a tested, working mod combination. No manual dependency chasing, no version mismatch debugging.
- **For modpack curators:** A creative role that doesn't require writing any mod code. Curators test combinations, resolve conflicts, and publish a known-good experience.
- **For mod authors:** Inclusion in popular modpacks drives discovery and downloads. Modpacks reference mods by Workshop ID — the original mod author keeps full credit and control.

**Modpack lifecycle:**
- `ic mod init modpack` — scaffolds a modpack manifest
- `ic mod check` — validates all mods in the pack are compatible (version resolution, conflict detection)
- `ic mod test --headless` — loads all mods in sequence, runs smoke tests
- `ic mod publish` — publishes the modpack to Workshop. Installing the modpack auto-installs all referenced mods.

**Phase:** Modpack support in Phase 6a (alongside full Workshop registry).

### Auto-Download on Lobby Join (D030)

When a player joins a multiplayer lobby, the client checks `GameListing.required_mods` (see `03-NETCODE.md` § `GameListing`) against the local cache. Missing resources trigger automatic download:

1. **Diff:** Compare `required_mods` against local cache
2. **Prompt:** Show missing resources with total download size and estimated time
3. **Download:** Fetch from virtual repository (IC Workshop → Steam Workshop → community sources by priority)
4. **Verify:** SHA-256 checksum validation for every downloaded artifact
5. **Install:** Place in local cache, update dependency graph
6. **Ready:** Player joins game with all required content

Players can cancel at any time. Auto-download respects bandwidth limits configured in settings. Resources downloaded this way persist in the local cache for future sessions.

### Creator Reputation System (D030)

Creators earn reputation through community signals:

| Signal              | Weight   | Description                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------------- |
| Total downloads     | Medium   | Cumulative downloads across all published resources                         |
| Average rating      | High     | Mean star rating across published resources (minimum 10 ratings to display) |
| Dependency count    | High     | How many other resources/mods depend on this creator's work                 |
| Publish consistency | Low      | Regular updates and new content over time                                   |
| Community reports   | Negative | DMCA strikes, policy violations reduce reputation                           |

**Badges:**
- **Verified** — identity confirmed (e.g., linked GitHub account)
- **Prolific** — 10+ published resources with ≥4.0 average rating
- **Foundation** — resources depended on by 50+ other resources
- **Curator** — maintains high-quality curated collections

Reputation is displayed but not gatekeeping — any registered user can publish. Badges appear on resource listings, in-game browser, and author profiles. See `09-DECISIONS.md` § D030 for full design.

### Content Moderation & DMCA/Takedown Policy (D030)

The Workshop must be a safe, legal distribution platform. Content moderation is a combination of automated scanning, community reporting, and moderator review.

**Prohibited content:** Malware, hate speech, illegal content, impersonation of other creators.

**DMCA/IP takedown process (due process, not shoot-first):**

1. **Reporter files takedown request** via Workshop UI or email, specifying the resource and the claim (DMCA, license violation, policy violation)
2. **Resource is flagged** — not immediately removed — and the author is notified with a 72-hour response window
3. **Author can counter-claim** (e.g., they hold the rights, the reporter is mistaken)
4. **Workshop moderators review** — if the claim is valid, the resource is delisted (not deleted — remains in local caches of existing users)
5. **Repeat offenders** accumulate strikes. Three strikes → account publishing privileges suspended. Appeals process available.
6. **DMCA safe harbor:** The Workshop server operator (official or community-hosted) follows standard DMCA safe harbor procedures

**Lessons applied:** ArmA's heavy-handed approach (IP bans for mod redistribution) chilled creativity. Skyrim's paid mods debacle showed mandatory paywalls destroy goodwill. Our policy: due process, transparency, no mandatory monetization.

### Creator Recognition — Voluntary Tipping (D035)

Creators can optionally include tip/sponsorship links in their resource metadata. Iron Curtain **never processes payments** — we simply display links.

```yaml
# In resource manifest
creator:
  name: "alice"
  tip_links:
    - platform: ko-fi
      url: "https://ko-fi.com/alice"
    - platform: github-sponsors
      url: "https://github.com/sponsors/alice"
```

Tip links appear on resource pages, author profiles, and in the in-game browser. No mandatory paywalls — all Workshop content is free to download. This is a deliberate design choice informed by the Skyrim paid mods controversy and ArmA's gray-zone monetization issues.

### Achievement System Integration (D036)

Mod-defined achievements are publishable as Workshop resources. A mod can ship an achievement pack that defines achievements triggered by Lua scripts:

```yaml
# achievements/my-mod-achievements.yaml
achievements:
  - id: "my_mod.nuclear_winter"
    title: "Nuclear Winter"
    description: "Win a match using only nuclear weapons"
    icon: "icons/nuclear_winter.png"
    game_module: ra1
    category: competitive
    trigger: lua
    script: "triggers/nuclear_winter.lua"
```

Achievement packs are versioned, dependency-tracked, and license-required like all Workshop resources. Engine-defined achievements (campaign completion, competitive milestones) ship with the game and cannot be overridden by mods.

See `09-DECISIONS.md` § D036 for the full achievement system design including SQL schema and category taxonomy.

### Workshop API

The Workshop server stores all resource metadata, versions, dependencies, ratings, and search indices in an embedded SQLite database (D034). No external database required — the server is a single Rust binary that creates its `.db` file on first run. FTS5 provides full-text search over resource names, descriptions, and `llm_meta` tags. WAL mode handles concurrent reads from browse/search endpoints.

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
    fn create_token(&self, name: &str, scopes: &[TokenScope], expires: Duration) -> Result<ApiToken>; // CI/CD auth
    fn revoke_token(&self, token_id: &str) -> Result<()>; // CI/CD: revoke compromised tokens
    fn report_content(&self, id: &ResourceId, reason: ContentReport) -> Result<()>; // D030: content moderation
    fn get_creator_profile(&self, namespace: &str) -> Result<CreatorProfile>; // D030: creator reputation
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
/// Enables intelligent browsing, selection, and composition by ic-llm.
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
ic auth token create       # create scoped API token for CI/CD (publish, promote, admin)
ic auth token revoke       # revoke a leaked or expired token
```

**Why a CLI, not just scripts:**
- Single binary — no Python, .NET, or shell dependencies
- Cross-platform (Windows, macOS, Linux) from one codebase
- Rich error messages with fix suggestions
- Integrates with the workshop API
- Designed for CI/CD — all commands work headless (no interactive prompts)

### Continuous Deployment for Workshop Authors

The `ic` CLI is designed to run unattended in CI pipelines. Every command that touches the Workshop API accepts a `--token` flag (or reads `IC_WORKSHOP_TOKEN` from the environment) for headless authentication. No interactive login required.

**API tokens:**

```
ic auth token create --name "github-actions" --scope publish,promote --expires 90d
```

Tokens are scoped — a token can be limited to `publish` (upload only), `promote` (change channels), or `admin` (full access). Tokens expire. Leaked tokens can be revoked instantly via `ic auth token revoke` or the Workshop web UI.

**Example: GitHub Actions workflow**

```yaml
# .github/workflows/publish.yml
name: Publish to Workshop
on:
  push:
    tags: ["v*"]        # trigger on version tags

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install IC CLI
        run: curl -sSf https://install.ironcurtain.gg | sh

      - name: Validate mod
        run: ic mod check

      - name: Run smoke tests
        run: ic mod test --headless

      - name: Publish to beta channel
        run: ic mod publish --channel beta
        env:
          IC_WORKSHOP_TOKEN: ${{ secrets.IC_WORKSHOP_TOKEN }}

      # Optional: auto-promote to release after beta soak period
      - name: Promote to release
        if: github.ref_type == 'tag' && !contains(github.ref_name, '-beta')
        run: ic mod promote ${{ github.ref_name }} release
        env:
          IC_WORKSHOP_TOKEN: ${{ secrets.IC_WORKSHOP_TOKEN }}
```

**What this enables:**

| Workflow                    | Description                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Tag-triggered publish**   | Push a `v1.2.0` tag → CI validates, tests headless, publishes to Workshop automatically                                           |
| **Beta channel CI**         | Every merge to `main` publishes to `beta` channel; explicit tag promotes to `release`                                             |
| **Multi-resource monorepo** | A single repo with multiple resource packs, each published independently via matrix builds                                        |
| **Automated quality gates** | `ic mod check` + `ic mod test` + `ic mod audit` run before every publish — catch broken YAML, missing licenses, incompatible deps |
| **Scheduled rebuilds**      | Cron-triggered CI re-publishes against latest engine version to catch compatibility regressions early                             |

**GitLab CI, Gitea Actions, and any other CI system** work identically — the `ic` CLI is a single static binary with no runtime dependencies. Download it, set `IC_WORKSHOP_TOKEN`, run `ic mod publish`.

**Self-hosted Workshop servers** accept the same tokens and API — authors publishing to a community Workshop server use the same CI workflow, just pointed at a different `--server` URL:

```
ic mod publish --server https://mods.myclan.com/workshop --channel release
```

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
| **`ic-llm` (mission generation)** | Selects appropriate units for scenarios. "A hard mission" → picks units with `role: siege` and high counters. "A stealth mission" → picks units with `role: scout, infiltrator`. |
| **`ic-ai` (skirmish AI)**         | Reads `counters`/`countered_by` for build decisions. Knows to build anti-air when enemy has `role: air`. Reads `tactical_notes` for positioning hints.                           |
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

## Mod API Stability & Compatibility

The mod-facing API — YAML schema, Lua globals, WASM host functions — is a **stability surface** distinct from engine internals. Engine crates can refactor freely between releases; the mod API changes only with explicit versioning and migration support. This section documents how IC avoids the Minecraft anti-pattern (community fragmenting across incompatible versions) and follows the Factorio model (stable API, deprecation warnings, migration scripts).

**Lesson from Minecraft:** Forge and Fabric have no stable API contract. Every Minecraft update breaks most mods, fragmenting the community into version silos. Popular mods take months to update. Players are forced to choose between new game content and their mod setup. This is the single biggest friction in Minecraft modding.

**Lesson from Factorio:** Wube publishes a versioned mod API with explicit stability guarantees. Breaking changes are announced releases in advance, include migration scripts, and come with deprecation warnings that fire during `mod check`. Result: 5,000+ mods on the portal, most updated within days of a new game version.

**Lesson from Stardew Valley:** SMAPI (Stardew Modding API) acts as an adapter layer between the game and mods. When the game updates, SMAPI absorbs the breaking changes — mods written against SMAPI's stable surface continue to work even when Stardew's internals change. A single community-maintained compatibility layer protects thousands of mods.

### Stability Tiers

| Surface                                                                  | Stability Guarantee         | Breaking Change Policy                                                                                                                                          |
| ------------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **YAML schema** (unit fields, weapon fields, structure fields)           | Stable within major version | Fields can be added (non-breaking). Renaming or removing a field requires a deprecation cycle: old name works for 2 minor versions with a warning, then errors. |
| **Lua API globals** (D024, 16 OpenRA-compatible globals + IC extensions) | Stable within major version | New globals can be added. Existing globals never change signature. Deprecated globals emit warnings for 2 minor versions.                                       |
| **WASM host functions** (`ic_host_*` API)                                | Stable within major version | New host functions can be added. Existing function signatures never change. Deprecated functions continue to work with warnings.                                |
| **OpenRA aliases** (D023 vocabulary layer)                               | Permanent                   | Aliases are never removed — they can only accumulate. An alias that worked in IC 0.3 works in IC 5.0.                                                           |
| **Engine internals** (Bevy systems, component layouts, crate APIs)       | No guarantee                | Can change freely between any versions. Mods never depend on these directly.                                                                                    |

### Migration Support

When a breaking change is unavoidable (major version bump):

- **`ic mod migrate`** — CLI command that auto-updates mod YAML/Lua to the new schema. Handles field renames, deprecated API replacements, and schema restructuring. Inspired by `rustfix` and Factorio's migration scripts.
- **Deprecation warnings in `ic mod check`** — flag usage of deprecated fields, globals, or host functions before they become errors. Shows the replacement.
- **Changelog with migration guide** — every release that touches the mod API surface includes a "For Modders" section with before/after examples.

### Versioned Mod API (Independent of Engine Version)

The mod API version is declared separately from the engine version:

```yaml
# mod.yaml
engine:
  version: "^0.5.0"          # engine version (can change rapidly)
  mod_api: "^1.0"            # mod API version (changes slowly)
```

A mod targeting `mod_api: "^1.0"` works on any engine version that supports mod API 1.x. The engine can ship 0.5.0 through 0.9.0 without breaking mod API 1.0 compatibility. This decoupling means engine development velocity doesn't fragment the mod ecosystem.

### Compatibility Adapter Layer

Internally, the engine maintains an adapter between the mod API surface and engine internals — structurally similar to Stardew's SMAPI:

```
  Mod code (YAML / Lua / WASM)
        │
        ▼
  ┌─────────────────────────┐
  │  Mod API Surface        │  ← versioned, stable
  │  (schema, globals, host │
  │   functions)            │
  ├─────────────────────────┤
  │  Compatibility Adapter  │  ← translates stable API → current internals
  │  (ic-script crate)      │
  ├─────────────────────────┤
  │  Engine Internals       │  ← free to change
  │  (Bevy ECS, systems)    │
  └─────────────────────────┘
```

When engine internals change, the adapter is updated — mods don't notice. This is the same pattern that makes OpenRA's trait aliases (D023) work: the public YAML surface is stable, the internal component routing can change.

**Phase:** Mod API versioning and `ic mod migrate` in Phase 4 (alongside Lua/WASM runtime). Compatibility adapter formalized in Phase 6a (when mod ecosystem is large enough to matter). Deprecation warnings from Phase 2 onward (YAML schema stability starts early).
