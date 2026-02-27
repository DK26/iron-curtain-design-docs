## Install & Source Layout (Community-Friendly Project Structure)

The directory structure — both the shipped product and the source repository — is designed to feel immediately navigable to anyone who has worked with OpenRA. OpenRA's modding community thrived because the project was approachable: open a mod folder, find YAML rules organized by category, edit values, see results. IC preserves that muscle memory while fitting the structure to a Rust/Bevy codebase.

### Design Principles

1. **Game modules are mods.** Built-in game modules (`mods/ra/`, `mods/td/`) use the exact same directory layout, `mod.yaml` manifest, and YAML rule schema as community-created mods. No internal-only APIs, no special paths. If a modder can edit `mods/ra/rules/units/vehicles.yaml`, anyone can see how the game's own data is structured. Directly inspired by Factorio's "game is a mod" principle (validated in D018).

2. **Same vocabulary, same directories.** OpenRA uses `rules/`, `sequences/`, `chrome/`, `maps/`, `audio/`, `scripts/`. IC uses the same directory names for the same purposes. An OpenRA modder opening IC's `mods/ra/` directory knows where everything is.

3. **Separate binaries for separate roles, GUI-first for players.** Game client and SDK editor are **GUI applications** — players and modders interact through windowed interfaces, never through a terminal. The dedicated server is a **CLI daemon** for headless operation. The `ic` utility is a **developer CLI** for automation and CI/CD. Like OpenRA ships `OpenRA.exe`, `OpenRA.Server.exe`, and `OpenRA.Utility.exe` — each role gets the interface natural to its audience. See `crate-graph.md` § "Binary Architecture: GUI-First Design" for the full breakdown.

4. **Flat and scannable.** No deep nesting for its own sake. A modder looking at `mods/ra/` should see the high-level structure in a single `ls`. Subdirectories within `rules/` organize by category (units, structures, weapons) — the same pattern OpenRA uses.

5. **Data next to data, code next to code.** Game content (YAML, Lua, assets) lives in `mods/`. Engine code (Rust) lives in crate directories. They don't intermingle. A gameplay modder never touches Rust. A engine contributor goes straight to the crate they need.

### Install Directory (Shipped Product)

What an end user sees after installing Iron Curtain:

```
iron-curtain/
├── iron-curtain[.exe]              # Game client — GUI application (ic-game binary)
├── ic-server[.exe]                 # Relay / dedicated server — CLI daemon (ic-net binary)
├── ic[.exe]                        # Developer/modder utility — CLI tool (mod, CI/CD, diagnostics)
├── ic-editor[.exe]                 # SDK — GUI application: scenario editor, asset studio (D038+D040)
├── mods/                           # Game modules + content — the heart of the project
│   ├── common/                     # Shared resources used by all C&C-family modules
│   │   ├── mod.yaml                #   manifest (declares shared chrome, cursors, etc.)
│   │   ├── chrome/                 #   shared UI layout definitions
│   │   ├── cursors/                #   shared cursor definitions
│   │   └── translations/           #   shared localization strings
│   ├── ra/                         # Red Alert game module (ships Phase 2)
│   │   ├── mod.yaml                #   manifest — same schema as any community mod
│   │   ├── rules/                  #   unit, structure, weapon, terrain definitions
│   │   │   ├── units/              #     infantry.yaml, vehicles.yaml, naval.yaml, aircraft.yaml
│   │   │   ├── structures/         #     allied-structures.yaml, soviet-structures.yaml
│   │   │   ├── weapons/            #     ballistics.yaml, missiles.yaml, energy.yaml
│   │   │   ├── terrain/            #     temperate.yaml, snow.yaml, interior.yaml
│   │   │   └── presets/            #     balance presets: classic.yaml, openra.yaml, remastered.yaml (D019)
│   │   ├── maps/                   #   built-in maps
│   │   ├── missions/               #   campaign missions (YAML scenario + Lua triggers)
│   │   ├── sequences/              #   sprite sequence definitions (animation frames)
│   │   ├── chrome/                 #   RA-specific UI layout (sidebar, build queue)
│   │   ├── audio/                  #   music playlists, EVA definitions, voice mappings
│   │   ├── ai/                     #   AI personality profiles (D043)
│   │   ├── scripts/                #   Lua scripts (shared triggers, ability definitions)
│   │   └── themes/                 #   UI theme overrides: classic.yaml, modern.yaml (D032)
│   └── td/                         # Tiberian Dawn game module (ships Phase 3–4)
│       ├── mod.yaml
│       ├── rules/
│       ├── maps/
│       ├── missions/
│       └── ...                     #   same layout as ra/
├── LICENSE
└── THIRD-PARTY-LICENSES
```

