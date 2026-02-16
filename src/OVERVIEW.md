# What Iron Curtain Offers

Iron Curtain is a new open-source RTS engine built for the Command & Conquer community. It loads your existing Red Alert and OpenRA assets — maps, mods, sprites, music — and plays them on a modern engine designed for performance, modding, and competitive play. Ships with Red Alert and Tiberian Dawn, with more C&C titles and community-created games to follow.

> This project is in design phase — no playable build exists yet. Everything below describes design targets, not shipped features.

---

## For Players

- **Smooth performance, even in large battles.** No random stutters or micro-freezes. Rust has no garbage collector; Bevy's ECS gives cache-friendly memory layout; zero allocation during gameplay. Target: 500 units smooth on a 2012 laptop, 2000+ on modern hardware.
- **Multiplayer that doesn't randomly break.** No more matches silently falling out of sync with no explanation. Fixed-point integer math guarantees every player's game stays in sync, and when something does go wrong, the engine pinpoints exactly what diverged.
- **Play on any device.** Windows, macOS, Linux, Steam Deck, browser (WASM), and mobile — all planned from day one via platform-agnostic architecture.
- **Complete campaigns that flow.** All original campaigns fully playable. Continuous mission flow (briefing → mission → debrief → next) — no exit-to-menu between levels.
- **Branching campaigns.** Your choices create different paths. Surviving units, veterancy, and equipment carry over between missions. Defeat is another branch, not a game over.
- **Choose your own balance.** Classic Westwood, OpenRA, or Remastered tuning — a lobby setting, not a mod. Tanya and Tesla coils feel as powerful as you remember, or as balanced as competitive play demands.
- **Switchable pathfinding.** Three movement models: Remastered (original feel), OpenRA (improved flow), IC Default (flowfield + ORCA-lite). Select per lobby or per scenario. Modders can ship custom pathfinding via WASM.
- **Switchable render modes.** Toggle Classic/HD/3D mid-game (F1 key, like the Remastered Collection). Different players can use different render modes in the same multiplayer game.
- **Switchable AI opponents.** Classic Westwood, OpenRA, or IC Default AI — selectable per AI slot. Two-axis difficulty (engine scaling + behavioral tuning). Mix different AI personalities and difficulties in the same match.
- **Five ways to find a game.** Direct IP, Among Us-style room codes, QR codes (LAN/streaming), server browser, ranked matchmaking queue — plus Discord/Steam deep links.
- **Built-in voice and text chat.** Push-to-talk voice (Opus codec, relay-forwarded), text chat with team/all/whisper/observer channels. Contextual ping system (8 types + ping wheel), chat wheel with auto-translated phrases, minimap drawing, tactical markers. Voice optionally recorded in replays (opt-in). Speaking indicators in lobby and in-game.
- **Command console.** Unified `/` command system — every GUI action has a console equivalent. Developer overlay, cvar system, tab completion with fuzzy matching. Hidden cheat codes (Cold War phrases) for single-player fun.

---

## For Competitive Players

- **Ranked matchmaking.** Glicko-2 ratings, seasonal rankings with Cold War military rank themes, 10 placement matches, optional per-faction ratings. Map veto system with anonymous opponent during selection.
- **Player profiles.** Avatar, title, achievement showcase, verified statistics, match history, friends list, community memberships. Reputation data is cryptographically signed — no fake stats.
- **Architectural anti-cheat.** Relay server owns the clock (blocks lag switches and speed hacks). Deterministic order validation (all clients agree on legality). No kernel drivers, no invasive monitoring — works on Linux and in browsers.
- **Tamper-proof replays.** Ed25519-signed replays and relay-certified match results. No disputes.
- **Tournament mode.** Caster view (no fog), player-perspective spectating, configurable broadcast delay (1–5 min), bracket integration, server-side replay archive.
- **Sub-tick fairness.** Orders processed in the order they happened, not the order packets arrived. Adapted from Counter-Strike 2's sub-tick architecture.
- **Train against yourself.** AI mimics a specific player's style from their replays. "Challenge My Weakness" mode targets your weakest skills for focused practice.
- **Foreign replay import.** Load and play back OpenRA and Remastered Collection replays directly. Convert to IC format for analysis. Automated behavioral regression testing against replay corpus.
- **Fair-play match controls.** Ready-check before match start. In-match voting — kick griefers, remake broken games, mutual draw — with anti-abuse protections (premade consolidation, army-value checks). Pause and surrender with ranked penalty framework.
- **Disconnect handling.** Grace period for brief disconnects, abandon penalties with escalating cooldowns, match voiding for early exits. Remaining teammates choose to play on (with AI substitute) or surrender.
- **Spectator anti-coaching.** In ranked team games, live spectators are locked to one team's perspective — the relay won't send opposing orders until the broadcast delay expires.

