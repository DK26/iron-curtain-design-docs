# 09 — Decision Log

Every major design decision, with rationale and alternatives considered. Reference this when revisiting or challenging a decision.

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

**Alternatives considered:**
- C++ (manual memory management, no safety guarantees, build system pain)
- C# (would just be another OpenRA — no differentiation)
- Zig (too immature ecosystem for this scope)

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

## D004: Modding — Lua (Not Python) for Scripting

**Decision:** Use Lua for Tier 2 scripting. Do NOT use Python.

**Rationale against Python:**
- Floating-point non-determinism breaks lockstep multiplayer
- GC pauses (reintroduces the problem Rust solves)
- 50-100x slower than native (hot paths run every tick for every unit)
- Embedding CPython is heavy (~15-30MB)
- Sandboxing is unsolvable — security disaster for community mods

**Rationale for Lua:**
- Tiny runtime (~200KB), designed for embedding
- Deterministic (provide fixed-point bindings, avoid floats)
- Trivially sandboxable (control available functions)
- Industry standard: Factorio, WoW, Dota 2, Roblox
- `mlua`/`rlua` crates are mature
- Any modder can learn in an afternoon

---

## D005: Modding — WASM for Power Users (Tier 3)

**Decision:** WASM modules via `wasmtime`/`wasmer` for advanced mods.

