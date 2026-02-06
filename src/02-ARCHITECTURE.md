# 02 — Core Architecture

## Decision: No Bevy

**Rationale:**
- Bevy is pre-1.0 with frequent breaking changes — building on shifting ground
- 2D isometric RTS is not its sweet spot
- Would require building tile rendering, sprite layering, RTS UI, networking from scratch on top of Bevy anyway
- Would fight two architectures simultaneously (Bevy's paradigms + OpenRA's game concepts)
- Bevy's UI (`bevy_ui`) is nowhere near what an RTS HUD needs

**Instead: Library-based stack**

| Concern     | Library               | Rationale                                                         |
| ----------- | --------------------- | ----------------------------------------------------------------- |
| Windowing   | `winit`               | Standard, stable, cross-platform                                  |
| Rendering   | `wgpu`                | Low-level control for isometric sprite engine, WebGPU for browser |
| ECS         | `hecs` or `shipyard`  | Lightweight, or custom trait system mirroring OpenRA semantics    |
| Dev tools   | `egui`                | Immediate-mode debug overlays                                     |
| Game UI     | Custom on `wgpu`      | C&C sidebar too specific for generic UI libs                      |
| Scripting   | `mlua`                | Lua embedding                                                     |
| Mod runtime | `wasmtime` / `wasmer` | WASM sandboxed execution                                          |

## Simulation / Render Split (Critical Architecture)

The simulation and renderer are completely decoupled from day one.

```
┌─────────────────────────────────────────────┐
│                  GameLoop<N>                 │
│                                             │
│  Input → Network → Sim (fixed tick) → Render│
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
- **Snapshottable:** Full state serializable for replays, save games, desync debugging, rollback
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

/// Cell position on the grid — also 3D-aware.
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

    /// Snapshot for rollback / desync debugging / save games
    pub fn snapshot(&self) -> SimSnapshot { /* serialize everything */ }
    pub fn restore(&mut self, snap: &SimSnapshot) { /* deserialize */ }

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

### Component Model (mirrors OpenRA Traits)

OpenRA's "traits" are effectively components. Map them directly. The table below shows the **RA1 game module's** default components. Other game modules (RA2, TD) register additional components — the ECS is open for extension without modifying the engine core.

| OpenRA Trait | ECS Component | Purpose |
| `Health` | `Health { current: i32, max: i32 }` | Hit points |
| `Mobile` | `Mobile { speed: i32, locomotor: LocomotorType }` | Can move |
| `Attackable` | `Attackable { armor: ArmorType }` | Can be damaged |
| `Armament` | `Armament { weapon: WeaponId, cooldown: u32 }` | Can attack |
| `Building` | `Building { footprint: Vec<CellPos> }` | Occupies cells |
| `Buildable` | `Buildable { cost: i32, time: u32, prereqs: Vec<StructId> }` | Can be built |
| `Selectable` | `Selectable { bounds: Rect, priority: u8 }` | Player can select |
| `Harvester` | `Harvester { capacity: i32, resource: ResourceType }` | Gathers ore |
| `Producible` | `Producible { queue: QueueType }` | Produced from building |

### System Execution Order (deterministic, configurable per game module)

The **RA1 game module** registers this system execution order:

```
Per tick:
  1. apply_orders()        — Process all player commands
  2. production_system()   — Advance build queues
  3. harvester_system()    — Gather/deliver resources
  4. movement_system()     — Move all mobile entities
  5. combat_system()       — Resolve attacks, apply damage
  6. death_system()        — Remove destroyed entities
  7. trigger_system()      — Check mission/map triggers
  8. fog_system()          — Update visibility
```

Order is fixed *per game module* and documented. Changing it changes gameplay and breaks replay compatibility.

A different game module (e.g., RA2) can insert additional systems (garrison, mind control, prism forwarding) at defined points. The engine runs whatever systems the active game module registers, in the order it specifies. The engine itself doesn't know which game is running — it just executes the registered system pipeline deterministically.

## Game Loop

```rust
pub struct GameLoop<N: NetworkModel> {
    sim: Simulation,
    renderer: Renderer,
    network: N,
    input: InputHandler,
    local_player: PlayerId,
}

