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

**Tier coverage validated by OpenRA mods:** Analysis of six major OpenRA community mods (see `research/openra-mod-architecture-analysis.md`) confirms the 80/20 split and reveals precise boundaries between tiers. YAML (Tier 1) covers unit stats, weapon definitions, faction variants, inheritance overrides, and prerequisite trees. But every mod that goes beyond stat changes — even faction reskins — eventually needs code (C# in OpenRA, WASM in IC). The validated breakdown:

- **60–80% YAML** — Values, inheritance trees, faction variants, prerequisite DAGs, veterancy tables, weapon definitions, visual sequences. Some mods (Romanovs-Vengeance) achieve substantial new content purely through YAML template extension.
- **15–30% code** — Custom mechanics (mind control, temporal weapons, mirage disguise, new locomotors), custom format loaders, replacement production systems, and world-level systems (radiation layers, weather). In IC, this is Tier 2 (Lua for scripting) and Tier 3 (WASM for mechanics).
- **5–10% engine patches** — OpenRA mods sometimes require forking the engine (e.g., OpenKrush replaces 16 complete mechanic modules). IC's Tier 3 WASM modules + trait abstraction (D041) are designed to eliminate this need entirely — no fork, ever.

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

#### Unit Definition Features

The YAML unit definition system supports several patterns informed by SC2's data model (see `research/blizzard-github-analysis.md` § Part 2):

**Stable IDs:** Every unit type, weapon, ability, and upgrade has a stable numeric ID in addition to its string name. Stable IDs are assigned at mod-load time from a deterministic hash of the string name. Replays, network orders, and the analysis event stream reference entities by stable ID for compactness. When a mod renames a unit, backward compatibility is maintained via an explicit `aliases` list:

```yaml
units:
  medium_tank:
    id: 0x1A3F   # optional: override auto-assigned stable ID
    aliases: [med_tank, medium]  # old names still resolve
```

**Multi-weapon units:** Units can mount multiple weapons with independent targeting, cooldowns, and target filters — matching C&C's original design where units like the Cruiser have separate anti-ground and anti-air weapons:

```yaml
combat:
  weapons:
    - weapon: cruiser_cannon
      turret: primary
      target_filter: [ground, structure]
    - weapon: aa_flak
      turret: secondary
      target_filter: [air]
```

**Attribute tags:** Units carry attribute tags that affect damage calculations via versus tables. Tags are open-ended strings — game modules define their own sets. The RA1 module uses tags modeled on both C&C's original armor types and SC2's attribute system:

```yaml
attributes: [armored, mechanical]  # used by damage bonus lookups
```

Weapons can declare per-attribute damage bonuses:

```yaml
weapons:
  at_missile:
    damage: 60
    damage_bonuses:
      - attribute: armored
        bonus: 30   # +30 damage vs armored targets
      - attribute: light
        bonus: -10  # reduced damage vs light targets
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

See D019 in `decisions/09d-gameplay.md` for full rationale.

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

**OpenRA mod composition patterns and IC's alternative:** OpenRA mods compose functionality by stacking C# DLL assemblies. Romanovs-Vengeance loads **five DLLs simultaneously** (Common, Cnc, D2k, RA2, AttacqueSuperior) to combine cross-game components. OpenKrush uses `Include:` directives to compose modular content directories, each with their own rules, sequences, and assets. This DLL-stacking approach works but creates fragile version dependencies — a new OpenRA release can break all mods simultaneously.

IC's mod composition replaces DLL stacking with a layered mod dependency system (see Mod Load Order below) combined with WASM modules for new mechanics. Instead of stacking opaque DLLs, mods declare explicit dependencies and the engine resolves load order deterministically. Cross-game component reuse (D029) works through the engine's first-party component library — no need to import foreign game module DLLs just to access a carrier/spawner system or mind control mechanic.

### Why Not TOML / RON / JSON?

| Format | Verdict | Reason                                               |
| ------ | ------- | ---------------------------------------------------- |
| TOML   | Reject  | Awkward for deeply nested game data                  |
| RON    | Reject  | Modders won't know it, thin editor support           |
| JSON   | Reject  | Too verbose, no comments, miserable for hand-editing |
| YAML   | Accept  | Human-readable, universal tooling, serde integration |

### Mod Load Order & Conflict Resolution

When multiple mods modify the same game data, deterministic load order and explicit conflict handling are essential. Bethesda taught the modding world this lesson: Skyrim's 200+ mod setups are only viable because community tools (LOOT, xEdit, Bashed Patches) compensate for Bethesda's vague native load order. IC builds deterministic conflict resolution into the engine from day one — no third-party tools required.

**Three-phase data loading (from Factorio):** Factorio's mod loading uses three sequential phases — `data.lua` (define new prototypes), `data-updates.lua` (modify prototypes defined by other mods), `data-final-fixes.lua` (final overrides that run after all mods) — which eliminates load-order conflicts for the vast majority of mod interactions. IC should adopt an analogous three-phase approach for YAML/Lua mod loading:

1. **Define phase:** Mods declare new actors, weapons, and rules (additive only — no overrides)
2. **Modify phase:** Mods modify definitions from earlier mods (explicit dependency required)
3. **Final-fixes phase:** Balance patches and compatibility layers apply last-wins overrides

This structure means a mod that defines new units and a mod that rebalances existing units don't conflict — they run in different phases by design. Factorio's 8,000+ mod ecosystem validates that three-phase loading scales to massive mod counts. See `research/mojang-wube-modding-analysis.md` § Factorio.

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

For advanced setups, a `conflicts.yaml` file in the **game's user configuration directory** (next to `settings.toml`) lets the player explicitly resolve conflicts in their personal setup. This is a per-user file — it is not distributed with mods or modpacks, and it is not synced in multiplayer. Players who want to share their conflict resolutions can distribute the file manually or include it in a modpack manifest (the `modpack.conflicts` field serves the same purpose for published modpacks):

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

### Mod Profiles & Virtual Asset Namespace (D062)

The load order, active mod set, conflict resolutions, and experience settings (D033) compose into a **mod profile** — a named, hashable, switchable YAML file that captures a complete mod configuration:

```yaml
# <data_dir>/profiles/tournament-s5.yaml
profile:
  name: "Tournament Season 5"
  game_module: ra1
sources:
  - id: "official/tournament-balance"
    version: "=1.3.0"
  - id: "official/hd-sprites"
    version: "=2.0.1"
conflicts:
  - unit: heavy_tank
    field: health.max
    use_source: "official/tournament-balance"
experience:
  balance: classic
  theme: remastered
  pathfinding: ic_default
fingerprint: null  # computed at activation
```

When a profile is activated, the engine builds a **virtual asset namespace** — a resolved lookup table mapping every logical asset path to a content-addressed blob (D049 local CAS) and every YAML rule to its merged value. The namespace fingerprint (SHA-256 of sorted entries) serves as a single-value compatibility check in multiplayer lobbies and replay playback. See `decisions/09c-modding.md` § D062 for the full design: namespace struct, Bevy `AssetSource` integration, lobby fingerprint verification, editor hot-swap, and the relationship between local profiles and published modpacks (D030).

**Phase:** Load order engine support in Phase 2 (part of YAML rule loading). `VirtualNamespace` struct and fingerprinting in Phase 2. `ic profile` CLI in Phase 4. Lobby fingerprint verification in Phase 5. Conflict detection CLI in Phase 4 (with `ic` CLI). In-game mod manager with profile dropdown in Phase 6a.

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

| Global        | Purpose                                                                                                                                                                                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Campaign`    | Branching campaign state (D021)                                                                                                                                                                                                                                                                                            |
| `Weather`     | Dynamic weather control (D022)                                                                                                                                                                                                                                                                                             |
| `Layer`       | Runtime layer activation/deaction                                                                                                                                                                                                                                                                                          |
| `Region`      | Named region queries                                                                                                                                                                                                                                                                                                       |
| `Var`         | Mission/campaign variable access                                                                                                                                                                                                                                                                                           |
| `Workshop`    | Mod metadata queries                                                                                                                                                                                                                                                                                                       |
| `LLM`         | LLM integration hooks (Phase 7)                                                                                                                                                                                                                                                                                            |
| `Achievement` | Achievement trigger/query API (D036)                                                                                                                                                                                                                                                                                       |
| `Tutorial`    | Tutorial step management, contextual hints, UI highlighting, camera focus, build/order restrictions for pedagogical pacing (D065). Available in all game modes — modders use it to build tutorial sequences in custom campaigns. See `decisions/09g-interaction.md` § D065 for the full API.                               |
| `Ai`          | AI scripting primitives (Phase 4) — force composition, resource ratios, patrol/attack commands; inspired by Stratagus's proven Lua AI API (`AiForce`, `AiSetCollect`, `AiWait` pattern — see `research/stratagus-stargus-opencraft-analysis.md`). Enables Tier 2 modders to write custom AI behaviors without Tier 3 WASM. |

Each actor reference exposes properties matching its components (`.Health`, `.Location`, `.Owner`, `.Move()`, `.Attack()`, `.Stop()`, `.Guard()`, `.Deploy()`, etc.) — identical to OpenRA's actor property groups.

**In-game command system (inspired by Mojang's Brigadier):** Mojang's Brigadier parser (3,668★, MIT) defines commands as a typed tree where each node is an argument with a parser, suggestions, and permission checks. This architecture — tree-based, type-safe, permission-aware, with mod-injected commands — is the model for IC's in-game console and chat commands. Mods should be able to register custom commands (e.g., `/spawn`, `/weather`, `/teleport` for mission scripting) using the same tree-based architecture, with tab-completion suggestions generated from the command tree. See `research/mojang-wube-modding-analysis.md` § Brigadier and `decisions/09g-interaction.md` § D058 for the full command console design.

### API Design Principle: Runtime-Independent API Surface

The Lua API is defined as an **engine-level abstraction**, independent of the Lua VM implementation. This lesson comes from Valve's Source Engine VScript architecture (see `research/valve-github-analysis.md` § 2.3): VScript defined a scripting API abstraction layer so the same mod scripts work across Squirrel, Lua, and Python backends — the *API surface* is the stable contract, not the VM runtime.

For IC, this means:

1. **The API specification is the contract.** The 16 OpenRA-compatible globals and IC extensions are defined by their function signatures, parameter types, return types, and side effects — not by `mlua` implementation details. A mod that calls `Actor.Create("tank", pos)` depends on the API spec, not on how `mlua` dispatches the call.

2. **`mlua` is an implementation detail, not an API boundary.** The `mlua` crate is deeply integrated and switching Lua VM implementations (LuaJIT, Luau, or a future alternative) would be a substantial engineering effort. But mod scripts should never need to change when the VM implementation changes — they interact with the API surface, which is stable.

3. **WASM mods use the same API.** Tier 3 WASM modules access the equivalent API through host functions (see WASM Host API below). The function names, parameters, and semantics are identical. A mission modder can prototype in Lua (Tier 2) and port to WASM (Tier 3) by translating syntax, not by learning a different API.

4. **The API surface is testable independently.** Integration tests define expected behavior per-function ("`Actor.Create` with valid parameters returns an actor reference; with invalid parameters returns nil and logs a warning"). These tests validate any VM backend — they test the specification, not `mlua` internals.

This principle ensures the modding ecosystem survives VM transitions, just as VScript mods survived Valve's backend switches. The API is the asset; the runtime is replaceable.

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

-- Idle unit automation (inspired by SC2's OnUnitIdle callback —
-- see research/blizzard-github-analysis.md § Part 6)
Hooks.OnUnitIdle("Harvester", function(unit)
  -- Automatically send idle harvesters back to the nearest ore field
  local ore = Map.FindClosestResource(unit.position, "ore")
  if ore then
    unit:Harvest(ore)
  end
end)
```

### Lua Sandbox Rules

- Only engine-provided functions available (no `io`, `os`, `require` from filesystem)
- `os.time()`, `os.clock()`, `os.date()` are removed entirely — Lua scripts read game time via `Trigger.GetTick()` and `DateTime.GameTime`
- Fixed-point math provided via engine bindings (no raw floats)
- Execution resource limits per tick (see `LuaExecutionLimits` below)
- Memory limits per mod

**Lua standard library inclusion policy** (precedent: Stratagus selectively loads stdlib modules, excluding `io` and `package` in release builds — see `research/stratagus-stargus-opencraft-analysis.md` §6). IC is stricter:

| Lua stdlib  | Loaded      | Notes                                                                                                         |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| `base`      | ✅ selective | `print` redirected to engine log; `dofile`, `loadfile`, `load` **removed** (arbitrary code execution vectors) |
| `table`     | ✅           | Safe — table manipulation only                                                                                |
| `string`    | ✅           | Safe — string operations only                                                                                 |
| `math`      | ✅ modified  | `math.random` **removed** — replaced by `Utils.RandomInteger()` from engine's deterministic PRNG              |
| `coroutine` | ✅           | Useful for mission scripting flow control                                                                     |
| `utf8`      | ✅           | Safe — Unicode string handling (Lua 5.4)                                                                      |
| `io`        | ❌           | Filesystem access — never loaded in sandbox                                                                   |
| `os`        | ❌           | `os.execute()`, `os.remove()`, `os.rename()` are dangerous; entire module excluded                            |
| `package`   | ❌           | Module loading from filesystem — never loaded in sandbox                                                      |
| `debug`     | ❌           | Can inspect/modify internals, bypass sandboxing; development-only if needed                                   |

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

> **Security (V39):** Three edge cases in Lua limit enforcement: `string.rep` memory amplification (allocates before limit fires), coroutine instruction counter resets at yield/resume, and `pcall` suppressing limit violation errors. Mitigations: intercept `string.rep` with pre-allocation size check, verify instruction counting spans coroutines, make limit violations non-catchable (fatal to script context, not Lua errors). See `06-SECURITY.md` § Vulnerability 39.

## Tier 3: WASM Modules

### Rationale

- Near-native performance for complex mods
- Perfectly sandboxed by design (WASM's memory model)
- Deterministic execution (critical for multiplayer)
- Modders write in Rust, C, Go, AssemblyScript, or even Python compiled to WASM
- `wasmtime` or `wasmer` crates

### Browser Build Limitation (WASM-on-WASM)

When IC is compiled to WASM for the browser target (Phase 7), Tier 3 WASM mods present a fundamental problem: `wasmtime` does not compile to `wasm32-unknown-unknown`. The game itself is running as WASM in the browser — it cannot embed a full WASM runtime to run mod WASM modules inside itself.

**Implications:**
- **Browser builds support Tier 1 (YAML) and Tier 2 (Lua) mods only.** Lua via `mlua` compiles to WASM and executes as interpreted bytecode within the browser build. YAML is pure data.
- **Tier 3 WASM mods are desktop/server-only** (native builds where `wasmtime` runs normally).
- **Multiplayer between browser and desktop clients** is not affected by this limitation *for the base game* — the sim, networking, and all built-in systems are native Rust compiled to WASM. The limitation only matters when a lobby requires a Tier 3 mod; browser clients cannot join such lobbies.

**Future mitigation:** A WASM interpreter written in pure Rust (e.g., `wasmi`) can itself compile to `wasm32-unknown-unknown`, enabling Tier 3 mods in the browser at reduced performance (~10-50x slower than native `wasmtime`). This is acceptable for lightweight WASM mods (AI strategies, format loaders) but likely too slow for complex pathfinder or render mods. When/if this becomes viable, the engine would use `wasmtime` on native builds and `wasmi` on browser builds — same mod binary, different execution speed. This is a Phase 7+ concern.

**Lobby enforcement:** Servers advertise their Tier 3 support level. Browser clients filter the server browser to show only lobbies they can join. A lobby requiring a Tier 3 WASM mod displays a platform restriction badge.

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
    pub render: bool,                 // For render mods (ic_render_* API)
    pub pathfinding: bool,            // For pathfinder mods (ic_pathfind_* API)
    pub ai_strategy: bool,            // For AI mods (ic_ai_* API + AiStrategy trait)
    pub filesystem: FileAccess,       // Usually None
    pub network: NetworkAccess,       // Usually None
}

pub enum NetworkAccess {
    None,                          // Most mods
    AllowList(Vec<String>),        // UI mods fetching assets
    // NEVER unrestricted
}
```

> **Security (V43):** Domain-based `AllowList` is vulnerable to DNS rebinding — an approved domain can be re-pointed to `127.0.0.1` or `192.168.x.x` after capability review. Mitigations: block RFC 1918/loopback/link-local IP ranges after DNS resolution, pin DNS at mod load time, validate resolved IP on every request. See `06-SECURITY.md` § Vulnerability 43.

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
    Isometric,          // fixed angle, zoom via OrthographicProjection.scale
    FreeLook,           // full 3D rotation, zoom via camera distance
    Orbital { target: WorldPos },  // orbit a point, zoom via distance
}
// Zoom behavior is controlled by the GameCamera resource (02-ARCHITECTURE.md § Camera).
// WASM render mods that provide a custom ScreenToWorld impl interpret the zoom value
// appropriately for their camera type (orthographic scale vs. dolly distance vs. FOV).
```

**Render mod registration:** A render mod implements the `Renderable` and `ScreenToWorld` traits (see `02-ARCHITECTURE.md` § "3D Rendering as a Mod"). It registers via `ic_render_register()` for each actor type it handles. Unregistered actor types fall through to the default sprite renderer. This allows **partial** render overrides — a mod can replace tank rendering with 3D meshes while leaving infantry as sprites.

**Security:** Render host functions are gated by `ModCapabilities.render`. A gameplay mod (AI, scripting) cannot access `ic_render_*` functions. Render mods cannot access `ic_host_issue_order()` — they draw, they don't command. These capabilities are declared in the mod manifest and verified at load time.

### WASM Pathfinding API Surface

Tier 3 WASM mods can provide custom `Pathfinder` trait implementations (D013, D045). This follows the same pattern as render mods — a well-defined host API surface, capability-gated, with the WASM module implementing the trait through exported functions that the engine calls.

**Why modders want this:** Different games need different pathfinding. A Generals-style total conversion needs layered grid pathfinding with bridge and surface bitmask support. A naval mod needs flow-based routing. A tower defense mod needs waypoint pathfinding. The three built-in presets (Remastered, OpenRA, IC Default) cover the Red Alert family — community pathfinders cover everything else.

```rust
// === Pathfinding Host API (ic_pathfind_* namespace) ===
// Available only to mods with ModCapabilities.pathfinding = true

/// Register this WASM module as a Pathfinder implementation.
/// Called once at load time. The engine calls the exported trait methods below.
#[wasm_host_fn] fn ic_pathfind_register(pathfinder_id: &str);

/// Query terrain passability at a position for a given locomotor.
/// Pathfinder mods need to read terrain but not modify it.
#[wasm_host_fn] fn ic_pathfind_get_terrain(pos: WorldPos) -> TerrainType;

/// Query the terrain height at a position (for 3D-aware pathfinding).
#[wasm_host_fn] fn ic_pathfind_get_height(pos: WorldPos) -> SimCoord;

/// Query entities in a radius (for dynamic obstacle avoidance).
/// Returns entity positions and radii — no gameplay data exposed.
#[wasm_host_fn] fn ic_pathfind_query_obstacles(
    center: WorldPos, radius: SimCoord
) -> Vec<(WorldPos, SimCoord)>;

