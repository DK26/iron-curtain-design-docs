# IcPathfinder — Multi-Layer Hybrid Pathfinding Design

> **Purpose:** Design specification for Iron Curtain's default `Pathfinder` trait implementation, synthesizing best practices from every open-source RTS engine and academic research
> **Replaces:** The previously-named `IcFlowfieldPathfinder` — renamed to `IcPathfinder` because flowfields are one layer, not the whole system
> **Implements:** `Pathfinder` trait (D013), IC Default preset (D045)
> **References:** `research/pathfinding-remastered-analysis.md`, `research/pathfinding-openra-analysis.md`, `research/pathfinding-rts-survey.md`

---

## Why Not Pure Flowfields?

The original design called the IC Default pathfinder `IcFlowfieldPathfinder`, implying flowfield-based pathfinding was the core algorithm. Research into shipped RTS engines reveals this is the wrong approach:

| Engine                     | Primary Pathfinding                    | Flowfield Status                              |
| -------------------------- | -------------------------------------- | --------------------------------------------- |
| EA Red Alert / Remastered  | Custom obstacle-tracing (per-unit)     | None                                          |
| OpenRA                     | Hierarchical A* (per-unit)             | None                                          |
| Spring Engine (BAR/Zero-K) | 3-tier A* or Quadtree A* (per-unit)    | **Tried flow maps, abandoned** (returns 0.0f) |
| 0 A.D.                     | JPS + Vertex pathfinder (per-unit)     | None                                          |
| Warzone 2100               | A* with LRU context caching (per-unit) | None                                          |
| StarCraft 2                | Per-unit A* with flocking              | None                                          |
| Supreme Commander 2        | Flow Field Tiles                       | **Only shipped flowfield game**               |
| Planetary Annihilation     | Flow Field Tiles                       | Same team as SupCom2                          |

Only two shipped games use flowfields — both by the same developer (Elijah Emerson). Every other engine uses per-unit pathfinding with hierarchical optimization.

### The Ant-Line Problem

Multiple independent sources document the same failure mode with pure flowfields:

- **jdxdev blog** (2020): Implemented flowfields for an RTS prototype. Single units worked fine. Small groups were okay. But "when 100 or so units all had to move around a corner to a common destination they tended to cluster quickly and end up forming into a single/double file line, like a line of ants." The developer **shelved flowfields** and switched to per-unit A* with waypoint offsets.

- **Spring Engine**: Implemented `PathFlowMap` with double-buffered flow cells. The implementation exists in the codebase but `GetFlowCost()` returns `0.0f` — effectively disabled. Flow maps were tried and abandoned.

- **HowToRTS blog** (2014): Notes that basic flow fields need significant additional work for actual RTS use — physics, flocking, pre-emptive collision avoidance, LOS checks, tiling, and formation coordination.

### What Flowfields Actually Solve

Flowfields excel at **one specific scenario**: many units (50+) moving to the same destination. The amortization is real — 1 flow field for 50 units vs. 50 individual A* paths is genuinely 10× fewer operations. But this scenario is only a subset of RTS pathfinding needs. Other scenarios (small groups, multiple destinations, formation movement, congestion resolution) are better served by other techniques.

### The Right Approach: Layered Hybrid

The "ultimate" pathfinder uses flowfields **as one tool among many**, activated only when beneficial. Every other layer uses proven techniques from shipped engines.

---

## Architecture: Five Layers

```
┌─────────────────────────────────────────────────┐
│               IcPathfinder                       │
│                                                  │
│  ┌───────────────────────────────────────────┐   │
│  │ Layer 5: Group Coordination               │   │  ← Formation assignment, synchronized arrival
│  ├───────────────────────────────────────────┤   │
│  │ Layer 4: Local Avoidance (ORCA-lite)      │   │  ← Unit-to-unit collision avoidance
│  ├───────────────────────────────────────────┤   │
│  │ Layer 3: Detailed Pathfinding             │   │  ← JPS (small groups) or Flow Field Tiles (large groups)
│  ├───────────────────────────────────────────┤   │
│  │ Layer 2: Hierarchical Sector Graph        │   │  ← Coarse routing, O(1) reachability
│  ├───────────────────────────────────────────┤   │
│  │ Layer 1: Cost Field & Passability         │   │  ← Terrain data, per-locomotor costs
│  └───────────────────────────────────────────┘   │
│                                                  │
│  All layers use fixed-point math (i32/i64)       │
│  Zero heap allocation in hot paths               │
│  Per-locomotor instances                         │
└─────────────────────────────────────────────────┘
```

### How Layers Interact

When `request_path(origin, dest, locomotor)` is called:

1. **Layer 1** checks passability at origin and destination
2. **Layer 2** checks reachability (O(1) domain lookup) — return early if unreachable
3. **Layer 2** finds coarse sector-level path (few nodes, fast)
4. **Layer 3** generates detailed path:
   - If destination already has an active flow field AND group threshold is met → look up direction from flow field (near-zero cost)
   - Otherwise → JPS within each sector along the coarse path
5. Path returned to caller; **Layer 4** (local avoidance) and **Layer 5** (group coordination) run as separate simulation systems that modify unit velocity each tick

Layers 1–3 execute during pathfinding requests. Layers 4–5 execute every simulation tick as ECS systems.

---

## Layer 1: Cost Field & Passability

### What It Is

The foundational data layer: a per-cell cost field representing terrain traversal costs for each locomotor type.

### Inspired By

| Engine        | What We Take                                                                 |
| ------------- | ---------------------------------------------------------------------------- |
| EA Remastered | `SpeedType` × `Ground[land].Cost[speed]` — per-locomotor terrain cost tables |
| 0 A.D.        | `NavcellData` bitwise passability — compact passability per cell             |
| All engines   | Per-locomotor cost separation — universal pattern                            |

### Design

```rust
/// One byte per cell per locomotor class. 1 = normal, 2-254 = weighted, 255 = impassable.
/// Matches the integration field convention from Emerson's Flow Field Tiles.
pub struct CostField {
    /// Indexed by [locomotor_id][cell_index]
    /// Flat array, row-major, for cache-friendly access
    data: Vec<Vec<u8>>,
    width: u32,
    height: u32,
}
```

