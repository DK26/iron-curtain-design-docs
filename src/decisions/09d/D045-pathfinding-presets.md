## D045: Pathfinding Behavior Presets — Movement Feel

**Status:** Accepted
**Scope:** `ic-sim`, game module configuration
**Phase:** Phase 2 (ships with simulation)

### The Problem

D013 provides the `Pathfinder` trait for pluggable pathfinding *algorithms* (multi-layer hybrid vs. navmesh). D019 provides switchable *balance* values. But movement *feel* — how units navigate, group, avoid each other, and handle congestion — varies dramatically between Classic RA, OpenRA, and what modern pathfinding research enables. This is partially balance (unit speed values) but mostly *behavioral*: how the pathfinder handles collisions, how units merge into formations, how traffic jams resolve, and how responsive movement commands feel.

### Decision

Ship **pathfinding behavior presets** as separate `Pathfinder` trait implementations (D013), each sourced from the codebase it claims to reproduce. Presets are selectable alongside balance presets (D019) and AI presets (D043), bundled into experience profiles, and presented through progressive disclosure so casual players never see the word "pathfinding."

### Built-In Presets

| Preset         | Movement Feel                                                                                                                                                                 | Source                                             | `Pathfinder` Implementation |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------- |
| **Classic RA** | Unit-level A*-like pathing, units block each other, congestion causes jams, no formation movement, units take wide detours around obstacles                                   | EA Remastered Collection source code (GPL v3)      | `RemastersPathfinder`       |
| **OpenRA**     | Improved cell-based pathing, basic crush/push logic, units attempt to flow around blockages, locomotor-based speed modifiers, no formal formations                            | OpenRA pathfinding implementation (GPL v3)         | `OpenRaPathfinder`          |
| **IC Default** | Multi-layer hybrid: hierarchical sectors for routing, JPS for small groups, flow field tiles for mass movement, ORCA-lite local avoidance, formation-aware group coordination | Open-source RTS research + IC original (see below) | `IcPathfinder`              |

Each preset is a **distinct `Pathfinder` trait implementation**, not a parameterized variant of one algorithm. The Remastered pathfinder and OpenRA pathfinder use fundamentally different algorithms and produce fundamentally different movement behavior — parameterizing one to emulate the other would be an approximation at best and a lie at worst. The `Pathfinder` trait (D013) was designed for exactly this: slot in different implementations without touching sim code.

**Why "IcPathfinder," not "IcFlowfieldPathfinder"?** Research revealed that no shipped RTS engine uses pure flowfields (except SupCom2/PA by the same team). Spring Engine tried flow maps and abandoned them. Independent developers (jdxdev) documented the same "ant line" failure with 100+ units. IC's default pathfinder is a multi-layer hybrid — flowfield tiles are one layer activated for large groups, not the system's identity. See `research/pathfinding-ic-default-design.md` for full architecture.

**Why Remastered, not original RA source?** The Remastered Collection engine DLLs (GPL v3) contain the same pathfinding logic as original RA but with bug fixes and modernized C++ that's easier to port to Rust. The original RA source is also GPL and available for cross-reference. Both produce the same movement feel — the Remastered version is simply a cleaner starting point.

### IC Default Pathfinding — Research Foundation

The IC Default preset (`IcPathfinder`) is a five-layer hybrid architecture synthesizing pathfinding approaches from across the open-source RTS ecosystem and academic research. Full design: `research/pathfinding-ic-default-design.md`.

**Layer 1 — Cost Field & Passability:** Per-cell movement cost (u8, 1–255) per locomotor type, inspired by EA Remastered terrain cost tables and 0 A.D.'s passability classes.

**Layer 2 — Hierarchical Sector Graph:** Map divided into 32×32-cell sectors with portal connections between them. Flood-fill domain IDs for O(1) reachability checks. Inspired by OpenRA's hierarchical abstraction and HPA* research.

**Layer 3 — Adaptive Detailed Pathfinding:** JPS (Jump Point Search) for small groups (<8 units) — 10–100× faster than A* on uniform-cost grids. Flow field tiles for mass movement (≥8 units sharing a destination). Weighted A* fallback for non-uniform terrain. LRU flow field cache. Inspired by 0 A.D.'s JPS, SupCom2's flow field tiles, Game AI Pro 2's JPS+ precomputed tables.

**Layer 4 — ORCA-lite Local Avoidance:** Fixed-point deterministic collision avoidance based on RVO2/ORCA (Reciprocal Velocity Obstacles). Commitment locking prevents hallway dance. Cooperative side selection ("mind reading") from HowToRTS research.

