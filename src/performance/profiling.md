# Profiling & Regression Strategy

### Automated Benchmarks (CI)

```rust
#[bench] fn bench_tick_100_units()  { tick_bench(100); }
#[bench] fn bench_tick_500_units()  { tick_bench(500); }
#[bench] fn bench_tick_1000_units() { tick_bench(1000); }
#[bench] fn bench_tick_2000_units() { tick_bench(2000); }

#[bench] fn bench_flowfield_generation() { ... }
#[bench] fn bench_spatial_query_1000() { ... }
#[bench] fn bench_fog_recalc_full_map() { ... }

#[bench] fn bench_snapshot_1000_units() { ... }
#[bench] fn bench_restore_1000_units() { ... }
```

### Regression Rule

CI fails if any benchmark regresses > 10% from the rolling average. Performance is a ratchet — it only goes up.

### Engine Telemetry (D031)

Per-system tick timing from the benchmark suite can be exported as OTEL metrics for deeper analysis when the `telemetry` feature flag is enabled. This bridges offline benchmarks with live system inspection:

- Per-system execution time histograms (`sim.system.<name>_us`)
- Entity count gauges, pathfinding cache hit rates, memory usage
- Gameplay event stream for AI training data collection
- Debug overlay (via `bevy_egui`) reads live telemetry for real-time profiling during development

Telemetry is zero-cost when disabled (compile-time feature gate). Release builds intended for players ship without it. Tournament servers, AI training, and development builds enable it. See `decisions/09e/D031-observability.md` for full design.

### Diagnostic Overlay & Real-Time Observability

IC needs a **player-visible diagnostic overlay** — the equivalent of Source Engine's `net_graph`, but designed for lockstep RTS rather than client-server FPS. The overlay reads live telemetry data (D031) and renders via `bevy_egui` as a configurable HUD element. Console commands (D058) control which panels are visible.

**Inspired by:** Source Engine's `net_graph 1/2/3` (layered detail), Factorio's debug panels (F4/F5), StarCraft 2's Ctrl+Alt+F (latency/FPS bar), Supreme Commander's sim speed indicator. Source's `net_graph` is the gold standard for "always visible, never in the way" — IC adapts the concept to lockstep semantics where there is no prediction, no interpolation, and latency means order-delivery delay rather than entity rubber-banding.

#### Overlay Levels

The overlay has four levels, toggled by `/diag <level>` or the cvar `debug.diag_level`. Higher levels include everything from lower levels.

| Level | Name     | Audience              | What It Shows                                                                                                 | Feature Gate             |
| ----- | -------- | --------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 0     | Off      | —                     | Nothing                                                                                                       | —                        |
| 1     | Basic    | All players           | FPS, sim tick time, network latency (RTT), entity count                                                       | Always available         |
| 2     | Detailed | Power users, modders  | Per-system tick breakdown, pathfinding stats, order queue depth, memory, tick sync status                     | Always available         |
| 3     | Full     | Developers, debugging | ECS component inspector, AI state viewer, fog debug visualization, network packet log, desync hash comparison | `dev-tools` feature flag |

**Level 1 — Basic** (the "net_graph 1" equivalent):

```
┌─────────────────────────────┐
│  FPS: 60    Tick: 15.0 tps  │
│  RTT: 42ms  Jitter: ±3ms   │
│  Entities: 847              │
│  Sim: 4.2ms / 66ms budget   │
│  ████░░░░░░ 6.4%            │
└─────────────────────────────┘
```

- **FPS:** Render frames per second (client-side, independent of sim rate)
- **Tick:** Actual simulation ticks per second vs target (e.g., 15.0/15 tps). Drops below target indicate sim overload
- **RTT:** Round-trip time to the relay server (multiplayer) or "Local" (single-player). Sourced from `relay.player.rtt_ms`
- **Jitter:** RTT variance — high jitter means inconsistent order delivery
- **Entities:** Total sim entities (units + projectiles + buildings + effects)
- **Sim:** Current tick computation time vs budget, with a bar graph showing budget utilization. Green = <50%, yellow = 50-80%, red = >80%

**Level 2 — Detailed** (the "net_graph 2" equivalent):

