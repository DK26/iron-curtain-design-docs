## Pathfinding & Spatial Queries

**Decision:** Pathfinding and spatial queries are abstracted behind traits — like `NetworkModel`. A multi-layer hybrid pathfinder is the first implementation (RA1 game module). The engine core has no hardcoded assumption about grids vs. continuous space.

OpenRA uses hierarchical A* which struggles with large unit groups and lacks local avoidance. A multi-layer approach (hierarchical sectors + JPS/flowfield tiles + ORCA-lite avoidance) handles both small-group and mass unit movement. But pathfinding is a game-module concern, not an engine-core assumption.

### Pathfinder Trait

```rust
/// Game modules implement this to provide pathfinding.
/// Grid-based games use multi-layer hybrid (JPS + flowfield tiles + avoidance).
/// Continuous-space games would use navmesh.
/// The engine core calls this trait — never a specific algorithm.
pub trait Pathfinder: Send + Sync {
    /// Request a path from origin to destination.
    /// Returns a local handle (`PathId`) used only inside the running sim instance.
    /// `PathId` is not part of network protocol or replay/save serialization.
    fn request_path(&mut self, origin: WorldPos, dest: WorldPos, locomotor: LocomotorType) -> PathId;

    /// Poll for completed path. Returns waypoints in WorldPos.
    fn get_path(&self, id: PathId) -> Option<&[WorldPos]>;

    /// Can a unit with this locomotor pass through this position?
    fn is_passable(&self, pos: WorldPos, locomotor: LocomotorType) -> bool;

    /// Invalidate cached paths (e.g., building placed, bridge destroyed).
    fn invalidate_area(&mut self, center: WorldPos, radius: SimCoord);

    /// Query the path distance between two points without computing full waypoints.
    /// Returns `None` if no path exists. Used by AI for target selection, threat assessment,
    /// and build placement scoring.
    fn path_distance(&self, from: WorldPos, to: WorldPos, locomotor: LocomotorType) -> Option<SimCoord>;

    /// Batch distance queries — amortizes overhead when AI needs distances to many targets.
    /// Writes results into caller-provided scratch (`out`) in the same order as `targets`.
    /// `None` entries mean no path. Implementations must clear/reuse `out` (no hidden heap scratch
    /// returned to the caller), preserving the zero-allocation hot-path discipline.
    /// Design informed by SC2's batch `RequestQueryPathing` (see `research/blizzard-github-analysis.md` § Part 4).
    fn batch_distances_into(
        &self,
        from: WorldPos,
        targets: &[WorldPos],
        locomotor: LocomotorType,
        out: &mut Vec<Option<SimCoord>>,
    );

    /// Convenience wrapper for non-hot paths (tools/debug/tests).
    /// Hot gameplay loops should prefer `batch_distances_into`.
    fn batch_distances(
        &self,
        from: WorldPos,
        targets: &[WorldPos],
        locomotor: LocomotorType,
    ) -> Vec<Option<SimCoord>> {
        let mut out = Vec::with_capacity(targets.len());
        self.batch_distances_into(from, targets, locomotor, &mut out);
        out
    }
}
```

### SpatialIndex Trait

```rust
/// Game modules implement this for spatial queries (range checks, collision, targeting).
/// Grid-based games use a spatial hash grid. Continuous-space games could use BVH or R-tree.
/// The engine core queries this trait — never a specific data structure.
pub trait SpatialIndex: Send + Sync {
    /// Find all entities within range of a position.
    /// Writes results into caller-provided scratch (`out`) with deterministic ordering.
    /// Contract: for identical sim state + filter, the output order must be identical on all clients.
    /// Default recommendation is ascending `EntityId`, unless a stricter subsystem-specific contract exists.
    fn query_range_into(
        &self,
        center: WorldPos,
        range: SimCoord,
        filter: EntityFilter,
        out: &mut Vec<EntityId>,
    );

    /// Update entity position in the index.
    fn update_position(&mut self, entity: EntityId, old: WorldPos, new: WorldPos);

    /// Remove entity from the index.
    fn remove(&mut self, entity: EntityId);
}
```

### Determinism, Snapshot, and Cache Rules (Pathfinding/Spatial)

The `Pathfinder` and `SpatialIndex` traits are algorithm seams, but they still operate under the simulation's deterministic/snapshottable rules:

- **Authoritative state lives in ECS/components**, not only inside opaque pathfinder internals.
- **Path IDs are local handles**, not stable serialized identifiers.
- **Derived caches** (flowfield caches, sector caches, spatial buckets, temporary query results) may be omitted from snapshots and rebuilt on load/restore/reconnect.
- **Pending path requests** must be either:
  - represented in authoritative sim state, or
  - safely reconstructible deterministically on restore.
- **Internal parallelism is allowed** only if the visible outputs (paths, distances, query results) are deterministic and independent of worker scheduling/order.
- **Validation/debug tooling** may recompute caches from authoritative state (see `03-NETCODE.md` cache validation) to detect missed invalidation bugs.

### Why This Matters

This is the same philosophy as `WorldPos.z` — costs near-zero now, prevents rewrites later:

| Abstraction       | Costs Now                                 | Saves Later                                                |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `WorldPos.z`      | One extra `i32` per position              | RA2/TS elevation works without restructuring coordinates   |
| `NetworkModel`    | One trait + `LocalNetwork` impl           | Multiplayer netcode slots in without touching sim          |
| `InputSource`     | One trait + mouse/keyboard impl           | Touch/gamepad slot in without touching game loop           |
| `Pathfinder`      | One trait + multi-layer hybrid impl first | Navmesh pathfinding slots in; RA1 ships 3 impls (D045)     |
| `SpatialIndex`    | One trait + spatial hash impl             | BVH/R-tree slots in without touching combat/targeting      |
| `FogProvider`     | One trait + radius fog impl               | Elevation fog, fog-authoritative server slot in            |
| `DamageResolver`  | One trait + standard pipeline impl        | Shield-first/sub-object damage models slot in              |
| `AiStrategy`      | One trait + personality-driven AI impl    | Neural/planning/custom AI slots in without forking ic-ai   |
| `RankingProvider` | One trait + Glicko-2 impl                 | Community servers choose their own rating algorithm        |
| `OrderValidator`  | One trait + standard validation impl      | Engine enforces validation; modules can't skip it silently |

The RA1 game module registers three `Pathfinder` implementations — `RemastersPathfinder`, `OpenRaPathfinder`, and `IcPathfinder` (D045) — plus `GridSpatialHash`. The active pathfinder is selected via experience profiles (D045). A deferred/optional continuous-space game module would register `NavmeshPathfinder` and `BvhSpatialIndex`. The sim core calls the trait — it never knows which one is running. The same principle applies to fog, damage, AI, ranking, and validation — see D041 in `decisions/09d-gameplay.md` for the full trait definitions and rationale.
