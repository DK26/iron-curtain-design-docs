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
- `cnc-formats` CLI tool — Phase 0 subcommands: `validate` (structural correctness check), `inspect` (dump archive contents and format metadata, `--json` for machine-readable output), `convert` (extensible `--format`/`--to` format conversion; **text:** `--format miniyaml --to yaml` behind `miniyaml` feature; **binary:** SHP↔PNG, SHP↔GIF, AUD↔WAV, VQA↔AVI, WSA↔PNG/GIF, TMP→PNG, PAL→PNG, FNT→PNG behind `convert` feature; **text sprites:** `--to ist` / `--format ist` behind `ist` feature flag)
- **Runtime MiniYAML loading (D025):** MiniYAML files load directly at runtime — auto-converts in memory, no pre-conversion required
- **OpenRA vocabulary alias registry (D023):** Accept OpenRA trait names (`Armament`, `Valued`, etc.) as YAML key aliases alongside IC-native names
- **OpenRA mod manifest parser (D026):** Parse OpenRA `mod.yaml` manifests, map directory layout to IC equivalents
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

### Implementation Repo Template (Engine Repos Only)
- Publish a **GitHub template repository** (`iron-curtain/ic-template`) that **engine implementation repos** are instantiated from. Non-engine repos (relay, tools, prototypes) use generic templates.
- Template contains: pre-filled `AGENTS.md` (referencing this design-docs repo as canonical design authority), `CODE-INDEX.md` skeleton, `deny.toml`, CI workflows (clippy, fmt, `cargo deny`, DCO check), SPDX headers, `.github/copilot-instructions.md`, Cargo workspace scaffold matching AGENTS.md crate structure
- The template `AGENTS.md` pins a design-doc revision (tag or commit hash) and encodes the no-silent-divergence rule, design-change escalation workflow, and milestone/`G*` alignment requirements — all derived from `tracking/external-project-agents-template.md` and `tracking/ic-engine-agents.md`
- See `tracking/external-code-project-bootstrap.md` for the full bootstrap process

### Player Data Foundation (D061)
- Define and document the `<data_dir>` directory layout (stable structure for saves, replays, screenshots, profiles, keys, communities, workshop, backups)
- Platform-specific `<data_dir>` resolution (Windows: `%APPDATA%\IronCurtain`, macOS: `~/Library/Application Support/IronCurtain`, Linux: `$XDG_DATA_HOME/iron-curtain/`)
- `IC_DATA_DIR` environment variable and `--data-dir` CLI flag override support

### Release
Open source `cnc-formats` (MIT/Apache-2.0) early. Useful standalone for any C&C tool or modding project, builds credibility and community interest. `ra-formats` (GPL) wraps it with EA-derived details and Bevy asset integration.

### Exit Criteria
- Can parse any OpenRA mod's YAML rules into typed Rust structs
- Can parse any OpenRA mod's MiniYAML rules into typed Rust structs (runtime conversion, D025)
- Can load an OpenRA mod directory via `mod.yaml` manifest (D026)
- OpenRA trait name aliases resolve correctly to IC components (D023)
- Can extract and display sprites from .mix archives
- Can convert MiniYAML to standard YAML losslessly
- Can convert `.shp + .pal` to IST and back losslessly (`cnc-formats convert --to ist` / `--format ist`, behind `ist` feature flag — see D076)
- Code of conduct and RFC process published (D037)
- SPDX headers present on all source files; `cargo deny check licenses` passes
- GitHub template repo published; new engine repo instantiated from template has passing CI and a working `AGENTS.md` pointing to the design docs
- Generic non-engine templates (`external-project-agents-template.md`, `source-code-index-template.md`) exist and produce valid `AGENTS.md` + `CODE-INDEX.md` when filled in

## Phase 1: Rendering Slice (Months 3–6)

**Goal:** Render a Red Alert map faithfully with units standing on it. No gameplay. Classic isometric aesthetic.

