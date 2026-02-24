# 02 — Core Architecture

**Keywords:** architecture, crate boundaries, `ic-sim`, `ic-net`, `ic-protocol`, `GameLoop<N, I>`, `NetworkModel`, `InputSource`, deterministic simulation, Bevy, platform-agnostic design, game modules

## Decision: Bevy

**Rationale (revised — see D002 in `decisions/09a-foundation.md`):**
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

RA1 registers `RadiusFogProvider` (circle-based, fast, matches original RA). RA2/TS would register `ElevationFogProvider` (raycasts against terrain heightmap). A deferred fog-authoritative `NetworkModel` variant (not part of `M1-M4`; see multiplayer trust/productization milestones) reuses the same trait on the server side to determine which entities to send per client. See D041 in `decisions/09d-gameplay.md` for full rationale.

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

RA1 registers `StandardOrderValidator` (ownership, affordability, prerequisites, placement, rate limits). See D041 in `decisions/09d-gameplay.md` for full design and `GameModule` trait integration.

## Extended Gameplay Systems (RA1 Module)

> **Moved to [architecture/gameplay-systems.md](architecture/gameplay-systems.md)** for RAG/context efficiency.
>
> The 9 core components above cover the skeleton. A playable Red Alert requires ~50 components and ~20 systems  power, construction, production, harvesting, combat, fog of war, shroud, crates, veterancy, carriers, mind control, iron curtain, chronosphere, and more.


---

## Architecture Sub-Pages

| Topic | File |
|-------|------|
| Extended Gameplay Systems (RA1) | [gameplay-systems.md](architecture/gameplay-systems.md) |
| Game Loop | [game-loop.md](architecture/game-loop.md) |
| State Recording & Replay Infrastructure | [state-recording.md](architecture/state-recording.md) |
| Pathfinding & Spatial Queries | [pathfinding.md](architecture/pathfinding.md) |
| Platform Portability | [platform-portability.md](architecture/platform-portability.md) |
| UI Theme System (D032) | [ui-theme.md](architecture/ui-theme.md) |
| QoL & Gameplay Behavior Toggles (D033) | [qol-toggles.md](architecture/qol-toggles.md) |
| Red Alert Experience Recreation Strategy | [ra-experience.md](architecture/ra-experience.md) |
| First Runnable — Bevy Loading Red Alert Resources | [first-runnable.md](architecture/first-runnable.md) |
| Crate Dependency Graph | [crate-graph.md](architecture/crate-graph.md) |
| Install & Source Layout | [install-layout.md](architecture/install-layout.md) |
| IC SDK & Editor Architecture (D038 + D040) | [sdk-editor.md](architecture/sdk-editor.md) |
| Multi-Game Extensibility (Game Modules) | [multi-game.md](architecture/multi-game.md) |
| Type-Safety Architectural Invariants | [type-safety.md](architecture/type-safety.md) |
