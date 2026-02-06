# 10 — Performance Philosophy & Strategy

## Core Principle: Efficiency, Not Brute Force

**Performance goal: a 2012 laptop with 2 cores and 4GB RAM runs a 500-unit battle smoothly. A modern machine handles 3000 units without sweating.**

We don't achieve this by throwing threads at the problem. We achieve it by wasting almost nothing — like Datadog Vector's pipeline or Tokio's runtime. Every cycle does useful work. Every byte of memory is intentional. Multi-core is a bonus that emerges naturally, not a crutch the engine depends on.

This is a first-class project goal and a primary differentiator over OpenRA.

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

### Pathfinding: Flowfields Replace Per-Unit A*

When 50 units move to the same area, OpenRA computes 50 separate A* paths.

```
OpenRA (per-unit A*):
  50 units × ~200 nodes explored × ~10 ops/node = ~100,000 operations

Flowfield:
  1 field × ~2000 cells × ~5 ops/cell              = ~10,000 operations
  50 units × 1 lookup each                          =       50 operations
  Total                                             = ~10,050 operations

10x reduction. No threading involved.
```

The 51st unit ordered to the same area costs zero — the field already exists. Flowfields amortize across all units sharing a destination.

### Spatial Indexing: Grid Hash Replaces Brute-Force Range Checks

"Which enemies are in range of this turret?"

```
Brute force: 1000 units × 1000 units = 1,000,000 distance checks/tick
Spatial hash: 1000 units × ~8 nearby   =     8,000 distance checks/tick

125x reduction. No threading involved.
```

A spatial hash grid divides the map into cells. Each entity registers in its cell. Range queries only check nearby cells. O(1) lookup per cell, O(k) per query where k is the number of nearby entities (typically < 20).

### Hierarchical Pathfinding: Coarse Then Fine

Break the map into ~32x32 cell chunks. Path between chunks first (few nodes, fast), then path within the current chunk only. Most of the map is never pathfinded at all. Units approaching a new chunk compute the next fine-grained path just before entering.

## Layer 2: Cache-Friendly Data Layout

### ECS Archetype Storage (Bevy provides this)

```
OOP (cache-hostile, how OpenRA works):
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
    unit_pos: CellPos,
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
    nav: Res<NavMesh>,
) {
    let group = tick.0 % 4;  // 4 groups, each updated every 4 ticks
    
    for (entity, pos, target, lod) in &query {
        let should_update = match lod {
            SimLOD::Full    => entity.index() % 4 == group,    // every 4 ticks
            SimLOD::Reduced => entity.index() % 8 == (group * 2) % 8,  // every 8 ticks
            SimLOD::Minimal => false,  // never replan, just follow existing path
        };
        
        if should_update {
            recompute_path(entity, pos, target, &nav);
        }
    }
}
```

**Result:** Pathfinding cost per tick drops 75% for Full-LOD units, 87.5% for Reduced, 100% for Minimal. Combined with SimLOD, a 1000-unit game might recompute ~50 paths per tick instead of 1000.

### Stagger Schedule

| System | Full LOD | Reduced LOD | Minimal LOD |
|--------|----------|-------------|-------------|
| Pathfinding replan | Every 4 ticks | Every 8 ticks | Never (follow path) |
| Fog visibility | Every tick | Every 2 ticks | Every 4 ticks |
| AI re-evaluation | Every 2 ticks | Every 4 ticks | Every 8 ticks |
| Collision detection | Every tick | Every 2 ticks | Broadphase only |

**Determinism preserved:** The stagger schedule is based on entity ID and tick number — deterministic on all clients.

## Layer 5: Zero-Allocation Hot Paths

