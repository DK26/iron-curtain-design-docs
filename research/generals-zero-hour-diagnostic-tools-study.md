# C&C Generals / Zero Hour — Diagnostic & Developer Tools Study

**Source:** https://github.com/electronicarts/CnC_Generals_Zero_Hour (GPL v3)
**Analyzed:** February 2026
**Purpose:** Extract diagnostic overlay, profiling, debug visualization, and developer tool patterns from the SAGE engine that inform Iron Curtain's diagnostic overlay system (`10-PERFORMANCE.md` § Diagnostic Overlay & Real-Time Observability).

**Companion study:** `research/generals-zero-hour-netcode-analysis.md` covers netcode architecture separately.

## Overview

The SAGE engine (Strategy Action Game Engine) — the engine behind C&C Generals/Zero Hour (2003) — contains a surprisingly sophisticated diagnostic infrastructure for a 2003 RTS. Key systems:

- **DebugDisplay** — abstract text overlay rendered via DirectX
- **PerfGather / AutoPerfGather** — hierarchical RAII frame profiler with overhead compensation
- **GraphDraw** — real-time bar chart of per-system frame time
- **FrameMetrics** — network latency and timing diagnostics
- **W3DDebugIcons** — 3D world overlay for pathfinding/AI/fog visualization
- **CRCDebug** — frame-gated desync detection with per-machine dump files
- **StatsCollector** — structured gameplay telemetry
- **ScriptDebugWindow** — external DLL-based debug tool with frame stepping

The codebase is split between `Generals/` and `GeneralsMD/` (Zero Hour). Both share the same diagnostic architecture. All paths reference `GeneralsMD/`.

### Primary Sources (Examined Files)

- `GameEngine/Include/GameClient/DebugDisplay.h` (abstract debug overlay interface)
- `GameEngineDevice/Source/W3DDevice/GameClient/W3DDebugDisplay.cpp` (DirectX text rendering)
- `GameEngineDevice/Source/W3DDevice/GameClient/W3DDisplay.cpp` (`gatherDebugStats`, `drawDebugStats`, `drawFPSStats`)
- `GameEngine/Include/GameClient/GraphDraw.h` / `Source/GameClient/GraphDraw.cpp` (bar chart profiler)
- `GameEngine/Include/Common/PerfTimer.h` / `Source/Common/PerfTimer.cpp` (hierarchical RAII profiler)
- `GameEngine/Include/Common/GlobalData.h` (all debug flags / "console variables")
- `GameEngine/Include/GameNetwork/FrameMetrics.h` / `Source/GameNetwork/FrameMetrics.cpp` (network timing)
- `GameEngineDevice/Include/W3DDevice/GameClient/W3DDebugIcons.h` (3D debug visualization)
- `GameEngine/Include/Common/CRCDebug.h` / `Source/Common/CRCDebug.cpp` (desync detection)
- `GameEngine/Include/Common/StatsCollector.h` (gameplay telemetry)
- `Tools/DebugWindow/` (external script debugger DLL)
- `GameEngine/Include/Common/Debug.h` / `Source/Common/System/Debug.cpp` (logging system)
- `GameEngine/Include/Common/GameLOD.h` (dynamic LOD from FPS tracking)

---

## Finding 1: Hierarchical Debug Display Architecture

**Files:** `DebugDisplay.h`, `W3DDebugDisplay.cpp`, `W3DDisplay.cpp`

SAGE uses a layered debug display system:

```
DebugDisplayInterface (abstract)
  → DebugDisplay (base implementation)
    → W3DDebugDisplay (DirectX text renderer)
```

The interface provides `printf()`, `setCursorPos()`, color selection (WHITE/BLACK/YELLOW/RED/GREEN/BLUE), and margin control. The W3D implementation renders Courier 10pt text with black drop-shadow — functional but crude.

The actual diagnostics live in `W3DDisplay` (the main display class), split into three modes:

| Function | What It Shows | When |
| --- | --- | --- |
| `drawFPSStats()` | FPS only (position 3,20) | `m_debugShowGraphicalFramerate` set |
| `gatherDebugStats()` + `drawDebugStats()` | Full diagnostic HUD (position 3,3) | `m_displayDebug` set |
| `drawCurrentDebugDisplay()` | Custom debug callback | Registered debug display active |

The full diagnostic HUD collects every 2 seconds:
- **FPS** (current + rolling average)
- **Polygon / vertex count** from renderer
- **VRAM usage**
- **Camera state** (position, zoom, pitch, FOV)
- **Input state** (keyboard modifiers, mouse buttons)
- **Selected object info** (model name, condition flags)
- **Network bandwidth** (bytes/sec and packets/sec, in/out)

**What works:** Clean abstract interface. The 2-second collection interval avoids per-frame overhead for expensive stats. The rendering is separate from collection.

**What breaks:** Everything is crammed into `W3DDisplay` — a god-class that owns rendering, debug stats, FPS tracking, LOD calculation, and stat dumping. No separation of concerns.

**IC takeaway:** IC's diagnostic overlay architecture (bevy_egui overlay, reads atomic counters from sim) already avoids this god-class problem. The key SAGE lesson is the **collection-interval pattern**: don't recalculate expensive stats every frame. IC's Level 2 detailed overlay should batch expensive queries (pathfinding cache analysis, memory accounting) on a configurable interval (default: 500ms), not per-frame.

---

## Finding 2: PerfGather — Hierarchical RAII Profiler with Overhead Compensation

**Files:** `PerfTimer.h`, `PerfTimer.cpp`

The most sophisticated system in SAGE's diagnostic infrastructure. Guarded by `#ifdef PERF_TIMERS`.

**Architecture:**
- Linked list of `PerfGather` instances (each represents a named timer)
- `AutoPerfGather` wraps timing in RAII scope — start on construction, stop on destruction
- **Timer stack** (max 256 depth) tracks nesting so child time can be subtracted from parent
- Tracks both **gross time** (total elapsed) and **net time** (excluding nested timers)
- **Overhead compensation**: measures its own start/stop cost and subtracts it from results
- Uses **RDTSC** (CPU timestamp counter) for sub-microsecond precision
- Skips first 30 frames to avoid load-time distortion

**Usage:**
```cpp
DECLARE_PERF_TIMER(mySystem)     // static timer declaration
USE_PERF_TIMER(mySystem)         // RAII scope timer (AutoPerfGather)
IGNORE_PERF_TIMER(mySystem)      // times but discards measurement
```

**Output:** Per-frame CSV dump via `initPerfDump("filename", mode)` with columns: gross time, net time, call count per timer per frame. Also feeds `GraphDraw` for real-time visualization.

**What works:**
- RAII guarantees timers are always stopped, even with early returns or exceptions
- Hierarchical tracking (child-time subtraction) gives accurate per-system costs without double-counting
- Overhead compensation is unusually rigorous for 2003 — they measured their own measurement cost
- The gross/net distinction is genuinely useful: "movement system took 3ms total, but 1.8ms of that was pathfinding inside it"

**What breaks:**
- RDTSC is unreliable on multi-core CPUs (core migration changes TSC values) — a 2003 assumption that broke in the multi-core era
- Linked list of timers means O(n) traversal for dump; no pre-sorted output
- 30-frame warmup is a magic number with no configurability

**IC takeaway:** IC's `puffin` profiler (see `10-PERFORMANCE.md`) already handles RAII scope timing with proper modern clock sources. But SAGE's **gross/net distinction** is valuable for the diagnostic overlay: when `/diag 2` shows the per-system breakdown, each system should show both its total time and its net time (excluding child system calls). This prevents the common confusion where "movement took 3ms" includes pathfinding that's already shown separately. IC should adopt this in the diagnostic overlay's per-system breakdown panel.

---

## Finding 3: GraphDraw — Real-Time Performance Bar Chart

**Files:** `GraphDraw.h`, `GraphDraw.cpp`

