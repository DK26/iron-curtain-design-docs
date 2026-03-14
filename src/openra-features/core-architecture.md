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