---

## For Modders

- **Your existing work carries over.** Loads OpenRA YAML rules, maps, sprites, audio, and palettes directly. MiniYAML auto-converts at runtime. Migration tool included.
- **Mod without programming.** 80% of mods are YAML data files — change a number, save, done. Standard YAML means IDE autocompletion and validation work out of the box.
- **Three tiers, no recompilation.** YAML for data. Lua for scripting (missions, AI, abilities). WASM for engine-level mods (new mechanics, total conversions) in any language — sandboxed, near-native speed.
- **Scenario editor.** Full SDK with 30+ drag-and-drop modules across 8 categories: terrain painting, unit placement, visual trigger editor, reusable compositions (publishable to Workshop), layers with runtime show/hide, media & cinematics (video playback, cinematic sequences, dynamic mood-based music, ambient sound zones, EVA notifications with priority queuing). Campaign editor with visual graph and weighted random paths. Game Master mode for live scenario control. Simple and Advanced modes with onboarding profiles for veterans of other editors.
- **Asset studio.** Visual asset browser (XCC Mixer replacement), sprite/palette/terrain editors, bidirectional format conversion (SHP↔PNG, AUD↔WAV, VQA↔WebM), UI theme designer. Hot-reload bridge between editor and running game.
- **Workshop for everything, not just mods.** Publish individual music tracks, sprite sheets, voice packs, balance presets, UI themes, script libraries, maps, campaign chapters, or full mods — each independently versioned, licensed, and dependable. A mission pack can depend on a music pack and an HD sprite pack without bundling either.
- **Auto-download on lobby join.** Join a game → missing content downloads automatically via P2P (BitTorrent/WebTorrent). Lobby peers seed directly — fast and free. Auto-downloaded content cleans itself up after 30 days of non-use; frequently used content auto-promotes to permanent.
- **Dependency resolution.** Cargo-style semver ranges, lockfile with SHA-256 checksums, transitive resolution, conflict detection. `ic mod tree` shows your full dependency graph. `ic mod audit` checks license compatibility.
- **Reusable script libraries.** Publish shared Lua modules (AI behaviors, trigger templates, UI helpers) as Workshop resources. Other mods `require()` them as dependencies — composable ecosystem instead of copy-paste.
- **CI/CD publishing.** Headless CLI with scoped API tokens. Tag a release in git → CI validates, tests, and publishes to the Workshop automatically. Beta/release promotion channels.
- **Federated and self-hostable.** Official server, community mirrors, local directories, and Steam Workshop — all appear in one merged view. Offline bundles for LAN parties. No single point of failure.
- **Creator tools.** Reputation scores, badges (Verified, Prolific, Foundation), download analytics, collections, ratings & reviews, DMCA process with due process. LLM agents can discover and pull resources with author consent (`ai_usage` permission per resource).
- **Hot-reload.** Change YAML or Lua, see it in-game immediately. No restart.
- **Console command extensibility.** Register custom `/` commands via Lua or WASM — with typed arguments, tab completion, and permission levels. Publish reusable `.iccmd` command scripts to the Workshop.

---

## For Content Creators & Tournament Organizers

- **Observer and casting tools.** No-fog caster view, player-perspective spectating, configurable broadcast delay, signed replays.
- **Creator recognition.** Reputation scores, featured badges, optional tipping links — credit and visibility for modders and creators.
- **Player analytics.** Post-game stats, career pages, campaign dashboards. Every ranked match links to its replay.