/// Read the current map dimensions.
#[wasm_host_fn] fn ic_pathfind_map_bounds() -> (WorldPos, WorldPos);

/// Allocate scratch memory from the engine's pre-allocated pool.
/// Pathfinding is hot-path — no per-tick heap allocation allowed.
#[wasm_host_fn] fn ic_pathfind_scratch_alloc(bytes: u32) -> *mut u8;

/// Return scratch memory to the pool.
#[wasm_host_fn] fn ic_pathfind_scratch_free(ptr: *mut u8, bytes: u32);
```

**WASM-exported trait functions** (the engine *calls* these on the mod):

```rust
// Exported by the WASM pathfinder mod — these map to the Pathfinder trait

/// Called by the engine when a unit requests a path.
#[wasm_export] fn pathfinder_request_path(
    origin: WorldPos, dest: WorldPos, locomotor: LocomotorType
) -> PathId;

/// Called by the engine to retrieve computed waypoints.
#[wasm_export] fn pathfinder_get_path(id: PathId) -> Option<Vec<WorldPos>>;

/// Called by the engine to check passability (e.g., building placement).
#[wasm_export] fn pathfinder_is_passable(
    pos: WorldPos, locomotor: LocomotorType
) -> bool;

/// Called by the engine when terrain changes (building placed/destroyed).
#[wasm_export] fn pathfinder_invalidate_area(
    center: WorldPos, radius: SimCoord
);
```

**Example: Generals-style layered grid pathfinder as a WASM mod**

The C&C Generals source code (GPL v3, `electronicarts/CnC_Generals_Zero_Hour`) uses a layered grid system with 10-unit cells, surface bitmasks, and bridge layers. A community mod can reimplement this as a WASM pathfinder — see `research/pathfinding-ic-default-design.md` § "C&C Generals / Zero Hour" for the `LayeredGridPathfinder` design sketch.

```yaml
# generals_pathfinder/mod.yaml
mod:
  name: "Generals Pathfinder"
  type: pathfinder
  pathfinder_id: layered-grid-generals
  display_name: "Generals (Layered Grid)"
  description: "Grid pathfinding with bridge layers and surface bitmasks, inspired by C&C Generals"
  wasm_module: generals_pathfinder.wasm
  capabilities:
    pathfinding: true
  config:
    zone_block_size: 10
    bridge_clearance: 10.0
    surface_types: [ground, water, cliff, air, rubble]