**Layer 5 — Group Coordination:** Formation offset assignment, synchronized arrival, chokepoint compression. Inspired by jdxdev's boids-for-RTS formation offsets and Spring Engine's group movement.

**Source engines studied:**
- **EA Remastered Collection** (GPL v3) — obstacle-tracing, terrain cost tables, integer math
- **OpenRA** (GPL v3) — hierarchical A*, custom search graph with 10×10 abstraction
- **Spring Engine** (GPL v2) — QTPFS quadtree, flow-map attempt (abandoned), unit push/slide
- **0 A.D.** (GPL v2/MIT) — JPS long-range + vertex short-range, clearance-based sizing, fixed-point `CFixed_15_16`
- **Warzone 2100** (GPL v2) — A* with LRU context caching, gateway optimization
- **SupCom2/PA** — flow field tiles (only shipped flowfield RTS)
- **Academic** — RVO2/ORCA (UNC), HPA*, continuum crowds (Treuille et al.), JPS+ (Game AI Pro 2)

### Configuration Model

Each `Pathfinder` implementation exposes its own tunable parameters via YAML. Parameters differ between implementations because they control fundamentally different algorithms — there is no shared "pathfinding config" struct that applies to all three.

```yaml
# pathfinding/remastered.yaml — RemastersPathfinder tunables
remastered_pathfinder:
  name: "Classic Red Alert"
  description: "Movement feel matching the original game"
  # These are behavioral overrides on the Remastered pathfinder.
  # Defaults reproduce original behavior exactly.
  harvester_stuck_fix: false         # true = apply minor QoL fix for harvesters stuck on each other
  bridge_queue_behavior: original    # original | relaxed (slightly wider queue threshold)
  infantry_scatter_pattern: original # original | smoothed (less jagged scatter on damage)

# pathfinding/openra.yaml — OpenRaPathfinder tunables
openra_pathfinder:
  name: "OpenRA"
  description: "Movement feel matching OpenRA's pathfinding"
  locomotor_speed_modifiers: true    # per-terrain speed multipliers (OpenRA feature)
  crush_logic: true                  # vehicles can crush infantry
  blockage_flow: true                # units attempt to flow around blocking units

# pathfinding/ic-default.yaml — IcPathfinder tunables
ic_pathfinder:
  name: "IC Default"
  description: "Multi-layer hybrid: JPS + flow field tiles + ORCA-lite avoidance"

  # Layer 2 — Hierarchical sectors
  sector_size: 32                    # cells per sector side
  portal_max_width: 8                # max portal opening (cells)

  # Layer 3 — Adaptive pathfinding
  flowfield_group_threshold: 8       # units sharing dest before flowfield activates
  flowfield_cache_size: 64           # LRU cache entries for flow field tiles
  jps_enabled: true                  # JPS for small groups on uniform terrain
  repath_frequency: adaptive         # low | medium | high | adaptive

  # Layer 4 — Local avoidance (ORCA-lite)
  avoidance_radius_multiplier: 1.2   # multiplier on unit collision radius
  commitment_frames: 4               # frames locked into avoidance direction
  cooperative_avoidance: true        # "mind reading" side selection

  # Layer 5 — Group coordination
  formation_movement: true           # groups move in formation
  synchronized_arrival: true         # units slow down to arrive together
  chokepoint_compression: true       # formation compresses at narrow passages

  # General
  path_smoothing: funnel             # none | funnel | spline
  influence_avoidance: true          # avoid areas with high enemy threat
```

Power users can override any parameter in the lobby's advanced settings or in mod YAML. Casual players never see these — they pick an experience profile and the correct implementation + parameters are selected automatically.

### Sim-Affecting Nature

Pathfinding presets are **sim-affecting** — they change how the deterministic simulation resolves movement. Like balance presets (D019):

- All players in a multiplayer game must use the same pathfinding preset (enforced by lobby, validated by sim)
- Preset selection is part of the game configuration hash for desync detection
- Replays record the active pathfinding preset

### Experience Profile Integration

```yaml
profiles:
  classic-ra:
    balance: classic
    ai_preset: classic-ra
    pathfinding: classic-ra          # NEW — movement feel
    theme: classic
    qol: vanilla

  openra-ra:
    balance: openra
    ai_preset: openra
    pathfinding: openra              # NEW — OpenRA movement feel
    theme: modern
    qol: openra

  iron-curtain-ra:
    balance: classic
    ai_preset: ic-default
    pathfinding: ic-default          # NEW — modern movement
    theme: modern
    qol: iron_curtain
```

