# ⚡ Iron Curtain


### A modern, open-source RTS engine built in Rust — starting with Command & Conquer.

*Red Alert first. Tiberian Dawn alongside it. The rest of the C&C family to follow.*

---

Iron Curtain is a new open-source RTS engine built for the C&C community. Not a port, not a remaster — a clean-sheet engine built in Rust on Bevy, designed to load your existing OpenRA mods, maps, and assets while delivering better performance, deeper modding, competitive multiplayer, and a creative platform that puts the community in control.

> ⚠️ **This project is in design phase — no playable build exists yet.** The design documents are in active development. Implementation has not started.

## Why Iron Curtain

Iron Curtain is a **game-agnostic RTS platform** — Red Alert is its first game module, not its identity:

- **Rust-native and deterministic** — pure fixed-point simulation, pluggable netcode, replay/debug-first architecture
- **Compatibility-first** — load Red Alert/OpenRA assets, maps, and mod content without demanding a rewrite
- **Creator-first** — SDK + CLI + Workshop + embedded docs/manuals, with fast local iteration workflows
- **Community-first** — self-hostable services, trust labels, profile ownership, moderation/governance tooling

## What Makes It Different

- **Not a port, not a remaster:** clean-sheet engine design in Rust/Bevy
- **Fairness through architecture:** relay-owned clock, deterministic order validation, signed replay/result evidence
- **Game-agnostic core:** Red Alert first, Tiberian Dawn alongside it, more game modules as deferred module milestones in the execution overlay
- **Performance on real hardware:** classic 2D baseline remains playable without a dedicated gaming GPU; advanced Bevy visuals are optional

## Why Build This?

You already have OpenRA, CnCNet, and the Remastered Collection. Each one keeps classic C&C alive in its own way. So why build another?

Because **none of them are a platform for what comes next.**

The Remastered Collection is a faithful preservation — Windows-only, game logic open-sourced (GPL v3) but client and platform layer proprietary, no new mechanics, modding limited to what shipped. OpenRA is remarkable engineering that kept the community alive for 18 years, but deep changes require C#, campaigns are incomplete, and 135+ desync issues remain open. CnCNet is the glue holding online play together, but it's a compatibility layer, not an engine.

Iron Curtain is designed so anyone can **create with it, compete on it, and build communities around it** — on an engine designed to outlast any single organization.

The goal is simple: **make us fall in love again.**

## What You Get

**A creativity platform.** A full scenario editor, campaign editor, asset studio, and Workshop — not just map painting, but drag-and-drop mission design inspired by Operation Flashpoint and ArmA. Three modding tiers (YAML data, Lua scripting, WASM engine mods) with zero recompilation. Hot-reload everything. Optional LLM-generated missions and campaigns if you want them. Publish anything to the Workshop — maps, music, sprites, scripts, balance presets, full mods — each independently versioned with one-click install.

**A game that plays differently every time.** Branching campaigns where your choices change the story and surviving units carry over. Switchable balance presets, AI personalities, and pathfinding models — per lobby, not per mod. "Train Against" AI that mimics real players from their replays. Weather systems that change terrain. The same classic games you love, but with systems designed for replayability.

**New ways to play.** Beyond classic skirmish: Commander & SpecOps (one player commands the base, a teammate runs special ops on the ground), commander-avatar assassination variants, co-op survival modes, and World Domination — conquer a strategic map region by region with missions that react to how you actually played. These are built-in mode templates that modders can extend, not hardcoded game types.

**Performance you can feel.** No garbage collector means no random stutters. 500-unit battles smooth on a 2012 laptop. Zero allocation during gameplay. Runs on Windows, macOS, Linux, Steam Deck, browser, and mobile.

**Multiplayer that actually works.** The relay server owns the clock — lag switches and speed hacks are architecturally impossible. Fixed-point math means desyncs are diagnosable to the exact tick and unit. Ranked matchmaking, signed replays, sub-tick order fairness adapted from Counter-Strike 2. Anti-cheat without kernel drivers.

