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
pub struct VersusTable {
    pub modifiers: HashMap<ArmorType, i32>,
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
pub struct NotificationCooldowns {
    pub cooldowns: HashMap<NotificationType, u32>,  // ticks remaining
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
    pub follow_player: Option<PlayerId>,  // lock camera to player's view
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
- **Loading → InGame:** All assets loaded, `NetworkModel` connected, sim initialized
- **InGame → GameEnded:** Victory/defeat condition met or player surrenders
- **GameEnded → InMenus:** Return to main menu (post-game stats shown during transition)
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

See `09-DECISIONS.md` § D033 for the full toggle catalog, YAML schema, and sim/client split details. See D043 for AI behavior presets, D045 for pathfinding behavior presets, and D048 for switchable render modes.

## Crate Dependency Graph

```
ic-protocol  (shared types: PlayerOrder, TimestampedOrder)
    ↑
    ├── ic-sim      (depends on: ic-protocol, ra-formats)
    ├── ic-net      (depends on: ic-protocol)
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
- **Music playback:** Jukebox system with playlist management, track shuffle, and cross-fade. Supports `.aud` (original RA format via `ra-formats`) and modern formats (OGG, WAV via Bevy). Theme-specific intro tracks (D032 — Hell March for Classic theme).
- **Spatial audio:** 3D positional audio for effects — explosions louder when camera is near. Uses Bevy's spatial audio with listener at camera position.
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

**Determinism guarantee:** Both Lua and WASM execute at a fixed point in the system pipeline (`trigger_system()` step). All clients run the same mod code with the same game state at the same tick. Lua's string hash seed is fixed. WASM is inherently deterministic. `math.random()` is replaced with the sim's deterministic PRNG.

**Phase:** Lua runtime in Phase 4. WASM runtime in Phase 4-5. Mod API versioning in Phase 6a.

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

### What the engine provides (game-agnostic)

| Layer           | Game-Agnostic                                                                        | Game-Module-Specific                                                              |
| --------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Sim core**    | `Simulation`, `apply_tick()`, `snapshot()`, state hashing, order validation pipeline | Components, systems, rules, resource types                                        |
| **Positions**   | `WorldPos { x, y, z }`                                                               | `CellPos` (grid-based modules), coordinate mapping, z usage                       |
| **Pathfinding** | `Pathfinder` trait, `SpatialIndex` trait                                             | Remastered/OpenRA/IC flowfield (RA1, D045), navmesh (future), spatial hash vs BVH |
| **Fog of war**  | `FogProvider` trait                                                                  | Radius fog (RA1), elevation LOS (RA2/TS), no fog (sandbox)                        |
| **Damage**      | `DamageResolver` trait                                                               | Standard pipeline (RA1), shield-first (RA2), sub-object (Generals)                |
| **Validation**  | `OrderValidator` trait (engine-enforced)                                             | Per-module validation rules (ownership, affordability, placement, etc.)           |
| **Networking**  | `NetworkModel` trait, relay server, lockstep, replays                                | `PlayerOrder` variants (game-specific commands)                                   |
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