### User-Facing UX — Progressive Disclosure

Pathfinding selection follows the same progressive disclosure pyramid as the rest of the experience profile system. A casual player should never encounter the word "pathfinding."

**Level 1 — One dropdown (casual player):** The lobby's experience profile selector offers "Classic RA," "OpenRA," or "Iron Curtain." Picking one sets balance, theme, QoL, AI, movement feel, AND render mode. The pathfinder and render mode selections are invisible — they're bundled. A player who picks "Classic RA" gets Remastered pathfinding and classic pixel art because that's what Classic RA *is*.

**Level 2 — Per-axis override (intermediate player):** An "Advanced" toggle in the lobby expands the experience profile into its 6 independent axes. The movement axis is labeled by feel, not algorithm: "Movement: Classic / OpenRA / Modern" — not "`RemastersPathfinder` / `OpenRaPathfinder` / `IcPathfinder`." The render mode axis shows "Graphics: Classic / HD / 3D" (D048). The player can mix "OpenRA balance + Classic movement + HD graphics" if they want.

**Level 3 — Parameter tuning (power user / modder):** A gear icon next to the movement axis opens implementation-specific parameters (see Configuration Model above). This is where harvester stuck fixes, pressure diffusion strength, and formation toggles live.

### Scenario-Required Pathfinding

Scenarios and campaign missions can specify a **required** or **recommended** pathfinding preset in their YAML metadata:

```yaml
scenario:
  name: "Bridge Assault"
  pathfinding:
    required: classic-ra    # this mission depends on chokepoint blocking behavior
    reason: "Mission balance depends on single-file bridge queuing"
```

When the lobby loads this scenario, it auto-selects the required pathfinder and shows the player why: "This scenario requires Classic movement (mission balance depends on chokepoint behavior)." The player cannot override a `required` setting. A `recommended` setting auto-selects but allows override with a warning.

This preserves original campaign missions. A mission designed around units jamming at a bridge works correctly because it ships with `required: classic-ra`. A modern community scenario can ship with `required: ic-default` to ensure smooth flowfield behavior.

### Mod-Selectable and Mod-Provided Pathfinders

The three built-in presets are the **first-party** `Pathfinder` implementations. They are not the only ones. The `Pathfinder` trait (D013) is explicitly open to community implementations.

**Modder as consumer — selecting a pathfinder:**

A mod's YAML manifest can declare which pathfinder it uses. The modder picks from any available implementation — first-party or community:

```yaml
# mod.yaml — total conversion mod that uses IC's modern pathfinding
mod:
  name: "Desert Strike"
  pathfinder: ic-default            # Use IC's multi-layer hybrid
  # Or: remastered, openra, layered-grid-generals, community/navmesh-pro, etc.
```

If the mod doesn't specify a pathfinder, it inherits whatever the player's experience profile selects. When specified, it overrides the experience profile's pathfinding axis — the same way `scenario.pathfinding.required` works (see "Scenario-Required Pathfinding" above), but at the mod level.

**Modder as author — providing a pathfinder:**

A Tier 3 WASM mod can implement the `Pathfinder` trait and register it as a new option:

**Host ABI note:** The Rust trait-style example below is **conceptual**. A WASM pathfinder does not share a native Rust trait object directly with the engine. In implementation, the engine exposes a stable host ABI and adapts the WASM exports to the `Pathfinder` trait on the host side.

```rust
// WASM mod: custom pathfinder (e.g., Generals-style layered grid)
impl Pathfinder for LayeredGridPathfinder {
    fn request_path(&mut self, origin: WorldPos, dest: WorldPos, locomotor: LocomotorType) -> PathId {
        // Surface bitmask check, zone reachability, A* with bridge layers
        // ...
    }
    fn get_path(&self, id: PathId) -> Option<&[WorldPos]> { /* ... */ }
    fn is_passable(&self, pos: WorldPos, locomotor: LocomotorType) -> bool { /* ... */ }
    fn invalidate_area(&mut self, center: WorldPos, radius: SimCoord) { /* ... */ }
}
```

The mod registers its pathfinder in its manifest with a YAML config block (like the built-in presets):

```yaml
# mod.yaml — community pathfinder distributed via Workshop
mod:
  name: "Generals Pathfinder"
  type: pathfinder                   # declares this mod provides a Pathfinder impl
  pathfinder_id: layered-grid-generals
  display_name: "Generals (Layered Grid)"
  description: "Grid pathfinding with bridge layers and surface bitmasks, inspired by C&C Generals"
  wasm_module: generals_pathfinder.wasm
  config:
    zone_block_size: 10
    bridge_clearance: 10.0
    surface_types: [ground, water, cliff, air, rubble]
```

