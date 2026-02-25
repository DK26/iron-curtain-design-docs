# 10 — Performance Philosophy & Strategy

## Core Principle: Efficiency, Not Brute Force

**Performance goal: a 2012 laptop with 2 cores and 4GB RAM runs a 500-unit battle smoothly. A modern machine handles 3000 units without sweating.**

We don't achieve this by throwing threads at the problem. We achieve it by wasting almost nothing — like Datadog Vector's pipeline or Tokio's runtime. Every cycle does useful work. Every byte of memory is intentional. Multi-core is a bonus that emerges naturally, not a crutch the engine depends on.

This is a first-class project goal and a primary differentiator over OpenRA.

**Keywords:** performance, efficiency-first, 2012 laptop target, 500 units, low-end hardware, Bevy/wgpu compatibility tiers, zero-allocation hot paths, ECS cache layout, simulation LOD, profiling

## The Efficiency Pyramid

Ordered by impact. Each layer works on a single core. Only the top layer requires multiple cores.

```
                    ┌──────────────┐
                    │ Work-stealing │  Bonus: scales to N cores
                    │ (rayon/Bevy)  │  (automatic, zero config)
                  ┌─┴──────────────┴─┐
                  │  Zero-allocation  │  No heap churn in hot paths
                  │  hot paths        │  (scratch buffers, reuse)
                ┌─┴──────────────────┴─┐
                │  Amortized work       │  Spread cost across ticks
                │  (staggered updates)  │  (1/4 of units per tick)
              ┌─┴──────────────────────┴─┐
              │  Simulation LOD           │  Skip work that doesn't
              │  (adaptive detail)        │  affect the outcome
            ┌─┴──────────────────────────┴─┐
            │  Cache-friendly ECS layout    │  Data access patterns
            │  (hot/warm/cold separation)   │  that respect the hardware
          ┌─┴──────────────────────────────┴─┐
          │  Algorithmic efficiency            │  Better algorithms beat
          │  (O(n) beats O(n²) on any CPU)    │  more cores every time
          └────────────────────────────────────┘
              ▲ MOST IMPACT — start here
```

## Layer 1: Algorithmic Efficiency

Better algorithms on one core beat bad algorithms on eight cores. This is where 90% of the performance comes from.

### Pathfinding: Multi-Layer Hybrid Replaces Per-Unit A* (RA1 `Pathfinder` Implementation)

The RA1 game module implements the `Pathfinder` trait with `IcPathfinder` — a multi-layer hybrid combining JPS, flow field tiles, and local avoidance (see `research/pathfinding-ic-default-design.md`). The gains come from multiple layers:

**JPS vs. A* (small groups, <8 units):** JPS (Jump Point Search) prunes symmetric paths that A* explores redundantly. On uniform-cost grids (typical of open terrain in RA), JPS explores 10–100× fewer nodes than A*.

**Flow field tiles vs. per-unit A* (mass movement, ≥8 units sharing destination):** When 50 units move to the same area, OpenRA computes 50 separate A* paths.

```
OpenRA (per-unit A*):
  50 units × ~200 nodes explored × ~10 ops/node = ~100,000 operations

Flow field tile:
  1 field × ~2000 cells × ~5 ops/cell              = ~10,000 operations
  50 units × 1 lookup each                          =       50 operations
  Total                                             = ~10,050 operations

10x reduction. No threading involved.
```

The 51st unit ordered to the same area costs zero — the field already exists. Flow field tiles amortize across all units sharing a destination. The adaptive threshold (configurable, default 8 units) ensures flow fields are only computed when the amortization benefit exceeds the generation cost.

**Hierarchical sector graph:** O(1) reachability check (flood-fill domain IDs) eliminates pathfinding for unreachable destinations entirely. Coarse sector-level routing reduces the search space for detailed pathfinding.

### Spatial Indexing: Grid Hash Replaces Brute-Force Range Checks (RA1 `SpatialIndex` Implementation)

"Which enemies are in range of this turret?"

```
Brute force: 1000 units × 1000 units = 1,000,000 distance checks/tick
Spatial hash: 1000 units × ~8 nearby   =     8,000 distance checks/tick

125x reduction. No threading involved.
```

A spatial hash divides the world into buckets. Each entity registers in its bucket. Range queries only check nearby buckets. O(1) lookup per bucket, O(k) per query where k is the number of nearby entities (typically < 20). The bucket size is a tunable parameter independent of any game grid — the same spatial hash structure works for grid-based and continuous-space games.

### Hierarchical Pathfinding: Coarse Then Fine

`IcPathfinder`'s Layer 2 breaks the map into ~32×32 cell sectors. Path between sectors first (few nodes, fast), then path within the current sector only. Most of the map is never pathfinded at all. Units approaching a new sector compute the next fine-grained path just before entering. Combined with JPS (Layer 3), this reduces pathfinding cost by orders of magnitude compared to flat A*.

## Layer 2: Cache-Friendly Data Layout

### ECS Archetype Storage (Bevy provides this)

```
OOP (cache-hostile, typical C# pattern):
  Unit objects on heap: [pos, health, vel, name, sprite, audio, ...]
  Iterating 1000 positions touches 1000 scattered memory locations
  Cache miss rate: high — each unit object spans multiple cache lines

ECS archetype storage (cache-friendly):
  Positions:  [p0, p1, p2, ... p999]   ← 8KB contiguous, fits in L1 cache
  Healths:    [h0, h1, h2, ... h999]   ← 4KB contiguous, fits in L1 cache
  Movement system reads positions sequentially → perfect cache utilization
```

1000 units × 8-byte positions = 8KB. L1 cache on any CPU since ~2008 is at least 32KB. The entire position array fits in L1. Movement for 1000 units runs from the fastest memory on the chip.

### Hot / Warm / Cold Separation

```
HOT (every tick, must be contiguous):
  Position (8B), Velocity (8B), Health (4B), SimLOD (1B), FogVisible (1B)
  → ~22 bytes per entity × 1000 = 22KB — fits in L1

WARM (some ticks, when relevant):
  Armament (16B), PathState (32B), BuildQueue (24B), HarvesterCargo (8B)
  → Separate archetype arrays, pulled into cache only when needed

COLD (rarely accessed, lives in Resources):
  UnitDef (name, icon, prereqs), SpriteSheet refs, AudioClip refs
  → Loaded once, referenced by ID, never iterated in hot loops
```

Design components to be small. A Position is 2 integers, not a struct with name, description, and sprite reference. The movement system pulls only positions and velocities — 16 bytes per entity, 16KB for 1000 units, pure L1.

## Layer 3: Simulation LOD (Adaptive Detail)

Not all units need full processing every tick. A harvester driving across an empty map with no enemies nearby doesn't need per-tick pathfinding, collision detection, or animation state updates.

```rust
pub enum SimLOD {
    /// Full processing: pathfinding, collision, precise targeting
    Full,
    /// Reduced: simplified pathing, broadphase collision only
    Reduced,
    /// Minimal: advance along pre-computed path, check arrival
    Minimal,
}

fn assign_sim_lod(
    unit_pos: WorldPos,
    in_combat: bool,
    near_enemy: bool,
    near_friendly_base: bool,  // deterministic — same on all clients
) -> SimLOD {
    if in_combat || near_enemy { SimLOD::Full }
    else if near_friendly_base { SimLOD::Reduced }
    else { SimLOD::Minimal }
}
```

**Determinism requirement:** LOD assignment must be based on game state (not camera position), so all clients assign the same LOD. "Near enemy" and "near base" are deterministic queries.

**Impact:** In a typical game, only 20-30% of units are in active combat at any moment. The other 70-80% use Reduced or Minimal processing. Effective per-tick cost drops proportionally.

## Layer 4: Amortized Work (Staggered Updates)

Expensive systems don't need to process all entities every tick. Spread the cost evenly.

```rust
fn pathfinding_system(
    tick: Res<CurrentTick>,
    query: Query<(Entity, &Position, &MoveTarget, &SimLOD), With<NeedsPath>>,
    pathfinder: Res<Box<dyn Pathfinder>>,  // D013/D045 trait seam
) {
    let group = tick.0 % 4;  // 4 groups, each updated every 4 ticks

    for (entity, pos, target, lod) in &query {
        let should_update = match lod {
            SimLOD::Full    => entity.index() % 4 == group,    // every 4 ticks
            SimLOD::Reduced => entity.index() % 8 == (group * 2) % 8,  // every 8 ticks
            SimLOD::Minimal => false,  // never replan, just follow existing path
        };

        if should_update {
            recompute_path(entity, pos, target, &*pathfinder);
        }
    }
}
```

**API note:** This is pseudocode for scheduling/amortization. The exact `Pathfinder` resource type depends on the game module's dispatch strategy (D013/D045). Hot-path batch queries should prefer caller-owned scratch (`*_into` APIs) over allocation-returning helpers.

**Result:** Pathfinding cost per tick drops 75% for Full-LOD units, 87.5% for Reduced, 100% for Minimal. Combined with SimLOD, a 1000-unit game might recompute ~50 paths per tick instead of 1000.

### Stagger Schedule

| System              | Full LOD      | Reduced LOD   | Minimal LOD         |
| ------------------- | ------------- | ------------- | ------------------- |
| Pathfinding replan  | Every 4 ticks | Every 8 ticks | Never (follow path) |
| Fog visibility      | Every tick    | Every 2 ticks | Every 4 ticks       |
| AI re-evaluation    | Every 2 ticks | Every 4 ticks | Every 8 ticks       |
| Collision detection | Every tick    | Every 2 ticks | Broadphase only     |

**Determinism preserved:** The stagger schedule is based on entity ID and tick number — deterministic on all clients.

### AI Computation Budget

AI runs on the same stagger/amortization principles as the rest of the sim. The default `PersonalityDrivenAi` (D043) uses a priority-based manager hierarchy where each manager runs on its own tick-gated schedule — cheap decisions run often, expensive decisions run rarely (pattern used by EA Generals, 0 A.D. Petra, and MicroRTS). Full architectural detail in D043 (`decisions/09d-gameplay.md`); survey analysis in `research/rts-ai-implementation-survey.md`.

| AI Component                   | Frequency             | Target Time | Approach                   |
| ------------------------------ | --------------------- | ----------- | -------------------------- |
| Harvester assignment           | Every 4 ticks         | < 0.1ms     | Nearest-resource lookup    |
| Defense response               | Every tick (reactive) | < 0.1ms     | Event-driven, not polling  |
| Unit production                | Every 8 ticks         | < 0.2ms     | Priority queue evaluation  |
| Building placement             | On demand             | < 1.0ms     | Influence map lookup       |
| Attack planning                | Every 30 ticks        | < 2.0ms     | Composition check + timing |
| Strategic reassessment         | Every 60 ticks        | < 5.0ms     | Full state evaluation      |
| **Total per tick (amortized)** |                       | **< 0.5ms** | **Budget for 500 units**   |

All AI working memory (influence maps, squad rosters, composition tallies, priority queues) is pre-allocated in `AiScratch` — analogous to `TickScratch` (Layer 5). Zero per-tick heap allocation. Influence maps are fixed-size arrays, cleared and rebuilt on their evaluation schedule. The `AiStrategy::tick_budget_hint()` method (D041) provides a hard microsecond cap — if the budget is exhausted mid-evaluation, the AI returns partial results and uses cached plans from the previous complete evaluation.

## Layer 5: Zero-Allocation Hot Paths

