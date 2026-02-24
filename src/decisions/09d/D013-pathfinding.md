## D013: Pathfinding — Trait-Abstracted, Multi-Layer Hybrid First

**Decision:** Pathfinding and spatial queries are abstracted behind traits (`Pathfinder`, `SpatialIndex`) in the engine core. The RA1 game module implements them with a multi-layer hybrid pathfinder and spatial hash. The engine core never calls algorithm-specific functions directly.

**Rationale:**
- OpenRA uses hierarchical A* which struggles with large unit groups and lacks local avoidance
- A multi-layer approach (hierarchical sectors + JPS/flowfield tiles + local avoidance) handles both small and mass movement well
- Grid-based implementations are the right choice for the isometric C&C family
- But pathfinding is a *game module concern*, not an engine-core assumption
- Abstracting behind a trait costs near-zero now (one trait, one impl) and prevents a rewrite if a future game module needs navmesh or any other spatial model
- Same philosophy as `NetworkModel` (build `LocalNetwork` first, but the seam exists), `WorldPos.z` (costs one `i32`, saves RA2 rewrite), and `InputSource` (build mouse/keyboard first, touch slots in later)

**Concrete design:**
- `Pathfinder` trait: `request_path()`, `get_path()`, `is_passable()`, `invalidate_area()`, `path_distance()`, `batch_distances_into()` (+ convenience `batch_distances()` wrapper for non-hot paths)
- `SpatialIndex` trait: `query_range_into()`, `update_position()`, `remove()`
- RA1 module registers `IcPathfinder` (primary) + `GridSpatialHash`; D045 adds `RemastersPathfinder` and `OpenRaPathfinder` as additional `Pathfinder` implementations for movement feel presets
- All sim systems call the traits, never grid-specific data structures
- See `02-ARCHITECTURE.md` § "Pathfinding & Spatial Queries" for trait definitions

**Modder-selectable and modder-provided:** The `Pathfinder` trait is open — not locked to first-party implementations. Modders can:
1. **Select** any registered `Pathfinder` for their mod (e.g., a total conversion picks `IcPathfinder` for its smooth movement, or `RemastersPathfinder` for its retro feel)
2. **Provide** their own `Pathfinder` implementation via a Tier 3 WASM module and distribute it through the Workshop (D030)
3. **Use someone else's** community-created pathfinder — just declare it as a dependency in the mod manifest

This follows the same pattern as render modes (D048): the engine ships built-in implementations, mods can add more, and players/modders pick what they want. A Generals-clone mod ships a `LayeredGridPathfinder`; a tower defense mod ships a waypoint pathfinder; a naval mod ships something flow-based. The trait doesn't care — `request_path()` returns waypoints regardless of how they were computed.

**Performance:** the architectural seam is **near-zero cost**. Pathfinding/spatial cost is dominated by algorithm choice, cache behavior, and allocations — not dispatch overhead. Hot-path APIs use caller-owned scratch buffers (`*_into` pattern). Dispatch strategy (static vs dynamic) is chosen per-subsystem by profiling, not by dogma.

**What we build first:** `IcPathfinder` and `GridSpatialHash`. The traits exist from day one. `RemastersPathfinder` and `OpenRaPathfinder` are Phase 2 deliverables (D045) — ported from their respective GPL codebases. Community pathfinders can be published to the Workshop from Phase 6a.

---

---