Heap allocation is expensive: the allocator touches cold memory, fragments the heap, and (in C#) creates GC pressure. Rust eliminates GC, but allocation itself still costs cache misses.

```rust
/// Pre-allocated scratch space reused every tick
/// Initialized once at game start, never reallocated
pub struct TickScratch {
    damage_events: Vec<DamageEvent>,       // capacity: 4096
    path_open_set: BinaryHeap<PathNode>,   // capacity: 8192
    path_closed_set: HashSet<CellPos>,     // capacity: 8192
    visible_cells: BitVec,                 // capacity: map_width × map_height
    validated_orders: Vec<ValidatedOrder>,  // capacity: 256
    combat_pairs: Vec<(Entity, Entity)>,   // capacity: 2048
}

impl TickScratch {
    fn reset(&mut self) {
        // .clear() sets length to 0 but keeps allocated memory
        // Zero bytes allocated on heap during the hot loop
        self.damage_events.clear();
        self.path_open_set.clear();
        self.path_closed_set.clear();
        self.visible_cells.fill(false);
        self.validated_orders.clear();
        self.combat_pairs.clear();
    }
}
```

**Per-tick allocation target: zero bytes.** All temporary data goes into pre-allocated scratch buffers. `clear()` resets without deallocating. The hot loop touches only warm memory.

This alone is why Rust beats C# for games. OpenRA allocates thousands of small objects per tick (iterators, LINQ results, temporary collections, event args). Each one is a potential GC trigger. Our engine allocates nothing.

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
fn pathfinding_system(query: Query<...>, nav: Res<NavMesh>) {
    let results: Vec<_> = query.par_iter()
        .filter(|(_, _, _, lod)| lod.should_update_path(tick))
        .map(|(entity, pos, target, _)| {
            (entity, nav.find_path(pos, &target.dest))
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

**Rule of thumb:** Only parallelize systems where per-entity work exceeds ~1 microsecond. Simple arithmetic on components is faster to iterate sequentially than to distribute.

## Performance Targets

| Metric | Weak Machine (2 core, 4GB) | Mid Machine (8 core, 16GB) | Strong Machine (16 core, 32GB) |
|--------|---------------------------|---------------------------|-------------------------------|
| Smooth battle size | 500 units | 2000 units | 3000+ units |
| Tick time budget | 66ms (15 tps) | 66ms (15 tps) | 33ms (30 tps) |
| Actual tick time (target) | < 40ms | < 10ms | < 5ms |
| Render framerate | 60fps | 144fps | 240fps |
| RAM usage (1000 units) | < 150MB | < 200MB | < 200MB |
| Startup to menu | < 3 seconds | < 1 second | < 1 second |
| Per-tick heap allocation | 0 bytes | 0 bytes | 0 bytes |

## Performance vs. OpenRA (Projected)

| What | OpenRA (C#) | Our Engine | Why |
|------|-------------|------------|-----|
| 500 unit tick | ~30-60ms (single thread, GC spikes to 100ms+) | ~8ms (algorithmic + cache) | Flowfields, spatial hash, ECS layout |
| Memory per unit | ~2-4KB (C# objects + GC metadata) | ~200-400 bytes (ECS packed) | No GC metadata, no vtable, no boxing |
| GC pause | 5-50ms unpredictable spikes | 0ms (doesn't exist) | Rust ownership + zero-alloc hot paths |
| Pathfinding 50 units | 50 × A* = ~2ms | 1 flowfield + 50 lookups = ~0.1ms | Algorithm change, not hardware change |
| Memory fragmentation | Increases over game duration | Stable (pre-allocated pools) | Scratch buffers, no per-tick allocation |
| 2-core scaling | 1x (single-threaded) | ~1.5x (work-stealing helps where applicable) | rayon adaptive |
| 8-core scaling | 1x (single-threaded) | ~3-5x (diminishing returns on game logic) | rayon work-stealing |

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

### Profile Before Parallelize

Never add `par_iter()` without profiling first. Measure single-threaded. If a system takes > 1ms, consider parallelizing. If it takes < 0.1ms, sequential is faster (avoids coordination overhead).

## Decision Record

### D015: Performance — Efficiency-First, Not Thread-First

**Decision:** Performance is achieved through algorithmic efficiency, cache-friendly data layout, adaptive workload, zero allocation, and amortized computation. Multi-core scaling is a bonus layer on top, not the foundation.

**Principle:** The engine must run a 500-unit battle smoothly on a 2-core, 4GB machine from 2012. Multi-core machines get higher unit counts as a natural consequence of the work-stealing scheduler.

**Inspired by:** Datadog Vector's pipeline efficiency, Tokio's work-stealing runtime, axum's zero-overhead request handling. These systems are fast because they waste nothing, not because they use more hardware.

**Anti-pattern:** "Just parallelize it" as the answer to performance questions. Parallelism without algorithmic efficiency is like adding lanes to a highway with broken traffic lights.
