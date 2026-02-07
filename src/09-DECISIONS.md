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

## D013: Pathfinding — Hierarchical A* or Flowfields

**Decision:** Use advanced pathfinding (hierarchical A* or flowfields), not basic A*.

**Rationale:**
- OpenRA uses basic A* which struggles with large unit groups
- Hierarchical/flowfield pathfinding handles mass movement far better
- Well-suited to grid-based terrain
- One of the visible performance improvements that makes people switch

---

## D014: Templating — Tera in Phase 6 (Nice-to-Have)

**Decision:** Add Tera template engine for YAML/Lua generation. Phase 6. Not foundational.

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

**Decision:** Integrate LLM-powered mission generation as a first-class feature (Phase 7), with an in-game UI for describing scenarios in natural language.

**Rationale:**
- Transforms Red Alert from finite content to infinite content
- Generated output is standard YAML + Lua — fully editable, shareable, learnable
- No other RTS (Red Alert or otherwise) offers this capability
- LLM quality is sufficient for terrain layout, objective design, AI behavior scripting
- Modular: `ra-llm` crate is optional, game works without it

**Scope:**
- Phase 7: single mission generation (terrain, objectives, enemy composition, triggers, briefing)
- Future: multi-mission campaigns, adaptive difficulty, cooperative scenario design

**Implementation approach:**
- LLM generates YAML map definition + Lua trigger scripts
- Same format as hand-crafted missions — no special runtime
- Validation pass ensures generated content is playable (valid unit types, reachable objectives)
- Can use local models or API-based models (user choice)

**Bring-Your-Own-LLM (BYOLLM) architecture:**
- `ra-llm` defines a `LlmProvider` trait — any backend that accepts a prompt and returns structured text
- Built-in providers: OpenAI-compatible API, local Ollama/llama.cpp, Anthropic API
- Users configure their provider in settings (API key, endpoint, model name)
- The engine never ships or requires a specific model — the user chooses
- Provider is a runtime setting, not a compile-time dependency
- All prompts and responses are logged (opt-in) for debugging and sharing
- Offline mode: pre-generated content works without any LLM connection

---

## D017: Bevy Rendering Pipeline for Visual Enhancement

**Decision:** Leverage Bevy's modern rendering pipeline (wgpu, shaders, post-processing) to deliver visual quality beyond both OpenRA and the Remastered Collection while maintaining the classic isometric aesthetic.

**Rationale:**
- OpenRA's renderer has evolved (post-processing added in March 2025) but remains limited by its C#/.NET architecture
- Remastered Collection has HD sprites but the renderer is proprietary and not extensible by modders
- Bevy + wgpu enables: bloom, color grading, dynamic lighting, GPU particles, custom shaders
- Classic aesthetic preserved — these are enhancements, not a style change
- Shader effects bring special abilities to life: chrono-shift shimmer, tesla arcs, nuclear flash

**Scope:**
- Phase 1: basic post-processing prototypes (bloom, color grading)
- Phase 3: polished effects for game chrome
- Phase 7: full visual pipeline (dynamic lighting, particles, weather, cinematic camera)

**Design principle:** The game should look like Red Alert remembered through rose-tinted glasses. Better than you remember, but unmistakably Red Alert.

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
1. `WorldPos` and `CellPos` carry a Z coordinate from day one (RA1 sets z=0)
2. System execution order is registered per game module, not hardcoded in engine
3. No game-specific enums in engine core — resource types, unit categories come from YAML / module registration
4. Renderer uses a `Renderable` trait — sprite and voxel backends implement it equally
5. `GameModule` trait bundles component registration, system pipeline, format loaders, and render backends
6. `PlayerOrder` is extensible to game-specific commands

**What this does NOT mean:**
- We don't build RA2 support now. Red Alert is the sole focus until it ships.
- We don't add speculative abstractions. Only the six concrete changes above.
- We don't rename crates from `ra-*` — the project identity is Red Alert. Game modules extend it.

**Scope boundary — the isometric C&C family:**
Game module extensibility targets: Red Alert, RA2, Tiberian Sun, Tiberian Dawn, Dune 2000. These share the isometric camera, grid-based terrain, sprite/voxel rendering, and `.mix` format lineage. **3D titles (Generals, C&C3, RA3) are out of scope as game modules** — they require free-rotating cameras, mesh rendering, navmesh pathfinding, and unrelated formats. ~60% of the engine wouldn't carry over. If desired later, extract the game-agnostic sim core into a shared RTS framework crate and build a 3D frontend independently.

However, **3D rendering mods for isometric-family games are explicitly supported.** A "3D Red Alert" Tier 3 mod can replace sprites with GLTF meshes and the isometric camera with a free 3D camera — without changing the sim, networking, or pathfinding. Bevy's built-in 3D pipeline makes this feasible. Cross-view multiplayer (2D vs 3D players in the same game) works because the sim is view-agnostic. See `02-ARCHITECTURE.md` § "3D Rendering as a Mod".

**Phase:** Baked into architecture from Phase 0. RA2 module is a potential Phase 8+ project.

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

**Phase:** Phase 6 (Modding & Ecosystem). CLI prototype in Phase 4 (for Lua scripting development).

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

**Phase:** Phase 4 (AI & Single Player). Campaign graph engine and Lua Campaign API are core Phase 4 deliverables.

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

**Phase:** Phase 0 (alias registry built alongside `ra-formats` YAML parser). Phase 6 (deprecation warnings configurable in `mod.yaml`).

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