```
┌─────────────────────────────────────────┐
│  FPS: 60    Tick: 15.0 tps              │
│  RTT: 42ms  Jitter: ±3ms               │
│  Entities: 847  (Units: 612  Proj: 185) │
│                                         │
│  ── Sim Tick Breakdown (4.2ms) ──       │
│  movement    ██████░░░░  1.8ms (net 1.2)│
│  combat      ████░░░░░░  1.1ms          │
│  pathfinding ██░░░░░░░░  0.5ms          │
│  fog         █░░░░░░░░░  0.3ms          │
│  production  ░░░░░░░░░░  0.2ms          │
│  orders      ░░░░░░░░░░  0.1ms          │
│  other       ░░░░░░░░░░  0.2ms          │
│                                         │
│  ── Pathfinding ──                      │
│  Requests: 23/tick  Cache: 87% hit      │
│  Flowfields: 4 active  Recalc: 1        │
│                                         │
│  ── Network ──                          │
│  Orders TX: 3/tick  RX: 12/tick         │
│  Cushion: 3 ticks (200ms) ✓            │
│  Queue depth: 2 ticks ahead             │
│  Tick sync: ✓ (0 drift)                 │
│  State hash: 0xA3F7…  ✓ match          │
│                                         │
│  ── Memory ──                           │
│  Scratch: 48KB / 256KB                  │
│  Component storage: 12.4 MB             │
│  Flowfield cache: 2.1 MB (4 fields)     │
└─────────────────────────────────────────┘
```

- **Sim tick breakdown:** Per-system execution time, drawn as horizontal bar chart. Systems are sorted by cost (most expensive first). Colors match budget status. System names map to the OTEL metrics from D031 (`sim.system.<name>_us`). Each system shows **net time** (excluding child calls) by default; gross time (including children) shown on hover/expand. This gross/net distinction — inspired by SAGE engine's `PerfGather` hierarchical profiler (see `research/generals-zero-hour-diagnostic-tools-study.md`) — prevents the confusion where "movement: 3ms" includes pathfinding that's already shown separately
- **Pathfinding:** Active flowfield count, cache hit rate (`sim.pathfinding.cache_hits` / `sim.pathfinding.requests`), recalculations this tick
- **Network:** Orders sent/received per tick, **command arrival cushion** (how far ahead orders arrive before they're needed — the most meaningful lockstep metric, inspired by SAGE's `FrameMetrics::getMinimumCushion()`), order queue depth, tick synchronization status (drift from canonical tick), and the current `state_hash` with match/mismatch indicator. Cushion warning: yellow at <3 ticks, red at <2 ticks (stall imminent)
- **Memory:** TickScratch buffer usage, total ECS component storage, flowfield cache footprint

**Collection interval:** Expensive Level 2 metrics (pathfinding cache analysis, memory accounting, ECS archetype counts) are batched on a configurable interval (`debug.diag_batch_interval_ms` cvar, default: 500ms) rather than computed per-frame. This pattern is validated by SAGE engine's 2-second collection interval in `gatherDebugStats()`. Cheap metrics (FPS, tick time, entity count) are still per-frame

**Level 3 — Full** (developer mode, `dev-tools` feature flag required):

Adds interactive panels rendered via `bevy_egui`:

- **ECS Inspector:** Browse entities by archetype, view component values in real time. Click an entity in the game world to inspect it. Shows position, health, current order, AI state, owner, all components. Read-only — inspection never modifies sim state (Invariant #1)
- **AI State Viewer:** For selected unit(s), shows current task/schedule, interrupt mask, strategy slot assignment, failed path count, idle reason. Essential for debugging "why won't my units move?" scenarios
- **Order Queue Inspector:** Shows the full order pipeline: pending orders in the network queue, orders being validated (D012), orders applied this tick. Includes sub-tick timestamps (D008)
- **Fog Debug Visualization:** Overlays fog-of-war boundaries on the game world. Shows which cells are visible/explored/hidden for the selected player. Highlights stagger bucket boundaries (which portion of the fog map updated this tick)
- **World Debug Markers:** A global `debug_marker(pos, color, duration, category)` API callable from any system — pathfinding, AI, combat, triggers — with **category-based filtering** via `/diag ai paths`, `/diag ai zones`, `/diag fog cells` as independent toggles. Self-expiring markers clean up automatically. Inspired by SAGE engine's `addIcon()` pattern (see `research/generals-zero-hour-diagnostic-tools-study.md`) but with category filtering that SAGE lacked — essential for 1000-unit games where showing all markers simultaneously would be unusable
- **Network Packet Log:** Scrollable log of recent network messages (orders, state hashes, relay control messages). Filterable by type, player, tick. Shows raw byte sizes and timing
- **Desync Debugger:** When a desync is detected, freezes the overlay and shows the divergence point — which tick, which state hash components differ, and (if both clients have telemetry) a field-level diff of the diverged state. **Frame-gated detail logging:** on desync detection, automatically enables detailed state logging for 50 ticks before and after the divergence point (ring buffer captures the "before" window), dumps to structured JSON, and makes available via `/diag export`. This adopts SAGE engine's focused-capture pattern rather than always-on deep logging. Export includes a machine/session identifier for cross-client `diff` analysis (inspired by SAGE's per-machine CRC dump files)