Heap allocation is expensive: the allocator touches cold memory, fragments the heap, and (in C#) creates GC pressure. Rust eliminates GC, but allocation itself still costs cache misses.

```rust
/// Pre-allocated scratch space reused every tick.
/// Initialized once at game start, never reallocated.
/// Pathfinder and SpatialIndex implementations maintain their own scratch buffers
/// internally — pathfinding scratch is not in this struct.
pub struct TickScratch {
    damage_events: Vec<DamageEvent>,       // capacity: 4096
    spatial_results: Vec<EntityId>,        // capacity: 2048 (reused by SpatialIndex queries)
    visibility_dirty: Vec<EntityId>,       // capacity: 1024 (entities needing fog update)
    validated_orders: Vec<ValidatedOrder>,  // capacity: 256
    combat_pairs: Vec<(Entity, Entity)>,   // capacity: 2048
}

impl TickScratch {
    fn reset(&mut self) {
        // .clear() sets length to 0 but keeps allocated memory
        // Zero bytes allocated on heap during the hot loop
        self.damage_events.clear();
        self.spatial_results.clear();
        self.visibility_dirty.clear();
        self.validated_orders.clear();
        self.combat_pairs.clear();
    }
}
```

**Per-tick allocation target: zero bytes.** All temporary data goes into pre-allocated scratch buffers. `clear()` resets without deallocating. The hot loop touches only warm memory.

This is a fundamental advantage of Rust over C# for games. Idiomatic C# allocates many small objects per tick (iterators, LINQ results, temporary collections, event args), each of which contributes to GC pressure. Our engine targets zero per-tick allocations.

### String Interning (Compile-Time Resolution for Runtime Strings)

IC is string-heavy by design — YAML keys, trait names, mod identifiers, weapon names, locomotor types, condition names, asset paths, Workshop package IDs. Comparing these strings at runtime (byte-by-byte, potentially cache-cold) in every tick is wasteful when the set of valid strings is known at load time.

**String interning** resolves all YAML/mod strings to integer IDs once during loading. All runtime comparisons use the integer — a single CPU instruction instead of a variable-length byte scan.

```rust
/// Interned string handle — 4 bytes, Copy, Eq is a single integer comparison.
/// Stable across save/load (the intern table is part of snapshot state, D010).
#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct InternedId(u32);

/// String intern table — built during YAML rule loading, immutable during gameplay.
/// Part of the sim snapshot for deterministic save/resume.
pub struct StringInterner {
    id_to_string: Vec<String>,                  // index → string (display, debug, serialization)
    string_to_id: HashMap<String, InternedId>,  // string → index (used at load time only)
}

impl StringInterner {
    /// Resolve a string to its interned ID. Called during YAML loading — never in hot paths.
    pub fn intern(&mut self, s: &str) -> InternedId {
        if let Some(&id) = self.string_to_id.get(s) {
            return id;
        }
        let id = InternedId(self.id_to_string.len() as u32);
        self.id_to_string.push(s.to_owned());
        self.string_to_id.insert(s.to_owned(), id);
        id
    }

    /// Look up the original string for display/debug. Not used in hot paths.
    pub fn resolve(&self, id: InternedId) -> &str {
        &self.id_to_string[id.0 as usize]
    }
}
```

**Where interning eliminates runtime string work:**

| System                             | Without interning                                       | With interning                                                                   |
| ---------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Condition checks (D028)            | String compare per condition per unit per tick          | `InternedId` == `InternedId` (1 instruction)                                     |
| Trait alias resolution (D023/D027) | HashMap lookup by string at rule evaluation             | Pre-resolved at load time to canonical `InternedId`                              |
| WASM mod API boundary              | String marshaling across host/guest (allocation + copy) | `u32` type IDs — already designed this way in `04-MODDING.md`                    |
| Mod stacking namespace (D062)      | String-keyed path lookups in the virtual namespace      | `InternedId`-keyed flat table                                                    |
| Versus table keys                  | Armor/weapon type strings per damage calculation        | `InternedId` indices into flat `[i32; N]` array (already done for `VersusTable`) |
| Notification dedup                 | String comparison for cooldown checks                   | `InternedId` comparison                                                          |

**Interning generalizes the `VersusTable` principle.** The `VersusTable` flat array (documented above in Layer 2) already converts armor/weapon type enums to integer indices for O(1) lookup. String interning extends this approach to *every* string-keyed system — conditions, traits, mod paths, asset names — without requiring hardcoded enums. The `VersusTable` uses compile-time enum indices; `StringInterner` provides the same benefit for data-driven strings loaded from YAML.

**What NOT to intern:** Player-facing display strings (chat messages, player names, localization text). These are genuinely dynamic and not used in hot-path comparisons. Interning targets the *engine vocabulary* — the fixed set of identifiers that YAML rules, conditions, and mod APIs reference repeatedly.

**Snapshot integration (D010):** The `StringInterner` is part of the sim snapshot. When saving/loading, the intern table serializes alongside game state, ensuring that `InternedId` values remain stable across save/resume. Replays record the intern table at keyframes. This is the same approach Factorio uses for its prototype string IDs — resolved once during data loading, stable for the session lifetime.

### Global Allocator: mimalloc

The engine uses **mimalloc** (Microsoft, MIT license) as the global allocator on desktop and mobile targets. WASM uses Rust's built-in dlmalloc (the default for `wasm32-unknown-unknown`).

**Why mimalloc:**

| Factor | mimalloc | System allocator | jemalloc |
|--------|----------|------------------|----------|
| Small-object speed | 5x faster than glibc | Baseline | Good but slower than mimalloc |
| Multi-threaded (Bevy/rayon) | Per-thread free lists, single-CAS cross-thread free | Contended on Linux | Good but higher RSS |
| Fragmentation (60+ min sessions) | Good (temporal cadence, periodic coalescing) | Varies by platform | Best, but not enough to justify trade-offs |
| RSS overhead | Low (~50% reduction vs glibc in some workloads) | Platform-dependent | Moderate (arena-per-thread) |
| Windows support | Native | Native | Weak (caveats) |
| WASM support | No | Yes (dlmalloc) | No |
| License | MIT | N/A | BSD 2-clause |

**Alternatives rejected:**
- **jemalloc:** Better fragmentation resistance but weaker Windows support, no WASM, higher RSS on many-core machines, slower for small objects (Bevy's dominant allocation pattern). Only advantage is profiling, which mimalloc's built-in stats + the counting wrapper replicate.
- **tcmalloc (Google):** Modern version is Linux-only. Does not meet cross-platform requirements.
- **rpmalloc (Embark Studios):** Viable but Embark wound down operations. Less community momentum. No WASM support.
- **System allocator:** 5x slower on Linux multi-threaded workloads. Unacceptable for Bevy's parallel ECS scheduling.

**Per-target allocator selection:**

| Target | Allocator | Rationale |
|--------|-----------|-----------|
| Windows / macOS / Linux | mimalloc | Best small-object perf, low RSS, native cross-platform |
| WASM | dlmalloc (Rust default) | Built-in, adequate for single-threaded WASM context |
| iOS / Android | mimalloc (fallback: system) | mimalloc builds for both; system is safe fallback if build issues arise |
| CI / Debug builds | `CountingAllocator<MiMalloc>` | Wraps mimalloc with per-tick allocation counting (feature-gated) |

**Implementation pattern:**

```rust
// ic-game/src/main.rs (or ic-app entry point)
#[cfg(not(target_arch = "wasm32"))]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;
// WASM targets fall through to Rust's default dlmalloc — no override needed.
```

**Allocation-counting wrapper for CI regression detection:**

In CI/debug builds (behind a `counting-allocator` feature flag), a thin wrapper around mimalloc tracks per-tick allocation counts:

```rust
/// Wraps the inner allocator with atomic counters.
/// Reset counters at tick boundary; assert both are 0 after tick_system() completes.
/// Enabled only in CI/debug builds via feature flag.
pub struct CountingAllocator<A: GlobalAlloc> {
    inner: A,
    alloc_count: AtomicU64,
    dealloc_count: AtomicU64,
}
```

This catches regressions where new code introduces heap allocations in the sim hot path. The benchmark `bench_tick_zero_allocations()` asserts that `alloc_count == 0` after a full tick with 1000 units — if it fails, someone added a heap allocation to a hot path.

**Why the allocator matters less than it seems for IC:** The sim (`ic-sim`) targets zero allocations during tick processing (Layer 5). The allocator's impact is primarily on the loading phase (asset parsing, ECS setup, mod compilation), Bevy internals (archetype storage, system scheduling, renderer), menu/UI, and networking buffers. None of these affect simulation determinism. The allocator is not deterministic (pointer values vary across runs), but since `ic-sim` performs zero allocations during ticks, this is irrelevant for lockstep determinism.

**mimalloc built-in diagnostics:** Enable via `MI_STAT=2` environment variable for per-thread allocation statistics, peak RSS, segment usage. Useful for profiling the loading phase and identifying memory bloat without external tools.

## Layer 6: Work-Stealing Parallelism (Bonus Scaling)

After layers 1-5, the engine is already fast on a single core. Parallelism scales it further on better hardware.

### How Bevy + rayon Work-Stealing Operates

Rayon (used internally by Bevy) creates exactly one thread per CPU core. No more, no less. Work is distributed via lock-free work-stealing queues:

```
2-core laptop:
  Thread 0: [pathfind units 0-499]
  Thread 1: [pathfind units 500-999]
  → Both busy, no waste

8-core desktop:
  Thread 0: [pathfind units 0-124]
  Thread 1: [pathfind units 125-249]
  ...
  Thread 7: [pathfind units 875-999]
  → All busy, 4x faster than laptop

16-core workstation:
  → Same code, 16 threads, even faster
  → No configuration change
```

No thread is ever idle if work exists. No thread is ever created or destroyed during gameplay. This is the Tokio/Vector model applied to CPU-bound game logic.

### Where Parallelism Actually Helps

Only systems where per-entity work is independent and costly:

```rust
// YES — pathfinding is expensive and independent per unit
fn pathfinding_system(query: Query<...>, pathfinder: Res<Box<dyn Pathfinder>>) {
    let results: Vec<_> = query.par_iter()
        .filter(|(_, _, _, lod)| lod.should_update_path(tick))
        .map(|(entity, pos, target, _)| {
            (entity, pathfinder.find_path(pos, &target.dest))
        })
        .collect();

    // Sort for determinism, then apply sequentially
    apply_sorted(results);
}

// NO — movement is cheap per unit, parallelism overhead not worth it
fn movement_system(mut query: Query<(&mut Position, &Velocity)>) {
    // Just iterate. Adding and subtracting integers.
    // Parallelism overhead would exceed the computation itself.
    for (mut pos, vel) in &mut query {
        pos.x += vel.dx;
        pos.y += vel.dy;
    }
}
```

**API note:** This parallel example illustrates where parallelism helps, not the exact final pathfinder interface. In IC, parallel work may happen either inside `IcPathfinder` or in a pathfinding system that batches deterministic requests/results through the selected `Pathfinder` implementation. In both cases, caller-owned scratch and deterministic result ordering still apply.

**Rule of thumb:** Only parallelize systems where per-entity work exceeds ~1 microsecond. Simple arithmetic on components is faster to iterate sequentially than to distribute.

## Performance Targets

| Metric                    | Weak Machine (2 core, 4GB) | Mid Machine (8 core, 16GB) | Strong Machine (16 core, 32GB) | Mobile (phone/tablet) | Browser (WASM)               |
| ------------------------- | -------------------------- | -------------------------- | ------------------------------ | --------------------- | ---------------------------- |
| Smooth battle size        | 500 units                  | 2000 units                 | 3000+ units                    | 200 units             | 300 units                    |
| Tick time budget          | 66ms (15 tps)              | 66ms (15 tps)              | 33ms (30 tps)                  | 66ms (15 tps)         | 66ms (15 tps)                |
| Actual tick time (target) | < 40ms                     | < 10ms                     | < 5ms                          | < 50ms                | < 40ms                       |
| Render framerate          | 60fps                      | 144fps                     | 240fps                         | 30fps                 | 60fps                        |
| RAM usage (1000 units)    | < 150MB                    | < 200MB                    | < 200MB                        | < 100MB               | < 100MB                      |
| Startup to menu           | < 3 seconds                | < 1 second                 | < 1 second                     | < 5 seconds           | < 8 seconds (incl. download) |
| Per-tick heap allocation  | 0 bytes                    | 0 bytes                    | 0 bytes                        | 0 bytes               | 0 bytes                      |

## Performance vs. C# RTS Engines (Projected)

*These are projected comparisons based on architectural analysis, not benchmarks. C# numbers are estimates for a typical C#/.NET single-threaded game loop with GC.*

| What                 | Typical C# RTS (e.g., OpenRA)                   | Our Engine                                   | Why                                     |
| -------------------- | ----------------------------------------------- | -------------------------------------------- | --------------------------------------- |
| 500 unit tick        | Estimated 30-60ms (single thread + GC spikes)   | ~8ms (algorithmic + cache)                   | Flowfields, spatial hash, ECS layout    |
| Memory per unit      | Estimated ~2-4KB (C# objects + GC metadata)     | ~200-400 bytes (ECS packed)                  | No GC metadata, no vtable, no boxing    |
| GC pause             | 5-50ms unpredictable spikes (C# characteristic) | 0ms (doesn't exist)                          | Rust ownership + zero-alloc hot paths   |
| Pathfinding 50 units | 50 × A* = ~2ms                                  | 1 flowfield + 50 lookups = ~0.1ms            | Algorithm change, not hardware change   |
| Memory fragmentation | Increases over game duration                    | Stable (pre-allocated pools)                 | Scratch buffers, no per-tick allocation |
| 2-core scaling       | 1x (single-threaded, verified for OpenRA)       | ~1.5x (work-stealing helps where applicable) | rayon adaptive                          |
| 8-core scaling       | 1x (single-threaded, verified for OpenRA)       | ~3-5x (diminishing returns on game logic)    | rayon work-stealing                     |

## Input Responsiveness vs. OpenRA

Beyond raw sim performance, input responsiveness is where players *feel* the difference. OpenRA's TCP lockstep model (verified: single-threaded game loop, static `OrderLatency`, all clients wait for slowest) freezes all players to wait for the slowest connection. Our relay model never stalls — late orders are dropped, not waited for.

*OpenRA numbers below are estimates based on architectural analysis of their source code, not benchmarks.*

| Factor                      | OpenRA (estimated)            | Iron Curtain                 | Why Faster                                |
| --------------------------- | ----------------------------- | ---------------------------- | ----------------------------------------- |
| Waiting for slowest client  | Yes — everyone freezes        | No — relay drops late orders | Relay owns the clock                      |
| Order batching interval     | Every N frames (configurable) | Every tick                   | Higher tick rate makes N=1 viable         |
| Tick processing time        | Estimated 30-60ms             | ~8ms                         | Algorithmic efficiency                    |
| Achievable tick rate        | ~15 tps                       | 30+ tps                      | 4x shorter lockstep window                |
| GC pauses during tick       | 5-50ms (C# characteristic)    | 0ms                          | Rust, zero-allocation                     |
| Visual feedback on click    | Waits for confirmation        | Immediate (cosmetic)         | Render-side prediction, no sim dependency |
| Single-player order delay   | ~66ms (1 projected frame)     | ~33ms (next tick at 30 tps)  | `LocalNetwork` = zero scheduling delay    |
| Worst-case MP click-to-move | Estimated 200-400ms           | 80-120ms (relay deadline)    | Fixed deadline, no hostage-taking         |

**Combined effect:** A single-player click-to-move that takes ~200ms in OpenRA (order latency + tick time + potential GC jank) should take ~33ms in Iron Curtain — imperceptible to human reaction time. Multiplayer improves from "at the mercy of the worst connection" to a fixed, predictable deadline.

See `03-NETCODE.md` § "Why It Feels Faster Than OpenRA" for the full architectural analysis, including visual prediction and single-player zero-delay.

## GPU & Hardware Compatibility (Bevy/wgpu Constraints)

Bevy renders via `wgpu`, which translates to native GPU APIs. This creates a **hardware floor** that interacts with our "2012 laptop" performance target.

### Compatibility Target Clarification (Original RA Spirit vs Modern Stack Reality)

The project goal is to support **very low-end hardware by modern standards** — especially machines with **no dedicated gaming GPU** (integrated graphics, office PCs, older laptops) — while preserving full gameplay. This matches the spirit of original Red Alert and OpenRA accessibility.

However, we should be explicit about the technical floor:

- **Literal 1996 Red Alert-era hardware is not a realistic runtime target** for a modern Rust + Bevy + `wgpu` engine.
- A **displayed game window still requires some graphics path** (integrated GPU, compatible driver, or OS-provided software rasterizer path).
- **Headless components** (relay server, tooling, some tests) remain fully usable without graphics acceleration because the sim/netcode do not depend on rendering.

In practice, the target is:

- **No dedicated GPU required** (integrated graphics should work)
- **Baseline tier must remain fully playable**
- **3D render modes and advanced Bevy visual features are optional and may be hidden/disabled automatically**

If the OS/driver stack exposes a software backend (e.g., platform software rasterizer implementations), IC may run as a **best-effort** fallback, but this is not the primary performance target and should be clearly labeled as unsupported for competitive play.

### wgpu Backend Matrix

| Backend | Min API Version   | Typical GPU Era                              | wgpu Support Level           |
| ------- | ----------------- | -------------------------------------------- | ---------------------------- |
| Vulkan  | 1.0+              | 2016+ (discrete), 2014+ (integrated Haswell) | First-class                  |
| DX12    | Windows 10        | 2015+                                        | First-class                  |
| Metal   | macOS 10.14       | 2018+ Macs                                   | First-class                  |
| OpenGL  | GL 3.3+ / ES 3.0+ | 2010+                                        | **Downlevel / best-effort**  |
| WebGPU  | Modern browsers   | 2023+                                        | First-class                  |
| WebGL2  | ES 3.0 equiv      | Most browsers                                | **Downlevel, severe limits** |

### The 2012 Laptop Problem

A typical 2012 laptop has an **Intel HD 4000** (Ivy Bridge). This GPU supports OpenGL 4.0 but **has no Vulkan driver**. It falls back to wgpu's GL 3.3 backend, which is downlevel — meaning reduced resource limits:

| Resource                  | Vulkan/DX12 (WebGPU defaults) | GL 3.3 Downlevel | WebGL2        |
| ------------------------- | ----------------------------- | ---------------- | ------------- |
| Max texture dimension     | 8192×8192                     | **2048×2048**    | **2048×2048** |
| Storage buffers per stage | 8                             | **4**            | **0**         |
| Uniform buffer size       | 64 KiB                        | **16 KiB**       | **16 KiB**    |
| Compute shaders           | Yes                           | GL 4.3+ only     | **None**      |
| Color attachments         | 8                             | **4**            | **4**         |
| Storage textures          | 4                             | 4                | **0**         |

### Impact on Our Feature Plans

| Feature                        | Problem on Downlevel Hardware                                        | Severity | Mitigation                                        |
| ------------------------------ | -------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| GPU particle weather           | Compute shaders needed; HD 4000 has GL 4.0, compute needs 4.3        | High     | CPU particle fallback (Tier 0)                    |
| Shader terrain blending (D022) | Complex fragment shaders + texture arrays hit uniform/sampler limits | Medium   | Palette tinting fallback (zero extra resources)   |
| Post-processing chain          | Bloom, color grading, SSR need MRT + decent fill rate                | Medium   | Disable post-FX on Tier 0                         |
| Dynamic lighting               | Multiple render targets, shadow maps                                 | Medium   | Static baked lighting on Tier 0                   |
| HD sprite sheets               | 2048px max texture on downlevel                                      | Low      | Split sprite sheets at asset build time           |
| WebGL2/WASM visuals            | Zero compute, zero storage buffers, no GPU particles                 | High     | Target WebGPU-only for browser (or accept limits) |
| Simulation / ECS               | **No impact** — pure CPU, no GPU dependency                          | None     | —                                                 |
| Audio / Networking / Modding   | **No impact** — none touch the GPU                                   | None     | —                                                 |

**Key insight:** The "2012 laptop" target is achievable for the **simulation** (500 units, < 40ms tick) because the sim is pure CPU. The **rendering** must degrade gracefully — reduced visual effects, not broken gameplay.

**Design rule:** Advanced Bevy features (3D view, heavy post-FX, compute-driven particles, dynamic lighting pipelines) are optional layers on top of the classic sprite renderer. Their absence must never block normal gameplay.

### Render Quality Tiers

`ic-render` queries device capabilities at startup via wgpu's adapter limits and selects a render tier stored in the `RenderSettings` resource. All tiers produce an identical, playable game — they differ only in visual richness.

| Tier | Name         | Target Hardware                              | GPU Particles | Post-FX       | Weather Visuals       | Dynamic Lighting          | Texture Limits |
| ---- | ------------ | -------------------------------------------- | ------------- | ------------- | --------------------- | ------------------------- | -------------- |
| 0    | **Baseline** | GL 3.3 (Intel HD 4000), WebGL2               | CPU fallback  | None          | Palette tinting       | None (baked)              | 2048×2048 max  |
| 1    | **Standard** | Vulkan/DX12 basic (Intel HD 5000+, GTX 600+) | GPU compute   | Basic (bloom) | Overlay sprites       | Point lights              | 8192×8192      |
| 2    | **Enhanced** | Vulkan/DX12 capable (GTX 900+, RX 400+)      | GPU compute   | Full chain    | Shader blending       | Full + shadows            | 8192×8192      |
| 3    | **Ultra**    | High-end desktop                             | GPU compute   | Full + SSR    | Shader + accumulation | Dynamic + cascade shadows | 16384×16384    |

**Tier selection is automatic but overridable.** Detected at startup from `wgpu::Adapter::limits()` and `wgpu::Adapter::features()`. Players can force a lower tier in settings. Mods can ship tier-specific assets.

```rust
/// ic-render: runtime render configuration (Bevy Resource)
///
/// Every field here is a tweakable parameter. The engine auto-detects defaults
/// from hardware at startup, but players can override ANY field via config.toml,
/// the in-game settings menu, or `/set render.*` console commands (D058).
/// All fields are hot-reloadable — changes take effect next frame, no restart needed.
pub struct RenderSettings {
    // === Core tier & frame pacing ===
    pub tier: RenderTier,                       // Auto-detected or user-forced
    pub fps_cap: FpsCap,                        // V30, V60, V144, V240, Uncapped
    pub vsync: VsyncMode,                       // Off, On, Adaptive, Mailbox
    pub resolution_scale: f32,                  // 0.5–2.0 (render resolution vs display)

    // === Anti-aliasing ===
    pub msaa: MsaaSamples,                      // Off, X2, X4 (maps to Bevy Msaa resource)
    pub smaa: Option<SmaaPreset>,               // None, Low, Medium, High, Ultra (Bevy SMAA)
    // MSAA and SMAA are mutually exclusive — if SMAA is Some, MSAA should be Off.

    // === Post-processing chain ===
    pub post_fx_enabled: bool,                  // Master toggle for ALL post-processing
    pub bloom: Option<BloomConfig>,             // None = disabled; Some = Bevy Bloom component
    pub tonemapping: TonemappingMode,           // None, Reinhard, ReinhardLuminance, TonyMcMapface, ...
    pub deband_dither: bool,                    // Bevy DebandDither — eliminates color banding
    pub contrast: f32,                          // 0.8–1.2 (1.0 = neutral)
    pub brightness: f32,                        // 0.8–1.2 (1.0 = neutral)
    pub gamma: f32,                             // 1.8–2.6 (2.2 = standard sRGB)

    // === Lighting & shadows ===
    pub dynamic_lighting: bool,                 // Enable/disable dynamic point/spot lights
    pub shadows_enabled: bool,                  // Master shadow toggle
    pub shadow_quality: ShadowQuality,          // Off, Low (512), Medium (1024), High (2048), Ultra (4096)
    pub shadow_filter: ShadowFilterMethod,      // Hardware2x2, Gaussian, Temporal (maps to Bevy enum)
    pub cascade_shadow_count: u32,              // 1–4 (directional light cascades)
    pub ambient_occlusion: Option<AoConfig>,    // None or SSAO settings (Bevy SSAO)

    // === Particles & weather ===
    pub particle_density: f32,                  // 0.0–1.0 (scales particle spawn rates)
    pub particle_backend: ParticleBackend,      // Cpu, Gpu (auto from tier, overridable)
    pub weather_visual_mode: WeatherVisualMode, // PaletteTint, Overlay, ShaderBlend

    // === Textures & sprites ===
    pub sprite_sheet_max: u32,                  // Derived from adapter texture limits
    pub texture_filtering: TextureFiltering,    // Nearest (pixel-perfect), Bilinear, Trilinear
    pub anisotropic_filtering: u8,              // 1, 2, 4, 8, 16 (1 = off)

    // === Camera & view ===
    pub fov_override: Option<f32>,              // None = default isometric; Some = custom (for 3D render modes)
    pub camera_smoothing: bool,                 // Interpolated camera movement between ticks
}

pub enum RenderTier {
    Baseline,   // Tier 0: GL 3.3 / WebGL2 — functional but plain
    Standard,   // Tier 1: Basic Vulkan/DX12 — GPU particles, basic post-FX
    Enhanced,   // Tier 2: Capable GPU — full visual pipeline
    Ultra,      // Tier 3: High-end — everything maxed
}

pub enum FpsCap { V30, V60, V144, V240, Uncapped }
pub enum VsyncMode { Off, On, Adaptive, Mailbox }
pub enum MsaaSamples { Off, X2, X4 }
pub enum SmaaPreset { Low, Medium, High, Ultra }
pub enum ShadowQuality { Off, Low, Medium, High, Ultra }
pub enum ShadowFilterMethod { Hardware2x2, Gaussian, Temporal }
pub enum ParticleBackend { Cpu, Gpu }
pub enum TextureFiltering { Nearest, Bilinear, Trilinear }

pub struct BloomConfig {
    pub intensity: f32,             // 0.0–1.0 (Bevy Bloom::intensity)
    pub low_frequency_boost: f32,   // 0.0–1.0
    pub threshold: f32,             // HDR brightness threshold for bloom
    pub knee: f32,                  // Soft knee for threshold transition
}

pub struct AoConfig {
    pub quality: AoQuality,         // Low (4 samples), Medium (8), High (16), Ultra (32)
    pub radius: f32,                // World-space AO radius
    pub intensity: f32,             // 0.0–2.0
}

pub enum AoQuality { Low, Medium, High, Ultra }

/// Maps Bevy's tonemapping algorithms to player-friendly names.
/// See Bevy's Tonemapping enum — we expose all of them.
pub enum TonemappingMode {
    None,                   // Raw HDR → clamp (only for debugging)
    Reinhard,               // Simple, classic
    ReinhardLuminance,      // Luminance-preserving Reinhard
    AcesFitted,             // Film industry standard
    AgX,                    // Blender's default — good highlight handling
    TonyMcMapface,          // Bevy's recommended default — best overall
    SomewhatBoringDisplayTransform, // Neutral, minimal artistic bias
}
```

**Bevy component mapping:** Every field in `RenderSettings` maps to a Bevy component or resource. The `RenderSettingsSync` system (runs in `PostUpdate`) reads changes and applies them:

| `RenderSettings` field | Bevy Component / Resource | Notes |
|---|---|---|
| `msaa` | `Msaa` (global resource) | Set to `Off` when SMAA is active |
| `smaa` | `Smaa` (camera component) | Added/removed on camera entity |
| `bloom` | `Bloom` (camera component) | Added/removed; fields map 1:1 |
| `tonemapping` | `Tonemapping` (camera component) | Enum variant maps directly |
| `deband_dither` | `DebandDither` (camera component) | `Enabled` / `Disabled` |
| `shadow_filter` | `ShadowFilteringMethod` (camera component) | `Hardware2x2`, `Gaussian`, `Temporal` |
| `ambient_occlusion` | `ScreenSpaceAmbientOcclusion` (camera component) | Added/removed with quality settings |
| `vsync` | `WinitSettings` / `PresentMode` | Requires window recreation for some modes |
| `fps_cap` | Frame limiter system (custom) | `thread::sleep` or Bevy `FramepacePlugin` |
| `resolution_scale` | Render target size override | Renders to smaller target, upscales |
| `dynamic_lighting` | Point/spot light entity visibility | Toggles `Visibility` on light entities |
| `shadows_enabled` | `DirectionalLight.shadows_enabled` | Per-light shadow toggle |
| `shadow_quality` | `DirectionalLightShadowMap.size` | 512 / 1024 / 2048 / 4096 |

### Auto-Detection Algorithm

At startup, `ic-render` probes the GPU via `wgpu::Adapter` and selects the best render tier. The algorithm is deterministic — same hardware always gets the same tier. Players override via `config.toml` or the settings menu.

```rust
/// Probes GPU capabilities and returns the appropriate render tier.
/// Called once at startup. Result is stored in RenderSettings and persisted
/// to config.toml on first run (so subsequent launches skip probing).
pub fn detect_render_tier(adapter: &wgpu::Adapter) -> RenderTier {
    let limits = adapter.limits();
    let features = adapter.features();
    let info = adapter.get_info();

    // Step 1: Check for hard floor — can we run at all?
    // wgpu already enforces DownlevelCapabilities; if we got an adapter, we're at least GL 3.3.

    // Step 2: Classify by feature support (most restrictive wins)
    let has_compute = features.contains(wgpu::Features::default()); // Compute is in default feature set
    let has_storage_buffers = limits.max_storage_buffers_per_shader_stage >= 4;
    let has_large_textures = limits.max_texture_dimension_2d >= 8192;
    let has_depth_clip = features.contains(wgpu::Features::DEPTH_CLIP_CONTROL);
    let has_timestamp_query = features.contains(wgpu::Features::TIMESTAMP_QUERY);
    let vram_mb = estimate_vram(&info); // Heuristic from adapter name + backend hints

    // Step 3: Tier assignment (ordered from highest to lowest)
    if has_compute && has_large_textures && has_depth_clip && vram_mb >= 4096 {
        RenderTier::Ultra
    } else if has_compute && has_large_textures && has_storage_buffers && vram_mb >= 2048 {
        RenderTier::Enhanced
    } else if has_compute && has_storage_buffers {
        RenderTier::Standard
    } else {
        RenderTier::Baseline  // GL 3.3 / WebGL2 — everything still works
    }
}

/// Builds a complete RenderSettings from the detected tier.
/// Each tier implies sensible defaults for ALL parameters.
/// These are the "factory defaults" — config.toml overrides take priority.
pub fn default_settings_for_tier(tier: RenderTier) -> RenderSettings {
    match tier {
        RenderTier::Baseline => RenderSettings {
            tier,
            fps_cap: FpsCap::V60,
            vsync: VsyncMode::On,
            resolution_scale: 1.0,
            msaa: MsaaSamples::Off,
            smaa: None,
            post_fx_enabled: false,
            bloom: None,
            tonemapping: TonemappingMode::None,
            deband_dither: false,
            contrast: 1.0, brightness: 1.0, gamma: 2.2,
            dynamic_lighting: false,
            shadows_enabled: false,
            shadow_quality: ShadowQuality::Off,
            shadow_filter: ShadowFilterMethod::Hardware2x2,
            cascade_shadow_count: 0,
            ambient_occlusion: None,
            particle_density: 0.3,
            particle_backend: ParticleBackend::Cpu,
            weather_visual_mode: WeatherVisualMode::PaletteTint,
            sprite_sheet_max: 2048,
            texture_filtering: TextureFiltering::Nearest,
            anisotropic_filtering: 1,
            fov_override: None,
            camera_smoothing: true,
        },
        RenderTier::Standard => RenderSettings {
            tier,
            fps_cap: FpsCap::V60,
            vsync: VsyncMode::On,
            resolution_scale: 1.0,
            msaa: MsaaSamples::X2,
            smaa: None,
            post_fx_enabled: true,
            bloom: Some(BloomConfig { intensity: 0.15, low_frequency_boost: 0.5, threshold: 1.0, knee: 0.1 }),
            tonemapping: TonemappingMode::TonyMcMapface,
            deband_dither: true,
            contrast: 1.0, brightness: 1.0, gamma: 2.2,
            dynamic_lighting: true,
            shadows_enabled: false,
            shadow_quality: ShadowQuality::Off,
            shadow_filter: ShadowFilterMethod::Gaussian,
            cascade_shadow_count: 0,
            ambient_occlusion: None,
            particle_density: 0.6,
            particle_backend: ParticleBackend::Gpu,
            weather_visual_mode: WeatherVisualMode::Overlay,
            sprite_sheet_max: 8192,
            texture_filtering: TextureFiltering::Bilinear,
            anisotropic_filtering: 4,
            fov_override: None,
            camera_smoothing: true,
        },
        RenderTier::Enhanced => RenderSettings {
            tier,
            fps_cap: FpsCap::V144,
            vsync: VsyncMode::Adaptive,
            resolution_scale: 1.0,
            msaa: MsaaSamples::Off,
            smaa: Some(SmaaPreset::High),
            post_fx_enabled: true,
            bloom: Some(BloomConfig { intensity: 0.2, low_frequency_boost: 0.6, threshold: 0.8, knee: 0.15 }),
            tonemapping: TonemappingMode::TonyMcMapface,
            deband_dither: true,
            contrast: 1.0, brightness: 1.0, gamma: 2.2,
            dynamic_lighting: true,
            shadows_enabled: true,
            shadow_quality: ShadowQuality::High,
            shadow_filter: ShadowFilterMethod::Gaussian,
            cascade_shadow_count: 2,
            ambient_occlusion: Some(AoConfig { quality: AoQuality::Medium, radius: 1.0, intensity: 1.0 }),
            particle_density: 0.8,
            particle_backend: ParticleBackend::Gpu,
            weather_visual_mode: WeatherVisualMode::ShaderBlend,
            sprite_sheet_max: 8192,
            texture_filtering: TextureFiltering::Trilinear,
            anisotropic_filtering: 8,
            fov_override: None,
            camera_smoothing: true,
        },
        RenderTier::Ultra => RenderSettings {
            tier,
            fps_cap: FpsCap::V240,
            vsync: VsyncMode::Mailbox,
            resolution_scale: 1.0,
            msaa: MsaaSamples::Off,
            smaa: Some(SmaaPreset::Ultra),
            post_fx_enabled: true,
            bloom: Some(BloomConfig { intensity: 0.25, low_frequency_boost: 0.7, threshold: 0.6, knee: 0.2 }),
            tonemapping: TonemappingMode::TonyMcMapface,
            deband_dither: true,
            contrast: 1.0, brightness: 1.0, gamma: 2.2,
            dynamic_lighting: true,
            shadows_enabled: true,
            shadow_quality: ShadowQuality::Ultra,
            shadow_filter: ShadowFilterMethod::Temporal,
            cascade_shadow_count: 4,
            ambient_occlusion: Some(AoConfig { quality: AoQuality::Ultra, radius: 1.5, intensity: 1.2 }),
            particle_density: 1.0,
            particle_backend: ParticleBackend::Gpu,
            weather_visual_mode: WeatherVisualMode::ShaderBlend,
            sprite_sheet_max: 16384,
            texture_filtering: TextureFiltering::Trilinear,
            anisotropic_filtering: 16,
            fov_override: None,
            camera_smoothing: true,
        },
    }
}
```

### Hardware-Specific Auto-Configuration Profiles

Beyond tier detection, the engine recognizes specific hardware families and applies targeted overrides on top of the tier defaults. These are **refinements, not replacements** — tier detection runs first, then hardware-specific tweaks adjust individual parameters.

| Hardware Signature | Detected Via | Base Tier | Overrides Applied |
|---|---|---|---|
| **Intel HD 4000** (Ivy Bridge) | `adapter_info.name` contains "HD 4000" or "Ivy Bridge" | Baseline | `particle_density: 0.2`, `camera_smoothing: false` (save CPU) |
| **Intel HD 5000–6000** (Haswell/Broadwell) | `adapter_info.name` match | Standard | `shadow_quality: Off`, `bloom: None` (iGPU bandwidth limited) |
| **Intel UHD 620–770** (modern iGPU) | `adapter_info.name` match | Standard | `shadow_quality: Low`, `particle_density: 0.5` |
| **Steam Deck** (AMD Van Gogh) | `adapter_info.name` contains "Van Gogh" or env `SteamDeck=1` | Enhanced | `fps_cap: V30`, `resolution_scale: 0.75`, `shadow_quality: Medium`, `smaa: Medium`, `ambient_occlusion: None` (battery + thermal) |
| **GTX 600–700** (Kepler) | `adapter_info.name` match | Standard | Default Standard (no overrides) |
| **GTX 900 / RX 400** (Maxwell/Polaris) | `adapter_info.name` match | Enhanced | Default Enhanced (no overrides) |
| **RTX 2000+ / RX 5000+** | `adapter_info.name` match | Ultra | Default Ultra (no overrides) |
| **Apple M1** | `adapter_info.backend == Metal` + name match | Enhanced | `vsync: On` (Metal VSync is efficient), `anisotropic_filtering: 16` |
| **Apple M2+** | `adapter_info.backend == Metal` + name match | Ultra | Same Metal-specific tweaks |
| **WebGPU (browser)** | `adapter_info.backend == BrowserWebGpu` | Standard | `fps_cap: V60`, `resolution_scale: 0.8`, `ambient_occlusion: None` (WASM overhead) |
| **WebGL2 (browser fallback)** | `adapter_info.backend == Gl` + WASM target | Baseline | `particle_density: 0.15`, `texture_filtering: Nearest` |
| **Mobile (Android/iOS)** | Platform detection | Standard | `fps_cap: V30`, `resolution_scale: 0.7`, `shadows_enabled: false`, `bloom: None`, `particle_density: 0.3` (battery + thermals) |

```rust
/// Hardware-specific refinements applied after tier detection.
/// Matches adapter name patterns and platform signals to fine-tune defaults.
pub fn apply_hardware_overrides(
    settings: &mut RenderSettings,
    adapter_info: &wgpu::AdapterInfo,
    platform: &PlatformInfo,
) {
    let name = adapter_info.name.to_lowercase();

    // Steam Deck: capable GPU but battery-constrained handheld
    if name.contains("van gogh") || platform.env_var("SteamDeck") == Some("1") {
        settings.fps_cap = FpsCap::V30;
        settings.resolution_scale = 0.75;
        settings.shadow_quality = ShadowQuality::Medium;
        settings.smaa = Some(SmaaPreset::Medium);
        settings.ambient_occlusion = None;
        return;
    }

    // Mobile: aggressive power saving
    if platform.is_mobile() {
        settings.fps_cap = FpsCap::V30;
        settings.resolution_scale = 0.7;
        settings.shadows_enabled = false;
        settings.bloom = None;
        settings.particle_density = 0.3;
        return;
    }

    // Browser (WASM): overhead budget
    if platform.is_wasm() {
        settings.fps_cap = FpsCap::V60;
        settings.resolution_scale = 0.8;
        settings.ambient_occlusion = None;
        if adapter_info.backend == wgpu::Backend::Gl {
            // WebGL2 fallback — severe constraints
            settings.particle_density = 0.15;
            settings.texture_filtering = TextureFiltering::Nearest;
        }
        return;
    }

    // Intel integrated GPUs: bandwidth-constrained
    if name.contains("hd 4000") || name.contains("ivy bridge") {
        settings.particle_density = 0.2;
        settings.camera_smoothing = false;
    } else if name.contains("hd 5") || name.contains("hd 6") || name.contains("haswell") {
        settings.shadow_quality = ShadowQuality::Off;
        settings.bloom = None;
    } else if name.contains("uhd") {
        settings.shadow_quality = ShadowQuality::Low;
        settings.particle_density = 0.5;
    }

    // Apple Silicon: Metal-specific optimizations
    if adapter_info.backend == wgpu::Backend::Metal {
        settings.vsync = VsyncMode::On; // Metal VSync is very efficient
        settings.anisotropic_filtering = 16;
    }
}
```

### Settings Load Order & Override Precedence

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │ 1. wgpu::Adapter probe → detect_render_tier()                      │
 │ 2. default_settings_for_tier(tier) → factory defaults               │
 │ 3. apply_hardware_overrides() → device-specific tweaks              │
 │ 4. Load config.toml [render] → user's saved preferences             │
 │ 5. Load config.<game_module>.toml [render] → game-specific overrides│
 │ 6. Command-line args (--render-tier=baseline, --fps-cap=30)         │
 │ 7. In-game /set render.* commands (D058) → runtime tweaks           │
 └─────────────────────────────────────────────────────────────────────┘
 Each layer overrides only the fields it specifies.
 Unspecified fields inherit from the previous layer.
 /set commands persist back to config.toml via toml_edit (D067).
```

**First-run experience:** On first launch, the engine runs full auto-detection (steps 1-3), persists the result to `config.toml`, and shows a brief "Graphics configured for your hardware — [Your GPU Name] / [Tier Name]" notification. The settings menu is one click away for tweaking. Subsequent launches skip detection and load from `config.toml` (step 4), unless the GPU changes (adapter name mismatch triggers re-detection).

### Full `config.toml` `[render]` Section

The complete render configuration as persisted to `config.toml` (D067). Every field maps 1:1 to `RenderSettings`. Comments are preserved by `toml_edit` across engine updates.

```toml
# config.toml — [render] section (auto-generated on first run, fully editable)
# Delete this section to trigger re-detection on next launch.

[render]
tier = "enhanced"                   # "baseline", "standard", "enhanced", "ultra", or "auto"
                                    # "auto" = re-detect every launch (useful for laptops with eGPU)
fps_cap = 144                       # 30, 60, 144, 240, 0 (0 = uncapped)
vsync = "adaptive"                  # "off", "on", "adaptive", "mailbox"
resolution_scale = 1.0              # 0.5–2.0 (below 1.0 = render at lower res, upscale)

[render.anti_aliasing]
msaa = "off"                        # "off", "2x", "4x"
smaa = "high"                       # "off", "low", "medium", "high", "ultra"
# MSAA and SMAA are mutually exclusive. If both are set, SMAA wins and MSAA is forced off.

[render.post_fx]
enabled = true                      # Master toggle — false disables everything below
bloom_intensity = 0.2               # 0.0–1.0 (0.0 = bloom off)
bloom_threshold = 0.8               # HDR brightness threshold
tonemapping = "tony_mcmapface"      # "none", "reinhard", "reinhard_luminance", "aces_fitted",
                                    # "agx", "tony_mcmapface", "somewhat_boring_display_transform"
deband_dither = true                # Eliminates color banding in gradients
contrast = 1.0                      # 0.8–1.2
brightness = 1.0                    # 0.8–1.2
gamma = 2.2                         # 1.8–2.6

[render.lighting]
dynamic = true                      # Enable dynamic point/spot lights
shadows = true                      # Master shadow toggle
shadow_quality = "high"             # "off", "low" (512), "medium" (1024), "high" (2048), "ultra" (4096)
shadow_filter = "gaussian"          # "hardware_2x2", "gaussian", "temporal"
cascade_count = 2                   # 1–4 (directional light shadow cascades)
ambient_occlusion = true            # SSAO on/off
ao_quality = "medium"               # "low", "medium", "high", "ultra"
ao_radius = 1.0                     # World-space radius
ao_intensity = 1.0                  # 0.0–2.0

[render.particles]
density = 0.8                       # 0.0–1.0 (scales spawn rates globally)
backend = "gpu"                     # "cpu", "gpu" (cpu = forced CPU fallback)

[render.weather]
visual_mode = "shader_blend"        # "palette_tint", "overlay", "shader_blend"

[render.textures]
filtering = "trilinear"             # "nearest" (pixel-perfect), "bilinear", "trilinear"
anisotropic = 8                     # 1, 2, 4, 8, 16 (1 = off)

[render.camera]
smoothing = true                    # Interpolated camera movement between sim ticks
# fov_override is only used by 3D render modes (D048), not the default isometric view
# fov_override = 60.0              # Uncomment for custom FOV in 3D mode
```

### Mitigation Strategies

1. **CPU particle fallback:** Bevy supports CPU-side particle emission. Lower particle count but functional. Weather rain/snow works on Tier 0 — just fewer particles.

2. **Sprite sheet splitting:** The asset pipeline (Phase 0, `ra-formats`) splits large sprite sheets into 2048×2048 chunks at build time when targeting downlevel. Zero runtime cost — the splitting is a bake step.

3. **WebGPU-first browser strategy:** WebGPU is supported in Chrome, Edge, and Firefox (2023+). Rather than maintaining a severely limited WebGL2 fallback, target WebGPU for the browser build (Phase 7) and document WebGL2 as best-effort.

4. **Graceful detection, not crashes:** If the GPU doesn't meet even Tier 0 requirements, show a clear error message with hardware info and suggest driver updates. Never crash with a raw wgpu error.

5. **Shader complexity budget:** All shaders must compile on GL 3.3 (or have a GL 3.3 variant). Complex shaders (terrain blending, weather) provide simplified fallback paths via `#ifdef` or shader permutations.

### Hardware Floor Summary

| Concern    | Our Minimum                                         | Notes                                               |
| ---------- | --------------------------------------------------- | --------------------------------------------------- |
| GPU API    | OpenGL 3.3 (fallback) / Vulkan 1.0 (preferred)      | wgpu auto-selects best available backend            |
| GPU memory | 256 MB                                              | Classic RA sprites are tiny; HD sprites need more   |
| OS         | Windows 7 SP1+ / macOS 10.14+ / Linux (X11/Wayland) | DX12 requires Windows 10; GL 3.3 works on 7         |
| CPU        | 2 cores, SSE2                                       | Sim runs fine; Bevy itself needs ~2 threads minimum |
| RAM        | 4 GB                                                | Engine targets < 150 MB for 1000 units              |
| Disk       | ~500 MB                                             | Engine + classic assets; HD assets add ~1-2 GB      |

**Bottom line:** Bevy/wgpu will run on 2012 hardware, but **visual features must tier down automatically.** The sim is completely unaffected. The architecture already has `RenderSettings` — we formalize it into the tier system above.

---

## Profiling & Regression Strategy

### Automated Benchmarks (CI)

```rust
#[bench] fn bench_tick_100_units()  { tick_bench(100); }
#[bench] fn bench_tick_500_units()  { tick_bench(500); }
#[bench] fn bench_tick_1000_units() { tick_bench(1000); }
#[bench] fn bench_tick_2000_units() { tick_bench(2000); }

#[bench] fn bench_flowfield_generation() { ... }
#[bench] fn bench_spatial_query_1000() { ... }
#[bench] fn bench_fog_recalc_full_map() { ... }

#[bench] fn bench_snapshot_1000_units() { ... }
#[bench] fn bench_restore_1000_units() { ... }
```

### Regression Rule

CI fails if any benchmark regresses > 10% from the rolling average. Performance is a ratchet — it only goes up.

### Engine Telemetry (D031)

Per-system tick timing from the benchmark suite can be exported as OTEL metrics for deeper analysis when the `telemetry` feature flag is enabled. This bridges offline benchmarks with live system inspection:

- Per-system execution time histograms (`sim.system.<name>_us`)
- Entity count gauges, pathfinding cache hit rates, memory usage
- Gameplay event stream for AI training data collection
- Debug overlay (via `bevy_egui`) reads live telemetry for real-time profiling during development

Telemetry is zero-cost when disabled (compile-time feature gate). Release builds intended for players ship without it. Tournament servers, AI training, and development builds enable it. See `decisions/09e/D031-observability.md` for full design.

### Diagnostic Overlay & Real-Time Observability

IC needs a **player-visible diagnostic overlay** — the equivalent of Source Engine's `net_graph`, but designed for lockstep RTS rather than client-server FPS. The overlay reads live telemetry data (D031) and renders via `bevy_egui` as a configurable HUD element. Console commands (D058) control which panels are visible.

**Inspired by:** Source Engine's `net_graph 1/2/3` (layered detail), Factorio's debug panels (F4/F5), StarCraft 2's Ctrl+Alt+F (latency/FPS bar), Supreme Commander's sim speed indicator. Source's `net_graph` is the gold standard for "always visible, never in the way" — IC adapts the concept to lockstep semantics where there is no prediction, no interpolation, and latency means order-delivery delay rather than entity rubber-banding.

#### Overlay Levels

The overlay has four levels, toggled by `/diag <level>` or the cvar `debug.diag_level`. Higher levels include everything from lower levels.

| Level | Name | Audience | What It Shows | Feature Gate |
| ----- | ---- | -------- | ------------- | ------------ |
| 0 | Off | — | Nothing | — |
| 1 | Basic | All players | FPS, sim tick time, network latency (RTT), entity count | Always available |
| 2 | Detailed | Power users, modders | Per-system tick breakdown, pathfinding stats, order queue depth, memory, tick sync status | Always available |
| 3 | Full | Developers, debugging | ECS component inspector, AI state viewer, fog debug visualization, network packet log, desync hash comparison | `dev-tools` feature flag |

**Level 1 — Basic** (the "net_graph 1" equivalent):

```
┌─────────────────────────────┐
│  FPS: 60    Tick: 15.0 tps  │
│  RTT: 42ms  Jitter: ±3ms   │
│  Entities: 847              │
│  Sim: 4.2ms / 66ms budget   │
│  ████░░░░░░ 6.4%            │
└─────────────────────────────┘
```

- **FPS:** Render frames per second (client-side, independent of sim rate)
- **Tick:** Actual simulation ticks per second vs target (e.g., 15.0/15 tps). Drops below target indicate sim overload
- **RTT:** Round-trip time to the relay server (multiplayer) or "Local" (single-player). Sourced from `relay.player.rtt_ms`
- **Jitter:** RTT variance — high jitter means inconsistent order delivery
- **Entities:** Total sim entities (units + projectiles + buildings + effects)
- **Sim:** Current tick computation time vs budget, with a bar graph showing budget utilization. Green = <50%, yellow = 50-80%, red = >80%

**Level 2 — Detailed** (the "net_graph 2" equivalent):

```
┌─────────────────────────────────────────┐
│  FPS: 60    Tick: 15.0 tps              │
│  RTT: 42ms  Jitter: ±3ms               │
│  Entities: 847  (Units: 612  Proj: 185) │
│                                         │
│  ── Sim Tick Breakdown (4.2ms) ──       │
│  movement    ██████░░░░  1.8ms (net 1.2)│
│  combat      ████░░░░░░  1.1ms          │
│  pathfinding ██░░░░░░░░  0.5ms          │
│  fog         █░░░░░░░░░  0.3ms          │
│  production  ░░░░░░░░░░  0.2ms          │
│  orders      ░░░░░░░░░░  0.1ms          │
│  other       ░░░░░░░░░░  0.2ms          │
│                                         │
│  ── Pathfinding ──                      │
│  Requests: 23/tick  Cache: 87% hit      │
│  Flowfields: 4 active  Recalc: 1        │
│                                         │
│  ── Network ──                          │
│  Orders TX: 3/tick  RX: 12/tick         │
│  Cushion: 3 ticks (200ms) ✓            │
│  Queue depth: 2 ticks ahead             │
│  Tick sync: ✓ (0 drift)                 │
│  State hash: 0xA3F7…  ✓ match          │
│                                         │
│  ── Memory ──                           │
│  Scratch: 48KB / 256KB                  │
│  Component storage: 12.4 MB             │
│  Flowfield cache: 2.1 MB (4 fields)     │
└─────────────────────────────────────────┘
```

- **Sim tick breakdown:** Per-system execution time, drawn as horizontal bar chart. Systems are sorted by cost (most expensive first). Colors match budget status. System names map to the OTEL metrics from D031 (`sim.system.<name>_us`). Each system shows **net time** (excluding child calls) by default; gross time (including children) shown on hover/expand. This gross/net distinction — inspired by SAGE engine's `PerfGather` hierarchical profiler (see `research/generals-zero-hour-diagnostic-tools-study.md`) — prevents the confusion where "movement: 3ms" includes pathfinding that's already shown separately
- **Pathfinding:** Active flowfield count, cache hit rate (`sim.pathfinding.cache_hits` / `sim.pathfinding.requests`), recalculations this tick
- **Network:** Orders sent/received per tick, **command arrival cushion** (how far ahead orders arrive before they're needed — the most meaningful lockstep metric, inspired by SAGE's `FrameMetrics::getMinimumCushion()`), order queue depth, tick synchronization status (drift from canonical tick), and the current `state_hash` with match/mismatch indicator. Cushion warning: yellow at <3 ticks, red at <2 ticks (stall imminent)
- **Memory:** TickScratch buffer usage, total ECS component storage, flowfield cache footprint

**Collection interval:** Expensive Level 2 metrics (pathfinding cache analysis, memory accounting, ECS archetype counts) are batched on a configurable interval (`debug.diag_batch_interval_ms` cvar, default: 500ms) rather than computed per-frame. This pattern is validated by SAGE engine's 2-second collection interval in `gatherDebugStats()`. Cheap metrics (FPS, tick time, entity count) are still per-frame

**Level 3 — Full** (developer mode, `dev-tools` feature flag required):

Adds interactive panels rendered via `bevy_egui`:

- **ECS Inspector:** Browse entities by archetype, view component values in real time. Click an entity in the game world to inspect it. Shows position, health, current order, AI state, owner, all components. Read-only — inspection never modifies sim state (Invariant #1)
- **AI State Viewer:** For selected unit(s), shows current task/schedule, interrupt mask, strategy slot assignment, failed path count, idle reason. Essential for debugging "why won't my units move?" scenarios
- **Order Queue Inspector:** Shows the full order pipeline: pending orders in the network queue, orders being validated (D012), orders applied this tick. Includes sub-tick timestamps (D008)
- **Fog Debug Visualization:** Overlays fog-of-war boundaries on the game world. Shows which cells are visible/explored/hidden for the selected player. Highlights stagger bucket boundaries (which portion of the fog map updated this tick)
- **World Debug Markers:** A global `debug_marker(pos, color, duration, category)` API callable from any system — pathfinding, AI, combat, triggers — with **category-based filtering** via `/diag ai paths`, `/diag ai zones`, `/diag fog cells` as independent toggles. Self-expiring markers clean up automatically. Inspired by SAGE engine's `addIcon()` pattern (see `research/generals-zero-hour-diagnostic-tools-study.md`) but with category filtering that SAGE lacked — essential for 1000-unit games where showing all markers simultaneously would be unusable
- **Network Packet Log:** Scrollable log of recent network messages (orders, state hashes, relay control messages). Filterable by type, player, tick. Shows raw byte sizes and timing
- **Desync Debugger:** When a desync is detected, freezes the overlay and shows the divergence point — which tick, which state hash components differ, and (if both clients have telemetry) a field-level diff of the diverged state. **Frame-gated detail logging:** on desync detection, automatically enables detailed state logging for 50 ticks before and after the divergence point (ring buffer captures the "before" window), dumps to structured JSON, and makes available via `/diag export`. This adopts SAGE engine's focused-capture pattern rather than always-on deep logging. Export includes a machine/session identifier for cross-client `diff` analysis (inspired by SAGE's per-machine CRC dump files)

#### Console Commands (D058 Integration)

All diagnostic overlay commands go through the existing `CommandDispatcher` (D058). They are **client-local** — they do not produce `PlayerOrder`s and do not flow through the network. They read telemetry data that is already being collected.

| Command | Behavior | Permission |
| ------- | -------- | ---------- |
| `/diag` or `/diag 1` | Toggle basic overlay (level 1) | Player |
| `/diag 0` | Turn off overlay | Player |
| `/diag 2` | Detailed overlay | Player |
| `/diag 3` | Full developer overlay | Developer (`dev-tools` required) |
| `/diag net` | Show only the network panel (any level) | Player |
| `/diag sim` | Show only the sim tick breakdown panel | Player |
| `/diag path` | Show only the pathfinding panel | Player |
| `/diag mem` | Show only the memory panel | Player |
| `/diag ai` | Show AI state viewer for selected unit(s) | Developer |
| `/diag orders` | Show order queue inspector | Developer |
| `/diag fog` | Toggle fog debug visualization | Developer |
| `/diag desync` | Show desync debugger panel | Developer |
| `/diag pos <corner>` | Move overlay position: `tl`, `tr`, `bl`, `br` (default: `tr`) | Player |
| `/diag scale <0.5-2.0>` | Scale overlay text size (accessibility) | Player |
| `/diag export` | Dump current overlay state to a timestamped JSON file | Player |

**Cvar mappings** (for `config.toml` and persistent configuration):

```toml
[debug]
diag_level = 0            # 0-3, default off
diag_position = "tr"      # tl, tr, bl, br
diag_scale = 1.0          # text scale factor
diag_opacity = 0.8        # overlay background opacity (0.0-1.0)
show_fps = true           # standalone FPS counter (separate from diag overlay)
show_network_stats = false # legacy alias for diag_level >= 1 net panel
```

#### Graph History Mode

The basic and detailed overlays show instantaneous values by default. Pressing `/diag history` or clicking the overlay header toggles **graph history mode**: key metrics are rendered as scrolling line graphs over the last N seconds (configurable via `debug.diag_history_seconds`, default: 30).

Graphed metrics:
- **FPS** (line graph, green/yellow/red zones)
- **Sim tick time** (line graph with budget line overlay)
- **RTT** (line graph with jitter band)
- **Entity count** (line graph)
- **Pathfinding cost per tick** (line graph)

Graph history mode is especially useful for identifying **intermittent spikes** — a single frame's numbers disappear instantly, but a spike in the graph persists and is visible at a glance. This is the pattern that Source Engine's `net_graph 3` uses for bandwidth history, adapted to RTS-relevant metrics.

```
┌─ Sim Tick History (30s) ─────────────────┐
│ 10ms ┤                                    │
│      │         ╭─╮                        │
│  5ms ┤─────────╯ ╰────────────────────── │
│      │                                    │
│  0ms ┤────────────────────────────────── │
│      └────────────────────────────────── │
│       -30s                          now   │
│ ── budget (66ms) far above graph ✓ ──    │
└──────────────────────────────────────────┘
```

#### Mobile / Touch Support

On mobile/tablet (D065), the diagnostic overlay is accessible via:

- **Settings gear → Debug → Diagnostics** (GUI path, no console needed)
- **Three-finger triple-tap** (hidden gesture, for developers testing on physical devices)
- Level 1 and 2 are available on mobile; Level 3 requires `dev-tools` which is not expected on player-facing mobile builds

The overlay renders at a larger font size on mobile (auto-scaled by DPI) and uses the bottom-left corner by default (avoiding thumb zones and the minimap). Graph history mode uses touch-friendly swipe-to-scroll.

#### Mod Developer Diagnostics

Mods (Lua/WASM) can register custom diagnostic panels via the telemetry API:

```rust
/// Mod-registered diagnostic metric. Appears in a "Mod Diagnostics" panel
/// visible at overlay level 2+. Mods cannot read engine internals — they
/// can only publish their own metrics through this API.
pub struct ModDiagnosticMetric {
    pub name: String,        // e.g., "AI Think Time"
    pub value: DiagValue,    // Gauge, Counter, or Text
    pub category: String,    // Grouping label in the UI
}

/// Client-side display only — never enters ic-sim or deterministic game logic.
pub enum DiagValue {
    Gauge(f64),              // Current value (e.g., 4.2ms) — f64 is safe here (presentation only)
    Counter(u64),            // Monotonically increasing (e.g., total pathfinding requests)
    Text(String),            // Freeform (e.g., "State: Attacking")
}
```

Mod diagnostics are sandboxed: mods publish metrics through the API, the engine renders them. Mods cannot read other mods' diagnostics or engine-internal metrics. This prevents information leakage (e.g., a mod reading fog-of-war data through the diagnostic API).

#### Performance Overhead

The diagnostic overlay itself must not become a performance problem:

| Level | Overhead | Mechanism |
| ----- | -------- | --------- |
| 0 (Off) | Zero | No reads, no rendering |
| 1 (Basic) | < 0.1ms/frame | Read 5 atomic counters + render 6 text lines via egui |
| 2 (Detailed) | < 0.5ms/frame | Read ~20 metrics + render breakdown bars + text |
| 3 (Full) | < 2ms/frame | ECS query for selected entity + scrollable log rendering |
| Graph history | +0.2ms/frame | Ring buffer append + line graph rendering |

All metric reads are **lock-free**: the sim writes to atomic counters/gauges, the overlay reads them on the render thread. No mutex contention, no sim slowdown from enabling the overlay. The ECS inspector (Level 3) uses Bevy's standard query system and runs in the render schedule, not the sim schedule.

#### Implementation Phase

- **Phase 2 (M2):** Level 1 overlay (FPS, tick time, entity count) — requires only sim tick instrumentation that already exists for benchmarks
- **Phase 3 (M3):** Level 2 overlay (per-system breakdown, pathfinding, memory) — requires D031 telemetry instrumentation
- **Phase 4 (M4):** Network panels (RTT, order queue, tick sync, state hash) — requires netcode instrumentation
- **Phase 5+ (M6):** Level 3 developer panels (ECS inspector, AI viewer, desync debugger) — requires mature sim + AI + netcode
- **Phase 6a (M8):** Mod diagnostic API — requires mod runtime (Lua/WASM) with telemetry bridge

### Profile Before Parallelize

Never add `par_iter()` without profiling first. Measure single-threaded. If a system takes > 1ms, consider parallelizing. If it takes < 0.1ms, sequential is faster (avoids coordination overhead).

**Recommended profiling tool:** Embark Studios' **puffin** (1,674★, MIT/Apache-2.0) — a frame-based instrumentation profiler built for game loops. Puffin's thread-local profiling streams have ~1ns overhead when disabled (atomic bool check, no allocation), making it safe to leave instrumentation in release builds. Key features validated by production use at Embark: frame-scoped profiling (maps directly to IC's sim tick loop), remote TCP streaming for profiling headless servers (relay server profiling without local UI), and the `puffin_egui` viewer for real-time flame graphs in development builds via `bevy_egui`. IC's `telemetry` feature flag (D031) should gate puffin's collection, maintaining zero-cost when disabled. See `research/embark-studios-rust-gamedev-analysis.md` § puffin.

### SDK Profile Playtest (D038 Integration, Advanced Mode)

Performance tooling must not make the SDK feel heavy for casual creators. The editor should expose profiling as an **opt-in Advanced workflow**, not a required step before every preview/test:

- Default toolbar stays simple: `Preview` / `Test` / `Validate` / `Publish`
- Profiling lives behind `Test ▼ → Profile Playtest` and an Advanced Performance panel
- No automatic profiling on save or on every test launch

**Profile Playtest output style (summary-first):**
- Pass / warn / fail against a selected performance budget profile (desktop default, low-end target, etc.)
- Top 3 hotspots (creator-readable grouping, not raw ECS internals only)
- Average / max sim tick time
- Trigger/module hotspot links where traceability exists
- Optional detailed flame graph / trace view for advanced debugging

This complements the Scenario Complexity Meter in `decisions/09f/D038-scenario-editor.md`: the meter is a heuristic guide, while Profile Playtest provides measured evidence during playtest.

**CLI/CI parity (Phase 6b):** Headless profiling summaries (`ic mod perf-test`) should reuse the same summary schema as the SDK view so teams can gate performance in CI without an SDK-only format.

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

Quake 3's networking introduced **entity baselines** — a default state for each entity type that serves as the base for delta encoding (see `research/quake3-netcode-analysis.md`). Instead of encoding deltas against the previous snapshot (which requires both sender and receiver to track full state history), deltas are encoded against a well-known baseline that both sides already have. This eliminates the need to retransmit reference frames on packet loss.

IC applies this concept to snapshot deltas:

```rust
/// Per-archetype baseline state. Registered at game module initialization.
/// All delta encoding uses baseline as the reference when no prior
/// snapshot is available (e.g., reconnection, first snapshot after load).
pub struct EntityBaseline {
    pub archetype: ArchetypeLabel,
    pub default_components: Vec<u8>,  // Serialized default state for this archetype
}

/// When computing a delta:
/// 1. If previous snapshot exists → delta against previous (normal case)
/// 2. If no previous snapshot → delta against baseline
///    Much smaller than a full snapshot because most fields
///    (owner, unit_type, armor, max_health) match the baseline.
```

**Why baselines matter for reconnection:** When a reconnecting client receives a snapshot, it has no previous state to delta against. Without baselines, the server must send a full uncompressed snapshot (~300KB for 1000 units). With baselines, the server sends deltas against the baseline — only fields that differ from the archetype's default state (position, health, facing, orders). For a 1000-unit game, ~60% of fields match the baseline, reducing the reconnection snapshot to ~120KB.

**Baseline registration:** Each game module registers baselines for its archetypes during initialization (e.g., "Allied Rifle Infantry" has default health=50, armor=None, speed=4). The baseline is frozen at game start — it never changes during play. Both sides (sender and receiver) derive the same baseline from the same game module data.

### Performance Impact by Use Case

| Use Case              | Full Snapshot   | Delta Snapshot   | Improvement                |
| --------------------- | --------------- | ---------------- | -------------------------- |
| Autosave (every 30s)  | 300 KB per save | ~30 KB per save  | 10x smaller                |
| Replay recording      | 4.5 MB/s        | ~450 KB/s        | 10x less IO                |
| Reconnection transfer | 300 KB burst    | 30 KB + deltas   | Faster join                |
| Desync diagnosis      | Full state dump | Field-level diff | Pinpoints exact divergence |

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

| Pattern                                                         | Location                           | Rationale                                                                                   |
| --------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `TickOrders::chronological()` uses scratch buffer               | `03-NETCODE.md`                    | Zero per-tick heap allocation — reusable `Vec<&TimestampedOrder>` instead of `.clone()`     |
| `VersusTable` is a flat `[i32; COUNT]` array                    | `02-ARCHITECTURE.md`               | O(1) combat damage lookup — no HashMap overhead in `projectile_system()` hot path           |
| `NotificationCooldowns` is a flat array                         | `02-ARCHITECTURE.md`               | Same pattern — fixed enum → flat array                                                      |
| WASM AI API uses `u32` type IDs, not `String`                   | `04-MODDING.md`                    | No per-tick String allocation across WASM boundary; string table queried once at game start |
| Replay keyframes every 300 ticks (mandatory)                    | `05-FORMATS.md`                    | Sub-second seeking without re-simulating from tick 0                                        |
| `gameplay_events` denormalized indexed columns                  | `decisions/09e-community.md` D034  | Avoids `json_extract()` scans during `PlayerStyleProfile` aggregation (D042)                |
| All SQLite writes on dedicated I/O thread                       | `decisions/09e-community.md` D031  | Ring buffer → batch transaction; game loop thread never touches SQLite                      |
| I/O ring buffer ≥1024 entries                                   | `decisions/09e-community.md` D031  | Absorbs 500 ms HDD checkpoint stall at 600 events/s peak with 3.4× headroom                 |
| WAL checkpoint suppressed during gameplay (HDD)                 | `decisions/09e-community.md` D034  | Random I/O checkpoint on spinning disk takes 200–500 ms; defer to safe points               |
| Autosave fsync on I/O thread, never game thread                 | `decisions/09a-foundation.md` D010 | HDD fsync takes 50–200 ms; game thread only produces DeltaSnapshot bytes                    |
| Replay keyframe: snapshot on game thread, LZ4+I/O on background | `05-FORMATS.md`                    | ~1 ms game thread cost every 300 ticks; compression + write async                           |
| Weather quadrant rotation (1/4 map per tick)                    | `decisions/09c-modding.md` D022    | Sim-only amortization — no camera dependency in deterministic sim                           |
| `gameplay.db` mmap capped at 64 MB                              | `decisions/09e-community.md` D034  | 1.6% of 4 GB min-spec RAM; scaled up on systems with ≥8 GB                                  |
| WASM pathfinder fuel exhaustion → continue heading              | `04-MODDING.md` D045               | Zero-cost fallback prevents unit freezing without breaking determinism                      |
| `StringInterner` resolves YAML strings to `InternedId` at load  | `10-PERFORMANCE.md`                | Condition checks, trait aliases, mod paths — integer compare instead of string compare      |
| `DoubleBuffered<T>` for fog, influence maps, global modifiers   | `02-ARCHITECTURE.md`               | Tick-consistent reads — all systems see same fog/modifier state within a tick               |
| Connection lifecycle uses type state (`Connection<S>`)          | `03-NETCODE.md`                    | Compile-time prevention of invalid state transitions — zero runtime cost via `PhantomData`  |
| Camera zoom/pan interpolation once per frame, not per entity    | `02-ARCHITECTURE.md`               | Frame-rate-independent exponential lerp on `GameCamera` resource — `powf()` once per frame  |
| Global allocator: mimalloc (desktop/mobile), dlmalloc (WASM)    | `10-PERFORMANCE.md`                | 5x faster than glibc for small objects; per-thread free lists for Bevy/rayon; MIT license             |
| CI allocation counting: `CountingAllocator<MiMalloc>`          | `10-PERFORMANCE.md`                | Feature-gated wrapper asserts zero allocations per tick; catches hot-path regressions                 |
| RAM Mode (default): zero disk writes during gameplay        | `10-PERFORMANCE.md`                | All assets loaded to RAM pre-match; SQLite/replay/autosave buffered in RAM; flush at safe points only; storage resilience with cloud/community/local fallback |
| Pre-match heap allocation: all gameplay memory allocated during loading screen | `10-PERFORMANCE.md` | `malloc` during `tick_system()` is a performance bug; CI benchmark tracks per-tick allocation count |
| In-memory SQLite during gameplay (`sqlite_in_memory_gameplay`)  | `10-PERFORMANCE.md`                | gameplay.db runs as `:memory:` during match; serialized to disk at match end and flush points |

## RAM Mode

### What It Is

**RAM Mode** is the engine's default runtime behavior: load everything into RAM before gameplay, perform zero disk I/O during gameplay, and flush to disk only at safe points (match end, pause, exit). The player never needs to enable it — it's on by default for everyone.

The name is user-facing. Settings, console, and documentation all call it "RAM Mode." Internally, the I/O subsystem uses `IoPolicy::RamMode` as the default enum variant.

### Problem: Disk I/O Is the Silent Performance Killer

The engine targets a 2012 laptop with a slow 5400 RPM HDD. Flash drives (USB 2.0/3.0) are even worse for random I/O — sequential reads are acceptable, but random writes and fsyncs are catastrophic. Even on modern SSDs, unnecessary disk I/O during gameplay introduces variance that deterministic lockstep cannot tolerate.

The existing design already isolates I/O from the game thread (background writers, ring buffers, deferred WAL checkpoints). RAM Mode extends that principle into a **unified strategy**: load everything into RAM before gameplay, perform zero disk writes during gameplay, and flush to disk at safe points.

### I/O Moment Map

Every disk I/O operation in the engine lifecycle, categorized by when it happens and how to minimize it:

| Phase | I/O Operation | Current Design | RAM-First Optimization |
|-------|--------------|----------------|----------------------|
| **First launch** | Content detection & asset indexing | Scans known install paths | Index cached in SQLite after first scan; subsequent launches skip detection |
| **Game start** | Asset loading (sprites, audio, maps, YAML rules) | Bevy async asset pipeline | **Load all game-session assets into RAM before match starts.** Loading screen waits for full load. No streaming during gameplay |
| **Game start** | Mod loading (YAML + Lua + WASM) | Parsed and compiled at load time | Keep compiled mod state in RAM for entire session |
| **Game start** | SQLite databases (gameplay.db, profile) | On-disk with WAL mode | **Open in-memory (`:memory:`) by default; populate from on-disk file at load.** Serialize back to disk at safe points |
| **Gameplay** | Autosave (delta snapshot) | Background I/O thread, Fossilize pattern | Configurable: hold in RAM ring buffer, flush on configurable cycle or at match end |
| **Gameplay** | Replay recording (.icrep) | Background writer via crossbeam channel | Configurable: buffer in RAM (default), flush periodically or at match end |
| **Gameplay** | SQLite event writes (gameplay_events, telemetry) | Ring buffer → batch transaction on I/O thread | **In-memory SQLite by default during gameplay.** Batch flush to on-disk file at configurable intervals or at match end |
| **Gameplay** | WAL checkpoint | Suppressed during gameplay on HDD (existing) | Extend: suppress on all storage during gameplay; checkpoint at match end or during pauses |
| **Gameplay** | Screenshot capture | PNG encode + write | Queue to background thread; buffer if I/O is slow |
| **Match end** | Final replay flush | Writer flushes remaining frames + header | Synchronous flush at match end (acceptable — player sees post-game screen) |
| **Match end** | SQLite serialize to disk | Not yet designed | **Mandatory dump: all in-memory SQLite databases serialized to on-disk files at match end** |
| **Match end** | Autosave final | Fossilize pattern | Final save at match end is mandatory regardless of I/O mode |
| **Post-game** | Stats computation, rating update | Reads from gameplay.db | Already in RAM if using in-memory SQLite |
| **Menu / Lobby** | Workshop downloads, mod installs | Background P2P download | No gameplay impact — full disk I/O acceptable |
| **Menu / Lobby** | Config saves, profile updates | SQLite + TOML writes | No gameplay impact — direct disk writes acceptable |

### Default I/O Policy: RAM-First

The default behavior is: **load everything you can into RAM, and only write to disk when the system is not actively running a match.**

```
┌─────────────────────────────────────────────────────────────────┐
│  LOADING SCREEN (pre-match)                                     │
│                                                                 │
│  ✓ Map loaded (2.1 MB)                                          │
│  ✓ Sprites loaded (18.4 MB)                                     │
│  ✓ Audio loaded (12.7 MB)                                       │
│  ✓ Rules compiled (0.3 MB)                                      │
│  ✓ SQLite databases cached to RAM (1.2 MB)                      │
│  ✓ Replay buffer pre-allocated (4 MB ring)                      │
│                                                                 │
│  Total session RAM: 38.7 MB / Budget: 200 MB                   │
│  Ready to start — zero disk I/O during gameplay                  │
└─────────────────────────────────────────────────────────────────┘
```

**Why this is safe:** The target is <200 MB RAM for 1000 units ([01-VISION](01-VISION.md)). Game assets for a Red Alert match are typically 30–50 MB total. Even on the 4 GB min-spec machine, loading everything into RAM leaves >3.5 GB free for the OS and other applications.

**When RAM is insufficient:** If the system reports low available memory at load time (below a configurable threshold, default: 512 MB free after loading), the engine falls back to Bevy's standard async asset streaming — loading assets on demand from disk. This is automatic, not a user setting. A one-time console warning is logged: `"Low memory: falling back to disk-streaming mode. Expect longer asset access times."`

### I/O Modes

RAM Mode is the default. Alternative modes exist for edge cases where RAM Mode is not ideal.

| Mode | Behavior | Default for | When to use |
|------|----------|-------------|-------------|
| **RAM Mode** (default) | All gameplay data buffered in RAM. Zero disk I/O during matches. Flush at safe points. | All players (desktop, portable, store builds) | Normal gameplay. Works for everyone unless RAM is critically low. |
| **Streaming Mode** | Write to disk continuously via background I/O threads. Existing behavior from the background-writer architecture. | Automatic fallback if RAM is insufficient | Systems with <4 GB RAM and large mods where RAM budget is exhausted. Also useful for relay servers (long-running processes that need persistent writes). |
| **Minimal Mode** | Like RAM Mode but also suppresses autosave during gameplay. Replay buffer is the only recovery mechanism. | Never auto-selected | Extreme low-RAM scenarios or when the player explicitly wants maximum RAM savings. |

**Edge cases where RAM Mode falls back to Streaming Mode automatically:**
- Available RAM after loading is below 512 MB free (configurable threshold)
- I/O RAM budget (`io_ram_budget_mb`, default 64 MB) is exhausted during gameplay
- Relay server / dedicated server processes (long-running, need persistent writes — these use Streaming Mode by default)

**The player does not need to choose.** RAM Mode is always the default. The engine falls back to Streaming Mode automatically when needed, with a one-time console log. No user action required. Advanced users can override via config or console.

### Configurable I/O Parameters

These parameters are exposed via `config.toml` (D067) and console cvars (D058). They control disk write behavior **during gameplay only** — menu/lobby I/O is always direct-to-disk.

```toml
[io]
# I/O mode during active gameplay.
# "ram" (default): buffer all writes in RAM, flush at match end and safe points
# "streaming": write to disk continuously via background threads
# "minimal": like ram but also suppresses autosave during gameplay (replay-only recovery)
mode = "ram"

# How often in-RAM data is flushed to disk during gameplay (seconds).
# 0 = only at match end and pause. Higher = more frequent but more I/O.
# Only applies when mode = "ram".
flush_interval_seconds = 0

# Maximum RAM budget (MB) for buffered I/O (replay buffer + in-memory SQLite + autosave queue).
# If exceeded, falls back to streaming mode. 0 = no limit (use available RAM).
ram_budget_mb = 64

# SQLite in-memory mode during gameplay.
# true (default): gameplay.db runs as :memory: during match, serialized to disk at flush points.
# false: standard WAL mode with background I/O thread.
sqlite_in_memory = true

# Replay write buffering.
# true (default): replay frames buffered in RAM ring buffer, flushed at match end.
# false: background writer streams to disk continuously.
replay_buffer_in_ram = true

# Autosave write policy during gameplay.
# "deferred" (default): delta snapshots held in RAM, written to disk at flush points.
# "immediate": written to disk immediately via background I/O thread.
# "disabled": no autosave during gameplay (replay is the recovery mechanism).
autosave_policy = "deferred"
```

### Flush Points (Safe Moments to Write to Disk)

Disk writes during gameplay are batched and flushed only at **safe points** — moments where a brief I/O stall is invisible to the player:

| Safe Point | When | What Gets Flushed |
|------------|------|-------------------|
| **Match end** (mandatory) | Victory/defeat screen | Everything: replay, SQLite, autosave, screenshots |
| **Player pause** | When any player pauses (multiplayer: all clients paused) | Autosave, SQLite events |
| **Flush interval** | Every N seconds if `flush_interval_seconds > 0` | SQLite events, autosave (on background thread) |
| **Lobby return** | When returning to menu/lobby | Full SQLite serialize, config saves |
| **Application exit** | Normal shutdown | Everything — mandatory |
| **Crash recovery** | On next launch | Detect incomplete in-memory state via replay; replay file is always valid up to last flushed frame |

**Crash safety under RAM-first mode:** If the game crashes during a match with `gameplay_write_policy = "ram_first"`, in-memory SQLite data (gameplay events, telemetry) from that match is lost. However:
- The replay file is always valid up to the last buffered frame (replay buffer flushed periodically even in RAM-first mode, at a minimum every 60 seconds)
- Autosave (if `deferred`, not `disabled`) is flushed at the same intervals
- Player profile, keys, and config are never held only in RAM — they are always on disk
- This trade-off is acceptable: gameplay event telemetry from a crashed match is low-value compared to smooth gameplay

### Portable Mode Integration & Storage Resilience

Portable mode (defined in `architecture/crate-graph.md` § `ic-paths`) stores all data relative to the executable. When combined with RAM Mode, the engine runs smoothly from a USB flash drive — and survives the flash drive being temporarily removed.

**The design test:** If a player is running from a USB flash drive, momentarily removes it during gameplay, and plugs it back in, the game should keep running the entire time and correctly save state when the drive returns. If the drive has a problem, the game should offer to save state somewhere else.

**Why this works:** RAM Mode means the engine has zero dependency on the storage device during gameplay. All assets are in RAM. All databases are in-memory. All replay/autosave data is buffered. The flash drive is only needed at two moments: loading (before gameplay) and flushing (after gameplay). Between those two moments, the drive can be on the moon.

**Lifecycle with storage resilience:**

| Phase | Storage needed? | What happens if storage is unavailable |
|-------|----------------|---------------------------------------|
| **Loading screen** | Yes — sequential reads | Cannot proceed. If storage disappears mid-load: pause loading, show reconnection dialog. |
| **Gameplay** | No | Game runs entirely from RAM. Storage status is irrelevant. No I/O errors possible because no I/O is attempted. |
| **Flush point** (match end, pause) | Yes — sequential writes | Attempt flush. If storage unavailable → Storage Recovery Dialog (see below). |
| **Menu / Lobby** | Yes — direct reads/writes | If storage unavailable → Storage Recovery Dialog. |

**Storage Recovery Dialog** (shown when a flush or menu I/O fails):

```
┌──────────────────────────────────────────────────────────────┐
│  STORAGE UNAVAILABLE                                         │
│                                                              │
│  Your game data is safe in memory.                           │
│  The storage device is not accessible.                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Reconnect storage                                     │  │
│  │  Plug your USB drive back in and click Retry.          │  │
│  │  [Retry]                                               │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Save to a different location                          │  │
│  │  Choose another drive or folder on this computer.      │  │
│  │  [Browse...]                                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Save to cloud                                (if configured)
│  │  Upload to Steam Cloud / configured provider.          │  │
│  │  [Upload]                                              │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Save to community server                     (if available)
│  │  Temporarily store on Official IC Community.           │  │
│  │  Data expires in 7 days. [Upload]                      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Continue without saving                               │  │
│  │  Your data stays in memory. You can save later.        │  │
│  │  If you close the game, unsaved data will be lost.     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The dialog shows options based on what's available — cloud and community options only appear if configured/connected.

**"Save to a different location"** behavior:
- Opens a folder browser. Player picks any writable location (another USB drive, the host PC's desktop, a network drive).
- Engine writes all buffered data (replay, autosave, SQLite databases) to the chosen location as a self-contained `<folder>/ic-emergency-save/` directory.
- The emergency save includes everything needed to resume: `gameplay.db`, replay buffer, autosave snapshot, config, and keys.
- On next launch from the original portable location (when the drive is back), the engine detects the emergency save and offers: `"Found unsaved data from a previous session at [path]. [Import and merge] [Ignore]"`.

**"Save to cloud"** behavior (only shown if a cloud provider is configured — Steam Cloud, GOG Galaxy, or a custom provider via D061's `PlatformCloudSync` trait):
- Uploads the emergency save package to the configured cloud provider.
- On next launch from any location, the engine detects the cloud emergency save during D061's cloud sync step and offers to restore.
- Size limit: cloud emergency saves are capped at the critical-data set (~5–20 MB: keys, profile, community credentials, config, latest autosave). Full replay buffers are excluded from cloud upload due to size constraints.

**"Save to community server"** behavior (only shown if the player is connected to a community server that supports temporary storage):
- Uploads the emergency save package to the community server using the player's Ed25519 identity for authentication.
- Community servers can optionally offer temporary personal storage for emergency saves. This is configured per-community in `server_config.toml`:

```toml
[emergency_storage]
# Whether this community server accepts emergency save uploads from members.
enabled = false
# Maximum storage per player (bytes). Default: 20 MB.
max_per_player_bytes = 20_971_520
# How long emergency saves are retained before automatic cleanup (seconds).
# Default: 7 days (604800 seconds).
retention_seconds = 604800
# Maximum total storage for all emergency saves (bytes). Default: 1 GB.
max_total_bytes = 1_073_741_824
```

- The player's emergency save is encrypted with their Ed25519 public key before upload — only they can decrypt it. The community server stores opaque blobs, not readable player data.
- On next launch, if the player connects to the same community, the server offers: `"You have an emergency save from [date]. [Restore] [Delete]"`.
- After the retention period, the emergency save is automatically deleted. The player is notified on next connect if their save expired.
- This is an optional community service — communities choose to enable it. Official IC community servers will enable it by default with the standard limits.

**"Retry" after reconnection:**
- Engine re-probes the original `data_dir` path.
- If accessible: runs `PRAGMA integrity_check` on all databases (WAL files may be stale), checkpoints WAL, then performs the normal flush. If integrity check fails on any database: uses the in-memory version (which is authoritative — the on-disk copy is stale) and rewrites the database via `VACUUM INTO`.
- If still inaccessible: dialog remains.

**"Continue without saving":**
- Game continues. Buffered data stays in RAM. Player can trigger a save later via Settings → Data or by exiting the game normally.
- A persistent status indicator appears in the corner: `"Unsaved — storage unavailable"` (dismissable but re-appears on next flush attempt).
- If the player exits the game with unsaved data: final confirmation dialog: `"You have unsaved game data. Exit anyway? [Save first (browse location)] [Exit without saving] [Cancel]"`.

**Implementation notes:**
- Storage availability is checked only at flush points, not polled continuously. No background thread probing the USB drive every second.
- The check is a simple file operation (attempt to open a known file for writing). If it fails with an I/O error, the Storage Recovery Dialog appears.
- All of this is transparent to the sim — `ic-sim` never sees storage state. The storage resilience logic lives in `ic-game`'s I/O management layer.

**Portable mode does not require separate I/O parameters.** The default `ram_first` policy already handles slow/absent storage correctly. The storage recovery dialog is the same for all storage types — it just happens to be most useful for portable/USB users.

### Pre-Match Heap Allocation Discipline

All heap-allocated memory for gameplay should be allocated **before the match starts**, during the loading screen. This complements the existing zero-allocation hot path principle (Efficiency Pyramid Layer 5) with an explicit pre-allocation phase:

| Resource | When Allocated | Lifetime |
|----------|---------------|----------|
| ECS component storage | Loading screen (Bevy `World` setup) | Entire match |
| Scratch buffers (`TickScratch`) | Loading screen | Entire match (`.clear()` per tick, never deallocated) |
| Pathfinding caches (flowfield, JPS open list) | Loading screen (sized to map dimensions) | Entire match |
| Spatial index (`SpatialHash`) | Loading screen (sized to map dimensions) | Entire match |
| String intern table | Loading screen (populated during YAML parse) | Entire session |
| Replay write buffer | Loading screen (pre-sized ring buffer) | Entire match |
| In-memory SQLite | Loading screen (populated from on-disk file) | Entire match |
| Autosave buffer | Loading screen (pre-sized for max delta snapshot) | Entire match |
| Audio decode buffers | Loading screen | Entire match |
| Render buffers (sprite batches, etc.) | Loading screen (Bevy renderer init) | Entire match |
| Fog of war / influence map (`DoubleBuffered<T>`) | Loading screen (sized to map grid) | Entire match |

**Rule:** If `malloc` is called during `tick_system()` or any system that runs between tick start and tick end, it is a performance bug. The only acceptable runtime allocations during gameplay are:
- Player chat messages (rare, small, outside sim)
- Network packet buffers (managed by `ic-net`, outside sim)
- Console command parsing (rare, user-initiated)
- Screenshot PNG encoding (background thread)

This list is finite and auditable. A CI benchmark that tracks per-tick allocation count (via a custom allocator in test builds) will catch regressions.
