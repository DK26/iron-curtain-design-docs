# Mojang & Wube Open-Source Repository Analysis

> Research document analyzing Mojang (Minecraft) and Wube (Factorio) open-source
> repositories on GitHub, focusing on patterns relevant to Iron Curtain's design.

**Repositories analyzed:**
- Mojang/brigadier (3,668★) — Command parser/dispatcher
- Mojang/bedrock-samples (1,436★) — Bedrock add-on samples
- Mojang/DataFixerUpper (1,270★) — Save data migration library
- Mojang/bedrock-protocol-docs (536★) — Network protocol documentation
- Mojang/ore-ui (551★) — React-based game UI building blocks
- Mojang/minecraft-editor (315★) — In-game world editor
- wube/factorio-data (607★) — Lua prototype definitions

**Date:** 2026-02

---

## 1. Mojang/brigadier — Command Parsing Architecture

### Overview

Brigadier is Minecraft's command parser/dispatcher, open-sourced under MIT. It is a
standalone library with zero Minecraft dependencies — a clean, general-purpose command
framework. This is directly relevant to IC's future console/chat command system.

### Architecture

The core type is `CommandDispatcher<S>`, generic over a "source" type `S` that
represents the command originator (player, console, etc.). The command tree is built
from three node types:

| Node Type                   | Purpose                                         |
| --------------------------- | ----------------------------------------------- |
| `RootCommandNode<S>`        | Invisible root; children must be literals       |
| `LiteralCommandNode<S>`     | Matches an exact string (e.g. `"give"`, `"tp"`) |
| `ArgumentCommandNode<S, T>` | Parses a typed argument via `ArgumentType<T>`   |

The `CommandNode<S>` base class holds:
- **children** — `LinkedHashMap<String, CommandNode<S>>` for ordered lookup
- **requirement** — `Predicate<S>` for permission checks (source-based filtering)
- **redirect** — optional pointer to another node (for aliases and `execute as`)
- **command** — the `Command<S>` to execute if input ends at this node

### Registration Pattern (Builder API)

Commands are registered via a builder DSL:
```java
dispatcher.register(
    literal("foo")
        .then(argument("bar", integer())
            .executes(c -> { /* handler */ return 1; }))
        .executes(c -> { /* handler */ return 1; })
);
```

Key design choices:
1. **Append-only registration** — mods can extend existing commands without access
   to the original source. `addChild()` merges nodes with the same name.
2. **Parse/execute split** — `parse()` returns a cacheable `ParseResults<S>`;
   `execute()` runs from cached results. Parsing is the expensive step.
3. **Permission via predicate** — each node has a `canUse(S source)` predicate.
   Commands invisible to unauthorized users are filtered from suggestions and usage.
4. **Smart usage generation** — `getSmartUsage()` compresses the tree into
   human-readable strings like `foo (<bar>)`, showing optional/required args.

### Argument Type System

The `ArgumentType<T>` interface is the extension point:
```java
public interface ArgumentType<T> {
    T parse(StringReader reader) throws CommandSyntaxException;
    default <S> CompletableFuture<Suggestions> listSuggestions(...) {...}
    default Collection<String> getExamples() {...}
}
```

Built-in types: `BoolArgumentType`, `IntegerArgumentType`, `FloatArgumentType`,
`DoubleArgumentType`, `LongArgumentType`, `StringArgumentType`. Games add custom
types (coordinates, selectors, items, etc.).

### Suggestion System

Each `ArgumentType` and `CommandNode` can provide `CompletableFuture<Suggestions>`,
enabling async tab-completion. The `SuggestionsBuilder` tracks input position and
builds ranked suggestion lists with optional tooltips.

### IC Relevance

**Pattern to adopt for IC console commands:**
- Generic `CommandDispatcher<CommandSource>` where `CommandSource` carries player
  identity, permission level, and execution context.
- Trait-based argument types in Rust: `trait ArgumentType: Parse + Suggest`.
- Builder pattern for registration (Rust builder macros or method chaining).
- Parse/execute split enables the same pattern useful for IC: parse once (for
  validation/display), execute later (possibly on different tick).
- Permission predicates map naturally to IC's admin/player/spectator roles.
- The append-only merge behavior is critical for modding — mods can add subcommands
  to existing commands without source access. This aligns with D004 (Lua scripting).

**Key difference:** IC should use the `CommandDispatcher` pattern for both the
in-game console AND the CLI tool (`ic`), with different `CommandSource` types.

---

## 2. Mojang/bedrock-samples — Data-Driven Entity System

