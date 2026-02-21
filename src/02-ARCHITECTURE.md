# 02 — Core Architecture

## Decision: Bevy

**Rationale (revised — see D002 in `src/09-DECISIONS.md`):**
- ECS *is* our architecture — Bevy gives it to us with scheduling, queries, and parallel system execution out of the box
- Saves 2–4 months of engine plumbing (windowing, asset pipeline, audio, rendering scaffolding)
- Plugin system maps naturally to pluggable networking (`NetworkModel` as a Bevy plugin)
- Bevy's 2D rendering pipeline handles classic isometric sprites; the 3D pipeline is available passively for modders (see "3D Rendering as a Mod")
- `wgpu` is Bevy's backend — we still get low-level control via custom render passes where profiling justifies it
- Breaking API changes are manageable: pin Bevy version per development phase, upgrade between phases

**Bevy provides:**

| Concern     | Bevy Subsystem         | Notes                                                            |
| ----------- | ---------------------- | ---------------------------------------------------------------- |
| Windowing   | `bevy_winit`           | Cross-platform, handles lifecycle events                         |
| Rendering   | `bevy_render` + `wgpu` | Custom isometric sprite passes; 3D pipeline available to modders |
| ECS         | `bevy_ecs`             | Archetypes, system scheduling, change detection                  |
| Asset I/O   | `bevy_asset`           | Hot-reloading, platform-agnostic (WASM/mobile-safe)              |
| Audio       | `bevy_audio`           | Platform-routed; `ic-audio` wraps for .aud/.ogg/EVA              |
| Dev tools   | `egui` via `bevy_egui` | Immediate-mode debug overlays                                    |
| Scripting   | `mlua` (Bevy resource) | Lua embedding, integrated as non-send resource                   |
| Mod runtime | `wasmtime` / `wasmer`  | WASM sandboxed execution (Bevy system, not Bevy plugin)          |

## Simulation / Render Split (Critical Architecture)

The simulation and renderer are completely decoupled from day one.

```
┌─────────────────────────────────────────────┐
│             GameLoop<N, I>                  │
│                                             │
│  Input(I) → Network(N) → Sim (tick) → Render│
│                                             │
│  Sim runs at fixed tick rate (e.g., 15/sec) │
│  Renderer interpolates between sim states   │
│  Renderer can run at any FPS independently  │
└─────────────────────────────────────────────┘
```

### Simulation Properties
- **Deterministic:** Same inputs → identical outputs on every platform
- **Pure:** No I/O, no floats in game logic, no network awareness
- **Fixed-point math:** `i32`/`i64` with known scale (never `f32`/`f64` in sim)
- **Snapshottable:** Full state serializable for replays, save games, desync debugging, rollback, campaign state persistence (D021)
- **Headless-capable:** Can run without renderer (dedicated servers, AI training, automated testing)
- **Library-first:** `ic-sim` is a Rust library crate usable by external projects — not just an internal dependency of `ic-game`

### External Sim API (Bot Development & Research)

`ic-sim` is explicitly designed as a **public library** for external consumers: bot developers, AI researchers, tournament automation, and testing infrastructure. The sim's purity (no I/O, no rendering, no network awareness) makes it naturally embeddable.

```rust
// External bot developer's Cargo.toml:
// [dependencies]
// ic-sim = "0.x"
// ic-protocol = "0.x"

use ic_sim::{Simulation, SimConfig};
use ic_protocol::{PlayerOrder, TimestampedOrder};

// Create a headless game
let config = SimConfig::from_yaml("rules.yaml")?;
let mut sim = Simulation::new(config, map, players, seed);

// Game loop: inject orders, step, read state
loop {
    let state = sim.query_state();  // read visible game state
    let orders = my_bot.decide(&state);  // bot logic
    sim.inject_orders(&orders);  // submit orders for this tick
    sim.step();  // advance one tick
    if sim.is_finished() { break; }
}
```

**Use cases:**

- **AI bot tournaments:** Run headless matches between community-submitted bots. Same pattern as BWAPI's SSCAIT (StarCraft) and Chrono Divide's `@chronodivide/game-api`. The Workshop hosts bot leaderboards; `ic mod test` provides headless match execution (see `04-MODDING.md`).
- **Academic research:** Reinforcement learning, multi-agent systems, game balance analysis. Researchers embed `ic-sim` in their training harness without pulling in rendering or networking.
- **Automated testing:** CI pipelines create deterministic game scenarios, inject specific order sequences, and assert on outcomes. Already used internally for regression testing.
- **Replay analysis tools:** Third-party tools load replay files and step through the sim to extract statistics, generate heatmaps, or compute player metrics.

**API stability:** The external sim API surface (`Simulation::new`, `step`, `inject_orders`, `query_state`, `snapshot`, `restore`) follows the same versioning guarantees as the mod API (see `04-MODDING.md` § "Mod API Versioning & Stability"). Breaking changes require a major version bump with migration guide.

**Distinction from `AiStrategy` trait:** The `AiStrategy` trait (D041) is for in-engine AI that runs inside the sim's tick loop as a WASM sandbox. The external sim API is for out-of-process consumers that drive the sim from the outside. Both are valid — `AiStrategy` has lower latency (no serialization boundary), the external API has more flexibility (any language, any tooling, full process isolation).

**Phase:** The external API surface crystallizes in Phase 2 when the sim is functional. Bot tournament infrastructure ships in Phase 4-5. Formal API stability guarantees begin when `ic-sim` reaches 1.0.

### Simulation Core Types

```rust
/// All sim-layer coordinates use fixed-point
pub type SimCoord = i32;  // 1 unit = 1/SCALE of a cell (see P002)

/// Position is 3D-aware from day one.
/// RA1 game module sets z = 0 everywhere (flat isometric).
/// RA2/TS game module uses z for terrain elevation, bridges, aircraft altitude.
pub struct WorldPos {
    pub x: SimCoord,
    pub y: SimCoord,
    pub z: SimCoord,  // 0 for flat games (RA1), meaningful for elevated terrain (RA2/TS)
}

/// Cell position on a discrete grid — convenience type for grid-based game modules.
/// NOT an engine-core requirement. Grid-based games (RA1, RA2, TS, TD, D2K) use CellPos
/// as their spatial primitive. Continuous-space game modules work with WorldPos directly.
/// The engine core operates on WorldPos; CellPos is a game-module-level concept.
pub struct CellPos {
    pub x: i32,
    pub y: i32,
    pub z: i32,  // layer / elevation level (0 for RA1)
}

/// The sim is a pure function: state + orders → new state
pub struct Simulation {
    world: World,          // ECS world (all entities + components)
    tick: u64,             // Current tick number
    rng: DeterministicRng, // Seeded, reproducible RNG
}

impl Simulation {
    /// THE critical function. Pure, deterministic, no I/O.
    pub fn apply_tick(&mut self, orders: &TickOrders) {
        // 1. Apply orders (sorted by sub-tick timestamp)
        for (player, order, timestamp) in orders.chronological() {
            self.execute_order(player, order);
        }
        // 2. Run systems: movement, combat, harvesting, AI, production
        self.run_systems();
        // 3. Advance tick
        self.tick += 1;
    }

    /// Snapshot for rollback / desync debugging / save games.
    /// Uses crash-safe serialization: payload written first, header
    /// updated atomically after fsync (Fossilize pattern — see D010).
    pub fn snapshot(&self) -> SimSnapshot { /* serialize everything */ }
    pub fn restore(&mut self, snap: &SimSnapshot) { /* deserialize */ }

    /// Delta snapshot — encodes only components that changed since
    /// `baseline`. ~10x smaller than full snapshot for typical gameplay.
    /// Used for autosave, reconnection state transfer, and replay
    /// keyframes. See D010 and `10-PERFORMANCE.md` § Delta Encoding.
    pub fn delta_snapshot(&self, baseline: &SimSnapshot) -> DeltaSnapshot {
        /* property-level diff — only changed components serialized */
    }
    pub fn apply_delta(&mut self, delta: &DeltaSnapshot) {
        /* merge delta into current state */
    }

    /// Hash for desync detection
    pub fn state_hash(&self) -> u64 { /* hash critical state */ }

    /// Surgical correction for cross-engine reconciliation
    pub fn apply_correction(&mut self, correction: &EntityCorrection) {
        // Directly set an entity's field — only used by reconciler
    }
}
```

### Order Validation (inside sim, deterministic)

```rust
impl Simulation {
    fn execute_order(&mut self, player: PlayerId, order: &PlayerOrder) {
        match self.validate_order(player, order) {
            OrderValidity::Valid => self.apply_order(player, order),
            OrderValidity::Rejected(reason) => {
                self.record_suspicious_activity(player, reason);
                // All honest clients also reject → stays in sync
            }
        }
    }
    
    fn validate_order(&self, player: PlayerId, order: &PlayerOrder) -> OrderValidity {
        // Every order type validated: ownership, affordability, prerequisites, placement
        // This is deterministic — all clients agree on what to reject
    }
}
```

## ECS Design

ECS is a natural fit for RTS: hundreds of units with composable behaviors.

### External Entity Identity

Bevy's `Entity` IDs are internal — they can be recycled, and their numeric value is meaningless across save/load or network boundaries. Any external-facing system (replay files, Lua scripting, observer UI, debug tools) needs a stable entity identifier.

IC uses **generational unit tags** — a pattern proven by SC2's unit tag system (see `research/blizzard-github-analysis.md` § Part 1) and common in ECS engines:

```rust
#[derive(Clone, Copy, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct UnitTag {
    pub index: u16,     // slot in a fixed-size pool
    pub generation: u16, // incremented each time the slot is reused
}
```

- **Index** identifies the pool slot. Pool size is bounded by the game module's max entity count (RA1: 2048 units + structures).
- **Generation** disambiguates reuse. If a unit dies and a new unit takes the same slot, the new unit has a higher generation. Stale references (e.g., an attack order targeting a dead unit) are detected by comparing generations.
- **Replay and Lua stable:** `UnitTag` values are deterministic — same game produces the same tags. Replay analysis can track a unit across its entire lifetime. Lua scripts reference units by `UnitTag`, never by Bevy `Entity`.
- **Network-safe:** `UnitTag` is 4 bytes, cheap to include in `PlayerOrder`. Bevy `Entity` is never serialized into orders or replays.

A `UnitPool` resource maps `UnitTag ↔ Entity` and manages slot allocation/recycling. All public-facing APIs (`Simulation::query_unit()`, order validation, Lua bindings) use `UnitTag`; Bevy `Entity` is an internal implementation detail.

### Component Model (mirrors OpenRA Traits)

OpenRA's "traits" are effectively components. Map them directly. The table below shows the **RA1 game module's** default components. Other game modules (RA2, TD) register additional components — the ECS is open for extension without modifying the engine core.

**OpenRA vocabulary compatibility (D023):** OpenRA trait names are accepted as YAML aliases. `Armament` and `combat` both resolve to the same component. This means existing OpenRA YAML definitions load without renaming.

**Canonical enum names (D027):** Locomotor types (`Foot`, `Wheeled`, `Tracked`, `Float`, `Fly`), armor types (`None`, `Light`, `Medium`, `Heavy`, `Wood`, `Concrete`), target types, damage states, and stances match OpenRA's names exactly. Versus tables and weapon definitions copy-paste without translation.

| OpenRA Trait | ECS Component | Purpose |
| `Health` | `Health { current: i32, max: i32 }` | Hit points |
| `Mobile` | `Mobile { speed: i32, locomotor: LocomotorType }` | Can move |
| `Attackable` | `Attackable { armor: ArmorType }` | Can be damaged |
| `Armament` | `Armament { weapon: WeaponId, cooldown: u32 }` | Can attack |
| `Building` | `Building { footprint: FootprintId }` | Occupies cells (footprint shapes stored in a shared `FootprintTable` resource, indexed by ID — zero per-entity heap allocation) |
| `Buildable` | `Buildable { cost: i32, time: u32, prereqs: Vec<StructId> }` | Can be built |
| `Selectable` | `Selectable { bounds: Rect, priority: u8 }` | Player can select |
| `Harvester` | `Harvester { capacity: i32, resource: ResourceType }` | Gathers ore |
| `Producible` | `Producible { queue: QueueType }` | Produced from building |

