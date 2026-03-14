# Tier 3 WASM Mod Showcases

Extended examples demonstrating Tier 3 WASM mod capabilities. These showcase how the engine's trait-abstracted subsystems (D041) enable total replacement of rendering, pathfinding, and AI — while the simulation, networking, and rules remain unchanged.

For the WASM host API, capabilities system, execution limits, and determinism constraints that make these showcases possible, see the parent page: [Tier 3: WASM Modules](wasm-modules.md).

### 3D Rendering Mods (Tier 3 Showcase)

The most powerful example of Tier 3 modding: replacing the entire visual presentation with 3D rendering. A "3D Red Alert" mod swaps sprites for GLTF meshes and the isometric camera for a free-rotating 3D camera — while the simulation, networking, pathfinding, and rules are completely unchanged.

This works because Bevy already ships a full 3D pipeline. The mod doesn't build a 3D engine — it uses Bevy's existing 3D renderer through the WASM mod API.

**A 3D render mod implements:**

```rust
// WASM mod: replaces the default sprite renderer
impl Renderable for MeshRenderer {
    fn render(&self, entity: EntityId, state: &RenderState, ctx: &mut RenderContext) {
        let model = self.models.get(entity.unit_type);
        let animation = match state.activity {
            Activity::Idle => &model.idle,
            Activity::Moving => &model.walk,
            Activity::Attacking => &model.attack,
        };
        ctx.draw_mesh(model.mesh, state.world_pos, state.facing, animation);
    }
}

impl ScreenToWorld for FreeCam3D {
    fn screen_to_world(&self, screen_pos: Vec2, terrain: &TerrainData) -> WorldPos {
        // 3D raycast against terrain mesh → world position
        let ray = self.camera.screen_to_ray(screen_pos);
        terrain.raycast(ray).to_world_pos()
    }
}
```

**Assets are mapped in YAML (mod overrides unit render definitions):**

```yaml
# 3d_mod/render_overrides.yaml
rifle_infantry:
  render:
    type: mesh
    model: models/infantry/rifle.glb
    animations:
      idle: Idle
      move: Run
      attack: Shoot
      death: Death

medium_tank:
  render:
    type: mesh
    model: models/vehicles/medium_tank.glb
    turret: models/vehicles/medium_tank_turret.glb
    animations:
      idle: Idle
      move: Drive
```

**Cross-view multiplayer is a natural consequence.** Since the mod only changes rendering, a player using the 3D mod can play against a player using classic isometric sprites. The sim produces identical state; each client just draws it differently. Replays are viewable in either mode.

See `02-ARCHITECTURE.md` § "3D Rendering as a Mod" for the full architectural rationale.

### Custom Pathfinding Mods (Tier 3 Showcase)

The second major Tier 3 showcase: replacing how units navigate the battlefield. Just as 3D render mods replace the visual presentation, pathfinder mods replace the movement algorithm — while combat, building, harvesting, and everything else remain unchanged.

**Why this matters:** The original C&C Generals uses a layered grid pathfinder with surface bitmasks and bridge layers — fundamentally different from Red Alert's approach. A Generals-clone mod needs Generals-style pathfinding. A naval mod needs flow routing. A tower defense mod needs waypoint constraint pathfinding. No single algorithm fits every RTS — the `Pathfinder` trait (D013) lets modders bring their own.

**A pathfinder mod implements:**

```rust
// WASM mod: Generals-style layered grid pathfinder
// (See research/pathfinding-ic-default-design.md § "C&C Generals / Zero Hour")
struct LayeredGridPathfinder {
    grid: Vec<CellLayer>,          // 10-unit cells with bridge layers
    zones: ZoneMap,                // flood-fill reachability zones
    surface_bitmask: SurfaceMask,  // ground | water | cliff | air | rubble
}

impl Pathfinder for LayeredGridPathfinder {
    fn request_path(&mut self, origin: WorldPos, dest: WorldPos, locomotor: LocomotorType) -> PathId {
        // 1. Check zone connectivity (instant reject if unreachable)
        // 2. Surface bitmask check for locomotor compatibility
        // 3. A* over layered grid (bridges are separate layers)
        // 4. Path smoothing pass
        // ...
    }
    fn get_path(&self, id: PathId) -> Option<&[WorldPos]> { /* ... */ }
    fn is_passable(&self, pos: WorldPos, locomotor: LocomotorType) -> bool {
        let cell = self.grid.cell_at(pos);
        cell.surface_bitmask.allows(locomotor)
    }
    fn invalidate_area(&mut self, center: WorldPos, radius: SimCoord) {
        // Rebuild affected zones, recalculate bridge connectivity
    }
}
```

**Mod manifest and config:**

```toml
# generals_pathfinder/mod.toml
[mod]
name = "Generals Pathfinder"
type = "pathfinder"
pathfinder_id = "layered-grid-generals"
display_name = "Generals (Layered Grid)"
version = "1.0.0"

[capabilities]
pathfinding = true

[config]
zone_block_size = 10
bridge_clearance = 10.0
surface_types = ["ground", "water", "cliff", "air", "rubble"]
```

**How other mods use it:**

```toml
# desert_strike_mod/mod.toml — a total conversion using the Generals pathfinder
[mod]
name = "Desert Strike"
pathfinder = "layered-grid-generals"

[dependencies]
"community/generals-pathfinder" = "^1.0"
```

