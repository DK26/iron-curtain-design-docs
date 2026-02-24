## D022: Dynamic Weather System

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 4 (weather state machine + surface effects); visual rendering strategies available from Phase 3
- **Execution overlay mapping:** `M4.CHROME.WEATHER` (P-Core); `Weather` Lua global available at `M4.SCRIPT.LUA_RUNTIME`
- **Deferred features / extensions:** WASM custom weather types (Phase 6a), ion storm / acid rain (game-module-specific, ships with TS/C&C3 modules)
- **Deferral trigger:** Game module milestone start
- **Canonical for:** Weather state machine, terrain surface effects, weather schedule YAML, `Weather` Lua global, terrain texture rendering strategies
- **Scope:** `ic-sim` (WeatherState, TerrainSurfaceGrid, weather_surface_system), `ic-game` / `ic-render` (visual layer), `04-MODDING.md` § Dynamic Weather
- **Decision:** IC implements a deterministic weather state machine in `ic-sim` with per-cell terrain surface tracking. Weather affects gameplay (movement penalties, visibility) when `sim_effects: true`. Visual rendering uses three quality tiers (palette tinting, overlay sprites, shader blending). Maps define weather schedules in YAML; Lua can override at any time via the `Weather` global.
- **Why:**
  - Dynamic weather is a top-requested feature across C&C communities (absent from all OpenRA titles)
  - Weather creates emergent tactical depth — blizzards slow advances, fog covers retreats, ice opens new paths
  - Deterministic state machine means weather is replay-safe (same seed = same weather on all clients)
  - Three rendering tiers ensure weather works from low-spec to high-end hardware
- **Non-goals:** Real-time meteorological simulation. Weather is a game system for tactical variety, not a physics engine.
- **Invariants preserved:** Deterministic sim (fixed-point intensity, match-seed RNG), no floats in ic-sim, surface grid is serializable for save/snapshot
- **Public interfaces / types / commands:** `WeatherState`, `WeatherType`, `TerrainSurfaceGrid`, `SurfaceCondition`, `Weather` (Lua global)
- **Affected docs:** `04-MODDING.md` § Dynamic Weather, `02-ARCHITECTURE.md` § System Pipeline
- **Keywords:** weather, dynamic, state machine, snow, rain, storm, blizzard, terrain surface, accumulation, sim effects, Weather global, schedule

---

### Weather State Machine

Weather transitions are modeled as a deterministic state machine inside `ic-sim`. Same schedule + same tick = identical weather on every client.

```
     ┌──────────┐      ┌───────────┐      ┌──────────┐
     │  Sunny   │─────▶│ Overcast  │─────▶│   Rain   │
     └──────────┘      └───────────┘      └──────────┘
          ▲                                     │
          │            ┌───────────┐            │
          └────────────│ Clearing  │◀───────────┘
                       └───────────┘            │
                            ▲           ┌──────────┐
                            └───────────│  Storm   │
                                        └──────────┘

     ┌──────────┐      ┌───────────┐      ┌──────────┐
     │  Clear   │─────▶│  Cloudy   │─────▶│   Snow   │
     └──────────┘      └───────────┘      └──────────┘
          ▲                  │                  │
          │                  ▼                  ▼
          │            ┌───────────┐      ┌──────────┐
          │            │    Fog    │      │ Blizzard │
          │            └───────────┘      └──────────┘
          │                  │                  │
          └──────────────────┴──────────────────┘
                    (melt / thaw / clear)

     Desert variant (temperature.base > threshold):
     Rain → Sandstorm, Snow → (not reachable)
```

Each weather type has an **intensity** (fixed-point `0..1024`) that ramps during transitions.

```rust
/// ic-sim: deterministic weather state
pub struct WeatherState {
    pub current: WeatherType,
    pub intensity: FixedPoint,       // 0 = clear, 1024 = full
    pub transitioning_to: Option<WeatherType>,
    pub transition_progress: FixedPoint,
    pub ticks_in_current: u32,
}
```

### Weather Schedule (YAML)

Maps define schedules with three modes:

