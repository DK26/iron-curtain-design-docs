# Decision Log — Foundation & Core

Language, framework, data formats, simulation invariants, core engine identity, and crate extraction.

---

### Standalone Decision Files (09a/)

| Decision | Title | File |
|----------|-------|------|
| D076 | Standalone MIT/Apache-Licensed Crate Extraction Strategy | [D076](09a/D076-standalone-crates.md) |

---

## D001: Language — Rust

**Decision:** Build the engine in Rust.

**Rationale:**
- No GC pauses (C# / .NET is OpenRA's known weakness in large battles)
- Memory safety without runtime cost
- Fearless concurrency for parallel ECS systems
- First-class WASM compilation target (browser, modding sandbox)
- Modern tooling (cargo, crates.io, clippy, miri)
- No competition in Rust RTS space — wide open field

**Why not a high-level language (C#, Python, Java)?**

The goal is to extract maximum performance from the hardware. A game engine is one of the few domains where you genuinely need every cycle — the original Red Alert was written in C and ran close to the metal, and IC should too. High-level languages with garbage collectors, runtime overhead, and opaque memory layouts leave performance on the table. Rust gives the same hardware access as C without the footguns.

**Why not C/C++?**

Beyond the well-known safety and tooling arguments: **C++ is a liability in the age of LLM-assisted development.** This project is built with agentic LLMs as a core part of the development workflow. With Rust, LLM-generated code that compiles is overwhelmingly *correct* — the borrow checker, type system, and ownership model catch entire categories of bugs at compile time. The compiler is a safety net that makes LLM output trustworthy. With C++, LLM-generated code that compiles can still contain use-after-free, data races, undefined behavior, and subtle memory corruption — bugs that are dangerous precisely because they're silent. The errors are cryptic, the debugging is painful, and the risk compounds as the codebase grows. Rust's compiler turns the LLM from a risk into a superpower: you can develop faster and bolder because the guardrails are structural, not optional.

This isn't a temporary advantage. LLM-assisted development is the future of programming. Choosing a language where the compiler verifies LLM output — rather than one where you must manually audit every line for memory safety — is a strategic bet that compounds over the lifetime of the project.

**Why Rust is the right moment for a C&C engine:**

Rust is replacing C and C++ across the industry. It's in the Linux kernel, Android, Windows, Chromium, and every major cloud provider's infrastructure. The ecosystem is maturing rapidly — crates.io has 150K+ crates, Bevy is the most actively developed open-source game engine in any language, and the community is growing faster than any systems language since C++ itself. Serious new infrastructure projects increasingly start in Rust rather than C++.

This creates a unique opportunity for a C&C engine renewal. The original games were written in C. OpenRA chose C# — a reasonable choice in 2007, but one that traded hardware performance for developer productivity. Rust didn't exist as a viable option then. It does now. A Rust-native engine can match C's performance, exceed C#'s safety, leverage Rust's excellent concurrency model to use all available CPU cores, and tap into a modern ecosystem (Bevy, wgpu, serde, tokio) that simply has no C++ equivalent at the same quality level. The timing is right: Rust is mature enough to build on, young enough that the RTS space is wide open, and the C&C community deserves an engine built with the best tools available today.

**Alternatives considered:**
- C++ (manual memory management, no safety guarantees, build system pain, dangerous with LLM-assisted workflows — silent bugs where Rust would catch them at compile time)
- C# (would just be another OpenRA — no differentiation, GC pauses in hot paths, gives up hardware-level performance)
- Zig (too immature ecosystem for this scope)

---

---

## D002: Framework — Bevy (REVISED from original "No Bevy" decision)

**Decision:** Use Bevy as the game framework.

**Original decision:** Custom library stack (winit + wgpu + hecs). This was overridden.

**Why the reversal:**
- The 2-4 months building engine infrastructure (sprite batching, cameras, audio, input, asset pipeline, hot reload) is time NOT spent on the sim, netcode, and modding — the things that differentiate this project
- Bevy's ECS IS our architecture — no "fighting two systems." OpenRA traits map directly to Bevy components
- `FixedUpdate` + `.chain()` gives deterministic sim scheduling natively
- Bevy's plugin system makes pluggable networking cleaner than the original trait-based design
- Headless mode (`MinimalPlugins`) for dedicated servers is built in
- WASM/browser target is tested by community
- `bevy_reflect` enables advanced modding capabilities
- Breaking API changes are manageable: pin version per phase, upgrade between phases

**Risk mitigation:**
- Breaking changes → version pinning per development phase
- Not isometric-specific → build isometric layer on Bevy's 2D (still less work than raw wgpu)
- Performance concerns → Bevy uses rayon internally, `par_iter()` for data parallelism, and allows custom render passes and SIMD where needed

**Alternatives considered:**

*Godot (rejected):*

Godot is a mature, MIT-licensed engine with excellent tooling (editor, GDScript, asset pipeline). However, it does not fit IC's architecture:

| Requirement                      | Bevy                                                                    | Godot                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Language (D001)                  | Rust-native — IC systems are Bevy systems, no boundary crossing         | C++ engine. Rust logic via GDExtension adds a C ABI boundary on every engine call                |
| ECS for 500+ units               | Flat archetypes, cache-friendly iteration, `par_iter()`                 | Scene tree (node hierarchy). Hundreds of RTS units as Nodes fight cache coherence. No native ECS |
| Deterministic sim (Invariant #1) | `FixedUpdate` + `.chain()` — explicit, documented system ordering       | `_physics_process()` order depends on scene tree position — harder to guarantee across versions  |
| Headless server                  | `MinimalPlugins` — zero rendering, zero GPU dependency                  | Can run headless but designed around rendering. Heavier baseline                                 |
| Crate structure                  | Each `ic-*` crate is a Bevy plugin. Clean `Cargo.toml` dependency graph | Each module would be a GDExtension shared library with C ABI marshalling overhead                |
| WASM browser target              | Community-tested. Rust code compiles to WASM directly                   | WASM export includes the entire C++ runtime (~40 MB+)                                            |
| Modding (D005)                   | WASM mods call host functions directly. Lua via `mlua` in-process       | GDExtension → C ABI → Rust → WASM chain. Extra indirection                                       |
| Fixed-point math (D009)          | Systems operate on IC's `i32`/`i64` types natively                      | Physics uses `float`/`double` internally. IC would bypass engine math entirely                   |

Using Godot would mean writing all simulation logic in Rust via GDExtension, bypassing Godot's physics/math/networking, building a custom editor anyway (D038), and using none of GDScript. At that point Godot becomes expensive rendering middleware with a C ABI tax — Bevy provides the same rendering capabilities (wgpu) without the boundary. Godot's strengths (mature editor, GDScript rapid prototyping, scene tree composition) serve adventure and platformer games well but are counterproductive for flat ECS simulation of hundreds of units.

IC borrows interface design patterns from Godot — pluggable `MultiplayerAPI` validates IC's `NetworkModel` trait (D006), "editor is the engine" validates `ic-editor` as a Bevy app (D038), and the separate proposals repository informs governance (D037) — but these are architectural lessons, not reasons to adopt Godot as a runtime. See `research/godot-o3de-engine-analysis.md` for the full analysis.

*Custom library stack — winit + wgpu + hecs (original decision, rejected):*

The original plan avoided framework lock-in by assembling individual crates. Rejected because 2-4 months of infrastructure work (sprite batching, cameras, audio, input, asset pipeline) delays the differentiating features (sim, netcode, modding). Bevy provides all of this with a compatible ECS architecture.

---

---

## D003: Data Format — Real YAML, Not MiniYAML

**Decision:** Use standard spec-compliant YAML with `serde_yaml`. Not OpenRA's MiniYAML.

**Rationale:**
- Standard YAML parsers, linters, formatters, editor support all work
- `serde_yaml` → typed Rust struct deserialization for free
- JSON-schema validation catches errors before game loads
- No custom parser to maintain
- Inheritance resolved at load time as a processing pass, not a parser feature

**Alternatives considered:**
- MiniYAML as-is (rejected — custom parser, no tooling support, not spec-compliant)
- TOML (rejected — awkward for deeply nested game data)
- RON (rejected — modders won't know it, thin editor support)
- JSON (rejected — too verbose, no comments)

**Migration:** `miniyaml2yaml` converter tool in `ra-formats` crate.

---

---

## D009: Simulation — Fixed-Point Math, No Floats

**Decision:** All sim-layer calculations use integer/fixed-point arithmetic. Floats allowed only for rendering interpolation.

**Rationale:**
- Required for deterministic lockstep (floats can produce different results across platforms)
- Original Red Alert used integer math — proven approach
- OpenRA uses `WDist`/`WPos`/`WAngle` with 1024 subdivisions — same principle

> **P002 resolved:** Scale factor = **1024** (matching OpenRA). Full type library (`Fixed`, `WorldPos`, `WAngle`), trig tables, CORDIC atan2, Newton sqrt, modifier arithmetic, and determinism guarantees: see `research/fixed-point-math-design.md`.

---

---

## D010: Simulation — Snapshottable State

**Decision:** Full sim state must be serializable/deserializable at any tick.

**Rationale enables:**
- Save games (trivially)
- Replay system (initial state + orders)
- Desync debugging (diff snapshots between clients at divergence point)
- Rollback netcode (restore state N frames back, replay with corrected inputs)
- Cross-engine reconciliation (restore from authoritative checkpoint)
- Automated testing (load known state, apply inputs, verify result)

**Crash-safe serialization (from Valve Fossilize):** Save files use an append-only write strategy with a final header update — the same pattern Valve uses in Fossilize (their pipeline cache serialization library, see `research/valve-github-analysis.md` § Part 3). The payload is written first into a temporary file; only after the full payload is fsynced does the header (containing checksum + payload length) get written atomically. If the process crashes mid-write, the incomplete temporary file is detected and discarded on next load — the previous valid save remains intact. This eliminates the "corrupted save file" failure mode that plagues games with naïve serialization.

**Autosave threading:** Autosave (including `delta_snapshot()` serialization + LZ4 compression + fsync) MUST run on the dedicated I/O thread — never on the game loop thread. On a 5400 RPM HDD, the `fsync()` call alone takes 50–200 ms (waits for platters to physically commit). Even though delta saves are only ~30 KB, fsync latency dominates. The game thread's only responsibility is to produce the `DeltaSnapshot` data (reading ECS state — fast, ~0.5–1 ms for 500 units via `ChangeMask` bitfield iteration). The serialized bytes are then sent to the I/O thread via the same ring buffer used for SQLite events. The I/O thread handles file I/O + fsync asynchronously. This prevents the guaranteed 50–200 ms HDD hitch that would otherwise occur every autosave interval.

**Delta encoding for snapshots:** Periodic full snapshots (for save games, desync debugging) are complemented by **delta snapshots** that encode only changed state since the last full snapshot. Delta encoding uses property-level diffing: each ECS component that changed since the last snapshot is serialized; unchanged components are omitted. For a 500-unit game where ~10% of components change per tick, a delta snapshot is ~10x smaller than a full snapshot. This reduces save file size, speeds up autosave, and makes periodic snapshot transmission (for late-join reconnection) bandwidth-efficient. Inspired by Source Engine's `CNetworkVar` per-field change detection (see `research/valve-github-analysis.md` § 2.2) and the `SPROP_CHANGES_OFTEN` priority flag — components that change every tick (position, health) are checked first during delta computation, improving cache locality. See `10-PERFORMANCE.md` for the performance impact and `09-DECISIONS.md` § D054 for the `SnapshotCodec` version dispatch.

---

---

## D015: Performance — Efficiency-First, Not Thread-First

**Decision:** Performance is achieved through algorithmic efficiency, cache-friendly data layout, adaptive workload, zero allocation, and amortized computation. Multi-core scaling is a bonus layer on top, not the foundation.

**Principle:** The engine must run a 500-unit battle smoothly on a 2-core, 4GB machine from 2012. Multi-core machines get higher unit counts as a natural consequence of the work-stealing scheduler.

**The Efficiency Pyramid (ordered by impact):**
1. Algorithmic efficiency (flowfields, spatial hash, hierarchical pathfinding)
2. Cache-friendly ECS layout (hot/warm/cold component separation)
3. Simulation LOD (skip work that doesn't affect the outcome)
4. Amortized work (stagger expensive systems across ticks)
5. Zero-allocation hot paths (pre-allocated scratch buffers)
6. Work-stealing parallelism (rayon via Bevy — bonus, not foundation)

**Inspired by:** Datadog Vector's pipeline efficiency, Tokio's work-stealing runtime. These systems are fast because they waste nothing, not because they use more hardware.

**Anti-pattern rejected:** "Just parallelize it" as the default answer. Parallelism without algorithmic efficiency is adding lanes to a highway with broken traffic lights.

See `10-PERFORMANCE.md` for full details, targets, and implementation patterns.

---

---

## D017: Bevy Rendering Pipeline — Classic Base, Modding Possibilities

**Revision note (2026-02-22):** Clarified hardware-accessibility and feature-tiering intent: Bevy's advanced rendering/3D capabilities are optional infrastructure, not baseline requirements. The default game path remains classic 2D isometric rendering with aggressive low-end fallbacks for non-gaming hardware / integrated GPUs.

**Decision:** Use Bevy's rendering pipeline (wgpu) to faithfully reproduce the classic Red Alert isometric aesthetic. Bevy's more advanced rendering capabilities (shaders, post-processing, dynamic lighting, particles, 3D) are available as optional modding infrastructure — not as base game goals or baseline hardware requirements.

**Rationale:**
- The core rendering goal is a faithful classic Red Alert clone: isometric sprites, palette-aware shading, fog of war
- Bevy + wgpu provides this solidly via 2D sprite batching and the isometric layer
- Because Bevy includes a full rendering pipeline, advanced visual capabilities (bloom, color grading, GPU particles, dynamic lighting, custom shaders) are **passively available** to modders without extra engine work
- This enables community-created visual enhancements: shader effects for chrono-shift, tesla arcs, weather particles, or even full 3D rendering mods (see D018, `02-ARCHITECTURE.md` § "3D Rendering as a Mod")
- Render quality tiers (Baseline → Ultra) automatically degrade for older hardware — the base classic aesthetic works on all tiers, including no-dedicated-GPU systems that only meet the downlevel GL/WebGL path

**Hardware intent (important):** "Optional 3D" means the game's **core experience** must remain fully playable without Bevy's advanced 3D/post-FX stack. 3D render modes and heavy visual effects are additive. If the device cannot support them, the player still gets the complete game in classic 2D mode.

**Scope:**
- Phase 1: faithful isometric tile renderer, sprite animation, shroud, camera — showcase optional post-processing prototypes to demonstrate modding potential
- Phase 3+: rendering supports whatever the game chrome needs
- Phase 7: visual modding infrastructure (particle systems, shader library, weather rendering) — tools for modders, not base game goals

**Design principle:** The base game looks like Red Alert. Modders can make it look like whatever they want.

---

---

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
    /// Human-readable name ("Red Alert", "Tiberian Dawn")
    fn name(&self) -> &str;

    /// Register ECS components, systems, and system ordering
    fn register_systems(&self, app: &mut App);

    /// Provide the module's Pathfinder implementation
    fn pathfinder(&self) -> Box<dyn Pathfinder>;

    /// Provide the module's SpatialIndex implementation
    fn spatial_index(&self) -> Box<dyn SpatialIndex>;

    /// Provide the module's FogProvider implementation (D041)
    fn fog_provider(&self) -> Box<dyn FogProvider>;

    /// Provide the module's DamageResolver implementation (D041)
    fn damage_resolver(&self) -> Box<dyn DamageResolver>;

    /// Provide the module's OrderValidator implementation (D041)
    fn order_validator(&self) -> Box<dyn OrderValidator>;

    /// Provide the module's render plugin (sprite, voxel, 3D, etc.)
    fn render_plugin(&self) -> Box<dyn RenderPlugin>;

    /// List available render modes — Classic, HD, 3D, etc. (D048)
    fn render_modes(&self) -> Vec<RenderMode>;

    /// Provide the module's UI layout (sidebar style, build queue, etc.)
    fn ui_layout(&self) -> UiLayout;

    /// Provide format loaders for this module's asset types
    fn format_loaders(&self) -> Vec<Box<dyn FormatLoader>>;

    /// Register game-module-specific commands into the Brigadier command tree (D058).
    /// RA1 registers `/sell`, `/deploy`, `/stance`, etc. A total conversion registers
    /// its own novel commands. Engine built-in commands are pre-registered before this.
    fn register_commands(&self, dispatcher: &mut CommandDispatcher);

    /// List available balance presets (D019)
    fn balance_presets(&self) -> Vec<BalancePreset>;

    /// List available experience profiles (D019 + D032 + D033 + D043 + D045 + D048)
    fn experience_profiles(&self) -> Vec<ExperienceProfile>;

    /// Default experience profile name
    fn default_profile(&self) -> &str;
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

---

---

## D039: Engine Scope — General-Purpose Classic RTS Platform

**Decision:** Iron Curtain is a general-purpose classic RTS engine. It ships with built-in C&C game modules (Red Alert, Tiberian Dawn) as its primary content, but at the architectural level, the engine's design does not prevent building any classic RTS — from C&C to Age of Empires to StarCraft to Supreme Commander to original games.

**The framing:** Built for C&C, open to anything. C&C games and the OpenRA community remain the primary audience, the roadmap, and the compatibility target. What changes is how we think about the underlying engine: nothing in the engine core should assume a specific resource model, base building model, camera system, or UI layout. These are all game module concerns.

**What this means concretely:**
1. **Red Alert and Tiberian Dawn are built-in mods** — they ship with the engine, like OpenRA bundles RA/TD/D2K. The engine launches into RA1 by default. Other game modules are selectable from a mod menu
2. **Crate naming reflects engine identity** — engine crates use `ic-*` (Iron Curtain), not `ra-*`. The exception is `ra-formats` which genuinely reads C&C/Red Alert file formats. If someone builds an AoE game module, they'd write their own format reader
3. **`GameModule` (D018) becomes the central abstraction** — the trait defines everything that differs between RTS games: resource model, building model, camera, pathfinding implementation, UI layout, tech progression, population model
4. **OpenRA experience as a composable profile** — D019 (balance) + D032 (themes) + D033 (QoL) combine into "experience profiles." "OpenRA" is a profile: OpenRA balance values + Modern theme + OpenRA QoL conventions. "Classic RA" is another profile. Each is a valid interpretation of the same game module
5. **The C&C variety IS the architectural stress test** — across the franchise (TD, RA1, TS, RA2, Generals, C&C3, RA3, C&C4, Renegade), C&C games already span harvester/supply/streaming/zero-resource economies, sidebar/dozer/crawler building, 2D/3D cameras, grid/navmesh pathing, FPS/RTS hybrids. If the engine supports every C&C game, it inherently supports most classic RTS patterns

**What this does NOT mean:**
- We don't dilute the C&C focus. RA1 is the default module, TD ships alongside it. The roadmap doesn't change
- We don't build generic RTS features that no C&C game needs. Non-C&C capability is an architectural property, not a deliverable
- We don't de-prioritize OpenRA community compatibility. D023–D027 are still critical
- We don't build format readers for non-C&C games. That's community work on top of the engine

**Why "any classic RTS" and not "strictly C&C":**
- The C&C franchise already spans such diverse mechanics that supporting it fully means supporting most classic RTS patterns anyway
- Artificial limitations on non-C&C use would require extra code to enforce — it's harder to close doors than to leave them open
- A community member building "StarCraft in IC" exercises and validates the same `GameModule` API that a community member building "RA2 in IC" uses. Both make the engine more robust
- Westwood's philosophy was engine-first: the same engine technology powered vastly different games. IC follows this spirit
- Cancelled C&C games (Tiberium FPS, Generals 2, C&C Arena) and fan concepts exist in the space between "strictly C&C" and "any RTS" — the community should be free to explore them

**Validation from OpenRA mod ecosystem:** Three OpenRA mods serve as acid tests for game-agnostic claims (see `research/openra-mod-architecture-analysis.md` for full analysis):

- **OpenKrush (KKnD):** The most rigorous test. KKnD shares almost nothing with C&C: different resource model (oil patches, not ore), per-building production (no sidebar), different veterancy (kills-based, not XP), different terrain, 15+ proprietary binary formats with zero C&C overlap. OpenKrush replaces **16 complete mechanic modules** to make it work on OpenRA. In IC, every one of these would go through `GameModule` — validating that the trait covers the full range of game-specific concerns.
- **OpenSA (Swarm Assault):** A non-RTS-shaped game on an RTS engine — living world simulation with plant growth, creep spawners, pirate ants, colony capture. No base building, no sidebar, no harvesting. Tests whether the engine gracefully handles the *absence* of C&C systems, not just replacement.
- **d2 (Dune II):** The C&C ancestor, but with single-unit selection, concrete prerequisites, sandworm hazards, and starport variable pricing — mechanics so archaic they test backward-compatibility of the `GameModule` abstraction.

**Alternatives considered:**
- C&C-only scope (rejected — artificially limits what the community can create, while the architecture already supports broader use)
- "Any game" scope (rejected — too broad, dilutes C&C identity. Classic RTS is the right frame)
- No scope declaration (rejected — ambiguity about what game modules are welcome leads to confusion)

**Phase:** Baked into architecture from Phase 0 (via D018 and Invariant #9). This decision formalizes what D018 already implied and extends it.

---

---

## D067: Configuration Format Split — TOML for Engine, YAML for Content

**Decision:** All engine and infrastructure configuration files use **TOML**. All game content, mod definitions, and data-driven gameplay files use **YAML**. The file extension alone tells you what kind of file you're looking at: `.toml` = how the engine runs, `.yaml` = what the game is.

**Context:** The current design uses YAML for everything — client settings, server configuration, mod manifests, unit definitions, campaign graphs, UI themes, balance presets. This works technically (YAML is a superset of what we need), but it creates an orientation problem. When a contributor opens a directory full of `.yaml` files, they can't tell at a glance whether `config.yaml` is an engine knob they can safely tune or a game rule file that affects simulation determinism. When a modder opens `server_config.yaml`, the identical extension to their `units.yaml` suggests both are part of the same system — they're not. And when documentation says "configured in YAML," it doesn't distinguish "configured by the engine operator" from "configured by the mod author."

TOML is already present in the Rust ecosystem (`Cargo.toml`, `deny.toml`, `rustfmt.toml`, `clippy.toml`) and in the project itself. Rust developers already associate `.toml` with configuration. The split formalizes what's already a natural instinct.

**The rule is simple:** If it configures the engine, the server, or the development toolchain, it's TOML. If it defines game content that flows through the mod/asset pipeline or the simulation, it's YAML.

### File Classification

#### TOML — Engine & Infrastructure Configuration

| File                        | Purpose                                                                                      | Decision Reference    |
| --------------------------- | -------------------------------------------------------------------------------------------- | --------------------- |
| `config.toml`               | Client engine settings: render, audio, keybinds, net diagnostics, debug flags                | D058 (console/cvars)  |
| `config.<module>.toml`      | Per-game-module client overrides (e.g., `config.ra1.toml`)                                   | D058                  |
| `server_config.toml`        | Relay/server parameters: ~200 cvars across 14 subsystems                                     | D064                  |
| `settings.toml`             | Workshop sources, P2P bandwidth, compression levels, cloud sync, community list              | D030, D063            |
| `deny.toml`                 | License enforcement for `cargo deny`                                                         | Already TOML          |
| `Cargo.toml`                | Rust build system                                                                            | Already TOML          |
| Server deployment profiles  | `profiles/tournament-lan.toml`, `profiles/casual-community.toml`, etc.                       | D064, 15-SERVER-GUIDE |
| `compression.advanced.toml` | Advanced compression parameters for server operators (if separate from `server_config.toml`) | D063                  |
| Editor preferences          | `editor_prefs.toml` — SDK window layout, recent files, panel state                           | D038, D040            |

**Why TOML for configuration:**
- **Flat and explicit.** TOML doesn't allow the deeply nested structures that make YAML configs hard to scan. `[render]` / `shadows = true` is immediately readable. Configuration *should* be flat — if your config file needs 6 levels of nesting, it's probably content.
- **No gotchas.** YAML has well-known foot-guns: `Norway: NO` parses as `false`, bare `3.0` vs `"3.0"` ambiguity, tab/space sensitivity. TOML avoids all of these — critical for files that non-developers (server operators, tournament organizers) will edit by hand.
- **Type-safe.** TOML has native integer, float, boolean, datetime, and array types with unambiguous syntax. `max_fps = 144` is always an integer, never a string. YAML's type coercion surprises people.
- **Ecosystem alignment.** Rust's `serde` supports TOML via `toml` crate with identical derive macros to `serde_yaml`. The entire Rust toolchain uses TOML for configuration. IC contributors expect it.
- **Tooling.** [taplo](https://taplo.tamasfe.dev/) provides TOML LSP (validation, formatting, schema support) matching what YAML gets from Red Hat's YAML extension. VS Code gets first-class support for both.
- **Comments preserved.** TOML's comment syntax (`#`) is simple and universally understood. Round-trip serialization with `toml_edit` preserves comments and formatting — essential for files users hand-edit.

#### YAML — Game Content & Mod Data

| File                             | Purpose                                                             | Decision Reference   |
| -------------------------------- | ------------------------------------------------------------------- | -------------------- |
| `mod.yaml`                       | Mod manifest: name, version, dependencies, assets, game module      | D026                 |
| Unit/weapon/building definitions | `units/*.yaml`, `weapons/*.yaml`, `buildings/*.yaml`                | D003, Tier 1 modding |
| `campaign.yaml`                  | Campaign graph, mission sequence, persistent state                  | D021                 |
| `theme.yaml`                     | UI theme definition: sprite sheets, 9-slice coordinates, colors     | D032                 |
| `ranked-tiers.yaml`              | Competitive rank names, thresholds, icons per game module           | D055                 |
| Balance presets                  | `presets/balance/*.yaml` — Classic/OpenRA/Remastered values         | D019                 |
| QoL presets                      | `presets/qol/*.yaml` — behavior toggle configurations               | D033                 |
| Experience profiles              | `profiles/*.yaml` — named mod set + settings + conflict resolutions | D062                 |
| Map files                        | IC map format (terrain, actors, triggers, metadata)                 | D025                 |
| Scenario triggers/modules        | Trigger definitions, waypoints, compositions                        | D038                 |
| String tables / localization     | Translatable game text                                              | —                    |
| Editor extensions                | `editor_extension.yaml` — custom palettes, panels, brushes          | D066                 |
| Export config                    | `export_config.yaml` — target engine, version, content selection    | D066                 |
| `credits.yaml`                   | Campaign credits sequence                                           | D038                 |
| `loading_tips.yaml`              | Loading screen tips                                                 | D038                 |
| Tutorial definitions             | Hint triggers, tutorial step sequences                              | D065                 |
| AI personality definitions       | Build orders, aggression curves, expansion strategies               | D043                 |
| Achievement definitions          | In `mod.yaml` or separate achievement YAML files                    | D036                 |

**Why YAML stays for content:**
- **Deep nesting is natural.** Unit definitions have `combat.weapons[0].turret.target_filter` — content IS hierarchical. YAML handles this ergonomically. TOML's `[[combat.weapons]]` tables are awkward for deeply nested game data.
- **Inheritance and composition.** IC's YAML content uses `inherits:` chains. Content files are designed for the `serde_yaml` pipeline with load-time inheritance resolution. TOML has no equivalent pattern.
- **Community expectation.** The C&C modding community already works with MiniYAML (OpenRA) and INI (original). YAML is the closest modern equivalent — familiar structure, familiar ergonomics. Nobody expects to define unit stats in TOML.
- **Multi-document support.** YAML's `---` document separator allows multiple logical documents in one file (e.g., multiple unit definitions). TOML has no multi-document support.
- **Existing ecosystem.** JSON Schema validation for YAML content, D023 alias resolution, D025 MiniYAML conversion — all built around the YAML pipeline. The content toolchain is YAML-native.

### Edge Cases & Boundary Rules

| File                       | Classification | Reasoning                                                                                                                                                                                                                  |
| -------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mod.yaml` (mod manifest)  | **YAML**       | It's a content declaration — what the mod IS, not how the engine runs. Even though it has configuration-like fields (`engine.version`, `dependencies`), it flows through the mod pipeline, not the engine config pipeline. |
| Server deployment profiles | **TOML**       | They're server configuration variants, not game content. The relay reads them the same way it reads `server_config.toml`.                                                                                                  |
| `export_config.yaml`       | **YAML**       | Export configuration is part of the content creation workflow — it describes what to export (content), not how the engine operates. It travels alongside the scenario/mod it targets.                                      |
| `ic.lock`                  | **TOML**       | Lockfiles are infrastructure (dependency resolution state). Follows `Cargo.lock` convention.                                                                                                                               |
| `.iccmd` console scripts   | **Neither**    | These are script files, not configuration or content. Keep as-is.                                                                                                                                                          |

**The boundary test:** Ask "does this file affect the simulation or define game content?" If yes → YAML. "Does this file configure how the engine, server, or toolchain operates?" If yes → TOML. If genuinely ambiguous, prefer YAML (content is the larger set and the default assumption).

### Learning Curve: Two Formats, Not Two Languages

**The concern:** Introducing a second format means contributors who know YAML must now also navigate TOML. Does this add real complexity?

**The short answer:** No — it removes complexity. TOML is a *strict subset* of what YAML can do. Anyone who can read YAML can read TOML in under 60 seconds. The syntax delta is tiny:

| Concept        | YAML                           | TOML                            |
| -------------- | ------------------------------ | ------------------------------- |
| Key-value      | `max_fps: 144`                 | `max_fps = 144`                 |
| Section        | Indentation under parent key   | `[section]` header              |
| Nested section | More indentation               | `[parent.child]`                |
| String         | `name: "Tank"` or `name: Tank` | `name = "Tank"` (always quoted) |
| Boolean        | `enabled: true`                | `enabled = true`                |
| List           | `- item` on new lines          | `items = ["a", "b"]`            |
| Comment        | `# comment`                    | `# comment`                     |

That's it. TOML syntax is closer to traditional INI and `.conf` files than to YAML. Server operators, sysadmins, and tournament organizers — the people who edit `server_config.toml` — already know this format from `php.ini`, `my.cnf`, `sshd_config`, `Cargo.toml`, and every other flat configuration file they've ever touched. TOML is the *expected* format for configuration. YAML is the surprise.

**Audience separation means most people touch only one format:**

| Role                                             | Touches TOML? | Touches YAML? |
| ------------------------------------------------ | ------------- | ------------- |
| **Modder** (unit stats, weapons, balance)        | No            | Yes           |
| **Map maker** (terrain, triggers, scenarios)     | No            | Yes           |
| **Campaign author** (mission graph, dialogue)    | No            | Yes           |
| **Server operator** (relay tuning, deployment)   | Yes           | No            |
| **Tournament organizer** (match rules, profiles) | Yes           | No            |
| **Engine developer** (build config, CI)          | Yes           | Yes           |
| **Total conversion modder**                      | Rarely        | Yes           |

A modder who defines unit stats in YAML will never need to open a TOML file. A server operator tuning relay parameters will never need to edit YAML content files. The only role that routinely touches both is an engine developer — and Rust developers already live in TOML (`Cargo.toml`, `rustfmt.toml`, `clippy.toml`, `deny.toml`).

**TOML actually reduces complexity for the files it governs:**

- **No indentation traps.** YAML config files break silently when you mix tabs and spaces, or when you indent a key one level too deep. TOML uses `[section]` headers — indentation is cosmetic, not semantic.
- **No type coercion surprises.** In YAML, `version: 3.0` is a float but `version: "3.0"` is a string. `country: NO` (Norway) is `false`. `on: push` (GitHub Actions) is `{true: "push"}`. TOML has explicit, unambiguous types — what you write is what you get.
- **No multi-line ambiguity.** YAML has 9 different ways to write a multi-line string (`|`, `>`, `|+`, `|-`, `>+`, `>-`, etc.). TOML has one: `"""triple quotes"""`.
- **Smaller spec.** The complete TOML spec is ~3 pages. The YAML spec is 86 pages. A format you can learn completely in 10 minutes is inherently less complex than one with hidden corners.

The split doesn't ask anyone to learn a harder thing — it gives configuration files the *simpler* format and keeps the *more expressive* format for the content that actually needs it.

### Cvar Persistence

Cvars currently write back to `config.yaml`. Under D067, they write back to `config.toml`. The cvar key mapping is identical — `render.shadows` in the cvar system corresponds to `[render] shadows` in TOML. The `toml_edit` crate enables round-trip serialization that preserves user comments and formatting, matching the current YAML behavior.

```toml
# config.toml — client engine settings
# This file is auto-managed by the engine. Manual edits are preserved.

[render]
tier = "enhanced"           # "baseline", "standard", "enhanced", "ultra", "auto"
fps_cap = 144               # 30, 60, 144, 240, 0 (uncapped)
vsync = "adaptive"          # "off", "on", "adaptive", "mailbox"
resolution_scale = 1.0      # 0.5–2.0

[render.anti_aliasing]
msaa = "off"
smaa = "high"               # "off", "low", "medium", "high", "ultra"

[render.post_fx]
enabled = true
bloom_intensity = 0.2
tonemapping = "tony_mcmapface"
deband_dither = true

[render.lighting]
shadows = true
shadow_quality = "high"     # "off", "low", "medium", "high", "ultra"
shadow_filter = "gaussian"  # "hardware_2x2", "gaussian", "temporal"
ambient_occlusion = true

[render.particles]
density = 0.8
backend = "gpu"             # "cpu", "gpu"

[render.textures]
filtering = "trilinear"     # "nearest", "bilinear", "trilinear"
anisotropic = 8             # 1, 2, 4, 8, 16

# Full [render] schema: see 10-PERFORMANCE.md § "Full config.toml [render] Section"

[audio]
master_volume = 80
music_volume = 60
eva_volume = 100

[gameplay]
scroll_speed = 5
control_group_steal = false
auto_rally_harvesters = true

[net]
show_diagnostics = false
sync_frequency = 120

[debug]
show_fps = true
show_network_stats = false
```

Load order remains unchanged: `config.toml` → `config.<game_module>.toml` → command-line arguments → in-game `/set` commands.

### Server Configuration

`server_config.toml` replaces `server_config.yaml`. The three-layer precedence (D064) becomes TOML → env vars → runtime cvars:

```toml
# server_config.toml — relay/community server configuration

[relay]
bind_address = "0.0.0.0:7400"
max_concurrent_games = 50
tick_rate = 30

[match]
max_players = 8
max_game_duration_minutes = 120
allow_observers = true

[pause]
max_pauses_per_player = 3
pause_duration_seconds = 120

[anti_cheat]
order_validation = true
lag_switch_detection = true
lag_switch_threshold_ms = 3000
```

Environment variable mapping is unchanged: `IC_RELAY_BIND_ADDRESS`, `IC_MATCH_MAX_PLAYERS`, etc.

The `ic server validate-config` CLI validates `.toml` files. Hot reload via SIGHUP reads the updated `.toml`.

### Settings File

`settings.toml` replaces `settings.yaml` for Workshop sources, compression, and P2P configuration:

```toml
# settings.toml — engine-level client settings

[workshop]
sources = [
    { type = "remote", url = "https://workshop.ironcurtain.gg", name = "Official" },
    { type = "git-index", url = "https://github.com/iron-curtain/workshop-index", name = "Community" },
]

[compression]
level = "balanced"          # fastest | balanced | compact

[p2p]
enabled = true
max_upload_kbps = 512
max_download_kbps = 2048
```

### Data Directory Layout Update

The `<data_dir>` layout (D061) reflects the split:

```
<data_dir>/
├── config.toml                         # Engine + game settings (TOML — engine config)
├── settings.toml                       # Workshop sources, P2P, compression (TOML — engine config)
├── profile.db                          # Player identity, friends, blocks (SQLite)
├── achievements.db                     # Achievement collection (SQLite)
├── gameplay.db                         # Event log, replay catalog (SQLite)
├── telemetry.db                        # Telemetry events (SQLite)
├── keys/
│   └── identity.key
├── communities/
│   ├── official-ic.db
│   └── clan-wolfpack.db
├── saves/
├── replays/
├── screenshots/
├── workshop/
├── mods/                               # Mod content (YAML files inside)
├── maps/                               # Map content (YAML files inside)
├── logs/
└── backups/
```

**The visual signal:** Top-level config files are `.toml` (infrastructure). Everything under `mods/` and `maps/` is `.yaml` (content). SQLite databases are `.db` (structured data). Three file types, three concerns, zero ambiguity.

### Migration

This is a design-phase decision — no code exists to migrate. All documentation examples are updated to reflect the correct format. If documentation examples in other design docs still show `config.yaml` or `server_config.yaml`, they should be treated as references to the corresponding `.toml` files per D067.

### `serde` Implementation

Both TOML and YAML use the same `serde` derive macros in Rust:

```rust
use serde::{Serialize, Deserialize};

// Engine configuration — deserialized from TOML
#[derive(Serialize, Deserialize)]
pub struct EngineConfig {
    pub render: RenderConfig,
    pub audio: AudioConfig,
    pub gameplay: GameplayConfig,
    pub net: NetConfig,
    pub debug: DebugConfig,
}

// Game content — deserialized from YAML
#[derive(Serialize, Deserialize)]
pub struct UnitDefinition {
    pub inherits: Option<String>,
    pub display: DisplayConfig,
    pub buildable: BuildableConfig,
    pub health: HealthConfig,
    pub mobile: Option<MobileConfig>,
    pub combat: Option<CombatConfig>,
}
```

The struct definitions don't change — only the parser crate (`toml` vs `serde_yaml`) and the file extension. A config struct works with both formats during a transition period if needed.

### Alternatives Considered

1. **Keep everything YAML** — Rejected. Loses the instant-recognition benefit. "Is this engine config or game content?" remains unanswerable from the file extension alone.

2. **JSON for configuration** — Rejected. No comments. JSON is hostile to hand-editing — and configuration files MUST be hand-editable by server operators and tournament organizers who aren't developers.

3. **TOML for everything** — Rejected. TOML is painful for deeply nested game data. `[[units.rifle_infantry.combat.weapons]]` is objectively worse than YAML's indented hierarchies for content authoring. TOML was designed for configuration, not data description.

4. **INI for configuration** — Rejected. No nested sections, no typed values, no standard spec, no `serde` support. INI is legacy — it's what original RA used, not what a modern engine should use.

5. **Separate directories instead of separate formats** — Insufficient. A `config/` directory full of `.yaml` files still doesn't tell you at the file level what you're looking at. The format IS the signal.

### Integration with Existing Decisions

- **D003 (Real YAML):** Unchanged for content. YAML remains the content format with `serde_yaml`. D067 narrows D003's scope: YAML is for content, not for everything.
- **D034 (SQLite):** Unaffected. SQLite databases are a third category (structured relational data). The three-format taxonomy is: TOML (config), YAML (content), SQLite (state).
- **D058 (Command Console / Cvars):** Cvars persist to `config.toml` instead of `config.yaml`. The cvar system, key naming, and load order are unchanged.
- **D061 (Data Backup):** `config.toml` replaces `config.yaml` in the data directory layout and backup categories.
- **D063 (Compression):** Compression levels configured in `settings.toml`. `AdvancedCompressionConfig` lives in `server_config.toml` for server operators.
- **D064 (Server Configuration):** `server_config.toml` replaces `server_config.yaml`. All ~200 cvars, deployment profiles, validation CLI, hot reload, and env var mapping work identically — only the file format changes.

### Phase

- **Phase 0:** Convention established. All new configuration files created as `.toml`. `deny.toml` and `Cargo.toml` already comply. Design doc examples use the correct format per D067.
- **Phase 2:** `config.toml` and `settings.toml` are the live client configuration files. Cvar persistence writes to TOML.
- **Phase 5:** `server_config.toml` and server deployment profiles are the live server configuration files. `ic server validate-config` validates TOML.
- **Ongoing:** If a file is created and the author is unsure, apply the boundary test: "Does this affect the simulation or define game content?" → YAML. "Does this configure how software operates?" → TOML.