**Multiplayer sync:** All players must use the same pathfinder — the WASM binary hash/version/config profile is validated in the lobby, same as any sim-affecting mod. If a player is missing the pathfinder mod, the engine auto-downloads it from the Workshop (CS:GO-style, per D030).

**Performance contract:** Pathfinder mods use a dedicated `pathfinder_fuel_per_tick` budget (separate from general WASM fuel). The engine monitors per-tick pathfinding time and deferred-request rates. The engine never falls back silently to a different pathfinder — determinism means all clients must agree on every path. If a WASM pathfinder exhausts its pathfinding fuel for the tick, remaining requests return `PathResult::Deferred` and are re-queued deterministically for subsequent ticks. Community pathfinders targeting ranked certification are expected to pass `PathfinderConformanceTest` and `ic mod perf-test --conformance pathfinder` on the baseline hardware tier (D045 policy).

**Ranked policy:** Community pathfinders are available by default in single-player/skirmish/custom lobbies, but ranked/community competitive queues reject them unless the exact hash/version/config profile has been certified and explicitly whitelisted.

**Phase:** WASM pathfinder mods in Phase 6a. The three built-in pathfinder presets (D045) ship as native Rust in Phase 2.

### Custom AI Mods (Tier 3 Showcase)

The third major Tier 3 showcase: replacing how AI opponents think. Just as render mods replace visual presentation and pathfinder mods replace navigation algorithms, AI mods replace the decision-making engine — while the simulation rules, damage pipeline, and everything else remain unchanged.

**Why this matters:** The built-in `PersonalityDrivenAi` uses behavior trees tuned by YAML personality parameters. This works well for most players. But the RTS AI community spans decades of research — GOAP planners, Monte Carlo tree search, influence map systems, neural networks, evolutionary strategies (see `research/rts-ai-extensibility-survey.md`). The `AiStrategy` trait (D041) lets modders bring any algorithm to Iron Curtain, and the two-axis difficulty system (D043) lets any AI scale from Sandbox to Nightmare.

**A custom AI mod implements:**

```rust
// WASM mod: GOAP (Goal-Oriented Action Planning) AI
struct GoapPlannerAi {
    goals: Vec<Goal>,         // Expand, Attack, Defend, Tech, Harass
    plan: Option<ActionPlan>, // Current multi-step plan
    world_model: WorldModel,  // Internal state tracking
}

impl AiStrategy for GoapPlannerAi {
    fn decide(&mut self, player: PlayerId, view: &FogFilteredView, tick: u64) -> Vec<PlayerOrder> {
        // 1. Update world model from visible state
        self.world_model.update(view);
        // 2. Re-evaluate goal priorities
        self.goals.sort_by_key(|g| -g.priority(&self.world_model));
        // 3. If plan invalidated or expired, re-plan
        if self.plan.is_none() || tick % self.replan_interval == 0 {
            self.plan = self.planner.search(
                &self.world_model, &self.goals[0], self.search_depth
            );
        }
        // 4. Execute next action in plan
        self.plan.as_mut().map(|p| p.next_orders()).unwrap_or_default()
    }

    fn on_enemy_spotted(&mut self, unit: EntityId, unit_type: &str) {
        // Scouting intel → update world model → may trigger re-plan
        self.world_model.add_sighting(unit, unit_type);
        if self.world_model.threat_level() > self.defend_threshold {
            self.plan = None; // force re-plan next tick
        }
    }

    fn on_under_attack(&mut self, _unit: EntityId, _attacker: EntityId) {
        self.goals.iter_mut().find(|g| g.name == "Defend")
            .map(|g| g.urgency += 30); // boost defense priority
    }

    fn get_parameters(&self) -> Vec<ParameterSpec> {
        vec![
            ParameterSpec { name: "search_depth".into(), min: 1, max: 10, default: 5, .. },
            ParameterSpec { name: "replan_interval".into(), min: 10, max: 120, default: 30, .. },
            ParameterSpec { name: "defend_threshold".into(), min: 0, max: 100, default: 40, .. },
        ]
    }

    fn uses_engine_difficulty_scaling(&self) -> bool { false }
    // This AI handles difficulty via search_depth and replan_interval
}
```

**Mod manifest:**

```toml
# goap_ai/mod.toml
[mod]
name = "GOAP Planner AI"
type = "ai_strategy"
ai_strategy_id = "goap-planner"
display_name = "GOAP Planner"
description = "Goal-oriented action planning — multi-step strategic reasoning"
version = "2.1.0"
wasm_module = "goap_planner.wasm"

[capabilities]
read_visible_state = true
issue_orders = true
ai_strategy = true

[config]
search_depth = 5
replan_interval = 30
```

**How other mods use it:**

```toml
# zero_hour_mod/mod.toml — a total conversion using the GOAP AI
[mod]
name = "Zero Hour Remake"
default_ai = "goap-planner"

[dependencies]
"community/goap-planner-ai" = "^2.0"
```

**AI tournament community:** Workshop can host AI tournament leaderboards — automated matches between community AI submissions, ranked by Elo/TrueSkill. This is directly inspired by BWAPI's SSCAIT tournament (15+ years of StarCraft AI competition) and AoE2's AI ladder (20+ years of community AI development). The `ic mod test` framework (above) provides headless match execution; the Workshop provides distribution and ranking.

**Phase:** WASM AI mods in Phase 6a. Built-in `PersonalityDrivenAi` + behavior presets (D043) ship as native Rust in Phase 4.