**Key features of the install layout:**

- **`mods/common/`** is directly analogous to OpenRA's `mods/common/`. Shared assets, chrome, and cursor definitions used across all C&C-family game modules. Community game modules (Dune 2000, RA2) can depend on it or provide their own.
- **`mods/ra/`** is a mod. It uses the same `mod.yaml` schema, the same `rules/` structure, and the same `sequences/` format as a community mod. There is no "privileged" version of this directory — the engine treats it identically to `<data_dir>/mods/my-total-conversion/`. This means every modder can read the game's own data as a working example.
- **Every YAML file in `mods/ra/rules/` is editable.** Want to change tank cost? Open `rules/units/vehicles.yaml`, find `medium_tank`, change `cost: 800` to `cost: 750`. The same workflow as OpenRA — except the YAML is standard-compliant and serde-typed.
- **The CLI (`ic`) is the modder/operator Swiss Army knife.** `ic mod init`, `ic mod check`, `ic mod test`, `ic mod publish`, `ic backup create`, `ic export`, `ic server validate-config`. One binary, consistent subcommands — aimed at modders, server operators, and CI/CD pipelines. Players never need it — every player-facing action has a GUI equivalent in the game client or SDK editor.

### Source Repository (Contributor Layout)

What a contributor sees after cloning the repository:

