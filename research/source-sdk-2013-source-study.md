# Source SDK 2013 — Source Study (Confirmatory Research)

> **Purpose:** Extract architectural, security, modding, networking, and testing lessons from Valve's Source SDK 2013 that validate or refine Iron Curtain's design decisions.
>
> **Date:** 2026-02-24
> **Status:** Confirmatory research (source code study feeding architecture, security, testing, and modding design validation)

---

## Scope

This note answers one narrow question:

1. What lessons from the **Source SDK 2013 codebase** confirm, refine, or warn against patterns relevant to IC's design?

This is **not**:
- a recommendation to adopt Source Engine architecture or patterns
- a compatibility target for IC
- a claim that Source's networking or entity model should replace IC decisions

IC's architectural invariants (pure deterministic sim, pluggable net trait, Bevy framework, tiered modding, game-agnostic core) remain unchanged.

---

## Source Quality and Limits

- **Source SDK 2013** is a strong primary source for:
  - engine/game DLL boundary patterns and interface versioning
  - client-side prediction and server reconciliation architecture
  - network variable replication and dirty-tracking patterns
  - ConVar/ConCommand security flag taxonomy
  - real-world security vulnerability case studies in game engines
  - search-path-based modding and asset override systems
  - game rules abstraction hierarchy
- This source is **not** authoritative for:
  - IC's deterministic sim/net architecture (Source uses client-server with prediction, not lockstep)
  - Bevy-specific ECS implementation choices
  - IC's fixed-point math decisions (Source uses IEEE 754 floats throughout)
  - Rust-specific type safety patterns

---

## Sources Reviewed

### Primary Sources

- ValveSoftware/source-sdk-2013 GitHub repository
  - <https://github.com/ValveSoftware/source-sdk-2013>
- Key files examined:
  - `sp/src/game/shared/gamemovement.cpp` (shared client/server player physics)
  - `sp/src/game/shared/usercmd.h` (player command structure)
  - `sp/src/game/shared/gamerules.h` (game rules hierarchy)
  - `sp/src/game/server/baseentity.h` / `baseentity.cpp` (server entity base)
  - `sp/src/game/client/c_baseentity.h` (client entity mirror)
  - `sp/src/game/client/prediction.cpp` (client-side prediction system)
  - `sp/src/public/tier0/platform.h` (cross-platform abstraction)
  - `sp/src/public/networkvar.h` (CNetworkVar dirty-tracking template)
  - `sp/src/public/dt_send.h` / `dt_recv.h` (SendProp/RecvProp replication tables)
  - `sp/src/public/tier1/convar.h` (ConVar/ConCommand system)
  - `sp/src/vpc_scripts/` (Valve Project Creator build system)

### Secondary Sources (Vulnerability Research)

- CVE-2017-20205: Ragdoll model buffer overflow
  - <https://secalerts.co/vulnerability/CVE-2017-20205>
- CVE-2021-30481: Source Engine RCE via Steam game invites (XZip integer underflow)
  - <https://secret.club/2021/04/20/source-engine-rce-invite.html>
- PacketEntities full-chain RCE proof-of-concept
  - <https://github.com/Gbps/sourceengine-packetentities-rce-poc>
- CS:GO From Zero to 0-Day (path traversal, snprintf truncation, con_logfile)
  - <https://neodyme.io/en/blog/csgo_from_zero_to_0day/>
- Spray/audio file arbitrary write exploit
  - <https://github.com/ValveSoftware/Source-1-Games/issues/3249>

---

## Findings

### 1. Client/Server/Shared Code Split

**What Source does:**

Source SDK organizes game code into three directories under `src/game/`:
- `server/` — server-authoritative entity logic (`CBaseEntity`)
- `client/` — client-side rendering, interpolation, prediction (`C_BaseEntity`)
- `shared/` — code compiled into both client and server DLLs (`CGameMovement`, `CUserCmd`)

Shared code uses `#ifdef CLIENT_DLL` / `#ifdef GAME_DLL` to branch where behavior differs. The same `.cpp` file compiles into both DLLs with different `#define` contexts.

The engine exposes services to game DLLs through abstract C++ classes with string-versioned identifiers (e.g., `IVEngineServer` version `"VEngineServer023"`). A factory pattern (`CreateInterfaceFn`) decouples engine from game logic.

**What works:**
- The three-way split is a clean mental model that prevents accidentally leaking server state to clients
- Interface versioning allows backward-compatible evolution of the engine-game boundary

**What breaks:**
- Client and server entity hierarchies are **manually mirrored** (`CBaseEntity` vs `C_BaseEntity`), requiring parallel class tree maintenance; drift between them causes subtle bugs
- `#ifdef CLIENT_DLL` scattered through shared code is fragile and leads to build configuration bugs — the "shared" code is not truly shared; it knows which role it plays
- Deep inheritance (often 5-6 levels: `CBaseEntity` → `CBaseAnimating` → `CBaseCombatCharacter` → `CBasePlayer`) creates tight coupling; overriding a virtual method requires understanding the entire chain

**IC takeaway:**
- IC's `ic-sim` / `ic-game` / `ic-protocol` crate split is the correct modernization
- **Critical improvement over Source:** `ic-sim` must have zero conditional compilation for behavior and zero network imports — Source's "shared" code still branches on client-vs-server, which violates true separation
- Bevy ECS eliminates the deep-inheritance problem entirely; use component composition
- Source's entity I/O system (data-driven wiring of inputs/outputs for level designers) maps to YAML modding tier — expose entity "inputs" and "outputs" as component metadata

**Implementation overlay mapping (existing clusters):**
- `M2.CORE.SIM_FIXED_POINT_AND_ORDERS` (pure sim crate boundary)
- `M2.CORE.GAME_MODULE_AND_SUBSYSTEM_SEAMS` (engine-game interface)

---

### 2. Float Non-Determinism in Shared Prediction Code

**What Source does:**

`CGameMovement::ProcessMovement()` runs identical physics on client (prediction) and server (authority). However, the code is riddled with float instability:

- `gamemovement.cpp` explicitly checks `IS_NAN(mv->m_vecVelocity[i])` — runtime detection of math corruption
- `CNetworkVar` uses **bit-level float comparison** (`NetworkParanoidUnequal`) because standard `==` is unreliable for floats
- A `CDiffManager` system exists to log command-by-command client-server divergence — evidence that float prediction mismatches are endemic
- Xbox 360 received different friction multipliers than PC in the same `gamemovement.cpp` — **intentional cross-platform divergence**
- `g_bMovementOptimizations` flag skips recalculations, causing frame-dependent prediction errors