**Rationale:**
- Near-native performance
- Perfectly sandboxed by design
- Deterministic execution (critical for multiplayer)
- Modders can write in Rust, C, Go, AssemblyScript, or Python-to-WASM
- Leapfrogs OpenRA (requires C# for deep mods)

---

## D006: Networking — Pluggable via Trait

**Decision:** Abstract all networking behind a `NetworkModel` trait. Game loop is generic over it.

**Rationale:**
- Sim never touches networking concerns (clean boundary)
- Full testability (run sim with `LocalNetwork`)
- Community can contribute netcode without understanding game logic
- Enables future models: rollback, client-server, cross-engine adapters
- Players could choose model in lobby

**Key invariant:** `ra-sim` has zero imports from `ra-net`. They only share `ra-protocol`.

---

## D007: Networking — Relay Server as Default

**Decision:** Default multiplayer uses relay server with time authority, not pure P2P.

**Rationale:**
- Blocks lag switches (server owns the clock)
- Enables sub-tick chronological ordering (CS2 insight)
- Handles NAT traversal (no port forwarding)
- Enables order validation before broadcast (anti-cheat)
- Signed replays
- Cheap to run (doesn't run sim, just forwards orders)

**Validated by:** C&C Generals/Zero Hour's "packet router" — a client-side star topology where one player collected and rebroadcast all commands. Same concept, but our server-hosted version eliminates host advantage and adds neutral time authority. See `research/generals-zero-hour-netcode-analysis.md`.

**Alternatives available:** Pure P2P lockstep, fog-authoritative server, rollback — all implementable as `NetworkModel` variants.

---

## D008: Sub-Tick Timestamps on Orders

**Decision:** Every order carries a sub-tick timestamp. Orders within a tick are processed in chronological order.

**Rationale (inspired by CS2):**
- Fairer results for edge cases (two players competing for same resource/building)
- Trivial to implement (just attach timestamp at input layer)
- Network model preserves but doesn't depend on timestamps
- If a future model ignores timestamps, no breakage

---

## D009: Simulation — Fixed-Point Math, No Floats

**Decision:** All sim-layer calculations use integer/fixed-point arithmetic. Floats allowed only for rendering interpolation.

**Rationale:**
- Required for deterministic lockstep (floats can produce different results across platforms)
- Original Red Alert used integer math — proven approach
- OpenRA uses `WDist`/`WPos`/`WAngle` with 1024 subdivisions — same principle

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

---

## D011: Cross-Engine Play — Community Layer, Not Sim Layer

**Decision:** Cross-engine compatibility targets data/community layer. NOT bit-identical simulation.

**Rationale:**
- Bit-identical sim requires bug-for-bug reimplementation (that's a port, not our engine)
- Community interop is valuable and achievable: shared server browser, maps, mod format
- Architecture keeps the door open for deeper interop later (OrderCodec, SimReconciler, ProtocolAdapter)
- Progressive levels: shared lobby → replay viewing → casual cross-play → competitive cross-play

---

## D012: Security — Validate Orders in Sim

**Decision:** Every order is validated inside the simulation before execution. Validation is deterministic.

**Rationale:**
- All clients run same validation → agree on rejections → no desync
- Defense in depth with relay server validation
- Repeated rejections indicate cheating (loggable)
- No separate "anti-cheat" system — validation IS anti-cheat

---

## D013: Pathfinding — Trait-Abstracted, Grid Flowfields First

**Decision:** Pathfinding and spatial queries are abstracted behind traits (`Pathfinder`, `SpatialIndex`) in the engine core. The RA1 game module implements them with grid-based flowfields and spatial hash. The engine core never calls grid-specific functions directly.

**Rationale:**
- OpenRA uses basic A* which struggles with large unit groups
- Hierarchical/flowfield pathfinding handles mass movement far better
- Grid-based implementations are the right choice for the isometric C&C family
- But pathfinding is a *game module concern*, not an engine-core assumption
- Abstracting behind a trait costs near-zero now (one trait, one impl) and prevents a rewrite if a future game module needs navmesh or any other spatial model
- Same philosophy as `NetworkModel` (build `LocalNetwork` first, but the seam exists), `WorldPos.z` (costs one `i32`, saves RA2 rewrite), and `InputSource` (build mouse/keyboard first, touch slots in later)

**Concrete design:**
- `Pathfinder` trait: `request_path()`, `get_path()`, `is_passable()`, `invalidate_area()`
- `SpatialIndex` trait: `query_range()`, `update_position()`, `remove()`
- RA1 module registers `GridFlowfieldPathfinder` + `GridSpatialHash`
- All sim systems call the traits, never grid-specific data structures
- See `02-ARCHITECTURE.md` § "Pathfinding & Spatial Queries" for trait definitions

**Performance:** identical to hardcoding. Rust traits monomorphize — the trait call compiles to a direct function call when there's one implementation. Zero overhead.

**What we build now:** Only grid flowfields and spatial hash. The traits exist from day one; alternative implementations are future work (by us or by the community).

---

## D014: Templating — Tera in Phase 6a (Nice-to-Have)

**Decision:** Add Tera template engine for YAML/Lua generation. Phase 6a. Not foundational.

**Rationale:**
- Eliminates copy-paste for faction variants, bulk unit generation
- Load-time only (zero runtime cost)
- ~50 lines to integrate
- Optional — no mod depends on it

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

## D016: LLM-Generated Missions and Campaigns

**Decision:** Provide an optional LLM-powered mission generation system (Phase 7) via the `ra-llm` crate. Players bring their own LLM provider (BYOLLM) — the engine never ships or requires one. Every game feature works fully without an LLM configured.

**Rationale:**
- Transforms Red Alert from finite content to infinite content — for players who opt in
- Generated output is standard YAML + Lua — fully editable, shareable, learnable
- No other RTS (Red Alert or otherwise) offers this capability
- LLM quality is sufficient for terrain layout, objective design, AI behavior scripting
- **Strictly optional:** `ra-llm` crate is optional, game works without it. No feature — campaigns, skirmish, multiplayer, modding, analytics — depends on LLM availability. The LLM enhances the experience; it never gates it

**Scope:**
- Phase 7: single mission generation (terrain, objectives, enemy composition, triggers, briefing)
- Phase 7: player-aware generation — LLM reads local SQLite (D034) for faction history, unit preferences, win rates, campaign roster state; injects player context into prompts for personalized missions, adaptive briefings, post-match commentary, coaching suggestions, and rivalry narratives
- Future: multi-mission campaigns, adaptive difficulty, cooperative scenario design

> **Positioning note:** LLM features are a quiet power-user capability, not a project headline. The primary single-player story is the hand-authored branching campaign system (D021), which requires no LLM and is genuinely excellent on its own merits. LLM generation is for players who want more content — it should never appear before D021 in marketing or documentation ordering. The word “AI” in gaming contexts attracts immediate hostility from a significant audience segment regardless of implementation quality. Lead with campaigns, reveal LLM as “also, modders and power users can use AI tools if they want.”

**Implementation approach:**
- LLM generates YAML map definition + Lua trigger scripts
- Same format as hand-crafted missions — no special runtime
- Validation pass ensures generated content is playable (valid unit types, reachable objectives)
- Can use local models or API-based models (user choice)
- Player data for personalization comes from local SQLite queries (read-only) — no data leaves the device unless the user's LLM provider is cloud-based (BYOLLM architecture)

**Bring-Your-Own-LLM (BYOLLM) architecture:**
- `ra-llm` defines a `LlmProvider` trait — any backend that accepts a prompt and returns structured text
- Built-in providers: OpenAI-compatible API, local Ollama/llama.cpp, Anthropic API
- Users configure their provider in settings (API key, endpoint, model name)
- The engine never ships or requires a specific model — the user chooses
- Provider is a runtime setting, not a compile-time dependency
- All prompts and responses are logged (opt-in) for debugging and sharing
- Offline mode: pre-generated content works without any LLM connection

---

## D017: Bevy Rendering Pipeline — Classic Base, Modding Possibilities

**Decision:** Use Bevy's rendering pipeline (wgpu) to faithfully reproduce the classic Red Alert isometric aesthetic. Bevy's more advanced rendering capabilities (shaders, post-processing, dynamic lighting, particles, 3D) are available as modding infrastructure — not as base game goals.

**Rationale:**
- The core rendering goal is a faithful classic Red Alert clone: isometric sprites, palette-aware shading, fog of war
- Bevy + wgpu provides this solidly via 2D sprite batching and the isometric layer
- Because Bevy includes a full rendering pipeline, advanced visual capabilities (bloom, color grading, GPU particles, dynamic lighting, custom shaders) are **passively available** to modders without extra engine work
- This enables community-created visual enhancements: shader effects for chrono-shift, tesla arcs, weather particles, or even full 3D rendering mods (see D018, `02-ARCHITECTURE.md` § "3D Rendering as a Mod")
- Render quality tiers (Baseline → Ultra) automatically degrade for older hardware — the base classic aesthetic works on all tiers

**Scope:**
- Phase 1: faithful isometric tile renderer, sprite animation, shroud, camera — showcase optional post-processing prototypes to demonstrate modding potential
- Phase 3+: rendering supports whatever the game chrome needs
- Phase 7: visual modding infrastructure (particle systems, shader library, weather rendering) — tools for modders, not base game goals

**Design principle:** The base game looks like Red Alert. Modders can make it look like whatever they want.

---

## D018: Multi-Game Extensibility (Game Modules)

**Decision:** Design the engine as a game-agnostic RTS framework. Red Alert is the first "game module"; RA2, Tiberian Dawn, and original games should be addable as additional modules without modifying core engine code.

**Rationale:**
- OpenRA already proves this works — runs TD, RA, and D2K on one engine via different trait/component sets
- The ECS architecture naturally supports this (composable components, pluggable systems)
- Prevents RA1 assumptions from hardening into architectural constraints that require rewrites later
- Broadens the project's audience and contributor base
- RA2 is the most-requested extension — community interest is proven (Chrono Divide exists)

**Concrete changes (baked in from Phase 0):**
1. `WorldPos` carries a Z coordinate from day one (RA1 sets z=0). `CellPos` is a game-module convenience for grid-based games, not an engine-core type.
2. System execution order is registered per game module, not hardcoded in engine
3. No game-specific enums in engine core — resource types, unit categories come from YAML / module registration
4. Renderer uses a `Renderable` trait — sprite and voxel backends implement it equally
5. Pathfinding uses a `Pathfinder` trait — grid flowfields are the RA1 impl; navmesh could slot in without touching sim
6. Spatial queries use a `SpatialIndex` trait — spatial hash is the RA1 impl; BVH/R-tree could slot in without touching combat/targeting
7. `GameModule` trait bundles component registration, system pipeline, pathfinder, spatial index, format loaders, and render backends
8. `PlayerOrder` is extensible to game-specific commands

**What this does NOT mean:**
- We don't build RA2 support now. Red Alert is the sole focus until it ships.
- We don't add speculative abstractions. Only the eight concrete changes above.
- We don't rename crates from `ra-*` — the project identity is Red Alert. Game modules extend it.

**Scope boundary — current targets vs. architectural openness:**
First-party game module development targets the isometric C&C family: Red Alert, RA2, Tiberian Sun, Tiberian Dawn, Dune 2000. These share the isometric camera, grid-based terrain, sprite/voxel rendering, and `.mix` format lineage. We build only grid-based pathfinding and isometric rendering today.

**3D titles (Generals, C&C3, RA3) are not current targets** but the architecture deliberately avoids closing doors. With pathfinding (`Pathfinder` trait), spatial queries (`SpatialIndex` trait), rendering (`Renderable` trait), camera (`ScreenToWorld` trait), and format loading (`FormatRegistry`) all behind pluggable abstractions, a Generals-class game module would provide its own implementations of these traits while reusing the sim core, networking, modding infrastructure, workshop, competitive systems, replays, and save games. The traits exist from day one — the cost is near-zero, and the benefit is that neither we nor the community need to fork the engine to explore continuous-space games in the future.

See `02-ARCHITECTURE.md` § "Architectural Openness: Beyond Isometric" for the full trait-by-trait breakdown.

However, **3D rendering mods for isometric-family games are explicitly supported.** A "3D Red Alert" Tier 3 mod can replace sprites with GLTF meshes and the isometric camera with a free 3D camera — without changing the sim, networking, or pathfinding. Bevy's built-in 3D pipeline makes this feasible. Cross-view multiplayer (2D vs 3D players in the same game) works because the sim is view-agnostic. See `02-ARCHITECTURE.md` § "3D Rendering as a Mod".

**Phase:** Baked into architecture from Phase 0. RA2 module is a potential Phase 8+ project.

> **Expectation management:** The community’s most-requested feature is RA2 support. The architecture deliberately supports it (game-agnostic traits, extensible ECS, pluggable pathfinding), but **RA2 is a future community goal, not a scheduled deliverable.** No timeline, staffing, or exit criteria exist for any game module beyond RA1. When the community reads “game-agnostic,” they should understand: the architecture won’t block RA2, but nobody is building it yet.

---

## D019: Switchable Balance Presets (Classic RA vs OpenRA)

**Decision:** Ship multiple balance presets as first-class YAML rule sets. Default to classic Red Alert values from the EA source code. OpenRA balance available as an alternative preset. Selectable per-game in lobby.

**Rationale:**
- Original Red Alert's balance makes units feel **powerful and iconic** — Tanya, MiGs, Tesla Coils, V2 rockets are devastating. This is what made the game memorable.
- OpenRA rebalances toward competitive fairness, which can dilute the personality of iconic units. Valid for tournaments, wrong as a default.
- The community is split on this. Rather than picking a side, expose it as a choice.
- Presets are just alternate YAML files loaded at game start — zero engine complexity. The modding system already supports this via inheritance and overrides.
- The Remastered Collection made its own subtle balance tweaks — worth capturing as a third preset.

**Implementation:**
- `rules/presets/classic/` — unit/weapon/structure values from EA source code (default)
- `rules/presets/openra/` — values matching OpenRA's current balance
- `rules/presets/remastered/` — values matching the Remastered Collection
- Preset selection exposed in lobby UI and stored in game settings
- Presets use YAML inheritance: only override fields that differ from `classic`
- Multiplayer: all players must use the same preset (enforced by lobby, validated by sim)
- Custom presets: modders can create new presets as additional YAML directories

**What this is NOT:**
- Not a "difficulty setting" — both presets play at normal difficulty
- Not a mod — it's a first-class game option, no workshop download required
- Not just multiplayer — applies to skirmish and campaign too

**Alternatives considered:**
- Only ship classic values (rejected — alienates OpenRA competitive community)
- Only ship OpenRA values (rejected — loses the original game's personality)
- Let mods handle it (rejected — too important to bury in the modding system; should be one click in settings)

**Phase:** Phase 2 (balance values extracted during simulation implementation).

---

### D020 — Mod SDK with `ic` CLI Tool

**Decision:** Ship a Mod SDK as a `cargo-generate` template + an `ic` CLI tool, inspired by (and improving on) the [OpenRA Mod SDK](https://github.com/OpenRA/OpenRAModSDK).

**Context:** The OpenRA Mod SDK is a template repository modders fork. It bundles shell scripts (`fetch-engine.sh`, `launch-game.sh`, `utility.sh`), a `Makefile`/`make.cmd` build system, and a `packaging/` directory with per-platform installer scripts. The approach works — it's the standard way to create OpenRA mods. But it has significant friction: requires .NET SDK, custom C# DLLs for anything beyond data changes, MiniYAML with no validation tooling, GPL contamination on mod code, and no distribution system beyond manual file sharing.

**What we adapt:**

| Concept            | OpenRA SDK                                         | Iron Curtain                                     |
| ------------------ | -------------------------------------------------- | ------------------------------------------------ |
| Starting point     | Fork a template repo                               | `ic mod init [template]` via `cargo-generate`    |
| Engine version pin | `ENGINE_VERSION` in `mod.config`                   | `engine.version` in `mod.yaml` with semver       |
| Engine management  | `fetch-engine.sh` downloads + compiles from source | Engine ships as binary crate, auto-resolved      |
| Build/run          | `Makefile` + shell scripts (requires Python, .NET) | `ic` CLI — single Rust binary, zero dependencies |
| Mod manifest       | `mod.yaml` in MiniYAML                             | `mod.yaml` in real YAML with typed serde schema  |
| Validation         | `utility.sh --check-yaml`                          | `ic mod check` — YAML + Lua + WASM validation    |
| Packaging          | `packaging/` shell scripts → .exe/.app/.AppImage   | `ic mod package` + workshop publish              |
| Dedicated server   | `launch-dedicated.sh`                              | `ic mod server`                                  |
| Directory layout   | Convention-based (chrome/, rules/, maps/, etc.)    | Adapted for three-tier model                     |
| IDE support        | `.vscode/` in repo                                 | VS Code extension with YAML schema + Lua LSP     |

**What we don't adapt (pain points we solve differently):**
- C# DLLs for custom traits → our Lua + WASM tiers are strictly better (no compilation, sandboxed, polyglot)
- GPL license contamination → WASM sandbox means mod code is isolated; engine license doesn't infect mods
- MiniYAML → real YAML with `serde_yaml`, JSON Schema, standard linters
- No hot-reload → Lua and YAML hot-reload during `ic mod watch`
- No workshop → built-in workshop with `ic mod publish`

**The `ic` CLI tool:**
A single Rust binary replacing OpenRA's shell scripts + Makefile + Python dependencies:

```
ic mod init [template]     # scaffold from template
ic mod check               # validate all mod content
ic mod test                # headless smoke test
ic mod run                 # launch game with mod
ic mod server              # dedicated server
ic mod package             # build distributables
ic mod publish             # workshop upload
ic mod watch               # hot-reload dev mode
ic mod lint                # convention + llm: metadata checks
ic mod update-engine       # bump engine version
```

**Mod templates (built-in):**
- `data-mod` — YAML-only balance/cosmetic mods
- `scripted-mod` — missions and custom game modes (YAML + Lua)
- `total-conversion` — full layout with WASM scaffolding
- `map-pack` — map collections
- `asset-pack` — sprites, sounds, video packs

**Rationale:**
- OpenRA's SDK validates the template-project approach — modders want a turnkey starting point
- Engine version pinning is essential — mods break when engine updates; semver solves this cleanly
- A CLI tool is more portable, discoverable, and maintainable than shell scripts + Makefiles
- Workshop integration from the CLI closes the "last mile" — OpenRA modders must manually distribute their work
- The three-tier modding system means most modders never compile anything — `ic mod init data-mod` gives you a working mod instantly

**Alternatives considered:**
- Shell scripts like OpenRA (rejected — cross-platform pain, Python/shell dependencies, fragile)
- Cargo workspace (rejected — mods aren't Rust crates; YAML/Lua mods have nothing to compile)
- In-engine mod editor only (rejected — power users want filesystem access and version control)
- No SDK, just documentation (rejected — OpenRA proves that a template project dramatically lowers the barrier)

**Phase:** Phase 6a (Core Modding + Scenario Editor). CLI prototype in Phase 4 (for Lua scripting development).

---

### D021 — Branching Campaign System with Persistent State

**Decision:** Campaigns are directed graphs of missions with named outcomes, branching paths, persistent unit rosters, and continuous flow — not linear sequences with binary win/lose. Failure doesn't end the campaign; it branches to a different path. Unit state, equipment, and story flags persist across missions.

**Context:** OpenRA's campaigns are disconnected — each mission is standalone, you exit to menu after completion, there's no sense of flow or consequence. The original Red Alert had linear progression with FMV briefings but no branching or state persistence. Games like Operation Flashpoint: Cold War Crisis showed that branching outcomes create dramatically more engaging campaigns, and OFP: Resistance proved that persistent unit rosters (surviving soldiers, captured equipment, accumulated experience) create deep emotional investment.

**Key design points:**

1. **Campaign graph:** Missions are nodes in a directed graph. Each mission has named outcomes (not just win/lose). Each outcome maps to a next-mission node, forming branches and convergences. The graph is defined in YAML and validated at load time.

2. **Named outcomes:** Lua scripts signal completion with a named key: `Campaign.complete("victory_bridge_intact")`. The campaign YAML maps each outcome to the next mission. This enables rich branching: "Won cleanly" → easy path, "Won with heavy losses" → harder path, "Failed" → fallback mission.

3. **Failure continues the game:** A `defeat` outcome is just another edge in the graph. The campaign designer decides what happens: retry with fewer resources, branch to a retreating mission, skip ahead with consequences, or even "no game over" campaigns where the story always continues.

4. **Persistent unit roster (OFP: Resistance model):**
   - Surviving units carry forward between missions (configurable per transition)
   - Units accumulate veterancy across missions — a veteran tank from mission 1 stays veteran in mission 5
   - Dead units are gone permanently — losing veterans hurts
   - Captured enemy equipment joins a persistent equipment pool
   - Five carryover modes: `none`, `surviving`, `extracted` (only units in evac zone), `selected` (Lua picks), `custom` (full Lua control)

5. **Story flags:** Arbitrary key-value state writable from Lua, readable in subsequent missions. Enables conditional content: "If the radar was captured in mission 2, it provides intel in mission 4."

6. **Campaign state is serializable:** Fits D010 (snapshottable sim state). Save games capture full campaign progress including roster, flags, and path taken. Replays can replay entire campaign runs.

7. **Continuous flow:** Briefing → mission → debrief → next mission. No exit to menu between levels unless the player explicitly quits.

**Rationale:**
- OpenRA's disconnected missions are its single biggest single-player UX failure — universally cited in community feedback
- OFP proved persistent rosters create investment: players restart missions to save a veteran soldier
- Branching eliminates the frustration of replaying the same mission on failure — the campaign adapts
- YAML graph definition is accessible to modders (Tier 1) and LLM-generable
- Lua campaign API enables complex state logic while staying sandboxed
- The same system works for hand-crafted campaigns, modded campaigns, and LLM-generated campaigns

**Alternatives considered:**
- Linear mission sequence like RA1 (rejected — primitive, no replayability, failure is frustrating)
- Disconnected missions like OpenRA (rejected — the specific problem we're solving)
- Full open-world (rejected — scope too large, not appropriate for RTS)
- Only branching on win/lose (rejected — named outcomes are trivially more expressive with no added complexity)
- No unit persistence (rejected — OFP: Resistance proves this is the feature that creates campaign investment)

**Phase:** Phase 4 (AI & Single Player). Campaign graph engine and Lua Campaign API are core Phase 4 deliverables. The visual Campaign Editor in D038 (Phase 6b) builds on this system — D021 provides the sim-side engine, D038 provides the visual authoring tools.

---

### D022 — Dynamic Weather with Terrain Surface Effects

**Decision:** Weather transitions dynamically during gameplay via a deterministic state machine, and terrain textures visually respond to weather — snow accumulates on the ground, rain darkens/wets surfaces, sunshine dries them out. Terrain surface state optionally affects gameplay (movement penalties on snow/ice/mud).

**Context:** The base weather system (static per-mission, GPU particles + sim modifiers) provides atmosphere but doesn't evolve. Real-world weather changes. A mission that starts sunny and ends in a blizzard is vastly more dramatic — and strategically different — than one where weather is set-and-forget.

**Key design points:**

1. **Weather state machine (sim-side):** `WeatherState` resource tracks current type, intensity (fixed-point `0..1024`), and transition progress. Three schedule modes: `cycle` (deterministic round-robin), `random` (seeded from match, deterministic), `scripted` (Lua-driven only). State machine graph and transition weights defined in map YAML.

2. **Terrain surface state (sim-side):** `TerrainSurfaceGrid` — a per-cell grid of `SurfaceCondition { snow_depth, wetness }`. Updated every tick by `weather_surface_system`. Fully deterministic, derives `Serialize, Deserialize` for snapshots. When `sim_effects: true`, surface state modifies movement: deep snow slows infantry/vehicles, ice makes water passable, mud bogs wheeled units.

3. **Terrain texture effects (render-side):** Three quality tiers — palette tinting (free, no assets needed), overlay sprites (moderate, one extra pass), shader blending (GPU blend between base + weather variant textures). Selectable via `RenderSettings`. Accumulation is gradual and spatially non-uniform (snow appears on edges/roofs first, puddles in low cells first).

4. **Composes with day/night and seasons:** Overcast days are darker, rain at night is near-black with lightning flashes. Map `temperature.base` controls whether precipitation is rain or snow. Arctic/desert/tropical maps set different defaults.

5. **Fully moddable:** YAML defines schedules and surface rates (Tier 1). Lua triggers transitions and queries surface state (Tier 2). WASM adds custom weather types like ion storms (Tier 3).

**Rationale:**
- No other C&C engine has dynamic weather that affects terrain visuals — unique differentiator
- Deterministic state machine preserves lockstep (same seed = same weather progression on all clients)
- Sim/render split respected: surface state is sim (deterministic), visual blending is render (cosmetic)
- Palette tinting tier ensures even low-end devices and WASM can show weather effects
- Gameplay effects are optional per-map — purely cosmetic weather is valid
- Surface state fits the snapshot system (D010) for save games and replays
- Weather schedules are LLM-generable — "generate a mission where weather gets progressively worse"

**Performance:**
- Palette tinting: zero extra draw calls, negligible GPU cost
- Surface state grid: ~2 bytes per cell (compact fixed-point) — a 128×128 map is 32KB
- `weather_surface_system` is O(cells) but amortizable (update every 4 ticks for non-visible cells)
- Follows efficiency pyramid: algorithmic (grid lookup) → cache-friendly (contiguous array) → amortized

**Alternatives considered:**
- Static weather only (rejected — misses dramatic potential, no terrain response)
- Client-side random weather (rejected — breaks deterministic sim, desync risk)
- Full volumetric weather simulation (rejected — overkill, performance cost, not needed for isometric RTS)
- Always-on sim effects (rejected — weather-as-decoration is valid for casual/modded games)

**Phase:** Phase 3 (visual effects) for render-side; Phase 2 (sim implementation) for weather state machine and surface grid.

---

### D023 — OpenRA Vocabulary Compatibility Layer

**Decision:** Accept OpenRA trait names and YAML keys as aliases in our YAML parser. Both OpenRA-style names (e.g., `Armament`, `Valued`, `Buildable`) and IC-native names (e.g., `combat`, `buildable.cost`) resolve to the same ECS components. Unconverted OpenRA YAML loads with a deprecation warning.

**Context:** The biggest migration barrier for the 80% YAML tier isn't missing features — it's naming divergence. Every renamed concept multiplies across thousands of mod files. OpenRA modders have years of muscle memory with trait names and YAML keys. Forcing renames creates friction that discourages adoption.

**Key design points:**

1. **Alias registry:** `ra-formats` maintains a compile-time map of OpenRA trait names to IC component names. `Armament` → `combat`, `Valued` → `buildable.cost`, `AttackOmni` → `combat.mode: omni`, etc.
2. **Bi-directional:** The alias registry is used during YAML parsing (OpenRA names accepted) and by the `miniyaml2yaml` converter (produces IC-native names). Both representations are valid.
3. **Deprecation warnings:** When an OpenRA alias is used, the parser emits a warning: `"Armament" is accepted but deprecated; prefer "combat"`. Warnings can be suppressed per-mod via `mod.yaml` setting.
4. **No runtime cost:** Aliases resolve during YAML deserialization (load time only). The ECS never sees alias names — only canonical IC component types.

**Rationale:**
- Reduces the YAML migration from "convert everything" to "drop in and play, clean up later"
- Respects invariant #8 ("the community's existing work is sacred") at the data vocabulary layer, not just binary formats
- Zero runtime cost — purely a deserialization convenience
- Makes `miniyaml2yaml` output immediately usable even without manual cleanup
- Modders can learn IC-native names gradually as they edit files

**Alternatives considered:**
- IC-native names only (rejected — unnecessary migration barrier for thousands of existing mod files)
- Adopt OpenRA's names wholesale (rejected — some OpenRA names are poorly chosen or C#-specific; IC benefits from cleaner naming)
- Converter handles everything (rejected — modders still need to re-learn names for new content; aliases let them use familiar names forever)

**Phase:** Phase 0 (alias registry built alongside `ra-formats` YAML parser). Phase 6a (deprecation warnings configurable in `mod.yaml`).

---

### D024 — Lua API Superset of OpenRA

**Decision:** Iron Curtain's Lua scripting API is a strict superset of OpenRA's 16 global objects. Same function names, same parameter signatures, same return types. OpenRA Lua missions run unmodified. IC then extends with additional functionality.

**Context:** OpenRA has a mature Lua API used in hundreds of campaign missions across all C&C game mods. Combined Arms alone has 34 Lua-scripted missions. The mod migration doc (12-MOD-MIGRATION.md) identified "API compatibility shim" as a migration requirement — this decision elevates it from "nice to have" to "hard requirement."

**OpenRA's 16 globals (all must work identically in IC):**

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

**IC extensions (additions, not replacements):**

| Global     | Purpose                         |
| ---------- | ------------------------------- |
| `Campaign` | Branching campaign state (D021) |
| `Weather`  | Dynamic weather control (D022)  |
| `Workshop` | Mod metadata queries            |
| `LLM`      | LLM integration hooks (Phase 7) |

**Actor properties also match:** Each actor reference exposes properties matching OpenRA's property groups (`.Health`, `.Location`, `.Owner`, `.Move()`, `.Attack()`, `.Stop()`, `.Guard()`, `.Deploy()`, etc.) with identical semantics.

**Rationale:**
- CA's 34 missions + hundreds of community missions work on day one — no porting effort
- Reduces Lua migration from "moderate effort" to "zero effort" for standard missions
- IC's extensions are additive — no conflicts, no breaking changes
- Modders who know OpenRA Lua immediately know IC Lua
- Future OpenRA missions created by the community are automatically IC-compatible

**Alternatives considered:**
- Design our own API, provide shim (rejected — shim is always leaky, creates two mental models)
- Partial compatibility (rejected — partial breaks are worse than full breaks; either missions work or they don't)
- No Lua compatibility (rejected — throws away hundreds of community missions for no gain)

**Phase:** Phase 4 (Lua scripting implementation). API surface documented during Phase 2 planning.

---

### D025 — Runtime MiniYAML Loading

**Decision:** Support loading MiniYAML directly at runtime as a fallback format in `ra-formats`. When the engine encounters tab-indented files with `^` inheritance or `@` suffixes, it auto-converts in memory. The `miniyaml2yaml` CLI converter still exists for permanent migration, but is no longer a prerequisite for loading mods.

**Revision of D003:** D003 ("Real YAML, not MiniYAML") remains the canonical format. All IC-native content uses standard YAML. D025 adds a compatibility loader — it does not change what IC produces, only what it accepts.

**Key design points:**

1. **Format detection:** `ra-formats` checks the first few lines of each file. Tab-indented content with no YAML indicators triggers the MiniYAML parser path.
2. **In-memory conversion:** MiniYAML is parsed to an intermediate tree, then resolved to standard YAML structs. The result is identical to what `miniyaml2yaml` would produce.
3. **Combined with D023:** OpenRA trait name aliases (D023) apply after MiniYAML parsing — so the full chain is: MiniYAML → intermediate tree → alias resolution → typed Rust structs.
4. **Performance:** Conversion adds ~10-50ms per mod at load time (one-time cost). Cached after first load.
5. **Warning output:** Console logs `"Loaded MiniYAML file rules.yaml — consider converting to standard YAML with 'ic mod convert'"`.

**Rationale:**
- Turns "migrate then play" into "play immediately, migrate when ready"
- Existing OpenRA mods become testable on IC within minutes, not hours
- Respects invariant #8 — the community's existing work is sacred, including their file formats
- The converter CLI still exists for modders who want clean IC-native files
- No performance impact after initial load (conversion result is cached)

**Alternatives considered:**
- Require pre-conversion (original plan — rejected as unnecessary friction; the converter runs in memory just as well as on disk)
- Support MiniYAML as a first-class format permanently (rejected — standard YAML is strictly better for tooling, validation, and editor support)
- Only support converted files (rejected — blocks quick experimentation and casual mod testing)

**Phase:** Phase 0 (MiniYAML parser already needed for `miniyaml2yaml`; making it a runtime loader is minimal additional work).

---

### D026 — OpenRA Mod Manifest Compatibility

**Decision:** `ra-formats` can parse OpenRA's `mod.yaml` manifest format and auto-map it to IC's mod structure at load time. Combined with D023 (aliases), D024 (Lua API), and D025 (MiniYAML loading), this means a modder can point IC at an existing OpenRA mod directory and it loads — no restructuring needed.

**Key design points:**

1. **Manifest parsing:** OpenRA's `mod.yaml` declares `Packages`, `Rules`, `Sequences`, `Cursors`, `Chrome`, `Assemblies`, `ChromeLayout`, `Weapons`, `Voices`, `Notifications`, `Music`, `Translations`, `MapFolders`, `SoundFormats`, `SpriteFormats`. IC maps each section to its equivalent concept.
2. **Directory convention mapping:** OpenRA mods use `rules/`, `maps/`, `sequences/` etc. IC maps these to its own layout at load time without copying files.
3. **Unsupported sections flagged:** `Assemblies` (C# DLLs) cannot load — these are flagged as warnings listing which custom traits are unavailable and what WASM alternatives exist.
4. **Partial loading:** A mod with unsupported C# traits still loads — units using those traits get a visual placeholder and a "missing trait" debug overlay. The mod is playable with reduced functionality.
5. **`ic mod import`:** CLI command that reads an OpenRA mod directory and generates an IC-native `mod.yaml` with proper structure, converting files to standard YAML and flagging C# dependencies for WASM migration.

**Rationale:**
- Combined with D023/D024/D025, this completes the "zero-friction import" pipeline
- Modders can evaluate IC as a target without committing to migration
- Partial loading means even mods with C# dependencies are partially testable
- The `ic mod import` command provides a clean migration path when the modder is ready
- Validates our claim that "the community's existing work is sacred"

**Alternatives considered:**
- Require manual mod restructuring (rejected — unnecessary friction, blocks adoption)
- Only support IC mod format (rejected — makes evaluation impossible without migration effort)
- Full C# trait loading via .NET interop (rejected — violates D001/D002, reintroduces the problems Rust solves)

**Phase:** Phase 0 (manifest parsing) + Phase 6a (full `ic mod import` workflow).

---

### D027 — Canonical Enum Compatibility with OpenRA

**Decision:** Use OpenRA's canonical enum names for locomotor types, armor types, target types, damage states, and other enumerated values — or accept both OpenRA and IC-native names via the alias system (D023).

**Specific enums aligned:**

| Enum Type    | OpenRA Names                                                | IC Accepts       |
| ------------ | ----------------------------------------------------------- | ---------------- |
| Locomotor    | `Foot`, `Wheeled`, `Tracked`, `Float`, `Fly`                | Same (canonical) |
| Armor        | `None`, `Light`, `Medium`, `Heavy`, `Wood`, `Concrete`      | Same (canonical) |
| Target Type  | `Ground`, `Air`, `Water`, `Underground`                     | Same (canonical) |
| Damage State | `Undamaged`, `Light`, `Medium`, `Heavy`, `Critical`, `Dead` | Same (canonical) |
| Stance       | `AttackAnything`, `Defend`, `ReturnFire`, `HoldFire`        | Same (canonical) |
| UnitType     | `Building`, `Infantry`, `Vehicle`, `Aircraft`, `Ship`       | Same (canonical) |

**Why this matters:** The `Versus` damage table — which modders spend 80% of their balance time tuning — uses armor type names as keys. Locomotor types determine pathfinding behavior. Target types control weapon targeting. If these don't match, every single weapon definition, armor table, and locomotor reference needs translation. By matching names, these definitions copy-paste directly.

**Rationale:**
- Eliminates an entire category of conversion mapping
- Versus tables, weapon definitions, locomotor configs — all transfer without renaming
- OpenRA's names are reasonable and well-known in the community
- No technical reason to rename these — they describe the same concepts
- Where IC needs additional values (e.g., `Hover`, `Amphibious`), they extend the enum without conflicting

**Phase:** Phase 2 (when enum types are formally defined in `ra-sim`).

---

### D028 — Condition and Multiplier Systems as Phase 2 Requirements

**Decision:** The condition system and multiplier system identified as P0 critical gaps in `11-OPENRA-FEATURES.md` are promoted to hard Phase 2 exit criteria. Phase 2 cannot ship without both systems implemented and tested.

**What this adds to Phase 2:**

1. **Condition system:**
   - `Conditions` component: `HashMap<ConditionId, u32>` (ref-counted named conditions per entity)
   - Condition sources: `GrantConditionOnMovement`, `GrantConditionOnDamageState`, `GrantConditionOnDeploy`, `GrantConditionOnAttack`, `GrantConditionOnTerrain`, `GrantConditionOnVeterancy` — exposed in YAML
   - Condition consumers: any component field can declare `requires:` or `disabled_by:` conditions
   - Runtime: systems check `conditions.is_active("deployed")` via fast bitset or hash lookup

2. **Multiplier system:**
   - `StatModifiers` component: per-entity stack of `(source, stat, modifier_value, condition)`
   - Every numeric stat (speed, damage, range, reload, build time, build cost, sight range, etc.) resolves through the modifier stack
   - Modifiers from: veterancy, terrain, crates, conditions, player handicaps
   - Fixed-point multiplication (no floats)
   - YAML-configurable: modders add multipliers without code

3. **Full damage pipeline:**
   - Armament → Projectile entity → travel → impact → Warhead(s) → armor-versus-weapon table → DamageMultiplier resolution → Health reduction
   - Composable warheads: each weapon can trigger multiple warheads (damage + condition + terrain effect)

**Rationale:**
- Without conditions, 80% of OpenRA YAML mods cannot express their behavior at all — conditions are the fundamental modding primitive
- Without multipliers, veterancy/crates/terrain bonuses don't work — critical gameplay systems are broken
- Without the full damage pipeline, weapons are simplistic and balance modding is impossible
- These three systems are the foundation that P1–P3 features build on (stealth, veterancy, transport, support powers all use conditions and multipliers)
- Promoting from "identified gap" to "exit criteria" ensures they're not deferred

**Phase:** Phase 2 (hard exit criteria — no Phase 3 starts without these).

---

### D029 — Cross-Game Component Library (Phase 2 Targets)

**Decision:** The seven first-party component systems identified in `12-MOD-MIGRATION.md` (from Combined Arms and Remastered case studies) are Phase 2 targets. They are high priority and independently scoped — any that don't land by Phase 2 exit are early Phase 3 work, not deferred indefinitely. (The D028 systems — conditions, multipliers, damage pipeline — are the hard Phase 2 gate; see `08-ROADMAP.md` § Phase 2 exit criteria.)

**The seven systems:**

| System                   | Needed For                                  | Phase 2 Scope                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mind Control**         | CA (Yuri), RA2 game module, Scrin           | Controller/controllable components, capacity limits, override                                                                                                                                                                                                    |
| **Carrier/Spawner**      | CA, RA2 (Aircraft Carrier, Kirov drones)    | Master/slave with respawn, recall, autonomous attack                                                                                                                                                                                                             |
| **Teleport Networks**    | CA, Nod tunnels (TD/TS), Chronosphere       | Multi-node network with primary exit designation                                                                                                                                                                                                                 |
| **Shield System**        | CA, RA2 force shields, Scrin                | Absorb-before-health, recharge timer, depletion                                                                                                                                                                                                                  |
| **Upgrade System**       | CA, C&C3 game module                        | Per-unit tech research via building, condition grants                                                                                                                                                                                                            |
| **Delayed Weapons**      | CA (radiation, poison), RA2 (terror drones) | Timer-attached effects on targets                                                                                                                                                                                                                                |
| **Dual Asset Rendering** | Remastered recreation, HD mod packs         | Superseded by the Resource Pack system (`04-MODDING.md` § "Resource Packs") which generalizes this to N asset tiers, not just two. Phase 2 scope: `ra-render` supports runtime-switchable asset source per entity; Resource Pack manifests resolve at load time. |

**Rationale:**
- These aren't CA-specific — they're needed for RA2 (the likely second game module). Building them in Phase 2 means they're available when RA2 development starts.
- CA can migrate to IC the moment the engine is playable, rather than waiting for Phase 6a
- Without these as built-in components, CA modders would need to write WASM for basic mechanics like mind control — unacceptable for adoption
- The seven systems cover ~60% of CA's custom C# code — collapsing the WASM tier from ~15% to ~5% of migration effort
- Each system is independently useful and well-scoped (2-5 days engineering each)

**Impact on migration estimates:**

| Migration Tier | Before D029 | After D029 |
| -------------- | ----------- | ---------- |
| Tier 1 (YAML)  | ~40%        | ~45%       |
| Built-in       | ~30%        | ~40%       |
| Tier 2 (Lua)   | ~15%        | ~10%       |
| Tier 3 (WASM)  | ~15%        | ~5%        |

**Phase:** Phase 2 (sim-side components and dual asset rendering in `ra-render`).

---

## D030: Workshop Resource Registry & Dependency System

**Decision:** The Workshop operates as a crates.io-style resource registry where any game asset — music, sprites, textures, cutscenes, maps, sound effects, palettes, voice lines, UI themes, templates — is publishable as an independent, versioned, licensable resource that others (including LLM agents) can discover, depend on, and pull automatically.

**Rationale:**
- OpenRA has no resource sharing infrastructure — modders copy-paste files, share on forums, lose attribution
- Individual resources (a single music track, one sprite sheet) should be as easy to publish and consume as full mods
- A dependency system eliminates duplication: five mods that need the same HD sprite pack declare it as a dependency instead of each bundling 200MB of sprites
- License metadata protects community creators and enables automated compatibility checking
- LLM agents generating missions need a way to discover and pull community assets without human intervention
- The mod ecosystem grows faster when building blocks are reusable — this is why npm/crates.io/pip changed their respective ecosystems
- CI/CD-friendly publishing (headless CLI, scoped API tokens) lets serious mod teams automate their release pipeline — no manual uploads

**Key Design Elements:**

### Phased Delivery Strategy

The Workshop design below is comprehensive, but it ships incrementally:

| Phase     | Scope                                                                                                                                                                       | Complexity   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Phase 4–5 | **Minimal viable Workshop:** Central IC server + `ic mod publish` + `ic mod install` + in-game browser + auto-download on lobby join                                        | Medium       |
| Phase 6a  | **Full Workshop:** Federation, community servers, replication, promotion channels, CI/CD token scoping, creator reputation, DMCA process, Steam Workshop as optional source | High         |
| Phase 7+  | **Advanced:** LLM-driven discovery, premium hosting tiers                                                                                                                   | Low priority |

The Artifactory-level federation design is the end state, not the MVP. Ship simple, iterate toward complex.

### Resource Identity & Versioning

Every Workshop resource gets a globally unique identifier: `namespace/name@version`.

- **Namespace** = author username or organization (e.g., `alice`, `community-hd-project`)
- **Name** = resource name, lowercase with hyphens (e.g., `soviet-march-music`, `allied-infantry-hd`)
- **Version** = semver (e.g., `1.2.0`)
- Full ID example: `alice/soviet-march-music@1.2.0`

### Resource Categories (Expanded)

Resources aren't limited to mod-sized packages. Granularity is flexible:

| Category           | Granularity Examples                                                             |
| ------------------ | -------------------------------------------------------------------------------- |
| Music              | Single track, album, soundtrack                                                  |
| Sound Effects      | Weapon sound pack, ambient loops, UI sounds                                      |
| Voice Lines        | EVA pack, unit response set, faction voice pack                                  |
| Sprites            | Single unit sheet, building sprites, effects pack                                |
| Textures           | Terrain tileset, UI skin, palette-indexed sprites                                |
| Palettes           | Theater palette, faction palette, seasonal palette                               |
| Maps               | Single map, map pack, tournament map pool                                        |
| Missions           | Single mission, mission chain                                                    |
| Campaign Chapters  | Story arc with persistent state                                                  |
| Scene Templates    | Tera scene template for LLM composition                                          |
| Mission Templates  | Tera mission template for LLM composition                                        |
| Cutscenes / Video  | Briefing video, in-game cinematic, tutorial clip                                 |
| UI Themes          | Sidebar layout, font pack, cursor set                                            |
| Balance Presets    | Tuned unit/weapon stats as a selectable preset                                   |
| QoL Presets        | Gameplay behavior toggle set (D033) — sim-affecting + client-only toggles        |
| Experience Profile | Combined balance + theme + QoL preset (D019+D032+D033) — one-click experience    |
| Resource Packs     | Switchable asset layer for any category — see `04-MODDING.md` § "Resource Packs" |
| Full Mods          | Traditional mod (may depend on individual resources)                             |

A published resource is just a `ResourcePackage` with the appropriate `ResourceCategory`. The existing `asset-pack` template and `ic mod publish` flow handle this natively — no separate command needed.

### Dependency Declaration

`mod.yaml` already has a `dependencies:` section. D030 formalizes the resolution semantics:

```yaml
# mod.yaml
dependencies:
  - id: "community-project/hd-infantry-sprites"
    version: "^2.0"                    # semver range (cargo-style)
    source: workshop                   # workshop | local | url
  - id: "alice/soviet-march-music"
    version: ">=1.0, <3.0"
    source: workshop
    optional: true                     # soft dependency — mod works without it
  - id: "bob/desert-terrain-textures"
    version: "~1.4"                    # compatible with 1.4.x
    source: workshop
```

Resource packages can also declare dependencies on other resources (transitive):

```yaml
# A mission pack depends on a sprite pack and a music track
dependencies:
  - id: "community-project/hd-sprites"
    version: "^2.0"
    source: workshop
  - id: "alice/briefing-videos"
    version: "^1.0"
    source: workshop
```

### Repository Types (Artifactory Model)

The Workshop uses three repository types, directly inspired by Artifactory's local/remote/virtual model:

| Repository Type | Artifactory Analog | Description                                                                                                                                                                                                                                                 |
| --------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local**       | Local repository   | A directory on disk following Workshop structure. Stores artifacts you create. Used for development, LAN parties, offline play, pre-publish testing.                                                                                                        |
| **Remote**      | Remote repository  | A Workshop server (official or community-hosted). Artifacts are downloaded and cached locally on first access. Cache is used for subsequent requests — works offline after first pull.                                                                      |
| **Virtual**     | Virtual repository | The aggregated view across all configured sources. The `ic` CLI and in-game browser query the virtual repository — it merges listings from all local + remote sources, deduplicates by resource ID, and resolves version conflicts using priority ordering. |

The `settings.yaml` `sources:` list defines which local and remote repositories compose the virtual repository. This is the federation model — the client never queries raw servers directly, it queries its virtual repository.

### Artifact Integrity

Every published artifact includes cryptographic checksums for integrity verification:

- **SHA-256 checksum** stored in the package manifest and on the Workshop server
- `ic mod install` verifies checksums after download — mismatch → abort + warning
- `ic.lock` records both version AND checksum for each dependency — guarantees byte-identical installs across machines
- Protects against: corrupted downloads, CDN tampering, mirror drift
- Workshop server computes checksums on upload; clients verify on download. Trust but verify.

### Promotion & Maturity Channels

Artifacts can be published to maturity channels, allowing staged releases:

| Channel   | Purpose                         | Visibility                      |
| --------- | ------------------------------- | ------------------------------- |
| `dev`     | Work-in-progress, local testing | Author only (local repos only)  |
| `beta`    | Pre-release, community testing  | Opt-in (users enable beta flag) |
| `release` | Stable, production-ready        | Default (everyone sees these)   |

```yaml
# mod.yaml
mod:
  version: "1.3.0-beta.1"            # semver pre-release tag
  channel: beta                       # publish to beta channel
```

- `ic mod publish --channel beta` → visible only to users who opt in to beta resources
- `ic mod publish` (no flag) → release channel by default
- `ic mod install` pulls from release channel unless `--include-beta` is specified
- Promotion: `ic mod promote 1.3.0-beta.1 release` → moves artifact to release channel without re-upload

### Replication & Mirroring

Community Workshop servers can replicate from the official server (pull replication, Artifactory-style):

- **Pull replication:** Community server periodically syncs popular artifacts from official. Reduces latency for regional players, provides redundancy.
- **Selective sync:** Community servers choose which categories/namespaces to replicate (e.g., replicate all Maps but not Mods)
- **Offline bundles:** `ic workshop export-bundle` creates a portable archive of selected resources for LAN parties or airgapped environments. `ic workshop import-bundle` loads them into a local repository.

### Dependency Resolution

Cargo-inspired version solving:

- **Semver ranges:** `^1.2` (>=1.2.0, <2.0.0), `~1.2` (>=1.2.0, <1.3.0), `>=1.0, <3.0`, exact `=1.2.3`
- **Lockfile:** `ic.lock` records exact resolved versions + SHA-256 checksums for reproducible installs
- **Transitive resolution:** If mod A depends on resource B which depends on resource C, all three are resolved
- **Conflict detection:** Two dependencies requiring incompatible versions of the same resource → error with resolution suggestions
- **Deduplication:** Same resource pulled by multiple dependents is stored once in local cache
- **Offline resolution:** Once cached, all dependencies resolve from local cache — no network required

### CLI Extensions

```
ic mod resolve         # compute dependency graph, report conflicts
ic mod install         # download all dependencies to local cache
ic mod update          # update deps to latest compatible versions (respects semver)
ic mod tree            # display dependency tree (like `cargo tree`)
ic mod lock            # regenerate ic.lock from current mod.yaml
ic mod audit           # check dependency licenses for compatibility
```

These extend the existing `ic` CLI (D020), not replace it. `ic mod publish` already exists — it now also uploads dependency metadata and validates license presence.

### Continuous Deployment

The `ic` CLI is designed for CI/CD pipelines — every command works headless (no interactive prompts). Authors authenticate via scoped API tokens (`IC_WORKSHOP_TOKEN` environment variable or `--token` flag). Tokens are scoped to specific operations (`publish`, `promote`, `admin`) and expire after a configurable duration. This enables:

- **Tag-triggered publish:** Push a `v1.2.0` git tag → CI validates, tests headless, publishes to Workshop automatically
- **Beta channel CI:** Every merge to `main` publishes to `beta`; explicit tag promotes to `release`
- **Multi-resource monorepos:** Matrix builds publish multiple resource packs from a single repo
- **Automated quality gates:** `ic mod check` + `ic mod test` + `ic mod audit` run before every publish
- **Scheduled compatibility checks:** Cron-triggered CI re-publishes against latest engine version to catch regressions

Works with GitHub Actions, GitLab CI, Gitea Actions, or any CI system — the CLI is a single static binary. See `04-MODDING.md` § "Continuous Deployment for Workshop Authors" for the full workflow including a GitHub Actions example.

### License System

**Every published Workshop resource MUST have a `license` field.** Publishing without one is rejected.

```yaml
# In mod.yaml or resource manifest
mod:
  license: "CC-BY-SA-4.0"             # SPDX identifier (required for publishing)
```

- Uses [SPDX identifiers](https://spdx.org/licenses/) for machine-readable license classification
- Workshop UI displays license prominently on every resource listing
- `ic mod audit` checks the full dependency tree for license compatibility (e.g., CC-BY-NC dep in a CC-BY mod → warning)
- Common licenses for game assets: `CC-BY-4.0`, `CC-BY-SA-4.0`, `CC-BY-NC-4.0`, `CC0-1.0`, `MIT`, `GPL-3.0-only`, `LicenseRef-Custom` (with link to full text)
- Resources with incompatible licenses can coexist in the Workshop but `ic mod audit` warns when combining them

### LLM-Driven Resource Discovery

`ra-llm` can search the Workshop programmatically and incorporate discovered resources into generated content:

```
Pipeline:
  1. LLM generates mission concept ("Soviet ambush in snowy forest")
  2. Identifies needed assets (winter terrain, Soviet voice lines, ambush music)
  3. Searches Workshop: query="winter terrain textures", tags=["snow", "forest"]
  4. Evaluates candidates via llm_meta (summary, purpose, composition_hints)
  5. Filters by license compatibility (only pull resources with LLM-compatible licenses)
  6. Adds discovered resources as dependencies in generated mod.yaml
  7. Generated mission references assets by resource ID — resolved at install time
```

This turns the Workshop into a composable asset library that both humans and AI agents can draw from.

### Workshop Server Resolution (resolves P007)

**Decision: Federated multi-source with merge.** The Workshop client can aggregate listings from multiple sources:

```yaml
# settings.yaml
workshop:
  sources:
    - url: "https://workshop.ironcurtain.gg"     # official (always included)
      priority: 1
    - url: "https://mods.myclan.com/workshop"     # community server
      priority: 2
    - path: "C:/my-local-workshop"                # local directory
      priority: 3
  deduplicate: true               # same resource ID from multiple sources → highest priority wins
```

Rationale: Single-source is too limiting for a resource registry. Crates.io has mirrors; npm has registries. A dependency system inherently benefits from federation — tournament organizers publish to their server, LAN parties use local directories, the official server is the default. Deduplication by resource ID + priority ordering handles conflicts.

**Alternatives considered:**
- Single source only (simpler but doesn't scale for a registry model — what happens when the official server is down?)
- Full decentralization with no official server (too chaotic for discoverability)
- Git-based distribution like Go modules (too complex for non-developer modders)
- Steam Workshop only (platform lock-in, no WASM/browser target, no self-hosting)

### Steam Workshop Integration

The federated model includes **Steam Workshop as a source type** alongside IC-native Workshop servers and local directories. For Steam builds, the Workshop browser can query Steam Workshop in addition to IC sources:

```yaml
# settings.yaml (Steam build)
workshop:
  sources:
    - url: "https://workshop.ironcurtain.gg"     # IC official
      priority: 1
    - type: steam-workshop                        # Steam Workshop (Steam builds only)
      app_id: <steam_app_id>
      priority: 2
    - path: "C:/my-local-workshop"
      priority: 3
```

- **Publish to both:** `ic mod publish` uploads to IC Workshop; Steam builds additionally push to Steam Workshop via Steamworks API. One command, dual publish.
- **Subscribe from either:** IC resources and Steam Workshop items appear in the same in-game browser (virtual view merges them).
- **Non-Steam builds are not disadvantaged.** IC's own Workshop is the primary registry. Steam Workshop is an optional distribution channel that broadens reach for creators on Steam.
- **Maps are the primary Steam Workshop content type** (matching Remastered's pattern). Full mods are better served by the IC Workshop due to richer metadata, dependency resolution, and federation.

### In-Game Workshop Browser

The Workshop is accessible from the main menu, not only via the `ic` CLI. The in-game browser provides:

- **Search** with full-text search (FTS5 via D034), category filters, tag filters, and sorting (popular, recent, trending, most-depended-on)
- **Resource detail pages** with description, screenshots/preview, license, author, download count, rating, dependency tree, changelog
- **One-click install** with automatic dependency resolution — same as `ic mod install` but from the game UI
- **Ratings and reviews** — 1-5 star rating plus optional text review per user per resource
- **Creator profiles** — browse all resources by a specific author, see their total downloads, reputation badges
- **Collections** — user-curated lists of resources ("My Competitive Setup", "Best Soviet Music"), shareable via link
- **Trending and featured** — algorithmically surfaced (time-weighted download velocity) plus editorially curated featured lists

### Auto-Download on Lobby Join

When a player joins a multiplayer lobby, the game automatically resolves and downloads any required mods, maps, or resource packs that the player doesn't have locally:

1. **Lobby advertises requirements:** The `GameListing` (see `03-NETCODE.md`) includes mod ID, version, and Workshop source for all required resources
2. **Client checks local cache:** Already have the exact version? Skip download.
3. **Missing resources auto-resolve:** Client queries the virtual Workshop repository, downloads missing resources, verifies SHA-256 checksums
4. **Progress UI:** Download progress bar shown in lobby. Game start blocked until all players have all required resources.
5. **Rejection option:** Player can decline to download and leave the lobby instead.
6. **Size warning:** Downloads exceeding a configurable threshold (default 100MB) prompt confirmation before proceeding.

This matches CS:GO/CS2's pattern where community maps download automatically when joining a server — zero friction for players. It also solves ArmA Reforger's most-cited community complaint about mod management friction.

### Creator Reputation System

Creators accumulate reputation through their Workshop activity. Reputation is displayed on resource listings and creator profiles:

| Signal              | Weight   | Description                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------------- |
| Total downloads     | Medium   | Cumulative downloads across all published resources                         |
| Average rating      | High     | Mean star rating across published resources (minimum 10 ratings to display) |
| Dependency count    | High     | How many other resources/mods depend on this creator's work                 |
| Publish consistency | Low      | Regular updates and new content over time                                   |
| Community reports   | Negative | DMCA strikes, policy violations reduce reputation                           |

**Badges:**
- **Verified** — identity confirmed (e.g., linked GitHub account)
- **Prolific** — 10+ published resources with ≥4.0 average rating
- **Foundation** — resources depended on by 50+ other resources
- **Curator** — maintains high-quality curated collections

Reputation is displayed but not gatekeeping — any registered user can publish. Reputation helps players discover trustworthy content in a growing registry.

### Content Moderation & DMCA/Takedown Policy

The Workshop requires a clear content policy and takedown process:

**Prohibited content:**
- Assets ripped from commercial games without permission (the ArmA community's perennial problem)
- Malicious content (WASM modules with harmful behavior — mitigated by capability sandbox)
- Content violating the license declared in its manifest
- Hate speech, illegal content (standard platform policy)

**Takedown process:**
1. **Reporter files takedown request** via Workshop UI or email, specifying the resource and the claim (DMCA, license violation, policy violation)
2. **Resource is flagged** — not immediately removed — and the author is notified with a 72-hour response window
3. **Author can counter-claim** (e.g., they hold the rights, the reporter is mistaken)
4. **Workshop moderators review** — if the claim is valid, the resource is delisted (not deleted — remains in local caches of existing users)
5. **Repeat offenders** accumulate strikes. Three strikes → account publishing privileges suspended. Appeals process available.
6. **DMCA safe harbor:** The Workshop server operator (official or community-hosted) follows standard DMCA safe harbor procedures. Community-hosted servers set their own moderation policies.

**License enforcement integration:**
- `ic mod audit` already checks dependency tree license compatibility
- Workshop server rejects publish if declared license conflicts with dependency licenses
- Resources with `LicenseRef-Custom` must provide a URL to full license text

**Rationale (from ArmA research):** ArmA's private mod ecosystem exists specifically because the Workshop can't protect creators or manage IP claims. Disney, EA, and others actively DMCA ArmA Workshop content. Bohemia established an IP ban list but the community found it heavy-handed. IC's approach: clear rules, due process, creator notification first — not immediate removal.

**Phase:** Minimal Workshop in Phase 4–5 (central server + publish + browse + auto-download); full Workshop (federation, Steam source, reputation, DMCA) in Phase 6a; preparatory work in Phase 3 (manifest format finalized).

---

## D035: Creator Recognition & Attribution

**Decision:** The Workshop supports **voluntary creator recognition** through tipping/sponsorship links and reputation badges. Monetization is never mandatory — all Workshop resources are freely downloadable. Creators can optionally accept tips and link sponsorship profiles.

**Rationale:**
- The C&C modding community has a 30-year culture of free modding. Mandatory paid content would generate massive resistance and fragment multiplayer (can't join a game if you don't own a required paid map — ArmA DLC demonstrated this problem).
- Valve's Steam Workshop paid mods experiment (Skyrim, 2015) was reversed within days due to community backlash. The 75/25 revenue split (Valve/creator) was seen as exploitative.
- Nexus Mods' Donation Points system is well-received as a voluntary model — creators earn money without gating access.
- CS:GO/CS2's creator economy ($57M+ paid to creators by 2015) works because it's cosmetic-only items curated by Valve — a fundamentally different model than gating gameplay content.
- ArmA's commissioned mod ecosystem exists in a legal/ethical gray zone with no official framework — creators deserve better.
- Backend infrastructure (relay servers, Workshop servers, tracking servers) has real hosting costs. Sustainability requires some revenue model.

**Key Design Elements:**

### Creator Tipping

- **Tip jar on resource pages:** Every Workshop resource page has an optional "Support this creator" button. Clicking shows the creator's configured payment links.
- **Payment links, not payment processing.** IC does not process payments directly. Creators link their own payment platforms:

```yaml
# In mod.yaml or creator profile
creator:
  name: "Alice"
  tip_links:
    - platform: "ko-fi"
      url: "https://ko-fi.com/alice"
    - platform: "github-sponsors"
      url: "https://github.com/sponsors/alice"
    - platform: "patreon"
      url: "https://patreon.com/alice"
    - platform: "paypal"
      url: "https://paypal.me/alice"
```

- **No IC platform fee on tips.** Tips go directly to creators via their chosen platform. IC takes zero cut.
- **Aggregate tip link on creator profile:** Creator's profile page shows a single "Support Alice" button linking to their preferred platform.

### Infrastructure Sustainability

The Workshop and backend servers have hosting costs. Sustainability options (not mutually exclusive):

| Model                        | Description                                                                                                   | Precedent                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Community donations**      | Open Collective / GitHub Sponsors for the project itself                                                      | Godot, Blender, Bevy                |
| **Premium hosting tier**     | Optional paid tier: priority matchmaking queue, larger replay archive, custom clan pages                      | Discord Nitro, private game servers |
| **Sponsored featured slots** | Creators or communities pay to feature resources in the Workshop's "Featured" section                         | App Store featured placements       |
| **White-label licensing**    | Tournament organizers or game communities license the engine+infrastructure for their own branded deployments | Many open-source projects           |

**No mandatory paywalls.** The free tier is fully functional — all gameplay features, all maps, all mods, all multiplayer. Premium tiers offer convenience and visibility, never exclusive gameplay content.

**No loot boxes, no skin gambling, no speculative economy.** CS:GO's skin economy generated massive revenue but also attracted gambling sites, scams, and regulatory scrutiny. IC's creator recognition model is direct and transparent.

### Future Expansion Path

The Workshop schema supports monetization metadata from day one, but launches with tips-only:

```yaml
# Future schema (not implemented at launch)
mod:
  pricing:
    model: "free"                    # free | tip | paid (paid = future)
    tip_links: [...]                 # voluntary compensation
    # price: "2.99"                  # future: optional price for premium content
    # revenue_split: "70/30"         # future: creator/platform split
```

If the community evolves toward wanting paid content (e.g., professional-quality campaign packs), the schema is ready. But this is a community decision, not a launch feature.

**Alternatives considered:**
- Mandatory marketplace (Skyrim paid mods disaster — community backlash guaranteed)
- Revenue share on all downloads (creates perverse incentives, fragments multiplayer)
- No monetization at all (unsustainable for infrastructure; undervalues creators)
- EA premium content pathway (licensing conflicts with open-source, gives EA control the community should own)

**Phase:** Phase 6a (integrated with Workshop infrastructure), with creator profile schema defined in Phase 3.

---

## D036: Achievement System

**Decision:** IC includes a **per-game-module achievement system** with built-in and mod-defined achievements, stored locally in SQLite (D034), with optional Workshop sync for community-created achievement packs.

**Rationale:**
- Achievements provide progression and engagement outside competitive ranking — important for casual players who are the majority of the C&C community
- Modern RTS players expect achievement systems (Remastered, SC2, AoE4 all have them)
- Mod-defined achievements drive Workshop adoption: a total conversion mod can define its own achievement set, incentivizing players to explore community content
- SQLite storage (D034) already handles all persistent client state — achievements are another table

**Key Design Elements:**

### Achievement Categories

| Category        | Examples                                                                      | Scope                         |
| --------------- | ----------------------------------------------------------------------------- | ----------------------------- |
| **Campaign**    | "Complete Allied Campaign on Hard", "Zero casualties in mission 3"            | Per-game-module, per-campaign |
| **Skirmish**    | "Win with only infantry", "Defeat 3 brutal AIs simultaneously"                | Per-game-module               |
| **Multiplayer** | "Win 10 ranked matches", "Achieve 200 APM in a match"                         | Per-game-module, per-mode     |
| **Exploration** | "Play every official map", "Try all factions"                                 | Per-game-module               |
| **Community**   | "Install 5 Workshop mods", "Rate 10 Workshop resources", "Publish a resource" | Cross-module                  |
| **Mod-defined** | Defined by mod authors in YAML, registered via Workshop                       | Per-mod                       |

### Storage Schema (D034)

```sql
CREATE TABLE achievements (
    id              TEXT PRIMARY KEY,     -- "ra1.campaign.allied_hard_complete"
    game_module     TEXT NOT NULL,        -- "ra1", "td", "ra2"
    category        TEXT NOT NULL,        -- "campaign", "skirmish", "multiplayer", "community"
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    icon            TEXT,                 -- path to achievement icon asset
    hidden          BOOLEAN DEFAULT 0,    -- hidden until unlocked (surprise achievements)
    source          TEXT NOT NULL         -- "builtin" or workshop resource ID
);

CREATE TABLE achievement_progress (
    achievement_id  TEXT REFERENCES achievements(id),
    unlocked_at     TEXT,                 -- ISO 8601 timestamp, NULL if locked
    progress        INTEGER DEFAULT 0,    -- for multi-step achievements (e.g., "win 10 matches": progress=7)
    target          INTEGER DEFAULT 1,    -- total required for unlock
    PRIMARY KEY (achievement_id)
);
```

### Mod-Defined Achievements

Mod authors define achievements in their `mod.yaml`, which register when the mod is installed:

```yaml
# mod.yaml (achievement definition in a mod)
achievements:
  - id: "my_mod.survive_the_storm"
    title: "Eye of the Storm"
    description: "Survive a blizzard event without losing any buildings"
    category: skirmish
    icon: "assets/achievements/storm.png"
    hidden: false
    trigger: "lua"                     # unlock logic in Lua script
  - id: "my_mod.build_all_units"
    title: "Full Arsenal"
    description: "Build every unit type in a single match"
    category: skirmish
    icon: "assets/achievements/arsenal.png"
    trigger: "lua"
```

Lua scripts call `Achievement.unlock("my_mod.survive_the_storm")` when conditions are met. The achievement API is part of the Lua globals (alongside `Actor`, `Trigger`, `Map`, etc.).

### Design Constraints

- **No multiplayer achievements that incentivize griefing.** "Kill 100 allied units" → no. "Win 10 team games" → yes.
- **Campaign achievements are deterministic** — same inputs, same achievement unlock. Replays can verify achievement legitimacy.
- **Achievement packs are Workshop resources** — community can create themed achievement collections (e.g., "Speedrun Challenges", "Pacifist Run").
- **Mod achievements are sandboxed to their mod.** Uninstalling a mod hides its achievements (progress preserved, shown as "mod not installed").
- **Steam achievements sync** (Steam builds only) — built-in achievements map to Steam achievement API. Mod-defined achievements are IC-only.

**Alternatives considered:**
- Steam achievements only (excludes non-Steam players, can't support mod-defined achievements)
- No achievement system (misses engagement opportunity, feels incomplete vs modern RTS competitors)
- Blockchain-verified achievements (needless complexity, community hostility toward crypto/blockchain in games)

**Phase:** Phase 3 (built-in achievement infrastructure + campaign achievements), Phase 6b (mod-defined achievements via Workshop).

---

## D037: Community Governance & Platform Stewardship

**Decision:** IC's community infrastructure (Workshop, tracking servers, competitive systems) operates under a **transparent governance model** with community representation, clear policies, and distributed authority.

**Rationale:**
- OpenRA's community fragmented partly because governance was opaque — balance changes and feature decisions were made by a small core team without structured community input, leading to the "OpenRA isn't RA1" sentiment
- ArmA's Workshop moderation is perceived as inconsistent — some IP holders get mods removed, others don't, with no clear published policy
- CNCnet succeeds partly because it's community-run with clear ownership
- The Workshop (D030) and competitive systems create platform responsibilities: content moderation, balance curation, server uptime, dispute resolution. These need defined ownership.
- Self-hosting is a first-class use case (D030 federation) — governance must work even when the official infrastructure is one of many

**Key Design Elements:**

### Governance Structure

| Role                          | Responsibility                                                               | Selection                                                    |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Project maintainer(s)**     | Engine code, architecture decisions, release schedule                        | Existing (repository owners)                                 |
| **Workshop moderators**       | Content moderation, DMCA processing, policy enforcement                      | Appointed by maintainers, community nominations              |
| **Competitive committee**     | Ranked map pool, balance preset curation, tournament rules                   | Elected by active ranked players (annual)                    |
| **Game module stewards**      | Per-module balance/content decisions (RA1 steward, TD steward, etc.)         | Appointed by maintainers based on community contributions    |
| **Community representatives** | Advocate for community needs, surface pain points, vote on pending decisions | Elected by community (annual), at least one per major region |

### Transparency Commitments

- **Public decision log** (this document) for all architectural and policy decisions
- **Monthly community reports** for Workshop statistics (uploads, downloads, moderation actions, takedowns)
- **Open moderation log** for Workshop takedown actions (stripped of personal details) — the community can see what was removed and why
- **RFC process for major changes:** Balance preset modifications, Workshop policy changes, and competitive rule changes go through a public comment period before adoption
- **Community surveys** before major decisions that affect gameplay experience (annually at minimum)

### Self-Hosting Independence

The governance model explicitly supports community independence:

- Any community can host their own Workshop server, tracking server, and relay server
- Federation (D030) means community servers are peers, not subordinates to the official infrastructure
- If the official project becomes inactive, the community has all the tools, source code, and infrastructure to continue independently
- Community-hosted servers set their own moderation policies (within the framework of clear minimum standards for federated discovery)

### Code of Conduct

Standard open-source code of conduct (Contributor Covenant or similar) applies to:
- Workshop resource descriptions and reviews
- In-game chat (client-side filtering, not server enforcement for non-ranked games)
- Competitive play (ranked games: stricter enforcement, report system, temporary bans for verified toxicity)
- Community forums and communication channels

**Alternatives considered:**
- BDFL (Benevolent Dictator for Life) model with no community input (faster decisions but risks OpenRA's fate — community alienation)
- Full democracy (too slow for a game project; bikeshedding on every decision)
- Corporate governance (inappropriate for an open-source community project)
- No formal governance (works early, creates problems at scale — better to define structure before it's needed)

**Phase:** Phase 0 (code of conduct, contribution guidelines), Phase 5 (competitive committee), Phase 7 (Workshop moderators, community representatives).

> **Phasing note:** This governance model is aspirational — it describes where the project aims to be at scale, not what launches on day one. At project start, governance is BDFL (maintainer) + trusted contributors, which is appropriate for a project with zero users. Formal elections, committees, and community representatives should not be implemented until there is an active community of 50+ regular contributors. The governance structure documented here is a roadmap, not a launch requirement. Premature formalization risks creating bureaucracy before there are people to govern.

---

## D031: Observability & Telemetry — OTEL Across Engine, Servers, and AI Pipeline

**Decision:** All backend servers (relay, tracking, workshop) and the game engine itself emit structured telemetry via OpenTelemetry (OTEL), enabling operational monitoring, gameplay debugging, state inspection, and AI/LLM training data collection — all from a single, unified instrumentation layer.

**Rationale:**
- Backend servers (relay, tracking, workshop) are production infrastructure — they need health metrics, latency histograms, error rates, and distributed traces, just like any microservice
- The game engine already has rich internal state (per-tick `state_hash()`, snapshots, system execution times) but no structured way to export it for analysis
- Replay files capture *what happened* but not *why* — telemetry captures the engine's decision-making process (pathfinding time, order validation outcomes, combat resolution details) that replays miss
- Behavioral analysis (V12 anti-cheat) already collects APM, reaction times, and input entropy on the relay — OTEL is the natural export format for this data
- AI/LLM development needs training data: game telemetry (unit movements, build orders, engagement outcomes) is exactly the training corpus for `ra-ai` and `ra-llm`
- Bevy already integrates with Rust's `tracing` crate — OTEL export is a natural extension, not a foreign addition
- Desync debugging needs cross-client correlation — distributed tracing (trace IDs) lets you follow an order from input → network → sim → render across multiple clients and the relay server
- A single instrumentation approach (OTEL) avoids the mess of ad-hoc logging, custom metrics files, separate debug protocols, and incompatible formats

**Key Design Elements:**

### Three Telemetry Signals (OTEL Standard)

| Signal  | What It Captures                                                  | Export Format        |
| ------- | ----------------------------------------------------------------- | -------------------- |
| Metrics | Counters, histograms, gauges — numeric time series                | OTLP → Prometheus    |
| Traces  | Distributed request flows — an order's journey through the system | OTLP → Jaeger/Zipkin |
| Logs    | Structured events with severity, context, correlation IDs         | OTLP → Loki/stdout   |

### Backend Server Telemetry (Relay, Tracking, Workshop)

Standard operational observability — same patterns used by any production Rust service:

**Relay server metrics:**
```
relay.games.active                    # gauge: concurrent games
relay.games.total                     # counter: total games hosted
relay.orders.received                 # counter: orders received per tick
relay.orders.forwarded                # counter: orders broadcast
relay.orders.dropped                  # counter: orders missed (lag switch)
relay.tick.latency_ms                 # histogram: tick processing time
relay.player.rtt_ms                   # histogram: per-player round-trip time
relay.player.suspicion_score          # gauge: behavioral analysis score (V12)
relay.desync.detected                 # counter: desync events
relay.match.completed                 # counter: matches finished
relay.match.duration_s                # histogram: match duration
```

**Tracking server metrics:**
```
tracking.listings.active              # gauge: current game listings
tracking.heartbeats.received          # counter: heartbeats processed
tracking.heartbeats.expired           # counter: listings expired (TTL)
tracking.queries.total                # counter: browse/search requests
tracking.queries.latency_ms           # histogram: query latency
```

**Workshop server metrics:**
```
workshop.artifacts.total              # gauge: total published resources
workshop.artifacts.downloads          # counter: download events
workshop.artifacts.publishes          # counter: publish events
workshop.resolve.latency_ms           # histogram: dependency resolution time
workshop.resolve.conflicts            # counter: version conflicts detected
workshop.search.latency_ms            # histogram: search query time
```

**Distributed traces:** A multiplayer game session gets a trace ID. Every order, tick, and desync event references this trace ID. Debug a desync by searching for the game's trace ID in Jaeger and seeing the exact sequence of events across all participants.

**Health endpoints:** Every server exposes `/healthz` (already designed) and `/readyz`. Prometheus scrape endpoint at `/metrics`. These are standard and compose with existing k8s deployment (Helm charts already designed in `03-NETCODE.md`).

### Game Engine Telemetry (Client-Side)

The engine emits structured telemetry for debugging, profiling, and AI training — but only when enabled. **Hot paths remain zero-cost when telemetry is disabled** (compile-time feature flag `telemetry`).

#### Performance Instrumentation

Per-tick system timing, already needed for the benchmark suite (`10-PERFORMANCE.md`), exported as OTEL metrics when enabled:

```
sim.tick.duration_us                  # histogram: total tick time
sim.system.apply_orders_us            # histogram: per-system time
sim.system.production_us
sim.system.harvesting_us
sim.system.movement_us
sim.system.combat_us
sim.system.death_us
sim.system.triggers_us
sim.system.fog_us
sim.entities.total                    # gauge: entity count
sim.entities.by_type                  # gauge: per-component-type count
sim.memory.scratch_bytes              # gauge: TickScratch buffer usage
sim.pathfinding.requests              # counter: pathfinding queries per tick
sim.pathfinding.cache_hits            # counter: flowfield cache reuse
sim.pathfinding.duration_us           # histogram: pathfinding computation time
```

#### Gameplay Event Stream

Structured events emitted during simulation — the raw material for AI training and replay enrichment:

```rust
/// Gameplay events emitted by the sim when telemetry is enabled.
/// These are structured, not printf-style — each field is queryable.
pub enum GameplayEvent {
    UnitCreated { tick: u64, entity: EntityId, unit_type: String, owner: PlayerId },
    UnitDestroyed { tick: u64, entity: EntityId, killer: Option<EntityId>, cause: DeathCause },
    CombatEngagement { tick: u64, attacker: EntityId, target: EntityId, weapon: String, damage: i32, remaining_hp: i32 },
    BuildingPlaced { tick: u64, entity: EntityId, structure_type: String, owner: PlayerId, position: WorldPos },
    HarvestDelivered { tick: u64, harvester: EntityId, resource_type: String, amount: i32, total_credits: i32 },
    OrderIssued { tick: u64, player: PlayerId, order: PlayerOrder, validated: bool, rejection_reason: Option<String> },
    PathfindingCompleted { tick: u64, entity: EntityId, from: WorldPos, to: WorldPos, path_length: u32, compute_time_us: u32 },
    DesyncDetected { tick: u64, expected_hash: u64, actual_hash: u64, player: PlayerId },
    StateSnapshot { tick: u64, state_hash: u64, entity_count: u32 },
}
```

These events are:
- **Emitted as OTEL log records** with structured attributes (not free-text — every field is filterable)
- **Collected locally** into a SQLite gameplay event log alongside replays (D034) — queryable with ad-hoc SQL without an OTEL stack
- **Optionally exported** to a collector for batch analysis (tournament servers, AI training pipelines)

#### State Inspection (Development & Debugging)

A debug overlay (via `bevy_egui`, already in the architecture) that reads live telemetry:

- Per-system tick time breakdown (bar chart)
- Entity count by type
- Network: RTT, order latency, jitter
- Memory: scratch buffer usage, component storage
- Pathfinding: active flowfields, cache hit rate
- Fog: cells updated this tick, stagger bucket
- Sim state hash (for manual desync comparison)

This is the "game engine equivalent of a Kubernetes dashboard" — operators of tournament servers or mod developers can inspect the engine's internal state in real-time.

### AI / LLM Training Data Pipeline

The gameplay event stream is the foundation for AI development:

| Consumer              | Data Source                        | Purpose                                                          |
| --------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `ra-ai` (skirmish AI) | Gameplay events from human games   | Learn build orders, engagement timing, micro patterns            |
| `ra-llm` (missions)   | Gameplay events + enriched replays | Learn what makes missions fun (engagement density, pacing, flow) |
| Behavioral analysis   | Relay-side player profiles         | APM, reaction time, input entropy → suspicion scoring (V12)      |
| Balance analysis      | Aggregated match outcomes          | Win rates by faction/map/preset → balance tuning                 |
| Adaptive difficulty   | Per-player gameplay patterns       | Build speed, APM, unit composition → difficulty calibration      |
| Community analytics   | Workshop + match metadata          | Popular resources, play patterns, mod adoption → recommendations |

**Privacy:** Gameplay events are associated with anonymized player IDs (hashed). No PII in telemetry. Players opt in to telemetry export (default: local-only for debugging). Tournament/ranked play may require telemetry for anti-cheat and certified results. See `06-SECURITY.md`.

**Data format:** Gameplay events export as structured OTEL log records → can be collected into Parquet/Arrow columnar format for batch ML training. The LLM training pipeline reads events, not raw replay bytes.

### Architecture: Where Telemetry Lives

```
                  ┌──────────────────────────────────────────┐
                  │              OTEL Collector               │
                  │  (receives all signals, routes to sinks)  │
                  └──┬──────────┬──────────┬─────────────────┘
                     │          │          │
              ┌──────▼──┐ ┌────▼────┐ ┌───▼─────────────┐
              │Prometheus│ │ Jaeger  │ │ Loki / Storage  │
              │(metrics) │ │(traces) │ │(logs / events)  │
              └──────────┘ └─────────┘ └───────┬─────────┘
                                               │
                                        ┌──────▼──────┐
                                        │ AI Training  │
                                        │ Pipeline     │
                                        │ (Parquet→ML) │
                                        └─────────────┘

  Emitters:
  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐
  │  Relay  │  │Tracking │  │ Workshop │  │  Game    │
  │ Server  │  │ Server  │  │  Server  │  │ Engine   │
  └─────────┘  └─────────┘  └──────────┘  └──────────┘
```

No emitter talks directly to Prometheus/Jaeger/Loki — everything goes through the OTEL Collector. This means:
- Emitters don't know or care about the backend storage
- Self-hosters can route to whatever they want (Grafana Cloud, Datadog, or just stdout)
- The collector handles sampling, batching, and export — emitters stay lightweight

### Implementation Approach

**Rust ecosystem:**
- `tracing` crate — Bevy already uses this; add structured fields and span instrumentation
- `opentelemetry` + `opentelemetry-otlp` crates — OTEL SDK for Rust
- `tracing-opentelemetry` — bridges `tracing` spans to OTEL traces
- `metrics` crate — lightweight counters/histograms, exported via OTEL

**Zero-cost when disabled:** The `telemetry` feature flag gates all instrumentation behind `#[cfg(feature = "telemetry")]`. When disabled (default for release builds), all telemetry calls compile to no-ops. No runtime cost, no allocations, no branches. This respects invariant #5 (efficiency-first performance).

**Build configurations:**
| Build               | Telemetry | Use case                                   |
| ------------------- | --------- | ------------------------------------------ |
| `release`           | Off       | Player-facing builds — zero overhead       |
| `release-telemetry` | On        | Tournament servers, AI training, debugging |
| `debug`             | On        | Development — full instrumentation         |

### Self-Hosting Observability

Community server operators get observability for free. The docker-compose.yaml (already designed in `03-NETCODE.md`) can optionally include a Grafana + Prometheus + Loki stack:

```yaml
# docker-compose.observability.yaml (optional overlay)
services:
  otel-collector:
    image: otel/opentelemetry-collector:latest
    ports:
      - "4317:4317"    # OTLP gRPC
  prometheus:
    image: prom/prometheus:latest
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"    # dashboards
  loki:
    image: grafana/loki:latest
```

Pre-built Grafana dashboards ship with the project:
- **Relay Dashboard:** active games, player RTT, orders/sec, desync events, suspicion scores
- **Tracking Dashboard:** listings, heartbeats, query rates
- **Workshop Dashboard:** downloads, publishes, dependency resolution times
- **Engine Dashboard:** tick times, entity counts, system breakdown, pathfinding stats

**Alternatives considered:**
- Custom metrics format (less work initially, but no ecosystem — no Grafana, no alerting, no community tooling)
- StatsD (simpler but metrics-only — no traces, no structured logs, no distributed correlation)
- No telemetry (leaves operators blind and AI training without data)
- Always-on telemetry (violates performance invariant — must be zero-cost when disabled)

**Phase:** Backend server telemetry in Phase 5 (multiplayer). Engine telemetry in Phase 2 (sim) and Phase 3 (chrome/debug overlay). AI training pipeline in Phase 7 (LLM).

---

## D032: Switchable UI Themes (Main Menu, Chrome, Lobby)

**Decision:** Ship a YAML-driven UI theme system with multiple built-in presets. Players pick their preferred visual style for the main menu, in-game chrome (sidebar, minimap, build queue), and lobby. Mods and community can create and publish custom themes.

**Motivation:**

The Remastered Collection nailed its main menu — it respects the original Red Alert's military aesthetic while modernizing the presentation. OpenRA went a completely different direction: functional, data-driven, but with a generic feel that doesn't evoke the same nostalgia. Both approaches have merit for different audiences. Rather than pick one style, let the player choose.

This also mirrors D019 (switchable balance presets). Just as players choose between Classic, OpenRA, and Remastered balance rules in the lobby, they should be able to choose their visual experience the same way.

**Built-in themes (original art, not copied assets):**

| Theme      | Inspired By                  | Aesthetic                                                                                                                               | Default For      |
| ---------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Classic    | Original RA1 (1996)          | Military minimalism — bare buttons over a static title screen, Soviet-era propaganda palette, utilitarian layout, Hell March on startup | RA1 game module  |
| Remastered | Remastered Collection (2020) | Clean modern military — HD polish, sleek panels, reverent to the original but refined, jukebox integration                              | —                |
| Modern     | Iron Curtain's own design    | Full Bevy UI capabilities — dynamic panels, animated transitions, modern game launcher feel                                             | New game modules |

**Important legal note:** All theme art assets are **original creations** inspired by these design languages — no assets are copied from EA's Remastered Collection (those are proprietary) or from OpenRA. The themes capture the *aesthetic philosophy* (palette, layout structure, design mood) but use entirely IC-created sprite sheets, fonts, and layouts. This is standard "inspired by" in game development — layout and color choices are not copyrightable, only specific artistic expression is.

**Theme structure (YAML-defined):**

```yaml
# themes/classic.yaml
theme:
  name: Classic
  description: "Inspired by the original Red Alert — military minimalism"

  # Chrome sprite sheet — 9-slice panels, button states, scrollbars
  chrome:
    sprite_sheet: themes/classic/chrome.png
    panel: { top_left: [0, 0, 8, 8], ... }  # 9-slice regions
    button:
      normal: [0, 32, 118, 9]
      hover: [0, 41, 118, 9]
      pressed: [0, 50, 118, 9]
      disabled: [0, 59, 118, 9]

  # Color palette
  colors:
    primary: "#c62828"       # Soviet red
    secondary: "#1a1a2e"     # Dark navy
    text: "#e0e0e0"
    text_highlight: "#ffd600"
    panel_bg: "#0d0d1a"
    panel_border: "#4a4a5a"

  # Typography
  fonts:
    menu: { family: "military-stencil", size: 14 }
    body: { family: "default", size: 12 }
    hud: { family: "monospace", size: 11 }

  # Main menu layout
  main_menu:
    background: themes/classic/title.png     # static image
    shellmap: null                            # no live battle (faithfully minimal)
    music: THEME_INTRO                       # Hell March intro
    button_layout: vertical_center           # stacked buttons, centered
    show_version: true

  # In-game chrome
  ingame:
    sidebar: right                           # classic RA sidebar position
    minimap: top_right
    build_queue: sidebar_tabs
    resource_bar: top_center

  # Lobby
  lobby:
    style: compact                           # minimal chrome, functional
```

**Shellmap system (live menu backgrounds):**

Like OpenRA's signature feature — a real game map with scripted AI battles running behind the main menu. But better:

- **Per-theme shellmaps.** Each theme can specify its own shellmap, or none (Classic theme faithfully uses a static image).
- **Multiple shellmaps with random selection.** The Remastered and Modern themes can ship with several shellmaps — a random one plays each launch.
- **Shellmaps are regular maps** tagged with `visibility: shellmap` in YAML. The engine loads them with a scripted AI that stages dramatic battles. Mods automatically get their own shellmaps.
- **Orbiting/panning camera.** Shellmaps can define camera paths — slow pan across a battlefield, orbiting around a base, or fixed view.

**Per-game-module default themes:**

Each game module registers its own default theme that matches its aesthetic:
- **RA1 module:** Classic theme (red/black Soviet palette)
- **TD module:** GDI theme (green/black Nod palette) — community or first-party
- **RA2 module:** Remastered-style with RA2 color palette — community or first-party

The game module provides a `default_theme()` in its `GameModule` trait implementation. Players override this in settings.

**Integration with existing UI architecture:**

The theme system layers on top of `ra-ui`'s existing responsive layout profiles (D002, `02-ARCHITECTURE.md`):
- **Layout profiles** handle *where* UI elements go (sidebar vs bottom bar, phone vs desktop) — driven by `ScreenClass`
- **Themes** handle *how* UI elements look (colors, chrome sprites, fonts, animations) — driven by player preference
- Orthogonal concerns. A player on mobile gets the Phone layout profile + their chosen theme. A player on desktop gets the Desktop layout profile + their chosen theme.

**Community themes:**

- Themes are Tier 1 mods (YAML + sprite sheets) — no code required
- Publishable to the workshop (D030) as a standalone resource
- Players subscribe to themes independently of gameplay mods — themes and gameplay mods stack
- An "OpenRA-inspired" theme would be a natural community contribution
- Total conversion mod developers create matching themes for their mods

**What this enables:**
1. **Day-one nostalgia choice.** First launch asks: do you want Classic, Remastered, or Modern? Sets the mood immediately.
2. **Mod-matched chrome.** A WWII mod ships its own olive-drab theme. A sci-fi mod ships neon blue chrome. The theme changes with the mod.
3. **Cross-view consistency with D019.** Classic balance + Classic theme = feels like 1996. Remastered balance + Remastered theme = feels like 2020. Players configure the full experience.
4. **Live backgrounds without code.** Shellmaps are regular maps — anyone can create one with the map editor.

**Alternatives considered:**
- Hardcoded single theme (OpenRA approach) — forces one aesthetic on everyone; misses the emotional connection different players have to different eras of C&C
- Copy Remastered Collection assets — illegal; proprietary EA art
- CSS-style theming (web-engine approach) — overengineered for a game; YAML is simpler and Bevy-native
- Theme as a full WASM mod — overkill; theming is data, not behavior; Tier 1 YAML is sufficient

**Phase:** Phase 3 (Game Chrome). Theme system is part of the `ra-ui` crate. Built-in themes ship with the engine. Community themes available in Phase 6a (Workshop).

---

## D033: Toggleable QoL & Gameplay Behavior Presets

**Decision:** Every UX and gameplay behavior improvement added by OpenRA or the Remastered Collection over vanilla Red Alert is individually toggleable. Built-in presets group these toggles into coherent experience profiles. Players can pick a preset and then customize any individual toggle. In multiplayer lobbies, sim-affecting toggles are shared settings; client-only toggles are per-player.

**The problem this solves:**

OpenRA and the Remastered Collection each introduced dozens of quality-of-life improvements over the original 1996 Red Alert. Many are genuinely excellent (attack-move, waypoint queuing, multi-queue production). But some players want the authentic vanilla experience. Others want the full OpenRA feature set. Others want the Remastered Collection's specific subset. And some want to cherry-pick: "Give me OpenRA's attack-move but not its build radius circles."

Currently, no Red Alert implementation lets you do this. OpenRA's QoL features are hardcoded. The Remastered Collection's are hardcoded. Vanilla's limitations are hardcoded. Every version forces you into one developer's opinion of what the game "should" feel like.

**Our approach:** Every QoL feature is a YAML-configurable toggle. Presets set all toggles at once. Individual toggles override the preset. The player owns their experience.

### QoL Feature Catalog

Every toggle is categorized as **sim-affecting** (changes game logic — must be identical for all players in multiplayer) or **client-only** (visual/UX — each player can set independently).

#### Production & Economy (Sim-Affecting)

| Toggle               | Vanilla | OpenRA            | Remastered   | IC Default        | Description                                            |
| -------------------- | ------- | ----------------- | ------------ | ----------------- | ------------------------------------------------------ |
| `multi_queue`        | ❌       | ✅                 | ✅            | ✅                 | Queue multiple units of the same type                  |
| `parallel_factories` | ❌       | ✅                 | ✅            | ✅                 | Multiple factories of same type produce simultaneously |
| `build_radius_rule`  | None    | ConYard+buildings | ConYard only | ConYard+buildings | Where you can place new buildings                      |
| `sell_buildings`     | Partial | ✅ Full            | ✅ Full       | ✅ Full            | Sell any own building for partial refund               |
| `repair_buildings`   | ✅       | ✅                 | ✅            | ✅                 | Repair buildings for credits                           |

#### Unit Commands (Sim-Affecting)

| Toggle              | Vanilla | OpenRA | Remastered | IC Default | Description                                              |
| ------------------- | ------- | ------ | ---------- | ---------- | -------------------------------------------------------- |
| `attack_move`       | ❌       | ✅      | ✅          | ✅          | Move to location, engaging enemies en route              |
| `waypoint_queue`    | ❌       | ✅      | ✅          | ✅          | Shift-click to queue movement waypoints                  |
| `guard_command`     | ❌       | ✅      | ❌          | ✅          | Guard a unit or position, engage nearby threats          |
| `scatter_command`   | ❌       | ✅      | ❌          | ✅          | Units scatter from current position                      |
| `force_fire_ground` | ❌       | ✅      | ✅          | ✅          | Force-fire on empty ground (area denial)                 |
| `force_move`        | ❌       | ✅      | ✅          | ✅          | Force move through crushable targets                     |
| `rally_points`      | ❌       | ✅      | ✅          | ✅          | Set rally point for production buildings                 |
| `stance_system`     | None    | Full   | Basic      | Full       | Unit stance: aggressive / defensive / hold / return fire |

#### UI & Visual Feedback (Client-Only)

| Toggle                 | Vanilla | OpenRA   | Remastered     | IC Default     | Description                                                                             |
| ---------------------- | ------- | -------- | -------------- | -------------- | --------------------------------------------------------------------------------------- |
| `health_bars`          | `never` | `always` | `on_selection` | `on_selection` | Unit health bar visibility: `never` / `on_selection` / `always` / `damaged_or_selected` |
| `range_circles`        | ❌       | ✅        | ❌              | ✅              | Show weapon range circle when selecting defense buildings                               |
| `build_radius_display` | ❌       | ✅        | ❌              | ✅              | Show buildable area around construction yard / buildings                                |
| `power_indicators`     | ❌       | ✅        | ✅              | ✅              | Visual indicator on buildings affected by low power                                     |
| `support_power_timer`  | ❌       | ✅        | ✅              | ✅              | Countdown timer bar for superweapons                                                    |
| `production_progress`  | ❌       | ✅        | ✅              | ✅              | Progress bar on sidebar build icons                                                     |
| `target_lines`         | ❌       | ✅        | ❌              | ✅              | Lines showing order targets (move, attack)                                              |
| `rally_point_display`  | ❌       | ✅        | ✅              | ✅              | Visual line from factory to rally point                                                 |

#### Selection & Input (Client-Only)

| Toggle                     | Vanilla | OpenRA    | Remastered | IC Default | Description                                              |
| -------------------------- | ------- | --------- | ---------- | ---------- | -------------------------------------------------------- |
| `double_click_select_type` | ❌       | ✅         | ✅          | ✅          | Double-click a unit to select all of that type on screen |
| `ctrl_click_select_type`   | ❌       | ✅         | ✅          | ✅          | Ctrl+click to add all of type to selection               |
| `tab_cycle_types`          | ❌       | ✅         | ❌          | ✅          | Tab through unit types in multi-type selection           |
| `control_group_limit`      | 10      | Unlimited | Unlimited  | Unlimited  | Max units per control group (0 = unlimited)              |
| `smart_select_priority`    | ❌       | ✅         | ❌          | ✅          | Prefer combat units over harvesters in box select        |

#### Gameplay Rules (Sim-Affecting, Lobby Setting)

| Toggle          | Vanilla | OpenRA         | Remastered | IC Default     | Description                                        |
| --------------- | ------- | -------------- | ---------- | -------------- | -------------------------------------------------- |
| `fog_of_war`    | ❌       | Optional       | ❌          | Optional       | Fog of war (explored but not visible = greyed out) |
| `shroud_regrow` | ❌       | Optional       | ❌          | ❌              | Explored shroud grows back after units leave       |
| `short_game`    | ❌       | Optional       | ❌          | Optional       | Destroying all production buildings = defeat       |
| `crate_system`  | Basic   | Enhanced       | Basic      | Enhanced       | Bonus crates type and behavior                     |
| `ore_regrowth`  | ✅       | ✅ Configurable | ✅          | ✅ Configurable | Ore regeneration rate                              |

### Experience Presets

Presets set all toggles at once. The player selects a preset, then overrides individual toggles if they want.

| Preset                     | Balance (D019) | Theme (D032) | QoL (D033)     | Feel                                      |
| -------------------------- | -------------- | ------------ | -------------- | ----------------------------------------- |
| **Vanilla RA**             | `classic`      | `classic`    | `vanilla`      | Authentic 1996 experience — warts and all |
| **OpenRA**                 | `openra`       | `modern`     | `openra`       | Full OpenRA experience                    |
| **Remastered**             | `remastered`   | `remastered` | `remastered`   | Remastered Collection feel                |
| **Iron Curtain** (default) | `classic`      | `modern`     | `iron_curtain` | Classic balance + best QoL from all eras  |
| **Custom**                 | any            | any          | any            | Player picks everything                   |

The "Iron Curtain" default cherry-picks: classic balance (units feel iconic), modern theme (polished UI), and the best QoL features from both OpenRA and Remastered (attack-move, multi-queue, health bars, range circles — everything that makes the game more playable without changing game feel).

### YAML Structure

```yaml
# presets/qol/iron_curtain.yaml
qol:
  name: "Iron Curtain"
  description: "Best quality-of-life features from all eras"
  
  production:
    multi_queue: true
    parallel_factories: true
    build_radius_rule: conyard_and_buildings
    sell_buildings: full
    repair_buildings: true
  
  commands:
    attack_move: true
    waypoint_queue: true
    guard_command: true
    scatter_command: true
    force_fire_ground: true
    force_move: true
    rally_points: true
    stance_system: full    # none | basic | full
  
  ui_feedback:
    health_bars: on_selection  # never | on_selection | always | damaged_or_selected
    range_circles: true
    build_radius_display: true
    power_indicators: true
    support_power_timer: true
    production_progress: true
    target_lines: true
    rally_point_display: true
  
  selection:
    double_click_select_type: true
    ctrl_click_select_type: true
    tab_cycle_types: true
    control_group_limit: 0    # 0 = unlimited
    smart_select_priority: true
  
  gameplay:
    fog_of_war: optional      # on | off | optional (lobby choice)
    shroud_regrow: false
    short_game: optional
    crate_system: enhanced    # none | basic | enhanced
    ore_regrowth: true
```

```yaml
# presets/qol/vanilla.yaml
qol:
  name: "Vanilla Red Alert"
  description: "Authentic 1996 experience"
  
  production:
    multi_queue: false
    parallel_factories: false
    build_radius_rule: none
    sell_buildings: partial
    repair_buildings: true
  
  commands:
    attack_move: false
    waypoint_queue: false
    guard_command: false
    scatter_command: false
    force_fire_ground: false
    force_move: false
    rally_points: false
    stance_system: none
  
  ui_feedback:
    health_bars: never
    range_circles: false
    build_radius_display: false
    power_indicators: false
    support_power_timer: false
    production_progress: false
    target_lines: false
    rally_point_display: false
  
  selection:
    double_click_select_type: false
    ctrl_click_select_type: false
    tab_cycle_types: false
    control_group_limit: 10
    smart_select_priority: false
  
  gameplay:
    fog_of_war: off
    shroud_regrow: false
    short_game: off
    crate_system: basic
    ore_regrowth: true
```

### Sim vs Client Split

Critical for multiplayer: some toggles change game rules, others are purely cosmetic.

**Sim-affecting toggles** (lobby settings — all players must agree):
- Everything in `production`, `commands`, and `gameplay` sections
- These are validated deterministically by the sim (invariant #1)
- Multiplayer lobby: host sets the QoL preset; displayed to all players before match start
- Mismatch = connection refused (enforced by sim hash, same as balance presets)

**Client-only toggles** (per-player preferences — each player sets their own):
- Everything in `ui_feedback` and `selection` sections
- One player can play with always-visible health bars while their opponent plays with none
- Stored in player settings, not in the lobby configuration
- No sim impact — purely visual/UX

### Interaction with Other Systems

**D019 (Balance Presets):** QoL presets and balance presets are independent axes. You can play with `classic` balance + `openra` QoL, or `openra` balance + `vanilla` QoL. The lobby UI shows both selections.

**D032 (UI Themes):** QoL and themes are also independent. The "Classic" theme changes chrome appearance; the "Vanilla" QoL preset changes gameplay behavior. They're separate settings that happen to compose well.

**Experience Profiles:** The meta-layer above all three. Selecting "Vanilla RA" experience profile sets D019=classic, D032=classic, D033=vanilla in one click. Selecting "Iron Curtain" sets D019=classic, D032=modern, D033=iron_curtain. After selecting a profile, any individual setting can still be overridden.

**Modding (Tier 1):** QoL presets are just YAML files in `presets/qol/`. Modders can create custom QoL presets — a total conversion mod ships its own preset tuned for its gameplay. The `mod.yaml` manifest can specify a default QoL preset.

### Rationale

- **Respect for all eras.** Each version of Red Alert — original, OpenRA, Remastered — has a community that loves it. Forcing one set of behaviors on everyone loses part of the audience.
- **Player agency.** "Good defaults with full customization" is the guiding principle. The IC default enables the best QoL features; purists can turn them off; power users can cherry-pick.
- **Zero engine complexity.** QoL toggles are just config flags read by systems that already exist. Attack-move is either registered as a command or not. Health bars are either rendered or not. No complex runtime switching — the config is read once at game start.
- **Multiplayer safety.** The sim/client split ensures determinism. Sim-affecting toggles are lobby settings (like game speed or starting cash). Client-only toggles are personal preferences (like enabling subtitles in any other game).
- **Natural extension of D019 + D032.** Balance, theme, and behavior are three independent axes of experience customization. Together they let a player fully configure what "Red Alert" feels like to them.

**Alternatives considered:**
- Hardcode one set of behaviors (rejected — this is what every other implementation does; we can do better)
- Make QoL features mod-only (rejected — too important to bury behind modding; should be one click in settings, same as D019)
- Only offer presets without individual toggles (rejected — power users need granular control; presets are starting points, not cages)
- Bundle QoL into balance presets (rejected — "I want OpenRA's attack-move but classic unit values" is a legitimate preference; conflating balance with UX is a design mistake)

**Phase:** Phase 3 (alongside D032 UI themes and sidebar work). QoL toggles are implemented as system-level config flags — each system checks its toggle on initialization. Preset YAML files are authored during Phase 2 (simulation) as features are built.

---

---

## D034: SQLite as Embedded Storage for Services and Client

**Decision:** Use SQLite (via `rusqlite`) as the embedded database for all backend services that need persistent state and for the game client's local metadata indices. No external database dependency required for any deployment.

**What this means:** Every service that persists data beyond a single process lifetime uses an embedded SQLite database file. The "just a binary" philosophy (see `03-NETCODE.md` § Backend Infrastructure) is preserved — an operator downloads a binary, runs it, and persistence is a `.db` file next to the executable. No PostgreSQL, no MySQL, no managed database service.

**Where SQLite is used:**

### Backend Services

| Service                | What it stores                                                                                                              | Why not in-memory                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Relay server**       | `CertifiedMatchResult` records, `DesyncReport` events, `PlayerBehaviorProfile` history, replay archive metadata             | Match results and behavioral data are valuable beyond the game session — operators need to query desync patterns, review suspicion scores, link replays to match records. A relay restart shouldn't erase match history. |
| **Workshop server**    | Resource metadata, versions, dependencies, download counts, ratings, search index (FTS5), license data, replication cursors | This is a package registry — functionally equivalent to crates.io's data layer. Search, dependency resolution, and version queries are relational workloads.                                                             |
| **Matchmaking server** | Player ratings (Glicko-2), match history, seasonal league data, leaderboards                                                | Ratings and match history must survive restarts. Leaderboard queries (`top N`, per-faction, per-map) are natural SQL.                                                                                                    |
| **Tournament server**  | Brackets, match results, map pool votes, community reports                                                                  | Tournament state spans hours/days; must survive restarts. Bracket queries and result reporting are relational.                                                                                                           |

### Game Client (local)

| Data                   | What it stores                                                                   | Benefit                                                                                                                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Replay catalog**     | Player names, map, factions, date, duration, result, file path, signature status | Browse and search local replays without scanning files on disk. Filter by map, opponent, date range.                                                                                                                                                                |
| **Save game index**    | Save name, campaign, mission, timestamp, playtime, thumbnail path                | Fast save browser without deserializing every save file on launch.                                                                                                                                                                                                  |
| **Workshop cache**     | Downloaded resource metadata, versions, checksums, dependency graph              | Offline dependency resolution. Know what's installed without scanning the filesystem.                                                                                                                                                                               |
| **Map catalog**        | Map name, player count, size, author, source (local/workshop/OpenRA), tags       | Browse local maps from all sources with a single query.                                                                                                                                                                                                             |
| **Gameplay event log** | Structured `GameplayEvent` records (D031) per game session                       | Queryable post-game analysis without an OTEL stack: `SELECT json_extract(data_json, '$.weapon'), AVG(json_extract(data_json, '$.damage')) FROM gameplay_events WHERE event_type = 'combat' AND session_id = ?`. Mod developers debug balance with SQL, not Grafana. |
| **Asset index**        | `.mix` archive contents, MiniYAML conversion cache (keyed by file hash)          | Skip re-parsing on startup. Know which `.mix` contains which file without opening every archive.                                                                                                                                                                    |

### Where SQLite is NOT used

| Area                | Why not                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`ra-sim`**        | No I/O in the sim. Ever. Invariant #1.                                                                                                                 |
| **Tracking server** | Truly ephemeral data — game listings with TTL. In-memory is correct.                                                                                   |
| **Hot paths**       | No DB queries per tick. All SQLite access is at load time, between games, or on UI/background threads.                                                 |
| **Save game data**  | Save files are serde-serialized sim snapshots loaded as a whole unit. No partial queries needed. SQLite indexes their *metadata*, not their *content*. |
| **Campaign state**  | Loaded/saved as a unit inside save games. Fits in memory. No relational queries.                                                                       |

### Why SQLite specifically

- **`rusqlite`** is a mature, well-maintained Rust crate with no unsafe surprises
- **Single-file database** — fits the "just a binary" deployment model. No connection strings, no separate database process, no credentials to manage
- **Self-hosting alignment** — a community relay operator on a €5 VPS gets persistent match history without installing or operating a database server
- **FTS5 full-text search** — covers workshop resource search and replay text search without Elasticsearch or a separate search service
- **WAL mode** — handles concurrent reads from web endpoints while a single writer persists new records. Sufficient for community-scale deployments (hundreds of concurrent users, not millions)
- **WASM-compatible** — `sql.js` (Emscripten build of SQLite) or `sqlite-wasm` for the browser target. The client-side replay catalog and gameplay event log work in the browser build.
- **Ad-hoc investigation** — any operator can open the `.db` file in DB Browser for SQLite, DBeaver, or the `sqlite3` CLI and run queries immediately. No Grafana dashboards required. This fills the gap between "just stdout logs" and "full OTEL stack" for community self-hosters.

### Relationship to D031 (OTEL Telemetry)

D031 (OTEL) and D034 (SQLite) are complementary, not competing:

| Concern                   | D031 (OTEL)                                  | D034 (SQLite)                                                          |
| ------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| **Real-time monitoring**  | Yes — Prometheus metrics, Grafana dashboards | No                                                                     |
| **Distributed tracing**   | Yes — Jaeger traces across clients and relay | No                                                                     |
| **Persistent records**    | No — metrics are time-windowed, logs rotate  | Yes — match history, ratings, replays are permanent                    |
| **Ad-hoc investigation**  | Requires OTEL stack running                  | Just open the `.db` file                                               |
| **Offline operation**     | No — needs collector + backends              | Yes — works standalone                                                 |
| **Client-side debugging** | Requires exporting to a collector            | Local `.db` file, queryable immediately                                |
| **AI training pipeline**  | Yes — Parquet/Arrow export for ML            | Source data — gameplay events could be exported from SQLite to Parquet |

OTEL is for operational monitoring and distributed debugging. SQLite is for persistent records, metadata indices, and standalone investigation. Tournament servers and relay servers use both — OTEL for dashboards, SQLite for match history.

### Consumers of Player Data

SQLite isn't just infrastructure — it's a UX pillar. Multiple crates read the client-side database to deliver features no other RTS offers:

| Consumer                    | Crate    | What it reads                                                                          | What it produces                                                                                                  | Required?                                                 |
| --------------------------- | -------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Player-facing analytics** | `ra-ui`  | `gameplay_events`, `matches`, `match_players`, `campaign_missions`, `roster_snapshots` | Post-game stats screen, career stats page, campaign dashboard with roster/veterancy graphs, mod balance dashboard | Always on                                                 |
| **Adaptive AI**             | `ra-ai`  | `matches`, `match_players`, `gameplay_events`                                          | Difficulty adjustment, build order variety, counter-strategy selection based on player tendencies                 | Always on                                                 |
| **LLM personalization**     | `ra-llm` | `matches`, `gameplay_events`, `campaign_missions`, `roster_snapshots`                  | Personalized missions, adaptive briefings, post-match commentary, coaching suggestions, rivalry narratives        | **Optional** — requires BYOLLM provider configured (D016) |

Player analytics and adaptive AI are always available. LLM personalization activates only when the player has configured an LLM provider — the game is fully functional without it.

All consumers are read-only. The sim writes nothing (invariant #1) — `gameplay_events` are recorded by a Bevy observer system outside `ra-sim`, and `matches`/`campaign_missions` are written at session boundaries.

### Player-Facing Analytics (`ra-ui`)

No other RTS surfaces your own match data this way. SQLite makes it trivial — queries run on a background thread, results drive a lightweight chart component in `ra-ui` (Bevy 2D: line, bar, pie, heatmap, stacked area).

**Post-game stats screen** (after every match):
- Unit production timeline (stacked area: units built per minute by type)
- Resource income/expenditure curves
- Combat engagement heatmap (where fights happened on the map)
- APM over time, army value graph, tech tree timing
- Head-to-head comparison table vs opponent
- All data: `SELECT ... FROM gameplay_events WHERE session_id = ?`

**Career stats page** (main menu):
- Win rate by faction, map, opponent, game mode — over time and lifetime
- Rating history graph (Glicko-2 from matchmaking, synced to local DB)
- Most-used units, highest kill-count units, signature strategies
- Session history: date, map, opponent, result, duration — clickable → replay
- All data: `SELECT ... FROM matches JOIN match_players ...`

**Campaign dashboard** (D021 integration):
- Roster composition graph per mission (how your army evolves across the campaign)
- Veterancy progression: track named units across missions (the tank that survived from mission 1)
- Campaign path visualization: which branches you took, which missions you replayed
- Performance trends: completion time, casualties, resource efficiency per mission
- All data: `SELECT ... FROM campaign_missions JOIN roster_snapshots ...`

**Mod balance dashboard** (Phase 7, for mod developers):
- Unit win-rate contribution, cost-efficiency scatter plots, engagement outcome distributions
- Compare across balance presets (D019) or mod versions
- `ic mod stats` CLI command reads the same SQLite database
- All data: `SELECT ... FROM gameplay_events WHERE mod_id = ?`

### LLM Personalization (`ra-llm`) — Optional, BYOLLM

When a player has configured an LLM provider (see BYOLLM in D016), `ra-llm` reads the local SQLite database (read-only) and injects player context into generation prompts. This is entirely optional — every game feature works without it. No data leaves the device unless the user's chosen LLM provider is cloud-based.

**Personalized mission generation:**
- "You've been playing Soviet heavy armor for 12 games. Here's a mission that forces infantry-first tactics."
- "Your win rate drops against Allied naval. This coastal defense mission trains that weakness."
- Prompt includes: faction preferences, unit usage patterns, win/loss streaks, map size preferences — all from SQLite aggregates.

**Adaptive briefings:**
- Campaign briefings reference your actual roster: "Commander, your veteran Tesla Tank squad from Vladivostok is available for this operation."
- Difficulty framing adapts to performance: struggling player gets "intel reports suggest light resistance"; dominant player gets "expect fierce opposition."
- Queries `roster_snapshots` and `campaign_missions` tables.

**Post-match commentary:**
- LLM generates a narrative summary of the match from `gameplay_events`: "The turning point was at 8:42 when your MiG strike destroyed the Allied War Factory, halting tank production for 3 minutes."
- Highlights unusual events: first-ever use of a unit type, personal records, close calls.
- Optional — disabled by default, requires LLM provider configured.

**Coaching suggestions:**
- "You built 40 Rifle Infantry across 5 games but they had a 12% survival rate. Consider mixing in APCs for transport."
- "Your average expansion timing is 6:30. Top players expand at 4:00-5:00."
- Queries aggregate statistics from `gameplay_events` across multiple sessions.

**Rivalry narratives:**
- Track frequent opponents from `matches` table: "You're 3-7 against PlayerX. They favor Allied air rushes — here's a counter-strategy mission."
- Generate rivalry-themed campaign missions featuring opponent tendencies.

### Adaptive AI (`ra-ai`)

`ra-ai` reads the player's match history to calibrate skirmish and campaign AI behavior. No learning during the match — all adaptation happens between games by querying SQLite.

- **Difficulty scaling:** AI selects from difficulty presets based on player win rate over recent N games. Avoids both stomps and frustration.
- **Build order variety:** AI avoids repeating the same strategy the player has already beaten. Queries `gameplay_events` for AI build patterns the player countered successfully.
- **Counter-strategy selection:** If the player's last 5 games show heavy tank play, AI is more likely to choose anti-armor compositions.
- **Campaign-specific:** In branching campaigns (D021), AI reads the player's roster strength from `roster_snapshots` and adjusts reinforcement timing accordingly.

This is designer-authored adaptation (the AI author sets the rules for how history influences behavior), not machine learning. The SQLite queries are simple aggregates run at mission load time.

**Fallback:** When no match history is available (first launch, empty database, WASM/headless builds without SQLite), `ra-ai` falls back to default difficulty presets and random strategy selection. All SQLite reads are behind an `Option<impl AiHistorySource>` — the AI is fully functional without it, just not personalized.

### Client-Side Schema (Key Tables)

```sql
-- Match history (synced from matchmaking server when online, always written locally)
CREATE TABLE matches (
    id              INTEGER PRIMARY KEY,
    session_id      TEXT NOT NULL UNIQUE,
    map_name        TEXT NOT NULL,
    game_mode       TEXT NOT NULL,
    balance_preset  TEXT NOT NULL,
    mod_id          TEXT,
    duration_ticks  INTEGER NOT NULL,
    started_at      TEXT NOT NULL,
    replay_path     TEXT,
    replay_hash     BLOB
);

CREATE TABLE match_players (
    match_id    INTEGER REFERENCES matches(id),
    player_name TEXT NOT NULL,
    faction     TEXT NOT NULL,
    team        INTEGER,
    result      TEXT NOT NULL,  -- 'victory', 'defeat', 'disconnect', 'draw'
    is_local    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (match_id, player_name)
);

-- Gameplay events (D031 structured events, written per session)
CREATE TABLE gameplay_events (
    id          INTEGER PRIMARY KEY,
    session_id  TEXT NOT NULL,
    tick        INTEGER NOT NULL,
    event_type  TEXT NOT NULL,   -- 'unit_built', 'unit_killed', 'building_placed', ...
    player      TEXT,
    data_json   TEXT NOT NULL    -- event-specific payload
);

-- Campaign state (D021 branching campaigns)
CREATE TABLE campaign_missions (
    id              INTEGER PRIMARY KEY,
    campaign_id     TEXT NOT NULL,
    mission_id      TEXT NOT NULL,
    outcome         TEXT NOT NULL,
    duration_ticks  INTEGER NOT NULL,
    completed_at    TEXT NOT NULL,
    casualties      INTEGER,
    resources_spent INTEGER
);

CREATE TABLE roster_snapshots (
    id          INTEGER PRIMARY KEY,
    mission_id  INTEGER REFERENCES campaign_missions(id),
    snapshot_at TEXT NOT NULL,   -- 'mission_start' or 'mission_end'
    roster_json TEXT NOT NULL    -- serialized unit list with veterancy, equipment
);

-- FTS5 for replay and map search (contentless — populated via triggers on matches + match_players)
CREATE VIRTUAL TABLE replay_search USING fts5(
    player_names, map_name, factions, content=''
);
-- Triggers on INSERT into matches/match_players aggregate player_names and factions
-- into the FTS index. Contentless means FTS stores its own copy — no content= source mismatch.
```

### Schema Migration

Each service manages its own schema using embedded SQL migrations (numbered, applied on startup). The `rusqlite` `user_version` pragma tracks the current schema version. Forward-only migrations — the binary upgrades the database file automatically on first launch after an update.

### Scaling Path

SQLite is the default and the right choice for 95% of deployments. For the official infrastructure at high scale, individual services can optionally be configured to use PostgreSQL by swapping the storage backend trait implementation. The schema is designed to be portable (standard SQL, no SQLite-specific syntax). FTS5 is used for full-text search on Workshop and replay catalogs — a PostgreSQL backend would substitute `tsvector`/`tsquery` for the same queries. This is a future optimization, not a launch requirement.

Each service defines its own storage trait — no god-trait mixing unrelated concerns:

```rust
/// Relay server storage — match results, desync reports, behavioral profiles.
pub trait RelayStorage: Send + Sync {
    fn store_match_result(&self, result: &CertifiedMatchResult) -> Result<()>;
    fn query_matches(&self, filter: &MatchFilter) -> Result<Vec<MatchRecord>>;
    fn store_desync_report(&self, report: &DesyncReport) -> Result<()>;
    fn update_behavior_profile(&self, player: PlayerId, profile: &BehaviorProfile) -> Result<()>;
}

/// Matchmaking server storage — ratings, match history, leaderboards.
pub trait MatchmakingStorage: Send + Sync {
    fn update_rating(&self, player: PlayerId, rating: &Glicko2Rating) -> Result<()>;
    fn leaderboard(&self, scope: &LeaderboardScope, limit: u32) -> Result<Vec<LeaderboardEntry>>;
    fn match_history(&self, player: PlayerId, limit: u32) -> Result<Vec<MatchRecord>>;
}

/// Workshop server storage — resource metadata, versions, dependencies, search.
pub trait WorkshopStorage: Send + Sync {
    fn publish_resource(&self, meta: &ResourceMetadata) -> Result<()>;
    fn search(&self, query: &str, filter: &ResourceFilter) -> Result<Vec<ResourceListing>>;
    fn resolve_deps(&self, root: &ResourceId, range: &VersionRange) -> Result<DependencyGraph>;
}

/// SQLite implementation — each service gets its own SqliteXxxStorage struct
/// wrapping a rusqlite::Connection (WAL mode, foreign keys on, journal_size_limit set).
/// PostgreSQL implementations are optional, behind `#[cfg(feature = "postgres")]`.
```

**Phase:** SQLite storage for relay and client lands in Phase 2 (replay catalog, save game index, gameplay event log). Workshop server storage lands in Phase 6a (D030). Matchmaking and tournament storage land in Phase 5 (competitive infrastructure). The `StorageBackend` trait is defined early but PostgreSQL implementation is deferred until scale requires it.

---

## D038 — In-Engine Scenario Editor (OFP/Eden-Inspired)

**Resolves:** P005 (Map editor architecture)

**Decision:** In-engine scenario editor — not just a map/terrain painter, but a full visual mission authoring tool inspired by Operation Flashpoint's mission editor (2001) and Arma 3's Eden Editor (2016). Runs inside the game with live isometric preview. Combines terrain editing (tiles, resources, cliffs) with scenario logic editing (unit placement, triggers, waypoints, modules). Two complexity tiers: Simple mode (accessible) and Advanced mode (full power).

**Rationale:**

The OFP mission editor is one of the most successful content creation tools in gaming history. It shipped with a $40 game in 2001 and generated thousands of community missions across 15 years — despite having no undo button. Its success came from three principles:

1. **Accessibility through layered complexity.** Easy mode hides advanced fields. A beginner places units and waypoints in minutes. An advanced user adds triggers, conditions, probability of presence, and scripting. Same data, different UI.
2. **Emergent behavior from simple building blocks.** Guard + Guarded By creates dynamic multi-group defense behavior from pure placement — zero scripting. Synchronization lines coordinate multi-group operations. Triggers with countdown/timeout timers and min/mid/max randomization create unpredictable encounters.
3. **The editor IS the game.** Not a separate tool, not a different application. You're inside the engine, placing things on the actual map, hitting "Preview" to test instantly. This collapses the create→test→iterate loop to seconds.

Eden Editor (2016) evolved these principles: 3D placement, undo/redo, 154 pre-built modules (complex logic as drag-and-drop nodes), compositions (reusable prefabs), layers (organizational folders), and Steam Workshop publishing directly from the editor. Arma Reforger (2022) added budget systems, behavior trees for waypoints, controller support, and a real-time Game Master mode.

**Iron Curtain applies these lessons to the RTS genre.** An RTS scenario editor has different needs than a military sim — isometric view instead of first-person, base-building and resource placement instead of terrain sculpting, wave-based encounters instead of patrol routes. But the underlying principles are identical: layered complexity, emergent behavior from simple rules, and zero barrier between editing and playing.

### Architecture

The scenario editor is a Bevy plugin in the `ra-editor` crate that reuses the game's rendering and simulation systems. It depends on `ra-render` (isometric viewport), `ra-sim` (preview playback), `ra-ui` (shared UI components like panels and attribute editors), and `ra-protocol` (order types for preview). It is NOT a separate process — it runs in the same Bevy `App` with additional editor-only systems and UI. The `ra-editor` crate is optional — headless sim, dedicated servers, and AI training builds exclude it entirely.

**Preview communication:** When the user hits "Preview," the editor serializes the current scenario to an in-memory map, spawns a `LocalNetwork` (from `ra-net`), and starts the sim. Editor-generated inputs (e.g., placing a debug unit mid-preview) are submitted as `PlayerOrder`s through `ra-protocol` — the sim never knows it's being driven by an editor. This reuses the same `GameLoop<LocalNetwork, InputSource>` path as single-player, ensuring preview behavior is identical to actual gameplay. Exiting preview restores the editor state from the pre-preview snapshot.

```
┌─────────────────────────────────────────────────┐
│                 Scenario Editor                  │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │  Terrain  │  │  Entity   │  │   Logic       │ │
│  │  Painter  │  │  Placer   │  │   Editor      │ │
│  │           │  │           │  │               │ │
│  │ tiles     │  │ units     │  │ triggers      │ │
│  │ resources │  │ buildings │  │ waypoints     │ │
│  │ cliffs    │  │ props     │  │ modules       │ │
│  │ water     │  │ markers   │  │ regions       │ │
│  └──────────┘  └──────────┘  └───────────────┘ │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │            Attributes Panel               │   │
│  │  Per-entity properties (GUI, not code)    │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌─────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Layers  │  │ Comps    │  │ Preview/Test │   │
│  │ Panel   │  │ Library  │  │ Button       │   │
│  └─────────┘  └──────────┘  └──────────────┘   │
│                                                  │
│  ┌─────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Script  │  │ Vars     │  │ Complexity   │   │
│  │ Editor  │  │ Panel    │  │ Meter        │   │
│  └─────────┘  └──────────┘  └──────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │           Campaign Editor                 │   │
│  │  Graph · State · Intermissions · Dialogue │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  Crate: ra-editor                                │
│  Uses:  ra-render (isometric view)               │
│         ra-sim   (preview playback)              │
│         ra-ui    (shared panels, attributes)     │
└─────────────────────────────────────────────────┘
```

### Editing Modes

| Mode            | Purpose                                                               | OFP Equivalent                         |
| --------------- | --------------------------------------------------------------------- | -------------------------------------- |
| **Terrain**     | Paint tiles, place resources (ore/gems), sculpt cliffs, water         | N/A (OFP had fixed terrains)           |
| **Entities**    | Place units, buildings, props, markers                                | F1 (Units) + F6 (Markers)              |
| **Groups**      | Organize units into squads/formations, set group behavior             | F2 (Groups)                            |
| **Triggers**    | Place area-based conditional logic (win/lose, events, spawns)         | F3 (Triggers)                          |
| **Waypoints**   | Assign movement/behavior orders to groups                             | F4 (Waypoints)                         |
| **Connections** | Link triggers ↔ waypoints ↔ modules visually                          | F5 (Synchronization)                   |
| **Modules**     | Pre-packaged game logic nodes                                         | F7 (Modules)                           |
| **Regions**     | Draw named spatial zones reusable across triggers and scripts         | N/A (AoE2/StarCraft concept)           |
| **Scripts**     | Browse and edit external `.lua` files referenced by inline scripts    | OFP mission folder `.sqs`/`.sqf` files |
| **Campaign**    | Visual campaign graph — mission ordering, branching, persistent state | N/A (no RTS editor has this)           |

### Entity Attributes Panel

Every placed entity has a GUI properties panel (no code required). This replaces OFP's "Init" field for most use cases while keeping advanced scripting available.

**Unit attributes (example):**

| Attribute                   | Type              | Description                                |
| --------------------------- | ----------------- | ------------------------------------------ |
| **Type**                    | dropdown          | Unit class (filtered by faction)           |
| **Name**                    | text              | Variable name for Lua scripting            |
| **Faction**                 | dropdown          | Owner: Player 1–8, Neutral, Creeps         |
| **Facing**                  | slider 0–360      | Starting direction                         |
| **Stance**                  | enum              | Guard / Patrol / Hold / Aggressive         |
| **Health**                  | slider 0–100%     | Starting hit points                        |
| **Veterancy**               | enum              | None / Rookie / Veteran / Elite            |
| **Probability of Presence** | slider 0–100%     | Random chance to exist at mission start    |
| **Condition of Presence**   | expression        | Lua boolean (e.g., `difficulty >= "hard"`) |
| **Placement Radius**        | slider 0–10 cells | Random starting position within radius     |
| **Init Script**             | text (multi-line) | Inline Lua — the primary scripting surface |

**Probability of Presence** is the single most important replayability feature from OFP. Every entity — units, buildings, resource patches, props — can have a percentage chance of existing when the mission loads. Combined with Condition of Presence, this creates two-factor randomization: "50% chance this tank platoon spawns, but only on Hard difficulty." A player replaying the same mission encounters different enemy compositions each time. This is trivially deterministic — the mission seed determines all rolls.

### Named Regions

Inspired by Age of Empires II's trigger areas and StarCraft's "locations" — both independently proved that named spatial zones are how non-programmers think about RTS mission logic. A **region** is a named area on the map (rectangle or ellipse) that can be referenced by name across multiple triggers, modules, and scripts.

Regions are NOT triggers — they have no logic of their own. They are spatial labels. A region named `bridge_crossing` can be referenced by:
- Trigger 1: "IF Player 1 faction present in `bridge_crossing` → activate reinforcements"
- Trigger 2: "IF `bridge_crossing` has no enemies → play victory audio"
- Lua script: `Region.unit_count("bridge_crossing", faction.allied) >= 5`
- Module: Wave Spawner configured to spawn at `bridge_crossing`

This separation prevents the common RTS editor mistake of coupling spatial areas to individual triggers. In AoE2, if three triggers need to reference the same map area, you create three identical areas. In IC, you create one region and reference it three times.

**Region attributes:**

| Attribute   | Type               | Description                                           |
| ----------- | ------------------ | ----------------------------------------------------- |
| **Name**    | text               | Unique identifier (e.g., `enemy_base`, `ambush_zone`) |
| **Shape**   | rect / ellipse     | Cell-aligned or free-form                             |
| **Color**   | color picker       | Editor visualization color (not visible in-game)      |
| **Tags**    | text[]             | Optional categorization for search/filter             |
| **Z-layer** | ground / air / any | Which unit layers the region applies to               |

### Inline Scripting (OFP-Style)

OFP's most powerful feature was also its simplest: double-click a unit, type a line of SQF in the Init field, done. No separate IDE, no file management, no project setup. The scripting lived *on the entity*. For anything complex, the Init field called an external script file — one line bridges the gap between visual editing and full programming.

IC follows the same model with Lua. The **Init Script** field on every entity is the primary scripting surface — not a secondary afterthought.

**Inline scripting examples:**

```lua
-- Simple: one-liner directly on the entity
this:set_stance("hold")

-- Medium: a few lines of inline behavior
this:set_patrol_route("north_road")
this:on_damaged(function() Var.set("alarm_triggered", true) end)

-- Complex: inline calls an external script file
dofile("scripts/elite_guard.lua")(this)

-- OFP equivalent of `nul = [this] execVM "patrol.sqf"`
run_script("scripts/convoy_escort.lua", { unit = this, route = "highway" })
```

This is exactly how OFP worked: most units have no Init script at all (pure visual placement). Some have one-liners. A few call external files for complex behavior. The progression is organic — a designer starts with visual placement, realizes they need a small tweak, types a line, and naturally graduates to scripting when they're ready. No mode switch, no separate tool.

**Inline scripts run at entity spawn time** — when the mission loads (or when the entity is dynamically spawned by a trigger/module). The `this` variable refers to the entity the script is attached to.

**Triggers and modules also have inline script fields:**
- Trigger **On Activation**: inline Lua that runs when the trigger fires
- Trigger **On Deactivation**: inline Lua for repeatable triggers
- Module **Custom Logic**: override or extend a module's default behavior

Every inline script field has:
- **Syntax highlighting** for Lua with IC API keywords
- **Autocompletion** for entity names, region names, variables, and the IC Lua API (D024)
- **Error markers** shown inline before preview (not in a crash log)
- **Expand button** — opens the field in a larger editing pane for multi-line scripts without leaving the entity's properties panel

### Script Files Panel

When inline scripts call external files (`dofile("scripts/ambush.lua")`), those files need to live somewhere. The **Script Files Panel** manages them — it's the editor for the external script files that inline scripts reference.

This is the same progression OFP used: Init field → `execVM "script.sqf"` → the .sqf file lives in the mission folder. IC keeps the external files *inside the editor* rather than requiring alt-tab to a text editor.

**Script Files Panel features:**
- **File browser** — lists all `.lua` files in the mission
- **New file** — create a script file, it's immediately available to inline `dofile()` calls
- **Syntax highlighting** and **autocompletion** (same as inline fields)
- **Live reload** — edit a script file during preview, save, changes take effect next tick
- **API reference sidebar** — searchable IC Lua API docs without leaving the editor
- **Breakpoints and watch** (Advanced mode) — pause the sim on a breakpoint, inspect variables

**Script scope hierarchy (mirrors the natural progression):**
```
Inline init scripts  — on entities, run at spawn (the starting point)
Inline trigger scripts — on triggers, run on activation/deactivation
External script files  — called by inline scripts for complex logic
Mission init script    — special file that runs once at mission start
```

The tiered model: most users never write a script. Some write one-liners on entities. A few create external files. The progression is seamless — there's no cliff between "visual editing" and "programming," just a gentle slope that starts with `this:set_stance("hold")`.

### Variables Panel

AoE2 scenario designers used invisible units placed off-screen as makeshift variables. StarCraft modders abused the "deaths" counter as integer storage. Both are hacks because the editors lacked native state management.

IC provides a **Variables Panel** — mission-wide state visible and editable in the GUI. Triggers and modules can read/write variables without Lua.

| Variable Type | Example                     | Use Case                             |
| ------------- | --------------------------- | ------------------------------------ |
| **Switch**    | `bridge_destroyed` (on/off) | Boolean flags for trigger conditions |
| **Counter**   | `waves_survived` (integer)  | Counting events, tracking progress   |
| **Timer**     | `mission_clock` (ticks)     | Elapsed time tracking                |
| **Text**      | `player_callsign` (string)  | Dynamic text for briefings/dialogue  |

**Variable operations in triggers (no Lua required):**
- Set variable, increment/decrement counter, toggle switch
- Condition: "IF `waves_survived` >= 5 → trigger victory"
- Module connection: Wave Spawner increments `waves_survived` after each wave

Variables are visible in the Variables Panel, named by the designer, and referenced by name everywhere. Lua scripts access them via `Var.get("waves_survived")` / `Var.set("waves_survived", 5)`. All variables are deterministic sim state (included in snapshots and replays).

### Scenario Complexity Meter

Inspired by TimeSplitters' memory bar — a persistent, always-visible indicator of scenario complexity and estimated performance impact.

```
┌──────────────────────────────────────────────┐
│  Complexity: ████████████░░░░░░░░  58%       │
│  Entities: 247/500  Triggers: 34/200         │
│  Scripts: 3 files   Regions: 12              │
└──────────────────────────────────────────────┘
```

The meter reflects:
- **Entity count** vs recommended maximum (per target platform)
- **Trigger count** and nesting depth
- **Script complexity** (line count, hook count)
- **Estimated tick cost** — based on entity types and AI behaviors

The meter is a **guideline, not a hard limit**. Exceeding 100% shows a warning ("This scenario may perform poorly on lower-end hardware") but doesn't prevent saving or publishing. Power users can push past it; casual creators stay within safe bounds without thinking about performance.

### Trigger Organization

The AoE2 Scenario Editor's trigger list collapses into an unmanageable wall at 200+ triggers — no folders, no search, no visual overview. IC prevents this from day one:

- **Folders** — group triggers by purpose ("Phase 1", "Enemy AI", "Cinematics", "Victory Conditions")
- **Search / Filter** — find triggers by name, condition type, connected entity, or variable reference
- **Color coding** — triggers inherit their folder's color for visual scanning
- **Flow graph view** — toggle between list view and a visual node graph showing trigger chains, connections to modules, and variable flow. Read-only visualization, not a node-based editor (that's the "Alternatives Considered" item). Lets designers see the big picture of complex mission logic without reading every trigger.
- **Collapse / expand** — folders collapse to single lines; individual triggers collapse to show only name + condition summary

### Undo / Redo

OFP's editor shipped without undo. Eden added it 15 years later. IC ships with full undo/redo from day one.

- **Unlimited undo stack** (bounded by memory, not count)
- Covers all operations: entity placement/deletion/move, trigger edits, terrain painting, variable changes, layer operations
- **Redo** restores undone actions until a new action branches the history
- Undo history survives save/load within a session
- **Ctrl+Z / Ctrl+Y** (desktop), equivalent bindings on controller

### Autosave & Crash Recovery

OFP's editor had no undo and no autosave — one misclick or crash could destroy hours of work. IC ships with both from day one.

- **Autosave** — configurable interval (default: every 5 minutes). Writes to a rotating set of 3 autosave slots so a corrupted save doesn't overwrite the only backup
- **Pre-preview save** — the editor automatically saves a snapshot before entering preview mode. If the game crashes during preview, the editor state is preserved
- **Recovery on launch** — if the editor detects an unclean shutdown (crash), it offers to restore from the most recent autosave: "The editor was not closed properly. Restore from autosave (2 minutes ago)? [Restore] [Discard]"
- **Undo history persistence** — the undo stack is included in autosaves. Restoring from autosave also restores the ability to undo recent changes
- **Manual save is always available** — Ctrl+S saves to the scenario file. Autosave supplements manual save, never replaces it

### Trigger System (RTS-Adapted)

OFP's trigger system adapted for RTS gameplay:

| Attribute            | Description                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Area**             | Rectangle or ellipse on the isometric map (cell-aligned or free-form)                                                |
| **Activation**       | Who triggers it: Any Player / Specific Player / Any Unit / Faction Units / No Unit (condition-only)                  |
| **Condition Type**   | Present / Not Present / Destroyed / Built / Captured / Harvested                                                     |
| **Custom Condition** | Lua expression (e.g., `Player.cash(1) >= 5000`)                                                                      |
| **Repeatable**       | Once or Repeatedly (with re-arm)                                                                                     |
| **Timer**            | Countdown (fires after delay, condition can lapse) or Timeout (condition must persist for full duration)             |
| **Timer Values**     | Min / Mid / Max — randomized, gravitating toward Mid. Prevents predictable timing.                                   |
| **Trigger Type**     | None / Victory / Defeat / Reveal Area / Spawn Wave / Play Audio / Weather Change / Reinforcements / Objective Update |
| **On Activation**    | Advanced: Lua script                                                                                                 |
| **On Deactivation**  | Advanced: Lua script (repeatable triggers only)                                                                      |
| **Effects**          | Play music track / Play sound / Show message / Camera flash / Screen shake                                           |

**RTS-specific trigger conditions:**

| Condition               | Description                                                         | OFP Equivalent   |
| ----------------------- | ------------------------------------------------------------------- | ---------------- |
| `faction_present`       | Any unit of faction X is alive inside the trigger area              | Side Present     |
| `faction_not_present`   | No units of faction X inside trigger area                           | Side Not Present |
| `building_destroyed`    | Specific building is destroyed                                      | N/A              |
| `building_captured`     | Specific building changed ownership                                 | N/A              |
| `building_built`        | Player has constructed building type X                              | N/A              |
| `unit_count`            | Faction has ≥ N units of type X alive                               | N/A              |
| `resources_collected`   | Player has harvested ≥ N resources                                  | N/A              |
| `timer_elapsed`         | N ticks since mission start (or since trigger activation)           | N/A              |
| `area_seized`           | Faction dominates the trigger area (adapted from OFP's "Seized by") | Seized by Side   |
| `all_destroyed_in_area` | Every enemy unit/building inside the area is destroyed              | N/A              |
| `custom_lua`            | Arbitrary Lua expression                                            | Custom Condition |

**Countdown vs Timeout with Min/Mid/Max** is crucial for RTS missions. Example: "Reinforcements arrive 3–7 minutes after the player captures the bridge" (Countdown, Min=3m, Mid=5m, Max=7m). The player can't memorize the exact timing. In OFP, this was the key to making missions feel alive rather than scripted.

### Module System (Pre-Packaged Logic Nodes)

Modules are IC's equivalent of Eden Editor's 154 built-in modules — complex game logic packaged as drag-and-drop nodes with a properties panel. Non-programmers get 80% of the power without writing Lua.

**Built-in module library (initial set):**

| Category        | Module            | Parameters                                    | Logic                                                                                   |
| --------------- | ----------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Spawning**    | Wave Spawner      | waves[], interval, escalation, entry_points[] | Spawns enemy units in configurable waves                                                |
| **Spawning**    | Reinforcements    | units[], entry_point, trigger, delay          | Sends units from map edge on trigger                                                    |
| **Spawning**    | Probability Group | units[], probability 0–100%                   | Group exists only if random roll passes (visual wrapper around Probability of Presence) |
| **AI Behavior** | Patrol Route      | waypoints[], alert_radius, response           | Units cycle waypoints, engage if threat detected                                        |
| **AI Behavior** | Guard Position    | position, radius, priority                    | Units defend location; peel to attack nearby threats (OFP Guard/Guarded By pattern)     |
| **AI Behavior** | Hunt and Destroy  | area, unit_types[], aggression                | AI actively searches for and engages enemies in area                                    |
| **AI Behavior** | Harvest Zone      | area, harvesters, refinery                    | AI harvests resources in designated zone                                                |
| **Objectives**  | Destroy Target    | target, description, optional                 | Player must destroy specific building/unit                                              |
| **Objectives**  | Capture Building  | building, description, optional               | Player must engineer-capture building                                                   |
| **Objectives**  | Defend Position   | area, duration, description                   | Player must keep faction presence in area for N ticks                                   |
| **Objectives**  | Timed Objective   | target, time_limit, failure_consequence       | Objective with countdown timer                                                          |
| **Objectives**  | Escort Convoy     | convoy_units[], route, description            | Protect moving units along a path                                                       |
| **Events**      | Reveal Map Area   | area, trigger, delay                          | Removes shroud from an area                                                             |
| **Events**      | Play Briefing     | text, audio_ref, portrait                     | Shows briefing panel with text and audio                                                |
| **Events**      | Camera Pan        | from, to, duration, trigger                   | Cinematic camera movement on trigger                                                    |
| **Events**      | Weather Change    | type, intensity, transition_time, trigger     | Changes weather on trigger activation                                                   |
| **Events**      | Dialogue          | lines[], trigger                              | In-game dialogue sequence                                                               |
| **Flow**        | Mission Timer     | duration, visible, warning_threshold          | Global countdown affecting mission end                                                  |
| **Flow**        | Checkpoint        | trigger, save_state                           | Auto-save when trigger fires                                                            |
| **Flow**        | Branch            | condition, true_path, false_path              | Campaign branching point (D021)                                                         |
| **Flow**        | Difficulty Gate   | min_difficulty, entities[]                    | Entities only exist above threshold difficulty                                          |
| **Effects**     | Explosion         | position, size, trigger                       | Cosmetic explosion on trigger                                                           |
| **Effects**     | Sound Emitter     | sound_ref, trigger, loop                      | Play sound effect from position                                                         |
| **Effects**     | Music Trigger     | track, trigger, fade_time                     | Change music track on trigger activation                                                |
| **Multiplayer** | Spawn Point       | faction, position                             | Player starting location in MP scenarios                                                |
| **Multiplayer** | Crate Drop        | position, trigger, contents                   | Random powerup/crate on trigger                                                         |

Modules connect to triggers and other entities via **visual connection lines** — same as OFP's synchronization system. A "Reinforcements" module connected to a trigger means the reinforcements arrive when the trigger fires. No scripting required.

**Custom modules** can be created by modders — a YAML definition + Lua implementation, publishable via Workshop (D030). The community can extend the module library indefinitely.

### Compositions (Reusable Building Blocks)

Compositions are saved groups of entities, triggers, modules, and connections — like Eden Editor's custom compositions. They bridge the gap between individual entity placement and full scene templates (04-MODDING.md).

**Hierarchy:**

```
Entity           — single unit, building, trigger, or module
  ↓ grouped into
Composition      — reusable cluster (base layout, defensive formation, scripted encounter)
  ↓ assembled into
Scenario         — complete mission with objectives, terrain, all compositions placed
  ↓ sequenced into (via Campaign Editor)
Campaign         — branching multi-mission graph with persistent state, intermissions, and dialogue (D021)
```

**Built-in compositions:**

| Composition         | Contents                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| Soviet Base (Small) | Construction Yard, Power Plant, Barracks, Ore Refinery, 3 harvesters, guard units |
| Allied Outpost      | Pillbox ×2, AA Gun, Power Plant, guard units with patrol waypoints                |
| Ore Field (Rich)    | Ore cells + ore truck spawn trigger                                               |
| Ambush Point        | Hidden units + area trigger + attack waypoints (Probability of Presence per unit) |
| Bridge Checkpoint   | Bridge + guarding units + trigger for crossing detection                          |
| Air Patrol          | Aircraft with looping patrol waypoints + scramble trigger                         |
| Coastal Defense     | Naval turrets + submarine patrol + radar                                          |

**Workflow:**
1. Place entities, arrange them, connect triggers/modules
2. Select all → "Save as Composition" → name, category, description
3. Composition appears in the Compositions Library panel
4. Drag composition onto any map to place a pre-built cluster
5. Publish to Workshop (D030) — community compositions become shared building blocks

This completes the content creation pipeline: compositions are the visual-editor equivalent of scene templates (04-MODDING.md). Scene templates are YAML/Lua for programmatic use and LLM generation. Compositions are the same concept for visual editing. They share the same underlying data format — a composition saved in the editor can be loaded as a scene template by Lua/LLM, and vice versa.

### Layers

Organizational folders for managing complex scenarios:

- Group entities by purpose: "Phase 1 — Base Defense", "Phase 2 — Counterattack", "Enemy Patrols", "Civilian Traffic"
- **Visibility toggle** — hide layers in the editor without affecting runtime (essential when a mission has 500+ entities)
- **Lock toggle** — prevent accidental edits to finalized layers
- **Runtime show/hide** — Lua can show/hide entire layers at runtime: `Layer.activate("Phase2_Reinforcements")` / `Layer.deactivate(...)`. Activating a layer spawns all entities in it as a batch; deactivating despawns them. These are **sim operations** (deterministic, included in snapshots and replays), not editor operations — the Lua API name uses `Layer`, not `Editor`, to make the boundary clear. Internally, each entity has a `layer: Option<String>` field; activation toggles a per-layer `active` flag that the spawn system reads. Entities in inactive layers do not exist in the sim — they are serialized in the scenario file but not instantiated until activation. **Deactivation is destructive:** calling `Layer.deactivate()` despawns all entities in the layer — any runtime state (damage taken, position changes, veterancy gained) is lost. Re-activating the layer spawns fresh copies from the scenario template. This is intentional: layers model "reinforcement waves" and "phase transitions," not pausable unit groups. For scenarios that need to preserve unit state across activation cycles, use Lua variables or campaign state (D021) to snapshot and restore specific values

### Preview / Test

- **Preview button** — starts the sim from current editor state. Play the mission, then return to editor. No compilation, no export, no separate process.
- **Play from cursor** — start the preview with the camera at the current editor position (Eden Editor's "play from here")
- **Speed controls** — preview at 2x/4x/8x to quickly reach later mission stages
- **Instant restart** — reset to editor state without re-entering the editor

### Simple vs Advanced Mode

Inspired by OFP's Easy/Advanced toggle:

| Feature                         | Simple Mode | Advanced Mode |
| ------------------------------- | ----------- | ------------- |
| Entity placement                | ✓           | ✓             |
| Faction/facing/health           | ✓           | ✓             |
| Basic triggers (win/lose/timer) | ✓           | ✓             |
| Waypoints (move/patrol/guard)   | ✓           | ✓             |
| Modules                         | ✓           | ✓             |
| Probability of Presence         | —           | ✓             |
| Condition of Presence           | —           | ✓             |
| Custom Lua conditions           | —           | ✓             |
| Init scripts per entity         | —           | ✓             |
| Countdown/Timeout timers        | —           | ✓             |
| Min/Mid/Max randomization       | —           | ✓             |
| Connection lines                | —           | ✓             |
| Layer management                | —           | ✓             |
| Campaign editor                 | —           | ✓             |
| Named regions                   | —           | ✓             |
| Variables panel                 | —           | ✓             |
| Inline Lua scripts on entities  | —           | ✓             |
| External script files panel     | —           | ✓             |
| Trigger folders & flow graph    | —           | ✓             |
| Intermission screens            | —           | ✓             |
| Dialogue editor                 | —           | ✓             |
| Campaign state dashboard        | —           | ✓             |
| Multiplayer / co-op properties  | —           | ✓             |
| Game mode templates             | ✓           | ✓             |

Simple mode covers 80% of what a casual scenario creator needs. Advanced mode exposes the full power. Same data format — a mission created in Simple mode can be opened in Advanced mode and extended.

### Campaign Editor

D021 defines the campaign *system* — branching mission graphs, persistent rosters, story flags. But a system without an editor means campaigns are hand-authored YAML, which limits who can create them. The Campaign Editor makes D021's full power visual.

Every RTS editor ever shipped treats missions as isolated units. Warcraft III's World Editor came closest — it had a campaign screen with mission ordering and global variables — but even that was a flat list with linear flow. No visual branching, no state flow visualization, no intermission screens, no dialogue trees. The result: almost nobody creates custom RTS campaigns, because the tooling makes it miserable.

The Campaign Editor operates at a level above the Scenario Editor. Where the Scenario Editor zooms into one mission, the Campaign Editor zooms out to see the entire campaign structure. Double-click a mission node → the Scenario Editor opens for that mission. Back out → you're at the campaign graph again.

#### Visual Campaign Graph

The core view: missions as nodes, outcomes as directed edges.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Campaign: Red Tide Rising                     │
│                                                                  │
│    ┌─────────┐   victory    ┌──────────┐   bridge_held           │
│    │ Mission │─────────────→│ Mission  │───────────────→ ...     │
│    │   1     │              │   2      │                         │
│    │ Beach   │   defeat     │ Bridge   │   bridge_lost           │
│    │ Landing │──────┐       │ Assault  │──────┐                  │
│    └─────────┘      │       └──────────┘      │                  │
│                     │                         │                  │
│                     ▼                         ▼                  │
│               ┌──────────┐             ┌──────────┐             │
│               │ Mission  │             │ Mission  │             │
│               │   1B     │             │   3B     │             │
│               │ Retreat  │             │ Fallback │             │
│               └──────────┘             └──────────┘             │
│                                                                  │
│   [+ Add Mission]  [+ Add Transition]  [Validate Graph]         │
└─────────────────────────────────────────────────────────────────┘
```

**Node (mission) properties:**

| Property         | Description                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Mission file** | Link to the scenario (created in Scenario Editor)                                          |
| **Display name** | Shown in campaign graph and briefing                                                       |
| **Outcomes**     | Named results this mission can produce (e.g., `victory`, `defeat`, `bridge_intact`)        |
| **Briefing**     | Text/audio/portrait shown before the mission                                               |
| **Debriefing**   | Text/audio shown after the mission, per outcome                                            |
| **Intermission** | Optional between-mission screen (see Intermission Screens below)                           |
| **Roster in**    | What units the player receives: `none`, `carry_forward`, `preset`, `merge`                 |
| **Roster out**   | Carryover mode for surviving units: `none`, `surviving`, `extracted`, `selected`, `custom` |

**Edge (transition) properties:**

| Property          | Description                                                                         |
| ----------------- | ----------------------------------------------------------------------------------- |
| **From outcome**  | Which named outcome triggers this transition                                        |
| **To mission**    | Destination mission node                                                            |
| **Condition**     | Optional Lua expression or story flag check (e.g., `Flag.get("scientist_rescued")`) |
| **Weight**        | Probability weight when multiple edges share the same outcome (see below)           |
| **Roster filter** | Override roster carryover for this specific path                                    |

#### Randomized and Conditional Paths

D021 defines deterministic branching — outcome X always leads to mission Y. The Campaign Editor extends this with weighted and conditional edges, enabling randomized campaign structures.

**Weighted random:** When multiple edges share the same outcome, weights determine probability. The roll is seeded from the campaign save (deterministic for replays).

```yaml
# Mission 3 outcome "victory" → random next mission
transitions:
  - from_outcome: victory
    to: mission_4a_snow      # weight 40%
    weight: 40
  - from_outcome: victory
    to: mission_4b_desert    # weight 60%
    weight: 60
```

Visually in the graph editor, weighted edges show their probability and use varying line thickness.

**Conditional edges:** An edge with a condition is only eligible if the condition passes. Conditions are evaluated before weights. This enables "if you rescued the scientist, always go to the lab mission; otherwise, random between two alternatives."

**Mission pools:** A pool node represents "pick N missions from this set" — the campaign equivalent of side quests. The player gets a random subset, plays them in any order, then proceeds. Enables roguelike campaign structures.

```
┌──────────┐         ┌─────────────────┐         ┌──────────┐
│ Mission  │────────→│   Side Mission   │────────→│ Mission  │
│    3     │         │   Pool (2 of 5)  │         │    4     │
└──────────┘         │                  │         └──────────┘
                     │ ☐ Raid Supply    │
                     │ ☐ Rescue POWs    │
                     │ ☐ Sabotage Rail  │
                     │ ☐ Defend Village │
                     │ ☐ Naval Strike   │
                     └─────────────────┘
```

Mission pools are a natural fit for the persistent roster system — side missions that strengthen (or deplete) the player's forces before a major battle.

#### Persistent State Dashboard

The biggest reason campaign creation is painful in every RTS editor: you can't see what state flows between missions. Story flags are set in Lua buried inside mission scripts. Roster carryover is configured in YAML you never visualize. Variables disappear between missions unless you manually manage them.

The **Persistent State Dashboard** makes campaign state visible and editable in the GUI.

**Roster view:**
```
┌──────────────────────────────────────────────────────┐
│  Campaign Roster                                      │
│                                                       │
│  Mission 1 → Mission 2:  Carryover: surviving         │
│  ├── Tanya (named hero)     ★ Must survive            │
│  ├── Medium Tanks ×4        ↝ Survivors carry forward  │
│  └── Engineers ×2           ↝ Survivors carry forward  │
│                                                       │
│  Mission 2 → Mission 3:  Carryover: extracted          │
│  ├── Extraction zone: bridge_south                    │
│  └── Only units in zone at mission end carry forward  │
│                                                       │
│  Named Characters: Tanya, Volkov, Stavros              │
│  Equipment Pool: Captured MiG, Prototype Chrono        │
└──────────────────────────────────────────────────────┘
```

**Story flags view:** A table of every flag across the entire campaign — where it's set, where it's read, current value in test runs. See at a glance: "The flag `bridge_destroyed` is set in Mission 2's trigger #14, read in Mission 4's Condition of Presence on the bridge entity and Mission 5's briefing text."

| Flag                | Set in                | Read in                               | Type    |
| ------------------- | --------------------- | ------------------------------------- | ------- |
| `bridge_destroyed`  | Mission 2, trigger 14 | Mission 4 (CoP), Mission 5 (briefing) | switch  |
| `scientist_rescued` | Mission 3, Lua script | Mission 4 (edge condition)            | switch  |
| `tanks_captured`    | Mission 2, debrief    | Mission 3 (roster merge)              | counter |
| `player_reputation` | Multiple missions     | Mission 6 (dialogue branches)         | counter |

**Campaign variables:** Separate from per-mission variables (Variables Panel). Campaign variables persist across ALL missions. Per-mission variables reset. The dashboard shows which scope each variable belongs to and highlights conflicts (same name in both scopes).

#### Intermission Screens

Between missions, the player sees an intermission — not just a text briefing, but a customizable screen layout. This is where campaigns become more than "mission list" and start feeling like a *game within the game*.

**Built-in intermission templates:**

| Template              | Layout                                                                        | Use Case                                   |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| **Briefing Only**     | Portrait + text + "Begin Mission" button                                      | Simple campaigns, classic RA style         |
| **Roster Management** | Unit list with keep/dismiss, equipment assignment, formation arrangement      | OFP: Resistance style unit management      |
| **Base Screen**       | Persistent base view — spend resources on upgrades that carry forward         | Between-mission base building (C&C3 style) |
| **Shop / Armory**     | Campaign inventory + purchase panel + currency                                | RPG-style equipment management             |
| **Dialogue**          | Portrait + branching text choices (see Dialogue Editor below)                 | Story-driven campaigns, RPG conversations  |
| **World Map**         | Map with mission locations — player chooses next mission from available nodes | Non-linear campaigns, Total War style      |
| **Debrief + Stats**   | Mission results, casualties, performance grade, story flag changes            | Post-mission feedback                      |
| **Custom**            | Empty canvas — arrange any combination of panels via the layout editor        | Total creative freedom                     |

Intermissions are defined per campaign node (between "finish Mission 2" and "start Mission 3"). They can chain: debrief → roster management → briefing → begin mission.

**Intermission panels (building blocks):**

- **Text panel** — rich text with variable substitution (`"Commander, we lost {Var.get('casualties')} soldiers."`).
- **Portrait panel** — character portrait + name. Links to Named Characters.
- **Roster panel** — surviving units from previous mission. Player can dismiss, reorganize, assign equipment.
- **Inventory panel** — campaign-wide items. Drag onto units to equip. Purchase from shop with campaign currency.
- **Choice panel** — buttons that set story flags or campaign variables. "Execute the prisoner? [Yes] [No]" → sets `prisoner_executed` flag.
- **Map panel** — shows campaign geography. Highlights available next missions if using mission pools.
- **Stats panel** — mission performance: time, casualties, objectives completed, units destroyed.
- **Custom Lua panel** — advanced panel that runs arbitrary Lua to generate content dynamically.

These panels compose freely. A "Base Screen" template is just a preset arrangement: roster panel on the left, inventory panel center, stats panel right, briefing text bottom. The Custom template starts empty and lets the designer arrange any combination.

#### Dialogue Editor

Branching dialogue isn't RPG-exclusive — it's what separates a campaign with a story from a campaign that's just a mission list. "Commander, we've intercepted enemy communications. Do we attack now or wait for reinforcements?" That's a dialogue tree. The choice sets a story flag that changes the next mission's layout.

The Dialogue Editor is a visual branching tree editor, similar to tools like Twine or Ink but built into the scenario editor.

```
┌──────────────────────────────────────────────────────┐
│  Dialogue: Mission 3 Briefing                         │
│                                                       │
│  ┌────────────────────┐                               │
│  │ STAVROS:            │                               │
│  │ "The bridge is       │                               │
│  │  heavily defended." │                               │
│  └────────┬───────────┘                               │
│           │                                            │
│     ┌─────┴─────┐                                      │
│     │           │                                      │
│  ┌──▼───┐  ┌───▼────┐                                  │
│  │Attack│  │Flank   │                                  │
│  │Now   │  │Through │                                  │
│  │      │  │Forest  │                                  │
│  └──┬───┘  └───┬────┘                                  │
│     │          │                                       │
│  sets:       sets:                                     │
│  approach=   approach=                                 │
│  "direct"    "flank"                                   │
│     │          │                                       │
│  ┌──▼──────────▼──┐                                    │
│  │ TANYA:          │                                    │
│  │ "I'll take       │                                    │
│  │  point."         │                                    │
│  └─────────────────┘                                    │
└──────────────────────────────────────────────────────┘
```

**Dialogue node properties:**

| Property      | Description                                                        |
| ------------- | ------------------------------------------------------------------ |
| **Speaker**   | Character name + portrait reference                                |
| **Text**      | Dialogue line (supports variable substitution)                     |
| **Audio**     | Optional voice-over reference                                      |
| **Choices**   | Player responses — each is an outgoing edge                        |
| **Condition** | Node only appears if condition is true (enables adaptive dialogue) |
| **Effects**   | On reaching this node: set flags, adjust variables, give items     |

**Conditional dialogue:** Nodes can have conditions — "Only show this line if `scientist_rescued` is true." This means the same dialogue tree adapts to campaign state. A character references events from earlier missions without the designer creating separate trees per path.

**Dialogue in missions:** Dialogue trees aren't limited to intermissions. They can trigger during a mission — an NPC unit triggers a dialogue when approached or when a trigger fires. The dialogue pauses the game (or runs alongside it, designer's choice) and the player's choice sets flags that affect the mission in real-time.

#### Named Characters

A **named character** is a persistent entity identity that survives across missions. Not a specific unit instance (those die) — a character definition that can have multiple appearances.

| Property          | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| **Name**          | Display name ("Tanya", "Commander Volkov")                              |
| **Portrait**      | Image reference for dialogue and intermission screens                   |
| **Unit type**     | Default unit type when spawned (can change per mission)                 |
| **Traits**        | Arbitrary key-value pairs (strength, charisma, rank — designer-defined) |
| **Inventory**     | Items this character carries (from campaign inventory system)           |
| **Biography**     | Text shown in roster screen, updated by Lua as the campaign progresses  |
| **Must survive**  | If true, character death → mission failure (or specific outcome)        |
| **Death outcome** | Named outcome triggered if this character dies (e.g., `tanya_killed`)   |

Named characters bridge scenarios and intermissions. Tanya in Mission 1 is the same Tanya in Mission 5 — same veterancy, same kill count, same equipment. If she dies in Mission 3 and doesn't have "must survive," the campaign continues without her — and future dialogue trees skip her lines via conditions.

This is the primitive that makes RPG campaigns possible. A designer creates 6 named characters, gives them traits and portraits, writes dialogue between them, and lets the player manage their roster between missions. That's an RPG party in an RTS shell — no engine changes required, just creative use of the campaign editor's building blocks.

#### Campaign Inventory

Persistent items that exist at the campaign level, not within any specific mission.

| Property       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| **Name**       | Item identifier (`prototype_chrono`, `captured_mig`)       |
| **Display**    | Name, icon, description shown in intermission screens      |
| **Quantity**   | Stack count (1 for unique items, N for consumables)        |
| **Category**   | Grouping for inventory panel (equipment, intel, resources) |
| **Effects**    | Optional Lua — what happens when used/equipped             |
| **Assignable** | Can be assigned to named characters in roster screen       |

Items are added via Lua (`Campaign.add_item("captured_mig", 1)`) or via debrief/intermission choices. They're spent, equipped, or consumed in later missions or intermissions.

Combined with named characters and the roster screen: a player captures enemy equipment in Mission 2, assigns it to a character in the intermission, and that character spawns with it in Mission 3. The system is general-purpose — "items" can be weapons, vehicles, intel documents, key cards, magical artifacts, or anything the designer defines.

#### Campaign Testing

The Campaign Editor includes tools for testing campaign flow without playing every mission to completion:

- **Graph validation** — checks for dead ends (outcomes with no outgoing edge), unreachable missions, circular paths (unless intentional), and missing mission files
- **Jump to mission** — start any mission with simulated campaign state (set flags, roster, and inventory to test a specific path)
- **Fast-forward state** — manually set campaign variables and flags to simulate having played earlier missions
- **Path coverage** — highlights which campaign paths have been test-played and which haven't. Color-coded: green (tested), yellow (partially tested), red (untested)
- **Campaign playthrough** — play the entire campaign with accelerated sim (or auto-resolve missions) to verify flow and state propagation
- **State inspector** — during preview, shows live campaign state: current flags, roster, inventory, variables, which path was taken

#### Reference Material (Campaign Editors)

The campaign editor design draws from these (in addition to the scenario editor references above):

- **Warcraft III World Editor (2002):** The closest any RTS came to campaign editing — campaign screen with mission ordering, cinematic editor, global variables persistent across maps. Still linear and limited: no visual branching, no roster management, no intermission screen customization. IC takes WC3's foundation and adds the graph, state, and intermission layers.
- **RPG Maker (1992–present):** Campaign-level persistent variables, party management, item/equipment systems, branching dialogue. Proves these systems work for non-programmers. IC adapts the persistence model for RTS context.
- **Twine / Ink (interactive fiction tools):** Visual branching narrative editors. Twine's node-and-edge graph directly inspired IC's campaign graph view. Ink's conditional text ("You remember the bridge{bridge_destroyed: 's destruction| still standing}") inspired IC's variable substitution in dialogue.
- **Heroes of Might and Magic III (1999):** Campaign with carryover — hero stats, army, artifacts persist between maps. Proved that persistent state between RTS-adjacent missions creates investment. Limited to linear ordering.
- **FTL / Slay the Spire (roguelikes):** Randomized mission path selection, persistent resources, risk/reward side missions. Inspired IC's mission pools and weighted random paths.
- **OFP: Resistance (2002):** The gold standard for persistent campaigns — surviving soldiers, captured equipment, emotional investment. Every feature in IC's campaign editor exists because OFP: Resistance proved persistent campaigns are transformative.

### Game Master Mode (Zeus-Inspired)

A real-time scenario manipulation mode where one player (the Game Master) controls the scenario while others play. Derived from the scenario editor's UI but operates on a live game.

**Use cases:**
- **Cooperative campaigns** — a human GM controls the enemy faction, placing reinforcements, directing attacks, adjusting difficulty in real-time based on how players are doing
- **Training** — a GM creates escalating challenges for new players
- **Events** — community game nights with a live GM creating surprises
- **Content testing** — mission designers test their scenarios with real players while making live adjustments

**Game Master controls:**
- Place/remove units and buildings (from a budget — prevents flooding)
- Direct AI unit groups (attack here, retreat, patrol)
- Change weather, time of day
- Trigger scripted events (reinforcements, briefings, explosions)
- Reveal/hide map areas
- Adjust resource levels
- Pause sim for dramatic reveals (if all players agree)

**Not included at launch:** Player control of individual units (RTS is about armies, not individual soldiers). The GM operates at the strategic level — directing groups, managing resources, triggering events.

**Phase:** Game Master mode is a Phase 6b deliverable. It reuses 90% of the scenario editor's systems — the main new work is the real-time overlay UI and budget/permission system.

### Publishing

Scenarios created in the editor export as standard IC mission format (YAML map + Lua scripts + assets). They can be:
- Saved locally
- Published to Workshop (D030) with one click
- Shared as files
- Used in campaigns (D021) — or created directly in the Campaign Editor
- Assembled into full campaigns and published as campaign packs
- Loaded by the LLM for remixing (D016)

### Reference Material

The scenario editor design draws from:
- **OFP mission editor (2001):** Probability of Presence, triggers with countdown/timeout, Guard/Guarded By, synchronization, Easy/Advanced toggle. The gold standard for "simple, not bloated, not limiting."
- **OFP: Resistance (2002):** Persistent campaign — surviving soldiers, captured equipment, emotional investment. The campaign editor exists because Resistance proved persistent campaigns are transformative.
- **Arma 3 Eden Editor (2016):** 3D placement, modules (154 built-in), compositions, layers, Workshop integration, undo/redo
- **Arma Reforger Game Master (2022):** Budget system, real-time manipulation, controller support, simplified objectives
- **Age of Empires II Scenario Editor (1999):** Condition-effect trigger system (the RTS gold standard — 25+ years of community use), trigger areas as spatial logic. Cautionary lesson: flat trigger list collapses at scale — IC adds folders, search, and flow graph to prevent this.
- **StarCraft Campaign Editor / SCMDraft (1998+):** Named locations (spatial regions referenced by name across triggers). The "location" concept directly inspired IC's Named Regions. Also: open file format enabled community editors — validates IC's YAML approach.
- **Warcraft III World Editor:** GUI-based triggers with conditions, actions, and variables. IC's module system and Variables Panel serve the same role.
- **TimeSplitters 2/3 MapMaker (2002/2005):** Visible memory/complexity budget bar — always know what you can afford. Inspired IC's Scenario Complexity Meter.
- **Super Mario Maker (2015/2019):** Element interactions create depth without parameter bloat. Behaviors emerge from spatial arrangement. Instant build-test loop measured in seconds.
- **LittleBigPlanet 2 (2011):** Pre-packaged logic modules (drop-in game patterns). Directly inspired IC's module system. Cautionary lesson: server shutdown destroyed 10M+ creations — content survival is non-negotiable (IC uses local-first storage + Workshop export).
- **RPG Maker (1992–present):** Tiered complexity architecture (visual events → scripting). Validates IC's Simple → Advanced → Lua progression.
- **Halo Forge (2007–present):** In-game real-time editing with instant playtesting. Evolution from minimal (Halo 3) to powerful (Infinite) proves: ship simple, grow over iterations. Also: game mode prefabs (Strongholds, CTF) that designers customize — directly inspired IC's Game Mode Templates.
- **Far Cry 2 Map Editor (2008):** Terrain sculpting separated from mission logic. Proves environment creation and scenario scripting can be independent workflows.
- **Divinity: Original Sin 2 (2017):** Co-op campaign with persistent state, per-player dialogue choices that affect the shared story. Game Master mode with real-time scenario manipulation. Proved co-op campaign RPG works — and that the tooling for CREATING co-op content matters as much as the runtime support.
- **Doom community editors (1994–present):** Open data formats enable 30+ years of community tools. The WAD format's openness is why Doom modding exists — validates IC's YAML-based scenario format.
- **OpenRA map editor:** Terrain painting, resource placement, actor placement — but standalone tool (we improve by being in-engine)

### Multiplayer & Co-op Scenario Tools

Most RTS editors treat multiplayer as an afterthought — place some spawn points, done. Creating a proper co-op mission, a team scenario with split objectives, or a campaign playable by two friends requires hacking around the editor's single-player assumptions. IC's editor treats multiplayer and co-op as first-class authoring targets.

#### Player Slot Configuration

Every scenario has a **Player Slots panel** — the central hub for multiplayer setup.

| Property           | Description                                                                      |
| ------------------ | -------------------------------------------------------------------------------- |
| **Slot count**     | Number of human player slots (1–8). Solo missions = 1. Co-op = 2+.               |
| **Faction**        | Which faction each slot controls (or "any" for lobby selection)                  |
| **Team**           | Team assignment (Team 1, Team 2, FFA, Configurable in lobby)                     |
| **Spawn area**     | Starting position/area per slot                                                  |
| **Starting units** | Pre-placed entities assigned to this slot                                        |
| **Color**          | Default color (overridable in lobby)                                             |
| **AI fallback**    | What happens if this slot is unfilled: AI takes over, slot disabled, or required |

The designer places entities and assigns them to player slots via the Attributes Panel — a dropdown says "belongs to Player 1 / Player 2 / Player 3 / Any." Triggers and objectives can be scoped to specific slots or shared.

#### Co-op Mission Modes

The editor supports several co-op configurations. These are set per-mission in the scenario properties:

| Mode                 | Description                                                                                               | Example                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Allied Factions**  | Each player controls a separate allied faction with their own base, army, and economy                     | Player 1: Allies infantry push. Player 2: Soviet armor support.       |
| **Shared Command**   | Players share a single faction. Units can be assigned to specific players or freely controlled by anyone. | One player manages economy/production, the other commands the army.   |
| **Commander + Ops**  | One player has the base and production (Commander), the other controls field units only (Operations).     | Commander builds and sends reinforcements. Ops does all the fighting. |
| **Asymmetric**       | Players have fundamentally different gameplay. One does RTS, the other does Game Master or support roles. | Player 1 plays the mission. Player 2 controls enemy as GM.            |
| **Split Objectives** | Players have different objectives on the same map. Both must succeed for mission victory.                 | Player 1: capture the bridge. Player 2: defend the base.              |

#### Per-Player Objectives & Triggers

The key to good co-op missions: players need their own goals, not just shared ones.

- **Objective assignment** — each objective module has a "Player" dropdown: All Players, Player 1, Player 2, etc. Shared objectives require all assigned players to contribute. Per-player objectives belong to one player.
- **Trigger scoping** — triggers can fire based on a specific player's actions: "When Player 2's units enter this region" vs "When any allied unit enters this region." The trigger's faction/player filter handles this.
- **Per-player briefings** — the briefing module supports per-slot text: Player 1 sees "Commander, your objective is the bridge..." while Player 2 sees "Comrade, you will hold the flank..."
- **Split victory conditions** — the mission can require ALL players to complete their individual objectives, or ANY player, or a custom Lua condition combining them.

#### Co-op Campaigns

Co-op extends beyond individual missions into campaigns (D021). The Campaign Editor supports multi-player campaigns with these additional properties per mission node:

| Property          | Description                                                                      |
| ----------------- | -------------------------------------------------------------------------------- |
| **Player count**  | Min and max human players for this mission (1 for solo-compatible, 2+ for co-op) |
| **Co-op mode**    | Which mode applies (see table above)                                             |
| **Solo fallback** | How the mission plays if solo: AI ally, simplified objectives, or unavailable    |

**Shared roster management:** In persistent campaigns, the carried-forward roster is shared between co-op players. The intermission screen shows the combined roster with options for dividing control:

- **Draft** — players take turns picking units from the survivor pool (fantasy football for tanks)
- **Split by type** — infantry to Player 1, vehicles to Player 2 (configured by the scenario designer)
- **Free claim** — each player grabs what they want from the shared pool, first come first served
- **Designer-assigned** — the mission YAML specifies which named characters belong to which player slot

**Drop-in / drop-out:** If a co-op player disconnects mid-mission, their units revert to AI control (or a configurable fallback: pause, auto-extract, or continue without). Reconnection restores control.

#### Multiplayer Testing

Testing multiplayer scenarios is painful in every editor — you normally need to launch two game instances and play both yourself. IC reduces this friction:

- **Multi-slot preview** — preview the mission with AI controlling unfilled player slots. Test your co-op triggers and per-player objectives without needing a real partner.
- **Slot switching** — during preview, hot-switch between player viewpoints to verify each player's experience (camera, fog of war, objectives).
- **Network delay simulation** — preview with configurable artificial latency to catch timing-sensitive trigger issues in multiplayer.
- **Lobby preview** — see how the mission appears in the multiplayer lobby before publishing: slot configuration, team layout, map preview, description.

### Game Mode Templates

Almost every popular RTS game mode can be built with IC's existing module system + triggers + Lua. But discoverability matters — a modder shouldn't need to reinvent the Survival mode from scratch when the pattern is well-known.

**Game Mode Templates** are pre-configured scenario setups: a starting point with the right modules, triggers, variables, and victory conditions already wired. The designer customizes the specifics (which units, which map, which waves) without building the infrastructure.

**Built-in templates:**

| Template                | Inspired By                     | What's Pre-Configured                                                                                                            |
| ----------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Skirmish (Standard)** | Every RTS                       | Spawn points, tech tree, resource deposits, standard victory conditions (destroy all enemy buildings)                            |
| **Survival / Horde**    | They Are Billions, CoD Zombies  | Wave Spawners with escalation, base defense zone, wave counter variable, survival timer, difficulty scaling per wave             |
| **King of the Hill**    | FPS/RTS variants                | Central capture zone, scoreboard tracking cumulative hold time per faction, configurable score-to-win                            |
| **Regicide**            | AoE2                            | King/Commander unit per player (named character, must-survive), kill the king = victory, king abilities optional                 |
| **Treaty**              | AoE2                            | No-combat timer (configurable), force peace during treaty, countdown display, auto-reveal on treaty end                          |
| **Nomad**               | AoE2                            | No starting base — each player gets only an MCV (or equivalent). Random spawn positions. Land grab gameplay.                     |
| **Empire Wars**         | AoE2 DE                         | Pre-built base per player (configurable: small/medium/large), starting army, skip early game                                     |
| **Assassination**       | StarCraft UMS                   | Commander unit per player (powerful but fragile), protect yours, kill theirs. Commander death = defeat.                          |
| **Tower Defense**       | Desktop TD, custom WC3 maps     | Pre-defined enemy paths (waypoints), restricted build zones, economy from kills, wave system with boss rounds                    |
| **Tug of War**          | WC3 custom maps                 | Automated unit spawning on timer, player controls upgrades/abilities/composition. Push the enemy back.                           |
| **Base Defense**        | They Are Billions, C&C missions | Defend a position for N minutes/waves. Pre-placed base, incoming attacks from multiple directions, escalating difficulty.        |
| **Capture the Flag**    | FPS tradition                   | Each player has a flag entity (or MCV). Steal the opponent's and return it to your base. Combines economy + raiding.             |
| **Free for All**        | Every RTS                       | 3+ players, no alliances allowed. Last player standing. Diplomacy module optional (alliances that can be broken).                |
| **Diplomacy**           | Civilization, AoE4              | FFA with dynamic alliance system. Players can propose/accept/break alliances. Shared vision opt-in. Betrayal is a game mechanic. |
| **Sandbox**             | Garry's Mod, Minecraft Creative | Unlimited resources, no enemies, no victory condition. Pure building and experimentation. Good for testing and screenshots.      |
| **Co-op Survival**      | Deep Rock Galactic, Helldivers  | Multiple human players vs escalating AI waves. Shared base. Team objectives. Difficulty scales with player count.                |
| **Sudden Death**        | Various                         | No rebuilding — if a building is destroyed, it's gone. Every engagement is high-stakes. Smaller starting armies.                 |

**Templates are starting points, not constraints.** Open a template, add your own triggers/modules/Lua, publish to Workshop. Templates save 30–60 minutes of boilerplate setup and ensure the core game mode logic is correct.

**Phasing:** Not all 17 templates ship simultaneously. **Phase 6b core set** (8 templates): Skirmish, Survival/Horde, King of the Hill, Regicide, Free for All, Co-op Survival, Sandbox, Base Defense — these cover the most common community needs and validate the template system. **Phase 7 / community-contributed** (9 templates): Treaty, Nomad, Empire Wars, Assassination, Tower Defense, Tug of War, Capture the Flag, Diplomacy, Sudden Death — these are well-defined patterns that the community can build and publish via Workshop before (or instead of) first-party implementation. Scope to what you have (Principle #6); don't ship 17 mediocre templates when 8 excellent ones plus a thriving Workshop library serves players better.

**Custom game mode templates:** Modders can create new templates and publish them to Workshop (D030). A "Zombie Survival" template, a "MOBA Lanes" template, a "RPG Quest Hub" template — the community extends the library indefinitely. Templates use the same composition + module + trigger format as everything else.

**Templates + Co-op:** Several templates have natural co-op variants. Co-op Survival is explicit, but most templates work with 2+ players if the designer adds co-op spawn points and per-player objectives.

### Editor Onboarding for Veterans

The IC editor's concepts — triggers, waypoints, entities, layers — aren't new. They're the same ideas that OFP, AoE2, StarCraft, and WC3 editors have used for decades. But each editor uses different names, different hotkeys, and different workflows. A 20-year AoE2 scenario editor veteran has deep muscle memory that IC shouldn't fight — it should channel.

**"Coming From" profile (first-launch):**

When the editor opens for the first time, a non-blocking welcome panel asks: "Which editor are you most familiar with?" Options:

| Profile             | Sets Default Keybindings | Sets Terminology Hints | Sets Tutorial Path                       |
| ------------------- | ------------------------ | ---------------------- | ---------------------------------------- |
| **New to editing**  | IC Default               | IC terms only          | Full guided tour, start with Simple mode |
| **OFP / Eden**      | F1–F7 mode switching     | OFP equivalents shown  | Skip basics, focus on RTS differences    |
| **AoE2**            | AoE2 trigger workflow    | AoE2 equivalents shown | Skip triggers, focus on Lua + modules    |
| **StarCraft / WC3** | WC3 trigger shortcuts    | Location→Region, etc.  | Skip locations, focus on compositions    |
| **Other / Skip**    | IC Default               | No hints               | Condensed overview                       |

This is a **one-time suggestion, not a lock-in.** Profile can be changed anytime in settings. All it does is set initial keybindings and toggle contextual hints.

**Customizable keybinding presets:**

Full key remapping with shipped presets:

```
IC Default   — Tab cycles modes, 1-9 entity selection, Space preview
OFP Classic  — F1-F7 modes, Enter properties, Space preview
Eden Modern  — Ctrl+1-7 modes, double-click properties, P preview
AoE2 Style   — T triggers, U units, R resources, Ctrl+C copy trigger
WC3 Style    — Ctrl+T trigger editor, Ctrl+B triggers browser
```

Not just hotkeys — mode switching behavior and right-click context menus adapt to the profile. OFP veterans expect right-click on empty ground to deselect; AoE2 veterans expect right-click to open a context menu.

**Terminology Rosetta Stone:**

A toggleable panel (or contextual tooltips) that maps IC terms to familiar ones:

| IC Term                 | OFP / Eden              | AoE2                         | StarCraft / WC3         |
| ----------------------- | ----------------------- | ---------------------------- | ----------------------- |
| Region                  | Trigger (area-only)     | Trigger Area                 | Location                |
| Module                  | Module                  | Looping Trigger Pattern      | GUI Trigger Template    |
| Composition             | Composition             | (Copy-paste group)           | Template                |
| Variables Panel         | (setVariable in SQF)    | (Invisible unit on map edge) | Deaths counter / Switch |
| Inline Script           | Init field (SQF)        | —                            | Custom Script           |
| Connection              | Synchronize             | —                            | —                       |
| Layer                   | Layer                   | —                            | —                       |
| Probability of Presence | Probability of Presence | —                            | —                       |
| Named Character         | Playable unit           | Named hero (scenario)        | Named hero              |

Displayed as **tooltips on hover** — when an AoE2 veteran hovers over "Region" in the UI, a tiny tooltip says "AoE2: Trigger Area." Not blocking, not patronizing, just a quick orientation aid. Tooltips disappear after the first few uses (configurable).

**Interactive migration cheat sheets:**

Context-sensitive help that recognizes familiar patterns:

- Designer opens Variables Panel → tip: "In AoE2, you might have used invisible units placed off-screen as variables. IC has native variables — no workarounds needed."
- Designer creates first trigger → tip: "In OFP, triggers were areas on the map. IC triggers work the same way, but you can also use Regions for reusable areas across multiple triggers."
- Designer writes first Lua line → tip: "Coming from SQF? Here's a quick Lua comparison: `_myVar = 5` → `local myVar = 5`. `hint \"hello\"` → `Game.message(\"hello\")`. Full cheat sheet: Help → SQF to Lua."

These only appear once per concept. They're dismissable and disable-all with one toggle. They're not tutorials — they're translation aids.

**Scenario import (partial):**

Full import of complex scenarios from other engines is unrealistic — but partial import of the most tedious-to-recreate elements saves real time:

- **AoE2 trigger import** — parse AoE2 scenario trigger data, convert condition→effect pairs to IC triggers + modules. Not all triggers translate, but simple ones (timer, area detection, unit death) map cleanly.
- **StarCraft trigger import** — parse StarCraft triggers, convert locations to IC Regions, convert trigger conditions/actions to IC equivalents.
- **OFP mission.sqm import** — parse entity placements, trigger positions, and waypoint connections. SQF init scripts flag as "needs Lua conversion" but the spatial layout transfers.
- **OpenRA .oramap entities** — already supported by the asset pipeline (D025/D026). Editor imports the map and entity placement directly.

Import is always **best-effort** with clear reporting: "Imported 47 of 52 triggers. 5 triggers used features without IC equivalents — see import log." Better to import 90% and fix 10% than to recreate 100% from scratch.

**The 30-minute goal:** A veteran editor from ANY background should feel productive within 30 minutes. Not expert — productive. They recognize familiar concepts wearing new names, their muscle memory partially transfers via keybinding presets, and the migration cheat sheet fills the gaps. The learning curve is a gentle slope, not a cliff.

### Controller & Steam Deck Support

Steam Deck is a target platform (Invariant #10), so the editor must be usable without mouse+keyboard — but it doesn't need to be *equally* powerful. The approach: full functionality on mouse+keyboard, comfortable core workflows on controller.

- **Controller input mapping:** Left stick for cursor movement (with adjustable acceleration), right stick for camera pan/zoom. D-pad cycles editing modes. Face buttons: place (A), delete (B), properties panel (X), context menu (Y). Triggers: undo (LT), redo (RT). Bumpers: cycle selected entity type
- **Radial menus** — controller-optimized selection wheels for entity types, trigger types, and module categories (replacing mouse-dependent dropdowns)
- **Snap-to-grid** — always active on controller (optional on mouse) to compensate for lower cursor precision
- **Touch input (Steam Deck / mobile):** Tap to place, pinch to zoom, two-finger drag to pan. Long press for properties panel. Touch works as a complement to controller, not a replacement for mouse
- **Scope:** Core editing (terrain, entity placement, triggers, waypoints, modules, preview) is controller-compatible at launch. Advanced features (inline Lua editing, campaign graph wiring, dialogue tree authoring) require keyboard and are flagged in the UI: "Connect a keyboard for this feature." This is the same trade-off Eden Editor made — and Steam Deck has a built-in keyboard for occasional text entry

**Phase:** Controller input for the editor ships with Phase 6a. Touch input is Phase 7.

### Accessibility

The editor's "accessibility through layered complexity" principle applies to disability access, not just skill tiers. These features ensure the editor is usable by the widest possible audience.

**Visual accessibility:**
- **Colorblind modes** — all color-coded elements (trigger folders, layer colors, region colors, connection lines, complexity meter) use a palette designed for deuteranopia, protanopia, and tritanopia. In addition to color, elements use distinct **shapes and patterns** (dashed vs solid lines, different node shapes) so color is never the only differentiator
- **High contrast mode** — editor UI switches to high-contrast theme with stronger borders and larger text. Toggle in editor settings
- **Scalable UI** — all editor panels respect the game's global UI scale setting (50%–200%). Editor-specific elements (attribute labels, trigger text, node labels) scale independently if needed
- **Zoom and magnification** — the isometric viewport supports arbitrary zoom levels. Combined with UI scaling, users with low vision can work at comfortable magnification

**Motor accessibility:**
- **Full keyboard navigation** — every editor operation is reachable via keyboard. Tab cycles panels, arrow keys navigate within panels, Enter confirms, Escape cancels. No operation requires mouse-only gestures
- **Adjustable click timing** — double-click speed and drag thresholds are configurable for users with reduced dexterity
- **Sticky modes** — editing modes (terrain, entity, trigger) stay active until explicitly switched, rather than requiring held modifier keys

**Cognitive accessibility:**
- **Simple/Advanced mode** (already designed) is the primary cognitive accessibility feature — it reduces the number of visible options from 30+ to ~10
- **Consistent layout** — panels don't rearrange based on context. The attributes panel is always on the right, the mode selector always on the left. Predictable layout reduces cognitive load
- **Tooltips with examples** — every field in the attributes panel has a tooltip with a concrete example, not just a description. "Probability of Presence: 75" → tooltip: "75% chance this unit exists when the mission starts. Example: set to 50 for a coin-flip ambush."

**Phase:** Colorblind modes, UI scaling, and keyboard navigation ship with Phase 6a. High contrast mode and motor accessibility refinements ship in Phase 6b–7.

> **Note:** The accessibility features above cover the **editor** UI. **Game-level accessibility** — colorblind faction colors, minimap palettes, resource differentiation, screen reader support for menus, subtitle options for EVA/briefings, and remappable controls — is a separate concern that applies to `ra-render` and `ra-ui`, not `ra-editor`. Game accessibility ships in Phase 7 (see `08-ROADMAP.md`).

### Alternatives Considered

1. **Standalone tool (like OpenRA):** Rejected. Separate process means no live preview, no reuse of rendering/sim code, higher maintenance burden, worse UX. OFP's editor succeeded precisely because it was in-game.
2. **Text-only editing (YAML + Lua):** Already supported for power users and LLM generation. The visual editor is the accessibility layer on top of the same data format.
3. **Node-based visual scripting (like Unreal Blueprints):** Too complex for the casual audience. Modules + triggers cover the sweet spot. Advanced users write Lua directly. A node editor is a potential Phase 7+ community contribution.

**Phase:** Core scenario editor (terrain + entities + triggers + waypoints + modules + compositions + preview + autosave + controller input + accessibility) ships in **Phase 6a** alongside the modding SDK and full Workshop. Campaign editor (graph, state dashboard, intermissions, dialogue, named characters), game mode templates, multiplayer/co-op scenario tools, and Game Master mode ship in **Phase 6b**. Editor onboarding ("Coming From" profiles, keybinding presets, migration cheat sheets, partial import) and touch input ship in **Phase 7**. The campaign editor's graph, state dashboard, and intermission screens build on D021's campaign system (Phase 4) — the sim-side campaign engine must exist before the visual editor can drive it.

---

## PENDING DECISIONS

| ID   | Topic                                                                                 | Needs Resolution By |
| ---- | ------------------------------------------------------------------------------------- | ------------------- |
| P001 | ~~ECS crate choice~~ — RESOLVED: Bevy's built-in ECS                                  | Resolved            |
| P002 | Fixed-point scale (256? 1024? match OpenRA's 1024?)                                   | Phase 2 start       |
| P003 | Audio library choice + music integration design (see note below)                      | Phase 3 start       |
| P004 | Lobby/matchmaking protocol specifics                                                  | Phase 5 start       |
| P005 | ~~Map editor architecture~~ — RESOLVED: In-engine scenario editor (D038)              | Resolved            |
| P006 | License choice (see tension analysis below)                                           | Phase 0 start       |
| P007 | ~~Workshop: single source vs multi-source~~ — RESOLVED: Federated multi-source (D030) | Resolved            |

### P003 — Audio System Design Notes

The audio system is the least-designed critical subsystem. Beyond the library choice, Phase 3 needs to resolve:

- **Original `.aud` playback:** Decoding original Westwood `.aud` format (IMA ADPCM, mono, varying sample rates)
- **Music loading from Remastered Collection:** If the player owns the Remastered Collection, can IC load the remastered soundtrack? Licensing allows personal use of purchased files, but the integration path needs design
- **Dynamic music states:** Combat/build/idle transitions (original RA had this — "Act on Instinct" during combat, ambient during base building). State machine driven by sim events
- **Music as Workshop resources:** Swappable soundtrack packs via D030 — architecture supports this, but audio pipeline needs to be resource-pack-aware
- **Frank Klepacki’s music is integral to C&C identity.** The audio system should treat music as a first-class system, not an afterthought. See `13-PHILOSOPHY.md` § "Audio Drives Tempo"

### P006 — License Tension Analysis

This is the single most consequential undecided item. The license choice has cascading effects on modding, community contributions, and legal relationship with EA’s GPL-licensed source.

**The tension:**
- **GPL v3** (matching EA source): Ensures legal clarity when referencing EA’s original code for gameplay values and behavior. But GPL requires derivative works to also be GPL — this could mean WASM mods compiled against IC APIs are GPL-contaminated, contradicting D035’s promise that modders choose their own license.
- **MIT / Apache 2.0:** Maximum modder freedom, but creates legal ambiguity when referencing GPL’d EA source code. Values can be independently derived (clean-room), but any copy-paste of constants or algorithms from EA source requires GPL.
- **LGPL:** Engine is open, mods can use any license — but LGPL is complex and poorly understood.
- **Dual license (GPL + commercial):** Some open-source projects offer GPL for community, commercial license for businesses. Adds complexity.

**What needs resolution:**
1. Can IC reference EA source code values (damage tables, unit speeds) without being GPL?
2. If the engine is GPL, are WASM mods running in the sandbox considered derivative works?
3. What license maximizes both community contribution AND modder freedom?

**Recommendation:** Resolve with legal counsel before any public announcement. The Bevy ecosystem uses MIT/Apache 2.0 dual license, which grants maximum flexibility. The EA source code values can potentially be treated as independently derivable facts (not copyrightable expression) — but this needs legal confirmation.
