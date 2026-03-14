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

| Feature                                                     | IC Design Doc                      | OpenRA Status                         |
| ----------------------------------------------------------- | ---------------------------------- | ------------------------------------- |
| **LLM-generated missions & campaigns**                      | `04-MODDING.md`, Phase 7           | Not present                           |
| **Branching campaigns with persistent state**               | D021, `04-MODDING.md`              | Not present (linear campaigns only)   |
| **WASM mod runtime**                                        | `04-MODDING.md` Tier 3             | Not present (C# DLLs only)            |
| **Switchable balance presets**                              | D019                               | Not present (one balance per mod)     |
| **Sub-tick timestamped orders**                             | D008, `03-NETCODE.md`              | Not present                           |
| **Relay server architecture**                               | D007, `03-NETCODE.md`              | Not present (P2P only)                |
| **Cross-engine compatibility**                              | `07-CROSS-ENGINE.md`               | Not present                           |
| **Multi-game engine** (RA1+RA2+TD on one engine)            | D018, `02-ARCHITECTURE.md`         | Partial (3 games but tightly coupled) |
| **`llm:` metadata on all resources**                        | `04-MODDING.md`                    | Not present                           |
| **Weather system** (with sim effects)                       | `04-MODDING.md`                    | Visual only (WeatherOverlay trait)    |
| **Workshop with semantic search**                           | `04-MODDING.md`                    | Forum-based mod sharing               |
| **Mod SDK with CLI tool**                                   | D020, `04-MODDING.md`              | Exists but requires .NET              |
| **Competitive infrastructure** (rated, ranked, tournaments) | `01-VISION.md`                     | Basic (no ranked, no leagues)         |
| **Platform portability** (WASM, mobile, console)            | `02-ARCHITECTURE.md`               | Desktop only                          |
| **3D rendering mod support**                                | `02-ARCHITECTURE.md`               | Not architecturally possible          |
| **Signed/certified match results**                          | `06-SECURITY.md`                   | Not present                           |
| **Video as workshop resource**                              | `04-MODDING.md`                    | Not present                           |
| **Scene templates** (parameterized mission building blocks) | `04-MODDING.md`                    | Not present                           |
| **Adaptive difficulty** (via campaign state or LLM)         | `04-MODDING.md`, `01-VISION.md`    | Not present                           |
| **In-game Workshop browser** (search, filter, one-click)    | D030, `04-MODDING.md`              | Not present (forum sharing only)      |
| **Auto-download on lobby join** (CS:GO-style)               | D030, `03-NETCODE.md`              | Not present (manual install)          |
| **Steam Workshop as source** (optional, federated)          | D030, `04-MODDING.md`              | Not present                           |
| **Creator reputation & badges**                             | D030, `04-MODDING.md`              | Not present                           |
| **DMCA/takedown policy** (due process)                      | D030, `decisions/09e-community.md` | Not present                           |
| **Creator recognition & tipping**                           | D035, `04-MODDING.md`              | Not present                           |
| **Achievement system** (engine + mod-defined)               | D036, `decisions/09e-community.md` | Not present                           |
| **Community governance model** (elected reps, RFC process)  | D037, `decisions/09e-community.md` | Not present                           |

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