```
iron-curtain/                       # Cargo workspace root
├── Cargo.toml                      # Workspace manifest — lists all crates
├── Cargo.lock
├── deny.toml                       # cargo-deny license policy (GPL-compatible deps only)
├── AGENTS.md                       # Agent instructions (this file)
├── README.md
├── LICENSE                         # GPL v3 with modding exception (D051)
├── mods/                           # Game data — YAML, Lua, assets (NOT Rust code)
│   ├── common/
│   ├── ra/
│   └── td/
├── crates/                         # All Rust crates live here
│   ├── ra-formats/                 # .mix, .shp, .pal parsers; MiniYAML converter
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── mix.rs              #   MIX archive reader
│   │       ├── shp.rs              #   SHP sprite reader
│   │       ├── pal.rs              #   PAL palette reader
│   │       ├── aud.rs              #   AUD audio decoder
│   │       ├── vqa.rs              #   VQA video decoder
│   │       ├── miniyaml.rs         #   MiniYAML parser + converter (D025)
│   │       ├── oramap.rs           #   .oramap map loader
│   │       └── mod_manifest.rs     #   OpenRA mod.yaml parser (D026)
│   ├── ic-protocol/                # Shared boundary: orders, codecs
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── orders.rs           #   PlayerOrder, TimestampedOrder
│   │       └── codec.rs            #   OrderCodec trait
│   ├── ic-sim/                     # Deterministic simulation (the core)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs              #   pub API: Simulation, step(), snapshot()
│   │       ├── components/         #   ECS components — one file per domain
│   │       │   ├── mod.rs
│   │       │   ├── health.rs       #     Health, Armor, DamageState
│   │       │   ├── mobile.rs       #     Mobile, Locomotor, Facing
│   │       │   ├── combat.rs       #     Armament, AutoTarget, Turreted, AmmoPool
│   │       │   ├── production.rs   #     Buildable, ProductionQueue, Prerequisites
│   │       │   ├── economy.rs      #     Harvester, ResourceStorage, OreField
│   │       │   ├── transport.rs    #     Cargo, Passenger, Carryall
│   │       │   ├── power.rs        #     PowerProvider, PowerConsumer
│   │       │   ├── stealth.rs      #     Cloakable, Detector
│   │       │   ├── capture.rs      #     Capturable, Captures
│   │       │   ├── veterancy.rs    #     Veterancy, Experience
│   │       │   ├── building.rs     #     Placement, Foundation, Sellable, Repairable
│   │       │   └── support.rs      #     Superweapon, Chronoshift, IronCurtain
│   │       ├── systems/            #   ECS systems — one file per simulation step
│   │       │   ├── mod.rs
│   │       │   ├── orders.rs       #     validate_orders(), apply_orders()
│   │       │   ├── movement.rs     #     movement_system() — pathfinding integration
│   │       │   ├── combat.rs       #     combat_system() — targeting, firing, damage
│   │       │   ├── production.rs   #     production_system() — build queues, prerequisites
│   │       │   ├── harvesting.rs   #     harvesting_system() — ore collection, delivery
│   │       │   ├── power.rs        #     power_system() — grid calculation
│   │       │   ├── fog.rs          #     fog_system() — delegates to FogProvider trait
│   │       │   ├── triggers.rs     #     trigger_system() — Lua/WASM script callbacks
│   │       │   ├── conditions.rs   #     condition_system() — D028 condition evaluation
│   │       │   ├── cleanup.rs      #     cleanup_system() — entity removal, state transitions
│   │       │   └── weather.rs      #     weather_system() — D022 weather state machine
│   │       ├── traits/             #   Pluggable abstractions (D041) — NOT OpenRA "traits"
│   │       │   ├── mod.rs
│   │       │   ├── pathfinder.rs   #     Pathfinder trait (D013)
│   │       │   ├── spatial.rs      #     SpatialIndex trait
│   │       │   ├── fog.rs          #     FogProvider trait
│   │       │   ├── damage.rs       #     DamageResolver trait
│   │       │   ├── validator.rs    #     OrderValidator trait (D041)
│   │       │   └── ai.rs           #     AiStrategy trait (D041)
│   │       ├── math/               #   Fixed-point arithmetic, coordinates
│   │       │   ├── mod.rs
│   │       │   ├── fixed.rs        #     Fixed-point types (i32/i64 scale — P002)
│   │       │   └── pos.rs          #     WorldPos, CellPos
│   │       ├── rules/              #   YAML rule deserialization (serde structs)
│   │       │   ├── mod.rs
│   │       │   ├── unit.rs         #     UnitDef, Buildable, DisplayInfo
│   │       │   ├── weapon.rs       #     WeaponDef, Warhead, Projectile
│   │       │   ├── alias.rs        #     OpenRA trait name alias registry (D023)
│   │       │   └── inheritance.rs  #     YAML inheritance resolver
│   │       └── snapshot.rs         #   State serialization for saves/replays/rollback
│   ├── ic-net/                     # Networking (never imports ic-sim)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── network_model.rs    #   NetworkModel trait (D006)
│   │       ├── lockstep.rs         #   LockstepNetwork implementation
│   │       ├── local.rs            #   LocalNetwork (testing, single-player)
│   │       ├── relay_core.rs       #   RelayCore library (D007)
│   │       └── bin/
│   │           └── relay.rs        #   relay-server binary entry point
│   ├── ic-render/                  # Isometric rendering (Bevy plugin)
│   ├── ic-ui/                      # Game chrome, sidebar, minimap
│   ├── ic-audio/                   # Sound, music, EVA, VoIP
│   ├── ic-script/                  # Lua + WASM mod runtimes
│   ├── ic-ai/                      # Skirmish AI, adaptive difficulty
│   ├── ic-llm/                     # LLM mission generation (optional)
│   ├── ic-paths/                   # Platform path resolution, portable mode (wraps `app-path`)
│   ├── ic-editor/                  # SDK binary: scenario editor, asset studio (D038+D040)
│   └── ic-game/                    # Game binary: ties all plugins together
│       ├── Cargo.toml
│       └── src/
│           └── main.rs             #   Bevy App setup, plugin registration
├── tools/                          # Developer tools (not shipped)
│   ├── miniyaml2yaml/              #   MiniYAML → YAML batch converter CLI
│   └── replay-corpus/              #   Foreign replay regression test harness (D056)
└── tests/                          # Integration tests
    ├── sim/                        #   Deterministic sim regression tests
    └── format/                     #   File format round-trip tests
```

### Where OpenRA Contributors Find Things

An OpenRA contributor's first question is "where does this live in IC?" This table maps OpenRA's C# project structure to IC's Rust workspace:

| What you did in OpenRA            | Where in OpenRA                      | Where in IC                              | Notes                                        |
| --------------------------------- | ------------------------------------ | ---------------------------------------- | -------------------------------------------- |
| Edit unit stats (cost, HP, speed) | `mods/ra/rules/*.yaml`               | `mods/ra/rules/units/*.yaml`             | Same workflow, real YAML instead of MiniYAML |
| Edit weapon definitions           | `mods/ra/weapons/*.yaml`             | `mods/ra/rules/weapons/*.yaml`           | Nested under `rules/` for discoverability    |
| Edit sprite sequences             | `mods/ra/sequences/*.yaml`           | `mods/ra/sequences/*.yaml`               | Identical location                           |
| Write Lua mission scripts         | `mods/ra/maps/*/script.lua`          | `mods/ra/missions/*.lua`                 | Same API (D024), dedicated directory         |
| Edit UI layout (chrome)           | `mods/ra/chrome/*.yaml`              | `mods/ra/chrome/*.yaml`                  | Identical location                           |
| Edit balance/speed/settings       | `mods/ra/mod.yaml`                   | `mods/ra/rules/presets/*.yaml`           | Separated into named presets (D019)          |
| Add a new C# trait (component)    | `OpenRA.Mods.RA/Traits/*.cs`         | `crates/ic-sim/src/components/*.rs`      | Rust struct + derive instead of C# class     |
| Add a new activity (behavior)     | `OpenRA.Mods.Common/Activities/*.cs` | `crates/ic-sim/src/systems/*.rs`         | ECS system instead of activity object        |
| Add a new warhead type            | `OpenRA.Mods.Common/Warheads/*.cs`   | `crates/ic-sim/src/components/combat.rs` | Warheads are component data + system logic   |
| Add a format parser               | `OpenRA.Game/FileFormats/*.cs`       | `crates/ra-formats/src/*.rs`             | One file per format, same as OpenRA          |
| Add a Lua scripting global        | `OpenRA.Mods.Common/Scripting/*.cs`  | `crates/ic-script/src/*.rs`              | D024 API surface                             |
| Edit AI behavior                  | `OpenRA.Mods.Common/AI/*.cs`         | `crates/ic-ai/src/*.rs`                  | Priority-manager hierarchy                   |
| Edit rendering                    | `OpenRA.Game/Graphics/*.cs`          | `crates/ic-render/src/*.rs`              | Bevy render plugin                           |
| Edit server/network code          | `OpenRA.Server/*.cs`                 | `crates/ic-net/src/*.rs`                 | Never touches ic-sim                         |
| Run the utility CLI               | `OpenRA.Utility.exe`                 | `ic[.exe]`                               | `ic mod check`, `ic export`, etc.            |
| Run a dedicated server            | `OpenRA.Server.exe`                  | `ic-server[.exe]`                        | Or `ic server run` via CLI                   |

### ECS Translation: OpenRA Traits → IC Components + Systems

