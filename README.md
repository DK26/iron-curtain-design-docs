# ⚡ Iron Curtain


### A modern, open-source RTS engine built in Rust — starting with Command & Conquer.

*Red Alert first. Tiberian Dawn alongside it. The rest of the C&C family to follow.*

---

Iron Curtain is a new open-source RTS engine built for the C&C community. Not a port of OpenRA and not a remaster — a clean-sheet engine built in Rust on Bevy, designed to load your existing OpenRA mods, maps, and assets while delivering better performance, deeper modding, and competitive multiplayer.

> ⚠️ **This project is in design phase — no playable build exists yet.** The design documents are in active development. Implementation has not started.

### Built for Performance

- Smooth gameplay even in large battles — no garbage collector, no random stutters, zero allocation during gameplay
- Runs on Windows, macOS, Linux, Steam Deck, browser, and mobile
- Multiplayer that stays in sync — fixed-point math eliminates cross-platform drift; when something goes wrong, the engine pinpoints exactly what diverged
- Sub-tick order fairness adapted from Counter-Strike 2 — if you clicked first, your order executes first

### Built for Competition

- Ranked matchmaking with Glicko-2 ratings, seasonal rankings, map veto, and player profiles with cryptographically verified stats
- Anti-cheat through architecture — relay server owns the clock, all orders validated deterministically, no kernel drivers
- Tamper-proof replays signed with Ed25519 cryptography and relay-certified match results
- Tournament mode with caster view, broadcast delay, bracket integration, and replay archive
- "Train Against" mode — AI mimics a player's style from their replays; "Challenge My Weakness" targets your identified weaknesses
- Import and replay matches from OpenRA and the Remastered Collection — review builds, compare behavior, or convert replays to IC format for analysis
- Fair-play match controls — ready-check, pause, surrender, and in-match voting (kick griefers, remake broken games, mutual draw) with ranked abandon penalties and anti-abuse protections

### Built for Modding

- Your existing OpenRA mods, maps, sprites, and audio load directly — MiniYAML auto-converts at runtime
- Three modding tiers without ever recompiling: YAML for data, Lua for scripting, WASM for engine-level mods in any language
- Full scenario editor with visual triggers, drag-and-drop logic modules, Game Master mode, and an asset studio
- Workshop for any asset type — music, sprites, maps, balance presets, script libraries, full mods — each independently versioned with semver dependencies. Join a game, missing content downloads via P2P automatically
- Reusable Lua script libraries publishable as Workshop resources — composable modding ecosystem instead of copy-paste
- CI/CD publishing, beta/release channels, federated mirrors, Steam Workshop integration, offline bundles for LAN, and a full local content manager with auto-cleanup
- Hot-reload — change a value, see it in-game immediately

### Built for the Community

- All original campaigns fully playable with continuous flow — no exit-to-menu between missions
- Branching campaigns — your choices create different paths, surviving units carry over, defeat continues the story
- Switchable experience presets — balance, AI behavior, pathfinding feel, QoL, UI theme, and render mode all selectable per lobby. Toggle Classic/HD/3D graphics mid-game (F1, like the Remastered Collection)
- In-game communication — push-to-talk voice chat, contextual pings (8 types + ping wheel), auto-translated chat wheel phrases, minimap drawing, and tactical markers. Voice optionally recorded in replays
- Unified command console — `/` prefix routes commands through a type-safe command tree. Developer overlay, cvar system, mod-registered commands via Lua/WASM, and Workshop-shareable `.iccmd` command scripts
- Self-hostable relay, matchmaking, and workshop servers — federated, no single point of failure
- Open source, community governance, modder recognition with reputation and optional tipping
- Optional AI-generated missions and campaigns (BYOLLM) — describe a scenario, get a playable mission; or generate an entire branching campaign with recurring characters who evolve, betray, and die based on your choices. World Domination mode lets you conquer a strategic map region by region. Missions react to how you actually played — the LLM reads your battle report and adapts. Mid-mission radar comms, RPG-style dialogue choices, and cinematic moments are all generated. Every output is standard YAML + Lua, fully playable without the LLM after creation. Built-in mission templates provide a fallback without any LLM at all. Bring your own LLM; the engine never requires one

📖 **[See everything Iron Curtain offers →](https://dk26.github.io/iron-curtain-design-docs/OVERVIEW.html)**

## The Story Behind This

I've been a Red Alert fan since childhood — two kids on ancient computers playing over a LAN cable. That game didn't just hook me; it made me want to understand how computers work and how to build things like this myself.

I started learning to code at 12 (Pascal), worked my way through network engineering, backend development, and cyber defense, and eventually found Rust — a language that lets you build close to the hardware without the fear of C's footguns. Over the next five years I went deep: building backend systems in Rust, contributing to its open-source ecosystem, and making it my primary language. When I discovered OpenRA, I was thrilled the community had kept Red Alert alive — and the idea of writing an engine in Rust started taking root.

I wasn't trying to replace OpenRA — I just wanted to test new technology and see what was possible. But the more I thought about the design, the more I realized it could serve the community. Years later, LLM agents matured into useful development tools, and that gave me the confidence to take on the full scope of what this project has become.

My most formative gaming experience outside Red Alert was Operation Flashpoint — a game that gave you tools to create your own scenarios. That philosophy — games as platforms, not just products — is at the heart of this project.

📖 **[Read the full story →](https://dk26.github.io/iron-curtain-design-docs/FOREWORD.html)**

## How This Was Designed

Every major system was designed by studying real, working implementations — not by guessing.

The networking design alone analyzed the source code of 20+ open-source games and multiple academic papers. Four EA GPL codebases (Generals/Zero Hour, Remastered Collection, Red Alert, Tiberian Dawn), open-source RTS engines (OpenRA, 0 A.D., Spring Engine, Warzone 2100, OpenTTD, and more), and non-RTS references (Quake 3, Minetest, Veloren, Lichess). The same methodology applies to AI, pathfinding, modding, and the workshop.

Across the project: 60 design decisions with rationale and alternatives, 31 standalone research documents, 20+ codebases studied at the source code level, ~55,000 lines of structured documentation — all built through 115+ commits of iterative refinement. The LLM accelerated the research; the human directed every question and made every decision.

📖 **[Read the methodology →](https://dk26.github.io/iron-curtain-design-docs/14-METHODOLOGY.html)**

## Project Status

📐 **Design phase** — architecture documents in progress, implementation not yet started.

📖 **[Read the full design documentation →](https://dk26.github.io/iron-curtain-design-docs/)**

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
