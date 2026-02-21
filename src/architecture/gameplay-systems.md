# Core Architecture  Extended Gameplay Systems (RA1 Module)

The 9 core components in the main architecture document cover the skeleton. A playable Red Alert requires ~50 components and ~20 systems. This section designs every gameplay system identified in 11-OPENRA-FEATURES.md gap analysis, organized by functional domain.

### Power System

Every building generates or consumes power. Power deficit disables defenses and slows production — core C&C economy.

```rust
/// Per-building power contribution.
pub struct Power {
    pub provides: i32,   // Power plants: positive
    pub consumes: i32,   // Defenses, production buildings: positive
}

/// Marker: this building goes offline during power outage.
pub struct AffectedByPowerOutage;

/// Player-level resource (not a component — stored in PlayerState).
pub struct PowerManager {
    pub total_capacity: i32,
    pub total_drain: i32,
    pub low_power: bool,  // drain > capacity
}
```

**`power_system()` logic:** Sum all `Power` components per player → update `PowerManager`. When `low_power` is true, buildings with `AffectedByPowerOutage` have their production rates halved and defenses fire at reduced rate (via condition system, D028). Power bar UI reads `PowerManager` from `ic-ui`.

**YAML:**
```yaml
power_plant:
  power: { provides: 100 }
tesla_coil:
  power: { consumes: 75 }
  affected_by_power_outage: true
```

### Full Damage Pipeline (D028)

The complete weapon → projectile → warhead chain:

```
Armament fires → Projectile entity spawned → projectile_system() advances it
  → hit detection (range, homing, ballistic arc)
  → Warhead(s) applied at impact point
    → target validity (TargetTypes, stances)
    → spread/falloff calculation (distance from impact)
    → Versus table lookup (ArmorType × WarheadType → damage multiplier)
    → DamageMultiplier modifiers (veterancy, terrain, conditions)
    → Health reduced
```

```rust
/// A fired projectile — exists as its own entity during flight.
pub struct Projectile {
    pub weapon_id: WeaponId,
    pub source: EntityId,
    pub owner: PlayerId,
    pub target: ProjectileTarget,
    pub speed: i32,            // fixed-point
    pub warheads: Vec<WarheadId>,
    pub inaccuracy: i32,       // scatter radius at target
    pub projectile_type: ProjectileType,
}

pub enum ProjectileType {
    Bullet,         // instant-hit (hitscan)
    Missile { tracking: i32, rof_jitter: i32 },  // homing
    Ballistic { gravity: i32 },                    // arcing (artillery)
    Beam { duration: u32 },                        // continuous ray
}

pub enum ProjectileTarget {
    Entity(EntityId),
    Ground(WorldPos),
}

/// Warhead definition — loaded from YAML, shared (not per-entity).
pub struct WarheadDef {
    pub spread: i32,           // area of effect radius
    pub versus: VersusTable,   // ArmorType → damage percentage
    pub damage: i32,           // base damage value
    pub falloff: Vec<i32>,     // damage multiplier at distance steps
    pub valid_targets: Vec<TargetType>,
    pub invalid_targets: Vec<TargetType>,
    pub effects: Vec<WarheadEffect>,  // screen shake, spawn fire, etc.
}

/// ArmorType × WarheadType → percentage (100 = full damage)
/// Loaded from YAML Versus table — identical format to OpenRA.
/// Flat array indexed by ArmorType discriminant for O(1) lookup in the combat
/// hot path — no per-hit HashMap overhead. ArmorType is a small enum (<16 variants)
/// so the array fits in a single cache line.
pub struct VersusTable {
    pub modifiers: [i32; ArmorType::COUNT],  // index = ArmorType as usize
}
```

**`projectile_system()` logic:** For each `Projectile` entity: advance position by `speed`, check if arrived at target. On arrival, iterate `warheads`, apply each to entities in `spread` radius using `SpatialIndex::query_range()`. For each target: check `valid_targets`, look up `VersusTable`, apply `DamageMultiplier` conditions, reduce `Health`. If `Health.current <= 0`, mark for `death_system()`.

**YAML (weapon + warhead, OpenRA-compatible):**
```yaml
weapons:
  105mm:
    range: 5120          # in world units (fixed-point)
    rate_of_fire: 80     # ticks between shots
    projectile:
      type: bullet
      speed: 682
    warheads:
      - type: spread_damage
        damage: 60
        spread: 426
        versus:
          none: 100
          light: 80
          medium: 60
          heavy: 40
          wood: 120
          concrete: 30
        falloff: [100, 50, 25, 0]
```

### DamageResolver Trait (D041)

The damage pipeline above describes the RA1 resolution algorithm. The *data* (warheads, versus tables, modifiers) is YAML-configurable, but the *resolution order* — what happens between warhead impact and health reduction — varies between game modules. RA2 needs shield-first resolution; Generals-class games need sub-object targeting. The `DamageResolver` trait abstracts this step:

```rust
/// Game modules implement this to define damage resolution order.
/// Called by projectile_system() after hit detection and before health reduction.
pub trait DamageResolver: Send + Sync {
    fn resolve_damage(
        &self,
        warhead: &WarheadDef,
        target: &DamageTarget,
        modifiers: &StatModifiers,
        distance_from_impact: SimCoord,
    ) -> DamageResult;
}

pub struct DamageTarget {
    pub entity: EntityId,
    pub armor_type: ArmorType,
    pub current_health: i32,
    pub shield: Option<ShieldState>,
    pub conditions: Conditions,
}

pub struct DamageResult {
    pub health_damage: i32,
    pub shield_damage: i32,
    pub conditions_applied: Vec<(ConditionId, u32)>,
    pub overkill: i32,
}
```

RA1 registers `StandardDamageResolver` (Versus table → falloff → multiplier stack → health). RA2 would register `ShieldFirstDamageResolver`. See D041 in `../decisions/09d-gameplay.md` for full rationale and alternative implementations.

