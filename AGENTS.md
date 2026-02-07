# Iron Curtain — Agent Instructions

> This file is the single source of truth for AI agents working on this project.
> Read this first. Navigate to specific design docs only when you need detail on a topic.

## What This Project Is

**Iron Curtain** is a Rust-native RTS engine, initially targeting Red Alert. Not a port of OpenRA — a clean-sheet redesign that loads OpenRA's assets, mods, and maps while delivering better performance, modding, and multiplayer. The engine is **game-agnostic at its core** — Red Alert is the first game module; RA2, Tiberian Dawn, and original games are future modules on the same engine (D018). The project is in pre-development (design phase) as of 2026-02.

- **Language:** Rust
- **Framework:** Bevy (ECS, rendering, audio, asset pipeline)
- **Rendering:** wgpu via Bevy
- **Targets:** Windows, macOS, Linux, Browser (WASM), Steam Deck, Mobile (planned)

## Non-Negotiable Architectural Invariants

Violating any of these is a bug. Do not propose designs that break them.

1. **Simulation is pure and deterministic.** No I/O, no floats, no network awareness in `ra-sim`. Takes orders, produces state. Fixed-point math only (`i32`/`i64`, never `f32`/`f64` in game logic). Same inputs → identical outputs on all platforms.

2. **Network model is pluggable via trait.** `GameLoop<N: NetworkModel>` is generic. The sim has zero imports from `ra-net`. They share only `ra-protocol`. Swapping lockstep for rollback touches zero sim code.

3. **Modding is tiered: YAML → Lua → WASM.** Each tier is optional and sandboxed. YAML for data (80% of mods), Lua for scripting (missions, abilities), WASM for power users (total conversions). No C# ever. No recompilation.

4. **Bevy is the framework.** ECS scheduling, rendering, asset pipeline, audio. Custom render passes and SIMD only where profiling justifies it. Pin Bevy version per development phase.

5. **Efficiency-first performance.** Better algorithms → cache-friendly ECS → simulation LOD → amortized work → zero-allocation hot paths → THEN multi-core as a bonus. A 2-core 2012 laptop must run 500 units smoothly. Do not reach for `par_iter()` before profiling.

6. **Real YAML, not MiniYAML.** Standard `serde_yaml` with inheritance resolved at load time. A `miniyaml2yaml` converter exists for migration.

7. **OpenRA compatibility is at the data/community layer, not the simulation layer.** Same mods, same maps, shared server browser — but NOT bit-identical simulation. We do not port OpenRA bug-for-bug.

8. **Full resource compatibility.** Every `.mix`, `.shp`, `.pal`, `.aud`, `.oramap`, and YAML rule file from Red Alert and OpenRA must load correctly. The community's existing work is sacred.

9. **Engine core is game-agnostic.** No game-specific enums, resource types, or unit categories in engine core. Positions are 3D (`WorldPos { x, y, z }`). System pipeline is registered per game module, not hardcoded. Renderer uses a `Renderable` trait. RA1 sets z=0 and registers sprite rendering — but the engine doesn't know that.

10. **Platform-agnostic by design.** Input is abstracted behind `InputSource` trait (not hardcoded to mouse/keyboard). UI layout is responsive (adapts to screen size via `ScreenClass`). No raw `std::fs` — all assets go through Bevy's asset system. Render quality is runtime-configurable. App lifecycle (suspend/resume) uses sim snapshots. The architecture must not create obstacles for any platform: desktop, browser, mobile, console.

## Crate Structure

```
iron-curtain/
├── ra-formats     # .mix, .shp, .pal, YAML parsing, MiniYAML converter
├── ra-protocol    # PlayerOrder, TimestampedOrder, OrderCodec trait (SHARED boundary)
├── ra-sim         # Deterministic simulation (Bevy FixedUpdate systems)
├── ra-net         # NetworkModel trait + implementations (Bevy plugins)
├── ra-render      # Isometric rendering, shaders, post-FX (Bevy plugin)
├── ra-ui          # Game chrome: sidebar, minimap, build queue (Bevy UI)
├── ra-audio       # .aud playback, EVA, music (Bevy audio plugin)
├── ra-script      # Lua + WASM mod runtimes
├── ra-ai          # Skirmish AI, mission scripting
├── ra-llm         # LLM mission/campaign generation, adaptive difficulty
└── ra-game        # Top-level Bevy App, ties all plugins together
```

