# Performance Targets & Comparisons

## Performance Targets

| Metric                    | Weak Machine (2 core, 4GB) | Mid Machine (8 core, 16GB) | Strong Machine (16 core, 32GB) | Mobile (phone/tablet)  | Browser (WASM)               |
| ------------------------- | -------------------------- | -------------------------- | ------------------------------ | ---------------------- | ---------------------------- |
| Smooth battle size        | 500 units                  | 2000 units                 | 3000+ units                    | 200 units              | 300 units                    |
| Tick time budget          | 66ms (Slower, ~15 tps)     | 66ms (Slower, ~15 tps)     | 50ms (Normal, ~20 tps)         | 66ms (Slower, ~15 tps) | 66ms (Slower, ~15 tps)       |
| Actual tick time (target) | < 40ms                     | < 10ms                     | < 5ms                          | < 50ms                 | < 40ms                       |
| Render framerate          | 60fps                      | 144fps                     | 240fps                         | 30fps                  | 60fps                        |
| RAM usage (1000 units)    | < 150MB                    | < 200MB                    | < 200MB                        | < 100MB                | < 100MB                      |
| Startup to menu           | < 3 seconds                | < 1 second                 | < 1 second                     | < 5 seconds            | < 8 seconds (incl. download) |
| Per-tick heap allocation  | 0 bytes                    | 0 bytes                    | 0 bytes                        | 0 bytes                | 0 bytes                      |

> **Tick budget rationale (D060):** The sim tick rate varies with game speed preset (Slowest 80ms / Slower 67ms / Normal 50ms / Faster 35ms / Fastest 20ms per tick). The Slower default runs ~15 tps (67ms). Tick time budgets target the default Slower speed for weak/mid/mobile/browser, and Normal speed (~20 tps, 50ms) for strong machines. Actual tick time must be well under the budget to leave headroom for faster speed presets.

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

| Factor                      | OpenRA (estimated)            | Iron Curtain                      | Why Faster                                |
| --------------------------- | ----------------------------- | --------------------------------- | ----------------------------------------- |
| Waiting for slowest client  | Yes — everyone freezes        | No — relay drops late orders      | Relay owns the clock                      |
| Order batching interval     | Every N frames (configurable) | Every tick                        | Higher tick rate makes N=1 viable         |
| Tick processing time        | Estimated 30-60ms             | ~8ms                              | Algorithmic efficiency                    |
| Achievable tick rate        | ~15 tps                       | 30+ tps                           | 4x shorter lockstep window                |
| GC pauses during tick       | 5-50ms (C# characteristic)    | 0ms                               | Rust, zero-allocation                     |
| Visual feedback on click    | Waits for confirmation        | Immediate (cosmetic)              | Render-side prediction, no sim dependency |
| Single-player order delay   | ~66ms (1 projected frame)     | ~50ms (next tick at Normal speed) | `LocalNetwork` = zero scheduling delay    |
| Worst-case MP click-to-move | Estimated 200-400ms           | 80-120ms (relay deadline)         | Fixed deadline, no hostage-taking         |

**Combined effect:** A single-player click-to-move that takes ~200ms in OpenRA (order latency + tick time + potential GC jank) should take ~50ms in Iron Curtain at Normal speed — imperceptible to human reaction time. Multiplayer improves from "at the mercy of the worst connection" to a fixed, predictable deadline.

See `03-NETCODE.md` § "Why It Feels Faster Than OpenRA" for the full architectural analysis, including visual prediction and single-player zero-delay.