Singleton `TheGraphDraw`, rendering up to 36 labeled horizontal bars showing per-system frame time:

- `addEntry(label, value)` — queue a named metric each frame
- `render()` — draw labels on left, proportional bars on right
- Bars are 14px tall with 2px spacing
- Courier font, positioned at fixed screen coordinates

Integrates directly with `PerfGather` — each timer's net time becomes a bar entry.

**What works:** Immediate visual identification of which system is dominating frame time. The proportional bars make relative costs obvious at a glance — you don't need to read numbers.

**What breaks:** Fixed 36-entry cap. Fixed screen position. No sorting by cost. No color coding. No history/scrolling. No configurability at all.

**IC takeaway:** IC's Level 2 diagnostic overlay already includes per-system horizontal bar charts (designed in `10-PERFORMANCE.md`). SAGE validates this UX pattern — bars are more glanceable than numbers. IC's design improves on SAGE by: sorting bars by cost (most expensive first), color-coding by budget status (green/yellow/red), and supporting graph history mode for trend identification. The key confirmation: **bar charts for per-system time breakdown are a proven RTS diagnostic UX**.

---

## Finding 4: Network Diagnostics — FrameMetrics + Transport Statistics

**Files:** `FrameMetrics.h`, `FrameMetrics.cpp`, `Transport.cpp`

SAGE tracks two categories of network diagnostics:

**Transport-level (raw bandwidth):**
- Rolling-window statistics over ~30 seconds: bytes/sec and packets/sec (in/out/unknown)
- Window advances every 1000ms; current-second excluded to avoid partial measurement
- Exposed via `NetworkInterface::getIncomingBytesPerSecond()` etc.
- Displayed in the debug stats HUD

**FrameMetrics (lockstep-specific):**
- **FPS history**: logic FPS per second over 60-second circular buffer
- **Latency history**: round-trip time to packet router, per-measurement circular buffer
- **Cushion tracking**: minimum packet arrival cushion — how far ahead commands arrive before they're needed
- Methods: `getAverageLatency()`, `getAverageFPS()`, `getMinimumCushion()`

**What works:** The **cushion metric** is directly relevant to lockstep. In a lockstep engine, the critical network metric is not just latency but how far ahead commands arrive relative to when they're needed. If the cushion drops to zero, the sim stalls waiting for commands. SAGE tracks this explicitly.

**What breaks:** No visualization of these metrics beyond raw text numbers in the debug HUD. No graph history. No per-player breakdown (crucial for identifying which player is causing stalls). No desync correlation.

**IC takeaway:** IC's diagnostic overlay network panel should add a **command arrival cushion** metric — the number of ticks between when a player's orders arrive at the relay and when they're needed for execution. This is more meaningful for lockstep than raw RTT because it captures the effective margin before a stall. Display format: `Cushion: 3 ticks (200ms)` with a warning when cushion drops below 2 ticks. This is a **new addition** to the diagnostic overlay design inspired directly by SAGE's `FrameMetrics::getMinimumCushion()`.

---

## Finding 5: CRC Desync Detection — Frame-Gated Debug Logging

**Files:** `CRCDebug.h`, `CRCDebug.cpp`, `Network.cpp`, `Recorder.cpp`

SAGE's desync detection is production-quality for 2003:

- **Frame-gated capture**: CRC data only logged within `TheCRCFirstFrameToLog..TheCRCLastFrameToLog` range (saves memory, focuses on the desync window)
- **Circular buffer**: 64,000 strings × 1KB each for CRC event logging
- **Per-machine dump**: On desync, writes `crcDebug[MachineName].txt` — each machine's log is separate, enabling side-by-side diff
- **Data dumpers**: Functions for vectors, coordinates, matrices, floats — everything that contributes to game state CRC
- **Replay integration**: CRC checked every 100 frames during replay; mismatch flag written to replay header
- **UI notification**: `Menus/CRCMismatch.wnd` dialog shown to players on desync

