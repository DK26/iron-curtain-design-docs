# Testing Strategy & CI/CD Pipeline

This document defines the automated testing infrastructure for Iron Curtain. Every design feature must map to at least one automated verification method. Testing is not an afterthought — it is a design constraint.

## Guiding Principles

1. **Determinism is testable.** If a system is deterministic (Invariant #1), its behavior can be reproduced exactly. Tests that rely on determinism are the strongest tests we have.
2. **No untested exit criteria.** Every milestone exit criterion (see 18-PROJECT-TRACKER.md) must have a corresponding automated test. If a criterion cannot be tested automatically, it must be flagged as a manual review gate.
3. **CI is the authority.** If CI passes, the code is shippable. If CI fails, the code does not merge. No exceptions, no "it works on my machine."
4. **Fast feedback, thorough verification.** PR gates must complete in <10 minutes. Nightly suites handle expensive verification. Weekly suites cover exhaustive/long-running scenarios.

## CI/CD Pipeline Tiers

### Tier 1: PR Gate (every pull request, <10 min)

| Test Category              | What It Verifies                                                      | Tool / Framework       |
| -------------------------- | --------------------------------------------------------------------- | ---------------------- |
| `cargo clippy --all`       | Lint compliance, `disallowed_types` enforcement (see coding standards)| clippy                 |
| `cargo test`               | Unit tests across all crates                                          | cargo test             |
| `cargo fmt --check`        | Formatting consistency                                                | rustfmt                |
| Determinism smoke test     | 100-tick sim with fixed seed → hash match across runs                 | custom harness         |
| WASM sandbox smoke test    | Basic WASM module load/execute/capability check                       | custom harness         |
| Lua sandbox smoke test     | Basic Lua script load/execute/resource-limit check                    | custom harness         |
| YAML schema validation     | All game data YAML files pass schema validation                       | custom validator       |
| `strict-path` boundary     | Path boundary enforcement for all untrusted-input APIs                | unit tests             |
| Build (all targets)        | Cross-compilation succeeds (Linux, Windows, macOS)                    | cargo build / CI matrix|
| Doc link check             | All internal doc cross-references resolve                             | mdbook build + linkcheck|

**Gate rule:** All Tier 1 tests must pass. Merge is blocked on any failure.

### Tier 2: Post-Merge (after merge to main, <30 min)

| Test Category              | What It Verifies                                                      | Tool / Framework       |
| -------------------------- | --------------------------------------------------------------------- | ---------------------- |
| Integration tests          | Cross-crate interactions (ic-sim ↔ ic-game ↔ ic-script)              | cargo test --features integration |
| Determinism full suite     | 10,000-tick sim with 8 players, all unit types → hash match           | custom harness         |
| Network protocol tests     | Lobby join/leave, relay handshake, reconnection, session auth         | custom harness + tokio |
| Replay round-trip          | Record game → playback → hash match with original                     | custom harness         |
| Workshop package verify    | Package build → sign → upload → download → verify chain              | custom harness         |
| Anti-cheat smoke test      | Known-cheat replay → detection fires; known-clean → no flag          | custom harness         |
| Memory safety (Miri)       | Undefined behavior detection in unsafe blocks                         | cargo miri test        |

**Gate rule:** Failures trigger automatic revert of the merge commit and notification to the PR author.

### Tier 3: Nightly (scheduled, <2 hours)

| Test Category              | What It Verifies                                                      | Tool / Framework       |
| -------------------------- | --------------------------------------------------------------------- | ---------------------- |
| Fuzz testing               | `ra-formats` parser, YAML loader, network protocol deserializer      | cargo-fuzz / libFuzzer |
| Property-based testing     | Sim invariants hold across random order sequences                     | proptest               |
| Performance benchmarks     | Tick time, memory allocation, pathfinding cost vs budget              | criterion              |
| Zero-allocation assertion  | Hot-path functions allocate 0 heap bytes in steady state              | custom allocator hook  |
| Sandbox escape tests       | WASM module attempts all known escape vectors → all blocked           | custom harness         |
| Lua resource exhaustion    | `string.rep` bomb, infinite loop, memory bomb → all caught            | custom harness         |
| Desync injection           | Deliberately desync one client → detection fires within N ticks       | custom harness         |
| Cross-platform determinism | Same scenario on Linux + Windows → identical hash                     | CI matrix comparison   |
| Unicode/BiDi sanitization  | RTL/BiDi QA corpus (rtl-bidi-qa-corpus.md) categories A–I            | custom harness         |
| Display name validation    | UTS #39 confusable corpus → all impersonation attempts blocked        | custom harness         |
| Save/load round-trip       | Save game → load → continue 1000 ticks → hash matches fresh run      | custom harness         |

**Gate rule:** Failures create high-priority issues. Regressions in performance benchmarks block the next release.

### Tier 4: Weekly (scheduled, <8 hours)

| Test Category              | What It Verifies                                                      | Tool / Framework       |
| -------------------------- | --------------------------------------------------------------------- | ---------------------- |
| Campaign playthrough       | Full campaign mission sequence completes without crash/desync         | automated playback     |
| Extended fuzz campaigns    | 1M+ iterations per fuzzer target                                      | cargo-fuzz             |
| Network simulation         | Packet loss, latency jitter, partition scenarios                      | custom harness + tc/netem |
| Load testing               | 8-player game at 1000 units each → tick budget holds                 | custom harness         |
| Anti-cheat model eval      | Full labeled replay corpus → precision/recall vs V54 thresholds      | custom harness         |
| Visual regression          | Key UI screens rendered → pixel diff against baseline                 | custom harness + image diff |
| Workshop ecosystem test    | Mod install → load → gameplay → uninstall lifecycle                   | custom harness         |
| Key rotation exercise      | V47 key rotation → old key rejected after grace → new key works      | custom harness         |
| P2P replay attestation     | 4-peer game → replays cross-verified → tampering detected            | custom harness         |
| Desync classification      | Injected platform-bug desync vs cheat desync → correct classification| custom harness         |

**Gate rule:** Failures block release candidates. Weekly results feed into release-readiness dashboard.

## Test Infrastructure Requirements

### Custom Test Harness (`ic-test-harness`)

A dedicated crate providing:

```rust
/// Run a deterministic sim scenario and return the final state hash.
pub fn run_scenario(scenario: &Scenario, seed: u64) -> SimStateHash;

/// Run the same scenario N times and assert all hashes match.
pub fn assert_deterministic(scenario: &Scenario, seed: u64, runs: usize);

/// Run a scenario with a known-cheat replay and assert detection fires.
pub fn assert_cheat_detected(replay: &ReplayFile, expected: CheatType);

/// Run a scenario with a known-clean replay and assert no flags.
pub fn assert_no_false_positive(replay: &ReplayFile);

/// Run a scenario with deliberate desync injection and assert detection.
pub fn assert_desync_detected(scenario: &Scenario, desync_at: SimTick);
```

### Performance Benchmark Suite (`ic-bench`)

Using `criterion` for statistical benchmarks with regression detection:

| Benchmark                   | Budget          | Regression Threshold |
| --------------------------- | --------------- | -------------------- |
| Sim tick (100 units)        | < 2ms           | +10% = warning       |
| Sim tick (1000 units)       | < 10ms          | +10% = warning       |
| Pathfinding (A*, 256x256)   | < 1ms           | +20% = warning       |
| Fog-of-war update           | < 0.5ms         | +15% = warning       |
| Network serialization       | < 0.1ms/message | +10% = warning       |
| YAML config load            | < 50ms          | +25% = warning       |
| Replay frame write          | < 0.05ms/frame  | +20% = warning       |
| Pathfinding LOD transition (256x256, 500 units) | < 0.25ms | +15% = warning |
| Stagger schedule overhead (1000 units) | < 2.5ms | +15% = warning |
| Spatial hash query (1M entities, 8K result) | < 1ms | +20% = warning |
| Flowfield generation (256x256) | < 0.5ms | +15% = warning |
| ECS cache miss rate (hot tick loop) | < 5% L1 misses | +2% absolute = warning |
| Weather state update (full map) | < 0.3ms | +20% = warning |
| Merkle tree hash (32 archetypes) | < 0.2ms | +15% = warning |
| Order validation (256 orders/tick) | < 0.5ms | +10% = warning |

**Allocation tracking:** Hot-path benchmarks also measure heap allocations. Any allocation in a previously zero-alloc path is a test failure.

### Fuzz Testing Targets

| Target                      | Input Source        | Known CVE Coverage                           |
| --------------------------- | ------------------- | -------------------------------------------- |
| `ra-formats` (.oramap)      | Random archive bytes| Zip Slip, decompression bomb, path traversal |
| `ra-formats` (.mix)         | Random file bytes   | Buffer overread, integer overflow             |
| YAML tier config            | Random YAML         | V33 injection vectors                        |
| Network protocol messages   | Random byte stream  | V17 state saturation, oversized messages      |
| Replay file parser          | Random replay bytes | V45 frame loss, signature chain gaps          |
| `strict-path` inputs        | Random path strings | 19+ CVE patterns (symlink, ADS, 8.3, etc.)  |
| Display name validator      | Random Unicode      | V46 confusable/homoglyph corpus              |
| BiDi sanitizer              | Random Unicode      | V56 override injection vectors               |
| Pathfinding input           | Random topology + start/end | Buffer overflow, infinite loop on pathological graphs |
| Campaign DAG definition     | Random YAML graph   | Cycles, unreachable nodes, missing outcome refs |
| Workshop manifest + deps    | Random package manifests | Circular deps, version constraint contradictions |
| WASM memory requests        | Adversarial `memory.grow` sequences | OOM, growth beyond sandbox limit |
| Balance preset YAML         | Random inheritance chains | Cycles, missing parents, conflicting overrides |
| Cross-engine map format     | Random .mpr/.mmx bytes | Malformed geometry, out-of-bounds spawns |
| LLM-generated mission YAML  | Random trigger/objective trees | Unreachable objectives, invalid trigger refs |

### Labeled Replay Corpus

For anti-cheat calibration (V54):

| Category           | Source                                    | Minimum Count |
| ------------------ | ----------------------------------------- | ------------- |
| Confirmed-cheat    | Test accounts with known cheat tools      | 500 replays   |
| Confirmed-clean    | Tournament players, manually verified     | 2000 replays  |
| Edge-case          | High-APM legitimate players (pro gamers)  | 200 replays   |
| Bot-assisted       | Known automation scripts                  | 100 replays   |
| Platform-bug desync| Reproduced cross-platform desyncs (V55)   | 50 replays    |

## Subsystem Test Specifications

Detailed test specifications organized by subsystem. Each entry defines: what is tested, test method, pass criteria, and CI tier.

### Simulation Fairness (D008)

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| Sub-tick tiebreak determinism | Two players issue Move orders to same target at identical sub-tick timestamps. Run 100 times | Player with lower `PlayerId` always wins tiebreak. Results identical across all runs | T2 + T3 (proptest) |
| Timestamp ordering correctness | Player A timestamps at T+100us, Player B at T+200us for same contested resource | Player A always wins. Reversing timestamps reverses winner | T2 |
| Relay timestamp envelope clamping | Client submits timestamp outside feasible envelope (too far in the future or past) | Relay clamps to envelope boundary. Anti-abuse telemetry event fires | T2 |
| Listen-server relay parity | Same scenario run with `EmbeddedRelayNetwork` vs `RelayLockstepNetwork` | Identical `TickOrders` output from both paths | T2 |

### Order Validation Matrix (D012)

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| Exhaustive rejection matrix | For each order type (Move, Attack, Build, etc.) × each of the 8 rejection categories (ownership, unit-type mismatch, out-of-range, insufficient resources, tech prerequisite, placement invalid, budget exceeded, unsupported-for-phase): construct an order that triggers exactly that rejection | Correct `OrderRejection` variant returned for every cell in the matrix | T1 |
| Random order validation | Proptest generates random `PlayerOrder` values with arbitrary fields | Validation never panics; always returns a valid `OrderValidity` variant | T3 |
| Validation purity | Run `validate_order_checked` with debug assertions enabled; verify sim state hash before and after validation | State hash unchanged — validation has zero side effects | T1 |
| Rejection telemetry | Submit 50 invalid orders from one player across 10 ticks | All 50 rejections appear in anti-cheat telemetry with correct categories | T2 |

### Merkle Tree Desync Localization

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| Single-archetype divergence | Run two sim instances. At tick T, inject deliberate mutation in one archetype on instance B | Merkle roots diverge. Tree traversal identifies mutated archetype leaf in ≤ ceil(log2(N)) rounds | T2 |
| Multi-archetype divergence | Inject divergence in 3 archetypes simultaneously | All 3 divergent archetypes identified | T2 |
| Proof verification | For a given leaf, verify the Merkle proof path reconstructs to the correct root hash | Proof verifies. Tampered proof fails verification | T3 (proptest) |

### Reconnection Snapshot Verification

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| Happy-path reconnection | 2-player game. Player B disconnects at tick 500. Player B reconnects, receives snapshot, resumes | After 1000 more ticks, Player B's state hash matches Player A's | T2 |
| Corrupted snapshot rejection | Flip one byte of the snapshot during transfer | Receiving client detects hash mismatch and rejects snapshot | T4 |
| Stale snapshot rejection | Send snapshot from tick 400 instead of 500 | Client detects tick mismatch and requests correct snapshot | T4 |

### Workshop Dependency Resolution (D030)

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| Transitive resolution | Package A → B → C. Install A | All three installed in dependency order; versions satisfy constraints | T1 |
| Version conflict detection | Package A requires B v2, Package C requires B v1. Install A + C | Conflict detected and reported with both constraint chains | T1 |
| Circular dependency rejection | A → B → C → A dependency cycle. Attempt resolution | Resolver returns cycle error with full cycle path | T1 |
| Diamond dependency | A→B, A→C, B→D, C→D. Install A | D installed once; version satisfies both B and C constraints | T1 |
| Version immutability | Attempt to re-publish same `publisher/name@version` | Publish rejected. Existing package unchanged | T2 |
| Random dependency graphs | Proptest generates random dependency graphs with varying depths and widths | Resolver terminates for all inputs; detects all cycles; produces valid install order or error | T3 |

### Campaign Graph Validation (D021)

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| Valid DAG acceptance | Construct valid branching campaign graph. Validate | All missions reachable from entry. All outcomes lead to valid next missions or campaign end | T1 |
| Cycle rejection | Insert cycle (mission 3 outcome routes back to mission 1) | Validation returns cycle error with path | T1 |
| Dangling reference rejection | Mission outcome points to nonexistent `MissionId` | Validation returns dangling reference error | T1 |
| Unit roster carryover | Complete mission with 5 surviving units (varied health/veterancy). Start next mission | Roster contains exactly those 5 units with correct health and veterancy levels | T2 |
| Story flag persistence | Set flag in M1, unset in M2, read in M3 | Correct value at each point | T2 |
| Campaign save mid-transition | Save during mission-to-mission transition. Load. Continue | State matches uninterrupted playthrough | T4 |

### WASM Sandbox Security (V50)

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| Cross-module data probe | Module A calls host API requesting Module B's ECS data via crafted query | Host returns permission error. Module B's state unchanged | T3 |
| Memory growth attack | Module requests `memory.grow(65536)` (4GB) | Growth denied at configured limit. Module receives trap. Host stable | T3 |
| Cross-module function call | Module A attempts to call Module B's exported functions directly | Call fails. Only host-mediated communication permitted | T3 |
| WASM float rejection | Module performs `f32` arithmetic and attempts to write result to sim state | Sim API rejects float values. Fixed-point conversion required | T3 |
| Module startup time budget | Module with artificially slow initialization (1000ms) | Module loading cancelled at timeout. Game continues without module | T3 |

### Balance Preset Validation (D019)

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| Inheritance chain resolution | Preset chain: Base → Competitive → Tournament. Query effective values | Tournament overrides Competitive, which overrides Base. No gaps in resolved values | T2 |
| Circular inheritance rejection | Preset A inherits B inherits A | Loader rejects with cycle error | T1 |
| Multiplayer preset enforcement | All players in lobby must resolve to identical effective preset | SHA-256 hash of resolved preset identical across all clients | T2 |
| Negative value rejection | Preset sets unit cost to -500 or health to 0 | Schema validator rejects with specific field error | T1 |
| Random inheritance chains | Proptest generates random preset inheritance trees | Resolver terminates; detects all cycles; produces valid resolved preset or error | T3 |

### Weather State Machine Determinism (D022)

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| Schedule determinism | Run identical weather schedule on two sim instances with same seed | `WeatherState` (type, intensity, transition_remaining) identical at every tick | T2 |
| Surface state sync | Weather transition triggers surface state update | Surface condition buffer matches between instances. Fixed-point intensity ramp is bit-exact | T2 |
| Weather serialization | Save game during blizzard → load → continue 1000 ticks | Weather state persists. Hash matches fresh run from same point | T3 |

### AI Behavior Determinism (D041/D043)

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| Seed reproducibility | Run AI with seed S on map M for 1000 ticks. Repeat 10 times | Build order, unit positions, resource totals identical across all 10 runs | T2 |
| Cross-platform match | Run same AI scenario on Linux and Windows | State hash match at every tick | T3 |
| Performance budget | AI tick for 500 units | < 0.5ms. No heap allocations in steady state | T3 |

### Console Command Security (D058)

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| Permission enforcement | Non-admin client sends admin-only command | Command rejected with permission error. No state change | T1 |
| Cvar bounds clamping | Set cvar to value outside `[MIN, MAX]` range | Value clamped to nearest bound. Telemetry event fires | T1 |
| Command rate limiting | Send 1000 commands in one tick | Commands beyond rate limit dropped. Client notified. Remaining budget recovers next tick | T2 |
| Dev mode replay flagging | Execute dev command during game. Save replay | Replay metadata records dev-mode flag. Replay ineligible for ranked leaderboard | T2 |
| Autoexec.cfg gameplay rejection | Ranked mode loads autoexec.cfg with gameplay commands (`/build harvester`) | Gameplay commands rejected. Only cvars accepted | T2 |

### SCR Credential Security (D052)

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| Monotonic sequence enforcement | Present SCR with sequence number lower than last accepted | SCR rejected as replayed/rolled-back | T2 |
| Key rotation grace period | Rotate key. Authenticate with old key during grace period | Authentication succeeds with deprecation warning | T4 |
| Post-grace rejection | Authenticate with old key after grace period expires | Authentication rejected. Error directs to key recovery | T4 |
| Emergency revocation | Revoke key via BIP-39 mnemonic | Old key immediately invalid. New key works | T4 |
| Malformed SCR rejection | Truncated signature, invalid version byte, corrupted payload | All rejected with specific error codes | T3 (fuzz) |

### Cross-Engine Map Exchange

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| OpenRA map round-trip | Import `.oramap` with known geometry. Export to IC format. Re-import | Spawn points, terrain, resources match original within defined tolerance | T2 |
| Out-of-bounds spawn rejection | Import map with spawn coordinates beyond map dimensions | Validator rejects with clear error | T2 |
| Malformed map fuzzing | Random map file bytes | Parser never panics; produces clean error or valid map | T3 |

### Mod Profile Fingerprinting (D062)

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| Fingerprint stability | Compute fingerprint, serialize/deserialize mod set, recompute | Identical fingerprints. Stable across runs | T2 |
| Ordering independence | Compute fingerprint with mods [A, B, C] and [C, A, B] | Identical fingerprints regardless of insertion order | T2 |
| Conflict resolution determinism | Two mods override same YAML key with different values. Apply with explicit priority | Winner matches declared priority. All clients agree on resolved value | T3 |

### LLM-Generated Content Validation (D016/D038)

| Test | Method | Pass Criteria | Tier |
| ---- | ------ | ------------- | ---- |
| Objective reachability | Generated mission with objectives at known positions | All objectives reachable from player starting position via pathfinding | T3 |
| Invalid trigger rejection | Generated Lua triggers with syntax errors or undefined references | Validation pass catches all errors before mission loads | T3 |
| Invalid unit type rejection | Generated YAML referencing nonexistent unit types | Content validator rejects with specific missing-type errors | T3 |
| Seed reproducibility | Generate mission with same seed twice | Identical YAML output | T4 |

## Coverage Mapping: Design Features → Tests

| Design Feature                          | Primary Test Tier | Verification Method                          |
| --------------------------------------- | ----------------- | -------------------------------------------- |
| Deterministic sim (Invariant #1)        | T1 + T2 + T3      | Hash comparison across runs/platforms        |
| Pluggable network model (Invariant #2)  | T2                 | Integration tests with mock network          |
| Tiered modding (Invariant #3)           | T1 + T3            | Sandbox smoke + escape vector suite          |
| Fog-authoritative server                | T2 + T3            | Anti-cheat detection + desync injection      |
| Ed25519 session auth                    | T2                 | Protocol handshake + replay signing          |
| Workshop package integrity              | T2 + T4            | Sign/verify chain + ecosystem lifecycle      |
| RTL/BiDi text handling                  | T3                 | QA corpus regression suite                   |
| Display name validation (V46)           | T3                 | UTS #39 confusable corpus                    |
| Key rotation (V47)                      | T4                 | Full rotation exercise                       |
| Anti-cheat behavioral detection         | T3 + T4            | Labeled replay corpus evaluation             |
| Desync classification (V55)             | T4                 | Injected bug vs cheat classification         |
| Performance budgets                     | T3                 | criterion benchmarks with regression gates   |
| Save/load integrity                     | T3                 | Round-trip hash comparison                   |
| Path security (`strict-path`)           | T1 + T3            | Unit tests + fuzz testing                    |
| WASM inter-module isolation (V50)       | T3                 | Cross-module probe attempts → all blocked    |
| P2P replay attestation (V53)            | T4                 | Multi-peer verification exercise             |
| Campaign completion                     | T4                 | Automated playthrough                        |
| Visual UI consistency                   | T4                 | Pixel-diff regression                        |
| Sub-tick ordering fairness (D008)       | T2 + T3            | Simultaneous-order scenarios; timestamp tiebreak verification |
| Order validation completeness (D012)    | T1 + T3            | Exhaustive order-type × rejection-category matrix; proptest |
| Merkle tree desync localization         | T2 + T3            | Inject divergence → verify O(log N) leaf identification |
| Snapshot reconnection (D007)            | T2 + T4            | Disconnect/reconnect/hash-match; corruption/stale rejection |
| Workshop dependency resolution (D030)   | T1 + T3            | Transitive, diamond, circular, and conflict dependency graphs |
| Campaign DAG validation (D021)          | T1 + T3            | Cycle/reachability/dangling-ref rejection at construction |
| Campaign roster carryover (D021)        | T2 + T4            | Surviving units + veterancy persist across mission transitions |
| Mod profile fingerprint stability (D062)| T2 + T3            | Serialize/deserialize/recompute identity; ordering independence |
| WASM memory growth defense (V50)        | T3                 | Adversarial `memory.grow` → denied; host stable |
| WASM float rejection in sim             | T3                 | Module attempts float write to sim → rejected |
| Pathfinding LOD + multi-layer (D013)    | T2 + T3            | Path correctness across LOD transitions; benchmark vs budget |
| Balance preset inheritance (D019)       | T1 + T2 + T3       | Chain resolution, cycle rejection, multiplayer hash match |
| Weather determinism (D022)              | T2 + T3            | Schedule sync + surface state match across instances |
| AI behavior determinism (D041)          | T2 + T3            | Same seed → identical build order; cross-platform hash match |
| Command permission enforcement (D058)   | T1 + T2            | Privileged command rejection; cvar bounds clamping |
| Rate limiting (D007/V17)                | T2 + T3            | Exceed `OrderBudget` → excess dropped; budget recovery timing |
| LLM content validation (D016)           | T3 + T4            | Objective reachability; trigger syntax; unit-type existence |
| Relay time-authority (D007)             | T2 + T3            | Timestamp envelope clamping; listen-server parity |
| SCR sequence enforcement (D052)         | T2 + T4            | Monotonic sequence; key rotation grace period; emergency revocation |
| Cross-engine map exchange (D011)        | T2 + T3            | OpenRA `.oramap` round-trip; out-of-bounds rejection |
| Conflict resolution ordering (D062)     | T2 + T3            | Explicit priority determinism; all clients agree on resolved values |
| Chat scope enforcement                  | T1 + T2            | Team message routed only to team; all-chat routed to all; scope conversion requires explicit call |
| Theme loading + switching (D032)        | T2 + T4            | Theme YAML schema validation; mid-gameplay switch produces no visual corruption; missing asset fallback |
| AI personality application (D043)       | T2 + T3            | `PersonalityId` resolves to valid preset; undefined personality rejected; AI behavior matches declared profile |

## Release Criteria

A release candidate is shippable when:

1. **All Tier 1–3 tests pass** on the release branch
2. **Latest Tier 4 run has no blockers** (within the past 7 days)
3. **Performance benchmarks show no regressions** vs the previous release
4. **Fuzz testing has run ≥1M iterations** per target with no new crashes
5. **Anti-cheat false-positive rate** meets V54 thresholds on the labeled corpus
6. **Cross-platform determinism** verified (Linux ↔ Windows ↔ macOS)

## Phase Rollout

| Phase   | Testing Scope Added                                                          |
| ------- | ---------------------------------------------------------------------------- |
| M0–M1   | Tier 1 pipeline, determinism harness, `strict-path` tests, clippy/fmt gates |
| M2      | Tier 2 pipeline, replay round-trip, `ra-formats` fuzz targets, Merkle tree unit tests, order validation matrix |
| M3      | Performance benchmark suite (incl. pathfinding LOD, spatial hash, flowfield, stagger schedule, ECS cache benchmarks), zero-alloc assertions, save/load tests |
| M4      | Network protocol tests, desync injection, Lua sandbox escape suite, sub-tick fairness scenarios, relay timestamp clamping, reconnection snapshot verification, order rate limiting |
| M5      | Anti-cheat calibration corpus, false-positive evaluation, ranked tests, SCR sequence enforcement, command permission tests, cvar bounds tests, AI determinism (cross-platform) |
| M6      | RTL/BiDi QA corpus regression, display name validation, visual regression    |
| M7–M8   | Workshop ecosystem tests (dependency cycle detection, version immutability), WASM escape vectors, cross-module isolation, WASM memory growth fuzzing, mod profile fingerprint stability, balance preset validation, weather determinism, D059 RTL chat/marker text safety tests |
| M9      | Full Tier 4 weekly suite, release criteria enforcement, campaign DAG validation, roster carryover tests, LLM content validation |
| M10–M11 | Campaign playthrough automation, extended fuzz campaigns, cross-engine map exchange, full WASM memory growth fuzzing |
