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
- **`mod.toml` manifest** with typed schema, semver engine version pinning, dependency declarations
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
- **`p2p-distribute` hardening & control surfaces (D076):** Fuzz suite, chaos tests, v2/hybrid BEP 52, storage perf tuning, web API + JSON-RPC + CLI + metrics, `crates.io` publish — production-readiness gate for full Workshop P2P delivery
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
