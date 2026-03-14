# Delta Encoding, Decision Record & Invariants

## Delta Encoding & Change Tracking Performance

Snapshots (D010) are the foundation of save games, replays, desync debugging, and reconnection. Full snapshots of 1000 units are ~200-400KB (ECS-packed). At 15 tps, saving full snapshots every tick would cost ~3-6 MB/s — wasteful when most fields don't change most ticks.

### Property-Level Delta Encoding

Instead of snapshotting entire components, track which specific fields changed (see `02-ARCHITECTURE.md` § "State Recording & Replay Infrastructure" for the `#[derive(TrackChanges)]` macro and `ChangeMask` bitfield). Delta snapshots record only changed fields:

```
Full snapshot:  1000 units × ~300 bytes     = 300 KB
Delta snapshot: 1000 units × ~30 bytes avg  =  30 KB  (10x reduction)
```

This pattern is validated by Source Engine's `CNetworkVar` system (see `research/valve-github-analysis.md` § 2.2), which tracks per-field dirty flags and transmits only changed properties. The Source Engine achieves 10-20x bandwidth reduction through this approach — IC targets a similar ratio.

### SPROP_CHANGES_OFTEN Priority Encoding

Source Engine annotates frequently-changing properties with `SPROP_CHANGES_OFTEN`, which moves them to the front of the encoding order. The encoder checks these fields first, improving branch prediction and cache locality during delta computation:

```rust
/// Fields annotated with #[changes_often] are checked first during delta computation.
/// This improves branch prediction (frequently-dirty fields are checked early) and
/// cache locality (hot fields are contiguous in the diff buffer).
///
/// Typical priority ordering for a unit component:
///   1. Position, Velocity        — change nearly every tick (movement)
///   2. Health, Facing            — change during combat
///   3. Owner, UnitType, Armor    — rarely change (cold)
```

The encoder iterates priority groups in order: changes-often fields first, then remaining fields. For a 1000-unit game where ~200 units are moving, the encoder finds the first dirty field within 1-2 checks for moving units (position is priority 0) and within 0 checks for stationary units (nothing dirty). Without priority ordering, the encoder would scan all fields equally, hitting cold fields first and wasting branch predictor entries.

### Entity Baselines (from Quake 3)

Quake 3's networking introduced **entity baselines** — a default state for each entity type that serves as a reference for delta encoding (see `research/quake3-netcode-analysis.md`). IC applies this concept as an **internal optimization within** the canonical snapshot-relative delta model:

IC's structural delta model is always anchored to a concrete prior full snapshot (`SimCoreDelta.baseline_tick` / `baseline_hash` — see `formats/replay-keyframes-analysis.md`). Entity baselines are a complementary optimization *within* that model: when computing a delta against a known prior snapshot, fields that match both the prior snapshot **and** their archetype's default state can be omitted with a single-bit flag per field, because the receiver can reconstruct them from its own copy of the archetype baseline. This reduces delta size further without changing the structural requirement that every delta references a concrete prior snapshot.

```rust
/// Per-archetype baseline state. Registered at game module initialization.
/// Used as an optimization within snapshot-relative deltas: fields matching
/// both the prior snapshot and the baseline are encoded as "still at
/// baseline" (1 bit) instead of "unchanged from prior" (field bytes).
/// This complements — does NOT replace — the concrete-snapshot-relative
/// delta model defined in replay-keyframes-analysis.md.
pub struct EntityBaseline {
    pub archetype: ArchetypeLabel,
    pub default_components: Vec<u8>,  // Serialized default state for this archetype
}
```

**Baseline registration:** Each game module registers baselines for its archetypes during initialization (e.g., "Allied Rifle Infantry" has default health=50, armor=None, speed=4). The baseline is frozen at game start — it never changes during play. Both sides (sender and receiver) derive the same baseline from the same game module data.

**Reconnection benefit:** When a reconnecting client receives a full `SimSnapshot` (not a delta), the baseline optimization has no role — the full snapshot is self-contained. Entity baselines reduce the *internal representation cost* of deltas used in replay keyframes and the autosave game-thread handoff, not the reconnection snapshot itself.