**Command-line controls:**
- `-DebugCRCFromFrame N` — start CRC logging from frame N
- `-ClientDeepCRC` — enable deep (field-level) CRC tracking

**What works:** The frame-gated approach is smart — logging everything forever would be prohibitively expensive, but logging around the suspected desync frame captures the necessary state. Per-machine dump files with the same format enable `diff` for diagnosis.

**What breaks:** The circular buffer is a massive 64MB allocation (`64000 × 1024 bytes`). Frame range must be set before launch (command-line only, no runtime toggle). No structured output (text logs only). The 100-frame CRC interval in replays is too coarse for pinpointing the exact divergence tick.

**IC takeaway:** IC's desync debugger (diagnostic overlay Level 3) is already more capable — it shows divergence point, hash components, and field-level diff in real-time. But SAGE's **frame-gated logging** pattern is worth adopting: when a desync is detected, IC should automatically enable detailed state logging for N ticks around the desync point (e.g., 50 ticks before to 50 ticks after), dump to structured JSON, and make it available for `/diag export`. This avoids the overhead of always-on deep logging while capturing the diagnostic window. The per-machine dump format (enabling `diff`) is also a good pattern — IC's `/diag export` should include a machine identifier so exported files from different clients can be correlated.

---

## Finding 6: W3DDebugIcons — 3D World Debug Visualization

**Files:** `W3DDebugIcons.h`, `W3DDebugIcons.cpp`

A dedicated render object for drawing colored quads in the 3D game world, entirely within `#if defined _DEBUG || defined _INTERNAL`.

**Architecture:**
- Static array of `DebugIcon` structs: position, width, color, expiration frame
- Global `addIcon(pos, width, duration, color)` callable from any system
- Icons fade out over 100 frames before expiration
- Batch-rendered using DX8 dynamic vertex/index buffers
- Caps at 5,000 rendered quads per frame
- `compressIconsArray()` garbage-collects expired icons

**Used by AI/Pathfinding systems:**
- `AI_DEBUG_PATHS` — path nodes (0.25-cell markers) and optimized waypoints (0.8-cell markers)
- `AI_DEBUG_ZONES` — color-coded pathfinding zones (color = zone ID modulo math)
- `AI_DEBUG_CELLS` — per-cell pathfinding state:
  - Green/cyan = connected to ground
  - White = impassable
  - Red = cliff cells
- Fog/visibility debug: per-type colors for targetable, deshrouded, gap areas
- Threat map overlay: AI threat calculation visualization
- Cash value map: resource distribution heatmap
- Projectile path: bezier trajectory traces

**What works:** The `addIcon()` global function is brilliantly simple — any system can drop a visual marker into the world without coupling to the rendering system. Duration-based expiry means markers clean themselves up. The color-coded pathfinding visualization is exactly what you need for debugging "why won't my unit go there?"

**What breaks:** Fixed-size array (magic numbers). No LOD on debug icons — 5,000 quads with alpha blending is expensive for debug visualization. The fade-out effect is cosmetic but wastes fill rate. No structured grouping (can't toggle "show path icons" vs "show zone icons" independently — it's one `m_debugAI` enum with fixed levels).

**IC takeaway:** IC's `/diag fog` and AI viewer should adopt the **global marker function** pattern: a simple `debug_marker(pos, color, duration, category)` API callable from any system, with category-based filtering (`/diag ai paths`, `/diag ai zones`, `/diag ai cells` as separate toggles rather than SAGE's fixed enum levels). The duration-based expiry is good. The category filtering is essential — in a 1000-unit game, showing all pathfinding cells simultaneously would be unusable.

---

## Finding 7: GlobalData Debug Flags — INI-Driven "Console Variables"

**File:** `GlobalData.h`, `GameEngine.cpp`

SAGE has no in-game console. Instead, all debug configuration lives in `TheGlobalData` singleton, configured via INI files:

**Always-available flags:**
- `m_noDraw` — skip N frames of rendering
- `m_debugAI` — AI debug level enum: `AI_DEBUG_NONE`, `AI_DEBUG_PATHS`, `AI_DEBUG_ZONES`, `AI_DEBUG_CELLS`
- `m_debugAIObstacles`, `m_debugSupplyCenterPlacement`
- `m_showObjectHealth`, `m_showClientPhysics`, `m_showTerrainNormals`
- `m_displayDebug`, `m_constantDebugUpdate`
- `m_debugShowGraphicalFramerate`
- `m_debugProjectilePath` (configurable tile width, duration, color)
- `m_debugVisibility*` (tile count, width, duration, color per visibility type)
- `m_debugThreatMap`, `m_debugCashValueMap` (with max scaling values)

**Debug/Internal-only flags:**
- `m_wireframe`, `m_stateMachineDebug`
- `m_shroudOn`, `m_fogOfWarOn` — toggle fog
- `m_showCollisionExtents`, `m_showAudioLocations`
- `m_checkForLeaks` — memory leak detection
- `m_vTune` — VTune profiling integration

**INI loading pattern:** In debug/internal builds, `GameDataDebug.ini` is loaded after `GameData.ini` with `INI_LOAD_OVERWRITE`. Developers override any flag without touching the release INI.

**What works:** INI-driven configuration means no recompilation to change debug settings. The debug/release INI split is clean — developers get their own override file. The AI debug enum is well-designed with escalating detail levels.

**What breaks:** **No runtime toggle**. Every flag requires a game restart. This is the single biggest limitation of SAGE's diagnostic system. Source Engine's console lets you type `net_graph 3` mid-game; SAGE requires you to exit, edit an INI file, and restart. For a system designed to help diagnose transient runtime issues, this is backwards.

**IC takeaway:** IC already solves this with D058's `/diag` commands and cvars. But SAGE's **debug flag taxonomy** is worth studying — the categorical organization (`m_debugAI`, `m_debugVisibility*`, `m_debugProjectilePath*`) maps naturally to IC's `/diag ai`, `/diag fog`, and potential `/diag projectile` commands. Each category having sub-parameters (tile width, duration, color) suggests that IC's diagnostic commands should support parameter customization: `/diag ai paths color=red duration=5`.

---

## Finding 8: Three-Tier Compilation Gating

SAGE uses three compilation tiers for diagnostic code:

| Tier | Macro | Purpose | Who Gets It |
| --- | --- | --- | --- |
| Debug | `_DEBUG` | Full diagnostics, assertions, stack traces | Developers only |
| Internal | `_INTERNAL` | Reduced diagnostics, some assertions | QA and internal testers |
| Release | (none) | Minimal diagnostics, `RELEASE_DEBUG_LOGGING` only | Players |

Key guards:
- `#ifdef ALLOW_DEBUG_UTILS` — enabled in `_DEBUG` or `_INTERNAL`
- `#ifdef PERF_TIMERS` — performance profiling (debug/internal only)
- `#ifdef DEBUG_LOGGING` — file logging
- `#ifdef RELEASE_DEBUG_LOGGING` — minimal production logging
- `#ifdef DUMP_PERF_STATS` — per-frame stat file dumps

**What works:** Clean separation. Release builds carry minimal diagnostic overhead. The internal tier is a valuable middle ground — testers get some debug tools without the full debug performance hit.

**What breaks:** Binary — you either have a feature or you don't. No runtime opt-in for diagnostic features that could be safe to expose in release builds (like an FPS counter).

**IC takeaway:** IC's overlay level system already handles this better — Level 1-2 are always available, Level 3 requires `dev-tools`. But SAGE validates the pattern of having **more than two tiers**. IC's `dev-tools` feature flag is equivalent to SAGE's `_INTERNAL`. Consider whether IC needs a `diagnostic-extended` feature flag between always-on (L1-2) and `dev-tools` (L3) — probably not, since IC's Level 2 already covers what most internal testers need.

---

## Finding 9: External Script Debug DLL

**Files:** `Tools/DebugWindow/` directory

SAGE's most unusual diagnostic tool: a separate MFC-based DLL (`DebugWindow.dll`) that creates an external window for debugging mission scripts.