### Deliverables
- Bevy-based isometric tile renderer with palette-aware shading
- Sprite animation system (idle, move, attack frames)
- Shroud/fog-of-war rendering
- Camera: smooth scroll, zoom, minimap
- Load OpenRA map, render correctly
- Render quality tier auto-detection (see `10-PERFORMANCE.md` § "Render Quality Tiers")
- `cnc-formats` CLI expansion: `extract` (decompose `.mix` archives) and `list` (quick archive inventory)
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
- **Highlight analysis events (D077):** 6 new Analysis Event types in the `.icrep` event stream — `EngagementStarted`, `EngagementEnded`, `SuperweaponFired`, `BaseDestroyed`, `ArmyWipe`, `ComebackMoment` — observation-only events emitted during match recording for post-match highlight detection
- **Client-side SQLite storage (D034):** Replay catalog, save game index, gameplay event log, asset index — embedded SQLite for local metadata; queryable without OTEL stack
- **`ic backup` CLI (D061):** `ic backup create/restore/list/verify` — ZIP archive with SQLite `VACUUM INTO` for consistent database copies; `--exclude`/`--only` category filtering; ships alongside save/load system
- **Automatic daily critical snapshots (D061):** Rotating 3-day `auto-critical-N.zip` files (~5 MB) containing keys, profile, community credentials, achievements, config — created silently on first launch of the day; protects all players regardless of cloud sync status
- **Screenshot capture with metadata (D061):** PNG screenshots with IC-specific `tEXt` chunks (engine version, map, players, tick, replay link); timestamped filenames in `<data_dir>/screenshots/`
- **Mnemonic seed recovery (D061):** BIP-39-inspired 24-word recovery phrase generated alongside Ed25519 identity key; `ic identity seed show` / `ic identity seed verify` / `ic identity recover` CLI commands; deterministic key derivation via PBKDF2-HMAC-SHA512 — zero infrastructure, zero cost, identity recoverable from a piece of paper
- **CredentialStore infrastructure (D052/D061):** `CredentialStore` in `ic-paths` — OS keyring (Tier 1), vault passphrase with Argon2id KDF (Tier 2); DEK management; `Zeroizing<T>` memory protection; identity key AEAD encryption at rest; `vault_meta` table. WASM session-only tier (Tier 3) and LLM credential column encryption (D047) ship in Phase 7 (M11). See `research/credential-protection-design.md`
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
  - **Audio system (P003 resolved — Kira via `bevy_kira_audio`):** `.aud` IMA ADPCM decoding pipeline; dynamic music state machine (combat/build/idle transitions — original RA had this); music-as-Workshop-resource architecture; investigate loading remastered soundtrack if player owns Remastered Collection
- Custom UI layer on `wgpu` for game HUD
- `egui` for dev tools/debug overlays
- **UI theme system (D032):** YAML-driven switchable themes (Classic, Remastered, Modern); chrome sprite sheets, color palettes, font configuration; shellmap live menu backgrounds; first-launch theme picker
- **Per-game-module default theme:** RA1 module defaults to Classic theme

### Exit Criteria
- Single-player skirmish against scripted dummy AI (first "playable" milestone)
- Feels like Red Alert to someone who's played it before

