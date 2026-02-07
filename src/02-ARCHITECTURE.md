# 02 — Core Architecture

## Decision: Bevy

**Rationale (revised — see D002 in `src/09-DECISIONS.md`):**
- ECS *is* our architecture — Bevy gives it to us with scheduling, queries, and parallel system execution out of the box
- Saves 2–4 months of engine plumbing (windowing, asset pipeline, audio, rendering scaffolding)
- Plugin system maps naturally to pluggable networking (`NetworkModel` as a Bevy plugin)
- Bevy's 2D + 3D rendering pipeline covers both classic isometric sprites and future 3D mods
- `wgpu` is Bevy's backend — we still get low-level control via custom render passes where profiling justifies it
- Breaking API changes are manageable: pin Bevy version per development phase, upgrade between phases

**Bevy provides:**

| Concern     | Bevy Subsystem         | Notes                                                   |
| ----------- | ---------------------- | ------------------------------------------------------- |
| Windowing   | `bevy_winit`           | Cross-platform, handles lifecycle events                |
| Rendering   | `bevy_render` + `wgpu` | Custom isometric sprite passes + standard 3D pipeline   |
| ECS         | `bevy_ecs`             | Archetypes, system scheduling, change detection         |
| Asset I/O   | `bevy_asset`           | Hot-reloading, platform-agnostic (WASM/mobile-safe)     |
| Audio       | `bevy_audio`           | Platform-routed; `ra-audio` wraps for .aud/.ogg/EVA     |
| Dev tools   | `egui` via `bevy_egui` | Immediate-mode debug overlays                           |
| Scripting   | `mlua` (Bevy resource) | Lua embedding, integrated as non-send resource          |
| Mod runtime | `wasmtime` / `wasmer`  | WASM sandboxed execution (Bevy system, not Bevy plugin) |

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

**OpenRA vocabulary compatibility (D023):** OpenRA trait names are accepted as YAML aliases. `Armament` and `combat` both resolve to the same component. This means existing OpenRA YAML definitions load without renaming.

**Canonical enum names (D027):** Locomotor types (`Foot`, `Wheeled`, `Tracked`, `Float`, `Fly`), armor types (`None`, `Light`, `Medium`, `Heavy`, `Wood`, `Concrete`), target types, damage states, and stances match OpenRA's names exactly. Versus tables and weapon definitions copy-paste without translation.

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
pub struct GameLoop<N: NetworkModel, I: InputSource> {
    sim: Simulation,
    renderer: Renderer,
    network: N,
    input: I,
    local_player: PlayerId,
}

