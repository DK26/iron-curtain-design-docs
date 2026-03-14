# Movement, Terrain & Maps

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