### Pack Structure

Bedrock Edition uses a behavior/resource pack split:

```
behavior_pack/
├── manifest.json        # Pack metadata with UUID, version, dependencies
├── biomes/              # Biome definitions (JSON)
├── entities/            # Entity behavior definitions (JSON)
├── items/               # Item definitions (JSON)
├── loot_tables/         # Loot table definitions (JSON)
├── recipes/             # Crafting recipes (JSON)
├── spawn_rules/         # Spawn condition rules (JSON)
└── trading/             # Villager trading tables (JSON)

resource_pack/
├── manifest.json
├── textures/
├── models/
├── animations/
├── render_controllers/
└── entity/              # Client-side entity rendering definitions
```

### Manifest System

Each pack has a `manifest.json`:
```json
{
    "format_version": 2,
    "header": {
        "name": "Vanilla Behavior Pack",
        "uuid": "ee649bcf-256c-4013-9068-6a802b89d756",
        "version": [0, 0, 1],
        "min_engine_version": [1, 26, 0]
    },
    "modules": [{ "type": "data", ... }],
    "dependencies": [{ "uuid": "...", "version": [0, 0, 1] }]
}
```

Key features:
- **UUID-based identity** — each pack and module has a unique identifier
- **Semantic versioning** — `[major, minor, patch]` format
- **Engine version pinning** — `min_engine_version` declares compatibility
- **Explicit dependencies** — packs reference their dependencies by UUID+version

### Entity Definition Pattern (Component-Based)

Entity behavior is entirely data-driven through JSON. The `cow.json` example
demonstrates the architecture:

```json
{
  "format_version": "1.26.0",
  "minecraft:entity": {
    "description": {
      "identifier": "minecraft:cow",
      "spawn_category": "creature",
      "is_spawnable": true,
      "properties": {
        "minecraft:climate_variant": {
          "type": "enum", "values": ["temperate", "warm", "cold"],
          "default": "temperate", "client_sync": true
        }
      }
    },
    "component_groups": { ... },
    "components": { ... },
    "events": { ... }
  }
}
```

**Three-level entity architecture:**

1. **Components** — always-present behaviors (`minecraft:health`, `minecraft:physics`,
   `minecraft:movement`, `minecraft:behavior.*` AI goals with priorities)
2. **Component Groups** — named bundles of components that can be added/removed at
   runtime (e.g. `minecraft:cow_baby` vs `minecraft:cow_adult`)
3. **Events** — triggers that add/remove component groups with filters, randomization,
   and sequencing

This is **remarkably similar to OpenRA's trait system** and directly validates IC's
ECS-based data-driven approach (D003). The priority-numbered behavior goals
(`minecraft:behavior.panic` at priority 1, `minecraft:behavior.random_stroll` at
priority 6) map to IC's AI behavior presets (D043).

### IC Relevance

**Patterns to adopt:**
- **format_version field** — every data file starts with a version declaration.
  IC's YAML rule files should include a `format_version` field to enable future
  migration (connects to D054 SnapshotCodec versioning).
- **Component group toggling** — Bedrock's "add/remove component groups via events"
  is equivalent to IC's condition system (D028). The pattern is proven at massive
  scale.
- **Behavior priority system** — numbering AI behaviors by priority is exactly what
  IC needs for its priority-based AI managers (D043).
- **Filter system** — Bedrock uses declarative filters (`"test": "has_biome_tag"`)
  for conditional logic. IC's YAML rules should support similar declarative conditions.
- **Separation of behavior/resource packs** — clean sim/render split, same as IC's
  architecture. Behavior packs ≈ `ic-sim` YAML rules. Resource packs ≈ `ic-render`
  assets.

**Pattern to avoid:**
- **JSON verbosity** — the villager_v2.json entity file is extremely verbose (40KB+
  for a single entity). IC's YAML with inheritance (D003) will be more concise.
  Bedrock's lack of inheritance forces massive duplication across entities.

---

## 3. Mojang/DataFixerUpper — Save Migration Framework

### Overview

DataFixerUpper (DFU) is Mojang's answer to the problem every long-lived game faces:
how do you load save files from version 1.0 in version 2.0 when the data schema has
changed hundreds of times? DFU solves this with a mathematically grounded approach
based on **type-safe data transformations** and **algebraic optics**.

### Core Concepts

