# 08 — Development Roadmap (36 Months)

## Phase Dependencies

```
Phase 0 (Foundation)
  └→ Phase 1 (Rendering + Bevy visual pipeline)
       └→ Phase 2 (Simulation) ← CRITICAL MILESTONE
            ├→ Phase 3 (Game Chrome)
            │    └→ Phase 4 (AI & Single Player)
            │         └→ Phase 5 (Multiplayer)
            │              └→ Phase 6a (Core Modding + Scenario Editor + Full Workshop)
            │                   └→ Phase 6b (Campaign Editor + Game Modes)
            │                        └→ Phase 7 (LLM Missions + Ecosystem + Polish)
            └→ [Test infrastructure, CI, headless sim tests]
```

## Phase 0: Foundation & Format Literacy (Months 1–3)

**Goal:** Read everything OpenRA reads, produce nothing visible yet.

### Deliverables
- `ra-formats` crate: parse `.mix` archives, SHP/TMP sprites, `.aud` audio, `.pal` palettes, `.vqa` video
- Parse OpenRA YAML manifests, map format, rule definitions
- `miniyaml2yaml` converter tool
- **Runtime MiniYAML loading (D025):** MiniYAML files load directly at runtime — auto-converts in memory, no pre-conversion required
- **OpenRA vocabulary alias registry (D023):** Accept OpenRA trait names (`Armament`, `Valued`, etc.) as YAML key aliases alongside IC-native names
- **OpenRA mod manifest parser (D026):** Parse OpenRA `mod.yaml` manifests, map directory layout to IC equivalents
- CLI tool to dump/inspect/validate RA assets
- Extensive tests against known-good OpenRA data

### Key Architecture Work
- Define `PlayerOrder` enum in `ic-protocol` crate
- Define `OrderCodec` trait (for future cross-engine compatibility)
- Define `CoordTransform` (coordinate system translation)
- Study OpenRA architecture: Game loop, World/Actor/Trait hierarchy, OrderManager, mod manifest system

### Community Foundation (D037)
- Code of conduct and contribution guidelines published
- RFC process documented for major design decisions
- License decision finalized (P006)

### Legal & CI Infrastructure
- SPDX license headers on all source files (`// SPDX-License-Identifier: GPL-3.0-or-later`)
- `deny.toml` + `cargo deny check licenses` in CI pipeline
- DCO signed-off-by enforcement in CI

### Player Data Foundation (D061)
- Define and document the `<data_dir>` directory layout (stable structure for saves, replays, screenshots, profiles, keys, communities, workshop, backups)
- Platform-specific `<data_dir>` resolution (Windows: `%APPDATA%\IronCurtain`, macOS: `~/Library/Application Support/IronCurtain`, Linux: `$XDG_DATA_HOME/iron-curtain/`)
- `IC_DATA_DIR` environment variable and `--data-dir` CLI flag override support

### Release
Open source `ra-formats` early. Useful standalone, builds credibility and community interest.

### Exit Criteria
- Can parse any OpenRA mod's YAML rules into typed Rust structs
- Can parse any OpenRA mod's MiniYAML rules into typed Rust structs (runtime conversion, D025)
- Can load an OpenRA mod directory via `mod.yaml` manifest (D026)
- OpenRA trait name aliases resolve correctly to IC components (D023)
- Can extract and display sprites from .mix archives
- Can convert MiniYAML to standard YAML losslessly
- Code of conduct and RFC process published (D037)
- SPDX headers present on all source files; `cargo deny check licenses` passes

## Phase 1: Rendering Slice (Months 3–6)

**Goal:** Render a Red Alert map faithfully with units standing on it. No gameplay. Classic isometric aesthetic.

### Deliverables
- Bevy-based isometric tile renderer with palette-aware shading
- Sprite animation system (idle, move, attack frames)
- Shroud/fog-of-war rendering
- Camera: smooth scroll, zoom, minimap
- Load OpenRA map, render correctly
- Render quality tier auto-detection (see `10-PERFORMANCE.md` § "Render Quality Tiers")
- Optional visual showcase: basic post-processing (bloom, color grading) and shader prototypes (chrono-shift shimmer, tesla coil glow) to demonstrate modding possibilities

### Key Architecture Work
- Bevy plugin structure: `ic-render` as a Bevy plugin reading from sim state
- Interpolation between sim ticks for smooth animation at arbitrary FPS
- HD asset pipeline: support high-res sprites alongside classic 8-bit assets

### Release
"Red Alert map rendered faithfully in Rust at 4K 144fps" — visual showcase generates buzz.

### Exit Criteria
- Can load and render any OpenRA Red Alert map
- Sprites animate correctly (idle loops)
- Camera controls feel responsive
- Maintains 144fps at 4K on mid-range hardware

## Phase 2: Simulation Core (Months 6–12) — CRITICAL

**Goal:** Units move, shoot, die. The engine exists.

> **Gap acknowledgment:** The ECS component model currently documents ~9 core components (Health, Mobile, Attackable, Armament, Building, Buildable, Harvester, Selectable, LlmMeta). The gap analysis in `11-OPENRA-FEATURES.md` identifies **~30+ additional gameplay systems** that are prerequisites for a playable Red Alert: power, building placement, transport, capture, stealth/cloak, infantry sub-cells, crates, mines, crush, guard/patrol, deploy/transform, garrison, production queue, veterancy, docking, radar, GPS, chronoshift, iron curtain, paratroopers, naval, bridge, tunnels, and more. These systems need design and implementation during Phase 2. The gap count is a feature of honest planning, not a sign of incompleteness — the `11-OPENRA-FEATURES.md` priority assessment (P0/P1/P2/P3) provides the triage order.

