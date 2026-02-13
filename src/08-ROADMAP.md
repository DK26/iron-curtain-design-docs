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
- Pathfinding: `Pathfinder` trait + `IcPathfinder` multi-layer hybrid (D013), `RemastersPathfinder` and `OpenRaPathfinder` ported from GPL sources (D045)
- Order system: Player inputs → Orders → deterministic sim application
- `LocalNetwork` and `ReplayPlayback` NetworkModel implementations
- Sim snapshot/restore for save games and future rollback

### Key Architecture Work
- **Sim/network boundary enforced:** `ic-sim` has zero imports from `ic-net`
- **`NetworkModel` trait defined and proven** with at least `LocalNetwork` implementation
- **System execution order documented and fixed**
- **State hashing for desync detection**
- **Engine telemetry foundation (D031):** `tracing` span instrumentation on sim systems; per-system tick timing; gameplay event stream (`GameplayEvent` enum) behind `telemetry` feature flag; zero-cost when disabled
- **Client-side SQLite storage (D034):** Replay catalog, save game index, gameplay event log, asset index — embedded SQLite for local metadata; queryable without OTEL stack

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
- **Chart component in `ic-ui`:** Lightweight Bevy 2D chart renderer (line, bar, pie, heatmap, stacked area) for post-game and career screens
- **Post-game stats screen (D034):** Unit production timeline, resource curves, combat heatmap, APM graph, head-to-head comparison — all from SQLite `gameplay_events`
- **Career stats page (D034):** Win rate by faction/map/opponent, rating history graph, session history with replay links — from SQLite `matches` + `match_players`
- **Achievement infrastructure (D036):** SQLite achievement tables, engine-defined campaign/exploration achievements, Lua trigger API for mod-defined achievements, Steam achievement sync for Steam builds

> **Note:** Phase 3's hard goal is "feels like Red Alert" — sidebar, audio, selection, build placement. The stats screens, chart component, and achievement infrastructure are high-value polish but depend on accumulated gameplay data, so they can mature alongside Phase 4 without blocking the "playable" milestone.

## Phase 4: AI & Single Player (Months 16–20)

**Goal:** Complete campaign support and skirmish AI. Unlike OpenRA, single-player is a first-class deliverable, not an afterthought.

### Deliverables
- Lua-based scripting for mission scripts
- WASM mod runtime (basic)
- Basic skirmish AI: priority-based manager hierarchy (D043) with harvester management, share-based unit production, influence-map building placement, tick-gated evaluation, and fuzzy engagement logic — target quality: better than EA RA, comparable to OpenRA
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

### Key Architecture Work
- Lua sandbox with engine bindings
- WASM host API with capability system (see `06-SECURITY.md`)
- Campaign graph loader + validator: parse YAML campaign definitions, validate graph connectivity (no orphan nodes, all outcome targets exist)
- `CampaignState` serialization: roster, flags, equipment, path taken — full snapshot support
- Unit carryover system: 5 modes (`none`, `surviving`, `extracted`, `selected`, `custom`)
- Veterancy persistence across missions
- Mission select UI with campaign graph visualization and difficulty indicators
- **`ic` CLI prototype:** `ic mod init`, `ic mod check`, `ic mod run` — early tooling for Lua script development (full SDK in Phase 6a)
- **Minimal Workshop (D030 early delivery):** Central IC Workshop server + `ic mod publish` + `ic mod install` + basic in-game browser + auto-download on lobby join. Simple HTTP REST API, SQLite-backed. No federation, no replication, no promotion channels yet — those are Phase 6a

### Exit Criteria
- Can play through **all** Allied and Soviet campaign missions start to finish
- Campaign branches work: different mission outcomes lead to different next missions
- Unit roster persists across missions (surviving units, veterancy, equipment)
- Save/load works mid-campaign with full state preservation
- Skirmish AI provides a credible challenge: **better than EA Red Alert, comparable to OpenRA** — maintains economy (no idle harvesters, no power brownouts), builds a reasonable army composition, attacks at appropriate timing, and defends its base reactively (see D043 implementation architecture and `research/rts-ai-implementation-survey.md` §9 for target quality)