Once installed, the community pathfinder appears alongside first-party presets in the lobby's Level 2 per-axis override ("Movement: Classic / OpenRA / Modern / Generals") and is selectable by other mods via `pathfinder: layered-grid-generals`.

**Workshop distribution:** Community pathfinders are Workshop resources (D030) like any other mod. They can be rated, reviewed, and depended upon. A total conversion mod declares `depends: community/generals-pathfinder@^1.0` and the engine auto-downloads it on lobby join (same as CS:GO-style auto-download).

**Sim-affecting implications:** Because pathfinding is deterministic and sim-affecting, all players in a multiplayer game must use the same pathfinder. A community pathfinder is synced like a first-party preset — the lobby validates that all clients have the same pathfinder WASM module (by SHA-256 hash), same config, same version.

### WASM Pathfinder Policy (Determinism, Performance, Ranked)

Community pathfinders are allowed, but they are not a free-for-all in every mode:

- **Single-player / skirmish / custom lobbies:** allowed by default (subject to normal WASM sandbox rules)
- **Ranked queues / competitive ladders:** disallowed by default unless a queue/community explicitly certifies and whitelists the pathfinder (hash + version + config schema)
- **Determinism contract:** no wall-clock time, no nondeterministic RNG, no filesystem/network I/O, no host APIs that expose machine-specific timing/order
- **Performance contract:** pathfinder modules must declare budget expectations and pass deterministic conformance + performance checks (`ic mod test`, `ic mod perf-test`) on the baseline hardware tier before certification
- **Failure policy:** if a pathfinder module fails validation/loading/perf certification for a ranked queue, the lobby rejects the configuration before match start (never mid-match fail-open)

This preserves D013's openness for experimentation while protecting ranked integrity, baseline hardware support, and deterministic simulation guarantees.

### Relationship to Existing Decisions

- **D013 (`Pathfinder` trait):** Each preset is a separate `Pathfinder` trait implementation. `RemastersPathfinder`, `OpenRaPathfinder`, and `IcPathfinder` are all registered by the RA1 game module. Community mods add more via WASM. The trait boundary serves triple duty: it separates algorithmic families (grid vs. navmesh), behavioral families (Classic vs. Modern), AND first-party from community-provided implementations.
- **D018 (`GameModule` trait):** The RA1 game module ships all three first-party pathfinder implementations. Community pathfinders are registered by the mod loader alongside them. The lobby's experience profile selection determines which one is active — `fn pathfinder()` returns whichever `Box<dyn Pathfinder>` was selected, whether first-party or community.
- **D019 (balance presets):** Parallel concept. Balance = what units can do. Pathfinding = how they get there. Both are sim-affecting, synced in multiplayer, and open to community alternatives.
- **D043 (AI presets):** Orthogonal. AI decides where to send units; pathfinding decides how they move. An AI preset + pathfinding preset combination determines overall movement behavior. Both are modder-selectable.
- **D033 (QoL toggles):** Some implementation-specific parameters (harvester stuck fix, infantry scatter smoothing) could be classified as QoL. Presets bundle them for consistency; individual toggles in advanced settings allow fine-tuning.
- **D048 (render modes):** Same modder-selectable pattern. Mods select or provide render modes; mods select or provide pathfinders. The trait-per-subsystem architecture means every pluggable system follows the same model.

### Alternatives Considered

- **One "best" pathfinding only** (rejected — Classic RA movement feel is part of the nostalgia and is critical for original scenario compatibility; forcing modern pathing on purists would alienate them AND break existing missions)
- **Pathfinding differences handled by balance presets** (rejected — movement behavior is fundamentally different from numeric values; a separate axis deserves separate selection)
- **One parameterized implementation that emulates all three** (rejected — Remastered pathfinding and IC flowfield pathfinding are fundamentally different algorithms with different data structures and different computational models; parameterizing one to approximate the other produces a neither-fish-nor-fowl result that reproduces neither accurately; separate implementations are honest and maintainable)
- **Only IC Default pathfinding, with "classic mode" as a cosmetic approximation** (rejected — scenario compatibility requires *actual* reproduction of original movement behavior, not an approximation; bridge missions, chokepoint defense, harvester timing all depend on specific pathfinding quirks)

---

---