**What works:**
- The `CNetworkVar<T>` dirty-tracking template is elegant — operator overloading intercepts assignment, marks entity dirty, and only changed fields replicate
- The optimization of skipping re-prediction when no errors detected reduces CPU cost

**What breaks:**
- The entire prediction system requires compensating infrastructure (NaN checks, bit-level comparison, divergence logging) to work around float non-determinism
- Platform-dependent physics means the "same code" produces different results on different hardware
- The tolerance-based comparison (`WITHINTOLERANCE`) means small divergences accumulate over time

**IC takeaway:**
- This is the **strongest possible validation** of IC's fixed-point math decision (Invariant #1)
- `i32`/`i64` fixed-point eliminates the entire bug class: no NaN, no platform divergence, no bit-level comparison hacks, no tolerance thresholds
- Bevy's `Changed<T>` change detection replaces `CNetworkVar` dirty tracking without macro overhead
- In lockstep, Source's `CDiffManager` becomes a CI-grade determinism test: run the same tick on two instances, assert **bitwise-identical** output (no tolerance needed)

**Implementation overlay mapping (existing clusters):**
- `M2.CORE.SIM_FIXED_POINT_AND_ORDERS` (fixed-point determinism)
- `M0.QA.CI_PIPELINE_FOUNDATION` (determinism smoke test as PR gate)
- `M0.QA.TYPE_SAFETY_ENFORCEMENT` (disallowed_types banning floats in ic-sim if needed)

---

### 3. Network Variable Replication and Schema Drift

**What Source does:**

Server-side variables are declared with `CNetworkVar(type, name)`. At tick end, the engine serializes only changed fields using `SendProp` tables:

```cpp
BEGIN_SEND_TABLE(CBaseEntity, DT_BaseEntity)
    SendPropVector(SENDINFO(m_vecOrigin), -1, SPROP_COORD|SPROP_CHANGES_OFTEN, ...),
    SendPropInt(SENDINFO(m_iHealth), ...),
END_SEND_TABLE()
```

Client-side, `RecvProp` tables mirror these declarations. Send proxies can filter recipients (e.g., `SendProxy_OnlyToTeam` restricts data to teammates — relevant to fog-of-war).

**What breaks:**
- `SendProp` and `RecvProp` tables are **manually mirrored** — if the server sends a field the client does not expect (or vice versa), the result is silent data corruption
- The macro-heavy approach (`DECLARE_SERVERCLASS`, `IMPLEMENT_NETWORKCLASS_ALIASED`, `BEGIN_SEND_TABLE`, `SENDINFO`, etc.) generates opaque code that is hard to debug

**IC takeaway:**
- Define wire format **once** in `ic-protocol` and derive both serialization and deserialization from the same schema — Source's manual mirroring is a known footgun
- Source's `SendProxy_OnlyToTeam` pattern validates IC's fog-authoritative server design — per-recipient filtering of replicated state is a solved pattern
- Bevy's `Changed<T>` / `Ref<T>` provides the same dirty-tracking as `CNetworkVar` without macros

**Implementation overlay mapping (existing clusters):**
- `M4.NET.MINIMAL_LOCKSTEP_ONLINE` (wire protocol)
- `M4.NET.RELAY_TIME_AUTHORITY_AND_VALIDATION` (authority semantics)

---

### 4. Modding Architecture and Sandboxing Absence

**What Source does:**

- **Asset overrides via search paths:** `gameinfo.txt` defines search path order; mods override base content by placing files earlier in the search path — no code, no recompilation
- **Game rules hierarchy:** `CGameRules` → `CMultiplayRules` → `CTeamplayRules` → `CTeamplayRoundBasedRules`; each level adds features. The round-based rules implement an 11-state state machine with explicit `State_Enter/Leave/Think` per state
- **ConVar/ConCommand system:** Self-registering console variables with security flags:
  - `FCVAR_CHEAT` — blocked unless cheats enabled
  - `FCVAR_REPLICATED` — synchronized across network
  - `FCVAR_NEVER_AS_STRING` — prevents string injection
  - `FCVAR_ALLOWED_IN_COMPETITIVE` — whitelisted for competitive mode
  - Competitive mode enforces `GetCompMin()/GetCompMax()` range clamping

**What works:**
- Search-path layering is brilliantly simple for modders: drop files → they override base content
- `CTeamplayRoundBasedRules` 11-state state machine with `Enter/Leave/Think` avoids spaghetti conditionals
- ConVar flags provide layered security for console-exposed configuration

**What breaks:**
- **No sandboxing.** Mods are native C++ DLLs with full system access. A malicious mod has the same privileges as the engine
- **`gameinfo.txt` is trusted** and was itself exploitable (manipulated search paths loading malicious content)
- **ConVar validation is opt-in** — each variable individually decides whether to validate input. Forgetting `FCVAR_CHEAT` on one variable = exploit
- **Deep inheritance in game rules** means modders must understand the entire class chain to override one behavior safely

**IC takeaway:**
- IC's tiered modding (YAML → Lua → WASM) is the correct answer to "native DLLs with no sandbox"
- Search-path layering maps to IC's asset override system, but with sandboxing at each tier
- Source's `CTeamplayRoundBasedRules` state machine validates IC's typestate pattern — Source does it with runtime enums and virtual methods (any transition allowed), while IC does it with compile-time typestate (invalid transitions are type errors)
- ConVar security flags validate the capability token approach, but IC must be **secure-by-default**: all mod-exposed configuration validated by the engine, not opted-in per variable
- `FCVAR_REPLICATED` (server pushes authoritative config) maps directly to `ic-protocol` — replicated settings flow through the protocol, never trust client configuration

**Implementation overlay mapping (existing clusters):**
- `M5.SP.LUA_MISSION_RUNTIME` (Lua sandbox)
- `M6.SEC.WASM_INTERMODULE_ISOLATION` (WASM sandbox)
- `M8.MOD.SELECTIVE_INSTALL_INFRA_HOOKS` (content override system)

---

### 5. Security Vulnerability Case Studies

**What Source teaches (by failure):**

