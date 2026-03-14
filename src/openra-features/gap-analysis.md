# Iron Curtain Gap Analysis

> **Purpose:** Cross-reference every OpenRA feature against Iron Curtain's design docs.
> Identify what's covered, what's partially covered, and what's completely missing.
> The goal: an OpenRA modder should feel **at home** — every concept they know has an equivalent.

## Coverage Legend

| Symbol | Meaning                                                                               |
| ------ | ------------------------------------------------------------------------------------- |
| ✅      | **Fully covered** — designed at equivalent or better detail than OpenRA               |
| ⚠️      | **Partially covered** — mentioned or implied, but not designed as a standalone system |
| ❌      | **Missing** — not addressed in any design doc; needs design work                      |
| 🔄      | **Different by design** — our architecture handles this differently (explained)       |

---

## 1. Trait System → ECS Components ✅ (structurally different, equivalent power)

**OpenRA:** ~130 C# trait classes attached to actors via MiniYAML. Modders compose actor behavior by listing traits.

**Iron Curtain:** Bevy ECS components attached to entities. Modders compose entity behavior by listing components in YAML. The `GameModule` trait registers components dynamically.

**Modder experience:** Nearly identical. Instead of:
```yaml
# OpenRA MiniYAML
rifle_infantry:
    Health:
        HP: 50
    Mobile:
        Speed: 56
    Armament:
        Weapon: M1Carbine
```
They write:
```yaml
# Iron Curtain YAML
rifle_infantry:
    health:
        current: 50
        max: 50
    mobile:
        speed: 56
        locomotor: foot
    combat:
        weapon: m1_carbine
```

**Gap:** Our design docs only map ~9 components (Health, Mobile, Attackable, Armament, Building, Buildable, Selectable, Harvester, LlmMeta). OpenRA has ~130 traits. Many are render traits (covered by Bevy), but the following gameplay traits need explicit ECS component designs — see the per-system analysis below.

---

## 2. Condition System ✅ DESIGNED (D028 — Phase 2 Hard Requirement)

**OpenRA:** 34 `GrantCondition*` traits. This is **the #1 modding tool**. Modders create dynamic behavior by granting/revoking named boolean conditions that enable/disable `ConditionalTrait`-based components.

Example: a unit becomes stealthed when stationary, gains a damage bonus when veterancy reaches level 2, deploys into a stationary turret — all done purely in YAML by composing condition traits.

```yaml
# OpenRA — no code needed for complex behaviors
Cloak:
    RequiresCondition: !moving
GrantConditionOnMovement:
    Condition: moving
GrantConditionOnDamageState:
    Condition: damaged
    ValidDamageStates: Critical
DamageMultiplier@CRITICAL:
    RequiresCondition: damaged
    Modifier: 150
```

**Iron Curtain status:** **Designed and scheduled as Phase 2 exit criterion (D028).** The condition system is a core modding primitive:
- `Conditions` component: `BTreeMap<ConditionId, u32>` (ref-counted named conditions per entity; `BTreeMap` per deterministic collection policy)
- Condition sources: `GrantConditionOnMovement`, `GrantConditionOnDamageState`, `GrantConditionOnDeploy`, `GrantConditionOnAttack`, `GrantConditionOnTerrain`, `GrantConditionOnVeterancy` — all exposed in YAML
- Condition consumers: any component field can declare `requires:` or `disabled_by:` conditions
- Runtime: systems check `conditions.is_active("deployed")` via fast bitset or hash lookup
- OpenRA trait names accepted as aliases (D023) — `GrantConditionOnMovement` works in IC YAML

**Design sketch:**
```yaml
# Iron Curtain equivalent
rifle_infantry:
    conditions:
        moving:
            granted_by: [on_movement]
        deployed:
            granted_by: [on_deploy]
        elite:
            granted_by: [on_veterancy, { level: 3 }]
    cloak:
        disabled_by: moving      # conditional — disabled when "moving" condition is active
    damage_multiplier:
        requires: deployed
        modifier: 1.5
```

