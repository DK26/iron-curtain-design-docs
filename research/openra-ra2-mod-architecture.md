# OpenRA/ra2 — Architectural Research

> **Repository:** [OpenRA/ra2](https://github.com/OpenRA/ra2) (branch: `main`, engine: `release-20231010`)
> **Purpose:** Architectural reference for building RA2-compatible game module in Rust/Bevy (Iron Curtain engine)

---

## Table of Contents

1. [Repository Structure & Mod Manifest](#1-repository-structure--mod-manifest)
2. [Trait-Based Architecture (C# Custom Code)](#2-trait-based-architecture-c-custom-code)
3. [YAML Rules & Unit Definitions](#3-yaml-rules--unit-definitions)
4. [Locomotor System](#4-locomotor-system)
5. [Mind Control Mechanics](#5-mind-control-mechanics)
6. [Chronoshift Mechanics](#6-chronoshift-mechanics)
7. [Iron Curtain Mechanics](#7-iron-curtain-mechanics)
8. [Support Powers (Nuclear, Weather Control)](#8-support-powers-nuclear-weather-control)
9. [Carrier/Spawner System](#9-carrierspawner-system)
10. [Radiation System](#10-radiation-system)
11. [Tesla/Electric Bolt System](#11-teslaelectric-bolt-system)
12. [Mirage/Disguise System](#12-miragedisguise-system)
13. [Deploy Mechanics](#13-deploy-mechanics)
14. [Veterancy/Experience System](#14-veterancyexperience-system)
15. [Voxel Model Handling](#15-voxel-model-handling)
16. [RA2-Specific File Formats](#16-ra2-specific-file-formats)
17. [AI System](#17-ai-system)
18. [Weapon System Architecture](#18-weapon-system-architecture)
19. [Faction & Prerequisite System](#19-faction--prerequisite-system)
20. [Design Implications for Iron Curtain](#20-design-implications-for-iron-curtain)

---

## 1. Repository Structure & Mod Manifest

### Directory Layout

```
OpenRA/ra2/
├── OpenRA.Mods.RA2/          # C# custom traits/code (compiled to DLL)
│   ├── Activities/            # Custom activity types
│   ├── FileSystem/            # BAG/IDX audio archive loader
│   ├── Graphics/              # Custom renderables (arcs, electric bolts, radiation)
│   ├── Projectiles/           # Custom projectile types
│   ├── Traits/                # Core RA2-specific traits
│   │   ├── Conditions/        # Timed condition grants
│   │   ├── Render/            # Rendering decorations/overlays
│   │   └── World/             # World-level systems (radiation layer)
│   ├── Warheads/              # Custom warhead types
│   ├── Widgets/               # UI widgets (power meter)
│   └── UtilityCommands/       # Map import tool
├── mods/ra2/
│   ├── mod.yaml               # Master manifest
│   ├── rules/                 # 26 YAML rule files
│   ├── weapons/               # 9 weapon YAML files
│   ├── sequences/             # 15 sequence definition files
│   ├── tilesets/              # temperat, snow, urban
│   ├── audio/                 # music, voices, notifications
│   ├── chrome/                # UI definitions
│   ├── bits/                  # Sprite sheets (cameos, structures, animations)
│   └── maps/                  # Bundled maps
└── packaging/                 # Distribution configs
```

### Mod Manifest (`mod.yaml`)

Key configuration from the mod manifest:

```yaml
Metadata:
    Title: Red Alert 2
    Version: {DEV_VERSION}

# Map grid: isometric rectangular tiles
MapGrid:
    TileSize: 60,30
    Type: RectangularIsometric
    EnableDepthBuffer: true
    MaximumTerrainHeight: 16
    SubCellOffsets: 0,0,0, -362,0,0, 362,0,0
    DefaultSubCell: 1

# Asset format support
SpriteFormats: ShpTS, TmpTS, ShpTD, PngSheet
SoundFormats: Aud, Wav
VideoFormats: Vqa
ModelSequenceFormat: VoxelModelSequence
SpriteSequenceFormat: TilesetSpecificSpriteSequence

# Package (archive) formats
PackageFormats: Mix, AudioBag

# Loaded assemblies
Assemblies:
    common|OpenRA.Mods.Common.dll
    cnc|OpenRA.Mods.Cnc.dll
    ra2|OpenRA.Mods.RA2.dll
```

The manifest references ~20 `.mix` archives for game assets:
- `ra2.mix`, `language.mix`, `multi.mix`, `audio.mix`
- Tileset-specific: `isotemp.mix`, `isosnow.mix`, `isourb.mix`
- Content: `temperat.mix`, `snow.mix`, `urban.mix`
- Asset groups: `tem.mix`, `sno.mix`, `urb.mix`

### Rules Loading Order

26 rule files loaded in order (from `mod.yaml`):
```
defaults, world, palettes, player, proxy-actors, ai,
allied-structures, soviet-structures, tech-structures,
allied-infantry, soviet-infantry, allied-vehicles, soviet-vehicles,
allied-naval, soviet-naval, aircraft, ships (not found),
civilian-structures, civilian-vehicles, civilian-naval, civilians,
animals, bridges, trees, civilian-props, misc
```

### Weapons Files (9)

```
defaults, bullets, explosions, flaks, melee, mgs, misc, missiles, zaps
```

---

## 2. Trait-Based Architecture (C# Custom Code)

OpenRA uses a trait-based composition system similar to ECS. Actors are composed of traits defined in YAML. The OpenRA/ra2 mod adds ~30 custom C# types on top of OpenRA.Mods.Common and OpenRA.Mods.Cnc.

### Custom Trait Inventory

| File                                 | Trait                             | Purpose                                               |
| ------------------------------------ | --------------------------------- | ----------------------------------------------------- |
| `MindController.cs`                  | `MindController`                  | Controls other units (Yuri)                           |
| `MindControllable.cs`                | `MindControllable`                | Can be mind-controlled                                |
| `CarrierParent.cs`                   | `CarrierParent`                   | Manages spawned child aircraft (Aircraft Carrier)     |
| `BaseSpawnerParent.cs`               | `BaseSpawnerParent`               | Base class for spawner systems                        |
| `CarrierChild.cs`                    | `CarrierChild`                    | Spawned aircraft behavior                             |
| `BaseSpawnerChild.cs`                | `BaseSpawnerChild`                | Base class for spawned units                          |
| `ChronoResourceDelivery.cs`          | `ChronoResourceDelivery`          | Chrono Miner teleport to refinery                     |
| `ChronoshiftableWithSpriteEffect.cs` | `ChronoshiftableWithSpriteEffect` | Chronoshift with warp-in/out sprites                  |
| `Mirage.cs`                          | `Mirage`                          | Disguise as terrain object (Mirage Tank)              |
| `PeriodicExplosion.cs`               | `PeriodicExplosion`               | Repeating weapon at actor position (Desolator deploy) |
| `SpawnSurvivors.cs`                  | `SpawnSurvivors`                  | Spawn infantry on building destruction                |
| `WeatherControlSupportPower.cs`      | `WeatherControlSupportPower`      | Lightning Storm support power                         |
| `DamagedByTintedCells.cs`            | `DamagedByTintedCells`            | Take damage from radiation                            |
| `GrantTimedConditionOnDeploy.cs`     | `GrantTimedConditionOnDeploy`     | Deploy grants temporary condition (Yuri psi-wave)     |

### Custom Projectile Types

| File              | Type           | Purpose                                 |
| ----------------- | -------------- | --------------------------------------- |
| `ElectricBolt.cs` | `ElectricBolt` | Tesla weapon bolt (procedural segments) |
| `ArcLaserZap.cs`  | `ArcLaserZap`  | Mind control arc beam                   |
| `RadBeam.cs`      | `RadBeam`      | Desolator radiation beam                |

### Custom Renderables

| File                        | Type                     | Purpose                            |
| --------------------------- | ------------------------ | ---------------------------------- |
| `ArcRenderable.cs`          | `ArcRenderable`          | Renders curved arcs                |
| `ElectricBoltRenderable.cs` | `ElectricBoltRenderable` | Renders segmented electric bolts   |
| `RadBeamRenderable.cs`      | `RadBeamRenderable`      | Renders radiation beams            |
| `TintedCell.cs`             | `TintedCell`             | Renders radiation overlay on cells |

### Custom Rendering Traits

| File                                  | Trait                       | Purpose                            |
| ------------------------------------- | --------------------------- | ---------------------------------- |
| `WithVoxelHelicopterBody.cs`          | `WithVoxelHelicopterBody`   | Animated voxel for helicopters     |
| `WithMirageSpriteBody.cs`             | `WithMirageSpriteBody`      | Switches sprite when disguised     |
| `WithMindControlArc.cs`               | `WithMindControlArc`        | Draws arc from controller to slave |
| `WithMindControllerPipsDecoration.cs` | Pip display                 | Shows control slots                |
| `WithCarrierParentPipsDecoration.cs`  | Pip display                 | Shows carrier slots                |
| `WithExitOverlay.cs`                  | `WithExitOverlay`           | Factory door animation             |
| `WithTurretDeployAnimation.cs`        | `WithTurretDeployAnimation` | Turret deploy/undeploy animation   |

### World-Level Traits

| File                      | Trait                  | Purpose                                |
| ------------------------- | ---------------------- | -------------------------------------- |
| `TintedCellsLayer.cs`     | `TintedCellsLayer`     | Per-cell radiation level tracking      |
| `WeatherPaletteEffect.cs` | `WeatherPaletteEffect` | Palette tinting during lightning storm |

### Custom Warheads

| File                          | Type                | Purpose                           |
| ----------------------------- | ------------------- | --------------------------------- |
| `CreateTintedCellsWarhead.cs` | `CreateTintedCells` | Adds radiation to cells on impact |

### Pattern: Trait Interface Contracts

Key interfaces implemented by RA2 traits:
- `INotifyAttack` — MindController hooks into attacks
- `INotifyKilled` / `INotifyActorDisposing` — cleanup on death
- `INotifyOwnerChanged` — MindControllable restores owner
- `ITick` — per-tick logic (radiation decay, periodic explosion, carrier rearm)
- `ITickRender` — per-render-frame updates (radiation cell visibility)
- `ConditionalTrait<T>` / `PausableConditionalTrait<T>` — condition-gated behavior

---

## 3. YAML Rules & Unit Definitions

### Template Inheritance System

RA2 uses `^TemplateActor` prefixed actors as abstract templates. Units inherit from these:

```yaml
# Abstract templates (never instantiated)
^ExistsInWorld     # Base for all world actors
^SpriteActor       # Sprite rendering base
^Building          # Building base
^BaseBuilding      # Player-buildable building
^Infantry          # Infantry movement, health, selection
^Vehicle           # Vehicle movement, health, rendering
^Aircraft          # Aircraft movement, VTOL/plane variants
^Wall              # Wall base
^TechBuilding      # Capturable tech structures

# Composite templates (mix-in)
^MindControllable  # Adds MindControllable + WithMindControlArc + target type
^IronCurtainable   # Adds invulnerability condition system
^ChronoDisable     # Pauses Mobile on chronodisable condition
^VoxelLighting     # Standard voxel render settings (Scale: 11.7)
^AutoTargetGround / ^AutoTargetAir / ^AutoTargetAll  # Auto-target presets
```

### Inheritance Example

```yaml
htnk:                                    # Rhino Heavy Tank
    Inherits: ^Vehicle                    # Gets all vehicle defaults
    Inherits@AUTOTARGET: ^AutoTargetGroundAssaultMove
    Inherits@MC: ^MindControllable        # Can be mind-controlled
    Valued:
        Cost: 900
    Tooltip:
        Name: Rhino Heavy Tank
    Mobile:
        Speed: 90
        TurnSpeed: 20
        Locomotor: heavytracked           # Crushes infantry + walls
    Health:
        HP: 400
    Armor:
        Type: Heavy
    Turreted:
        TurnSpeed: 20
    Armament@primary:
        Weapon: 120mm
        LocalOffset: 768,0,512            # Turret mount point
        MuzzleSequence: muzzle
        RequiresCondition: !rank-elite
    Armament@elite:
        Weapon: 120mmE                    # Upgraded weapon at elite rank
        RequiresCondition: rank-elite
    RenderVoxels:
        NormalsPalette: ts-normals        # Voxel lighting palette
    WithVoxelBody:                        # Voxel hull
    WithVoxelTurret:                      # Voxel turret
    WithVoxelBarrel:                      # Voxel barrel (recoil)
```

### Trait Removal Syntax

Prefixing a trait with `-` removes it from an inherited template:

```yaml
dron:                                     # Terror Drone
    Inherits: ^Vehicle
    -RenderVoxels:                        # Remove voxel rendering
    WithInfantryBody:                     # Use sprite-based body instead
```

### Trait Instance Keys

The `@key` suffix allows multiple instances of the same trait type:

```yaml
    Armament@primary:
        Weapon: 120mm
        RequiresCondition: !rank-elite
    Armament@elite:
        Weapon: 120mmE
        RequiresCondition: rank-elite
    Armament@antiair:
        Weapon: MammothTusk
```

---

## 4. Locomotor System

Defined in `rules/world.yaml`. Locomotors control movement physics, terrain passability, and crushing behavior.

### Locomotor Definitions

| Name           | Type           | Speed Mult                                       | Crush Class            | Notes                              |
| -------------- | -------------- | ------------------------------------------------ | ---------------------- | ---------------------------------- |
| `foot`         | Infantry       | Road: 100%, Clear: 100%, Rough: 100%, Rail: 100% | —                      | Basic infantry                     |
| `swimsuit`     | Infantry+Water | Water: 100%                                      | —                      | SEAL, Tanya (amphibious)           |
| `flameguy`     | Slow Infantry  | Clear: 33%                                       | —                      | Desolator (slow)                   |
| `wheeled`      | Vehicle        | Road: 150%, Rough: 75%                           | crushable              | Standard cars                      |
| `tracked`      | Vehicle        | Road: 125%, Rough: 80%                           | crushable              | Standard tanks                     |
| `heavytracked` | Vehicle        | Road: 125%, Rough: 80%                           | crushable, intfcr wall | Heavy tanks crush infantry + walls |
| `naval`        | Ship           | Water only                                       | —                      | Ships                              |
| `lcraft`       | Landing Craft  | Water + Beach/Clear/Road                         | —                      | Amphibious transport               |

Key locomotor properties:
```yaml
Locomotor@tracked:
    Name: tracked
    Crushes: crushable
    CrushDamageTypes: Crush
    SharesCell: false
    TerrainSpeeds:
        Clear: 100
        Rough: 80
        Road: 125
        DirtRoad: 100
        Rail: 100
        Beach: 80
        Ore: 100
        Gems: 100
```

### `heavytracked` vs `tracked`

The critical difference: `heavytracked` adds crush classes for infantry and walls:
```yaml
Locomotor@heavytracked:
    Crushes: crushable, intfcr wall
    # intfcr = infantry crush, wall = wall crush
```

---

## 5. Mind Control Mechanics

### Architecture

Mind control spans two C# traits, two rendering traits, a weapon, and a projectile:

```
MindController (on attacker) ←→ MindControllable (on target)
        ↓                              ↓
 WithMindControllerPips           WithMindControlArc
        ↓                              ↓
  MindControl weapon         ArcLaserZap projectile
```

### MindController Trait (`MindController.cs`)

```csharp
public class MindControllerInfo : PausableConditionalTraitInfo
{
    public readonly string[] ArmamentNames = { "primary" };
    public readonly int Capacity = 1;           // Max simultaneous slaves
    public readonly bool DiscardOldest = true;   // Release oldest when full
    public readonly string ControllingCondition = null;  // Granted per slave
    public readonly string[] Sounds = {};
}
```

Key behaviors:
- Maintains `List<Actor> slaves` tracking controlled units
- On attack: validates target has `MindControllable` trait, calls `slave.LinkMaster(self)`
- On kill/dispose: calls `ReleaseSlaves()` — all slaves revert to original owner
- `ControllingCondition` is stacked via tokens — one token per slave

### MindControllable Trait (`MindControllable.cs`)

```csharp
public class MindControllableInfo : PausableConditionalTraitInfo
{
    public readonly string Condition = null;      // Granted while controlled
    public readonly string[] RevokeControlSounds = {};
    public readonly string FallbackOwner = "Creeps";  // If original player eliminated
}
```

Key behaviors:
- `LinkMaster()`: Changes unit owner to master's owner, stores original owner
- `RevokeMindControl()`: Restores original owner (or FallbackOwner if player dead)
- Implements `INotifyKilled` — notifies master when slave dies

### YAML Configuration

```yaml
# Template (defaults.yaml)
^MindControllable:
    MindControllable:
    WithMindControlArc:
    Targetable:
        TargetTypes: MindControl

# Yuri (soviet-infantry.yaml)
yuri:
    MindController:
        Capacity: 1
    WithMindControllerPipsDecoration:
    Armament:
        Weapon: MindControl

# Yuri Prime
intpsi:
    MindController:
        Capacity: 3
    Armament:
        Weapon: SuperMindControl    # Range: 30c0 (enormous)
```

### MindControl Weapon (`weapons/misc.yaml`)

```yaml
MindControl:
    ReloadDelay: 200
    Range: 7c0
    ValidTargets: MindControl
    Projectile: ArcLaserZap
        UsePlayerColor: true
        Width: 63
        Angle: 120
        ZOffset: 2047
    Warhead@1Dam: TargetDamage
        Damage: 0           # No actual damage — control is the effect

SuperMindControl:
    Inherits: MindControl
    Range: 30c0              # Map-wide range for Yuri Prime
```

---

## 6. Chronoshift Mechanics

### Components

1. **Chronosphere structure** (`gacsph`) — building with `ChronoshiftPower` support power
2. **ChronoshiftableWithSpriteEffect** — trait on teleportable units
3. **ChronoResourceDelivery** — Chrono Miner auto-teleport to refinery
4. **Chrono Disable** — stun effect on chronoshifted units

### Chronosphere Building (`allied-structures.yaml`)

```yaml
gacsph:
    ChronoshiftPower@chronoshift:
        OrderName: Chronoshift
        ChargeInterval: 7500         # ~5 minutes at default speed
        KillCargo: False
        Dimensions: 3, 3             # 3x3 selection area
        Footprint: xxx xxx xxx
        SelectionCursor: chronosphere
        TargetCursor: chronosphere
```

### ChronoshiftableWithSpriteEffect (`ChronoshiftableWithSpriteEffect.cs`)

Extends the base `Chronoshiftable` from OpenRA.Mods.Cnc with visual warp effects:

```csharp
public override bool Teleport(Actor self, CPos targetLocation, int duration,
                               bool killCargo, Actor chronosphere)
{
    // Add warp-in effect at source
    w.Add(new SpriteEffect(cachedSourcePosition, w, image,
                           info.WarpInSequence, info.Palette));
    // Add warp-out effect at destination
    w.Add(new SpriteEffect(cachedTargetPosition, w, image,
                           info.WarpOutSequence, info.Palette));
    return base.Teleport(self, targetLocation, duration, killCargo, chronosphere);
}
```

### Chrono Miner Teleport (`ChronoResourceDelivery.cs`)

The Chrono Miner checks periodically while moving to refinery whether it can teleport directly:

```csharp
// Every CheckTeleportDelay ticks, check if close enough to teleport
if (info.TeleportCondition != null && /* ... */)
{
    // Cancel movement, start ChronoResourceTeleport activity
    self.QueueActivity(new ChronoResourceTeleport(/* ... */));
}
```

YAML configuration on the Chrono Miner (`cmin`):
```yaml
cmin:
    ChronoResourceDelivery:
        WarpInSequence: chronoshift-in
        WarpOutSequence: chronoshift-out
```

### Chrono Disable Template (`defaults.yaml`)

```yaml
^ChronoDisable:
    Mobile:
        PauseOnCondition: chronodisable
    GrantConditionOnDamage:
        # When hit by NeutronRifle weapon, receives chronodisable condition
```

The `NeutronRifle` weapon (Chrono Legionnaire equivalent) applies chrono freeze:
```yaml
NeutronRifle:
    Warhead@Disable: GrantExternalCondition
        Duration: 250
        Condition: chronodisable, notmobile
```

---

## 7. Iron Curtain Mechanics

### Implementation Pattern

Iron Curtain uses OpenRA's condition system rather than a custom trait:

```yaml
# Template (defaults.yaml)
^IronCurtainable:
    ExternalCondition@INVULNERABILITY:
        Condition: invulnerability
    DamageMultiplier@INVULNERABLE:
        Modifier: 0                     # 0% damage = invulnerable
        RequiresCondition: invulnerability
    TimedConditionBar@INVULNERABLE:
        Condition: invulnerability
        Color: 660099                   # Purple bar
```

### Iron Curtain Building (`soviet-structures.yaml`)

```yaml
nairon:
    GrantExternalConditionPower@IRONCURTAIN:
        Icon: invuln
        ChargeInterval: 7500            # ~5 minutes
        Name: Iron Curtain
        Description: Makes a group of units invulnerable\nfor 20 seconds.
        Duration: 500                   # 500 ticks = ~20 seconds
        Condition: invulnerability       # Grants the condition from ^IronCurtainable
        Dimensions: 3, 3               # 3x3 selection area
        Footprint: xxx xxx xxx
```

### Design Insight

Iron Curtain in OpenRA/ra2 is **entirely data-driven** — no custom C# code required. It uses:
1. `GrantExternalConditionPower` (a support power that grants a condition)
2. `ExternalCondition` (accepts the condition)
3. `DamageMultiplier` (reduces damage to 0% when condition active)
4. `TimedConditionBar` (displays duration)

This is a model for how IC's YAML-driven modding should work.

---

## 8. Support Powers (Nuclear, Weather Control)

### Nuclear Missile Silo (`soviet-structures.yaml`)

```yaml
namisl:
    NukePower:
        ChargeInterval: 15000          # ~10 minutes
        MissileWeapon: atomic
        MissileDelay: 35
        FlightDelay: 200
        SpawnOffset: 0,0,-1c0
        MissileImage: atomic
        TrailImage: nukesmoke
        TrailInterval: 2
        CameraRange: 10
        CircleRanges: 9c0, 8c0, 7c0, 6c0, 5c0, 4c0, 3c0, 2c0, 1c0
```

### Weather Control Device (`allied-structures.yaml`)

The Weather Controller uses a custom C# support power (`WeatherControlSupportPower.cs`):

```yaml
gaweat:
    WeatherControlSupportPower@LightningStorm:
        ChargeInterval: 15000
        Weapon: LightningStorm
        PaletteEffectType: LightningStorm
```

#### WeatherControlSupportPower Implementation

```csharp
public class WeatherControlSupportPowerInfo : SupportPowerInfo
{
    public readonly int Duration = 80;
    public readonly int HitDelay = 8;        // Ticks between main strikes
    public readonly int ScatterDelay = 4;     // Ticks between scatter strikes
    public readonly int ScatterCount = 5;     // Random scatter impacts
    public readonly int[] OffsetsX = { -3, -2, -1, 0, 1, 2, 3 };
    public readonly int[] OffsetsY = { -3, -2, -1, 0, 1, 2, 3 };
    public readonly string PaletteEffectType = null;
}
```

Tick behavior:
1. Activates palette effect (darkens screen)
2. Every `HitDelay` ticks: fires `LightningStorm` weapon at target
3. Every `ScatterDelay` ticks: fires at random offset positions within range
4. After `Duration` ticks: ends

### LightningStorm Weapon (`weapons/zaps.yaml`)

```yaml
LightningStorm:
    ReloadDelay: 0
    Range: 7c0
    Projectile: InstantHit
        Blockable: false
    Warhead@2Dam: SpreadDamage
        Delay: 56               # Visual buildup before damage
        Spread: 3c0
        Damage: 165
        Versus:
            Concrete: 3          # Almost no damage to heavy structures
    Warhead@3Eff: CreateEffect
        Delay: 56
        Explosions: weatherbolt1, weatherbolt2, weatherbolt3
        ImpactSounds: sweastra.wav, sweastrb.wav, sweastrc.wav, sweastrd.wav
```

### Psychic Sensor (`soviet-structures.yaml`)

```yaml
napsis:
    Tooltip:
        Name: Psychic Sensor
    DetectCloaked:
        Range: 6c0
    RenderDetectionCircle:
    Power:
        Amount: -100
```

---

## 9. Carrier/Spawner System

### Two-Layer Architecture

```
BaseSpawnerParent (abstract)     BaseSpawnerChild (abstract)
        ↓                                ↓
   CarrierParent                    CarrierChild
```

### BaseSpawnerParent (`BaseSpawnerParent.cs`)

```csharp
public class BaseSpawnerParentInfo : ConditionalTraitInfo
{
    public readonly string[] Actors;              // Child actor types
    public readonly int InitialActorCount = -1;   // -1 = all
    public readonly int RespawnTicks = 150;        // Respawn delay
    public readonly bool SpawnAllAtOnce = true;
    public readonly SpawnerChildDisposal ChildDisposalOnKill = DoNothing;
    public readonly SpawnerChildDisposal ChildDisposalOnOwnerChange = DoNothing;
}

public enum SpawnerChildDisposal { DoNothing, KillChildren, GiveChildrenToAttacker }
```

Manages array of `BaseSpawnerChildEntry` — each has `Actor`, `ActorName`, respawn timer.

### CarrierParent (`CarrierParent.cs`)

Extends `BaseSpawnerParent` with aircraft-specific behavior:

```csharp
public class CarrierParentInfo : BaseSpawnerParentInfo
{
    public readonly int RearmTicks = 150;         // Time to reload in carrier
    public readonly bool InstantRepair = true;    // Heal on return
    public readonly string LaunchingCondition;    // Condition while launching
    public readonly string LoadedCondition;       // Condition when child docked
}
```

Key behaviors:
- On attack: launches all children at target
- Children already launched: re-issues target order
- On becoming idle: recalls all children
- Respawn timer for dead children

### YAML Configuration

Aircraft Carrier:
```yaml
# The carrier weapon triggers child launches (weapons/misc.yaml)
HornetLauncher:
    ReloadDelay: 30
    Range: 25c0
    ValidTargets: Ground, Water
    Projectile: InstantHit
    Warhead@1Dam: TargetDamage

# Hornet child aircraft (rules/aircraft.yaml)
hornet:
    Inherits: ^Aircraft
    CarrierChild:
        MasterActorType: intac     # Parent carrier actor name
    Rearmable:
        RearmActors: intac
```

Destroyer with ASW Osprey:
```yaml
# ASW launcher for underwater targets
ASWLauncher:
    ReloadDelay: 150
    Range: 8c0
    ValidTargets: Underwater
    
# Osprey child definition
intosprey:
    CarrierChild:
        MasterActorType: intdest   # Destroyer
```

---

## 10. Radiation System

### Architecture

Radiation in RA2 is a world-level cell layer, not a per-actor effect:

```
CreateTintedCellsWarhead → TintedCellsLayer → TintedCell (per-cell)
                                    ↓
                          DamagedByTintedCells (on actors)
```

### TintedCellsLayer (`TintedCellsLayer.cs`)

```csharp
public class TintedCellsLayerInfo : TraitInfo
{
    public readonly Color Color = Color.FromArgb(0, 255, 0);  // Green
    public readonly int MaxLevel = 500;
    public readonly int UpdateDelay = 15;      // Ticks between decay steps
    public readonly int Darkest = 4;           // Alpha at level 1
    public readonly int Brightest = 64;        // Alpha at max level
    public readonly int FadeoutDelay = 150;    // Half-life in ticks
    public readonly FadeoutType FadeoutType = FadeoutType.Logarithmic;
}
```

Uses `Dictionary<CPos, TintedCell>` — sparse storage, only cells with radiation.
Decay is logarithmic by default: `decreaseLevel = FalloutScale * level / 1000`

### Radiation Creation (weapons)

```yaml
# Desolator deploy creates radiation (weapons/zaps.yaml)
RadEruptionWeapon:
    Warhead@1Radiation: CreateTintedCells
        Spread: 2c0
        Falloff: 100, 75, 50, 25, 0
        Level: 250
        MaxLevel: 500
```

### World Configuration

```yaml
# world.yaml
TintedCellsLayer@radiation:
    Darkest: 4
    Brightest: 64
```

---

## 11. Tesla/Electric Bolt System

### ElectricBolt Projectile (`ElectricBolt.cs`)

Not sprite-based — procedurally generated segmented bolt:

```csharp
public class ElectricBoltInfo : IProjectileInfo
{
    public readonly int Width = 48;
    public readonly int Duration = 2;           // Render frames
    public readonly Color[] Colors = {
        Color.FromArgb(128, 160, 255),
        Color.FromArgb(200, 200, 255),
        Color.FromArgb(255, 255, 255)
    };
    public readonly bool[] PlayerColorZaps = { false, false, false };
    public readonly int Distortion = 64;        // Random offset magnitude
    public readonly WAngle Angle = WAngle.Zero;
    public readonly int SegmentLength = 320;
}
```

Generation algorithm:
1. Create straight-line path from source to target
2. Divide into segments of `SegmentLength`
3. Apply random distortion to each segment midpoint
4. Use quadratic interpolation between points
5. Render multiple colored "zaps" (strands)

### Weapon Hierarchy

```yaml
^TeslaZap:                               # Base template (weapons/defaults.yaml)
    Range: 3c0
    ReloadDelay: 60
    Projectile: ElectricBolt
        ZOffset: 2047
    Warhead@1Dam: SpreadDamage
        Damage: 50
        DamageTypes: ElectroDeath

ElectricBolt:                             # Infantry Tesla Trooper
    Inherits: ^TeslaZap

CoilBolt:                                 # Tesla Coil building
    Inherits: ^TeslaZap
    Range: 8c0
    Damage: 200

OPCoilBolt:                               # Overcharged Tesla Coil
    Inherits: CoilBolt
    Range: 8c512
    Projectile: ElectricBolt
        Colors: FFFF54, FFFF54, FFFFFF    # Yellow bolts when charged
    Damage: 300

TankBolt:                                 # Tesla Tank
    Inherits: ^TeslaZap
    Range: 4c0
    Burst: 2
    BurstDelays: 75
```

### Tesla Charge System

Tesla Troopers boost adjacent Tesla Coils using `ProximityExternalCondition`:

```yaml
# Tesla Trooper (soviet-infantry.yaml)
shk:
    ProximityExternalCondition@teslacharge:
        Condition: charged
        Range: 2c0
        ValidRelationships: Ally

# Tesla Coil switches weapon when charged (soviet-structures.yaml)
tesla:
    Armament:
        Weapon: CoilBolt
        RequiresCondition: !charged
    Armament@charged:
        Weapon: OPCoilBolt
        RequiresCondition: charged
    ExternalCondition@CHARGED:
        Condition: charged
```

---

## 12. Mirage/Disguise System

### Mirage Trait (`Mirage.cs`)

```csharp
public class MirageInfo : PausableConditionalTraitInfo
{
    public readonly int InitialDelay = 0;
    public readonly int RevealDelay = 25;        // Ticks to re-disguise after reveal
    public readonly string EffectiveOwner = "Neutral";
    public readonly string MirageCondition = null;
    public readonly string[] DefaultTargetTypes;
    // Configurable reveal triggers:
}

[Flags]
public enum MirageRevealType
{
    Attack = 1, Move = 2, Unload = 4, Infiltrate = 8,
    Demolish = 16, Damage = 32, Heal = 64, SelfHeal = 128, Dock = 256
}
```

The Mirage trait finds a random `MirageTarget` actor in the world map (trees, etc.) and disguises as it. Revealed by configurable events (attack, move, damage, etc.).

### YAML Configuration

```yaml
mgtk:  # Mirage Tank (allied-vehicles.yaml)
    Mirage:
    WithMirageSpriteBody:
    Armament@primary:
        Weapon: Comet
```

---

## 13. Deploy Mechanics

### GI Deploy (Infantry)

```yaml
e1:  # GI
    GrantConditionOnDeploy:
        DeployedCondition: deployed
        UndeployedCondition: undeployed
    Armament@deployed:
        Weapon: InfGun
        RequiresCondition: deployed
    Armament@undeployed:
        Weapon: M60
        RequiresCondition: undeployed
    WithTurretDeployAnimation:
```

### Desolator Deploy (Radiation AoE)

```yaml
intdeso:  # Desolator
    GrantConditionOnDeploy:
        DeployedCondition: deployed
    PeriodicExplosion:                   # Custom C# trait
        Weapon: RadEruptionWeapon        # Creates radiation cells
        RequiresCondition: deployed
```

### Yuri Deploy (Psi-Wave)

```yaml
intpsi2:  # Yuri
    GrantTimedConditionOnDeploy:          # Custom C# trait
        Duration: 40                     # Condition lasts 40 ticks
        DeployedCondition: triggered
    PeriodicExplosion:
        Weapon: PsiWave
        RequiresCondition: triggered
```

### Demolition Truck (Suicide)

```yaml
dtruck:
    GrantConditionOnAttack:
        Condition: triggered
    GrantConditionOnDeploy:
        DeployedCondition: triggered
    KillsSelf:
        RequiresCondition: triggered     # Dies when triggered (either attack or deploy)
    Explodes:
        Weapon: demobomb                 # Explodes on death
```

---

## 14. Veterancy/Experience System

### Defaults (`defaults.yaml`)

```yaml
^GainsExperience:
    GainsExperience:
        Conditions:
            500: rank-veteran            # 500 XP → Veteran
            1000: rank-elite             # 1000 XP → Elite

    # Veteran bonuses
    FirepowerMultiplier@YOURVET:
        Modifier: 110                    # +10% firepower
        RequiresCondition: rank-veteran && !rank-elite
    DamageMultiplier@YOURVET:
        Modifier: 90                     # -10% damage taken
        RequiresCondition: rank-veteran && !rank-elite
    SpeedMultiplier@YOURVET:
        Modifier: 120                    # +20% speed
        RequiresCondition: rank-veteran && !rank-elite
    ReloadDelayMultiplier@YOURVET:
        Modifier: 90                     # -10% reload time
        RequiresCondition: rank-veteran && !rank-elite

    # Elite bonuses
    FirepowerMultiplier@YOURELITE:
        Modifier: 130                    # +30% firepower
        RequiresCondition: rank-elite
    DamageMultiplier@YOURELITE:
        Modifier: 75                     # -25% damage taken
        RequiresCondition: rank-elite
    SpeedMultiplier@YOURELITE:
        Modifier: 140                    # +40% speed
        RequiresCondition: rank-elite
    ReloadDelayMultiplier@YOURELITE:
        Modifier: 75                     # -25% reload time
        RequiresCondition: rank-elite
    SelfHealing@YOURELITE:
        Step: 5
        HealIfBelow: 100                 # Self-heal at all HP levels
        RequiresCondition: rank-elite
    InaccuracyMultiplier@YOURELITE:
        Modifier: 50                     # 50% less spread
        RequiresCondition: rank-elite
```

### Per-Unit Weapon Switching

Units switch to elite weapons via conditions:
```yaml
Armament@primary:
    Weapon: 120mm
    RequiresCondition: !rank-elite
Armament@elite:
    Weapon: 120mmE                       # More damage, sometimes more range
    RequiresCondition: rank-elite
```

### Spy Infiltration Grants Veterancy

```yaml
# warfactory.infiltrated proxy grants veteran status to produced units
ProducibleWithLevel:
    Prerequisites: warfactory.infiltrated
```

---

## 15. Voxel Model Handling

### Model Format

RA2 vehicles use VXL (Voxel) format with HVA (Hierarchical Voxel Animation) files.

From `mod.yaml`:
```yaml
ModelSequenceFormat: VoxelModelSequence
```

### Voxel Sequence Definitions (`sequences/voxels.yaml`)

~60 voxel actor definitions. Structure:

```yaml
# Tank with turret and barrel (3 pieces)
htnk:                        # Rhino Tank
    idle:
        Start: 0
    turret:
        Start: 0
    barrel:
        Start: 0

# Vehicle with unload animation variant
cmin:                        # Chrono Miner
    idle:
        Start: 0
    turret:                  # Mining arm
        Start: 0
    barrel:
        Start: 0
    unload:
        Filename: cmon       # Switches to different VXL when unloading
        Start: 0
    unload-turret:
        Filename: cmon
        Start: 0
    unload-barrel:
        Filename: cmon
        Start: 0

# Helicopter with animated voxel body
shad:                        # Night Hawk
    idle:
        Start: 0
        Length: 4            # 4-frame rotor animation

# Simple vehicle (body only)
dron:                        # Terror Drone — uses sprites, not voxels
    # (Not in voxels.yaml — uses sprite sequences instead)
```

### Voxel Rendering Configuration

```yaml
^VoxelLighting:
    RenderVoxels:
        Scale: 11.7
        LightYaw: 800
        LightPitch: 150
        LightAmbientColor: -0.5,-0.5,-0.5
        LightDiffuseColor: 1.4,1.4,1.4
```

### Missing Voxels (Noted in Source)

Comments in `voxels.yaml` indicate some projectile voxels were not implemented:
```yaml
# Missing: Dreadnought missiles, V3 rockets, Kirov bombs (as voxel projectiles)
```

### WithVoxelHelicopterBody (`WithVoxelHelicopterBody.cs`)

```csharp
// Animates voxel frame counter only when helicopter is airborne
void ITick.Tick(Actor self)
{
    if (IsTraitDisabled) return;
    if (self.World.Map.DistanceAboveTerrain(self.CenterPosition).Length > 0)
        tick++;
}
// Frame index from tick counter
public IEnumerable<ModelAnimation> RenderPreview(...)
{
    var body = new ModelAnimation(model, () => WVec.Zero,
        () => body.QuantizeOrientation(self.Orientation),
        () => IsTraitDisabled || !flying, () => tick / info.TickRate, null);
}
```

---

## 16. RA2-Specific File Formats

### BAG/IDX Audio Archives (`BagFile.cs`)

RA2 uses `.bag` + `.idx` pairs for audio (unlike RA1's `.aud` files in `.mix`):

```csharp
public class AudioBagLoader : IPackageLoader
{
    // .idx file structure (per entry):
    // - 40 bytes: filename (null-terminated ASCII)
    // - 4 bytes: offset into .bag
    // - 4 bytes: data length
    // - 4 bytes: sample rate
    // - 4 bytes: flags
    // - 4 bytes: chunk size (for ADPCM)

    // Flag 1: stereo (else mono)
    // Flag 2: 16-bit PCM
    // Flag 8: IMA ADPCM compressed
}
```

The loader constructs WAV headers in memory from raw PCM/ADPCM data in `.bag` files.

### MIX Archives

Standard C&C MIX format, handled by OpenRA.Mods.Common (not RA2-specific code).

### Tileset Format

RA2 uses TmpTS (Tiberian Sun template format) for isometric tiles:
```yaml
SpriteFormats: ShpTS, TmpTS, ShpTD, PngSheet
```

Three tilesets defined:
```yaml
TileSets:
    ra2|tilesets/temperat.yaml
    ra2|tilesets/snow.yaml
    ra2|tilesets/urban.yaml
```

Each tileset defines extension codes for sprite lookup:
```yaml
# TilesetSpecificSpriteSequence extensions
# .tem (temperate), .sno (snow), .urb (urban)
# Codes: g (generic), a (?), t (temperate), u (urban)
```

### Map Import (`ImportRA2MapCommand.cs`)

The mod includes a 23KB map import utility that converts original RA2 `.map` files to OpenRA's `.oramap` format. This handles:
- Tile conversion from RA2's isometric coordinate system
- Actor placement translation
- Trigger/scripting mapping (partial)

---

## 17. AI System

### AI Configuration (`rules/ai.yaml`)

Single "Test AI" bot defined using modular architecture:

```yaml
ModularBot@TestAI:
    Type: Test AI
```

#### AI Modules

| Module                    | Purpose                    | Key Config                                      |
| ------------------------- | -------------------------- | ----------------------------------------------- |
| `SupportPowerBotModule`   | Uses super weapons         | Which powers, delays                            |
| `BaseBuilderBotModule`    | Build order & expansion    | BuildingLimits, BuildingFractions per structure |
| `SquadManagerBotModule`   | Combat unit grouping       | SquadSize: 5, naval/air unit types              |
| `UnitBuilderBotModule`    | Unit production priorities | UnitsToBuild ratios                             |
| `McvManagerBotModule`     | MCV management             | —                                               |
| `HarvesterBotModule`      | Harvester management       | —                                               |
| `BuildingRepairBotModule` | Repair damaged buildings   | —                                               |

#### Building Priorities Example

```yaml
BaseBuilderBotModule:
    BuildingLimits:
        gapowr: 8           # Max 8 power plants
        napowr: 8
        gapile: 1           # Max 1 barracks
        nahand: 1
        gaweap: 2           # Max 2 war factories
        naweap: 2
    BuildingFractions:
        gapowr: 25%          # 25% of buildings should be power
        gapile: 10%
        gaweap: 10%
```

---

## 18. Weapon System Architecture

### Weapon Definition Structure

Every weapon has three layers: weapon properties, projectile, and warhead(s).

```yaml
WeaponName:
    ReloadDelay: <ticks>
    Range: <cells>
    Burst: <count>
    BurstDelays: <ticks>
    Report: <sound files>
    ValidTargets: <target types>
    Projectile: <ProjectileType>
        <projectile properties>
    Warhead@key: <WarheadType>
        <warhead properties>
```

### Projectile Types Used

| Type           | Usage                               | Properties                                        |
| -------------- | ----------------------------------- | ------------------------------------------------- |
| `InstantHit`   | Machine guns, mind control triggers | Blockable                                         |
| `Bullet`       | Cannons, artillery                  | Speed, Image, LaunchAngle, Shadow                 |
| `Missile`      | Rockets, torpedoes                  | Speed, Homing, ContrailLength, TerrainHeightAware |
| `ElectricBolt` | Tesla weapons                       | Colors, Distortion, SegmentLength                 |
| `ArcLaserZap`  | Mind control                        | UsePlayerColor, Width, Angle                      |
| `RadBeam`      | Desolator                           | Amplitude, WaveLength, Color                      |
| `LaserZap`     | Prism weapons                       | Width, UsePlayerColor                             |
| `GravityBomb`  | Kirov bombs                         | Velocity, Acceleration, Image                     |
| `AreaBeam`     | Sonic (Dolphin)                     | Speed, Duration, Width, Shape                     |

### Armor Type Matrix

RA2 defines 11 armor types. Weapons specify `Versus:` multipliers per armor:

| Armor Type | Used By                        |
| ---------- | ------------------------------ |
| `None`     | Unarmored infantry             |
| `Flak`     | Flak-armored infantry          |
| `Plate`    | Heavy infantry (Tesla Trooper) |
| `Light`    | Light vehicles, aircraft       |
| `Medium`   | Medium vehicles (harvesters)   |
| `Heavy`    | Heavy vehicles (tanks)         |
| `Wood`     | Light buildings                |
| `Steel`    | Medium buildings               |
| `Concrete` | Heavy buildings                |
| `Drone`    | Terror Drone                   |
| `Rocket`   | Rocket-based units             |

Example (120mm tank shell):
```yaml
Warhead@1Dam: SpreadDamage
    Damage: 65
    Versus:
        None: 100      # Full damage to infantry
        Light: 75
        Medium: 80
        Heavy: 100     # Full damage to heavy tanks
        Wood: 60       # Less to buildings
        Concrete: 40   # Much less to concrete
```

### Target Type System

Target types control what weapons can fire at:

| Target Type         | Purpose                 |
| ------------------- | ----------------------- |
| `Ground`            | Ground units            |
| `Water`             | Naval units             |
| `Air`               | Aircraft                |
| `Underwater`        | Submerged submarines    |
| `Infantry`          | Infantry-specific       |
| `Structure`         | Buildings               |
| `MindControl`       | Mind-controllable units |
| `TeslaBoost`        | Tesla charge target     |
| `Repair`            | IFV repair target       |
| `DetonateAttack`    | Demolition truck target |
| `ImmuneToRadiation` | Radiation immunity flag |

---

## 19. Faction & Prerequisite System

### Faction Structure

Two sides with 5 sub-factions each:

```yaml
# world.yaml
FactionInfo@allies:
    Factions:
        random-allies: Random Allies
        america: America
        germany: Germany
        england: England
        france: France
        korea: Korea

FactionInfo@soviets:
    Factions:
        random-soviets: Random Soviets
        cuba: Cuba
        libya: Libya
        iraq: Iraq
        russia: Russia
```

### Country-Specific Units

Controlled via prerequisites and faction-specific `ProvidesPrerequisite`:

```yaml
# Korean special: Black Eagle replaces Harrier
beag:
    Buildable:
        Prerequisites: aircraft.korea    # Only Korea gets this

# French special: Grand Cannon
gtgcan:
    Buildable:
        Prerequisites: radar, ~structures.france

# Iraqi special: Desolator
intdeso:
    Buildable:
        Prerequisites: ~infantry.iraq

# Russian special: Tesla Tank
ttnk:
    Buildable:
        Prerequisites: ~naweap, naradr, ~vehicles.russia
```

### Prerequisite Chain

```
Construction Yard → Power Plant → Barracks → Refinery → War Factory → Radar → Battle Lab
     (base)         (power)     (infantry)   (refinery)  (vehicles)   (radar)  (advanced)
```

The `~` prefix means "hidden prerequisite" — shown in build palette but greyed out until met.

### Spy Infiltration Prerequisites

```yaml
# Infiltrating a war factory grants veteran production
InfiltrateForSupportPower:
    Proxy: warfactory.infiltrated

# Units check for this proxy
ProducibleWithLevel:
    Prerequisites: warfactory.infiltrated
```

---

## 20. Design Implications for Iron Curtain

### What RA2 Teaches About Engine Design

#### 1. Condition System is Core

RA2's most flexible mechanic is the condition system. Nearly everything — invulnerability, veterancy, powerstate, deployment, mind control — flows through conditions. IC should prioritize this as a Phase 2 hard requirement (D028).

**Key pattern:** Grant a named condition → multiple traits react to it via `RequiresCondition`

#### 2. Weapon/Warhead/Projectile Separation

The three-layer weapon system (weapon → projectile → warhead(s)) enables enormous variety from data alone:
- Same projectile, different warheads (building damage vs infantry damage)
- Same warhead, different projectiles (visual variety)
- Multiple warheads on one weapon (damage + effect + smudge)

#### 3. Template Inheritance Enables Scale

The `^Template` inheritance system with `@instance` keys and `-Removal` syntax lets 100+ units share common code while overriding specific behaviors. IC's YAML system needs:
- Abstract templates (never instantiated)
- Multiple inheritance via `Inherits@key:`
- Trait instance multiplicity (`Armament@primary:`, `Armament@elite:`)
- Trait removal (`-TraitName:`)

#### 4. Custom C# Traits Are Minimal

Despite RA2's mechanical complexity, only ~30 custom C# files exist. Most gameplay is data-driven OpenRA common traits. The RA2-specific code covers:
- Novel mechanics with no OpenRA analog (radiation layer, mind control, carrier spawner)
- Visual effects (electric bolts, arcs, tinted cells)
- Format handling (BAG/IDX audio)

This validates IC's tiered modding approach: YAML for 80%, Lua/WASM for the rest.

#### 5. Spawner/Carrier Pattern Needs Abstraction

The BaseSpawnerParent → CarrierParent inheritance suggests IC should define a trait-abstracted spawner system that covers:
- Aircraft carriers (delayed respawn, rearm)
- Future: Siege choppers, Mastermind-style systems
- Child disposal policies (on parent death, on owner change)

#### 6. World-Level Systems (Radiation)

Radiation isn't an actor property — it's a world-level cell layer with:
- Sparse storage (dictionary, not array)
- Per-cell level with decay (logarithmic half-life)
- Visual rendering in fog-of-war aware manner
- Weapon-created (warhead adds to cells)
- Actor-consumed (trait takes damage from cell level)

IC should model this as a Bevy resource/system, not a component.

#### 7. Armor/Damage Matrix Is Data-Heavy

The 11-type armor system with per-weapon `Versus:` multipliers means IC needs an efficient lookup table. Each weapon's warhead must specify damage multipliers for all armor types. This is a critical performance consideration for combat resolution.

#### 8. Voxel Pipeline

~60 vehicle definitions use VXL models with:
- Multi-part assembly (body + turret + barrel)
- State-dependent model swaps (Chrono Miner unload)
- Animated sequences (helicopter rotor)
- Standardized lighting (Scale: 11.7, specific light direction)

IC's Bevy rendering pipeline needs VXL loading in `ra-formats` and a component-based multi-part model assembly system.

#### 9. Support Power Pattern

All support powers share a common pattern:
1. Building provides the power
2. Charge timer (ChargeInterval ticks)
3. Player selects target area (Dimensions/Footprint)
4. Effect applied (weapon fire, condition grant, teleport)
5. Low-power pauses charging

IC can model this as a generic `SupportPower` trait with strategy pattern for the effect.

#### 10. Prerequisites Form a DAG

The build tree is a directed acyclic graph where:
- Buildings provide prerequisites
- Units require prerequisites
- Faction provides implicit prerequisites
- Spy infiltration creates proxy prerequisites
- `~` hides but doesn't disable

This is a clean graph problem solvable with IC's YAML-driven approach.

---

## Appendix A: Complete C# File Inventory

| Path                                                | Size  | Key Types                      |
| --------------------------------------------------- | ----- | ------------------------------ |
| `Activities/ChronoResourceTeleport.cs`              | ~3KB  | Chrono Miner teleport activity |
| `Activities/EnterCarrierParent.cs`                  | ~2KB  | Child docking activity         |
| `FileSystem/BagFile.cs`                             | ~5KB  | AudioBagLoader, BagFile        |
| `Graphics/ArcRenderable.cs`                         | ~3KB  | Arc rendering                  |
| `Graphics/ElectricBoltRenderable.cs`                | ~4KB  | Tesla bolt rendering           |
| `Graphics/RadBeamRenderable.cs`                     | ~3KB  | Radiation beam rendering       |
| `Graphics/TintedCell.cs`                            | ~2KB  | Per-cell radiation visual      |
| `Projectiles/ArcLaserZap.cs`                        | ~3KB  | Mind control beam              |
| `Projectiles/ElectricBolt.cs`                       | ~6KB  | Tesla bolt generation          |
| `Projectiles/RadBeam.cs`                            | ~3KB  | Radiation beam                 |
| `Traits/BaseSpawnerChild.cs`                        | ~2KB  | Spawned unit base              |
| `Traits/BaseSpawnerParent.cs`                       | ~8KB  | Spawner manager base           |
| `Traits/CarrierChild.cs`                            | ~3KB  | Carrier aircraft child         |
| `Traits/CarrierParent.cs`                           | ~7KB  | Aircraft carrier manager       |
| `Traits/ChronoResourceDelivery.cs`                  | ~4KB  | Chrono Miner teleport          |
| `Traits/ChronoshiftableWithSpriteEffect.cs`         | ~2KB  | Chronoshift with visuals       |
| `Traits/DamagedByTintedCells.cs`                    | ~2KB  | Radiation damage receiver      |
| `Traits/MindControllable.cs`                        | ~5KB  | Mind control slave             |
| `Traits/MindController.cs`                          | ~5KB  | Mind control master            |
| `Traits/Mirage.cs`                                  | ~5KB  | Disguise system                |
| `Traits/PeriodicExplosion.cs`                       | ~5KB  | Repeating weapon effect        |
| `Traits/SpawnSurvivors.cs`                          | ~3KB  | Infantry on building death     |
| `Traits/WeatherControlSupportPower.cs`              | ~4KB  | Lightning storm                |
| `Traits/WeatherPaletteEffect.cs`                    | ~2KB  | Storm palette change           |
| `Traits/Conditions/GrantTimedConditionOnDeploy.cs`  | ~3KB  | Yuri deploy                    |
| `Traits/Render/WithCarrierParentPipsDecoration.cs`  | ~2KB  | Carrier pip display            |
| `Traits/Render/WithExitOverlay.cs`                  | ~2KB  | Factory door animation         |
| `Traits/Render/WithMindControlArc.cs`               | ~2KB  | Controller-slave arc           |
| `Traits/Render/WithMindControllerPipsDecoration.cs` | ~2KB  | Controller pip display         |
| `Traits/Render/WithMirageSpriteBody.cs`             | ~3KB  | Disguise sprite swap           |
| `Traits/Render/WithTurretDeployAnimation.cs`        | ~2KB  | Turret deploy anim             |
| `Traits/Render/WithVoxelHelicopterBody.cs`          | ~3KB  | Helicopter voxel anim          |
| `Traits/World/TintedCellsLayer.cs`                  | ~6KB  | World radiation layer          |
| `Warheads/CreateTintedCellsWarhead.cs`              | ~3KB  | Radiation warhead              |
| `Widgets/PowerMeterWidget.cs`                       | ~2KB  | Power bar UI                   |
| `UtilityCommands/ImportRA2MapCommand.cs`            | ~23KB | RA2 map converter              |

---

## Appendix B: Unit Catalog Summary

### Allied Infantry
| ID           | Name            | Special Mechanics             |
| ------------ | --------------- | ----------------------------- |
| `e1`         | GI              | Deploys with different weapon |
| `inteng`     | Engineer        | Captures buildings            |
| `intdog`     | Attack Dog      | Detects spies/cloak           |
| `intsnip`    | Sniper          | England unique                |
| `intspy`     | Spy             | Disguise + infiltrate         |
| `intghost`   | Navy SEAL       | C4 + swim                     |
| `intccomand` | Chrono Commando | C4 + portable chrono          |
| `intptroop`  | Psi Commando    | Mind control + C4             |
| `inttanya`   | Tanya           | Dual pistols + C4 + swim      |

### Soviet Infantry
| ID         | Name          | Special Mechanics                 |
| ---------- | ------------- | --------------------------------- |
| `e2`       | Conscript     | Basic                             |
| `intflak`  | Flak Trooper  | AA + anti-infantry                |
| `shk`      | Tesla Trooper | ElectricBolt, charges Tesla Coils |
| `intterr`  | Terrorist     | Suicide bomber                    |
| `intdeso`  | Desolator     | RadBeam + deploy radiation (Iraq) |
| `intivan`  | Crazy Ivan    | Plants bombs                      |
| `intcivan` | Chrono Ivan   | Ivan + chrono                     |
| `intpsi2`  | Yuri          | Mind control + deploy psi-wave    |
| `intpsi`   | Yuri Prime    | Enhanced mind control             |

### Allied Vehicles
| ID     | Name           | Special Mechanics                |
| ------ | -------------- | -------------------------------- |
| `amcv` | MCV            | Deploys to Construction Yard     |
| `cmin` | Chrono Miner   | ChronoResourceDelivery teleport  |
| `mtnk` | Grizzly Tank   | Voxel body+turret+barrel         |
| `tnkd` | Tank Destroyer | Germany unique                   |
| `fv`   | IFV            | 10+ turret variants by passenger |
| `sref` | Prism Tank     | Charging prism laser             |
| `mgtk` | Mirage Tank    | Disguises as tree                |

### Soviet Vehicles
| ID       | Name             | Special Mechanics                     |
| -------- | ---------------- | ------------------------------------- |
| `smcv`   | MCV              | Deploys to Construction Yard          |
| `harv`   | War Miner        | Armed harvester                       |
| `dron`   | Terror Drone     | Leap attack (sprite-based, not voxel) |
| `htk`    | Flak Track       | Infantry transport + AA               |
| `htnk`   | Rhino Tank       | Main battle tank                      |
| `apoc`   | Apocalypse Tank  | Dual cannon + AA missile              |
| `ttnk`   | Tesla Tank       | Russia unique                         |
| `dtruck` | Demolition Truck | Suicide nuclear (Libya)               |

### Aircraft
| ID          | Name        | Special Mechanics                             |
| ----------- | ----------- | --------------------------------------------- |
| `shad`      | Night Hawk  | Helicopter transport, WithVoxelHelicopterBody |
| `zep`       | Kirov       | Slow airship, 2000HP, GravityBomb             |
| `orca`      | Harrier     | Fast fighter, ammo-based                      |
| `beag`      | Black Eagle | Korea Harrier variant                         |
| `hornet`    | Hornet      | Carrier child, Rearmable                      |
| `intosprey` | Osprey      | Destroyer ASW child                           |

---

## Appendix C: Music Track List

```
grinder, power, fortific, indeep, tension, eaglehun,
industro, jank, 200meter, blowitup, destroy, burn,
motorize, hm2
```
All stored as `.wav` in audio archives.
