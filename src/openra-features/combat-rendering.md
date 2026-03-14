# Combat, Rendering & Effects

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
