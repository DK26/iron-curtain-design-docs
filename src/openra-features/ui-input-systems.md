# UI, Input & Scripting Systems

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