### Deliverables
- ECS-based simulation layer (`ic-sim`)
- Components mirroring OpenRA traits: Mobile, Health, Attackable, Armament, Building, Buildable, Harvester
- **Canonical enum names matching OpenRA (D027):** Locomotor (`Foot`, `Wheeled`, `Tracked`, `Float`, `Fly`), Armor (`None`, `Light`, `Medium`, `Heavy`, `Wood`, `Concrete`), Target types, Damage states, Stances
- **Condition system (D028):** `Conditions` component, `GrantConditionOn*` YAML traits, `requires:`/`disabled_by:` on any component field
- **Multiplier system (D028):** `StatModifiers` per-entity modifier stack, fixed-point multiplication, applicable to speed/damage/range/reload/cost/sight
- **Full damage pipeline (D028):** Armament → Projectile entity → travel → Warhead(s) → Versus table → DamageMultiplier → Health
- **Cross-game component library (D029):** Mind control, carrier/spawner, teleport networks, shield system, upgrade system, delayed weapons (7 first-party systems)
- Fixed-point coordinate system (no floats in sim)
- Deterministic RNG
- Pathfinding: `Pathfinder` trait + `IcFlowfieldPathfinder` (D013), `RemastersPathfinder` and `OpenRaPathfinder` ported from GPL sources (D045)
- Order system: Player inputs → Orders → deterministic sim application
- `LocalNetwork` and `ReplayPlayback` NetworkModel implementations
- Sim snapshot/restore for save games and future rollback

### Key Architecture Work
- **Sim/network boundary enforced:** `ic-sim` has zero imports from `ic-net`
- **`NetworkModel` trait defined and proven** with at least `LocalNetwork` implementation
- **System execution order documented and fixed**
- **State hashing for desync detection**
- **Engine telemetry foundation (D031):** Unified `telemetry_events` SQLite schema shared by all components; `tracing` span instrumentation on sim systems; per-system tick timing; gameplay event stream (`GameplayEvent` enum) behind `telemetry` feature flag; `/analytics status/inspect/export/clear` console commands; zero-cost engine instrumentation when disabled
- **Client-side SQLite storage (D034):** Replay catalog, save game index, gameplay event log, asset index — embedded SQLite for local metadata; queryable without OTEL stack
- **`ic backup` CLI (D061):** `ic backup create/restore/list/verify` — ZIP archive with SQLite `VACUUM INTO` for consistent database copies; `--exclude`/`--only` category filtering; ships alongside save/load system
- **Automatic daily critical snapshots (D061):** Rotating 3-day `auto-critical-N.zip` files (~5 MB) containing keys, profile, community credentials, achievements, config — created silently on first launch of the day; protects all players regardless of cloud sync status
- **Screenshot capture with metadata (D061):** PNG screenshots with IC-specific `tEXt` chunks (engine version, map, players, tick, replay link); timestamped filenames in `<data_dir>/screenshots/`
- **Mnemonic seed recovery (D061):** BIP-39-inspired 24-word recovery phrase generated alongside Ed25519 identity key; `ic identity seed show` / `ic identity seed verify` / `ic identity recover` CLI commands; deterministic key derivation via PBKDF2-HMAC-SHA512 — zero infrastructure, zero cost, identity recoverable from a piece of paper
- **Virtual asset namespace (D062):** `VirtualNamespace` struct — resolved lookup table mapping logical asset paths to content-addressed blobs (D049 CAS); built at load time from the active mod set; SHA-256 fingerprint computed and recorded in replays; implicit default profile (no user-facing profile concept yet)
- **Centralized compression module (D063):** `CompressionAlgorithm` enum (LZ4) and `CompressionLevel` enum (fastest/balanced/compact); `AdvancedCompressionConfig` struct (21 raw parameters for server operators); all LZ4 callsites refactored through centralized module; `compression_algorithm: u8` byte added to save and replay headers; `settings.toml` `compression.*` and `compression.advanced.*` sections; decompression ratio caps and security size limits configurable per deployment
- **Server configuration schema (D064):** `server_config.toml` schema definition with typed parameters, valid ranges, and compiled defaults; TOML deserialization with validation and range clamping; relay server reads config at startup; initial parameter namespaces: `relay.*`, `protocol.*`, `db.*`

### Release
Units moving, shooting, dying — headless sim + rendered. Record replay file. Play it back.

### Exit Criteria

**Hard exit criteria (must ship):**
- Can run 1000-unit battle headless at > 60 ticks/second
- Replay file records and plays back correctly (bit-identical)
- State hash matches between two independent runs with same inputs
- Condition system operational: YAML `requires:`/`disabled_by:` fields affect component behavior at runtime
- Multiplier system operational: veterancy/terrain/crate modifiers stack and resolve correctly via fixed-point math
- Full damage pipeline: projectile entities travel, warheads apply composable effects, Versus table resolves armor-weapon interactions
- OpenRA canonical enum names used for locomotors, armor types, target types, stances (D027)
- Compression module centralizes all LZ4 calls; save/replay headers encode `compression_algorithm` byte; `settings.toml` `compression.*` and `compression.advanced.*` levels take effect; `AdvancedCompressionConfig` validation and range clamping operational (D063)
- Server configuration schema loads `server_config.toml` with validation, range clamping, and unknown-key detection; relay parameters (`relay.*`, `protocol.*`, `db.*`) configurable at startup (D064)

**Stretch goals (target Phase 2, can slip to early Phase 3 without blocking):**
- All 7 cross-game components functional: mind control, carriers, teleport networks, shields, upgrades, delayed weapons, dual asset rendering (D029)

> **Note:** The D028 systems (conditions, multipliers, damage pipeline) are non-negotiable — they're the foundation everything else builds on. The D029 cross-game components are high priority but independently scoped; any that slip are early Phase 3 work, not blockers.

## Phase 3: Game Chrome (Months 12–16)

**Goal:** It feels like Red Alert.

### Deliverables
- Sidebar UI: build queues, power bar, credits display, radar minimap
- Radar panel as multi-mode display: minimap (default), comm video feed (RA2-style), tactical overlay
- Unit selection: box select, ctrl-groups, tab cycling
- Build placement with validity checking
- Audio: EVA voice lines, unit responses, ambient, music (`.aud` playback)
  - **Audio system design (P003):** Resolve audio library choice; design `.aud` IMA ADPCM decoding pipeline; dynamic music state machine (combat/build/idle transitions — original RA had this); music-as-Workshop-resource architecture; investigate loading remastered soundtrack if player owns Remastered Collection
- Custom UI layer on `wgpu` for game HUD
- `egui` for dev tools/debug overlays
- **UI theme system (D032):** YAML-driven switchable themes (Classic, Remastered, Modern); chrome sprite sheets, color palettes, font configuration; shellmap live menu backgrounds; first-launch theme picker
- **Per-game-module default theme:** RA1 module defaults to Classic theme

