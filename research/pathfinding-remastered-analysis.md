# Pathfinding in the EA Remastered Collection (C++)

> Source: [electronicarts/CnC_Remastered_Collection](https://github.com/electronicarts/CnC_Remastered_Collection) (GPL v3)
> Files analyzed: `REDALERT/FINDPATH.CPP`, `REDALERT/FOOT.CPP`, `TIBERIANDAWN/FINDPATH.CPP`, `TIBERIANDAWN/FOOT.CPP`, `REDALERT/CELL.CPP`, `REDALERT/CELL.H`
> Relevance: Basis for `RemastersPathfinder` implementation (D045)

## Executive Summary

The original C&C/RA pathfinder is **NOT** A*. It is a custom **straight-line-with-obstacle-tracing** algorithm. The unit walks a straight line toward the destination; when it hits an impassable cell, it traces the obstacle boundary in both clockwise and counter-clockwise directions, picks the shorter trace, and resumes the straight line from the new position. This gives the distinctive "hug the wall" movement feel that players associate with classic C&C.

## Algorithm Overview

### Entry Point: `FootClass::Basic_Path()`

The high-level orchestrator. Tries `Find_Path()` with progressively more aggressive `MoveType` thresholds until a route is found or all thresholds are exhausted.

**Red Alert version** (slightly different from TD):
```
for each threshold in [MOVE_TEMP, MOVE_DESTROYABLE, MOVE_MOVING_BLOCK, MOVE_CLOAK] (escalating):
    result = Find_Path(dest, moves_buffer, max_length, threshold)
    if result found:
        return result
    PathDelay = retry timer
```

**Tiberian Dawn version**:
```
Try most aggressive threshold first (MOVE_DESTROYABLE)
Then try easiest (MOVE_TEMP)
Compare costs, pick cheaper
```

Key constants:
- `PATH_RETRY = 10` — max retry attempts before giving up
- `PathDelay` — timer preventing constant re-pathing on failure
- `CONQUER_PATH_MAX` — maximum path length (limited-size array)

### Core Algorithm: `FootClass::Find_Path()`

```
function Find_Path(dest, output_moves[], max_length, threshold):
    start = current_cell
    path_cost = 0
    
    while current_cell != dest AND path_length < max_length:
        // Step 1: Walk straight line toward destination
        desired_facing = direction_to(current_cell, dest)
        next_cell = adjacent(current_cell, desired_facing)
        
        cost = Passable_Cell(next_cell, desired_facing, threshold)
        
        if cost > 0:  // Passable
            record move(desired_facing)
            current_cell = next_cell
            path_cost += cost
            Register_Cell(current_cell)  // Mark in overlap bitfield
            
        else:  // Blocked — trace obstacle boundary
            // Step 2: Try to walk THROUGH the obstacle
            //   (walk straight until we exit the blocked area)
            
            // Step 3: Follow_Edge in BOTH directions (CW and CCW)
            left_path = Follow_Edge(current_cell, dest, facing, LEFT/CCW)
            right_path = Follow_Edge(current_cell, dest, facing, RIGHT/CW)
            
            // Step 4: Pick shorter trace
            if left_path.cost < right_path.cost:
                append left_path moves
            else:
                append right_path moves
            
            current_cell = new position after edge trace
    
    Optimize_Moves(output_moves)  // Smooth diagonals
    Unravel_Loop(output_moves)    // Remove self-intersections
    return path
```

### Edge Tracing: `FootClass::Follow_Edge()`

This is the distinctive part. When a unit hits an obstacle, it literally traces the outline of the blocking area — like putting your hand on a wall and walking along it. The algorithm tries both CW and CCW traces and picks whichever gets the unit closer to the destination in fewer steps.

This produces the characteristic "bump and slide" movement that classic C&C players recognize. Units don't find optimal paths — they find *locally reasonable* paths by feeling along walls.

### Path Data Structure: `PathType`

```c
struct PathType {
    CELL    StartCell;                    // Starting cell of the path
    int     Cost;                         // Total movement cost
    int     Length;                       // Number of moves
    FacingType Command[MAX_PATH_LENGTH];  // Array of 8-direction facings
    CELL    LastOverlap;                  // Last cell that caused overlap detection
    CELL    LastFixup;                    // Last cell corrected by fixup
};
```

The path is stored as a **fixed-size array of compass facings** (N, NE, E, SE, S, SW, W, NW). This is extremely memory-efficient — one byte per step, no coordinate pairs needed. The path is regenerated as units walk, not stored as a complete route.

### Overlap Bitfield: `MainOverlap[]`

```c
unsigned long MainOverlap[MAP_CELL_TOTAL / 32];  // One bit per map cell
```

Used by `Register_Cell()` and `Unravel_Loop()` to detect when the pathfinder revisits a cell — indicating a loop. When a loop is detected, the intervening moves are stripped out.

This is a global bitfield covering the entire map. It's simple but has a race condition risk if pathfinding were ever parallelized (it wasn't in the original).