OpenRA merges data and behavior into "traits" (C# classes). In IC's ECS architecture, these split into **components** (data) and **systems** (behavior):

| OpenRA Trait         | IC Component(s)                  | IC System                             | File(s)                                             |
| -------------------- | -------------------------------- | ------------------------------------- | --------------------------------------------------- |
| `Health`             | `Health`, `Armor`                | `combat_system()` applies damage      | `components/health.rs`, `systems/combat.rs`         |
| `Mobile`             | `Mobile`, `Locomotor`, `Facing`  | `movement_system()` moves entities    | `components/mobile.rs`, `systems/movement.rs`       |
| `Armament`           | `Armament`, `AmmoPool`           | `combat_system()` fires weapons       | `components/combat.rs`, `systems/combat.rs`         |
| `Harvester`          | `Harvester`, `ResourceStorage`   | `harvesting_system()` gathers ore     | `components/economy.rs`, `systems/harvesting.rs`    |
| `Buildable`          | `Buildable`, `Prerequisites`     | `production_system()` manages queue   | `components/production.rs`, `systems/production.rs` |
| `Cargo`, `Passenger` | `Cargo`, `Passenger`             | `transport_system()` loads/unloads    | `components/transport.rs`                           |
| `Cloak`              | `Cloakable`, `Detector`          | `stealth_system()` updates visibility | `components/stealth.rs`                             |
| `Valued`             | Part of `Buildable` (cost field) | —                                     | `components/production.rs`                          |
| `ConditionalTrait`   | Condition system (D028)          | `condition_system()` evaluates        | `systems/conditions.rs`                             |

The naming convention follows Rust idioms (`snake_case` files, `PascalCase` types) but the organization mirrors OpenRA's categorical grouping — combat things together, economy things together, movement things together.

### Why This Layout Works for the Community

**For data modders (80% of mods):** Never leave `mods/`. Edit YAML, run `ic mod check`, see results. The built-in game modules serve as always-available, documented examples of every YAML feature. No need to read Rust code to understand what fields a unit definition supports — look at `mods/ra/rules/units/infantry.yaml`.

**For Lua scripters (missions, game modes):** Write `scripts/*.lua` in your mod directory. The API is a superset of OpenRA's (D024) — same 16 globals, same function signatures. Existing OpenRA missions run unmodified. Test with `ic mod test`.

**For engine contributors:** Clone the repo. `crates/` holds all Rust code. Each crate has a single responsibility and clear boundaries. The naming (`ic-sim`, `ic-net`, `ic-render`) tells you what it does. Within `ic-sim`, `components/` holds data, `systems/` holds logic, `traits/` holds the pluggable abstractions — the ECS split is consistent and predictable.

**For total-conversion modders:** The `ic-sim/src/traits/` directory defines every pluggable seam — custom pathfinder, custom AI, custom fog of war, custom damage resolution. Implement a trait as a WASM module (Tier 3), register it in your `mod.yaml`, and the engine uses your implementation. No forking, no C# DLL stacking.

### Development Asset Strategy

A clean-sheet engine needs art for editor chrome, UI menus, CI testing, and developer workflows — but it cannot ship or commit copyrighted game content. This subsection documents how reference projects host their game resources, what IC can freely use, and what belongs (or doesn't belong) in the repository.

#### How Reference Projects Host Game Resources

**Original Red Alert (1996):** Assets ship as `.mix` archives — flat binary containers with CRC-hashed filenames. Originally distributed on CD-ROM, later as a freeware download installer (2008). All sprites (`.shp`), terrain (`.tmp`), palettes (`.pal`), audio (`.aud`), and cutscenes (`.vqa`) are packed inside these archives. No separate asset repository — everything distributes as compiled binaries through retail channels. The freeware release means free to download and play, not free to redistribute or embed in another project.

**EA Remastered Collection (2020):** Assets distribute through Steam (and previously Origin). The HD sprite sheets, remastered music, and cutscenes are **proprietary EA content** — not covered by the GPL v3 license that applies only to the C++ engine DLLs. Resources use updated archive formats (MegV3 for TD HD, standard `.mix` for classic mode) at known Steam AppId paths. See § Content Detection for how IC locates these.

**OpenRA:** The engine **never distributes copyrighted game assets**. On first launch, a content installer detects existing game installations (Steam, Origin, GOG, disc copies) or downloads specific `.mix` files from EA's publicly accessible mirrors (the freeware releases). Assets are extracted and stored to `~/.openra/Content/ra/` (Linux) or the OS-appropriate equivalent. The OpenRA **source repository** contains only engine code (C#, GPL v3), original UI chrome art, mod rules (MiniYAML), maps, Lua scripts, and editor art — all OpenRA-created content. The few original assets (icons, cursors, fonts, panel backgrounds) are small enough for plain git. No Git LFS, no external asset hosting.

**Key pattern:** Every successful engine reimplementation project (OpenRA, CorsixTH, OpenMW, Wargus) uses the same model — engine code in the repo, game content loaded at runtime from the player's own installation. IC follows this pattern exactly.

#### Legal Boundaries — What IC Can Freely Use

| Source                                                                                                              | What's freely usable                                                                                                                                  | What's NOT usable                                                                       | License                |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------- |
| **EA Red Alert source** ([CnC_Red_Alert](https://github.com/electronicarts/CnC_Red_Alert))                          | Struct definitions, algorithms, lookup tables, gameplay constants (weapon damage, unit speeds, build times) embedded in C/C++ code                    | Zero art assets, zero sprites, zero music, zero palettes — the repo is pure source code | GPL v3                 |
| **EA Remastered source** ([CnC_Remastered_Collection](https://github.com/electronicarts/CnC_Remastered_Collection)) | C++ engine DLL source code, format definitions, bug-fixed gameplay logic                                                                              | HD sprite sheets, remastered music, Petroglyph's C# GUI layer, all visual/audio content | GPL v3 (C++ DLLs only) |
| **EA Generals source** ([CnC_Generals_Zero_Hour](https://github.com/electronicarts/CnC_Generals_Zero_Hour))         | Netcode reference, pathfinding code, gameplay system architecture                                                                                     | No art or audio assets in the repository                                                | GPL v3                 |
| **OpenRA source** ([OpenRA](https://github.com/OpenRA/OpenRA))                                                      | Engine code, UI chrome art (buttons, panels, scrollbars, dropdown frames), custom cursors, fonts, icons, map editor UI art, MiniYAML rule definitions | Nothing — all repo content is GPL v3                                                    | GPL v3                 |

**OpenRA's original chrome art** is technically GPL v3 and could be used — but IC's design explicitly creates **all theme art as original work** (D032). Copying OpenRA's chrome would create visual confusion between the two projects and contradict the design direction. Study the *patterns* (layout structure, what elements exist), create original art.

The EA GPL source repositories contain **no art assets whatsoever** — only C/C++ source code. The `.mix` archives containing actual game content (sprites, audio, palettes, terrain, cutscenes) are copyrighted EA property distributed through retail channels, even in the freeware release.

#### What Belongs in the Repository

| Asset category                                             | In repo?  | Mechanism                                           | Notes                                                      |
| ---------------------------------------------------------- | --------- | --------------------------------------------------- | ---------------------------------------------------------- |
| **EA game files** (`.mix`, `.shp`, `.aud`, `.vqa`, `.pal`) | **Never** | `ContentDetector` finds player's install at runtime | Same model as OpenRA — see § Content Detection             |
| **IC-original editor art** (toolbar icons, cursors)        | Yes       | Plain git — small files (~1-5KB each)               | ~20 icons for SDK, original creations                      |
| **YAML rules, maps, Lua scripts**                          | Yes       | Plain git — text files                              | All game content data authored by IC                       |
| **Synthetic test fixtures**                                | Yes       | Plain git — tiny hand-crafted binaries              | Minimal `.mix`/`.shp`/`.pal` (~100 bytes) for parser tests |
| **UI fonts**                                               | Yes       | Plain git — OFL/Apache licensed                     | Open fonts bundled with the engine                         |
| **Placeholder/debug sprites**                              | Yes       | Plain git — original creations                      | Colored rectangles, grid patterns, numbered circles        |
| **Large binary art** (future HD sprite packs, music)       | No        | Workshop P2P distribution (D049)                    | Community-created content                                  |
| **Demo videos, screenshots**                               | No        | External hosting, linked from docs                  | YouTube, project website                                   |

**Git LFS is not needed.** The design docs already rejected Git LFS for Workshop distribution ("1GB free then paid; designed for source code, not binary asset distribution; no P2P" — see D049). The same reasoning applies to development: IC's repository is code + YAML + design docs + small original icons. Total committed binary assets will stay well under 10MB.

**CI testing strategy:** Parser and format tests use synthetic fixtures — small, hand-crafted binary files (a 2-frame `.shp`, a trivial `.mix` with 3 files, a minimal `.pal`) committed to `tests/fixtures/`. These are original creations that exercise `ra-formats` code without containing EA content. Integration tests requiring real RA assets are gated behind an optional feature flag (`#[cfg(feature = "integration")]`) and run on CI runners where RA is installed, configured via `IC_CONTENT_DIR` environment variable.

#### Repository Asset Layout

Extending the source repository layout (see § Source Repository above):

```
iron-curtain/
├── assets/                         # IC-original assets ONLY (committed)
│   ├── editor/                     #   SDK toolbar icons, editor cursors, panel art
│   ├── ui/                         #   Menu chrome sprites, HUD elements
│   ├── fonts/                      #   Bundled open-licensed fonts
│   └── placeholder/                #   Debug sprites, test palettes, grid overlays
├── tests/
│   └── fixtures/                   #   Synthetic .mix/.shp/.pal for parser tests
├── content/                        #   *** GIT-IGNORED *** — local dev game files
│   └── ra/                         #   Developer's RA installation (pointed to or symlinked)
├── .gitignore                      #   Ignores content/, target/, *.db
└── ...
```

The `content/` directory is git-ignored. Each developer either symlinks it to their RA installation or sets `IC_CONTENT_DIR` to point elsewhere. This keeps copyrighted assets completely out of version control while giving developers a consistent local path for testing.

#### Freely-Usable Resources for Graphics, Menus & CI

IC needs original art for editor chrome, UI menus, and visual tooling. These are the recommended open-licensed sources:

**Icon libraries (for editor toolbar, SDK panels, menu items):**

| Library                                            | License              | Notes                                                                                                  |
| -------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| [Lucide](https://lucide.dev/)                      | ISC (MIT-equivalent) | 1500+ clean SVG icons. Fork of Feather Icons with active maintenance. Excellent for toolbar/menu icons |
| [Tabler Icons](https://tabler.io/icons)            | MIT                  | 5400+ SVG icons. Comprehensive coverage including RTS-relevant icons (map, layers, grid, cursor)       |
| [Material Symbols](https://fonts.google.com/icons) | Apache 2.0           | Google's icon set. Variable weight/size. Massive catalog                                               |
| [Phosphor Icons](https://phosphoricons.com/)       | MIT                  | 9000+ icons in 6 weights. Clean geometric style                                                        |

**Fonts (for UI text, editor panels, console):**

| Font                                                 | License | Notes                                                           |
| ---------------------------------------------------- | ------- | --------------------------------------------------------------- |
| [Inter](https://rsms.me/inter/)                      | OFL 1.1 | Optimized for screens. Excellent for UI text at all sizes       |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | OFL 1.1 | Monospace. Ideal for console, YAML editor, debug overlays       |
| [Noto Sans](https://fonts.google.com/noto)           | OFL 1.1 | Broad Unicode coverage. Strong fallback-family backbone for localization (including RTL/CJK) |
| [Fira Code](https://github.com/tonsky/FiraCode)      | OFL 1.1 | Monospace with ligatures. Alternative to JetBrains Mono         |

**Smart font support note (localization/RTL):**

- Primary UI fonts (theme-driven) and fallback fonts (coverage-driven) are distinct concerns.
- A broad-coverage family such as Noto should be available as the fallback backbone for scripts not covered by the theme's primary font.
- Correct RTL rendering still depends on the shared shaping + BiDi + layout-direction contract above; fallback fonts alone are insufficient.

**UI framework:**

- **egui** (MIT) — the editor's panel/widget framework. Ships with Bevy via `bevy_egui`. Provides buttons, sliders, text inputs, dropdown menus, tree views, docking, color pickers — all rendered procedurally with no external art needed. Handles 95% of SDK chrome requirements.
- **Bevy UI** — the game client's UI framework. Used for in-game chrome (sidebar, minimap, build queue) with IC-original sprite sheets styled per theme (D032).

**Game content (sprites, terrain, audio, cutscenes):**

- **Player's own RA installation** — loaded at runtime via `ContentDetector`. Every developer needs Red Alert installed locally (Steam, GOG, or freeware). This is the development workflow, not a limitation — you're building an engine for a game you play.
- **No external asset CDN.** IC does not host, mirror, or download copyrighted game files. The browser build (Phase 7) uses drag-and-drop import from the player's local files — see `05-FORMATS.md` § Browser Asset Storage.

**Placeholder art (for development before real assets load):**

During early development, before the full content detection pipeline is complete, use committed placeholder assets in `assets/placeholder/`:

- Colored rectangles (16×16, 24×24, 48×48) as unit stand-ins
- Numbered grid tiles for terrain testing
- Solid-color palette files (`.pal`-format, 768 bytes) for render pipeline testing
- Simple geometric shapes for building footprints
- Generated checkerboard patterns for missing texture fallbacks

These are all original creations — trivial to produce, zero legal risk, and immediately useful for testing the render pipeline before content detection is wired up.