**Phase:** Phase 0 (manifest parsing) + Phase 6 (full `ic mod import` workflow).

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

### D029 — Cross-Game Component Library as Phase 2 Deliverables

**Decision:** The seven first-party component systems identified in `12-MOD-MIGRATION.md` (from Combined Arms and Remastered case studies) are Phase 2 deliverables, not aspirational future work.

**The seven systems:**

| System                   | Needed For                                  | Phase 2 Scope                                                 |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------- |
| **Mind Control**         | CA (Yuri), RA2 game module, Scrin           | Controller/controllable components, capacity limits, override |
| **Carrier/Spawner**      | CA, RA2 (Aircraft Carrier, Kirov drones)    | Master/slave with respawn, recall, autonomous attack          |
| **Teleport Networks**    | CA, Nod tunnels (TD/TS), Chronosphere       | Multi-node network with primary exit designation              |
| **Shield System**        | CA, RA2 force shields, Scrin                | Absorb-before-health, recharge timer, depletion               |
| **Upgrade System**       | CA, C&C3 game module                        | Per-unit tech research via building, condition grants         |
| **Delayed Weapons**      | CA (radiation, poison), RA2 (terror drones) | Timer-attached effects on targets                             |
| **Dual Asset Rendering** | Remastered recreation, HD mod packs         | Runtime-switchable asset quality per entity (in `ra-render`). Generalized by the Resource Pack system — see `04-MODDING.md` § "Resource Packs" |

**Rationale:**
- These aren't CA-specific — they're needed for RA2 (the likely second game module). Building them in Phase 2 means they're available when RA2 development starts.
- CA can migrate to IC the moment the engine is playable, rather than waiting for Phase 6
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

**Phase:** Phase 2 (sim-side components) + Phase 1 (dual asset rendering in `ra-render`).

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

### Resource Identity & Versioning

Every Workshop resource gets a globally unique identifier: `namespace/name@version`.

- **Namespace** = author username or organization (e.g., `alice`, `community-hd-project`)
- **Name** = resource name, lowercase with hyphens (e.g., `soviet-march-music`, `allied-infantry-hd`)
- **Version** = semver (e.g., `1.2.0`)
- Full ID example: `alice/soviet-march-music@1.2.0`

### Resource Categories (Expanded)

Resources aren't limited to mod-sized packages. Granularity is flexible:

| Category          | Granularity Examples                                 |
| ----------------- | ---------------------------------------------------- |
| Music             | Single track, album, soundtrack                      |
| Sound Effects     | Weapon sound pack, ambient loops, UI sounds          |
| Voice Lines       | EVA pack, unit response set, faction voice pack      |
| Sprites           | Single unit sheet, building sprites, effects pack    |
| Textures          | Terrain tileset, UI skin, palette-indexed sprites    |
| Palettes          | Theater palette, faction palette, seasonal palette   |
| Maps              | Single map, map pack, tournament map pool            |
| Missions          | Single mission, mission chain                        |
| Campaign Chapters | Story arc with persistent state                      |
| Scene Templates   | Tera scene template for LLM composition              |
| Mission Templates | Tera mission template for LLM composition            |
| Cutscenes / Video | Briefing video, in-game cinematic, tutorial clip     |
| UI Themes         | Sidebar layout, font pack, cursor set                |
| Balance Presets   | Tuned unit/weapon stats as a selectable preset       |
| Resource Packs    | Switchable asset layer for any category — see `04-MODDING.md` § "Resource Packs" |
| Full Mods         | Traditional mod (may depend on individual resources) |

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

**Phase:** Phase 6 (Workshop infrastructure), with preparatory work in Phase 3 (manifest format finalized) and Phase 4 (LLM integration).

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
- **Collected locally** into a gameplay event log alongside replays (enriched replays)
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

| Theme | Inspired By | Aesthetic | Default For |
| --- | --- | --- | --- |
| Classic | Original RA1 (1996) | Military minimalism — bare buttons over a static title screen, Soviet-era propaganda palette, utilitarian layout, Hell March on startup | RA1 game module |
| Remastered | Remastered Collection (2020) | Clean modern military — HD polish, sleek panels, reverent to the original but refined, jukebox integration | — |
| Modern | Iron Curtain's own design | Full Bevy UI capabilities — dynamic panels, animated transitions, modern game launcher feel | New game modules |

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

**Phase:** Phase 3 (Game Chrome). Theme system is part of the `ra-ui` crate. Built-in themes ship with the engine. Community themes available in Phase 6 (workshop).

---

## PENDING DECISIONS

| ID   | Topic                                                                                 | Needs Resolution By |
| ---- | ------------------------------------------------------------------------------------- | ------------------- |
| P001 | ~~ECS crate choice~~ — RESOLVED: Bevy's built-in ECS                                  | Resolved            |
| P002 | Fixed-point scale (256? 1024? match OpenRA's 1024?)                                   | Phase 2 start       |
| P003 | Audio library choice                                                                  | Phase 3 start       |
| P004 | Lobby/matchmaking protocol specifics                                                  | Phase 5 start       |
| P005 | Map editor architecture (in-engine vs separate process)                               | Phase 6 start       |
| P006 | License choice (GPL v3 to match EA source? MIT? Apache?)                              | Phase 0 start       |
| P007 | ~~Workshop: single source vs multi-source~~ — RESOLVED: Federated multi-source (D030) | Resolved            |