### Exit Criteria
- Single-player skirmish against scripted dummy AI (first "playable" milestone)
- Feels like Red Alert to someone who's played it before

**Stretch goals (target Phase 3, can slip to early Phase 4 without blocking):**
- **Screenshot browser (D061):** In-game screenshot gallery with metadata filtering (map, mode, date), thumbnail grid, and "Watch replay" linking via `IC:ReplayFile` metadata
- **Data & Backup settings panel (D061):** In-game Settings → Data & Backup with Data Health summary (identity/sync/backup status), backup create/restore buttons, backup file list, cloud sync status, and Export & Portability section
- **First-launch identity + backup prompt (D061):** New player flow after D032 theme selection — identity creation with recovery phrase display, cloud sync offer (Steam/GOG), backup recommendation for non-cloud installs; returning player flow includes mnemonic recovery option alongside backup restore
- **Post-milestone backup nudges (D061):** Main menu toasts after first ranked match, campaign completion, tier promotion; same toast system as D030 Workshop cleanup; max one nudge per session; three dismissals = never again
- **Chart component in `ic-ui`:** Lightweight Bevy 2D chart renderer (line, bar, pie, heatmap, stacked area) for post-game and career screens
- **Post-game stats screen (D034):** Unit production timeline, resource curves, combat heatmap, APM graph, head-to-head comparison — all from SQLite `gameplay_events`
- **Career stats page (D034):** Win rate by faction/map/opponent, rating history graph, session history with replay links — from SQLite `matches` + `match_players`
- **Achievement infrastructure (D036):** SQLite achievement tables, engine-defined campaign/exploration achievements, Lua trigger API for mod-defined achievements, Steam achievement sync for Steam builds
- **Product analytics local recording (D031):** Comprehensive client event taxonomy — GUI interactions (screen navigation, clicks, hotkeys, sidebar, minimap, build placement), RTS input patterns (selection, control groups, orders, camera), match flow (pace snapshots every 60s with APM/resources/army value, first build, first combat, surrender point), session lifecycle, settings changes, onboarding steps, errors, performance sampling; all offline in local `telemetry.db`; `/analytics export` for voluntary bug report attachment; detailed enough for UX analysis, gameplay pattern discovery, and troubleshooting
- **Contextual hint system (D065):** YAML-driven gameplay hints displayed at point of need (idle harvesters, negative power, unused control groups); HintTrigger/HintFilter/HintRenderer pipeline; `hint_history` SQLite table; per-category toggles and frequency settings in D033 QoL panel; `/hints` console commands (D058)
- **New player pipeline (D065):** Self-identification gate after D061/D032 first-launch flow ("New to RTS" / "Played some RTS" / "RA veteran" / "Skip"); quick orientation slideshow for veterans; Commander School badge on campaign menu for deferred starts; emits `onboarding.step` telemetry (D031)
- **Progressive feature discovery (D065):** Milestone-based main menu notifications surfacing replays, experience profiles, Workshop, training mode, console, mod profiles over the player's first weeks; maximum one notification per session; `/discovery` console commands (D058)

> **Note:** Phase 3's hard goal is "feels like Red Alert" — sidebar, audio, selection, build placement. The stats screens, chart component, achievement infrastructure, analytics recording, and tutorial hint system are high-value polish but depend on accumulated gameplay data, so they can mature alongside Phase 4 without blocking the "playable" milestone.

## Phase 4: AI & Single Player (Months 16–20)

**Goal:** Complete campaign support and skirmish AI. Unlike OpenRA, single-player is a first-class deliverable, not an afterthought.

### Deliverables
- Lua-based scripting for mission scripts
- WASM mod runtime (basic)
- Basic skirmish AI: harvest, build, attack patterns
- Campaign mission loading (OpenRA mission format)
- **Branching campaign graph engine (D021):** campaigns as directed graphs of missions with named outcomes, multiple paths, and convergence points
- **Persistent campaign state:** unit roster carryover, veterancy across missions, equipment persistence, story flags — serializable for save games
- **Lua Campaign API:** `Campaign.complete()`, `Campaign.get_roster()`, `Campaign.get_flag()`, `Campaign.set_flag()`, etc.
- **Continuous campaign flow:** briefing → mission → debrief → next mission (no exit-to-menu between levels)
- **Campaign select and mission map UI:** visualize campaign graph, show current position, replay completed missions
- **Adaptive difficulty via campaign state:** designer-authored conditional bonuses/penalties based on cumulative performance
- **Campaign dashboard (D034):** Roster composition graphs per mission, veterancy progression for named units, campaign path visualization, performance trends — from SQLite `campaign_missions` + `roster_snapshots`
- **`ic-ai` reads player history (D034):** Skirmish AI queries SQLite `matches` + `gameplay_events` for difficulty scaling, build order variety, and counter-strategy selection between games
- **Player style profile building (D042):** `ic-ai` aggregates `gameplay_events` into `PlayerStyleProfile` per player; `StyleDrivenAi` (AiStrategy impl) mimics a specific player's tendencies in skirmish; "Challenge My Weakness" training mode targets the local player's weakest matchups; `player_profiles` + `training_sessions` SQLite tables; progress tracking across training sessions
- **FMV cutscene playback** between missions (original `.vqa` briefings and victory/defeat sequences)
- **Full Allied and Soviet campaigns** for Red Alert, playable start to finish
- **Commander School tutorial campaign (D065):** 6 branching Lua-scripted tutorial missions (combat → building → economy → shortcuts → capstone skirmish → multiplayer intro) using D021 campaign graph; failure branches to remedial missions; `Tutorial` Lua global API (ShowHint, WaitForAction, FocusArea, HighlightUI); tutorial AI difficulty tier below D043 Easy; experience-profile-aware content adaptation (D033); skippable at every point; unit counters, defense, tech tree, and advanced tactics left for player discovery through play
- **Skill assessment & difficulty recommendation (D065):** 2-minute interactive exercise measuring selection speed, camera use, and combat efficiency; calibrates adaptive pacing engine and recommends initial AI difficulty for skirmish lobby; `PlayerSkillEstimate` in SQLite `player.db`
- **Post-game learning system (D065):** Rule-based tips on post-game stats screen (YAML-driven pattern matching on `gameplay_events`); 1–3 tips per game (positive + improvement); "Learn more" links to tutorial missions; adaptive pacing adjusts tip frequency based on player engagement
- **Campaign pedagogical pacing (D065):** Allied/Soviet mission design guidelines for gradual mechanic introduction; tutorial EVA voice lines for first encounters (first refinery, first barracks, first tech center); conditional on tutorial completion status
- **Tutorial achievements (D065/D036):** "Graduate" (complete Commander School), "Honors Graduate" (complete with zero retries)

