# Iron Curtain — Agent Instructions

> This file is the single source of truth for AI agents working on this project.
> Read this first. Navigate to specific design docs only when you need detail on a topic.

## What This Project Is

**Iron Curtain** is a Rust-native RTS engine built for the C&C community but designed to power any classic RTS (D039). Not a port of OpenRA — a clean-sheet redesign that loads OpenRA's assets, mods, and maps while delivering better performance, modding, and multiplayer. The engine ships with **Red Alert** (default) and **Tiberian Dawn** as built-in game modules; RA2, Tiberian Sun, and community-created games are future modules on the same engine (D018). The project is in pre-development (design phase) as of 2026-02.

- **Language:** Rust
- **Framework:** Bevy (ECS, rendering, audio, asset pipeline)
- **Rendering:** wgpu via Bevy
- **Targets:** Windows, macOS, Linux, Browser (WASM), Steam Deck, Mobile (planned)

## Non-Negotiable Architectural Invariants

Violating any of these is a bug. Do not propose designs that break them.

1. **Simulation is pure and deterministic.** No I/O, no floats, no network awareness in `ic-sim`. Takes orders, produces state. Fixed-point math only (`i32`/`i64`, never `f32`/`f64` in game logic). Same inputs → identical outputs on all platforms.

2. **Network model is pluggable via trait.** `GameLoop<N: NetworkModel, I: InputSource>` is generic over both network model and input source. The sim has zero imports from `ic-net`. They share only `ic-protocol`. Swapping lockstep for rollback touches zero sim code.

3. **Modding is tiered: YAML → Lua → WASM.** Each tier is optional and sandboxed. YAML for data (80% of mods), Lua for scripting (missions, abilities), WASM for power users (total conversions). No C# ever. No recompilation.

4. **Bevy is the framework.** ECS scheduling, rendering, asset pipeline, audio. Custom render passes and SIMD only where profiling justifies it. Pin Bevy version per development phase.

5. **Efficiency-first performance.** Better algorithms → cache-friendly ECS → simulation LOD → amortized work → zero-allocation hot paths → THEN multi-core as a bonus. A 2-core 2012 laptop must run 500 units smoothly (sim target). Render quality tiers down automatically on older GPUs (GL 3.3 fallback → no compute shaders, no post-FX, CPU particles). See `10-PERFORMANCE.md` § "GPU & Hardware Compatibility". Do not reach for `par_iter()` before profiling.

6. **Real YAML, not MiniYAML.** Standard `serde_yaml` with inheritance resolved at load time. A `miniyaml2yaml` converter exists for migration. MiniYAML also loads directly at runtime via auto-conversion (D025) — but all IC-native content uses standard YAML.

7. **OpenRA compatibility is at the data/community layer, not the simulation layer.** Same mods, same maps, shared server browser — but NOT bit-identical simulation. We do not port OpenRA bug-for-bug.

8. **Full resource compatibility.** Every `.mix`, `.shp`, `.pal`, `.aud`, `.oramap`, and YAML rule file from Red Alert and OpenRA must load correctly. The community's existing work is sacred.

9. **Engine core is game-agnostic.** No game-specific enums, resource types, or unit categories in engine core. Positions are 3D (`WorldPos { x, y, z }`). `CellPos` is a game-module convenience for grid-based games, not an engine-core requirement. System pipeline is registered per game module, not hardcoded. Renderer uses a `Renderable` trait. Pathfinding uses a `Pathfinder` trait. Spatial queries use a `SpatialIndex` trait. RA1 sets z=0, registers sprite rendering, grid flowfields, and spatial hash — but the engine doesn't know that.

10. **Platform-agnostic by design.** Input is abstracted behind `InputSource` trait (not hardcoded to mouse/keyboard). UI layout is responsive (adapts to screen size via `ScreenClass`). No raw `std::fs` — all assets go through Bevy's asset system. Render quality is runtime-configurable. App lifecycle (suspend/resume) uses sim snapshots. The architecture must not create obstacles for any platform: desktop, browser, mobile, console.

## Crate Structure

