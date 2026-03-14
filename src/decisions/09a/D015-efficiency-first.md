## D015: Performance — Efficiency-First, Not Thread-First

**Decision:** Performance is achieved through algorithmic efficiency, cache-friendly data layout, adaptive workload, zero allocation, and amortized computation. Multi-core scaling is a bonus layer on top, not the foundation.

**Principle:** The engine must run a 500-unit battle smoothly on a 2-core, 4GB machine from 2012. Multi-core machines get higher unit counts as a natural consequence of the work-stealing scheduler.

**The Efficiency Pyramid (ordered by impact):**
1. Algorithmic efficiency (flowfields, spatial hash, hierarchical pathfinding)
2. Cache-friendly ECS layout (hot/warm/cold component separation)
3. Simulation LOD (skip work that doesn't affect the outcome)
4. Amortized work (stagger expensive systems across ticks)
5. Zero-allocation hot paths (pre-allocated scratch buffers)
6. Work-stealing parallelism (rayon via Bevy — bonus, not foundation)

**Inspired by:** Datadog Vector's pipeline efficiency, Tokio's work-stealing runtime. These systems are fast because they waste nothing, not because they use more hardware.

**Anti-pattern rejected:** "Just parallelize it" as the default answer. Parallelism without algorithmic efficiency is adding lanes to a highway with broken traffic lights.

See `10-PERFORMANCE.md` for full details, targets, and implementation patterns.