### Key Architecture Work
- Lua sandbox with engine bindings
- WASM host API with capability system (see `06-SECURITY.md`)
- Campaign graph loader + validator: parse YAML campaign definitions, validate graph connectivity (no orphan nodes, all outcome targets exist)
- `CampaignState` serialization: roster, flags, equipment, path taken — full snapshot support
- Unit carryover system: 5 modes (`none`, `surviving`, `extracted`, `selected`, `custom`)
- Veterancy persistence across missions
- Mission select UI with campaign graph visualization and difficulty indicators
- **`ic` CLI prototype:** `ic mod init`, `ic mod check`, `ic mod run` — early tooling for Lua script development (full SDK in Phase 6a)
- **`ic profile` CLI (D062):** `ic profile save/list/activate/inspect/diff` — named mod compositions with switchable experience settings; modpack curators can save and compare configurations; profile fingerprint enables replay verification
- **Minimal Workshop (D030 early delivery):** Central IC Workshop server + `ic mod publish` + `ic mod install` + basic in-game browser + auto-download on lobby join. Simple HTTP REST API, SQLite-backed. No federation, no replication, no promotion channels yet — those are Phase 6a
- **Standalone installer (D069 Layer 1):** Platform-native installers for non-store distribution — NSIS `.exe` for Windows, `.dmg` for macOS, `.AppImage` for Linux. Handles binary placement, shortcuts, file associations (`.icrep`, `.icsave`, `ironcurtain://` URI scheme), and uninstaller registration. Portable mode checkbox creates `portable.marker`. Installer launches IC on completion → enters D069 First-Run Setup Wizard. CI pipeline builds installers automatically per release.

### Exit Criteria
- Can play through **all** Allied and Soviet campaign missions start to finish
- Campaign branches work: different mission outcomes lead to different next missions
- Unit roster persists across missions (surviving units, veterancy, equipment)
- Save/load works mid-campaign with full state preservation
- Skirmish AI provides a basic challenge

## Phase 5: Multiplayer (Months 20–26)

**Goal:** Deterministic lockstep multiplayer with competitive infrastructure. Not just "multiplayer works" — multiplayer that's worth switching from OpenRA for.

### Deliverables
- `EmbeddedRelayNetwork` implementation (listen server — host embeds `RelayCore`)
- `RelayLockstepNetwork` implementation (dedicated relay with time authority)
- Desync detection and server-side debugging tools (killer feature)
- Lobby system, game browser, NAT traversal via relay
- Replay system (already enabled by Phase 2 architecture)
- `CommunityBridge` for shared server browser with OpenRA and CnCNet
- **Foreign replay import (D056):** `OpenRAReplayDecoder` and `RemasteredReplayDecoder` in `ra-formats`; `ForeignReplayPlayback` NetworkModel; `ic replay import` CLI converter; divergence tracking UI; automated behavioral regression testing against foreign replay corpus
- **Ranked matchmaking (D055):** Glicko-2 rating system (D041), 10 placement matches, YAML-configurable tier system (Cold War military ranks for RA: Conscript → Supreme Commander, 7+2 tiers × 3 divisions = 23 positions), 3-month seasons with soft reset, dual display (tier badge + rating number), faction-specific optional ratings, small-population matchmaking degradation, map veto system
- **Leaderboards:** global, per-faction, per-map — with public profiles and replay links
- **Observer/spectator mode:** connect to relay with configurable fog (full/player/none) and broadcast delay
- **Tournament mode:** bracket API, relay-certified `CertifiedMatchResult`, server-side replay archive
- **Competitive map pool:** curated per-season, community-nominated
- **Anti-cheat:** relay-side behavioral analysis (APM, reaction time, pattern entropy), suspicion scoring, community reports
- **"Train Against" opponent mode (D042):** With multiplayer match data, players can select any opponent from match history → pick a map → instantly play against `StyleDrivenAi` loaded with that opponent's aggregated behavioral profile; no scenario editor required
- **Competitive governance (D037):** Competitive committee formation, seasonal map pool curation process, community representative elections
- **Competitive achievements (D036):** Ranked placement, league promotion, season finish, tournament participation achievements

### Legal & Operational Prerequisites
- **Legal entity formed** (foundation, nonprofit, or LLC) before server infrastructure goes live — limits personal liability for user data, DMCA obligations, and server operations
- **DMCA designated agent registered** with the U.S. Copyright Office (required for safe harbor under 17 U.S.C. § 512 before Workshop accepts user uploads)
- **Optional:** Trademark registration for "Iron Curtain" (USPTO Class 9/41)