Source SDK's CVE history is a catalog of C/C++ memory safety failures in game engine content pipelines:

| CVE / Exploit | Attack Vector | Root Cause | Severity |
| --- | --- | --- | --- |
| CVE-2017-20205 | Crafted ragdoll model file | `nexttoken` copies into 256-byte stack buffer without bounds check; attacker-controlled model data achieves RCE | Critical |
| CVE-2021-30481 | Steam game invite → RCON ZIP extraction | 2003-era XZip library; `offset_curfile = 0xFFFFFFFE` causes unsigned integer underflow in `lufread()`, `memcpy` with corrupted length → RCE | Critical |
| PacketEntities RCE | Malicious game server | `CL_CopyExistingEntity` uses attacker-controlled `m_nNewEntity` as array index without bounds check → virtual dispatch hijack → RCE (~80% success due to no ASLR on `xinput1_3.dll`) | Critical |
| Path traversal | Server-controlled filenames | `snprintf` truncation: long paths overrun 256-byte buffer, truncating file extension past boundary → extension filter bypass; `con_logfile` writes arbitrary files | High |
| Spray/audio exploit | Custom spray/audio downloads | Download filenames with path traversal → arbitrary file write to client machine | High |
| `m_nMaxClients=1` trick | Server packet | Server tells client it's in singleplayer → enables privileged commands | High |

**Common thread:** Every major vulnerability is in parsing or handling untrusted input (models, archives, network packets, filenames, server-controlled fields) using C/C++ manual memory management without bounds checking.

**Additional security architecture observations:**
- VAC (Valve Anti-Cheat) is an **external signature-based scanner** with no architectural integration — it detects known cheat binaries but provides no structural protection
- No capability system exists — if code has access to an interface, it has full access to all methods
- Third-party libraries are vendored in `src/thirdparty/` with no version tracking, audit trail, or update mechanism — the 2003 XZip library was exploited 18 years later

**IC takeaway:**

1. **Rust eliminates the entire vulnerability class.** Buffer overflows, integer underflows, use-after-free, and format string bugs are compile-time errors in safe Rust. Source's CVE history is the empirical case for IC's language choice.

2. **No `unsafe` in content pipeline.** IC's asset parsers (`ra-formats`, YAML loader, replay parser, network deserializer) must never use `unsafe` for parsing. Use `nom`, `binrw`, or `serde` — safe parsing by construction. The fuzz testing targets in `testing-strategy.md` directly address this.

3. **Anti-cheat via architecture beats bolted-on scanning.** VAC's failure pattern — external signature scanning that misses novel cheats — validates IC's approach: deterministic sim where the server is authoritative, sandboxed mods via capability tokens, structural guarantees rather than detection.

4. **The `m_nMaxClients=1` trick is a direct argument for capability tokens.** Client capabilities must come from the client's own state machine (typestate), never from server-provided values that change privilege level. This pattern maps directly to IC's `FromClient<T>` / `FromServer<T>` direction-branded message types (V50 in `02-ARCHITECTURE.md` § Type-Safety Architectural Invariants).

5. **No vendored unaudited C libraries in the trust boundary.** IC's `Cargo.toml` dependencies must be audited (`cargo audit`, `cargo vet`), and any C dependencies in the content pipeline are a red flag.

6. **Path traversal is endemic in game engines.** Source has path traversal in BSP maps, download filenames, `con_logfile`, and spray files. IC's `strict-path` crate and Path Security Infrastructure (06-SECURITY.md) directly addresses this entire class.

**Implementation overlay mapping (existing clusters):**
- `M0.QA.CI_PIPELINE_FOUNDATION` (fuzz testing targets from day one)
- `M0.QA.TYPE_SAFETY_ENFORCEMENT` (capability tokens, branded types)
- `M3.SEC.DISPLAY_NAME_VALIDATION` (V46 — untrusted text input)
- `M8.SEC.AUTHOR_PACKAGE_SIGNING` (V49 — supply chain integrity)
- All `ra-formats` parsing clusters (`M1.CORE.RA_FORMATS_PARSE`)

---

### 6. Build System and Cross-Platform Abstraction

**What Source does:**

- **VPC (Valve Project Creator):** Custom build metasystem generating Visual Studio projects (Windows) and Makefiles (Linux/macOS) from `.vpc` scripts
- **`platform.h`:** Preprocessor detection (`_WIN32`, `LINUX`, `OSX`), type aliases (`uint8`, `int32`), calling convention macros (`STDCALL`, `FASTCALL`), DLL import/export helpers
- **Tiered library architecture:** `tier0` (platform) → `tier1` (utilities/ConVars) → `tier2` (services) — strict dependency direction, lower tiers never depend on higher

**What works:**
- The tier0/tier1/tier2 layering enforces a strict DAG — lower tiers cannot import higher tiers
- Type aliases and platform detection are thorough after decades of production use

**What breaks:**
- VPC is proprietary with no community, limited documentation, and Valve-internal toolchain dependency
- Type aliases diverge across platforms (`__int32` vs `int`) — subtle ABI incompatibilities
- DLL boundary is fragile — passing C++ objects (STL containers, virtual classes) across DLL boundaries is ABI-dependent
- No package manager — third-party deps vendored with no version tracking

**IC takeaway:**
- Cargo solves every pain point: cross-compilation via target triples, `std` platform abstraction replaces `platform.h`, `cfg(target_os)` replaces `#ifdef _WIN32`, crates link statically by default, `crates.io` replaces vendored deps
- The tier0/tier1/tier2 DAG validates IC's crate dependency graph: `ic-sim` → `ic-protocol` → `ic-net` → `ic-game`. Enforce strict DAG via Cargo workspace `[dependencies]` — no cycles, no optional reverse edges

**Implementation overlay mapping:**
- General crate architecture (no specific cluster; cross-cutting)

---

### 7. Testing Infrastructure (Absence)

**What Source does:**

The Source SDK 2013 repository contains **no unit test infrastructure, no test directories, no CI configuration, and no automated testing framework** of any kind in the public SDK.

What exists instead:
- **Runtime diagnostics:** `developer 1/2/3` escalating debug output, `vprof` performance profiling, `PREDICTION_ERROR_CHECK_LEVEL` divergence logging
- **Assertions:** `Assert()` macros — debug-only, stripped from release builds
- **NaN/infinity checks:** Runtime detection (`IS_NAN`) of float corruption rather than prevention
- **`CDiffManager` / `CPredictionCopy`:** Compares client-predicted state against server state and logs differences — the closest thing to an automated test, but runs inside the game at runtime as a diagnostic, not in CI