| Type                | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `Schema`            | Declares all data types at a specific game version               |
| `DataFix`           | A transformation rule between two schemas                        |
| `DataFixerBuilder`  | Collects schemas + fixes, builds an optimized migration pipeline |
| `TypeRewriteRule`   | The actual rewrite operation applied to data                     |
| `DSL.TypeReference` | Named reference to a data type (e.g. "entity", "block_entity")   |

### Schema System

Each game version defines a `Schema` that inherits from the previous version:
```java
public Schema(final int versionKey, final Schema parent) {
    this.versionKey = versionKey;
    this.parent = parent;
    registerTypes(this, registerEntities(this), registerBlockEntities(this));
    types = buildTypes();
}
```

Schemas register:
- **Entity types** — every entity variant with its data structure
- **Block entity types** — tile entities
- **Typed references** — named type families that fixes can target

### DataFix Pattern

Fixes target specific types with transformation functions:
```java
public class MyFix extends DataFix {
    protected TypeRewriteRule makeRule() {
        return fixTypeEverywhereTyped("fix_name",
            getInputSchema().getType(References.ENTITY),
            typed -> { /* transform data */ return typed; }
        );
    }
}
```

Key methods:
- `fixTypeEverywhereTyped()` — apply a fix to all instances of a type
- `writeFixAndRead()` — serialize old, transform, deserialize into new schema
- `convertUnchecked()` — unsafe type conversion (for format changes)

### Builder Pipeline

The `DataFixerBuilder` is fed schemas and fixes in version order:
```java
builder.addSchema(100, V100::new);  // Version 100 schema
builder.addFixer(new MyFixV100());  // Fix from 99→100
builder.addSchema(200, V200::new);  // Version 200 schema
builder.addFixer(new MyFixV200());  // Fix from 100→200
// ...
Result result = builder.build();
DataFixer fixer = result.fixer();
// Optionally: result.optimize(types, executor) — parallel precompute
```

The builder:
1. Creates an ordered chain of schemas and fixes
2. Optimizes the chain (combining compatible transformations)
3. Supports parallel pre-optimization via `CompletableFuture`

### Optimization

DFU's optimization step is expensive at startup but saves time during gameplay.
It pre-computes composed transformation rules for commonly-needed version jumps.
The academic references in the README (algebraic program transformation, profunctor
optics) explain the theoretical foundation for this optimization.

### IC Relevance — SnapshotCodec (D054)

**DFU validates IC's SnapshotCodec version dispatch approach.** Key lessons:

1. **Version-tagged data is mandatory.** Every save/snapshot must embed its schema
   version. DFU uses integer version keys; IC should use `(major, minor)` pairs.

2. **Schemas define the expected shape.** IC's `SnapshotCodec` should register
   expected types per version, similar to DFU's `Schema.registerEntities()`.

3. **Fixes are small, composable, and ordered.** Each migration is a single,
   testable transformation. IC should avoid monolithic migration functions.

4. **Migration chains compose.** Loading a v5 save in v12 should apply
   v5→v6, v6→v7, ..., v11→v12 automatically. DFU does exactly this.

5. **Type safety prevents silent data loss.** DFU's type system catches schema
   mismatches at fix registration time, not at runtime. IC's Rust type system
   can enforce this even more strictly with `serde` and enums.

**Simplification opportunity:** DFU is arguably over-engineered for most games.
Its full algebraic optics machinery is heavyweight. IC can achieve 90% of the
benefit with a simpler approach:
- Ordered list of `SnapshotMigration` functions
- Each takes `(version: u32, data: &mut Value) -> Result<()>`
- Compose them in order from save version to current version
- No need for the full category-theoretic machinery

**Factorio's migration system** (see §7 below) is a much better complexity match
for IC than DFU — both simpler and proven at scale.

---

## 4. Mojang/bedrock-protocol-docs — Protocol Documentation

### Documentation Structure

The protocol documentation repo contains:
```
docs/             # Markdown documentation of packet structures
html/             # Generated HTML documentation
json/             # Machine-readable protocol definitions
dot/              # Graphviz diagrams of packet structures
tools/            # Documentation generation tools
previous_changelogs/  # Historical protocol changes
changelog_924_01_21_26.md  # Latest changes
```

### Protocol Versioning

Key documentation practices:
- **Network version number** — monotonically increasing integer (currently 893+)
  separate from game version. Each protocol change gets a new version.
- **Granular changelogs** — every protocol version change is documented with:
  - Modified enums (added/removed/renamed values)
  - New/modified packets
  - Changed data structures
- **Raw protocol version log** — single-line descriptions per version bump:
  ```
  894: Added LevelSoundEvent::SpearUse
  901: Block registry checksum algorithm change
  910: Added ActorType::Undead
  ```