### Key Architecture Work
- Sub-tick timestamped orders (CS2 insight)
- Relay server anti-lag-switch mechanism
- Signed replay chain
- Order validation in sim (anti-cheat)
- Matchmaking service (lightweight Rust binary, same infra as tracking/relay servers)
- `CertifiedMatchResult` with Ed25519 relay signatures
- Spectator feed: relay forwards tick orders to observers with configurable delay
- Behavioral analysis pipeline on relay server
- **Server-side SQLite telemetry (D031):** Relay, tracking, and workshop servers record structured events to local `telemetry.db` using unified schema; server event taxonomy (game lifecycle, player join/leave, per-tick processing, desync detection, lag switch detection, behavioral analysis, listing lifecycle, dependency resolution); `/analytics` commands on servers; same export/inspect workflow as client; no OTEL infrastructure required for basic server observability
- **Relay compression config (D063):** Advanced compression parameters (`compression.advanced.*`) active on relay servers via env vars and CLI flags; relay compression config fingerprinting in lobby handshake; reconnection-specific parameters (`reconnect_pre_compress`, `reconnect_max_snapshot_bytes`, `reconnect_stall_budget_ms`) operational; deployment profile presets (tournament archival, caster/observer, large mod server, low-power hardware)
- **Full server configuration (D064):** All ~200 `server_config.toml` parameters active across all subsystems (relay, match lifecycle, pause, penalties, spectator, vote framework, protocol limits, communication, anti-cheat, ranking, matchmaking, AI tuning, telemetry, database, Workshop/P2P, compression); environment variable override mapping (`IC_RELAY_*`, `IC_MATCH_*`, etc.); hot reload via SIGHUP and `/reload_config`; four deployment profile templates (tournament LAN, casual community, competitive league, training/practice) ship with relay binary; cross-parameter consistency validation
- **Optional OTEL export layer (D031):** Server operators can additionally enable OTEL export for real-time Grafana/Prometheus/Jaeger dashboards; `/healthz`, `/readyz`, `/metrics` endpoints; distributed trace IDs for cross-component desync debugging; pre-built Grafana dashboards; `docker-compose.observability.yaml` overlay for self-hosters
- **Backend SQLite storage (D034):** Relay server persists match results, desync reports, behavioral profiles; matchmaking server persists player ratings, match history, seasonal data — all in embedded SQLite, no external database
- **`ic profile export` (D061):** JSON profile export with embedded SCRs for GDPR data portability; self-verifying credentials import on any IC install
- **Platform cloud sync (D061):** Optional sync of critical data (identity key, profile, community credentials, config, latest autosave) via `PlatformCloudSync` trait (Steam Cloud, GOG Galaxy); ~5–20 MB footprint; sync on launch/exit/match-complete
- **First-launch restore flow (D061):** Returning player detection — cloud data auto-detection with restore offer (shows identity, rating, match count); manual restore from backup ZIP, data folder copy, or mnemonic seed recovery; SCR verification progress display during restore
- **Backup & data console commands (D061/D058):** `/backup create`, `/backup restore`, `/backup list`, `/backup verify`, `/profile export`, `/identity seed show`, `/identity seed verify`, `/identity recover`, `/data health`, `/data folder`, `/cloud sync`, `/cloud status`
- **Lobby fingerprint verification (D062):** Profile namespace fingerprint replaces per-mod version list comparison in lobby join; namespace diff view shows exact asset-level differences on mismatch; one-click resolution (download missing mods, update mismatched versions); `/profile` console commands
- **Multiplayer onboarding (D065):** First-time-in-multiplayer overlay sequence (server browser orientation, casual vs. ranked, communication basics); ranked onboarding (placement matches, tier system, faction ratings); spectator suggestion for players on losing streaks (<5 MP games, 3 consecutive losses); all one-time flows with "Skip" always available; emits `onboarding.step` telemetry

### Exit Criteria
- Two players can play a full game over the internet
- Desync, if it occurs, is automatically diagnosed to specific tick and entity
- Games appear in shared server browser alongside OpenRA and CnCNet games
- Ranked 1v1 queue functional with ratings, placement, and leaderboard
- Spectator can watch a live game with broadcast delay

## Phase 6a: Core Modding & Scenario Editor (Months 26–30)

**Goal:** Ship the modding SDK, core scenario editor, and full Workshop — the three pillars that enable community content creation.

> **Phased Workshop delivery (D030):** A minimal Workshop (central server + `ic mod publish` + `ic mod install` + in-game browser + auto-download on lobby join) should ship during Phase 4–5 alongside the `ic` CLI. Phase 6a adds the full Artifactory-level features: federation, community servers, replication, promotion channels, CI/CD token scoping, creator reputation, DMCA process. This avoids holding Workshop infrastructure hostage until month 26.

### Deliverables — Modding SDK
- Full OpenRA YAML rule compatibility (existing mods load)
- WASM mod scripting with full capability system
- Asset hot-reloading for mod development
- Mod manager + workshop-style distribution
- Tera templating for YAML generation (nice-to-have)
- **`ic` CLI tool (full release):** `ic mod init/check/test/run/server/package/publish/watch/lint` plus Git-first helpers (`ic git setup`, `ic content diff`) — complete mod development workflow (D020)
- **Mod templates:** `data-mod`, `scripted-mod`, `total-conversion`, `map-pack`, `asset-pack` via `ic mod init`
- **`mod.yaml` manifest** with typed schema, semver engine version pinning, dependency declarations
- **VS Code extension** for mod development: YAML schema validation, Lua LSP, `ic` integration

### Deliverables — Scenario Editor (D038 Core)
- **SDK scenario editor (D038):** OFP/Eden-inspired visual editor for maps AND mission logic — ships as part of the IC SDK (separate application from the game — D040). Terrain painting, unit placement, triggers (area-based with countdown/timeout timers and min/mid/max randomization), waypoints, pre-built modules (wave spawner, patrol route, guard position, reinforcements, objectives, weather change, time of day, day/night cycle, season, etc.), visual connection lines between triggers/modules/waypoints, Probability of Presence per entity for replayability, compositions (reusable prefabs), layers with lock/visibility, Simple/Advanced mode toggle, **Preview/Test/Validate/Publish** toolbar flow, autosave with crash recovery, undo/redo, direct Workshop publishing
- **Resource stacks (D038):** Ordered media candidates with per-entry conditions and fallback chains — every media property (video, audio, music, portrait) supports stacking. External streaming URIs (YouTube, Spotify, Google Drive) as optional stack entries with mandatory local fallbacks. Workshop publish validation enforces fallback presence.
- **Environment panel (D038):** Consolidated time/weather/atmosphere setup — clock dial for time of day, day/night cycle toggle with speed slider, weather dropdown with D022 state machine editor, temperature, wind, ambient light, fog style. Live preview in editor viewport.
- **Achievement Trigger module (D036/D038):** Connects achievements to the visual trigger system — no Lua required for standard achievement unlock logic
- **Editor vocabulary schema:** Auto-generated machine-readable description of all modules, triggers, compositions, templates, and properties — powers documentation, mod tooling, and the Phase 7 Editor AI Assistant
- **Git-first collaboration support (D038):** Stable content IDs + canonical serialization for editor-authored files, read-only Git status strip (branch/dirty/conflicts), `ic git setup` repo-local helpers, `ic content diff` semantic diff viewer/CLI. **No commit/branch/push/pull UI in the SDK** (Git remains the source of truth).
- **Validate & Playtest workflow (D038):** Quick Validate and Publish Validate presets, async/cancelable validation runs, status badges (`Valid/Warnings/Errors/Stale/Running`), and a single Publish Readiness screen aggregating validation/export/license/metadata warnings
- **Profile Playtest v1 (D038):** Advanced-mode only performance profiling from `Test` dropdown with summary-first output (avg/max tick time, top hotspots, low-end target budget comparison)
- **Migration Workbench v1 (D038 + D020):** "Upgrade Project" flow in SDK (read-only migration preview/report wrapper over `ic mod migrate`)
- **Resource Manager panel (D038):** Unified resource browser with three tiers — Default (game module assets indexed from `.mix` archives, always available), Workshop (inline browsing/search/install from D030), Local (drag-and-drop / file import into project `assets/`); drag-to-editor workflow for all resource types; cross-tier search; duplicate detection; inline preview (sprites, audio playback, palette swatches, video thumbnails); format conversion on import via `ra-formats`
- Controller input mapping for core editing workflows (Steam Deck compatible)
- Accessibility: colorblind palette, UI scaling, full keyboard navigation

