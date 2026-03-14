## D067: Configuration Format Split — TOML for Engine, YAML for Content

**Decision:** All engine and infrastructure configuration files use **TOML**. All game content, mod definitions, and data-driven gameplay files use **YAML**. The file extension alone tells you what kind of file you're looking at: `.toml` = how the engine runs, `.yaml` = what the game is.

**Context:** The current design uses YAML for everything — client settings, server configuration, mod manifests, unit definitions, campaign graphs, UI themes, balance presets. This works technically (YAML is a superset of what we need), but it creates an orientation problem. When a contributor opens a directory full of `.yaml` files, they can't tell at a glance whether `config.yaml` is an engine knob they can safely tune or a game rule file that affects simulation determinism. When a modder opens `server_config.yaml`, the identical extension to their `units.yaml` suggests both are part of the same system — they're not. And when documentation says "configured in YAML," it doesn't distinguish "configured by the engine operator" from "configured by the mod author."

TOML is already present in the Rust ecosystem (`Cargo.toml`, `deny.toml`, `rustfmt.toml`, `clippy.toml`) and in the project itself. Rust developers already associate `.toml` with configuration. The split formalizes what's already a natural instinct.

**The rule is simple:** If it configures the engine, the server, or the development toolchain, it's TOML. If it defines game content that flows through the mod/asset pipeline or the simulation, it's YAML.

### File Classification

#### TOML — Engine & Infrastructure Configuration

| File                        | Purpose                                                                                      | Decision Reference    |
| --------------------------- | -------------------------------------------------------------------------------------------- | --------------------- |
| `config.toml`               | Client engine settings: render, audio, keybinds, net diagnostics, debug flags                | D058 (console/cvars)  |
| `config.<module>.toml`      | Per-game-module client overrides (e.g., `config.ra1.toml`)                                   | D058                  |
| `server_config.toml`        | Relay/server parameters: ~200 cvars across 14 subsystems                                     | D064                  |
| `settings.toml`             | Workshop sources, P2P bandwidth, compression levels, cloud sync, community list              | D030, D063            |
| `deny.toml`                 | License enforcement for `cargo deny`                                                         | Already TOML          |
| `Cargo.toml`                | Rust build system                                                                            | Already TOML          |
| Server deployment profiles  | `profiles/tournament-lan.toml`, `profiles/casual-community.toml`, etc.                       | D064, 15-SERVER-GUIDE |
| `compression.advanced.toml` | Advanced compression parameters for server operators (if separate from `server_config.toml`) | D063                  |
| Editor preferences          | `editor_prefs.toml` — SDK window layout, recent files, panel state                           | D038, D040            |
| `mod.toml`                  | IC-native mod manifest: name, version, dependencies, engine pin, asset listings              | D026                  |
| Mod profiles                | `profiles/*.toml` — named mod set + experience settings + conflict resolutions               | D062                  |