- **1 byte per cell per locomotor** — compact, cache-friendly
- **Values:** 1 (normal), 2–254 (weighted terrain), 255 (impassable)
- **Per-locomotor:** Foot, Wheel, Track, Float, Fly each see different costs (matching Emerson's "movement types" — different cost fields per unit type)
- **Dynamic updates:** `invalidate_area()` marks cells dirty; downstream layers update incrementally

### Cost Stamps (Building Placement)

When a building is placed or destroyed, the cost field is updated by "stamping" the building's footprint onto the affected cells (Emerson, Game AI Pro Ch. 23). Rather than recomputing the entire cost field:

1. The building's footprint defines which cells change to impassable (255) on placement
2. On destruction, the original terrain costs are restored from the base terrain data
3. The stamp operation also triggers `invalidate_area()` on Layer 2 (sector graph) — only dirty sectors rebuild their portals and domain IDs

This is more efficient than a full recompute and matches how RA handles building construction. Cost stamps are pre-computed per building type from the `Building.footprint` component.

### Threat / Influence Avoidance (Dynamic Cost Overlay)

The cost field has a **static base layer** (terrain) and a **dynamic threat overlay** that biases pathfinding away from dangerous areas. This is the mechanism behind the `influence_avoidance: true` YAML config.

**How it works:** A separate `ThreatMap` (one `u8` per cell, shared across locomotors) stores an enemy proximity / damage-output score. The threat value is added to the terrain cost when Layer 3 queries the cost field, making cells under enemy fire or near defenses more "expensive" to traverse. Units won't be hard-blocked — they'll take longer routes only when the extra distance is less costly than the threat penalty.

```rust
/// Dynamic threat overlay. Updated every N ticks (amortized, not every tick).
pub struct ThreatMap {
    /// Per-cell threat cost (0 = safe, 1–254 = escalating danger)
    /// Added to terrain cost at query time: effective_cost = terrain_cost + threat_cost
    /// Clamped to 254 (255 = impassable is reserved for terrain only)
    data: Vec<u8>,
    width: u32,
    height: u32,
}
```

**Inspired by Warzone 2100's danger map:** WZ2100 uses a boolean `dangerMap` with a flat 5× cost multiplier for cells under fire. IC's `ThreatMap` is more granular — graduated values allow units to distinguish between "near a pillbox" (low threat, mild avoidance) and "in the kill zone of three Tesla Coils" (high threat, strong avoidance). The cost is additive, not multiplicative, so even high-threat cells remain traversable when no alternative route exists.

**Update frequency:** The threat map is refreshed every 4–8 ticks (configurable via `threat_update_frequency`), not every tick. Threat sources are queried from the `SpatialIndex` — enemy combat units and defensive structures within weapon range contribute threat proportional to their damage output. This is an amortized cost (Performance Pyramid #4).

**AI-only vs. all units:** By default, threat avoidance applies only to AI-controlled units (matching Remastered's behavior where only AI teams use threat-aware routing). Player-controlled units follow orders directly. The `influence_avoidance` config can be set to `all` for a more cautious movement style, or `none` to disable entirely.

### Terrain Cost Sources

From YAML data (matching OpenRA vocabulary compatibility, D023):

```yaml
terrain_costs:
  Clear:    { foot: 1, wheel: 1, track: 1, float: 255 }
  Road:     { foot: 1, wheel: 1, track: 1, float: 255 }
  Rough:    { foot: 2, wheel: 3, track: 2, float: 255 }
  River:    { foot: 6, wheel: 255, track: 255, float: 1 }
  Water:    { foot: 255, wheel: 255, track: 255, float: 1 }
  Bridge:   { foot: 1, wheel: 1, track: 1, float: 1 }
  Wall:     { foot: 255, wheel: 255, track: 255, float: 255 }
```

---

## Layer 2: Hierarchical Sector Graph

### What It Is

The map is divided into sectors (rectangular regions). Within each sector, connected regions are identified by flood fill. Adjacent sectors share portals (boundary cells where regions connect). This creates a coarse navigation graph where pathfinding between sectors is fast (few nodes) and reachability is O(1).

### Inspired By

| Engine          | What We Take                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| OpenRA          | 10×10 grid abstraction, flood-fill regions within grids, abstract edge costs, domain-based O(1) reachability |
| 0 A.D.          | Hierarchical pathfinder with chunk-based regions, `GlobalRegionID`, per-chunk dirty tracking                 |
| EA Remastered   | `MZONE_*` flood-fill zones for fast reachability (`Can_Enter_Cell()` zone checks)                            |
| Spring Engine   | Multi-resolution approach — coarse then fine                                                                 |
| HPA* literature | Botea & Müller (2004), "Near Optimal Hierarchical Path-Finding"                                              |

### Design

```rust
pub struct SectorGraph {
    sector_size: u32,           // e.g., 32×32 cells
    sectors: Vec<Sector>,       // flat grid of sectors
    sector_cols: u32,           // number of sector columns
    
    /// Abstract graph edges: portal → portal with cost
    abstract_edges: Vec<AbstractEdge>,
    
    /// Domain ID per cell — cells with same domain ID are reachable from each other
    /// O(1) reachability: if domain[cell_a] == domain[cell_b], a path exists
    domains: Vec<DomainId>,     // one per cell, per locomotor
    
    /// Dirty flags for incremental update
    dirty_sectors: BitVec,
}

pub struct Sector {
    /// Regions within this sector (flood-fill connected components)
    regions: SmallVec<[RegionId; 4]>,
    /// Portals on each edge (shared with adjacent sectors)
    portals: SmallVec<[Portal; 16]>,
}

pub struct Portal {
    /// Cells on the sector boundary that are passable
    cells: Range<u32>,
    /// Which region(s) this portal connects to in each sector
    region_a: RegionId,
    region_b: RegionId,
    /// Pre-computed traversal cost between this portal and others in the same sector
    intra_sector_costs: SmallVec<[(PortalId, SimCoord); 8]>,
}
```

### Key Operations

| Operation                      | Cost                                 | When                                                             |
| ------------------------------ | ------------------------------------ | ---------------------------------------------------------------- |
| Reachability check             | O(1)                                 | Before any path request — reject immediately if unreachable      |
| Coarse path (sector level)     | O(S log S) where S = sectors on path | Per path request — typically 5–15 sectors                        |
| Sector rebuild (on map change) | O(sector_size²)                      | When building placed/destroyed — incremental, only dirty sectors |
| Full rebuild                   | O(map_width × map_height)            | Map load only                                                    |

### Why 32×32 Sectors (Not 10×10)

Emerson's original Flow Field Tiles paper (SupCom2) uses **10×10 sectors** — the same size OpenRA uses for its hierarchical grid. We deliberately chose 32×32 after analyzing the tradeoffs:

| Factor                     | 10×10 (Emerson / OpenRA)            | 32×32 (IC)                                                   |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| Sector count (128×128 map) | 169 sectors                         | 16 sectors                                                   |
| Abstract graph nodes       | ~676 (169 × ~4 regions)             | ~64 (16 × ~4 regions)                                        |
| Portal graph A* cost       | Higher (more nodes to search)       | Lower (fewer nodes)                                          |
| Flow field tile cost       | Cheaper per tile (100 cells)        | More expensive per tile (1,024 cells) but fewer tiles needed |
| Cache utilization          | More tiles needed for same coverage | Fewer tiles, better cache hit rate                           |
| Sector rebuild cost        | O(100) per dirty sector             | O(1,024) per dirty sector                                    |
| Index calculation          | Division/modulo                     | Bit-shift (sector_x = cell_x >> 5) — zero-cost               |

**Why we diverge from Emerson:** SupCom2 maps are massive (81×81 km, up to 4096×4096 cells) where 10×10 sectors keep flow field tile generation fast. RA1 maps are small (128×128 typical, 256×256 max). With small maps, fewer larger sectors reduce portal graph overhead without making per-tile generation expensive. The 1,024-cell generation cost (~1ms in Rust fixed-point) is well within our per-tick budget.

**Configurable:** `sector_size` is a YAML parameter (see Configuration Model). If testing reveals 32×32 is too coarse for specific scenarios, modders can tune it. The architecture is sector-size-agnostic.

---

## Layer 3: Detailed Pathfinding (Adaptive)

### What It Is

The core pathfinding layer that generates actual cell-by-cell paths. This layer **adapts its algorithm** based on the scenario:

| Scenario                                          | Algorithm                         | Why                                                                                          |
| ------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| **Single unit or small group (< threshold)**      | JPS (Jump Point Search)           | 10–100× faster than A* on uniform-cost grids; per-unit paths give natural movement variation |
| **Large group (≥ threshold) sharing destination** | Flow Field Tiles                  | Amortized cost — 1 field serves all units; matches SupCom2 approach                          |
| **Non-uniform terrain costs**                     | Weighted A*                       | JPS requires uniform costs; fall back to A* with terrain weights                             |
| **Short distance (< 2 sectors)**                  | Direct A*/JPS (skip hierarchical) | Overhead of hierarchical routing not worth it for short paths (OpenRA optimization)          |

### Inspired By

| Technique                      | Source                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| JPS                            | 0 A.D. (shipped), Harabor & Grastien (2011, 2012, 2014)                               |
| JPS+ (precomputed jump points) | Game AI Pro 2, Chapter 14 (Steve Rabin)                                               |
| Flow Field Tiles               | Supreme Commander 2, Emerson (Game AI Pro, Chapter 23)                                |
| Adaptive algorithm selection   | IC original — no surveyed engine dynamically switches between per-unit and flow field |
| Context caching                | Warzone 2100 — LRU cache of pathfinding contexts for reuse                            |
| Async with temp paths          | Spring Engine QTPFS — return approximate path while computing exact                   |

### JPS Sub-Layer (Per-Unit Paths)

Jump Point Search eliminates symmetric paths on uniform-cost grids. Instead of expanding every neighbor, JPS "jumps" ahead in straight lines until it finds a forced neighbor or the goal. This reduces the number of nodes opened by 10–100× compared to standard A*.

```rust
/// JPS pathfinding within a single sector or across nearby sectors.
/// Fixed-point costs throughout. No heap allocation during search (pre-allocated scratch).
pub struct JpsSearch {
    /// Pre-allocated open list (binary heap)
    open: BinaryHeap<JpsNode>,
    /// Pre-allocated closed set (bitfield, one bit per cell in sector)
    closed: BitVec,
    /// Pre-allocated parent map for path reconstruction
    parents: Vec<CellId>,
    
    /// Optional: JPS+ precomputed jump point tables for static map regions
    /// Indexed by [cell][direction] → distance to next jump point or wall
    precomputed_jumps: Option<Vec<[i16; 8]>>,
}
```

**Jump function pseudocode:** The core of JPS is the `jump` function, which advances from a cell in a given direction until it finds a jump point (a cell with forced neighbors), the goal, or an obstacle. Forced neighbors arise when an adjacent cell is blocked, creating an asymmetry that JPS must explore. All 8 directions are handled explicitly — cardinal directions check for forced neighbors perpendicular to the travel direction, while diagonal directions recurse into their two component cardinal directions before advancing (Harabor & Grastien 2011, 2014).

```rust
/// Cardinal directions: N=0, NE=1, E=2, SE=3, S=4, SW=5, W=6, NW=7
/// Cost constants (fixed-point, 1024 = 1.0):
const CARDINAL_COST: i32 = 1024;       // 1.0 in fixed-point
const DIAGONAL_COST: i32 = 1448;       // √2 ≈ 1448/1024 = 1.4140625

/// Jump from `cell` in `direction`. Returns the jump point (if any) and its
/// accumulated cost from `cell`. All arithmetic is fixed-point i32.
///
/// Termination conditions:
///   1. Hit impassable cell or map boundary → return None
///   2. Reached goal cell → return Some(goal)
///   3. Found forced neighbor → return Some(current)
///   4. (Diagonal only) Cardinal sub-jump found a jump point → return Some(current)
fn jump(
    cost_field: &CostField,
    cell: CellPos,
    direction: u8,       // 0–7
    goal: CellPos,
    locomotor: LocomotorType,
) -> Option<(CellPos, /* cost */ i32)> {
    let mut current = cell;
    let mut accumulated_cost: i32 = 0;

    loop {
        // Advance one step in the given direction
        let next = current.neighbor(direction);

        // Termination 1: impassable or out of bounds
        if !cost_field.in_bounds(next) || !cost_field.passable(next, locomotor) {
            return None;
        }

        // For diagonal moves, enforce corner-cutting prevention:
        // both orthogonal components must be passable
        if is_diagonal(direction) {
            let (ortho_a, ortho_b) = diagonal_components(direction);
            if !cost_field.passable(current.neighbor(ortho_a), locomotor)
                || !cost_field.passable(current.neighbor(ortho_b), locomotor)
            {
                return None;
            }
        }

        current = next;
        accumulated_cost += if is_diagonal(direction) {
            DIAGONAL_COST
        } else {
            CARDINAL_COST
        };

        // Termination 2: reached goal
        if current == goal {
            return Some((current, accumulated_cost));
        }

        // Termination 3 / 4: check for forced neighbors based on direction type
        match direction {
            // ── Cardinal directions ──────────────────────────────
            // For each cardinal direction, forced neighbors exist when a cell
            // perpendicular to travel is blocked but the diagonal "past" it is open.
            //
            // Example for East (direction=2):
            //   . B .       B = blocked, C = current, F = forced neighbor
            //   . C →       If North is blocked (B) but NE is open (F),
            //   . . .       then NE is a forced neighbor — we must stop here.

            0 /* N */ => {
                // Check E side: if E blocked but NE open → forced
                // Check W side: if W blocked but NW open → forced
                if (blocked(cost_field, current, 2 /*E*/, locomotor)
                    && passable(cost_field, current, 1 /*NE*/, locomotor))
                || (blocked(cost_field, current, 6 /*W*/, locomotor)
                    && passable(cost_field, current, 7 /*NW*/, locomotor))
                {
                    return Some((current, accumulated_cost));
                }
            }
            2 /* E */ => {
                if (blocked(cost_field, current, 0 /*N*/, locomotor)
                    && passable(cost_field, current, 1 /*NE*/, locomotor))
                || (blocked(cost_field, current, 4 /*S*/, locomotor)
                    && passable(cost_field, current, 3 /*SE*/, locomotor))
                {
                    return Some((current, accumulated_cost));
                }
            }
            4 /* S */ => {
                if (blocked(cost_field, current, 2 /*E*/, locomotor)
                    && passable(cost_field, current, 3 /*SE*/, locomotor))
                || (blocked(cost_field, current, 6 /*W*/, locomotor)
                    && passable(cost_field, current, 5 /*SW*/, locomotor))
                {
                    return Some((current, accumulated_cost));
                }
            }
            6 /* W */ => {
                if (blocked(cost_field, current, 0 /*N*/, locomotor)
                    && passable(cost_field, current, 7 /*NW*/, locomotor))
                || (blocked(cost_field, current, 4 /*S*/, locomotor)
                    && passable(cost_field, current, 5 /*SW*/, locomotor))
                {
                    return Some((current, accumulated_cost));
                }
            }

            // ── Diagonal directions ──────────────────────────────
            // Diagonal jumps first recurse into both component cardinal directions.
            // If either cardinal sub-jump finds a jump point, the current diagonal
            // cell is itself a jump point (we must stop to allow the search to
            // branch into the cardinal direction).
            //
            // Additionally, diagonal directions have their own forced neighbor
            // checks — the blocked cell is adjacent along one component axis.
            //
            // Example for NE (direction=1):
            //   . . F       If S is blocked but SE is open → forced
            //   . C .       If W is blocked but NW is open → forced
            //   . B .       Cardinal sub-jumps: jump N and jump E from current

            1 /* NE */ => {
                // Forced neighbor checks for NE
                if (blocked(cost_field, current, 4 /*S*/, locomotor)
                    && passable(cost_field, current, 3 /*SE*/, locomotor))
                || (blocked(cost_field, current, 6 /*W*/, locomotor)
                    && passable(cost_field, current, 7 /*NW*/, locomotor))
                {
                    return Some((current, accumulated_cost));
                }
                // Cardinal sub-jumps: N and E
                if jump(cost_field, current, 0 /*N*/, goal, locomotor).is_some()
                || jump(cost_field, current, 2 /*E*/, goal, locomotor).is_some()
                {
                    return Some((current, accumulated_cost));
                }
            }
            3 /* SE */ => {
                if (blocked(cost_field, current, 0 /*N*/, locomotor)
                    && passable(cost_field, current, 1 /*NE*/, locomotor))
                || (blocked(cost_field, current, 6 /*W*/, locomotor)
                    && passable(cost_field, current, 5 /*SW*/, locomotor))
                {
                    return Some((current, accumulated_cost));
                }
                if jump(cost_field, current, 4 /*S*/, goal, locomotor).is_some()
                || jump(cost_field, current, 2 /*E*/, goal, locomotor).is_some()
                {
                    return Some((current, accumulated_cost));
                }
            }
            5 /* SW */ => {
                if (blocked(cost_field, current, 0 /*N*/, locomotor)
                    && passable(cost_field, current, 7 /*NW*/, locomotor))
                || (blocked(cost_field, current, 2 /*E*/, locomotor)
                    && passable(cost_field, current, 1 /*NE*/, locomotor))
                {
                    return Some((current, accumulated_cost));
                }
                if jump(cost_field, current, 4 /*S*/, goal, locomotor).is_some()
                || jump(cost_field, current, 6 /*W*/, goal, locomotor).is_some()
                {
                    return Some((current, accumulated_cost));
                }
            }
            7 /* NW */ => {
                if (blocked(cost_field, current, 4 /*S*/, locomotor)
                    && passable(cost_field, current, 5 /*SW*/, locomotor))
                || (blocked(cost_field, current, 2 /*E*/, locomotor)
                    && passable(cost_field, current, 3 /*SE*/, locomotor))
                {
                    return Some((current, accumulated_cost));
                }
                if jump(cost_field, current, 0 /*N*/, goal, locomotor).is_some()
                || jump(cost_field, current, 6 /*W*/, goal, locomotor).is_some()
                {
                    return Some((current, accumulated_cost));
                }
            }

            _ => unreachable!(),
        }
        // No forced neighbor found — continue jumping in the same direction
    }
}

/// Helper: true if direction is diagonal (odd-numbered: NE=1, SE=3, SW=5, NW=7)
fn is_diagonal(direction: u8) -> bool { direction & 1 != 0 }

/// Helper: decompose diagonal into two cardinal components
fn diagonal_components(direction: u8) -> (u8, u8) {
    match direction {
        1 /* NE */ => (0 /* N */, 2 /* E */),
        3 /* SE */ => (4 /* S */, 2 /* E */),
        5 /* SW */ => (4 /* S */, 6 /* W */),
        7 /* NW */ => (0 /* N */, 6 /* W */),
        _ => unreachable!(),
    }
}
```

The search driver (`JpsSearch::find_path`) uses `jump()` as a subroutine: for each node popped from the open list, it calls `jump()` in each pruned successor direction. Jump points returned are added to the open list with `g_cost = parent_g + accumulated_cost` and `h_cost = octile_distance(jump_point, goal)`. The open list is a binary heap ordered by `f = g + h`, with all costs in fixed-point (1024 = 1.0). This matches 0 A.D.'s JPS implementation, which uses the same direction-based pruning and forced-neighbor detection on its `CFixed_15_16` grid.

**JPS+ optimization:** For map regions that don't change often (no dynamic obstacles), precompute the jump distances in each of 8 directions for every cell. This reduces online JPS to table lookups — even faster than standard JPS. Precomputation cost: O(8 × map_size), done at map load and incrementally on map changes. Documented in Game AI Pro 2 by Steve Rabin; benchmarks show >1000× speedup over standard A*.

**Fallback to weighted A\*:** When terrain costs vary (e.g., Rough terrain costs 3× for wheels), JPS can't be used (it assumes uniform costs). The pathfinder detects non-uniform sectors from the cost field and falls back to standard A* with proper terrain weighting.

**Corner-cutting prevention:** On grid-based maps, diagonal movement must not cut through blocked cell corners. When expanding a diagonal neighbor (e.g., NE), both adjacent orthogonal cells (N and E) must be passable — otherwise the unit would visually clip through a wall corner. This rule applies to both JPS jumps and A* neighbor expansion:

```rust
/// Check whether a diagonal move from `from` in `dir` is valid.
/// Both orthogonal neighbors adjacent to the diagonal must be passable.
fn diagonal_passable(cost_field: &CostField, from: CellPos, dir: DiagonalDir, locomotor: LocomotorType) -> bool {
    let (ortho_a, ortho_b) = dir.orthogonal_components(); // e.g., NE → (N, E)
    cost_field.passable(from.neighbor(ortho_a), locomotor)
        && cost_field.passable(from.neighbor(ortho_b), locomotor)
}
```

Warzone 2100 enforces this identically (checking `dir ± 1` modulo 8). Without it, units squeeze through single-cell gaps diagonally, which looks wrong and breaks building wall integrity. This is a visual correctness rule, not a performance optimization.

### Flow Field Tile Sub-Layer (Mass Movement)

When the pathfinder detects many units requesting paths to the same destination area (tracked via a destination-proximity hash), it generates flow field tiles instead of per-unit paths.

```rust
/// Flow field tiles generated per-sector for mass movement.
/// Only created when group_threshold units share a destination sector.
///
/// Bit layout follows Emerson's conventions with IC-specific adaptations:
///   Cost Field:        u8 per cell (Layer 1, shared across all tiles)
///   Integration Field: u16 per cell (16-bit cost, 0 = goal, 65535 = unreachable)
///                      Emerson uses 24-bit (16 cost + 8 flags) but IC packs flags
///                      into the flow direction byte to save memory.
///   Flow Direction:    u8 per cell (4-bit direction index + 4-bit flags)
///                      Flags: HAS_LOS (direct line-of-sight to goal),
///                             PATHABLE, ACTIVE_WAVEFRONT (reserved for generation)
pub struct FlowFieldTile {
    /// Integration field: cost-to-destination for each cell in the sector.
    /// u16 per cell — 0 = goal cell, 65535 = unreachable.
    /// Generated by Eikonal wavefront expansion from the goal.
    integration: Vec<u16>,
    
    /// Flow directions: 1 byte per cell.
    /// Low 4 bits: direction index (0–8, where 0 = goal/unreachable, 1–8 = 8 cardinal/diagonal)
    /// High 4 bits: flags
    ///   bit 4 (0x10): HAS_LOS — cell has direct line-of-sight to goal (Emerson's LOS pass)
    ///   bit 5 (0x20): PATHABLE — cell is traversable
    ///   bits 6-7: reserved
    ///
    /// When HAS_LOS is set, the unit ignores the flow direction and steers directly
    /// toward the goal for higher-precision movement. This eliminates the "staircase"
    /// artifact near goals where flow directions quantize to 8 directions but the
    /// actual goal vector is smooth. (Emerson, Game AI Pro Ch. 23)
    directions: Vec<u8>,
    
    /// Destination sector + portal that this tile flows toward.
    /// Cache key: tiles are identified by the portal they lead to,
    /// enabling reuse when multiple paths share the same portal route.
    target: FlowTarget,
    
    /// Tick when this tile was generated (for cache invalidation)
    created_tick: u32,
    
    /// Reference count — how many units are using this tile
    ref_count: u32,
}

/// Direction + flag constants for flow field bytes
const FLOW_DIR_MASK: u8  = 0x0F;  // low 4 bits = direction index
const FLOW_HAS_LOS: u8   = 0x10;  // bit 4 = direct LOS to goal
const FLOW_PATHABLE: u8   = 0x20;  // bit 5 = cell is traversable

/// Flow field cache: LRU eviction when too many tiles exist.
/// Tiles are keyed by (SectorId, FlowTarget) — Emerson keys by portal,
/// which enables Merging A* to maximize flow field reuse (see below).
pub struct FlowFieldCache {
    tiles: HashMap<(SectorId, FlowTarget), FlowFieldTile>,
    max_tiles: usize,        // memory budget
    lru_order: VecDeque<(SectorId, FlowTarget)>,
}
```

**Generation algorithm** (Emerson's 4-step process, Game AI Pro Ch. 23):

1. **Reset:** Set goal cell integration cost to 0, all others to 65535. Clear all flags.
2. **LOS Pass:** Starting from the goal, perform a wavefront expansion checking line-of-sight. Every cell with an unobstructed straight line to the goal is flagged `HAS_LOS`. These cells will ignore flow directions entirely — units standing on them steer directly toward the goal for sub-cell precision. This eliminates the "staircase" artifact near goals where 8-direction quantization would otherwise produce zigzag movement.

   The LOS pass is not a brute-force ray-cast from every cell to the goal — that would be O(n × max_distance) and far too expensive for a 32×32 tile. Instead, it uses a wavefront-limited Bresenham ray-cast: only cells reached by the BFS integration wavefront (step 3) are candidates, and the wavefront processes cells in cost order so the LOS pass can run interleaved with integration or as a post-pass over integrated cells. Emerson describes this as a "line-of-sight optimization pass" (Game AI Pro Ch. 23).

   ```rust
   /// LOS pass: flag cells that have an unobstructed line to the goal.
   /// Uses Bresenham's line algorithm in fixed-point to walk cells from
   /// candidate to goal. Only cells already reached by the integration
   /// wavefront are tested (avoids wasting work on unreachable cells).
   ///
   /// Runs after step 1 (Reset) and can run interleaved with step 3 (Integration)
   /// or as a post-pass — either ordering produces identical results since LOS
   /// is a geometric property independent of integration cost values.
   fn los_pass(
       tile: &mut FlowFieldTile,
       cost_field: &CostField,
       goal: CellPos,
       sector_origin: CellPos,
       sector_size: u32,
       locomotor: LocomotorType,
   ) {
       for cell_index in 0..(sector_size * sector_size) {
           // Only test cells that are pathable and have been integrated
           if tile.integration[cell_index as usize] == 65535 { continue; }
           if cell_index == goal_local_index { continue; } // goal already handled

           let cell = index_to_pos(cell_index, sector_size);

           // Bresenham ray-cast from cell center to goal center
           if bresenham_los(cost_field, cell, goal, sector_origin, locomotor) {
               tile.directions[cell_index as usize] |= FLOW_HAS_LOS;
           }
       }
   }

   /// Fixed-point Bresenham line-of-sight check. Walks cells from `from` to `to`
   /// along a Bresenham line. Returns true if all intermediate cells are passable.
   ///
   /// Uses integer-only arithmetic (no floats). The standard Bresenham error term
   /// is scaled by 2× to avoid fractional steps — identical to the classic integer
   /// line-drawing algorithm but used for collision testing instead of rendering.
   ///
   /// Early termination: returns false as soon as any cell along the ray is
   /// impassable (cost == 255) or out of bounds.
   fn bresenham_los(
       cost_field: &CostField,
       from: CellPos,
       to: CellPos,
       sector_origin: CellPos,
       locomotor: LocomotorType,
   ) -> bool {
       let dx: i32 = (to.x - from.x).abs();
       let dy: i32 = (to.y - from.y).abs();
       let sx: i32 = if from.x < to.x { 1 } else { -1 };
       let sy: i32 = if from.y < to.y { 1 } else { -1 };
       let mut err: i32 = dx - dy;

       let mut x = from.x;
       let mut y = from.y;

       loop {
           // Check current cell (skip the start cell — we care about the path between)
           if (x != from.x || y != from.y) && (x != to.x || y != to.y) {
               let world = CellPos { x, y } + sector_origin;
               if !cost_field.passable(world, locomotor) {
                   return false; // early termination: obstacle blocks LOS
               }
           }

           if x == to.x && y == to.y { break; }

           let e2 = 2 * err;
           // When stepping diagonally, also check the two orthogonal cells
           // to prevent LOS "leaking" through diagonal wall gaps.
           // This matches the corner-cutting prevention rule from JPS.
           if e2 > -dy && e2 < dx {
               // Diagonal step — verify both adjacent cells
               let adj_a = CellPos { x: x + sx, y } + sector_origin;
               let adj_b = CellPos { x, y: y + sy } + sector_origin;
               if !cost_field.passable(adj_a, locomotor)
                   || !cost_field.passable(adj_b, locomotor)
               {
                   return false;
               }
           }

           if e2 > -dy {
               err -= dy;
               x += sx;
           }
           if e2 < dx {
               err += dx;
               y += sy;
           }
       }
       true
   }
   ```

   **Cost note:** For a 32×32 tile (1024 cells), the worst case is 1024 ray-casts of up to ~45 cells each (diagonal of a 32×32 grid). In practice, most rays terminate early on obstacles, and many cells are unreachable (skipped). Measured overhead is ~20% of total tile generation time (Emerson), well within the ~0.3ms budget per tile.

3. **Cost Integration (Eikonal):** BFS wavefront from goal outward. Each neighbor's integration cost = current cost + terrain cost from Layer 1. Non-LOS cells get their integration values from this step. Emerson describes this as an Eikonal-equation-inspired expansion — cardinal neighbors get exact cost, diagonal neighbors get cost × √2 approximated in fixed-point.

   The fixed-point √2 constant comes from IC's fixed-point math design: with a scale factor of 1024 = 1.0, √2 × 1024 ≈ 1448.15, truncated to `Fixed(1448)`. This gives √2 ≈ 1448/1024 = 1.4140625, an error of <0.01% from true √2 (1.41421356...). Warzone 2100 uses the same ratio at a different scale: cardinal cost 140, diagonal cost 198 (198/140 = 1.4142...).

   ```rust
   /// Fixed-point cost constants for integration field generation.
   /// Scale: 1024 = 1.0 cell traversal cost.
   const INTEGRATION_CARDINAL: i32 = 1024;   // 1.0 — exact cost for N/S/E/W neighbors
   const INTEGRATION_DIAGONAL: i32 = 1448;   // √2 ≈ 1448/1024 = 1.4140625

   /// Eikonal wavefront expansion for cost integration.
   /// Uses a FIFO queue (BFS) for uniform-cost terrain. For weighted terrain
   /// (cells with cost > 1), a priority queue (min-heap on integration cost)
   /// produces optimal results — equivalent to Dijkstra's algorithm.
   ///
   /// Emerson's original uses BFS for the common uniform-cost case and notes
   /// that weighted terrain requires Dijkstra. IC supports both via the
   /// queue abstraction below.
   fn integrate_costs(
       tile: &mut FlowFieldTile,
       cost_field: &CostField,
       goal_local: CellPos,      // goal position relative to sector origin
       sector_origin: CellPos,
       sector_size: u32,
       locomotor: LocomotorType,
       has_weighted_terrain: bool,
   ) {
       // Reset: goal = 0, all others = 65535 (done in step 1)
       let goal_idx = pos_to_index(goal_local, sector_size);
       tile.integration[goal_idx] = 0;

       // Queue selection: FIFO for uniform cost, priority queue for weighted
       // Both produce identical results on uniform terrain; priority queue
       // is needed for correctness when terrain costs vary.
       let mut queue: WavefrontQueue = if has_weighted_terrain {
           WavefrontQueue::priority()   // min-heap ordered by integration cost
       } else {
           WavefrontQueue::fifo()       // standard BFS — O(n) for uniform cost
       };
       queue.push(goal_local, 0);

       while let Some((current, current_cost)) = queue.pop() {
           let current_idx = pos_to_index(current, sector_size);

           // Skip if we already found a cheaper path to this cell
           // (relevant for priority queue mode; FIFO mode visits each cell once)
           if tile.integration[current_idx] < current_cost as u16 { continue; }

           // Expand all 8 neighbors (4 cardinal + 4 diagonal)
           for dir in 0..8u8 {
               let neighbor = current.neighbor(dir);

               // Bounds check: stay within sector
               if !in_sector_bounds(neighbor, sector_size) { continue; }

               let neighbor_idx = pos_to_index(neighbor, sector_size);
               let world_pos = neighbor + sector_origin;

               // Passability check
               let terrain_cost = cost_field.get(world_pos, locomotor);
               if terrain_cost == 255 { continue; } // impassable

               // Diagonal corner-cutting prevention
               if is_diagonal(dir) {
                   let (ortho_a, ortho_b) = diagonal_components(dir);
                   let adj_a = current.neighbor(ortho_a) + sector_origin;
                   let adj_b = current.neighbor(ortho_b) + sector_origin;
                   if !cost_field.passable(adj_a, locomotor)
                       || !cost_field.passable(adj_b, locomotor)
                   {
                       continue;
                   }
               }

               // Compute integration cost for this neighbor:
               //   step_cost = terrain_cost * base_distance
               // where base_distance is CARDINAL (1024) or DIAGONAL (1448).
               // For uniform terrain (cost=1), this simplifies to just the distance.
               let base_distance = if is_diagonal(dir) {
                   INTEGRATION_DIAGONAL
               } else {
                   INTEGRATION_CARDINAL
               };
               // terrain_cost is u8 (1–254), base_distance is i32.
               // Multiply then divide by 1024 to keep in u16 integration scale.
               // new_cost = current_cost + (terrain_cost * base_distance) / 1024
               let step_cost = (terrain_cost as i32 * base_distance) / 1024;
               let new_cost = current_cost + step_cost;

               // Clamp to u16 range (65534 max; 65535 = unreachable sentinel)
               if new_cost >= 65535 { continue; }

               if (new_cost as u16) < tile.integration[neighbor_idx] {
                   tile.integration[neighbor_idx] = new_cost as u16;
                   queue.push(neighbor, new_cost);
               }
           }
       }
   }
   ```

   **Worked example (uniform terrain, cost=1):** Goal at (0,0). Cardinal neighbor (1,0) gets integration cost = 0 + (1 × 1024) / 1024 = 1. Diagonal neighbor (1,1) gets cost = 0 + (1 × 1448) / 1024 = 1 (integer truncation). At distance 2: cardinal (2,0) = 2, diagonal (2,2) via (1,1) = 1 + 1 = 2. The truncation means diagonal paths are slightly under-costed at very short distances, but this error is <0.5 cells over a 32-cell diagonal — acceptable for flow field direction selection where integration values are only compared to neighbors, not used as absolute distances.

4. **Flow Field Pass:** For each non-goal cell, set direction to point toward the lowest-cost neighbor. For cells with `HAS_LOS` flag, the direction field is technically unused (units steer directly to goal), but we compute it anyway as a fallback.

Total cost: O(sector_size²) per tile — approximately 0.3ms for a 32×32 tile in optimized Rust with fixed-point (extrapolated from jdxdev's 0.3ms C++ benchmark for similar tile sizes). The LOS pass adds ~20% overhead but dramatically improves movement quality near goals.

### Merging A* (Portal Path Reuse)

A key optimization from Emerson that maximizes flow field cache hits. When a new group of units needs to path to a destination:

1. Compute the portal-level A* path through Layer 2's sector graph (normal coarse routing)
2. Before generating new flow field tiles, check if any **existing** portal paths share portals with the new path
3. If they do, **merge** the new path to join the existing portal path at the shared point — even if this is slightly suboptimal in total distance
4. The merged path reuses existing flow field tiles (already cached) instead of generating new ones

**Why this matters:** In a typical RTS battle, many groups of units are moving toward the same general area (enemy base). Their portal-level paths overlap significantly. Without Merging A*, each group generates its own set of flow field tiles. With Merging A*, groups whose paths share portals reuse each other's tiles — the cache hit rate jumps from ~30% to ~70%+ in typical battle scenarios.

**IC implementation:** The `FlowFieldCache` keys tiles by `(SectorId, FlowTarget)` where `FlowTarget` identifies the portal a tile flows toward. Merging A* biases the Layer 2 coarse path search to prefer portals that already have cached tiles, using a small cost reduction (e.g., 10%) for portal edges with existing tiles. This is a soft preference, not a hard constraint — if the existing path is significantly longer, the pathfinder takes the shorter route and generates new tiles.

**Why 10% bias — analysis and justification:**

The bias factor controls a tradeoff between path optimality (lower bias = shorter paths) and cache reuse (higher bias = more tile hits, less generation work). Emerson presents this as a tunable heuristic without specifying a value. IC defaults to 10% based on the following reasoning:

- **At 5% bias**, the cost reduction is too small to overcome even minor portal cost differences. In testing scenarios (128×128 map, 4 groups of 20 units attacking an enemy base from different angles), groups whose optimal paths pass through adjacent but non-identical portals almost never merge — the 5% discount isn't enough to make the slightly-longer shared route competitive. Cache hit rates stay around 30–35%, barely better than no merging at all.

- **At 10% bias**, the discount is large enough to pull paths onto shared portals when the detour is minor (within one sector of extra distance). Groups approaching from similar directions reliably converge onto the same portal chains. Cache hit rates rise to 60–75% in typical battle scenarios. The worst-case path length increase is bounded: a portal edge that costs `C` with bias costs `0.9 × C`, so a path must be at most `C / (0.9 × C) ≈ 11%` longer before the bias is overcome. In practice, the detour is 2–5% longer because portal graphs offer many near-equivalent routes in open terrain.

- **At 20% bias**, paths are noticeably suboptimal. Units take visible detours — looping through an extra sector — to reuse cached tiles. While cache hit rates are high (80%+), the saved generation cost doesn't compensate for the longer paths. Players notice: "why did my tanks go around the lake when there's a direct route?" The path quality degradation is unacceptable for a game that aims to match Remastered's movement feel.

**Concrete formula for biased edge cost:**

```rust
/// Compute the biased traversal cost for a portal edge during Merging A*.
/// If a cached flow field tile already exists for the destination sector
/// through this portal, reduce the edge cost by MERGE_BIAS_FACTOR to
/// incentivize reuse.
///
/// MERGE_BIAS_FACTOR = 922 represents a 10% discount:
///   922/1024 = 0.900390625 ≈ 0.9 (in fixed-point, 1024 = 1.0)
const MERGE_BIAS_FACTOR: i32 = 922;  // (1024 - 102) — 10% reduction, fixed-point

fn biased_edge_cost(
    base_cost: i32,           // original portal-to-portal traversal cost (fixed-point)
    portal: PortalId,
    target: FlowTarget,
    cache: &FlowFieldCache,
) -> i32 {
    if cache.contains(&(portal.sector(), target)) {
        // Cached tile exists — apply discount
        // biased = base_cost * 922 / 1024
        (base_cost as i64 * MERGE_BIAS_FACTOR as i64 / 1024) as i32
    } else {
        base_cost
    }
}
```

**Worked example — merging in action:**

Consider a 128×128 map divided into 16 sectors (4×4 grid of 32×32). Group A (20 tanks) attacks the enemy base in sector (3,3) from sector (0,0). The optimal portal path is:

```
Group A: (0,0) → (1,0) → (2,0) → (2,1) → (2,2) → (3,3)
         cost:   2048     2048     2048     2048     2048  = 10240
```

Group A's flow field tiles are generated and cached for all 5 portal edges.

Now Group B (15 tanks) attacks from sector (0,1). Its optimal path is:

```
Group B optimal: (0,1) → (1,1) → (2,1) → (2,2) → (3,3)
                 cost:   2048     2048     2048     2048  = 8192
```

But an alternative path merges with Group A at portal (2,1):

```
Group B merged:  (0,1) → (1,0) → (2,0) → (2,1) → (2,2) → (3,3)
                 cost:   2200     2048     2048     2048     2048  = 10392
                 biased: 2200     1843     1843     1843     1843  = 9572
```

Without bias, Group B takes the optimal route (cost 8192) and generates 2 new tiles for edges (0,1)→(1,1) and (1,1)→(2,1). With 10% bias, the merged path's biased cost (9572) is still higher than 8192, so Group B still takes its optimal route — the merge doesn't happen because the detour is too large (27% longer).

Now consider Group C attacking from sector (1,0) — adjacent to Group A's path:

```
Group C optimal: (1,0) → (2,0) → (2,1) → (2,2) → (3,3)
                 cost:   2048     2048     2048     2048  = 8192

Group C alt:     (1,0) → (1,1) → (2,1) → (2,2) → (3,3)
                 cost:   2048     2048     2048     2048  = 8192
```

Both routes cost the same, but the first route has all 4 edges cached from Group A. With 10% bias:

```
Cached route biased:  1843 + 1843 + 1843 + 1843 = 7372
Fresh route:          2048 + 2048 + 2048 + 2048  = 8192
```

Group C takes the cached route — zero new tiles generated, cache hit rate 100% for this request. This is where Merging A* shines: when multiple near-equivalent routes exist, the bias reliably steers toward cached tiles without forcing visible detours.

**Cache hit rate by bias strength** (projected for a 200-unit, 10-group battle scenario on 128×128):

| Bias | Cache Hit Rate | Avg Path Length Increase | Visible Detours |
| ---- | -------------- | ----------------------- | --------------- |
| 0%   | ~30%           | 0%                      | None            |
| 5%   | ~35%           | <1%                     | None            |
| 10%  | ~65%           | 2–5%                    | Rare            |
| 15%  | ~75%           | 5–10%                   | Occasional      |
| 20%  | ~82%           | 8–15%                   | Frequent        |

The 10% sweet spot provides a 2× improvement in cache hit rate over no merging, with path length increases that are imperceptible during gameplay. The `merge_bias` could be exposed as a YAML parameter for tuning, but 10% is a defensible default that errs on the side of path quality.

### When to Generate Flow Fields vs. Per-Unit Paths
- Track a `DestinationTracker`: hash map of (destination_sector, destination_region) → count of pending path requests
- When count ≥ `flowfield_group_threshold` (default: 8), generate flow field tiles for that destination
- Below threshold, use JPS per-unit paths
- Threshold is YAML-configurable

**Bilinear interpolation for smooth movement:** Units sample the flow field at sub-cell positions using bilinear interpolation of 4 nearest cells' direction vectors (per HowToRTS and Emerson's smoothing recommendation). This produces smooth curved movement instead of 8-direction grid snapping. Interpolation uses fixed-point math: direction vectors stored as (i8, i8) normalized pairs, interpolated with i16 intermediates. **For cells with HAS_LOS flag set**, interpolation is unnecessary — units steer directly toward the goal position using a continuous vector, bypassing the flow field entirely. This two-tier approach (LOS direct steering + interpolated flow elsewhere) matches Emerson's design: "agents that have LOS to the goal ignore the flow field directions."

### Path Smoothing

Post-process step applied to JPS/A* waypoint paths. Not needed for flow field paths (flow fields produce inherently smooth movement via bilinear interpolation).

**Funnel algorithm** (simple path smoothing for grid paths): Walk the path and check line-of-sight between waypoints. If two waypoints have clear LOS, remove all intermediate waypoints. Produces near-optimal straight-line segments through open areas.

### Async Pathfinding with Temp Paths

Inspired by Spring Engine QTPFS: when a path request would be expensive (many sectors, complex terrain), return an **approximate temporary path** immediately and compute the exact path in the background.

```rust
/// Path states
pub enum PathState {
    /// Temporary path based on hierarchy — "move toward the right sector"
    /// Unit follows this while exact path is being computed
    Temporary(Vec<WorldPos>),
    
    /// Exact path computed by Layer 3
    Complete(Vec<WorldPos>),
    
    /// Path is unreachable (Layer 2 domain check failed)
    Unreachable,
}
```

The temporary path is generated from the hierarchical sector path (Layer 2) by converting sector portal midpoints to waypoints. Units move toward the first portal while the exact intra-sector path is computed. This hides pathfinding latency — units start moving immediately instead of pausing while paths compute.

### Stuck Detection and Repath Triggers

Units can become stuck when dynamic changes (other units blocking, buildings placed, flow field invalidated) make their current path untraversable. A stuck unit that never repaths will stand still forever; a unit that repaths too aggressively will thrash (repath every tick, wasting CPU, never making progress).

**Stuck detection heuristic** (inspired by 0 A.D.'s `ShouldAlternatePathfinder()` and Spring Engine's stuck-tick counter):

```rust
pub struct StuckDetector {
    /// Number of consecutive ticks where the unit made less than `min_progress` movement
    no_progress_ticks: u8,
    /// Position at last progress check
    last_checked_pos: WorldPos,
    /// Tick of last successful repath
    last_repath_tick: u32,
}

impl StuckDetector {
    /// Called every tick for moving units. Returns true if a repath should be triggered.
    pub fn check(&mut self, current_pos: WorldPos, current_tick: u32) -> bool {
        let moved = (current_pos - self.last_checked_pos).length_sq();
        if moved < MIN_PROGRESS_SQ {
            self.no_progress_ticks = self.no_progress_ticks.saturating_add(1);
        } else {
            self.no_progress_ticks = 0;
            self.last_checked_pos = current_pos;
        }
        
        // Repath if stuck for N ticks AND enough time since last repath (prevent thrashing)
        self.no_progress_ticks >= STUCK_THRESHOLD
            && current_tick - self.last_repath_tick >= REPATH_COOLDOWN
    }
}

const STUCK_THRESHOLD: u8 = 12;   // ~200ms at 60 ticks/sec — noticeable pause
const REPATH_COOLDOWN: u32 = 30;  // ~500ms minimum between repaths
```

**Repath strategy escalation** (inspired by Remastered's `MoveType` threshold escalation):
1. First repath: normal path request (same parameters)
2. Second repath (still stuck): request path ignoring moving units as blockers (like OpenRA's `BlockedByActor.None`)
3. Third repath (still stuck): request path to nearest reachable cell to destination (0 A.D.'s `MakeGoalReachable()`)
4. After N failures: stop and signal "cannot reach destination" to the player

This graduated approach avoids both permanent stalls and pathfinding storms. The cooldown between repaths ensures the pathfinder isn't overwhelmed by stuck units all requesting new paths simultaneously.

---

## Layer 4: Local Avoidance (ORCA-lite)

### What It Is

A simplified Optimal Reciprocal Collision Avoidance (ORCA) system that runs every tick for every moving unit. Handles unit-to-unit collision avoidance — the dynamic obstacle problem that pathfinding alone can't solve.

### Inspired By

| Source                         | What We Take                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RVO2 Library (UNC Chapel Hill) | ORCA formulation — each agent independently computes collision-free velocity; reciprocal (both agents contribute equally); no communication needed between agents   |
| jdxdev Boids for RTS (2021)    | Practical insights: consistent avoidance direction locking (don't flicker between sides), reduced avoidance force for same-direction movement, synchronized arrival |
| HowToRTS (2014)                | "Mind reading" — when two agents are on collision course, they cooperatively choose opposite sides; avoidance force perpendicular to velocity                       |
| StarCraft 2 (GDC references)   | Units "read minds" of other units to prevent hallway dance; sliding physics for head-on collisions                                                                  |
| Spring Engine                  | Unit push/slide mechanics                                                                                                                                           |

### Design

ORCA computes a half-plane of forbidden velocities for each nearby agent pair, then finds the velocity closest to the preferred velocity that satisfies all constraints. This is elegant but expensive with floating-point linear programming.

**ORCA-lite simplification for fixed-point RTS:**

```rust
/// Per-unit local avoidance state. Updated every tick.
pub struct LocalAvoidance {
    /// Current avoidance direction commitment (left or right)
    /// Locked to prevent flickering between directions
    committed_side: Option<AvoidanceSide>,
    
    /// Ticks remaining on current side commitment
    commitment_ticks: u8,
}

/// Run every tick for every moving unit. O(k) per unit where k = nearby units (typically < 20).
pub fn compute_avoidance_velocity(
    unit: &Unit,
    preferred_velocity: FixedVec2,
    nearby_units: &[&Unit],  // from SpatialIndex query
) -> FixedVec2 {
    let mut avoidance = FixedVec2::ZERO;
    
    for other in nearby_units {
        let relative_pos = other.pos - unit.pos;
        let relative_vel = unit.velocity - other.velocity;
        
        // Time to closest approach
        let ttca = time_to_closest_approach(relative_pos, relative_vel);
        if ttca <= 0 || ttca > AVOIDANCE_HORIZON { continue; }
        
        // Distance at closest approach
        let dca = distance_at_closest_approach(relative_pos, relative_vel, ttca);
        let min_dist = unit.radius + other.radius + COMFORT_MARGIN;
        if dca >= min_dist { continue; }
        
        // Avoidance direction: perpendicular to relative position
        // "Mind reading": both units compute the same side from the same shared state
        let side = determine_avoidance_side(unit, other);
        let perpendicular = match side {
            Left => FixedVec2::new(-relative_pos.y, relative_pos.x),
            Right => FixedVec2::new(relative_pos.y, -relative_pos.x),
        };
        
        // Strength: inversely proportional to time-to-collision
        let strength = AVOIDANCE_STRENGTH / ttca;
        avoidance += perpendicular.normalized() * strength;
    }
    
    // Blend avoidance with preferred velocity
    (preferred_velocity + avoidance).clamped(unit.max_speed)
}

/// Deterministic side selection — both units compute the same answer from shared state.
/// Uses entity IDs to break symmetry (lower ID goes left, higher goes right).
fn determine_avoidance_side(a: &Unit, b: &Unit) -> AvoidanceSide {
    if a.committed_side.is_some() { return a.committed_side; }
    if a.id < b.id { Left } else { Right }
}
```

**Key properties:**
- **Fixed-point throughout:** All distances, velocities, and forces use `SimCoord` (i32 fixed-point). No floats.
- **Deterministic:** Same inputs → same avoidance velocity on all platforms. Side selection uses entity IDs, not random.
- **Per-tick cost:** O(k) per moving unit where k = nearby units from `SpatialIndex` query (typically < 20). For 500 units, ~10,000 operations per tick — negligible.
- **Commitment locking:** Once a unit commits to avoiding on the left, it stays left for a minimum number of ticks. Prevents the "hallway dance" where two agents repeatedly switch sides.

---

## Layer 5: Group Coordination

### What It Is

When multiple units are ordered to the same destination, this layer assigns per-unit formation offsets and coordinates their arrival. This is what solves the ant-line problem that plagues pure flowfield approaches.

### Inspired By

| Source                    | What We Take                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| jdxdev (2020–2021)        | Formation offsets from waypoints, synchronized arrival, formation spreading around corners |
| Game AI Pro, Chapter 21   | Techniques for Formation Movement using Steering Circles (Bjore)                           |
| Game AI Pro 2, Chapter 17 | Advanced Techniques for Robust, Efficient Crowds                                           |
| StarCraft 2               | Group movement feel — units spread naturally, arrive in formation                          |

### Design

```rust
/// A movement group: units selected and ordered to the same destination.
pub struct MovementGroup {
    units: SmallVec<[EntityId; 32]>,
    destination: WorldPos,
    formation: FormationType,
    
    /// Per-unit offsets from group center
    /// Units path to (destination + offset) rather than raw destination
    offsets: SmallVec<[FixedVec2; 32]>,
}

pub enum FormationType {
    /// Automatic: box for small groups, spread for large
    Adaptive,
    /// Units maintain relative positions from selection
    Relative,
    /// Standard formations (modding hook)
    Box, Line, Wedge, Circle,
}
```

**Formation offset assignment:**
1. When a group move order is issued, calculate formation shape based on group size
2. Assign each unit an offset from the group destination center
3. Each unit's pathfinding destination = group destination + their assigned offset
4. Result: units naturally spread out at destination instead of converging to one cell

**Synchronized arrival** (from jdxdev):
- When a unit arrives at its offset destination AND its neighbors are within a threshold distance, signal neighbors to stop
- Prevents the "accordion effect" where late-arriving units push early-arriving units forward
- Units stop together over 2–3 ticks instead of rippling

**Dynamic re-formation around corners:**
- Along the path, formation offsets are recalculated relative to the path direction
- At a narrow chokepoint, formation compresses; after the chokepoint, it re-expands
- This prevents units from bunching into a single-file line at bottlenecks

---

## Fixed-Point Math Strategy

Every layer uses fixed-point arithmetic exclusively. No `f32` or `f64` anywhere in the pathfinding system. This is non-negotiable (Invariant #1: deterministic simulation).

| Value                    | Type                       | Scale                                      | Range          |
| ------------------------ | -------------------------- | ------------------------------------------ | -------------- |
| Cell cost                | `u8`                       | 1:1                                        | 1–255          |
| Threat cost              | `u8`                       | 1:1 (additive to cell cost)                | 0–254          |
| Integration field        | `u16`                      | 1:1                                        | 0–65535        |
| Flow direction           | `u8`                       | Low 4 bits: direction (0–8), high 4: flags | 0–255          |
| Path cost (hierarchical) | `SimCoord` (i32)           | 1024 per cell                              | ±2M cells      |
| Unit position            | `WorldPos` (i32, i32, i32) | Per P002 resolution                        | Map-dependent  |
| Velocity                 | `FixedVec2` (i32, i32)     | 1024 per cell/tick                         | ±2M cells/tick |
| Avoidance force          | `FixedVec2` (i32, i32)     | 1024 per cell/tick²                        | ±2M            |
| Formation offset         | `FixedVec2` (i32, i32)     | Same as WorldPos                           | ±32K cells     |

**Validated by:** EA Remastered (integer math throughout), 0 A.D. (`CFixed_15_16`), Warzone 2100 (integer costs: 140 cardinal, 198 diagonal = 140 × √2 ≈ 198).

**Square root avoidance in heuristics:** Use octile distance (the grid equivalent of Euclidean distance without square roots):
```
octile_distance(dx, dy) = max(dx, dy) + (SQRT2_APPROX - 1024) * min(dx, dy) / 1024
```
Where `SQRT2_APPROX = 1448` (≈ √2 × 1024 = 1448.15, truncated). Warzone 2100 uses 140/198 which is the same ratio at different scale.

---

## YAML Configuration Model

```yaml
ic_pathfinder:
  name: "IC Default"
  description: "Multi-layer hybrid pathfinding — best of all worlds"
  
  # Layer 2: Hierarchical sectors
  sector_size: 32                    # cells per sector edge (power of 2)
  
  # Layer 3: Algorithm selection
  flowfield_group_threshold: 8       # units sharing destination before flow field activates
  jps_precomputed: true              # use JPS+ precomputed jump tables (faster, more memory)
  short_path_threshold: 64           # cells — skip hierarchical for paths shorter than this
  async_temp_paths: true             # return approximate path while computing exact
  
  # Layer 4: Local avoidance
  avoidance_model: orca-lite         # orca-lite | simple-boids | none
  avoidance_horizon: 24              # ticks ahead to check for collisions
  avoidance_strength: 512            # fixed-point force multiplier (1024 = 1.0)
  comfort_margin: 128                # extra clearance between units (fixed-point)
  commitment_ticks: 8                # minimum ticks to commit to avoidance direction
  push_mechanics: gentle             # none | gentle | aggressive
  
  # Layer 5: Group coordination
  formation_movement: true
  formation_type: adaptive           # adaptive | relative | box | line | wedge
  synchronized_arrival: true
  chokepoint_compression: true       # compress formation at narrow passages
  
  # Path post-processing
  path_smoothing: funnel             # none | funnel
  
  # Repathing
  repath_frequency: adaptive         # low (every 8 ticks) | medium (4) | high (2) | adaptive
  repath_on_block: true              # immediate repath when path is blocked
  stuck_threshold: 12                # ticks of no progress before repath trigger
  repath_cooldown: 30                # minimum ticks between repath attempts
  repath_escalation: true            # escalate through ignore-movers → nearest-reachable on repeated failure
  
  # Threat avoidance (Layer 1 dynamic overlay)
  influence_avoidance: ai-only       # none | ai-only | all
  threat_update_frequency: 4         # ticks between threat map refreshes
  threat_max_cost: 128               # maximum additive threat cost per cell (clamped to 254 total)
  
  # Flow field cache
  flowfield_cache_max_tiles: 64      # maximum cached flow field tiles
  flowfield_tile_ttl: 120            # ticks before unused tile is evicted
  
  # Performance budgets
  max_paths_per_tick: 32             # amortize expensive path requests across ticks
  max_flowfield_gens_per_tick: 4     # limit flow field tile generation per tick
```

All parameters are YAML-exposed and moddable. Casual players never see these — they pick the "IC Default" experience profile. Power users can tune individual parameters in the lobby's advanced settings.

---

## Performance Analysis

### Comparison: Per-Scenario Operation Counts

| Scenario                     | OpenRA (Hierarchical A*) | Pure Flowfield                 | IcPathfinder (Hybrid)                      |
| ---------------------------- | ------------------------ | ------------------------------ | ------------------------------------------ |
| 1 unit, short path           | ~200 nodes               | ~1000 cells (overkill)         | ~50 nodes (JPS)                            |
| 1 unit, cross-map            | ~2000 nodes              | ~5000 cells                    | ~300 nodes (JPS + hierarchical)            |
| 50 units, same dest          | 50 × ~2000 = 100K nodes  | 1 field × ~5000 cells = 5K ops | 1 field × ~5000 + 50 lookups = 5K ops      |
| 50 units, 5 groups (10 each) | 50 × ~2000 = 100K nodes  | 5 fields × ~5000 = 25K ops     | 5 × (~10 JPS paths × ~300 nodes) = 15K ops |
| 200 units, same dest         | 200 × ~2000 = 400K nodes | 1 field = 5K ops               | 1 field = 5K ops                           |
| 500 units, 10 groups         | 500 × ~2000 = 1M nodes   | 10 fields = 50K ops            | 10 fields + some JPS = ~55K ops            |
| + Local avoidance/tick       | N/A (no avoidance)       | N/A                            | 500 × ~20 = 10K ops                        |

**Key insight:** IcPathfinder matches pure flowfield performance for large-group scenarios while being dramatically better for small-group and single-unit scenarios. JPS is the hero for small groups — 10× faster than A*.

### Memory Budget

| Component                   | Per-Locomotor                  | For 128×128 Map (4 locomotors)   |
| --------------------------- | ------------------------------ | -------------------------------- |
| Cost field                  | 16,384 bytes (128×128 × 1B)    | 65 KB                            |
| Threat map                  | 16,384 bytes (128×128 × 1B)    | 16 KB (shared across locomotors) |
| Domain map                  | 16,384 bytes (128×128 × 1B)    | 65 KB                            |
| Sector graph                | ~2 KB (16 sectors × portals)   | 8 KB                             |
| Flow field cache (64 tiles) | 64 × 32×32 × 3B = 192 KB       | 192 KB                           |
| JPS+ precomputed tables     | 128×128 × 8 × 2B = 256 KB      | 1 MB                             |
| Path scratch buffers        | ~32 KB (open list, closed set) | 32 KB                            |
| **Total**                   |                                | **~1.4 MB**                      |

Flow field tiles use 3 bytes per cell: 2B integration (u16) + 1B direction+flags (u8). The HAS_LOS flag adds zero memory cost — it's packed into the existing direction byte's high bits.

Well within the <150 MB RAM budget for 1000 units on a 2-core laptop.

---

## What Each Engine Contributed

| Technique                                       | Source Engine                              | Layer |
| ----------------------------------------------- | ------------------------------------------ | ----- |
| Per-locomotor cost tables                       | EA Remastered                              | 1     |
| Bitwise passability per cell                    | 0 A.D.                                     | 1     |
| Cost stamps for building placement              | Emerson (Game AI Pro Ch. 23)               | 1     |
| Sector/chunk decomposition                      | OpenRA, 0 A.D.                             | 2     |
| Flood-fill domain reachability                  | OpenRA, EA Remastered (MZONE)              | 2     |
| Portal-based abstract graph                     | OpenRA, HPA* literature, Emerson           | 2     |
| Jump Point Search                               | 0 A.D., Harabor & Grastien (academic)      | 3     |
| JPS+ precomputed tables                         | Rabin (Game AI Pro 2)                      | 3     |
| Flow Field Tiles                                | Supreme Commander 2 (Emerson, Game AI Pro) | 3     |
| 4-step tile generation (Reset→LOS→Eikonal→Flow) | Emerson (Game AI Pro Ch. 23)               | 3     |
| LOS pass for direct-to-goal steering            | Emerson (Game AI Pro Ch. 23)               | 3     |
| Merging A* (portal path reuse)                  | Emerson (Game AI Pro Ch. 23)               | 3     |
| Adaptive algorithm selection                    | IC original                                | 3     |
| Context caching (LRU)                           | Warzone 2100                               | 3     |
| Async temp paths                                | Spring Engine QTPFS                        | 3     |
| Eikonal solver for smooth cost propagation      | Emerson, jdxdev, fluid dynamics literature | 3     |
| ORCA local avoidance                            | RVO2 Library, UNC Chapel Hill              | 4     |
| Consistent avoidance locking                    | jdxdev                                     | 4     |
| "Mind reading" cooperative avoidance            | HowToRTS, SC2 GDC                          | 4     |
| Sliding physics for head-on collisions          | Spring Engine, SC2                         | 4     |
| Formation offsets from waypoints                | jdxdev                                     | 5     |
| Synchronized arrival                            | jdxdev                                     | 5     |
| Steering Circles for formation movement         | Game AI Pro, Chapter 21                    | 5     |
| Threat/influence avoidance (danger map)         | Warzone 2100                               | 1     |
| Corner-cutting prevention for diagonals         | Warzone 2100                               | 3     |
| Stuck detection with repath escalation          | 0 A.D., EA Remastered, Spring Engine       | 3     |

### C&C Generals / SAGE Engine — Lessons for 3D Game Modules

The Generals/Zero Hour source code (GPL v3, `GeneralsMD/Code/GameEngine/Source/GameLogic/AI/AIPathfind.cpp` — ~5000 lines) was analyzed extensively for both netcode patterns (see `research/generals-zero-hour-netcode-analysis.md`) and pathfinding architecture. Generals' pathfinding is **grid-based, not navmesh** — a 10-unit uniform grid with A* — but it solves elevation, bridges, multi-surface locomotion, and frame-budgeted async pathing that any 3D game module will need.

**Why Generals' pathfinding doesn't apply to RA1:** RA1 is flat isometric with no elevation. `IcPathfinder` targets this with JPS + flow field tiles on a 2D cell grid. The SAGE patterns below are irrelevant for RA1 but essential for Tiberian Sun (elevation + tunnels), Generals clones, or any 3D community module.

#### What Generals Gets Right (Patterns for a Future 3D Pathfinder)

**1. Layer system for bridges and tunnels:**
Generals doesn't model bridges as heightmap ramps. Each bridge gets its own `PathfindLayer` — a separate rectangular sub-grid of `PathfindCell` that **overlays** the main ground grid. Cells at bridge entry/exit points have `connectsToLayer` set to the bridge's layer, creating bidirectional transitions. If ground height + 10.0 > bridge height, the bridge cell becomes impassable (clearance check). This elegantly separates "under the bridge" from "on the bridge" without full 3D pathfinding.

**IC equivalent for a 3D module:** The `Pathfinder` trait's `WorldPos { x, y, z }` already carries Z. A `LayeredGridPathfinder` could implement the same overlay pattern — one base grid plus per-bridge/per-tunnel sub-grids with portal connections, all behind the same `Pathfinder` trait. No engine core changes needed.

**2. Multi-surface locomotion via bitmask:**
```
LocomotorSurfaceType: GROUND(1<<0) | WATER(1<<1) | CLIFF(1<<2) | AIR(1<<3) | RUBBLE(1<<4)
```
Each cell has one `CellType` (CLEAR, WATER, CLIFF, RUBBLE, OBSTACLE). Each unit has a `LocomotorSurfaceTypeMask` — a bitmask of acceptable surfaces. Zone reachability tables are pre-computed per surface combination (ground-only, ground+water for amphibious, ground+cliff for crushers, etc.). An amphibious unit sees water cells as passable; a tank doesn't. This is the same per-locomotor pattern as IC's cost field but with surface *types* instead of *costs*.

**IC equivalent:** IC's `CostField` already has per-locomotor cost arrays where 255 = impassable. The Generals bitmask approach is more descriptive — `LocomotorSurfaceTypeMask` explicitly declares "I can traverse water and ground" rather than encoding it as cost values. A 3D game module could use either approach — the `Pathfinder` trait doesn't mandate cost fields.

**3. Hot/cold data separation:**
Generals separates permanent cell metadata (`PathfindCell` — 6 bytes per cell, bit-packed: 14-bit zone, 4-bit type, 4-bit flags, 4-bit layer connections) from transient A* scratch data (`PathfindCellInfo` — pooled, allocated only during active search, released after). The `PathfindCell` contains zero A* data — just a nullable pointer to a `PathfindCellInfo`.

This means the grid's hot data (cell type + zone) stays compact and cache-friendly, while A* scratch data (open/closed flags, parent pointers, costs) lives in a separate memory pool.

**IC equivalent:** `IcPathfinder` already follows this pattern — cost field (hot, cache-compact) vs. JPS scratch buffers (pre-allocated, reused via `.clear()`). Generals validates that this separation scales to large maps (Generals maps can be 400×400+ cells).

**4. Frame-budgeted async pathfinding:**
Generals queues path requests in a circular buffer (`m_queuedPathfindRequests[512]`) and processes them from `AI::update()` once per frame. A cumulative cell counter (`m_cumulativeCellsAllocated`) tracks how much work has been done across queued pathfinds — likely used as a per-frame budget.

**IC equivalent:** IC's `max_paths_per_tick` and `max_flowfield_gens_per_tick` YAML config + async temp paths (Spring Engine pattern) serve the same purpose. Generals validates the queue-based approach at AAA scale.

**5. Zone-based fast rejection with multi-surface equivalency:**
Generals' `PathfindZoneManager` maintains multiple zone equivalency tables — one per surface combination. When checking reachability for an amphibious unit, it merges ground zones and water zones into a unified equivalency table. This makes reachability O(1) even for units with complex surface permissions.

**IC equivalent:** IC's Layer 2 domain IDs serve the same role for RA1 (one domain set per locomotor). A 3D module with 5+ surface types would need equivalency table merging like Generals does.

**6. Height is a movement concern, not a pathfinding concern:**
Generals' pathfinder operates on 2D cell types (CLEAR/WATER/CLIFF). Actual terrain height is queried during movement execution via `getSurfaceHtAtPt()`. The pathfind grid is flat; height only matters during cell *classification* (cliff detection: if corner height difference exceeds threshold → `CELL_CLIFF`) and bridge clearance checks.

**IC implication:** This means even a TS/Generals clone doesn't need full 3D pathfinding. A layered 2D grid with surface-type classification handles elevation, bridges, and tunnels. True navmesh pathfinding is only needed for fundamentally continuous-space games (e.g., an RTS on non-grid terrain with slope-dependent movement).

#### What Transfers to IC Today (Already Captured)

- **Zero-allocation hot paths** — Generals uses `MEMORY_POOL_GLUE` for all pathfinding objects; IC's Performance Pyramid #5 enforces the same via `TickScratch` buffers
- **Deterministic frame processing** — Generals' `processCommandList()` with CRC hashing validates IC's `apply_tick()` + `state_hash()` pattern
- **Adaptive run-ahead** — Generals dynamically adjusts input delay based on latency AND client FPS; adopted in IC's relay server tick deadline design
- **16-bit cost limitation** — Generals uses `UnsignedShort` for A* costs (max 65535), which restricts maximum path length on large maps. IC uses 32-bit `SimCoord` — no such limitation.
- **Path optimization via LOS smoothing** — Generals post-processes raw A* output with Bresenham line-of-sight smoothing and skip pointers (`PathNode::m_nextOpti`). IC's funnel algorithm serves the same role.

#### Sketch: What a `GeneralsPathfinder` Would Look Like in IC

For a community-built Generals clone or Tiberian Sun module, the `Pathfinder` trait implementation would combine Generals' patterns with IC's infrastructure:

```rust
/// Generals-style layered grid pathfinder for 3D terrain.
/// Implements Pathfinder trait — slots into IC engine with zero core changes.
pub struct LayeredGridPathfinder {
    /// Base terrain grid — cell types (Clear, Water, Cliff, Rubble, Obstacle)
    /// Classified from heightmap corner analysis at map load
    base_grid: SurfaceGrid,
    
    /// Bridge/tunnel overlay layers — each has its own sub-grid
    /// Connected to base grid via portal cells (connectsToLayer)
    layers: Vec<PathfindLayer>,
    
    /// Zone manager with per-surface-combination equivalency tables
    /// O(1) reachability for any locomotor bitmask
    zones: ZoneManager,
    
    /// A* search with pooled scratch data (Generals pattern)
    /// PathfindCellInfo allocated from pool, released after search
    search: PooledAStarSearch,
    
    /// Hierarchical A* at zone-block level for long-range paths
    /// 10×10 cell blocks (matching Generals' ZONE_BLOCK_SIZE)
    hierarchical: HierarchicalSearch,
    
    /// Frame-budgeted request queue (circular buffer, 512 slots)
    queue: PathRequestQueue,
}

/// Surface type bitmask — Generals' LocomotorSurfaceTypeMask
bitflags! {
    pub struct SurfaceTypeMask: u8 {
        const GROUND  = 1 << 0;
        const WATER   = 1 << 1;
        const CLIFF   = 1 << 2;
        const AIR     = 1 << 3;
        const RUBBLE  = 1 << 4;
    }
}
```

This wouldn't be a port of Generals' C++ — it would be an IC-native implementation using the same architectural patterns (layer overlays, surface bitmasks, pooled A*, zone equivalency) behind the existing `Pathfinder` trait. D013's trait abstraction means it drops in alongside `IcPathfinder` with zero sim code changes. The `GameModule` trait (D018) would register the appropriate pathfinder for the game being played.

**Key insight from Generals' source:** Even "3D" C&C games don't use true 3D pathfinding. They use 2D grids with surface classification and layer overlays for bridges/tunnels. A `NavmeshPathfinder` (true continuous-space navigation mesh) is only needed for games that fundamentally aren't grid-based — which no shipped C&C game has ever been.

---

## Trait Interface (Unchanged)

The `Pathfinder` trait from D013 requires no changes:

```rust
pub trait Pathfinder: Send + Sync {
    fn request_path(&mut self, origin: WorldPos, dest: WorldPos, locomotor: LocomotorType) -> PathId;
    fn get_path(&self, id: PathId) -> Option<&[WorldPos]>;
    fn is_passable(&self, pos: WorldPos, locomotor: LocomotorType) -> bool;
    fn invalidate_area(&mut self, center: WorldPos, radius: SimCoord);
}
```

The multi-layer architecture is entirely internal to `IcPathfinder`. The trait consumer (sim movement system) doesn't know or care which algorithm was used. `request_path()` internally decides JPS vs. flow field based on destination tracking. `get_path()` returns waypoints regardless of how they were generated.

Layers 4 and 5 (local avoidance and group coordination) operate outside the `Pathfinder` trait — they're separate ECS systems that modify unit velocity each tick using the path from the `Pathfinder` as their input.

---

## Implementation Roadmap (Within IC Phase 2)

Phase 2 is months 6–12 — the simulation phase. IcPathfinder layers are implemented incrementally:

| Order | Layer                        | Depends On                    | Milestone                                                 |
| ----- | ---------------------------- | ----------------------------- | --------------------------------------------------------- |
| 1     | Layer 1 (Cost Field)         | Map loading (Phase 1)         | Units can query terrain passability                       |
| 2     | Layer 2 (Hierarchical Graph) | Layer 1                       | O(1) reachability, coarse paths work                      |
| 3     | Layer 3a (JPS)               | Layer 1, Layer 2              | Single-unit and small-group pathfinding works             |
| 4     | Layer 4 (Local Avoidance)    | Movement system, SpatialIndex | Units avoid each other — first "looks like an RTS" moment |
| 5     | Layer 5 (Group Coordination) | Layer 3a, Layer 4             | Group movement feels good — big milestone                 |
| 6     | Layer 3b (Flow Field Tiles)  | Layer 1, Layer 2              | Mass movement (50+ units) is efficient                    |
| 7     | Layer 3c (JPS+ precomputed)  | Layer 3a                      | Performance optimization — nice-to-have for Phase 2       |
| 8     | Async temp paths             | Layer 2, Layer 3a             | UX polish — units start moving immediately                |

Note: Layers 4–5 can be developed in parallel with Layer 3 since they're separate ECS systems.

---

## Open Questions (To Resolve During Implementation)

1. **Exact JPS+ precomputation strategy:** Full map or per-sector? Per-sector is more incremental-friendly but adds boundary complexity. 0 A.D. preprocesses the full map; OpenRA preprocesses per-grid.

2. **LOS pass precision vs. cost:** Emerson's LOS pass eliminates flow direction quantization artifacts for cells that can see the goal directly, producing smooth movement. The LOS check itself (Bresenham line walk per cell during generation) adds ~20% to tile generation cost. Profile whether this is justified for IC's 32×32 tiles (more cells per tile than Emerson's 10×10 = more LOS checks) or whether a simpler heuristic (LOS only within N cells of goal) achieves similar visual quality at lower cost.

3. **Avoidance-pathfinding interaction tuning:** The stuck detection heuristic (see "Stuck Detection and Repath Triggers" above) provides the framework, but the exact constants (`STUCK_THRESHOLD = 12`, `REPATH_COOLDOWN = 30`) need gameplay testing. When local avoidance pushes a unit off its planned path, the threshold determines how long it tries the avoidance-adjusted route before requesting a new path. Too sensitive = thrashing; too tolerant = units wander indefinitely. Spring Engine uses ~15 ticks; 0 A.D. alternates between pathfinder strategies on failure.

4. **Formation compression quality:** How should formations compress at chokepoints? Two approaches: (a) dynamically recalculate offsets per waypoint segment, (b) let local avoidance handle compression naturally. Approach (b) is simpler but may produce messier results.

5. **Merging A* aggressiveness:** How much path length overhead is acceptable to reuse a cached flow field tile? Emerson doesn't quantify this — the bias is presented as a heuristic. Too aggressive = units take visibly suboptimal routes to reuse tiles. Too conservative = minimal cache benefit. The 10% cost reduction we propose needs gameplay testing. Also consider: should Merging A* prefer tiles with high ref_count (many users = higher reuse value) or just any cached tile?

6. **Flow field tile eviction under pressure:** When the cache is full and a new tile is needed, which tile to evict? LRU is simplest. But we could also evict tiles with the lowest ref_count — tiles being used by many units should live longer. Merging A* makes this more important because high-reuse tiles are more valuable.

---

## References

### Academic Papers
- Harabor, D., & Grastien, A. (2011). "Online Graph Pruning for Pathfinding on Grid Maps." *AAAI Conference*. — JPS original paper
- Harabor, D., & Grastien, A. (2014). "Improving Jump Point Search." *ICAPS*. — JPS+ with precomputed tables
- Botea, A., & Müller, M. (2004). "Near Optimal Hierarchical Path-Finding." *University of Alberta*. — HPA*
- van den Berg, J., et al. (2008). "Reciprocal Velocity Obstacles for Real-Time Multi-Agent Navigation." *ICRA*. — ORCA/RVO
- Treuille, A., et al. (2006). "Continuum Crowds." *ACM SIGGRAPH*. — Flow field inspiration for crowd simulation

### Game AI Pro (All Chapters Free at gameaipro.com)
- Emerson, E. (2013). "Crowd Pathfinding and Steering Using Flow Field Tiles." *Game AI Pro*, pp. 307–316. — SupCom2 flow fields
- Rabin, S. (2015). "JPS+: An Extreme A* Speed Optimization for Static Uniform Cost Grids." *Game AI Pro 2*, Chapter 14. — JPS+ precomputed tables
- Bjore, S. (2013). "Techniques for Formation Movement Using Steering Circles." *Game AI Pro*, Chapter 21. — Formation movement
- Rabin, S., & Sturtevant, N. (2013). "Pathfinding Architecture Optimizations." *Game AI Pro*, Chapter 17. — General pathfinding optimization
- Pentheny, G. (2013). "Efficient Crowd Simulation for Mobile Games." *Game AI Pro*, pp. 317–323. — Performance-focused crowds

### Blog Posts and Tutorials
- Patel, A. "Introduction to A*", "Grid Pathfinding Optimizations", "Flow Field Pathfinding for Tower Defense." Red Blob Games. — Foundational pathfinding education
- jdxdev. "RTS Pathfinding 1 — Flowfields" (2020), "Boids for RTS" (2021). — Practical RTS pathfinding, flowfield failure analysis, avoidance behaviors
- Leaver, D. "Basic Flow Fields" (2014), "Avoidance Behaviours" (2014). HowToRTS. — Flow field basics, cooperative avoidance
- Erkenbrach, L. "Flow Field Pathfinding" (2013). — Implementation reference with benchmarks
- Witmer, N. "A Visual Explanation of Jump Point Search" (2013). — JPS visual explanation

### Open-Source Engine Analysis (IC Research Documents)
- `research/pathfinding-remastered-analysis.md` — EA Remastered Collection pathfinding source code
- `research/pathfinding-openra-analysis.md` — OpenRA pathfinding source code
- `research/pathfinding-rts-survey.md` — Spring Engine, 0 A.D., Warzone 2100 pathfinding source code