### Deliverables — Full Workshop (D030)
- **Workshop resource registry (D030):** Federated multi-source workshop server with crates.io-style dependency resolution; backed by embedded SQLite with FTS5 search (D034)
- **Dependency management CLI:** `ic mod resolve/install/update/tree/lock/audit` — full dependency lifecycle
- **License enforcement:** Every published resource requires SPDX license; `ic mod audit` checks dependency tree compatibility
- **Individual resource publishing:** Music, sprites, textures, voice lines, cutscenes, palettes, UI themes — all publishable as independent versioned resources
- **Lockfile system:** `ic.lock` for reproducible dependency resolution across machines
- **Steam Workshop integration (D030):** Optional distribution channel — subscribe via Steam, auto-sync, IC Workshop remains primary; no Steam lock-in
- **In-game Workshop browser (D030):** Search, filter by category/game-module/rating, preview screenshots, one-click subscribe, dependency auto-resolution
- **Auto-download on lobby join (D030):** CS:GO-style automatic mod/map download when joining a game that requires content the player doesn't have; progress UI with cancel option
- **Creator reputation system (D030):** Trust scores from download counts, ratings, curation endorsements; tiered badges (New/Trusted/Verified/Featured); influences search ranking
- **Content moderation & DMCA/takedown policy (D030):** Community reporting, automated scanning for known-bad content, 72-hour response window, due process with appeal path; Workshop moderator tooling
- **Creator tipping & sponsorship (D035):** Optional tip links in resource metadata (Ko-fi/Patreon/GitHub Sponsors); IC never processes payments; no mandatory paywalls on mods
- **Local CAS dedup (D049):** Content-addressed blob store for Workshop packages — files stored by SHA-256 hash, deduplicated across installed mods; `ic mod gc` garbage collection; upgrades from Phase 4–5 simple `.icpkg`-on-disk storage
- **`ic replay recompress` CLI (D063):** Offline replay recompression at different compression levels for archival/sharing; `ic mod build --compression-level` flag for Workshop package builds
- **Annotated replay format & replay coach mode (D065):** Workshop-publishable annotated replays (`.icrep` + YAML annotation track with narrator text, highlights, quizzes); replay coach mode applies post-game tip rules in real-time during any replay playback; "Learning" tab in replay browser for community tutorial replays; `Tutorial` Lua API available in user-created scenarios for community tutorial creation
- **`ic server validate-config` CLI (D064):** Validates a `server_config.toml` file for errors, range violations, cross-parameter inconsistencies, and unknown keys without starting a server; useful for CI/CD pipelines and pre-deployment checks
- **Mod profile publishing (D062):** `ic mod publish-profile` publishes a local mod profile as a Workshop modpack; `ic profile import` imports Workshop modpacks as local profiles; in-game mod manager gains profile dropdown for one-click switching; editor provenance tooltips and per-source hot-swap for sub-second rule iteration

### Deliverables — Cross-Engine Export (D066)
- **Export pipeline core (D066):** `ExportTarget` trait with built-in IC native and OpenRA backends; `ExportPlanner` produces fidelity reports listing downgraded/stripped features; export-safe authoring mode in scenario editor (feature gating, live fidelity indicators, export-safe trigger templates)
- **OpenRA export (D066):** IC scenario → `.oramap` (ZIP: map.yaml + map.bin + lua/); IC YAML rules → MiniYAML via bidirectional D025 converter; IC trait names → OpenRA trait names via bidirectional D023 alias table; IC Lua scripts validated against OpenRA's 16-global API surface; mod manifest generation via D026 reverse
- **`ic export` CLI (D066):** `ic export --target openra mission.yaml -o ./output/`; `--dry-run` for validation-only; `--verify` for exportability + target-facing checks; `--fidelity-report` for structured loss report; batch export for directories
- **Export-safe trigger templates (D066):** Pre-built trigger patterns in scenario editor guaranteed to downcompile cleanly to target engine trigger systems

### Exit Criteria
- Someone ports an existing OpenRA mod (Tiberian Dawn, Dune 2000) and it runs
- SDK scenario editor supports terrain painting, unit placement, triggers with timers, waypoints, modules, compositions, undo/redo, autosave, **Preview/Test/Validate/Publish**, and Workshop publishing
- Quick Validate runs asynchronously and surfaces actionable errors/warnings without blocking Preview/Test
- `ic git setup` and `ic content diff` work on an editor-authored scenario in a Git repo (no SDK commit UI)
- A mod can declare 3+ Workshop resource dependencies and `ic mod install` resolves, downloads, and caches them correctly
- `ic mod audit` correctly identifies license incompatibilities in a dependency tree
- An individual resource (e.g., a music track) can be published to and pulled from the Workshop independently
- In-game Workshop browser can search, filter, and install resources with dependency auto-resolution
- Joining a lobby with required mods triggers auto-download with progress UI
- Creator reputation badges display correctly on resource listings
- DMCA/takedown process handles a test case end-to-end within 72 hours
- SDK shows read-only Git status (branch/dirty/conflict) for a project repo without blocking editing workflows
- `ic content diff` produces an object-level diff for an `.icscn` file with stable IDs preserved across reordering/renames
- Visual diff displays structured YAML changes and syntax-highlighted Lua changes
- Resource Manager shows Default resources from installed game files, supports Workshop search/install inline, and accepts manual file drag-and-drop import
- A resource dragged from the Resource Manager onto the editor viewport creates the expected entity/assignment
- `ic export --target openra` produces a valid `.oramap` from an IC scenario that loads in the current OpenRA release
- Export fidelity report correctly identifies at least 5 IC-only features that cannot export to the target
- Export-safe authoring mode hides/grays out features incompatible with the selected target