## Passability System

### MoveType Enum (Cost Thresholds)

```c
enum MoveType {
    MOVE_OK           = 1,   // Clear terrain
    MOVE_CLOAK        = 1,   // Cloaked enemy (treated same as clear)
    MOVE_MOVING_BLOCK = 3,   // Temporarily blocked by moving unit
    MOVE_DESTROYABLE  = 8,   // Blocked by destroyable obstacle
    MOVE_TEMP         = 10,  // Temporary obstruction
    MOVE_NO           = 0,   // Completely impassable (0 = rejected)
};
```

`Passable_Cell()` returns 0 for impassable, otherwise a cost value. The pathfinder's `threshold` parameter determines how aggressive the unit is — at `MOVE_DESTROYABLE`, AI units will path *through* enemy buildings they intend to destroy.

### SpeedType (Locomotion Categories)

```c
enum SpeedType {
    SPEED_FOOT,    // Infantry
    SPEED_TRACK,   // Tracked vehicles (tanks)
    SPEED_WHEEL,   // Wheeled vehicles
    SPEED_FLOAT,   // Naval vessels
    SPEED_WINGED,  // Aircraft (mostly ignore terrain)
};
```

Each terrain type has a cost table indexed by SpeedType:
```c
Ground[land_type].Cost[speed_type]  // e.g., Ground[LAND_ROUGH].Cost[SPEED_TRACK] = 150
```

A cost of 0 or -1 means impassable for that locomotion type. This is the original version of what OpenRA generalizes into `Locomotor` definitions.

### Zone System (Red Alert Only)

Red Alert added a zone-based connectivity system not present in Tiberian Dawn:

```c
enum MZoneType {
    MZONE_NORMAL,     // Default movement zone
    MZONE_CRUSHER,    // Vehicles that can crush infantry
    MZONE_DESTROYER,  // Vehicles that can destroy obstacles
    MZONE_COUNT
};

// Each cell stores zone membership per MZone type
class CellClass {
    unsigned char Zones[MZONE_COUNT];  // Zone ID for each movement zone type
};
```

Zones are computed by flood-fill (`Zone_Span()`) and used as a **fast reachability check** — if the source and destination cells have different zone IDs for the unit's MZoneType, there's no path and pathfinding can be skipped entirely.

This is functionally identical to OpenRA's "domain" system and 0 A.D.'s "global regions."

Key functions:
- `Zone_Reset()` — recomputes all zones (called when map changes)
- `Zone_Cell(cell, zone_type)` — returns zone ID for a cell
- `CellClass::Is_Clear_To_Move(speed_type, ...)` — checks zone match + occupation + passability

### Per-Unit Type Overrides: `Can_Enter_Cell()`

Each unit type has virtual `Can_Enter_Cell()` overrides:
- **UnitClass**: Checks zone match, crush capability, cloaked enemies, friendly blockage
- **VesselClass**: Checks water terrain, blocking terrain objects
- **AircraftClass**: Much simpler — just needs clear-to-move with SPEED_TRACK equivalent
- **InfantryClass**: Checks sub-cell positions (infantry share cells)

## Path Optimization

### `Optimize_Moves()`

Post-processes the path to smooth diagonal movements. If three consecutive moves form a zigzag (e.g., N, NE, N), this can be simplified. This reduces the jaggedness of paths along diagonal edges.

### `Unravel_Loop()`

Detects self-intersecting paths using the overlap bitfield. When the pathfinder visits a cell it already visited, the loop between the two visits is cut out. This prevents units from circling obstacles endlessly.

## Additional Behaviors

### Threat Avoidance (AI Teams)

AI-controlled units in organized teams can route around dangerous areas:

```c
// Teams have a threat_stage that escalates:
// Stage 0: Avoid high-threat cells
// Stage 1: Moderate avoidance
// Stage 2: Ignore threats entirely (desperate routing)
```

This is only used for AI, never for player-controlled units.

### Infantry Path Sharing