### Support Powers / Superweapons

```rust
/// Attached to the building that provides the power (e.g., Chronosphere, Iron Curtain device).
pub struct SupportPower {
    pub power_type: SupportPowerType,
    pub charge_time: u32,          // ticks to fully charge
    pub current_charge: u32,       // ticks accumulated
    pub ready: bool,
    pub one_shot: bool,            // nukes: consumed on use; Chronosphere: recharges
    pub targeting: TargetingMode,
}

pub enum TargetingMode {
    Point,                   // click a cell (nuke)
    Area { radius: i32 },   // area selection (Iron Curtain effect)
    Directional,             // select origin + target cell (Chronoshift)
}

pub enum SupportPowerType {
    /// Defined by YAML — these are RA1 defaults, but the enum is data-driven.
    Named(String),
}

/// Player-level tracking.
pub struct SupportPowerManager {
    pub powers: Vec<SupportPowerStatus>, // one per owned support building
}
```

**`support_power_system()` logic:** For each entity with `SupportPower`: increment `current_charge` each tick. When `current_charge >= charge_time`, set `ready = true`. UI shows charge bar. Activation comes via player order (sim validates ownership + readiness), then applies warheads/effects at target location.

### Building Mechanics

```rust
/// Build radius — buildings can only be placed near existing structures.
pub struct BuildArea {
    pub range: i32,   // cells from building edge
}

/// Primary building marker — determines which building produces (e.g., primary war factory).
pub struct PrimaryBuilding;

/// Rally point — newly produced units move here.
pub struct RallyPoint {
    pub target: WorldPos,
}

/// Building exit points — where produced units spawn.
pub struct Exit {
    pub offsets: Vec<CellPos>,   // spawn positions relative to building origin
}

/// Building can be sold.
pub struct Sellable {
    pub refund_percent: i32,  // typically 50
    pub sell_time: u32,       // ticks for sell animation
}

/// Building can be repaired (by player spending credits).
pub struct Repairable {
    pub repair_rate: i32,     // HP per tick while repairing
    pub repair_cost_per_hp: i32,
}

/// Gate — wall segment that opens for friendly units.
pub struct Gate {
    pub open_delay: u32,
    pub close_delay: u32,
    pub state: GateState,
}

pub enum GateState { Open, Closed, Opening, Closing }

/// Wall-specific: enables line-build placement.
pub struct LineBuild;
```

**Building placement validation** (in `apply_orders()` → order validation):
1. Check footprint fits terrain (no water, no cliffs, no existing buildings)
2. Check within build radius of at least one friendly `BuildArea` provider
3. Check prerequisites met (from `Buildable.prereqs`)
4. Deduct cost → start build animation → spawn building entity

### Production Queue

```rust
/// A production queue (each building type has its own queue).
pub struct ProductionQueue {
    pub queue_type: QueueType,
    pub items: Vec<ProductionItem>,
    pub parallel: bool,           // RA2: parallel production per factory
    pub paused: bool,
}

pub struct ProductionItem {
    pub actor_type: ActorId,
    pub remaining_cost: i32,
    pub remaining_time: u32,
    pub paid: i32,               // credits paid so far (for pause/resume)
    pub infinite: bool,          // repeat production (hold queue)
}
```

