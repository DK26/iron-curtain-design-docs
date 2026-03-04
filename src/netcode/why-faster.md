# Why It Feels Faster Than OpenRA

Every lockstep RTS has inherent input delay — the game must wait for all players' orders before advancing. This is **architectural**, not a bug. But how much delay, and who pays for it, varies dramatically.

### OpenRA's Stalling Model

OpenRA uses TCP-based lockstep where the game advances only when ALL clients have submitted orders for the current net frame (`OrderManager.TryTick()` checks `pendingOrders.All(...)`):

```
Tick 50: waiting for Player A's orders... ✓ (10ms)
         waiting for Player B's orders... ✓ (15ms)
         waiting for Player C's orders... ⏳ (280ms — bad WiFi)
         → ALL players frozen for 280ms. Everyone suffers.
```

Additionally (verified from source):
- Orders are batched every `NetFrameInterval` frames (not every tick), adding batching delay
- The server adds `OrderLatency` frames to every order (default 1 for local, higher for MP game speeds)
- `OrderBuffer` dynamically adjusts per-player `TickScale` (up to 10% speedup) based on delivery timing
- Even in **single player**, `EchoConnection` projects orders 1 frame forward
- C# GC pauses add unpredictable jank on top of the architectural delay

The perceived input lag when clicking units in OpenRA is estimated at ~100-200ms — a combination of intentional lockstep delay, order batching, and runtime overhead.

### Our Model: No Stalling

The relay server owns the clock. It broadcasts tick orders on a fixed deadline — missed orders are replaced with `PlayerOrder::Idle`:

```
Tick 50: relay deadline = 80ms
         Player A orders arrive at 10ms  → ✓ included
         Player B orders arrive at 15ms  → ✓ included  
         Player C orders arrive at 280ms → ✗ missed deadline → Idle
         → Relay broadcasts at 80ms. No stall. Player C's units idle.
```

Honest players on good connections always get responsive gameplay. A lagging player hurts only themselves.

### Input Latency Comparison

*OpenRA values are from source code analysis, not runtime benchmarks. Tick processing times are estimates.*

| Factor                      | OpenRA                               | Iron Curtain                                                                              | Improvement                            |
| --------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------- |
| Waiting for slowest client  | Yes — everyone freezes               | No — relay drops late orders                                                              | Eliminates worst-case stalls entirely  |
| Order batching interval     | Every N frames (`NetFrameInterval`)  | Every tick                                                                                | No batching delay                      |
| Order scheduling delay      | +`OrderLatency` ticks                | +1 tick (next relay broadcast)                                                            | Fewer ticks of delay                   |
| Tick processing time        | Estimated 30-60ms (limits tick rate) | ~8ms (allows higher tick rate)                                                            | 4-8x faster per tick                   |
| Achievable tick rate        | ~15 tps                              | 30+ tps                                                                                   | 2x shorter lockstep window             |
| GC pauses during processing | C# GC characteristic                 | 0ms                                                                                       | Eliminates unpredictable hitches       |
| Visual feedback on click    | Waits for order confirmation         | Immediate (cosmetic prediction)                                                           | Perceived lag drops to near-zero       |
| Single-player order delay   | 1 projected frame (~66ms at 15 tps)  | 0 frames (`LocalNetwork` = next tick)                                                     | Zero delay                             |
| Worst connection impact     | Freezes all players                  | Only affects the lagging player                                                           | Architectural fairness                 |
| Architectural headroom      | No sim snapshots                     | Snapshottable sim (D010) enables optional rollback/GGPO experiments (`M11`, `P-Optional`) | Path to eliminating perceived MP delay |