**Stretch goals (target Phase 3, can slip to early Phase 4 without blocking):**
- **Replay highlight detection & POTG (D077):** Four-dimension scoring pipeline (engagement/momentum/anomaly/rarity) over recorded Analysis Event Stream; Play-of-the-Game viewport on post-game screen; per-player highlight library in SQLite; main menu highlight background option; `/highlight` console commands; highlight camera AI
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
- **Branching campaign graph engine + strategic layer (D021):** campaigns as directed graphs of missions with named outcomes, multiple paths, and convergence points; Enhanced Edition campaigns can wrap that graph in a phase-based War Table with operations, enemy initiatives, Requisition, and Command Authority
- **Persistent campaign state:** unit roster carryover, veterancy across missions, equipment persistence, story flags, campaign phases, operation availability, enemy initiatives, and arms-race / tech-ledger state — serializable for save games
- **Lua Campaign API:** `Campaign.complete()`, `Campaign.get_roster()`, `Campaign.get_flag()`, `Campaign.set_flag()`, etc.
- **Continuous campaign flow:** briefing → mission → debrief → next mission (no exit-to-menu between levels)
- **Campaign select, mission map, and War Table UI:** visualize campaign graph, show current position, replay completed missions, surface operation cards, enemy initiatives, urgency, and arms-race readouts
- **Operations as a distinct campaign content tier:** main missions, SpecOps, theater branches, and generated operations share one graph / state model
- **Enemy Initiatives system:** authored strategic threats that advance between operations and resolve with concrete downstream effects if uncountered
- **Expiring opportunity nodes:** optional missions with `expires_in_phases` timers, `on_expire` consequences, and map beacons so the world moves without the player
- **Arms race / tech acquisition-denial tracking:** campaign-visible ledger that determines which prototypes, support powers, and enemy programs reach later missions
- **Adaptive difficulty via campaign state:** designer-authored conditional bonuses/penalties based on cumulative performance
- **Subfaction system — campaign theater bonuses (proposed — contingent on subfaction adoption):** Allied campaign operations grant temporary theater bonuses echoing country passives (Greece → partisans, North Sea → UK naval bonus); Soviet missions carry institutional flavor (NKVD suppression → conscripts, GRU intelligence → recon assets). Uses the same YAML bonus definitions as multiplayer subfactions. See `research/subfaction-country-system-study.md`
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
- Strategic-layer resolver: phase budgets, operation reveals, enemy-initiative advancement, and tech-ledger updates between missions
- `CampaignState` serialization: roster, flags, equipment, path taken, phase state, operation state, enemy initiatives, and arms-race ledger — full snapshot support
- Unit carryover system: 5 modes (`none`, `surviving`, `extracted`, `selected`, `custom`)
- Veterancy persistence across missions
- Mission select / War Table UI with campaign graph visualization, operation cards, enemy-initiative lane, urgency indicators, and difficulty indicators
- **`ic` CLI prototype:** `ic mod init`, `ic mod check`, `ic mod run` — early tooling for Lua script development (full SDK in Phase 6a)
- **`ic profile` CLI (D062):** `ic profile save/list/activate/inspect/diff` — named mod compositions with switchable experience settings; modpack curators can save and compare configurations; profile fingerprint enables replay verification
- **Minimal Workshop (D030 early delivery):** Central IC Workshop server + `ic mod publish` + `ic mod install` + basic in-game browser + auto-download on lobby join. Simple HTTP REST API, SQLite-backed. No federation, no replication, no promotion channels yet — those are Phase 6a
- **Standalone installer (D069 Layer 1):** Platform-native installers for non-store distribution — NSIS `.exe` for Windows, `.dmg` for macOS, `.AppImage` for Linux. Handles binary placement, shortcuts, file associations (`.icrep`, `.icsave`, `ironcurtain://` URI scheme), and uninstaller registration. Portable mode checkbox creates `portable.marker`. Installer launches IC on completion → enters D069 First-Run Setup Wizard. CI pipeline builds installers automatically per release.

### Exit Criteria
- Can play through **all** Allied and Soviet campaign missions start to finish
- Campaign branches work: different mission outcomes lead to different next missions
- Unit roster persists across missions (surviving units, veterancy, equipment)
- Enhanced Edition strategic layer works: phases, operations, enemy initiatives, and arms-race state all persist and affect downstream missions
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
- **Subfaction selection in multiplayer lobby (proposed — pending formal adoption via D019):** Allies pick a nation (England, France, Germany, Greece), Soviets pick an institution (Red Army, NKVD, GRU, Science Bureau) — each with one thematic passive + one tech tree mod. Classic preset uses RA1's original 5-country 10% passives. Starts as casual/skirmish only; promoted to ranked after one full season of balance telemetry confirms no subfaction exceeds 55% win rate. Community subfactions via YAML Workshop. See `research/subfaction-country-system-study.md`
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
- **`p2p-distribute` standalone crate (D076 Tier 3):** Purpose-built P2P engine for Workshop/lobby/server content delivery; core engine + config + peer discovery start M8 (parallel with main sim); IC integration wires into `workshop-core` and `ic-server` Workshop capability; see `research/p2p-distribute-crate-design.md` for full design and build-vs-adopt rationale
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


---

## Sub-Pages

| Section     | Topic                                                                                                                                                             | File                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Phases 6a-7 | Phase 6a (Core Modding + Scenario Editor), Phase 6b (Campaign Editor + Game Modes), Phase 7 (LLM Missions + Ecosystem + Polish), post-Phase 7 vision, risk matrix | [phases-6-7.md](roadmap/phases-6-7.md) |