ECS implementation: a `Conditions` component holding a `BTreeMap<ConditionId, u32>` (ref-counted; `BTreeMap` per deterministic collection policy — see D028). Systems check `conditions.is_active("deployed")`. YAML `disabled_by` / `requires` fields map to runtime condition checks.

---

## 3. Multiplier System ✅ DESIGNED (D028 — Phase 2 Hard Requirement)

**OpenRA:** ~20 multiplier traits that modify numeric values. All conditional. Modders stack multipliers from veterancy, terrain, crates, conditions, player handicaps.

| Multiplier                 | Affects         |
| -------------------------- | --------------- |
| `DamageMultiplier`         | Incoming damage |
| `FirepowerMultiplier`      | Outgoing damage |
| `SpeedMultiplier`          | Movement speed  |
| `RangeMultiplier`          | Weapon range    |
| `ReloadDelayMultiplier`    | Weapon reload   |
| `ProductionCostMultiplier` | Build cost      |
| `ProductionTimeMultiplier` | Build time      |
| `RevealsShroudMultiplier`  | Sight range     |
| ...                        | (20 total)      |

**Iron Curtain status:** **Designed and scheduled as Phase 2 exit criterion (D028).** The multiplier system:
- `StatModifiers` component: per-entity stack of `(source, stat, modifier_value, condition)` tuples
- Every numeric stat (speed, damage, range, reload, build time, cost, sight range) resolves through the modifier stack
- Modifiers from: veterancy, terrain, crates, conditions, player handicaps
- Fixed-point multiplication (no floats) — respects invariant #1
- YAML-configurable: modders add multipliers without code
- Integrates with condition system: multipliers can be conditional (`requires: elite`)

---

## 4. Projectile System ⚠️ PARTIAL

**OpenRA:** 8 projectile types (Bullet, Missile, LaserZap, Railgun, AreaBeam, InstantHit, GravityBomb, NukeLaunch) — each with distinct physics, rendering, and behavior.

**Iron Curtain status:** Weapons are mentioned (weapon definitions in YAML with range, damage, fire rate, AoE). But the **projectile** as a simulation entity with travel time, tracking, gravity, jinking, etc. is not designed.

**Gap:** Need to design:
- Projectile entity lifecycle (spawn → travel → impact → warhead application)
- Projectile types and their physics (ballistic arc, guided tracking, instant hit, beam)
- Projectile rendering (sprite, beam, trail, contrail)
- Missile guidance (homing, jinking, terrain following)

---

## 5. Warhead System ✅ DESIGNED (D028 — Phase 2 Hard Requirement)

**OpenRA:** 15 warhead types. Multiple warheads per weapon. Warheads define *what happens on impact* — damage, terrain modification, condition application, screen effects, resource creation/destruction.

**Iron Curtain status:** **Designed as part of the full damage pipeline in D028 (Phase 2 exit criterion).** The warhead system:
- Each weapon references one or more warheads — composable effects
- Warheads define: damage (with Versus table lookup), condition application, terrain effects, screen effects, resource modification
- Full pipeline: Armament → Projectile entity → travel → impact → Warhead(s) → Versus table → DamageMultiplier → Health
- Extensible via WASM for novel warhead types (WarpDamage, TintedCells, etc.)

Warheads are how modders create multi-effect weapons, percentage-based damage, condition-applying attacks, and terrain-modifying impacts.

---

## 6. Building System ⚠️ PARTIAL — MULTIPLE GAPS

**OpenRA has:**