- **Multiple output formats** — Markdown, HTML, JSON, and Graphviz dot files
  generated from the same source

### Enum Change Tracking

The changelog meticulously tracks enum modifications:
```
ActorType:
  Added Undead (0x00010000 | Mob)
  Changed ZombieMonster from UndeadMob to UndeadMonster
  Removed UndeadMob
```

This level of detail is essential for protocol compatibility.

### IC Relevance — ic-protocol

**Patterns to adopt:**
1. **Separate protocol version from game version.** IC's `ic-protocol` should have
   its own version counter that increments on every wire-format change.
2. **Machine-readable protocol definitions.** The JSON output format enables
   automated compatibility checking and code generation. IC should define its
   protocol in a structured format (possibly protobuf or a custom schema).
3. **Changelog discipline.** Every protocol change must document:
   what changed, why, and which versions are affected.
4. **Enum tracking.** OpenRA vocabulary compatibility (D023/D027) requires
   tracking every enum name — Bedrock's approach is the model.

---

## 5. Mojang/ore-ui — Observable-Based Game UI

### Architecture

Ore UI is a React/TypeScript UI framework designed for game UIs rendered via
[Coherent GameFace](https://coherent-labs.com/products/coherent-gameface/) (a
web engine embedded in games). The key innovation is `@react-facet`:

**React Facet** is an observable-based state management library. Instead of
React's standard `useState` → re-render cycle, Facets use an observable pattern
that bypasses React's reconciliation for performance-critical updates.

Packages:
- `@react-facet/core` — Observable state primitives
- `@react-facet/dom-fiber` — Custom React renderer for game DOM
- `@react-facet/shared-facet` — Cross-component state sharing

### Key Insight

Mojang chose **web technology for game UI** but needed to solve React's
performance problem for 60fps game updates. Their solution: observables
that can update DOM directly without triggering React re-renders.

### IC Relevance

IC uses **Bevy UI** (D002/D032), not web tech, so ore-ui's React-specific patterns
don't directly apply. However, the principle is valuable:

- **Observable-based UI updates** — Bevy's change detection system serves the same
  purpose. UI components should only re-render when their observed data changes.
- **Game UI ≠ web app UI** — game UIs need much higher update rates for real-time
  information (unit health, resource counts, minimap). Standard UI frameworks
  struggle here. Bevy's ECS-driven approach is better suited.
- **Separation of UI framework from game engine** — ore-ui is a standalone library.
  IC's `ic-ui` is a separate crate, which is the right boundary.

---

## 6. Mojang/minecraft-editor — In-Game Editor

### Architecture

Minecraft Editor is an **in-engine editing experience** built on Bedrock's
JavaScript Scripting API. Key architectural decisions:

1. **Editor is NOT a game mode** — it's a separate workflow with its own UI and
   tools, accessed via a special launch flag (`?Editor=true`).
2. **Extension-based architecture** — the editor exposes an Editor API that third
   parties use to build "Extensions" (custom editing tools).
3. **Built on the game's scripting API** — editor extensions use the same scripting
   system as gameplay scripts, plus additional editor-specific APIs.
4. **Separate starter kit repo** — build pipeline, libraries, and types for
   extension development are in a separate repository.

### Extension Model

- Extension Starter Kit provides build tooling
- Extension Samples demonstrate patterns
- Extensions are JavaScript/TypeScript that interact with the Editor API
- The editor itself is a mix of native C++ tools and scripted UI

### IC Relevance — Scenario Editor (D038) & Asset Studio (D040)

**Strong validation of IC's approach:**
- IC plans a separate `ic-editor` crate that shares library crates with `ic-game`
  but is a separate binary. Minecraft does essentially the same thing (separate
  launch mode, not a game mode).
- IC's plan for Lua scripting in the editor (mission logic) parallels Minecraft's
  JavaScript-based editor extensions.
- The extension model validates IC's approach of making the editor extensible
  by modders — not just a closed tool.

**Lessons from Minecraft's approach:**
1. **Early access works for editors** — Minecraft's editor is explicitly in "early
   development" and ships iteratively. IC can do the same rather than waiting
   for a polished editor before shipping.
2. **Extension starter kit is essential** — modders need scaffolding, not just API
   docs. IC should provide template projects for scenario editor extensions.
3. **Editor requires its own API surface** — the gameplay API and editor API are
   related but distinct. IC's `ic-editor` will need editor-specific Lua globals
   beyond the 16+ OpenRA-compatible globals in `ic-script` (D024).

