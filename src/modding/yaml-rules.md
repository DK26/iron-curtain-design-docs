# Tier 1: Data-Driven (YAML Rules)

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

### Conditional Modifiers

Beyond static `damage_bonuses`, any numeric stat can carry **conditional modifiers** — declarative rules that adjust values based on runtime conditions, attributes, or game state. This is IC's **Tier 1.5**: more powerful than static YAML data, but still pure data (no Lua required). Inspired by [Unciv's "Uniques" system](https://github.com/yairm210/Unciv) and building on D028's condition and multiplier systems.

**Syntax:** Each modifier specifies an effect, a magnitude, and one or more conditions:

```yaml
# Unit definition with conditional modifiers
heavy_tank:
  inherits: _base_vehicle
  health:
    hp: 400
    armor: heavy
  mobile:
    speed: 4
    modifiers:
      - stat: speed
        bonus: +2
        conditions: [on_road]           # +2 speed on roads
      - stat: speed
        multiply: 0.5
        conditions: [on_snow]           # half speed on snow
  combat:
    modifiers:
      - stat: damage
        multiply: 1.25
        conditions: [veterancy >= 1]    # 25% damage boost at vet 1+
      - stat: range
        bonus: +1
        conditions: [deployed]          # +1 range when deployed
      - stat: reload
        multiply: 0.8
        conditions: [near_ally_repair]  # 20% faster reload near repair facility
```

**Filter types:** Conditions use typed filters matching D028's `ConditionId` system:

| Filter Type   | Examples                                           | Resolves Against              |
| ------------- | -------------------------------------------------- | ----------------------------- |
| **state**     | `deployed`, `moving`, `idle`, `damaged`            | Entity condition bitset       |
| **terrain**   | `on_road`, `on_snow`, `on_water`, `in_garrison`    | Cell terrain type             |
| **attribute** | `vs [armored]`, `vs [infantry]`, `vs [air]`        | Target attribute tags         |
| **veterancy** | `veterancy >= 1`, `veterancy == 3`                 | Entity veterancy level        |
| **proximity** | `near_ally_repair`, `near_enemy`, `near_structure` | Spatial query (cached/ticked) |
| **global**    | `superweapon_active`, `low_power`                  | Player-level game state       |

**Rust resolution:** At runtime, conditional modifiers feed directly into D028's `StatModifiers` component. The YAML loader converts each modifier entry into a `(source, stat, modifier_value, condition)` tuple:

```rust
/// A single conditional modifier parsed from YAML.
pub struct ConditionalModifier {
    pub stat: StatId,
    pub effect: ModifierEffect,        // Bonus(FixedPoint) or Multiply(FixedPoint)
    pub conditions: Vec<ConditionRef>, // all must be active (AND logic)
}

/// Modifier stack is evaluated per-tick for active entities.
/// Static modifiers (no conditions) are resolved once at spawn.
/// Conditional modifiers re-evaluate when any referenced condition changes.
pub fn resolve_stat(base: FixedPoint, modifiers: &[ConditionalModifier], conditions: &Conditions) -> FixedPoint {
    let mut value = base;
    for m in modifiers {
        if m.conditions.iter().all(|c| conditions.is_active(c)) {
            match m.effect {
                ModifierEffect::Bonus(b) => value += b,
                ModifierEffect::Multiply(f) => value = value * f,
            }
        }
    }
    value
}
```

**Evaluation order:** Bonuses apply first (additive), then multipliers (multiplicative), matching D028's modifier stack semantics. Within each category, modifiers apply in YAML declaration order.

**Why this matters for modders:** Conditional modifiers let 80% of gameplay customization stay in pure YAML. A modder can create veterancy bonuses, terrain effects, proximity auras, deploy-mode stat changes, and attribute-based damage scaling without writing a single line of Lua. Only novel mechanics (custom AI behaviors, unique ability sequencing, campaign scripting) require escalating to Tier 2 (Lua) or Tier 3 (WASM).

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

See `decisions/09d/D019-balance-presets.md` for full rationale.

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

### Rule Hydration: UnitDef → ECS Components

Deserialized `UnitDef` structs are intermediate data — not ECS components. The **rule hydration** step converts YAML rule data into spawned ECS entities with the game module's components:

```rust
/// Spawns a unit entity from a deserialized UnitDef.
/// Called by the sim during map loading and production completion.
fn spawn_unit(world: &mut World, def: &UnitDef, pos: WorldPos) -> UnitTag {
    let tag = world.resource_mut::<UnitPool>().allocate();
    let mut entity = world.spawn((
        tag,
        Position(pos),
        Health { current: def.health.max, max: def.health.max },
    ));
    if let Some(ref mobile) = def.mobile {
        entity.insert(Mobile { speed: mobile.speed, locomotor: mobile.locomotor.clone() });
    }
    if let Some(ref combat) = def.combat {
        entity.insert(Combat { weapon: combat.weapon.clone(), range: combat.range });
    }
    if let Some(ref buildable) = def.buildable {
        entity.insert(Buildable { cost: buildable.cost, build_time: buildable.build_time });
    }
    tag
}
```

The hydration function is game-module-specific — RA1's module maps `UnitDef.combat` to RA1 combat components, while an RA2 module would additionally map shield and garrison fields to their respective components. The `GameModule::register_components()` method (see `architecture/multi-game.md`) ensures all required component types are registered in the ECS `World` before hydration occurs.

**Full pipeline:** YAML file → `serde_yaml` / MiniYAML auto-convert → `UnitDef` struct → inheritance resolution → rule hydration → ECS entity with components. The first three steps are documented above; inheritance resolution is load-time (see § Inheritance below); rule hydration is the bridge from data to simulation.

### MiniYAML Migration & Runtime Loading

**Converter tool:** The `cnc-formats` CLI includes a `convert` subcommand (behind the `miniyaml` feature flag) that translates existing OpenRA MiniYAML mod data to standard YAML on disk: `cnc-formats convert --from miniyaml --to yaml rules.yaml` (explicit `--from` needed because `.yaml` is ambiguous; auto-detection works for unambiguous extensions like `.miniyaml`; `--from` always required for stdin). The `convert` subcommand uses extensible `--from`/`--to` flags — `--to` is always required, `--from` is optional (auto-detected from file extension when unambiguous, required for stdin). Adding new conversions is a `ConvertFormat` enum variant, not a subcommand change. The same CLI also provides `validate` (structural correctness check) and `inspect` (dump archive contents, frame counts, palette info) for all supported C&C formats.

**Runtime loading (D025):** MiniYAML files also load directly at runtime — no pre-conversion required. When `ra-formats` detects tab-indented content with `^` inheritance or `@` suffixes, it calls `cnc-formats`'s clean-room MiniYAML parser and auto-converts in memory. The runtime pipeline then applies alias resolution (D023 — OpenRA trait names → IC component names), which the standalone `cnc-formats convert` CLI does *not* perform (it is schema-neutral). This means existing OpenRA mods can be dropped into IC and played immediately — `ra-formats` handles both structural conversion and semantic mapping in one pass.

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

The load order, active mod set, conflict resolutions, and experience settings (D033) compose into a **mod profile** — a named, hashable, switchable TOML file (D067: infrastructure, not content) that captures a complete mod configuration:

```toml
# <data_dir>/profiles/tournament-s5.toml

[profile]
name = "Tournament Season 5"
game_module = "ra1"

[[sources]]
id = "official/tournament-balance"
version = "=1.3.0"

[[sources]]
id = "official/hd-sprites"
version = "=2.0.1"

[[conflicts]]
unit = "heavy_tank"
field = "health.max"
use_source = "official/tournament-balance"

[experience]
balance = "classic"
theme = "remastered"
pathfinding = "ic_default"
```

When a profile is activated, the engine builds a **virtual asset namespace** — a resolved lookup table mapping every logical asset path to a content-addressed blob (D049 local CAS) and every YAML rule to its merged value. The namespace fingerprint (SHA-256 of sorted entries) serves as a single-value compatibility check in multiplayer lobbies and replay playback. See `decisions/09c-modding.md` § D062 for the full design: namespace struct, Bevy `AssetSource` integration, lobby fingerprint verification, editor hot-swap, and the relationship between local profiles and published modpacks (D030).

**Phase:** Load order engine support in Phase 2 (part of YAML rule loading). `VirtualNamespace` struct and fingerprinting in Phase 2. `ic profile` CLI in Phase 4. Lobby fingerprint verification in Phase 5. Conflict detection CLI in Phase 4 (with `ic` CLI). In-game mod manager with profile dropdown in Phase 6a.
