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

---

## D017: Bevy Rendering Pipeline for Visual Enhancement

**Decision:** Leverage Bevy's modern rendering pipeline (wgpu, shaders, post-processing) to deliver visual quality beyond both OpenRA and the Remastered Collection while maintaining the classic isometric aesthetic.

**Rationale:**
- OpenRA uses SDL/OpenGL with basic sprite rendering — no post-processing, no dynamic lighting
- Remastered Collection has 4K sprites but a fixed rendering pipeline — no shader effects
- Bevy + wgpu enables: bloom, color grading, dynamic lighting, GPU particles, custom shaders
- Classic aesthetic preserved — these are enhancements, not a style change
- Shader effects bring special abilities to life: chrono-shift shimmer, tesla arcs, nuclear flash

**Scope:**
- Phase 1: basic post-processing prototypes (bloom, color grading)
- Phase 3: polished effects for game chrome
- Phase 7: full visual pipeline (dynamic lighting, particles, weather, cinematic camera)

**Design principle:** The game should look like Red Alert remembered through rose-tinted glasses. Better than you remember, but unmistakably Red Alert.

---

## PENDING DECISIONS

| ID   | Topic                                                         | Needs Resolution By |
| ---- | ------------------------------------------------------------- | ------------------- |
| P001 | ~~ECS crate choice~~ — RESOLVED: Bevy's built-in ECS          | Resolved            |
| P002 | Fixed-point scale (256? 1024? match OpenRA's 1024?)           | Phase 2 start       |
| P003 | Audio library choice                                          | Phase 3 start       |
| P004 | Lobby/matchmaking protocol specifics                          | Phase 5 start       |
| P005 | Map editor architecture (in-engine vs separate process)       | Phase 6 start       |
| P006 | License choice (GPL v3 to match EA source? MIT? Apache?)      | Phase 0 start       |
| P007 | Workshop: single source vs multi-source (see `04-MODDING.md`) | Phase 6 start       |