---

## For Community Leaders & Server Operators

- **Self-hostable everything.** Relay, matchmaking, and workshop servers are all self-hostable. Federated architecture — communities mirror each other's content. Ed25519-signed credential records (not JWT) with transparency logs for server accountability. No single point of failure.
- **Community governance.** RFC process, community-elected representatives, self-hosting independence. The project can't be killed by one organization.
- **Observability.** OTEL-based telemetry (metrics, traces, logs), pre-built Grafana dashboards for self-hosters. Zero-cost when disabled.

---

## For Developers & Contributors

- **Modern Rust on Bevy.** No GC, memory safety, fearless concurrency. ECS scheduling, parallel queries, asset hot-reloading, large plugin ecosystem. 11 focused crates with clear boundaries.
- **Clean sim/net separation.** `ic-sim` and `ic-net` never import each other — only `ic-protocol`. Swap the network model without touching simulation code.
- **Multi-game engine.** Game-agnostic core. RA and TD are game modules via a `GameModule` trait. Pathfinding, spatial queries, rendering, fog — all pluggable per game.
- **Standalone crates.** `ra-formats` parses C&C formats independently. `ic-sim` runs headless for AI training or testing.

---

## Nice-to-Haves

- **AI-generated missions and campaigns (BYOLLM).** Describe a scenario, get a playable mission — or generate an entire branching campaign with recurring characters who evolve, betray, and die based on your choices. Choose a story style (C&C Classic, Realistic Military, Political Thriller, and more). World Domination mode: conquer a strategic map region by region with garrison management and faction dynamics. Each mission reacts to how you actually played — the LLM reads your battle report and adapts the next mission's narrative, difficulty, and objectives. Mid-mission radar comms, RPG-style dialogue choices, and cinematic moments are all generated. Every output is standard YAML + Lua, fully playable without the LLM after creation. Built-in mission templates provide a fallback without any LLM at all. Bring your own LLM; the engine never requires one. Phase 7.
- **LLM-enhanced AI (BYOLLM).** Two modes: `LlmOrchestratorAi` wraps conventional AI with LLM strategic guidance, `LlmPlayerAi` lets the LLM play the game directly — designed for community entertainment streams ("GPT vs. Claude playing Red Alert"). Observable reasoning overlay for spectators. Neither mode allowed in ranked. Phase 7.
- **LLM coaching (BYOLLM).** Post-match analysis, personalized improvement suggestions, and adaptive briefings based on your play history. Phase 7.
- **LLM Skill Library (BYOLLM).** Persistent, semantically-indexed store of verified LLM outputs — AI strategies and generation patterns that improve over time. Verification-to-promotion pipeline ensures quality. Shareable via Workshop. Voyager-inspired lifelong learning. Phase 7.
- **Dynamic weather.** Real-time transitions (sunny → rain → storm), terrain effects (frozen water, mud), snow accumulation. Deterministic weather state machine.
- **Advanced visuals for modders.** Bevy's wgpu stack gives modders access to bloom, dynamic lighting, GPU particles, shader effects, day/night, smooth zoom, and even full 3D rendering — while the base game stays classic isometric. Render modes are switchable mid-game (see above).
- **Switchable UI themes.** Classic, Remastered, or Modern look — YAML-driven, community themes via Workshop.
- **Achievements.** Per-game-module, mod-defined via YAML + Lua, Steam sync.
- **Toggleable QoL.** Every convenience (attack-move, health bars, range circles) individually toggleable. Experience profiles bundle 6 axes — balance + AI preset + pathfinding preset + QoL + UI theme + render mode: "Vanilla RA," "OpenRA," "Remastered," or "Iron Curtain."

---

## How This Was Designed

The networking design alone studied 20+ open-source codebases, 4 EA GPL source releases, and multiple academic papers — all at the source code level. Every major subsystem went through the same process. 59 design decisions with rationale. 31 research documents. ~55,000 lines of documentation across 115+ commits.

📖 **[Read the full design documentation →](https://dk26.github.io/iron-curtain-design-docs/)**
