## Test Infrastructure Requirements

### Custom Test Harness (`ic-test-harness`)

A dedicated crate providing:

```rust
/// Run a deterministic sim scenario and return the final state hash.
pub fn run_scenario(scenario: &Scenario, seed: u64) -> SyncHash;

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

/// Run order validation and assert sim state hash is unchanged (purity check).
pub fn assert_validation_pure(snap: &SimCoreSnapshot, orders: &[PlayerOrder]);

/// Run two sim instances with identical input and assert hash match at every tick.
pub fn assert_twin_determinism(scenario: &Scenario, seed: u64, ticks: usize);

/// Run the same scenario on the current platform and compare hash against
/// a stored cross-platform reference hash.
pub fn assert_cross_platform_hash(scenario: &Scenario, reference: &HashFile);

/// Run snapshot round-trip and assert state identity via hash comparison.
/// Takes a snapshot, restores it into a fresh sim, and verifies that
/// `state_hash()` matches the original — state identity, not byte-exactness.
pub fn assert_snapshot_roundtrip(snap: &SimCoreSnapshot);

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

| Test                        | Method                                                                                                                                                                                                                                                                                            | Pass Criteria                                                                                                                                  | Tier |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Exhaustive rejection matrix | For each order type (Move, Attack, Build, etc.) × each of the 8 rejection categories (ownership, unit-type mismatch, out-of-range, insufficient resources, tech prerequisite, placement invalid, budget exceeded, unsupported-for-phase): construct an order that triggers exactly that rejection | Correct `OrderRejectionCategory` (D012) returned for every cell in the matrix; concrete variant within each category is implementation-defined | T1   |
| Random order validation     | Proptest generates random `PlayerOrder` values with arbitrary fields                                                                                                                                                                                                                              | Validation never panics; always returns a valid `OrderValidity` variant                                                                        | T3   |
| Validation purity           | Run `validate_order_checked` with debug assertions enabled; verify sim state hash before and after validation                                                                                                                                                                                     | State hash unchanged — validation has zero side effects                                                                                        | T1   |
| Rejection telemetry         | Submit 50 invalid orders from one player across 10 ticks                                                                                                                                                                                                                                          | All 50 rejections appear in anti-cheat telemetry with correct categories                                                                       | T2   |

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