When multiple infantry units are heading to the same destination, the pathfinder checks if a nearby infantry unit already has a valid path and copies it rather than recomputing:

```
if nearby_infantry.destination == my_destination:
    copy their path
    adjust for my starting position
```

This is an optimization that reduces pathfinding cost for large infantry groups.

### Nearby Location Fallback: `Map.Nearby_Location()`

When no path exists or the destination is blocked, this function finds the nearest passable cell using an **expanding-radius box scan**:

```
for radius = 1, 2, 3, ...:
    scan cells in box(dest, radius):
        if cell is passable:
            return cell
```

## Characteristics Relevant to IC's `RemastersPathfinder`

### What to Reproduce (Defines the "Remastered Feel")

1. **Straight-line-with-obstacle-trace** — the core algorithm that gives C&C its movement character
2. **Edge tracing (CW/CCW pick shorter)** — the "wall hugging" behavior
3. **Threshold escalation** — units trying progressively harder to find routes
4. **Path regeneration** — short, regenerated-on-the-fly paths rather than complete precomputed routes
5. **MoveType cost semantics** — the specific cost values (1, 3, 8, 10) that determine when units "push through"
6. **Zone-based fast rejection** — skip pathfinding when islands differ

### What to Improve (Not Part of the Feel)

1. **Global overlap bitfield** — replace with per-request bitset or visited-set (no global mutable state)
2. **Fixed-size path array** — replace with `Vec<Direction>` (or `SmallVec` for common case)
3. **Static pathfinding** — original is entirely single-threaded; IC can process requests asynchronously
4. **No path caching** — original recomputes every time; IC can cache recent results
5. **Infantry path sharing heuristic** — generalize to all unit types sharing similar paths

### Rust Porting Notes

| C++ Pattern                                      | Rust Equivalent                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `PathType` struct with `FacingType[]` array      | `struct PathResult { moves: SmallVec<[Direction; 64]>, cost: u32 }` |
| `MainOverlap[MAP_CELL_TOTAL/32]` global bitfield | `BitVec` or `FixedBitSet` per request (no global state)             |
| `FootClass::Find_Path()` virtual                 | Method on `RemastersPathfinder` struct                              |
| `Can_Enter_Cell()` virtual dispatch              | `LocomotorType` → passability query trait                           |
| `MoveType` enum with int costs                   | `enum MoveThreshold` with associated cost constants                 |
| `SpeedType` enum                                 | Maps to IC's `LocomotorType`                                        |
| `CellClass::Zones[MZONE_COUNT]`                  | `zones: [ZoneId; MZONE_COUNT]` per cell, computed on map change     |

### Determinism Considerations

The original algorithm is fully deterministic:
- No floats in pathfinding (all integer costs)
- Direction iteration order is fixed (same for all platforms)
- Overlap bitfield operations are deterministic
- Zone flood-fill is deterministic

This maps directly to IC's fixed-point sim requirement. No conversion needed for the core algorithm — it already uses integer math.

## Complexity Analysis

- **Time**: O(path_length × obstacle_perimeter) worst case — each obstacle trace can walk the full perimeter
- **Space**: O(map_cells / 8) for the overlap bitfield + O(path_length) for the moves array
- **Not optimal**: The algorithm does NOT find shortest paths. It finds *locally reasonable* paths quickly. This is intentional — it matches the original game's behavior and runs in roughly linear time.

For a 128×128 map with moderate obstacles, typical paths complete in hundreds of iterations, not thousands. The algorithm is extremely fast for its era (and still fast today) because it never builds a priority queue or explores the full search space.

## Key Differences from Standard A*

| Aspect            | A*                                  | Remastered/Original C&C               |
| ----------------- | ----------------------------------- | ------------------------------------- |
| Search style      | Global best-first                   | Local greedy + trace                  |
| Data structure    | Priority queue                      | Overlap bitfield                      |
| Optimality        | Optimal (with admissible heuristic) | Not optimal                           |
| Behavior on block | Explores around                     | Traces edge, picks CW/CCW             |
| Path quality      | Smooth                              | "Bumpy" — units visibly adjust        |
| Speed             | O(cells × log(cells))               | O(path_length × obstacle_perimeter)   |
| Memory            | O(cells) visited set                | O(cells / 8) bitfield                 |
| Character         | Clinical precision                  | Organic, "soldiers feeling their way" |

The non-optimal paths are a *feature* of the Remastered feel — they're what makes unit movement look like real soldiers navigating, not robots executing optimal routes.