**Critical boundary:** `ra-sim` NEVER imports from `ra-net`. `ra-net` NEVER imports from `ra-sim`. They only share `ra-protocol`.

## Key Design Decisions (Summary)

These are settled. Don't re-litigate unless the user explicitly wants to revisit one.

| ID   | Decision                                      | Rationale                                                                                                        |
| ---- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| D001 | Rust                                          | No GC, memory safety, WASM target, no competition in Rust RTS space                                              |
| D002 | Bevy (revised from "No Bevy")                 | ECS is our architecture; saves 2-4 months of engine plumbing; plugin system fits pluggable networking            |
| D003 | Real YAML, not MiniYAML                       | `serde_yaml` gives typed deserialization; standard tooling; no custom parser                                     |
| D004 | Lua for scripting (not Python)                | Tiny runtime, deterministic, sandboxable, industry standard; Python has GC, float non-determinism, unsandboxable |
| D005 | WASM for power mods                           | Near-native perf, perfectly sandboxed, deterministic, polyglot (Rust/C/Go/AssemblyScript)                        |
| D006 | Pluggable networking via trait                | Clean sim/net boundary, testable with `LocalNetwork`, community can contribute netcode independently             |
| D007 | Relay server as default multiplayer           | Blocks lag switches, enables sub-tick ordering, NAT traversal, signed replays, cheap to run                      |
| D008 | Sub-tick timestamps on orders                 | CS2-inspired; fairer edge cases (two players competing for same resource); trivial to implement                  |
| D009 | Fixed-point math, no floats in sim            | Required for deterministic lockstep; original RA used integer math; proven approach                              |
| D010 | Snapshottable sim state                       | Enables: save games, replays, desync debugging, rollback netcode, cross-engine reconciliation, automated testing |
| D011 | Cross-engine = community layer, not sim layer | Bit-identical sim is impractical; shared server browser/maps/mods is valuable and achievable                     |
| D012 | Order validation inside sim                   | Deterministic validation = all clients agree on rejections; validation IS anti-cheat                             |
| D013 | Hierarchical A* or flowfields                 | OpenRA's basic A* struggles with large groups; flowfields give 10x reduction for mass movement                   |
| D015 | Efficiency-first, not thread-first            | Algorithmic efficiency → cache layout → sim LOD → amortize → zero-alloc → THEN parallelism                       |
| D016 | LLM-generated missions (Phase 7)              | Infinite content; output is standard YAML+Lua; `ra-llm` crate is optional                                        |
| D017 | Bevy rendering pipeline                       | Post-processing, dynamic lighting, GPU particles, shader effects; classic aesthetic, modern polish               |
| D018 | Multi-game extensibility (game modules)       | Engine is game-agnostic; RA1 is first module; RA2/TD/custom are future modules; `GameModule` trait               |
| D019 | Switchable balance presets                    | Classic RA (default) vs OpenRA vs Remastered; YAML rule sets selectable in lobby; not a mod, a game option       |
| D020 | Mod SDK with `ic` CLI tool                    | `cargo-generate` templates + `ic` CLI; inspired by OpenRA Mod SDK but no C#/.NET; workshop integration           |
| D021 | Branching campaigns with persistent state     | Campaign graph (not linear), named outcomes, unit roster/veterancy/equipment carry over; OFP-inspired            |
| D022 | Dynamic weather with terrain surface effects  | Weather state machine + per-cell terrain surface state; snow/rain/sun change terrain textures; deterministic sim |

## Pending Decisions