**Cross-engine bridges.** Import and replay OpenRA and Remastered Collection matches. Load existing OpenRA mods, maps, and assets directly. Play with friends on different engines through cross-engine compatibility modes (with clear trust labels for what's ranked-safe and what's experimental).

**A community that can't be shut down.** A single `ic-server` binary with toggleable capability flags handles relay, matchmaking, ranking, Workshop P2P seeding, and moderation. Federated architecture — communities mirror each other's content via P2P. Your identity is a 24-word recovery phrase, not an account on someone's server. Your player data lives in local SQLite files you own. No single point of failure. Built to survive.

**Open source, community governed.** GPL v3 engine with an explicit modding exception — your mods, your license. Community-elected governance, RFC process, modder reputation and recognition. Not a product. A platform.

## What Iron Curtain Offers

### Built for Performance

- Smooth gameplay even in large battles — no garbage collector, no random stutters, zero allocation during gameplay
- Deterministic simulation core — fixed-point math only (no floats in sim), snapshottable state for save/load, replay, desync analysis, and testing
- Pluggable netcode by trait — simulation and networking are separated by design (`ic-sim` and `ic-net` share only `ic-protocol`); swapping lockstep for rollback touches zero sim code
- Efficiency-first performance model: algorithms/cache/locality/LOD/amortization before parallelism
- No dedicated gaming GPU required — classic 2D path remains playable on low-end hardware; advanced Bevy visual features and 3D render modes stay optional
- Game-agnostic engine core — game modules register systems/pathfinding/spatial/render behavior. Bevy handles framework + rendering; engine logic stays clean
- Runs on Windows, macOS, Linux, Steam Deck, browser, and mobile

### Built for Competition

- Relay-first multiplayer — relay owns clock/time authority, sub-tick order fairness (adapted from Counter-Strike 2: if you clicked first, your order executes first), signed replay/result evidence, and stronger anti-lag-switch posture
- Anti-cheat through architecture — all orders validated deterministically inside the sim (all clients agree on invalid orders), no kernel drivers
- Tamper-proof replays signed with Ed25519 cryptography and relay-certified match results
- Ranked matchmaking with Glicko-2 ratings, seasonal rankings, map veto, and player profiles with cryptographically verified stats
- Tournament mode with caster view, broadcast delay, bracket integration, and replay archive
- "Train Against" mode — AI mimics a player's style from their replays; "Challenge My Weakness" targets your identified weaknesses
- Import and replay matches from OpenRA and the Remastered Collection — review builds, compare behavior, or convert replays to IC format for analysis
- Fair-play match controls — ready-check, pause, surrender, and in-match voting (kick griefers, remake broken games, mutual draw) with ranked abandon penalties and anti-abuse protections
- Cross-engine compatibility with trust labels — unified browser and replay interoperability first, then clearly labeled experimental live interop modes (`M7+`/`M11`; not all compatibility levels are ranked-safe)
- Long-term mixed-client vision (e.g. 2D vs 3D presentation of the same battle) constrained by fairness-preserving rules and host-mode trust labels

### Built for New Players

- Jump straight into a skirmish or run Commander School first — short missions that put you in command and let you figure things out by doing. Entirely optional; veterans skip it all
- Adaptive onboarding — the game picks up on what you already know and stops explaining things you've figured out. Cross-device prompts for desktop/touch/controller. No hand-holding, no wiki required

### Built for Campaigns and Game Modes

- All original campaigns fully playable with continuous flow — no exit-to-menu between missions
- Branching campaigns — your choices create different paths, surviving units carry over with persistent state, defeat continues the story
- Optional hero/toolkit campaigns (e.g., Tanya-style XP/skills/loadouts) as built-in authoring layers
- Advanced authored mission structures: map segment unlocks (phase-based expansion), sub-scenario portal micro-ops (interiors/infiltration), cinematic phase transitions/briefings
- Optional asymmetric mode templates (prototype-first, playtest-gated): **Commander & SpecOps**, commander-avatar/assassination variants, and experimental SpecOps survival modes
- Optional pacing layer (`Operational Momentum` / "one more phase") for Civ-like "one more turn" momentum in RTS mission pacing
- Switchable experience presets — balance, AI behavior, pathfinding feel, QoL, UI theme, and render mode all selectable per lobby. Toggle Classic/HD/3D graphics mid-game (F1, like the Remastered Collection)

