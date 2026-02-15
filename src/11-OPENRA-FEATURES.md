# OpenRA Engine — Comprehensive Feature Reference

> **Purpose:** Exhaustive catalog of every feature the OpenRA engine provides to modders and game developers.
> Sourced directly from the OpenRA/OpenRA GitHub repository (C#/.NET).
> Organized by category for Iron Curtain design reference.

---

## 1. Trait System (Actor Component Architecture)

OpenRA's core architecture uses a **trait system** — essentially a component-entity model. Every actor (unit, building, prop) is defined by composing traits in YAML. Each trait is a C# class implementing one or more interfaces. Traits attach to actors, players, or the world.

### Core Trait Infrastructure
- **TraitsInterfaces** — Master file defining all trait interfaces (`ITraitInfo`, `IOccupySpace`, `IPositionable`, `IMove`, `IFacing`, `IHealth`, `INotifyCreated`, `INotifyDamage`, `INotifyKilled`, `IWorldLoaded`, `ITick`, `IRender`, `IResolveOrder`, `IOrderVoice`, etc.)
- **ConditionalTrait** — Base class enabling traits to be enabled/disabled by conditions
- **PausableConditionalTrait** — Conditional trait that can also be paused
- **Target** — Represents a target for orders/attacks (actor, terrain position, frozen actor)
- **ActivityUtils** — Utilities for the activity (action queue) system
- **LintAttributes** — Compile-time validation attributes for trait definitions

### General Actor Traits (~130+ traits)
| Trait                 | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `Health`              | Hit points (current, max), damage state tracking |
| `Armor`               | Armor type for damage calculation                |
| `Mobile`              | Movement capability, speed, locomotor reference  |
| `Immobile`            | Cannot move (buildings, props)                   |
| `Selectable`          | Can be selected by player                        |
| `IsometricSelectable` | Selection for isometric maps                     |
| `Interactable`        | Can be interacted with                           |
| `Tooltip`             | Name shown on hover                              |
| `TooltipDescription`  | Extended description text                        |
| `Valued`              | Cost in credits                                  |
| `Voiced`              | Has voice lines                                  |
| `Buildable`           | Can be produced (cost, time, prerequisites)      |
| `Encyclopedia`        | In-game encyclopedia entry                       |
| `MapEditorData`       | Data for map editor display                      |
| `ScriptTags`          | Tags for Lua scripting identification            |

### Combat Traits
| Trait                | Purpose                                 |
| -------------------- | --------------------------------------- |
| `Armament`           | Weapon mount (weapon, cooldown, barrel) |
| `AttackBase`         | Base attack logic                       |
| `AttackFollow`       | Attack while following target           |
| `AttackFrontal`      | Attack only from front arc              |
| `AttackOmni`         | Attack in any direction                 |
| `AttackTurreted`     | Attack using turret                     |
| `AttackCharges`      | Attack with charge mechanic             |
| `AttackGarrisoned`   | Attack from inside garrison             |
| `AutoTarget`         | Automatic target acquisition            |
| `AutoTargetPriority` | Priority for auto-targeting             |
| `Turreted`           | Has rotatable turret                    |
| `AmmoPool`           | Ammunition system                       |
| `ReloadAmmoPool`     | Ammo reload behavior                    |
| `Rearmable`          | Can rearm at specific buildings         |
| `BlocksProjectiles`  | Blocks projectile passage               |
| `JamsMissiles`       | Missile jamming capability              |
| `HitShape`           | Collision shape for hit detection       |
| `Targetable`         | Can be targeted by weapons              |
| `RevealOnFire`       | Reveals when firing                     |

### Movement & Positioning
| Trait                         | Purpose                                    |
| ----------------------------- | ------------------------------------------ |
| `Mobile`                      | Ground movement (speed, locomotor)         |
| `Aircraft`                    | Air movement (altitude, VTOL, speed, turn) |
| `AttackAircraft`              | Air-to-ground attack patterns              |
| `AttackBomber`                | Bombing run behavior                       |
| `FallsToEarth`                | Crash behavior when killed                 |
| `BodyOrientation`             | Physical orientation of actor              |
| `QuantizeFacingsFromSequence` | Snap facings to sprite frames              |
| `Wanders`                     | Random wandering movement                  |
| `AttackMove`                  | Attack-move command support                |
| `AttackWander`                | Attack while wandering                     |
| `TurnOnIdle`                  | Turn to face direction when idle           |
| `Husk`                        | Wreck/corpse behavior                      |

### Transport & Cargo
| Trait                | Purpose                         |
| -------------------- | ------------------------------- |
| `Cargo`              | Can carry passengers            |
| `Passenger`          | Can be carried                  |
| `Carryall`           | Air transport (pick up & carry) |
| `Carryable`          | Can be picked up by carryall    |
| `AutoCarryall`       | Automatic carryall dispatch     |
| `AutoCarryable`      | Can be auto-carried             |
| `CarryableHarvester` | Harvester carryall integration  |
| `ParaDrop`           | Paradrop passengers             |
| `Parachutable`       | Can use parachute               |
| `EjectOnDeath`       | Eject pilot on destruction      |
| `EntersTunnels`      | Can use tunnel network          |
| `TunnelEntrance`     | Tunnel entry point              |

### Economy & Harvesting
| Trait                        | Purpose                                      |
| ---------------------------- | -------------------------------------------- |
| `Harvester`                  | Resource gathering (capacity, resource type) |
| `StoresResources`            | Local resource storage                       |
| `StoresPlayerResources`      | Player-wide resource storage                 |
| `SeedsResource`              | Creates resources on map                     |
| `CashTrickler`               | Periodic cash generation                     |
| `AcceptsDeliveredCash`       | Receives cash deliveries                     |
| `DeliversCash`               | Delivers cash to target                      |
| `AcceptsDeliveredExperience` | Receives experience deliveries               |
| `DeliversExperience`         | Delivers experience to target                |
| `GivesBounty`                | Awards cash on kill                          |
| `GivesCashOnCapture`         | Awards cash when captured                    |
| `CustomSellValue`            | Override sell price                          |

### Stealth & Detection
| Trait             | Purpose                      |
| ----------------- | ---------------------------- |
| `Cloak`           | Invisibility system          |
| `DetectCloaked`   | Reveals cloaked units        |
| `IgnoresCloak`    | Can target cloaked units     |
| `IgnoresDisguise` | Sees through disguises       |
| `AffectsShroud`   | Base for shroud/fog traits   |
| `CreatesShroud`   | Creates shroud around actor  |
| `RevealsShroud`   | Reveals shroud (sight range) |
| `RevealsMap`      | Reveals entire map           |
| `RevealOnDeath`   | Reveals area on death        |

### Capture & Ownership
| Trait                       | Purpose                        |
| --------------------------- | ------------------------------ |
| `Capturable`                | Can be captured                |
| `CapturableProgressBar`     | Shows capture progress         |
| `CapturableProgressBlink`   | Blinks during capture          |
| `CaptureManager`            | Manages capture state          |
| `CaptureProgressBar`        | Progress bar for capturer      |
| `Captures`                  | Can capture targets            |
| `ProximityCapturable`       | Captured by proximity          |
| `ProximityCaptor`           | Captures by proximity          |
| `RegionProximityCapturable` | Region-based proximity capture |
| `TemporaryOwnerManager`     | Temporary ownership changes    |
| `TransformOnCapture`        | Transform when captured        |

### Destruction & Death
| Trait                         | Purpose                       |
| ----------------------------- | ----------------------------- |
| `KillsSelf`                   | Self-destruct timer           |
| `SpawnActorOnDeath`           | Spawn actor when killed       |
| `SpawnActorsOnSell`           | Spawn actors when sold        |
| `ShakeOnDeath`                | Screen shake on death         |
| `ExplosionOnDamageTransition` | Explode at damage thresholds  |
| `FireWarheadsOnDeath`         | Apply warheads on death       |
| `FireProjectilesOnDeath`      | Fire projectiles on death     |
| `FireWarheads`                | General warhead application   |
| `MustBeDestroyed`             | Must be destroyed for victory |
| `OwnerLostAction`             | Behavior when owner loses     |

### Miscellaneous Actor Traits
| Trait                     | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `AutoCrusher`             | Automatically crushes crushable actors   |
| `Crushable`               | Can be crushed by vehicles               |
| `TransformCrusherOnCrush` | Transform crusher on crush               |
| `DamagedByTerrain`        | Takes terrain damage                     |
| `ChangesHealth`           | Health change over time                  |
| `ChangesTerrain`          | Modifies terrain type                    |
| `Demolishable`            | Can be demolished                        |
| `Demolition`              | Can demolish buildings                   |
| `Guard`                   | Guard command support                    |
| `Guardable`               | Can be guarded                           |
| `Huntable`                | Can be hunted by AI                      |
| `InstantlyRepairable`     | Can be instantly repaired                |
| `InstantlyRepairs`        | Can instantly repair                     |
| `Mine`                    | Land mine                                |
| `Minelayer`               | Can lay mines                            |
| `Plug`                    | Plugs into pluggable (e.g., bio-reactor) |
| `Pluggable`               | Accepts plug actors                      |
| `Replaceable`             | Can be replaced by Replacement           |
| `Replacement`             | Replaces a Replaceable actor             |
| `RejectsOrders`           | Ignores player commands                  |
| `Sellable`                | Can be sold                              |
| `Transforms`              | Can transform into another actor         |
| `ThrowsParticle`          | Emits particle effects                   |
| `CommandBarBlacklist`     | Excluded from command bar                |
| `AppearsOnMapPreview`     | Visible in map preview                   |
| `Repairable`              | Can be sent for repair                   |
| `RepairableNear`          | Can be repaired when nearby              |
| `RepairsUnits`            | Repairs nearby units                     |
| `RepairsBridges`          | Can repair bridges                       |
| `UpdatesDerrickCount`     | Tracks oil derrick count                 |
| `CombatDebugOverlay`      | Debug combat visualization               |
| `ProducibleWithLevel`     | Produced with veterancy level            |
| `RequiresSpecificOwners`  | Only specific owners can use             |

---

## 2. Building System

### Building Traits
| Trait                   | Purpose                                     |
| ----------------------- | ------------------------------------------- |
| `Building`              | Base building trait (footprint, dimensions) |
| `BuildingInfluence`     | Building cell occupation tracking           |
| `BaseBuilding`          | Base expansion flag                         |
| `BaseProvider`          | Provides base build radius                  |
| `GivesBuildableArea`    | Enables building placement nearby           |
| `RequiresBuildableArea` | Requires buildable area for placement       |
| `PrimaryBuilding`       | Can be set as primary                       |
| `RallyPoint`            | Production rally point                      |
| `Exit`                  | Unit exit points                            |
| `Reservable`            | Landing pad reservation                     |
| `Refinery`              | Resource delivery point                     |
| `RepairableBuilding`    | Can be repaired by player                   |
| `Gate`                  | Openable gate                               |

### Building Placement
| Trait                              | Purpose                            |
| ---------------------------------- | ---------------------------------- |
| `ActorPreviewPlaceBuildingPreview` | Actor preview during placement     |
| `FootprintPlaceBuildingPreview`    | Footprint overlay during placement |
| `SequencePlaceBuildingPreview`     | Sequence-based placement preview   |
| `PlaceBuildingVariants`            | Multiple placement variants        |
| `LineBuild`                        | Line-building (walls)              |
| `LineBuildNode`                    | Node for line-building             |
| `MapBuildRadius`                   | Controls build radius rules        |

### Bridge System
| Trait                       | Purpose                     |
| --------------------------- | --------------------------- |
| `Bridge`                    | Bridge segment              |
| `BridgeHut`                 | Bridge repair hut           |
| `BridgePlaceholder`         | Bridge placeholder          |
| `BridgeLayer`               | World bridge management     |
| `GroundLevelBridge`         | Ground-level bridge         |
| `LegacyBridgeHut`           | Legacy bridge support       |
| `LegacyBridgeLayer`         | Legacy bridge management    |
| `ElevatedBridgeLayer`       | Elevated bridge system      |
| `ElevatedBridgePlaceholder` | Elevated bridge placeholder |

### Building Transforms
| Trait                             | Purpose                  |
| --------------------------------- | ------------------------ |
| `TransformsIntoAircraft`          | Building → aircraft      |
| `TransformsIntoDockClientManager` | Building → dock client   |
| `TransformsIntoEntersTunnels`     | Building → tunnel user   |
| `TransformsIntoMobile`            | Building → mobile unit   |
| `TransformsIntoPassenger`         | Building → passenger     |
| `TransformsIntoRepairable`        | Building → repairable    |
| `TransformsIntoTransforms`        | Building → transformable |

### Docking System
| Trait               | Purpose                                            |
| ------------------- | -------------------------------------------------- |
| `DockClientBase`    | Base for dock clients (harvesters, etc.)           |
| `DockClientManager` | Manages dock client behavior                       |
| `DockHost`          | Building that accepts docks (refinery, repair pad) |

---

## 3. Production System

### Production Traits
| Trait                            | Purpose                                      |
| -------------------------------- | -------------------------------------------- |
| `Production`                     | Base production capability                   |
| `ProductionQueue`                | Standard production queue (base class, 25KB) |
| `ClassicProductionQueue`         | C&C-style single queue per type              |
| `ClassicParallelProductionQueue` | Parallel production (RA2 style)              |
| `ParallelProductionQueue`        | Modern parallel production                   |
| `BulkProductionQueue`            | Bulk production variant                      |
| `ProductionQueueFromSelection`   | Queue from selected factory                  |
| `ProductionAirdrop`              | Air-delivered production                     |
| `ProductionBulkAirDrop`          | Bulk airdrop production                      |
| `ProductionFromMapEdge`          | Units arrive from map edge                   |
| `ProductionParadrop`             | Paradrop production                          |
| `FreeActor`                      | Spawns free actors                           |
| `FreeActorWithDelivery`          | Spawns free actors with delivery animation   |

**Production model diversity across mods:** Analysis of six major OpenRA community mods (see `research/openra-mod-architecture-analysis.md`) reveals that production is one of the most varied mechanics across RTS games — even the 13 traits above only cover the C&C family. Community mods demonstrate at least five fundamentally different production models:

| Model                 | Mod                     | IC Implication                                                                                 |
| --------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| Global sidebar queue  | RA1, TD (OpenRA core)   | `ClassicProductionQueue` — IC's RA1 default                                                    |
| Tabbed parallel queue | RA2, Romanovs-Vengeance | `ClassicParallelProductionQueue` — one queue per factory                                       |
| Per-building on-site  | OpenKrush (KKnD)        | Replaced `ProductionQueue` entirely with custom `SelfConstructing` + per-building rally points |
| Single-unit selection | d2 (Dune II)            | No queue at all — select building, click one unit, wait                                        |
| Colony-based          | OpenSA (Swarm Assault)  | Capture colony buildings for production; no construction yard, no sidebar                      |

IC must treat production as a game-module concern, not an engine assumption. The `ProductionQueue` component is defined by the game module, not the engine core (see `02-ARCHITECTURE.md` § "Production Model Diversity").

### Prerequisite System
| Trait                                 | Purpose                             |
| ------------------------------------- | ----------------------------------- |
| `TechTree`                            | Tech tree management                |
| `ProvidesPrerequisite`                | Building provides prerequisite      |
| `ProvidesTechPrerequisite`            | Provides named tech prerequisite    |
| `GrantConditionOnPrerequisiteManager` | Manager for prerequisite conditions |
| `LobbyPrerequisiteCheckbox`           | Lobby toggle for prerequisites      |

---

## 4. Condition System (~34 traits)

The condition system is OpenRA's primary mechanism for dynamic behavior modification. Conditions are boolean flags that enable/disable conditional traits.

| Trait                                | Purpose                                   |
| ------------------------------------ | ----------------------------------------- |
| `ExternalCondition`                  | Receives conditions from external sources |
| `GrantCondition`                     | Always grants a condition                 |
| `GrantConditionOnAttack`             | Condition on attacking                    |
| `GrantConditionOnBotOwner`           | Condition when AI-owned                   |
| `GrantConditionOnClientDock`         | Condition when docked (client)            |
| `GrantConditionOnCombatantOwner`     | Condition when combatant owns             |
| `GrantConditionOnDamageState`        | Condition at damage thresholds            |
| `GrantConditionOnDeploy`             | Condition when deployed                   |
| `GrantConditionOnFaction`            | Condition for specific factions           |
| `GrantConditionOnHealth`             | Condition at health thresholds            |
| `GrantConditionOnHostDock`           | Condition when docked (host)              |
| `GrantConditionOnLayer`              | Condition on specific layer               |
| `GrantConditionOnLineBuildDirection` | Condition by wall direction               |
| `GrantConditionOnMinelaying`         | Condition while laying mines              |
| `GrantConditionOnMovement`           | Condition while moving                    |
| `GrantConditionOnPlayerResources`    | Condition based on resources              |
| `GrantConditionOnPowerState`         | Condition based on power                  |
| `GrantConditionOnPrerequisite`       | Condition when prereq met                 |
| `GrantConditionOnProduction`         | Condition during production               |
| `GrantConditionOnSubterraneanLayer`  | Condition when underground                |
| `GrantConditionOnTerrain`            | Condition on terrain type                 |
| `GrantConditionOnTileSet`            | Condition on tile set                     |
| `GrantConditionOnTunnelLayer`        | Condition in tunnel                       |
| `GrantConditionWhileAiming`          | Condition while aiming                    |
| `GrantChargedConditionOnToggle`      | Charged toggle condition                  |
| `GrantExternalConditionToCrusher`    | Grant condition to crusher                |
| `GrantExternalConditionToProduced`   | Grant condition to produced unit          |
| `GrantRandomCondition`               | Random condition selection                |
| `LineBuildSegmentExternalCondition`  | Line build segment condition              |
| `ProximityExternalCondition`         | Proximity-based condition                 |
| `SpreadsCondition`                   | Condition that spreads to neighbors       |
| `ToggleConditionOnOrder`             | Toggle condition via order                |

---

## 5. Multiplier System (~20 traits)

Multipliers modify numeric values on actors. All are conditional traits.

| Multiplier                         | Affects                      |
| ---------------------------------- | ---------------------------- |
| `DamageMultiplier`                 | Incoming damage              |
| `FirepowerMultiplier`              | Outgoing damage              |
| `SpeedMultiplier`                  | Movement speed               |
| `RangeMultiplier`                  | Weapon range                 |
| `InaccuracyMultiplier`             | Weapon spread                |
| `ReloadDelayMultiplier`            | Weapon reload time           |
| `ReloadAmmoDelayMultiplier`        | Ammo reload time             |
| `ProductionCostMultiplier`         | Build cost                   |
| `ProductionTimeMultiplier`         | Build time                   |
| `PowerMultiplier`                  | Power consumption/production |
| `RevealsShroudMultiplier`          | Sight range                  |
| `CreatesShroudMultiplier`          | Shroud creation range        |
| `DetectCloakedMultiplier`          | Cloak detection range        |
| `CashTricklerMultiplier`           | Cash trickle rate            |
| `ResourceValueMultiplier`          | Resource gather value        |
| `GainsExperienceMultiplier`        | XP gain rate                 |
| `GivesExperienceMultiplier`        | XP given on death            |
| `HandicapDamageMultiplier`         | Handicap damage received     |
| `HandicapFirepowerMultiplier`      | Handicap firepower           |
| `HandicapProductionTimeMultiplier` | Handicap build time          |

---

## 6. Projectile System (8 types)

| Projectile    | Purpose                                                       |
| ------------- | ------------------------------------------------------------- |
| `Bullet`      | Standard ballistic projectile with gravity, speed, inaccuracy |
| `Missile`     | Guided missile with tracking, jinking, terrain following      |
| `LaserZap`    | Instant laser beam                                            |
| `Railgun`     | Railgun beam effect                                           |
| `AreaBeam`    | Wide area beam weapon                                         |
| `InstantHit`  | Instant-hit hitscan weapon                                    |
| `GravityBomb` | Dropped bomb with gravity                                     |
| `NukeLaunch`  | Nuclear missile (special trajectory)                          |

**Mod-defined projectile types:** RA2 mods add at least one custom projectile type not in OpenRA core: `ElectricBolt` (procedurally generated segmented lightning bolts with configurable width, distortion, and segment length — see `research/openra-ra2-mod-architecture.md` § "Tesla Bolt / ElectricBolt System"). The `ArcLaserZap` projectile used for mind control links is another RA2-specific type. IC's projectile system must support registration of custom projectile types via WASM (Tier 3) or game module `system_pipeline()`.

---

## 7. Warhead System (15 types)

Warheads define what happens when a weapon hits. Multiple warheads per weapon.

| Warhead                         | Purpose                                |
| ------------------------------- | -------------------------------------- |
| `Warhead`                       | Base warhead class                     |
| `DamageWarhead`                 | Base class for damage-dealing warheads |
| `SpreadDamageWarhead`           | Damage with falloff over radius        |
| `TargetDamageWarhead`           | Direct damage to target only           |
| `HealthPercentageDamageWarhead` | Percentage-based damage                |
| `ChangeOwnerWarhead`            | Changes actor ownership                |
| `CreateEffectWarhead`           | Creates visual/sound effects           |
| `CreateResourceWarhead`         | Creates resources (like ore)           |
| `DestroyResourceWarhead`        | Destroys resources on ground           |
| `FireClusterWarhead`            | Fires cluster submunitions             |
| `FlashEffectWarhead`            | Screen flash effect                    |
| `FlashTargetsInRadiusWarhead`   | Flashes affected targets               |
| `GrantExternalConditionWarhead` | Grants condition to targets            |
| `LeaveSmudgeWarhead`            | Creates terrain smudges                |
| `ShakeScreenWarhead`            | Screen shake on impact                 |

**Warhead extensibility evidence:** RA2 mods extend this list with `RadiationWarhead` (creates persistent radiation cells in the world-level `TintedCellsLayer` — not target damage, but environmental contamination), and community mods like Romanovs-Vengeance add temporal displacement, infection, and terrain-modifying warheads. OpenHV adds `PeriodicDischargeWarhead` (damage over time). IC needs a `WarheadRegistry` that accepts game-module and WASM-registered warhead types, not just the 15 built-in types.

---

## 8. Render System (~80 traits)

### Sprite Body Types
| Trait                         | Purpose                      |
| ----------------------------- | ---------------------------- |
| `RenderSprites`               | Base sprite renderer         |
| `RenderSpritesEditorOnly`     | Sprites only in editor       |
| `WithSpriteBody`              | Standard sprite body         |
| `WithFacingSpriteBody`        | Sprite body with facing      |
| `WithInfantryBody`            | Infantry-specific animations |
| `WithWallSpriteBody`          | Auto-connecting wall sprites |
| `WithBridgeSpriteBody`        | Bridge sprite                |
| `WithDeadBridgeSpriteBody`    | Destroyed bridge sprite      |
| `WithGateSpriteBody`          | Gate open/close animation    |
| `WithCrateBody`               | Crate sprite                 |
| `WithChargeSpriteBody`        | Charge-based sprite change   |
| `WithResourceLevelSpriteBody` | Resource level visualization |

### Animation Overlays
| Trait                                 | Purpose                     |
| ------------------------------------- | --------------------------- |
| `WithMakeAnimation`                   | Construction animation      |
| `WithMakeOverlay`                     | Construction overlay        |
| `WithIdleAnimation`                   | Idle animation              |
| `WithIdleOverlay`                     | Idle overlay                |
| `WithAttackAnimation`                 | Attack animation            |
| `WithAttackOverlay`                   | Attack overlay              |
| `WithMoveAnimation`                   | Movement animation          |
| `WithHarvestAnimation`                | Harvesting animation        |
| `WithHarvestOverlay`                  | Harvesting overlay          |
| `WithDeathAnimation`                  | Death animation             |
| `WithDamageOverlay`                   | Damage state overlay        |
| `WithAimAnimation`                    | Aiming animation            |
| `WithDockingAnimation`                | Docking animation           |
| `WithDockingOverlay`                  | Docking overlay             |
| `WithDockedOverlay`                   | Docked state overlay        |
| `WithDeliveryAnimation`               | Delivery animation          |
| `WithResupplyAnimation`               | Resupply animation          |
| `WithBuildingPlacedAnimation`         | Placed animation            |
| `WithBuildingPlacedOverlay`           | Placed overlay              |
| `WithChargeOverlay`                   | Charge state overlay        |
| `WithProductionDoorOverlay`           | Factory door animation      |
| `WithProductionOverlay`               | Production activity overlay |
| `WithRepairOverlay`                   | Repair animation            |
| `WithResourceLevelOverlay`            | Resource level overlay      |
| `WithSwitchableOverlay`               | Toggleable overlay          |
| `WithSupportPowerActivationAnimation` | Superweapon activation      |
| `WithSupportPowerActivationOverlay`   | Superweapon overlay         |
| `WithTurretAimAnimation`              | Turret aim animation        |
| `WithTurretAttackAnimation`           | Turret attack animation     |

### Weapons & Effects Rendering
| Trait                       | Purpose                   |
| --------------------------- | ------------------------- |
| `WithMuzzleOverlay`         | Muzzle flash              |
| `WithSpriteBarrel`          | Visible weapon barrel     |
| `WithSpriteTurret`          | Visible turret sprite     |
| `WithParachute`             | Parachute rendering       |
| `WithShadow`                | Shadow rendering          |
| `Contrail`                  | Contrail effect           |
| `FloatingSpriteEmitter`     | Floating sprite particles |
| `LeavesTrails`              | Trail effects             |
| `Hovers`                    | Hovering animation        |
| `WithAircraftLandingEffect` | Landing dust effect       |

### Decorations & UI Overlays
| Trait                              | Purpose                          |
| ---------------------------------- | -------------------------------- |
| `WithDecoration`                   | Generic decoration               |
| `WithDecorationBase`               | Base decoration class            |
| `WithNameTagDecoration`            | Name tag above actor             |
| `WithTextDecoration`               | Text above actor                 |
| `WithTextControlGroupDecoration`   | Control group number             |
| `WithSpriteControlGroupDecoration` | Control group sprite             |
| `WithBuildingRepairDecoration`     | Repair icon                      |
| `WithRangeCircle`                  | Range circle display             |
| `WithProductionIconOverlay`        | Production icon modification     |
| `ProductionIconOverlayManager`     | Manages production icon overlays |

### Status Bars
| Trait                   | Purpose                     |
| ----------------------- | --------------------------- |
| `CashTricklerBar`       | Cash trickle progress bar   |
| `ProductionBar`         | Production progress         |
| `ReloadArmamentsBar`    | Weapon reload progress      |
| `SupportPowerChargeBar` | Superweapon charge progress |
| `TimedConditionBar`     | Timed condition remaining   |

### Pip Decorations
| Trait                               | Purpose               |
| ----------------------------------- | --------------------- |
| `WithAmmoPipsDecoration`            | Ammo pips             |
| `WithCargoPipsDecoration`           | Passenger pips        |
| `WithResourceStoragePipsDecoration` | Resource storage pips |
| `WithStoresResourcesPipsDecoration` | Stored resources pips |

### Selection Rendering
| Trait                           | Purpose                   |
| ------------------------------- | ------------------------- |
| `SelectionDecorations`          | Selection box rendering   |
| `SelectionDecorationsBase`      | Base selection rendering  |
| `IsometricSelectionDecorations` | Isometric selection boxes |

### Debug Rendering
| Trait                       | Purpose               |
| --------------------------- | --------------------- |
| `RenderDebugState`          | Debug state overlay   |
| `RenderDetectionCircle`     | Detection radius      |
| `RenderJammerCircle`        | Jammer radius         |
| `RenderMouseBounds`         | Mouse bounds debug    |
| `RenderRangeCircle`         | Weapon range debug    |
| `RenderShroudCircle`        | Shroud range debug    |
| `CustomTerrainDebugOverlay` | Terrain debug overlay |
| `DrawLineToTarget`          | Line to target debug  |

### World Rendering
| Trait                       | Purpose                      |
| --------------------------- | ---------------------------- |
| `TerrainRenderer`           | Renders terrain tiles        |
| `ShroudRenderer`            | Renders fog of war/shroud    |
| `ResourceRenderer`          | Renders resource sprites     |
| `WeatherOverlay`            | Weather effects (rain, snow) |
| `TerrainLighting`           | Global terrain lighting      |
| `TerrainGeometryOverlay`    | Terrain cell debug           |
| `SmudgeLayer`               | Terrain smudge rendering     |
| `RenderPostProcessPassBase` | Post-processing base         |
| `BuildableTerrainOverlay`   | Buildable area overlay       |

---

## 9. Palette System (~22 traits)

### Palette Sources
| Trait                               | Purpose                         |
| ----------------------------------- | ------------------------------- |
| `PaletteFromFile`                   | Load palette from .pal file     |
| `PaletteFromPng`                    | Palette from PNG image          |
| `PaletteFromGimpOrJascFile`         | GIMP/JASC palette format        |
| `PaletteFromRGBA`                   | Programmatic RGBA palette       |
| `PaletteFromGrayscale`              | Generated grayscale palette     |
| `PaletteFromEmbeddedSpritePalette`  | Palette from sprite data        |
| `PaletteFromPaletteWithAlpha`       | Palette with alpha modification |
| `PaletteFromPlayerPaletteWithAlpha` | Player palette + alpha          |
| `IndexedPalette`                    | Index-based palette             |
| `IndexedPlayerPalette`              | Player-colored indexed palette  |
| `PlayerColorPalette`                | Player team color palette       |
| `FixedColorPalette`                 | Fixed color palette             |
| `ColorPickerPalette`                | Color picker palette            |

### Palette Effects & Shifts
| Trait                    | Purpose                                  |
| ------------------------ | ---------------------------------------- |
| `PlayerColorShift`       | Player color application                 |
| `FixedPlayerColorShift`  | Fixed player color shift                 |
| `FixedColorShift`        | Fixed color modification                 |
| `ColorPickerColorShift`  | Color picker integration                 |
| `RotationPaletteEffect`  | Palette rotation animation (e.g., water) |
| `CloakPaletteEffect`     | Cloak shimmer effect                     |
| `FlashPostProcessEffect` | Screen flash post-process                |
| `MenuPostProcessEffect`  | Menu screen effect                       |
| `TintPostProcessEffect`  | Color tint post-process                  |

---

## 10. Sound System (~9 traits)

| Trait                     | Purpose                    |
| ------------------------- | -------------------------- |
| `AmbientSound`            | Looping ambient sounds     |
| `AttackSounds`            | Weapon fire sounds         |
| `DeathSounds`             | Death sounds               |
| `ActorLostNotification`   | "Unit lost" notification   |
| `AnnounceOnKill`          | Kill announcement          |
| `AnnounceOnSeen`          | Sighting announcement      |
| `CaptureNotification`     | Capture notification       |
| `SoundOnDamageTransition` | Sound at damage thresholds |
| `VoiceAnnouncement`       | Voice line playback        |
| `StartGameNotification`   | Game start sound           |
| `MusicPlaylist`           | Music track management     |

---

## 11. Support Powers System (~10 traits)

| Trait                         | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `SupportPowerManager`         | Player-level power management                    |
| `SupportPower`                | Base support power class                         |
| `AirstrikePower`              | Airstrike superweapon                            |
| `NukePower`                   | Nuclear strike                                   |
| `ParatroopersPower`           | Paradrop reinforcements                          |
| `SpawnActorPower`             | Spawn actor (e.g., spy plane)                    |
| `ProduceActorPower`           | Produce actor via power                          |
| `GrantExternalConditionPower` | Condition-granting power                         |
| `DirectionalSupportPower`     | Directional targeting (e.g., airstrike corridor) |
| `SelectDirectionalTarget`     | UI for directional targeting                     |

---

## 12. Crate System (~13 traits)

| Trait                               | Purpose                    |
| ----------------------------------- | -------------------------- |
| `Crate`                             | Base crate actor           |
| `CrateAction`                       | Base crate action class    |
| `GiveCashCrateAction`               | Cash bonus                 |
| `GiveUnitCrateAction`               | Spawn unit                 |
| `GiveBaseBuilderCrateAction`        | MCV/base builder           |
| `DuplicateUnitCrateAction`          | Duplicate collector        |
| `ExplodeCrateAction`                | Explosive trap             |
| `HealActorsCrateAction`             | Heal nearby units          |
| `LevelUpCrateAction`                | Veterancy level up         |
| `RevealMapCrateAction`              | Map reveal                 |
| `HideMapCrateAction`                | Re-hide map                |
| `GrantExternalConditionCrateAction` | Grant condition            |
| `SupportPowerCrateAction`           | Grant support power        |
| `CrateSpawner`                      | World trait: spawns crates |

---

## 13. Veterancy / Experience System

| Trait                       | Purpose                     |
| --------------------------- | --------------------------- |
| `GainsExperience`           | Gains XP from kills         |
| `GivesExperience`           | Awards XP to killer         |
| `ExperienceTrickler`        | Passive XP gain over time   |
| `ProducibleWithLevel`       | Produced at veterancy level |
| `PlayerExperience`          | Player-wide XP pool         |
| `GainsExperienceMultiplier` | XP gain modifier            |
| `GivesExperienceMultiplier` | XP award modifier           |

---

## 14. Fog of War / Shroud System

### Core Engine (OpenRA.Game)
| Trait              | Purpose                          |
| ------------------ | -------------------------------- |
| `Shroud`           | Core shroud/fog state management |
| `FrozenActorLayer` | Frozen actor ghost rendering     |

### Mods.Common Traits
| Trait                | Purpose                             |
| -------------------- | ----------------------------------- |
| `AffectsShroud`      | Base for shroud-affecting traits    |
| `CreatesShroud`      | Creates shroud around actor         |
| `RevealsShroud`      | Reveals shroud (sight)              |
| `FrozenUnderFog`     | Hidden under fog of war             |
| `HiddenUnderFog`     | Invisible under fog                 |
| `HiddenUnderShroud`  | Invisible under shroud              |
| `ShroudRenderer`     | Renders shroud overlay              |
| `PlayerRadarTerrain` | Player-specific radar terrain       |
| `WithColoredOverlay` | Colored overlay (e.g., frozen tint) |

---

## 15. Power System

| Trait                        | Purpose                        |
| ---------------------------- | ------------------------------ |
| `Power`                      | Provides/consumes power        |
| `PowerManager`               | Player-level power tracking    |
| `PowerMultiplier`            | Power amount modifier          |
| `ScalePowerWithHealth`       | Power scales with damage       |
| `AffectedByPowerOutage`      | Disabled during power outage   |
| `GrantConditionOnPowerState` | Condition based on power level |
| `PowerTooltip`               | Shows power info               |
| `PowerDownBotManager`        | AI power management            |

---

## 16. Radar / Minimap System

| Trait                   | Purpose                       |
| ----------------------- | ----------------------------- |
| `AppearsOnRadar`        | Visible on minimap            |
| `ProvidesRadar`         | Enables minimap               |
| `RadarColorFromTerrain` | Radar color from terrain type |
| `RadarPings`            | Radar ping markers            |
| `RadarWidget`           | Minimap UI widget             |

---

## 17. Locomotor System

Locomotors define how actors interact with terrain for movement.

| Trait                    | Purpose                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `Locomotor`              | Base locomotor (17KB) — terrain cost tables, movement class, crushes, speed modifiers per terrain type |
| `SubterraneanLocomotor`  | Underground movement                                                                                   |
| `SubterraneanActorLayer` | Underground layer management                                                                           |
| `Mobile`                 | Actor-level movement using a locomotor                                                                 |
| `Aircraft`               | Air locomotor variant                                                                                  |

Key Locomotor features:
- **Terrain cost tables** — per-terrain-type movement cost
- **Movement classes** — define pathfinding categories
- **Crush classes** — what can be crushed
- **Share cells** — whether units can share cells
- **Speed modifiers** — per-terrain speed modification

---

## 18. Pathfinding System

| Trait                           | Purpose                                     |
| ------------------------------- | ------------------------------------------- |
| `PathFinder`                    | Main pathfinding implementation (14KB)      |
| `HierarchicalPathFinderOverlay` | Hierarchical pathfinder debug visualization |
| `PathFinderOverlay`             | Standard pathfinder debug                   |

---

## 19. AI / Bot System

### Bot Framework
| Trait        | Purpose                              |
| ------------ | ------------------------------------ |
| `ModularBot` | Modular bot framework (player trait) |
| `DummyBot`   | Placeholder bot                      |

### Bot Modules (~12 modules)
| Module                         | Purpose                         |
| ------------------------------ | ------------------------------- |
| `BaseBuilderBotModule`         | Base construction AI            |
| `BuildingRepairBotModule`      | Auto-repair buildings           |
| `CaptureManagerBotModule`      | Capture neutral/enemy buildings |
| `HarvesterBotModule`           | Resource gathering AI           |
| `McvManagerBotModule`          | MCV deployment AI               |
| `McvExpansionManagerBotModule` | Base expansion AI               |
| `PowerDownBotManager`          | Power management AI             |
| `ResourceMapBotModule`         | Resource mapping                |
| `SquadManagerBotModule`        | Military squad management       |
| `SupportPowerBotModule`        | Superweapon usage AI            |
| `UnitBuilderBotModule`         | Unit production AI              |

---

## 20. Infantry System

| Trait                   | Purpose                                               |
| ----------------------- | ----------------------------------------------------- |
| `WithInfantryBody`      | Infantry sprite rendering with multiple sub-positions |
| `ScaredyCat`            | Panic flee behavior                                   |
| `TakeCover`             | Prone/cover behavior                                  |
| `TerrainModifiesDamage` | Terrain affects damage received                       |

---

## 21. Terrain System

### World Terrain Traits
| Trait                         | Purpose                                 |
| ----------------------------- | --------------------------------------- |
| `TerrainRenderer`             | Renders terrain tiles                   |
| `ResourceLayer`               | Resource cell management                |
| `ResourceRenderer`            | Resource sprite rendering               |
| `ResourceClaimLayer`          | Resource claim tracking for harvesters  |
| `EditorResourceLayer`         | Editor resource placement               |
| `SmudgeLayer`                 | Terrain smudges (craters, scorch marks) |
| `TerrainLighting`             | Per-cell terrain lighting               |
| `TerrainGeometryOverlay`      | Debug geometry                          |
| `TerrainTunnel`               | Terrain tunnel definition               |
| `TerrainTunnelLayer`          | Tunnel management                       |
| `CliffBackImpassabilityLayer` | Cliff impassability                     |
| `DamagedByTerrain`            | Terrain damage (tiberium, etc.)         |
| `ChangesTerrain`              | Actor modifies terrain                  |
| `SeedsResource`               | Creates new resources                   |

**Terrain is never just tiles — evidence from mods:** Analysis of four OpenRA community mods (see `research/openra-mod-architecture-analysis.md` and `research/openra-ra2-mod-architecture.md`) reveals that terrain is one of the deepest extension points:

- **RA2 radiation:** World-level `TintedCellsLayer` — sparse `Dictionary<CPos, TintedCell>` with configurable decay (linear, logarithmic, half-life). Radiation isn't a visual effect; it's a persistent terrain overlay that damages units standing in it. IC needs a `WorldLayer` abstraction for similar persistent cell-level state.
- **OpenHV floods:** `LaysTerrain` trait — actors can permanently transform terrain type at runtime (e.g., flooding a valley changes passability and visual tiles). This breaks the assumption that terrain is static after map load.
- **OpenSA plant growth:** Living terrain that spreads autonomously. `SpreadsCondition` creates expanding zones that modify pathability and visual appearance over time.
- **OpenKrush oil patches:** Entirely different resource terrain model — fixed oil positions (not harvestable ore fields), per-patch depletion, no regrowth.

IC's terrain system must support runtime terrain modification, world-level cell layers (for radiation, weather effects, etc.), and game-module-defined resource models — not just the RA1 ore/gem model.

### Tile Sets (RA mod example)
- `snow` — Snow terrain
- `interior` — Interior/building tiles
- `temperat` — Temperate terrain
- `desert` — Desert terrain

---

## 22. Map System

### Map Traits
| Trait                  | Purpose                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `MapOptions`           | Game speed, tech level, starting cash, fog/shroud toggles, short game |
| `MapStartingLocations` | Spawn point placement                                                 |
| `MapStartingUnits`     | Starting unit set per faction                                         |
| `MapBuildRadius`       | Initial build radius rules                                            |
| `MapCreeps`            | Enable/disable ambient wildlife                                       |
| `MissionData`          | Mission briefing, objectives                                          |
| `CreateMapPlayers`     | Initial player creation                                               |
| `SpawnMapActors`       | Spawn pre-placed map actors                                           |
| `SpawnStartingUnits`   | Spawn starting units at locations                                     |

### Map Generation
| Trait                 | Purpose                          |
| --------------------- | -------------------------------- |
| `ClassicMapGenerator` | Procedural map generation (38KB) |
| `ClearMapGenerator`   | Empty/clear map generation       |

### Actor Spawn
| Trait               | Purpose                        |
| ------------------- | ------------------------------ |
| `ActorSpawnManager` | Manages ambient actor spawning |
| `ActorSpawner`      | Spawn point for spawned actors |

---

## 23. Map Editor System

### Editor World Traits
| Trait                 | Purpose                                |
| --------------------- | -------------------------------------- |
| `EditorActionManager` | Undo/redo action management            |
| `EditorActorLayer`    | Manages placed actors in editor (15KB) |
| `EditorActorPreview`  | Actor preview rendering in editor      |
| `EditorCursorLayer`   | Editor cursor management               |
| `EditorResourceLayer` | Resource painting                      |
| `MarkerLayerOverlay`  | Marker layer visualization             |
| `TilingPathTool`      | Path/road tiling tool (14KB)           |

### Editor Widgets
| Widget                           | Purpose                        |
| -------------------------------- | ------------------------------ |
| `EditorViewportControllerWidget` | Editor viewport input handling |

### Editor Widget Logic (separate directory)
- `Editor/` subdirectory with editor-specific UI logic files

---

## 24. Widget / UI System (~60+ widgets)

### Layout Widgets
| Widget              | Purpose               |
| ------------------- | --------------------- |
| `BackgroundWidget`  | Background panel      |
| `ScrollPanelWidget` | Scrollable container  |
| `ScrollItemWidget`  | Item in scroll panel  |
| `GridLayout`        | Grid layout container |
| `ListLayout`        | List layout container |

### Input Widgets
| Widget                    | Purpose              |
| ------------------------- | -------------------- |
| `ButtonWidget`            | Clickable button     |
| `CheckboxWidget`          | Toggle checkbox      |
| `DropDownButtonWidget`    | Dropdown selection   |
| `TextFieldWidget`         | Text input field     |
| `PasswordFieldWidget`     | Password input       |
| `SliderWidget`            | Slider control       |
| `ExponentialSliderWidget` | Exponential slider   |
| `HueSliderWidget`         | Hue selection slider |
| `HotkeyEntryWidget`       | Hotkey binding input |
| `MenuButtonWidget`        | Menu-style button    |

### Display Widgets
| Widget                     | Purpose               |
| -------------------------- | --------------------- |
| `LabelWidget`              | Text label            |
| `LabelWithHighlightWidget` | Label with highlights |
| `LabelWithTooltipWidget`   | Label with tooltip    |
| `LabelForInputWidget`      | Label for form input  |
| `ImageWidget`              | Image display         |
| `SpriteWidget`             | Sprite display        |
| `RGBASpriteWidget`         | RGBA sprite           |
| `VideoPlayerWidget`        | Video playback        |
| `ColorBlockWidget`         | Solid color block     |
| `ColorMixerWidget`         | Color mixer           |
| `GradientColorBlockWidget` | Gradient color        |

### Game-Specific Widgets
| Widget                             | Purpose                |
| ---------------------------------- | ---------------------- |
| `RadarWidget`                      | Minimap                |
| `ProductionPaletteWidget`          | Build palette          |
| `ProductionTabsWidget`             | Build tabs             |
| `ProductionTypeButtonWidget`       | Build category buttons |
| `SupportPowersWidget`              | Superweapon panel      |
| `SupportPowerTimerWidget`          | Superweapon timers     |
| `ResourceBarWidget`                | Resource/money display |
| `ControlGroupsWidget`              | Control group buttons  |
| `WorldInteractionControllerWidget` | World click handling   |
| `ViewportControllerWidget`         | Camera control         |
| `WorldButtonWidget`                | Click on world         |
| `WorldLabelWithTooltipWidget`      | World-space label      |

### Observer Widgets
| Widget                            | Purpose                       |
| --------------------------------- | ----------------------------- |
| `ObserverArmyIconsWidget`         | Observer army composition     |
| `ObserverProductionIconsWidget`   | Observer production tracking  |
| `ObserverSupportPowerIconsWidget` | Observer superweapon tracking |
| `StrategicProgressWidget`         | Strategic score display       |

### Preview Widgets
| Widget                         | Purpose                  |
| ------------------------------ | ------------------------ |
| `MapPreviewWidget`             | Map thumbnail            |
| `ActorPreviewWidget`           | Actor preview            |
| `GeneratedMapPreviewWidget`    | Generated map preview    |
| `TerrainTemplatePreviewWidget` | Terrain template preview |
| `ResourcePreviewWidget`        | Resource type preview    |

### Utility Widgets
| Widget                           | Purpose                    |
| -------------------------------- | -------------------------- |
| `TooltipContainerWidget`         | Tooltip container          |
| `ClientTooltipRegionWidget`      | Client tooltip region      |
| `MouseAttachmentWidget`          | Mouse-attached element     |
| `LogicKeyListenerWidget`         | Key event listener         |
| `LogicTickerWidget`              | Tick event listener        |
| `ProgressBarWidget`              | Progress bar               |
| `BadgeWidget`                    | Badge display              |
| `TextNotificationsDisplayWidget` | Text notification area     |
| `ConfirmationDialogs`            | Confirmation dialog helper |
| `SelectionUtils`                 | Selection helper utils     |
| `WidgetUtils`                    | Widget utility functions   |

### Graph/Debug Widgets
| Widget                      | Purpose               |
| --------------------------- | --------------------- |
| `PerfGraphWidget`           | Performance graph     |
| `LineGraphWidget`           | Line graph            |
| `ScrollableLineGraphWidget` | Scrollable line graph |

---

## 25. Widget Logic System (~40+ logic classes)

Logic classes bind widgets to game state and user actions.

### Menu Logic
| Logic                     | Purpose             |
| ------------------------- | ------------------- |
| `MainMenuLogic`           | Main menu flow      |
| `CreditsLogic`            | Credits screen      |
| `IntroductionPromptLogic` | First-run intro     |
| `SystemInfoPromptLogic`   | System info display |
| `VersionLabelLogic`       | Version display     |

### Game Browser Logic
| Logic                    | Purpose                       |
| ------------------------ | ----------------------------- |
| `ServerListLogic`        | Server browser (29KB)         |
| `ServerCreationLogic`    | Create game dialog            |
| `MultiplayerLogic`       | Multiplayer menu              |
| `DirectConnectLogic`     | Direct IP connect             |
| `ConnectionLogic`        | Connection status             |
| `DisconnectWatcherLogic` | Disconnect detection          |
| `MapChooserLogic`        | Map selection (20KB)          |
| `MapGeneratorLogic`      | Map generator UI (15KB)       |
| `MissionBrowserLogic`    | Single player missions (19KB) |
| `GameSaveBrowserLogic`   | Save game browser             |
| `EncyclopediaLogic`      | In-game encyclopedia          |

### Replay Logic
| Logic                | Purpose                  |
| -------------------- | ------------------------ |
| `ReplayBrowserLogic` | Replay browser (26KB)    |
| `ReplayUtils`        | Replay utility functions |

### Profile Logic
| Logic                           | Purpose                   |
| ------------------------------- | ------------------------- |
| `LocalProfileLogic`             | Local player profile      |
| `LoadLocalPlayerProfileLogic`   | Profile loading           |
| `RegisteredProfileTooltipLogic` | Registered player tooltip |
| `AnonymousProfileTooltipLogic`  | Anonymous player tooltip  |
| `PlayerProfileBadgesLogic`      | Badge display             |
| `BotTooltipLogic`               | AI bot tooltip            |

### Asset/Content Logic
| Logic               | Purpose              |
| ------------------- | -------------------- |
| `AssetBrowserLogic` | Asset browser (23KB) |
| `ColorPickerLogic`  | Color picker dialog  |

### Hotkey Logic
| Logic                      | Purpose             |
| -------------------------- | ------------------- |
| `SingleHotkeyBaseLogic`    | Base hotkey handler |
| `MusicHotkeyLogic`         | Music hotkeys       |
| `MuteHotkeyLogic`          | Mute toggle         |
| `MuteIndicatorLogic`       | Mute indicator      |
| `ScreenshotHotkeyLogic`    | Screenshot capture  |
| `DepthPreviewHotkeysLogic` | Depth preview       |
| `MusicPlayerLogic`         | Music player UI     |

### Settings Logic
- `Settings/` subdirectory — audio, display, input, game settings panels

### Lobby Logic
- `Lobby/` subdirectory — lobby UI, player slots, options, chat

### Ingame Logic
- `Ingame/` subdirectory — in-game HUD, observer panels, chat

### Editor Logic
- `Editor/` subdirectory — map editor tools, actors, terrain

### Installation Logic
- `Installation/` subdirectory — content installation, mod download

### Debug Logic
| Logic                | Purpose                     |
| -------------------- | --------------------------- |
| `PerfDebugLogic`     | Performance debug panel     |
| `TabCompletionLogic` | Chat/console tab completion |
| `SimpleTooltipLogic` | Basic tooltip               |
| `ButtonTooltipLogic` | Button tooltip              |

---

## 26. Order System

### Order Generators
| Generator                      | Purpose                               |
| ------------------------------ | ------------------------------------- |
| `UnitOrderGenerator`           | Default unit command processing (8KB) |
| `OrderGenerator`               | Base order generator class            |
| `PlaceBuildingOrderGenerator`  | Building placement orders (11KB)      |
| `GuardOrderGenerator`          | Guard command orders                  |
| `BeaconOrderGenerator`         | Map beacon placement                  |
| `RepairOrderGenerator`         | Repair command orders                 |
| `GlobalButtonOrderGenerator`   | Global button commands                |
| `ForceModifiersOrderGenerator` | Force-attack/force-move modifiers     |

### Order Targeters
| Targeter                   | Purpose                      |
| -------------------------- | ---------------------------- |
| `UnitOrderTargeter`        | Standard unit targeting      |
| `DeployOrderTargeter`      | Deploy/unpack targeting      |
| `EnterAlliedActorTargeter` | Enter allied actor targeting |

### Order Validation
| Trait           | Purpose                          |
| --------------- | -------------------------------- |
| `ValidateOrder` | World-level order validation     |
| `OrderEffects`  | Visual/audio feedback for orders |

---

## 27. Lua Scripting API (Mission Scripting)

### Global APIs (16 modules)
| Global              | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| `Actor`             | Create actors, get actors by name/tag                 |
| `Angle`             | Angle type helpers                                    |
| `Beacon`            | Map beacon placement                                  |
| `Camera`            | Camera position & movement                            |
| `Color`             | Color construction                                    |
| `CoordinateGlobals` | CPos, WPos, WVec, WDist, WAngle construction          |
| `DateTime`          | Game time queries                                     |
| `Lighting`          | Global lighting control                               |
| `Map`               | Map queries (terrain, actors in area, center, bounds) |
| `Media`             | Play speech, sound, music, display messages           |
| `Player`            | Get player objects                                    |
| `Radar`             | Radar ping creation                                   |
| `Reinforcements`    | Spawn reinforcements (ground, air, paradrop)          |
| `Trigger`           | Event triggers (on killed, on idle, on timer, etc.)   |
| `UserInterface`     | UI manipulation                                       |
| `Utils`             | Utility functions (random, do, skip)                  |

### Actor Properties (34 property groups)
| Properties                     | Purpose                                                                |
| ------------------------------ | ---------------------------------------------------------------------- |
| `AircraftProperties`           | Aircraft control (land, resupply, return)                              |
| `AirstrikeProperties`          | Airstrike targeting                                                    |
| `AmmoPoolProperties`           | Ammo management                                                        |
| `CaptureProperties`            | Capture commands                                                       |
| `CarryallProperties`           | Carryall commands                                                      |
| `CloakProperties`              | Cloak control                                                          |
| `CombatProperties`             | Attack, stop, guard commands                                           |
| `ConditionProperties`          | Grant/revoke conditions                                                |
| `DeliveryProperties`           | Delivery commands                                                      |
| `DemolitionProperties`         | Demolition commands                                                    |
| `DiplomacyProperties`          | Stance changes                                                         |
| `GainsExperienceProperties`    | XP management                                                          |
| `GeneralProperties`            | Common properties (owner, type, location, health, kill, destroy, etc.) |
| `GuardProperties`              | Guard commands                                                         |
| `HarvesterProperties`          | Harvest, find resources                                                |
| `HealthProperties`             | Health queries and modification                                        |
| `InstantlyRepairsProperties`   | Instant repair commands                                                |
| `MissionObjectiveProperties`   | Add/complete objectives                                                |
| `MobileProperties`             | Move, patrol, scatter, stop                                            |
| `NukeProperties`               | Nuke launch                                                            |
| `ParadropProperties`           | Paradrop execution                                                     |
| `ParatroopersProperties`       | Paratroopers power activation                                          |
| `PlayerConditionProperties`    | Player-level conditions                                                |
| `PlayerExperienceProperties`   | Player XP                                                              |
| `PlayerProperties`             | Player queries (faction, cash, color, team, etc.)                      |
| `PlayerStatsProperties`        | Game statistics                                                        |
| `PowerProperties`              | Power queries                                                          |
| `ProductionProperties`         | Build/produce commands                                                 |
| `RepairableBuildingProperties` | Building repair                                                        |
| `ResourceProperties`           | Resource queries                                                       |
| `ScaredCatProperties`          | Panic command                                                          |
| `SellableProperties`           | Sell command                                                           |
| `TransformProperties`          | Transform command                                                      |
| `TransportProperties`          | Load, unload, passenger queries                                        |

### Script Infrastructure
| Class            | Purpose                      |
| ---------------- | ---------------------------- |
| `LuaScript`      | Script loading and execution |
| `ScriptTriggers` | Trigger implementations      |
| `CallLuaFunc`    | Lua function invocation      |
| `Media`          | Media playback API           |

---

## 28. Player System

### Player Traits
| Trait                     | Purpose                          |
| ------------------------- | -------------------------------- |
| `PlayerResources`         | Cash, resources, income tracking |
| `PlayerStatistics`        | Kill/death/build statistics      |
| `PlayerExperience`        | Player-wide experience points    |
| `PlayerRadarTerrain`      | Per-player radar terrain state   |
| `PlaceBuilding`           | Building placement handler       |
| `PlaceBeacon`             | Map beacon placement             |
| `DamageNotifier`          | Under attack notifications       |
| `HarvesterAttackNotifier` | Harvester attack notifications   |
| `EnemyWatcher`            | Enemy unit detection             |
| `GameSaveViewportManager` | Save game viewport state         |
| `ResourceStorageWarning`  | Storage full warning             |
| `AllyRepair`              | Allied repair permission         |

### Victory Conditions
| Trait                        | Purpose                     |
| ---------------------------- | --------------------------- |
| `ConquestVictoryConditions`  | Destroy all to win          |
| `StrategicVictoryConditions` | Strategic point control     |
| `MissionObjectives`          | Scripted mission objectives |
| `TimeLimitManager`           | Game time limit             |

### Developer Mode
| Trait           | Purpose                                               |
| --------------- | ----------------------------------------------------- |
| `DeveloperMode` | Cheat commands (instant build, unlimited power, etc.) |

### Faction System
| Trait     | Purpose                                        |
| --------- | ---------------------------------------------- |
| `Faction` | Faction definition (name, internal name, side) |

---

## 29. Selection System

| Trait                           | Purpose                                         |
| ------------------------------- | ----------------------------------------------- |
| `Selection`                     | World-level selection management (5.4KB)        |
| `Selectable`                    | Actor can be selected (bounds, priority, voice) |
| `IsometricSelectable`           | Isometric selection variant                     |
| `SelectionDecorations`          | Selection box rendering                         |
| `IsometricSelectionDecorations` | Isometric selection boxes                       |
| `ControlGroups`                 | Ctrl+number group management                    |
| `ControlGroupsWidget`           | Control group UI                                |
| `SelectionUtils`                | Selection utility helpers                       |

---

## 30. Hotkey System

### Mod-level Hotkey Configuration (RA mod)
- `hotkeys/common.yaml` — Shared hotkeys
- `hotkeys/mapcreation.yaml` — Map creation hotkeys
- `hotkeys/observer-replay.yaml` — Observer & replay hotkeys
- `hotkeys/player.yaml` — Player hotkeys
- `hotkeys/control-groups.yaml` — Control group bindings
- `hotkeys/production.yaml` — Production hotkeys
- `hotkeys/music.yaml` — Music control
- `hotkeys/chat.yaml` — Chat hotkeys

### Hotkey Logic Classes
- `SingleHotkeyBaseLogic` — Base hotkey handler
- `MusicHotkeyLogic`, `MuteHotkeyLogic`, `ScreenshotHotkeyLogic`

---

## 31. Cursor System

Configured via `Cursors:` section in mod.yaml, defining cursor sprites, hotspots, and frame counts. The mod references a cursors YAML file that maps cursor names to sprite definitions.

---

## 32. Notification System

### Sound Notifications
Configured via `Notifications:` section referencing YAML files that map event names to audio files.

### Text Notifications
| Widget                           | Purpose                             |
| -------------------------------- | ----------------------------------- |
| `TextNotificationsDisplayWidget` | On-screen text notification display |

### Actor Notifications
| Trait                     | Purpose                     |
| ------------------------- | --------------------------- |
| `ActorLostNotification`   | "Unit lost"                 |
| `AnnounceOnKill`          | Kill notification           |
| `AnnounceOnSeen`          | Enemy spotted               |
| `CaptureNotification`     | Building captured           |
| `DamageNotifier`          | Under attack (player-level) |
| `HarvesterAttackNotifier` | Harvester under attack      |
| `ResourceStorageWarning`  | Silos needed                |
| `StartGameNotification`   | Battle control online       |

---

## 33. Replay System

### Replay Infrastructure
- `ReplayBrowserLogic` — Full replay browser with filtering, sorting
- `ReplayUtils` — Replay file parsing utilities
- `ReplayPlayback` (in core engine) — Replay playback as network model

### Replay Features
- Order recording (all player orders per tick)
- Desync detection via state hashing
- Observer mode with full visibility
- Speed control during playback
- Metadata: players, map, mod version, duration, outcome

### IC Enhancements

IC's replay system extends OpenRA's infrastructure with two features informed by SC2's replay architecture (see `research/blizzard-github-analysis.md` § Part 5):

**Analysis event stream:** A separate data stream alongside the order stream, recording structured gameplay events (unit births, deaths, position samples, resource collection, production events). Not required for playback — purely for post-game analysis, community statistics, and tournament casting tools. See `05-FORMATS.md` § "Analysis Event Stream" for the event taxonomy.

**Per-player score tracking:** `GameScore` structs (see `02-ARCHITECTURE.md` § "Game Score / Performance Metrics") are snapshotted periodically into the replay file. This enables post-game economy graphs, APM timelines, and comparative player performance overlays — the same kind of post-game analysis screen that SC2 popularized. OpenRA's replay stores only raw orders; extracting statistics requires re-simulating the entire game. IC's approach stores the computed metrics at regular intervals for instant post-game display.

**Replay versioning:** Replay files include a `base_build` number and a `data_version` hash (following SC2's dual-version scheme). The `base_build` identifies the protocol format; `data_version` identifies the game rules state. A replay is playable if the engine supports its `base_build` protocol, even if minor game data changes occurred between versions.

**Foreign replay import (D056):** IC can directly play back OpenRA `.orarep` files and Remastered Collection replay recordings via `ForeignReplayPlayback` — a `NetworkModel` implementation that decodes foreign replay formats through `ra-formats`, translates orders via `ForeignReplayCodec`, and feeds them to IC's sim. Playback will diverge from the original sim (D011), but a `DivergenceTracker` monitors and surfaces drift in the UI. Foreign replays can also be converted to `.icrep` via `ic replay import` for archival and analysis tooling. The foreign replay corpus doubles as an automated behavioral regression test suite — detecting gross bugs like units walking through walls or harvesters ignoring ore. See `05-FORMATS.md` § "Foreign Replay Decoders" and `09-DECISIONS.md` § D056.

---

## 34. Lobby System

### Lobby Widget Logic
- `Lobby/` directory contains all lobby UI logic
- Player slot management, faction selection, team assignment
- Color picker integration
- Map selection integration
- Game options (tech level, starting cash, short game, etc.)
- Chat functionality
- Ready state management

### Lobby-Configurable Options
| Trait                       | Lobby Control                       |
| --------------------------- | ----------------------------------- |
| `MapOptions`                | Game speed, tech, cash, fog, shroud |
| `LobbyPrerequisiteCheckbox` | Toggle prerequisites                |
| `ScriptLobbyDropdown`       | Script-defined dropdown options     |
| `MapCreeps`                 | Ambient creeps toggle               |

---

## 35. Mod Manifest System (mod.yaml)

The mod manifest defines all mod content via YAML sections:

| Section                 | Purpose                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `Metadata`              | Mod title, version, website                                                                            |
| `PackageFormats`        | Archive format handlers (Mix, etc.)                                                                    |
| `Packages`              | File system mount points                                                                               |
| `MapFolders`            | Map directory locations                                                                                |
| `Rules`                 | Actor rules YAML files (15 files for RA)                                                               |
| `Sequences`             | Sprite sequence definitions (7 files)                                                                  |
| `TileSets`              | Terrain tile sets                                                                                      |
| `Cursors`               | Cursor definitions                                                                                     |
| `Chrome`                | UI chrome YAML                                                                                         |
| `Assemblies`            | .NET assembly references                                                                               |
| `ChromeLayout`          | UI layout files (~50 files)                                                                            |
| `FluentMessages`        | Localization strings                                                                                   |
| `Weapons`               | Weapon definition files (6 files: ballistics, explosions, missiles, smallcaliber, superweapons, other) |
| `Voices`                | Voice line definitions                                                                                 |
| `Notifications`         | Audio notification mapping                                                                             |
| `Music`                 | Music track definitions                                                                                |
| `Hotkeys`               | Hotkey binding files (8 files)                                                                         |
| `LoadScreen`            | Loading screen class                                                                                   |
| `ServerTraits`          | Server-side trait list                                                                                 |
| `Fonts`                 | Font definitions (8 sizes)                                                                             |
| `MapGrid`               | Map grid type (Rectangular/Isometric)                                                                  |
| `DefaultOrderGenerator` | Default order handler class                                                                            |
| `SpriteFormats`         | Supported sprite formats                                                                               |
| `SoundFormats`          | Supported audio formats                                                                                |
| `VideoFormats`          | Supported video formats                                                                                |
| `TerrainFormat`         | Terrain format handler                                                                                 |
| `SpriteSequenceFormat`  | Sprite sequence handler                                                                                |
| `GameSpeeds`            | Speed presets (slowest→fastest, 80ms→20ms)                                                             |
| `AssetBrowser`          | Asset browser extensions                                                                               |

---

## 36. World Traits (Global Game State)

| Trait                   | Purpose                            |
| ----------------------- | ---------------------------------- |
| `ActorMap`              | Spatial index of all actors (19KB) |
| `ActorMapOverlay`       | ActorMap debug visualization       |
| `ScreenMap`             | Screen-space actor lookup          |
| `ScreenShaker`          | Screen shake effects               |
| `DebugVisualizations`   | Debug rendering toggles            |
| `ColorPickerManager`    | Player color management            |
| `ValidationOrder`       | Order validation pipeline          |
| `OrderEffects`          | Order visual/audio feedback        |
| `AutoSave`              | Automatic save game                |
| `LoadWidgetAtGameStart` | Initial widget loading             |

---

## 37. Game Speed Configuration

| Speed   | Tick Interval |
| ------- | ------------- |
| Slowest | 80ms          |
| Slower  | 50ms          |
| Default | 40ms          |
| Fast    | 35ms          |
| Faster  | 30ms          |
| Fastest | 20ms          |

---

## 38. Damage Model

### Damage Flow
1. **Armament** fires **Projectile** at target
2. **Projectile** travels/hits using projectile-specific behavior
3. **Warhead(s)** applied at impact point
4. **Warhead** checks target validity (target types, stances)
5. **DamageWarhead** / **SpreadDamageWarhead** calculates raw damage
6. **Armor** type lookup against weapon's **Versus** table
7. **DamageMultiplier** traits modify final damage
8. **Health** reduced

### Key Damage Types
- **Spread damage** — Falloff over radius
- **Target damage** — Direct damage to specific target
- **Health percentage** — Percentage-based damage
- **Terrain damage** — `DamagedByTerrain` for standing in hazards

### Damage Modifiers
- `DamageMultiplier` — Generic incoming damage modifier
- `HandicapDamageMultiplier` — Player handicap
- `FirepowerMultiplier` — Outgoing damage modifier
- `HandicapFirepowerMultiplier` — Player handicap firepower
- `TerrainModifiesDamage` — Infantry terrain modifier (prone, etc.)

---

## 39. Developer / Debug Tools

### In-Game Debug
| Trait                      | Purpose                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `DeveloperMode`            | Instant build, give cash, unlimited power, build anywhere, fast charge, etc. |
| `CombatDebugOverlay`       | Combat range and target debug                                                |
| `ExitsDebugOverlay`        | Building exit debug                                                          |
| `ExitsDebugOverlayManager` | Manages exit overlays                                                        |
| `WarheadDebugOverlay`      | Warhead impact debug                                                         |
| `DebugVisualizations`      | Master debug toggle                                                          |
| `RenderDebugState`         | Actor state text debug                                                       |
| `DebugPauseState`          | Pause state debugging                                                        |

### Debug Overlays
| Overlay                         | Purpose              |
| ------------------------------- | -------------------- |
| `ActorMapOverlay`               | Actor spatial grid   |
| `TerrainGeometryOverlay`        | Terrain cell borders |
| `CustomTerrainDebugOverlay`     | Custom terrain types |
| `BuildableTerrainOverlay`       | Buildable cells      |
| `CellTriggerOverlay`            | Script cell triggers |
| `HierarchicalPathFinderOverlay` | Pathfinder hierarchy |
| `PathFinderOverlay`             | Path search debug    |
| `MarkerLayerOverlay`            | Map markers          |

### Performance Debug
| Widget/Logic      | Purpose                        |
| ----------------- | ------------------------------ |
| `PerfGraphWidget` | Render/tick performance graph  |
| `PerfDebugLogic`  | Performance statistics display |

### Asset Browser
| Logic               | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `AssetBrowserLogic` | Browse all mod sprites, audio, video assets |

---

## Summary Statistics

| Category                     | Count     |
| ---------------------------- | --------- |
| Actor Traits (root)          | ~130      |
| Render Traits                | ~80       |
| Condition Traits             | ~34       |
| Multiplier Traits            | ~20       |
| Building Traits              | ~35       |
| Player Traits                | ~27       |
| World Traits                 | ~55       |
| Attack Traits                | 7         |
| Air Traits                   | 4         |
| Infantry Traits              | 3         |
| Sound Traits                 | 9         |
| Palette Traits               | 17        |
| Palette Effects              | 5         |
| Power Traits                 | 5         |
| Radar Traits                 | 3         |
| Support Power Traits         | 10        |
| Crate Traits                 | 13        |
| Bot Modules                  | 12        |
| Projectile Types             | 8         |
| Warhead Types                | 15        |
| Widget Types                 | ~60       |
| Widget Logic Classes         | ~40+      |
| Lua Global APIs              | 16        |
| Lua Actor Properties         | 34        |
| Order Generators/Targeters   | 11        |
| **Total Cataloged Features** | **~700+** |
---
---

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
- `Conditions` component: `HashMap<ConditionId, u32>` (ref-counted named conditions per entity)
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

ECS implementation: a `Conditions` component holding a `HashMap<ConditionId, u32>` (ref-counted). Systems check `conditions.is_active("deployed")`. YAML `disabled_by` / `requires` fields map to runtime condition checks.

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

**Iron Curtain status:** Resolved as D038+D040 — SDK scenario editor & asset studio (OFP/Eden-inspired). Ships as part of the IC SDK (separate application from the game). Goes beyond OpenRA's map editor to include full mission logic editing: triggers with countdown/timeout timers and min/mid/max randomization, waypoints, pre-built modules (wave spawner, patrol route, guard position, reinforcements, objectives), visual connection lines, Probability of Presence per entity for replayability, compositions (reusable prefabs), layers, Simple/Advanced mode toggle, Test button, Game Master mode, Workshop publishing. The asset studio (D040) adds visual browsing, editing, and generation of game assets (sprites, palettes, terrain, chrome). See `09-DECISIONS.md` § D038 and § D040 for full design.

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

---

## Priority Assessment for Modder Familiarity

> **Status: All gameplay systems below are now designed.** See `02-ARCHITECTURE.md` § "Extended Gameplay Systems (RA1 Module)" for full component definitions, Rust structs, YAML examples, and system logic. The tables below are retained for priority reference during implementation.

### P0 — CRITICAL (Modders cannot work without these)

| #   | System                | Status            | Reference              |
| --- | --------------------- | ----------------- | ---------------------- |
| 1   | **Condition System**  | ✅ DESIGNED (D028) | Phase 2 exit criterion |
| 2   | **Multiplier System** | ✅ DESIGNED (D028) | Phase 2 exit criterion |
| 3   | **Warhead System**    | ✅ DESIGNED (D028) | Full damage pipeline   |

| 4   | **Building mechanics** | ✅ DESIGNED | `BuildArea`, `PrimaryBuilding`, `RallyPoint`, `Exit`, `Sellable`, `Repairable`, `Gate`, `LineBuild` |
| 5   | **Support Powers**     | ✅ DESIGNED | `SupportPower` component + `SupportPowerManager` resource |
| 6   | **Damage Model**       | ✅ DESIGNED (D028) | Full pipeline: Projectile → Warhead → Armor → Modifiers → Health |
| 7   | **Projectile System**  | ✅ DESIGNED | `Projectile` component + `projectile_system()` in tick pipeline |

### P1 — HIGH (Core gameplay gaps — noticeable to players immediately)

| #   | System                            | Status     | Reference                                                        |
| --- | --------------------------------- | ---------- | ---------------------------------------------------------------- |
| 8   | **Transport / Cargo**             | ✅ DESIGNED | `Cargo` / `Passenger` components                                 |
| 9   | **Capture / Engineers**           | ✅ DESIGNED | `Capturable` / `Captures` components                             |
| 10  | **Stealth / Cloak**               | ✅ DESIGNED | `Cloak` / `DetectCloaked` components                             |
| 11  | **Death mechanics**               | ✅ DESIGNED | `SpawnOnDeath`, `ExplodeOnDeath`, `SelfDestruct`, `DamageStates` |
| 12  | **Infantry sub-cell positioning** | ✅ DESIGNED | `InfantryBody` / `SubCell` enum                                  |
| 13  | **Veterancy system**              | ✅ DESIGNED | `GainsExperience` / `GivesExperience` + condition promotions     |
| 14  | **Docking system**                | ✅ DESIGNED | `DockClient` / `DockHost` components                             |
| 15  | **Transform / Deploy**            | ✅ DESIGNED | `Transforms` component                                           |
| 16  | **Power System**                  | ✅ DESIGNED | `Power` component + `PowerManager` resource                      |

### P2 — MEDIUM (Important for full experience)

| #   | System                  | Status            | Reference                                          |
| --- | ----------------------- | ----------------- | -------------------------------------------------- |
| 17  | **Crate System**        | ✅ DESIGNED        | `Crate` / `CrateAction`                            |
| 18  | **Mine System**         | ✅ DESIGNED        | `Mine` / `Minelayer`                               |
| 19  | **Guard Command**       | ✅ DESIGNED        | `Guard` / `Guardable`                              |
| 20  | **Crush Mechanics**     | ✅ DESIGNED        | `Crushable` / `Crusher`                            |
| 21  | **Notification System** | ✅ DESIGNED        | `NotificationType` enum + `NotificationCooldowns`  |
| 22  | **Cursor System**       | ✅ DESIGNED        | YAML-defined, contextual resolution                |
| 23  | **Hotkey System**       | ✅ DESIGNED        | `HotkeyConfig` categories, profiles                |
| 24  | **Lua API**             | ✅ DESIGNED (D024) | Strict superset of OpenRA                          |
| 25  | **Selection system**    | ✅ DESIGNED        | Priority, double-click, tab cycle, control groups  |
| 26  | **Palette effects**     | ✅ DESIGNED        | `PaletteEffect` enum                               |
| 27  | **Game speed presets**  | ✅ DESIGNED        | 5 presets (`SpeedPreset` enum), lobby-configurable |

### P3 — LOWER (Nice to have, can defer)

| #   | System                 | Status     | Reference                                         |
| --- | ---------------------- | ---------- | ------------------------------------------------- |
| 28  | **Demolition / C4**    | ✅ DESIGNED | `Demolition` component                            |
| 29  | **Plug System**        | ✅ DESIGNED | `Pluggable` / `Plug`                              |
| 30  | **Encyclopedia**       | ✅ DESIGNED | Categories, stats, previews                       |
| 31  | **Localization**       | ✅ DESIGNED | Fluent-based .ftl                                 |
| 32  | **Observer UI**        | ✅ DESIGNED | Overlays, player switching, broadcast delay       |
| 33  | **Replay browser UI**  | ⚠️ PARTIAL  | Format designed; browser UI deferred to Phase 3   |
| 34  | **Debug tools**        | ✅ DESIGNED | DeveloperMode flags, overlays, profiler           |
| 35  | **Procedural map gen** | ⚠️ PARTIAL  | Phase 7; scenario editor provides building blocks |
| 36  | **Faction system**     | ✅ DESIGNED | `Faction` YAML type with sides and tech trees     |

---

## What Iron Curtain Has That OpenRA Doesn't

The gap analysis is not one-directional. Iron Curtain's design docs include features OpenRA lacks:

| Feature                                                     | IC Design Doc                   | OpenRA Status                         |
| ----------------------------------------------------------- | ------------------------------- | ------------------------------------- |
| **LLM-generated missions & campaigns**                      | `04-MODDING.md`, Phase 7        | Not present                           |
| **Branching campaigns with persistent state**               | D021, `04-MODDING.md`           | Not present (linear campaigns only)   |
| **WASM mod runtime**                                        | `04-MODDING.md` Tier 3          | Not present (C# DLLs only)            |
| **Switchable balance presets**                              | D019                            | Not present (one balance per mod)     |
| **Sub-tick timestamped orders**                             | D008, `03-NETCODE.md`           | Not present                           |
| **Relay server architecture**                               | D007, `03-NETCODE.md`           | Not present (P2P only)                |
| **Cross-engine compatibility**                              | `07-CROSS-ENGINE.md`            | Not present                           |
| **Multi-game engine** (RA1+RA2+TD on one engine)            | D018, `02-ARCHITECTURE.md`      | Partial (3 games but tightly coupled) |
| **`llm:` metadata on all resources**                        | `04-MODDING.md`                 | Not present                           |
| **Weather system** (with sim effects)                       | `04-MODDING.md`                 | Visual only (WeatherOverlay trait)    |
| **Workshop with semantic search**                           | `04-MODDING.md`                 | Forum-based mod sharing               |
| **Mod SDK with CLI tool**                                   | D020, `04-MODDING.md`           | Exists but requires .NET              |
| **Competitive infrastructure** (rated, ranked, tournaments) | `01-VISION.md`                  | Basic (no ranked, no leagues)         |
| **Platform portability** (WASM, mobile, console)            | `02-ARCHITECTURE.md`            | Desktop only                          |
| **3D rendering mod support**                                | `02-ARCHITECTURE.md`            | Not architecturally possible          |
| **Signed/certified match results**                          | `06-SECURITY.md`                | Not present                           |
| **Video as workshop resource**                              | `04-MODDING.md`                 | Not present                           |
| **Scene templates** (parameterized mission building blocks) | `04-MODDING.md`                 | Not present                           |
| **Adaptive difficulty** (via campaign state or LLM)         | `04-MODDING.md`, `01-VISION.md` | Not present                           |
| **In-game Workshop browser** (search, filter, one-click)    | D030, `04-MODDING.md`           | Not present (forum sharing only)      |
| **Auto-download on lobby join** (CS:GO-style)               | D030, `03-NETCODE.md`           | Not present (manual install)          |
| **Steam Workshop as source** (optional, federated)          | D030, `04-MODDING.md`           | Not present                           |
| **Creator reputation & badges**                             | D030, `04-MODDING.md`           | Not present                           |
| **DMCA/takedown policy** (due process)                      | D030, `09-DECISIONS.md`         | Not present                           |
| **Creator recognition & tipping**                           | D035, `04-MODDING.md`           | Not present                           |
| **Achievement system** (engine + mod-defined)               | D036, `09-DECISIONS.md`         | Not present                           |
| **Community governance model** (elected reps, RFC process)  | D037, `09-DECISIONS.md`         | Core team only, no formal governance  |

---

## Mapping Table: OpenRA Trait → Iron Curtain Equivalent

For modders migrating from OpenRA, this table shows where each familiar trait maps.

| OpenRA Trait                              | Iron Curtain Equivalent                                       | Status |
| ----------------------------------------- | ------------------------------------------------------------- | ------ |
| `Health`                                  | `Health { current, max }`                                     | ✅      |
| `Armor`                                   | `Attackable { armor }`                                        | ✅      |
| `Mobile`                                  | `Mobile { speed, locomotor }`                                 | ✅      |
| `Building`                                | `Building { footprint }`                                      | ✅      |
| `Buildable`                               | `Buildable { cost, time, prereqs }`                           | ✅      |
| `Selectable`                              | `Selectable { bounds, priority, voice_set }`                  | ✅      |
| `Harvester`                               | `Harvester { capacity, resource }`                            | ✅      |
| `Armament`                                | `Armament { weapon, cooldown }`                               | ✅      |
| `Valued`                                  | Part of `Buildable.cost`                                      | ✅      |
| `Tooltip`                                 | `display.name` in YAML                                        | ✅      |
| `Voiced`                                  | `display.voice` in YAML                                       | ✅      |
| `ConditionalTrait`                        | `Conditions` component (D028)                                 | ✅      |
| `GrantConditionOn*`                       | Condition sources in YAML (D028)                              | ✅      |
| `*Multiplier`                             | `StatModifiers` component (D028)                              | ✅      |
| `AttackBase/Follow/Frontal/Omni/Turreted` | `AutoTarget`, `Turreted` components                           | ✅      |
| `AutoTarget`                              | `AutoTarget { stance, scan_range }`                           | ✅      |
| `Turreted`                                | `Turreted { turn_speed, offset, default_facing }`             | ✅      |
| `AmmoPool`                                | `AmmoPool { max, current, reload_ticks }`                     | ✅      |
| `Cargo` / `Passenger`                     | `Cargo { max_weight, slots }` / `Passenger { weight }`        | ✅      |
| `Capturable` / `Captures`                 | `Capturable { threshold }` / `Captures { types }`             | ✅      |
| `Cloak` / `DetectCloaked`                 | `Cloak { cloak_type, delay }` / `DetectCloaked { types }`     | ✅      |
| `Power` / `PowerManager`                  | `Power { provides, consumes }` / `PowerManager` resource      | ✅      |
| `SupportPower*`                           | `SupportPower { charge_ticks, ready_sound, effect }`          | ✅      |
| `GainsExperience` / `GivesExperience`     | `GainsExperience { levels }` / `GivesExperience { amount }`   | ✅      |
| `Locomotor`                               | `locomotor` field in `Mobile`                                 | ✅      |
| `Aircraft`                                | `locomotor: fly` + `Mobile` with air-type locomotor           | ⚠️      |
| `ProductionQueue`                         | `ProductionQueue { queue_type, items }`                       | ✅      |
| `Crate` / `CrateAction*`                  | `Crate { action_pool }` / `CrateAction` enum                  | ✅      |
| `Mine` / `Minelayer`                      | `Mine { trigger_types, warhead }` / `Minelayer { mine_type }` | ✅      |
| `Guard` / `Guardable`                     | `Guard { target, leash_range }` / `Guardable` marker          | ✅      |
| `Crushable` / `AutoCrusher`               | `Crushable { crush_class }` / `Crusher { crush_classes }`     | ✅      |
| `Transforms`                              | `Transforms { into, delay, facing, condition }`               | ✅      |
| `Sellable`                                | `Sellable` marker + sell order                                | ✅      |
| `RepairableBuilding`                      | `Repairable { repair_rate, repair_cost_per_hp }` component    | ✅      |
| `RallyPoint`                              | `RallyPoint { position }` component                           | ✅      |
| `PrimaryBuilding`                         | `PrimaryBuilding` marker component                            | ✅      |
| `Gate`                                    | `Gate { open_ticks, close_delay }` component                  | ✅      |
| `LineBuild` (walls)                       | `LineBuild { segment_types }` component                       | ✅      |
| `BaseProvider` / `GivesBuildableArea`     | `BuildArea { range }` component                               | ✅      |
| `Faction`                                 | `Faction { id, side, tech_tree }` YAML-defined                | ✅      |
| `Encyclopedia`                            | In-game encyclopedia (categories, stats, previews)            | ✅      |
| `DeveloperMode`                           | `DeveloperMode` flags (`#[cfg(feature = "dev-tools")]`)       | ✅      |
| `WithInfantryBody` (sub-cell)             | `InfantryBody { sub_cell }` with `SubCell` enum               | ✅      |
| `ScaredyCat` / `TakeCover`                | `ScaredyCat` / `TakeCover` components                         | ✅      |
| `KillsSelf`                               | `SelfDestruct { delay, warhead }` component                   | ✅      |
| `SpawnActorOnDeath`                       | `SpawnOnDeath { actor, probability }` component               | ✅      |
| `Husk`                                    | Part of death mechanics (husk actor + `DamageStates`)         | ✅      |

---

## Recommended Action Plan

### Phase 2 Additions (Sim — Months 6–12)

These gaps need to be designed *before or during* Phase 2 since they're core simulation mechanics.

> **NOTE:** Items 1–3 are now **Phase 2 hard exit criteria** per D028. Items marked with (D029) are Phase 2 deliverables per D029. The Lua API (#24) is specified per D024.

1. **Condition system** — ✅ DESIGNED (D028) — Phase 2 exit criterion
2. **Multiplier system** — ✅ DESIGNED (D028) — Phase 2 exit criterion
3. **Full damage pipeline** — ✅ DESIGNED (D028) — Phase 2 exit criterion (Projectile → Warhead → Armor table → Modifiers → Health)
4. **Power system** — ✅ DESIGNED — `Power` component + `PowerManager` resource
5. **Building mechanics** — ✅ DESIGNED — `BuildArea`, `PrimaryBuilding`, `RallyPoint`, `Exit`, `Sellable`, `Repairable`, `Gate`, `LineBuild`
6. **Transport/Cargo** — ✅ DESIGNED — `Cargo` / `Passenger` components
7. **Capture** — ✅ DESIGNED — `Capturable` / `Captures` components
8. **Stealth/Cloak** — ✅ DESIGNED — `Cloak` / `DetectCloaked` components
9. **Infantry sub-cell** — ✅ DESIGNED — `InfantryBody` / `SubCell` enum
10. **Death mechanics** — ✅ DESIGNED — `SpawnOnDeath`, `ExplodeOnDeath`, `SelfDestruct`, `DamageStates`
11. **Transform/Deploy** — ✅ DESIGNED — `Transforms` component
12. **Veterancy** (full system) — ✅ DESIGNED — `GainsExperience` / `GivesExperience` + condition-based promotions
13. **Guard command** — ✅ DESIGNED — `Guard` / `Guardable` components
14. **Crush mechanics** — ✅ DESIGNED — `Crushable` / `Crusher` components

### Phase 3 Additions (UI — Months 12–16)

15. **Support Powers** — ✅ DESIGNED — `SupportPower` component + `SupportPowerManager` resource
16. **Cursor system** — ✅ DESIGNED — YAML-defined cursors, contextual resolution, force-modifiers
17. **Hotkey system** — ✅ DESIGNED — `HotkeyConfig` categories, rebindable, profiles
18. **Notification framework** — ✅ DESIGNED — `NotificationType` enum + `NotificationCooldowns` + EVA mapping
19. **Selection details** — ✅ DESIGNED — Priority, double-click, tab cycle, control groups, selection limit
20. **Game speed presets** — ✅ DESIGNED — 5 presets (`SpeedPreset` enum), lobby-configurable, runtime adjustable in SP
21. **Radar system** (detailed) — ⚠️ PARTIAL — Minimap rendering is ic-ui responsibility; `AppearsOnRadar` implied but not a standalone component
22. **Power bar UI** — Part of ic-ui chrome design (Phase 3)
23. **Observer UI** — ✅ DESIGNED — Army/production/economy overlays, player switching, broadcast delay

### Phase 4 Additions (Scripting — Months 16–20)

24. **Lua API specification** — ✅ DESIGNED (D024) — strict superset of OpenRA's 16 globals, identical signatures
25. **Crate system** — ✅ DESIGNED — `Crate` component + `CrateAction` variants
26. **Mine system** — ✅ DESIGNED — `Mine` / `Minelayer` components
27. **Demolition/C4** — ✅ DESIGNED — `Demolition` component

### Phase 6a/6b Additions (Modding & Ecosystem — Months 26–32)

28. **Debug/developer tools** — ✅ DESIGNED — DeveloperMode flags, overlays, profiler, asset browser
29. **Encyclopedia** — ✅ DESIGNED — In-game encyclopedia with categories, stats, previews
30. **Localization framework** — ✅ DESIGNED — Fluent-based .ftl files, locale resource, CJK/RTL support
31. **Faction system** (formal) — ✅ DESIGNED — `Faction` YAML type with side grouping and tech trees
32. **Palette effects** (runtime) — ✅ DESIGNED — `PaletteEffect` enum (flash, fade, tint, cycle, remap)
33. **Asset browser** — ✅ DESIGNED — Part of IC SDK (D040)