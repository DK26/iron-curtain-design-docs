## D018: Multi-Game Extensibility (Game Modules)

**Decision:** Design the engine as a game-agnostic RTS framework that ships with multiple built-in game modules. Red Alert is the default module; Tiberian Dawn ships alongside it. RA2, Tiberian Sun, Dune 2000, and original games should be addable as additional modules without modifying core engine code. The engine is also capable of powering non-C&C classic RTS games (see D039).

**Rationale:**
- OpenRA already proves multi-game works — runs TD, RA, and D2K on one engine via different trait/component sets
- The ECS architecture naturally supports this (composable components, pluggable systems)
- Prevents RA1 assumptions from hardening into architectural constraints that require rewrites later
- Broadens the project's audience and contributor base
- RA2 is the most-requested extension — community interest is proven (Chrono Divide exists)
- Shipping RA + TD from the start (like OpenRA) proves the game-agnostic design is real, not aspirational
- **Validated by Factorio's "game is a mod" principle:** Factorio's `base/` directory uses the exact same `data:extend()` API available to external mods — the base game is literally a mod. This is the strongest possible validation of the game module architecture. IC's RA1 module must use NO internal APIs unavailable to external game modules. Every system it uses — pathfinding, fog of war, damage resolution, format loading — should go through `GameModule` trait registration, not internal engine shortcuts. If the RA1 module needs a capability that external modules can't access, that capability must be promoted to a public trait or API. See `research/mojang-wube-modding-analysis.md` § "The Game Is a Mod"

**The `GameModule` trait:**

Every game module implements `GameModule`, which bundles everything the engine needs to run that game:

```rust
pub trait GameModule: Send + Sync + 'static {
    /// Register ECS components (unit types, mechanics) into the world.
    fn register_components(&self, world: &mut World);

    /// Return the ordered system pipeline for this game's simulation tick.
    fn system_pipeline(&self) -> Vec<Box<dyn System>>;

    /// Provide the pathfinding implementation (selected by lobby/experience profile, D045).
    fn pathfinder(&self) -> Box<dyn Pathfinder>;

    /// Provide the spatial index implementation (spatial hash, BVH, etc.).
    fn spatial_index(&self) -> Box<dyn SpatialIndex>;

    /// Provide the fog of war implementation (D041).
    fn fog_provider(&self) -> Box<dyn FogProvider>;

    /// Provide the damage resolution algorithm (D041).
    fn damage_resolver(&self) -> Box<dyn DamageResolver>;

    /// Provide order validation logic (D041).
    fn order_validator(&self) -> Box<dyn OrderValidator>;

    /// Register format loaders (e.g., .vxl for RA2, .shp for RA1).
    fn register_format_loaders(&self, registry: &mut FormatRegistry);

    /// Register render backends (sprite renderer, voxel renderer, etc.).
    fn register_renderers(&self, registry: &mut RenderRegistry);

    /// List available render modes — Classic, HD, 3D, etc. (D048).
    fn render_modes(&self) -> Vec<RenderMode>;

    /// Register game-module-specific commands into the Brigadier command tree (D058).
    /// RA1 registers `/sell`, `/deploy`, `/stance`, etc. A total conversion registers
    /// its own novel commands. Engine built-in commands are pre-registered before this.
    fn register_commands(&self, dispatcher: &mut CommandDispatcher);

    /// YAML rule schema for this game's unit definitions.
    fn rule_schema(&self) -> RuleSchema;
}
```

**Game module capability matrix:**

