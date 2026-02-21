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
/// ic-render: runtime render configuration
pub struct RenderSettings {
    pub tier: RenderTier,           // Auto-detected or user-forced
    pub fps_cap: u32,               // 30, 60, 144, 240, uncapped
    pub resolution_scale: f32,      // 0.5 - 2.0 (render resolution vs display)
    pub particle_density: f32,      // 0.0 - 1.0 (scales particle count)
    pub post_fx_enabled: bool,      // Master toggle for all post-processing
    pub weather_visual_mode: WeatherVisualMode,  // PaletteTint, Overlay, ShaderBlend
    pub sprite_sheet_max: u32,      // Derived from adapter texture limits
}

pub enum RenderTier {
    Baseline,   // Tier 0: GL 3.3 / WebGL2 — functional but plain
    Standard,   // Tier 1: Basic Vulkan/DX12 — GPU particles, basic post-FX
    Enhanced,   // Tier 2: Capable GPU — full visual pipeline
    Ultra,      // Tier 3: High-end — everything maxed
}
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

Telemetry is zero-cost when disabled (compile-time feature gate). Release builds intended for players ship without it. Tournament servers, AI training, and development builds enable it. See `decisions/09e-community.md` § D031 for full design.

### Profile Before Parallelize

Never add `par_iter()` without profiling first. Measure single-threaded. If a system takes > 1ms, consider parallelizing. If it takes < 0.1ms, sequential is faster (avoids coordination overhead).

**Recommended profiling tool:** Embark Studios' **puffin** (1,674★, MIT/Apache-2.0) — a frame-based instrumentation profiler built for game loops. Puffin's thread-local profiling streams have ~1ns overhead when disabled (atomic bool check, no allocation), making it safe to leave instrumentation in release builds. Key features validated by production use at Embark: frame-scoped profiling (maps directly to IC's sim tick loop), remote TCP streaming for profiling headless servers (relay server profiling without local UI), and the `puffin_egui` viewer for real-time flame graphs in development builds via `bevy_egui`. IC's `telemetry` feature flag (D031) should gate puffin's collection, maintaining zero-cost when disabled. See `research/embark-studios-rust-gamedev-analysis.md` § puffin.

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