**Why TOML for configuration:**
- **Flat and explicit.** TOML doesn't allow the deeply nested structures that make YAML configs hard to scan. `[render]` / `shadows = true` is immediately readable. Configuration *should* be flat — if your config file needs 6 levels of nesting, it's probably content.
- **No gotchas.** YAML has well-known foot-guns: `Norway: NO` parses as `false`, bare `3.0` vs `"3.0"` ambiguity, tab/space sensitivity. TOML avoids all of these — critical for files that non-developers (server operators, tournament organizers) will edit by hand.
- **Type-safe.** TOML has native integer, float, boolean, datetime, and array types with unambiguous syntax. `max_fps = 144` is always an integer, never a string. YAML's type coercion surprises people.
- **Ecosystem alignment.** Rust's `serde` supports TOML via `toml` crate with identical derive macros to `serde_yaml`. The entire Rust toolchain uses TOML for configuration. IC contributors expect it.
- **Tooling.** [taplo](https://taplo.tamasfe.dev/) provides TOML LSP (validation, formatting, schema support) matching what YAML gets from Red Hat's YAML extension. VS Code gets first-class support for both.
- **Comments preserved.** TOML's comment syntax (`#`) is simple and universally understood. Round-trip serialization with `toml_edit` preserves comments and formatting — essential for files users hand-edit.

#### YAML — Game Content & Mod Data

| File                             | Purpose                                                          | Decision Reference   |
| -------------------------------- | ---------------------------------------------------------------- | -------------------- |
| Unit/weapon/building definitions | `units/*.yaml`, `weapons/*.yaml`, `buildings/*.yaml`             | D003, Tier 1 modding |
| `campaign.yaml`                  | Campaign graph, mission sequence, persistent state               | D021                 |
| `theme.yaml`                     | UI theme definition: sprite sheets, 9-slice coordinates, colors  | D032                 |
| `ranked-tiers.yaml`              | Competitive rank names, thresholds, icons per game module        | D055                 |
| Balance presets                  | `presets/balance/*.yaml` — Classic/OpenRA/Remastered values      | D019                 |
| QoL presets                      | `presets/qol/*.yaml` — behavior toggle configurations            | D033                 |
| Map files                        | IC map format (terrain, actors, triggers, metadata)              | D025                 |
| Scenario triggers/modules        | Trigger definitions, waypoints, compositions                     | D038                 |
| String tables / localization     | Translatable game text                                           | —                    |
| Editor extensions                | `editor_extension.yaml` — custom palettes, panels, brushes       | D066                 |
| Export config                    | `export_config.yaml` — target engine, version, content selection | D066                 |
| `credits.yaml`                   | Campaign credits sequence                                        | D038                 |
| `loading_tips.yaml`              | Loading screen tips                                              | D038                 |
| Tutorial definitions             | Hint triggers, tutorial step sequences                           | D065                 |
| AI personality definitions       | Build orders, aggression curves, expansion strategies            | D043                 |
| Achievement definitions          | In `mod.toml` or separate achievement YAML files                 | D036                 |

**Why YAML stays for content:**
- **Deep nesting is natural.** Unit definitions have `combat.weapons[0].turret.target_filter` — content IS hierarchical. YAML handles this ergonomically. TOML's `[[combat.weapons]]` tables are awkward for deeply nested game data.
- **Inheritance and composition.** IC's YAML content uses `inherits:` chains. Content files are designed for the `serde_yaml` pipeline with load-time inheritance resolution. TOML has no equivalent pattern.
- **Community expectation.** The C&C modding community already works with MiniYAML (OpenRA) and INI (original). YAML is the closest modern equivalent — familiar structure, familiar ergonomics. Nobody expects to define unit stats in TOML.
- **Multi-document support.** YAML's `---` document separator allows multiple logical documents in one file (e.g., multiple unit definitions). TOML has no multi-document support.
- **Existing ecosystem.** JSON Schema validation for YAML content, D023 alias resolution, D025 MiniYAML conversion — all built around the YAML pipeline. The content toolchain is YAML-native.

### Edge Cases & Boundary Rules

| File                       | Classification | Reasoning                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mod.toml` (mod manifest)  | **TOML**       | It's infrastructure about a mod — identity, version, engine pin, dependencies, file listings. These are flat key-value fields, the same shape as `Cargo.toml`. Every comparable package ecosystem uses TOML/JSON for manifests. OpenRA's `mod.yaml` is still READ for compatibility (D026), but IC-native manifests use TOML. |
| Mod profiles (D062)        | **TOML**       | Infrastructure about which mods to load, in what order, with what conflict resolutions. Flat structure, no inheritance chains. Same rationale as server deployment profiles.                                                                                                                                                  |
| Server deployment profiles | **TOML**       | They're server configuration variants, not game content. The relay reads them the same way it reads `server_config.toml`.                                                                                                                                                                                                     |
| `export_config.yaml`       | **YAML**       | Export configuration is part of the content creation workflow — it describes what to export (content), not how the engine operates. It travels alongside the scenario/mod it targets.                                                                                                                                         |
| `ic.lock`                  | **TOML**       | Lockfiles are infrastructure (dependency resolution state). Follows `Cargo.lock` convention.                                                                                                                                                                                                                                  |
| `.iccmd` console scripts   | **Neither**    | These are script files, not configuration or content. Keep as-is.                                                                                                                                                                                                                                                             |

**The boundary test:** Ask "does this file affect the simulation or define game content?" If yes → YAML. "Does this file configure how the engine, server, or toolchain operates?" If yes → TOML. If genuinely ambiguous, prefer YAML (content is the larger set and the default assumption).

### Learning Curve: Two Formats, Not Two Languages

**The concern:** Introducing a second format means contributors who know YAML must now also navigate TOML. Does this add real complexity?

**The short answer:** No — it removes complexity. TOML is a *strict subset* of what YAML can do. Anyone who can read YAML can read TOML in under 60 seconds. The syntax delta is tiny:

| Concept        | YAML                           | TOML                            |
| -------------- | ------------------------------ | ------------------------------- |
| Key-value      | `max_fps: 144`                 | `max_fps = 144`                 |
| Section        | Indentation under parent key   | `[section]` header              |
| Nested section | More indentation               | `[parent.child]`                |
| String         | `name: "Tank"` or `name: Tank` | `name = "Tank"` (always quoted) |
| Boolean        | `enabled: true`                | `enabled = true`                |
| List           | `- item` on new lines          | `items = ["a", "b"]`            |
| Comment        | `# comment`                    | `# comment`                     |

That's it. TOML syntax is closer to traditional INI and `.conf` files than to YAML. Server operators, sysadmins, and tournament organizers — the people who edit `server_config.toml` — already know this format from `php.ini`, `my.cnf`, `sshd_config`, `Cargo.toml`, and every other flat configuration file they've ever touched. TOML is the *expected* format for configuration. YAML is the surprise.

**Audience separation means most people touch only one format:**

| Role                                             | Touches TOML? | Touches YAML? |
| ------------------------------------------------ | ------------- | ------------- |
| **Modder** (unit stats, weapons, balance)        | No            | Yes           |
| **Map maker** (terrain, triggers, scenarios)     | No            | Yes           |
| **Campaign author** (mission graph, dialogue)    | No            | Yes           |
| **Server operator** (relay tuning, deployment)   | Yes           | No            |
| **Tournament organizer** (match rules, profiles) | Yes           | No            |
| **Engine developer** (build config, CI)          | Yes           | Yes           |
| **Total conversion modder**                      | Rarely        | Yes           |

A modder who defines unit stats in YAML will never need to open a TOML file. A server operator tuning relay parameters will never need to edit YAML content files. The only role that routinely touches both is an engine developer — and Rust developers already live in TOML (`Cargo.toml`, `rustfmt.toml`, `clippy.toml`, `deny.toml`).

**TOML actually reduces complexity for the files it governs:**

- **No indentation traps.** YAML config files break silently when you mix tabs and spaces, or when you indent a key one level too deep. TOML uses `[section]` headers — indentation is cosmetic, not semantic.
- **No type coercion surprises.** In YAML, `version: 3.0` is a float but `version: "3.0"` is a string. `country: NO` (Norway) is `false`. `on: push` (GitHub Actions) is `{true: "push"}`. TOML has explicit, unambiguous types — what you write is what you get.
- **No multi-line ambiguity.** YAML has 9 different ways to write a multi-line string (`|`, `>`, `|+`, `|-`, `>+`, `>-`, etc.). TOML has one: `"""triple quotes"""`.
- **Smaller spec.** The complete TOML spec is ~3 pages. The YAML spec is 86 pages. A format you can learn completely in 10 minutes is inherently less complex than one with hidden corners.

The split doesn't ask anyone to learn a harder thing — it gives configuration files the *simpler* format and keeps the *more expressive* format for the content that actually needs it.

### Cvar Persistence

Cvars currently write back to `config.yaml`. Under D067, they write back to `config.toml`. The cvar key mapping is identical — `render.shadows` in the cvar system corresponds to `[render] shadows` in TOML. The `toml_edit` crate enables round-trip serialization that preserves user comments and formatting, matching the current YAML behavior.

```toml
# config.toml — client engine settings
# This file is auto-managed by the engine. Manual edits are preserved.

[render]
tier = "enhanced"           # "baseline", "standard", "enhanced", "ultra", "auto"
fps_cap = 144               # 30, 60, 144, 240, 0 (uncapped)
vsync = "adaptive"          # "off", "on", "adaptive", "mailbox"
resolution_scale = 1.0      # 0.5–2.0

[render.anti_aliasing]
msaa = "off"
smaa = "high"               # "off", "low", "medium", "high", "ultra"

[render.post_fx]
enabled = true
bloom_intensity = 0.2
tonemapping = "tony_mcmapface"
deband_dither = true

[render.lighting]
shadows = true
shadow_quality = "high"     # "off", "low", "medium", "high", "ultra"
shadow_filter = "gaussian"  # "hardware_2x2", "gaussian", "temporal"
ambient_occlusion = true

[render.particles]
density = 0.8
backend = "gpu"             # "cpu", "gpu"

[render.textures]
filtering = "trilinear"     # "nearest", "bilinear", "trilinear"
anisotropic = 8             # 1, 2, 4, 8, 16

# Full [render] schema: see 10-PERFORMANCE.md § "Full config.toml [render] Section"

[audio]
master_volume = 80
music_volume = 60
eva_volume = 100

[gameplay]
scroll_speed = 5
control_group_steal = false
auto_rally_harvesters = true

[net]
show_diagnostics = false
sync_frequency = 120

[debug]
show_fps = true
show_network_stats = false
```

Load order remains unchanged: `config.toml` → `config.<game_module>.toml` → command-line arguments → in-game `/set` commands.

### Server Configuration

`server_config.toml` replaces `server_config.yaml`. The three-layer precedence (D064) becomes TOML → env vars → runtime cvars:

```toml
# server_config.toml — relay/community server configuration

[relay]
bind_address = "0.0.0.0:7400"
max_concurrent_games = 50
tick_rate = 30

[match]
max_players = 8
max_game_duration_minutes = 120
allow_observers = true

[pause]
max_pauses_per_player = 3
pause_duration_seconds = 120

[anti_cheat]
order_validation = true
lag_switch_detection = true
lag_switch_threshold_ms = 3000
```

Environment variable mapping is unchanged: `IC_RELAY_BIND_ADDRESS`, `IC_MATCH_MAX_PLAYERS`, etc.

The `ic server validate-config` CLI validates `.toml` files. Hot reload via SIGHUP reads the updated `.toml`.

### Settings File

`settings.toml` replaces `settings.yaml` for Workshop sources, compression, and P2P configuration:

```toml
# settings.toml — engine-level client settings

[workshop]
sources = [
    { type = "remote", url = "https://workshop.ironcurtain.gg", name = "Official" },
    { type = "git-index", url = "https://github.com/iron-curtain/workshop-index", name = "Community" },
]

[compression]
level = "balanced"          # fastest | balanced | compact

[p2p]
enabled = true
max_upload_kbps = 512
max_download_kbps = 2048
```

### Data Directory Layout Update

The `<data_dir>` layout (D061) reflects the split:

```
<data_dir>/
├── config.toml                         # Engine + game settings (TOML — engine config)
├── settings.toml                       # Workshop sources, P2P, compression (TOML — engine config)
├── profile.db                          # Player identity, friends, blocks (SQLite)
├── achievements.db                     # Achievement collection (SQLite)
├── gameplay.db                         # Event log, replay catalog (SQLite)
├── telemetry.db                        # Telemetry events (SQLite)
├── training_index.db                   # ML training data catalog (SQLite) — optional
├── keys/
│   └── identity.key
├── communities/
│   ├── official-ic.db
│   └── clan-wolfpack.db
├── saves/
├── replays/
├── screenshots/
├── workshop/
├── mods/                               # Mod content (YAML files inside)
├── maps/                               # Map content (YAML files inside)
├── logs/
└── backups/
```

**The visual signal:** Top-level config files are `.toml` (infrastructure). Everything under `mods/` and `maps/` is `.yaml` (content). SQLite databases are `.db` (structured data). Three file types, three concerns, zero ambiguity.

### Migration

This is a design-phase decision — no code exists to migrate. All documentation examples are updated to reflect the correct format. If documentation examples in other design docs still show `config.yaml` or `server_config.yaml`, they should be treated as references to the corresponding `.toml` files per D067.

### `serde` Implementation

Both TOML and YAML use the same `serde` derive macros in Rust:

```rust
use serde::{Serialize, Deserialize};

// Engine configuration — deserialized from TOML
#[derive(Serialize, Deserialize)]
pub struct EngineConfig {
    pub render: RenderConfig,
    pub audio: AudioConfig,
    pub gameplay: GameplayConfig,
    pub net: NetConfig,
    pub debug: DebugConfig,
}

// Game content — deserialized from YAML
#[derive(Serialize, Deserialize)]
pub struct UnitDefinition {
    pub inherits: Option<String>,
    pub display: DisplayConfig,
    pub buildable: BuildableConfig,
    pub health: HealthConfig,
    pub mobile: Option<MobileConfig>,
    pub combat: Option<CombatConfig>,
}
```

The struct definitions don't change — only the parser crate (`toml` vs `serde_yaml`) and the file extension. A config struct works with both formats during a transition period if needed.

### Alternatives Considered

1. **Keep everything YAML** — Rejected. Loses the instant-recognition benefit. "Is this engine config or game content?" remains unanswerable from the file extension alone.

2. **JSON for configuration** — Rejected. No comments. JSON is hostile to hand-editing — and configuration files MUST be hand-editable by server operators and tournament organizers who aren't developers.

3. **TOML for everything** — Rejected. TOML is painful for deeply nested game data. `[[units.rifle_infantry.combat.weapons]]` is objectively worse than YAML's indented hierarchies for content authoring. TOML was designed for configuration, not data description.

4. **INI for configuration** — Rejected. No nested sections, no typed values, no standard spec, no `serde` support. INI is legacy — it's what original RA used, not what a modern engine should use.

5. **Separate directories instead of separate formats** — Insufficient. A `config/` directory full of `.yaml` files still doesn't tell you at the file level what you're looking at. The format IS the signal.

### Integration with Existing Decisions

- **D003 (Real YAML):** Unchanged for content. YAML remains the content format with `serde_yaml`. D067 narrows D003's scope: YAML is for content, not for everything.
- **D034 (SQLite):** Unaffected. SQLite databases are a third category (structured relational data). The three-format taxonomy is: TOML (config), YAML (content), SQLite (state).
- **D058 (Command Console / Cvars):** Cvars persist to `config.toml` instead of `config.yaml`. The cvar system, key naming, and load order are unchanged.
- **D061 (Data Backup):** `config.toml` replaces `config.yaml` in the data directory layout and backup categories.
- **D063 (Compression):** Compression levels configured in `settings.toml`. `AdvancedCompressionConfig` lives in `server_config.toml` for server operators.
- **D064 (Server Configuration):** `server_config.toml` replaces `server_config.yaml`. All ~200 cvars, deployment profiles, validation CLI, hot reload, and env var mapping work identically — only the file format changes.

### Phase

- **Phase 0:** Convention established. All new configuration files created as `.toml`. `deny.toml` and `Cargo.toml` already comply. Design doc examples use the correct format per D067.
- **Phase 2:** `config.toml` and `settings.toml` are the live client configuration files. Cvar persistence writes to TOML.
- **Phase 5:** `server_config.toml` and server deployment profiles are the live server configuration files. `ic server validate-config` validates TOML.
- **Ongoing:** If a file is created and the author is unsure, apply the boundary test: "Does this affect the simulation or define game content?" → YAML. "Does this configure how software operates?" → TOML.
