## D009: Simulation — Fixed-Point Math, No Floats

**Decision:** All sim-layer calculations use integer/fixed-point arithmetic. Floats allowed only for rendering interpolation.

**Rationale:**
- Required for deterministic lockstep (floats can produce different results across platforms)
- Original Red Alert used integer math — proven approach
- OpenRA uses `WDist`/`WPos`/`WAngle` with 1024 subdivisions — same principle

> **P002 resolved:** Scale factor = **1024** (matching OpenRA). Full type library (`Fixed`, `WorldPos`, `WAngle`), trig tables, CORDIC atan2, Newton sqrt, modifier arithmetic, and determinism guarantees: see `research/fixed-point-math-design.md`.
