# Testing Strategy & CI/CD Pipeline

This document defines the automated testing infrastructure for Iron Curtain. Every design feature must map to at least one automated verification method. Testing is not an afterthought — it is a design constraint.

## Guiding Principles

1. **Determinism is testable.** If a system is deterministic (Invariant #1), its behavior can be reproduced exactly. Tests that rely on determinism are the strongest tests we have.
2. **No untested exit criteria.** Every milestone exit criterion (see 18-PROJECT-TRACKER.md) must have a corresponding automated test. If a criterion cannot be tested automatically, it must be flagged as a manual review gate.
3. **CI is the authority.** If CI passes, the code is shippable. If CI fails, the code does not merge. No exceptions, no "it works on my machine."
4. **Fast feedback, thorough verification.** PR gates must complete in <10 minutes. Nightly suites handle expensive verification. Weekly suites cover exhaustive/long-running scenarios.

## CI/CD Pipeline Tiers

### Tier 1: PR Gate (every pull request, <10 min)

| Test Category           | What It Verifies                                                       | Tool / Framework         |
| ----------------------- | ---------------------------------------------------------------------- | ------------------------ |
| `cargo clippy --all`    | Lint compliance, `disallowed_types` enforcement (see coding standards) | clippy                   |
| `cargo test`            | Unit tests across all crates                                           | cargo test               |
| `cargo fmt --check`     | Formatting consistency                                                 | rustfmt                  |
| Determinism smoke test  | 100-tick sim with fixed seed → hash match across runs                  | custom harness           |
| WASM sandbox smoke test | Basic WASM module load/execute/capability check                        | custom harness           |
| Lua sandbox smoke test  | Basic Lua script load/execute/resource-limit check                     | custom harness           |
| YAML schema validation  | All game data YAML files pass schema validation                        | custom validator         |
| `strict-path` boundary  | Path boundary enforcement for all untrusted-input APIs                 | unit tests               |
| Build (all targets)     | Cross-compilation succeeds (Linux, Windows, macOS)                     | cargo build / CI matrix  |
| Doc link check          | All internal doc cross-references resolve                              | mdbook build + linkcheck |

**Gate rule:** All Tier 1 tests must pass. Merge is blocked on any failure.

### Tier 2: Post-Merge (after merge to main, <30 min)

| Test Category           | What It Verifies                                              | Tool / Framework                  |
| ----------------------- | ------------------------------------------------------------- | --------------------------------- |
| Integration tests       | Cross-crate interactions (ic-sim ↔ ic-game ↔ ic-script)       | cargo test --features integration |
| Determinism full suite  | 10,000-tick sim with 8 players, all unit types → hash match   | custom harness                    |
| Network protocol tests  | Lobby join/leave, relay handshake, reconnection, session auth | custom harness + tokio            |
| Replay round-trip       | Record game → playback → hash match with original             | custom harness                    |
| Workshop package verify | Package build → sign → upload → download → verify chain       | custom harness                    |
| Anti-cheat smoke test   | Known-cheat replay → detection fires; known-clean → no flag   | custom harness                    |
| Memory safety (Miri)    | Undefined behavior detection in unsafe blocks                 | cargo miri test                   |

**Gate rule:** Failures trigger automatic revert of the merge commit and notification to the PR author.

### Tier 3: Nightly (scheduled, <2 hours)

| Test Category              | What It Verifies                                                | Tool / Framework       |
| -------------------------- | --------------------------------------------------------------- | ---------------------- |
| Fuzz testing               | `ra-formats` parser, YAML loader, network protocol deserializer | cargo-fuzz / libFuzzer |
| Property-based testing     | Sim invariants hold across random order sequences               | proptest               |
| Performance benchmarks     | Tick time, memory allocation, pathfinding cost vs budget        | criterion              |
| Zero-allocation assertion  | Hot-path functions allocate 0 heap bytes in steady state        | custom allocator hook  |
| Sandbox escape tests       | WASM module attempts all known escape vectors → all blocked     | custom harness         |
| Lua resource exhaustion    | `string.rep` bomb, infinite loop, memory bomb → all caught      | custom harness         |
| Desync injection           | Deliberately desync one client → detection fires within N ticks | custom harness         |
| Cross-platform determinism | Same scenario on Linux + Windows → identical hash               | CI matrix comparison   |
| Unicode/BiDi sanitization  | RTL/BiDi QA corpus (rtl-bidi-qa-corpus.md) categories A–I       | custom harness         |
| Display name validation    | UTS #39 confusable corpus → all impersonation attempts blocked  | custom harness         |
| Save/load round-trip       | Save game → load → continue 1000 ticks → hash matches fresh run | custom harness         |

**Gate rule:** Failures create high-priority issues. Regressions in performance benchmarks block the next release.

### Tier 4: Weekly (scheduled, <8 hours)

| Test Category           | What It Verifies                                                      | Tool / Framework            |
| ----------------------- | --------------------------------------------------------------------- | --------------------------- |
| Campaign playthrough    | Full campaign mission sequence completes without crash/desync         | automated playback          |
| Extended fuzz campaigns | 1M+ iterations per fuzzer target                                      | cargo-fuzz                  |
| Network simulation      | Packet loss, latency jitter, partition scenarios                      | custom harness + tc/netem   |
| Load testing            | 8-player game at 1000 units each → tick budget holds                  | custom harness              |
| Anti-cheat model eval   | Full labeled replay corpus → precision/recall vs V54 thresholds       | custom harness              |
| Visual regression       | Key UI screens rendered → pixel diff against baseline                 | custom harness + image diff |
| Workshop ecosystem test | Mod install → load → gameplay → uninstall lifecycle                   | custom harness              |
| Key rotation exercise   | V47 key rotation → old key rejected after grace → new key works       | custom harness              |
| P2P replay attestation  | 4-peer game → replays cross-verified → tampering detected             | custom harness              |
| Desync classification   | Injected platform-bug desync vs cheat desync → correct classification | custom harness              |

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

/// Run a scenario and measure tick time, returning percentile statistics.
pub fn benchmark_scenario(scenario: &Scenario, ticks: usize) -> TickStats;

/// Run a scenario and assert zero heap allocations in the hot path.
pub fn assert_zero_alloc_hot_path(scenario: &Scenario, ticks: usize);

/// Run a scenario with a sandbox module and assert all escape vectors are blocked.
pub fn assert_sandbox_contained(module: &WasmModule, escape_vectors: &[EscapeVector]);

/// Run order validation and assert sim state is unchanged (purity check).
pub fn assert_validation_pure(state: &SimState, orders: &[PlayerOrder]);

/// Run two sim instances with identical input and assert hash match at every tick.
pub fn assert_twin_determinism(scenario: &Scenario, seed: u64, ticks: usize);

/// Run the same scenario on the current platform and compare hash against
/// a stored cross-platform reference hash.
pub fn assert_cross_platform_hash(scenario: &Scenario, reference: &HashFile);

/// Run snapshot round-trip and assert byte-exact reconstruction.
pub fn assert_snapshot_roundtrip(state: &SimState) -> RoundTripResult;

/// Run a campaign mission sequence and verify roster carryover.
pub fn assert_roster_carryover(campaign: &CampaignGraph, mission_sequence: &[MissionId]);

/// Run a mod loading scenario and verify sandbox limits are enforced.
pub fn assert_mod_sandbox_limits(mod_path: &Path, limits: &SandboxLimits);
```

### Tick Statistics (`TickStats`)

```rust
/// Per-scenario benchmark output — all values in microseconds.
pub struct TickStats {
    pub p50: u64,
    pub p95: u64,
    pub p99: u64,
    pub max: u64,
    pub heap_allocs: u64,      // total heap allocations during measurement window
    pub peak_rss_bytes: u64,   // peak resident set size
}
```

### Performance Benchmark Suite (`ic-bench`)

Using `criterion` for statistical benchmarks with regression detection:

| Benchmark                                       | Budget          | Regression Threshold   |
| ----------------------------------------------- | --------------- | ---------------------- |
| Sim tick (100 units)                            | < 2ms           | +10% = warning         |
| Sim tick (1000 units)                           | < 10ms          | +10% = warning         |
| Pathfinding (A*, 256x256)                       | < 1ms           | +20% = warning         |
| Fog-of-war update                               | < 0.5ms         | +15% = warning         |
| Network serialization                           | < 0.1ms/message | +10% = warning         |
| YAML config load                                | < 50ms          | +25% = warning         |
| Replay frame write                              | < 0.05ms/frame  | +20% = warning         |
| Pathfinding LOD transition (256x256, 500 units) | < 0.25ms        | +15% = warning         |
| Stagger schedule overhead (1000 units)          | < 2.5ms         | +15% = warning         |
| Spatial hash query (1M entities, 8K result)     | < 1ms           | +20% = warning         |
| Flowfield generation (256x256)                  | < 0.5ms         | +15% = warning         |
| ECS cache miss rate (hot tick loop)             | < 5% L1 misses  | +2% absolute = warning |
| Weather state update (full map)                 | < 0.3ms         | +20% = warning         |
| Merkle tree hash (32 archetypes)                | < 0.2ms         | +15% = warning         |
| Order validation (256 orders/tick)              | < 0.5ms         | +10% = warning         |

**Allocation tracking:** Hot-path benchmarks also measure heap allocations. Any allocation in a previously zero-alloc path is a test failure.

### Fuzz Testing Targets

| Target                      | Input Source                        | Known CVE Coverage                                                                       |
| --------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `ra-formats` (.oramap)      | Random archive bytes                | Zip Slip, decompression bomb, path traversal                                             |
| `ra-formats` (.mix)         | Random file bytes                   | Buffer overread, integer overflow                                                        |
| YAML tier config            | Random YAML                         | V33 injection vectors                                                                    |
| Network protocol messages   | Random byte stream                  | V17 state saturation, oversized messages                                                 |
| Replay file parser          | Random replay bytes                 | V45 frame loss, signature chain gaps                                                     |
| `strict-path` inputs        | Random path strings                 | 19+ CVE patterns (symlink, ADS, 8.3, etc.)                                               |
| Display name validator      | Random Unicode                      | V46 confusable/homoglyph corpus                                                          |
| BiDi sanitizer              | Random Unicode                      | V56 override injection vectors                                                           |
| Pathfinding input           | Random topology + start/end         | Buffer overflow, infinite loop on pathological graphs                                    |
| Campaign DAG definition     | Random YAML graph                   | Cycles, unreachable nodes, missing outcome refs                                          |
| Workshop manifest + deps    | Random package manifests            | Circular deps, version constraint contradictions                                         |
| `p2p-distribute` bencode    | Random byte stream                  | Malformed integers, nested dicts, oversized strings, unterminated containers             |
| `p2p-distribute` BEP 3 wire | Random peer messages                | Invalid message IDs, oversized piece indices, malformed bitfields, request flooding      |
| `p2p-distribute` .torrent   | Random metadata bytes               | Oversized piece counts, missing required keys, hash length mismatch, info_hash collision |
| WASM memory requests        | Adversarial `memory.grow` sequences | OOM, growth beyond sandbox limit                                                         |
| Balance preset YAML         | Random inheritance chains           | Cycles, missing parents, conflicting overrides                                           |
| Cross-engine map format     | Random .mpr/.mmx bytes              | Malformed geometry, out-of-bounds spawns                                                 |
| LLM-generated mission YAML  | Random trigger/objective trees      | Unreachable objectives, invalid trigger refs                                             |

### Labeled Replay Corpus

For anti-cheat calibration (V54):

| Category            | Source                                   | Minimum Count |
| ------------------- | ---------------------------------------- | ------------- |
| Confirmed-cheat     | Test accounts with known cheat tools     | 500 replays   |
| Confirmed-clean     | Tournament players, manually verified    | 2000 replays  |
| Edge-case           | High-APM legitimate players (pro gamers) | 200 replays   |
| Bot-assisted        | Known automation scripts                 | 100 replays   |
| Platform-bug desync | Reproduced cross-platform desyncs (V55)  | 50 replays    |

The labeled corpus is a living dataset — confirmed cases from post-launch human review (V54 continuous calibration) are ingested automatically. Quarterly corpus audits verify partition hygiene (no mislabeled replays, stale entries archived after 12 months).

### Population Baseline Validation

For population-baseline statistical comparison (V12):

| Test                    | Method                                                          | Pass Criteria                                                       | CI Tier |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- | ------- |
| Baseline computation    | Seed db with 10K synthetic match profiles, compute baselines    | p99/p1/p5 percentiles match expected values within 1%               | T2      |
| Per-tier separation     | Generate profiles with distinct per-tier distributions          | Baselines for each rating tier differ meaningfully                  | T2      |
| Recalculation stability | Recompute baselines on overlapping windows with <5% data change | Baselines shift <2% between recomputations                          | T3      |
| Outlier vs population   | Inject synthetic outlier profiles (APM 2000+, reaction <40ms)   | Outliers flagged by population comparison AND hard-floor thresholds | T2      |

### Trust Score Validation

For behavioral matchmaking trust score (V12):

| Test                  | Method                                                 | Pass Criteria                                                     | CI Tier |
| --------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | ------- |
| Factor computation    | Seed player history db, compute trust score            | Score within expected range for known-good/known-bad profiles     | T2      |
| Matchmaking influence | Queue 100 synthetic players with varied trust scores   | High-trust players grouped preferentially with high-trust         | T3      |
| Recovery rate         | Simulate clean play after trust score drop             | Score recovers at defined asymmetric rate (slower gain than loss) | T2      |
| Community scoping     | Compute trust across two independent community servers | Scores are independent per community (no cross-community leakage) | T2      |

## Subsystem Test Specifications

Detailed test specifications organized by subsystem. Each entry defines: what is tested, test method, pass criteria, and CI tier.

### Simulation Fairness (D008)

| Test                              | Method                                                                                       | Pass Criteria                                                                        | Tier               |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------ |
| Sub-tick tiebreak determinism     | Two players issue Move orders to same target at identical sub-tick timestamps. Run 100 times | Player with lower `PlayerId` always wins tiebreak. Results identical across all runs | T2 + T3 (proptest) |
| Timestamp ordering correctness    | Player A timestamps at T+100us, Player B at T+200us for same contested resource              | Player A always wins. Reversing timestamps reverses winner                           | T2                 |
| Relay timestamp envelope clamping | Client submits timestamp outside feasible envelope (too far in the future or past)           | Relay clamps to envelope boundary. Anti-abuse telemetry event fires                  | T2                 |
| Listen-server relay parity        | Same scenario run with `EmbeddedRelayNetwork` vs `RelayLockstepNetwork`                      | Identical `TickOrders` output from both paths                                        | T2                 |

### Order Validation Matrix (D012)

| Test                        | Method                                                                                                                                                                                                                                                                                            | Pass Criteria                                                            | Tier |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---- |
| Exhaustive rejection matrix | For each order type (Move, Attack, Build, etc.) × each of the 8 rejection categories (ownership, unit-type mismatch, out-of-range, insufficient resources, tech prerequisite, placement invalid, budget exceeded, unsupported-for-phase): construct an order that triggers exactly that rejection | Correct `OrderRejection` variant returned for every cell in the matrix   | T1   |
| Random order validation     | Proptest generates random `PlayerOrder` values with arbitrary fields                                                                                                                                                                                                                              | Validation never panics; always returns a valid `OrderValidity` variant  | T3   |
| Validation purity           | Run `validate_order_checked` with debug assertions enabled; verify sim state hash before and after validation                                                                                                                                                                                     | State hash unchanged — validation has zero side effects                  | T1   |
| Rejection telemetry         | Submit 50 invalid orders from one player across 10 ticks                                                                                                                                                                                                                                          | All 50 rejections appear in anti-cheat telemetry with correct categories | T2   |

### Merkle Tree Desync Localization

| Test                        | Method                                                                                      | Pass Criteria                                                                                    | Tier          |
| --------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------- |
| Single-archetype divergence | Run two sim instances. At tick T, inject deliberate mutation in one archetype on instance B | Merkle roots diverge. Tree traversal identifies mutated archetype leaf in ≤ ceil(log2(N)) rounds | T2            |
| Multi-archetype divergence  | Inject divergence in 3 archetypes simultaneously                                            | All 3 divergent archetypes identified                                                            | T2            |
| Proof verification          | For a given leaf, verify the Merkle proof path reconstructs to the correct root hash        | Proof verifies. Tampered proof fails verification                                                | T3 (proptest) |

### Reconnection Snapshot Verification

| Test                         | Method                                                                                           | Pass Criteria                                                   | Tier |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---- |
| Happy-path reconnection      | 2-player game. Player B disconnects at tick 500. Player B reconnects, receives snapshot, resumes | After 1000 more ticks, Player B's state hash matches Player A's | T2   |
| Corrupted snapshot rejection | Flip one byte of the snapshot during transfer                                                    | Receiving client detects hash mismatch and rejects snapshot     | T4   |
| Stale snapshot rejection     | Send snapshot from tick 400 instead of 500                                                       | Client detects tick mismatch and requests correct snapshot      | T4   |

### Workshop Dependency Resolution (D030)

| Test                          | Method                                                                     | Pass Criteria                                                                                 | Tier |
| ----------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---- |
| Transitive resolution         | Package A → B → C. Install A                                               | All three installed in dependency order; versions satisfy constraints                         | T1   |
| Version conflict detection    | Package A requires B v2, Package C requires B v1. Install A + C            | Conflict detected and reported with both constraint chains                                    | T1   |
| Circular dependency rejection | A → B → C → A dependency cycle. Attempt resolution                         | Resolver returns cycle error with full cycle path                                             | T1   |
| Diamond dependency            | A→B, A→C, B→D, C→D. Install A                                              | D installed once; version satisfies both B and C constraints                                  | T1   |
| Version immutability          | Attempt to re-publish same `publisher/name@version`                        | Publish rejected. Existing package unchanged                                                  | T2   |
| Random dependency graphs      | Proptest generates random dependency graphs with varying depths and widths | Resolver terminates for all inputs; detects all cycles; produces valid install order or error | T3   |

### Campaign Graph Validation (D021)

| Test                         | Method                                                                                | Pass Criteria                                                                               | Tier |
| ---------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---- |
| Valid DAG acceptance         | Construct valid branching campaign graph. Validate                                    | All missions reachable from entry. All outcomes lead to valid next missions or campaign end | T1   |
| Cycle rejection              | Insert cycle (mission 3 outcome routes back to mission 1)                             | Validation returns cycle error with path                                                    | T1   |
| Dangling reference rejection | Mission outcome points to nonexistent `MissionId`                                     | Validation returns dangling reference error                                                 | T1   |
| Unit roster carryover        | Complete mission with 5 surviving units (varied health/veterancy). Start next mission | Roster contains exactly those 5 units with correct health and veterancy levels              | T2   |
| Story flag persistence       | Set flag in M1, unset in M2, read in M3                                               | Correct value at each point                                                                 | T2   |
| Campaign save mid-transition | Save during mission-to-mission transition. Load. Continue                             | State matches uninterrupted playthrough                                                     | T4   |

### WASM Sandbox Security (V50)

| Test                       | Method                                                                     | Pass Criteria                                                        | Tier |
| -------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---- |
| Cross-module data probe    | Module A calls host API requesting Module B's ECS data via crafted query   | Host returns permission error. Module B's state unchanged            | T3   |
| Memory growth attack       | Module requests `memory.grow(65536)` (4GB)                                 | Growth denied at configured limit. Module receives trap. Host stable | T3   |
| Cross-module function call | Module A attempts to call Module B's exported functions directly           | Call fails. Only host-mediated communication permitted               | T3   |
| WASM float rejection       | Module performs `f32` arithmetic and attempts to write result to sim state | Sim API rejects float values. Fixed-point conversion required        | T3   |
| Module startup time budget | Module with artificially slow initialization (1000ms)                      | Module loading cancelled at timeout. Game continues without module   | T3   |

### Balance Preset Validation (D019)

| Test                           | Method                                                                | Pass Criteria                                                                      | Tier |
| ------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---- |
| Inheritance chain resolution   | Preset chain: Base → Competitive → Tournament. Query effective values | Tournament overrides Competitive, which overrides Base. No gaps in resolved values | T2   |
| Circular inheritance rejection | Preset A inherits B inherits A                                        | Loader rejects with cycle error                                                    | T1   |
| Multiplayer preset enforcement | All players in lobby must resolve to identical effective preset       | SHA-256 hash of resolved preset identical across all clients                       | T2   |
| Negative value rejection       | Preset sets unit cost to -500 or health to 0                          | Schema validator rejects with specific field error                                 | T1   |
| Random inheritance chains      | Proptest generates random preset inheritance trees                    | Resolver terminates; detects all cycles; produces valid resolved preset or error   | T3   |

### Weather State Machine Determinism (D022)

| Test                  | Method                                                             | Pass Criteria                                                                               | Tier |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---- |
| Schedule determinism  | Run identical weather schedule on two sim instances with same seed | `WeatherState` (type, intensity, transition_remaining) identical at every tick              | T2   |
| Surface state sync    | Weather transition triggers surface state update                   | Surface condition buffer matches between instances. Fixed-point intensity ramp is bit-exact | T2   |
| Weather serialization | Save game during blizzard → load → continue 1000 ticks             | Weather state persists. Hash matches fresh run from same point                              | T3   |

### AI Behavior Determinism (D041/D043)

| Test                 | Method                                                      | Pass Criteria                                                             | Tier |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- | ---- |
| Seed reproducibility | Run AI with seed S on map M for 1000 ticks. Repeat 10 times | Build order, unit positions, resource totals identical across all 10 runs | T2   |
| Cross-platform match | Run same AI scenario on Linux and Windows                   | State hash match at every tick                                            | T3   |
| Performance budget   | AI tick for 500 units                                       | < 0.5ms. No heap allocations in steady state                              | T3   |

### Console Command Security (D058)

| Test                            | Method                                                                     | Pass Criteria                                                                            | Tier |
| ------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---- |
| Permission enforcement          | Non-admin client sends admin-only command                                  | Command rejected with permission error. No state change                                  | T1   |
| Cvar bounds clamping            | Set cvar to value outside `[MIN, MAX]` range                               | Value clamped to nearest bound. Telemetry event fires                                    | T1   |
| Command rate limiting           | Send 1000 commands in one tick                                             | Commands beyond rate limit dropped. Client notified. Remaining budget recovers next tick | T2   |
| Dev mode replay flagging        | Execute dev command during game. Save replay                               | Replay metadata records dev-mode flag. Replay ineligible for ranked leaderboard          | T2   |
| Autoexec.cfg gameplay rejection | Ranked mode loads autoexec.cfg with gameplay commands (`/build harvester`) | Gameplay commands rejected. Only cvars accepted                                          | T2   |

### SCR Credential Security (D052)

| Test                           | Method                                                       | Pass Criteria                                          | Tier      |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------ | --------- |
| Monotonic sequence enforcement | Present SCR with sequence number lower than last accepted    | SCR rejected as replayed/rolled-back                   | T2        |
| Key rotation grace period      | Rotate key. Authenticate with old key during grace period    | Authentication succeeds with deprecation warning       | T4        |
| Post-grace rejection           | Authenticate with old key after grace period expires         | Authentication rejected. Error directs to key recovery | T4        |
| Emergency revocation           | Revoke key via BIP-39 mnemonic                               | Old key immediately invalid. New key works             | T4        |
| Malformed SCR rejection        | Truncated signature, invalid version byte, corrupted payload | All rejected with specific error codes                 | T3 (fuzz) |

### Cross-Engine Map Exchange

| Test                          | Method                                                               | Pass Criteria                                                            | Tier |
| ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---- |
| OpenRA map round-trip         | Import `.oramap` with known geometry. Export to IC format. Re-import | Spawn points, terrain, resources match original within defined tolerance | T2   |
| Out-of-bounds spawn rejection | Import map with spawn coordinates beyond map dimensions              | Validator rejects with clear error                                       | T2   |
| Malformed map fuzzing         | Random map file bytes                                                | Parser never panics; produces clean error or valid map                   | T3   |

### Mod Profile Fingerprinting (D062)

| Test                            | Method                                                                              | Pass Criteria                                                         | Tier |
| ------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---- |
| Fingerprint stability           | Compute fingerprint, serialize/deserialize mod set, recompute                       | Identical fingerprints. Stable across runs                            | T2   |
| Ordering independence           | Compute fingerprint with mods [A, B, C] and [C, A, B]                               | Identical fingerprints regardless of insertion order                  | T2   |
| Conflict resolution determinism | Two mods override same YAML key with different values. Apply with explicit priority | Winner matches declared priority. All clients agree on resolved value | T3   |

### LLM-Generated Content Validation (D016/D038)

| Test                        | Method                                                            | Pass Criteria                                                          | Tier |
| --------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- | ---- |
| Objective reachability      | Generated mission with objectives at known positions              | All objectives reachable from player starting position via pathfinding | T3   |
| Invalid trigger rejection   | Generated Lua triggers with syntax errors or undefined references | Validation pass catches all errors before mission loads                | T3   |
| Invalid unit type rejection | Generated YAML referencing nonexistent unit types                 | Content validator rejects with specific missing-type errors            | T3   |
| Seed reproducibility        | Generate mission with same seed twice                             | Identical YAML output                                                  | T4   |

## Property-Based Testing Specifications (proptest)

Each property is a formal invariant verified across thousands of randomly generated inputs. Properties that fail produce a minimal counterexample for debugging.

| Property                                   | Generator                                                                                                                                       | Invariant Assertion                                                                                                                                                                 | Shrink Target                                                     | Tier |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---- |
| Sim determinism                            | Random seed × random order sequence (up to 200 orders over 500 ticks)                                                                           | Two runs with identical seed+orders produce identical `state_hash()` at every tick                                                                                                  | Minimal divergent tick + minimal order sequence                   | T3   |
| Order validation purity                    | Random `PlayerOrder` × random `SimState`                                                                                                        | `validate_order()` never mutates sim state (hash before == hash after)                                                                                                              | Minimal order type that causes mutation                           | T3   |
| Order validation totality                  | Random `PlayerOrder` with arbitrary field values                                                                                                | `validate_order()` always returns `OrderValidity` — never panics, never hangs                                                                                                       | Minimal panicking order                                           | T3   |
| Snapshot round-trip identity               | Random sim state after N random ticks                                                                                                           | `restore(snapshot(state))` produces `state_hash()` identical to original                                                                                                            | Minimal divergent component                                       | T3   |
| Delta snapshot correctness                 | Random sim state + random mutations                                                                                                             | `apply_delta(delta_snapshot(baseline, current))` to baseline equals current state                                                                                                   | Minimal mutation set that breaks delta                            | T3   |
| Fixed-point arithmetic closure             | Random `FixedPoint` × `FixedPoint` for add/sub/mul/div                                                                                          | Result stays within `i32` range; no silent overflow; division by zero returns error                                                                                                 | Minimal overflow pair                                             | T3   |
| Pathfinding completeness                   | Random map topology × random start/end where path exists                                                                                        | Pathfinder always returns a path if one exists (checked against BFS ground truth)                                                                                                   | Minimal topology where pathfinder fails                           | T3   |
| Pathfinding determinism                    | Random map × random start/end × two runs                                                                                                        | Identical path output for identical input                                                                                                                                           | Minimal map where paths diverge                                   | T3   |
| Workshop dependency resolution termination | Random dependency graphs (1–100 packages, 0–10 deps each)                                                                                       | Resolver terminates within bounded time; returns valid order or error; no infinite loop                                                                                             | Minimal graph that causes non-termination                         | T3   |
| Campaign DAG validity                      | Random mission graphs (1–50 missions, 1–5 outcomes each)                                                                                        | `CampaignGraph::new()` accepts iff acyclic, fully reachable, no dangling refs                                                                                                       | Minimal invalid graph accepted or valid graph rejected            | T3   |
| UnitTag generation safety                  | Random pool operations (alloc/free sequences, 10K ops)                                                                                          | No two live units ever share the same `UnitTag`; stale tags always resolve to `None`                                                                                                | Minimal sequence producing tag collision                          | T3   |
| Chat scope isolation                       | Random chat messages × random scope assignments                                                                                                 | `ChatMessage<TeamScope>` is never delivered to non-team recipients                                                                                                                  | Minimal routing violation                                         | T2   |
| BoundedVec overflow safety                 | Random push/pop sequences against `BoundedVec<T, N>`                                                                                            | Length never exceeds N; push beyond N returns `Err`; no panic                                                                                                                       | Minimal violating sequence                                        | T1   |
| BoundedCvar range enforcement              | Random `set()` calls with values across full `T` range                                                                                          | `get()` always returns value within `[min, max]`; no value escapes bounds                                                                                                           | Minimal value that escapes bounds                                 | T1   |
| Merkle tree consistency                    | Random component mutations × tree rebuild                                                                                                       | Root hash changes iff at least one leaf changed; unchanged leaves produce same hash                                                                                                 | Minimal mutation where root hash is wrong                         | T3   |
| Weather schedule determinism               | Random weather configurations × two sim instances                                                                                               | Weather state identical at every tick across instances with same seed                                                                                                               | Minimal divergent config                                          | T2   |
| Anti-cheat NaN pipeline guard              | Random f64 sequences (incl. NaN, Inf, subnormal) fed to all anti-cheat scoring paths (EWMA, behavioral_score, TrustFactors, PopulationBaseline) | No output field is ever NaN or Inf; NaN inputs produce fail-closed sentinel values (1.0 for suspicion scores, population median for trust factors)                                  | Minimal input that produces NaN in any output field               | T3   |
| WASM timing oracle resistance              | Random spatial query inputs × random fog configurations (0–100% fogged entities in query region)                                                | `ic_query_units_in_range()` execution time does not vary beyond ±10% based on fogged entity count (measured over 1000 iterations per configuration; timer resolution ≥ microsecond) | Minimal fog configuration where timing variance exceeds threshold | T3   |
| Replay network isolation                   | Random replay file × random embedded YAML with external URLs                                                                                    | During `SelfContained` replay playback, zero network I/O syscalls are issued; all external asset references resolve to placeholder                                                  | Minimal replay content that triggers network access               | T2   |
| Key rotation sequence monotonicity         | Random concurrent rotation attempts × random timing                                                                                             | `rotation_sequence_number` is strictly monotonically increasing; no two rotations share a sequence number; cooldown-violating rotations are rejected except Emergency               | Minimal concurrent rotation pair that violates monotonicity       | T2   |
| CRL tiered policy correctness              | Random credential status × random match context (ranked/unranked/LAN)                                                                           | Ranked context hard-fails on unknown CRL status; unranked grace-period allows 24h; LAN soft-fails with warning; no context allows revoked credentials                               | Minimal context where wrong policy is applied                     | T2   |

**proptest configuration:** 256 cases per property in T1/T2 (PR gate speed), 10,000 cases in T3 (nightly thoroughness). Regression files committed to repository — discovered failures are replayed in T1 forever.

## API Misuse Test Matrix

Systematic tests derived from the API misuse analysis in `architecture/api-misuse-defense.md`. Each test verifies that a specific misuse vector is blocked by either the type system (compile-time) or runtime validation.

### Compile-Time Defense Verification

These defenses are verified by the type system — no runtime test needed. They are verified during code review and tracked here for completeness. If a refactor accidentally removes the defense, `cargo check` will catch it.

| Defense                                                 | Mechanism                                          | What Would Break It                                             | Monitoring                |
| ------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------- | ------------------------- |
| S5: `ReconcilerToken` prevents unauthorized corrections | `_private: ()` field                               | Making field `pub` or adding `Default` derive                   | Code review checklist     |
| S8: `Simulation` is `!Sync`                             | `&mut self` on all mutation methods                | Adding `unsafe impl Sync`                                       | `clippy` + code review    |
| O6: `OrderBudget` unconstructible externally            | `_private: ()` field                               | Making inner fields `pub`                                       | Code review checklist     |
| O7: `Verified<PlayerOrder>` restricted construction     | `pub(crate)` on `new_verified()`                   | Changing to `pub`                                               | Code review checklist     |
| W1: `WasmTerminated` has no `execute()`                 | Typestate pattern                                  | Adding `execute()` to terminated state                          | Code review + trait audit |
| W7: `FsReadCapability` unconstructible externally       | `_private: ()` field                               | Making field `pub`                                              | Code review checklist     |
| P1: Workshop `extract()` requires `PkgVerifying`        | Typestate consumes `self`                          | Adding `extract()` to `PkgDownloading`                          | Code review + trait audit |
| C1: `MissionLoading` has no `complete()`                | Typestate pattern                                  | Adding `complete()` to loading state                            | Code review + trait audit |
| B4: Read buffer immutability                            | `read()` returns `&T`                              | Returning `&mut T` from `read()`                                | Code review checklist     |
| N7: `SyncHash` ≠ `StateHash`                            | Distinct newtypes, no `From` impl                  | Adding `From<SyncHash> for StateHash`                           | `clippy` + code review    |
| M1: Chat scope branding                                 | `ChatMessage<TeamScope>` ≠ `ChatMessage<AllScope>` | Adding `From<ChatMessage<TeamScope>> for ChatMessage<AllScope>` | Code review checklist     |

### Runtime Defense Test Specifications

Tests verifying runtime defenses against misuse vectors. Each test has a specific assertion, exact pass/fail criteria, and measurement metric.

| ID  | Misuse Vector                | Test Method                                               | Exact Assertion                                                                                 | Measurement Metric                                           | Tier |
| --- | ---------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---- |
| S1  | Future-tick orders           | Call `apply_tick(tick=N+2)` when sim is at tick N         | Returns `TickMismatchError { expected: N, got: N+2 }`                                           | Error variant + field values match                           | T1   |
| S3  | Cross-game snapshot restore  | `Simulation::restore()` with snapshot from different seed | Returns `SnapshotError::ConfigMismatch { field: "game_seed" }`                                  | Error variant, sim state_hash unchanged                      | T2   |
| S4  | Corrupted snapshot           | Flip random byte in serialized snapshot, call `restore()` | Returns `SnapshotError::IntegrityCheckFailed`                                                   | 100 random bit-flips, 100% detection rate                    | T3   |
| S6  | Float injection via snapshot | Embed `f32` bytes in snapshot where `FixedPoint` expected | `serde` deserialization returns type error                                                      | Error type is `DeserializationError`, not panic              | T3   |
| S7  | Unknown player order         | `inject_orders()` with non-existent `PlayerId(999)`       | `OrderRejection::UnknownPlayer { id: 999 }`                                                     | Rejection logged in telemetry with player ID                 | T1   |
| S9  | Out-of-bounds coordinates    | Move order to `WorldPos { x: 999999, y: 999999, z: 0 }`   | `OrderRejection::OutOfBounds { pos, map_bounds }`                                               | Both position and bounds included in error                   | T1   |
| O1  | Stale UnitTag after death    | Kill unit, send attack order targeting dead unit's tag    | `OrderRejection::StaleTarget { tag, current_generation }`                                       | Generation mismatch detected                                 | T1   |
| O2  | Order rate limit             | Send 201 orders in one tick (budget=200)                  | First 200 accepted, 201st returns `BudgetExhausted`                                             | Exact count: accepted=200, rejected=1                        | T2   |
| O3  | Timestamp manipulation       | `sub_tick_time = 999999999` (far future)                  | Relay clamps to envelope max (e.g., 66667µs)                                                    | Clamped value ≤ tick_window_us; telemetry event fires        | T2   |
| O8  | Oversized unit selection     | Move order with 100 UnitTags (max=40)                     | `OrderRejection::SelectionTooLarge { count: 100, max: 40 }`                                     | Both count and max in error                                  | T1   |
| N2  | Handshake replay             | Capture challenge response, replay on new connection      | Connection terminated with `AuthError::NonceReused`                                             | Connection drops within 100ms of replay                      | T2   |
| N6  | Half-open connection flood   | Open 10,000 TCP connections, don't complete handshake     | All timeout within configured window (default: 5s); relay accepts new connections after cleanup | Peak memory < 50MB during flood; recovery < 1s               | T3   |
| W3  | WASM memory bomb             | `memory.grow(65536)` from WASM module                     | Growth denied; module receives trap; host continues                                             | Host memory unchanged; module terminated cleanly             | T3   |
| W5  | WASM infinite loop           | `loop {}` in WASM entry point                             | Fuel exhausted; module trapped; host continues                                                  | Execution terminates within fuel budget; game tick completes | T3   |
| L1  | Lua string bomb              | `string.rep("a", 2^30)`                                   | Memory limit hit; script receives error; host continues                                         | Host memory unchanged; script terminated                     | T3   |
| L2  | Lua infinite loop            | `while true do end`                                       | Instruction limit hit; script terminated                                                        | Script terminates within instruction budget                  | T3   |
| L3  | Lua system access            | Call `os.execute("rm -rf /")`                             | Returns nil (function not registered)                                                           | No side effects on host filesystem                           | T1   |
| L5  | Lua UnitTag forgery          | Script creates tag value for enemy unit, calls host API   | `SandboxError::OwnershipViolation { tag, caller, owner }`                                       | Error includes all three IDs                                 | T3   |
| U1  | Stale UnitTag resolution     | Alloc tag, free slot, resolve original tag                | `UnitPool::resolve()` returns `None`                                                            | Generation mismatch, no panic                                | T1   |
| U2  | Pool exhaustion              | Allocate units beyond pool capacity (2049 for RA1)        | `UnitPoolError::PoolExhausted` after 2048th                                                     | Exact count: 2048 succeed, 2049th fails                      | T2   |
| F1  | Negative health YAML         | `health: { max: -100 }` in unit definition                | `SchemaError::InvalidValue { field: "health.max", value: "-100", constraint: "> 0" }`           | Error includes file path + line number                       | T1   |
| F2  | Circular YAML inheritance    | `A inherits B inherits A`                                 | `RuleLoadError::CircularInheritance { chain: "A → B → A" }`                                     | Chain string matches cycle path                              | T1   |
| F3  | Unknown TOML key             | `unknwon_feld = true` in config.toml                      | `DeserializationError::UnknownField { field: "unknwon_feld", valid: [...] }`                    | Error lists available fields                                 | T1   |
| A1  | Zip Slip in .oramap          | Entry path `../../etc/passwd` in archive                  | `PathBoundaryError::EscapeAttempt { path, boundary }`                                           | Extract produces zero files outside boundary                 | T3   |
| A2  | Truncated .mix               | Header claims 47 files, data for 31                       | `MixParseError::FileCountMismatch { declared: 47, actual: 31 }`                                 | Both counts in error                                         | T1   |

## Integration Scenario Matrix

End-to-end scenarios testing multiple systems interacting. Each scenario has explicit setup, action sequence, and verification points.

| Scenario                        | Systems Under Test              | Setup                                                              | Action Sequence                                                           | Verification Points                                                                                                                       | Tier |
| ------------------------------- | ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Full match lifecycle            | sim + net + replay              | 2-player game, relay network, 5-min scenario                       | Lobby → loading → 1000 ticks → surrender → post-game                      | (1) Replay file exists, (2) replay hash matches live hash, (3) post-game stats match sim query                                            | T2   |
| Reconnection mid-combat         | sim + net + snapshot            | 2-player game, combat in progress at tick 300                      | P2 disconnects → 200 ticks → P2 reconnects with snapshot → 500 more ticks | (1) Snapshot accepted, (2) state hashes match after reconnect, (3) no combat resolution errors                                            | T2   |
| Mod load with conflicts         | modding + YAML + sim            | Two mods overriding `rifle_infantry.cost` with different values    | Load profile with explicit priority → start game → build rifle infantry   | (1) Conflict detected and logged, (2) higher-priority mod wins, (3) cost in game matches winner, (4) fingerprint identical across clients | T3   |
| Workshop install → gameplay     | Workshop + sim + modding        | Package with new unit type, dependency on base content             | Install package → resolve deps → load mod → start game → build new unit   | (1) Deps installed in order, (2) unit definition loaded, (3) unit buildable in game, (4) unit stats match YAML                            | T4   |
| Campaign transition with roster | campaign + sim + snapshot       | Campaign with 2 missions, transition on victory                    | Play M1 → win with 5 units → transition → verify roster in M2             | (1) 5 units in M2 roster, (2) health/veterancy preserved, (3) story flags accessible                                                      | T2   |
| Chat scope in multiplayer       | chat + net + relay              | 4-player team game (2v2)                                           | P1 sends team chat → P1 sends all-chat → verify delivery                  | (1) Team chat: P1+P2 receive, P3+P4 do not, (2) all-chat: all 4 receive, (3) observer sees all-chat only                                  | T2   |
| WASM mod with sandbox limits    | WASM + sim + modding            | Malicious mod attempting memory bomb + file access + infinite loop | Load mod → trigger memory.grow → trigger file access → trigger loop       | (1) Memory growth denied, (2) file access denied, (3) loop terminated by fuel, (4) game continues normally                                | T3   |
| Desync detection → diagnosis    | sim + net + Merkle tree         | 2-player game, deliberate single-archetype mutation at tick 500    | Run to tick 500 → corrupt one archetype on P2 → run to tick 510           | (1) Desync detected within 10 ticks, (2) Merkle tree identifies exact archetype, (3) diagnosis payload < 1KB                              | T2   |
| Anti-cheat → trust score flow   | sim + net + telemetry + ranking | Player with 10 clean games, then 1 flagged game                    | Play 10 games cleanly → play 1 game with known-cheat replay pattern       | (1) Trust score starts high, (2) flagged game triggers score drop, (3) subsequent clean games recover slowly                              | T4   |
| Save/load during weather        | sim + weather + snapshot        | Game with active blizzard at tick 300                              | Save at tick 300 → load → run 500 more ticks                              | (1) Weather state matches, (2) terrain surface conditions match, (3) state hash at tick 800 matches fresh run                             | T3   |
| Console dev-mode flagging       | console + replay + ranking      | Ranked game, player issues `/god_mode`                             | Start ranked → exec dev command → complete match → check replay + ranking | (1) Dev flag set, (2) replay metadata shows dev-mode, (3) match excluded from ranked standings                                            | T2   |
| Foreign replay import           | replay + sim + format           | `.orarep` file from OpenRA                                         | Import → play back via `ForeignReplayPlayback` → check divergence         | (1) Import succeeds, (2) playback runs to completion, (3) divergences logged with tick+archetype detail                                   | T3   |

## Measurement & Metrics Framework

Every automated test produces structured output beyond pass/fail. These metrics feed into the release-readiness dashboard.

### Performance Metrics (collected per benchmark run)

| Metric                     | Collection Method                                      | Storage                       | Alert Threshold                              |
| -------------------------- | ------------------------------------------------------ | ----------------------------- | -------------------------------------------- |
| Tick time (p50, p95, p99)  | `criterion` statistical analysis                       | Benchmark history DB (SQLite) | p99 exceeds budget by >10%                   |
| Heap allocations per tick  | Custom global allocator wrapper counting `alloc` calls | Per-benchmark counter         | Any allocation in designated zero-alloc path |
| L1 cache miss rate         | `perf stat` / platform performance counters            | Benchmark log                 | > 5% in hot tick loop                        |
| Peak RSS during scenario   | `/proc/self/status` sampling at 10ms intervals         | Benchmark log                 | > 2× expected for unit count                 |
| Pathfinding nodes expanded | Internal counter in pathfinder                         | Per-benchmark metric          | > 2× optimal for known map                   |
| Serialization throughput   | Bytes/second for snapshot and replay frame writes      | Benchmark log                 | Regression > 15%                             |

### Correctness Metrics (collected per test suite run)

| Metric                            | Collection Method                                       | Storage               | Alert Threshold                               |
| --------------------------------- | ------------------------------------------------------- | --------------------- | --------------------------------------------- |
| Determinism violations            | Hash comparison failures across repeated runs           | Test result DB        | Any violation is a P0 bug                     |
| False positive rate (anti-cheat)  | `flagged_clean / total_clean` on labeled corpus         | Corpus evaluation log | > 0.1% (V54 threshold)                        |
| False negative rate (anti-cheat)  | `missed_cheat / total_cheat` on labeled corpus          | Corpus evaluation log | > 5% (V54 threshold)                          |
| Order rejection accuracy          | Correct rejection variant rate across exhaustive matrix | Test result DB        | < 100% is a bug                               |
| Fuzz coverage (edge/line)         | `cargo-fuzz` with `--sanitizer=coverage`                | Fuzz coverage report  | < 80% line coverage in target module          |
| Property test case count          | proptest runner statistics                              | Test log              | < configured minimum (256 for T1, 10K for T3) |
| Snapshot round-trip bit-exactness | Byte comparison of snapshot → restore → snapshot        | Test result DB        | Any byte difference is a P0 bug               |

### Security Metrics (collected per security test suite run)

| Metric                            | Collection Method                                                | Storage           | Alert Threshold                     |
| --------------------------------- | ---------------------------------------------------------------- | ----------------- | ----------------------------------- |
| Sandbox escape attempts blocked   | Counter in WASM/Lua host                                         | Security test log | Any unblocked attempt is a P0 bug   |
| Path traversal attempts blocked   | `StrictPath` rejection counter during fuzz                       | Fuzz log          | Any unblocked traversal is a P0 bug |
| Replay tampering detection rate   | Tampered frames detected / total tampered frames                 | Security test log | < 100% is a P0 bug                  |
| SCR replay attack detection rate  | Replayed credentials detected / total replays                    | Security test log | < 100% is a P0 bug                  |
| Rate limit enforcement accuracy   | Orders dropped when budget exhausted / orders sent beyond budget | Test log          | < 100% is a bug                     |
| Half-open connection cleanup time | Time from flood to full recovery                                 | Stress test log   | > 5 seconds is a bug                |

## Coverage Mapping: Design Features → Tests

| Design Feature                           | Primary Test Tier | Verification Method                                                                                            |
| ---------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| Deterministic sim (Invariant #1)         | T1 + T2 + T3      | Hash comparison across runs/platforms                                                                          |
| Pluggable network model (Invariant #2)   | T2                | Integration tests with mock network                                                                            |
| Tiered modding (Invariant #3)            | T1 + T3           | Sandbox smoke + escape vector suite                                                                            |
| Fog-authoritative server                 | T2 + T3           | Anti-cheat detection + desync injection                                                                        |
| Ed25519 session auth                     | T2                | Protocol handshake + replay signing                                                                            |
| Workshop package integrity               | T2 + T4           | Sign/verify chain + ecosystem lifecycle                                                                        |
| RTL/BiDi text handling                   | T3                | QA corpus regression suite                                                                                     |
| Display name validation (V46)            | T3                | UTS #39 confusable corpus                                                                                      |
| Key rotation (V47)                       | T4                | Full rotation exercise                                                                                         |
| Anti-cheat behavioral detection          | T3 + T4           | Labeled replay corpus evaluation                                                                               |
| Desync classification (V55)              | T4                | Injected bug vs cheat classification                                                                           |
| Performance budgets                      | T3                | criterion benchmarks with regression gates                                                                     |
| Save/load integrity                      | T3                | Round-trip hash comparison                                                                                     |
| Path security (`strict-path`)            | T1 + T3           | Unit tests + fuzz testing                                                                                      |
| WASM inter-module isolation (V50)        | T3                | Cross-module probe attempts → all blocked                                                                      |
| P2P replay attestation (V53)             | T4                | Multi-peer verification exercise                                                                               |
| Campaign completion                      | T4                | Automated playthrough                                                                                          |
| Visual UI consistency                    | T4                | Pixel-diff regression                                                                                          |
| Sub-tick ordering fairness (D008)        | T2 + T3           | Simultaneous-order scenarios; timestamp tiebreak verification                                                  |
| Order validation completeness (D012)     | T1 + T3           | Exhaustive order-type × rejection-category matrix; proptest                                                    |
| Merkle tree desync localization          | T2 + T3           | Inject divergence → verify O(log N) leaf identification                                                        |
| Snapshot reconnection (D007)             | T2 + T4           | Disconnect/reconnect/hash-match; corruption/stale rejection                                                    |
| Workshop dependency resolution (D030)    | T1 + T3           | Transitive, diamond, circular, and conflict dependency graphs                                                  |
| Campaign DAG validation (D021)           | T1 + T3           | Cycle/reachability/dangling-ref rejection at construction                                                      |
| Campaign roster carryover (D021)         | T2 + T4           | Surviving units + veterancy persist across mission transitions                                                 |
| Mod profile fingerprint stability (D062) | T2 + T3           | Serialize/deserialize/recompute identity; ordering independence                                                |
| WASM memory growth defense (V50)         | T3                | Adversarial `memory.grow` → denied; host stable                                                                |
| WASM float rejection in sim              | T3                | Module attempts float write to sim → rejected                                                                  |
| Pathfinding LOD + multi-layer (D013)     | T2 + T3           | Path correctness across LOD transitions; benchmark vs budget                                                   |
| Balance preset inheritance (D019)        | T1 + T2 + T3      | Chain resolution, cycle rejection, multiplayer hash match                                                      |
| Weather determinism (D022)               | T2 + T3           | Schedule sync + surface state match across instances                                                           |
| AI behavior determinism (D041)           | T2 + T3           | Same seed → identical build order; cross-platform hash match                                                   |
| Command permission enforcement (D058)    | T1 + T2           | Privileged command rejection; cvar bounds clamping                                                             |
| Rate limiting (D007/V17)                 | T2 + T3           | Exceed `OrderBudget` → excess dropped; budget recovery timing                                                  |
| LLM content validation (D016)            | T3 + T4           | Objective reachability; trigger syntax; unit-type existence                                                    |
| Relay time-authority (D007)              | T2 + T3           | Timestamp envelope clamping; listen-server parity                                                              |
| SCR sequence enforcement (D052)          | T2 + T4           | Monotonic sequence; key rotation grace period; emergency revocation                                            |
| Cross-engine map exchange (D011)         | T2 + T3           | OpenRA `.oramap` round-trip; out-of-bounds rejection                                                           |
| Conflict resolution ordering (D062)      | T2 + T3           | Explicit priority determinism; all clients agree on resolved values                                            |
| Chat scope enforcement                   | T1 + T2           | Team message routed only to team; all-chat routed to all; scope conversion requires explicit call              |
| Theme loading + switching (D032)         | T2 + T4           | Theme YAML schema validation; mid-gameplay switch produces no visual corruption; missing asset fallback        |
| AI personality application (D043)        | T2 + T3           | `PersonalityId` resolves to valid preset; undefined personality rejected; AI behavior matches declared profile |

## Release Criteria

A release candidate is shippable when:

1. **All Tier 1–3 tests pass** on the release branch
2. **Latest Tier 4 run has no blockers** (within the past 7 days)
3. **Performance benchmarks show no regressions** vs the previous release
4. **Fuzz testing has run ≥1M iterations** per target with no new crashes
5. **Anti-cheat false-positive rate** meets V54 thresholds on the labeled corpus
6. **Cross-platform determinism** verified (Linux ↔ Windows ↔ macOS)

## Phase Rollout

| Phase   | Testing Scope Added                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0–M1   | Tier 1 pipeline, determinism harness, `strict-path` tests, clippy/fmt gates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| M2      | Tier 2 pipeline, replay round-trip, `ra-formats` fuzz targets, Merkle tree unit tests, order validation matrix                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| M3      | Performance benchmark suite (incl. pathfinding LOD, spatial hash, flowfield, stagger schedule, ECS cache benchmarks), zero-alloc assertions, save/load tests                                                                                                                                                                                                                                                                                                                                                                                                    |
| M4      | Network protocol tests, desync injection, Lua sandbox escape suite, sub-tick fairness scenarios, relay timestamp clamping, reconnection snapshot verification, order rate limiting                                                                                                                                                                                                                                                                                                                                                                              |
| M5      | Anti-cheat calibration corpus, false-positive evaluation, ranked tests, SCR sequence enforcement, command permission tests, cvar bounds tests, AI determinism (cross-platform)                                                                                                                                                                                                                                                                                                                                                                                  |
| M6      | RTL/BiDi QA corpus regression, display name validation, visual regression                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| M7–M8   | Workshop ecosystem tests (dependency cycle detection, version immutability), WASM escape vectors, cross-module isolation, WASM memory growth fuzzing, mod profile fingerprint stability, balance preset validation, weather determinism, D059 RTL chat/marker text safety tests, `p2p-distribute` fuzz suite (bencode/wire/metadata ≥1M iterations each), P2P interop tests (tracker announce/scrape, DHT routing, piece verification, multi-peer swarm), P2P profile switching (embedded→desktop→seedbox), `ic-server` Workshop seeder integration smoke tests |
| M9      | Full Tier 4 weekly suite, release criteria enforcement, campaign DAG validation, roster carryover tests, LLM content validation                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M10–M11 | Campaign playthrough automation, extended fuzz campaigns, cross-engine map exchange, full WASM memory growth fuzzing                                                                                                                                                                                                                                                                                                                                                                                                                                            |