## Phase 6b: Campaign Editor & Game Modes (Months 30–34)

**Goal:** Extend the scenario editor into a full campaign authoring platform, ship game mode templates, and multiplayer scenario tools. These all build on Phase 6a's editor and Workshop foundations.

### Deliverables — Campaign Editor (D038)
- **Visual campaign graph editor:** missions as nodes, outcomes as directed edges, weighted/conditional paths, mission pools
- **Persistent state dashboard:** roster flow visualization, story flag cross-references, campaign variable scoping
- **Intermission screen editor:** briefing, roster management, base screen, shop/armory, dialogue, world map, debrief+stats, credits, custom layout
- **Campaign mission transitions:** briefing-overlaid asset loading, themed loading screens, cinematic-as-loading-mask, progress indicator within briefing
- **Dialogue editor:** branching trees with conditions, effects, variable substitution, per-character portraits
- **Named characters:** persistent identity across missions, traits, inventory, must-survive flags
- **Campaign inventory:** persistent items with category, quantity, assignability to characters
- **Campaign testing tools:** graph validation, jump-to-mission, path coverage visualization, state inspector
- **Advanced validation & Publish Readiness refinements (D038):** preset picker (`Quick/Publish/Export/Multiplayer/Performance`), batch validation across scenarios/campaign nodes, validation history panel
- **Campaign assembly workflow (D038):** Quick Start templates (Linear, Two-Path Branch, Hub and Spoke, Roguelike Pool, Full Branch Tree), Scenario Library panel (workspace/original campaigns/Workshop with search/favorites), drag-to-add nodes, one-click connections with auto-outcome mapping, media drag targets on campaign nodes, campaign property sheets in sidebar, end-to-end "New → Publish" pipeline under 15 minutes for a basic campaign
- **Original Campaign Asset Library (D038):** Game Asset Index (auto-catalogs all original campaign assets by mission), Campaign Browser panel (browse original RA1/TD campaigns with maps/videos/music/EVA organized per-mission), one-click asset reuse (drag from Campaign Browser to campaign node), Campaign Import / "Recreate" mode (import entire original campaign as editable starting point with pre-filled graph, asset references, and sequencing)
- **Achievement Editor (D036/D038):** Visual achievement definition and management — campaign-scoped achievements, incremental progress tracking, achievement coverage view, playthrough tracker. Integrates with Achievement Trigger modules from Phase 6a.
- **Git-first collaboration refinements (D038):** `ic content merge` semantic merge helper, optional conflict resolver panels (including campaign graph conflict view), and richer visual diff overlays (terrain cell overlays, side-by-side image comparison)
- **Migration Workbench apply mode (D038 + D020):** Apply migrations from SDK with rollback snapshots and post-migration Validate/export-compatibility prompts
- **Localization & Subtitle Workbench (D038):** Advanced-only string table editor, subtitle timeline editor, pseudolocalization preview, translation coverage report

### Deliverables — Game Mode Templates & Multiplayer Scenario Tools (D038)
- **8 core game mode templates:** Skirmish, Survival/Horde, King of the Hill, Regicide, Free for All, Co-op Survival, Sandbox, Base Defense
- **Multiplayer scenario tools:** player slot configuration, per-player objectives/triggers/briefings, co-op mission modes (allied factions, shared command, split objectives, asymmetric), multi-slot preview with AI standin, slot switching, lobby preview
- **Co-op campaign properties:** shared roster draft/split/claim, drop-in/drop-out, solo fallback configuration
- **Game Master mode (D038):** Zeus-inspired real-time scenario manipulation during live gameplay — one player controls enemy faction strategy, places reinforcements, triggers events, adjusts difficulty; uses editor UI on a live sim; budget system prevents flooding
- **Achievement packs (D036):** Mod-defined achievements via YAML + Lua triggers, publishable as Workshop resources; achievement browser in game UI

### Deliverables — RA1 Export & Editor Extensibility (D066)
- **RA1 export target (D066):** IC scenario → `rules.ini` + `.mpr` mission files + `.shp`/`.pal`/`.aud`/`.vqa`/`.mix`; balance values remapped to RA integer scales; Lua trigger downcompilation via pattern library (recognized patterns → RA1 trigger/teamtype/action equivalents; unmatched patterns → fidelity warnings)
- **Campaign export (D066):** IC branching campaign graph → linearized sequential missions for stateless targets (RA1, OpenRA); user selects branch path or exports longest path; persistent state stripped with warnings
- **Editor extensibility — YAML + Lua tiers (D066):** Custom entity palette categories, property panels, terrain brush presets via YAML; editor automation, custom validators, batch operations via Lua (`Editor.RegisterValidator`, `Editor.RegisterCommand`); editor extensions distributed as Workshop packages (`type: editor_extension`)
- **Editor extension Workshop distribution (D066):** Editor extensions install into SDK extension directory; mod-profile-aware auto-activation (RA2 profile activates RA2 editor extensions)
- **Editor plugin hardening (D066):** Plugin API version compatibility checks, capability manifests (deny-by-default), and install-time permission review for editor extensions
- **Asset provenance / rights checks in Publish Readiness (D040/D038):** Advanced-mode provenance metadata in Asset Studio surfaced primarily during publish with stricter release-channel gating than beta/private workflows