```
iron-curtain/
├── ra-formats     # .mix, .shp, .pal, YAML parsing, MiniYAML converter (C&C-specific, keeps ra- prefix)
├── ic-protocol    # PlayerOrder, TimestampedOrder, OrderCodec trait (SHARED boundary)
├── ic-sim         # Deterministic simulation (Bevy FixedUpdate systems)
├── ic-net         # NetworkModel trait + implementations (Bevy plugins)
├── ic-render      # Isometric rendering, shaders, post-FX (Bevy plugin)
├── ic-ui          # Game chrome: sidebar, minimap, build queue (Bevy UI)
├── ic-editor      # In-engine scenario/campaign editor, Game Master mode (D038, Bevy plugin)
├── ic-audio       # .aud playback, EVA, music (Bevy audio plugin)
├── ic-script      # Lua + WASM mod runtimes
├── ic-ai          # Skirmish AI, mission scripting
├── ic-llm         # LLM mission/campaign generation, adaptive difficulty
└── ic-game        # Top-level Bevy App, ties all plugins together
```

> **Naming convention (D039):** Engine crates use `ic-*` (Iron Curtain) to reflect the game-agnostic identity. Exception: `ra-formats` keeps its `ra-` prefix because it reads C&C-family file formats specifically.

**Critical boundary:** `ic-sim` NEVER imports from `ic-net`. `ic-net` NEVER imports from `ic-sim`. They only share `ic-protocol`.

## Key Design Decisions (Summary)

These are settled. Don't re-litigate unless the user explicitly wants to revisit one.

