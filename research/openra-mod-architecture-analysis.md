# OpenRA Mod Architecture Analysis

> **Purpose:** Deep architectural analysis of 6 major OpenRA community mods.
> Examines what each mod teaches about engine extensibility, asset pipeline requirements,
> game-specific mechanics, and the limits of OpenRA's trait system.
> Informs Iron Curtain's `GameModule` design, format support, and modding tier strategy.

---

## Executive Summary

Six OpenRA mods were studied, ranging from minor C&C variants to completely alien game genres:

| Repository                                                             | Stars | Game                         | Departure from C&C                                                                |
| ---------------------------------------------------------------------- | ----- | ---------------------------- | --------------------------------------------------------------------------------- |
| [OpenHV](https://github.com/OpenHV/OpenHV)                             | 978   | Hard Vacuum (original)       | High — rectangular grid, custom art, no legacy formats                            |
| [Romanovs-Vengeance](https://github.com/MustaphaTR/Romanovs-Vengeance) | 318   | RA2 / Yuri's Revenge         | Medium — same franchise, but adds voxels, 4th faction, isometric height           |
| [OpenKrush](https://github.com/IceReaper/OpenKrush)                    | 116   | KKnD (Krush Kill 'n Destroy) | Very High — different game entirely, 15+ custom file formats, 16 mechanic modules |
| [d2](https://github.com/OpenRA/d2)                                     | 61    | Dune II (1992)               | High — different selection model, spice economics, PAK archives                   |
| [TiberianDawnHD](https://github.com/OpenRA/TiberianDawnHD)             | 70    | C&C Remastered HD            | Medium — same game, but commercial HD asset pipeline                              |
| [OpenSA](https://github.com/Dzierzan/OpenSA)                           | 114   | Swarm Assault (1999)         | Very High — insect-themed, living terrain, colony mechanics                       |

**Key findings for Iron Curtain:**

1. **Format diversity is extreme.** These 6 mods required 30+ distinct file format decoders. IC's `ra-formats` scope must be extensible or mods will need to ship native code.
2. **Every serious mod needs custom C# (= Rust in IC).** Even OpenHV — an original game with no legacy constraints — needed 30+ custom trait classes. The YAML-only modding tier handles ~60–80% of cases; the remaining 20–40% requires code.
3. **The engine's extensibility points are well-chosen but insufficient.** FileSystem, TerrainFormat, SpriteFormat, and SpriteSequenceFormat are all swappable — but game mechanics (production, building, harvesting) often need wholesale replacement, not just extension.
4. **Cross-game support requires pluggable game mechanics, not just pluggable data.** OpenKrush replaces Construction, Production, Oil/Resources, Researching, Veterancy — nearly the entire gameplay layer. IC's `GameModule` trait must register entire system pipelines, not just data.
5. **HD/Remastered asset support is a separate concern from gameplay.** TiberianDawnHD changes zero gameplay — only the asset pipeline. IC's render mode switching (D048) correctly separates this.

---

## 1. OpenHV — Original Game on OpenRA Engine

**Repository:** [OpenHV/OpenHV](https://github.com/OpenHV/OpenHV) (978★)
**Game:** Hard Vacuum — a CC-BY licensed RTS using Daniel Cook's open art assets
**License:** GPL-3.0 (engine code), CC-BY (art assets)

### What It Is

OpenHV is the strongest proof that OpenRA can power non-C&C games. It's a standalone RTS with original art, custom terrain, standard image/audio formats (PNG, WAV, OGG), and a rectangular (not isometric) grid. It ships as a complete game with multiplayer, bots, and a map editor.

### Architecture

**mod.yaml configuration:**
```
MapGrid: Type: Rectangular          # Not isometric
TerrainFormat: CustomTerrain        # Custom terrain system
SpriteFormats: PngSheet             # Standard PNG, no legacy formats
SoundFormats: Wav, Ogg              # Standard audio
VideoFormats:                       # Empty — no video support
Assemblies: OpenRA.Mods.Common.dll, OpenRA.Mods.HV.dll
```

**Custom C# assembly** (`OpenRA.Mods.HV/`):

| Directory        | Purpose                                                 |
| ---------------- | ------------------------------------------------------- |
| Activities/      | Custom unit activities (action queue items)             |
| Effects/         | Visual effects                                          |
| Graphics/        | Custom graphics pipeline                                |
| LoadScreens/     | Loading screen                                          |
| Projectiles/     | Custom projectile types                                 |
| Scripting/       | Lua scripting extensions                                |
| Terrain/         | `CustomTerraformer.cs` — entirely custom terrain system |
| Traits/          | 30+ custom traits (see below)                           |
| UtilityCommands/ | CLI tools                                               |
| Warheads/        | Custom warhead types                                    |
| Widgets/         | Custom UI widgets                                       |

### Custom Traits (30+) — What OpenRA Lacked

These traits reveal what modders need but OpenRA's core doesn't provide:

**Resource system rework:**
- `AcceptsDeliveredResources` — alternative to refinery docking
- `ResourceCollector`, `ResourceTransporter` — decoupled resource flow (collectors gather, transporters deliver)
- `ResourceYieldMultiplier` — yield modifiers
- `Miner` — stationary mining (different from mobile harvesters)

**Carrier/spawner pattern (recurring across mods):**
- `CarrierChild` / `CarrierParent` — aircraft carrier mechanic
- `BaseSpawnerChild` / `BaseSpawnerParent` — generic spawner (base defense drones, etc.)
- `MissileSpawnerChild` / `MissileSpawnerParent` — missile swarm launchers

**Hacking mechanic:**
- `Hackable` / `Hacker` — unit hacking (takes control, distinct from capture)

**Terrain modification:**
- `Floods` — terrain flooding mechanic
- `LaysTerrain` — units that modify terrain as they move
- `CustomTerraformer` — full terrain transformation system

**Scrap/salvage economy:**
- `Scrap`, `ScrapValue`, `SpawnScrapOnDeath` — destroyed units drop collectible scrap

**Other:**
- `BallisticMissile` — distinct from standard missile projectile
- `Collectible` — ground pickups (like crates but persistent)
- `ChangesOwner` — ownership transfer on condition
- `PeriodicDischarge` — periodic area effect (radiation, healing aura)
- `PeriodicProducer` — automatic unit production (spawners)
- `SpawnedExplodes` — spawned actors explode on death

### Lesson for Iron Curtain

OpenHV proves that IC's `GameModule` architecture is correct: a game built on the engine should be able to declare its own grid type, terrain format, sprite format, and register custom components — without touching engine core code.

**Specific design implications:**
- The resource system must be trait-abstracted. RA1's Harvester→Refinery flow is one implementation. OpenHV needs Collector→Transporter→Receiver — a different topology.
- Carrier/spawner is a **cross-game pattern** (appears in OpenHV, RV, D2). IC should provide a first-party `SpawnedUnit` component in the cross-game component library (D029).
- Terrain modification during gameplay (floods, laying terrain) needs sim-level support — it's not just a render concern.

---

## 2. Romanovs-Vengeance — RA2/Yuri's Revenge

**Repository:** [MustaphaTR/Romanovs-Vengeance](https://github.com/MustaphaTR/Romanovs-Vengeance) (318★)
**Game:** Red Alert 2 / Yuri's Revenge — the most feature-complete RA2 mod on OpenRA
**License:** GPL-3.0

### What It Is

The most ambitious C&C mod on OpenRA. Implements RA2's complex unit roster (chrono legionnaire, mirage tank, mind control, terror drone, etc.), adds a custom 4th faction (Bakuvian), and includes cross-game content (an Arrakis tileset from Dune).

### Architecture

**mod.yaml configuration:**
```
PackageFormats: Mix, AudioBag
FileSystem: ContentInstallerFileSystem     # Custom filesystem for content detection
MapGrid: Type: RectangularIsometric        # RA2's isometric grid
         MaximumTerrainHeight: 16          # Multi-height terrain
SpriteFormats: ShpTS, TmpTS, ShpTD, PngSheet
SoundFormats: Aud, Wav
ModelSequences: rv|sequences/voxels.yaml   # Voxel 3D models (TS/RA2 vehicles)
SupportsMapsFrom: rv, ra2                  # Backward compatible with RA2 maps
```

**Five assemblies loaded simultaneously:**
```
Assemblies:
  OpenRA.Mods.Common.dll
  OpenRA.Mods.Cnc.dll        # TD/RA1 base traits
  OpenRA.Mods.D2k.dll        # Dune 2000 traits (carryall, sandworm mechanics)
  OpenRA.Mods.RA2.dll        # Custom RA2 code
  OpenRA.Mods.AS.dll         # Attacque Superior — shared community trait library
```

This is notable: **five DLLs** needed to assemble RA2's feature set by combining pieces from four different game mods plus a community library. This reveals that OpenRA's per-game crates contain mechanics that should be game-agnostic engine features.

### Custom C# Traits

**RA2-specific mechanics that OpenRA's core doesn't support:**

| Trait                             | Purpose                                                            | IC Relevance              |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------- |
| `AffectedByTemporal`              | Chrono weapon — target frozen in time, slowly erased               | D029 cross-game component |
| `TemporalDamageWarhead`           | Warhead that applies temporal (chrono) damage                      | Custom warhead type       |
| `AttackInfectRV` / `InfectableRV` | Terror drone infection — unit enters enemy and damages from inside | D029 cross-game component |
| `Mirage`                          | Mirage tank — disguises as tree/prop when stationary               | Extends `Cloak` system    |
| `BallisticMissileOld`             | V3/Dreadnought missile (slow, powerful, shootable)                 | `Projectile` variant      |
| `MissileSpawnerOldMaster/Slave`   | Aircraft carrier/spawner pattern                                   | D029 cross-game component |
| `GrantConditionOnOwnerLost`       | Grant condition when owner is eliminated                           | Condition extension       |
| `HeliGrantConditionOnDeploy`      | Helicopter deploy (transform in air)                               | `Transforms` variant      |

**Custom warheads (5 types):**
- `LegacySpreadWarhead` — RA2's spread mechanic (different from RA1)
- `SpawnActorOrWeaponWarhead` — impact spawns an actor OR triggers another weapon
- `SpawnBuildingOrWeaponWarhead` — impact creates a building OR triggers weapon
- `StealResourceWarhead` — attack steals enemy resources
- `TemporalDamageWarhead` — chrono damage

**Faction structure:**
- Allied, Soviet, Yuri (canonical) + **Bakuvian** (custom 4th faction)
- Per-faction rule files: `allied-infantry.yaml`, `soviet-vehicles.yaml`, `yuri-structures.yaml`, `bakuvian-infantry.yaml`, etc.
- Cross-game tileset: `arrakis.yaml` (Dune desert maps playable in RA2)
- Upgrades system: `upgrades.yaml` (tech upgrades per building)

### Lesson for Iron Curtain

**RV demonstrates the need for composable game modules.** RA2 borrows the carryall from D2k, traits from Attacque Superior, and base mechanics from RA/TD. IC's design already supports this via `GameModule` composition, but the sheer volume of cross-game trait sharing argues for a robust **first-party component library** (D029) with the 7+ components identified: mind control, carriers, teleport, shields, infection, disguise, temporal.

**Specific implications:**
- IC needs voxel model support for TS/RA2 (declared in D048 render modes, but format loading needed in `ra-formats`)
- The `SupportsMapsFrom` pattern (backward compatibility) is important — IC should support loading maps from compatible mods
- Custom warheads are one of the most common extension points. IC's warhead system should be easily extensible via YAML + Lua (Tier 1-2), not requiring Rust/WASM for basic variants
- The 5-DLL composition pattern validates IC's `GameModule` approach — but highlights that a shared trait library (like Attacque Superior) should be an engine-level feature, not a community afterthought

---

## 3. OpenKrush — KKnD (Krush Kill 'n Destroy)

**Repository:** [IceReaper/OpenKrush](https://github.com/IceReaper/OpenKrush) (116★)
**Game:** KKnD Xtreme — a 1997 RTS by Beam Software, completely unrelated to C&C
**License:** GPL-3.0

### What It Is

The most architecturally radical mod studied. KKnD has different file formats, different resource mechanics (oil, not ore), different building systems, different unit production, a tech research tree, bunkers, saboteurs, sacrificing mechanics — almost nothing from C&C's gameplay applies.

### Architecture

**mod.yaml configuration (openkrush_gen1):**
```
PackageFormats: LvlPackage                          # KKnD's archive format
MapGrid: TileSize: 32,32, Type: Rectangular
SoundFormats: Wav, Soun, Son                        # Custom KKnD audio
SpriteFormats: PngSheet, Mobd, Mapd, Blit           # Custom KKnD sprites
VideoFormats: Vbc                                   # Custom KKnD video
TerrainFormat: DefaultTerrain
Assemblies: OpenRA.Mods.Common.dll, OpenRA.Mods.OpenKrush.dll
```

**Sub-mod structure:** The mod uses an inheritance structure:
- `mods/openkrush/` — shared base rules, chrome, hotkeys, actors
- `mods/openkrush_gen1/` — KKnD1-specific content (includes base via `Include: core/mod.yaml`)
- `mods/modcontent/` — content installation

**Include-based mod.yaml composition:**
```yaml
Include: core/mod.yaml
Include: actors/bunker/mod.yaml
Include: actors/evolved/mod.yaml
Include: actors/survivors/mod.yaml
Include: actors/neutral/mod.yaml
Include: tilesets/desert/mod.yaml
Include: tilesets/highland/mod.yaml
Include: tilesets/urban/mod.yaml
```

### Custom File Format Decoders (15+)

This is the most extensive format reverse-engineering effort among the studied mods:

**Assets/FileFormats/ — Binary format classes:**

| Class                                                                                                    | Format          | Purpose                                                               |
| -------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------- |
| `Blit.cs` / `BlitFrame.cs`                                                                               | `.blit`         | KKnD's sprite format (UI elements, HUD)                               |
| `Mobd.cs` / `MobdAnimation.cs` / `MobdFrame.cs` / `MobdImage.cs` / `MobdPoint.cs` / `MobdRenderFlags.cs` | `.mobd`         | Mobile Object Data — KKnD's animated sprite format (units, buildings) |
| `Mapd.cs` / `MapdLayer.cs`                                                                               | `.mapd`         | KKnD's map/terrain data format                                        |
| `Lvl.cs`                                                                                                 | `.lvl`          | KKnD's level/package archive format                                   |
| `Son.cs` / `Soun.cs`                                                                                     | `.son`, `.soun` | KKnD's two audio formats                                              |
| `Vbc.cs` / `VbcFrame.cs`                                                                                 | `.vbc`          | KKnD's video/cutscene format                                          |

**Supporting infrastructure:**
- `Decompressor.cs` — custom decompression algorithm for KKnD archives
- `GameFormat.cs` — format detection/version enum
- `Assets/FileSystem/DemoLoader.cs`, `LvlLoader.cs` — archive filesystem adapters
- `Assets/AudioLoaders/`, `SpriteLoaders/`, `VideoLoaders/` — OpenRA loader interface implementations

### Custom Game Mechanics (16 Modules)

This is where OpenKrush truly diverges. **Nearly every core gameplay system is replaced:**

| Module                   | What It Replaces      | Why C&C's Version Doesn't Work                                                                            |
| ------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------- |
| **Construction/**        | Building placement    | KKnD uses mobile construction vehicles that physically build on-site, not ConYard-based sidebar placement |
| **Production/**          | Unit production       | KKnD production works differently from C&C's queue-based sidebar                                          |
| **Oil/**                 | Harvesting/economy    | KKnD uses oil patches (finite, stationary) — not harvestable ore fields                                   |
| **Researching/**         | Tech progression      | KKnD has a research tree — units unlock through research, not prerequisite buildings                      |
| **Bunkers/**             | Garrison/defense      | KKnD bunkers function differently from C&C garrisons                                                      |
| **Docking/**             | Docking system        | Custom dock behavior for KKnD                                                                             |
| **Laser/**               | Weapon types          | KKnD's laser weapons need custom rendering/behavior                                                       |
| **Repairbays/**          | Repair system         | Dedicated repair bays with custom mechanics                                                               |
| **Saboteurs/**           | Engineer/infiltration | KKnD saboteur ≠ C&C engineer                                                                              |
| **Sacrificing/**         | *(no C&C equivalent)* | Units sacrifice themselves for resources or effects                                                       |
| **Technicians/**         | *(no C&C equivalent)* | Technician units with unique abilities                                                                    |
| **Veterancy/**           | Experience system     | KKnD veterancy works differently                                                                          |
| **AI/**                  | Bot behavior          | KKnD-specific AI strategies                                                                               |
| **Ui/**                  | Game chrome           | Custom sidebar, selection UI                                                                              |
| **AttackNotifications/** | Combat alerts         | Custom notification logic                                                                                 |
| **DataFromAssets/**      | *(no C&C equivalent)* | Reads game data directly from original KKnD asset files                                                   |

### Lesson for Iron Curtain

**OpenKrush is the acid test for IC's game-agnostic claims.** If IC's `GameModule` trait can't support a KKnD-like game, the "general-purpose RTS engine" promise (D039) fails.

**Critical implications:**

1. **Format extensibility must be in the modding tier, not just `ra-formats`.** OpenKrush needed 15+ custom binary format decoders. IC must either:
   - Provide a `FormatLoader` trait that WASM mods can implement (Tier 3)
   - Support Kaitai Struct-style format-as-schema definitions (like Stargus — see `research/stratagus-stargus-opencraft-analysis.md`)
   - Or accept that `ra-formats` will grow to cover multiple game families

2. **The production system must be trait-abstracted.** C&C sidebar production ≠ KKnD site-based construction ≠ RA2's tab-based production. IC's `ProductionQueue` component is fine for C&C, but the `ProductionSystem` trait should be swappable per game module.

3. **Economy isn't just harvesting.** KKnD's oil patches, sacrificing units for resources, and research-gated unlocks represent fundamentally different economic models. IC's economy system should define a `ResourceProvider` trait, not hardcode Harvester→Refinery.

4. **Research trees demonstrate that prerequisite systems need to be more general.** C&C uses building-based prerequisites. KKnD uses research-based unlocks. IC should provide a general `TechRequirement` system that prerequisites, research, and veterancy-based unlocks can all plug into.

5. **The `Include:` pattern in mod.yaml is valuable.** OpenKrush composes its mod from multiple sub-files. IC's YAML inheritance (§3 in AGENTS.md) should support this modular composition.

---

## 4. Dune II (d2) — The Original RTS

**Repository:** [OpenRA/d2](https://github.com/OpenRA/d2) (61★)
**Game:** Dune II: The Building of a Dynasty (1992) — the game that defined the RTS genre
**License:** GPL-3.0

### What It Is

A mod that runs the original 1992 Dune II on OpenRA. Requires original DUNE.PAK files. Historically significant because Dune II's mechanics differ substantially from C&C's (its successor) — single-unit selection, concrete placement, starport purchasing, sandworm hazards.

### Architecture

**mod.yaml configuration:**
```
PackageFormats: PakFile, D2kSoundResources       # Dune PAK archives
MapGrid: TileSize: 16,16, Type: Rectangular      # 16×16 tiles (not C&C's 24×24)
SpriteFormats: R8, ShpD2, IcnD2, ShpTD, CpsD2, Wsa   # 6 Dune-specific sprite formats
SoundFormats: Aud, Wav
VideoFormats: Wsa                                 # WSA animation format
```

**Format diversity:** Six distinct sprite formats, each for a different purpose in the original game. The `R8` format is unique to Dune II. `IcnD2` handles icon/tile data. `CpsD2` handles full-screen images. This is typical of early 90s PC games where different asset types had purpose-built formats.

### Custom C# Code

**FileFormats/** — format decoders:
- `AudReader.cs` — Westwood AUD audio format
- `LCWCompression.cs` — Westwood LCW compression (shared by all Westwood games)
- `WsaReader.cs` — WSA animation format
- `XORDeltaCompression.cs` — XOR delta compression (frame-to-frame animation)

**Traits/World/** — the most interesting custom code, revealing Dune II's unique mechanics:

| Trait                     | Purpose                       | Why It's Game-Specific                                                                     |
| ------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| `D2BuildableTerrainLayer` | Concrete/foundation placement | Dune II requires concrete slabs before building — no equivalent in C&C                     |
| `D2ResourceRenderer`      | Spice field rendering         | Spice visuals differ from ore/tiberium (spreading, density levels)                         |
| `D2Selection`             | Unit selection behavior       | Dune II has **single-unit selection only** — fundamentally different from C&C's box-select |
| `D2ShroudRenderer`        | Custom fog of war             | Dune II's shroud rendering differs from C&C's                                              |
| `D2TerrainLayer`          | Terrain cell data             | Dune II's terrain model is simpler but different                                           |

**Rules files reveal unique game objects:**
- `sandworm.yaml` — sandworms that eat units crossing desert
- `ornithopter.yaml` — Atreides air unit
- `carryall.yaml` — automatic transport that carries harvesters
- `spicebloom.yaml` — spice blooms that explode and create spice fields
- `starport.yaml` — purchase units from off-map at variable prices
- `devastator.yaml` — super-heavy tank that self-destructs
- `deviator.yaml` — temporarily converts enemy units
- `sonic_tank.yaml` — area-effect sonic weapon
- `concrete.yaml` — foundation slabs

### Lesson for Iron Curtain

**D2 validates that even within the C&C family, mechanics diverge significantly.** The single-selection model, concrete placement, starport economics, and sandworm AI represent mechanics that IC's RA1 module won't cover but a future Dune module would need.

**Specific implications:**

1. **Selection behavior should be configurable per game module.** Dune II's single-select is a `SelectionMode` variant, not a bug. IC should support `SelectionMode::Single`, `SelectionMode::BoxSelect`, `SelectionMode::BoxSelectWithPriority`.

2. **The concrete/foundation mechanic is a `BuildableTerrainLayer` concept.** This is related to IC's `BuildArea` but adds terrain modification as a prerequisite for building placement. The building system should support optional terrain prerequisites.

3. **Automatic transport (carryall) is a world-level AI system**, not just a player order. In Dune II, carryalls automatically pick up and deliver harvesters without player input. IC should support `AutoTransport` as a world-level system.

4. **Variable-price purchasing (starport)** is a different economy mechanic from fixed-price production. The production system needs to support dynamic pricing.

5. **Environmental hazards (sandworms)** are world-level actors with AI that interact with the terrain grid. IC's `GameModule` should support registering world-level hazard systems.

---

## 5. TiberianDawnHD — Remastered HD Assets

**Repository:** [OpenRA/TiberianDawnHD](https://github.com/OpenRA/TiberianDawnHD) (70★)
**Game:** C&C: Tiberian Dawn with EA C&C Remastered Collection HD assets
**License:** GPL-3.0
**Status:** Proof of concept — "A dedicated GPU is recommended"

### What It Is

A prototyping repo that loads HD assets from the commercial C&C Remastered Collection (Steam/Origin) into OpenRA's engine. **Changes zero gameplay** — only the asset pipeline. This is the purest example of render-only modding.

### Architecture

**mod.yaml configuration:**
```
PackageFormats: Mix, MegV3, ZipFile        # MegV3 = EA's Mega archive format
FileSystem: RemasterFileSystem              # Custom — reads from Steam/Origin install
MapGrid: TileSize: 128,128                 # 128×128 tiles (8× the 16×16 originals)
WorldViewportSizes: DefaultScale: 0.1875   # Scale down HD assets to fit viewport
SpriteFormats: Tga, ShpTD, TmpTD, ShpTS, TmpRA, ShpRemastered, Dds, PngSheet  # 8 formats!
TerrainFormat: RemasterTerrain             # Custom terrain for HD tiles
SpriteSequenceFormat: RemasterSpriteSequence
    BgraSheetSize: 8192                    # Large sheet for HD sprites
    IndexedSheetSize: 512
```

**Content source detection:**
```yaml
Sources:
    steam:
        Type: Steam
        AppId: 1213210
    origin:
        Type: RegistryDirectory
        RegistryPrefixes: HKEY_LOCAL_MACHINE\Software\, HKEY_LOCAL_MACHINE\SOFTWARE\Wow6432Node\
        RegistryKey: Petroglyph\CnCRemastered
        RegistryValue: Install Dir
RemasterPackages:
    data|CNCDATA/TIBERIAN_DAWN/CD1/CONQUER.MIX
    data|TEXTURES_TD_SRGB.MEG
    data|SFX2D_EN-US.MEG
    data|MUSIC.MEG
    ...
```

### Custom C# Code (OpenRA.Mods.Mobius)

The custom code is focused exclusively on asset loading — no gameplay changes:

| File                            | Size | Purpose                                                                            |
| ------------------------------- | ---- | ---------------------------------------------------------------------------------- |
| `RemasterSpriteSequence.cs`     | 13KB | Maps HD sprite sheets to OpenRA's sprite sequence system — the largest single file |
| `RemasterTerrainRenderer.cs`    | 7KB  | Renders remastered terrain tiles                                                   |
| `RemasterTerrain.cs`            | 6KB  | Terrain data model for HD tile dimensions                                          |
| `RemasterTileCache.cs`          | 9KB  | Caches remastered tile textures for performance                                    |
| `RemasterFileSystemLoader.cs`   | 3KB  | Loads content from Remastered Collection install                                   |
| `RemasterContentPromptLogic.cs` | 1KB  | UI prompt for content location                                                     |

**Two-mod structure:**
- `mods/cnc/` — the playable game mod (inherits from OpenRA's standard TD rules + applies overrides)
- `mods/remaster-content/` — a hidden sub-mod that handles the content installation prompt

**Override pattern for HD sequences:**
```yaml
Sequences:
    base|sequences/structures.yaml
    cnc|sequences/structures-overrides.yaml    # HD overrides
    base|sequences/vehicles.yaml
    cnc|sequences/vehicles-overrides.yaml      # HD overrides
    ...
```

### Lesson for Iron Curtain

**TiberianDawnHD validates IC's render mode switching design (D048).** The mod proves that HD assets are purely a render concern — the entire gameplay layer is unchanged. A clean separation between simulation and rendering allows swapping visual quality without touching game logic.

**Specific implications:**

1. **IC's `RenderMode` bundles (D048) should support Remastered-quality assets.** The `ShpRemastered` and `MegV3` formats must be loadable by `ra-formats`. TGA and DDS are standard formats Bevy already handles.

2. **128×128 tile size with 0.1875 scale** reveals the challenge: HD tiles are 8× resolution of originals. IC must handle this via Bevy's camera/viewport scaling — the tile size in the sim stays the same, only the render resolution changes.

3. **Sprite sheet sizes jump dramatically at HD** (`BgraSheetSize: 8192`). IC's rendering pipeline must handle large texture atlases efficiently — this is where Bevy's GPU-resident texture system helps.

4. **Content source detection** (Steam AppId, Origin registry keys) is needed for commercial asset loading. IC should implement a `ContentSource` trait with `Steam`, `Registry`, `Directory` variants.

5. **The override pattern** (base sequences + per-mode overrides) maps directly to IC's YAML inheritance. HD mode doesn't replace all sequences — it selectively overrides sprites while keeping structure.

---

## 6. OpenSA — Swarm Assault

**Repository:** [Dzierzan/OpenSA](https://github.com/Dzierzan/OpenSA) (114★)
**Game:** Swarm Assault (1999) — an insect-themed RTS by S2 Games
**License:** GPL-3.0
**Status:** "Highly complete, all required features are there." All 100 original missions recreated.

### What It Is

The most genre-distant mod studied. Swarm Assault features insect factions fighting over colonies, with living terrain (growing plants, spawning creep creatures), pirate ants, wasp movement layers, and colony capture mechanics. Credits multiple community members: IceReaper (format reverse engineering), Mailaender (custom traits), GraionDilach (Attacque Superior traits).

### Custom C# Code Structure

**OpenRA.Mods.OpenSA/** — 14 subdirectories:

| Directory        | Purpose                                   |
| ---------------- | ----------------------------------------- |
| AudioLoaders/    | Custom Swarm Assault audio format loaders |
| EditorBrushes/   | Custom map editor tools                   |
| FileSystem/      | Custom archive filesystem                 |
| Graphics/        | Custom graphics pipeline                  |
| LoadScreens/     | Loading screen                            |
| Projectiles/     | Custom projectile types                   |
| Properties/      | Lua scripting properties                  |
| SpriteLoaders/   | Custom sprite format loaders              |
| Terrain/         | Custom terrain renderer                   |
| Traits/          | Game-specific traits (see below)          |
| UtilityCommands/ | CLI tools                                 |
| Warheads/        | Custom warhead types                      |
| Widgets/         | Custom UI                                 |

### Custom Traits — Living World Simulation

**Colony mechanics (unique game concept):**
- `Colony.cs` — colony entity (neutral capturable base)
- `ColonyBit.cs` — colony resource fragments dropped on colony destruction
- `DefeatedColony.cs` — behavior when colony is taken
- `TakeColonyBitOnIdle.cs` — units automatically collect colony bits when idle

**World-level spawner systems (living terrain):**
- `PlantSpawner.cs` / `PlantCreeps.cs` / `Plant.cs` — plants grow on the map as neutral obstacles/resources
- `CreepFlyerSpawner.cs` / `FlyerCreeps.cs` — neutral flying creatures spawn and roam
- `PirateSpawner.cs` / `PirateAnt.cs` — hostile pirate ants spawn from ant holes
- `AntHole.cs` — ant hole terrain feature that spawns pirate units

**Custom locomotion:**
- `WaspLocomotor.cs` — movement system for wasp-type units
- `WaspActorLayer.cs` — custom actor layer for wasp altitude management

**Other custom traits:**
- `CustomTerrainRenderer.cs` — Swarm Assault terrain rendering
- `IndividualProductionQueueFromSelection.cs` — production tied to selected building (not sidebar)
- `MusicPlaylistBuilder.cs` — custom music system
- `PaletteFromDdf.cs` — custom palette format loader
- `Randomizer.cs` — randomization trait
- `SpawnRandomActorOnDeath.cs` — death spawns random actor type
- `SpawnsFragment.cs` / `SpawnsShrapnel.cs` — fragment/shrapnel on hit
- `PeriodicDischarge.cs` — periodic area effect (shared with OpenHV)
- `WithLoopedAttackSound.cs` — looping attack audio

### Lesson for Iron Curtain

**OpenSA demonstrates that IC's "game-agnostic engine" must support world-level simulation systems that have no C&C equivalent.** Plants growing, creatures spawning, ant holes producing enemies — these are world-tick systems that modify the game map over time.

**Specific implications:**

1. **World spawner systems are a common pattern.** OpenSA has plant spawners, creep spawners, pirate spawners. This is similar to Dune II's sandworms and spice blooms. IC should provide a generic `WorldSpawner` component: `{ actor_type, spawn_interval, max_count, spawn_conditions }`.

2. **Colony mechanics (neutral capturable objectives)** are relevant beyond Swarm Assault — tech buildings in RA2, oil derricks, neutral airfields. IC should support neutral-to-capturable entities as a core mechanic.

3. **Custom locomotors are essential.** WaspLocomotor needs a different movement layer and altitude model. IC's `Locomotor` trait (via `Pathfinder` trait abstraction, D013) already supports this, but the actual implementation needs actor layers for different movement heights.

4. **Per-building production (vs. sidebar production)** is another selection model variant. OpenSA uses `IndividualProductionQueueFromSelection` — select a building, its production queue becomes active. This is more AoE-style than C&C-style. IC's production system should support both `SidebarProduction` and `SelectedBuildingProduction`.

5. **Shared traits between mods** — OpenSA shares `PeriodicDischarge` with OpenHV, and uses Attacque Superior traits. This validates the community trait library concept (→ IC's D029 cross-game component library).

---

## Cross-Cutting Analysis: Lessons for Iron Curtain

### Pattern 1: Every Mod Needs Custom Code

| Mod                | Custom C# Files | Custom Traits       | Custom Formats                     |
| ------------------ | --------------- | ------------------- | ---------------------------------- |
| OpenHV             | ~40+            | 30+                 | 0 (uses standard formats)          |
| Romanovs-Vengeance | ~25+            | 15+                 | 0 (uses existing Westwood formats) |
| OpenKrush          | ~50+            | 16 mechanic modules | 15+ format decoders                |
| D2                 | ~15+            | 5 world traits      | 4 format decoders                  |
| TiberianDawnHD     | ~8              | 0 (render only)     | 2 format handlers                  |
| OpenSA             | ~40+            | 20+                 | custom audio/sprite loaders        |

**Conclusion:** YAML-only modding (IC's Tier 1) handles data customization but NOT new mechanics. Every mod that adds new gameplay needs compiled code. IC's three-tier strategy (YAML → Lua → WASM) must ensure that Lua (Tier 2) covers the gap that currently requires C# DLLs in OpenRA. Specifically:
- New condition grant sources → Lua
- New warhead effects → Lua
- New resource flow topologies → Lua
- New projectile behaviors → Lua
- New world spawner systems → Lua
- New locomotor variants → WASM (performance-critical)
- New file format decoders → WASM (binary parsing)

### Pattern 2: Five Extension Points Dominate

Across all 6 mods, these are the most frequently customized systems:

1. **Traits / Components** (all 6 mods) — new game mechanics
2. **File Formats** (4 of 6 mods) — loading non-standard assets
3. **Terrain** (4 of 6 mods) — custom terrain rendering and behavior
4. **Warheads** (3 of 6 mods) — custom damage/effect types
5. **World Systems** (3 of 6 mods) — world-tick spawners, hazards, terrain evolution

IC's extension architecture should make these five points maximally accessible in each modding tier.

### Pattern 3: Cross-Game Component Reuse

Several mechanics recur across multiple mods:

| Mechanic                     | Appears In                             | IC Component (D029)            |
| ---------------------------- | -------------------------------------- | ------------------------------ |
| Carrier/spawner              | OpenHV, RV, (OpenRA D2k)               | `SpawnedUnit` / `UnitSpawner`  |
| Periodic discharge           | OpenHV, OpenSA                         | `PeriodicEffect`               |
| Infection/parasitism         | RV (terror drone)                      | `Infector` / `Infectable`      |
| Disguise/mirage              | RV (mirage tank)                       | `Disguise`                     |
| Temporal/chrono weapons      | RV (chrono legionnaire)                | `TemporalDamage`               |
| Mind control                 | RV (Yuri), (not studied but in OpenRA) | `MindControl` / `Controllable` |
| Colony/capturable objectives | OpenSA, (RA2 tech buildings)           | `NeutralCapturable`            |
| Shrapnel/fragments on death  | OpenHV, OpenSA                         | `SpawnsOnDeath`                |
| Custom locomotors            | OpenSA (wasp), D2 (sandworm movement)  | Locomotor trait variants       |

**Conclusion:** D029's "7 first-party systems" should expand to cover all of these. They're not game-specific — they're RTS-genre patterns.

### Pattern 4: Mod Composition via Assembly/Module Stacking

**Romanovs-Vengeance loads 5 DLLs.** OpenSA credits traits from Attacque Superior. This reveals a need for:
- A community trait library (IC: D029 + Workshop)
- Assembly/module ordering and conflict resolution
- Shared interface contracts between modules

IC's `GameModule` trait should support explicit dependency declaration:
```rust
impl GameModule for Ra2Module {
    fn dependencies(&self) -> &[ModuleId] {
        &[ModuleId::Core, ModuleId::CncCommon, ModuleId::D2kCarryall]
    }
}
```

### Pattern 5: Content Source Diversity

| Mod            | Content Source                                |
| -------------- | --------------------------------------------- |
| OpenHV         | Bundled (CC-BY art)                           |
| RV             | User's RA2/YR installation (.mix files)       |
| OpenKrush      | GOG, Steam, original disc, demo download      |
| D2             | Original Dune II PAK files                    |
| TiberianDawnHD | Steam (AppId), Origin (registry)              |
| OpenSA         | (reverse-engineered formats, original assets) |

IC needs a flexible `ContentSource` system:
- `Bundled` — assets ship with the mod
- `SteamApp { app_id }` — detect Steam installation
- `RegistryPath { key, value }` — Windows registry detection
- `DirectoryPrompt` — user points to installation
- `Download { url, hash }` — download from mirror (OpenKrush demo)
- `GOG { game_id }` — GOG Galaxy detection

### Pattern 6: Terrain Is Never "Just Tiles"

Every mod that isn't a C&C variant needed a custom terrain system:

| Mod            | Terrain Customization                                             |
| -------------- | ----------------------------------------------------------------- |
| OpenHV         | `CustomTerrain` format + `CustomTerraformer`                      |
| OpenKrush      | Custom map format (Mapd)                                          |
| D2             | `D2BuildableTerrainLayer`, `D2TerrainLayer`                       |
| TiberianDawnHD | `RemasterTerrain`, `RemasterTileCache`, `RemasterTerrainRenderer` |
| OpenSA         | `CustomTerrainRenderer`, growing plants                           |

IC's terrain system should be fully trait-abstracted:
- `TerrainProvider` trait — loads terrain data from whatever format
- `TerrainRenderer` trait — renders terrain (tiles, chunks, continuous)
- `TerrainModifier` trait — runtime terrain changes (craters, floods, concrete, plant growth)

### Pattern 7: Production Models Vary Radically

| Game          | Production Model                                           |
| ------------- | ---------------------------------------------------------- |
| C&C/RA        | Sidebar queue — select from sidebar, unit exits factory    |
| RA2           | Tabbed sidebar — multiple queues by category               |
| KKnD          | On-site construction — MCV moves to location, builds there |
| Dune II       | Single-unit sidebar — one queue, one production at a time  |
| Swarm Assault | Per-building — select building, build from its queue       |

IC should define `ProductionModel` as a `GameModule` registration:
```rust
pub trait ProductionModel: Send + Sync + 'static {
    fn queue_type(&self) -> QueueLayout;  // Sidebar, Tabbed, PerBuilding, OnSite
    fn can_produce(&self, producer: Entity, item: &ActorId, world: &World) -> bool;
    fn start_production(&self, producer: Entity, item: &ActorId, world: &mut World);
    fn complete_production(&self, producer: Entity, item: &ActorId, world: &mut World);
}
```

---

## Summary Table: Feature Impact on IC Design

| Finding                                 | IC Design Area                       | Priority | Action                                                |
| --------------------------------------- | ------------------------------------ | -------- | ----------------------------------------------------- |
| Mods always need code for new mechanics | Modding tiers (D004, D005)           | P0       | Ensure Lua covers 80% of what currently requires C#   |
| 30+ custom file formats across mods     | `ra-formats` / format extensibility  | P1       | WASM-based format loaders OR Kaitai-style schemas     |
| Carrier/spawner is a cross-game pattern | D029 component library               | P1       | Add `SpawnedUnit` to first-party components           |
| Terrain always gets customized          | `GameModule` terrain registration    | P1       | Trait-abstract terrain (provider, renderer, modifier) |
| Production models vary radically        | `GameModule` production registration | P1       | Trait-abstract production (`ProductionModel`)         |
| Content from Steam/GOG/discs/downloads  | Content source system                | P2       | `ContentSource` trait with platform variants          |
| World spawner systems are common        | Sim / world systems                  | P2       | Generic `WorldSpawner` component                      |
| Colony/neutral capturable is cross-game | D029 component library               | P2       | Add `NeutralCapturable` to first-party components     |
| Selection model varies per game         | `GameModule` selection registration  | P2       | `SelectionMode` enum (single, box, priority-box)      |
| Mod composition via DLL stacking        | `GameModule` dependencies            | P3       | Module dependency declaration                         |
| Research trees (OpenKrush)              | Tech system generalization           | P3       | `TechRequirement` trait (prerequisite OR research)    |
| Environmental hazards (sandworms)       | World hazard systems                 | P3       | `WorldHazard` component pattern                       |

---

## Repository Links

- OpenHV: <https://github.com/OpenHV/OpenHV>
- Romanovs-Vengeance: <https://github.com/MustaphaTR/Romanovs-Vengeance>
- OpenKrush: <https://github.com/IceReaper/OpenKrush>
- Dune II (d2): <https://github.com/OpenRA/d2>
- TiberianDawnHD: <https://github.com/OpenRA/TiberianDawnHD>
- OpenSA: <https://github.com/Dzierzan/OpenSA>