| Feature                              | IC Status                                                         |
| ------------------------------------ | ----------------------------------------------------------------- |
| Building footprint / cell occupation | ✅ `Building { footprint }` component                              |
| Build radius / base expansion        | ✅ `BuildArea { range }` component                                 |
| Building placement preview           | ✅ Placement validation pipeline designed                          |
| Line building (walls)                | ✅ `LineBuild` marker component                                    |
| Primary building designation         | ✅ `PrimaryBuilding` marker component                              |
| Rally points                         | ✅ `RallyPoint { target: WorldPos }` component                     |
| Building exits (unit spawn points)   | ✅ `Exit { offsets }` component                                    |
| Sell mechanic                        | ✅ `Sellable { refund_percent, sell_time }` component              |
| Building repair                      | ✅ `Repairable { repair_rate, repair_cost_per_hp }` component      |
| Landing pad reservation              | ✅ Covered by docking system (`DockHost` with `DockType::Helipad`) |
| Gate (openable barriers)             | ✅ `Gate { open_delay, close_delay, state }` component             |
| Building transforms                  | ✅ `Transforms { into, delay }` component (MCV ↔ ConYard)          |

All building sub-systems designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Building Mechanics".

---

## 7. Power System ✅ DESIGNED

**OpenRA:** `Power` trait (provides/consumes), `PowerManager` (player-level tracking), `AffectedByPowerOutage` (buildings go offline), `ScalePowerWithHealth`, power bar in UI.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Power System":
- `Power { provides, consumes }` component per building
- `PowerManager` player-level resource (total capacity, total drain, low_power flag)
- `AffectedByPowerOutage` marker component — integrates with condition system (D028) to halve production and reduce defense fire rate
- `power_system()` runs as system #2 in the tick pipeline
- Power bar UI reads `PowerManager` from `ic-ui`

---

## 8. Support Powers / Superweapons ✅ DESIGNED

**OpenRA:** `SupportPowerManager`, `AirstrikePower`, `NukePower`, `ParatroopersPower`, `SpawnActorPower`, `GrantExternalConditionPower`, directional targeting.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Support Powers / Superweapons":
- `SupportPower { charge_time, current_charge, ready, targeting }` component per building
- `SupportPowerManager` player-level tracking
- `TargetingMode` enum: `Point`, `Area { radius }`, `Directional`
- `support_power_system()` runs as system #6 in the tick pipeline
- Activation via player order → sim validates ownership + readiness → applies warheads/effects at target
- Power types are data-driven (YAML `Named(String)`) — extensible for custom powers via Lua/WASM

---

## 9. Transport / Cargo System ✅ DESIGNED

**OpenRA:** `Cargo` (carries passengers), `Passenger` (can be carried), `Carryall` (air transport), `ParaDrop`, `EjectOnDeath`, `EntersTunnels`.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Transport / Cargo":
- `Cargo { max_weight, current_weight, passengers, unload_delay }` component
- `Passenger { weight, custom_pip }` component
- `Carryall { carry_target }` for air transport
- `EjectOnDeath` marker, `ParaDrop { drop_interval }` for paradrop capability
- Load/unload order processing in `apply_orders()` → `movement_system()` handles approach → add/remove from world

---

## 10. Capture / Ownership System ✅ DESIGNED

**OpenRA:** `Capturable`, `Captures`, `ProximityCapturable`, `CaptureManager`, capture progress bar, `TransformOnCapture`, `TemporaryOwnerManager`.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Capture / Ownership":
- `Capturable { capture_types, capture_threshold, current_progress, capturing_entity }` component
- `Captures { speed, capture_type, consumed }` component (engineer consumed on capture for RA1)
- `CaptureType` enum: `Infantry`, `Proximity`
- `capture_system()` runs as system #12 in tick pipeline
- Ownership transfer on threshold reached, progress reset on interruption

---

## 11. Stealth / Detection System ✅ DESIGNED

**OpenRA:** `Cloak`, `DetectCloaked`, `IgnoresCloak`, `IgnoresDisguise`, `RevealOnFire`.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Stealth / Cloak":
- `Cloak { cloak_delay, cloak_types, ticks_since_action, is_cloaked, reveal_on_fire, reveal_on_move }` component
- `DetectCloaked { range, detect_types }` component
- `CloakType` enum: `Stealth`, `Underwater`, `Disguise`, `GapGenerator`
- `cloak_system()` runs as system #13 in tick pipeline
- Fog integration: cloaked entities hidden from enemy unless `DetectCloaked` in range

