# Player, Game State & Infrastructure

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

**Analysis event stream:** A separate data stream alongside the order stream, recording structured gameplay events (unit births, deaths, position samples, resource collection, production events). Not required for playback — purely for post-game analysis, community statistics, and tournament casting tools. See `formats/save-replay-formats.md` § "Analysis Event Stream" for the event taxonomy.

**Per-player score tracking:** `GameScore` structs (see `02-ARCHITECTURE.md` § "Game Score / Performance Metrics") are snapshotted periodically into the replay file. This enables post-game economy graphs, APM timelines, and comparative player performance overlays — the same kind of post-game analysis screen that SC2 popularized. OpenRA's replay stores only raw orders; extracting statistics requires re-simulating the entire game. IC's approach stores the computed metrics at regular intervals for instant post-game display.

**Replay versioning:** Replay files include a `base_build` number and a `data_version` hash in the replay metadata JSON (following SC2's dual-version scheme — see `formats/save-replay-formats.md` § "Metadata"). The `base_build` identifies the protocol format; `data_version` identifies the game rules state. A replay is playable if the engine supports its `base_build` protocol, even if minor game data changes occurred between versions.

**Foreign replay import (D056):** IC can directly play back OpenRA `.orarep` files and Remastered Collection replay recordings via `ForeignReplayPlayback` — a `NetworkModel` implementation that decodes foreign replay formats through `ra-formats`, translates orders via `ForeignReplayCodec`, and feeds them to IC's sim. Playback will diverge from the original sim (D011), but a `DivergenceTracker` monitors and surfaces drift in the UI. Foreign replays can also be converted to `.icrep` via `ic replay import` for archival and analysis tooling. The foreign replay corpus doubles as an automated behavioral regression test suite — detecting gross bugs like units walking through walls or harvesters ignoring ore. See `formats/save-replay-formats.md` § "Foreign Replay Decoders" and `decisions/09f/D056-replay-import.md`.

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