**DLL Export Interface:**
- `CreateDebugDialog()` / `DestroyDebugDialog()` — lifecycle
- `CanAppContinue()` / `ForceAppContinue()` — **frame-by-frame stepping**
- `RunAppFast()` — fast-forward simulation
- `AppendMessage(text)` / `AppendMessageAndPause(text)` — message logging with optional breakpoint
- `SetFrameNumber(frame)` — current frame display
- `AdjustVariable(name, value)` / `AdjustVariableAndPause(name, value)` — **live variable editing**

**What works:** Running the debugger as a separate process avoids interference with the game's render loop and input handling. Frame stepping is essential for debugging deterministic sim issues. Live variable editing enables hypothesis testing without code changes.

**What breaks:** MFC dependency (Windows-only). DLL interface is stringly-typed — variables are identified by name, no type safety. The debug window can only be attached at launch (no hot-attach).

**IC takeaway:** IC's dev console (D058, `bevy_egui` overlay) replaces the need for an external debug window in most cases. But frame stepping is a capability IC should have: a `/step` command (or pause + `/tick` for single-tick advance) for debugging sim determinism issues. This is already partially covered by `/pause` + replay seeking, but explicit tick-stepping during live development would be valuable. The live variable editing concept maps to IC's cvar system — `/set sim.movement_speed 5` is the same capability without the external DLL.

---

## Finding 10: StatsCollector — Structured Gameplay Telemetry

**Files:** `StatsCollector.h`, `StatsCollector.cpp`

Singleton `TheStatsCollector`, activated by `-stats` command-line flag. Records per-interval gameplay data to tab-separated files:

- Command counts: build, move, attack, scroll
- Unit counts: player units, AI units
- Player cash
- Scroll time tracking
- Timestamped file with map name and player data

**What works:** Structured output (TSV, not free-text logs) enables automated analysis. Per-interval collection avoids per-frame overhead.

**What breaks:** TSV is fragile (tab characters in data, schema changes break parsers). No session/correlation IDs. No categories or severity levels. Command-line-only activation.

**IC takeaway:** IC's D031 telemetry system (SQLite-based, structured events, local-first) is vastly more capable. SAGE validates the pattern of collecting gameplay metrics (build/move/attack counts, resource tracking) separately from performance profiling — these are different audiences (game designers vs engine programmers). IC already separates these in the D031 event taxonomy.

---

## Consolidated Lesson Matrix

| # | SAGE Pattern | What Works | What Breaks | IC Answer | IC Cluster(s) |
| --- | --- | --- | --- | --- | --- |
| 1 | Hierarchical debug display (abstract → platform) | Clean interface separation | God-class implementation in W3DDisplay | bevy_egui overlay reads atomic counters; no god-class | `M2.CORE.DIAG_OVERLAY_L1` |
| 2 | 2-second collection interval for expensive stats | Avoids per-frame overhead | Fixed interval, not configurable | Configurable batch interval (default 500ms) for L2 metrics | `M3.GAME.DIAG_OVERLAY_L2` |
| 3 | PerfGather RAII scope timer with gross/net time | Hierarchical; overhead-compensated | RDTSC unreliable on multi-core | Puffin profiler; adopt gross/net distinction in overlay | `M2.CORE.DIAG_OVERLAY_L1` |
| 4 | GraphDraw bar chart for per-system time | Bars more glanceable than numbers | Fixed 36 entries, no sorting, no color | Sorted bars, color-coded by budget, graph history mode | `M3.GAME.DIAG_OVERLAY_L2` |
| 5 | FrameMetrics command cushion tracking | Measures real lockstep headroom | No visualization, no per-player breakdown | Add cushion metric to network diagnostic panel | `M4.NET.DIAG_OVERLAY_NET` |
| 6 | CRC frame-gated desync logging | Focused capture saves memory/perf | 64MB buffer, no runtime toggle, text-only | Auto-enable detailed logging around desync point, JSON output | `M6.SP.DIAG_OVERLAY_DEV` |
| 7 | W3DDebugIcons world markers | `addIcon()` callable from anywhere; self-expiring | No category filtering, fixed array | `debug_marker()` API with category-based toggle | `M6.SP.DIAG_OVERLAY_DEV` |
| 8 | INI-driven debug flags (no console) | No recompilation needed | **No runtime toggle** — requires restart | `/diag` commands + cvars (runtime toggle) | `M2.CORE.DIAG_OVERLAY_L1` |
| 9 | External script debug DLL | Frame stepping, live variable editing | Windows-only, stringly-typed, launch-only | `/step`, `/tick`, cvar system for live editing | `M6.SP.DIAG_OVERLAY_DEV` |
| 10 | StatsCollector gameplay telemetry | Structured TSV output, per-interval | No session IDs, TSV fragile, CLI-only | D031 SQLite telemetry (structured, session-aware, queryable) | Already designed (D031) |
| 11 | Three-tier compilation gating | Clean debug/internal/release separation | Binary — no runtime opt-in | L1-2 always on, L3 behind `dev-tools` feature flag | `M2.CORE.DIAG_OVERLAY_L1` |
| 12 | Per-machine CRC dump files | Enables `diff` for desync diagnosis | Text-only, no structured correlation | `/diag export` includes machine ID for cross-client correlation | `M4.NET.DIAG_OVERLAY_NET` |