impl<N: NetworkModel, I: InputSource> GameLoop<N, I> {
    fn frame(&mut self) {
        // 1. Gather local input with sub-tick timestamps
        for order in self.input.drain_orders() {
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

## Pathfinding

**Decision:** Hierarchical A* or flowfields — leap ahead of OpenRA's basic A*.

OpenRA uses standard A* which struggles with large unit groups. Hierarchical pathfinding or flowfields handle mass unit movement far better and are well-suited to the grid-based terrain.

## Platform Portability

The engine must not create obstacles for any platform. Desktop is the primary dev target, but every architectural choice must be portable to browser (WASM), mobile (Android/iOS), and consoles without rework.

### Portability Design Rules

1. **Input is abstracted behind a trait.** `InputSource` produces `PlayerOrder`s — it knows nothing about mice, keyboards, touchscreens, or gamepads. The game loop consumes orders, not raw input events. Each platform provides its own `InputSource` implementation.

2. **UI layout is responsive.** No hardcoded pixel positions. The sidebar, minimap, and build queue use constraint-based layout that adapts to screen size and aspect ratio. Mobile/tablet may use a completely different layout (bottom bar instead of sidebar). `ra-ui` provides layout *profiles*, not a single fixed layout.

3. **Click-to-world is abstracted behind a trait.** Isometric screen→cell (desktop), touch→cell (mobile), and raycast→cell (3D mod) all implement the same `ScreenToWorld` trait, producing a `CellPos`. No isometric math hardcoded in the game loop.

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
    fn drain_orders(&mut self) -> Vec<TimestampedOrder>;

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

`ra-ui` reads `InputCapabilities` to choose the appropriate layout profile. The sim never sees any of this.

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

| Theme | Aesthetic | Inspired By |
| --- | --- | --- |
| Classic | Military minimalism — bare buttons, static title screen, Soviet palette | Original RA1 (1996) |
| Remastered | Clean modern military — HD panels, sleek chrome, reverent refinement | Remastered Collection (2020) |
| Modern | Full Bevy UI — dynamic panels, animated transitions, modern game launcher feel | IC's own design |

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

### Scope Boundary: The Isometric C&C Family

Multi-game extensibility targets the **isometric C&C family**: Red Alert, Red Alert 2, Tiberian Sun, Tiberian Dawn, and Dune 2000 (plus expansions and total conversions in the same visual paradigm). These games share:

- Fixed isometric camera
- Grid-based terrain (with optional elevation for TS/RA2)
- Sprite and/or voxel-to-sprite rendering
- `.mix` archives and related format lineage
- Discrete cell-based pathfinding (flowfields, hierarchical A*)

**C&C Generals and later 3D titles (C&C3, RA3) are out of scope.** They use free-rotating 3D cameras, mesh-based rendering, continuous-space pathfinding (navmesh), and completely unrelated file formats (`.big`, `.w3d`). Supporting them would require replacing ~60% of the engine (renderer, pathfinding, coordinate system, format parsers) — at that point it's a separate project borrowing the sim core, not a game module.

If a Generals-class game is desired in the future, the correct approach is to extract the game-agnostic crates (`ra-sim`, `ra-protocol`, `ra-net`, `ra-script`) into a shared RTS framework library and build a 3D frontend independently. The `GameModule` trait and deterministic sim architecture make this feasible without forking.

### 3D Rendering as a Mod (Not a Game Module)

While 3D C&C titles are out of scope as *game modules*, the architecture explicitly supports **3D rendering mods** for isometric-family games. A "3D Red Alert" mod replaces the visual presentation while the simulation, networking, pathfinding, and rules are completely unchanged.

This works because the sim/render split is absolute — the sim has no concept of camera, sprites, or visual style. Bevy already ships a full 3D pipeline (PBR materials, GLTF loading, skeletal animation, dynamic lighting, shadows), so a 3D render mod leverages existing infrastructure.

**What changes vs. what doesn't:**

| Layer         | 3D Mod Changes? | Details                                                            |
| ------------- | --------------- | ------------------------------------------------------------------ |
| Simulation    | No              | Same tick, same rules, same grid                                   |
| Pathfinding   | No              | Grid-based flowfields still work (SC2 is 3D but uses grid pathing) |
| Networking    | No              | Orders are orders                                                  |
| Rules / YAML  | No              | Tank still costs 800, has 400 HP                                   |
| Rendering     | Yes             | Sprites → GLTF meshes, isometric camera → free 3D camera           |
| Input mapping | Yes             | Click-to-world changes from isometric transform to 3D raycast      |

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

4. **Click-to-world abstracted behind trait.** Isometric screen→cell is a linear transform. 3D perspective screen→cell is a raycast. Both produce a `CellPos`.
5. **Terrain rendering decoupled from terrain data.** The sim's grid is authoritative. A 3D mod provides visual terrain geometry that matches the grid layout.

**Key benefits:**
- **Cross-view multiplayer.** A player running 3D can play against a player running classic isometric — the sim is identical. Like StarCraft Remastered's graphics toggle, but more radical.
- **Cross-view replays.** Watch any replay in 2D or 3D.
- **Orthogonal to gameplay mods.** A balance mod works in both views. A 3D graphics mod stacks with a gameplay mod.

This is a **Tier 3 (WASM) mod** — it replaces a rendering backend, which is too deep for YAML or Lua. See `04-MODDING.md` for details.

### Design Rules for Multi-Game Safety

1. **No game-specific enums in engine core.** Don't put `enum ResourceType { Ore, Gems }` in `ra-sim`. Resource types come from YAML rules / game module registration.
2. **Position is always 3D.** `WorldPos` and `CellPos` carry Z. RA1 sets it to 0. The cost is one extra `i32` per position — negligible.
3. **System pipeline is data, not code.** The game module returns its system list; the engine executes it. No hardcoded `harvester_system()` call in engine core.
4. **Render through `Renderable` trait.** Sprites and voxels implement the same trait. The renderer doesn't know what it's drawing.
5. **Format loaders are pluggable.** `ra-formats` provides parsers; the game module tells the asset pipeline which ones to use.
6. **`PlayerOrder` is extensible.** Use an enum with a `Custom(GameSpecificOrder)` variant, or make orders generic over the game module.