```

**Security:** Pathfinding host functions are gated by `ModCapabilities.pathfinding`. A pathfinder mod can read terrain and obstacle positions but cannot issue orders, read gameplay state (health, resources, fog), or access render functions. This is a narrower capability than gameplay mods — pathfinders compute routes, nothing else.

**Determinism:** WASM pathfinder mods execute in the deterministic sim context. They use the same `WasmExecutionLimits` fuel budget as other WASM mods. All clients run the same WASM binary (verified by SHA-256 hash in the lobby) with the same inputs, producing identical paths. If the fuel budget is exceeded mid-path-request, the path is truncated deterministically — all clients truncate at the same point.

**Pathfinder fuel budget concern:** Pathfinding has fundamentally different call patterns from other WASM mod types. An AI mod calls `ai_decide()` once per tick — one large computation. A pathfinder mod handles `pathfinder_request_path()` potentially hundreds of times per tick (once per moving unit). The flat `WasmExecutionLimits.fuel_per_tick` budget doesn't distinguish between these patterns: a pathfinder that spends 5,000 fuel per path request × 200 moving units = 1,000,000 fuel, consuming the entire default budget on pathfinding alone.

**Mitigation — scaled fuel allocation for pathfinder mods:**
- Pathfinder WASM modules receive a **separate, larger fuel allocation** (`pathfinder_fuel_per_tick`) that defaults to 5× the standard budget (5,000,000 fuel). This reflects the many-calls-per-tick reality of pathfinding workloads.
- The per-request fuel is not individually capped — the total fuel across all path requests in a tick is bounded. This allows some paths to be expensive (complex terrain) as long as the aggregate stays within budget.
- If the pathfinder exhausts its fuel mid-tick, remaining path requests for that tick return `PathResult::Deferred` — the engine queues them for the next tick(s). This is deterministic (all clients defer the same requests) and gracefully degrades under load rather than truncating individual paths.
- The pathfinder fuel budget is separate from the mod's general `fuel_per_tick` (used for initialization, event handlers, etc.). A pathfinder mod that also handles events gets two budgets.
- Mod manifests can request a custom `pathfinder_fuel_per_tick` value. The lobby displays this alongside other requested limits.

**Multiplayer sync:** Because pathfinding is sim-affecting, all players must use the same pathfinder. The lobby validates that all clients have the same pathfinder WASM module (hash + version). A modded pathfinder is treated identically to a built-in preset for sync purposes.

**Phase:** WASM pathfinding API ships in Phase 6a alongside the mod testing framework and Workshop. Built-in pathfinder presets (D045) ship in Phase 2 as native Rust implementations.

### WASM AI Strategy API Surface

Tier 3 WASM mods can provide custom `AiStrategy` trait implementations (D041, D043). This follows the same pattern as render and pathfinder mods — a well-defined host API surface, capability-gated, with the WASM module implementing the trait through exported functions that the engine calls.

**Why modders want this:** Different games call for different AI approaches. A competitive mod wants a GOAP planner that reads influence maps. An academic project wants a Monte Carlo tree search AI. A Generals-clone needs AI that understands bridge layers and surface types. A novelty mod wants a neural-net AI that learns from replays. The three built-in behavior presets (Classic RA, OpenRA, IC Default) use `PersonalityDrivenAi` — community AIs can use fundamentally different algorithms.

```rust
// === AI Host API (ic_ai_* namespace) ===
// Available only to mods with ModCapabilities.read_visible_state = true
// AND ModCapabilities.issue_orders = true

