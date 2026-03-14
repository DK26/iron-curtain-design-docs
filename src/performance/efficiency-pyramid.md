# 10 — Performance

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

| Factor                           | mimalloc                                            | System allocator   | jemalloc                                   |
| -------------------------------- | --------------------------------------------------- | ------------------ | ------------------------------------------ |
| Small-object speed               | 5x faster than glibc                                | Baseline           | Good but slower than mimalloc              |
| Multi-threaded (Bevy/rayon)      | Per-thread free lists, single-CAS cross-thread free | Contended on Linux | Good but higher RSS                        |
| Fragmentation (60+ min sessions) | Good (temporal cadence, periodic coalescing)        | Varies by platform | Best, but not enough to justify trade-offs |
| RSS overhead                     | Low (~50% reduction vs glibc in some workloads)     | Platform-dependent | Moderate (arena-per-thread)                |
| Windows support                  | Native                                              | Native             | Weak (caveats)                             |
| WASM support                     | No                                                  | Yes (dlmalloc)     | No                                         |
| License                          | MIT                                                 | N/A                | BSD 2-clause                               |

**Alternatives rejected:**
- **jemalloc:** Better fragmentation resistance but weaker Windows support, no WASM, higher RSS on many-core machines, slower for small objects (Bevy's dominant allocation pattern). Only advantage is profiling, which mimalloc's built-in stats + the counting wrapper replicate.
- **tcmalloc (Google):** Modern version is Linux-only. Does not meet cross-platform requirements.
- **rpmalloc (Embark Studios):** Viable but Embark wound down operations. Less community momentum. No WASM support.
- **System allocator:** 5x slower on Linux multi-threaded workloads. Unacceptable for Bevy's parallel ECS scheduling.

**Per-target allocator selection:**

| Target                  | Allocator                     | Rationale                                                               |
| ----------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| Windows / macOS / Linux | mimalloc                      | Best small-object perf, low RSS, native cross-platform                  |
| WASM                    | dlmalloc (Rust default)       | Built-in, adequate for single-threaded WASM context                     |
| iOS / Android           | mimalloc (fallback: system)   | mimalloc builds for both; system is safe fallback if build issues arise |
| CI / Debug builds       | `CountingAllocator<MiMalloc>` | Wraps mimalloc with per-tick allocation counting (feature-gated)        |

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