| Capability              | RA1 (ships Phase 2) | TD (ships Phase 3-4) | Generals-class (future) | Non-C&C (community) |
| ----------------------- | ------------------- | -------------------- | ----------------------- | ------------------- |
| Pathfinding             | Multi-layer hybrid  | Multi-layer hybrid   | Navmesh                 | Module-provided     |
| Spatial index           | Spatial hash        | Spatial hash         | BVH/R-tree              | Module-provided     |
| Fog of war              | Radius fog          | Radius fog           | Elevation LOS           | Module-provided     |
| Damage resolution       | Standard pipeline   | Standard pipeline    | Sub-object targeting    | Module-provided     |
| Order validation        | Standard validator  | Standard validator   | Module-specific rules   | Module-provided     |
| Rendering               | Isometric sprites   | Isometric sprites    | 3D meshes               | Module-provided     |
| Camera                  | Isometric fixed     | Isometric fixed      | Free 3D                 | Module-provided     |
| Terrain                 | Grid cells          | Grid cells           | Heightmap               | Module-provided     |
| Format loading          | .mix/.shp/.pal      | .mix/.shp/.pal       | .big/.w3d               | Module-provided     |
| AI strategy             | Personality-driven  | Personality-driven   | Module-provided         | Module-provided     |
| Networking              | Shared (ic-net)     | Shared (ic-net)      | Shared (ic-net)         | Shared (ic-net)     |
| Modding (YAML/Lua/WASM) | Shared (ic-script)  | Shared (ic-script)   | Shared (ic-script)      | Shared (ic-script)  |
| Workshop                | Shared (D030)       | Shared (D030)        | Shared (D030)           | Shared (D030)       |
| Replays & saves         | Shared (ic-sim)     | Shared (ic-sim)      | Shared (ic-sim)         | Shared (ic-sim)     |
| Competitive systems     | Shared              | Shared               | Shared                  | Shared              |

The pattern: game-specific rendering, pathfinding, spatial queries, fog, damage resolution, AI strategy, and validation; shared networking, modding, workshop, replays, saves, and competitive infrastructure.

**Experience profiles (composing D019 + D032 + D033 + D043 + D045 + D048):**

An experience profile bundles a balance preset, UI theme, QoL settings, AI behavior, pathfinding feel, and render mode into a named configuration:

```yaml
profiles:
  classic-ra:
    display_name: "Classic Red Alert"
    game_module: red_alert
    balance: classic        # D019 — EA source values
    theme: classic          # D032 — DOS/Win95 aesthetic
    qol: vanilla            # D033 — no QoL additions
    ai_preset: classic-ra   # D043 — original RA AI behavior
    pathfinding: classic-ra # D045 — original RA movement feel
    render_mode: classic    # D048 — original pixel art
    description: "Original Red Alert experience, warts and all"

  openra-ra:
    display_name: "OpenRA Red Alert"
    game_module: red_alert
    balance: openra         # D019 — OpenRA competitive balance
    theme: modern           # D032 — modern UI
    qol: openra             # D033 — OpenRA QoL features
    ai_preset: openra       # D043 — OpenRA skirmish AI behavior
    pathfinding: openra     # D045 — OpenRA movement feel
    render_mode: classic    # D048 — OpenRA uses classic sprites
    description: "OpenRA-style experience on the Iron Curtain engine"

  iron-curtain-ra:
    display_name: "Iron Curtain Red Alert"
    game_module: red_alert
    balance: classic        # D019 — EA source values
    theme: modern           # D032 — modern UI
    qol: iron_curtain       # D033 — IC's recommended QoL
    ai_preset: ic-default   # D043 — research-informed AI
    pathfinding: ic-default # D045 — modern flowfield movement
    render_mode: hd         # D048 — HD sprites if available, else classic
    description: "Recommended — classic balance with modern QoL and enhanced AI"
```

Profiles are selectable in the lobby. Players can customize individual settings or pick a preset. Competitive modes lock the profile for fairness — specifically:

| Profile Axis             | Locked in Ranked?                     | Rationale                                                                                                         |
| ------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| D019 Balance preset      | **Yes** — fixed per season per queue  | Sim-affecting; all players must use the same balance rules                                                        |
| D033 QoL (sim-affecting) | **Yes** — fixed per ranked queue      | Sim-affecting toggles (production, commands, gameplay sections) are lobby settings; mismatch = connection refused |
| D045 Pathfinding preset  | **Yes** — same impl required          | Sim-affecting; pathfinder WASM hash verified across all clients                                                   |
| D043 AI preset           | **N/A** — not relevant for PvP ranked | AI presets only matter in PvE/skirmish; no competitive implication                                                |
| D032 UI theme            | **No** — client-only cosmetic         | No sim impact; personal visual preference                                                                         |
| D048 Render mode         | **No** — client-only cosmetic         | No sim impact; cross-view multiplayer is architecturally safe (see D048 § "Information Equivalence")              |
| D033 QoL (client-only)   | **No** — per-player preferences       | Health bar display, selection glow, etc. — purely visual/UX, no competitive advantage                             |