#### Console Commands (D058 Integration)

All diagnostic overlay commands go through the existing `CommandDispatcher` (D058). They are **client-local** — they do not produce `PlayerOrder`s and do not flow through the network. They read telemetry data that is already being collected.

| Command                 | Behavior                                                      | Permission                       |
| ----------------------- | ------------------------------------------------------------- | -------------------------------- |
| `/diag` or `/diag 1`    | Toggle basic overlay (level 1)                                | Player                           |
| `/diag 0`               | Turn off overlay                                              | Player                           |
| `/diag 2`               | Detailed overlay                                              | Player                           |
| `/diag 3`               | Full developer overlay                                        | Developer (`dev-tools` required) |
| `/diag net`             | Show only the network panel (any level)                       | Player                           |
| `/diag sim`             | Show only the sim tick breakdown panel                        | Player                           |
| `/diag path`            | Show only the pathfinding panel                               | Player                           |
| `/diag mem`             | Show only the memory panel                                    | Player                           |
| `/diag ai`              | Show AI state viewer for selected unit(s)                     | Developer                        |
| `/diag orders`          | Show order queue inspector                                    | Developer                        |
| `/diag fog`             | Toggle fog debug visualization                                | Developer                        |
| `/diag desync`          | Show desync debugger panel                                    | Developer                        |
| `/diag pos <corner>`    | Move overlay position: `tl`, `tr`, `bl`, `br` (default: `tr`) | Player                           |
| `/diag scale <0.5-2.0>` | Scale overlay text size (accessibility)                       | Player                           |
| `/diag export`          | Dump current overlay state to a timestamped JSON file         | Player                           |

**Cvar mappings** (for `config.toml` and persistent configuration):

```toml
[debug]
diag_level = 0            # 0-3, default off
diag_position = "tr"      # tl, tr, bl, br
diag_scale = 1.0          # text scale factor
diag_opacity = 0.8        # overlay background opacity (0.0-1.0)
show_fps = true           # standalone FPS counter (separate from diag overlay)
show_network_stats = false # legacy alias for diag_level >= 1 net panel
```

#### Graph History Mode

The basic and detailed overlays show instantaneous values by default. Pressing `/diag history` or clicking the overlay header toggles **graph history mode**: key metrics are rendered as scrolling line graphs over the last N seconds (configurable via `debug.diag_history_seconds`, default: 30).

Graphed metrics:
- **FPS** (line graph, green/yellow/red zones)
- **Sim tick time** (line graph with budget line overlay)
- **RTT** (line graph with jitter band)
- **Entity count** (line graph)
- **Pathfinding cost per tick** (line graph)

Graph history mode is especially useful for identifying **intermittent spikes** — a single frame's numbers disappear instantly, but a spike in the graph persists and is visible at a glance. This is the pattern that Source Engine's `net_graph 3` uses for bandwidth history, adapted to RTS-relevant metrics.

```
┌─ Sim Tick History (30s) ─────────────────┐
│ 10ms ┤                                    │
│      │         ╭─╮                        │
│  5ms ┤─────────╯ ╰────────────────────── │
│      │                                    │
│  0ms ┤────────────────────────────────── │
│      └────────────────────────────────── │
│       -30s                          now   │
│ ── budget (66ms) far above graph ✓ ──    │
└──────────────────────────────────────────┘
```

#### Mobile / Touch Support

On mobile/tablet (D065), the diagnostic overlay is accessible via:

- **Settings gear → Debug → Diagnostics** (GUI path, no console needed)
- **Three-finger triple-tap** (hidden gesture, for developers testing on physical devices)
- Level 1 and 2 are available on mobile; Level 3 requires `dev-tools` which is not expected on player-facing mobile builds

The overlay renders at a larger font size on mobile (auto-scaled by DPI) and uses the bottom-left corner by default (avoiding thumb zones and the minimap). Graph history mode uses touch-friendly swipe-to-scroll.

#### Mod Developer Diagnostics

Mods (Lua/WASM) can register custom diagnostic panels via the telemetry API:

```rust
/// Mod-registered diagnostic metric. Appears in a "Mod Diagnostics" panel
/// visible at overlay level 2+. Mods cannot read engine internals — they
/// can only publish their own metrics through this API.
pub struct ModDiagnosticMetric {
    pub name: String,        // e.g., "AI Think Time"
    pub value: DiagValue,    // Gauge, Counter, or Text
    pub category: String,    // Grouping label in the UI
}

/// Client-side display only — never enters ic-sim or deterministic game logic.
pub enum DiagValue {
    Gauge(f64),              // Current value (e.g., 4.2ms) — f64 is safe here (presentation only)
    Counter(u64),            // Monotonically increasing (e.g., total pathfinding requests)
    Text(String),            // Freeform (e.g., "State: Attacking")
}
```

Mod diagnostics are sandboxed: mods publish metrics through the API, the engine renders them. Mods cannot read other mods' diagnostics or engine-internal metrics. This prevents information leakage (e.g., a mod reading fog-of-war data through the diagnostic API).

#### Performance Overhead

The diagnostic overlay itself must not become a performance problem:

| Level         | Overhead      | Mechanism                                                |
| ------------- | ------------- | -------------------------------------------------------- |
| 0 (Off)       | Zero          | No reads, no rendering                                   |
| 1 (Basic)     | < 0.1ms/frame | Read 5 atomic counters + render 6 text lines via egui    |
| 2 (Detailed)  | < 0.5ms/frame | Read ~20 metrics + render breakdown bars + text          |
| 3 (Full)      | < 2ms/frame   | ECS query for selected entity + scrollable log rendering |
| Graph history | +0.2ms/frame  | Ring buffer append + line graph rendering                |

All metric reads are **lock-free**: the sim writes to atomic counters/gauges, the overlay reads them on the render thread. No mutex contention, no sim slowdown from enabling the overlay. The ECS inspector (Level 3) uses Bevy's standard query system and runs in the render schedule, not the sim schedule.

#### Implementation Phase

- **Phase 2 (M2):** Level 1 overlay (FPS, tick time, entity count) — requires only sim tick instrumentation that already exists for benchmarks
- **Phase 3 (M3):** Level 2 overlay (per-system breakdown, pathfinding, memory) — requires D031 telemetry instrumentation
- **Phase 4 (M4):** Network panels (RTT, order queue, tick sync, state hash) — requires netcode instrumentation
- **Phase 5+ (M6):** Level 3 developer panels (ECS inspector, AI viewer, desync debugger) — requires mature sim + AI + netcode
- **Phase 6a (M8):** Mod diagnostic API — requires mod runtime (Lua/WASM) with telemetry bridge

### Profile Before Parallelize

Never add `par_iter()` without profiling first. Measure single-threaded. If a system takes > 1ms, consider parallelizing. If it takes < 0.1ms, sequential is faster (avoids coordination overhead).

**Recommended profiling tool:** Embark Studios' **puffin** (1,674★, MIT/Apache-2.0) — a frame-based instrumentation profiler built for game loops. Puffin's thread-local profiling streams have ~1ns overhead when disabled (atomic bool check, no allocation), making it safe to leave instrumentation in release builds. Key features validated by production use at Embark: frame-scoped profiling (maps directly to IC's sim tick loop), remote TCP streaming for profiling headless servers (relay server profiling without local UI), and the `puffin_egui` viewer for real-time flame graphs in development builds via `bevy_egui`. IC's `telemetry` feature flag (D031) should gate puffin's collection, maintaining zero-cost when disabled. See `research/embark-studios-rust-gamedev-analysis.md` § puffin.

### SDK Profile Playtest (D038 Integration, Advanced Mode)

Performance tooling must not make the SDK feel heavy for casual creators. The editor should expose profiling as an **opt-in Advanced workflow**, not a required step before every preview/test:

- Default toolbar stays simple: `Preview` / `Test` / `Validate` / `Publish`
- Profiling lives behind `Test ▼ → Profile Playtest` and an Advanced Performance panel
- No automatic profiling on save or on every test launch

**Profile Playtest output style (summary-first):**
- Pass / warn / fail against a selected performance budget profile (desktop default, low-end target, etc.)
- Top 3 hotspots (creator-readable grouping, not raw ECS internals only)
- Average / max sim tick time
- Trigger/module hotspot links where traceability exists
- Optional detailed flame graph / trace view for advanced debugging

This complements the Scenario Complexity Meter in `decisions/09f/D038-scenario-editor.md`: the meter is a heuristic guide, while Profile Playtest provides measured evidence during playtest.

**CLI/CI parity (Phase 6b):** Headless profiling summaries (`ic mod perf-test`) should reuse the same summary schema as the SDK view so teams can gate performance in CI without an SDK-only format.