---

## 7. wube/factorio-data — Lua Prototype System

### Overview

The `factorio-data` repository is a public mirror of Factorio's Lua game data
definitions, automatically generated from the game's internal data. It tracks every
change between releases via git, giving mod authors a precise record of what changed.

### Module Organization

Factorio uses a modular data structure:

```
core/           # Engine-level shared definitions
├── data.lua    # Core prototype loading
├── lualib/     # Shared utility libraries (20+ Lua modules)
├── prototypes/ # Base prototypes (noise, fonts, styles)
└── info.json   # Module metadata

base/           # Base game content (≈ IC's RA1 game module)
├── data.lua    # Loads all base prototypes
├── data-updates.lua  # Post-load modifications
├── info.json   # Module metadata
├── migrations/  # Save game migrations
└── prototypes/  # All entity/item/recipe/tech definitions

space-age/      # DLC content (≈ IC's future game modules)
├── data.lua
├── base-data-updates.lua  # Modifies base game data
├── info.json   # Depends on base >= 2.0.0
├── migrations/
└── prototypes/

elevated-rails/ # Sub-module (feature module)
quality/        # Sub-module
```

### Data Loading Pipeline

Factorio's data loading uses a **three-phase pipeline**:

1. **`data.lua`** — Each mod's `data.lua` runs, calling `data:extend({...})` to
   register prototype tables. Runs in dependency order.
2. **`data-updates.lua`** — Runs after all `data.lua` files. Used to modify
   prototypes registered by dependencies.
3. **`data-final-fixes.lua`** — Last chance to modify data. Used for compatibility
   patches that must run after everything else.

This three-phase model prevents load-order conflicts. A mod can safely modify another
mod's data in `data-updates.lua` because the original `data.lua` has already run.

### Prototype Definition Pattern

Prototypes are Lua tables registered via `data:extend()`:

```lua
data:extend({
  {
    type = "item",
    name = "iron-plate",
    icon = "__base__/graphics/icons/iron-plate.png",
    subgroup = "raw-material",
    order = "a[smelting]-a[iron-plate]",
    stack_size = 100,
    -- ... other properties
  },
  {
    type = "recipe",
    name = "speed-module",
    enabled = false,
    ingredients = {
      {type = "item", name = "advanced-circuit", amount = 5},
      {type = "item", name = "electronic-circuit", amount = 5}
    },
    energy_required = 15,
    results = {{type="item", name="speed-module", amount=1}}
  }
})
```

**Strengths of this approach:**
- **Tables are data, not code** — despite being Lua, prototypes are declarative
  tables. The engine validates them against known prototype schemas.
- **String-based cross-references** — `name` fields and ingredient references use
  string keys, enabling late binding and easy modding.
- **Computed prototypes** — Lua allows loops and functions to generate prototypes
  programmatically (e.g. `create_item_parameter(n)` generates parameterized items).
- **Asset path convention** — `__base__/` and `__mod_name__/` prefixes for asset
  paths, resolved at load time.

### Module Metadata (info.json)

```json
{
  "name": "space-age",
  "version": "2.0.73",
  "title": "Space Age",
  "dependencies": ["base >= 2.0.0", "elevated-rails >= 2.0.0", "quality >= 2.0.0"],
  "quality_required": true,
  "space_travel_required": true,
  "factorio_version": "2.0"
}
```

Key features:
- **Semver dependencies with range expressions** — `"base >= 2.0.0"`
- **Feature flags** — `quality_required`, `space_travel_required` declare engine
  feature dependencies
- **Engine version pinning** — `factorio_version` declares minimum engine

### Migration System

Factorio uses **two types of migrations**, both versioned by filename:

**1. JSON rename migrations** (`2.0.0.json`):
```json
{
  "item": [["filter-inserter", "fast-inserter"], ...],
  "entity": [["rock-huge", "huge-rock"], ...],
  "recipe": [["empty-barrel", "barrel"], ...],
  "technology": [["energy-weapons-damage-1", "laser-weapons-damage-1"], ...]
}
```

Simple `[old_name, new_name]` pairs grouped by prototype category. The engine
applies these automatically when loading old saves.

**2. Lua script migrations** (`2.0.0.lua`):
```lua
local migrate_force = function(force)
  local technologies = force.technologies
  if is_any_successor_researched(technologies["automation-science-pack"]) then
    set_researched_safe(technologies["automation-science-pack"])
    set_researched_safe(technologies["electronics"])
  end
end
for k, force in pairs(game.forces) do
  migrate_force(force)
end
```