### Performance Impact by Use Case

| Use Case                          | Without Delta Encoding       | With Delta Encoding       | Notes                                                                                                                                                      |
| --------------------------------- | ---------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autosave (every 30s)              | ~300 KB game-thread snapshot | ~30 KB game-thread delta  | Game thread produces `SimCoreDelta` (~30 KB); I/O thread reconstructs full `SimSnapshot` for `.icsave` (~300 KB on disk). Savings are in game-thread cost. |
| Replay keyframe (every 300 ticks) | ~300 KB per keyframe         | ~30 KB per delta keyframe | 9 of every 10 keyframes are deltas; 1 is a full snapshot. Order stream is separate (~1 KB/s continuous).                                                   |
| Reconnection transfer             | ~300 KB full snapshot        | ~300 KB full snapshot     | Reconnection sends a full `SimSnapshot` (not a delta) — the client has no prior state. Entity baselines reduce internal encoding overhead only.            |
| Desync diagnosis                  | Full state dump              | Field-level diff          | Pinpoints exact divergence — diff two `SimCoreDelta`s at a known tick.                                                                                     |

### Benchmarks

```rust
#[bench] fn bench_delta_snapshot_1000_units()  { delta_bench(1000); }
#[bench] fn bench_delta_apply_1000_units()     { apply_delta_bench(1000); }
#[bench] fn bench_change_tracking_overhead()   { tracking_overhead_bench(); }
```

The change tracking overhead (maintaining `ChangeMask` bitfields via setter functions) is measured separately. Target: < 1% overhead on the movement system compared to direct field writes. The `#[derive(TrackChanges)]` macro generates setter functions that flip a bit — a single OR instruction per field write.

## Decision Record

### D015: Performance — Efficiency-First, Not Thread-First

**Decision:** Performance is achieved through algorithmic efficiency, cache-friendly data layout, adaptive workload, zero allocation, and amortized computation. Multi-core scaling is a bonus layer on top, not the foundation.

**Principle:** The engine must run a 500-unit battle smoothly on a 2-core, 4GB machine from 2012. Multi-core machines get higher unit counts as a natural consequence of the work-stealing scheduler.

**Inspired by:** Datadog Vector's pipeline efficiency, Tokio's work-stealing runtime, axum's zero-overhead request handling. These systems are fast because they waste nothing, not because they use more hardware.

### Memory Allocator Selection

The default Rust allocator (`System` — usually glibc `malloc` on Linux, MSVC allocator on Windows) is not optimized for game workloads with many small, short-lived allocations (pathfinding nodes, order processing, per-tick temporaries). Embark Studios' experience across multiple production Rust game projects shows measurable gains from specialized allocators. IC should benchmark with **jemalloc** (`tikv-jemallocator`) and **mimalloc** (`mimalloc-rs`) early in Phase 2 — Quilkin offers both as feature flags, confirming the pattern. This fits the efficiency pyramid: better algorithms first (levels 1-4), then allocator tuning (level 5) before reaching for parallelism (level 6). See `research/embark-studios-rust-gamedev-analysis.md` § Theme 6.

**Anti-pattern:** "Just parallelize it" as the answer to performance questions. Parallelism without algorithmic efficiency is like adding lanes to a highway with broken traffic lights.

## Cross-Document Performance Invariants

The following performance patterns are established across the design docs. They are not optional — violating them is a bug.

