# 10 — Performance

**Keywords:** efficiency pyramid, cache-friendly ECS, simulation LOD, zero-allocation, profiling, benchmarks, GPU compatibility, render tiers, delta encoding, RAM mode

IC follows an **efficiency-first** philosophy: better algorithms → cache-friendly ECS → simulation LOD → amortized work → zero-allocation hot paths → THEN multi-core as a bonus. A 2-core 2012 laptop must run 500 units smoothly. Render quality tiers down automatically on older GPUs.

---

## Section Index

| Section                          | Description                                                                                                                   | File                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Efficiency Pyramid**           | Core principle, 6-layer optimization hierarchy (algorithm → cache → LOD → amortize → zero-alloc → parallelism)                | [efficiency-pyramid](performance/efficiency-pyramid.md) |
| **Targets & Comparisons**        | Performance targets, vs C# RTS engines, input responsiveness vs OpenRA                                                        | [targets](performance/targets.md)                       |
| **GPU & Hardware Compatibility** | wgpu backend matrix, 2012 laptop problem, render quality tiers, auto-detection, hardware profiles, config.toml render section | [gpu-hardware](performance/gpu-hardware.md)             |
| **Profiling & Regression**       | Profiling strategy, regression testing, benchmark infrastructure                                                              | [profiling](performance/profiling.md)                   |
| **Delta Encoding & Invariants**  | Change tracking performance, decision record, cross-document performance invariants                                           | [delta-encoding](performance/delta-encoding.md)         |
| **RAM Mode**                     | Minimal memory footprint mode for constrained environments                                                                    | [ram-mode](performance/ram-mode.md)                     |