**The consequences are measurable:** CVE-2021-30481 exploited a 2003-era library that had been in the codebase for 18 years undetected. Every major Source vulnerability was in parsing code — exactly the kind of code that fuzz testing catches.

**IC takeaway:**

1. **Property-based determinism tests from day one.** IC's `ic-sim` crate should have exhaustive `proptest` tests: same tick, same inputs, different thread/platform → bitwise-identical output. Source's `CDiffManager` does this at runtime as a diagnostic; IC does it as a CI gate with zero tolerance (no `WITHINTOLERANCE` needed because fixed-point is exact).

2. **Fuzz testing for all parsers from first crate.** Every asset loader, network deserializer, and config parser must be fuzz-tested. Source's entire security history is parsing bugs that would have been caught by fuzzing.

3. **CI from day one.** Source SDK has zero CI. IC's `testing-strategy.md` defines four tiers (PR gate, post-merge, nightly, weekly) with explicit gate rules. This is not optional — it is a design constraint.

4. **`#[cfg(test)]` is free in Rust.** Unlike Source where adding test infrastructure requires build config changes, Rust's built-in `#[test]` means there is no cost to testing. No excuse for untested code.

5. **Adapt Source's `CDiffManager` concept as a CI tool.** Source's runtime divergence detector is the right idea in the wrong place. IC should run sim ticks on two instances with identical inputs and assert identical hashes — in CI, not in-game.

**Implementation overlay mapping (existing clusters):**
- `M0.QA.CI_PIPELINE_FOUNDATION` (all four CI tiers)
- `M5.SEC.ANTICHEAT_CALIBRATION` (labeled replay corpus, desync classification)

---

## Consolidated Lesson Matrix

| # | Source SDK Pattern | Problem | IC Answer | IC Cluster(s) |
| --- | --- | --- | --- | --- |
| 1 | `#ifdef CLIENT_DLL` in shared code | Builds diverge, shared code is not truly shared | `ic-sim` has zero network imports, zero conditional compilation | `M2.CORE.SIM_FIXED_POINT_AND_ORDERS` |
| 2 | Deep entity inheritance (5-6 levels) | Tight coupling, override hazards, fragile modding | Bevy ECS component composition | `M2.CORE.GAME_MODULE_AND_SUBSYSTEM_SEAMS` |
| 3 | `CNetworkVar` dirty tracking via macros | Opaque generated code, hard to debug | Bevy `Changed<T>` change detection | `M4.NET.MINIMAL_LOCKSTEP_ONLINE` |
| 4 | Float math in shared prediction code | NaN checks, bit-level comparison, platform divergence | Fixed-point `i32`/`i64`, bitwise-deterministic | `M2.CORE.SIM_FIXED_POINT_AND_ORDERS` |
| 5 | Manual SendProp/RecvProp table mirroring | Silent desync when tables drift | Single schema in `ic-protocol`, derive both ends | `M4.NET.MINIMAL_LOCKSTEP_ONLINE` |
| 6 | Native C++ mod DLLs, no sandbox | Full system access, RCE-capable mods | YAML/Lua/WASM tiers, capability-token sandbox | `M5.SP.LUA_MISSION_RUNTIME`, `M6.SEC.WASM_INTERMODULE_ISOLATION` |
| 7 | `memcpy` with attacker-controlled lengths | Buffer overflows, RCE chains (CVE-2017-20205, CVE-2021-30481) | Rust safe parsing, no `unsafe` in content pipeline | `M1.CORE.RA_FORMATS_PARSE`, `M0.QA.CI_PIPELINE_FOUNDATION` |
| 8 | VAC as external signature scanner | Bolted-on, bypassable, no structural protection | Anti-cheat via deterministic sim + server authority | `M7.SEC.BEHAVIORAL_ANALYSIS_REPORTING` |
| 9 | ConVar security flags opt-in per variable | Forgetting one flag = exploit | Capability tokens, secure-by-default config | `M0.QA.TYPE_SAFETY_ENFORCEMENT` |
| 10 | No automated tests, no CI, no fuzzing | Vulnerabilities persist 18 years | `cargo test` + `proptest` + `cargo-fuzz` from day one | `M0.QA.CI_PIPELINE_FOUNDATION` |
| 11 | Sorted linked list for A* open list | O(n) insertion, only works for ~1000 areas | Binary heap; marker-based open/closed (no per-search clear) | `M2.CORE.PATH_SPATIAL` |
| 12 | Per-NPC 8ms AI budget (20 NPCs) | 1000 units × 10us = different scale entirely | Tiered processing + batched path requests + aggressive caching | `M6.SP.SKIRMISH_AI_BASELINE` |
| 13 | Schedule/task interrupt masks (bitmask AND) | O(1) per NPC, elegant and deterministic | Adopt directly: `ConditionBitfield` on each order/behavior | `M6.SP.SKIRMISH_AI_BASELINE` |
| 14 | Strategy slots for squad coordination | Prevents all-flank degeneracy; 16-member cap | Formation slot types; claim/vacate pattern | `M6.SP.SKIRMISH_AI_BASELINE` |
| 15 | FGD editor metadata (manually maintained) | Drifts from code; 7 locations per entity | YAML schema = runtime validation = editor schema (one source) | `M8.SDK.CLI_FOUNDATION`, `M9.SDK.D038_SCENARIO_EDITOR_CORE` |
| 16 | Entity I/O (data-driven event wiring) | Powerful UX, no compile-time validation | YAML event wiring with schema validation at load time | `M8.SDK.CLI_FOUNDATION` |
| 17 | VScript with no sandbox | Full process access for scripts | Lua resource limits + WASM capability tokens | `M5.SP.LUA_MISSION_RUNTIME` |
| 18 | PVS filtering (per-client entity visibility) | Correct pattern for hiding server state | Fog-authoritative relay applies same principle to orders | `M4.NET.RELAY_TIME_AUTHORITY_AND_VALIDATION` |
| 19 | `sv_max_usercmd_future_ticks` | Caps how far ahead clients can send | Relay caps future-tick order submission | `M4.NET.RELAY_TIME_AUTHORITY_AND_VALIDATION` |
| 20 | Baseline + delta for new connections | Full snapshot then deltas for bandwidth | Reconnection: snapshot + deterministic order replay catch-up | `M4.NET.RECONNECT_BASELINE` |
| 21 | `net_graph 1/2/3` layered diagnostics | FPS/latency/bandwidth overlay, escalating detail | `/diag 0-3` overlay: basic→detailed→full dev, graph history, mod diagnostics API | `M2.CORE.DIAG_OVERLAY_L1`, `M4.NET.DIAG_OVERLAY_NET` |