/// Query own units visible to this AI player.
/// Returns (entity_id, unit_type, position, health, max_health) tuples.
#[wasm_host_fn] fn ic_ai_get_own_units() -> Vec<AiUnitInfo>;

/// Query enemy units visible to this AI player (fog-filtered).
/// Only returns units in line of sight — no maphack.
#[wasm_host_fn] fn ic_ai_get_visible_enemies() -> Vec<AiUnitInfo>;

/// Query neutral/capturable entities visible to this AI player.
#[wasm_host_fn] fn ic_ai_get_visible_neutrals() -> Vec<AiUnitInfo>;

/// Get current resource state for this AI player.
#[wasm_host_fn] fn ic_ai_get_resources() -> AiResourceInfo;

/// Get current power state (production, drain, surplus).
#[wasm_host_fn] fn ic_ai_get_power() -> AiPowerInfo;

/// Get current production queue state.
#[wasm_host_fn] fn ic_ai_get_production_queues() -> Vec<AiProductionQueue>;

/// Check if a unit type can be built (prerequisites, cost, factory available).
#[wasm_host_fn] fn ic_ai_can_build(unit_type: &str) -> bool;

/// Check if a building can be placed at a position.
#[wasm_host_fn] fn ic_ai_can_place_building(
    building_type: &str, pos: WorldPos
) -> bool;

/// Get terrain type at a position (for strategic planning).
#[wasm_host_fn] fn ic_ai_get_terrain(pos: WorldPos) -> TerrainType;

/// Get map dimensions.
#[wasm_host_fn] fn ic_ai_map_bounds() -> (WorldPos, WorldPos);