impl<N: NetworkModel> GameLoop<N> {
    fn frame(&mut self) {
        // 1. Gather local input with sub-tick timestamps
        for order in self.input.drain_orders() {
            self.network.submit_order(TimestampedOrder {
                player: self.local_player,
                order,
                sub_tick_time: self.frame_time_within_tick(),
            });
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

**Key property:** `GameLoop` is generic over `N: NetworkModel`. It has zero knowledge of whether it's running single-player, lockstep multiplayer, rollback, or cross-engine play. This is the central architectural guarantee.

## Pathfinding

**Decision:** Hierarchical A* or flowfields — leap ahead of OpenRA's basic A*.

OpenRA uses standard A* which struggles with large unit groups. Hierarchical pathfinding or flowfields handle mass unit movement far better and are well-suited to the grid-based terrain.

## Crate Dependency Graph

```
ra-protocol  (shared types: PlayerOrder, TimestampedOrder)
    ↑
    ├── ra-sim      (depends on: ra-protocol, ra-formats)
    ├── ra-net      (depends on: ra-protocol)
    ├── ra-formats  (standalone — .mix, .shp, .pal, YAML)
    ├── ra-render   (depends on: ra-sim for reading state)
    ├── ra-ui       (depends on: ra-sim, ra-render)
    ├── ra-audio    (depends on: ra-formats)
    ├── ra-script   (depends on: ra-sim, ra-protocol)
    ├── ra-ai       (depends on: ra-sim, ra-protocol)
    └── ra-engine   (depends on: everything above)
```

**Critical boundary:** `ra-sim` never imports from `ra-net`. `ra-net` never imports from `ra-sim`. They only share `ra-protocol`.

## Multi-Game Extensibility (Game Modules)

The engine is designed as a **game-agnostic RTS framework** with Red Alert as the first game module. The same engine should be able to run RA2, Tiberian Dawn, Dune 2000, or an original game as a different game module — like OpenRA runs TD, RA, and D2K on one engine.

### Game Module Concept

A game module is a bundle of:

```rust
/// Each supported game implements this trait.
pub trait GameModule {
    /// Register ECS components (unit types, mechanics) into the world.
    fn register_components(&self, world: &mut World);

    /// Return the ordered system pipeline for this game's simulation tick.
    fn system_pipeline(&self) -> Vec<Box<dyn System>>;

    /// Register format loaders (e.g., .vxl for RA2, .shp for RA1).
    fn register_format_loaders(&self, registry: &mut FormatRegistry);

    /// Register render backends (sprite renderer, voxel renderer, etc.).
    fn register_renderers(&self, registry: &mut RenderRegistry);

    /// YAML rule schema for this game's unit definitions.
    fn rule_schema(&self) -> RuleSchema;
}
```

### What the engine provides (game-agnostic)

| Layer          | Game-Agnostic                                                                        | Game-Module-Specific                                           |
| -------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| **Sim core**   | `Simulation`, `apply_tick()`, `snapshot()`, state hashing, order validation pipeline | Components, systems, rules, resource types                     |
| **Positions**  | `WorldPos { x, y, z }`, `CellPos { x, y, z }`, pathfinding grid                      | Whether Z is used (RA1: flat, RA2: elevation)                  |
| **Networking** | `NetworkModel` trait, relay server, lockstep, replays                                | `PlayerOrder` variants (game-specific commands)                |
| **Rendering**  | Camera, sprite batching, post-FX pipeline, UI framework                              | Sprite renderer (RA1), voxel renderer (RA2), terrain elevation |
| **Modding**    | YAML loader, Lua runtime, WASM sandbox, workshop                                     | Rule schemas, API surface exposed to scripts                   |
| **Formats**    | `.mix` parser, archive loading                                                       | `.shp` variant (RA1), `.vxl`/`.hva` (RA2), map format          |

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

### Design Rules for Multi-Game Safety

1. **No game-specific enums in engine core.** Don't put `enum ResourceType { Ore, Gems }` in `ra-sim`. Resource types come from YAML rules / game module registration.
2. **Position is always 3D.** `WorldPos` and `CellPos` carry Z. RA1 sets it to 0. The cost is one extra `i32` per position — negligible.
3. **System pipeline is data, not code.** The game module returns its system list; the engine executes it. No hardcoded `harvester_system()` call in engine core.
4. **Render through `Renderable` trait.** Sprites and voxels implement the same trait. The renderer doesn't know what it's drawing.
5. **Format loaders are pluggable.** `ra-formats` provides parsers; the game module tells the asset pipeline which ones to use.
6. **`PlayerOrder` is extensible.** Use an enum with a `Custom(GameSpecificOrder)` variant, or make orders generic over the game module.
