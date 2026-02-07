# Mod Migration Case Studies

> **Purpose:** Validate Iron Curtain's modding architecture against real-world OpenRA mods and official C&C products. These case studies answer: "Can the most ambitious community work actually run on our engine?"

---

## Case Study 1: Combined Arms (OpenRA's Most Ambitious Mod)

### What Combined Arms Is

[Combined Arms](https://github.com/Inq8/CAmod) (CA) is the largest and most ambitious OpenRA mod in existence. It is effectively a standalone game:

- **5 factions** — Allies, Soviets, GDI, Nod, Scrin
- **20 sub-factions** — 4 unique variants per faction, each with distinct units, powers, and upgrades
- **34 campaign missions** — Lua-scripted narrative across 8+ chapters, with co-op support
- **450+ maps** — including competitive maps from base RA
- **Competitive ladder** — 1v1 ranked play with player statistics
- **86 releases** — actively maintained, v1.08.1 released January 2026
- **9.3/10 ModDB rating** — 45 reviews, 60K downloads, 482 watchers

CA represents the upper bound of what the OpenRA modding ecosystem has produced. If IC can support CA, it can support anything.

### CA's Technical Composition

| Language        | Share | Purpose                               |
| --------------- | ----- | ------------------------------------- |
| C#              | 67.7% | Custom engine traits (compiled DLLs)  |
| Lua             | 29.4% | Campaign missions, scripted events    |
| YAML (MiniYAML) | ~3%   | Unit definitions, weapon stats, rules |

CA's heavy C# usage is significant — it means CA has outgrown OpenRA's data-driven modding and needed to extend the engine itself. This is exactly the scenario IC's three-tier modding architecture is designed to handle.

### CA's Custom Code Inventory

Surveyed from `OpenRA.Mods.CA/` — **~150+ custom C# files** organized into:

#### Custom Traits (~90 files in `Traits/`)

| Category         | Custom Traits | Examples                                                                                           | IC Equivalent                   |
| ---------------- | ------------- | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| Mind Control     | 5             | `MindController`, `MindControllable`, `MindControllerCapacityModifier`                             | Built-in ECS component or WASM  |
| Spawner/Carrier  | 8             | `CarrierMaster`/`Slave`, `AirstrikeMaster`/`Slave`, `SpawnerMasterBase`                            | Built-in (needed for RA2/Scrin) |
| Teleport Network | 3             | `TeleportNetwork`, `TeleportNetworkPrimaryExit`, `TeleportNetworkTransportable`                    | Built-in or WASM                |
| Upgrades         | 4             | `Upgradeable`, `ProvidesUpgrade`, `RearmsToUpgrade`                                                | YAML conditions system          |
| Unit Abilities   | 5             | `TargetedAttackAbility`, `TargetedLeapAbility`, `TargetedDiveAbility`, `SpawnActorAbility`         | Lua or WASM                     |
| Shields/Defense  | 4             | `Shielded`, `PointDefense`, `ReflectsDamage`, `ConvertsDamageToHealth`                             | Built-in or WASM                |
| Missiles         | 4             | `BallisticMissile`, `CruiseMissile`, `GuidedMissile`, `MissileBase`                                | Built-in projectile system      |
| Transport/Cargo  | 6             | `CargoBlocked`, `CargoCloner`, `MassEntersCargo`, `PassengerBlocked`                               | Built-in + YAML                 |
| Deploy/Transform | 6             | `DeployOnAttack`, `InstantTransforms`, `DetonateWeaponOnDeploy`, `AutoDeployer`                    | Conditions + YAML               |
| Resources        | 6             | `ChronoResourceDelivery`, `HarvesterBalancer`, `ConvertsResources`                                 | YAML + Lua                      |
| Death/Spawn      | 6             | `SpawnActorOnDeath`, `SpawnRandomActorOnDeath`, `SpawnHuskEffectOnDeath`                           | Built-in + YAML                 |
| Experience       | 5             | `GivesBountyCA`, `GivesExperienceCA`, `GivesExperienceToMaster`                                    | Built-in veterancy              |
| Infiltration     | 4+            | Subdirectory with multiple infiltration traits                                                     | Built-in + YAML                 |
| Berserk/Warp     | 2             | `Berserkable`, `Warpable`                                                                          | WASM                            |
| Production       | 4             | `LinkedProducerSource`/`Target`, `PeriodicProducerCA`, `ProductionAirdropCA`                       | Built-in + YAML                 |
| Attachable       | 5             | `Attachable`, `AttachableTo`, `AttachOnCreation`, `AttachOnTransform`                              | WASM                            |
| Stealth          | 1             | `Mirage` (disguise as props)                                                                       | Built-in cloak system           |
| Misc             | 20+           | `PopControlled`, `MadTankCA`, `KeepsDistance`, `LaysMinefield`, `Convertible`, `ChronoshiftableCA` | Mixed                           |

Also includes subdirectories: `Air/`, `Attack/`, `BotModules/`, `Conditions/`, `Infiltration/`, `Modifiers/`, `Multipliers/`, `PaletteEffects/`, `Palettes/`, `Player/`, `Render/`, `Sound/`, `SupportPowers/`, `World/`

#### Custom Warheads (24 files in `Warheads/`)

| Warhead                               | Purpose                               | IC Equivalent             |
| ------------------------------------- | ------------------------------------- | ------------------------- |
| `FireShrapnelWarhead`                 | Secondary projectiles on impact       | Built-in warhead pipeline |
| `FireFragmentWarhead`                 | Fragment weapons on detonation        | Built-in warhead pipeline |
| `WarpDamageWarhead`                   | Temporal displacement damage          | WASM warhead module       |
| `SpawnActorWarhead`                   | Spawn units on detonation             | Built-in                  |
| `SpawnBuildingWarhead`                | Create buildings on impact            | Built-in                  |
| `AttachActorWarhead`                  | Attach parasites/bombs                | WASM                      |
| `AttachDelayedWeaponWarhead`          | Time-delayed weapon effects           | Built-in timer system     |
| `InfiltrateWarhead`                   | Spy-type infiltration on hit          | Built-in infiltration     |
| `CreateTintedCellsWarhead`            | Tiberium-style terrain damage         | Built-in terrain system   |
| `SendAirstrikeWarhead`                | Trigger airstrike on impact           | Lua or WASM               |
| `HealthPercentageSpreadDamageWarhead` | %-based area damage                   | Built-in damage pipeline  |
| Others (13)                           | Flash effects, condition grants, etc. | Mixed                     |

#### Custom Projectiles (16 files in `Projectiles/`)

| Projectile     | Size   | Purpose                               |
| -------------- | ------ | ------------------------------------- |
| `LinearPulse`  | 65KB   | Complex line-based energy weapon      |
| `MissileCA`    | 40KB   | Heavily customized missile behavior   |
| `BulletCA`     | 17KB   | Extended bullet with tracking/effects |
| `PlasmaBeam`   | 14KB   | Scrin-style plasma weapon             |
| `RailgunCA`    | 11KB   | Railgun visual effect                 |
| `ElectricBolt` | 9KB    | Tesla-style electrical discharge      |
| `AreaBeamCA`   | 10KB   | Area-effect beam weapon               |
| `ArcLaserZap`  | 5KB    | Curved laser visual                   |
| Others (8)     | Varies | RadBeam, TeslaZapCA, KKNDLaser, etc.  |

Custom projectiles are primarily **render code** — visual effects for weapon impacts. In IC, these map to shader effects and particle systems in `ra-render`, not simulation code.

#### Custom Activities (24 files in `Activities/`)

Activities are unit behaviors — the "verbs" that units perform:
- `Attach`, `Dive`, `DiveApproach`, `TargetedLeap` — special movement/attack patterns
- `BallisticMissileFly`, `CruiseMissileFly`, `GuidedMissileFly` — missile flight paths
- `EnterTeleportNetwork`, `TeleportCA` — teleportation mechanics
- `InstantTransform`, `Upgrade` — unit transformation
- `ChronoResourceTeleport` — chronoshift-style harvesting
- `MassRideTransport`, `ParadropCargo` — transport mechanics

In IC, activities map to ECS system behaviors, triggered by conditions or orders.

### Migration Assessment

#### What Migrates Automatically (Zero Effort)

| Asset Type           | Volume               | Method                                                             |
| -------------------- | -------------------- | ------------------------------------------------------------------ |
| Sprite assets (.shp) | Hundreds             | IC loads natively (invariant #8)                                   |
| Palette files (.pal) | Dozens               | IC loads natively                                                  |
| Sound effects (.aud) | Hundreds             | IC loads natively                                                  |
| Map files (.oramap)  | 450+                 | IC loads natively                                                  |
| MiniYAML rules       | Thousands of entries | **Loads directly at runtime (D025)** — no conversion step          |
| OpenRA YAML keys     | All trait names      | **Accepted as aliases (D023)** — `Armament` and `combat` both work |
| OpenRA mod manifest  | `mod.yaml`           | **Parsed directly (D026)** — point IC at OpenRA mod dir            |
| Lua mission scripts  | 34 missions          | **Run unmodified (D024)** — IC Lua API is strict superset          |

#### What Migrates with Effort

| Component                           | Effort       | Details                                                                                                                           |
| ----------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **YAML unit definitions**           | **Zero**     | MiniYAML loads at runtime (D025), OpenRA trait names accepted as aliases (D023) — no conversion needed                            |
| **Lua campaign missions**           | **Zero**     | IC Lua API is a strict superset of OpenRA's (D024) — same 16 globals, same signatures, same return types; missions run unmodified |
| **Custom traits → Built-in**        | None         | IC builds mind control, carriers, shields, teleport networks, upgrades, delayed weapons as Phase 2 first-party components (D029)  |
| **Custom traits → YAML conditions** | Low          | Deploy mechanics, upgrade toggles, transform states map to IC's condition system (D028)                                           |
| **Custom traits → WASM**            | Significant  | ~20 truly novel traits need WASM rewrite: Berserkable, Warpable, KeepsDistance, Attachable system, custom ability targeting       |
| **Custom warheads**                 | Low          | Many become built-in warhead pipeline extensions (D028); novel ones (WarpDamage, TintedCells) need WASM                           |
| **Custom projectiles**              | Moderate     | These are primarily render code; rewrite as `ra-render` shader effects and particle systems                                       |
| **Custom UI widgets**               | Moderate     | CA has custom widgets; these need Bevy UI reimplementation                                                                        |
| **Bot modules**                     | Low-Moderate | Map to `ra-ai` crate's bot system                                                                                                 |

#### Migration Tier Breakdown

```
┌─────────────────────────────────────────────────┐
│     Combined Arms → Iron Curtain Migration      │
│           (after D023–D029)                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  Tier 1 (YAML)  ██████████████████████ ~45%    │
│  No code change needed. Unit stats, weapons,    │
│  armor tables, build trees, faction setup.       │
│  MiniYAML loads directly (D025).                 │
│  OpenRA trait names accepted as aliases (D023).  │
│                                                 │
│  Built-in       ████████████████████  ~40%    │
│  IC includes as first-party ECS components       │
│  (D029). Mind control, carriers, shields,        │
│  teleport, upgrades, delayed weapons,            │
│  veterancy, infiltration, damage pipeline.       │
│                                                 │
│  Tier 2 (Lua)   ██████              ~10%      │
│  Campaign missions run unmodified (D024).        │
│  IC Lua API is strict superset of OpenRA's.      │
│                                                 │
│  Tier 3 (WASM)  ███                ~5%       │
│  Truly novel mechanics only: Berserkable,        │
│  Warpable, KeepsDistance, Attachable.             │
│                                                 │
└─────────────────────────────────────────────────┘
```

### What CA Gains by Migrating

| Benefit                              | Details                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **No more engine version treadmill** | CA currently pins to OpenRA releases, rebasing C# against every engine update. IC's mod API is versioned and stable.                |
| **Better performance**               | CA with 5 factions pushes OpenRA hard. IC's efficiency pyramid (flowfields, spatial hashing, sim LOD) handles large battles better. |
| **Better multiplayer**               | Relay server, sub-tick ordering, signed replays, ranked infrastructure built in — no custom ladder server needed.                   |
| **Hot-reloadable mods**              | Change YAML, see results immediately. No recompilation ever.                                                                        |
| **Workshop distribution**            | `ic` CLI tool packages and publishes mods. No manual download/install.                                                              |
| **Branching campaigns (D021)**       | IC's narrative graph with persistent unit roster would elevate CA's 34 missions significantly.                                      |
| **WASM sandboxing**                  | Custom code runs in a sandbox with capability-based API — no risk of mods crashing the engine or accessing filesystem.              |
| **Cross-platform for free**          | CA currently packages per-platform. IC runs on Windows/Mac/Linux/Browser/Mobile from one codebase.                                  |

### Verdict

**Not plug-and-play, but a realistic and beneficial migration — dramatically improved by D023–D029.**

- **~95% of content** (YAML rules via D025 runtime loading + D023 aliases, assets, maps, Lua missions via D024 superset API, built-in mechanics via D029) migrates with **zero effort** — no conversion tools, no code changes.
- **~5% of content** (~20 truly novel C# traits) requires WASM rewrites — bounded and well-identified.
- The migration is a **net positive**: CA ends up with better performance, multiplayer, distribution, and maintainability.
- **Zero-friction evaluation:** Point IC at an OpenRA mod directory (D026) and it loads. No commitment required to test.
- IC **benefits too**: CA's requirements for mind control, teleport networks, carriers, shields, and upgrades validate and drive our component library design. If IC supports CA, it supports any OpenRA mod.

### Lessons for IC Design

CA's codebase reveals which OpenRA gaps force modders into C#. These should become first-party IC features:

1. **Mind Control** — Full system: controller, controllable, capacity limits, progress bars, spawn-on-mind-controlled. Needed for Yuri/Scrin in future game modules.
2. **Carrier/Spawner** — Master/slave with drone AI, return-to-carrier, respawn timers. Needed for Kirov, Aircraft Carriers, Scrin Mothership.
3. **Teleport Networks** — Enter any, exit at primary. Needed for Nod tunnels in TD/TS.
4. **Shield Systems** — Absorb damage, recharge, deplete. Needed for Scrin and RA2 force shields.
5. **Upgrade System** — Per-unit tech upgrades purchased at buildings. Needed for C&C3-style gameplay.
6. **Delayed Weapons** — Attach timers to targets. Common RTS mechanic (poison, radiation, time bombs).
7. **Attachable Actors** — Parasite/bomb attachment. Terror drones in RA2.

These seven systems cover ~60% of CA's custom C# code and are universally useful across C&C game modules.

---

## Case Study 2: C&C Remastered Collection

### What Remastered Delivers

The C&C Remastered Collection (Petroglyph/EA, 2020) modernized C&C95 and Red Alert with:

- **HD/SD toggle** — Press F1 to instantly swap between classic 320×200 sprites and remastered HD art (4096-color, hand-painted)
- **4K support** — HD assets render at native resolution up to 3840×2160
- **Zoom** — Camera zoom in/out (not in original)
- **Modern UI** — Cleaner sidebar, rally points, attack-move, queued production
- **Remastered audio** — Frank Klepacki re-recorded the entire soundtrack; jukebox mode
- **Classic gameplay** — Deliberately preserved original balance and feel
- **Bonus gallery** — Concept art, behind-the-scenes, FMV jukebox

This is the gold standard for C&C modernization. The question: could someone achieve this on IC?

### How IC's Architecture Supports Each Feature

#### HD/SD Graphics Toggle

IC handles this through three converging architectural decisions:

**Invariant #9** (game-agnostic renderer): The engine uses a `Renderable` trait. The RA1 game module registers sprite rendering, but the engine doesn't know what format the sprites are. A game module can register *two* asset sets and swap at runtime.

**Invariant #10** (platform-agnostic): "Render quality is runtime-configurable." This is literally the HD/SD toggle stated as an architectural requirement.

**Bevy's asset system**: Both classic `.shp` sprites and HD texture atlases load as Bevy asset handles. The toggle swaps which handle the `Renderable` component references. This is a frame-instant operation — no loading screen required.

**Implementation sketch:**

```rust
/// Component that tracks which asset quality to render
#[derive(Component)]
struct RenderQuality {
    classic: Handle<SpriteSheet>,
    hd: Option<Handle<SpriteSheet>>,
    active: Quality, // Classic | HD
}

/// System: swap sprite sheet on toggle
fn toggle_render_quality(
    input: Res<Input>,
    mut query: Query<&mut RenderQuality>,
) {
    if input.just_pressed(KeyCode::F1) {
        for mut rq in &mut query {
            rq.active = match rq.active {
                Quality::Classic => Quality::HD,
                Quality::HD => Quality::Classic,
            };
        }
    }
}
```

**YAML-level support:**

```yaml
# Unit definition with dual asset sets
e1:
  render:
    sprite:
      classic: infantry/e1.shp
      hd: infantry/e1_hd.png
    palette:
      classic: temperat.pal
      hd: null  # HD uses embedded color
    shadow:
      classic: infantry/e1_shadow.shp
      hd: infantry/e1_shadow_hd.png
```

#### 4K Native Rendering

Bevy + wgpu handle arbitrary resolutions natively. The isometric renderer in `ra-render` would:

- Detect native display resolution via Bevy's window system
- Classify into `ScreenClass` (our responsive UI system from invariant #10)
- Classic sprites: integer-scaled (2×, 3×, 4×, 6×) with nearest-neighbor filtering to preserve pixel art
- HD sprites: render at native resolution, no scaling artifacts
- UI elements: adapt layout per `ScreenClass` (phone → tablet → laptop → desktop → 4K)

| Display   | Classic Mode              | HD Mode                   |
| --------- | ------------------------- | ------------------------- |
| 1080p     | 3× integer scale          | Native HD                 |
| 1440p     | 4× integer scale          | Native HD                 |
| 4K        | 6× integer scale          | Native HD                 |
| Ultrawide | Scale + letterbox options | Native HD, wider viewport |

#### Camera Zoom

Standard Bevy camera parameter. The isometric renderer already needs to handle different view distances for the minimap and observer mode. Zoom is a single `f32` on the camera entity — trivial to expose as scroll-wheel or keybind.

```rust
fn camera_zoom(
    input: Res<Input>,
    mut camera: Query<&mut OrthographicProjection, With<GameCamera>>,
) {
    let scroll = input.mouse_scroll_delta();
    for mut proj in &mut camera {
        proj.scale = (proj.scale - scroll.y * 0.1).clamp(0.5, 3.0);
    }
}
```

#### Modern UI / Sidebar

- IC's `ra-ui` crate uses Bevy UI — not locked to OpenRA's widget system
- The Remastered sidebar layout is our explicit UX reference (AGENTS.md: "EA Remastered Collection — UI/UX gold standard. Cleanest, least cluttered C&C interface.")
- Rally points, attack-move, queued production are standard Phase 3 deliverables
- A `remastered` UI theme could coexist with a `classic` theme — switchable in settings

#### Remastered Audio

IC's `ra-audio` crate supports:
- Classic `.aud` format (loaded natively per invariant #8)
- Modern audio formats (WAV, OGG, FLAC) via Bevy's audio plugin
- Jukebox mode is a UI feature — trivial playlist management
- EVA voice system supports multiple voice packs
- Spatial audio for positional effects (explosions, gunfire)

A "Remastered audio pack" would be a mod containing high-quality re-recordings alongside classic `.aud` files, with a toggle in audio settings.

#### Balance Preservation

**D019 (Switchable Balance Presets)** explicitly defines `remastered` as a preset:

```yaml
# rules/presets/remastered.yaml
# Any balance changes from the EA Remastered Collection.
# Selected in lobby alongside "classic" and "openra" presets.
preset: remastered
source: "C&C Remastered Collection (2020)"
inherit: classic
overrides:
  # Document specific deviations from original balance here
```

Players choose in lobby: Classic (EA source values), OpenRA (OpenRA balance), or Remastered.

### What It Would Take

| Component                     | Effort               | Notes                                                                   |
| ----------------------------- | -------------------- | ----------------------------------------------------------------------- |
| **Classic assets**            | Zero                 | IC loads .shp, .pal, .aud, .tmp natively (invariant #8)                 |
| **HD art assets**             | **Major art effort** | EA's HD sprites are copyrighted; must be created independently          |
| **HD/SD toggle system**       | Moderate             | Dual asset handles per entity, runtime swap, ~2 weeks engineering       |
| **4K rendering**              | Free                 | Bevy/wgpu handles natively                                              |
| **Integer scaling**           | Low                  | Nearest-neighbor upscale for classic sprites, configurable scale factor |
| **Camera zoom**               | Trivial              | Single camera parameter, hours of work                                  |
| **Remastered UI theme**       | Moderate             | Bevy UI layout, reference EA Remastered screenshots                     |
| **Remastered balance preset** | Low                  | YAML data file comparing EA Remastered balance to original              |
| **Remastered audio pack**     | Art effort           | Community re-recordings or licensed audio                               |
| **Bonus gallery**             | Low                  | Image viewer + FMV player (IC already plans .vqa support)               |

### The Art Bottleneck

The engineering is straightforward. The bottleneck is **art assets**:

EA's HD sprites for the Remastered Collection are copyrighted and cannot be redistributed. A community-driven Remastered experience on IC would need:

1. **Commission original HD art** in the Remastered style — expensive but legally clear
2. **AI upscaling** of classic sprites — lower quality, fast, legally ambiguous
3. **Community art packs** distributed via workshop — distributed effort, curated quality
4. **Open-source HD asset projects** — several community efforts exist for C&C sprite HD conversions

IC's architecture makes the *engine* part trivial. The `GameModule` trait (D018) means a `remastered` module can register HD asset loaders, the dual-render toggle, UI theme, and balance preset. The engine doesn't care — it's game-agnostic.

### Implementation as a Game Module

The full Remastered experience would be a game module (D018):

```rust
pub struct RemasteredModule;

impl GameModule for RemasteredModule {
    fn name(&self) -> &str { "C&C Remastered" }

    fn register_systems(&self, app: &mut App) {
        // Everything from RA1Module, plus:
        app.add_systems(Update, toggle_render_quality);
        app.add_systems(Update, camera_zoom);

        // Register HD asset loaders alongside classic ones
        app.add_plugins(HdSpritePlugin);
        app.add_plugins(HdAudioPlugin);

        // Remastered UI theme
        app.insert_resource(UiTheme::Remastered);

        // Balance preset
        app.insert_resource(BalancePreset::Remastered);
    }

    fn register_assets(&self, server: &AssetServer) {
        // Load both classic and HD asset sets
        server.register_loader::<ShpLoader>();   // Classic
        server.register_loader::<HdPngLoader>(); // HD
    }
}
```

### Verdict

**Yes, someone could recreate the Remastered experience on IC.** The architecture explicitly supports it:

- Game-agnostic engine with `GameModule` trait (D018) — Remastered becomes a module
- Runtime-configurable render quality (invariant #10) — the HD/SD toggle
- Switchable balance presets (D019) — `remastered` preset alongside `classic` and `openra`
- Full original format compatibility (invariant #8) — classic assets load unchanged
- Bevy/wgpu for modern rendering — 4K, zoom, post-processing, all native

**The bottleneck is art, not engineering.** If someone produced HD sprite assets compatible with IC's asset system, the engine work for the HD/SD toggle, 4K rendering, zoom, and modern UI is straightforward Bevy development — estimated at 4-6 weeks of focused engineering on top of the base RA1 game module.

This case study validates IC's multi-game architecture: the same engine that runs classic RA1 can deliver a Remastered-quality experience as a different game module, with zero changes to the engine core.

---

## Cross-Cutting Insights

Both case studies validate the same architectural decisions:

| Decision                              | CA Validation                                                                | Remastered Validation                                   |
| ------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| **D018 (Game Modules)**               | CA's 5 factions = a game module that registers more components than base RA1 | Remastered = a module that registers dual asset loaders |
| **Tiered Modding**                    | 40% YAML + 15% Lua + 15% WASM + 30% built-in                                 | 95% data/asset-driven, 5% module code                   |
| **Invariant #8 (Format Compat)**      | 450+ maps, all sprites, all audio load natively                              | All classic assets load natively                        |
| **Invariant #9 (Game-Agnostic)**      | Scrin/GDI/Nod require engine-agnostic component design                       | HD renderer is game-agnostic                            |
| **Invariant #10 (Platform-Agnostic)** | Must run on all platforms with same mod content                              | Runtime render quality = HD/SD toggle                   |
| **D019 (Balance Presets)**            | CA's custom balance is just another preset                                   | `remastered` preset                                     |
| **D021 (Campaigns)**                  | CA's 34 missions benefit from branching narrative graph                      | Remastered's campaigns could use persistent roster      |

### Seven Built-In Systems Driven by These Case Studies

Based on CA's custom C# requirements and Remastered's features, IC should include these as first-party engine components (not mod-level WASM):

1. **Mind Control** — Controller/controllable with capacity limits, progress indication, spawn-on-override
2. **Carrier/Spawner** — Master/slave drone management with respawn, recall, autonomous attack
3. **Teleport Network** — Multi-node network with primary exit designation
4. **Shield System** — Absorb damage before health, recharge timer, visual effects
5. **Upgrade System** — Per-unit tech upgrades via building research, with conditions
6. **Delayed Weapons** — Time-delayed effects attached to targets (poison, radiation, bombs)
7. **Dual Asset Rendering** — Runtime-switchable asset quality (classic/HD) per entity

These seven systems serve both case studies, all future C&C game modules (RA2, TS, C&C3), and the broader RTS modding community.