/// Get current tick number.
#[wasm_host_fn] fn ic_ai_current_tick() -> u64;

/// Get fog-filtered event narrative since a given tick (D041 AiEventLog).
/// Returns a natural-language chronological account of game events.
/// This is the "inner game event log / action story / context" that LLM-based
/// AI (D044) and any WASM AI can use for temporal awareness.
#[wasm_host_fn] fn ic_ai_get_event_narrative(since_tick: u64) -> String;

/// Get structured event log since a given tick (D041 AiEventLog).
/// Returns fog-filtered events as typed entries for programmatic consumption.
#[wasm_host_fn] fn ic_ai_get_events(since_tick: u64) -> Vec<AiEventEntry>;

/// Issue an order for an owned unit. Returns false if order is invalid.
/// Orders go through the same OrderValidator (D012/D041) as human orders.
#[wasm_host_fn] fn ic_ai_issue_order(order: &PlayerOrder) -> bool;

/// Allocate scratch memory from the engine's pre-allocated pool.
#[wasm_host_fn] fn ic_ai_scratch_alloc(bytes: u32) -> *mut u8;
#[wasm_host_fn] fn ic_ai_scratch_free(ptr: *mut u8, bytes: u32);

/// String table lookups — resolve u32 type IDs to human-readable names.
/// Called once at game start or on-demand; results cached WASM-side.
/// This avoids per-tick String allocation across the WASM boundary.
#[wasm_host_fn] fn ic_ai_get_type_name(type_id: u32) -> String;
#[wasm_host_fn] fn ic_ai_get_event_description(event_code: u32) -> String;
#[wasm_host_fn] fn ic_ai_get_type_count() -> u32;  // total registered unit types

pub struct AiUnitInfo {
    pub entity_id: u32,
    pub unit_type_id: u32,    // interned type ID (see ic_ai_get_type_name() for string lookup)
    pub position: WorldPos,
    pub health: i32,
    pub max_health: i32,
    pub is_idle: bool,
    pub is_moving: bool,
}

pub struct AiEventEntry {
    pub tick: u64,
    pub event_type: u32,      // mapped from AiEventType enum
    pub event_code: u32,      // interned event description ID (see ic_ai_get_event_description())
    pub entity_id: Option<u32>,
    pub related_entity_id: Option<u32>,
}
```

**WASM-exported trait functions** (the engine *calls* these on the mod):

```rust
// Exported by the WASM AI mod — these map to the AiStrategy trait

/// Called once per tick. Returns serialized Vec<PlayerOrder>.
#[wasm_export] fn ai_decide(player_id: u32, tick: u64) -> Vec<PlayerOrder>;

/// Event callbacks — called before ai_decide() in the same tick.
#[wasm_export] fn ai_on_unit_created(unit_id: u32, unit_type: &str);
#[wasm_export] fn ai_on_unit_destroyed(unit_id: u32, attacker_id: Option<u32>);
#[wasm_export] fn ai_on_unit_idle(unit_id: u32);
#[wasm_export] fn ai_on_enemy_spotted(unit_id: u32, unit_type: &str);
#[wasm_export] fn ai_on_enemy_destroyed(unit_id: u32);
#[wasm_export] fn ai_on_under_attack(unit_id: u32, attacker_id: u32);
#[wasm_export] fn ai_on_building_complete(building_id: u32);
#[wasm_export] fn ai_on_research_complete(tech: &str);

/// Parameter introspection — called by lobby UI for "Advanced AI Settings."
#[wasm_export] fn ai_get_parameters() -> Vec<ParameterSpec>;
#[wasm_export] fn ai_set_parameter(name: &str, value: i32);

/// Engine scaling opt-out.
#[wasm_export] fn ai_uses_engine_difficulty_scaling() -> bool;
```

**Security:** AI mods can read visible game state (`ic_ai_get_own_units`, `ic_ai_get_visible_enemies`) and issue orders (`ic_ai_issue_order`). They CANNOT read fogged state — `ic_ai_get_visible_enemies()` returns only units in the AI player's line of sight. They cannot access render functions, pathfinder internals, or other players' private data. Orders go through the same `OrderValidator` as human orders — an AI mod cannot issue impossible commands.

**Determinism:** WASM AI mods execute in the deterministic sim context. Events fire in a fixed order (same order on all clients). `decide()` is called at the same pipeline point on all clients with the same `FogFilteredView`. All clients run the same WASM binary (verified by SHA-256 hash per AI player slot) with the same inputs, producing identical orders.

**Performance:** AI mods share the `WasmExecutionLimits` fuel budget. The `tick_budget_hint()` return value is advisory — the engine uses it for scheduling but enforces the fuel limit regardless. A community AI that exceeds its budget mid-tick gets truncated deterministically.

**Phase:** WASM AI API ships in Phase 6a. Built-in AI (`PersonalityDrivenAi` + behavior presets from D043) ships in Phase 4 as native Rust.

### WASM Format Loader API Surface

Tier 3 WASM mods can register custom asset format loaders via the `FormatRegistry`. This is critical for total conversions that use non-C&C asset formats — analysis of OpenRA mods (see `research/openra-mod-architecture-analysis.md`) shows that non-C&C games on the engine require extensive custom format support:

- **OpenKrush (KKnD):** 15+ custom binary format decoders — `.blit` (sprites), `.mobd` (animations), `.mapd` (terrain), `.lvl` (levels), `.son`/`.soun` (audio), `.vbc` (video). None of these resemble C&C formats.
- **d2 (Dune II):** 6 distinct sprite formats (`.icn`, `.cps`, `.wsa`, `.shp` variant), custom map format, `.adl` music.
- **OpenHV:** Uses standard PNG/WAV/OGG — no proprietary binary formats at all.

The engine provides a `FormatLoader` WASM API surface that lets mods register custom decoders:

```rust
// === Format Loader Host API (ic_format_* namespace) ===
// Available only to mods with ModCapabilities.format_loading = true

/// Register a custom format loader for a file extension.
/// When the engine encounters a file with this extension, it calls
/// the mod's exported decode function instead of the built-in loader.
#[wasm_host_fn] fn ic_format_register_loader(
    extension: &str, loader_id: &str
);

/// Report decoded sprite data back to the engine.
#[wasm_host_fn] fn ic_format_emit_sprite(
    sprite_id: u32, width: u32, height: u32,
    pixel_data: &[u8], palette: Option<&[u8]>
);

/// Report decoded audio data back to the engine.
#[wasm_host_fn] fn ic_format_emit_audio(
    audio_id: u32, sample_rate: u32, channels: u8,
    pcm_data: &[u8]
);