### Built for Modding

- Your existing OpenRA mods, maps, sprites, and audio load directly — MiniYAML auto-converts at runtime, vocabulary aliases, and Lua API superset direction for mission compatibility
- Three modding tiers without ever recompiling: YAML for data, Lua for scripting, WASM for engine-level mods in any language
- Git-first SDK workflow — `Preview / Test / Validate / Publish`, optional advanced profiling (`Profile Playtest`), semantic-friendly content diffs, and local content overlay run mode for fast iteration
- SDK/editor stack: Scenario Editor, Campaign Editor, Asset Studio, Game Master mode, and built-in template systems for advanced scenarios and game modes
- Embedded authoring manual in the SDK (`F1` / `?` context help, offline docs snapshot, searchable reference for fields/flags/script APIs/CLI commands from one canonical source)
- Workshop for any asset type — music, sprites, maps, balance presets, script libraries, full mods — each independently versioned with semver dependencies. Join a game, missing content downloads via P2P automatically
- Reusable Lua script libraries publishable as Workshop resources — composable modding ecosystem instead of copy-paste
- Mod profiles — save a named set of mods + experience settings as a shareable YAML file with one-hash lobby verification, like a modpack you can hand to a friend
- Workshop-shareable player config profiles — controls/touch layouts/accessibility/HUD presets (local preference resources, not gameplay compatibility requirements)
- CI/CD publishing, beta/release channels, federated mirrors, Steam Workshop integration, offline bundles for LAN, and a full local content manager with auto-cleanup
- Hot-reload — change a value, see it in-game immediately

### Built for the Community

- In-game communication — push-to-talk voice chat, contextual pings (8 types + ping wheel), auto-translated chat wheel phrases, minimap drawing, and tactical markers. Voice optionally recorded in replays
- Unified command console — every action available as a `/` command. Developer overlay, cvar system, mod-registered commands via Lua/WASM, and Workshop-shareable `.iccmd` command scripts
- Your data is yours — all player data stored locally in open SQLite files anyone can query. 24-word recovery phrase restores your identity on any machine, no account server needed. `ic backup` CLI for full backup/restore
- Self-hostable unified `ic-server` binary with toggleable capabilities (relay, matchmaking, ranking, Workshop P2P seeding, moderation) — federated, no single point of failure. One `server_config.toml` configures ~200 parameters with deployment profiles for tournament, casual, competitive, and training setups
- Capability-scoped moderation, evidence-backed reports, and optional community review workflows
- Community contribution recognition (profile-only) — helpful-review badges, creator acknowledgements, and deferred optional `M11` cosmetic/profile rewards (never gameplay or ranked bonuses)
- Selective installs / content footprints — full install vs campaign-only vs multiplayer-only presets, optional media packs, and maintenance/repair flows via the content manager
- Localized from day one — all UI, menus, EVA lines, and subtitles are translatable. Community translations publishable to the Workshop; chat wheel phrases auto-translate across languages in multiplayer
- Open source, community governance, modder recognition with reputation and optional tipping

### Optional / Later-Phase Systems

- AI-generated missions — describe a scenario, get a playable mission. Generate branching campaigns where characters evolve, betray, and die based on your choices. World Domination mode lets you conquer a strategic map region by region, with missions that react to how you actually played. Built-in CPU models run locally after a one-time download (no account needed); connect your own LLM (cloud or local) for higher quality
- Switchable visual render modes / visual modding infrastructure (classic/HD/3D)
- Browser/mobile/Deck polish over the same platform-agnostic input/UI abstractions

## What Ships First (Execution-Oriented)

The project now has a dedicated implementation overlay (separate from the design roadmap) that sequences work by dependency and priority:

1. Resource loading + rendering fidelity (RA/OpenRA formats)
2. Deterministic sim core + replayable combat slice
3. Local playable skirmish
4. Minimal online skirmish (final netcode architecture, no full tracker/ranked dependency yet)
5. Campaign runtime vertical slice -> full campaigns
6. Creator foundation -> full SDK/editor platform