## Phase 5: Multiplayer (Months 20–26)

**Goal:** Deterministic lockstep multiplayer with competitive infrastructure. Not just "multiplayer works" — multiplayer that's worth switching from OpenRA for.

### Deliverables
- `LockstepNetwork` implementation (input delay model)
- `RelayLockstepNetwork` implementation (relay server with time authority)
- Desync detection and server-side debugging tools (killer feature)
- Lobby system, game browser, NAT traversal via relay
- Replay system (already enabled by Phase 2 architecture)
- `CommunityBridge` for shared server browser with OpenRA
- **Ranked matchmaking:** Glicko-2 rating system, placement matches, league tiers, 3-month seasons
- **Leaderboards:** global, per-faction, per-map — with public profiles and replay links
- **Observer/spectator mode:** connect to relay with configurable fog (full/player/none) and broadcast delay
- **Tournament mode:** bracket API, relay-certified `CertifiedMatchResult`, server-side replay archive
- **Competitive map pool:** curated per-season, community-nominated
- **Anti-cheat:** relay-side behavioral analysis (APM, reaction time, pattern entropy), suspicion scoring, community reports
- **"Train Against" opponent mode (D042):** With multiplayer match data, players can select any opponent from match history → pick a map → instantly play against `StyleDrivenAi` loaded with that opponent's aggregated behavioral profile; no scenario editor required
- **Competitive governance (D037):** Competitive committee formation, seasonal map pool curation process, community representative elections
- **Competitive achievements (D036):** Ranked placement, league promotion, season finish, tournament participation achievements

### Key Architecture Work
- Sub-tick timestamped orders (CS2 insight)
- Relay server anti-lag-switch mechanism
- Signed replay chain
- Order validation in sim (anti-cheat)
- Matchmaking service (lightweight Rust binary, same infra as tracking/relay servers)
- `CertifiedMatchResult` with Ed25519 relay signatures
- Spectator feed: relay forwards tick orders to observers with configurable delay
- Behavioral analysis pipeline on relay server
- **Backend OTEL telemetry (D031):** relay + tracking + workshop servers emit metrics/traces/logs via OpenTelemetry; `/healthz`, `/readyz`, `/metrics` endpoints; distributed trace IDs for desync debugging across clients and relay; pre-built Grafana dashboards; optional `docker-compose.observability.yaml` overlay for self-hosters
- **Backend SQLite storage (D034):** Relay server persists match results, desync reports, behavioral profiles; matchmaking server persists player ratings, match history, seasonal data — all in embedded SQLite, no external database

### Exit Criteria
- Two players can play a full game over the internet
- Desync, if it occurs, is automatically diagnosed to specific tick and entity
- Games appear in shared server browser alongside OpenRA games
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
- **`ic` CLI tool (full release):** `ic mod init/check/test/run/server/package/publish/watch/lint` — complete mod development workflow (D020)
- **Mod templates:** `data-mod`, `scripted-mod`, `total-conversion`, `map-pack`, `asset-pack` via `ic mod init`
- **`mod.yaml` manifest** with typed schema, semver engine version pinning, dependency declarations
- **VS Code extension** for mod development: YAML schema validation, Lua LSP, `ic` integration

### Deliverables — Scenario Editor (D038 Core)
- **SDK scenario editor (D038):** OFP/Eden-inspired visual editor for maps AND mission logic — ships as part of the IC SDK (separate application from the game — D040). Terrain painting, unit placement, triggers (area-based with countdown/timeout timers and min/mid/max randomization), waypoints, pre-built modules (wave spawner, patrol route, guard position, reinforcements, objectives, weather change, etc.), visual connection lines between triggers/modules/waypoints, Probability of Presence per entity for replayability, compositions (reusable prefabs), layers with lock/visibility, Simple/Advanced mode toggle, Test button (launches ic-game with scenario), autosave with crash recovery, undo/redo, direct Workshop publishing
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