---

## 12. Crate System ✅ DESIGNED

**OpenRA:** 13 crate action types — cash, units, veterancy, heal, map reveal, explosions, conditions.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Crate System":
- `Crate { action_pool }` entity with weighted random actions
- `CrateAction` enum: `Cash`, `Unit`, `Heal`, `LevelUp`, `MapReveal`, `Explode`, `Cloak`, `Speed`
- `CrateSpawner` world-level system (max count, spawn interval, spawn area)
- `crate_system()` runs as system #17 in tick pipeline
- Crate tables fully configurable in YAML for modders

---

## 13. Veterancy / Experience System ✅ DESIGNED

**OpenRA:** `GainsExperience`, `GivesExperience`, `ProducibleWithLevel`, `ExperienceTrickler`, XP multipliers. Veterancy grants conditions which enable multipliers — deeply integrated with the condition system.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Veterancy / Experience":
- `GainsExperience { current_xp, level, thresholds, level_conditions }` component
- `GivesExperience { value }` component (XP awarded to killer)
- `VeterancyLevel` enum: `Rookie`, `Veteran`, `Elite`, `Heroic`
- `veterancy_system()` runs as system #15 in tick pipeline
- XP earned from kills (based on victim's `GivesExperience.value`)
- Level-up grants conditions → triggers multipliers (veteran = +25% firepower/armor, elite = +50% + self-heal, heroic = +75% + faster fire)
- All values YAML-configurable, not hardcoded
- Campaign carry-over: XP and level are part of the roster snapshot (D021)

---

## 14. Damage Model ✅ DESIGNED

**OpenRA damage flow:**
```
Armament → fires → Projectile → travels → hits → Warhead(s) applied
    → target validity check (target types, stances)
    → spread damage with falloff
    → armor type lookup (Versus table)
    → DamageMultiplier traits
    → Health reduced
```

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Full Damage Pipeline (D028)":
- `Projectile` entity with `ProjectileType` enum: `Bullet` (hitscan), `Missile` (homing), `Ballistic` (arcing), `Beam` (continuous)
- `WarheadDef` with `VersusTable` (ArmorType × WarheadType → damage percentage), `spread`, `falloff` curves
- `projectile_system()` runs as system #11 in tick pipeline
- Full chain: Armament fires → Projectile entity spawned → projectile advances → hit detection → warheads applied → Versus table → DamageMultiplier conditions → Health reduced
- YAML weapon definitions use OpenRA-compatible format (weapon → projectile → warhead)

---

## 15. Death & Destruction Mechanics ✅ DESIGNED

**OpenRA:** `SpawnActorOnDeath` (husks, pilots), `ShakeOnDeath`, `ExplosionOnDamageTransition`, `FireWarheadsOnDeath`, `KillsSelf` (timed self-destruct), `EjectOnDeath`, `MustBeDestroyed` (victory condition).

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Death Mechanics":
- `SpawnOnDeath { actor_type, probability }` — spawn husks, eject pilots
- `ExplodeOnDeath { warheads }` — explosion on destruction
- `SelfDestruct { timer, warheads }` — timed self-destruct (demo trucks, C4)
- `DamageStates { thresholds }` with `DamageState` enum: `Undamaged`, `Light`, `Medium`, `Heavy`, `Critical`
- `MustBeDestroyed` — victory condition marker
- `death_system()` runs as system #16 in tick pipeline

---

## 16. Docking System ✅ DESIGNED

**OpenRA:** `DockHost` (refinery, repair pad, helipad), `DockClientBase`/`DockClientManager` (harvesters, aircraft).

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Docking System":
- `DockHost { dock_type, dock_position, queue, occupied }` component
- `DockClient { dock_type }` component
- `DockType` enum: `Refinery`, `Helipad`, `RepairPad`
- `docking_system()` runs as system #5 in tick pipeline
- Queue management (one unit docks at a time, others wait)
- Dock assignment (nearest available `DockHost` of matching type)

---

## 17. Palette System ✅ DESIGNED

**OpenRA:** 13 palette source types + 9 palette effect types. Runtime palette manipulation for player colors, cloak shimmer, screen flash, palette rotation (water animation).

**Iron Curtain status:** Fully designed across `ra-formats` (`.pal` loading) and `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Palette Effects":
- `PaletteEffect` enum: `Flash`, `FadeToBlack/White`, `Tint`, `CycleRange`, `PlayerRemap`
- Player color remapping via `PlayerRemap` (faction colors on units)
- Palette rotation animation (`CycleRange` for water, ore sparkle)
- Cloak shimmer via `Tint` effect + transparency
- Screen flash (nuke, chronoshift) via `Flash` effect
- Modern shader equivalents via Bevy's material system — modder-facing YAML config is identical regardless of render backend

---

## 18. Radar / Minimap System ⚠️ PARTIAL

**OpenRA:** `AppearsOnRadar`, `ProvidesRadar`, `RadarColorFromTerrain`, `RadarPings`, `RadarWidget`.

**Iron Curtain status:** Minimap mentioned in Phase 3 sidebar. "Radar as multi-mode display" is an innovative addition. But the underlying systems aren't designed:
- Which units appear on radar? (controlled by `AppearsOnRadar`)
- `ProvidesRadar` — radar only works when a radar building exists
- Radar pings (alert markers)
- Radar rendering (terrain colors, unit dots, fog overlay)

---

## 19. Infantry Mechanics ✅ DESIGNED

**OpenRA:** `WithInfantryBody` (sub-cell positioning — 5 infantry share one cell), `ScaredyCat` (panic flee), `TakeCover` (prone behavior), `TerrainModifiesDamage` (infantry in cover).

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Infantry Mechanics":
- `InfantryBody { sub_cell }` with `SubCell` enum: `Center`, `TopLeft`, `TopRight`, `BottomLeft`, `BottomRight` (5 per cell)
- `ScaredyCat { flee_range, panic_ticks }` — panic flee behavior
- `TakeCover { damage_modifier, speed_modifier, prone_delay }` — prone/cover behavior
- `movement_system()` handles sub-cell slot assignment when infantry enters a cell
- Prone auto-triggers on attack via condition system ("prone" condition → `DamageMultiplier` of 50%)

---

## 20. Mine System ✅ DESIGNED

**OpenRA:** `Mine`, `Minelayer`, mine detonation on contact.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Mine System":
- `Mine { trigger_types, warhead, visible_to_owner }` component
- `Minelayer { mine_type, lay_delay }` component
- `mine_system()` runs as system #9 in tick pipeline
- Mines invisible to enemy unless detected (uses `DetectCloaked` with `CloakType::Stealth`)
- Mine placement via player order

---

## 21. Guard Command ✅ DESIGNED

**OpenRA:** `Guard`, `Guardable` — unit follows and protects a target, engaging threats within range.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Guard Command":
- `Guard { target, leash_range }` behavior component
- `Guardable` marker component
- Guard order processing in `apply_orders()`
- `combat_system()` integration: guarding units auto-engage attackers of their guarded target within leash range

---

## 22. Crush Mechanics ✅ DESIGNED

**OpenRA:** `Crushable`, `AutoCrusher` — vehicles crush infantry, walls.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Crush Mechanics":
- `Crushable { crush_class }` with `CrushClass` enum: `Infantry`, `Wall`, `Hedgehog`
- `Crusher { crush_classes }` component for vehicles
- `crush_system()` runs as system #8 in tick pipeline (after `movement_system()`)
- Checks spatial index at new position for matching `Crushable` entities, applies instant kill

---

## 23. Demolition Mechanics ✅ DESIGNED

**OpenRA:** `Demolition`, `Demolishable` — C4 charges on buildings.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Demolition / C4":
- `Demolition { delay, warhead, required_target }` component
- Engineer places C4 → countdown → warhead detonates → building takes massive damage
- Engineer consumed on placement

---

## 24. Plug System ✅ DESIGNED

**OpenRA:** `Plug`, `Pluggable` — actors that plug into buildings (e.g., bio-reactor accepting infantry for power).

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Plug System":
- `Pluggable { plug_type, max_plugs, current_plugs, effect_per_plug }` component
- `Plug { plug_type }` component
- Plug entry grants condition per plug (e.g., "+50 power per infantry in reactor")
- Primarily RA2 mechanic, included for mod compatibility

---

## 25. Transform Mechanics ✅ DESIGNED

**OpenRA:** `Transforms` — actor transforms into another type (MCV ↔ Construction Yard, siege tank deploy/undeploy).

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Transform / Deploy":
- `Transforms { into, delay, facing, condition }` component
- `transform_system()` runs as system #18 in tick pipeline
- Deploy and undeploy orders in `apply_orders()`
- Grants conditions on deploy (e.g., MCV → ConYard, siege tank → deployed mode)
- Facing check — unit must face correct direction before transforming

---

## 26. Notification System ✅ DESIGNED

**OpenRA:** `ActorLostNotification` ("Unit lost"), `AnnounceOnSeen` ("Enemy unit spotted"), `DamageNotifier` ("Our base is under attack"), `HarvesterAttackNotifier`, `ResourceStorageWarning` ("Silos needed"), `StartGameNotification`, `CaptureNotification`.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Notification System":
- `NotificationType` enum with variants: `UnitLost`, `BaseUnderAttack`, `HarvesterUnderAttack`, `SilosNeeded`, `BuildingCaptured`, `EnemySpotted`, `LowPower`, `BuildingComplete`, `UnitReady`, `InsufficientFunds`, `NuclearLaunchDetected`, `ReinforcementsArrived`
- `NotificationCooldowns { cooldowns, default_cooldown }` resource — per-type cooldown to prevent spam
- `notification_system()` runs as system #20 in tick pipeline
- `ic-audio` EVA engine consumes notification events (event → audio file mapping)
- Text notifications rendered by `ic-ui`

---

## 27. Cursor System ✅ DESIGNED

**OpenRA:** Contextual cursors — different cursor sprites for move, attack, capture, enter, deploy, sell, repair, chronoshift, nuke, etc.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Cursor System":
- YAML-defined cursor set with `name`, `sprite`, `hotspot`, `sequence`
- `CursorProvider` resource tracking current cursor based on hover context
- Built-in cursors: `default`, `move`, `attack`, `force_attack`, `capture`, `enter`, `deploy`, `sell`, `repair`, `chronoshift`, `nuke`, `harvest`, `c4`, `garrison`, `guard`, `patrol`, `waypoint`
- Force-modifier cursors activated by holding Ctrl/Alt (force-fire on ground, force-move through obstacles)
- Cursor resolution logic: selected units' abilities × hovered target → choose appropriate cursor

---

## 28. Hotkey System ✅ DESIGNED

**OpenRA:** 8 hotkey config files. Fully rebindable. Categories: common, player, production, control-groups, observer, chat, music, map creation.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Hotkey System":
- `HotkeyConfig` with categories: `Unit`, `Production`, `ControlGroup`, `Camera`, `Chat`, `Debug`, `Observer`, `Music`, `Editor`
- Default profiles: Classic RA, OpenRA, Modern RTS — selectable in settings
- Fully rebindable via settings UI
- Abstracted behind `InputSource` trait (D010 platform-agnostic) — gamepad/touch supported

---

## 29. Lua Scripting API ✅ DESIGNED (D024 — Strict Superset)

**OpenRA:** 16 global APIs + 34 actor property groups = comprehensive mission scripting.

**Iron Curtain status:** **Lua API is a strict superset of OpenRA's (D024).** All 16 OpenRA globals (`Actor`, `Map`, `Trigger`, `Media`, `Player`, `Reinforcements`, `Camera`, `DateTime`, `Objectives`, `Lighting`, `UserInterface`, `Utils`, `Beacon`, `Radar`, `HSLColor`, `WDist`) are supported with identical function signatures and return types. OpenRA Lua missions run unmodified.

IC extends with additional globals: `Campaign` (D021 branching campaigns), `Weather` (D022 dynamic weather), `Workshop` (mod queries), `LLM` (Phase 7 integration).

Each actor reference exposes properties matching its components (`.Health`, `.Location`, `.Owner`, `.Move()`, `.Attack()`, `.Stop()`, `.Guard()`, `.Deploy()`, etc.) — identical to OpenRA's actor property groups.

---

## 30. Map Editor ✅ RESOLVED (D038 + D040)

**OpenRA:** Full in-engine map editor with actor placement, terrain painting, resource placement, tile editing, undo/redo, script cell triggers, marker layers, road/path tiling tool.

**Iron Curtain status:** Resolved as D038+D040 — SDK scenario editor & asset studio (OFP/Eden-inspired). Ships as part of the IC SDK (separate application from the game). Goes beyond OpenRA's map editor to include full mission logic editing: triggers with countdown/timeout timers and min/mid/max randomization, waypoints, pre-built modules (wave spawner, patrol route, guard position, reinforcements, objectives), visual connection lines, Probability of Presence per entity for replayability, compositions (reusable prefabs), layers, Simple/Advanced mode toggle, Test button, Game Master mode, Workshop publishing. The asset studio (D040) adds visual browsing, editing, and generation of game assets (sprites, palettes, terrain, chrome). See `decisions/09f/D038-scenario-editor.md` and `decisions/09f/D040-asset-studio.md` for full design.

---

## 31. Debug / Developer Tools ✅ DESIGNED

**OpenRA:** `DeveloperMode` (instant build, give cash, unlimited power, build anywhere), combat debug overlay, pathfinder overlay, actor map overlay, performance graph, asset browser.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Debug / Developer Tools":
- DeveloperMode flags: `instant_build`, `free_units`, `reveal_map`, `unlimited_power`, `invincibility`, `path_debug`, `combat_debug`
- Debug overlays via `bevy_egui`: weapon ranges, target lines, pathfinder visualization (JPS paths, flow field tiles, sector graph), path costs, damage numbers, spatial index grid
- Performance profiler: per-system tick time, entity count, memory usage, ECS archetype stats
- Asset browser panel: preview sprites with palette application, play sounds, inspect YAML definitions
- All debug features compile-gated behind `#[cfg(feature = "dev-tools")]` — zero cost in release builds

---

## 32. Selection System ✅ DESIGNED

**OpenRA:** `Selection`, `Selectable` (bounds, priority, voice), `IsometricSelectable`, `ControlGroups`, selection decorations, double-click select-all-of-type, tab cycling.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Selection Details":
- `Selectable { bounds, priority, voice_set }` component with `SelectionPriority` enum (`Combat`, `Support`, `Harvester`, `Building`, `Misc`)
- Priority-based selection: when box covers mixed types, prefer higher-priority (Combat > Harvester)
- Double-click: select all visible units of same type owned by same player
- Ctrl+click: add/remove from selection
- Tab cycling: rotate through unit types within selection
- Control groups: Ctrl+1..9 to assign, 1..9 to recall, double-tap to center camera
- Selection limit: configurable (default 40) — excess units excluded by distance from box center
- Isometric diamond selection boxes for proper 2.5D feel

---

## 33. Observer / Spectator System ✅ DESIGNED

**OpenRA:** Observer widgets for army composition, production tracking, superweapon timers, strategic progress score.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Observer / Spectator UI":
- Observer overlay panels: Army composition, production queues, economy (income/stockpile), support power timers
- `ObserverState { followed_player, show_overlays }` resource
- Player switching: cycle through players or view "god mode" (all players visible)
- Broadcast delay: configurable (default 3 minutes for competitive, 0 for casual)
- Strategic score tracker: army value, buildings, income rate, kills/losses
- Tournament mode: relay-certified results + server-side replay archive

---

## 34. Game Speed System ✅ DESIGNED

**OpenRA:** 6 game speed presets (Slowest 80ms → Fastest 20ms). Configurable in lobby.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Game Speed":
- `SpeedPreset` enum: `Slowest` (80ms), `Slower` (67ms, default), `Normal` (50ms), `Faster` (35ms), `Fastest` (20ms)
- Lobby-configurable; speed affects tick interval only (systems run identically at any speed)
- Single-player: speed adjustable at runtime via hotkey (+ / −)
- Pause support in single-player

---

## 35. Faction System ✅ DESIGNED

**OpenRA:** `Faction` trait (name, internal name, side). Factions determine tech trees, unit availability, starting configurations.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Faction System":
- `Faction { id, display_name, side, color_default, tech_tree }` YAML-defined
- `Side` grouping (e.g., `allies` contains England/France/Germany subfactions in RA)
- Faction → available `Buildable` items via `tech_tree` (list of unlockable actor IDs)
- Faction → starting units configuration (map-defined or mod-default)
- Lobby faction selection with random option
- RA2+ subfaction support: each subfaction gets unique units/abilities while sharing the side's base roster

---

## 36. Replay Browser ⚠️ PARTIAL

**OpenRA:** Full replay browser with filtering (by map, players, date), sorting, metadata display, replay playback with speed control.

**Iron Curtain status:** `ReplayPlayback` NetworkModel designed. Signed replays with hash chains. But the **replay browser UI** and metadata storage aren't designed.

---

## 37. Encyclopedia / Asset Browser ✅ DESIGNED

**OpenRA:** In-game encyclopedia with unit descriptions, stats, and previews. Asset browser for modders to preview sprites, sounds, videos.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Encyclopedia":
- In-game encyclopedia with categories: Units, Structures, Weapons, Abilities, Terrain
- Each entry: name, description, sprite preview, stats table (HP, speed, cost, damage, range), prerequisite tree
- Populated from YAML definitions + `llm:` metadata when present
- Filtered by faction, searchable
- Asset browser is part of IC SDK (D040) — visual browsing/editing of sprites, palettes, terrain, sounds with format-aware import/export

---

## 38. Procedural Map Generation ⚠️ PARTIAL

**OpenRA:** `ClassicMapGenerator` (38KB) — procedural map generation with terrain types, resource placement, spawn points.

**Iron Curtain status:** Not explicitly designed as a standalone system, though multiple D038 features partially address this: game mode templates provide pre-configured map layouts, compositions provide reusable building blocks that could be randomly assembled, and the Probability of Presence system creates per-entity randomization. LLM-generated missions (Phase 7) provide full procedural generation when a provider is configured. A dedicated procedural map generator (terrain + resource placement + spawn balancing) is a natural Phase 7 addition to the scenario editor.

---

## 39. Localization / i18n ✅ DESIGNED

**OpenRA:** `FluentMessages` section in mod manifest — full localization support using Project Fluent.

**Iron Curtain status:** Fully designed in `02-ARCHITECTURE.md` § "Extended Gameplay Systems — Localization Framework":
- Fluent-based (.ftl files) for parameterized messages and plural rules
- `Localization { current_locale, bundles }` resource
- String keys in YAML reference `fluent:key.name` — resolved at load time
- Mods provide their own `.ftl` translation files
- CJK/RTL font support via Bevy's font pipeline
- Language selection in settings UI