**`production_system()` logic:** For each `ProductionQueue`: if not paused and not empty, advance front item. Deduct credits incrementally (one tick's worth per tick — production slows when credits run out). When `remaining_time == 0`, spawn unit at building's `Exit` position, send to `RallyPoint` if set.

#### Production Model Diversity

The `ProductionQueue` above describes the classic C&C sidebar model, but production is one of the most varied mechanics across RTS games — even within the OpenRA mod ecosystem. Analysis of six major OpenRA mods (see `research/openra-mod-architecture-analysis.md`) reveals at least five distinct production models:

| Model                 | Game                   | Description                                                           |
| --------------------- | ---------------------- | --------------------------------------------------------------------- |
| Global sidebar        | RA1, TD                | One queue per unit category, shared across all factories of that type |
| Tabbed sidebar        | RA2                    | Multiple parallel queues, one per factory building                    |
| Per-building on-site  | KKnD (OpenKrush)       | Each building has its own queue and rally point; no sidebar           |
| Single-unit selection | Dune II (d2)           | Select one building, build one item — no queue at all                 |
| Colony-based          | Swarm Assault (OpenSA) | Capture colony buildings for production; no construction yard         |

The engine must not hardcode any of these. The `production_system()` described above is the RA1 game module's implementation. Other game modules register their own production system via `GameModule::system_pipeline()`. The `ProductionQueue` component is defined by the game module, not the engine core. A KKnD-style module might define a `PerBuildingProductionQueue` component with different constraints; a Dune II module might omit queue mechanics entirely and use a `SingleItemProduction` component.

This is a key validation of invariant #9 (engine core is game-agnostic): if a non-C&C total conversion on our engine needs a fundamentally different production model, the engine should not resist it.

### Resource / Ore Model

```rust
/// Ore/gem cell data — stored per map cell (in a resource layer, not as entities).
pub struct ResourceCell {
    pub resource_type: ResourceType,
    pub amount: i32,     // depletes as harvested
    pub max_amount: i32,
    pub growth_rate: i32, // ore regrows; gems don't (YAML-configured)
}

/// Storage capacity — silos and refineries.
pub struct ResourceStorage {
    pub capacity: i32,
}
```

**`harvester_system()` logic:**
1. Harvester navigates to nearest `ResourceCell` with amount > 0
2. Harvester mines: transfers resource from cell to `Harvester.capacity`
3. When full (or cell depleted): navigate to nearest `DockHost` with `DockType::Refinery`
4. Dock, transfer resources → credits (via resource value table)
5. If no refinery, wait. If no ore, scout for new fields.

Player receives "silos needed" notification when total stored exceeds total `ResourceStorage.capacity`.

### Transport / Cargo

```rust
pub struct Cargo {
    pub max_weight: u32,
    pub current_weight: u32,
    pub passengers: Vec<EntityId>,
    pub unload_delay: u32,
}

pub struct Passenger {
    pub weight: u32,
    pub custom_pip: Option<PipType>,  // minimap/selection pip color
}

/// For carryall-style air transport.
pub struct Carryall {
    pub carry_target: Option<EntityId>,
}

/// Eject passengers on death (not all transports — YAML-configured).
pub struct EjectOnDeath;

/// ParaDrop capability — drop passengers from air.
pub struct ParaDrop {
    pub drop_interval: u32,  // ticks between each passenger exiting
}
```

**Load order:** Player issues load order → `movement_system()` moves passenger to transport → when adjacent, remove passenger from world, add to `Cargo.passengers`. **Unload order:** Deploy order → eject passengers one by one at `Exit` positions, delay between each.

### Capture / Ownership

```rust
pub struct Capturable {
    pub capture_types: Vec<CaptureType>,  // engineer, proximity
    pub capture_threshold: i32,           // required capture points
    pub current_progress: i32,
    pub capturing_entity: Option<EntityId>,
}

pub struct Captures {
    pub speed: i32,              // capture points per tick
    pub capture_type: CaptureType,
    pub consumed: bool,          // engineer is consumed on capture (RA1 behavior)
}

pub enum CaptureType { Infantry, Proximity }
```

**`capture_system()` logic:** For each entity with `Capturable` being captured: increment `current_progress` by capturer's `speed`. When `current_progress >= capture_threshold`, transfer ownership to capturer's player. If `consumed`, destroy capturer. Reset progress on interruption (capturer killed or moved away).

### Stealth / Cloak

```rust
pub struct Cloak {
    pub cloak_delay: u32,         // ticks after last action before cloaking
    pub cloak_types: Vec<CloakType>,
    pub ticks_since_action: u32,
    pub is_cloaked: bool,
    pub reveal_on_fire: bool,
    pub reveal_on_move: bool,
}

pub struct DetectCloaked {
    pub range: i32,
    pub detect_types: Vec<CloakType>,
}

pub enum CloakType { Stealth, Underwater, Disguise, GapGenerator }
```

**`cloak_system()` logic:** For each `Cloak` entity: if `reveal_on_fire` and fired this tick, reset `ticks_since_action`. If `reveal_on_move` and moved this tick, reset. Otherwise increment `ticks_since_action`. When above `cloak_delay`, set `is_cloaked = true`. Rendering: cloaked and no enemy `DetectCloaked` in range → invisible. Cloaked but detected → shimmer effect. Fog system integration: cloaked entities hidden from enemy even in explored area unless detector present.

### Infantry Mechanics

```rust
/// Infantry sub-cell positioning — up to 5 infantry per cell.
pub struct InfantryBody {
    pub sub_cell: SubCell,  // Center, TopLeft, TopRight, BottomLeft, BottomRight
}

pub enum SubCell { Center, TopLeft, TopRight, BottomLeft, BottomRight }

/// Panic flee behavior (e.g., civilians, dogs).
pub struct ScaredyCat {
    pub flee_range: i32,
    pub panic_ticks: u32,
}

/// Take cover / prone — reduces damage, reduces speed.
pub struct TakeCover {
    pub damage_modifier: i32,   // e.g., 50 (half damage)
    pub speed_modifier: i32,    // e.g., 50 (half speed)
    pub prone_delay: u32,       // ticks to transition to prone
}
```

**`movement_system()` integration for infantry:** When infantry moves into a cell, assigns `SubCell` based on available slots. Up to 5 infantry share one cell in different visual positions. When attacked, infantry with `TakeCover` auto-goes prone (grants condition "prone" → `DamageMultiplier` of 50%).

### Death Mechanics

```rust
/// Spawn an actor when this entity dies (husks, ejected pilots).
pub struct SpawnOnDeath {
    pub actor_type: ActorId,
    pub probability: i32,   // 0-100, default 100
}

/// Explode on death — apply warheads at position.
pub struct ExplodeOnDeath {
    pub warheads: Vec<WarheadId>,
}

/// Timed self-destruct (demo truck, C4 charge).
pub struct SelfDestruct {
    pub timer: u32,        // ticks remaining
    pub warheads: Vec<WarheadId>,
}

/// Damage visual states.
pub struct DamageStates {
    pub thresholds: Vec<DamageThreshold>,
}

pub struct DamageThreshold {
    pub hp_percent: i32,   // below this → enter this state
    pub state: DamageState,
}

pub enum DamageState { Undamaged, Light, Medium, Heavy, Critical }

/// Victory condition marker — this entity must be destroyed to win.
pub struct MustBeDestroyed;
```

**`death_system()` logic:** For entities with `Health.current <= 0`: check `SpawnOnDeath` → spawn husk/pilot. Check `ExplodeOnDeath` → apply warheads at position. Remove entity from world and spatial index. For `SelfDestruct`: decrement timer each tick in a pre-death pass; when 0, kill the entity (triggers normal death path).

### Transform / Deploy

```rust
/// Actor can transform into another type (MCV ↔ ConYard, siege deploy/undeploy).
pub struct Transforms {
    pub into: ActorId,
    pub delay: u32,              // ticks for transformation
    pub facing: Option<i32>,     // required facing to transform
    pub condition: Option<ConditionId>,  // condition granted during transform
}
```

**Processing:** Player issues deploy order → `transform_system()` starts countdown. During `delay`, entity is immobile (grants condition "deploying"). After delay, replace entity with `into` actor type, preserving health percentage, owner, and veterancy.

### Docking System

```rust
/// Building or unit that accepts docking (refinery, helipad, repair pad).
pub struct DockHost {
    pub dock_type: DockType,
    pub dock_position: CellPos,  // where the client unit sits
    pub queue: Vec<EntityId>,    // waiting to dock
    pub occupied: bool,
}

/// Unit that needs to dock (harvester, aircraft, damaged vehicle for repair pad).
pub struct DockClient {
    pub dock_type: DockType,
}

pub enum DockType { Refinery, Helipad, RepairPad }
```

**`docking_system()` logic:** For each `DockHost`: if not occupied and queue non-empty, pull front of queue, guide to `dock_position`. When docked: execute dock-type-specific logic (refinery → transfer resources; helipad → reload ammo; repair pad → heal). When done, release and advance queue.

### Veterancy / Experience

```rust
/// This unit gains XP from kills.
pub struct GainsExperience {
    pub current_xp: i32,
    pub level: VeterancyLevel,
    pub thresholds: Vec<i32>,      // XP required for each level transition
    pub level_conditions: Vec<ConditionId>,  // conditions granted at each level
}

/// This unit awards XP when killed (based on its cost/value).
pub struct GivesExperience {
    pub value: i32,   // XP awarded to killer
}

pub enum VeterancyLevel { Rookie, Veteran, Elite, Heroic }
```

**`veterancy_system()` logic:** When `death_system()` removes an entity with `GivesExperience`, the killer (if it has `GainsExperience`) receives `value` XP. Check `thresholds`: if XP crosses a boundary, advance `level` and grant the corresponding condition. Conditions trigger multipliers: veteran = +25% firepower/+25% armor; elite = +50%/+50% + self-heal; heroic = +75%/+75% + faster fire rate (all values from YAML, not hardcoded).

**Campaign carry-over (D021):** `GainsExperience.current_xp` and `level` are part of the roster snapshot saved between campaign missions.

### Guard Command

```rust
pub struct Guard {
    pub target: EntityId,
    pub leash_range: i32,   // max distance from target before returning
}

pub struct Guardable;  // marker: can be guarded
```

**Processing in `apply_orders()`:** Guard order assigns `Guard` component. `combat_system()` integration: if a guarding unit's target is attacked and attacker is within leash range, engage attacker. If target moves beyond leash range, follow.

### Crush Mechanics

```rust
pub struct Crushable {
    pub crush_class: CrushClass,
}

pub enum CrushClass { Infantry, Wall, Hedgehog }

/// Vehicles that auto-crush when moving over crushable entities.
pub struct Crusher {
    pub crush_classes: Vec<CrushClass>,
}
```

**`crush_system()` logic:** After `movement_system()`, for each entity with `Crusher` that moved this tick: query `SpatialIndex` at new position for entities with matching `Crushable.crush_class`. Apply instant kill to crushed entities.

### Crate System

```rust
pub struct Crate {
    pub action_pool: Vec<CrateAction>,  // weighted random selection
}

pub enum CrateAction {
    Cash { amount: i32 },
    Unit { actor_type: ActorId },
    Heal { percent: i32 },
    LevelUp,
    MapReveal,
    Explode { warhead: WarheadId },
    Cloak { duration: u32 },
    Speed { multiplier: i32, duration: u32 },
}

/// World-level system resource.
pub struct CrateSpawner {
    pub max_crates: u32,
    pub spawn_interval: u32,   // ticks between spawn attempts
    pub spawn_area: SpawnArea,
}
```

**`crate_system()` logic:** Periodically spawn crates (up to `max_crates`). When a unit moves onto a crate: pick random `CrateAction`, apply effect to collecting unit/player. Remove crate entity.

### Mine System

```rust
pub struct Mine {
    pub trigger_types: Vec<TargetType>,
    pub warhead: WarheadId,
    pub visible_to_owner: bool,
}

pub struct Minelayer {
    pub mine_type: ActorId,
    pub lay_delay: u32,
}
```

**`mine_system()` logic:** After `movement_system()`, for each `Mine`: query spatial index for entities at mine position matching `trigger_types`. On contact: apply warhead, destroy mine. Mines are invisible to enemy unless detected by mine-sweeper unit (uses `DetectCloaked` with `CloakType::Stealth`).

### Notification System

```rust
pub struct NotificationEvent {
    pub event_type: NotificationType,
    pub position: Option<WorldPos>,  // for spatial notifications
    pub player: PlayerId,
}

pub enum NotificationType {
    UnitLost,
    BaseUnderAttack,
    HarvesterUnderAttack,
    BuildingCaptured,
    LowPower,
    SilosNeeded,
    InsufficientFunds,
    BuildingComplete,
    UnitReady,
    NuclearLaunchDetected,
    EnemySpotted,
    ReinforcementsArrived,
}

/// Per-notification-type cooldown (avoid spam).
/// Flat array indexed by NotificationType discriminant — small fixed enum,
/// avoids HashMap overhead on a per-event check.
pub struct NotificationCooldowns {
    pub cooldowns: [u32; NotificationType::COUNT],  // ticks remaining, index = variant as usize
    pub default_cooldown: u32,                       // typically 150 ticks (~10 sec)
}
```

**`notification_system()` logic:** Collects events from other systems (combat → "base under attack", production → "building complete", power → "low power"). Checks cooldown for each type. If not on cooldown, queues notification for `ic-audio` (EVA voice line) and `ic-ui` (text overlay). Audio mapping is YAML-driven:

```yaml
notifications:
  base_under_attack: { audio: "BATL1.AUD", priority: high, cooldown: 300 }
  building_complete: { audio: "CONSTRU2.AUD", priority: normal, cooldown: 0 }
  low_power: { audio: "LOPOWER1.AUD", priority: high, cooldown: 600 }
```

### Cursor System

```rust
/// Determines which cursor shows when hovering over a target.
pub struct CursorProvider {
    pub cursor_map: HashMap<CursorContext, CursorDef>,
}

pub enum CursorContext {
    Default,
    Move,
    Attack,
    AttackForce,     // force-fire on ground
    Capture,
    Enter,           // enter transport/building
    Deploy,
    Sell,
    Repair,
    Guard,
    SupportPower(SupportPowerType),
    Chronoshift,
    Nuke,
    Harvest,
    Impassable,
}

pub struct CursorDef {
    pub sprite: SpriteId,
    pub hotspot: (i32, i32),
    pub sequence: Option<AnimSequence>,  // animated cursors
}
```

**Logic:** Each frame (render-side, not sim), determine cursor context from: selected units, hovered entity/terrain, active command mode (sell, repair, support power), force modifiers (Ctrl = force-fire, Alt = force-move). Look up `CursorDef` from `CursorProvider`. Display.

### Hotkey System

```rust
pub struct HotkeyConfig {
    pub bindings: HashMap<ActionId, Vec<KeyCombo>>,
    pub profiles: HashMap<String, HotkeyProfile>,
}

pub struct KeyCombo {
    pub key: KeyCode,
    pub modifiers: Modifiers,  // Ctrl, Shift, Alt
}
```

**Built-in profiles:**
- `classic` — original RA1 keybindings
- `openra` — OpenRA defaults
- `modern` — WASD camera, common RTS conventions

Fully rebindable in settings UI. Categories: unit commands, production, control groups, camera, chat, debug. Hotkeys produce `PlayerOrder`s through `InputSource` — the sim never sees key codes.

### Camera System

The camera is a purely render-side concern — the sim has no camera concept (Invariant #1). Camera state lives as a Bevy `Resource` in `ic-render`, read by the rendering pipeline and `ic-ui` (minimap, spatial audio listener position). The `ScreenToWorld` trait (see § "Portability Design Rules") converts screen coordinates to world positions; the camera system controls what region of the world is visible.

#### Core Types

```rust
/// Central camera state — a Bevy Resource in ic-render.
/// NOT part of the sim. Save/restore for save games is serialized separately
/// (alongside other client-side state like UI layout and audio volume).
#[derive(Resource)]
pub struct GameCamera {
    /// World position the camera is centered on (render-side f32, not sim fixed-point).
    pub position: Vec2,
    /// Current zoom level. 1.0 = default view. <1.0 = zoomed out, >1.0 = zoomed in.
    pub zoom: f32,
    /// Zoom limits — enforced every frame. Ranked/tournament modes clamp these further.
    pub zoom_min: f32,  // default: 0.5 (see twice as much map)
    pub zoom_max: f32,  // default: 4.0 (pixel-level inspection)
    /// Map bounds in world coordinates — camera cannot scroll past these.
    pub bounds: Rect,
    /// Smooth interpolation factor for zoom (0.0–1.0 per frame, lerp toward target).
    pub zoom_smoothing: f32,  // default: 0.15
    /// Smooth interpolation factor for pan.
    pub pan_smoothing: f32,   // default: 0.2
    /// Internal: zoom target for smooth interpolation.
    pub zoom_target: f32,
    /// Internal: position target for smooth pan (e.g., centering on selection).
    pub position_target: Vec2,
    /// Edge scroll speed in world-units per second (scaled by current zoom).
    pub edge_scroll_speed: f32,
    /// Keyboard pan speed in world-units per second (scaled by current zoom).
    pub keyboard_pan_speed: f32,
    /// Follow mode: lock camera to a unit or player's view.
    pub follow_target: Option<FollowTarget>,
    /// Screen shake state (driven by explosions, nukes, superweapons).
    pub shake: ScreenShake,
}

pub enum FollowTarget {
    Unit(UnitTag),               // follow a specific unit (observer, cinematic)
    Player(PlayerId),            // lock to a player's viewport (observer mode)
}

pub struct ScreenShake {
    pub amplitude: f32,          // current intensity (decays over time)
    pub decay_rate: f32,         // amplitude reduction per second
    pub frequency: f32,          // oscillation speed
    pub offset: Vec2,            // current frame's shake offset (applied to final transform)
}
```

#### Zoom Behavior

Zoom modifies the `OrthographicProjection.scale` on the Bevy camera entity. A zoom of 1.0 maps to the default viewport size for the active render mode (D048). Zooming out (`zoom < 1.0`) shows more of the map; zooming in (`zoom > 1.0`) magnifies the view.

**Input methods:**

| Input               | Action                                        | Platform     |
| ------------------- | --------------------------------------------- | ------------ |
| Mouse scroll wheel  | Zoom toward/away from cursor position         | Desktop      |
| +/- keys            | Zoom toward/away from screen center           | Desktop      |
| Pinch gesture       | Zoom toward/away from pinch midpoint          | Touch/mobile |
| `/zoom <level>` cmd | Set zoom to exact value (D058)                | All          |
| Ctrl+scroll         | Fine zoom (half step size)                    | Desktop      |
| Minimap scroll      | Zoom the minimap's own viewport independently | All          |

**Zoom-toward-cursor** is the expected UX for isometric games (SC2, AoE2, OpenRA all do this). When the player scrolls the mouse wheel, the world point under the cursor stays fixed on screen — the camera position shifts to compensate for the scale change. This requires adjusting `position` alongside `zoom`:

```rust
fn zoom_toward_cursor(camera: &mut GameCamera, cursor_world: Vec2, scroll_delta: f32) {
    let old_zoom = camera.zoom_target;
    camera.zoom_target = (old_zoom + scroll_delta * ZOOM_STEP)
        .clamp(camera.zoom_min, camera.zoom_max);
    // Shift position so the cursor's world point stays at the same screen location.
    let zoom_ratio = camera.zoom_target / old_zoom;
    camera.position_target = cursor_world + (camera.position_target - cursor_world) * zoom_ratio;
}
```

**Smooth interpolation:** The actual `zoom` and `position` values lerp toward their targets each frame:

```rust
fn camera_interpolation(camera: &mut GameCamera, dt: f32) {
    let t_zoom = 1.0 - (1.0 - camera.zoom_smoothing).powf(dt * 60.0);
    camera.zoom = camera.zoom.lerp(camera.zoom_target, t_zoom);
    let t_pan = 1.0 - (1.0 - camera.pan_smoothing).powf(dt * 60.0);
    camera.position = camera.position.lerp(camera.position_target, t_pan);
}
```

This frame-rate-independent smoothing (exponential lerp) feels identical at 30 fps and 240 fps. The `powf()` call is once per frame, not per entity — negligible cost.

**Discrete vs. continuous:** Keyboard zoom (+/-) uses discrete steps (e.g., 0.25 increments). Mouse scroll uses finer steps (0.1). Both feed `zoom_target` and smooth toward it. There is NO "snap to integer zoom" constraint — smooth zoom is the default behavior. Classic render mode (D048) with integer scaling uses the same smooth zoom for camera movement but snaps the `OrthographicProjection.scale` to the nearest integer multiple when rendering, preventing sub-pixel shimmer on pixel art.

#### Zoom Interaction with Render Modes (D048)

Different render modes have different zoom characteristics:

| Render Mode | Default Zoom | Zoom Range | Scaling Behavior                                         |
| ----------- | ------------ | ---------- | -------------------------------------------------------- |
| Classic     | 1.0          | 0.5–3.0    | Integer-scale snap for rendering; smooth camera movement |
| HD          | 1.0          | 0.5–4.0    | Fully smooth — no snap needed at any zoom level          |
| 3D          | 1.0          | 0.25–6.0   | Perspective FOV adjustment, not orthographic scale       |

When a render mode switch occurs (F1 / D048), the camera system adjusts:
- `zoom_min` / `zoom_max` to the new mode's range
- `zoom_target` is clamped to the new range (if current zoom exceeds new limits)
- Camera position is preserved — only the zoom behavior changes

For 3D render modes, zoom maps to camera distance from the ground plane (dolly) rather than orthographic scale. The `ScreenToWorld` trait abstracts this — the camera system sets a `zoom` value, and the active `ScreenToWorld` implementation interprets it appropriately (orthographic scale for 2D, distance for 3D).

#### Pan (Scrolling)

Four input methods, all producing the same result — a `position_target` update:

| Method                 | Behavior                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| Edge scroll            | Move cursor to screen edge → pan in that direction                  |
| Keyboard (WASD/arrows) | Pan at `keyboard_pan_speed`, scaled by zoom (slower when zoomed in) |
| Minimap click          | Jump camera center to the clicked world position                    |
| Middle-mouse drag      | Pan by mouse delta (inverted — drag world under cursor)             |

**Speed scales with zoom:** When zoomed out, pan speed increases proportionally so map traversal time feels consistent. When zoomed in, pan speed decreases for precision. The scaling is linear: `effective_speed = base_speed / zoom`.

**Bounds clamping:** Every frame, `position_target` is clamped so the viewport stays within `bounds` (map rectangle plus a configurable padding). The player cannot scroll to see void beyond the map edge. Bounds are set when the map loads and do not change during gameplay.

#### Screen Shake

Triggered by game events (explosions, superweapons, building destruction) via Bevy events:

```rust
pub struct CameraShakeEvent {
    pub epicenter: WorldPos,   // world position of the explosion
    pub intensity: f32,        // 0.0–1.0 (nuke = 1.0, tank shell = 0.05)
    pub duration_secs: f32,    // how long the shake lasts
}
```

The shake system calculates `amplitude` from intensity, attenuated by distance from the camera. Multiple concurrent shakes are additive (capped at a maximum amplitude). The `shake.offset` is applied to the final camera transform each frame — it never modifies `position` or `position_target`, so the shake doesn't drift the view.

Players can disable screen shake entirely via settings (`/camera_shake off` — D058) or reduce intensity with a slider. Accessibility concern: excessive screen shake can cause motion sickness.

#### Camera in Replays and Save Games

- **Save games:** `GameCamera` state (position, zoom, follow target) is serialized alongside other client-side state. On load, the camera restores to where the player was looking.
- **Replays:** `CameraPositionSample` events (see `05-FORMATS.md`) record each player's viewport center and zoom level at 2 Hz. Replay viewers can follow any player's camera or use free camera. The replay camera is independent of the recorded camera data — the viewer controls their own viewport.
- **Observer mode:** Observers have independent camera control with no zoom restrictions (they can zoom out further than players for overview). The `follow_player` option (see `ObserverState`) syncs the observer's camera to a player's recorded `CameraPositionSample` stream.

#### Camera Configuration (YAML)

Per-game-module camera defaults:

```yaml
camera:
  zoom:
    default: 1.0
    min: 0.5
    max: 4.0
    step_scroll: 0.1       # mouse wheel increment
    step_keyboard: 0.25    # +/- key increment
    smoothing: 0.15        # lerp factor (0 = instant, 1 = no movement)
    # Ranked override — competitive committee (D037) sets these per season
    ranked_min: 0.75
    ranked_max: 2.0
  pan:
    edge_scroll_speed: 1200.0   # world-units/sec at zoom 1.0
    keyboard_speed: 1000.0
    smoothing: 0.2
    edge_scroll_zone: 8        # pixels from screen edge to trigger
  shake:
    max_amplitude: 12.0         # max pixel displacement
    decay_rate: 8.0             # amplitude reduction per second
    enabled: true               # default; player can override in settings
  bounds_padding: 64            # extra world-units beyond map edges
```

This makes camera behavior fully data-driven (Principle 4 from `13-PHILOSOPHY.md`). A Tiberian Sun module can set different zoom ranges (its taller buildings need more zoom-out headroom). A total conversion can disable edge scrolling entirely if it uses a different camera paradigm.

### Game Speed

```rust
/// Lobby-configurable game speed.
pub struct GameSpeed {
    pub preset: SpeedPreset,
    pub tick_interval_ms: u32,   // sim tick period
}

pub enum SpeedPreset {
    Slowest,   // 80ms per tick
    Slower,    // 67ms per tick (default)
    Normal,    // 50ms per tick
    Faster,    // 35ms per tick
    Fastest,   // 20ms per tick
}
```

Speed affects only the interval between sim ticks — system behavior is tick-count-based, so all game logic works identically at any speed. Single-player can change speed mid-game; multiplayer sets it in lobby (synced).

### Faction System

```rust
/// Faction identity — loaded from YAML.
pub struct Faction {
    pub internal_name: String,   // "allies", "soviet"
    pub display_name: String,    // "Allied Forces"
    pub side: String,            // "allies", "soviet" (for grouping subfactions)
    pub color: PlayerColor,
    pub tech_tree: TechTreeId,
    pub starting_units: Vec<StartingUnit>,
}
```

Factions determine: available tech tree (which units/buildings can be built), default player color, starting unit composition in skirmish, lobby selection, and `Buildable.prereqs` resolution. RA2 subfactions (e.g., Korea, Libya) share a `side` but differ in `tech_tree` (one unique unit each).

### Auto-Target / Turret

```rust
/// Unit auto-acquires targets within range.
pub struct AutoTarget {
    pub scan_range: i32,
    pub stance: Stance,
    pub prefer_priority: bool,   // prefer high-priority targets
}

pub enum Stance {
    HoldFire,      // never auto-attack
    ReturnFire,    // attack only if attacked
    Defend,        // attack enemies in range
    AttackAnything, // attack anything visible
}

/// Turreted weapon — rotates independently of body.
pub struct Turreted {
    pub turn_speed: i32,
    pub offset: WorldPos,      // turret mount point relative to body
    pub current_facing: i32,   // turret facing (0-255)
}

/// Weapon requires ammo — must reload at dock (helipad).
pub struct AmmoPool {
    pub max_ammo: u32,
    pub current_ammo: u32,
    pub reload_delay: u32,    // ticks per ammo at dock
}
```

**`combat_system()` integration:** For units with `AutoTarget` and no current attack order: scan `SpatialIndex` within `scan_range`. Filter by `Stance` rules. Pick highest-priority valid target. For `Turreted` units: rotate turret toward target at `turn_speed` per tick before firing. For `AmmoPool` units: decrement ammo on fire; when depleted, return to nearest `DockHost` with `DockType::Helipad` for reload.

### Selection Details

```rust
pub struct SelectionPriority {
    pub priority: i32,         // higher = selected preferentially
    pub click_priority: i32,   // higher = wins click-through
}
```

**Selection features:**
- **Priority:** When box-selecting 200 units, combat units are selected over harvesters (higher `priority`)
- **Double-click:** Select all units of the same type on screen
- **Tab cycling:** Cycle through unit types within a selection group
- **Control groups:** 0-9 control groups, Ctrl+# to assign, # to select, double-# to center camera
- **Isometric selection box:** Diamond-shaped box selection for proper isometric hit-testing

### Observer / Spectator UI

Observer mode (separate from player mode) displays overlays not available to players:

```rust
pub struct ObserverState {
    pub show_army: bool,       // unit composition per player
    pub show_production: bool, // what each player is building
    pub show_economy: bool,    // income rate, credits per player
    pub show_powers: bool,     // superweapon charge timers
    pub show_score: bool,      // strategic score tracker
    pub follow_player: Option<PlayerId>,  // lock camera to player's view (writes GameCamera.follow_target)
}
```

**Army overlay:** Bar chart of unit counts per player, grouped by type. **Production overlay:** List of active queues per player. **Economy overlay:** Income rate graph. These are render-only — no sim interaction. Observer UI is an `ic-ui` concern.

#### Game Score / Performance Metrics

The sim tracks a comprehensive `GameScore` per player, updated every tick. This powers the observer economy overlay, post-game stats screen, and the replay analysis event stream (see `05-FORMATS.md` § "Analysis Event Stream"). Design informed by SC2's `ScoreDetails` protobuf (see `research/blizzard-github-analysis.md` § Part 2).

```rust
#[derive(Clone, Serialize, Deserialize)]
pub struct GameScore {
    // Economy
    pub total_collected: ResourceSet,      // lifetime resources harvested
    pub total_spent: ResourceSet,          // lifetime resources committed
    pub collection_rate: ResourceSet,      // current income per minute (fixed-point)
    pub idle_harvester_ticks: u64,         // cumulative ticks harvesters spent idle

    // Production
    pub units_produced: u32,
    pub structures_built: u32,
    pub idle_production_ticks: u64,        // cumulative ticks factories spent idle

    // Combat
    pub units_killed: u32,
    pub units_lost: u32,
    pub structures_destroyed: u32,
    pub structures_lost: u32,
    pub killed_value: ResourceSet,         // total value of enemy assets destroyed
    pub lost_value: ResourceSet,           // total value of own assets lost
    pub damage_dealt: i64,                 // fixed-point cumulative
    pub damage_received: i64,

    // Activity
    pub actions_per_minute: u32,           // APM (all orders)
    pub effective_actions_per_minute: u32, // EPM (non-redundant orders only)
}
```

**APM vs EPM:** Following SC2's distinction — APM counts every order, EPM filters duplicate/redundant commands (e.g., repeatedly right-clicking the same destination). EPM is a better measure of meaningful player activity.

**Sim-side only:** `GameScore` lives in `ic-sim` (it's deterministic state, not rendering). Observer overlays in `ic-ui` read it through the standard `Simulation` query interface.

### Debug / Developer Tools

> See also `../decisions/09g-interaction.md` § D058 for the unified chat/command console, cvar system, and Brigadier-style command tree that provides the text-based interface to these developer tools.

Developer mode (toggled in settings, not available in ranked):

```rust
pub struct DeveloperMode {
    pub instant_build: bool,
    pub free_units: bool,
    pub reveal_map: bool,
    pub unlimited_power: bool,
    pub invincible: bool,
    pub give_cash_amount: i32,
}
```

**Debug overlays (via `bevy_egui`):**
- Combat: weapon ranges as circles, target lines, damage numbers floating
- Pathfinding: flowfield visualization, path cost heat map, blocker highlight
- Performance: per-system tick time bar chart, entity count, memory usage
- Network: RTT graph, order latency, jitter, desync hash comparison
- Asset browser: preview sprites, sounds, palettes inline

Developer cheats issue special orders validated only when `DeveloperMode` is active. In multiplayer, all players must agree to enable dev mode (prevents cheating).

> **Security (V44):** The consensus mechanism for multiplayer dev mode must be specified: dev mode is sim state (not client-side), toggled exclusively via `PlayerOrder::SetDevMode` with unanimous lobby consent before game start. Dev mode orders use a distinct `PlayerOrder::DevCommand` variant rejected by the sim when dev mode is inactive. Disabled for ranked matchmaking. See `06-SECURITY.md` § Vulnerability 44.

#### Debug Drawing API

A programmatic drawing API for rendering debug geometry. Inspired by SC2's `DebugDraw` interface (see `research/blizzard-github-analysis.md` § Part 7) — text, lines, boxes, and spheres rendered as overlays:

```rust
pub trait DebugDraw {
    fn draw_text(&mut self, pos: WorldPos, text: &str, color: Color);
    fn draw_line(&mut self, start: WorldPos, end: WorldPos, color: Color);
    fn draw_circle(&mut self, center: WorldPos, radius: i32, color: Color);
    fn draw_rect(&mut self, min: WorldPos, max: WorldPos, color: Color);
}
```

Used by AI visualization, pathfinding debug, weapon range display, and Lua/WASM debug scripts. All debug geometry is cleared each frame — callers re-submit every tick. Lives in `ic-render` (render concern, not sim).

#### Debug Unit Manipulation

Developer mode supports direct entity manipulation for testing:

- **Spawn unit:** Create any unit type at a position, owned by any player
- **Kill unit:** Instantly destroy selected entities
- **Set resources:** Override player credit balance
- **Modify health:** Set HP to any value

These operations are implemented as special `PlayerOrder` variants validated only when `DeveloperMode` is active. They flow through the normal order pipeline — deterministic across all clients.

#### Fault Injection (Testing Only)

For automated stability testing — not exposed in release builds:

- **Hang simulation:** Simulate tick timeout (verifies watchdog recovery)
- **Crash process:** Controlled exit (verifies crash reporting pipeline)
- **Desync injection:** Flip a bit in sim state (verifies desync detection and diagnosis)

These follow SC2's `DebugTestProcess` pattern for CI/CD reliability testing.

### Localization Framework

```rust
pub struct Localization {
    pub current_locale: String,         // "en", "de", "zh-CN"
    pub bundles: HashMap<String, FluentBundle>,  // locale → string bundle
}
```

Uses **Project Fluent** (same as OpenRA) for parameterized, pluralization-aware message formatting:

```fluent
# en.ftl
unit-lost = Unit lost
base-under-attack = Our base is under attack!
building-complete = { $building } construction complete.
units-selected = { $count ->
    [one] {$count} unit selected
   *[other] {$count} units selected
}
```

Mods provide their own `.ftl` files. Engine strings are localizable from Phase 3. Community translations publishable to Workshop.

### Encyclopedia

In-game unit/building/weapon reference browser:

```rust
pub struct EncyclopediaEntry {
    pub actor_type: ActorId,
    pub display_name: String,
    pub description: String,
    pub stats: HashMap<String, String>,  // "Speed: 8", "Armor: Medium"
    pub preview_sprite: SpriteId,
    pub category: EncyclopediaCategory,
}

pub enum EncyclopediaCategory { Infantry, Vehicle, Aircraft, Naval, Structure, Defense, Support }
```

Auto-generated from YAML rule definitions + optional `encyclopedia:` block in YAML. Accessible from main menu and in-game sidebar. Mod-defined units automatically appear in the encyclopedia.

### Palette Effects (Runtime)

Beyond static `.pal` file loading (`ra-formats`), runtime palette manipulation for classic RA visual style:

```rust
pub enum PaletteEffect {
    PlayerColorRemap { remap_range: (u8, u8), target_color: PlayerColor },
    Rotation { start_index: u8, end_index: u8, speed: u32 },  // water animation
    CloakShimmer { entity: EntityId },
    ScreenFlash { color: PaletteColor, duration: u32 },       // nuke, chronoshift
    DamageTint { entity: EntityId, state: DamageState },
}
```

**Modern implementation:** These are shader effects in Bevy's render pipeline, not literal palette index swaps. But the modder-facing YAML configuration matches the original palette effect names for familiarity. Shader implementations achieve the same visual result with modern GPU techniques (color lookup textures, screen-space post-processing).

### Demolition / C4

```rust
pub struct Demolition {
    pub delay: u32,               // ticks to detonation
    pub warhead: WarheadId,
    pub required_target: TargetType,  // buildings only
}
```

Engineer-type unit with `Demolition` places C4 on a building. After `delay` ticks, warhead detonates. Target building takes massive damage (usually fatal). Engineer is consumed.

### Plug System

```rust
pub struct Pluggable {
    pub plug_type: PlugType,
    pub max_plugs: u32,
    pub current_plugs: u32,
    pub effect_per_plug: ConditionId,
}

pub struct Plug {
    pub plug_type: PlugType,
}
```

Primarily RA2 (bio-reactor accepting infantry for extra power). Included for mod compatibility. When a `Plug` entity enters a `Pluggable` building, increment `current_plugs`, grant condition per plug (e.g., "+50 power per infantry in reactor").

---