| ID   | Topic                                                   | Needs Resolution By |
| ---- | ------------------------------------------------------- | ------------------- |
| P002 | Fixed-point scale (256? 1024? match OpenRA's 1024?)     | Phase 2 start       |
| P003 | Audio library choice                                    | Phase 3 start       |
| P004 | Lobby/matchmaking protocol specifics                    | Phase 5 start       |
| P005 | Map editor architecture (in-engine vs separate process) | Phase 6 start       |
| P006 | License (GPL v3 to match EA source? MIT? Apache?)       | Phase 0 start       |

## Development Roadmap (36 Months)

```
Phase 0 (Months 1-3)   → Foundation: ra-formats, parse all OpenRA/RA assets, miniyaml2yaml
Phase 1 (Months 3-6)   → Rendering: Bevy isometric renderer, map loading, visual showcase
Phase 2 (Months 6-12)  → Simulation: ECS sim, movement/combat/harvesting, replay system [CRITICAL]
Phase 3 (Months 12-16) → Game Chrome: sidebar, build queues, audio, first "playable" skirmish
Phase 4 (Months 16-20) → AI & Single Player: Lua scripting, WASM runtime, campaign missions
Phase 5 (Months 20-26) → Multiplayer: lockstep, relay server, desync diagnosis, shared browser
Phase 6 (Months 26-32) → Modding & Ecosystem: full mod compat, in-engine map editor, workshop
Phase 7 (Months 32-36) → LLM Missions + Polish: mission generator, visual effects, browser build
```

## Performance Targets

| Metric              | 2-core laptop | 8-core desktop | 16-core workstation | Mobile (phone/tablet) | Browser (WASM) |
| ------------------- | ------------- | -------------- | ------------------- | --------------------- | -------------- |
| Smooth battle       | 500 units     | 2000 units     | 3000+ units         | 200 units             | 300 units      |
| Tick time           | < 40ms        | < 10ms         | < 5ms               | < 50ms                | < 40ms         |
| Render FPS          | 60            | 144            | 240                 | 30                    | 60             |
| RAM (1000 units)    | < 150MB       | < 200MB        | < 200MB             | < 100MB               | < 100MB        |
| Per-tick allocation | 0 bytes       | 0 bytes        | 0 bytes             | 0 bytes               | 0 bytes        |

## Performance Efficiency Pyramid (in order of impact)

1. **Algorithmic** — Flowfields (10x over per-unit A*), spatial hash (125x over brute-force range checks), hierarchical pathfinding
2. **Cache layout** — Hot/warm/cold ECS component separation; hot data (pos+vel+health) fits L1
3. **Simulation LOD** — Full/Reduced/Minimal processing per unit based on game state (not camera)
4. **Amortized work** — Stagger expensive systems: path replan every 4-8 ticks, fog every 1-4 ticks
5. **Zero-allocation** — Pre-allocated `TickScratch` buffers, `.clear()` not `.new()`, zero heap churn
6. **Work-stealing** — rayon via Bevy for costly independent systems (pathfinding yes, movement no)

## Simulation Architecture

- **Deterministic tick:** `Simulation::apply_tick(&mut self, orders: &TickOrders)` — pure function
- **System order (fixed per game module, documented):** RA1 default: apply_orders → production → harvesting → movement → combat → death → triggers → fog. Other game modules register their own pipeline.
- **State hashing:** `state_hash()` every tick for desync detection
- **Snapshots:** `snapshot()` / `restore()` for save games, replays, rollback, desync debugging
- **Order validation:** Every order validated deterministically inside sim before execution (ownership, affordability, prerequisites, placement)

## ECS Component Model (maps from OpenRA Traits)

| OpenRA Trait | ECS Component                       | Purpose                                          |
| ------------ | ----------------------------------- | ------------------------------------------------ |
| Health       | `Health { current, max }`           | Hit points                                       |
| Mobile       | `Mobile { speed, locomotor }`       | Can move                                         |
| Attackable   | `Attackable { armor }`              | Can be damaged                                   |
| Armament     | `Armament { weapon, cooldown }`     | Can attack                                       |
| Building     | `Building { footprint }`            | Occupies cells                                   |
| Buildable    | `Buildable { cost, time, prereqs }` | Can be built                                     |
| Selectable   | `Selectable { bounds, priority }`   | Player can select                                |
| Harvester    | `Harvester { capacity, resource }`  | Gathers ore                                      |
| *(any)*      | `LlmMeta { summary, role, … }`      | LLM-readable context (optional on all resources) |

These are the **RA1 game module's** default components. Other game modules (RA2, TD) register additional components — the ECS is open for extension.

## Network Models

| Implementation            | Use Case                           | Phase  |
| ------------------------- | ---------------------------------- | ------ |
| `LocalNetwork`            | Single player, tests               | 2      |
| `ReplayPlayback`          | Watching replays                   | 2      |
| `LockstepNetwork`         | Traditional multiplayer            | 5      |
| `RelayLockstepNetwork`    | Relay server (recommended default) | 5      |
| `FogAuthoritativeNetwork` | Anti-maphack (server runs sim)     | Future |
| `RollbackNetwork`         | GGPO-style                         | Future |
| `ProtocolAdapter<N>`      | Cross-engine wrapper               | Future |

**Connection methods** (below `NetworkModel`, transport-layer): direct IP, join codes (rendezvous + hole-punch), QR codes, relay fallback. See `src/03-NETCODE.md`.

**Tracking servers** (`TrackingServer` trait): game directory for discovery. Official + community-hosted + OpenRA shared browser. Not a relay — no game data flows through it.

**Backend infrastructure:** Both tracking servers and relay servers are stateless, containerized Rust binaries. Ship as container images with docker-compose.yaml (community self-hosting) and Helm charts (k8s). Federation — client aggregates listings from multiple tracking servers. No single point of failure. Community self-hosting is a first-class use case. See `src/03-NETCODE.md` § "Backend Infrastructure".

**Multi-player scaling:** Architecture supports N players. Relay server recommended for 4+. No hard player limit — practical limit is sim cost (more players = more units) and input delay (worst connection dominates). Team games, FFA, and spectators all supported.

## Security Model

- **Maphack:** Architectural limit in lockstep (all clients have full state). Partial mitigation via memory obfuscation. Real fix: fog-authoritative server.
- **Order injection:** Deterministic validation in sim rejects impossible orders. Relay server also validates.
- **Lag switch:** Relay server owns the clock. Miss the window → orders dropped. Strikes system.
- **Speed hack:** Relay owns tick cadence — client clock irrelevant.
- **Automation/botting:** Relay-side behavioral analysis (APM patterns, reaction times, input entropy). Detection, not prevention. No kernel-level anti-cheat.
- **Match result fraud:** `CertifiedMatchResult` signed by relay server. Only signed results update rankings.
- **Replay tampering:** Ed25519-signed hash chain.
- **WASM mods:** Capability-based API. No `get_all_units()` — only `get_visible_units()`. No filesystem/network access by default.

## Competitive Infrastructure

- **Ranked matchmaking:** Glicko-2 ratings, seasonal leagues, placement matches, per-queue ratings (1v1, 2v2, FFA)
- **Leaderboards:** global, per-faction, per-map, per-game-module
- **Tournament mode:** observer with broadcast delay, bracket API, relay-certified results, server-side replay archive
- **Competitive map pool:** curated per season, community-nominated
- **No kernel-level anti-cheat.** Open-source, cross-platform. Architectural defenses only.

## Cross-Engine Compatibility Strategy

NOT bit-identical simulation. Progressive levels:
- **Level 0:** Shared server browser (same community, different executables)
- **Level 1:** Replay viewing (decode OpenRA replays, watch with drift)
- **Level 2:** Casual cross-play with periodic resync (rubber-banding acceptable)
- **Level 3:** Embedded headless OpenRA sim as authority (prediction + reconciliation)
- **Level 4:** True lockstep (effectively a port — probably never)

Built-in seams for future interop: `OrderCodec` trait, `CoordTransform`, `SimReconciler` trait, `ProtocolAdapter<N>`.

## File Formats (ra-formats crate)

**Binary:** `.mix` (archives), `.shp` (sprites), `.tmp` (terrain), `.pal` (palettes), `.aud` (audio), `.vqa` (video)
**Text:** `.ini` (original RA), MiniYAML (OpenRA), YAML (ours), `.oramap` (OpenRA maps, ZIP)

Key insight from EA source: original uses `OutList`/`DoList` pattern for order queuing — same as our `PlayerOrder → TickOrders → apply_tick()`. Integer math everywhere for determinism. LZO compression for save games.

## Document Navigation

When you need deeper detail, read the specific design doc:

| Topic                                                                      | Read                        |
| -------------------------------------------------------------------------- | --------------------------- |
| Goals, competitive landscape, why this exists                              | `src/01-VISION.md`          |
| Crate structure, ECS, sim/render split, game loop code                     | `src/02-ARCHITECTURE.md`    |
| NetworkModel trait, relay server, CS2 sub-tick, lockstep                   | `src/03-NETCODE.md`         |
| YAML rules, Lua scripting, WASM modules, sandboxing, LLM metadata, Mod SDK | `src/04-MODDING.md`         |
| File formats, EA source code insights, coordinate systems                  | `src/05-FORMATS.md`         |
| Threat model, maphack, order validation, replay signing                    | `src/06-SECURITY.md`        |
| Cross-engine play, OrderCodec, SimReconciler, ProtocolAdapter              | `src/07-CROSS-ENGINE.md`    |
| 36-month phased roadmap with exit criteria                                 | `src/08-ROADMAP.md`         |
| Full decision log with rationale and alternatives                          | `src/09-DECISIONS.md`       |
| Efficiency pyramid, profiling, performance targets, benchmarks             | `src/10-PERFORMANCE.md`     |
| OpenRA feature catalog (~700 traits), gap analysis, migration mapping      | `src/11-OPENRA-FEATURES.md` |
| Combined Arms mod migration, Remastered recreation feasibility             | `src/12-MOD-MIGRATION.md`   |

## Working With This Codebase

### mdbook
- **Never run `mdbook build`, `mdbook serve`, or any mdbook command.** The book is built manually by the maintainer when ready. Only edit the markdown source files in `src/`.

### Code Style
- Idiomatic Rust. Use `clippy` and `rustfmt`.
- Prefer zero-allocation patterns in hot paths. Use `Vec::clear()` over `Vec::new()`.
- No floats in `ra-sim`. Fixed-point only.
- Every public type in `ra-sim` must derive `Serialize, Deserialize` (for snapshots).
- System execution order in `ra-sim` is fixed and documented. Adding a new system requires deciding where in the order it runs and documenting why.

### When Adding a New Feature
1. Check `src/09-DECISIONS.md` — has this been decided already?
2. Check the roadmap (`src/08-ROADMAP.md`) — which phase does this belong to?
3. Respect the crate boundaries — especially `ra-sim` ↔ `ra-net` via `ra-protocol` only.
4. If it touches performance, read `src/10-PERFORMANCE.md` and follow the efficiency pyramid (algorithm first, threading last).
5. If it touches networking, ensure the sim remains unaware — work through the `NetworkModel` trait.
6. If it touches modding, respect the tiered model and sandbox constraints.
7. If adding a new resource type (unit, weapon, structure, map), include an `llm:` metadata block with `summary`, `role`, and `tactical_notes` at minimum. See `src/04-MODDING.md` § "LLM-Readable Resource Metadata".

### Known Duplication to Fix
- `src/00-INDEX.md` lists invariant #5 twice (duplicate line)
- Performance details appear in both `src/09-DECISIONS.md` (D015) and `src/10-PERFORMANCE.md` — the latter is canonical

### Reference Material

These are the projects we actively study. Each serves a different purpose:

- **EA Red Alert source:** https://github.com/electronicarts/CnC_Red_Alert (GPL v3) — **Canonical gameplay values.** Damage tables, weapon ranges, unit speeds, fire rates. When OpenRA and EA source disagree, EA source wins for our `classic` balance preset. Also: `OutList`/`DoList` order pattern, integer math validation.
- **EA Remastered Collection:** https://github.com/electronicarts/CnC_Remastered_Collection — **UI/UX gold standard.** Cleanest, least cluttered C&C interface. Study sidebar layout, information density, HD asset pipeline.
- **EA Tiberian Dawn source:** https://github.com/electronicarts/CnC_Tiberian_Dawn — **Shared C&C engine lineage.** Cross-reference with RA source for ambiguous behavior. Future TD game module reference.
- **OpenRA:** https://github.com/OpenRA/OpenRA — **Architecture and UX patterns** (trait system, command interface, mod ecosystem). Also: **issue tracker as community pain point radar** — recurring complaints = our design opportunities. Do NOT copy their unit balance (see D019).
- **OpenRA Mod SDK:** https://github.com/OpenRA/OpenRAModSDK — **Mod developer experience reference.** Template repo approach, engine version pinning, packaging pipeline, directory conventions. Studied for D020 (`ic` CLI tool). Pain points we solve: C# requirement, MiniYAML, GPL contamination, no workshop, no hot-reload.
- **Chrono Divide** (TypeScript browser RTS) — architecture reference for WASM target.