---

## Deep Dive: AI and Pathfinding

### Navigation Mesh Architecture

Source uses a **convex polygon mesh** (in practice, axis-aligned rectangles) overlaid on world geometry. Three primary classes:

- **`CNavMesh`** (`nav_mesh.h/.cpp`) — Singleton manager. Owns all areas, ladders, spatial grid. Provides `GetNavArea(pos)` and `GetNearestNavArea(pos)`.
- **`CNavArea`** (`nav_area.h/.cpp`) — A single navigable rectangle. Stores attribute flags (16 types: crouch, jump, cliff), directional connections (N/E/S/W as `NavConnect` vectors), per-team blocked flags, danger values with decay timestamps, precomputed hiding spots, encounter spots, visibility data, and A* state (`m_totalCost`, `m_costSoFar`, open/closed markers).
- **`CNavNode`** (`nav_node.h/.cpp`) — Used only during offline generation. Samples world at 25-unit intervals. Discarded after mesh build.

**Spatial indexing:** Fixed 300-unit grid cells. Areas bucketed by corner position. Hash table for O(1) ID lookup. Per-entity "last known area" cache eliminates most repeated lookups.

**Generation:** Multi-phase state machine running offline (in-editor): sampling → area creation → connection → simplification → analysis (hiding spots, visibility, occupy times). Runs incrementally via `UpdateGeneration(0.03)` per frame. Analysis phases (especially cross-area visibility) are extremely expensive — `nav_quicksave` exists to skip them.

### A* Implementation

`NavAreaBuildPath<CostFunctor>` in `nav_pathfind.h`:

- **Open list:** Sorted linked list (O(n) insertion — acceptable for ~1000 FPS areas, not for 16K+ RTS cells)
- **Marker system:** Global `m_masterMarker` incremented per search; areas compare their local marker against it. Eliminates O(n) "clear visited" between searches — **critical optimization for high query volume**
- **Cost functor:** Templated. `ShortestPathCost` is default, applies crouch (20x) and jump (5x) multipliers. Different unit types supply different cost implementations
- **Closest-area fallback:** During search, tracks the visited area closest to the goal. If goal unreachable, returns path to closest reachable point — **graceful degradation, never "no result"**
- **NaN guards:** Explicit `IS_NaN` checks on float costs — compensating for float unreliability

### AI Schedule/Task System

Source's NPC AI (`ai_basenpc.h`, `ai_basenpc_schedule.cpp`) uses a three-layer hierarchy:

1. **NPC State** (`NPC_STATE`): `IDLE`, `ALERT`, `COMBAT`, `SCRIPT`, `DEAD`
2. **Schedules** (`CAI_Schedule`): Ordered task sequences with interrupt condition masks
3. **Tasks** (`AI_Task_t`): Atomic operations (`TASK_MOVE_TO_TARGET_RANGE`, `TASK_FACE_ENEMY`, `TASK_WAIT`)

**Interrupt mask pattern:** Conditions stored as bitmasks (`CAI_ScheduleBits`). Each frame, `GatherConditions()` populates the bit vector. Each schedule declares an interrupt mask. If `conditions & interruptMask != 0`, schedule is interrupted. This is **O(1) per entity per tick**.

**Time budget:** Think loop processes up to 10 task iterations per frame, with 8ms release / 16ms debug budget per NPC. `ShouldStopProcessingTasks()` enforces the limit.

**Efficiency tiering:** Five tiers from `AIE_NORMAL` (full processing) to `AIE_DORMANT` (zero processing). Plus PVS-based sleep states.

**Oscillation detection:** Debug builds track last 10 schedule selections; if 8+ per second, NPC is disabled with visual spark — cheap thrashing diagnostic.

### Strategy Slots (Squad Coordination)

`CAI_Squad` (`ai_squad.h`) coordinates up to 16 members via **strategy slots**: `OccupyStrategySlotRange()` / `VacateStrategySlot()` prevent multiple NPCs from performing the same tactical role (e.g., only 2 flankers at a time). Per-enemy slot tracking. `BroadcastInteraction()` for squad-wide messages. `UpdateEnemyMemory()` shares threat intel.

### Pathfinding Caching

Across the codebase, six caching strategies:
1. **Last known area** per entity — nearly free, massive win
2. **Stale link cache** — failed segments marked with expiration timestamps, preventing retries
3. **Nearest node cache** — 32 entries with 10-second expiration
4. **Path distance cache** — precomputed per waypoint
5. **Simplification throttle** — gates expensive smoothing
6. **Unreachable entity cache** — `RememberUnreachable()` prevents repeated requests to known-unreachable targets

### Failed Path Recovery

Multi-layered: A* closest-area fallback → triangulation (perpendicular offset) → retry with timeout → give-way protocol (friendly NPCs asked to move) → node route retry with anti-oscillation → task failure escalation to recovery schedule.

### IC Takeaways (AI/Pathfinding)

**Patterns to adopt:**

| Source Pattern | IC Application |
| --- | --- |
| Marker-based open/closed list | Increment global `u32` per search; compare per-cell. Eliminates O(n) clear. Essential for 1000 units |
| Cost functor template | `PathCost` trait: `fn cost(&self, from: CellId, to: CellId) -> FixedPoint`. Per-unit-type implementations |
| Closest-reachable fallback | A* tracks best partial result. Units always move somewhere, never "stuck" |
| Interrupt condition masks | Each order declares a `ConditionBitfield`. Each tick AND with gathered conditions. O(1) per unit |
| Strategy slots | Formation has slot types (lead, flank-L, flank-R, rear-guard). Units claim slots. Prevents all-flank degeneracy |
| Efficiency tiering | Idle units: AI every 4-8 ticks. Combat: every tick. **Criteria must be deterministic** (tick-based, not PVS) |
| All six caches | Last-known-cell, failed-path, unreachable-target, simplification throttle. All expire by **sim tick**, not wall-clock |
| Path request priority queue | New orders = high priority (this tick). Replans = low (defer 2-4 ticks). Process in batches within tick budget |
| Precomputed analysis at load | Hiding spots, choke points, distance fields computed once at map load. `Pathfinder::analyze()` method |
| Oscillation detector | Count re-plans per unit per second. Flag if excessive. Cheap diagnostic |