Complex migrations that need game logic (e.g., deriving technology research
state from successor technologies) use Lua scripts with access to the `game` API.

### IC Relevance

**Factorio's system is the closest model for IC's modding architecture.** The
parallels are striking:

| Factorio                           | Iron Curtain                  | IC Decision |
| ---------------------------------- | ----------------------------- | ----------- |
| `data.lua` → `data:extend()`       | YAML rules → `serde_yaml`     | D003        |
| Lua prototypes                     | YAML definitions              | D003        |
| `data-updates.lua` (modifications) | Lua scripting                 | D004        |
| `data-final-fixes.lua`             | WASM power mods               | D005        |
| `info.json` (mod metadata)         | `mod.yaml`                    | D026        |
| JSON rename migrations             | SnapshotCodec dispatch        | D054        |
| Lua script migrations              | Lua migration scripts         | D054        |
| `core/`                            | Engine core (`ic-*`)          | D039        |
| `base/`                            | RA1 game module               | D018        |
| `space-age/`                       | Future game modules (RA2, TD) | D018        |

**Specific patterns to adopt:**

1. **Three-phase data loading.** IC should load YAML rules in phases:
   - Phase 1: Base definitions (game module YAML)
   - Phase 2: Mod modifications (Lua `data_updates()`)
   - Phase 3: Final fixes (WASM or Lua `data_final_fixes()`)
   This prevents load-order conflicts and is proven at scale.

2. **JSON rename migrations for IC.** Factorio's simple `[old, new]` rename
   format is perfect for IC's YAML rule versioning. When IC renames a unit or
   trait, a migration JSON file handles backward compatibility automatically.

3. **Lua script migrations for complex cases.** Some migrations need game logic
   (e.g., recalculating derived state). IC should support Lua migration scripts
   alongside declarative renames.

4. **Module dependency syntax.** `"base >= 2.0.0"` is a clean, human-readable
   dependency specification. IC's Workshop (D030) should use the same format.

5. **Feature flags in mod metadata.** Space Age declares `quality_required: true`.
   IC should support similar feature flags for game modules that need specific
   engine capabilities (e.g., `3d_terrain_required` for a hypothetical TS module).

---

## 8. Minecraft Modding Ecosystem: Forge vs Fabric vs Bedrock

### Java Edition: Forge and Fabric

**Forge** (2011–present):
- The dominant Java modding framework for a decade
- Patches Minecraft's compiled Java code at runtime via bytecode manipulation
- Provides event hooks, capability system, and registry infrastructure
- **Heavy API** — mods depend on Forge's abstractions, not Minecraft directly
- **Loading order** — complex inter-mod dependency resolution
- **Problem:** Forge updates lag behind Minecraft releases because bytecode
  patches break with every update. Version fragmentation is severe.
- **Lesson for IC:** Bytecode patching is fragile. IC's YAML/Lua/WASM tiers
  (D003/D004/D005) are vastly more stable because they work through defined APIs,
  not by modifying engine internals.

**Fabric** (2018–present):
- Lightweight alternative to Forge
- Uses Mixin (bytecode injection framework) for minimal, targeted patches
- Smaller API surface — mods hook closer to vanilla code
- Faster updates to new Minecraft versions
- **Growing ecosystem** — increasingly preferred for modern modding
- **Lesson for IC:** Lighter modding frameworks encourage faster adoption.
  IC's tiered approach (YAML is zero-API, Lua is light, WASM is full power)
  offers multiple on-ramps.

**Key ecosystem issues:**
- **Forge/Fabric incompatibility** — mods must target one or the other (or use
  abstraction layers like Architectury). This splits the community.
- **Version churn** — Minecraft's ~4 updates/year break almost all mods. The
  community perpetually lags behind the current version.
- **No official modding API** — despite 15 years of promises, Minecraft Java
  still has no first-party modding API. The community built everything.
- **Lesson for IC:** Ship a stable, versioned modding API from day one. The
  pain of not having one is astronomical. IC's tiered system (D003/D004/D005)
  IS the modding API.

### Bedrock Edition: Add-Ons

- Official, data-driven modding through JSON behavior/resource packs
- Scripting API (JavaScript) for programmatic mods
- **Marketplace** — creators can sell content (controversial)
- **Advantages:** Cross-platform, officially supported, stable API
- **Disadvantages:** Much less powerful than Java modding, limited scripting
  access to engine internals, Marketplace takes a revenue cut