/// Read raw bytes from an archive or file (engine handles archive mounting).
#[wasm_host_fn] fn ic_format_read_bytes(
    path: &str, offset: u32, length: u32
) -> Option<Vec<u8>>;
```

**Security:** Format loading occurs at asset load time, not during simulation ticks. Format loader mods have file read access (through the engine's archive abstraction) but cannot issue orders, access game state, or call render functions. They decode bytes into engine-standard pixel/audio/mesh data — nothing else.

**Phase:** WASM format loader API ships in Phase 6a alongside the broader mod testing framework. Built-in C&C format loaders (`ra-formats`) ship in Phase 0.

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

### Custom Pathfinding Mods (Tier 3 Showcase)

The second major Tier 3 showcase: replacing how units navigate the battlefield. Just as 3D render mods replace the visual presentation, pathfinder mods replace the movement algorithm — while combat, building, harvesting, and everything else remain unchanged.

**Why this matters:** The original C&C Generals uses a layered grid pathfinder with surface bitmasks and bridge layers — fundamentally different from Red Alert's approach. A Generals-clone mod needs Generals-style pathfinding. A naval mod needs flow routing. A tower defense mod needs waypoint constraint pathfinding. No single algorithm fits every RTS — the `Pathfinder` trait (D013) lets modders bring their own.

**A pathfinder mod implements:**

```rust
// WASM mod: Generals-style layered grid pathfinder
// (See research/pathfinding-ic-default-design.md § "C&C Generals / Zero Hour")
struct LayeredGridPathfinder {
    grid: Vec<CellLayer>,          // 10-unit cells with bridge layers
    zones: ZoneMap,                // flood-fill reachability zones
    surface_bitmask: SurfaceMask,  // ground | water | cliff | air | rubble
}

impl Pathfinder for LayeredGridPathfinder {
    fn request_path(&mut self, origin: WorldPos, dest: WorldPos, locomotor: LocomotorType) -> PathId {
        // 1. Check zone connectivity (instant reject if unreachable)
        // 2. Surface bitmask check for locomotor compatibility
        // 3. A* over layered grid (bridges are separate layers)
        // 4. Path smoothing pass
        // ...
    }
    fn get_path(&self, id: PathId) -> Option<&[WorldPos]> { /* ... */ }
    fn is_passable(&self, pos: WorldPos, locomotor: LocomotorType) -> bool {
        let cell = self.grid.cell_at(pos);
        cell.surface_bitmask.allows(locomotor)
    }
    fn invalidate_area(&mut self, center: WorldPos, radius: SimCoord) {
        // Rebuild affected zones, recalculate bridge connectivity
    }
}
```

**Mod manifest and config:**

```yaml
# generals_pathfinder/mod.yaml
mod:
  name: "Generals Pathfinder"
  type: pathfinder
  pathfinder_id: layered-grid-generals
  display_name: "Generals (Layered Grid)"
  version: "1.0.0"
  capabilities:
    pathfinding: true
  config:
    zone_block_size: 10
    bridge_clearance: 10.0
    surface_types: [ground, water, cliff, air, rubble]
```

**How other mods use it:**

```yaml
# desert_strike_mod/mod.yaml — a total conversion using the Generals pathfinder
mod:
  name: "Desert Strike"
  pathfinder: layered-grid-generals
  depends:
    - community/generals-pathfinder@^1.0
```

**Multiplayer sync:** All players must use the same pathfinder — the WASM binary hash is validated in the lobby, same as any sim-affecting mod. If a player is missing the pathfinder mod, the engine auto-downloads it from the Workshop (CS:GO-style, per D030).

**Performance contract:** Pathfinder mods share the same `WasmExecutionLimits` fuel budget as other WASM mods. The engine monitors per-tick pathfinding time. If a community pathfinder consistently exceeds the budget, the lobby warns players. The engine never falls back silently to a different pathfinder — determinism means all clients must agree on every path. If a WASM pathfinder exhausts its fuel mid-computation, the requesting unit retains its last-known heading for one tick (zero-cost "continue straight" fallback) and the path request is re-queued for the next tick with a shorter search horizon. This prevents unit freezing without breaking determinism.

**Phase:** WASM pathfinder mods in Phase 6a. The three built-in pathfinder presets (D045) ship as native Rust in Phase 2.

### Custom AI Mods (Tier 3 Showcase)

The third major Tier 3 showcase: replacing how AI opponents think. Just as render mods replace visual presentation and pathfinder mods replace navigation algorithms, AI mods replace the decision-making engine — while the simulation rules, damage pipeline, and everything else remain unchanged.

**Why this matters:** The built-in `PersonalityDrivenAi` uses behavior trees tuned by YAML personality parameters. This works well for most players. But the RTS AI community spans decades of research — GOAP planners, Monte Carlo tree search, influence map systems, neural networks, evolutionary strategies (see `research/rts-ai-extensibility-survey.md`). The `AiStrategy` trait (D041) lets modders bring any algorithm to Iron Curtain, and the two-axis difficulty system (D043) lets any AI scale from Sandbox to Nightmare.

**A custom AI mod implements:**

```rust
// WASM mod: GOAP (Goal-Oriented Action Planning) AI
struct GoapPlannerAi {
    goals: Vec<Goal>,         // Expand, Attack, Defend, Tech, Harass
    plan: Option<ActionPlan>, // Current multi-step plan
    world_model: WorldModel,  // Internal state tracking
}

impl AiStrategy for GoapPlannerAi {
    fn decide(&mut self, player: PlayerId, view: &FogFilteredView, tick: u64) -> Vec<PlayerOrder> {
        // 1. Update world model from visible state
        self.world_model.update(view);
        // 2. Re-evaluate goal priorities
        self.goals.sort_by_key(|g| -g.priority(&self.world_model));
        // 3. If plan invalidated or expired, re-plan
        if self.plan.is_none() || tick % self.replan_interval == 0 {
            self.plan = self.planner.search(
                &self.world_model, &self.goals[0], self.search_depth
            );
        }
        // 4. Execute next action in plan
        self.plan.as_mut().map(|p| p.next_orders()).unwrap_or_default()
    }

    fn on_enemy_spotted(&mut self, unit: EntityId, unit_type: &str) {
        // Scouting intel → update world model → may trigger re-plan
        self.world_model.add_sighting(unit, unit_type);
        if self.world_model.threat_level() > self.defend_threshold {
            self.plan = None; // force re-plan next tick
        }
    }

    fn on_under_attack(&mut self, _unit: EntityId, _attacker: EntityId) {
        self.goals.iter_mut().find(|g| g.name == "Defend")
            .map(|g| g.urgency += 30); // boost defense priority
    }

    fn get_parameters(&self) -> Vec<ParameterSpec> {
        vec![
            ParameterSpec { name: "search_depth".into(), min: 1, max: 10, default: 5, .. },
            ParameterSpec { name: "replan_interval".into(), min: 10, max: 120, default: 30, .. },
            ParameterSpec { name: "defend_threshold".into(), min: 0, max: 100, default: 40, .. },
        ]
    }