**Patterns to avoid:**

| Source Pattern | Why Not |
| --- | --- |
| Sorted linked list for open list | Use binary heap. Source has ~1000 areas; IC has 16K-65K cells |
| Float costs with NaN guards | Fixed-point eliminates the entire problem |
| Inheritance-based AI (100+ virtuals in `CAI_BaseNPC`) | `AiStrategy` trait composition |
| PVS-based dormancy | No single viewpoint in RTS. Use deterministic game-state criteria |
| Per-NPC 8ms budget | 1000 units sharing 10ms = ~10us per unit. Budget must be aggregate |
| One-frame-delayed async pathfinding | Breaks determinism. Process within tick, using priority and budgeting |

**Performance budget reality:** Source processes ~20 NPCs × ~8ms each = ~160ms total AI per frame. IC needs 1000 units in <10ms — roughly **1600x more demanding per unit**. This rules out Source's per-NPC synchronous pathfinding. The combination of tiered processing + batched requests + binary heap A* + aggressive caching + precomputed analysis is necessary.

**Implementation overlay mapping:**
- `M2.CORE.PATH_SPATIAL` (pathfinder trait, spatial index, A* with marker system)
- `M2.CORE.SIM_FIXED_POINT_AND_ORDERS` (fixed-point costs, deterministic iteration)
- `M6.SP.SKIRMISH_AI_BASELINE` (strategy slots, efficiency tiering, interrupt masks)

---

## Deep Dive: SDK and Editor Tooling

### FGD (Forge Game Data) — Editor Metadata

Source's Hammer editor discovers entity types through `.fgd` files — text-based descriptions of every entity class, its properties, inputs, outputs, and valid values. Example from `sp/src/game/server/hl2/hl2.fgd`:

```
@PointClass base(Targetname) = logic_timer : "Timer entity"
[
    RefireTime(float) : "Refire interval" : "2.0"
    UseRandomTime(choices) : "Use random time" : 0 =
    [
        0 : "No"
        1 : "Yes"
    ]
    input Enable(void) : "Enable the timer"
    input Disable(void) : "Disable the timer"
    output OnTimer(void) : "Fired each time the timer expires"
]
```

The FGD defines the complete editor-facing schema: property names, types, defaults, choices, help strings, inputs, outputs. The game code declares the same properties via `DEFINE_KEYFIELD` macros in the datadesc. **These two definitions are not automatically synchronized** — they are manually kept in sync.

### Entity I/O System

Declared via macros in game code (`entityinput.h`, `entityoutput.h`, `variant_t.h`):

- `DEFINE_INPUTFUNC(fieldtype, name, handler)` — registers an input
- `DEFINE_OUTPUT(varname, name)` — registers an output
- Supported types in `variant_t`: `FIELD_VOID`, `FIELD_FLOAT`, `FIELD_STRING`, `FIELD_VECTOR`, `FIELD_INTEGER`, `FIELD_BOOLEAN`, `FIELD_COLOR32`, `FIELD_EHANDLE`

Connections are established in the editor and stored in the map file as entity keyvalues. At runtime, outputs fire by iterating their connection list and calling `AcceptInput()` on targets. **No compile-time validation** — invalid connections fail silently at runtime.

### VScript (Scripting Layer)

Source SDK 2013 includes `vscript` interfaces (`ivscript.h`) supporting Squirrel, Lua, and Python bindings. The `IScriptVM` interface provides: `CreateScope()`, `RegisterFunction()`, `ExecuteFunction()`, `SetValue()`/`GetValue()`. Scripts bind to entities via `RunScriptFile()`.

**Sandboxing:** Minimal. Scripts run in the game process with access to registered functions. No capability system, no resource limits, no memory isolation. A script calling an exposed function has full access.

### Content Pipeline (Precaching)

`CBaseEntity::Precache()` is a virtual method. Each entity type overrides it to call `PrecacheModel()`, `PrecacheSound()`, `PrecacheScriptSound()`. Missing a precache call causes a runtime error: `"Model '%s' not precached"`. **No static validation** — the precache requirement is a convention, not enforced at compile time.

### Mod Developer Experience

Adding a new entity requires:
1. Create `.h/.cpp` inheriting from `CBaseEntity` (or subclass)
2. Add `DECLARE_CLASS`, `DECLARE_DATADESC`, `DECLARE_SERVERCLASS` macros
3. Implement `Spawn()`, `Precache()`, `Think()` overrides
4. Define `BEGIN_DATADESC` with all keyfields, inputs, outputs
5. Define `BEGIN_SEND_TABLE` for networked variables (if multiplayer)
6. Add matching FGD entry (manually, in a separate file)
7. Add matching client-side class with `DECLARE_CLIENTCLASS` (if networked)

That is **7 separate locations** that must all agree for one entity to work. No code generation, no schema validation, no automated consistency check.

### IC Takeaways (SDK/Editor)

| Source Pattern | Problem | IC Answer |
| --- | --- | --- |
| FGD as editor metadata | Manually maintained, drifts from code | **Generate editor schema from YAML definitions.** IC's YAML modding tier means the schema IS the content — no separate FGD-like file. The scenario editor reads the same schemas that the runtime validates against |
| Entity I/O (inputs/outputs) | Powerful for designers, but no compile-time validation | IC should adopt the concept (data-driven event wiring in the YAML tier) with **schema validation at load time**. Invalid connections rejected before game start |
| VScript with no sandbox | Full process access | IC's tiered sandboxing (Lua with resource limits, WASM with capability tokens) is the correct answer. Source validates this need |
| Precaching as convention | Missing precache = runtime crash | IC's asset pipeline should **statically validate** all asset references at content load / Workshop publish time — never discover missing assets at runtime |
| 7-location entity definition | Massive boilerplate, drift between code/FGD/client/server | IC's approach: define entity in YAML → engine derives ECS components, editor metadata, network replication, and validation from the same source. One definition, multiple derived views |
| No consistency checking | FGD says one thing, code does another | IC's schema-validated YAML and `cargo test` for Rust types ensure **single source of truth** |

