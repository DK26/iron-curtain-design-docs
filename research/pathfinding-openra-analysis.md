# Pathfinding in OpenRA (C#)

> Source: [OpenRA/OpenRA](https://github.com/OpenRA/OpenRA) (GPL v3)
> Files analyzed: `OpenRA.Mods.Common/Pathfinder/HierarchicalPathFinder.cs`, `OpenRA.Mods.Common/Pathfinder/PathSearch.cs`, `OpenRA.Mods.Common/Pathfinder/PathFinder.cs`, `OpenRA.Mods.Common/Traits/World/Locomotor.cs`
> Relevance: Basis for `OpenRaPathfinder` implementation (D045)

## Executive Summary

OpenRA uses a **Hierarchical A*** (HPA*) pathfinder with two layers: an abstract graph of regions (10×10 cell grids) for long-range routing, and local A* for precise path segments. It maintains per-`Locomotor` pathfinder instances and supports dynamic map updates. The system also includes a domain-based reachability check for instant "no path" answers when source and target are on disconnected islands.

## Architecture Overview

### Component Hierarchy

```
ICmpPathfinder (trait interface)
└── PathFinder.cs (creates per-Locomotor HPF instances)
    ├── HierarchicalPathFinder (BlockedByActor.None)     — ignores all actors
    └── HierarchicalPathFinder (BlockedByActor.Immovable) — ignores only moving actors
        ├── Abstract graph layer (coarse routing)
        └── Local A* search (precise path)
```

Two HPF instances per Locomotor:
- **BlockedByActor.None**: For long-range planning (ignores all units)
- **BlockedByActor.Immovable**: For paths that should avoid buildings but ignore moving units

### HierarchicalPathFinder.cs (~1283 lines)

The core pathfinding algorithm. Maintains:
- **Grid decomposition**: Map divided into `GridSize = 10` × 10 cell grids (called "grids" in code)
- **Abstract nodes**: Each contiguous passable region within a grid becomes an abstract node
- **Abstract edges**: Connections between adjacent abstract nodes across grid boundaries, weighted by distance
- **Domain map**: `abstractDomains` — assigns a domain ID to each connected component in the abstract graph

## Algorithm Detail

### Grid Construction

```
for each 10×10 grid on the map:
    flood_fill passable cells within grid boundaries
    each connected region → one AbstractNode
    record which cells belong to which region
    
for each pair of adjacent grids:
    find cells on shared border that are passable on both sides
    create AbstractEdge between the corresponding regions
    edge cost = distance between region centers
```

### FindPath Flow

```
function FindPath(source, target, check, locomotor):
    1. Rebuild any dirty grids (terrain/actors changed)
    
    2. Domain check:
       sourceDomain = abstractDomains[source]
       targetDomain = abstractDomains[target]
       if sourceDomain != targetDomain:
           return PathComplete  // No path possible
    
    3. Short-distance optimization:
       if grid_distance(source, target) <= 2:
           // Skip abstract search, do bounded local A*
           return LocalSearch(source, target, heuristic_weight=100%)
    
    4. Abstract path search:
       abstractPath = SearchAbstractGraph(source_region, target_region)
       // Returns sequence of abstract nodes to traverse
    
    5. Local A* guided by abstract path:
       return BidirectionalSearch(source, target, 
                                  heuristic=abstract_path_distance,
                                  weight=125%)
```

### Abstract Graph Search

A* over the abstract graph. Each abstract node represents a passable region within a 10×10 grid. Edge costs are the distances between region entry/exit points.

The abstract path serves as an **improved heuristic** for the local search — it tells the local A* roughly which grids to traverse, preventing it from exploring dead-end areas of the map.

### Local A* Search: `PathSearch.cs`

Standard A* with configurable features:

```csharp
class PathSearch {
    PriorityQueue<CPos> openQueue;          // Min-heap by f-cost
    Dictionary<CPos, CellInfo> cellInfos;   // g-cost, parent, status
    
    // Heuristic: diagonal distance (Chebyshev-like)
    int Heuristic(CPos here) {
        var diag = Math.Min(dx, dy);
        var straight = dx + dy;
        return (diag * 141 + (straight - 2 * diag) * 100) * minCost;
        // 141 ≈ √2 × 100, integer approximation
    }
}
```

Key configuration:
- **`HeuristicWeightPercentage`**: Default `125%` — allows suboptimal paths for faster search. 100% = optimal A*. Higher = greedier search.
- **`BlockedByActor`**: Controls which actors block movement (None, Immovable, Stationary, All)
- **Custom cost functions**: Callers can inject additional cost functions (e.g., threat avoidance)

### Bidirectional Search

For single source→target queries, the search runs **bidirectionally** — one frontier expanding from source, one from target. They meet in the middle, roughly halving the search space.

Multi-source queries (e.g., finding nearest of several targets) use unidirectional search.

## Locomotor System

Each actor type has a `Locomotor` definition that determines:

```yaml
# OpenRA YAML (MiniYAML)
^Vehicle:
  Mobile:
    Locomotor: unit
    
Locomotor@unit:
  Crushes: wall, infantry
  CrushDamageTypes: Crush
  SharesCell: false
  TerrainSpeeds:
    Clear: 100
    Road: 100
    Rough: 50
    DirtRoad: 80
```

The Locomotor defines:
- **Terrain speed multipliers** (0 = impassable)
- **Crush rules** (what can be crushed)
- **Cell sharing** (infantry share cells, vehicles don't)

Each unique Locomotor gets its own `HierarchicalPathFinder` instances, because passability depends on the locomotion rules.

## Dynamic Updates

The pathfinder responds to map changes via events:

```
CellCostChanged(cell)      → mark containing grid as "dirty"
CellUpdated(cell)          → mark containing grid as "dirty"  
CellProjectionChanged(cell) → update custom movement layers

On next FindPath call:
    for each dirty grid:
        recompute regions within that grid
        update abstract graph edges
        recompute domain assignments if topology changed
```

This lazy update strategy means the abstract graph stays current without rebuilding the entire map every tick. Only affected 10×10 grids are recomputed.

### Custom Movement Layers

Supports overlapping movement layers for bridges, tunnels, etc:

```csharp
interface ICustomMovementLayer {
    byte Index { get; }
    bool InteractsWithDefaultLayer { get; }
    bool ReturnToGroundLayerOnIdle { get; }
    // ...
}
```

Units can pathfind across layers (e.g., walking onto a bridge transitions to the bridge layer, then back to ground on the other side).

## Data Structures

### Abstract Graph

```csharp
// Each abstract node
struct AbstractNode {
    CPos[] cells;           // Cells in this region
    int gridX, gridY;       // Which 10×10 grid this belongs to
}

// Edges between abstract nodes
struct AbstractEdge {
    int cost;               // Distance between regions
    AbstractNode target;    // Connected region
}

// Domain assignment
int[] abstractDomains;      // Domain ID per abstract node
// If two nodes have different domain IDs → no path exists
```

### Path Result

```csharp
struct CellInfo {
    int MinCost;            // g-cost (best known)
    CPos PreviousCell;      // Parent pointer for path reconstruction
    CellStatus Status;      // Open, Closed, or Unvisited
}
```

## Performance Characteristics

### Strengths
- **Fast long-range paths**: Abstract graph dramatically reduces search space
- **Instant "no path" detection**: Domain check is O(1)
- **Good heuristic**: Abstract path provides non-trivial heuristic, better than straight-line distance
- **Dynamic updates**: Only dirty grids are recomputed
- **Bidirectional search**: Roughly halves search space for single-target queries

### Weaknesses
- **Grid granularity**: 10×10 is a compromise. Too small = too many abstract nodes. Too large = abstract path is too coarse.
- **Suboptimal paths**: 125% heuristic weight means paths can be up to 25% longer than optimal
- **Rebuild cost**: When many grids change simultaneously (e.g., building destroyed), update can be expensive
- **Memory**: Per-Locomotor HPF instances multiply memory usage
- **No flowfield**: Each unit computes its own path independently. 100 units going to the same destination = 100 separate searches.

### Verified Performance Facts

From OpenRA source code and issue tracker:
- Single-threaded path computation (background network I/O threads exist, but pathfinding is main-thread)
- 135+ desync issues in tracker (many related to pathfinding state divergence)
- Static `OrderLatency` (dynamic buffering noted as TODO in source)
- Sync check only 7 frames deep (recurring pain point for desync debugging)

## Characteristics Relevant to IC's `OpenRaPathfinder`

### What to Reproduce (Defines the "OpenRA Feel")

1. **Hierarchical A* structure** — abstract graph for long range, local A* for precision
2. **125% heuristic weight** — allows slightly suboptimal but faster paths
3. **Per-Locomotor instances** — different movement types get different pathfinders
4. **Domain-based reachability** — instant "no path" for disconnected islands
5. **Bidirectional search** — characteristic fast convergence for point-to-point paths
6. **10×10 grid size** — the specific granularity that determines path quality vs. speed tradeoff
7. **Dynamic grid updates** — lazy rebuilding of only dirty grids

### What to Improve

1. **Single-threaded execution** — IC can process requests from a work queue
2. **Per-unit independent search** — IC can share path results for units going to same destination
3. **C# allocations in hot path** — Rust's ownership model eliminates GC pressure
4. **No path caching** — IC can cache recent AbstractGraph searches
5. **Sync hash fragility** — IC uses whole-state hashing (D010), not attribute-level sync checks

### Rust Porting Notes

| C# Pattern                       | Rust Equivalent                                           |
| -------------------------------- | --------------------------------------------------------- |
| `HierarchicalPathFinder` class   | `struct OpenRaPathfinder` implementing `Pathfinder` trait |
| `IPathFinder` interface          | IC's `Pathfinder` trait                                   |
| `Locomotor` class per actor type | `LocomotorType` enum → locomotor config lookup            |
| `PathSearch` with priority queue | `BinaryHeap<Reverse<(Cost, CellPos)>>`                    |
| `Dictionary<CPos, CellInfo>`     | `HashMap<CellPos, CellInfo>` or grid-indexed array        |
| `abstractDomains` array          | `Vec<DomainId>` indexed by abstract node ID               |
| ICustomMovementLayer             | Movement layer abstraction in `Pathfinder` trait          |
| `CellCostChanged` events         | `invalidate_area()` on `Pathfinder` trait                 |

### Determinism Considerations

OpenRA's pathfinder is deterministic in theory but has had recurring desync issues in practice (135+ tracker issues). Key concerns:

1. **Dictionary iteration order**: C# `Dictionary` does not guarantee order. If the pathfinder iterates over dictionaries during graph construction, order differences can cause different abstract graphs on different machines. Rust's `HashMap` has the same issue — use `BTreeMap` or deterministic hashing where order matters.

2. **Float comparisons**: OpenRA uses integer coordinates but has some float-based heuristic calculations. IC must use pure fixed-point.

3. **Priority queue tie-breaking**: When two nodes have equal f-cost, the tiebreaker determines exploration order, which affects the final path. IC must define deterministic tiebreaking (e.g., by coordinate in fixed order).

## Complexity Analysis

- **Abstract graph build**: O(map_cells) — one-time construction, incremental updates O(grid_size²) per dirty grid
- **FindPath**: O(abstract_nodes × log(abstract_nodes)) for abstract search + O(local_cells × log(local_cells)) for guided local A*
- **Domain check**: O(1) — just compare two integers
- **Space**: O(map_cells) for cell info + O(abstract_nodes²) for abstract graph + O(abstract_nodes) for domain map

For a 128×128 map divided into 10×10 grids ≈ 169 grids, each with 1-5 regions ≈ 500 abstract nodes. Abstract graph search over 500 nodes is trivial. The expensive part is the local A* guided by the abstract path, but it's bounded by the corridor width defined by the abstract route.

## Comparison with Original C&C Pathfinder

| Aspect             | Original (Remastered)      | OpenRA                         |
| ------------------ | -------------------------- | ------------------------------ |
| Algorithm          | Straight-line + edge trace | Hierarchical A*                |
| Optimality         | Not optimal                | Near-optimal (125% bound)      |
| Long range         | Degrades badly             | Scales well via abstract graph |
| Short range        | Excellent (direct)         | Good (local A*)                |
| Obstacle behavior  | Wall hug                   | Smooth detour                  |
| Movement feel      | Organic, "soldiers"        | Clinical, "GPS guided"         |
| Reachability check | Zone flood-fill            | Domain graph                   |
| Dynamic updates    | Recompute zones            | Incremental grid rebuild       |
| Multi-unit         | Infantry path sharing      | Independent per-unit           |
| Memory             | O(map/8) bitfield          | O(map + abstract_graph)        |