### Exit Criteria
- Campaign editor can create a branching 5+ mission campaign with persistent roster, story flags, and intermission screens
- A first-time user can assemble a basic 5-mission campaign from Quick Start template + drag-and-drop in under 15 minutes
- Original RA1 Allied campaign can be imported via Campaign Import and opened in the graph editor with all asset references intact
- At least 3 game mode templates produce playable matches out-of-the-box
- A 2-player co-op mission works with per-player objectives, AI fallback for unfilled slots, and drop-in/drop-out
- Game Master mode allows one player to direct enemy forces in real-time with budget constraints
- At least one mod-defined achievement pack loads and triggers correctly
- `ic export --target ra1` produces `rules.ini` + mission files that load in CnCNet-patched Red Alert
- At least 5 Lua trigger patterns downcompile correctly to RA1 trigger/teamtype equivalents
- A YAML editor extension adds a custom entity palette category visible in the SDK
- A Lua editor script registers and executes a batch operation via `Editor.RegisterCommand`
- Incompatible editor extension plugin API versions are rejected with a clear compatibility message

## Phase 7: AI Content, Ecosystem & Polish (Months 34–36+)

**Goal:** Optional LLM-generated missions (BYOLLM), visual modding infrastructure, ecosystem polish, and feature parity.

### Deliverables — AI Content Generation (Optional — BYOLLM)

All LLM features require the player to configure their own LLM provider. The game is fully functional without one.

- `ic-llm` crate: optional LLM integration for mission generation
- In-game mission generator UI: describe scenario → playable mission
- Generated output: standard YAML map + Lua trigger scripts + briefing text
- Difficulty scaling: same scenario at different challenge levels
- Mission sharing: rate, remix, publish generated missions
- Campaign generation: connected multi-mission storylines (experimental)
- **World Domination campaign mode (D016):** LLM-driven narrative across a world map; world map renderer in `ic-ui` (region overlays, faction colors, frontline animation, briefing panel); mission generation from campaign state; template fallback without LLM; strategic AI for non-player WD factions; per-region force pool and garrison management
- **Template fallback system (D016):** Built-in mission templates per terrain type and action type (urban assault, rural defense, naval landing, arctic recon, mountain pass, etc.); template selection from strategic state; force pool population; deterministic progression rules for no-LLM mode
- Adaptive difficulty: AI observes playstyle, generates targeted challenges (experimental)
- **LLM-driven Workshop resource discovery (D030):** When LLM provider is configured, LLM can search Workshop by `llm_meta` tags, evaluate fitness, auto-pull resources as dependencies for generated content; license-aware filtering
- **LLM player-aware generation (D034):** When LLM provider is configured, `ic-llm` reads local SQLite for player context — faction preferences, unit usage patterns, win/loss streaks, campaign roster state; generates personalized missions, adaptive briefings, post-match commentary, coaching suggestions, rivalry narratives
- **LLM coaching loop (D042):** When LLM provider is configured, `ic-llm` reads `training_sessions` + `player_profiles` for structured training plans ("Week 1: expansion timing"), post-session natural language coaching, multi-session arc tracking, and contextual tips during weakness review; builds on Phase 4–5 rule-based training system
- **AI training data pipeline (D031):** gameplay event stream → OTEL collector → Parquet/Arrow columnar format → ML training; build order learning, engagement patterns, balance analysis from aggregated match telemetry

### Deliverables — WASM Editor Plugins & Community Export Targets (D066)
- **WASM editor plugins (D066 Tier 3):** Full editor plugins via WASM — custom asset viewers, terrain tools, component editors, export targets; `EditorHost` API for plugin registration; community-contributed export targets for Tiberian Sun, RA2, Remastered Collection
- **Agentic export assistance (D066/D016):** When LLM provider is configured, LLM suggests how to simplify IC-only features for target compatibility; auto-generates fidelity-improving alternatives for flagged triggers/features

### Deliverables — Visual Modding Infrastructure (Bevy Rendering)

These are optional visual enhancements that ship as engine capabilities for modders and community content creators. The base game uses the classic isometric aesthetic established in Phase 1.

- Post-processing pipeline available to modders: bloom, color grading, ambient occlusion
- Dynamic lighting infrastructure: explosions, muzzle flash, day/night cycle (optional game mode)
- GPU particle system infrastructure: smoke trails, fire propagation, weather effects (rain, snow, sandstorm, fog, blizzard, storm — see `04-MODDING.md` § "weather scene template")
- Weather system: per-map or trigger-based, render-only or with optional sim effects (visibility, speed modifiers)
- Shader effect library: chrono-shift, iron curtain, gap generator, nuke flash
- Cinematic replay camera with smooth interpolation

### Deliverables — Ecosystem Polish (deferred from Phase 6b)
- **Mod balance dashboard (D034):** Unit win-rate contribution, cost-efficiency scatter plots, engagement outcome distributions from SQLite `gameplay_events`; `ic mod stats` CLI reads same database
- **Community governance tooling (D037):** Workshop moderator dashboard, community representative election system, game module steward roles
- **Editor AI Assistant (D038):** Copilot-style AI-powered editor assistant — `EditorAssistant` trait (defined in Phase 6a) + `ic-llm` implementation; natural language prompts → editor actions (place entities, create triggers, build campaign graphs, configure intermissions); ghost preview before execution; full undo/redo integration; context-aware suggestions based on current editor state; prompt pattern library for scenario, campaign, and media tasks; discoverable capability hints
- **Editor onboarding:** "Coming From" profiles (OFP/AoE2/StarCraft/WC3), keybinding presets, terminology Rosetta Stone, interactive migration cheat sheets, partial scenario import from other editors
- **Game accessibility:** colorblind faction/minimap/resource palettes, screen reader support for menus, remappable controls, subtitle options for EVA/briefings

### Deliverables — Platform
- Feature parity checklist vs OpenRA
- Web build via WASM (play in browser)
- Mobile touch controls
- Community infrastructure: website, mod registry, matchmaking server

### Exit Criteria
- A competitive OpenRA player can switch and feel at home
- When an LLM provider is configured, the mission generator produces varied, fun, playable missions
- Browser version is playable
- At least one total conversion mod exists on the platform
- A veteran editor from AoE2, OFP, or StarCraft backgrounds reports feeling productive within 30 minutes (user testing)
- Game is playable by a colorblind user without information loss