- **Lesson for IC:** Data-driven modding (JSON/YAML) is more stable and
  accessible than code modding. IC's YAML tier (80% of mods) follows this model.
  The Marketplace model validates IC's Workshop (D030) direction, but IC's
  GPL + modding exception (D051) and DRM-free policy (D046) are more
  community-friendly.

---

## 9. Factorio's Mod API: Why It's Industry-Leading

### Design Philosophy

Factorio's modding system is widely considered the gold standard because of
several deliberate design choices:

1. **The game IS a mod.** Factorio's base game is itself a mod (`base/`) that
   uses the same API available to community modders. The `factorio-data` repo
   proves this — every entity, recipe, and technology is defined in Lua using
   the same `data:extend()` API. This is the strongest possible guarantee that
   the modding API is powerful enough: the developers use it themselves.

   **IC parallel:** IC should follow this model. The RA1 game module should be
   implemented using the same YAML/Lua APIs available to modders. If something
   can't be done via the modding API, it's a gap in the API, not a special case.

2. **Deterministic by design.** Factorio's multiplayer uses deterministic lockstep
   (same as IC, D006/D009). Mods must be deterministic — the Lua API is carefully
   designed to prevent non-determinism:
   - No `os` or `io` libraries in mod Lua
   - Random numbers use seeded PRNG
   - Table iteration order is deterministic
   - No floating-point ambiguity (Factorio uses Lua 5.2 with integer math where
     it matters)

   **IC parallel:** Exact same constraints. IC's Lua sandbox (D004) must enforce
   the same restrictions. WASM sandboxing (D005) handles this naturally.

3. **Runtime mod API (separate from data API).** Factorio distinguishes:
   - **Data stage** — `data:extend()`, `data.raw`, prototype tables. Runs once
     at load time. Defines WHAT exists.
   - **Control stage** — `script.on_event()`, entity manipulation. Runs during
     gameplay. Defines HOW things behave.

   **IC parallel:** YAML rules = data stage. Lua scripting = control stage.
   WASM = power user control stage.

4. **Mod portal with dependency resolution.** Factorio's in-game mod portal:
   - One-click install from the game UI
   - Automatic dependency resolution
   - Version compatibility checking
   - Optional/required dependency distinction
   - Mod descriptions, screenshots, changelogs

   **IC parallel:** Workshop registry (D030) with the same features.

5. **Transparent data changes.** The `factorio-data` repo lets modders see
   exactly what changed between versions. GitHub's diff view shows precisely
   which prototypes were modified and how. This is invaluable for mod
   compatibility updates.

   **IC parallel:** IC's YAML rule files should be version-controlled with
   clear changelogs. The Workshop (D030) should track data changes between
   mod versions.

### Mod Compatibility in Multiplayer

Factorio enforces strict mod synchronization in multiplayer:
- All players must have identical mod sets (including versions)
- The server sends its mod list; clients auto-download missing mods
- CRC checks verify mod data integrity
- Map saves embed the complete mod configuration

**IC parallel:** IC's relay server (D007) should enforce mod set matching.
The Workshop (D030) should support automatic mod synchronization.

---

## 10. Cross-Cutting Patterns and IC Recommendations

### Pattern 1: Format Version in Every Data File

Both Minecraft and Factorio embed format versions in data files:
- Bedrock: `"format_version": "1.26.0"` in every JSON file
- Factorio: `"factorio_version": "2.0"` in `info.json`

**IC recommendation:** Every YAML rule file should begin with:
```yaml
format_version: "1.0.0"
```
This enables the migration system (D054) to detect and transform old formats.

### Pattern 2: "The Game Is a Mod" Architecture

Both Factorio and Bedrock define the base game using the same data formats
available to modders. This is the strongest validation of IC's game module
architecture (D018).

**IC recommendation:** The RA1 game module should use NO internal APIs
unavailable to external game modules. Every system it uses — pathfinding,
fog of war, damage resolution — should go through `GameModule` trait registration.

### Pattern 3: Tiered Migration Systems

- **DFU:** Academic, category-theoretic, type-safe (over-engineered for most uses)
- **Factorio:** Practical two-tier (JSON renames + Lua scripts)
- **Bedrock:** Format version gates (if version < X, apply transform)

**IC recommendation:** Adopt Factorio's two-tier model:
1. Declarative renames (YAML: `old_name → new_name` per category)
2. Lua migration scripts (for complex transformations)
Ordered by version number, applied sequentially.

### Pattern 4: Extensible Command Systems

Brigadier's tree-based, type-safe, permission-aware command system is the
gold standard. Its separation of parsing from execution, and its support
for mod-injected commands, are exactly what IC needs.