### Exit Criteria
- Someone ports an existing OpenRA mod (Tiberian Dawn, Dune 2000) and it runs
- SDK scenario editor supports terrain painting, unit placement, triggers with timers, waypoints, modules, compositions, undo/redo, autosave, and Workshop publishing
- A mod can declare 3+ Workshop resource dependencies and `ic mod install` resolves, downloads, and caches them correctly
- `ic mod audit` correctly identifies license incompatibilities in a dependency tree
- An individual resource (e.g., a music track) can be published to and pulled from the Workshop independently
- In-game Workshop browser can search, filter, and install resources with dependency auto-resolution
- Joining a lobby with required mods triggers auto-download with progress UI
- Creator reputation badges display correctly on resource listings
- DMCA/takedown process handles a test case end-to-end within 72 hours

## Phase 6b: Campaign Editor & Game Modes (Months 30–34)

**Goal:** Extend the scenario editor into a full campaign authoring platform, ship game mode templates, and multiplayer scenario tools. These all build on Phase 6a's editor and Workshop foundations.

### Deliverables — Campaign Editor (D038)
- **Visual campaign graph editor:** missions as nodes, outcomes as directed edges, weighted/conditional paths, mission pools
- **Persistent state dashboard:** roster flow visualization, story flag cross-references, campaign variable scoping
- **Intermission screen editor:** briefing, roster management, base screen, shop/armory, dialogue, world map, debrief+stats, custom layout
- **Dialogue editor:** branching trees with conditions, effects, variable substitution, per-character portraits
- **Named characters:** persistent identity across missions, traits, inventory, must-survive flags
- **Campaign inventory:** persistent items with category, quantity, assignability to characters
- **Campaign testing tools:** graph validation, jump-to-mission, path coverage visualization, state inspector

### Deliverables — Game Mode Templates & Multiplayer Scenario Tools (D038)
- **8 core game mode templates:** Skirmish, Survival/Horde, King of the Hill, Regicide, Free for All, Co-op Survival, Sandbox, Base Defense
- **Multiplayer scenario tools:** player slot configuration, per-player objectives/triggers/briefings, co-op mission modes (allied factions, shared command, split objectives, asymmetric), multi-slot preview with AI standin, slot switching, lobby preview
- **Co-op campaign properties:** shared roster draft/split/claim, drop-in/drop-out, solo fallback configuration
- **Game Master mode (D038):** Zeus-inspired real-time scenario manipulation during live gameplay — one player controls enemy faction strategy, places reinforcements, triggers events, adjusts difficulty; uses editor UI on a live sim; budget system prevents flooding
- **Achievement packs (D036):** Mod-defined achievements via YAML + Lua triggers, publishable as Workshop resources; achievement browser in game UI

### Exit Criteria
- Campaign editor can create a branching 5+ mission campaign with persistent roster, story flags, and intermission screens
- At least 3 game mode templates produce playable matches out-of-the-box
- A 2-player co-op mission works with per-player objectives, AI fallback for unfilled slots, and drop-in/drop-out
- Game Master mode allows one player to direct enemy forces in real-time with budget constraints
- At least one mod-defined achievement pack loads and triggers correctly

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
- Adaptive difficulty: AI observes playstyle, generates targeted challenges (experimental)
- **LLM-driven Workshop resource discovery (D030):** When LLM provider is configured, LLM can search Workshop by `llm_meta` tags, evaluate fitness, auto-pull resources as dependencies for generated content; license-aware filtering
- **LLM player-aware generation (D034):** When LLM provider is configured, `ic-llm` reads local SQLite for player context — faction preferences, unit usage patterns, win/loss streaks, campaign roster state; generates personalized missions, adaptive briefings, post-match commentary, coaching suggestions, rivalry narratives
- **LLM coaching loop (D042):** When LLM provider is configured, `ic-llm` reads `training_sessions` + `player_profiles` for structured training plans ("Week 1: expansion timing"), post-session natural language coaching, multi-session arc tracking, and contextual tips during weakness review; builds on Phase 4–5 rule-based training system
- **AI training data pipeline (D031):** gameplay event stream → OTEL collector → Parquet/Arrow columnar format → ML training; build order learning, engagement patterns, balance analysis from aggregated match telemetry

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