| Pattern                                                                        | Location                           | Rationale                                                                                                                                                     |
| ------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TickOrders::chronological()` uses scratch buffer                              | `03-NETCODE.md`                    | Zero per-tick heap allocation — reusable `Vec<&TimestampedOrder>` instead of `.clone()`                                                                       |
| `VersusTable` is a flat `[i32; COUNT]` array                                   | `02-ARCHITECTURE.md`               | O(1) combat damage lookup — no HashMap overhead in `projectile_system()` hot path                                                                             |
| `NotificationCooldowns` is a flat array                                        | `02-ARCHITECTURE.md`               | Same pattern — fixed enum → flat array                                                                                                                        |
| WASM AI API uses `u32` type IDs, not `String`                                  | `04-MODDING.md`                    | No per-tick String allocation across WASM boundary; string table queried once at game start                                                                   |
| Replay keyframes every 300 ticks (mandatory)                                   | `05-FORMATS.md`                    | Sub-second seeking without re-simulating from tick 0                                                                                                          |
| `gameplay_events` denormalized indexed columns                                 | `decisions/09e-community.md` D034  | Avoids `json_extract()` scans during `PlayerStyleProfile` aggregation (D042)                                                                                  |
| All SQLite writes on dedicated I/O thread                                      | `decisions/09e-community.md` D031  | Ring buffer → batch transaction; game loop thread never touches SQLite                                                                                        |
| I/O ring buffer ≥1024 entries                                                  | `decisions/09e-community.md` D031  | Absorbs 500 ms HDD checkpoint stall at 600 events/s peak with 3.4× headroom                                                                                   |
| WAL checkpoint suppressed during gameplay (HDD)                                | `decisions/09e-community.md` D034  | Random I/O checkpoint on spinning disk takes 200–500 ms; defer to safe points                                                                                 |
| Autosave fsync on I/O thread, never game thread                                | `decisions/09a-foundation.md` D010 | HDD fsync takes 50–200 ms; game thread produces SimCoreDelta + changed campaign/script state, I/O thread reconstructs full SimSnapshot for .icsave            |
| Replay keyframe: snapshot on game thread, LZ4+I/O on background                | `05-FORMATS.md`                    | ~1 ms game thread cost every 300 ticks; compression + write async                                                                                             |
| Weather quadrant rotation (1/4 map per tick)                                   | `decisions/09c-modding.md` D022    | Sim-only amortization — no camera dependency in deterministic sim                                                                                             |
| `gameplay.db` mmap capped at 64 MB                                             | `decisions/09e-community.md` D034  | 1.6% of 4 GB min-spec RAM; scaled up on systems with ≥8 GB                                                                                                    |
| WASM pathfinder fuel exhaustion → continue heading                             | `04-MODDING.md` D045               | Zero-cost fallback prevents unit freezing without breaking determinism                                                                                        |
| `StringInterner` resolves YAML strings to `InternedId` at load                 | `10-PERFORMANCE.md`                | Condition checks, trait aliases, mod paths — integer compare instead of string compare                                                                        |
| `DoubleBuffered<T>` for fog, influence maps, global modifiers                  | `02-ARCHITECTURE.md`               | Tick-consistent reads — all systems see same fog/modifier state within a tick                                                                                 |
| Connection lifecycle uses type state (`Connection<S>`)                         | `03-NETCODE.md`                    | Compile-time prevention of invalid state transitions — zero runtime cost via `PhantomData`                                                                    |
| Camera zoom/pan interpolation once per frame, not per entity                   | `02-ARCHITECTURE.md`               | Frame-rate-independent exponential lerp on `GameCamera` resource — `powf()` once per frame                                                                    |
| Global allocator: mimalloc (desktop/mobile), dlmalloc (WASM)                   | `10-PERFORMANCE.md`                | 5x faster than glibc for small objects; per-thread free lists for Bevy/rayon; MIT license                                                                     |
| CI allocation counting: `CountingAllocator<MiMalloc>`                          | `10-PERFORMANCE.md`                | Feature-gated wrapper asserts zero allocations per tick; catches hot-path regressions                                                                         |
| RAM Mode (default): zero disk writes during gameplay                           | `10-PERFORMANCE.md`                | All assets loaded to RAM pre-match; SQLite/replay/autosave buffered in RAM; flush at safe points only; storage resilience with cloud/community/local fallback |
| Pre-match heap allocation: all gameplay memory allocated during loading screen | `10-PERFORMANCE.md`                | `malloc` during `tick_system()` is a performance bug; CI benchmark tracks per-tick allocation count                                                           |
| In-memory SQLite during gameplay (`sqlite_in_memory_gameplay`)                 | `10-PERFORMANCE.md`                | gameplay.db runs as `:memory:` during match; serialized to disk at match end and flush points                                                                 |