| ID   | Decision                                                  | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D001 | Rust                                                      | No GC, memory safety, WASM target, no competition in Rust RTS space                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D002 | Bevy (revised from "No Bevy")                             | ECS is our architecture; saves 2-4 months of engine plumbing; plugin system fits pluggable networking                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D003 | Real YAML, not MiniYAML                                   | `serde_yaml` gives typed deserialization; standard tooling; no custom parser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D004 | Lua for scripting (not Python)                            | Tiny runtime, deterministic, sandboxable, industry standard; Python has GC, float non-determinism, unsandboxable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D005 | WASM for power mods                                       | Near-native perf, perfectly sandboxed, deterministic, polyglot (Rust/C/Go/AssemblyScript)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D006 | Pluggable networking via trait                            | Clean sim/net boundary, testable with `LocalNetwork`, community can contribute netcode independently                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D007 | Relay server as default multiplayer                       | Blocks lag switches, enables sub-tick ordering, NAT traversal, signed replays, cheap to run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D008 | Sub-tick timestamps on orders                             | CS2-inspired; fairer edge cases (two players competing for same resource); trivial to implement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D009 | Fixed-point math, no floats in sim                        | Required for deterministic lockstep; original RA used integer math; proven approach                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D010 | Snapshottable sim state                                   | Enables: save games, replays, desync debugging, rollback netcode, cross-engine reconciliation, automated testing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D011 | Cross-engine = community layer, not sim layer             | Bit-identical sim is impractical; shared server browser/maps/mods is valuable and achievable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D012 | Order validation inside sim                               | Deterministic validation = all clients agree on rejections; validation IS anti-cheat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D013 | Pathfinding via `Pathfinder` trait, grid flowfields first | Trait-abstracted like `NetworkModel`; grid flowfields are RA1 impl; engine core never calls grid-specific functions; navmesh slots in without touching sim                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D014 | Tera templating (Phase 6a, nice-to-have)                  | Eliminates copy-paste for faction variants and bulk generation; load-time only (zero runtime cost); ~50 lines to integrate; optional                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D015 | Efficiency-first, not thread-first                        | Algorithmic efficiency → cache layout → sim LOD → amortize → zero-alloc → THEN parallelism                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D016 | LLM-generated missions (Phase 7, optional)                | Optional BYOLLM enhancement; output is standard YAML+Lua; `ic-llm` crate is optional; game is fully functional without any LLM provider configured; enhances experience, never required                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D017 | Bevy rendering pipeline                                   | Classic isometric base; post-processing, dynamic lighting, GPU particles, shader effects available as modding infrastructure, not base game goals                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D018 | Multi-game extensibility (game modules)                   | Engine is game-agnostic; RA1 ships as default module, TD alongside it; RA2/custom are future community goals (not scheduled); `GameModule` trait bundles systems, pathfinder, spatial index, renderer, experience profiles                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D019 | Switchable balance presets                                | Classic RA (default) vs OpenRA vs Remastered; YAML rule sets selectable in lobby; not a mod, a game option                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D020 | Mod SDK with `ic` CLI tool                                | `cargo-generate` templates + `ic` CLI; inspired by OpenRA Mod SDK but no C#/.NET; workshop integration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D021 | Branching campaigns with persistent state                 | Campaign graph (not linear), named outcomes, unit roster/veterancy/equipment carry over; OFP-inspired                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D022 | Dynamic weather with terrain surface effects              | Weather state machine + per-cell terrain surface state; snow/rain/sun change terrain textures; deterministic sim                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D023 | OpenRA vocabulary compatibility layer                     | Accept OpenRA trait names as YAML aliases; both `Armament` and `combat` resolve to same component; zero migration friction for YAML mods                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D024 | Lua API superset of OpenRA                                | IC Lua API is a strict superset of OpenRA's 16 globals; same names, same signatures; OpenRA Lua missions run unmodified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D025 | Runtime MiniYAML loading                                  | MiniYAML loads directly at runtime (auto-converts in memory); `miniyaml2yaml` CLI optional, not prerequisite                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D026 | OpenRA mod manifest compatibility                         | Parse OpenRA `mod.yaml` manifests; point IC at OpenRA mod dir and it loads; `ic mod import` for clean migration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D027 | Canonical enum compatibility with OpenRA                  | Match OpenRA's locomotor/armor/target/stance enum names exactly; Versus tables copy-paste without translation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D028 | Condition & multiplier systems (Phase 2 hard req)         | Condition system + multiplier system + full damage pipeline are Phase 2 exit criteria, not deferred gaps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D029 | Cross-game component library (Phase 2)                    | 7 first-party systems (mind control, carriers, teleport, shields, upgrades, delayed weapons, dual assets) are Phase 2 targets; high priority but can slip to early Phase 3 without blocking (D028 is the hard gate)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D030 | Workshop resource registry & dependency system            | Artifactory-style universal artifact repository; any asset type publishable individually; semver deps, lockfile, SHA-256 integrity, license required, promotion channels, LLM discovery; federated multi-source with local/remote/virtual repos; CI/CD-friendly publishing with scoped API tokens; Steam Workshop as optional source; in-game browser with search/ratings/reviews; auto-download on lobby join (CS:GO-style); creator reputation system; DMCA/takedown policy with due process. **Phased delivery:** minimal Workshop (central server + publish + browse + auto-download) ships Phase 4–5; federation and advanced features in Phase 6a+ |
| D031 | Observability & telemetry (OTEL)                          | All servers + engine emit OTEL metrics/traces/logs; zero-cost when disabled; gameplay event stream for AI training; distributed tracing for desync debugging; pre-built Grafana dashboards for self-hosters                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D032 | Switchable UI themes (main menu, chrome, lobby)           | YAML-driven theme system with built-in presets (Classic/Remastered/Modern); original art inspired by each era's aesthetic; shellmap live backgrounds; per-game-module defaults; community themes via workshop (D030); pairs with D019 balance presets                                                                                                                                                                                                                                                                                                                                                                                                    |
| D033 | Toggleable QoL & gameplay behavior presets                | Every QoL feature from OpenRA/Remastered individually toggleable; built-in presets (Vanilla/OpenRA/Remastered/Iron Curtain); sim-affecting toggles synced in lobby, client-only toggles per-player; experience profiles combine D019+D032+D033                                                                                                                                                                                                                                                                                                                                                                                                           |
| D034 | SQLite as embedded storage (services + client)            | `rusqlite` for all persistent state: relay match history, workshop registry, matchmaking ratings, client replay/save/asset indices, gameplay event logs; player-facing analytics (post-game stats, career page, campaign dashboard); when LLM provider configured, `ic-llm` reads player history for personalized missions/briefings/coaching (D016); `ic-ai` reads match history for adaptive difficulty; preserves "just a binary" deployment; no external DB; FTS5 for search; WAL for concurrent reads; WASM-compatible; ad-hoc SQL investigation without OTEL stack                                                                                 |
| D035 | Creator recognition — voluntary tipping & attribution     | Optional tip links in resource metadata; IC never processes payments; links to Ko-fi/Patreon/GitHub Sponsors; no mandatory paywalls on mods (lesson from Skyrim paid mods, ArmA gray zone); infrastructure sustainability via donations + hosting sponsors + optional premium relay tiers                                                                                                                                                                                                                                                                                                                                                                |
| D036 | Achievement system                                        | Per-game-module achievements stored in SQLite (D034); built-in achievement infrastructure + campaign achievements in Phase 3; mod-defined achievements via YAML + Lua triggers in Phase 6b; categories: campaign/competitive/exploration/community/modding; Steam achievement sync for Steam builds; no achievements that incentivize griefing                                                                                                                                                                                                                                                                                                           |
| D037 | Community governance & platform stewardship               | Transparent governance with defined roles (maintainers, Workshop moderators, competitive committee, game module stewards, community representatives); RFC process for major decisions; self-hosting independence (no single point of failure); code of conduct; seasonal competitive map pool curation; community-elected representatives with term limits                                                                                                                                                                                                                                                                                               |
| D038 | In-engine scenario editor (OFP/Eden-inspired)             | In-engine visual editor for maps AND mission logic; resolves P005; OFP/Eden-inspired with Simple/Advanced mode; includes campaign editor, Game Master mode, co-op scenario tools, game mode templates, editor onboarding; `ic-editor` crate; see `09-DECISIONS.md` § D038 for full design                                                                                                                                                                                                                                                                                                                                                                |
| D039 | Engine scope — general-purpose classic RTS platform       | Built for C&C, open to anything; engine crates use `ic-*` naming (except `ra-formats`); ships RA1+TD; non-C&C is architectural capability, not deliverable; C&C remains primary target, roadmap, and compatibility focus                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Pending Decisions