- **`cycle`** — deterministic round-robin through states per transition weights and durations
- **`random`** — weighted random using the match seed (deterministic)
- **`scripted`** — no automatic transitions; weather changes only via Lua `Weather.transition_to()`

```yaml
weather:
  schedule:
    mode: random
    default: sunny
    seed_from_match: true
    states:
      sunny:
        min_duration: 300
        max_duration: 600
        transitions:
          - to: overcast
            weight: 60
          - to: cloudy
            weight: 40
      rain:
        min_duration: 200
        max_duration: 500
        transitions:
          - to: storm
            weight: 20
          - to: clearing
            weight: 80
        sim_effects: true
```

### Terrain Surface State

When `sim_effects: true`, the sim maintains a per-cell `TerrainSurfaceGrid` — a compact grid tracking how weather physically alters terrain. This is deterministic and affects gameplay.

```rust
pub struct SurfaceCondition {
    pub snow_depth: FixedPoint,   // 0 = bare ground, 1024 = deep snow
    pub wetness: FixedPoint,      // 0 = dry, 1024 = waterlogged
}

pub struct TerrainSurfaceGrid {
    pub cells: Vec<SurfaceCondition>,
    pub width: u32,
    pub height: u32,
}
```

**Surface update rules:**

| Condition | Effect |
|-----------|--------|
| Snowing | `snow_depth += accumulation_rate × intensity / 1024` |
| Not snowing, sunny | `snow_depth -= melt_rate` (clamped at 0) |
| Raining | `wetness += wet_rate × intensity / 1024` |
| Not raining | `wetness -= dry_rate` (clamped at 0) |
| Snow melting | `wetness += melt_rate` (meltwater) |
| Temperature < threshold | Puddles freeze — wet cells become icy |

### Movement Cost Modifiers

| Surface State | Infantry | Wheeled | Tracked |
|---------------|:--------:|:-------:|:-------:|
| Deep snow (> 512) | −20% speed | −30% speed | −10% speed |
| Ice (frozen wetness) | −15% turn rate | −15% turn rate | −15% turn rate |
| Wet ground (> 256) | — | −15% speed | — |
| Muddy (wet + warm) | — | −25% speed | −10% speed |
| Dry / sunny | Baseline | Baseline | Baseline |

These modifiers stack with base weather-type modifiers. A blizzard over deep snow is brutal. All modifiers flow through D028's `StatModifiers` system.

Ice has a special gameplay effect: water tiles become passable for ground units, opening new attack routes.

### Lua API (`Weather` Global — D024)

```lua
Weather.transition_to("blizzard", 45)  -- 45-tick transition
Weather.set_intensity(900)             -- near-maximum

local w = Weather.get_state()
print(w.current)              -- "blizzard"
print(w.intensity)            -- 900
print(w.surface.snow_depth)   -- per-map average
```

### Visual Rendering Strategies

Three rendering quality tiers (presentation-only, no sim impact):

| Strategy | Quality | Cost | Description |
|----------|---------|------|-------------|
| Palette tinting | Low | Near-zero | Shift terrain palette toward white (snow) or darker (wet) |
| Overlay sprites | Medium | One pass | Semi-transparent snow/puddle/ice overlays on base tiles |
| Shader blending | High | GPU blend | Fragment shader blends base and weather-variant textures per tile |

Default: **palette tinting** (works everywhere, zero asset requirements). Mods shipping weather-variant sprites get overlay or shader blending automatically.

### Modding Tiers

- **Tier 1 (YAML):** Custom weather schedules, surface rates, sim effect values, blend strategy, seasonal presets
- **Tier 2 (Lua):** Trigger weather at story moments, query surface state for objectives, weather-dependent triggers
- **Tier 3 (WASM):** Custom weather types (acid rain, ion storms, radiation clouds) with new particles and surface logic

### Alternatives Considered

| Alternative | Verdict | Reason |
|-------------|---------|--------|
| Cosmetic-only weather | Rejected | Misses the tactical depth that makes weather worth implementing |
| Per-cell float-based simulation | Rejected | Violates Invariant #1; fixed-point integer grid is sufficient and deterministic |
| Single rendering mode | Rejected | Excludes low-end hardware or wastes high-end capability; tiered approach covers all targets |