> **These 9 components are the core set.** The full RA1 game module registers ~50 additional components for gameplay systems (power, transport, capture, stealth, veterancy, etc.). See [Extended Gameplay Systems](#extended-gameplay-systems-ra1-module) below for the complete component catalog. The component table in `AGENTS.md` lists only the core set as a quick reference.

**Component group toggling (validated by Minecraft Bedrock):** Bedrock's entity system uses "component groups" — named bundles of components that can be added or removed by game events (e.g., `minecraft:angry` adds `AttackNearest` + `SpeedBoost` when a wolf is provoked). This is directly analogous to IC's condition system (D028): a condition like "prone" or "low_power" grants/revokes a set of component modifiers. Bedrock's JSON event system (`"add": { "component_groups": [...] }`) validates that event-driven component toggling scales to thousands of entity types and is intuitive for data-driven modding. See `research/mojang-wube-modding-analysis.md` § Bedrock.

### System Execution Order (deterministic, configurable per game module)

The **RA1 game module** registers this system execution order:

```
Per tick:
  1.  apply_orders()          — Process all player commands (move, attack, build, sell, deploy, guard, etc.)
  2.  power_system()          — Recalculate player power balance, apply/remove outage penalties
  3.  production_system()     — Advance build queues, deduct costs, spawn completed units
  4.  harvester_system()      — Gather ore, navigate to refinery, deliver resources
  5.  docking_system()        — Manage dock queues (refinery, helipad, repair pad)
  6.  support_power_system()  — Advance superweapon charge timers
  7.  movement_system()       — Move all mobile entities (includes sub-cell for infantry)
  8.  crush_system()          — Check vehicle-over-infantry crush collisions
  9.  mine_system()           — Check mine trigger contacts
  10. combat_system()         — Target acquisition, fire weapons, create projectile entities
  11. projectile_system()     — Advance projectiles, check hits, apply warheads (Versus table + modifiers)
  12. capture_system()        — Advance engineer capture progress
  13. cloak_system()          — Update cloak/detection states, reveal-on-fire cooldowns
  14. condition_system()      — Evaluate condition grants/revocations (D028)
  15. veterancy_system()      — Award XP from kills, check level-up thresholds
  16. death_system()          — Remove destroyed entities, spawn husks, apply on-death warheads
  17. crate_system()          — Check crate pickups, apply random actions, spawn new crates
  18. transform_system()      — Process pending unit transformations (MCV ↔ ConYard, deploy/undeploy)
  19. trigger_system()        — Check mission/map triggers (Lua callbacks)
  20. notification_system()   — Queue audio/visual notifications (EVA, alerts), enforce cooldowns
  21. fog_system()            — Update visibility (staggered — not every tick, see 10-PERFORMANCE.md)
```

Order is fixed *per game module* and documented. Changing it changes gameplay and breaks replay compatibility.

A different game module (e.g., RA2) can insert additional systems (garrison, mind control, prism forwarding) at defined points. The engine runs whatever systems the active game module registers, in the order it specifies. The engine itself doesn't know which game is running — it just executes the registered system pipeline deterministically.

### FogProvider Trait (D041)

`fog_system()` delegates visibility computation to a `FogProvider` trait — like `Pathfinder` for pathfinding. Different game modules need different fog algorithms: radius-based (RA1), elevation line-of-sight (RA2/TS), or no fog (sandbox).

```rust
/// Game modules implement this to define how visibility is computed.
pub trait FogProvider: Send + Sync {
    /// Recompute visibility for a player.
    fn update_visibility(
        &mut self,
        player: PlayerId,
        sight_sources: &[(WorldPos, SimCoord)],  // (position, sight_range) pairs
        terrain: &TerrainData,
    );

    /// Is this position currently visible to this player?
    fn is_visible(&self, player: PlayerId, pos: WorldPos) -> bool;

    /// Has this player ever seen this position? (shroud vs fog distinction)
    fn is_explored(&self, player: PlayerId, pos: WorldPos) -> bool;

    /// All entity IDs visible to this player (for AI view filtering, render culling).
    fn visible_entities(&self, player: PlayerId) -> &[EntityId];
}
```

RA1 registers `RadiusFogProvider` (circle-based, fast, matches original RA). RA2/TS would register `ElevationFogProvider` (raycasts against terrain heightmap). The future fog-authoritative `NetworkModel` reuses the same trait on the server side to determine which entities to send per client. See D041 in `09-DECISIONS.md` for full rationale.

#### Entity Visibility Model

The `FogProvider` output determines how entities appear to each player. Following SC2's proven model (see `research/blizzard-github-analysis.md` § 1.4), each entity observed by a player carries a **visibility classification** that controls which data fields are available:

```rust
/// Per-entity visibility state as seen by a specific player.
/// Determines which component fields the player can observe.
pub enum EntityVisibility {
    /// Currently visible — all public fields available (health, position, orders for own units).
    Visible,
    /// Previously visible, now in fog — "ghost" of last-known state.
    /// Position/type from when last seen; health, orders, and internal state are NOT available.
    Snapshot,
    /// Never seen or fully hidden — no data available to this player.
    Hidden,
}
```

**Field filtering per visibility level:**

| Field                  | Visible (own) | Visible (enemy) | Snapshot   | Hidden |
| ---------------------- | ------------- | --------------- | ---------- | ------ |
| Position, type, owner  | Yes           | Yes             | Last-known | No     |
| Health / health_max    | Yes           | Yes             | No         | No     |
| Orders queue           | Yes           | No              | No         | No     |
| Cargo / passengers     | Yes           | No              | No         | No     |
| Buffs, weapon cooldown | Yes           | No              | No         | No     |
| Build progress         | Yes           | Yes             | Last-known | No     |

**Last-seen snapshot table:** When a visible entity enters fog-of-war, the `FogProvider` stores a snapshot of its last-known position, type, owner, and build progress. The renderer displays this as a dimmed "ghost" unit. The snapshot is explicitly stale — the actual unit may have moved, morphed, or been destroyed. Snapshots are cleared when the position is re-explored and the unit is no longer there.

### Double-Buffered Shared State (Tick-Consistent Reads)

Multiple systems per tick need to read shared, expensive-to-compute data structures — fog visibility, influence maps, global condition modifiers (D028). The `FogProvider` output is the clearest example: `targeting_system()`, `ai_system()`, and `render` all need to answer "is this cell visible?" within the same tick. If `fog_system()` updates visibility mid-tick, some systems see old fog, others see new — a determinism violation.

IC uses **double buffering** for any shared state that is written by one system and read by many systems within a tick:

```rust
/// Two copies of T — one for reading (current tick), one for writing (being rebuilt).
/// Swap at tick boundary. All reads within a tick see a consistent snapshot.
pub struct DoubleBuffered<T> {
    /// Current tick — all systems read from this. Immutable during the tick.
    read: T,
    /// Next tick — one system writes to this during the current tick.
    write: T,
}

impl<T> DoubleBuffered<T> {
    /// Called exactly once per tick, at the tick boundary, before any systems run.
    /// After swap, the freshly-computed write buffer becomes the new read buffer.
    pub fn swap(&mut self) {
        std::mem::swap(&mut self.read, &mut self.write);
    }

    /// All systems call this to read — guaranteed consistent for the entire tick.
    pub fn read(&self) -> &T { &self.read }

    /// Only the owning system (e.g., fog_system) calls this to prepare the next tick.
    pub fn write(&mut self) -> &mut T { &mut self.write }
}
```

**Where double buffering applies:**

| Data Structure                         | Writer System                  | Reader Systems                                                | Why Not Single Buffer                                                                        |
| -------------------------------------- | ------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `FogProvider` output (visibility grid) | `fog_system()` (step 21)       | `targeting_system()`, `ai_system()`, render                   | Targeting must see same visibility as AI — mid-tick update breaks determinism                |
| Influence maps (AI)                    | `influence_map_system()`       | `military_manager`, `economy_manager`, `building_placement`   | Multiple AI managers read influence data; rebuilding mid-decision corrupts scoring           |
| Global condition modifiers (D028)      | `condition_system()` (step 12) | `damage_system()`, `movement_system()`, `production_system()` | A "low power" modifier applied mid-tick means some systems use old damage values, others new |
| Weather terrain effects (D022)         | `weather_system()` (step 16)   | `movement_system()`, `pathfinding`, render                    | Terrain surface state (mud, ice) affects movement cost; inconsistency causes desync          |

**Why not Bevy's system ordering alone?** Bevy's scheduler can enforce that `fog_system()` runs before `targeting_system()`. But it cannot prevent a system scheduled *between* two readers from mutating shared state. Double buffering makes the guarantee structural: the read buffer is physically separate from the write buffer. No scheduling mistake can cause a reader to see partial writes.

**Cost:** One extra copy of each double-buffered data structure. For fog visibility (a bit array over map cells), this is ~32KB for a 512×512 map. For influence maps (a `[i32; CELLS]` array), it's ~1MB for a 512×512 map. These are allocated once at game start and never reallocated — consistent with Layer 5's zero-allocation principle.

**Swap timing:** `DoubleBuffered::swap()` is called in `Simulation::apply_tick()` before the system pipeline runs. This is a fixed point in the tick — step 0, before step 1 (`order_validation_system()`). The write buffer from the previous tick becomes the read buffer for the current tick. The swap is a pointer swap (`std::mem::swap`), not a copy — effectively free.

### OrderValidator Trait (D041)

The engine enforces that ALL orders pass validation before `apply_orders()` executes them. This formalizes D012's anti-cheat guarantee — game modules cannot accidentally skip validation:

```rust
/// Game modules implement this to define legal orders. The engine calls
/// validate() for every order, every tick — before the module's systems run.
pub trait OrderValidator: Send + Sync {
    fn validate(
        &self,
        player: PlayerId,
        order: &PlayerOrder,
        state: &SimReadView,
    ) -> OrderValidity;
}
```

RA1 registers `StandardOrderValidator` (ownership, affordability, prerequisites, placement, rate limits). See D041 in `09-DECISIONS.md` for full design and `GameModule` trait integration.

## Extended Gameplay Systems (RA1 Module)

The 9 core components above cover the skeleton. A playable Red Alert requires ~50 components and ~20 systems. This section designs every gameplay system identified in `11-OPENRA-FEATURES.md` § gap analysis, organized by functional domain.

### Power System

Every building generates or consumes power. Power deficit disables defenses and slows production — core C&C economy.

```rust
/// Per-building power contribution.
pub struct Power {
    pub provides: i32,   // Power plants: positive
    pub consumes: i32,   // Defenses, production buildings: positive
}

/// Marker: this building goes offline during power outage.
pub struct AffectedByPowerOutage;

/// Player-level resource (not a component — stored in PlayerState).
pub struct PowerManager {
    pub total_capacity: i32,
    pub total_drain: i32,
    pub low_power: bool,  // drain > capacity
}
```

**`power_system()` logic:** Sum all `Power` components per player → update `PowerManager`. When `low_power` is true, buildings with `AffectedByPowerOutage` have their production rates halved and defenses fire at reduced rate (via condition system, D028). Power bar UI reads `PowerManager` from `ic-ui`.

**YAML:**
```yaml
power_plant:
  power: { provides: 100 }
tesla_coil:
  power: { consumes: 75 }
  affected_by_power_outage: true
```

### Full Damage Pipeline (D028)

The complete weapon → projectile → warhead chain:

```
Armament fires → Projectile entity spawned → projectile_system() advances it
  → hit detection (range, homing, ballistic arc)
  → Warhead(s) applied at impact point
    → target validity (TargetTypes, stances)
    → spread/falloff calculation (distance from impact)
    → Versus table lookup (ArmorType × WarheadType → damage multiplier)
    → DamageMultiplier modifiers (veterancy, terrain, conditions)
    → Health reduced
```

```rust
/// A fired projectile — exists as its own entity during flight.
pub struct Projectile {
    pub weapon_id: WeaponId,
    pub source: EntityId,
    pub owner: PlayerId,
    pub target: ProjectileTarget,
    pub speed: i32,            // fixed-point
    pub warheads: Vec<WarheadId>,
    pub inaccuracy: i32,       // scatter radius at target
    pub projectile_type: ProjectileType,
}

pub enum ProjectileType {
    Bullet,         // instant-hit (hitscan)
    Missile { tracking: i32, rof_jitter: i32 },  // homing
    Ballistic { gravity: i32 },                    // arcing (artillery)
    Beam { duration: u32 },                        // continuous ray
}

pub enum ProjectileTarget {
    Entity(EntityId),
    Ground(WorldPos),
}

/// Warhead definition — loaded from YAML, shared (not per-entity).
pub struct WarheadDef {
    pub spread: i32,           // area of effect radius
    pub versus: VersusTable,   // ArmorType → damage percentage
    pub damage: i32,           // base damage value
    pub falloff: Vec<i32>,     // damage multiplier at distance steps
    pub valid_targets: Vec<TargetType>,
    pub invalid_targets: Vec<TargetType>,
    pub effects: Vec<WarheadEffect>,  // screen shake, spawn fire, etc.
}

/// ArmorType × WarheadType → percentage (100 = full damage)
/// Loaded from YAML Versus table — identical format to OpenRA.
/// Flat array indexed by ArmorType discriminant for O(1) lookup in the combat
/// hot path — no per-hit HashMap overhead. ArmorType is a small enum (<16 variants)
/// so the array fits in a single cache line.
pub struct VersusTable {
    pub modifiers: [i32; ArmorType::COUNT],  // index = ArmorType as usize
}
```

**`projectile_system()` logic:** For each `Projectile` entity: advance position by `speed`, check if arrived at target. On arrival, iterate `warheads`, apply each to entities in `spread` radius using `SpatialIndex::query_range()`. For each target: check `valid_targets`, look up `VersusTable`, apply `DamageMultiplier` conditions, reduce `Health`. If `Health.current <= 0`, mark for `death_system()`.

**YAML (weapon + warhead, OpenRA-compatible):**
```yaml
weapons:
  105mm:
    range: 5120          # in world units (fixed-point)
    rate_of_fire: 80     # ticks between shots
    projectile:
      type: bullet
      speed: 682
    warheads:
      - type: spread_damage
        damage: 60
        spread: 426
        versus:
          none: 100
          light: 80
          medium: 60
          heavy: 40
          wood: 120
          concrete: 30
        falloff: [100, 50, 25, 0]
```

### DamageResolver Trait (D041)

The damage pipeline above describes the RA1 resolution algorithm. The *data* (warheads, versus tables, modifiers) is YAML-configurable, but the *resolution order* — what happens between warhead impact and health reduction — varies between game modules. RA2 needs shield-first resolution; Generals-class games need sub-object targeting. The `DamageResolver` trait abstracts this step:

```rust
/// Game modules implement this to define damage resolution order.
/// Called by projectile_system() after hit detection and before health reduction.
pub trait DamageResolver: Send + Sync {
    fn resolve_damage(
        &self,
        warhead: &WarheadDef,
        target: &DamageTarget,
        modifiers: &StatModifiers,
        distance_from_impact: SimCoord,
    ) -> DamageResult;
}

pub struct DamageTarget {
    pub entity: EntityId,
    pub armor_type: ArmorType,
    pub current_health: i32,
    pub shield: Option<ShieldState>,
    pub conditions: Conditions,
}

pub struct DamageResult {
    pub health_damage: i32,
    pub shield_damage: i32,
    pub conditions_applied: Vec<(ConditionId, u32)>,
    pub overkill: i32,
}
```

RA1 registers `StandardDamageResolver` (Versus table → falloff → multiplier stack → health). RA2 would register `ShieldFirstDamageResolver`. See D041 in `09-DECISIONS.md` for full rationale and alternative implementations.

### Support Powers / Superweapons

```rust
/// Attached to the building that provides the power (e.g., Chronosphere, Iron Curtain device).
pub struct SupportPower {
    pub power_type: SupportPowerType,
    pub charge_time: u32,          // ticks to fully charge
    pub current_charge: u32,       // ticks accumulated
    pub ready: bool,
    pub one_shot: bool,            // nukes: consumed on use; Chronosphere: recharges
    pub targeting: TargetingMode,
}

pub enum TargetingMode {
    Point,                   // click a cell (nuke)
    Area { radius: i32 },   // area selection (Iron Curtain effect)
    Directional,             // select origin + target cell (Chronoshift)
}

pub enum SupportPowerType {
    /// Defined by YAML — these are RA1 defaults, but the enum is data-driven.
    Named(String),
}

/// Player-level tracking.
pub struct SupportPowerManager {
    pub powers: Vec<SupportPowerStatus>, // one per owned support building
}
```

**`support_power_system()` logic:** For each entity with `SupportPower`: increment `current_charge` each tick. When `current_charge >= charge_time`, set `ready = true`. UI shows charge bar. Activation comes via player order (sim validates ownership + readiness), then applies warheads/effects at target location.

### Building Mechanics

```rust
/// Build radius — buildings can only be placed near existing structures.
pub struct BuildArea {
    pub range: i32,   // cells from building edge
}

/// Primary building marker — determines which building produces (e.g., primary war factory).
pub struct PrimaryBuilding;

/// Rally point — newly produced units move here.
pub struct RallyPoint {
    pub target: WorldPos,
}

/// Building exit points — where produced units spawn.
pub struct Exit {
    pub offsets: Vec<CellPos>,   // spawn positions relative to building origin
}

/// Building can be sold.
pub struct Sellable {
    pub refund_percent: i32,  // typically 50
    pub sell_time: u32,       // ticks for sell animation
}

/// Building can be repaired (by player spending credits).
pub struct Repairable {
    pub repair_rate: i32,     // HP per tick while repairing
    pub repair_cost_per_hp: i32,
}

/// Gate — wall segment that opens for friendly units.
pub struct Gate {
    pub open_delay: u32,
    pub close_delay: u32,
    pub state: GateState,
}

pub enum GateState { Open, Closed, Opening, Closing }

/// Wall-specific: enables line-build placement.
pub struct LineBuild;
```

**Building placement validation** (in `apply_orders()` → order validation):
1. Check footprint fits terrain (no water, no cliffs, no existing buildings)
2. Check within build radius of at least one friendly `BuildArea` provider
3. Check prerequisites met (from `Buildable.prereqs`)
4. Deduct cost → start build animation → spawn building entity

### Production Queue

```rust
/// A production queue (each building type has its own queue).
pub struct ProductionQueue {
    pub queue_type: QueueType,
    pub items: Vec<ProductionItem>,
    pub parallel: bool,           // RA2: parallel production per factory
    pub paused: bool,
}

pub struct ProductionItem {
    pub actor_type: ActorId,
    pub remaining_cost: i32,
    pub remaining_time: u32,
    pub paid: i32,               // credits paid so far (for pause/resume)
    pub infinite: bool,          // repeat production (hold queue)
}
```

**`production_system()` logic:** For each `ProductionQueue`: if not paused and not empty, advance front item. Deduct credits incrementally (one tick's worth per tick — production slows when credits run out). When `remaining_time == 0`, spawn unit at building's `Exit` position, send to `RallyPoint` if set.

#### Production Model Diversity

The `ProductionQueue` above describes the classic C&C sidebar model, but production is one of the most varied mechanics across RTS games — even within the OpenRA mod ecosystem. Analysis of six major OpenRA mods (see `research/openra-mod-architecture-analysis.md`) reveals at least five distinct production models:

| Model                 | Game                   | Description                                                           |
| --------------------- | ---------------------- | --------------------------------------------------------------------- |
| Global sidebar        | RA1, TD                | One queue per unit category, shared across all factories of that type |
| Tabbed sidebar        | RA2                    | Multiple parallel queues, one per factory building                    |
| Per-building on-site  | KKnD (OpenKrush)       | Each building has its own queue and rally point; no sidebar           |
| Single-unit selection | Dune II (d2)           | Select one building, build one item — no queue at all                 |
| Colony-based          | Swarm Assault (OpenSA) | Capture colony buildings for production; no construction yard         |

The engine must not hardcode any of these. The `production_system()` described above is the RA1 game module's implementation. Other game modules register their own production system via `GameModule::system_pipeline()`. The `ProductionQueue` component is defined by the game module, not the engine core. A KKnD-style module might define a `PerBuildingProductionQueue` component with different constraints; a Dune II module might omit queue mechanics entirely and use a `SingleItemProduction` component.

This is a key validation of invariant #9 (engine core is game-agnostic): if a non-C&C total conversion on our engine needs a fundamentally different production model, the engine should not resist it.

### Resource / Ore Model

```rust
/// Ore/gem cell data — stored per map cell (in a resource layer, not as entities).
pub struct ResourceCell {
    pub resource_type: ResourceType,
    pub amount: i32,     // depletes as harvested
    pub max_amount: i32,
    pub growth_rate: i32, // ore regrows; gems don't (YAML-configured)
}

/// Storage capacity — silos and refineries.
pub struct ResourceStorage {
    pub capacity: i32,
}
```

**`harvester_system()` logic:**
1. Harvester navigates to nearest `ResourceCell` with amount > 0
2. Harvester mines: transfers resource from cell to `Harvester.capacity`
3. When full (or cell depleted): navigate to nearest `DockHost` with `DockType::Refinery`
4. Dock, transfer resources → credits (via resource value table)
5. If no refinery, wait. If no ore, scout for new fields.

Player receives "silos needed" notification when total stored exceeds total `ResourceStorage.capacity`.

### Transport / Cargo

```rust
pub struct Cargo {
    pub max_weight: u32,
    pub current_weight: u32,
    pub passengers: Vec<EntityId>,
    pub unload_delay: u32,
}

pub struct Passenger {
    pub weight: u32,
    pub custom_pip: Option<PipType>,  // minimap/selection pip color
}

/// For carryall-style air transport.
pub struct Carryall {
    pub carry_target: Option<EntityId>,
}

/// Eject passengers on death (not all transports — YAML-configured).
pub struct EjectOnDeath;

/// ParaDrop capability — drop passengers from air.
pub struct ParaDrop {
    pub drop_interval: u32,  // ticks between each passenger exiting
}
```

**Load order:** Player issues load order → `movement_system()` moves passenger to transport → when adjacent, remove passenger from world, add to `Cargo.passengers`. **Unload order:** Deploy order → eject passengers one by one at `Exit` positions, delay between each.

### Capture / Ownership

```rust
pub struct Capturable {
    pub capture_types: Vec<CaptureType>,  // engineer, proximity
    pub capture_threshold: i32,           // required capture points
    pub current_progress: i32,
    pub capturing_entity: Option<EntityId>,
}

pub struct Captures {
    pub speed: i32,              // capture points per tick
    pub capture_type: CaptureType,
    pub consumed: bool,          // engineer is consumed on capture (RA1 behavior)
}

pub enum CaptureType { Infantry, Proximity }
```

**`capture_system()` logic:** For each entity with `Capturable` being captured: increment `current_progress` by capturer's `speed`. When `current_progress >= capture_threshold`, transfer ownership to capturer's player. If `consumed`, destroy capturer. Reset progress on interruption (capturer killed or moved away).

### Stealth / Cloak

```rust
pub struct Cloak {
    pub cloak_delay: u32,         // ticks after last action before cloaking
    pub cloak_types: Vec<CloakType>,
    pub ticks_since_action: u32,
    pub is_cloaked: bool,
    pub reveal_on_fire: bool,
    pub reveal_on_move: bool,
}

pub struct DetectCloaked {
    pub range: i32,
    pub detect_types: Vec<CloakType>,
}

pub enum CloakType { Stealth, Underwater, Disguise, GapGenerator }
```

**`cloak_system()` logic:** For each `Cloak` entity: if `reveal_on_fire` and fired this tick, reset `ticks_since_action`. If `reveal_on_move` and moved this tick, reset. Otherwise increment `ticks_since_action`. When above `cloak_delay`, set `is_cloaked = true`. Rendering: cloaked and no enemy `DetectCloaked` in range → invisible. Cloaked but detected → shimmer effect. Fog system integration: cloaked entities hidden from enemy even in explored area unless detector present.

### Infantry Mechanics

```rust
/// Infantry sub-cell positioning — up to 5 infantry per cell.
pub struct InfantryBody {
    pub sub_cell: SubCell,  // Center, TopLeft, TopRight, BottomLeft, BottomRight
}

pub enum SubCell { Center, TopLeft, TopRight, BottomLeft, BottomRight }

/// Panic flee behavior (e.g., civilians, dogs).
pub struct ScaredyCat {
    pub flee_range: i32,
    pub panic_ticks: u32,
}

/// Take cover / prone — reduces damage, reduces speed.
pub struct TakeCover {
    pub damage_modifier: i32,   // e.g., 50 (half damage)
    pub speed_modifier: i32,    // e.g., 50 (half speed)
    pub prone_delay: u32,       // ticks to transition to prone
}
```

**`movement_system()` integration for infantry:** When infantry moves into a cell, assigns `SubCell` based on available slots. Up to 5 infantry share one cell in different visual positions. When attacked, infantry with `TakeCover` auto-goes prone (grants condition "prone" → `DamageMultiplier` of 50%).

### Death Mechanics

```rust
/// Spawn an actor when this entity dies (husks, ejected pilots).
pub struct SpawnOnDeath {
    pub actor_type: ActorId,
    pub probability: i32,   // 0-100, default 100
}

/// Explode on death — apply warheads at position.
pub struct ExplodeOnDeath {
    pub warheads: Vec<WarheadId>,
}

/// Timed self-destruct (demo truck, C4 charge).
pub struct SelfDestruct {
    pub timer: u32,        // ticks remaining
    pub warheads: Vec<WarheadId>,
}

/// Damage visual states.
pub struct DamageStates {
    pub thresholds: Vec<DamageThreshold>,
}

pub struct DamageThreshold {
    pub hp_percent: i32,   // below this → enter this state
    pub state: DamageState,
}

pub enum DamageState { Undamaged, Light, Medium, Heavy, Critical }

/// Victory condition marker — this entity must be destroyed to win.
pub struct MustBeDestroyed;
```

**`death_system()` logic:** For entities with `Health.current <= 0`: check `SpawnOnDeath` → spawn husk/pilot. Check `ExplodeOnDeath` → apply warheads at position. Remove entity from world and spatial index. For `SelfDestruct`: decrement timer each tick in a pre-death pass; when 0, kill the entity (triggers normal death path).

### Transform / Deploy

```rust
/// Actor can transform into another type (MCV ↔ ConYard, siege deploy/undeploy).
pub struct Transforms {
    pub into: ActorId,
    pub delay: u32,              // ticks for transformation
    pub facing: Option<i32>,     // required facing to transform
    pub condition: Option<ConditionId>,  // condition granted during transform
}
```

**Processing:** Player issues deploy order → `transform_system()` starts countdown. During `delay`, entity is immobile (grants condition "deploying"). After delay, replace entity with `into` actor type, preserving health percentage, owner, and veterancy.

### Docking System

```rust
/// Building or unit that accepts docking (refinery, helipad, repair pad).
pub struct DockHost {
    pub dock_type: DockType,
    pub dock_position: CellPos,  // where the client unit sits
    pub queue: Vec<EntityId>,    // waiting to dock
    pub occupied: bool,
}

/// Unit that needs to dock (harvester, aircraft, damaged vehicle for repair pad).
pub struct DockClient {
    pub dock_type: DockType,
}

pub enum DockType { Refinery, Helipad, RepairPad }
```

**`docking_system()` logic:** For each `DockHost`: if not occupied and queue non-empty, pull front of queue, guide to `dock_position`. When docked: execute dock-type-specific logic (refinery → transfer resources; helipad → reload ammo; repair pad → heal). When done, release and advance queue.

### Veterancy / Experience

```rust
/// This unit gains XP from kills.
pub struct GainsExperience {
    pub current_xp: i32,
    pub level: VeterancyLevel,
    pub thresholds: Vec<i32>,      // XP required for each level transition
    pub level_conditions: Vec<ConditionId>,  // conditions granted at each level
}

/// This unit awards XP when killed (based on its cost/value).
pub struct GivesExperience {
    pub value: i32,   // XP awarded to killer
}

pub enum VeterancyLevel { Rookie, Veteran, Elite, Heroic }
```

**`veterancy_system()` logic:** When `death_system()` removes an entity with `GivesExperience`, the killer (if it has `GainsExperience`) receives `value` XP. Check `thresholds`: if XP crosses a boundary, advance `level` and grant the corresponding condition. Conditions trigger multipliers: veteran = +25% firepower/+25% armor; elite = +50%/+50% + self-heal; heroic = +75%/+75% + faster fire rate (all values from YAML, not hardcoded).

**Campaign carry-over (D021):** `GainsExperience.current_xp` and `level` are part of the roster snapshot saved between campaign missions.

### Guard Command

```rust
pub struct Guard {
    pub target: EntityId,
    pub leash_range: i32,   // max distance from target before returning
}

pub struct Guardable;  // marker: can be guarded
```

**Processing in `apply_orders()`:** Guard order assigns `Guard` component. `combat_system()` integration: if a guarding unit's target is attacked and attacker is within leash range, engage attacker. If target moves beyond leash range, follow.

### Crush Mechanics

```rust
pub struct Crushable {
    pub crush_class: CrushClass,
}

pub enum CrushClass { Infantry, Wall, Hedgehog }

/// Vehicles that auto-crush when moving over crushable entities.
pub struct Crusher {
    pub crush_classes: Vec<CrushClass>,
}
```

**`crush_system()` logic:** After `movement_system()`, for each entity with `Crusher` that moved this tick: query `SpatialIndex` at new position for entities with matching `Crushable.crush_class`. Apply instant kill to crushed entities.

### Crate System

```rust
pub struct Crate {
    pub action_pool: Vec<CrateAction>,  // weighted random selection
}

pub enum CrateAction {
    Cash { amount: i32 },
    Unit { actor_type: ActorId },
    Heal { percent: i32 },
    LevelUp,
    MapReveal,
    Explode { warhead: WarheadId },
    Cloak { duration: u32 },
    Speed { multiplier: i32, duration: u32 },
}

/// World-level system resource.
pub struct CrateSpawner {
    pub max_crates: u32,
    pub spawn_interval: u32,   // ticks between spawn attempts
    pub spawn_area: SpawnArea,
}
```

**`crate_system()` logic:** Periodically spawn crates (up to `max_crates`). When a unit moves onto a crate: pick random `CrateAction`, apply effect to collecting unit/player. Remove crate entity.

### Mine System

```rust
pub struct Mine {
    pub trigger_types: Vec<TargetType>,
    pub warhead: WarheadId,
    pub visible_to_owner: bool,
}

pub struct Minelayer {
    pub mine_type: ActorId,
    pub lay_delay: u32,
}
```

**`mine_system()` logic:** After `movement_system()`, for each `Mine`: query spatial index for entities at mine position matching `trigger_types`. On contact: apply warhead, destroy mine. Mines are invisible to enemy unless detected by mine-sweeper unit (uses `DetectCloaked` with `CloakType::Stealth`).

### Notification System

```rust
pub struct NotificationEvent {
    pub event_type: NotificationType,
    pub position: Option<WorldPos>,  // for spatial notifications
    pub player: PlayerId,
}

pub enum NotificationType {
    UnitLost,
    BaseUnderAttack,
    HarvesterUnderAttack,
    BuildingCaptured,
    LowPower,
    SilosNeeded,
    InsufficientFunds,
    BuildingComplete,
    UnitReady,
    NuclearLaunchDetected,
    EnemySpotted,
    ReinforcementsArrived,
}

/// Per-notification-type cooldown (avoid spam).
/// Flat array indexed by NotificationType discriminant — small fixed enum,
/// avoids HashMap overhead on a per-event check.
pub struct NotificationCooldowns {
    pub cooldowns: [u32; NotificationType::COUNT],  // ticks remaining, index = variant as usize
    pub default_cooldown: u32,                       // typically 150 ticks (~10 sec)
}
```

**`notification_system()` logic:** Collects events from other systems (combat → "base under attack", production → "building complete", power → "low power"). Checks cooldown for each type. If not on cooldown, queues notification for `ic-audio` (EVA voice line) and `ic-ui` (text overlay). Audio mapping is YAML-driven:

```yaml
notifications:
  base_under_attack: { audio: "BATL1.AUD", priority: high, cooldown: 300 }
  building_complete: { audio: "CONSTRU2.AUD", priority: normal, cooldown: 0 }
  low_power: { audio: "LOPOWER1.AUD", priority: high, cooldown: 600 }
```

### Cursor System

```rust
/// Determines which cursor shows when hovering over a target.
pub struct CursorProvider {
    pub cursor_map: HashMap<CursorContext, CursorDef>,
}

pub enum CursorContext {
    Default,
    Move,
    Attack,
    AttackForce,     // force-fire on ground
    Capture,
    Enter,           // enter transport/building
    Deploy,
    Sell,
    Repair,
    Guard,
    SupportPower(SupportPowerType),
    Chronoshift,
    Nuke,
    Harvest,
    Impassable,
}

pub struct CursorDef {
    pub sprite: SpriteId,
    pub hotspot: (i32, i32),
    pub sequence: Option<AnimSequence>,  // animated cursors
}
```

**Logic:** Each frame (render-side, not sim), determine cursor context from: selected units, hovered entity/terrain, active command mode (sell, repair, support power), force modifiers (Ctrl = force-fire, Alt = force-move). Look up `CursorDef` from `CursorProvider`. Display.

### Hotkey System

```rust
pub struct HotkeyConfig {
    pub bindings: HashMap<ActionId, Vec<KeyCombo>>,
    pub profiles: HashMap<String, HotkeyProfile>,
}

pub struct KeyCombo {
    pub key: KeyCode,
    pub modifiers: Modifiers,  // Ctrl, Shift, Alt
}
```

**Built-in profiles:**
- `classic` — original RA1 keybindings
- `openra` — OpenRA defaults
- `modern` — WASD camera, common RTS conventions

Fully rebindable in settings UI. Categories: unit commands, production, control groups, camera, chat, debug. Hotkeys produce `PlayerOrder`s through `InputSource` — the sim never sees key codes.

### Camera System

The camera is a purely render-side concern — the sim has no camera concept (Invariant #1). Camera state lives as a Bevy `Resource` in `ic-render`, read by the rendering pipeline and `ic-ui` (minimap, spatial audio listener position). The `ScreenToWorld` trait (see § "Portability Design Rules") converts screen coordinates to world positions; the camera system controls what region of the world is visible.

#### Core Types

```rust
/// Central camera state — a Bevy Resource in ic-render.
/// NOT part of the sim. Save/restore for save games is serialized separately
/// (alongside other client-side state like UI layout and audio volume).
#[derive(Resource)]
pub struct GameCamera {
    /// World position the camera is centered on (render-side f32, not sim fixed-point).
    pub position: Vec2,
    /// Current zoom level. 1.0 = default view. <1.0 = zoomed out, >1.0 = zoomed in.
    pub zoom: f32,
    /// Zoom limits — enforced every frame. Ranked/tournament modes clamp these further.
    pub zoom_min: f32,  // default: 0.5 (see twice as much map)
    pub zoom_max: f32,  // default: 4.0 (pixel-level inspection)
    /// Map bounds in world coordinates — camera cannot scroll past these.
    pub bounds: Rect,
    /// Smooth interpolation factor for zoom (0.0–1.0 per frame, lerp toward target).
    pub zoom_smoothing: f32,  // default: 0.15
    /// Smooth interpolation factor for pan.
    pub pan_smoothing: f32,   // default: 0.2
    /// Internal: zoom target for smooth interpolation.
    pub zoom_target: f32,
    /// Internal: position target for smooth pan (e.g., centering on selection).
    pub position_target: Vec2,
    /// Edge scroll speed in world-units per second (scaled by current zoom).
    pub edge_scroll_speed: f32,
    /// Keyboard pan speed in world-units per second (scaled by current zoom).
    pub keyboard_pan_speed: f32,
    /// Follow mode: lock camera to a unit or player's view.
    pub follow_target: Option<FollowTarget>,
    /// Screen shake state (driven by explosions, nukes, superweapons).
    pub shake: ScreenShake,
}

pub enum FollowTarget {
    Unit(UnitTag),               // follow a specific unit (observer, cinematic)
    Player(PlayerId),            // lock to a player's viewport (observer mode)
}

pub struct ScreenShake {
    pub amplitude: f32,          // current intensity (decays over time)
    pub decay_rate: f32,         // amplitude reduction per second
    pub frequency: f32,          // oscillation speed
    pub offset: Vec2,            // current frame's shake offset (applied to final transform)
}
```

#### Zoom Behavior

Zoom modifies the `OrthographicProjection.scale` on the Bevy camera entity. A zoom of 1.0 maps to the default viewport size for the active render mode (D048). Zooming out (`zoom < 1.0`) shows more of the map; zooming in (`zoom > 1.0`) magnifies the view.

**Input methods:**

| Input               | Action                                        | Platform     |
| ------------------- | --------------------------------------------- | ------------ |
| Mouse scroll wheel  | Zoom toward/away from cursor position         | Desktop      |
| +/- keys            | Zoom toward/away from screen center           | Desktop      |
| Pinch gesture       | Zoom toward/away from pinch midpoint          | Touch/mobile |
| `/zoom <level>` cmd | Set zoom to exact value (D058)                | All          |
| Ctrl+scroll         | Fine zoom (half step size)                    | Desktop      |
| Minimap scroll      | Zoom the minimap's own viewport independently | All          |

**Zoom-toward-cursor** is the expected UX for isometric games (SC2, AoE2, OpenRA all do this). When the player scrolls the mouse wheel, the world point under the cursor stays fixed on screen — the camera position shifts to compensate for the scale change. This requires adjusting `position` alongside `zoom`:

```rust
fn zoom_toward_cursor(camera: &mut GameCamera, cursor_world: Vec2, scroll_delta: f32) {
    let old_zoom = camera.zoom_target;
    camera.zoom_target = (old_zoom + scroll_delta * ZOOM_STEP)
        .clamp(camera.zoom_min, camera.zoom_max);
    // Shift position so the cursor's world point stays at the same screen location.
    let zoom_ratio = camera.zoom_target / old_zoom;
    camera.position_target = cursor_world + (camera.position_target - cursor_world) * zoom_ratio;
}
```

**Smooth interpolation:** The actual `zoom` and `position` values lerp toward their targets each frame:

```rust
fn camera_interpolation(camera: &mut GameCamera, dt: f32) {
    let t_zoom = 1.0 - (1.0 - camera.zoom_smoothing).powf(dt * 60.0);
    camera.zoom = camera.zoom.lerp(camera.zoom_target, t_zoom);
    let t_pan = 1.0 - (1.0 - camera.pan_smoothing).powf(dt * 60.0);
    camera.position = camera.position.lerp(camera.position_target, t_pan);
}
```

This frame-rate-independent smoothing (exponential lerp) feels identical at 30 fps and 240 fps. The `powf()` call is once per frame, not per entity — negligible cost.

**Discrete vs. continuous:** Keyboard zoom (+/-) uses discrete steps (e.g., 0.25 increments). Mouse scroll uses finer steps (0.1). Both feed `zoom_target` and smooth toward it. There is NO "snap to integer zoom" constraint — smooth zoom is the default behavior. Classic render mode (D048) with integer scaling uses the same smooth zoom for camera movement but snaps the `OrthographicProjection.scale` to the nearest integer multiple when rendering, preventing sub-pixel shimmer on pixel art.

#### Zoom Interaction with Render Modes (D048)

Different render modes have different zoom characteristics:

| Render Mode | Default Zoom | Zoom Range | Scaling Behavior                                         |
| ----------- | ------------ | ---------- | -------------------------------------------------------- |
| Classic     | 1.0          | 0.5–3.0    | Integer-scale snap for rendering; smooth camera movement |
| HD          | 1.0          | 0.5–4.0    | Fully smooth — no snap needed at any zoom level          |
| 3D          | 1.0          | 0.25–6.0   | Perspective FOV adjustment, not orthographic scale       |

When a render mode switch occurs (F1 / D048), the camera system adjusts:
- `zoom_min` / `zoom_max` to the new mode's range
- `zoom_target` is clamped to the new range (if current zoom exceeds new limits)
- Camera position is preserved — only the zoom behavior changes

For 3D render modes, zoom maps to camera distance from the ground plane (dolly) rather than orthographic scale. The `ScreenToWorld` trait abstracts this — the camera system sets a `zoom` value, and the active `ScreenToWorld` implementation interprets it appropriately (orthographic scale for 2D, distance for 3D).

#### Pan (Scrolling)

Four input methods, all producing the same result — a `position_target` update:

| Method                 | Behavior                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| Edge scroll            | Move cursor to screen edge → pan in that direction                  |
| Keyboard (WASD/arrows) | Pan at `keyboard_pan_speed`, scaled by zoom (slower when zoomed in) |
| Minimap click          | Jump camera center to the clicked world position                    |
| Middle-mouse drag      | Pan by mouse delta (inverted — drag world under cursor)             |

**Speed scales with zoom:** When zoomed out, pan speed increases proportionally so map traversal time feels consistent. When zoomed in, pan speed decreases for precision. The scaling is linear: `effective_speed = base_speed / zoom`.

**Bounds clamping:** Every frame, `position_target` is clamped so the viewport stays within `bounds` (map rectangle plus a configurable padding). The player cannot scroll to see void beyond the map edge. Bounds are set when the map loads and do not change during gameplay.

#### Screen Shake

Triggered by game events (explosions, superweapons, building destruction) via Bevy events:

```rust
pub struct CameraShakeEvent {
    pub epicenter: WorldPos,   // world position of the explosion
    pub intensity: f32,        // 0.0–1.0 (nuke = 1.0, tank shell = 0.05)
    pub duration_secs: f32,    // how long the shake lasts
}
```

The shake system calculates `amplitude` from intensity, attenuated by distance from the camera. Multiple concurrent shakes are additive (capped at a maximum amplitude). The `shake.offset` is applied to the final camera transform each frame — it never modifies `position` or `position_target`, so the shake doesn't drift the view.

Players can disable screen shake entirely via settings (`/camera_shake off` — D058) or reduce intensity with a slider. Accessibility concern: excessive screen shake can cause motion sickness.

#### Camera in Replays and Save Games

- **Save games:** `GameCamera` state (position, zoom, follow target) is serialized alongside other client-side state. On load, the camera restores to where the player was looking.
- **Replays:** `CameraPositionSample` events (see `05-FORMATS.md`) record each player's viewport center and zoom level at 2 Hz. Replay viewers can follow any player's camera or use free camera. The replay camera is independent of the recorded camera data — the viewer controls their own viewport.
- **Observer mode:** Observers have independent camera control with no zoom restrictions (they can zoom out further than players for overview). The `follow_player` option (see `ObserverState`) syncs the observer's camera to a player's recorded `CameraPositionSample` stream.

#### Camera Configuration (YAML)

Per-game-module camera defaults:

```yaml
camera:
  zoom:
    default: 1.0
    min: 0.5
    max: 4.0
    step_scroll: 0.1       # mouse wheel increment
    step_keyboard: 0.25    # +/- key increment
    smoothing: 0.15        # lerp factor (0 = instant, 1 = no movement)
    # Ranked override — competitive committee (D037) sets these per season
    ranked_min: 0.75
    ranked_max: 2.0
  pan:
    edge_scroll_speed: 1200.0   # world-units/sec at zoom 1.0
    keyboard_speed: 1000.0
    smoothing: 0.2
    edge_scroll_zone: 8        # pixels from screen edge to trigger
  shake:
    max_amplitude: 12.0         # max pixel displacement
    decay_rate: 8.0             # amplitude reduction per second
    enabled: true               # default; player can override in settings
  bounds_padding: 64            # extra world-units beyond map edges
```

This makes camera behavior fully data-driven (Principle 4 from `13-PHILOSOPHY.md`). A Tiberian Sun module can set different zoom ranges (its taller buildings need more zoom-out headroom). A total conversion can disable edge scrolling entirely if it uses a different camera paradigm.

### Game Speed

```rust
/// Lobby-configurable game speed.
pub struct GameSpeed {
    pub preset: SpeedPreset,
    pub tick_interval_ms: u32,   // sim tick period
}

pub enum SpeedPreset {
    Slowest,   // 80ms per tick
    Slower,    // 67ms per tick (default)
    Normal,    // 50ms per tick
    Faster,    // 35ms per tick
    Fastest,   // 20ms per tick
}
```

Speed affects only the interval between sim ticks — system behavior is tick-count-based, so all game logic works identically at any speed. Single-player can change speed mid-game; multiplayer sets it in lobby (synced).

### Faction System

```rust
/// Faction identity — loaded from YAML.
pub struct Faction {
    pub internal_name: String,   // "allies", "soviet"
    pub display_name: String,    // "Allied Forces"
    pub side: String,            // "allies", "soviet" (for grouping subfactions)
    pub color: PlayerColor,
    pub tech_tree: TechTreeId,
    pub starting_units: Vec<StartingUnit>,
}
```

Factions determine: available tech tree (which units/buildings can be built), default player color, starting unit composition in skirmish, lobby selection, and `Buildable.prereqs` resolution. RA2 subfactions (e.g., Korea, Libya) share a `side` but differ in `tech_tree` (one unique unit each).

### Auto-Target / Turret

```rust
/// Unit auto-acquires targets within range.
pub struct AutoTarget {
    pub scan_range: i32,
    pub stance: Stance,
    pub prefer_priority: bool,   // prefer high-priority targets
}

pub enum Stance {
    HoldFire,      // never auto-attack
    ReturnFire,    // attack only if attacked
    Defend,        // attack enemies in range
    AttackAnything, // attack anything visible
}

/// Turreted weapon — rotates independently of body.
pub struct Turreted {
    pub turn_speed: i32,
    pub offset: WorldPos,      // turret mount point relative to body
    pub current_facing: i32,   // turret facing (0-255)
}

/// Weapon requires ammo — must reload at dock (helipad).
pub struct AmmoPool {
    pub max_ammo: u32,
    pub current_ammo: u32,
    pub reload_delay: u32,    // ticks per ammo at dock
}
```

**`combat_system()` integration:** For units with `AutoTarget` and no current attack order: scan `SpatialIndex` within `scan_range`. Filter by `Stance` rules. Pick highest-priority valid target. For `Turreted` units: rotate turret toward target at `turn_speed` per tick before firing. For `AmmoPool` units: decrement ammo on fire; when depleted, return to nearest `DockHost` with `DockType::Helipad` for reload.

### Selection Details

```rust
pub struct SelectionPriority {
    pub priority: i32,         // higher = selected preferentially
    pub click_priority: i32,   // higher = wins click-through
}
```

**Selection features:**
- **Priority:** When box-selecting 200 units, combat units are selected over harvesters (higher `priority`)
- **Double-click:** Select all units of the same type on screen
- **Tab cycling:** Cycle through unit types within a selection group
- **Control groups:** 0-9 control groups, Ctrl+# to assign, # to select, double-# to center camera
- **Isometric selection box:** Diamond-shaped box selection for proper isometric hit-testing

### Observer / Spectator UI

Observer mode (separate from player mode) displays overlays not available to players:

```rust
pub struct ObserverState {
    pub show_army: bool,       // unit composition per player
    pub show_production: bool, // what each player is building
    pub show_economy: bool,    // income rate, credits per player
    pub show_powers: bool,     // superweapon charge timers
    pub show_score: bool,      // strategic score tracker
    pub follow_player: Option<PlayerId>,  // lock camera to player's view (writes GameCamera.follow_target)
}
```

**Army overlay:** Bar chart of unit counts per player, grouped by type. **Production overlay:** List of active queues per player. **Economy overlay:** Income rate graph. These are render-only — no sim interaction. Observer UI is an `ic-ui` concern.

#### Game Score / Performance Metrics

The sim tracks a comprehensive `GameScore` per player, updated every tick. This powers the observer economy overlay, post-game stats screen, and the replay analysis event stream (see `05-FORMATS.md` § "Analysis Event Stream"). Design informed by SC2's `ScoreDetails` protobuf (see `research/blizzard-github-analysis.md` § Part 2).

```rust
#[derive(Clone, Serialize, Deserialize)]
pub struct GameScore {
    // Economy
    pub total_collected: ResourceSet,      // lifetime resources harvested
    pub total_spent: ResourceSet,          // lifetime resources committed
    pub collection_rate: ResourceSet,      // current income per minute (fixed-point)
    pub idle_harvester_ticks: u64,         // cumulative ticks harvesters spent idle

    // Production
    pub units_produced: u32,
    pub structures_built: u32,
    pub idle_production_ticks: u64,        // cumulative ticks factories spent idle

    // Combat
    pub units_killed: u32,
    pub units_lost: u32,
    pub structures_destroyed: u32,
    pub structures_lost: u32,
    pub killed_value: ResourceSet,         // total value of enemy assets destroyed
    pub lost_value: ResourceSet,           // total value of own assets lost
    pub damage_dealt: i64,                 // fixed-point cumulative
    pub damage_received: i64,

    // Activity
    pub actions_per_minute: u32,           // APM (all orders)
    pub effective_actions_per_minute: u32, // EPM (non-redundant orders only)
}
```

**APM vs EPM:** Following SC2's distinction — APM counts every order, EPM filters duplicate/redundant commands (e.g., repeatedly right-clicking the same destination). EPM is a better measure of meaningful player activity.

**Sim-side only:** `GameScore` lives in `ic-sim` (it's deterministic state, not rendering). Observer overlays in `ic-ui` read it through the standard `Simulation` query interface.

### Debug / Developer Tools

> See also `09-DECISIONS.md` § D058 for the unified chat/command console, cvar system, and Brigadier-style command tree that provides the text-based interface to these developer tools.

Developer mode (toggled in settings, not available in ranked):

```rust
pub struct DeveloperMode {
    pub instant_build: bool,
    pub free_units: bool,
    pub reveal_map: bool,
    pub unlimited_power: bool,
    pub invincible: bool,
    pub give_cash_amount: i32,
}
```

**Debug overlays (via `bevy_egui`):**
- Combat: weapon ranges as circles, target lines, damage numbers floating
- Pathfinding: flowfield visualization, path cost heat map, blocker highlight
- Performance: per-system tick time bar chart, entity count, memory usage
- Network: RTT graph, order latency, jitter, desync hash comparison
- Asset browser: preview sprites, sounds, palettes inline

Developer cheats issue special orders validated only when `DeveloperMode` is active. In multiplayer, all players must agree to enable dev mode (prevents cheating).

> **Security (V44):** The consensus mechanism for multiplayer dev mode must be specified: dev mode is sim state (not client-side), toggled exclusively via `PlayerOrder::SetDevMode` with unanimous lobby consent before game start. Dev mode orders use a distinct `PlayerOrder::DevCommand` variant rejected by the sim when dev mode is inactive. Disabled for ranked matchmaking. See `06-SECURITY.md` § Vulnerability 44.

#### Debug Drawing API

A programmatic drawing API for rendering debug geometry. Inspired by SC2's `DebugDraw` interface (see `research/blizzard-github-analysis.md` § Part 7) — text, lines, boxes, and spheres rendered as overlays:

```rust
pub trait DebugDraw {
    fn draw_text(&mut self, pos: WorldPos, text: &str, color: Color);
    fn draw_line(&mut self, start: WorldPos, end: WorldPos, color: Color);
    fn draw_circle(&mut self, center: WorldPos, radius: i32, color: Color);
    fn draw_rect(&mut self, min: WorldPos, max: WorldPos, color: Color);
}
```

Used by AI visualization, pathfinding debug, weapon range display, and Lua/WASM debug scripts. All debug geometry is cleared each frame — callers re-submit every tick. Lives in `ic-render` (render concern, not sim).

#### Debug Unit Manipulation

Developer mode supports direct entity manipulation for testing:

- **Spawn unit:** Create any unit type at a position, owned by any player
- **Kill unit:** Instantly destroy selected entities
- **Set resources:** Override player credit balance
- **Modify health:** Set HP to any value

These operations are implemented as special `PlayerOrder` variants validated only when `DeveloperMode` is active. They flow through the normal order pipeline — deterministic across all clients.

#### Fault Injection (Testing Only)

For automated stability testing — not exposed in release builds:

- **Hang simulation:** Simulate tick timeout (verifies watchdog recovery)
- **Crash process:** Controlled exit (verifies crash reporting pipeline)
- **Desync injection:** Flip a bit in sim state (verifies desync detection and diagnosis)

These follow SC2's `DebugTestProcess` pattern for CI/CD reliability testing.

### Localization Framework

```rust
pub struct Localization {
    pub current_locale: String,         // "en", "de", "zh-CN"
    pub bundles: HashMap<String, FluentBundle>,  // locale → string bundle
}
```

Uses **Project Fluent** (same as OpenRA) for parameterized, pluralization-aware message formatting:

```fluent
# en.ftl
unit-lost = Unit lost
base-under-attack = Our base is under attack!
building-complete = { $building } construction complete.
units-selected = { $count ->
    [one] {$count} unit selected
   *[other] {$count} units selected
}
```

Mods provide their own `.ftl` files. Engine strings are localizable from Phase 3. Community translations publishable to Workshop.

### Encyclopedia

In-game unit/building/weapon reference browser:

```rust
pub struct EncyclopediaEntry {
    pub actor_type: ActorId,
    pub display_name: String,
    pub description: String,
    pub stats: HashMap<String, String>,  // "Speed: 8", "Armor: Medium"
    pub preview_sprite: SpriteId,
    pub category: EncyclopediaCategory,
}

pub enum EncyclopediaCategory { Infantry, Vehicle, Aircraft, Naval, Structure, Defense, Support }
```

Auto-generated from YAML rule definitions + optional `encyclopedia:` block in YAML. Accessible from main menu and in-game sidebar. Mod-defined units automatically appear in the encyclopedia.

### Palette Effects (Runtime)

Beyond static `.pal` file loading (`ra-formats`), runtime palette manipulation for classic RA visual style:

```rust
pub enum PaletteEffect {
    PlayerColorRemap { remap_range: (u8, u8), target_color: PlayerColor },
    Rotation { start_index: u8, end_index: u8, speed: u32 },  // water animation
    CloakShimmer { entity: EntityId },
    ScreenFlash { color: PaletteColor, duration: u32 },       // nuke, chronoshift
    DamageTint { entity: EntityId, state: DamageState },
}
```

**Modern implementation:** These are shader effects in Bevy's render pipeline, not literal palette index swaps. But the modder-facing YAML configuration matches the original palette effect names for familiarity. Shader implementations achieve the same visual result with modern GPU techniques (color lookup textures, screen-space post-processing).

### Demolition / C4

```rust
pub struct Demolition {
    pub delay: u32,               // ticks to detonation
    pub warhead: WarheadId,
    pub required_target: TargetType,  // buildings only
}
```

Engineer-type unit with `Demolition` places C4 on a building. After `delay` ticks, warhead detonates. Target building takes massive damage (usually fatal). Engineer is consumed.

### Plug System

```rust
pub struct Pluggable {
    pub plug_type: PlugType,
    pub max_plugs: u32,
    pub current_plugs: u32,
    pub effect_per_plug: ConditionId,
}

pub struct Plug {
    pub plug_type: PlugType,
}
```

Primarily RA2 (bio-reactor accepting infantry for extra power). Included for mod compatibility. When a `Plug` entity enters a `Pluggable` building, increment `current_plugs`, grant condition per plug (e.g., "+50 power per infantry in reactor").

---

## Game Loop

```rust
pub struct GameLoop<N: NetworkModel, I: InputSource> {
    sim: Simulation,
    renderer: Renderer,
    network: N,
    input: I,
    local_player: PlayerId,
    order_buf: Vec<TimestampedOrder>,  // reused across frames — zero allocation on hot path
}

impl<N: NetworkModel, I: InputSource> GameLoop<N, I> {
    fn frame(&mut self) {
        // 1. Gather local input with sub-tick timestamps
        self.input.drain_orders(&mut self.order_buf);
        for order in self.order_buf.drain(..) {
            self.network.submit_order(order);
        }

        // 2. Advance sim as far as confirmed orders allow
        while let Some(tick_orders) = self.network.poll_tick() {
            self.sim.apply_tick(&tick_orders);
            self.network.report_sync_hash(
                self.sim.tick(),
                self.sim.state_hash(),
            );
        }

        // 3. Render always runs, interpolates between sim states
        self.renderer.draw(&self.sim, self.interpolation_factor());
    }
}
```

**Key property:** `GameLoop` is generic over `N: NetworkModel` and `I: InputSource`. It has zero knowledge of whether it's running single-player or multiplayer, or whether input comes from a mouse, touchscreen, or gamepad. This is the central architectural guarantee.

### Game Lifecycle State Machine

The game application transitions through a fixed set of states. Design informed by SC2's protocol state machine (see `research/blizzard-github-analysis.md` § Part 1), adapted for IC's architecture:

```
┌──────────┐     ┌───────────┐     ┌─────────┐     ┌───────────┐
│ Launched │────▸│ InMenus   │────▸│ Loading │────▸│ InGame    │
└──────────┘     └───────────┘     └─────────┘     └───────────┘
                   ▲     │                            │       │
                   │     │                            │       │
                   │     ▼                            ▼       │
                   │   ┌───────────┐          ┌───────────┐   │
                   │   │ InReplay  │◂─────────│ GameEnded │   │
                   │   └───────────┘          └───────────┘   │
                   │         │                    │           │
                   └─────────┴────────────────────┘           │
                                                              ▼
                                                        ┌──────────┐
                                                        │ Shutdown │
                                                        └──────────┘
```

- **Launched → InMenus:** Engine initialization, asset loading, mod registration
- **InMenus → Loading:** Player starts a game or joins a lobby; map and rules are loaded
- **Loading → InGame:** All assets loaded, `NetworkModel` connected, sim initialized. See `03-NETCODE.md` § "Match Lifecycle" for the ready-check and countdown protocol that governs this transition in multiplayer.
- **InGame → GameEnded:** Victory/defeat condition met, player surrenders (`PlayerOrder::Surrender`), vote-driven resolution (kick, remake, draw via the In-Match Vote Framework), or match void. See `03-NETCODE.md` § "Match Lifecycle" for the surrender mechanic, team vote thresholds, and the generic callvote system.
- **GameEnded → InMenus:** Return to main menu (post-game stats shown during transition). See `03-NETCODE.md` § "Post-Game Flow" for the 30-second post-game lobby with stats, rating display, and re-queue.
- **GameEnded → InReplay:** Watch the just-finished game (replay file already recorded)
- **InMenus → InReplay:** Load a saved replay file
- **InReplay → InMenus:** Exit replay viewer
- **InGame → Shutdown:** Application exit (snapshot saved for resume on platforms that require it)

State transitions are events in Bevy's event system — plugins react to transitions without polling. The sim exists only during `InGame` and `InReplay`; all other states are menu/UI-only.

## State Recording & Replay Infrastructure

The sim's snapshottable design (D010) enables a **StateRecorder/Replayer** pattern for asynchronous background recording — inspired by Valve's Source Engine `StateRecorder`/`StateReplayer` pattern (see `research/valve-github-analysis.md` § 2.2). The game loop records orders and periodic state snapshots to a background writer; the replay system replays them through the same `Simulation::apply_tick()` path.

### StateRecorder (Recording Side)

```rust
/// Asynchronous background recording of game state.
/// Records orders every tick and full/delta snapshots periodically.
/// Runs on a background thread — zero impact on game loop latency.
///
/// Lives in ic-game (I/O concern, not sim concern — Invariant #1).
pub struct StateRecorder {
    /// Background thread that receives snapshots/orders via channel
    /// and writes them to the replay file. Crash-safe: payload is
    /// written first, header updated atomically after fsync (Fossilize
    /// pattern — see D010).
    writer: JoinHandle<()>,
    /// Channel to send tick orders to the writer.
    order_tx: Sender<RecordedTick>,
    /// Interval for full snapshot keyframes (default: every 300 ticks).
    snapshot_interval: u64,
}

pub struct RecordedTick {
    pub tick: u64,
    pub orders: TickOrders,
    /// Full snapshot at keyframe intervals; delta snapshot otherwise.
    /// Delta snapshots encode only changed components (see below).
    pub snapshot: Option<SnapshotType>,
}

pub enum SnapshotType {
    Full(SimSnapshot),
    Delta(DeltaSnapshot),
}
```

### Per-Field Change Tracking (from Source Engine CNetworkVar)

To support delta snapshots efficiently, the sim uses **per-field change tracking** — inspired by Source Engine's `CNetworkVar` system (see `research/valve-github-analysis.md` § 2.2). Each ECS component that participates in snapshotting is annotated with a `#[track_changes]` derive macro. The macro generates a companion bitfield that records which fields changed since the last snapshot. Delta serialization then skips unchanged fields entirely.

```rust
/// Derive macro that generates per-field change tracking for a component.
/// Each field gets a corresponding bit in a compact `ChangeMask` bitfield.
/// When a field is modified through its setter, the bit is set.
/// Delta serialization reads the mask to skip unchanged fields.
///
/// Components with SPROP_CHANGES_OFTEN (position, health, facing) are
/// checked first during delta computation — improves cache locality
/// by touching hot data before cold data. See `10-PERFORMANCE.md`.
#[derive(Component, Serialize, Deserialize, TrackChanges)]
pub struct Mobile {
    pub position: WorldPos,        // changes every tick during movement
    pub facing: FixedAngle,        // changes every tick during turning
    pub speed: FixedPoint,         // changes occasionally
    pub locomotor_type: Locomotor, // rarely changes
}

// Generated by #[derive(TrackChanges)]:
// impl Mobile {
//     pub fn set_position(&mut self, val: WorldPos) {
//         self.position = val;
//         self.change_mask |= 0b0001;
//     }
//     pub fn change_mask(&self) -> u8 { self.change_mask }
//     pub fn clear_changes(&mut self) { self.change_mask = 0; }
// }
```

**SPROP_CHANGES_OFTEN priority (from Source Engine):** Components that change frequently (position, health, ammunition) are tagged and processed first during delta encoding. This isn't a correctness concern — it's a cache locality optimization. By processing high-churn components first, the delta encoder touches frequently-modified memory regions while they're still in L1/L2 cache. See `10-PERFORMANCE.md` for performance impact analysis.

### Crash-Time State Capture

When a desync is detected (hash mismatch via `report_sync_hash()`), the system automatically captures a full state snapshot before any error handling or recovery:

```rust
/// Called by NetworkModel when a sync hash mismatch is detected.
/// Captures full state immediately — before the sim advances further —
/// so the exact divergence point is preserved for offline analysis.
fn on_desync_detected(sim: &Simulation, tick: u64, local_hash: u64, remote_hash: u64) {
    // 1. Immediate full snapshot
    let snapshot = sim.snapshot();
    // 2. Write to crash dump file (same Fossilize append-safe pattern)
    write_crash_dump(tick, local_hash, remote_hash, &snapshot);
    // 3. If Merkle tree is available, capture the tree for
    //    logarithmic desync localization (see 03-NETCODE.md)
    if let Some(tree) = sim.merkle_tree() {
        write_merkle_dump(tick, &tree);
    }
    // 4. Continue with normal desync handling (reconnect, notify user, etc.)
}
```

This ensures desync debugging always has a snapshot at the exact point of divergence — not N ticks later when the developer gets around to analyzing it. The pattern comes from Valve's Fossilize (crash-safe state capture, see `research/valve-github-analysis.md` § 3.1) and OpenTTD's periodic desync snapshot naming convention (`desync_{seed}_{tick}.snap`).

## Pathfinding & Spatial Queries

**Decision:** Pathfinding and spatial queries are abstracted behind traits — like `NetworkModel`. A multi-layer hybrid pathfinder is the first implementation (RA1 game module). The engine core has no hardcoded assumption about grids vs. continuous space.

OpenRA uses hierarchical A* which struggles with large unit groups and lacks local avoidance. A multi-layer approach (hierarchical sectors + JPS/flowfield tiles + ORCA-lite avoidance) handles both small-group and mass unit movement. But pathfinding is a game-module concern, not an engine-core assumption.

### Pathfinder Trait

```rust
/// Game modules implement this to provide pathfinding.
/// Grid-based games use multi-layer hybrid (JPS + flowfield tiles + avoidance).
/// Continuous-space games would use navmesh.
/// The engine core calls this trait — never a specific algorithm.
pub trait Pathfinder: Send + Sync {
    /// Request a path from origin to destination.
    fn request_path(&mut self, origin: WorldPos, dest: WorldPos, locomotor: LocomotorType) -> PathId;

    /// Poll for completed path. Returns waypoints in WorldPos.
    fn get_path(&self, id: PathId) -> Option<&[WorldPos]>;

    /// Can a unit with this locomotor pass through this position?
    fn is_passable(&self, pos: WorldPos, locomotor: LocomotorType) -> bool;

    /// Invalidate cached paths (e.g., building placed, bridge destroyed).
    fn invalidate_area(&mut self, center: WorldPos, radius: SimCoord);

    /// Query the path distance between two points without computing full waypoints.
    /// Returns `None` if no path exists. Used by AI for target selection, threat assessment,
    /// and build placement scoring.
    fn path_distance(&self, from: WorldPos, to: WorldPos, locomotor: LocomotorType) -> Option<SimCoord>;

    /// Batch distance queries — amortizes overhead when AI needs distances to many targets.
    /// Returns distances in the same order as `targets`. `None` entries mean no path.
    /// Design informed by SC2's batch `RequestQueryPathing` (see `research/blizzard-github-analysis.md` § Part 4).
    fn batch_distances(
        &self,
        from: WorldPos,
        targets: &[WorldPos],
        locomotor: LocomotorType,
    ) -> Vec<Option<SimCoord>>;
}
```

### SpatialIndex Trait

```rust
/// Game modules implement this for spatial queries (range checks, collision, targeting).
/// Grid-based games use a spatial hash grid. Continuous-space games could use BVH or R-tree.
/// The engine core queries this trait — never a specific data structure.
pub trait SpatialIndex: Send + Sync {
    /// Find all entities within range of a position.
    fn query_range(&self, center: WorldPos, range: SimCoord, filter: EntityFilter) -> &[EntityId];

    /// Update entity position in the index.
    fn update_position(&mut self, entity: EntityId, old: WorldPos, new: WorldPos);

    /// Remove entity from the index.
    fn remove(&mut self, entity: EntityId);
}
```

### Why This Matters

This is the same philosophy as `WorldPos.z` — costs near-zero now, prevents rewrites later:

| Abstraction       | Costs Now                                 | Saves Later                                                |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `WorldPos.z`      | One extra `i32` per position              | RA2/TS elevation works without restructuring coordinates   |
| `NetworkModel`    | One trait + `LocalNetwork` impl           | Multiplayer netcode slots in without touching sim          |
| `InputSource`     | One trait + mouse/keyboard impl           | Touch/gamepad slot in without touching game loop           |
| `Pathfinder`      | One trait + multi-layer hybrid impl first | Navmesh pathfinding slots in; RA1 ships 3 impls (D045)     |
| `SpatialIndex`    | One trait + spatial hash impl             | BVH/R-tree slots in without touching combat/targeting      |
| `FogProvider`     | One trait + radius fog impl               | Elevation fog, fog-authoritative server slot in            |
| `DamageResolver`  | One trait + standard pipeline impl        | Shield-first/sub-object damage models slot in              |
| `AiStrategy`      | One trait + personality-driven AI impl    | Neural/planning/custom AI slots in without forking ic-ai   |
| `RankingProvider` | One trait + Glicko-2 impl                 | Community servers choose their own rating algorithm        |
| `OrderValidator`  | One trait + standard validation impl      | Engine enforces validation; modules can't skip it silently |

The RA1 game module registers three `Pathfinder` implementations — `RemastersPathfinder`, `OpenRaPathfinder`, and `IcPathfinder` (D045) — plus `GridSpatialHash`. The active pathfinder is selected via experience profiles (D045). A future continuous-space game module registers `NavmeshPathfinder` and `BvhSpatialIndex`. The sim core calls the trait — it never knows which one is running. The same principle applies to fog, damage, AI, ranking, and validation — see D041 in `09-DECISIONS.md` for the full trait definitions and rationale.

## Platform Portability

The engine must not create obstacles for any platform. Desktop is the primary dev target, but every architectural choice must be portable to browser (WASM), mobile (Android/iOS), and consoles without rework.

### Player Data Directory (D061)

All player data lives under a single, self-contained directory. The structure is stable and documented — a manual copy of this directory is a valid (if crude) backup. The `ic backup` CLI provides a safer alternative using SQLite `VACUUM INTO` for consistent database copies. See `09-DECISIONS.md` § D061 for full rationale, backup categories, and cloud sync design.

```
<data_dir>/
├── config.toml              # Settings (D033 toggles, keybinds, render quality)
├── profile.db               # Identity, friends, blocks, privacy (D053)
├── achievements.db          # Achievement collection (D036)
├── gameplay.db              # Event log, replay catalog, save index, map catalog (D034)
├── telemetry.db             # Unified telemetry events (D031) — pruned at 100 MB
├── keys/
│   └── identity.key         # Ed25519 private key (D052) — recoverable via mnemonic seed phrase (D061)
├── communities/             # Per-community credential stores (D052)
│   ├── official-ic.db
│   └── clan-wolfpack.db
├── saves/                   # Save game files (.icsave)
├── replays/                 # Replay files (.icrep)
├── screenshots/             # PNG with IC metadata in tEXt chunks
├── workshop/                # Downloaded Workshop content (D030)
├── mods/                    # Locally installed mods
├── maps/                    # Locally installed maps
├── logs/                    # Engine log files (rotated)
└── backups/                 # Created by `ic backup create`
```

**Platform-specific `<data_dir>` resolution:**

| Platform       | Default Location                                                         |
| -------------- | ------------------------------------------------------------------------ |
| Windows        | `%APPDATA%\IronCurtain\`                                                 |
| macOS          | `~/Library/Application Support/IronCurtain/`                             |
| Linux          | `$XDG_DATA_HOME/iron-curtain/` (default: `~/.local/share/iron-curtain/`) |
| Browser (WASM) | OPFS virtual filesystem (see `05-FORMATS.md` § Browser Storage)          |
| Mobile         | App sandbox (platform-managed)                                           |

Override with `IC_DATA_DIR` environment variable or `--data-dir` CLI flag. All asset loading goes through Bevy's asset system (rule 5 below) — the data directory is for player-generated content, not game assets.

### Data & Backup UI (D061)

The in-game **Settings → Data & Backup** panel exposes backup, restore, cloud sync, and profile export — the GUI equivalent of the `ic backup` CLI. A **Data Health** summary shows identity key status, sync recency, backup age, and data folder size. Critical data is automatically protected by rotating daily snapshots (`auto-critical-N.zip`, 3-day retention) and optional platform cloud sync (Steam Cloud / GOG Galaxy).

**First-launch flow** integrates with D032's experience profile selection:
1. New player: identity created automatically → 24-word recovery phrase displayed → cloud sync offer → backup reminder prompt
2. Returning player on new machine: cloud data detected → restore offer showing identity, rating, match count; or mnemonic seed recovery (enter 24 words); or manual restore from backup ZIP / data folder copy

Post-milestone toasts (same system as D030's Workshop cleanup prompts) nudge players without cloud sync to back up after ranked matches, campaign completion, or tier promotions. See `09-DECISIONS.md` § D061 "Player Experience" for full UX mockups and scenario walkthroughs.

### Portability Design Rules

1. **Input is abstracted behind a trait.** `InputSource` produces `PlayerOrder`s — it knows nothing about mice, keyboards, touchscreens, or gamepads. The game loop consumes orders, not raw input events. Each platform provides its own `InputSource` implementation.

2. **UI layout is responsive.** No hardcoded pixel positions. The sidebar, minimap, and build queue use constraint-based layout that adapts to screen size and aspect ratio. Mobile/tablet may use a completely different layout (bottom bar instead of sidebar). `ic-ui` provides layout *profiles*, not a single fixed layout.

3. **Click-to-world is abstracted behind a trait.** Isometric screen→world (desktop), touch→world (mobile), and raycast→world (3D mod) all implement the same `ScreenToWorld` trait, producing a `WorldPos`. Grid-based game modules convert to `CellPos` as needed. No isometric math or grid assumption hardcoded in the game loop.

4. **Render quality is configurable per device.** FPS cap, particle density, post-FX toggles, resolution scaling, shadow quality — all runtime-configurable. Mobile caps at 30fps; desktop targets 60-240fps. The renderer reads a `RenderSettings` resource, not compile-time constants. Four render quality tiers (Baseline → Standard → Enhanced → Ultra) are auto-detected from `wgpu::Adapter` capabilities at startup. Tier 0 (Baseline) targets GL 3.3 / WebGL2 hardware — no compute shaders, no post-FX, CPU particle fallback, palette tinting for weather. See `10-PERFORMANCE.md` § "GPU & Hardware Compatibility" for tier definitions and hardware floor analysis.

5. **No raw filesystem I/O.** All asset loading goes through Bevy's asset system, never `std::fs` directly. Mobile and browser have sandboxed filesystems; WASM has no filesystem at all. Save games use platform-appropriate storage (e.g., `localStorage` on web, app sandbox on mobile).

6. **App lifecycle is handled.** Mobile and consoles require suspend/resume/save-on-background. The snapshottable sim makes this trivial — `snapshot()` on suspend, `restore()` on resume. This must be an engine-level lifecycle hook, not an afterthought.

7. **Audio backend is abstracted.** Bevy handles this, but no code should assume a specific audio API. Platform-specific audio routing (e.g., phone speaker vs headphones, console audio mixing policies) is Bevy's concern.

### Platform Target Matrix

| Platform                | Graphics API              | Input Model                | Key Challenge                            | Phase  |
| ----------------------- | ------------------------- | -------------------------- | ---------------------------------------- | ------ |
| Windows / macOS / Linux | Vulkan / Metal / DX12     | Mouse + keyboard           | Primary target                           | 1      |
| Steam Deck              | Vulkan (native Linux)     | Gamepad + touchpad         | Gamepad UI controls                      | 3      |
| Browser (WASM)          | WebGPU / WebGL2           | Mouse + keyboard + touch   | Download size, no filesystem             | 7      |
| Android / iOS           | Vulkan / Metal (via wgpu) | Touch + on-screen controls | Touch RTS controls, battery, screen size | 8+     |
| Xbox                    | DX12 (via GDK)            | Gamepad                    | NDA SDK, certification                   | 8+     |
| PlayStation             | AGC (proprietary)         | Gamepad                    | wgpu doesn't support AGC yet, NDA SDK    | Future |
| Nintendo Switch         | NVN / Vulkan              | Gamepad + touch (handheld) | NDA SDK, limited GPU                     | Future |

### Input Abstraction

```rust
/// Platform-agnostic input source. Each platform implements this.
pub trait InputSource {
    /// Drain pending player orders from whatever input device is active.
    fn drain_orders(&mut self, buf: &mut Vec<TimestampedOrder>);
    // Caller provides the buffer (reused across ticks — zero allocation on hot path)

    /// Optional: hint about input capabilities for UI adaptation.
    fn capabilities(&self) -> InputCapabilities;
}

pub struct InputCapabilities {
    pub has_mouse: bool,
    pub has_keyboard: bool,
    pub has_touch: bool,
    pub has_gamepad: bool,
    pub screen_size: ScreenClass,  // Phone, Tablet, Desktop, TV
}

pub enum ScreenClass {
    Phone,    // < 7" — bottom bar UI, large touch targets
    Tablet,   // 7-13" — sidebar OK, touch targets
    Desktop,  // 13"+ — full sidebar, mouse precision
    TV,       // 40"+ — large text, gamepad radial menus
}
```

`ic-ui` reads `InputCapabilities` to choose the appropriate layout profile. The sim never sees any of this.

## UI Theme System (D032)

The UI is split into two orthogonal concerns:

- **Layout profiles** — *where* things go. Driven by `ScreenClass` (Phone, Tablet, Desktop, TV). Handles sidebar vs bottom bar, touch target sizes, minimap placement. One per screen class.
- **Themes** — *how* things look. Driven by player preference. Handles colors, chrome sprites, fonts, animations, menu backgrounds. Switchable at any time.

### Theme Architecture

Themes are **YAML + sprite sheets** — Tier 1 mods, no code required.

```rust
pub struct UiTheme {
    pub name: String,
    pub chrome: ChromeAssets,    // 9-slice panels, button states, scrollbar sprites
    pub colors: ThemeColors,     // primary, secondary, text, highlights
    pub fonts: ThemeFonts,       // menu, body, HUD
    pub main_menu: MainMenuConfig,  // background image or shellmap, music, button layout
    pub ingame: IngameConfig,    // sidebar style, minimap border, build queue chrome
    pub lobby: LobbyConfig,     // panel styling, slot layout
}
```

### Built-in Themes

| Theme      | Aesthetic                                                                      | Inspired By                  |
| ---------- | ------------------------------------------------------------------------------ | ---------------------------- |
| Classic    | Military minimalism — bare buttons, static title screen, Soviet palette        | Original RA1 (1996)          |
| Remastered | Clean modern military — HD panels, sleek chrome, reverent refinement           | Remastered Collection (2020) |
| Modern     | Full Bevy UI — dynamic panels, animated transitions, modern game launcher feel | IC's own design              |

All art assets are **original creations** — no assets copied from EA or OpenRA. These themes capture aesthetic philosophy, not specific artwork.

### Shellmap System

Main menu backgrounds can be **live battles** — a real game map with scripted AI running behind the menu UI:
- Per-theme configuration: Classic uses a static image (faithful to 1996), Remastered/Modern use shellmaps
- Maps tagged `visibility: shellmap` are eligible — random selection on each launch
- Shellmaps define camera paths (pan, orbit, or fixed)
- Mods automatically get their own shellmaps

### Per-Game-Module Defaults

Each `GameModule` provides a `default_theme()` — RA1 defaults to Classic, future modules default to whatever fits their aesthetic. Players override in settings. This pairs naturally with D019 (switchable balance presets): Classic balance + Classic theme = feels like 1996.

### Community Themes

- Publishable to workshop (D030) as standalone resources
- Stack with gameplay mods — a WWII total conversion ships its own olive-drab theme
- An "OpenRA-inspired" community theme is a natural contribution

See `09-DECISIONS.md` § D032 for full rationale, YAML schema, and legal notes on asset sourcing.

## QoL & Gameplay Behavior Toggles (D033)

Every quality-of-life improvement from OpenRA and the Remastered Collection is **individually toggleable** — attack-move, multi-queue production, health bars, range circles, guard command, waypoint queuing, and dozens more. Built-in presets group toggles into coherent profiles:

| Preset                   | Feel                                      |
| ------------------------ | ----------------------------------------- |
| `vanilla`                | Authentic 1996 — no modern QoL            |
| `openra`                 | All OpenRA improvements enabled           |
| `remastered`             | Remastered Collection's specific QoL set  |
| `iron_curtain` (default) | Best features cherry-picked from all eras |

Toggles are categorized as **sim-affecting** (production rules, unit commands — synced in lobby) or **client-only** (health bars, range circles — per-player preference). This split preserves determinism (invariant #1) while giving each player visual/UX freedom.

### Experience Profiles

D019 (balance), D032 (theme), D033 (behavior), D043 (AI behavior), D045 (pathfinding feel), and D048 (render mode) are six independent axes that compose into **experience profiles**. Selecting "Vanilla RA" sets all six to classic in one click. Selecting "Iron Curtain" sets classic balance + modern theme + best QoL + enhanced AI + modern movement + HD graphics. After selecting a profile, any individual setting can still be overridden.

**Mod profiles (D062)** are a superset of experience profiles: they bundle the six experience axes WITH the active mod set and conflict resolutions into a single named, hashable object. A mod profile answers "what mods am I running AND how is the game configured?" in one saved YAML file. The profile's fingerprint (SHA-256 of the resolved virtual asset namespace) enables single-hash compatibility checking in multiplayer lobbies. Switching profiles reconfigures both the mod set and experience settings in one action. Publishing a local mod profile via `ic mod publish-profile` creates a Workshop modpack (D030). See `09-DECISIONS.md` § D062.

See `09-DECISIONS.md` § D033 for the full toggle catalog, YAML schema, and sim/client split details. See D043 for AI behavior presets, D045 for pathfinding behavior presets, and D048 for switchable render modes.

## Red Alert Experience Recreation Strategy

Making IC *feel* like Red Alert requires more than loading the right files. The graphics, sounds, menu flow, unit selection, cursor behavior, and click feedback must recreate the experience that players remember — verified against the actual source code. We have access to four authoritative reference codebases. Each serves a different purpose.

### Reference Source Strategy

| Source                                                                                                                  | License           | What We Extract                                                                                                                                                                                                                                                                                                                                                                                                 | What We Don't                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EA Original Red Alert** ([CnC_Red_Alert](https://github.com/electronicarts/CnC_Red_Alert))                            | GPL v3            | Canonical gameplay values (costs, HP, speeds, damage tables). Integer math patterns. Animation frame counts and timing constants. SHP draw mode implementations (shadow, ghost, fade, predator). Palette cycling logic. Audio mixing priorities. Event/order queue architecture. Cursor context logic.                                                                                                          | Don't copy rendering code verbatim — it's VGA/DirectDraw-specific. Don't adopt the architecture — `#ifdef` branching, global state, platform-specific rendering.                                         |
| **EA Remastered Collection** ([CnC_Remastered_Collection](https://github.com/electronicarts/CnC_Remastered_Collection)) | GPL v3 (C++ DLLs) | UX gold standard — the definitive modernization of the RA experience. F1 render-mode toggle (D048 reference). Sidebar redesign. HD asset pipeline (how classic sprites map to HD equivalents). Modern QoL additions. Sound mixing improvements. How they handled the classic↔modern visual duality.                                                                                                             | GPL covers C++ engine DLLs only — the HD art assets, remastered music, and Petroglyph's C# layer are **proprietary**. Never reference proprietary Petroglyph source. Never distribute remastered assets. |
| **OpenRA** ([OpenRA](https://github.com/OpenRA/OpenRA))                                                                 | GPL v3            | Working implementation reference for everything the community expects: sprite rendering order, palette handling, animation overlays, chrome UI system, selection UX, cursor contexts, EVA notifications, sound system integration, minimap rendering, shroud edge smoothing. OpenRA represents 15+ years of community refinement — what players consider "correct" behavior. Issue tracker as pain point radar. | Don't copy OpenRA's balance decisions verbatim (D019 — we offer them as a preset). Don't port OpenRA bugs. Don't replicate C# architecture — translate concepts to Rust/ECS.                             |
| **Bevy** ([bevyengine/bevy](https://github.com/bevyengine/bevy))                                                        | MIT               | How to BUILD it: sprite batching and atlas systems, `bevy_audio` spatial audio, `bevy_ui` layout, asset pipeline (async loading, hot reload), wgpu render graph, ECS scheduling patterns, camera transforms, input handling.                                                                                                                                                                                    | Bevy is infrastructure, not reference for gameplay feel. It tells us *how* to render a sprite, not *which* sprite at *what* timing with *what* palette.                                                  |

**The principle:** Original RA tells us what the values ARE. Remastered tells us what a modern version SHOULD feel like. OpenRA tells us what the community EXPECTS. Bevy tells us how to BUILD it.

### Visual Fidelity Checklist

These are the specific visual elements that make Red Alert look like Red Alert. Each must be verified against original source code constants, not guessed from screenshots.

#### Sprite Rendering Pipeline

| Element                             | Original RA Source Reference                                                                                                               | IC Implementation                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Palette-indexed rendering**       | `PAL` format: 256 × RGB in 6-bit VGA range (0–63). Convert to 8-bit: `value << 2`. See `05-FORMATS.md` § PAL                               | `ra-formats` loads `.pal`; `ic-render` applies via palette texture lookup (GPU shader)                                                                    |
| **SHP draw modes**                  | `SHAPE.H`: `SHAPE_NORMAL`, `SHAPE_SHADOW`, `SHAPE_GHOST`, `SHAPE_PREDATOR`, `SHAPE_FADING`. See `05-FORMATS.md` § SHP                      | Each draw mode is a shader variant in `ic-render`. Shadow = darkened ground sprite. Ghost = semi-transparent. Predator = distortion. Fading = remap table |
| **Player color remapping**          | Palette indices 80–95 (16 entries) are the player color remap range. The original modifies these palette entries per player                | GPU shader: sample palette, if index ∈ [80, 95] substitute from player color ramp. Same approach as OpenRA's `PlayerColorShift`                           |
| **Palette cycling**                 | Water animation: rotate palette indices periodically. Radar dish: palette-animated. From `ANIM.CPP` timing loops                           | `ic-render` system ticks palette rotation at the original frame rate. Cycling ranges are YAML-configurable per theater                                    |
| **Animation frame timing**          | Frame delays defined per sequence in original `.ini` rules (and OpenRA `sequences/*.yaml`). Not arbitrary — specific tick counts per frame | `sequences/*.yaml` in `mods/ra/` defines frame counts, delays, and facings. Timing constants verified against EA source `#define`s                        |
| **Facing quantization**             | 32 facings for vehicles/ships, 8 for infantry. SHP frame index = `facing / (256 / num_facings) * frames_per_facing`                        | `QuantizeFacings` component carries the facing count. Sprite frame index computed in render system. Matches OpenRA's `QuantizeFacingsFromSequence`        |
| **Building construction animation** | "Make" animation plays forward on build, reverse on sell. Specific frame order                                                             | `WithMakeAnimation` equivalent in `ic-render`. Frame order and timing from EA source `BUILD.CPP`                                                          |
| **Terrain theater palettes**        | Temperate, Snow, Interior — each with different palette and terrain tileset. Theater selected by map                                       | Per-map theater tag → loads matching `.pal` and terrain `.tmp` sprites. Same theater names as OpenRA                                                      |
| **Shroud / fog-of-war edges**       | Original RA: hard shroud edges. OpenRA: smooth blended edges. Remastered: smoothed                                                         | IC supports both styles via `ShroudRenderer` visual config — selectable per theme/render mode                                                             |
| **Building bibs**                   | Foundation sprites drawn under buildings (paved area)                                                                                      | Bib sprites from `.shp`, drawn at z-order below building body. Footprint from building definition                                                         |
| **Projectile sprites**              | Bullets, rockets, tesla bolts — each a separate SHP animation                                                                              | Projectile entities carry `SpriteAnimation` components. Render system draws at interpolated positions between sim ticks                                   |
| **Explosion animations**            | Multi-frame explosion sequences at impact points                                                                                           | `ExplosionEffect` spawned by combat system. `ic-render` plays the animation sequence then despawns                                                        |

#### Z-Order (Draw Order)

The draw order determines what renders on top of what. Getting this wrong makes the game look subtly broken — units clipping through buildings, shadows on top of vehicles, overlays behind walls. The canonical order (verified from original source and OpenRA):

```
Layer 0: Terrain tiles (ground)
Layer 1: Smudges (craters, scorch marks, oil stains)
Layer 2: Building bibs (paved foundations)
Layer 3: Building shadows + unit shadows
Layer 4: Buildings (sorted by Y position — southern buildings render on top)
Layer 5: Infantry (sub-cell positioned)
Layer 6: Vehicles / Ships (sorted by Y position)
Layer 7: Aircraft shadows (on ground)
Layer 8: Low-flying aircraft (sorted by Y position)
Layer 9: High-flying aircraft
Layer 10: Projectiles
Layer 11: Explosions / visual effects
Layer 12: Shroud / fog-of-war overlay
Layer 13: UI overlays (health bars, selection boxes, waypoint lines)
```

Within each layer, entities sort by Y-coordinate (south = higher draw order = renders on top). This is the standard isometric sort that prevents visual overlapping artifacts. Bevy's sprite z-ordering maps to this layer system via `Transform.translation.z`.

### Audio Fidelity Checklist

Red Alert's audio is iconic — the EVA voice, unit responses, Hell March, the tesla coil zap. Audio fidelity requires matching the original game's mixing behavior, not just playing the right files.

#### Sound Categories and Mixing

| Category                      | Priority   | Behavior                                                                                                                                     | Original RA Reference                                                                                                                           |
| ----------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **EVA voice lines**           | Highest    | Queue-based, one at a time, interrupts lower priority. "Building complete." "Unit lost." "Base under attack."                                | `AUDIO.CPP`: `Speak()` function, priority queue with cooldowns per notification type                                                            |
| **Unit voice responses**      | High       | Plays on selection and on command. Multiple selected units: random pick from group, don't overlap. "Acknowledged." "Yes sir." "Affirmative." | `AUDIO.CPP`: Voice mixing. Response set defined per unit type in rules                                                                          |
| **Weapon fire sounds**        | Normal     | Positional (spatial audio). Volume by distance from camera. Multiple simultaneous weapons don't clip — mixer clamps                          | `AUDIO.CPP`: Fire sounds tied to weapon in rules. Spatial attenuation                                                                           |
| **Impact / explosion sounds** | Normal     | Positional. Brief, one-shot.                                                                                                                 | Warhead-defined sounds in rules                                                                                                                 |
| **Ambient / environmental**   | Low        | Looping. Per-map or conditional (rain during storm weather, D022)                                                                            | Background audio layer                                                                                                                          |
| **Music**                     | Background | Sequential jukebox. Tracks play in order; player can pick from options menu. Missions can set a starting theme via scenario INI              | `THEME.CPP`: `Theme_Queue()`, theme attributes (tempo, scenario ownership). No runtime combat awareness — track list is fixed at scenario start |

**Original RA music system:** The original game's music was a straightforward sequential playlist. `THEME.CPP` manages a track list with per-theme attributes — each theme has a scenario owner (some tracks only play in certain missions) and a duration. In skirmish, the full soundtrack is available. In campaign, the scenario INI can specify a starting theme, but once playing, tracks advance sequentially and the player can pick from the jukebox in the options menu. There is no combat-detection system, no crossfades, and no dynamic intensity shifting. The Remastered Collection and OpenRA both preserve this simple jukebox model.

**IC enhancement — dynamic situational music:** While the original RA's engine didn't support dynamic music, IC's engine and SDK treat dynamic situational music as a first-class capability. Frank Klepacki designed the RA soundtrack with gameplay tempo in mind — high-energy industrial during combat, ambient tension during build-up (see `13-PHILOSOPHY.md` § Principle #11) — but the original engine didn't act on this intent. IC closes that gap at the engine level.

`ic-audio` provides three music playback modes, selectable per game module, per mission, or per mod:

```yaml
# audio/music_config.yaml
music_mode: dynamic               # "jukebox" | "sequential" | "dynamic"

# Jukebox mode (classic RA behavior):
jukebox:
  tracks: [BIGF226M, GRNDWIRE, HELLMARCH, MUDRA, JBURN_RG, TRENCHES, CC_THANG, WORKX_RG]
  order: sequential               # or "shuffle"
  loop: true

# Dynamic mode (IC engine feature — mood-tagged tracks with state-driven selection):
dynamic_playlist:
  ambient:
    tracks: [BIGF226M, MUDRA, JBURN_RG]
  build:
    tracks: [GRNDWIRE, WORKX_RG]
  combat:
    tracks: [HELLMARCH, TRENCHES, CC_THANG]
  tension:
    tracks: [RADIO2, FACE_THE_ENEMY]
  victory:
    tracks: [RREPORT]
  defeat:
    tracks: [SMSH_RG]
  crossfade_ms: 2000              # default crossfade between mood transitions
  combat_linger_s: 5              # stay in combat music 5s after last engagement
```

In dynamic mode, the engine monitors game state — active combat, base threat level, unit losses, objective progress — and crossfades between mood categories automatically. Designers tag tracks by mood; the engine handles transitions. No scripting required for basic dynamic music.

**Three layers of control** for mission/mod creators:

| Layer                     | Tool                                                                    | Capability                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **YAML configuration**    | `music_config.yaml`                                                     | Define playlists, mood tags, crossfade timing, mode selection — Tier 1 modding, no code                                       |
| **Scenario editor (SDK)** | Music Trigger + Music Playlist modules (D038)                           | Visual drag-and-drop: swap tracks on trigger activation, set dynamic playlists per mission phase, control crossfade timing    |
| **Lua scripting**         | `Media.PlayMusic()`, `Media.SetMusicPlaylist()`, `Media.SetMusicMode()` | Full programmatic control — force a specific track at a narrative beat, override mood category, hard-cut for dramatic moments |

The scenario editor's Music Playlist module (see `09-DECISIONS.md` § D038 "Dynamic Music") exposes the full dynamic system visually — a designer drags tracks into mood buckets and previews transitions without writing code. The Music Trigger module handles scripted one-shot moments ("play Hell March when the tanks breach the wall"). Both emit standard Lua that modders can extend.

The `music_mode` setting defaults to `dynamic` under the `iron_curtain` experience profile and `jukebox` under the `vanilla` profile for RA1's built-in soundtrack. Game modules and total conversions define their own default mode and mood-tagged playlists. This is Tier 1 YAML configuration — no recompilation, no Lua required for basic use.

#### Unit Voice System

Unit voice responses follow a specific pattern from the original game:

| Event                       | Voice Pool                | Original Behavior                                                                                              |
| --------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Selection** (first click) | `Select` voices           | Plays one random voice from pool. Subsequent clicks on same unit cycle through pool (don't repeat immediately) |
| **Move command**            | `Move` voices             | "Acknowledged", "Moving out", etc. One voice per command, not per selected unit                                |
| **Attack command**          | `Attack` voices           | Weapon-specific when possible. "Engaging", "Firing", etc.                                                      |
| **Harvest command**         | `Harvest` voices          | Harvester-specific responses                                                                                   |
| **Unable to comply**        | `Deny` voices             | "Can't do that", "Negative" — when order is invalid                                                            |
| **Under attack**            | `Panic` voices (infantry) | Only infantry. Played at low frequency to avoid spam                                                           |

**Implementation:** Unit voice definitions live in `mods/ra/rules/units/*.yaml` alongside other unit data:

```yaml
# In rules/units/vehicles.yaml
medium_tank:
  voices:
    select: [VEHIC1, REPORT1, YESSIR1]
    move: [ACKNO, AFFIRM1, MOVOUT1]
    attack: [AFFIRM1, YESSIR1]
    deny: [NEGAT1, CANTDO1]
  voice_interval: 200     # minimum ticks between voice responses (prevents spam)
```

### UX Fidelity Checklist

These are the interaction patterns that make RA *play* like RA. Each is a combination of input handling, visual feedback, and audio feedback.

#### Core Interaction Loop

| Interaction              | Input                             | Visual Feedback                                                                  | Audio Feedback                                                       | Source Reference                                                          |
| ------------------------ | --------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Select unit**          | Left-click on unit                | Selection box appears, health bar shows                                          | Unit voice response from `Select` pool                               | All three sources agree on this pattern                                   |
| **Box select**           | Left-click drag                   | Isometric diamond selection rectangle                                            | None (silent)                                                        | OpenRA: diamond-shaped for isometric. Original: rectangular but projected |
| **Move command**         | Right-click on ground             | Cursor changes to move cursor, then destination marker flashes briefly           | Unit voice from `Move` pool                                          | Original RA: right-click move. OpenRA: same                               |
| **Attack command**       | Right-click on enemy              | Cursor changes to attack cursor (crosshair)                                      | Unit voice from `Attack` pool                                        | Cursor context from `CursorProvider`                                      |
| **Force-fire**           | Ctrl + right-click                | Force-fire cursor (target reticle) on any location                               | Attack voice                                                         | Original RA: Ctrl modifier for force-fire                                 |
| **Force-move**           | Alt + right-click                 | Move cursor over units/buildings (crushes if able)                               | Move voice                                                           | OpenRA addition (not in original RA — QoL toggle)                         |
| **Deploy**               | Click deploy button or hotkey     | Unit plays deploy animation, transforms (e.g., MCV → Construction Yard)          | Deploy sound effect                                                  | `DEPLOY()` in original source                                             |
| **Sell building**        | Dollar-sign cursor + click        | Building plays "make" animation in reverse, then disappears. Infantry may emerge | Sell sound, "Building sold" EVA                                      | Original: reverse make animation + refund                                 |
| **Repair building**      | Wrench cursor + click             | Repair icon appears on building, health ticks up                                 | Repair sound loop                                                    | Original: consumes credits while repairing                                |
| **Place building**       | Click build-queue item when ready | Ghost outline follows cursor, green = valid, red = invalid. Click to place       | "Building" EVA on placement start, "Construction complete" on finish | Remastered: smoothest placement UX                                        |
| **Control group assign** | Ctrl + 0-9                        | Brief flash on selected units                                                    | Beep confirmation                                                    | Standard RTS convention                                                   |
| **Control group recall** | 0-9                               | Previously assigned units selected                                               | None                                                                 | Double-tap: camera centers on group                                       |

#### Sidebar System

The sidebar is the player's primary interface and the most recognizable visual element of Red Alert's UI. Three reference implementations exist:

| Element            | Original RA (1996)                             | Remastered (2020)               | OpenRA                    |
| ------------------ | ---------------------------------------------- | ------------------------------- | ------------------------- |
| **Position**       | Right side, fixed                              | Right side, resizable           | Right side (configurable) |
| **Build tabs**     | Two columns (structures/units), scroll buttons | Tabbed categories, larger icons | Tabbed, scrollable        |
| **Build progress** | Clock-wipe animation over icon                 | Progress bar + clock-wipe       | Progress bar              |
| **Power bar**      | Vertical bar, green/yellow/red                 | Same, refined styling           | Same concept              |
| **Credit display** | Top of sidebar, counts up/down                 | Same, with income rate          | Same concept              |
| **Radar minimap**  | Top of sidebar, player-colored dots            | Same, smoother rendering        | Same, click-to-scroll     |

IC's sidebar is YAML-driven (D032 themes), supporting all three styles as switchable presets. The Classic theme recreates the 1996 layout. The Remastered theme matches the modernized layout. The default IC theme takes the best elements of both.

**Credit counter animation:** The original RA doesn't jump to the new credit value — it counts up or down smoothly ($5000 → $4200 ticks down digit by digit). This is a small detail that contributes significantly to the game feel. IC replicates this with an interpolated counter in `ic-ui`.

**Build queue clock-wipe:** The clock-wipe animation (circular reveal showing build progress on the unit icon) is one of RA's most distinctive UI elements. `ic-render` implements this as a shader that masks the icon with a circular wipe driven by build progress percentage.

#### Verification Method

How we know the recreation is accurate — not "it looks about right" but "we verified against source":

| What                      | Method                                                                                                             | Tooling                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **Animation timing**      | Compare frame delay constants from EA source (`#define` values in C headers) against IC `sequences/*.yaml`         | `ic mod check` validates sequence timing against known-good values                          |
| **Palette correctness**   | Load `.pal`, apply 6-bit→8-bit conversion, compare rendered output against original game screenshot pixel-by-pixel | Automated screenshot comparison in CI (load map, render, diff against reference PNG)        |
| **Draw order**            | Render a test map with overlapping buildings, units, aircraft, shroud. Compare layer order against original/OpenRA | Visual regression test: render known scene, compare against golden screenshot               |
| **Sound mixing**          | Play multiple sound events simultaneously, verify EVA > unit voice > combat priority. Verify cooldown timing       | Automated audio event sequence tests, manual A/B listening                                  |
| **Cursor behavior**       | For each `CursorContext` (move, attack, enter, capture, etc.): hover over target, verify correct cursor appears    | Automated cursor context tests against known scenarios                                      |
| **Sidebar layout**        | Theme rendered at standard resolutions, compared against reference screenshots                                     | Screenshot tests per theme                                                                  |
| **UX sequences**          | Record a play session in original RA/OpenRA, replay the same commands in IC, compare visual/audio results          | Side-by-side video comparison (manual, community verification milestone)                    |
| **Behavioral regression** | Foreign replay import (D056): play OpenRA replays in IC, track divergence points                                   | `replay-corpus/` test harness: automated divergence detection with percentage-match scoring |

**Community verification:** Phase 3 exit criteria include "feels like Red Alert to someone who's played it before." This is subjective but critical — IC will release builds to the community for feel testing well before feature-completeness. The community IS the verification instrument for subjective fidelity.

### What Each Phase Delivers

| Phase        | Visual                                                                                                      | Audio                                                                                   | UX                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Phase 0**  | — (format parsing only)                                                                                     | — (`.aud` decoder in `ra-formats`)                                                      | —                                                                                        |
| **Phase 1**  | Terrain rendering, sprite animation, shroud, palette-aware shading, camera                                  | —                                                                                       | Camera controls only                                                                     |
| **Phase 2**  | Unit movement animation, combat VFX, projectiles, explosions, death animations                              | —                                                                                       | — (headless sim focus)                                                                   |
| **Phase 3**  | Sidebar, build queue chrome, minimap, health bars, selection boxes, cursor system, building placement ghost | EVA voice lines, unit responses, weapon sounds, ambient, music (jukebox + dynamic mode) | Full interaction loop: select, move, attack, build, sell, repair, deploy, control groups |
| **Phase 6a** | Theme switching, community visual mods                                                                      | Community audio mods                                                                    | Full QoL toggle system                                                                   |

## First Runnable — Bevy Loading Red Alert Resources

This section defines the concrete implementation path from "no code" to "a Bevy window rendering a Red Alert map with sprites on it." It spans Phase 0 (format literacy) through Phase 1 (rendering slice) and produces the project's first visible output — the milestone that proves the architecture works.

### Why This Matters

The first runnable is the "Hello World" of the engine. Until a Bevy window opens and renders actual Red Alert assets, everything is theory. This milestone:

- **Validates `ra-formats`.** Can we actually parse `.mix`, `.shp`, `.pal`, `.tmp` into usable data?
- **Validates the Bevy integration.** Can we get RA sprites into Bevy's rendering pipeline?
- **Validates the isometric math.** Can we convert grid coordinates to screen coordinates correctly?
- **Generates community interest.** "Red Alert map rendered faithfully in Rust at 4K 144fps" is the first public proof that IC is real.

### What We CAN Reference From Existing Projects

We cannot copy code from OpenRA (C#) or the Remastered Collection (proprietary C# layer), but we can study their design decisions:

| Source                        | What We Take                                                                                                               | What We Don't                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **EA Original RA (GPL)**      | Format struct layouts (MIX header, SHP frame offsets, PAL 6-bit values), LCW/RLE decompression algorithms, integer math    | Don't copy the rendering code (VGA/DirectDraw). Don't adopt the global-state architecture               |
| **Remastered (GPL C++ DLLs)** | HD asset pipeline concepts (how classic sprites map to HD equivalents), modernization approach                             | Don't reference the proprietary C# layer or HD art assets. No GUI code — it's Petroglyph's C#           |
| **OpenRA (GPL)**              | Map format, YAML rule structure, palette handling, sprite animation sequences, coordinate system conventions, cursor logic | Don't copy C# rendering code verbatim. Don't duplicate OpenRA's Chrome UI system — build native Bevy UI |
| **Bevy (MIT)**                | Sprite batching, `TextureAtlas`, asset loading, camera transforms, `wgpu` render graph, ECS patterns                       | Bevy tells us *how* to render, not *what* — gameplay feel comes from RA source code, not Bevy docs      |

### Implementation Steps

#### Step 1: `ra-formats` — Parse Everything (Weeks 1–2)

Build the `ra-formats` crate to read all Red Alert binary formats. This is pure Rust with zero Bevy dependency — a standalone library that other tools could use.

**Deliverables:**

| Parser            | Input                 | Output                                                                | Reference                                                       |
| ----------------- | --------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| **MIX archive**   | `.mix` file bytes     | File index (CRC hash → offset/size pairs), extract any file by name   | EA source `MIXFILE.CPP`: CRC hash table, two-tier (body/footer) |
| **PAL palette**   | 256 × 3 bytes         | `[u8; 768]` with 6-bit→8-bit conversion (`value << 2`)                | EA source `PAL` format, `05-FORMATS.md` § PAL                   |
| **SHP sprites**   | `.shp` file bytes     | `Vec<Frame>` with pixel data, width, height per frame. LCW/RLE decode | EA source `SHAPE.H`/`SHAPE.CPP`: `ShapeBlock_Type`, draw flags  |
| **TMP tiles**     | `.tmp` file bytes     | Terrain tile images per theater (Temperate, Snow, Interior)           | OpenRA's template definitions + EA source                       |
| **AUD audio**     | `.aud` file bytes     | PCM samples. IMA ADPCM decompression via `IndexTable`/`DiffTable`     | EA source `AUDIO.CPP`, `05-FORMATS.md` § AUD                    |
| **CLI inspector** | Any RA file or `.mix` | Human-readable dump: file list, sprite frame count, palette preview   | `ic` CLI prototype: `ic dump <file>`                            |

**Key implementation detail:** MIX archives use a CRC32 hash of the filename (uppercased) as the lookup key — there's no filename stored in the archive. `ra-formats` must include the hash function and a known-filename dictionary (from OpenRA's `global.mix` filenames list) to resolve entries by name.

**Test strategy:** Parse every `.mix` from a stock Red Alert installation. Extract every `.shp` and verify frame counts match OpenRA's `sequences/*.yaml`. Render every `.pal` as a 16×16 color grid PNG.

#### Step 2: Bevy Window + One Sprite (Week 3)

The "Hello RA" moment — a Bevy window opens and displays a single Red Alert sprite with the correct palette applied.

**What this proves:** `ra-formats` output can flow into Bevy's `Image` / `TextureAtlas` pipeline. Palette-indexed sprites render correctly on a GPU.

**Implementation:**

1. Load `conquer.mix` → extract `e1.shp` (rifle infantry) and `temperat.pal`
2. Convert SHP frames to RGBA pixels by looking up each palette index in the `.pal` → produce a Bevy `Image`
3. Build a `TextureAtlas` from the frame images (Bevy's sprite sheet system)
4. Spawn a Bevy `SpriteSheetBundle` entity and animate through the idle frames
5. Display in a Bevy window with a simple orthographic camera

**Palette handling:** At this stage, palette application happens on the CPU during asset loading (index → RGBA lookup). The GPU palette shader (for runtime player color remapping, palette cycling) comes in Phase 1 proper. CPU conversion is correct and simple — good enough for validation.

**Player color remapping:** Not needed yet. Just render with the default palette. Player colors (palette indices 80–95) are a Phase 1 concern.

#### Step 3: Load and Render an OpenRA Map (Weeks 4–5)

Parse `.oramap` files and render the terrain grid in correct isometric projection.

**What this proves:** The coordinate system works. Isometric math is correct. Theater palettes load. Terrain tiles tile without visible seams.

**Implementation:**

1. Parse `.oramap` (ZIP archive containing `map.yaml` + `map.bin`)
2. `map.yaml` defines: map size, tileset/theater, player definitions, actor placements
3. `map.bin` is the tile grid: each cell has a tile index + subtile index
4. Load the theater tileset (e.g., `temperat.mix` for Temperate) and its palette
5. For each cell in the grid, look up the terrain tile image and blit it at the correct isometric screen position

**Isometric coordinate transform:**

```
screen_x = (cell_x - cell_y) * tile_half_width
screen_y = (cell_x + cell_y) * tile_half_height
```

Where `tile_half_width = 30` and `tile_half_height = 15` for classic RA's 60×30 diamond tiles (these values come from the original source and OpenRA). This is the `CoordTransform` defined in Phase 0's architecture work.

**Tile rendering order:** Tiles render left-to-right, top-to-bottom in map coordinates. This is the standard isometric painter's algorithm. In Bevy, this translates to setting `Transform.translation.z` based on the cell's Y coordinate (higher Y = lower z = renders behind).

**Map bounds and camera:** The map defines a playable bounds rectangle within the total tile grid. Set the Bevy camera to center on the map and allow panning with arrow keys / edge scrolling. Zoom with scroll wheel.

#### Step 4: Sprites on Map + Idle Animations + Camera (Weeks 6–8)

Place unit and building sprites on the terrain grid. Animate idle loops. Implement camera controls.

**What this proves:** Sprites render at correct positions on the terrain. Z-ordering works (buildings behind units, shadows under vehicles). Animation timing matches the original game.

**Implementation:**

1. Read actor placements from `map.yaml` — each actor has a type name, cell position, and owner
2. Look up the actor's sprite sequence from `sequences/*.yaml` (or the unit rules) — this gives the `.shp` filename, frame ranges for each animation, and facing count
3. For each placed actor, create a Bevy entity with:
   - `SpriteSheetBundle` using the actor's sprite frames
   - `Transform` positioned at the isometric screen location of the actor's cell
   - Z-order based on render layer (see § "Z-Order" above) and Y-position within layer
4. Animate idle sequences: advance frames at the timing specified in the sequence definition
5. Buildings: render the "make" animation's final frame (fully built state)

**Camera system:**

| Control           | Input                    | Behavior                                                        |
| ----------------- | ------------------------ | --------------------------------------------------------------- |
| **Pan**           | Arrow keys / edge scroll | Smoothly move camera. Edge scroll activates within 10px of edge |
| **Zoom**          | Mouse scroll wheel       | Discrete zoom levels (1×, 1.5×, 2×, 3×) or smooth zoom          |
| **Center on map** | Home key                 | Reset camera to map center                                      |
| **Minimap click** | Click on minimap panel   | Camera jumps to clicked location                                |

At this stage, the minimap is a simple downscaled render of the full map — no player colors, no fog. Game-quality minimap rendering comes in Phase 3.

**Z-order validation:** Place overlapping buildings and units in a test map. Verify visually against a screenshot from OpenRA rendering the same map. The 13-layer z-order system (§ "Z-Order" above) must be correct at this step.

#### Step 5: Shroud, Fog-of-War, and Selection (Weeks 9–10)

Add the visual layers that make it feel like an actual game viewport rather than a debug renderer.

**Shroud rendering:** Unexplored areas are black. Explored-but-not-visible areas show terrain but dimmed (fog). The shroud layer renders on top of everything (z-layer 12). Shroud edges use smooth blending tiles (from the tileset) for clean boundaries. At this stage, shroud state is hardcoded (reveal a circle around the map center) — real fog computation comes in Phase 2 with `FogProvider`.

**Selection box:** Left-click-drag draws a selection rectangle. In isometric view, this is traditionally a diamond-shaped selection (rotated 45°) to match the grid orientation, though OpenRA uses a screen-aligned rectangle. IC supports both via QoL toggle (D033). Selected units show a health bar and selection bracket below them.

**Cursor system:** The cursor changes based on what it's hovering over — move cursor on ground, select cursor on own units, attack cursor on enemies. This is the `CursorContext` system. At this stage, implement the visual cursor switching; the actual order dispatch (right-click → move command) is Phase 2 sim work.

#### Step 6: Sidebar Chrome — First Game-Like Frame (Weeks 11–12)

Assemble the classic RA sidebar layout to complete the visual frame. No functionality yet — build queues don't work, credits don't tick, radar doesn't update. But the *layout* is in place.

**What this proves:** Bevy UI can reproduce the RA sidebar layout. Theme YAML (D032) drives the arrangement. The viewport resizes correctly when the sidebar is present.

**Sidebar layout (Classic theme):**

```
┌───────────────────────────────────────────┬────────────┐
│                                           │  RADAR     │
│                                           │  MINIMAP   │
│                                           ├────────────┤
│          GAME VIEWPORT                    │  CREDITS   │
│          (isometric map)                  │  $ 10000   │
│                                           ├────────────┤
│                                           │  POWER BAR │
│                                           │  ████░░░░  │
│                                           ├────────────┤
│                                           │  BUILD     │
│                                           │  QUEUE     │
│                                           │  [icons]   │
│                                           │  [icons]   │
│                                           │            │
├───────────────────────────────────────────┴────────────┤
│  STATUS BAR: selected unit info / tooltip              │
└────────────────────────────────────────────────────────┘
```

**Implementation:** Use Bevy UI (`bevy_ui`) for the sidebar layout. The sidebar is a fixed-width panel on the right. The game viewport fills the remaining space. Each sidebar section is a placeholder panel with correct sizing and positioning. The radar minimap shows the downscaled terrain render from Step 4. Build queue icons show static sprite images from the unit/building sequences.

**Theme loading:** Read a `theme.yaml` (D032) that defines: sidebar width, section heights, font, color palette, chrome sprite sheet references. At this stage, only the Classic theme exists — but the loading system is in place so future themes just swap the YAML.

### Content Detection — Finding RA Assets

Before any of the above steps can run, the engine must locate the player's Red Alert game files. IC never distributes copyrighted assets — it loads them from games the player already owns.

**Detection sources (probed at first launch):**

| Source               | Detection Method                                                                   | Priority |
| -------------------- | ---------------------------------------------------------------------------------- | -------- |
| **Steam**            | `SteamApps/common/CnCRemastered/` or `SteamApps/common/Red Alert/` via Steam paths | 1        |
| **GOG**              | Registry key or default GOG install path                                           | 2        |
| **Origin / EA App**  | Registry key for C&C Ultimate Collection                                           | 3        |
| **OpenRA**           | `~/.openra/Content/ra/` — OpenRA's own content download                            | 4        |
| **Manual directory** | Player points to a folder containing `.mix` files                                  | 5        |

If no content source is found, the first-launch flow guides the player to either install the game from a platform they own it on, or point to existing files. IC does not download game files from the internet (legal boundary).

See `05-FORMATS.md` § "Content Source Detection and Installed Asset Locations" for detailed source probing logic and the `ContentSource` enum.

### Timeline Summary

| Weeks | Step                 | Milestone                                                    | Phase Alignment |
| ----- | -------------------- | ------------------------------------------------------------ | --------------- |
| 1–2   | `ra-formats` parsers | CLI can dump any MIX/SHP/PAL/TMP/AUD file                    | Phase 0         |
| 3     | Bevy + one sprite    | Window opens, animated RA infantry on screen                 | Phase 0 → 1     |
| 4–5   | Map rendering        | Any `.oramap` renders as isometric terrain grid              | Phase 1         |
| 6–8   | Sprites + animations | Units and buildings on map, idle animations, camera controls | Phase 1         |
| 9–10  | Shroud + selection   | Fog overlay, selection box, cursor context switching         | Phase 1         |
| 11–12 | Sidebar chrome       | Classic RA layout assembled — first complete visual frame    | Phase 1         |

**Phase 0 exit:** Steps 1–2 complete (parsers + one sprite in Bevy). **Phase 1 exit:** All six steps complete — any OpenRA RA map loads and renders with sprites, animations, camera, shroud, and sidebar layout at 144fps on mid-range hardware.

After Step 6, the rendering slice is done. The next work is Phase 2: making the units actually *do* things (move, shoot, die) in a deterministic simulation. See `08-ROADMAP.md` § Phase 2.

## Crate Dependency Graph

```
ic-protocol  (shared types: PlayerOrder, TimestampedOrder)
    ↑
    ├── ic-sim      (depends on: ic-protocol, ra-formats)
    ├── ic-net      (depends on: ic-protocol; contains RelayCore library + relay-server binary)
    ├── ra-formats  (standalone — .mix, .shp, .pal, YAML)
    ├── ic-render   (depends on: ic-sim for reading state)
    ├── ic-ui       (depends on: ic-sim, ic-render; reads SQLite for player analytics — D034)
    ├── ic-audio    (depends on: ra-formats)
    ├── ic-script   (depends on: ic-sim, ic-protocol)
    ├── ic-ai       (depends on: ic-sim, ic-protocol; reads SQLite for adaptive difficulty — D034)
    ├── ic-llm      (depends on: ic-sim, ic-script, ic-protocol; reads SQLite for personalization — D034)
    ├── ic-editor   (depends on: ic-render, ic-sim, ic-ui, ic-protocol, ra-formats; SDK binary — D038+D040)
    └── ic-game     (depends on: everything above EXCEPT ic-editor)
```

**Critical boundary:** `ic-sim` never imports from `ic-net`. `ic-net` never imports from `ic-sim`. They only share `ic-protocol`. `ic-game` never imports from `ic-editor` — the game and SDK are separate binaries that share library crates.

**Storage boundary:** `ic-sim` never reads or writes SQLite (invariant #1). Three crates are read-only consumers of the client-side SQLite database: `ic-ui` (post-game stats, career page, campaign dashboard), `ic-llm` (personalized missions, adaptive briefings, coaching), `ic-ai` (difficulty scaling, counter-strategy selection). Gameplay events are written by a Bevy observer system in `ic-game`, outside the deterministic sim. See D034 in `09-DECISIONS.md`.

### Crate Design Notes

Most crates are self-explanatory from the dependency graph, but three that appear in the graph without dedicated design doc sections are detailed here.

#### `ic-audio` — Sound, Music, and EVA

`ic-audio` is a Bevy audio plugin that handles all game sound: effects, EVA voice lines, music playback, and ambient audio.

**Responsibilities:**
- **Sound effects:** Weapon fire, explosions, unit acknowledgments, UI clicks. Triggered by sim events (combat, production, movement) via Bevy observer systems.
- **EVA voice system:** Plays notification audio triggered by `notification_system()` events. Manages a priority queue — high-priority notifications (nuke launch, base under attack) interrupt low-priority ones. Respects per-notification cooldowns.
- **Music playback:** Three modes — jukebox (classic sequential/shuffle), sequential (ordered playlist), and dynamic (mood-tagged tracks with game-state-driven transitions and crossfade). Supports `.aud` (original RA format via `ra-formats`) and modern formats (OGG, WAV via Bevy). Theme-specific intro tracks (D032 — Hell March for Classic theme). Dynamic mode monitors combat, base threat, and objective state to select appropriate mood category. See § "Red Alert Experience Recreation Strategy" for full music system design and D038 in `09-DECISIONS.md` for scenario editor integration.
- **Spatial audio:** 3D positional audio for effects — explosions louder when camera is near. Uses Bevy's spatial audio with listener at `GameCamera.position` (see § "Camera System").
- **VoIP playback:** Decodes incoming Opus voice frames from `MessageLane::Voice` and mixes them into the audio output. Handles per-player volume, muting, and optional spatial panning (D059 § Spatial Audio). Voice replay playback syncs Opus frames to game ticks.
- **Ambient soundscapes:** Per-biome ambient loops (waves for coastal maps, wind for snow maps). Weather system (D022) can modify ambient tracks.

**Key types:**
```rust
pub struct AudioEvent {
    pub sound: SoundId,
    pub position: Option<WorldPos>,  // None = non-positional (UI, EVA, music)
    pub volume: f32,
    pub priority: AudioPriority,
}

pub enum AudioPriority { Ambient, Effect, Voice, EVA, Music }

pub struct Jukebox {
    pub playlist: Vec<TrackId>,
    pub current: usize,
    pub shuffle: bool,
    pub repeat: bool,
    pub crossfade_ms: u32,
}
```

**Format support:** `.aud` (IMA ADPCM, via `ra-formats` decoder), `.ogg`, `.wav`, `.mp3` (via Bevy/rodio). Audio backend is abstracted by Bevy — no platform-specific code in `ic-audio`.

**Phase:** Core audio (effects, EVA, music) in Phase 3. Spatial audio and ambient soundscapes in Phase 3-4.

#### `ic-ai` — Skirmish AI and Adaptive Difficulty

`ic-ai` provides computer opponents for skirmish and campaign, plus adaptive difficulty scaling.

**Architecture:** AI players run as Bevy systems that read visible game state and emit `PlayerOrder`s through `ic-protocol`. The sim processes AI orders identically to human orders — no special privileges. AI has no maphack by default (reads only fog-of-war-revealed state), though campaign scripts can grant omniscience for specific AI players via conditions.

**Internal structure — priority-based manager hierarchy:** The default `PersonalityDrivenAi` (D043) uses the dominant pattern found across all surveyed open-source RTS AI implementations (see `research/rts-ai-implementation-survey.md`):

```
PersonalityDrivenAi
├── EconomyManager       — harvester assignment, power monitoring, expansion timing
├── ProductionManager    — share-based unit composition, priority-queue build orders, influence-map building placement
├── MilitaryManager      — attack planning, event-driven defense, squad management
└── AiState (shared)     — threat map, resource map, scouting memory
```

Key techniques: priority-based resource allocation (from 0 A.D. Petra), share-based unit composition (from OpenRA), influence maps for building placement (from 0 A.D.), tick-gated evaluation (from Generals/Petra), fuzzy engagement logic (from OpenRA), Lanchester-inspired threat scoring (from MicroRTS research). Each manager runs on its own tick schedule — cheap decisions (defense) every tick, expensive decisions (strategic reassessment) every 60 ticks. Total amortized AI budget: <0.5ms per tick for 500 units. All AI working memory is pre-allocated in `AiScratch` (zero per-tick allocation). Full implementation detail in D043 (`09-DECISIONS.md`).

**AI tiers (YAML-configured):**

| Tier   | Behavior                                                           | Target Audience                      |
| ------ | ------------------------------------------------------------------ | ------------------------------------ |
| Easy   | Slow build, no micro, predictable attacks, doesn't rebuild         | New players, campaign intro missions |
| Normal | Standard build order, basic army composition, attacks at intervals | Average players                      |
| Hard   | Optimized build order, mixed composition, multi-prong attacks      | Experienced players                  |
| Brutal | Near-optimal macro, active micro, expansion, adapts to player      | Competitive practice                 |

**Key types:**
```rust
/// AI personality — loaded from YAML, defines behavior parameters.
pub struct AiPersonality {
    pub name: String,
    pub build_order_priority: Vec<ActorId>,  // what to build first
    pub attack_threshold: i32,               // army value before attacking
    pub aggression: i32,                     // 0-100 scale
    pub expansion_tendency: i32,             // how eagerly AI expands
    pub micro_level: MicroLevel,             // None, Basic, Advanced
    pub tech_preference: TechPreference,     // Rush, Balanced, Tech
}

pub enum MicroLevel { None, Basic, Advanced }
pub enum TechPreference { Rush, Balanced, Tech }
```

**Adaptive difficulty (D034 integration):** `ic-ai` reads the client-side SQLite database (match history, player performance metrics) to calibrate AI difficulty. If the player has lost 5 consecutive games against "Normal" AI, the AI subtly reduces its efficiency. If the player is winning easily, the AI tightens its build order. This is per-player, invisible, and optional (can be disabled in settings).

**Shellmap AI:** A stripped-down AI profile specifically for menu background battles (D032 shellmaps). Prioritizes visually dramatic behavior over efficiency — large army clashes, diverse unit compositions, no early rushes. Runs with reduced tick budget since it shares CPU with the menu UI.

```yaml
# ai/shellmap.yaml
shellmap_ai:
  personality:
    name: "Shellmap Director"
    aggression: 40
    attack_threshold: 5000     # build up large armies before engaging
    micro_level: basic
    tech_preference: balanced
    build_order_priority: [power_plant, barracks, war_factory, ore_refinery]
    dramatic_mode: true        # prefer diverse unit mixes, avoid cheese strategies
    max_tick_budget_us: 2000   # 2ms max per AI tick (shellmap is background)
```

**Lua/WASM AI mods:** Community can implement custom AI via Lua (Tier 2) or WASM (Tier 3). Custom AI implements the `AiStrategy` trait (D041) and is selectable in the lobby. The engine provides `ic-ai`'s built-in `PersonalityDrivenAi` as the default; mods can replace or extend it.

**AiStrategy Trait (D041):**

`AiPersonality` tunes parameters within a fixed decision algorithm. For modders who want to replace the algorithm entirely (neural net, GOAP planner, MCTS, scripted state machine), the `AiStrategy` trait abstracts the decision-making:

```rust
/// Game modules and mods implement this for AI opponents.
/// Default: PersonalityDrivenAi (behavior trees driven by AiPersonality YAML).
pub trait AiStrategy: Send + Sync {
    /// Called once per AI player per tick. Reads fog-filtered state, emits orders.
    fn decide(
        &mut self,
        player: PlayerId,
        view: &FogFilteredView,
        tick: u64,
    ) -> Vec<PlayerOrder>;

    /// Human-readable name for lobby display.
    fn name(&self) -> &str;

    /// Difficulty tier for UI categorization.
    fn difficulty(&self) -> AiDifficulty;

    /// Per-tick compute budget hint (microseconds). None = no limit.
    fn tick_budget_hint(&self) -> Option<u64>;
}
```

`FogFilteredView` ensures AI honesty — the AI sees only what its units see, just like a human player. Campaign scripts can grant omniscience via conditions. AI strategies are selectable in the lobby: "IC Default (Normal)", "Workshop: Neural Net v2.1", etc. See D041 in `09-DECISIONS.md` for full rationale.

**Phase:** Basic skirmish AI (Easy/Normal) in Phase 4. Hard/Brutal + adaptive difficulty in Phase 5-6a.

#### `ic-script` — Lua and WASM Mod Runtimes

`ic-script` hosts the Lua and WASM mod execution environments. It bridges the stable mod API surface to engine internals via a compatibility adapter layer.

**Architecture:**
```
  Mod code (Lua / WASM)
        │
        ▼
  ┌─────────────────────────┐
  │  Mod API Surface        │  ← versioned, stable (D024 globals, WASM host fns)
  ├─────────────────────────┤
  │  ic-script              │  ← this crate: runtime management, sandboxing, adaptation
  ├─────────────────────────┤
  │  ic-sim + ic-protocol   │  ← engine internals (can change between versions)
  └─────────────────────────┘
```

**Responsibilities:**
- **Lua runtime management:** Initializes `mlua` with deterministic seed, registers all API globals (D024), enforces `LuaExecutionLimits`, manages per-mod Lua states.
- **WASM runtime management:** Initializes `wasmtime` with fuel metering, registers WASM host functions, enforces `WasmExecutionLimits`, manages per-mod WASM instances.
- **Mod lifecycle:** Load → initialize → per-tick callbacks → unload. Mods are loaded at game start (not hot-reloaded mid-game in multiplayer — determinism).
- **Compatibility adapter:** Translates stable mod API calls to current engine internals. When engine internals change, this adapter is updated — mods don't notice. See `04-MODDING.md` § "Compatibility Adapter Layer".
- **Sandbox enforcement:** No filesystem, no network, no raw memory access. All mod I/O goes through the host API. Capability-based security per mod.
- **Campaign state:** Manages `Campaign.*` and `Var.*` state for branching campaigns (D021). Campaign variables are stored in save games.

**Key types:**
```rust
pub struct ScriptRuntime {
    pub lua_states: HashMap<ModId, LuaState>,
    pub wasm_instances: HashMap<ModId, WasmInstance>,
    pub api_version: ModApiVersion,
}

pub struct LuaState {
    pub vm: mlua::Lua,
    pub limits: LuaExecutionLimits,
    pub mod_id: ModId,
}

pub struct WasmInstance {
    pub instance: wasmtime::Instance,
    pub limits: WasmExecutionLimits,
    pub capabilities: ModCapabilities,
    pub mod_id: ModId,
}
```

**Determinism guarantee:** Both Lua and WASM execute at a fixed point in the system pipeline (`trigger_system()` step). All clients run the same mod code with the same game state at the same tick. Lua's string hash seed is fixed. `math.random()` is replaced with the sim's deterministic PRNG.

**WASM determinism nuance:** WASM execution is deterministic for integer and fixed-point operations, but the WASM spec permits non-determinism in floating-point NaN bit patterns. If a WASM mod uses `f32`/`f64` internally (which is legal — the sim's fixed-point invariant applies to `ic-sim` Rust code, not to mod-internal computation), different CPU architectures may produce different NaN payloads, causing deterministic divergence (desync). Mitigations:
- **Runtime mandate:** IC uses `wasmtime` exclusively. All clients use the same `wasmtime` version (engine-pinned). `wasmtime` canonicalizes NaN outputs for WASM arithmetic operations, which eliminates NaN bit-pattern divergence across platforms.
- **Defensive recommendation for mod authors:** Mod development docs recommend using integer/fixed-point arithmetic for any computation whose results feed back into `PlayerOrder`s or are returned to host functions. Floats are safe for mod-internal scratch computation that is consumed and discarded within the same call (e.g., heuristic scoring, weight calculations that produce an integer output).
- **Hash verification:** All clients verify the WASM binary hash (SHA-256) before game start. Combined with `wasmtime`'s NaN canonicalization and identical inputs, this provides a strong determinism guarantee — but it is not formally proven the way `ic-sim`'s integer-only invariant is. WASM mod desync is tracked as a distinct diagnosis path in the desync debugger.

**Browser builds:** Tier 3 WASM mods are desktop/server-only. The browser build (WASM target) cannot embed `wasmtime` — see `04-MODDING.md` § "Browser Build Limitation (WASM-on-WASM)" for the full analysis and future mitigation path (`wasmi` interpreter fallback).

**Phase:** Lua runtime in Phase 4. WASM runtime in Phase 4-5. Mod API versioning in Phase 6a.

## Install & Source Layout (Community-Friendly Project Structure)

The directory structure — both the shipped product and the source repository — is designed to feel immediately navigable to anyone who has worked with OpenRA. OpenRA's modding community thrived because the project was approachable: open a mod folder, find YAML rules organized by category, edit values, see results. IC preserves that muscle memory while fitting the structure to a Rust/Bevy codebase.

### Design Principles

1. **Game modules are mods.** Built-in game modules (`mods/ra/`, `mods/td/`) use the exact same directory layout, `mod.yaml` manifest, and YAML rule schema as community-created mods. No internal-only APIs, no special paths. If a modder can edit `mods/ra/rules/units/vehicles.yaml`, anyone can see how the game's own data is structured. Directly inspired by Factorio's "game is a mod" principle (validated in D018).

2. **Same vocabulary, same directories.** OpenRA uses `rules/`, `sequences/`, `chrome/`, `maps/`, `audio/`, `scripts/`. IC uses the same directory names for the same purposes. An OpenRA modder opening IC's `mods/ra/` directory knows where everything is.

3. **Separate binaries for separate roles.** Game client, dedicated server, CLI tool, and SDK editor are separate executables — like OpenRA ships `OpenRA.exe`, `OpenRA.Server.exe`, and `OpenRA.Utility.exe`. A server operator never needs the renderer. A modder using the SDK never needs the multiplayer client. Each has its own binary, sharing library crates underneath.

4. **Flat and scannable.** No deep nesting for its own sake. A modder looking at `mods/ra/` should see the high-level structure in a single `ls`. Subdirectories within `rules/` organize by category (units, structures, weapons) — the same pattern OpenRA uses.

5. **Data next to data, code next to code.** Game content (YAML, Lua, assets) lives in `mods/`. Engine code (Rust) lives in crate directories. They don't intermingle. A gameplay modder never touches Rust. A engine contributor goes straight to the crate they need.

### Install Directory (Shipped Product)

What an end user sees after installing Iron Curtain:

```
iron-curtain/
├── iron-curtain[.exe]              # Game client (ic-game binary)
├── ic-server[.exe]                 # Relay / dedicated server (ic-net binary)
├── ic[.exe]                        # CLI tool (mod, backup, export, profile, server commands)
├── ic-editor[.exe]                 # SDK: scenario editor, asset studio, campaign editor (D038+D040)
├── mods/                           # Game modules + content — the heart of the project
│   ├── common/                     # Shared resources used by all C&C-family modules
│   │   ├── mod.yaml                #   manifest (declares shared chrome, cursors, etc.)
│   │   ├── chrome/                 #   shared UI layout definitions
│   │   ├── cursors/                #   shared cursor definitions
│   │   └── translations/           #   shared localization strings
│   ├── ra/                         # Red Alert game module (ships Phase 2)
│   │   ├── mod.yaml                #   manifest — same schema as any community mod
│   │   ├── rules/                  #   unit, structure, weapon, terrain definitions
│   │   │   ├── units/              #     infantry.yaml, vehicles.yaml, naval.yaml, aircraft.yaml
│   │   │   ├── structures/         #     allied-structures.yaml, soviet-structures.yaml
│   │   │   ├── weapons/            #     ballistics.yaml, missiles.yaml, energy.yaml
│   │   │   ├── terrain/            #     temperate.yaml, snow.yaml, interior.yaml
│   │   │   └── presets/            #     balance presets: classic.yaml, openra.yaml, remastered.yaml (D019)
│   │   ├── maps/                   #   built-in maps
│   │   ├── missions/               #   campaign missions (YAML scenario + Lua triggers)
│   │   ├── sequences/              #   sprite sequence definitions (animation frames)
│   │   ├── chrome/                 #   RA-specific UI layout (sidebar, build queue)
│   │   ├── audio/                  #   music playlists, EVA definitions, voice mappings
│   │   ├── ai/                     #   AI personality profiles (D043)
│   │   ├── scripts/                #   Lua scripts (shared triggers, ability definitions)
│   │   └── themes/                 #   UI theme overrides: classic.yaml, modern.yaml (D032)
│   └── td/                         # Tiberian Dawn game module (ships Phase 3–4)
│       ├── mod.yaml
│       ├── rules/
│       ├── maps/
│       ├── missions/
│       └── ...                     #   same layout as ra/
├── LICENSE
└── THIRD-PARTY-LICENSES
```

**Key features of the install layout:**

- **`mods/common/`** is directly analogous to OpenRA's `mods/common/`. Shared assets, chrome, and cursor definitions used across all C&C-family game modules. Community game modules (Dune 2000, RA2) can depend on it or provide their own.
- **`mods/ra/`** is a mod. It uses the same `mod.yaml` schema, the same `rules/` structure, and the same `sequences/` format as a community mod. There is no "privileged" version of this directory — the engine treats it identically to `<data_dir>/mods/my-total-conversion/`. This means every modder can read the game's own data as a working example.
- **Every YAML file in `mods/ra/rules/` is editable.** Want to change tank cost? Open `rules/units/vehicles.yaml`, find `medium_tank`, change `cost: 800` to `cost: 750`. The same workflow as OpenRA — except the YAML is standard-compliant and serde-typed.
- **The CLI (`ic`) is the Swiss Army knife.** `ic mod init`, `ic mod check`, `ic mod test`, `ic mod publish`, `ic backup create`, `ic export`, `ic server validate-config`. One binary, consistent subcommands — no separate tools to discover.

### Source Repository (Contributor Layout)

What a contributor sees after cloning the repository:

```
iron-curtain/                       # Cargo workspace root
├── Cargo.toml                      # Workspace manifest — lists all crates
├── Cargo.lock
├── deny.toml                       # cargo-deny license policy (GPL-compatible deps only)
├── AGENTS.md                       # Agent instructions (this file)
├── README.md
├── LICENSE                         # GPL v3 with modding exception (D051)
├── mods/                           # Game data — YAML, Lua, assets (NOT Rust code)
│   ├── common/
│   ├── ra/
│   └── td/
├── crates/                         # All Rust crates live here
│   ├── ra-formats/                 # .mix, .shp, .pal parsers; MiniYAML converter
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── mix.rs              #   MIX archive reader
│   │       ├── shp.rs              #   SHP sprite reader
│   │       ├── pal.rs              #   PAL palette reader
│   │       ├── aud.rs              #   AUD audio decoder
│   │       ├── vqa.rs              #   VQA video decoder
│   │       ├── miniyaml.rs         #   MiniYAML parser + converter (D025)
│   │       ├── oramap.rs           #   .oramap map loader
│   │       └── mod_manifest.rs     #   OpenRA mod.yaml parser (D026)
│   ├── ic-protocol/                # Shared boundary: orders, codecs
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── orders.rs           #   PlayerOrder, TimestampedOrder
│   │       └── codec.rs            #   OrderCodec trait
│   ├── ic-sim/                     # Deterministic simulation (the core)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs              #   pub API: Simulation, step(), snapshot()
│   │       ├── components/         #   ECS components — one file per domain
│   │       │   ├── mod.rs
│   │       │   ├── health.rs       #     Health, Armor, DamageState
│   │       │   ├── mobile.rs       #     Mobile, Locomotor, Facing
│   │       │   ├── combat.rs       #     Armament, AutoTarget, Turreted, AmmoPool
│   │       │   ├── production.rs   #     Buildable, ProductionQueue, Prerequisites
│   │       │   ├── economy.rs      #     Harvester, ResourceStorage, OreField
│   │       │   ├── transport.rs    #     Cargo, Passenger, Carryall
│   │       │   ├── power.rs        #     PowerProvider, PowerConsumer
│   │       │   ├── stealth.rs      #     Cloakable, Detector
│   │       │   ├── capture.rs      #     Capturable, Captures
│   │       │   ├── veterancy.rs    #     Veterancy, Experience
│   │       │   ├── building.rs     #     Placement, Foundation, Sellable, Repairable
│   │       │   └── support.rs      #     Superweapon, Chronoshift, IronCurtain
│   │       ├── systems/            #   ECS systems — one file per simulation step
│   │       │   ├── mod.rs
│   │       │   ├── orders.rs       #     validate_orders(), apply_orders()
│   │       │   ├── movement.rs     #     movement_system() — pathfinding integration
│   │       │   ├── combat.rs       #     combat_system() — targeting, firing, damage
│   │       │   ├── production.rs   #     production_system() — build queues, prerequisites
│   │       │   ├── harvesting.rs   #     harvesting_system() — ore collection, delivery
│   │       │   ├── power.rs        #     power_system() — grid calculation
│   │       │   ├── fog.rs          #     fog_system() — delegates to FogProvider trait
│   │       │   ├── triggers.rs     #     trigger_system() — Lua/WASM script callbacks
│   │       │   ├── conditions.rs   #     condition_system() — D028 condition evaluation
│   │       │   ├── cleanup.rs      #     cleanup_system() — entity removal, state transitions
│   │       │   └── weather.rs      #     weather_system() — D022 weather state machine
│   │       ├── traits/             #   Pluggable abstractions (D041) — NOT OpenRA "traits"
│   │       │   ├── mod.rs
│   │       │   ├── pathfinder.rs   #     Pathfinder trait (D013)
│   │       │   ├── spatial.rs      #     SpatialIndex trait
│   │       │   ├── fog.rs          #     FogProvider trait
│   │       │   ├── damage.rs       #     DamageResolver trait
│   │       │   ├── validator.rs    #     OrderValidator trait (D041)
│   │       │   └── ai.rs           #     AiStrategy trait (D041)
│   │       ├── math/               #   Fixed-point arithmetic, coordinates
│   │       │   ├── mod.rs
│   │       │   ├── fixed.rs        #     Fixed-point types (i32/i64 scale — P002)
│   │       │   └── pos.rs          #     WorldPos, CellPos
│   │       ├── rules/              #   YAML rule deserialization (serde structs)
│   │       │   ├── mod.rs
│   │       │   ├── unit.rs         #     UnitDef, Buildable, DisplayInfo
│   │       │   ├── weapon.rs       #     WeaponDef, Warhead, Projectile
│   │       │   ├── alias.rs        #     OpenRA trait name alias registry (D023)
│   │       │   └── inheritance.rs  #     YAML inheritance resolver
│   │       └── snapshot.rs         #   State serialization for saves/replays/rollback
│   ├── ic-net/                     # Networking (never imports ic-sim)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── network_model.rs    #   NetworkModel trait (D006)
│   │       ├── lockstep.rs         #   LockstepNetwork implementation
│   │       ├── local.rs            #   LocalNetwork (testing, single-player)
│   │       ├── relay_core.rs       #   RelayCore library (D007)
│   │       └── bin/
│   │           └── relay.rs        #   relay-server binary entry point
│   ├── ic-render/                  # Isometric rendering (Bevy plugin)
│   ├── ic-ui/                      # Game chrome, sidebar, minimap
│   ├── ic-audio/                   # Sound, music, EVA, VoIP
│   ├── ic-script/                  # Lua + WASM mod runtimes
│   ├── ic-ai/                      # Skirmish AI, adaptive difficulty
│   ├── ic-llm/                     # LLM mission generation (optional)
│   ├── ic-editor/                  # SDK binary: scenario editor, asset studio (D038+D040)
│   └── ic-game/                    # Game binary: ties all plugins together
│       ├── Cargo.toml
│       └── src/
│           └── main.rs             #   Bevy App setup, plugin registration
├── tools/                          # Developer tools (not shipped)
│   ├── miniyaml2yaml/              #   MiniYAML → YAML batch converter CLI
│   └── replay-corpus/              #   Foreign replay regression test harness (D056)
└── tests/                          # Integration tests
    ├── sim/                        #   Deterministic sim regression tests
    └── format/                     #   File format round-trip tests
```

### Where OpenRA Contributors Find Things

An OpenRA contributor's first question is "where does this live in IC?" This table maps OpenRA's C# project structure to IC's Rust workspace:

| What you did in OpenRA            | Where in OpenRA                      | Where in IC                              | Notes                                        |
| --------------------------------- | ------------------------------------ | ---------------------------------------- | -------------------------------------------- |
| Edit unit stats (cost, HP, speed) | `mods/ra/rules/*.yaml`               | `mods/ra/rules/units/*.yaml`             | Same workflow, real YAML instead of MiniYAML |
| Edit weapon definitions           | `mods/ra/weapons/*.yaml`             | `mods/ra/rules/weapons/*.yaml`           | Nested under `rules/` for discoverability    |
| Edit sprite sequences             | `mods/ra/sequences/*.yaml`           | `mods/ra/sequences/*.yaml`               | Identical location                           |
| Write Lua mission scripts         | `mods/ra/maps/*/script.lua`          | `mods/ra/missions/*.lua`                 | Same API (D024), dedicated directory         |
| Edit UI layout (chrome)           | `mods/ra/chrome/*.yaml`              | `mods/ra/chrome/*.yaml`                  | Identical location                           |
| Edit balance/speed/settings       | `mods/ra/mod.yaml`                   | `mods/ra/rules/presets/*.yaml`           | Separated into named presets (D019)          |
| Add a new C# trait (component)    | `OpenRA.Mods.RA/Traits/*.cs`         | `crates/ic-sim/src/components/*.rs`      | Rust struct + derive instead of C# class     |
| Add a new activity (behavior)     | `OpenRA.Mods.Common/Activities/*.cs` | `crates/ic-sim/src/systems/*.rs`         | ECS system instead of activity object        |
| Add a new warhead type            | `OpenRA.Mods.Common/Warheads/*.cs`   | `crates/ic-sim/src/components/combat.rs` | Warheads are component data + system logic   |
| Add a format parser               | `OpenRA.Game/FileFormats/*.cs`       | `crates/ra-formats/src/*.rs`             | One file per format, same as OpenRA          |
| Add a Lua scripting global        | `OpenRA.Mods.Common/Scripting/*.cs`  | `crates/ic-script/src/*.rs`              | D024 API surface                             |
| Edit AI behavior                  | `OpenRA.Mods.Common/AI/*.cs`         | `crates/ic-ai/src/*.rs`                  | Priority-manager hierarchy                   |
| Edit rendering                    | `OpenRA.Game/Graphics/*.cs`          | `crates/ic-render/src/*.rs`              | Bevy render plugin                           |
| Edit server/network code          | `OpenRA.Server/*.cs`                 | `crates/ic-net/src/*.rs`                 | Never touches ic-sim                         |
| Run the utility CLI               | `OpenRA.Utility.exe`                 | `ic[.exe]`                               | `ic mod check`, `ic export`, etc.            |
| Run a dedicated server            | `OpenRA.Server.exe`                  | `ic-server[.exe]`                        | Or `ic server run` via CLI                   |

### ECS Translation: OpenRA Traits → IC Components + Systems

OpenRA merges data and behavior into "traits" (C# classes). In IC's ECS architecture, these split into **components** (data) and **systems** (behavior):

| OpenRA Trait         | IC Component(s)                  | IC System                             | File(s)                                             |
| -------------------- | -------------------------------- | ------------------------------------- | --------------------------------------------------- |
| `Health`             | `Health`, `Armor`                | `combat_system()` applies damage      | `components/health.rs`, `systems/combat.rs`         |
| `Mobile`             | `Mobile`, `Locomotor`, `Facing`  | `movement_system()` moves entities    | `components/mobile.rs`, `systems/movement.rs`       |
| `Armament`           | `Armament`, `AmmoPool`           | `combat_system()` fires weapons       | `components/combat.rs`, `systems/combat.rs`         |
| `Harvester`          | `Harvester`, `ResourceStorage`   | `harvesting_system()` gathers ore     | `components/economy.rs`, `systems/harvesting.rs`    |
| `Buildable`          | `Buildable`, `Prerequisites`     | `production_system()` manages queue   | `components/production.rs`, `systems/production.rs` |
| `Cargo`, `Passenger` | `Cargo`, `Passenger`             | `transport_system()` loads/unloads    | `components/transport.rs`                           |
| `Cloak`              | `Cloakable`, `Detector`          | `stealth_system()` updates visibility | `components/stealth.rs`                             |
| `Valued`             | Part of `Buildable` (cost field) | —                                     | `components/production.rs`                          |
| `ConditionalTrait`   | Condition system (D028)          | `condition_system()` evaluates        | `systems/conditions.rs`                             |

The naming convention follows Rust idioms (`snake_case` files, `PascalCase` types) but the organization mirrors OpenRA's categorical grouping — combat things together, economy things together, movement things together.

### Why This Layout Works for the Community

**For data modders (80% of mods):** Never leave `mods/`. Edit YAML, run `ic mod check`, see results. The built-in game modules serve as always-available, documented examples of every YAML feature. No need to read Rust code to understand what fields a unit definition supports — look at `mods/ra/rules/units/infantry.yaml`.

**For Lua scripters (missions, game modes):** Write `scripts/*.lua` in your mod directory. The API is a superset of OpenRA's (D024) — same 16 globals, same function signatures. Existing OpenRA missions run unmodified. Test with `ic mod test`.

**For engine contributors:** Clone the repo. `crates/` holds all Rust code. Each crate has a single responsibility and clear boundaries. The naming (`ic-sim`, `ic-net`, `ic-render`) tells you what it does. Within `ic-sim`, `components/` holds data, `systems/` holds logic, `traits/` holds the pluggable abstractions — the ECS split is consistent and predictable.

**For total-conversion modders:** The `ic-sim/src/traits/` directory defines every pluggable seam — custom pathfinder, custom AI, custom fog of war, custom damage resolution. Implement a trait as a WASM module (Tier 3), register it in your `mod.yaml`, and the engine uses your implementation. No forking, no C# DLL stacking.

### Development Asset Strategy

A clean-sheet engine needs art for editor chrome, UI menus, CI testing, and developer workflows — but it cannot ship or commit copyrighted game content. This subsection documents how reference projects host their game resources, what IC can freely use, and what belongs (or doesn't belong) in the repository.

#### How Reference Projects Host Game Resources

**Original Red Alert (1996):** Assets ship as `.mix` archives — flat binary containers with CRC-hashed filenames. Originally distributed on CD-ROM, later as a freeware download installer (2008). All sprites (`.shp`), terrain (`.tmp`), palettes (`.pal`), audio (`.aud`), and cutscenes (`.vqa`) are packed inside these archives. No separate asset repository — everything distributes as compiled binaries through retail channels. The freeware release means free to download and play, not free to redistribute or embed in another project.

**EA Remastered Collection (2020):** Assets distribute through Steam (and previously Origin). The HD sprite sheets, remastered music, and cutscenes are **proprietary EA content** — not covered by the GPL v3 license that applies only to the C++ engine DLLs. Resources use updated archive formats (MegV3 for TD HD, standard `.mix` for classic mode) at known Steam AppId paths. See § Content Detection for how IC locates these.

**OpenRA:** The engine **never distributes copyrighted game assets**. On first launch, a content installer detects existing game installations (Steam, Origin, GOG, disc copies) or downloads specific `.mix` files from EA's publicly accessible mirrors (the freeware releases). Assets are extracted and stored to `~/.openra/Content/ra/` (Linux) or the OS-appropriate equivalent. The OpenRA **source repository** contains only engine code (C#, GPL v3), original UI chrome art, mod rules (MiniYAML), maps, Lua scripts, and editor art — all OpenRA-created content. The few original assets (icons, cursors, fonts, panel backgrounds) are small enough for plain git. No Git LFS, no external asset hosting.

**Key pattern:** Every successful engine reimplementation project (OpenRA, CorsixTH, OpenMW, Wargus) uses the same model — engine code in the repo, game content loaded at runtime from the player's own installation. IC follows this pattern exactly.

#### Legal Boundaries — What IC Can Freely Use

| Source                                                                                                              | What's freely usable                                                                                                                                  | What's NOT usable                                                                       | License                |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------- |
| **EA Red Alert source** ([CnC_Red_Alert](https://github.com/electronicarts/CnC_Red_Alert))                          | Struct definitions, algorithms, lookup tables, gameplay constants (weapon damage, unit speeds, build times) embedded in C/C++ code                    | Zero art assets, zero sprites, zero music, zero palettes — the repo is pure source code | GPL v3                 |
| **EA Remastered source** ([CnC_Remastered_Collection](https://github.com/electronicarts/CnC_Remastered_Collection)) | C++ engine DLL source code, format definitions, bug-fixed gameplay logic                                                                              | HD sprite sheets, remastered music, Petroglyph's C# GUI layer, all visual/audio content | GPL v3 (C++ DLLs only) |
| **EA Generals source** ([CnC_Generals_Zero_Hour](https://github.com/electronicarts/CnC_Generals_Zero_Hour))         | Netcode reference, pathfinding code, gameplay system architecture                                                                                     | No art or audio assets in the repository                                                | GPL v3                 |
| **OpenRA source** ([OpenRA](https://github.com/OpenRA/OpenRA))                                                      | Engine code, UI chrome art (buttons, panels, scrollbars, dropdown frames), custom cursors, fonts, icons, map editor UI art, MiniYAML rule definitions | Nothing — all repo content is GPL v3                                                    | GPL v3                 |

**OpenRA's original chrome art** is technically GPL v3 and could be used — but IC's design explicitly creates **all theme art as original work** (D032). Copying OpenRA's chrome would create visual confusion between the two projects and contradict the design direction. Study the *patterns* (layout structure, what elements exist), create original art.

The EA GPL source repositories contain **no art assets whatsoever** — only C/C++ source code. The `.mix` archives containing actual game content (sprites, audio, palettes, terrain, cutscenes) are copyrighted EA property distributed through retail channels, even in the freeware release.

#### What Belongs in the Repository

| Asset category                                             | In repo?  | Mechanism                                           | Notes                                                      |
| ---------------------------------------------------------- | --------- | --------------------------------------------------- | ---------------------------------------------------------- |
| **EA game files** (`.mix`, `.shp`, `.aud`, `.vqa`, `.pal`) | **Never** | `ContentDetector` finds player's install at runtime | Same model as OpenRA — see § Content Detection             |
| **IC-original editor art** (toolbar icons, cursors)        | Yes       | Plain git — small files (~1-5KB each)               | ~20 icons for SDK, original creations                      |
| **YAML rules, maps, Lua scripts**                          | Yes       | Plain git — text files                              | All game content data authored by IC                       |
| **Synthetic test fixtures**                                | Yes       | Plain git — tiny hand-crafted binaries              | Minimal `.mix`/`.shp`/`.pal` (~100 bytes) for parser tests |
| **UI fonts**                                               | Yes       | Plain git — OFL/Apache licensed                     | Open fonts bundled with the engine                         |
| **Placeholder/debug sprites**                              | Yes       | Plain git — original creations                      | Colored rectangles, grid patterns, numbered circles        |
| **Large binary art** (future HD sprite packs, music)       | No        | Workshop P2P distribution (D049)                    | Community-created content                                  |
| **Demo videos, screenshots**                               | No        | External hosting, linked from docs                  | YouTube, project website                                   |

**Git LFS is not needed.** The design docs already rejected Git LFS for Workshop distribution ("1GB free then paid; designed for source code, not binary asset distribution; no P2P" — see D049). The same reasoning applies to development: IC's repository is code + YAML + design docs + small original icons. Total committed binary assets will stay well under 10MB.

**CI testing strategy:** Parser and format tests use synthetic fixtures — small, hand-crafted binary files (a 2-frame `.shp`, a trivial `.mix` with 3 files, a minimal `.pal`) committed to `tests/fixtures/`. These are original creations that exercise `ra-formats` code without containing EA content. Integration tests requiring real RA assets are gated behind an optional feature flag (`#[cfg(feature = "integration")]`) and run on CI runners where RA is installed, configured via `IC_CONTENT_DIR` environment variable.

#### Repository Asset Layout

Extending the source repository layout (see § Source Repository above):

```
iron-curtain/
├── assets/                         # IC-original assets ONLY (committed)
│   ├── editor/                     #   SDK toolbar icons, editor cursors, panel art
│   ├── ui/                         #   Menu chrome sprites, HUD elements
│   ├── fonts/                      #   Bundled open-licensed fonts
│   └── placeholder/                #   Debug sprites, test palettes, grid overlays
├── tests/
│   └── fixtures/                   #   Synthetic .mix/.shp/.pal for parser tests
├── content/                        #   *** GIT-IGNORED *** — local dev game files
│   └── ra/                         #   Developer's RA installation (pointed to or symlinked)
├── .gitignore                      #   Ignores content/, target/, *.db
└── ...
```

The `content/` directory is git-ignored. Each developer either symlinks it to their RA installation or sets `IC_CONTENT_DIR` to point elsewhere. This keeps copyrighted assets completely out of version control while giving developers a consistent local path for testing.

#### Freely-Usable Resources for Graphics, Menus & CI

IC needs original art for editor chrome, UI menus, and visual tooling. These are the recommended open-licensed sources:

**Icon libraries (for editor toolbar, SDK panels, menu items):**

| Library                                            | License              | Notes                                                                                                  |
| -------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| [Lucide](https://lucide.dev/)                      | ISC (MIT-equivalent) | 1500+ clean SVG icons. Fork of Feather Icons with active maintenance. Excellent for toolbar/menu icons |
| [Tabler Icons](https://tabler.io/icons)            | MIT                  | 5400+ SVG icons. Comprehensive coverage including RTS-relevant icons (map, layers, grid, cursor)       |
| [Material Symbols](https://fonts.google.com/icons) | Apache 2.0           | Google's icon set. Variable weight/size. Massive catalog                                               |
| [Phosphor Icons](https://phosphoricons.com/)       | MIT                  | 9000+ icons in 6 weights. Clean geometric style                                                        |

**Fonts (for UI text, editor panels, console):**

| Font                                                 | License | Notes                                                           |
| ---------------------------------------------------- | ------- | --------------------------------------------------------------- |
| [Inter](https://rsms.me/inter/)                      | OFL 1.1 | Optimized for screens. Excellent for UI text at all sizes       |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | OFL 1.1 | Monospace. Ideal for console, YAML editor, debug overlays       |
| [Noto Sans](https://fonts.google.com/noto)           | OFL 1.1 | Full Unicode coverage including CJK. Essential for localization |
| [Fira Code](https://github.com/tonsky/FiraCode)      | OFL 1.1 | Monospace with ligatures. Alternative to JetBrains Mono         |

**UI framework:**

- **egui** (MIT) — the editor's panel/widget framework. Ships with Bevy via `bevy_egui`. Provides buttons, sliders, text inputs, dropdown menus, tree views, docking, color pickers — all rendered procedurally with no external art needed. Handles 95% of SDK chrome requirements.
- **Bevy UI** — the game client's UI framework. Used for in-game chrome (sidebar, minimap, build queue) with IC-original sprite sheets styled per theme (D032).

**Game content (sprites, terrain, audio, cutscenes):**

- **Player's own RA installation** — loaded at runtime via `ContentDetector`. Every developer needs Red Alert installed locally (Steam, GOG, or freeware). This is the development workflow, not a limitation — you're building an engine for a game you play.
- **No external asset CDN.** IC does not host, mirror, or download copyrighted game files. The browser build (Phase 7) uses drag-and-drop import from the player's local files — see `05-FORMATS.md` § Browser Asset Storage.

**Placeholder art (for development before real assets load):**

During early development, before the full content detection pipeline is complete, use committed placeholder assets in `assets/placeholder/`:

- Colored rectangles (16×16, 24×24, 48×48) as unit stand-ins
- Numbered grid tiles for terrain testing
- Solid-color palette files (`.pal`-format, 768 bytes) for render pipeline testing
- Simple geometric shapes for building footprints
- Generated checkerboard patterns for missing texture fallbacks

These are all original creations — trivial to produce, zero legal risk, and immediately useful for testing the render pipeline before content detection is wired up.

## IC SDK & Editor Architecture (D038 + D040)

The IC SDK is the creative toolchain — a separate Bevy application that shares library crates with the game but ships as its own binary. Players never see editor UI. Creators download the SDK to build maps, missions, campaigns, and assets. This section covers the practical architecture: what the GUI looks like, what graphical resources it uses, how the UX flows, and how to start building it. For the full feature catalog (30+ modules, trigger system, campaign editor, dialogue trees, Game Master mode), see `09-DECISIONS.md` § D038 and D040.

### SDK Application Structure

The SDK is a single Bevy application with tabbed workspaces:

```
┌───────────────────────────────────────────────────────────────────────┐
│  IC SDK                                              [_][□][X]        │
├──────────────┬────────────────────────────────────────────────────────┤
│              │  [Scenario Editor] [Asset Studio] [Campaign Editor]    │
│  MODE PANEL  ├────────────────────────────────────────┬───────────────┤
│              │                                        │               │
│  ┌─────────┐ │         ISOMETRIC VIEWPORT             │  PROPERTIES   │
│  │Terrain  │ │                                        │  PANEL        │
│  │Entities │ │    (same ic-render as the game —       │               │
│  │Triggers │ │     live preview of actual game        │  [Name: ___]  │
│  │Waypoints│ │     rendering)                         │  [Faction: _] │
│  │Modules  │ │                                        │  [Health: __] │
│  │Regions  │ │                                        │  [Script: _]  │
│  │Scripts  │ │                                        │               │
│  │Layers   │ │                                        │               │
│  └─────────┘ │                                        │               │
│              ├────────────────────────────────────────┤               │
│              │  BOTTOM PANEL (context-sensitive)       │               │
│              │  Triggers list / Script editor / Vars  │               │
│              ├────────────────────────────────────────┴───────────────┤
│              │  STATUS BAR: cursor pos │ cell info │ complexity meter │
└──────────────┴───────────────────────────────────────────────────────┘
```

**Four main areas:**

| Area                   | Technology                 | Purpose                                                                                                       |
| ---------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Mode panel (left)**  | Bevy UI or `egui`          | Editing mode selector (8–10 modes). Stays visible at all times. Icons + labels, keyboard shortcuts            |
| **Viewport (center)**  | `ic-render` (same as game) | The isometric map view. Renders terrain, sprites, trigger areas, waypoint lines, region overlays in real time |
| **Properties (right)** | Bevy UI or `egui`          | Context-sensitive inspector. Shows attributes of the selected entity, trigger, module, or region              |
| **Bottom panel**       | Bevy UI or `egui`          | Tabbed: trigger list, script editor (with syntax highlighting), variables panel, module browser               |

### GUI Technology Choice

The SDK faces a UI technology decision that the game does not: the game's UI is a themed, styled chrome layer (D032) built for immersion, while the SDK needs a dense, professional tool UI with text fields, dropdowns, tree views, scrollable lists, and property inspectors.

**Approach: Dual UI — `ic-render` viewport + `egui` panels**

| Concern                  | Technology      | Rationale                                                                                                              |
| ------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Isometric viewport**   | `ic-render`     | Must be identical to game rendering. Uses the same Bevy render pipeline, same sprite batching, same palette shaders    |
| **Tool panels (all)**    | `egui`          | Dense inspector UI, text input, dropdowns, tree views, scrollable lists. `bevy_egui` integrates cleanly into Bevy apps |
| **Script editor**        | `egui` + custom | Syntax-highlighted Lua editor with autocompletion. `egui` text edit with custom highlighting pass                      |
| **Campaign graph**       | Custom Bevy 2D  | Node-and-edge graph rendered in a 2D Bevy viewport (not isometric). Pan/zoom like a mind map                           |
| **Asset Studio preview** | `ic-render`     | Sprite viewer, palette preview, in-context preview all use the game's rendering                                        |

**Why `egui` for tool panels:** Bevy UI (`bevy_ui`) is designed for game chrome — styled panels, themed buttons, responsive layouts. The SDK needs raw productivity UI: property grids with dozens of fields, type-ahead search in entity palettes, nested tree views for trigger folders, side-by-side diff panels. `egui` provides all of these out of the box. `bevy_egui` is a mature integration crate. The game never shows `egui` (it uses themed `bevy_ui`); the SDK uses both.

**Why `ic-render` for the viewport:** The editor viewport must show exactly what the game will show — same sprite draw modes, same z-ordering, same palette application, same shroud rendering. If the editor used a simplified renderer, creators would encounter "looks different in-game" surprises. Reusing `ic-render` eliminates this class of bugs entirely.

### What Graphical Resources the Editor Uses

The SDK does not need its own art assets for the editor chrome — it uses `egui`'s default styling (suitable for professional tools) plus the game's own assets for content preview.

| Resource Category    | Source                                                                                        | Used For                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Editor chrome**    | `egui` default dark theme (or light theme, user-selectable)                                   | All panels, menus, inspectors, tree views, buttons, text fields                             |
| **Viewport content** | Player's installed RA assets (via `ra-formats` + content detection)                           | Terrain tiles, unit/building sprites, animations — the actual game art                      |
| **Editor overlays**  | Procedurally generated or minimal bundled PNGs                                                | Trigger zone highlights (colored rectangles), waypoint markers (circles), region boundaries |
| **Entity palette**   | Sprite thumbnails extracted from game assets at load time                                     | Small preview icons in the entity browser (Garry's Mod spawn menu style)                    |
| **Mode icons**       | Bundled icon set (~20 small PNG icons, original art, CC BY-SA licensed)                       | Mode panel icons, toolbar buttons, status indicators                                        |
| **Cursor overlays**  | Bundled cursor sprites (~5 cursor states for editor: place, select, paint, erase, eyedropper) | Editor-specific cursors (distinct from game cursors)                                        |

**Key point:** The SDK ships with minimal original art — just icons and cursors for the editor UI itself. All game content (sprites, terrain, palettes, audio) comes from the player's installed games. This is the same legal model as the game: IC never distributes copyrighted assets.

**Entity palette thumbnails:** When the SDK loads a game module, it renders a small thumbnail for every placeable entity type — a 48×48 preview showing the unit's idle frame. These are cached on disk after first generation. The entity palette (left panel in Entities mode) displays these as a searchable grid, with categories, favorites, and recently-placed lists. This is the "Garry's Mod spawn menu" UX described in D038 — search-as-you-type finds any entity instantly.

### UX Flow — How a Creator Uses the Editor

#### Creating a New Scenario (5-minute orientation)

1. **Launch SDK.** Opens to a start screen: New Scenario, Open Scenario, Open Campaign, Asset Studio, Recent Files.
2. **New Scenario.** Dialog: choose map size, theater (Temperate/Snow/Interior), game module (RA1/TD/custom mod). A blank map with terrain generates.
3. **Terrain mode (default).** Terrain brush active. Paint terrain tiles by clicking and dragging. Brush sizes 1×1 to 7×7. Elevation tools if the game module supports Z. Right-click to eyedrop a tile type.
4. **Switch to Entities mode (Tab or click).** Entity palette appears in the left panel. Search for "Medium Tank" → click to select → click on map to place. Properties panel on the right shows the entity's attributes: faction, facing, stance, health, veterancy, Probability of Presence, inline script.
5. **Switch to Triggers mode.** Draw a trigger area on the map. Set condition: "Any unit of Faction A enters this area." Set action: "Reinforcements module activates" (select a preconfigured module). Set countdown timer with min/mid/max randomization.
6. **Switch to Modules mode.** Browse built-in modules (Wave Spawner, Patrol Route, Reinforcements, Objectives). Drag a module onto the map or assign it to a trigger.
7. **Press Test.** SDK launches `ic-game` with this scenario via `LocalNetwork`. Play the mission. Close game → return to editor. Iterate.
8. **Press Publish.** Exports as `.oramap`-compatible package → uploads to Workshop (D030).

#### Simple ↔ Advanced Mode

D038 defines a Simple/Advanced toggle controlling which features are visible:

| Feature                  | Simple Mode | Advanced Mode |
| ------------------------ | ----------- | ------------- |
| Terrain painting         | Yes         | Yes           |
| Entity placement         | Yes         | Yes           |
| Basic triggers           | Yes         | Yes           |
| Modules (drag-and-drop)  | Yes         | Yes           |
| Waypoints                | Yes         | Yes           |
| Probability of Presence  | —           | Yes           |
| Inline scripts           | —           | Yes           |
| Variables panel          | —           | Yes           |
| Connections              | —           | Yes           |
| Scripts panel (external) | —           | Yes           |
| Compositions             | —           | Yes           |
| Custom Lua triggers      | —           | Yes           |
| Campaign editor          | —           | Yes           |

Simple mode hides 15+ features to present a clean, approachable interface. A new creator sees: terrain tools, entity palette, basic triggers, pre-built modules, waypoints, and a Test button. That's enough to build a complete mission. Advanced mode reveals the full power. Toggle at any time — no data loss.

### Editor Viewport — What Gets Rendered

The viewport is not just a map — it renders multiple overlay layers on top of the game's normal isometric view:

```
Layer 0:   Terrain tiles (from ic-render, same as game)
Layer 1:   Grid overlay (faint lines showing cell boundaries, toggle-able)
Layer 2:   Region highlights (named regions shown as colored overlays)
Layer 3:   Trigger areas (pulsing colored boundaries with labels)
Layer 4:   Entities (buildings, units — rendered via ic-render)
Layer 5:   Waypoint markers (numbered circles with directional arrows)
Layer 6:   Connection lines (links between triggers, modules, waypoints)
Layer 7:   Entity selection highlight (selected entity's bounding box)
Layer 8:   Placement ghost (translucent preview of entity being placed)
Layer 9:   Cursor tool overlay (brush circle for terrain, snap indicator)
```

Layers 1–3 and 5–9 are editor-only overlays drawn on top of the game rendering. They use basic 2D shapes (rectangles, circles, lines, text labels) rendered via Bevy's `Gizmos` system or a simple overlay pass. No complex art assets needed — colored geometric primitives with alpha transparency.

### Asset Studio GUI

The Asset Studio is a tab within the same SDK application. Its layout differs from the scenario editor:

```
┌───────────────────────────────────────────────────────────────────────┐
│  IC SDK  — Asset Studio                                               │
├───────────────────────┬───────────────────────────┬───────────────────┤
│                       │                           │                   │
│  ASSET BROWSER        │    PREVIEW VIEWPORT       │  PROPERTIES       │
│                       │                           │                   │
│  📁 conquer.mix       │   (sprite viewer with     │  Frames: 52       │
│    ├── e1.shp         │    palette applied,        │  Width: 50        │
│    ├── 1tnk.shp       │    animation controls,     │  Height: 39       │
│    └── ...            │    zoom, frame scrub)      │  Draw mode:       │
│  📁 temperat.mix      │                           │    [Normal ▾]     │
│    └── ...            │   ◄ ▶ ⏸ ⏮ ⏭  Frame 12/52 │  Palette:         │
│  📁 local assets      │                           │    [temperat ▾]   │
│    └── my_sprite.png  │                           │  Player color:    │
│                       │                           │    [Red ▾]        │
│  🔎 Search...         │                           │                   │
├───────────────────────┴───────────────────────────┼───────────────────┤
│  TOOLS:  [Import] [Export] [Batch] [Compare]      │  In-context:      │
│                                                    │  [Preview as unit]│
└────────────────────────────────────────────────────┴───────────────────┘
```

**Three columns:** Asset browser (tree view of loaded archives + local files), preview viewport (sprite/palette/audio/video viewer), and properties panel (metadata + editing controls). The bottom row has action buttons and the "preview as unit / building / chrome" in-context buttons that render the asset on an actual map tile (using `ic-render`).

### How to Start Building the Editor

The editor bootstraps on top of the game's rendering — so the first-runnable (§ "First Runnable" above) is a prerequisite. Once the engine can load and render RA maps, the editor development follows a clear sequence:

#### Phase 6a Bootstrapping (Editor MVP)

| Step | Deliverable                      | Dependencies                                           | Effort  |
| ---- | -------------------------------- | ------------------------------------------------------ | ------- |
| 1    | SDK binary scaffold              | Bevy app + `bevy_egui`, separate from `ic-game`        | 1 week  |
| 2    | Isometric viewport (read-only)   | `ic-render` as a Bevy plugin, loads a map, pan/zoom    | 1 week  |
| 3    | Terrain painting                 | Map data structure mutation + viewport re-render       | 2 weeks |
| 4    | Entity placement + palette       | Entity list from mod YAML, spawn/delete on click       | 2 weeks |
| 5    | Properties panel                 | `egui` inspector for selected entity attributes        | 1 week  |
| 6    | Save / load (YAML + map.bin)     | Serialize map state to `.oramap`-compatible format     | 1 week  |
| 7    | Trigger system (basic)           | Area triggers, condition/action UI, countdown timers   | 3 weeks |
| 8    | Module system (built-in presets) | Wave Spawner, Patrol Route, Reinforcements, Objectives | 2 weeks |
| 9    | Waypoints + connections          | Visual waypoint markers, drag to connect               | 1 week  |
| 10   | Test button                      | Launch `ic-game` with current scenario via subprocess  | 1 week  |
| 11   | Undo/redo + autosave             | Command pattern for all editing operations             | 2 weeks |
| 12   | Workshop publish                 | `ic mod publish` integration, package scenario         | 1 week  |

**Total: ~18 weeks for a functional scenario editor MVP.** This covers the "core scenario editor" deliverable from Phase 6a — everything a creator needs to build and publish a playable mission.

#### Asset Studio Bootstrapping

The Asset Studio can be developed in parallel once `ra-formats` is mature (Phase 0):

| Step | Deliverable                 | Dependencies                                   | Effort  |
| ---- | --------------------------- | ---------------------------------------------- | ------- |
| 1    | Archive browser + file list | `ra-formats` MIX parser, `egui` tree view      | 1 week  |
| 2    | Sprite viewer with palette  | SHP→RGBA conversion, animation scrubber        | 1 week  |
| 3    | Palette viewer/editor       | Color grid display, remap tools                | 1 week  |
| 4    | Audio player                | AUD→PCM→Bevy audio playback, waveform display  | 1 week  |
| 5    | In-context preview (on map) | `ic-render` viewport showing sprite on terrain | 1 week  |
| 6    | Import pipeline (PNG → SHP) | Palette quantization, frame assembly           | 2 weeks |
| 7    | Chrome/theme designer       | 9-slice editor, live menu preview              | 3 weeks |

**Total: ~10 weeks for Asset Studio Layer 1 (browser/viewer) + Layer 2 (basic editing).** Layer 3 (LLM generation) is Phase 7.

### Do We Have Enough Information?

**Yes — the design is detailed enough to build from.** The critical path is clear:

1. **Rendering engine (§ "First Runnable")** is the prerequisite. Without `ra-formats` and `ic-render`, there's no viewport.
2. **GUI framework (`egui`)** is a known, mature Rust crate. No research needed — it has property inspectors, tree views, text editors, and all the widget types the SDK needs.
3. **Viewport rendering** reuses `ic-render` — the same code that renders the game renders the editor viewport. This eliminates the hardest rendering problem.
4. **Editor overlays** (trigger zones, waypoints, grid lines) are simple 2D shapes on top of the game render. Bevy's `Gizmos` API handles this.
5. **Data model** is defined — scenarios are YAML + `map.bin` (OpenRA-compatible format), triggers are YAML structs, modules are YAML + Lua. No new format to invent.
6. **Feature scope** is defined in D038 (every module, every trigger type, every panel). The question is NOT "what should the editor do" — that's answered. The question is "in what order do we build it" — and that's answered by the phasing table above.

**What remains open:**
- P003 (audio library choice) affects the Asset Studio's audio player but not the scenario editor
- Exact `egui` widget customization for the entity palette (search UX, thumbnail rendering) needs prototyping
- Campaign graph editor's visual layout algorithm (auto-layout for mission nodes) needs implementation experimentation
- The precise line between `bevy_ui` and `egui` usage may shift during development — start with `egui` for everything, migrate specific widgets to `bevy_ui` only if styling needs demand it

See `09-DECISIONS.md` § D038 for the full scenario editor feature catalog, and § D040 for the Asset Studio's three-layer architecture and format support tables.

## Multi-Game Extensibility (Game Modules)

The engine is designed as a **game-agnostic RTS framework** (D039) that ships with Red Alert (default) and Tiberian Dawn as built-in game modules. The same engine can run RA2, Dune 2000, or an original game as additional game modules — like OpenRA runs TD, RA, and D2K on one engine.

### Game Module Concept

A game module is a bundle of:

```rust
/// Each supported game implements this trait.
pub trait GameModule {
    /// Register ECS components (unit types, mechanics) into the world.
    fn register_components(&self, world: &mut World);

    /// Return the ordered system pipeline for this game's simulation tick.
    fn system_pipeline(&self) -> Vec<Box<dyn System>>;

    /// Provide the pathfinding implementation (selected by lobby/experience profile, D045).
    fn pathfinder(&self) -> Box<dyn Pathfinder>;

    /// Provide the spatial index implementation (spatial hash, BVH, etc.).
    fn spatial_index(&self) -> Box<dyn SpatialIndex>;

    /// Provide the fog of war implementation (radius, elevation LOS, etc.).
    fn fog_provider(&self) -> Box<dyn FogProvider>;

    /// Provide the damage resolution algorithm (standard, shield-first, etc.).
    fn damage_resolver(&self) -> Box<dyn DamageResolver>;

    /// Provide order validation logic (D041 — engine enforces this before apply_orders).
    fn order_validator(&self) -> Box<dyn OrderValidator>;

    /// Register format loaders (e.g., .vxl for RA2, .shp for RA1).
    fn register_format_loaders(&self, registry: &mut FormatRegistry);

    /// Register render backends (sprite renderer, voxel renderer, etc.).
    fn register_renderers(&self, registry: &mut RenderRegistry);

    /// List available render modes — Classic, HD, 3D, etc. (D048).
    fn render_modes(&self) -> Vec<RenderMode>;

    /// Register game-module-specific commands into the Brigadier command tree (D058).
    /// RA1 registers `/sell`, `/deploy`, `/stance`, etc. A total conversion registers
    /// its own novel commands. The engine's built-in commands (chat, help, cvars) are
    /// pre-registered before this method is called.
    fn register_commands(&self, dispatcher: &mut CommandDispatcher);

    /// YAML rule schema for this game's unit definitions.
    fn rule_schema(&self) -> RuleSchema;
}
```

**Validation from OpenRA mod ecosystem:** Analysis of six major OpenRA community mods (see `research/openra-mod-architecture-analysis.md`) confirms that every `GameModule` trait method addresses a real extension need:

- **`register_format_loaders()`** — OpenKrush (KKnD on OpenRA) required 15+ custom binary format decoders (`.blit`, `.mobd`, `.mapd`, `.lvl`, `.son`, `.vbc`) that bear no resemblance to C&C formats. TiberianDawnHD needed `RemasterSpriteSequence` for 128×128 HD tiles. Format extensibility is not optional for non-C&C games.
- **`system_pipeline()`** — OpenKrush replaced 16 complete mechanic modules (construction, production, oil economy, researching, bunkers, saboteurs, veterancy). OpenSA (Swarm Assault) added living-world systems (plant growth, creep spawners, colony capture). The pipeline cannot be fixed.
- **`render_modes()`** — TiberianDawnHD is a pure render-only mod (zero gameplay changes) that adds HD sprite rendering with content source detection (Steam AppId, Origin registry, GOG paths). Render mode extensibility enables this cleanly.
- **`pathfinder()`** — OpenSA needed `WaspLocomotor` (flying insect pathfinding); OpenRA/ra2 defines 8 locomotor types (Hover, Mech, Jumpjet, Teleport, etc). RA1's JPS + flowfield is not universal.
- **`fog_provider()` / `damage_resolver()`** — RA2 needs elevation-based LOS and shield-first damage; OpenHV needs a completely different resource flow model (Collector → Transporter → Receiver pipeline). Game-specific logic belongs in the module.
- **`register_commands()`** — RA1 registers `/sell`, `/deploy`, `/stance`, superweapon commands. A Tiberian Dawn module registers different superweapon commands. A total conversion registers entirely novel commands. The engine cannot predefine game-specific commands (D058).

### What the engine provides (game-agnostic)

| Layer           | Game-Agnostic                                                                        | Game-Module-Specific                                                              |
| --------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Sim core**    | `Simulation`, `apply_tick()`, `snapshot()`, state hashing, order validation pipeline | Components, systems, rules, resource types                                        |
| **Positions**   | `WorldPos { x, y, z }`                                                               | `CellPos` (grid-based modules), coordinate mapping, z usage                       |
| **Pathfinding** | `Pathfinder` trait, `SpatialIndex` trait                                             | Remastered/OpenRA/IC flowfield (RA1, D045), navmesh (future), spatial hash vs BVH |
| **Fog of war**  | `FogProvider` trait                                                                  | Radius fog (RA1), elevation LOS (RA2/TS), no fog (sandbox)                        |
| **Damage**      | `DamageResolver` trait                                                               | Standard pipeline (RA1), shield-first (RA2), sub-object (Generals)                |
| **Validation**  | `OrderValidator` trait (engine-enforced)                                             | Per-module validation rules (ownership, affordability, placement, etc.)           |
| **Networking**  | `NetworkModel` trait, `RelayCore` library, relay server binary, lockstep, replays    | `PlayerOrder` variants (game-specific commands)                                   |
| **Rendering**   | Camera, sprite batching, UI framework; post-FX pipeline available to modders         | Sprite renderer (RA1), voxel renderer (RA2), mesh renderer (3D mod/future)        |
| **Modding**     | YAML loader, Lua runtime, WASM sandbox, workshop                                     | Rule schemas, API surface exposed to scripts                                      |
| **Formats**     | Archive loading, format registry                                                     | `.mix`/`.shp` (RA1), `.vxl`/`.hva` (RA2), `.big`/`.w3d` (future), map format      |

### RA2 Extension Points

RA2 / Tiberian Sun would add these to the existing engine without modifying the core:

| Extension                     | What It Adds                                           | Engine Change Required                                |
| ----------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Voxel models (`.vxl`, `.hva`) | New format parsers                                     | None — additive to `ra-formats`                       |
| Terrain elevation             | Z-axis in pathfinding, ramps, cliffs                   | None — `WorldPos.z` and `CellPos.z` are already there |
| Voxel rendering               | GPU voxel-to-sprite at runtime                         | New render backend in `RenderRegistry`                |
| Garrison mechanic             | `Garrisonable`, `Garrisoned` components + system       | New components + system in pipeline                   |
| Mind control                  | `MindController`, `MindControlled` components + system | New components + system in pipeline                   |
| IFV weapon swap               | `WeaponOverride` component                             | New component                                         |
| Prism forwarding              | `PrismForwarder` component + chain calculation system  | New component + system                                |
| Bridges / tunnels             | Layered pathing with Z transitions                     | Uses existing `CellPos.z`                             |

### Current Target: The Isometric C&C Family

The **first-party game modules** target the **isometric C&C family**: Red Alert, Red Alert 2, Tiberian Sun, Tiberian Dawn, and Dune 2000 (plus expansions and total conversions in the same visual paradigm). These games share:

- Fixed isometric camera
- Grid-based terrain (with optional elevation for TS/RA2)
- Sprite and/or voxel-to-sprite rendering
- `.mix` archives and related format lineage
- Discrete cell-based pathfinding (flowfields, hierarchical A*)

### Architectural Openness: Beyond Isometric

C&C Generals and later 3D titles (C&C3, RA3) are **not current targets** — we build only grid-based pathfinding and isometric rendering today. But the architecture deliberately avoids closing doors:

| Engine Concern     | Grid Assumption?   | Trait-Abstracted?             | 3D/Continuous Game Needs...                                         |
| ------------------ | ------------------ | ----------------------------- | ------------------------------------------------------------------- |
| Coordinates        | No (`WorldPos`)    | N/A — universal               | Nothing. `WorldPos` works for any spatial model.                    |
| Pathfinding        | Implementation     | Yes (`Pathfinder` trait)      | A `NavmeshPathfinder` impl. Zero sim changes.                       |
| Spatial queries    | Implementation     | Yes (`SpatialIndex` trait)    | A `BvhSpatialIndex` impl. Zero combat/targeting changes.            |
| Fog of war         | Implementation     | Yes (`FogProvider` trait)     | An `ElevationFogProvider` impl. Zero sim changes.                   |
| Damage resolution  | Implementation     | Yes (`DamageResolver` trait)  | A `SubObjectDamageResolver` impl. Zero projectile changes.          |
| Order validation   | Implementation     | Yes (`OrderValidator` trait)  | Module-specific rules. Engine still enforces the contract.          |
| AI strategy        | Implementation     | Yes (`AiStrategy` trait)      | Module-specific AI. Same lobby selection UI.                        |
| Rendering          | Implementation     | Yes (`Renderable` trait)      | A mesh renderer impl. Already documented ("3D Rendering as a Mod"). |
| Camera             | Implementation     | Yes (`ScreenToWorld` trait)   | A perspective camera impl. Already documented.                      |
| Input              | No (`InputSource`) | Yes                           | Nothing. Orders are orders.                                         |
| Networking         | No                 | Yes (`NetworkModel` trait)    | Nothing. Lockstep works regardless of spatial model.                |
| Format loaders     | Implementation     | Yes (`FormatRegistry`)        | New parsers for `.big`, `.w3d`, etc. Additive.                      |
| Building placement | Data-driven        | N/A — YAML rules + components | Different components (no `RequiresBuildableArea`). YAML change.     |

The key insight: the engine core (`Simulation`, `apply_tick()`, `GameLoop`, `NetworkModel`, `Pathfinder`, `SpatialIndex`, `FogProvider`, `DamageResolver`, `OrderValidator`) is spatial-model-agnostic. Grid-based pathfinding is a *game module implementation*, not an engine assumption — the same way `LocalNetwork` is a network implementation, not the only possible one.

A Generals-class game module would provide its own `Pathfinder` (navmesh), `SpatialIndex` (BVH), `FogProvider` (elevation LOS), `DamageResolver` (sub-object targeting), `AiStrategy` (custom AI), `Renderable` (mesh), and format loaders — while reusing the sim core, networking, modding infrastructure, workshop, competitive infrastructure, and all shared systems (production, veterancy, replays, save games). See D041 in `09-DECISIONS.md` for the full trait-abstraction strategy.

This is not a current development target. We build only the grid implementations. But the trait seams exist from day one, so the door stays open — for us or for the community.

### 3D Rendering as a Mod (Not a Game Module)

While 3D C&C titles are not current development targets, the architecture explicitly supports **3D rendering mods** for any game module. A "3D Red Alert" mod replaces the visual presentation while the simulation, networking, pathfinding, and rules are completely unchanged.

This works because the sim/render split is absolute — the sim has no concept of camera, sprites, or visual style. Bevy already ships a full 3D pipeline (PBR materials, GLTF loading, skeletal animation, dynamic lighting, shadows), so a 3D render mod leverages existing infrastructure.

**What changes vs. what doesn't:**

| Layer         | 3D Mod Changes? | Details                                                                                                                                                               |
| ------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simulation    | No              | Same tick, same rules, same grid                                                                                                                                      |
| Pathfinding   | No              | Grid-based flowfields still work (SC2 is 3D but uses grid pathing). A future game module could provide a `NavmeshPathfinder` instead — independent of the render mod. |
| Networking    | No              | Orders are orders                                                                                                                                                     |
| Rules / YAML  | No              | Tank still costs 800, has 400 HP                                                                                                                                      |
| Rendering     | Yes             | Sprites → GLTF meshes, isometric camera → free 3D camera                                                                                                              |
| Input mapping | Yes             | Click-to-world changes from isometric transform to 3D raycast                                                                                                         |

**Architectural requirements to enable this:**

1. **`Renderable` trait is mod-swappable.** A WASM Tier 3 mod can register a 3D render backend that replaces the default sprite renderer.
2. **Camera system is configurable.** Default is fixed isometric; a 3D mod substitutes a free-rotating perspective camera. The camera is purely a render concern — the sim has no camera concept.
3. **Asset pipeline accepts 3D models.** Bevy natively loads GLTF/GLB. The mod maps unit IDs to 3D model paths in YAML:

```yaml
# Classic 2D (default)
rifle_infantry:
  render:
    type: sprite
    sequences: e1

# 3D mod override
rifle_infantry:
  render:
    type: mesh
    model: models/infantry/rifle.glb
    animations:
      idle: Idle
      move: Run
      attack: Shoot
```

4. **Click-to-world abstracted behind trait.** Isometric screen→world is a linear transform. 3D perspective screen→world is a raycast. Both produce a `WorldPos`. Grid-based game modules convert to `CellPos` as needed.
5. **Terrain rendering decoupled from terrain data.** The sim's spatial representation is authoritative. A 3D mod provides visual terrain geometry that matches it.

**Key benefits:**
- **Cross-view multiplayer.** A player running 3D can play against a player running classic isometric — the sim is identical. Like StarCraft Remastered's graphics toggle, but more radical.
- **Cross-view replays.** Watch any replay in 2D or 3D.
- **Orthogonal to gameplay mods.** A balance mod works in both views. A 3D graphics mod stacks with a gameplay mod.
- **Toggleable, not permanent.** D048 (Switchable Render Modes) formalizes this: a 3D render mod adds a render mode alongside the default 2D modes. F1 cycles between classic, HD, and 3D — the player isn't locked into one view. See `09-DECISIONS.md` § D048.

This is a **Tier 3 (WASM) mod** — it replaces a rendering backend, which is too deep for YAML or Lua. See `04-MODDING.md` for details.

### Design Rules for Multi-Game Safety

1. **No game-specific enums in engine core.** Don't put `enum ResourceType { Ore, Gems }` in `ic-sim`. Resource types come from YAML rules / game module registration.
2. **Position is always 3D.** `WorldPos` carries Z. RA1 sets it to 0. The cost is one extra `i32` per position — negligible. `CellPos` is a grid-game-module convenience type, not an engine-core requirement.
3. **Pathfinding and spatial queries are behind traits.** `Pathfinder` and `SpatialIndex` — like `NetworkModel`. Grid implementations are the default; the engine core never calls grid-specific functions directly.
4. **System pipeline is data, not code.** The game module returns its system list; the engine executes it. No hardcoded `harvester_system()` call in engine core.
5. **Render through `Renderable` trait.** Sprites and voxels implement the same trait. The renderer doesn't know what it's drawing.
6. **Format loaders are pluggable.** `ra-formats` provides parsers; the game module tells the asset pipeline which ones to use.
7. **`PlayerOrder` is extensible.** Use an enum with a `Custom(GameSpecificOrder)` variant, or make orders generic over the game module.
8. **Fog, damage, and validation are behind traits (D041).** `FogProvider`, `DamageResolver`, and `OrderValidator` — each game module supplies its own implementation. The engine core calls trait methods, never game-specific fog/damage/validation logic directly.
9. **AI strategy is behind a trait (D041).** `AiStrategy` lets each game module (or difficulty preset) supply different decision-making logic. The engine schedules AI ticks; the strategy decides what to do.