| ID   | Topic                                                                      | Needs Resolution By |
| ---- | -------------------------------------------------------------------------- | ------------------- |
| P002 | Fixed-point scale (256? 1024? match OpenRA's 1024?)                        | Phase 2 start       |
| P003 | Audio library choice + music integration design (see `09-DECISIONS.md`)    | Phase 3 start       |
| P004 | Lobby/matchmaking protocol specifics                                       | Phase 5 start       |
| P005 | ~~Map editor architecture~~ — RESOLVED: In-engine scenario editor (D038)   | Resolved            |
| P006 | License (GPL v3 vs MIT/Apache — see tension analysis in `09-DECISIONS.md`) | Phase 0 start       |

## Development Roadmap (36 Months)

```
Phase 0 (Months 1-3)   → Foundation: ra-formats, parse all OpenRA/RA assets, miniyaml2yaml, runtime MiniYAML + alias loading (D023/D025/D026)
Phase 1 (Months 3-6)   → Rendering: Bevy isometric renderer, map loading, visual showcase
Phase 2 (Months 6-12)  → Simulation: ECS sim, movement/combat/harvesting, replay system [CRITICAL]
Phase 3 (Months 12-16) → Game Chrome: sidebar, build queues, audio, first "playable" skirmish
Phase 4 (Months 16-20) → AI & Single Player: Lua scripting, WASM runtime, campaign missions
Phase 5 (Months 20-26) → Multiplayer: lockstep, relay server, desync diagnosis, shared browser
Phase 6a (Months 26-30) → Core Modding + Scenario Editor: full mod compat, in-engine scenario editor (D038), full workshop registry (D030)
Phase 6b (Months 30-34) → Campaign Editor + Game Modes: campaign graph editor, game mode templates, co-op scenario tools, Game Master mode
Phase 7  (Months 34-36) → LLM Missions + Ecosystem + Polish: mission generator, visual effects, ecosystem polish, browser build
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
- **Pathfinding and spatial queries are trait-abstracted:** `Pathfinder` trait (grid flowfields for RA1, navmesh for future modules) and `SpatialIndex` trait (spatial hash for RA1, BVH for future modules). Engine core calls traits, never grid-specific functions.
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

> **Gap acknowledgment:** The 9 components above are the documented core. The gap analysis in `src/11-OPENRA-FEATURES.md` identifies **~30+ additional gameplay systems** needed for a playable Red Alert (power, transport, capture, stealth, crates, mines, crush, guard, deploy, veterancy, etc.). These are tracked as undesigned gaps with priority tiers (P0–P3). See `src/11-OPENRA-FEATURES.md` § "Recommended Action Plan" for the triage order.

## Network Models

Iron Curtain **ships** one netcode: relay-assisted deterministic lockstep with sub-tick order fairness. `LockstepNetwork` and `RelayLockstepNetwork` implement the same protocol — the difference is topology. The `NetworkModel` trait is deliberately pluggable (D006) — the community can contribute entirely different netcode without touching sim code. The last three rows are future first-party architectures; third-party implementations are also possible.

| Implementation            | What It Is                                | When Used                      | Phase  |
| ------------------------- | ----------------------------------------- | ------------------------------ | ------ |
| `LocalNetwork`            | Pass-through — orders go straight to sim  | Single player, automated tests | 2      |
| `ReplayPlayback`          | File reader — feeds saved orders into sim | Watching replays               | 2      |
| `LockstepNetwork`         | P2P deployment (same protocol, no relay)  | LAN, ≤3 players, direct IP     | 5      |
| `RelayLockstepNetwork`    | Relay deployment (recommended for online) | Internet multiplayer, ranked   | 5      |
| `FogAuthoritativeNetwork` | Server runs full sim, partial visibility  | Anti-maphack (future arch)     | Future |
| `RollbackNetwork`         | GGPO-style prediction + rollback          | Experimental (future arch)     | Future |
| `ProtocolAdapter<N>`      | Cross-engine wire format translation      | OpenRA interop (future arch)   | Future |

**Connection methods** (below `NetworkModel`, transport-layer): direct IP, join codes (rendezvous + hole-punch), QR codes, relay fallback. See `src/03-NETCODE.md`.

**Tracking servers** (`TrackingServer` trait): game directory for discovery. Official + community-hosted + OpenRA shared browser. Not a relay — no game data flows through it.

**Backend infrastructure:** Both tracking servers and relay servers are stateless, containerized Rust binaries. Ship as container images with docker-compose.yaml (community self-hosting) and Helm charts (k8s). Federation — client aggregates listings from multiple tracking servers. No single point of failure. Community self-hosting is a first-class use case. See `src/03-NETCODE.md` § "Backend Infrastructure".

**Multi-player scaling:** Architecture supports N players. Relay server recommended for 4+. No hard player limit — practical limit is sim cost (more players = more units) and input delay (worst connection dominates). Team games, FFA, and spectators all supported.

## Security Model

- **Maphack:** Architectural limit in lockstep (all clients have full state). Partial mitigation via memory obfuscation. Real fix: fog-authoritative server.
- **Order injection:** Deterministic validation in sim rejects impossible orders. Relay server also validates.
- **Order forgery (P2P):** Ed25519 per-order signing with ephemeral session keys. Relay mode: relay stamps orders with authenticated sender slot.
- **Lag switch:** Relay server owns the clock. Miss the window → orders dropped. Strikes system.
- **Speed hack:** Relay owns tick cadence — client clock irrelevant.
- **State saturation:** Three-layer rate control — time-budget pool (`OrderBudget`, from Minetest's LagPool) + bandwidth throttle + hard cap (`ProtocolLimits.max_orders_per_tick`) + relay bandwidth arbitration prevent any single player from flooding the order pipeline. Based on Bryant & Saiedian (2021) attack taxonomy.
- **Transport encryption:** DTLS 1.3 / TLS 1.3 for all game traffic. Never custom crypto. Generals used XOR with a fixed key — cautionary example.
- **Protocol hardening:** `BoundedReader` with remaining-bytes tracking, hard size caps on all fields, per-connection memory budgets. Inspired by Generals source code analysis (receive-side parsers had zero bounds checking). See `research/rts-netcode-security-vulnerabilities.md`.
- **Automation/botting:** Relay-side behavioral analysis (APM patterns, reaction times, input entropy). Detection, not prevention. No kernel-level anti-cheat.
- **Match result fraud:** `CertifiedMatchResult` signed by relay server. Only signed results update rankings.
- **Replay tampering:** Ed25519-signed hash chain.
- **WASM mods:** Capability-based API. No `get_all_units()` — only `get_visible_units()`. No filesystem/network access by default.

## Competitive Infrastructure

- **Ranked matchmaking:** Glicko-2 ratings, seasonal leagues, placement matches, per-queue ratings (1v1, 2v2, FFA)
- **Leaderboards:** global, per-faction, per-map, per-game-module
- **Tournament mode:** observer with broadcast delay, bracket API, relay-certified results, server-side replay archive
- **Competitive map pool:** curated per season, community-nominated
- **Competitive committee (D037):** community-elected body curating seasonal map pools and competitive rule sets
- **Competitive achievements (D036):** ranked placement, league promotion, season finish, tournament participation
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

| Topic                                                                                             | Read                        |
| ------------------------------------------------------------------------------------------------- | --------------------------- |
| Goals, competitive landscape, why this exists                                                     | `src/01-VISION.md`          |
| Crate structure, ECS, sim/render split, game loop, UI themes                                      | `src/02-ARCHITECTURE.md`    |
| NetworkModel trait, relay server, CS2 sub-tick, lockstep, adaptive run-ahead                      | `src/03-NETCODE.md`         |
| YAML rules, Lua scripting, WASM modules, sandboxing, LLM metadata, Mod SDK, resource packs        | `src/04-MODDING.md`         |
| File formats, EA source code insights, coordinate systems                                         | `src/05-FORMATS.md`         |
| Threat model, maphack, order validation, replay signing, transport encryption, protocol hardening | `src/06-SECURITY.md`        |
| Cross-engine play, OrderCodec, SimReconciler, ProtocolAdapter                                     | `src/07-CROSS-ENGINE.md`    |
| 36-month phased roadmap with exit criteria                                                        | `src/08-ROADMAP.md`         |
| Full decision log with rationale and alternatives                                                 | `src/09-DECISIONS.md`       |
| Efficiency pyramid, profiling, performance targets, benchmarks                                    | `src/10-PERFORMANCE.md`     |
| OpenRA feature catalog (~700 traits), gap analysis, migration mapping                             | `src/11-OPENRA-FEATURES.md` |
| Combined Arms mod migration, Remastered recreation feasibility                                    | `src/12-MOD-MIGRATION.md`   |
| Development philosophy, design review principles, lessons from C&C creators and OpenRA            | `src/13-PHILOSOPHY.md`      |

## Working With This Codebase

### mdbook
- **Never run `mdbook build`, `mdbook serve`, or any mdbook command.** The book is built manually by the maintainer when ready. Only edit the markdown source files in `src/`.
- **When linking to design docs from public-facing files (README, etc.), use the hosted mdbook URL:** `https://dk26.github.io/iron-curtain-design-docs/`. Link to `.html` pages (e.g., `01-VISION.html`), not the raw `src/*.md` source files.

### Code Style
- Idiomatic Rust. Use `clippy` and `rustfmt`.
- Prefer zero-allocation patterns in hot paths. Use `Vec::clear()` over `Vec::new()`.
- No floats in `ic-sim`. Fixed-point only.
- Every public type in `ic-sim` must derive `Serialize, Deserialize` (for snapshots).
- System execution order in `ic-sim` is fixed and documented. Adding a new system requires deciding where in the order it runs and documenting why.

### When Adding a New Feature
1. Check `src/09-DECISIONS.md` — has this been decided already?
2. Check the roadmap (`src/08-ROADMAP.md`) — which phase does this belong to?
3. Respect the crate boundaries — especially `ic-sim` ↔ `ic-net` via `ic-protocol` only.
4. If it touches performance, read `src/10-PERFORMANCE.md` and follow the efficiency pyramid (algorithm first, threading last).
5. If it touches networking, ensure the sim remains unaware — work through the `NetworkModel` trait.
6. If it touches modding, respect the tiered model and sandbox constraints.
7. Consider community impact — does this address a known pain point or create new friction? Check `src/01-VISION.md` for documented community needs and `src/11-OPENRA-FEATURES.md` for the gap analysis. Treat community feedback as a design input, not an afterthought.
8. If adding a new resource type (unit, weapon, structure, map), consider including an `llm:` metadata block with `summary`, `role`, and `tactical_notes`. This metadata is always optional — resources work without it. See `src/04-MODDING.md` § "LLM-Readable Resource Metadata".

### Design & Code Review Philosophy

All design and code review should be guided by — but not limited to — the development philosophy documented in `src/13-PHILOSOPHY.md` and the community context documented in `src/01-VISION.md` and `src/11-OPENRA-FEATURES.md`. The philosophy chapter compiles the publicly-stated principles of the original C&C creators (Joe Bostic, Brett Sperry, Louis Castle, Frank Klepacki, and others) and the OpenRA team. The community context documents known pain points, feature gaps, and what the C&C community actually needs. Full quotes and source material are in `research/westwood-ea-development-philosophy.md`.

Key review principles drawn from the original creators:

1. **"Does this make the toy soldiers come alive?"** (Bostic) — Every feature should serve the core fantasy. If it doesn't, it needs strong justification.
2. **Fun beats documentation** (Bostic) — If something plays well but contradicts the design doc, update the doc. If it's in the doc but plays poorly, cut it.
3. **Separate simulation from I/O** (EA source code) — The sim is the part that survives decades. Keep it pure. Rendering and networking are replaceable.
4. **Data-driven everything** (Westwood INI philosophy) — Game values belong in YAML, not code. If a modder would want to change it, it shouldn't require recompilation.
5. **Encourage experimentation** (Klepacki) — Write good work first, then adapt for constraints. Don't pre-optimize into mediocrity.
6. **Great teams make great games** (Long) — Team dynamics matter more than individual technical skill. Documentation, clear invariants, and respectful collaboration enable great teams.
7. **Scope to what you have** (Legg) — Two less-than-excellent systems are worse than one excellent system. Each phase should focus.
8. **Make temporary compromises explicit** (OpenRA lesson) — Label experiments as experiments. Use toggles (D033) so early-phase decisions don't become irrevocable identity.
10. **Build with the community, not just for them** — Community pain points (OpenRA issue tracker, modder feedback, competitive player needs) are primary design inputs. Before finalizing a decision, ask: *"How does this affect the people who will actually use this?"* Check `src/01-VISION.md` and `src/11-OPENRA-FEATURES.md`.

Game design principles (highlights — full list with rationale in `src/13-PHILOSOPHY.md`):

11. **Immediate feedback — the one-second rule** (Castle) — Every player action produces audible and visible feedback within one second. Silence is a UX bug.
12. **Visual clarity** (Castle) — One-second screenshot test: who's winning, what's on screen, where are the resources? Readability beats aesthetics.
14. **Asymmetric faction identity** (Westwood) — Factions must feel like different games, not stat reskins. Balance through counter-play, not stat parity.
15. **The core loop: Extract → Build → Amass → Crush** (Westwood/EA) — Every game feature should serve one of these steps. Features that bypass the loop need strong justification.

These are guidelines, not a rigid checklist. Keep an open mind — the original creators themselves discovered their best ideas by iterating, not by following specifications. When a design decision feels uncertain, the philosophy doc provides grounding but should never prevent innovation.

### Known Duplication to Fix
- Performance details appear in both `src/09-DECISIONS.md` (D015) and `src/10-PERFORMANCE.md` — the latter is canonical

### Mistakes to Never Repeat
These are specific errors made by agents on this project. Read them before editing any public-facing file.

1. **Agent wrote "design documents are complete" and "implementation beginning" in README.** Neither was true — design is in progress, no code exists. Never declare project status. Only the maintainer decides that.

2. **Agent added author name to FOREWORD.md and README.md but forgot `book.toml` and `00-INDEX.md`.** User had to point out each missing file. When a change touches multiple files, scan all of them first: `AGENTS.md`, `README.md`, `book.toml`, `src/00-INDEX.md`, `src/SUMMARY.md`, `src/FOREWORD.md`, and any design doc that references the topic. Update everything in one pass.

3. **README used present tense for features that don't exist:** "loads your existing OpenRA mods," "your OpenRA mods just work," "eliminates lag switching," "runs headless for AI training." Nothing is implemented. Use future tense: "will load," "designed to," "targets."

4. **README Resource Compatibility table used ✅ checkmarks for planned features.** ✅ means "done." Nothing is done. Use phase numbers or "planned" labels instead.

5. **FOREWORD used jargon a non-technical reader would need to Google:** "borrow checker," "ECS," "dangling pointers," "segfaults," "use-after-free," "buffer overflows," "data races," "GC pauses," "memory layout," "runtime overhead." Public-facing docs should explain what Rust *does for the user* (fast, safe, reliable), not compiler internals. Technical terms belong in `src/01-VISION.md` through `src/12-MOD-MIGRATION.md`.

6. **Don't romanticize the project or dramatize the author's voice.** The author's tone is direct and honest. Avoid motivational-speaker copy — no "love letters," no dramatic origin stories, no rallying cries. State things plainly.

7. **Don't infer relationships between facts the author shares.** If two things are mentioned separately, don't imply they happened simultaneously, are causally linked, or share a timeline unless the author explicitly says so.

8. **Be honest about what competing projects can do.** Don't downplay or dismiss features of OpenRA or other projects to make Iron Curtain look better. If a competitor does something well, say so accurately.

9. **README architecture diagram showed 8 crates when AGENTS.md lists 11.** Missing: `ic-protocol` (the most critical shared boundary), `ic-audio`, `ic-game`. Diagrams and tables derived from AGENTS.md must match it exactly — if AGENTS.md lists 11 crates, the README diagram shows 11 crates. If P006 lists 3 license options, the README license section mentions all 3.

10. **Docs stated unverified performance numbers and architecture claims about OpenRA and the Remastered Collection as fact.** Example: "Stutters at 300-500 units," "30-60ms tick time," "~2-4KB per unit," "fixed rendering pipeline," "SDL/OpenGL basic rendering." None of these were benchmarked or cited. When comparing to competitors: (a) state what is verified from source code, (b) label estimates as estimates, (c) cite issue tracker numbers when claiming bug frequency, (d) don't speculate about internal architecture unless you've read the code.

### Reference Material

These are the projects we actively study. Each serves a different purpose:

- **EA Red Alert source:** https://github.com/electronicarts/CnC_Red_Alert (GPL v3) — **Canonical gameplay values.** Damage tables, weapon ranges, unit speeds, fire rates. When OpenRA and EA source disagree, EA source wins for our `classic` balance preset. Also: `OutList`/`DoList` order pattern, integer math validation.
- **EA Remastered Collection:** https://github.com/electronicarts/CnC_Remastered_Collection — **UI/UX gold standard.** Source is GPL v3 but covers ONLY the C++ engine DLLs (`TiberianDawn.dll`, `RedAlert.dll`) and Map Editor. The remaster's networking and rendering layers are proprietary C# (not open-sourced). Art/audio/video assets are proprietary EA — users must own the game. Language breakdown: 84% C++, 9% C#, 5% C, 2% Assembly. The C++ engine runs as a headless sim DLL called synchronously by the C# client (`Glyphx_Queue_AI()` bypasses all original networking). Original rendering is software-to-RAM, intercepted via `DLL_Draw_Intercept` for GPU rendering by the C# layer.
- **EA Generals / Zero Hour source:** https://github.com/electronicarts/CnC_Generals_Zero_Hour (GPL v3) — **Netcode reference.** Most sophisticated C&C networking codebase (~500KB). UDP lockstep with adaptive run-ahead (adjusts input delay based on latency AND client FPS), three-state frame readiness with automatic resend, delta-compressed TLV wire format, packet router (star topology — validates our relay server design D007), disconnect blame attribution via pings, debug network simulation tools. See `research/generals-zero-hour-netcode-analysis.md` for full analysis.
- **EA Tiberian Dawn source:** https://github.com/electronicarts/CnC_Tiberian_Dawn — **Shared C&C engine lineage.** Cross-reference with RA source for ambiguous behavior. Future TD game module reference.
- **OpenRA:** https://github.com/OpenRA/OpenRA — **Architecture and UX patterns** (trait system, command interface, mod ecosystem). Also: **issue tracker as community pain point radar** — recurring complaints = our design opportunities. Do NOT copy their unit balance (see D019). **Verified netcode facts:** TCP-based lockstep with server relay (not P2P). Single-threaded game loop with background network I/O threads. Static `OrderLatency` (dynamic buffering is a TODO). Per-frame CRC sync hashing via `[VerifySync]` attribute and runtime IL-generated hash functions. Sync report buffer only 7 frames deep (recurring pain point). 135+ desync issues in tracker. NAT traversal via UPnP/NAT-PMP (`Mono.Nat`). No anti-cheat beyond order ownership validation. March 2025 release added post-processing effects.
- **OpenRA Mod SDK:** https://github.com/OpenRA/OpenRAModSDK — **Mod developer experience reference.** Template repo approach, engine version pinning, packaging pipeline, directory conventions. Studied for D020 (`ic` CLI tool). Pain points we solve: C# requirement, MiniYAML, GPL contamination, no workshop, no hot-reload.
- **Chrono Divide** (TypeScript browser RTS) — architecture reference for WASM target.