**IC recommendation:** Implement a Rust port of Brigadier's architecture:
```rust
trait ArgumentType: Send + Sync {
    type Output;
    fn parse(&self, reader: &mut StringReader) -> Result<Self::Output>;
    fn suggest(&self, context: &CommandContext, builder: &mut SuggestionBuilder);
}
```

### Pattern 5: Protocol Documentation as First-Class Artifact

Bedrock's protocol docs repo proves that protocol documentation should be:
- Machine-readable (JSON schema)
- Version-tracked (git history)
- Multi-format (markdown + HTML + diagrams)
- Change-logged per version

**IC recommendation:** `ic-protocol` should generate documentation from its
Rust types (via custom derive macros or build scripts), producing markdown
and JSON schema for every protocol version.

### Pattern 6: Observable-Based UI State

Ore UI's solution to React's performance problem (observables that bypass
reconciliation) maps to Bevy's change detection. Game UIs need targeted
updates at 60fps, not full re-renders.

**IC recommendation:** IC's `ic-ui` should leverage Bevy's `Changed<T>` and
`Res<T>` change detection to minimize UI work per frame. Only repaint UI
elements whose backing data actually changed.

---

## 11. Summary: Priority Recommendations for IC

| Priority     | Pattern                                                | Source           | IC Decision |
| ------------ | ------------------------------------------------------ | ---------------- | ----------- |
| **Critical** | "Game is a mod" — RA1 uses same API as external mods   | Factorio         | D018        |
| **Critical** | Three-phase data loading (define → modify → fixup)     | Factorio         | D003/D004   |
| **Critical** | Format version in every data file                      | Both             | D054        |
| **High**     | Brigadier-style command tree with ArgumentType trait   | Brigadier        | New         |
| **High**     | Two-tier migration (declarative renames + scripts)     | Factorio         | D054        |
| **High**     | Protocol version separate from game version            | Bedrock          | D006        |
| **High**     | Semver dependencies with range expressions for mods    | Factorio         | D030        |
| **Medium**   | Component group toggling via events (condition system) | Bedrock          | D028        |
| **Medium**   | Priority-numbered AI behaviors                         | Bedrock          | D043        |
| **Medium**   | Editor as extension platform, not closed tool          | Minecraft Editor | D038        |
| **Medium**   | Feature flags in mod metadata                          | Factorio         | D026        |
| **Low**      | Observable UI state management                         | Ore UI           | D032        |
| **Low**      | Machine-readable protocol documentation                | Bedrock          | New         |

### What Minecraft Got Wrong (IC Must Avoid)

1. **No official modding API for Java Edition** — 15+ years, still community-built.
   IC must ship with a defined, stable modding API from Phase 2.
2. **Two incompatible modding ecosystems** (Forge vs Fabric) — community split.
   IC's single tiered system (YAML → Lua → WASM) avoids this.
3. **Bedrock JSON verbosity without inheritance** — massive duplication.
   IC's YAML with inheritance (D003) solves this.
4. **DFU over-engineering** — algebraic optics are elegant but impractical for
   most migration needs. Factorio's simpler system is better suited.

### What Factorio Got Right (IC Must Emulate)

1. **The game is a mod** — strongest possible modding API guarantee.
2. **Three-phase loading** — eliminates load-order conflicts.
3. **Deterministic multiplayer with mods** — exact same challenge IC faces.
4. **Practical migration system** — simple, versioned, two-tier.
5. **Transparent data tracking** — git-based prototype diffing.
6. **In-game mod portal** — one-click install with dependency resolution.

---

## References

- Mojang/brigadier: https://github.com/Mojang/brigadier (MIT)
- Mojang/bedrock-samples: https://github.com/Mojang/bedrock-samples
- Mojang/DataFixerUpper: https://github.com/Mojang/DataFixerUpper (MIT)
- Mojang/bedrock-protocol-docs: https://github.com/Mojang/bedrock-protocol-docs
- Mojang/ore-ui: https://github.com/Mojang/ore-ui (MIT)
- Mojang/minecraft-editor: https://github.com/Mojang/minecraft-editor
- wube/factorio-data: https://github.com/wube/factorio-data
- Factorio Modding API Docs: https://lua-api.factorio.com/latest/
- Factorio FFF-240 (factorio-data announcement): https://www.factorio.com/blog/post/fff-240
- Forge: https://github.com/MinecraftForge/MinecraftForge
- Fabric: https://github.com/FabricMC/fabric