    fn uses_engine_difficulty_scaling(&self) -> bool { false }
    // This AI handles difficulty via search_depth and replan_interval
}
```

**Mod manifest:**

```yaml
# goap_ai/mod.yaml
mod:
  name: "GOAP Planner AI"
  type: ai_strategy
  ai_strategy_id: goap-planner
  display_name: "GOAP Planner"
  description: "Goal-oriented action planning — multi-step strategic reasoning"
  version: "2.1.0"
  wasm_module: goap_planner.wasm
  capabilities:
    read_visible_state: true
    issue_orders: true
    ai_strategy: true
  config:
    search_depth: 5
    replan_interval: 30
```

**How other mods use it:**

```yaml
# zero_hour_mod/mod.yaml — a total conversion using the GOAP AI
mod:
  name: "Zero Hour Remake"
  default_ai: goap-planner
  depends:
    - community/goap-planner-ai@^2.0
```

**AI tournament community:** Workshop can host AI tournament leaderboards — automated matches between community AI submissions, ranked by Elo/TrueSkill. This is directly inspired by BWAPI's SSCAIT tournament (15+ years of StarCraft AI competition) and AoE2's AI ladder (20+ years of community AI development). The `ic mod test` framework (above) provides headless match execution; the Workshop provides distribution and ranking.

**Phase:** WASM AI mods in Phase 6a. Built-in `PersonalityDrivenAi` + behavior presets (D043) ship as native Rust in Phase 4.

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

> **Lifelong learning (D057):** Proven template parameter combinations — which `ambush` location choices, `defend_position` wave compositions, and multi-scene sequences produce missions that players rate highly — are stored in the **skill library** (`decisions/09f-tools.md` § D057) and retrieved as few-shot examples for future generation. The template library provides the valid output space; the skill library provides accumulated knowledge about what works within that space.

### Scene Templates (Composable Building Blocks)

Inspired by Operation Flashpoint / ArmA's mission editor: scene templates are **sub-mission components** — reusable, pre-scripted building blocks that snap together inside a mission. Each scene template has its own trigger logic, AI behavior, and Lua scripts already written and tested. The user or LLM only fills in parameters.

> **Visual editor equivalent:** The IC SDK's scenario editor (D038) exposes these same building blocks as **modules** — drag-and-drop logic nodes with a properties panel. Scene templates are the YAML/Lua format; modules are the visual editor face. Same underlying data — a composition saved in the editor can be loaded as a scene template by Lua/LLM, and vice versa. See `decisions/09f-tools.md` § D038.

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

> **Format guidance (D049):** New Workshop content should use Bevy-native modern formats (OGG, PNG, WAV, WebM, KTX2, GLTF) for best compatibility, security, and tooling support. C&C legacy formats (.aud, .shp, .vqa, .tmp) are fully supported for backward compatibility but not recommended for new content. See `05-FORMATS.md` § Canonical Asset Format Recommendations and `decisions/09e-community.md` § D049 for full rationale.

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

> **Moved to [modding/campaigns.md](modding/campaigns.md)** for RAG/context efficiency.
>
> Full design for branching mission graphs with persistent state, unit roster carryover, and continuous mission flow. OFP/ArmA-inspired (D021). Includes: campaign graph schema, mission node types, branch conditions, outcome variables, unit persistence, save/checkpoint system, co-op campaign adaptations, and Lua scripting integration.

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
├── campaigns/                # campaign definitions (D021)
│   └── tutorial/
│       └── campaign.yaml
├── hints/                    # contextual hint definitions (D065)
│   └── mod-hints.yaml
├── tips/                     # post-game tip definitions (D065)
│   └── mod-tips.yaml
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

**Contextual hints (`hints/`):** Modders define YAML-driven gameplay hints that appear at point-of-need during any game mode. Hints are merged with the base game's hints at load time. The full schema — trigger types, suppression rules, experience profile targeting, and SQLite tracking — is documented in `decisions/09g-interaction.md` § D065 Layer 2.

**Post-game tips (`tips/`):** YAML-driven rule-based tips shown on the post-game stats screen, matching gameplay event patterns. See `decisions/09g-interaction.md` § D065 Layer 5.

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
6. **`ai_usage` is required on publish, defaults to `metadata_only`.** Authors must make an explicit choice about AI access. `ic mod publish` prompts for ai_usage on first publish and remembers the choice as a user-level default. Authors can change ai_usage on any existing resource at any time via `ic mod update --ai-usage allow|metadata_only|deny`.

### Author Consent for LLM Usage (ai_usage)

The Workshop's AI consent model is deliberately **separate from the license system**. A resource's SPDX license governs what humans may legally do (redistribute, modify, sell). The `ai_usage` field governs what **automated AI agents** may do — and these are genuinely different questions.

**Why this separation is necessary:**

A composer publishes a Soviet march track under CC-BY-4.0. They're fine with other modders using it in their mods (with credit). But they don't want an LLM to automatically select their track when generating missions — they'd prefer a human to choose it deliberately. Under a license-only model, CC-BY permits both uses identically. The `ai_usage` field lets the author distinguish.

Conversely, a modder publishes cutscene briefings with all rights reserved (no redistribution). But they *do* want LLMs to know these cutscenes exist and recommend them — because more visibility means more downloads. `ai_usage: allow` with a restrictive license means the LLM can auto-add it as a dependency reference (the mission says "requires bob/soviet-briefings@1.0"), but the end user's `ic mod install` still respects the license when downloading.

**The three tiers:**

| `ai_usage` Value          | LLM Can Search | LLM Can Read Metadata | LLM Can Auto-Add as Dependency | Human Approval Required |
| ------------------------- | -------------- | --------------------- | ------------------------------ | ----------------------- |
| `allow`                   | Yes            | Yes                   | Yes                            | No                      |
| `metadata_only` (default) | Yes            | Yes                   | No — LLM recommends only       | Yes — human confirms    |
| `deny`                    | No             | No                    | No                             | N/A — invisible to LLMs |

**YAML manifest example:**

```yaml
# A cutscene pack published with full LLM access
mod:
  id: alice/soviet-briefing-pack
  title: "Soviet Campaign Briefings"
  version: "1.0.0"
  license: "CC-BY-4.0"
  ai_usage: allow                      # LLMs can auto-pull this

  llm_meta:
    summary: "5 live-action Soviet briefing videos with English subtitles"
    purpose: "Campaign briefings for Soviet missions — general briefs troops before battle"
    gameplay_tags: [soviet, briefing, cutscene, campaign, live_action]
    difficulty: null
    composition_hints: "Use before Soviet campaign missions. Pairs with soviet-march-music for atmosphere."
    content_description:
      contents:
        - "briefing_01.webm — General introduces the war (2:30)"
        - "briefing_02.webm — Orders to capture Allied base (1:45)"
        - "briefing_03.webm — Retreat and regroup speech (2:10)"
        - "briefing_04.webm — Final assault planning (3:00)"
        - "briefing_05.webm — Victory celebration (1:20)"
      themes: [military, soviet_propaganda, dramatic, patriotic]
      style: "Retro FMV with live actors, 4:3 aspect ratio, film grain"
      duration: "10:45 total"
      resolution: "640x480"
    related_resources:
      - "alice/soviet-march-music"
      - "community/ra1-soviet-voice-lines"