**Key insight:** Source's editor tooling is powerful despite its architecture, not because of it. The entity I/O system (wiring logic without code) is brilliant UX that shipped millions of community maps. IC should adopt the concept (data-driven event connections) but implement it through validated YAML schemas rather than manually-maintained FGD files and runtime-discovered errors.

**The CLI-first strategy (M8 before M9) is validated.** Source modders often bypass Hammer and edit entity keyvalues directly in text files. IC's CLI tools that validate, build, and test content before a visual editor exists is the correct sequencing — it ensures the runtime contract is solid before building visual tooling on top.

**Implementation overlay mapping:**
- `M8.SDK.CLI_FOUNDATION` (CLI validates YAML schemas, asset references, event wiring)
- `M8.SDK.AUTHORING_REFERENCE_FOUNDATION` (generated docs from schemas, not manual FGD)
- `M9.SDK.D038_SCENARIO_EDITOR_CORE` (visual editor reads the same schemas as CLI/runtime)

---

## Deep Dive: Netcode Architecture

### Network Channel Layering

Source's network channel (`INetChannelInfo` in `inetchannelinfo.h`) provides:

- **Reliable stream:** Guaranteed, ordered delivery. Used for entity creation/deletion, string tables, game events
- **Unreliable datagrams:** Fast, no ordering guarantee. Used for entity state updates, user commands
- **Bit-level serialization:** `bf_write` / `bf_read` (`bitbuf.h`) — custom bit-packing format for bandwidth efficiency. Writes individual bits, not bytes. Entity state packed to minimum necessary bits per field

Messages are dispatched through `INetMessageHandler` / `IClientMessageHandler` / `IServerMessageHandler` interfaces. Each message type has a registered handler. The `INetMessage` base defines `ReadFromBuffer()` / `WriteToBuffer()` / `Process()`.

**Flow metrics exposed:** `GetLatency()`, `GetAvgLatency()`, `GetAvgLoss()`, `GetAvgChoke()`, `GetAvgData()`, `GetAvgPackets()`, per-flow (incoming/outgoing) and per-stream (unreliable/reliable/voice).

### Snapshot and Delta Compression

Source sends full entity state snapshots to new connections, then delta-compresses subsequent updates:

- **Baseline:** Full state of all entities sent once per connection
- **Delta encoding:** Each tick, only changed properties are sent (tracked via `CNetworkVar` dirty flags)
- **SendProp encoding:** Properties declare bit counts and encoding flags (`SPROP_COORD` for position compression, `SPROP_CHANGES_OFTEN` for priority)
- **PVS filtering:** Only entities in the client's Potentially Visible Set are replicated. This is fog-of-war at the network level — clients never receive data about entities they cannot see

### Input Validation

`CUserCmd` (`usercmd.h`) carries per-tick input: buttons, viewangles, movement, impulse, weapon selection, random_seed, mouse position. Fields include `command_number` and `tick_count` for ordering.

**Server-side validation:**
- Movement is re-simulated server-side using the same `CGameMovement` code
- `GetChecksum()` computes CRC32 over gameplay-critical fields
- Position clamping: server rejects positions that diverge too far from server-calculated position
- Tick count validation: server tracks expected tick count and rejects commands with impossible timing (speedhack detection)
- Rate limiting: `sv_maxrate`, `sv_maxupdaterate`, `sv_max_usercmd_future_ticks` cap how far ahead a client can send commands

### RCON Architecture

Remote console uses a simple protocol: password authentication, then plaintext commands. Known vulnerabilities:
- CVE-2021-30481 exploited the RCON pathway for ZIP extraction
- RCON password sent in plaintext (no challenge-response, no TLS)
- No per-command authorization — once authenticated, full access

### Network Diagnostics

Rich diagnostic tools:
- `net_graph 1/2/3` — real-time overlay showing FPS, latency, loss, choke, bandwidth
- `net_showevents` — logs all network events
- `cl_pdump` / `sv_pdump` — dumps prediction state per entity
- `PREDICTION_ERROR_CHECK_LEVEL` — configurable divergence logging granularity
- Demo recording captures all network messages for replay — the recording sits at the network layer, capturing serialized packets

### IC Takeaways (Netcode)

| Source Pattern | IC Application |
| --- | --- |
| Bit-level serialization (`bf_write`/`bf_read`) | Consider compact binary serialization for `ic-protocol`. Lockstep sends orders (small), not full state (large), so bandwidth is less critical — but compact encoding still matters for P2P/mobile |
| PVS filtering (per-client entity visibility) | Directly maps to fog-authoritative server. Source already solves "don't send data clients shouldn't see" — IC's relay server applies the same principle to order visibility in fog modes |
| Delta compression for snapshots | Relevant for IC's reconnection path (D010): send full snapshot to reconnecting client, then catch-up via order replay. Source's baseline+delta pattern is the right model |
| `CUserCmd` with `command_number` + `tick_count` | Maps to IC's `PlayerOrder` with `SimTick` and sequence numbers. Source's tick-count validation (reject impossible timing) maps to IC's relay tick authority (D007) |
| `sv_max_usercmd_future_ticks` | IC's relay should similarly cap how far ahead a client can send orders — prevents buffering exploits and speed manipulation |
| CRC32 checksums on commands | IC uses Ed25519 signatures (much stronger). Source's CRC32 is trivially forgeable — validates IC's decision to use cryptographic signing |
| RCON plaintext auth | IC's community server admin should use proper auth (Ed25519 signed admin tokens, D060), not plaintext passwords |
| `net_graph` diagnostics | **Designed:** IC's diagnostic overlay (`/diag 0-3`) provides 4-level real-time observability: FPS/tick/RTT (L1), per-system breakdown + pathfinding + memory (L2), ECS inspector + AI viewer + desync debugger (L3). See `10-PERFORMANCE.md` § Diagnostic Overlay, D058 `/diag` commands |
| Demo recording at network layer | IC's replay system records at the order level (deterministic replay of inputs). Source's network-level recording is more expensive (full state), but the architectural placement is right: capture at the boundary between network and sim |

**Key insight for lockstep:** Source's netcode is designed for client-server with prediction — fundamentally different from lockstep. However, three patterns translate directly:

1. **PVS filtering = fog authority.** Source already implements "clients only get data they're allowed to see." IC's fog-authoritative relay does the same for orders.

2. **Tick-count validation = relay tick authority.** Source's speedhack detection (reject commands with impossible tick counts) maps to IC's relay owning the clock (D007). The relay validates that client orders reference valid ticks.

3. **Baseline + delta for reconnection.** Source sends a full snapshot to new connections, then deltas. IC's reconnection (D010) needs the same: full sim state snapshot to the reconnecting client, then catch-up via deterministic order replay from the snapshot point.

**What IC avoids by being lockstep:** Source's entire prediction/reconciliation system, delta compression of entity state per tick, PVS calculation per client per frame, and the `CNetworkVar` dirty-tracking machinery. In lockstep, the relay sends player orders (tiny: ~100 bytes/tick), not entity state (huge: ~10KB/tick). This is a massive bandwidth and complexity win.

**Implementation overlay mapping:**
- `M4.NET.MINIMAL_LOCKSTEP_ONLINE` (order serialization, tick authority)
- `M4.NET.RELAY_TIME_AUTHORITY_AND_VALIDATION` (tick-count validation, future-tick caps)
- `M4.NET.RECONNECT_BASELINE` (snapshot + catch-up)

---

## What IC Should Not Copy from Source SDK

- **Client-server prediction model** — IC uses deterministic lockstep, not client-side prediction with server reconciliation
- **IEEE 754 float math** — IC uses fixed-point; Source's float compensations are a warning, not a template
- **C++ DLL boundary patterns** — Rust crate boundaries are cleaner; no need for interface factories or version strings
- **Deep class hierarchies** — Bevy ECS makes inheritance-based entity systems obsolete
- **Runtime-only assertions** — IC uses compile-time type safety (newtypes, typestate, capability tokens) to prevent bugs rather than detect them

---

## Accepted IC Actions (Condensed)

These findings confirm existing decisions and refine implementation emphasis:

1. **Validate fixed-point determinism confidence.** Source's float nightmare is the strongest empirical argument for `i32`/`i64` fixed-point. No changes needed; IC already decided this.
2. **Strengthen safe-parsing discipline.** Source's CVE history reinforces the ban on `unsafe` in content pipelines and the priority of fuzz testing (`testing-strategy.md` Tier 3).
3. **Validate capability-token approach.** Source's opt-in ConVar security model failed. IC's secure-by-default capability tokens are the correct answer.
4. **Validate typestate over runtime enums.** Source's `CTeamplayRoundBasedRules` state machine uses runtime enums with unrestricted transitions. IC's typestate pattern prevents invalid transitions at compile time.
5. **Adapt `CDiffManager` concept to CI.** Source's runtime divergence detector should become IC's CI-grade determinism test with zero tolerance.
6. **Validate crate DAG discipline.** Source's tier0/tier1/tier2 DAG works because it is strict. IC's crate boundaries must also be a strict DAG.
7. **Validate single-schema wire format.** Source's manual SendProp/RecvProp mirroring is a known footgun. IC's `ic-protocol` single-schema approach prevents this.
8. **Reference Source CVEs in security documentation.** The specific vulnerability patterns (buffer overflow in parsing, integer underflow in archive handling, path traversal in downloads, privilege escalation via server-controlled fields) are valuable concrete examples for IC's threat model.
9. **Adopt A* marker system for pathfinding.** Source's global generation counter eliminates O(n) clear between searches. Essential for 1000-unit RTS with many path requests per tick. Adopt in `Pathfinder` trait implementation.
10. **Adopt interrupt condition mask pattern for AI.** Source's O(1) bitmask AND for schedule interruption is cheap, deterministic, and prevents unnecessary re-planning. Apply to `AiStrategy` trait: each order/behavior declares its interrupt conditions.
11. **Adopt strategy slot pattern for group coordination.** Source's `OccupyStrategySlotRange()` prevents degenerate tactical behavior (all units flanking). Map to IC formation slot types.
12. **Adopt deterministic efficiency tiering.** Source tiers AI by PVS (FPS-specific). IC must tier by deterministic game-state criteria (unit state, distance to enemy, order queue).
13. **Adopt pathfinding caching discipline.** Source's six cache types (last-known-cell, failed-path, unreachable-target, etc.) are all relevant. All must expire by sim tick count, not wall-clock.
14. **Validate CLI-first SDK strategy.** Source modders frequently bypass Hammer to edit text files directly. IC's CLI-first M8 before visual M9 ensures runtime contracts are solid before building visual tooling.
15. **Adopt single-source schema for editor metadata.** Source's FGD (editor metadata) is manually maintained separately from code — guaranteed to drift. IC's YAML schemas should serve as both runtime validation and editor schema. One definition, multiple derived views.
16. **Adopt fog authority from PVS pattern.** Source's PVS filtering (clients only receive visible entity data) maps directly to IC's fog-authoritative relay (clients only receive orders for visible units).
17. **Design diagnostic overlay from `net_graph` pattern.** Source's `net_graph 1/2/3` layered diagnostic overlay inspired IC's `/diag 0-3` system: 4-level real-time observability covering FPS/tick/RTT (L1), per-system breakdown + pathfinding + memory (L2), ECS inspector + AI state viewer + desync debugger (L3), with graph history mode, mobile support, and mod diagnostic API. Formally designed in `10-PERFORMANCE.md` § Diagnostic Overlay & Real-Time Observability with D058 console commands.

Actions 1-8 are confirmatory (no changes needed). Actions 9-17 refine implementation emphasis within existing decisions and milestone clusters.

---

## Recommended Follow-Up (Optional, Later)

- Consider adding a brief cross-reference in `06-SECURITY.md` (Path Security Infrastructure or Competitive Integrity Summary) noting Source SDK CVEs as concrete examples of the vulnerability classes that Rust + `strict-path` + safe parsing prevent.
- Consider adding Source's `CDiffManager` concept (sim-state comparison as a diagnostic tool) as an explicit testing harness feature in `testing-strategy.md` if not already covered by the determinism smoke/full suite tests.
- Consider adding the A* marker system as an explicit implementation note in the `Pathfinder` trait documentation (D013/D045).
- Consider adding strategy slots as an explicit pattern in the AI design (D043) — avoids rediscovering the concept during implementation.
