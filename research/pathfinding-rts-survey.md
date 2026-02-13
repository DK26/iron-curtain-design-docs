# Pathfinding in Open-Source RTS Engines: Spring, 0 A.D., Warzone 2100

> Sources: [spring/spring](https://github.com/spring/spring) (GPL v2), [0ad/0ad](https://github.com/0ad/0ad) (GPL v2), [Warzone2100/warzone2100](https://github.com/Warzone2100/warzone2100) (GPL v2)
> Relevance: Informs `IcPathfinder` design (D013/D045) and validates IC's architecture decisions

## Spring Engine (C++)

### Overview

Spring has **two complete pathfinder implementations** that can be switched at runtime:

1. **Default pathfinder** (`Path/Default/`): Three-resolution A* with flow map overlay
2. **QTPFS** (`Path/QTPFS/`): Quad-Tree Pathfinder System — A* over an adaptive quadtree

Both implement the same `IPathManager` interface — a direct validation of IC's `Pathfinder` trait approach. The engine supports runtime switching between them.

### Default Pathfinder: Three-Resolution A*

```
IPathManager (abstract interface)
└── CPathManager (Default implementation)
    ├── CPathFinder   (gMaxResPF) — full-resolution A*
    ├── CPathEstimator (gMedResPE) — medium-resolution A* (block-based)
    └── CPathEstimator (gLowResPE) — low-resolution A* (larger blocks)
```

Architecture:
- **Max resolution**: Cell-by-cell A* for short paths
- **Medium resolution**: A* over blocks (groups of cells) for medium paths
- **Low resolution**: A* over larger blocks for cross-map paths

Path requests cascade: low-res finds the general route, medium-res refines it, max-res handles the final approach.

#### Flow Map and Heat Map Overlays

```cpp
class PathFlowMap {
    struct FlowCell {
        float3 flowVector;      // Direction of flow
        float3 cellCenter;      // World-space cell center
        unsigned numObjects;    // Objects currently in cell
    };
    // Double-buffered for concurrent read/write
    std::vector<FlowCell> buffers[2];
};
```

The flow map records **where units are currently moving** to discourage other units from creating congestion. The heat map records **where units have recently been** to discourage repeated pathfinding over the same area. Both are soft costs added to the A* search, not hard blocks.

**Note**: `GetFlowCost()` returns `0.0f` in current code (the feature is disabled/incomplete). The infrastructure exists but is commented out. This is relevant — Spring tried and abandoned flow-based pathfinding in the default system.

#### MoveDef System

Spring's equivalent of OpenRA's Locomotor:

```cpp
struct MoveDef {
    float depth;            // Max water depth
    float depthModParams;   // How water depth affects speed
    float crushStrength;    // What can be crushed
    int pathType;           // Index into pathfinder node layers
    SpeedModFunc speedModFunc;  // Custom speed modification
};
```

Each unique `MoveDef` gets its own set of pathfinder data structures (node layers, estimator blocks). This is the same per-locomotor-type pattern as OpenRA's per-Locomotor HPF.

### QTPFS: Quad-Tree Pathfinder System

The more modern pathfinder. Uses an **adaptive quadtree** that splits the map into variable-sized regions based on terrain homogeneity.

```
QTPFS::PathManager
├── std::vector<NodeLayer> nodeLayers   — one per MoveDef
├── std::vector<QTNode*>  nodeTrees     — quadtree root per MoveDef
└── std::vector<PathCache> pathCaches   — cached paths per MoveDef
```

#### Quadtree Node Structure

```cpp
class QTNode : public INode {
    float speedModSum;          // Sum of terrain speed modifiers in this node
    float speedModAvg;          // Average speed modifier
    float moveCostAvg;          // Average move cost
    
    std::vector<INode*> neighbors;  // Adjacent nodes
    std::vector<float2> netpoints;  // Edge transition points for smooth paths
    
    // Quadtree subdivision
    unsigned int xmin, xmax, zmin, zmax;
    QTNode* children[4];  // TL, TR, BR, BL (null if leaf)
};
```

- **Homogeneous areas** (open fields) → large nodes, fewer graph vertices
- **Heterogeneous areas** (near obstacles) → small nodes, precise routing
- Minimum node size and maximum tree depth are configurable

#### A* Search Over Quadtree

```cpp
struct PathSearch : public IPathSearch {
    // Supports both A* (hCostMult > 0) and Dijkstra (hCostMult = 0)
    float hCostMult;            // 1/maxRelSpeedMod for A*, 0 for Dijkstra
    
    binary_heap<INode*> openNodes;  // Global priority queue (reused across searches)
    
    NodeLayer* nodeLayer;
    INode *srcNode, *tgtNode;
    INode *curNode, *minNode;   // Current and best-partial node
    
    float3 srcPoint, tgtPoint;  // World-space coordinates
};
```

Key feature: **path smoothing** (`SmoothPath()` / `SmoothPathIter()`) — waypoints at node boundaries are adjusted to create smoother paths, using edge intersection calculations to find optimal crossing points.

#### Path Caching

QTPFS caches completed paths and reuses them:
- **Shared paths**: If two units with same MoveDef go to same destination, path is shared
- **Path updates**: When terrain changes, affected cached paths are re-requested
- **Temp paths**: While a search is in progress, units get a temporary "move toward destination" path to hide latency

#### Asynchronous Path Requests

```cpp
// Request a path (non-blocking)
unsigned int RequestPath(CSolidObject* object, const MoveDef* moveDef,
                         float3 sourcePos, float3 targetPos, float radius, bool synced);

// Get next waypoint (called each frame by movement code)
float3 NextWayPoint(const CSolidObject* owner, unsigned int pathID,
                    unsigned int numRetries, float3 point, float radius, bool synced);
```

While the path is being computed, `NextWayPoint()` returns a point slightly ahead toward the destination so units start moving immediately — hiding search latency.

### Spring: Lessons for IC

1. **Two switchable pathfinder implementations behind one interface** — exactly validates IC's `Pathfinder` trait design (D013/D045)
2. **Flow map attempted but disabled** — suggests flow-based pathfinding has practical difficulties; IC’s multi-layer hybrid uses flow field tiles only for mass movement (≥8 units), not as primary pathfinder
3. **Per-MoveDef pathfinder instances** — same pattern as OpenRA per-Locomotor, confirms this is standard practice
4. **Path caching with sharing** — important optimization for mass-movement scenarios
5. **Async with temp paths** — good UX pattern for hiding pathfinding latency
6. **Quadtree adaptive resolution** — interesting alternative to fixed-grid hierarchical decomposition

---

## 0 A.D. (C++)

### Overview

0 A.D. uses a **dual-pathfinder architecture**:

1. **Long-range**: JPS (Jump Point Search) on the navcell grid — an optimized A* variant
2. **Short-range**: Vertex pathfinder — precise obstacle avoidance using visibility graphs

Plus a **hierarchical pathfinder** for connectivity queries (is B reachable from A?).

The long-range and short-range pathfinders cooperate: the long-range pathfinder provides waypoints, and the short-range pathfinder navigates between consecutive waypoints while avoiding other units.

### Navcell Grid

```cpp
namespace Pathfinding {
    const int NAVCELLS_PER_TERRAIN_TILE = 4;  // 4×4 navcells per terrain tile
    const entity_pos_t NAVCELL_SIZE = ...;    // Sub-tile resolution
}

typedef u16 NavcellData;  // 1 bit per passability class (up to 16 classes)
#define IS_PASSABLE(item, classmask) (((item) & (classmask)) == 0)
```

Key design: the navgrid uses **bitwise passability classes** — each navcell stores a 16-bit mask where each bit represents a different passability class. This allows efficient per-class queries with a single AND operation.

### Long-Range Pathfinder: Jump Point Search (JPS)

```cpp
class LongPathfinder {
    Grid<NavcellData>* m_Grid;     // Passability grid
    u16 m_GridSize;                // Grid dimensions
    
    void ComputeJPSPath(const HierarchicalPathfinder& hierPath,
                        entity_pos_t x0, entity_pos_t z0,
                        const PathGoal& origGoal,
                        pass_class_t passClass,
                        WaypointPath& path) const;
};
```

JPS is an A* optimization that **skips over cells that don't need to be explicitly evaluated**. Instead of adding every neighbor to the open list, it "jumps" in straight lines until hitting a wall or a "forced neighbor" (a cell where the optimal path might change direction). This dramatically reduces the number of open-list operations compared to plain A*.

Algorithm flow:
```
function ComputeJPSPath(source, goal, passClass):
    // Step 1: Make goal reachable
    hierPath.MakeGoalReachable(source, goal, passClass)
    // Uses hierarchical pathfinder to find nearest reachable cell to goal
    
    // Step 2: JPS search
    state.open.push(source, cost=0)
    
    while not state.open.empty():
        curr = state.open.pop()
        
        for each direction:
            jump_point = Jump(curr, direction)
            if jump_point found:
                g = curr.cost + distance(curr, jump_point)
                h = CalculateHeuristic(jump_point, goal)
                state.open.push(jump_point, g + h)
    
    // Step 3: Post-process waypoints
    ImprovePathWaypoints(path, passClass)
```

#### Jump Point Cache

```cpp
class JumpPointCache;  // Caches jump point computations per passability class
```

JPS jump computations can be cached because they depend only on the static terrain (not on unit positions). The cache is invalidated when the passability grid changes.

### Short-Range Pathfinder: Vertex Pathfinder

```cpp
class VertexPathfinder {
    WaypointPath ComputeShortPath(const ShortPathRequest& request,
                                  CmpPtr<ICmpObstructionManager> cmpObstructionManager) const;
};
```

Uses a **visibility graph** approach:
1. Get all obstruction squares (buildings, walls, units) in the search radius
2. Compute vertices at corners of each obstacle (with clearance expansion)
3. Build visibility edges between vertices that have line-of-sight
4. Run A* on this visibility graph

```cpp
struct Vertex {
    CFixedVector2D p;           // Position
    fixed g, h;                 // A* costs
    u16 pred;                   // Parent vertex
    Vertex::Status status;      // UNEXPLORED, OPEN, CLOSED
    u8 quadInward, quadOutward; // Quadrant info for edge pruning
};
```

The vertex pathfinder handles **short distances with high precision** — it navigates around other units and produces smooth, non-grid-aligned paths.

### Hierarchical Pathfinder: Connectivity

```cpp
class HierarchicalPathfinder {
    typedef u32 GlobalRegionID;
    
    struct RegionID {
        // Identifies a connected region within a chunk
    };
    
    void Recompute(Grid<NavcellData>* grid, ...);
    void Update(Grid<NavcellData>* grid, const Grid<u8>& dirtinessGrid);
    
    GlobalRegionID GetGlobalRegion(u16 i, u16 j, pass_class_t passClass) const;
    void MakeGoalReachable(u16 i0, u16 j0, PathGoal& goal, pass_class_t passClass);
};
```

The hierarchical pathfinder divides the map into **chunks** (like OpenRA's 10× 10 grids). Each chunk contains one or more **regions** — connected passable areas. Regions across chunk boundaries are connected to form a **global graph**.

Used for:
1. **Reachability queries**: Are source and goal in the same global region?
2. **Goal adjustment**: If goal is unreachable, find nearest reachable navcell
3. **AI pathfinding**: Separate copy of hierarchical pathfinder for AI workers

### Coordinate System

0 A.D. uses **fixed-point coordinates** throughout pathfinding:

```cpp
typedef CFixed_15_16 entity_pos_t;  // 15 bits integer, 16 bits fractional
```

This is directly relevant to IC's fixed-point requirement. 0 A.D. proves that JPS and vertex pathfinding work correctly with fixed-point math.

### Asynchronous Pathfinding

```cpp
class CCmpPathfinder {
    std::vector<VertexPathfinder> m_VertexPathfinders;  // One per worker thread
    std::vector<Future<void>> m_Futures;                // Worker thread futures
    
    PathRequests<LongPathRequest> m_LongPathRequests;
    PathRequests<ShortPathRequest> m_ShortPathRequests;
};
```

Path requests are queued and computed by worker threads. Results are delivered as messages (`CMessagePathResult`) on the next tick. Multiple vertex pathfinder instances exist — one per thread — to avoid contention.

### UnitMotion: Long/Short Path Cooperation

```cpp
void CCmpUnitMotion::ComputePathToGoal(from, goal) {
    bool shortPath = InShortPathRange(goal, from);
    
    // Alternate between long and short pathfinder to handle edge cases
    if (ShouldAlternatePathfinder())
        shortPath = !shortPath;
    
    if (shortPath)
        RequestShortPath(from, goal, extendRange=true);
    else
        RequestLongPath(from, goal);
}
```

The unit motion system alternates between long-range and short-range pathfinders:
- **Close targets**: Use short-range (vertex) pathfinder directly
- **Far targets**: Use long-range (JPS) for waypoints, then short-range between them
- **Stuck detection**: If long-range fails, try short-range as "hack" (the short pathfinder is more precise and might find a path through narrow gaps)

### 0 A.D.: Lessons for IC

1. **JPS is dramatically faster than plain A*** for large open maps — adopted as Layer 3 primary algorithm in `IcPathfinder` for small groups
2. **Dual long/short pathfinder architecture** — different algorithms for different scales is proven effective
3. **Fixed-point coordinates work** — 0 A.D. proves JPS + vertex pathfinding are deterministic with fixed-point
4. **Multi-threaded pathfinding** — one VertexPathfinder per thread, no shared mutable state
5. **Hierarchical pathfinder for connectivity only** — doesn't find paths, just answers "is reachable?" queries. IC's zone system serves the same role.
6. **`ShouldAlternatePathfinder()`** — clever stuck-detection heuristic, switching pathfinder strategies when one fails

---

## Warzone 2100 (C++)

### Overview

Warzone 2100 uses **plain A*** with a sophisticated **context caching** system. The key innovation is reusing previous A* search results for subsequent pathfinding requests to the same destination — essentially building a reverse-search Dijkstra tree from the destination and reusing it for multiple source units.

### Architecture

```
fpathDroidRoute()          — main entry, queues job
fpathThreadFunc()          — worker thread, consumes jobs
fpathExecute()             — executes single job
fpathAStarRoute()          — core A* with context caching
fpathAStarExplore()        — A* exploration step
fpathNewNode()             — node generation with cost calculation
```

### Multi-Threaded Execution

```cpp
constexpr size_t MAX_FPATH_THREADS = 2;  // Up to 2 pathfinding threads

// Job dispatch: ensures same-destination jobs go to same thread
// (required because PathfindContext is per-thread, not shared)
size_t fpathJobDispatchThreadId(const PATHJOB& job, size_t numThreads) {
    // Hash based on propulsion domain + destination tile
    // Jobs with same hash → same thread → can reuse cached context
}
```

Jobs are dispatched to threads based on a hash of destination + propulsion type. This ensures that multiple units heading to the same destination are processed by the same thread, enabling context reuse.

### Context Caching System

The core optimization. When a unit pathfinds to a destination, the entire A* exploration is saved in a `PathfindContext`:

```cpp
struct PathfindContext {
    PathCoord tileS;        // Destination tile (search starts from dest)
    uint16_t iteration;     // Lazy deletion generation counter
    
    std::vector<PathNode> nodes;        // Open list (priority heap)
    std::vector<PathExploredTile> map;  // Full map exploration state
    
    PathCoord nearestCoord;             // Nearest reachable tile to dest
    std::shared_ptr<const PathBlockingMap> blockingMap;
};
```

Usage pattern:
```
1st unit to destination D:
    - No context exists → create new context, search from D outward
    - A* explores until source S1 is reached
    - Save context (open list + explored tiles)

2nd unit to same destination D:
    - Context found! Continue previous exploration until S2 is reached
    - Most of the map is already explored → very fast

3rd unit, already in explored region:
    - Just read the path from the map array → near-instant

Cache eviction:
    - LRU list, up to 30 cached contexts
    - Contexts invalidated when game time changes (blocking map may differ)
```

### LRU Context Cache

```cpp
class PathfindContextList {
    std::vector<PathfindContext> contexts;       // Actual storage
    std::vector<size_t> orderedIndexes;          // LRU ordering
    
    void moveToFront(Iterator it);  // Recently used → front of list
};
```

Up to 30 contexts cached per thread. When the cache is full, the least recently used context is overwritten.

### Bidirectional Reuse

The context stores exploration from the **destination** outward. When a new source needs a path:
1. Check if source is already in an explored tile → path immediately available
2. If not, **re-estimate** heuristics toward the new source and continue exploration:

```cpp
static void fpathAStarReestimate(PathfindContext &context, PathCoord tileF) {
    for (auto &node : context.nodes) {
        node.est = node.dist + fpathGoodEstimate(node.p, tileF);
    }
    std::make_heap(context.nodes.begin(), context.nodes.end());  // Fix heap
}
```

This is clever: the open list from a previous search is re-targeted toward the new source by recalculating all heuristics. The heap is then rebuilt. This is O(n) for n open nodes, but much cheaper than restarting from scratch.

### Cost Calculation

```cpp
// Diagonal distance heuristic
unsigned fpathEstimate(PathCoord s, PathCoord f) {
    // Cost: horizontal/vertical = 140, diagonal = 198 (≈140×√2)
    unsigned xDelta = abs(s.x - f.x), yDelta = abs(s.y - f.y);
    return std::min(xDelta, yDelta) * (198 - 140) + std::max(xDelta, yDelta) * 140;
}

// Euclidean distance (more precise, used for final heuristic)
unsigned fpathGoodEstimate(PathCoord s, PathCoord f) {
    return iHypot((s.x - f.x) * 140, (s.y - f.y) * 140);
}
```

Uses integer math throughout — diagonal cost 198 is a fixed-point approximation of 140×√2.

### Danger Map

```cpp
struct PathBlockingMap {
    std::vector<bool> map;          // true = blocked
    std::vector<bool> dangerMap;    // true = dangerous (enemy threat)
};

bool isDangerous(int x, int y) const {
    return !blockingMap->dangerMap.empty() && blockingMap->dangerMap[x + y * mapWidth];
}

// In fpathNewNode:
unsigned costFactor = context.isDangerous(pos.x, pos.y) ? 5 : 1;
```

Dangerous cells (under enemy fire) have 5× movement cost, causing units to route around them when possible. This is the equivalent of threat avoidance in the original C&C.

### Corner-Cutting Prevention

```cpp
// Cannot cut diagonal corners past blocked tiles
if (dir % 2 != 0) {  // Diagonal direction
    x2 = node.p.x + aDirOffset[(dir + 1) % 8].x;
    y2 = node.p.y + aDirOffset[(dir + 1) % 8].y;
    if (context.isBlocked(x2, y2)) continue;  // Skip diagonal
    
    x2 = node.p.x + aDirOffset[(dir + 7) % 8].x;
    y2 = node.p.y + aDirOffset[(dir + 7) % 8].y;
    if (context.isBlocked(x2, y2)) continue;  // Skip diagonal
}
```

Units cannot cut corners diagonally past blocked tiles — both adjacent orthogonal tiles must be passable. This prevents units from "squeezing through" single-cell gaps diagonally, which would look wrong visually.

### Warzone 2100: Lessons for IC

1. **Context caching is extremely effective** — for mass-move scenarios where many units go to the same area, caching the dest→outward exploration makes subsequent pathfinds near-instant
2. **Heuristic re-estimation** — clever O(n) technique to reuse an open list for a different source
3. **Thread dispatch by destination hash** — ensures context reuse is possible within a thread
4. **Integer cost arithmetic** (140/198 for cardinal/diagonal) — proven approach for deterministic integer pathfinding
5. **Danger map soft costs** — simple and effective threat avoidance
6. **Corner-cutting prevention** — important visual detail for grid-based movement

---

## Cross-Project Comparison

| Feature             | EA Remastered    | OpenRA             | Spring (Default)    | Spring (QTPFS)  | 0 A.D.          | Warzone 2100       |
| ------------------- | ---------------- | ------------------ | ------------------- | --------------- | --------------- | ------------------ |
| **Algorithm**       | Edge trace       | Hierarchical A*    | 3-tier A*           | Quadtree A*     | JPS + Vertex    | A* + cache         |
| **Optimal paths**   | No               | ~125%              | Near-optimal        | Near-optimal    | Near-optimal    | Optimal            |
| **Long range**      | Poor             | Good               | Good                | Good            | Good            | Good (cached)      |
| **Short range**     | Good             | Good               | Good                | Good            | Excellent       | Good               |
| **Dynamic updates** | Zone recompute   | Dirty grid rebuild | Full rebuild        | Quadtree update | Dirty grid      | Blocking map       |
| **Multi-unit**      | Infantry sharing | Independent        | Flow map (disabled) | Path sharing    | Independent     | Context cache      |
| **Threading**       | Single           | Single             | Single              | Single          | Multi (workers) | Multi (2 threads)  |
| **Memory**          | Minimal          | Moderate           | Moderate            | Moderate        | Moderate        | High (cached maps) |
| **Fixed-point**     | Integer (native) | Integer/float mix  | Float               | Float           | Fixed-point     | Integer            |
| **License**         | GPL v3           | GPL v3             | GPL v2              | GPL v2          | GPL v2          | GPL v2             |

## Implications for IC's `IcPathfinder`

Based on the survey, a pure flowfield approach is notably absent from all analyzed RTS engines (Spring attempted flow maps but disabled them). IC's `IcPathfinder` addresses this by using a multi-layer hybrid architecture where flow field tiles are one layer (activated for mass movement ≥8 units) within a system that also uses JPS, hierarchical sectors, and ORCA-lite avoidance. See `research/pathfinding-ic-default-design.md` for full architecture.

### Validated IC Design Decisions
1. **`Pathfinder` trait abstraction** — Spring's `IPathManager` with two swappable implementations directly validates D013
2. **Per-locomotor pathfinder instances** — universal pattern across OpenRA, Spring, 0 A.D.
3. **Zone/domain reachability** — present in all engines; essential optimization
4. **Integer/fixed-point math** — EA original and 0 A.D. both use integer math successfully; WZ2100 uses integer costs

### Opportunities IC Can Exploit
1. **Flow field tiles for mass movement** — no surveyed engine has production flowfields; unique differentiator when activated for large groups
2. **Context caching** (from WZ2100) — applicable to any pathfinder, not just A*
3. **Async with temp paths** (from Spring QTPFS) — hide latency by moving units toward destination while path computes
4. **JPS for open terrain** (from 0 A.D.) — adopted as primary detailed pathfinder in `IcPathfinder` Layer 3

### Risks Addressed by Multi-Layer Design
1. **Spring abandoned flow maps** — IC uses flow field tiles only for mass movement, not as primary pathfinder; JPS handles small groups
2. **Per-unit independent pathfinding is the norm** — IC preserves per-unit JPS paths for small groups; flowfields activate only for ≥8 units sharing a destination
3. **Dynamic flowfield updates are expensive** — IC uses LRU cache and only generates flow fields on demand, not for entire map
4. **Determinism with flowfields** — all layers use fixed-point throughout (validated by 0 A.D.'s `CFixed_15_16` success)