```

```yaml
# A music track with metadata-only access (default)
mod:
  id: bob/ambient-war-music
  title: "Ambient Battlefield Soundscapes"
  version: "2.0.0"
  license: "CC-BY-NC-4.0"
  ai_usage: metadata_only              # LLMs can recommend but not auto-add

  llm_meta:
    summary: "6 ambient war soundscape loops, 3-5 minutes each"
    purpose: "Background audio for tense defensive scenarios"
    gameplay_tags: [ambient, tension, defense, loop, atmospheric]
    composition_hints: "Works best layered under game audio, not as primary music track"
```

**Workshop UI integration:**
- The Workshop browser shows an "AI Discoverable" badge on resources with `ai_usage: allow`
- Resource settings page includes a clear toggle: "Allow AI agents to use this resource automatically"
- Creator profile shows aggregate AI stats: "42 of your resources are AI-discoverable" with a bulk-edit option
- `ic mod lint` warns if `ai_usage` is set to `allow` but `llm_meta` is empty (the resource is auto-pullable but provides no context for LLMs to evaluate it)

### Workshop Organization for LLM Discovery

Beyond individual resource metadata, the Workshop itself is organized to support LLM navigation and composition:

**Semantic resource relationships:**

Resources can declare relationships to other resources beyond simple dependencies:

```yaml
# In mod.yaml
relationships:
  variant_of: "community/standard-soviet-sprites"  # this is an HD variant
  works_with:                                         # bidirectional composition hints
    - "alice/soviet-march-music"
    - "community/snow-terrain-textures"
  supersedes: "bob/old-soviet-sprites@1.x"            # migration path from older resource
```

These relationships are indexed by the Workshop server and exposed to LLM queries. An LLM searching for "Soviet sprites" finds the standard version and is told "alice/hd-soviet-sprites is an HD variant." An LLM building a winter mission finds snow terrain and is told "works well with alice/soviet-march-music." This is structured composition knowledge that tags alone can't express.

**Category hierarchies for LLM navigation:**

Resource categories (Music, Sprites, Maps, etc.) have sub-categories that LLMs can traverse:

```
Music/
├── Soundtrack/          # full game soundtracks
├── Ambient/             # background loops
├── Faction/             # faction-themed tracks
│   ├── Soviet/
│   ├── Allied/
│   └── Custom/
└── Event/               # victory, defeat, mission start
Cutscenes/
├── Briefing/            # pre-mission briefings  
├── InGame/              # triggered during gameplay
└── Cinematic/           # standalone story videos
```

LLMs query hierarchically: "find a Soviet faction music track" → navigate Music → Faction → Soviet, rather than relying solely on tag matching. The hierarchy provides structure; tags provide precision within that structure.

**Curated LLM composition sets (Phase 7+):**

Workshop curators (human or LLM-assisted) can publish **composition sets** — pre-vetted bundles of resources that work together for a specific creative goal:

```yaml
# A composition set (published as a Workshop resource with category: CompositionSet)
mod:
  id: curators/soviet-campaign-starter-kit
  category: CompositionSet
  ai_usage: allow
  llm_meta:
    summary: "Pre-vetted resource bundle for creating Soviet campaign missions"
    purpose: "Starting point for LLM mission generation — all resources are ai_usage:allow and license-compatible"
    gameplay_tags: [soviet, campaign, starter_kit, curated]
    composition_hints: "Use as a base, then search for mission-specific assets"
  
composition:
  resources:
    - id: "alice/soviet-briefing-pack"
      role: "briefings"
    - id: "alice/soviet-march-music"
      role: "soundtrack"
    - id: "community/ra1-soviet-voice-lines"
      role: "unit_voices"
    - id: "community/snow-terrain-textures"
      role: "terrain"
    - id: "community/standard-soviet-sprites"
      role: "unit_sprites"
  verified_compatible: true            # curator has tested these together
  all_ai_accessible: true              # all resources in set are ai_usage: allow
```

An LLM asked to "generate a Soviet campaign mission" can start by pulling a relevant composition set, then search for additional mission-specific assets. This saves the LLM from evaluating hundreds of individual resources and avoids license/ai_usage conflicts — the curator has already verified compatibility.

## Mod API Stability & Compatibility

The mod-facing API — YAML schema, Lua globals, WASM host functions — is a **stability surface** distinct from engine internals. Engine crates can refactor freely between releases; the mod API changes only with explicit versioning and migration support. This section documents how IC avoids the Minecraft anti-pattern (community fragmenting across incompatible versions) and follows the Factorio model (stable API, deprecation warnings, migration scripts).

**Lesson from Minecraft:** Forge and Fabric have no stable API contract. Every Minecraft update breaks most mods, fragmenting the community into version silos. Popular mods take months to update. Players are forced to choose between new game content and their mod setup. This is the single biggest friction in Minecraft modding.

**Lesson from Factorio:** Wube publishes a versioned mod API with explicit stability guarantees. Breaking changes are announced releases in advance, include migration scripts, and come with deprecation warnings that fire during `mod check`. Result: 5,000+ mods on the portal, most updated within days of a new game version.

**Lesson from Stardew Valley:** SMAPI (Stardew Modding API) acts as an adapter layer between the game and mods. When the game updates, SMAPI absorbs the breaking changes — mods written against SMAPI's stable surface continue to work even when Stardew's internals change. A single community-maintained compatibility layer protects thousands of mods.

**Lesson from ArmA/OFP:** Bohemia Interactive's SQF scripting language has remained backwards-compatible across 25+ years of releases (OFP → ArmA → ArmA 2 → ArmA 3). Scripts written for Operation Flashpoint in 2001 still execute in ArmA 3 (2013+). This extraordinary stability is a primary reason the ArmA modding community survived multiple engine generations — modders invest in learning an API only when they trust it won't be discarded. Conversely, ArmA's lack of a formal deprecation process meant obsolete commands accumulated indefinitely. IC applies both lessons: backwards compatibility within major versions (the ArmA principle) combined with explicit deprecation cycles (the Factorio principle) so the API stays clean without breaking existing work.

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