This keeps the project honest about what comes first while preserving the long-term platform vision.

If you want the full dependency-aware breakdown (what blocks what, what can run in parallel, and where optional systems land), use the implementation overlay link below.

📖 **[See everything Iron Curtain offers →](https://dk26.github.io/iron-curtain-design-docs/OVERVIEW.html)**
🗺️ **[See implementation milestones & dependency order →](https://dk26.github.io/iron-curtain-design-docs/18-PROJECT-TRACKER.html)**

## The Story Behind This

I've been a Red Alert fan since childhood — two kids on ancient computers playing over a LAN cable. That game didn't just hook me; it made me want to understand how computers work and how to build things like this myself.

I started learning to code at 12 (Pascal), worked my way through network engineering, backend development, and cyber defense, and eventually found Rust — a language that lets you build close to the hardware without the fear of C's footguns. Over the next five years I went deep: building backend systems in Rust, contributing to its open-source ecosystem, and making it my primary language. When I discovered OpenRA, I was thrilled the community had kept Red Alert alive — and the idea of writing an engine in Rust started taking root.

This project also lets me get hands-on experience in game dev and create and play with experimental ideas. I wasn't trying to replace OpenRA — I just wanted to test new technology and see what was possible. But the more I thought about the design, the more I realized it could serve the community. LLM agents matured into useful development tools, and that gave me the confidence to take on the full scope of what this project can become.

I chose Rust because I believe it's the best match for working with LLMs: the language has rules that make bugs and errors harder to create and easy to notice, while the LLM brings velocity to development with this amazing language. I see it as the future of LLM-made products, at least until AI is capable of creating binary executables without a single error in them.

My most formative gaming experience outside Red Alert was Operation Flashpoint — a game that gave you tools to create your own scenarios. That philosophy — games as platforms, not just products — is at the heart of this project.

📖 **[Read the full story →](https://dk26.github.io/iron-curtain-design-docs/FOREWORD.html)**

## How This Was Designed

Every major system was designed by studying real, working implementations — not by guessing.

The networking design alone analyzed the source code of 20+ open-source games and multiple academic papers. Four EA GPL codebases (Generals/Zero Hour, Remastered Collection, Red Alert, Tiberian Dawn), open-source RTS engines (OpenRA, 0 A.D., Spring Engine, Warzone 2100, OpenTTD, and more), and non-RTS references (Quake 3, Minetest, Veloren, Lichess). The same methodology applies to AI, pathfinding, modding, and the workshop.

Across the project: 76 design decisions with rationale and alternatives, 63 standalone research documents, 20+ codebases studied at the source code level, ~95,000 lines of design and research documentation — all built through 160+ commits of iterative refinement. The LLM accelerated the research; the human directed every question and made every decision.

📖 **[Read the methodology →](https://dk26.github.io/iron-curtain-design-docs/14-METHODOLOGY.html)**

## Project Status

📐 **Design phase** — architecture documents in progress, implementation not yet started.

📖 **[Read the full design documentation →](https://dk26.github.io/iron-curtain-design-docs/)**

🗺️ **[Implementation Milestones & Dependency Overlay →](https://dk26.github.io/iron-curtain-design-docs/18-PROJECT-TRACKER.html)** — execution order, priorities, and dependency-aware milestone planning (separate from the canonical roadmap)

## Contributing

This project is in its earliest stages. If you're interested in:

- **Rust game development** — the engine needs builders
- **RTS game design** — balancing, mechanics, mission design
- **C&C reverse engineering** — format parsing, behavior matching
- **Networking** — relay server, netcode models
- **AI/ML** — LLM mission generation, adaptive difficulty
- **Art** — HD sprites, effects, UI design

...we'd love to hear from you. Open an issue, start a discussion, or just say hello.

## Legal

### Trademarks

Red Alert, Tiberian Dawn, Command & Conquer, and C&C are trademarks of Electronic Arts Inc. Iron Curtain is an independent, community-driven project. It is **not** affiliated with, endorsed by, or sponsored by Electronic Arts Inc. or any of its subsidiaries. Trademark names are used solely to identify the games and formats that this engine is designed to be compatible with (nominative fair use).

### License

**Design documents** (everything in `src/` and `research/`) are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). You may share and adapt this material with attribution and share-alike.

**Engine source code** is licensed under [GPL v3](https://www.gnu.org/licenses/gpl-3.0.html) with an explicit modding exception (see [D051](https://dk26.github.io/iron-curtain-design-docs/09-DECISIONS.html)). The modding exception uses GPL v3 § 7 to clarify that YAML, Lua, and WASM mods loaded through the engine's data interfaces are NOT derivative works — modders choose their own license. Engine source modifications remain GPL v3.

### Disclaimer

Iron Curtain does not distribute any copyrighted game assets. It is designed to load assets from games you already own — the same approach used by OpenRA and other open-source game engine projects. Users must provide their own game files.

This project is provided "as is", without warranty of any kind, express or implied. See the applicable license for details.

## Acknowledgments

This project stands on the work of thousands of developers across decades of open-source game development.

**Electronic Arts and Westwood Studios** — for creating Red Alert and defining the RTS genre, and for releasing the source code of C&C Red Alert, Tiberian Dawn, Generals/Zero Hour, and the Remastered Collection under GPL v3. This gave the community access to the real engineering behind the games that started the genre. **Petroglyph Games**, founded by former Westwood developers, deserves particular thanks for their work on the Remastered Collection.

**The OpenRA team** — for over 18 years of keeping the Command & Conquer community alive. OpenRA proved that an open-source RTS engine can build a real, active community. Its trait system, mod ecosystem, and years of accumulated gameplay feedback are an invaluable resource. Iron Curtain exists because OpenRA proved this kind of project can work.

**Wildfire Games and the 0 A.D. community** — for over two decades of work on one of the most ambitious open-source games ever attempted.

**The Spring Engine community** — for building and maintaining an RTS engine that powers games like Beyond All Reason and Zero-K. Their SyncDebugger is a masterclass in desync diagnosis.

**The Warzone 2100 community** — for taking a 1999 commercial game, open-sourcing it, and maintaining it for over 20 years.

**The OpenTTD team** — for arguably the most mature open-source deterministic lockstep implementation in existence, refined over 20+ years.

**The Minetest / Luanti community** — for 15 years of running open servers and developing abuse prevention systems we adopted directly.

**id Software and the ioquake3 community** — for Quake 3's networking code, which established patterns still used across the industry 25 years later.

**The Veloren team** — for building the most architecturally relevant Rust multiplayer game we studied.

**TeamHypersomnia** — for the most sophisticated open-source rollback architecture we found anywhere.

**The DDraceNetwork community** — for real-world solutions to traffic monitoring and anti-abuse at scale across 200+ servers.

**The Space Wizards community (Space Station 14)** — for their per-component visibility system, the most relevant reference for anti-maphack architecture.

**The Fish Folk community** — for Jumpy and the Bones framework, practical Rust ECS rollback networking.

**The Wargus / Stratagus community** — for maintaining a general-purpose open-source RTS engine.

**The OpenBW contributors** — for a clean-room StarCraft: Brood War reimplementation.

**Lichess.org** — for open-sourcing the competitive infrastructure behind the largest free chess platform in the world. Special thanks to Thibault Duplessis and the Lichess community for proving that open-source competitive gaming at massive scale is possible.

**Chrono Divide** — for showing what a browser-based RTS can look like.

**Valve** — for publicly documenting the Counter-Strike 2 sub-tick processing model that inspired our order fairness system.

**The academic researchers** — Blake D. Bryant, Hossein Saiedian, Michael Buro, Chris Chambers and co-authors, and Jeff Yan and Brian Randell — for peer-reviewed work that grounded our threat model in science.

**The Bevy community** — for building the Rust game engine we needed.

**Frank Klepacki** — Hell March forever.

Every one of these projects represents years — in some cases decades — of hard work by people who chose to share what they built. This project is better because they did.

**Created by David Krasnitsky**

---

*"Kirov reporting."*