The locked axes collectively ensure that all ranked players share identical simulation rules. The unlocked axes are guaranteed to be information-equivalent (see D048 § "Information Equivalence" and D058 § "Visual Settings & Competitive Fairness").

**Concrete changes (baked in from Phase 0):**
1. `WorldPos` carries a Z coordinate from day one (RA1 sets z=0). `CellPos` is a game-module convenience for grid-based games, not an engine-core type.
2. System execution order is registered per game module, not hardcoded in engine
3. No game-specific enums in engine core — resource types, unit categories come from YAML / module registration
4. Renderer uses a `Renderable` trait — sprite and voxel backends implement it equally
5. Pathfinding uses a `Pathfinder` trait — `IcPathfinder` (multi-layer hybrid) is the RA1 impl; navmesh could slot in without touching sim
6. Spatial queries use a `SpatialIndex` trait — spatial hash is the RA1 impl; BVH/R-tree could slot in without touching combat/targeting
7. `GameModule` trait bundles component registration, system pipeline, pathfinder, spatial index, fog provider, damage resolver, order validator, format loaders, render backends, and experience profiles (see D041 for the 5 additional trait abstractions)
8. `PlayerOrder` is extensible to game-specific commands
9. Engine crates use `ic-*` naming (not `ra-*`) to reflect game-agnostic identity (see D039). Exception: `ra-formats` stays because it reads C&C-family file formats specifically.

**What this does NOT mean:**
- We don't build RA2 support now. Red Alert + Tiberian Dawn are the focus through Phase 3-4.
- We don't add speculative abstractions. Only the nine concrete changes above.
- Non-C&C game modules are an architectural capability, not a deliverable (see D039).

**Scope boundary — current targets vs. architectural openness:**
First-party game module development targets the C&C family: Red Alert (default, ships Phase 2), Tiberian Dawn (ships Phase 3-4 stretch goal). RA2, Tiberian Sun, and Dune 2000 are future community goals sharing the isometric camera, grid-based terrain, sprite/voxel rendering, and `.mix` format lineage.

**3D titles (Generals, C&C3, RA3) are not current targets** but the architecture deliberately avoids closing doors. With pathfinding (`Pathfinder` trait), spatial queries (`SpatialIndex` trait), rendering (`Renderable` trait), camera (`ScreenToWorld` trait), format loading (`FormatRegistry`), fog of war (`FogProvider` trait), damage resolution (`DamageResolver` trait), AI (`AiStrategy` trait), and order validation (`OrderValidator` trait) all behind pluggable abstractions, a Generals-class game module would provide its own implementations of these traits while reusing the sim core, networking, modding infrastructure, workshop, competitive systems, replays, and save games. The traits exist from day one — the cost is near-zero, and the benefit is that neither we nor the community need to fork the engine to explore continuous-space games in the future. See D041 for the full trait-abstraction strategy and rationale.

See `02-ARCHITECTURE.md` § "Architectural Openness: Beyond Isometric" for the full trait-by-trait breakdown.

However, **3D rendering mods for isometric-family games are explicitly supported.** A "3D Red Alert" Tier 3 mod can replace sprites with GLTF meshes and the isometric camera with a free 3D camera — without changing the sim, networking, or pathfinding. Bevy's built-in 3D pipeline makes this feasible. Cross-view multiplayer (2D vs 3D players in the same game) works because the sim is view-agnostic. See `02-ARCHITECTURE.md` § "3D Rendering as a Mod".

**Phase:** Architecture baked in from Phase 0. RA1 module ships Phase 2. TD module targets Phase 3-4 as a stretch goal. RA2 module is a potential Phase 8+ community project.

> **Expectation management:** The community's most-requested feature is RA2 support. The architecture deliberately supports it (game-agnostic traits, extensible ECS, pluggable pathfinding), but **RA2 is a future community goal, not a scheduled deliverable.** No timeline, staffing, or exit criteria exist for any game module beyond RA1 and TD. When the community reads "game-agnostic," they should understand: the architecture won't block RA2, but nobody is building it yet. TD ships alongside RA1 to prove the multi-game design works — not because two games are twice as fun, but because an engine that only runs one game hasn't proven it's game-agnostic.