---

## Accepted IC Actions

These findings refine the diagnostic overlay design in `10-PERFORMANCE.md`:

1. **Add command arrival cushion metric.** SAGE's `FrameMetrics::getMinimumCushion()` tracks how far ahead commands arrive before they're needed — the most meaningful lockstep network metric. IC's Level 2 network panel should show: `Cushion: 3 ticks (200ms)` with a warning when cushion drops below 2 ticks. This is a new addition to the diagnostic overlay.

2. **Add gross/net time distinction to per-system breakdown.** SAGE's PerfGather tracks both total time and net time (excluding child calls). IC's Level 2 per-system bars should show net time by default, with gross time available on hover/expand. This prevents the confusion where "movement: 3ms" includes pathfinding that's already shown separately.

3. **Add configurable collection interval for expensive L2 metrics.** SAGE collects expensive stats every 2 seconds. IC's Level 2 should batch expensive queries (pathfinding cache analysis, memory accounting, ECS archetype counts) on a configurable interval (`debug.diag_batch_interval_ms`, default: 500), not per-frame.

4. **Add frame-gated desync detail logging.** On desync detection, automatically enable detailed state logging for 50 ticks before and after the divergence point, dump to structured JSON, and make available via `/diag export`. This adopts SAGE's approach of focused capture around the event rather than always-on deep logging.

5. **Add machine identifier to `/diag export`.** SAGE's per-machine CRC dump files enable `diff` across machines. IC's export should include a machine/session identifier so exported files from different clients can be correlated for cross-client desync analysis.

6. **Add category-filtered debug markers for world visualization.** SAGE's `addIcon()` is callable from anywhere but has no category filtering. IC's Level 3 should support `debug_marker(pos, color, duration, category)` with per-category toggles: `/diag ai paths`, `/diag ai zones`, `/diag fog cells` as independent switches rather than fixed enum levels.

7. **Validate tick-stepping capability.** SAGE's external debug DLL enables frame-by-frame stepping. IC should support `/step` (advance one tick while paused) for determinism debugging. This complements `/pause` and is especially valuable during development.

Actions 1-3 refine the existing diagnostic overlay design. Actions 4-7 add new capabilities inspired by SAGE's patterns.

---

## Recommended Follow-Up

- Update `10-PERFORMANCE.md` § Diagnostic Overlay to incorporate actions 1-3 (cushion metric, gross/net time, collection interval) and action 6 (category-filtered world markers).
- Consider adding `/step` (tick-stepping) to D058's developer command table (action 7).
- Consider adding frame-gated desync logging detail to D031's desync debugging section (action 4).
