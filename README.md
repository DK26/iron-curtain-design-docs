# ⚡ Iron Curtain


### A modern, open-source RTS engine built in Rust — starting with Command & Conquer.

*Red Alert first. Tiberian Dawn alongside it. The rest of the C&C family to follow.*

---

Iron Curtain is an open-source RTS engine built for the C&C community but designed to power any classic RTS. Starting with Red Alert and Tiberian Dawn as built-in game modules, with Red Alert 2, Tiberian Sun, and community-created games as future modules on the same engine. Not a port of OpenRA and not a remaster — a clean-sheet engine built in Rust on top of Bevy, designed to load existing OpenRA mods, maps, and assets while targeting performance, modding power, and platform reach that neither OpenRA nor the Remastered Collection can offer.

The engine core is game-agnostic. Pathfinding, spatial queries, rendering, and format loading are all behind pluggable traits — each game module provides its own implementations while sharing the simulation core, networking, modding infrastructure, workshop, competitive systems, replays, and save games.

> ⚠️ **This project is in design phase — no playable build exists yet.** The design documents are in active development. Implementation has not started.

## The Story Behind This

I've been a Red Alert fan since childhood — two kids on ancient computers playing over a LAN cable. That game didn't just hook me; it made me want to understand how computers work and how to build things like this myself.

I started learning to code at 12 (Pascal), worked my way through network engineering, backend development, and cyber defense, and eventually found Rust — a language that lets you build close to the hardware without the fear of C's footguns. Over the next five years I went deep: building backend systems in Rust, contributing to its open-source ecosystem, and making it my primary language. When I discovered OpenRA, I was thrilled the community had kept Red Alert alive — and the idea of writing an engine in Rust started taking root.

I wasn't trying to replace OpenRA — I just wanted to test new technology and see what was possible. But the more I thought about the design, the more I realized it could serve the community. Years later, LLM agents matured into useful development tools, and that gave me the confidence to take on the full scope of what this project has become.

My most formative gaming experience outside Red Alert was Operation Flashpoint — a game that gave you tools to create your own scenarios. That philosophy — games as platforms, not just products — is at the heart of this project.

📖 **[Read the full story →](https://dk26.github.io/iron-curtain-design-docs/FOREWORD.html)**

## Why This Exists

Red Alert defined the RTS genre in 1996. Three decades later, there are two ways to play it:

**The Remastered Collection** looks beautiful but has the same performance issues. The modding is limited. It only runs on Windows and Xbox. The original C++ engine source was released under GPL, but the remaster's networking and rendering layers are proprietary C#.

**OpenRA** is a remarkable community achievement — cross-platform, open source, actively developed for 18 years. But it's built on C#/.NET, and it shows: performance can feel off at random moments, desyncs are a persistent problem (135+ issues in their tracker), and deep modding requires writing C# against a large codebase.

Iron Curtain asks: *what if we kept everything OpenRA got right — the community, the mods, the maps, the cross-platform spirit — and rebuilt the engine with today's best tools?*

## Problems We Solve

These are the most commonly reported frustrations from the C&C community — sourced from OpenRA's issue tracker, competitive player feedback, modder forums, and the Remastered Collection's reception. Each one has a specific architectural answer.

| Problem                                                                                                                                                          | Our Answer                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Desyncs** — 135+ issues in OpenRA's tracker; sync buffer only 7 frames deep; root cause often undiagnosable                                                    | Per-tick state hashing pinpoints exact tick and entity of divergence; fixed-point math eliminates cross-platform float drift |
| **Random performance drops** — GC pauses, micro-stutters even at low unit counts; a stutter during a crucial micro moment loses games                            | Rust: zero garbage collector, zero per-tick allocation (invariant), cache-friendly ECS layout                                |
| **Deep modding requires C#** — total conversions need .NET toolchain, IDE, engine recompilation; high barrier limits modder pool                                 | YAML → Lua → WASM tiers — no recompilation ever; WASM accepts any language (Rust, C, Go, AssemblyScript)                     |
| **Campaigns incomplete** across all supported games — TD partially playable, Dune 2000 only 1 of 3 campaigns; no mission continuity, exit to menu between levels | All campaigns fully playable as a shipping requirement; branching paths with persistent units and veterancy (D021)           |
| **No competitive infrastructure** — no ranked matchmaking, no automated anti-cheat, no signed replays; competitive scene relies on community workarounds         | Glicko-2 ranked matchmaking, relay-certified match results, signed tamper-proof replays, tournament mode                     |
| **Platform limitations** — Remastered: Windows/Xbox only; OpenRA: desktop only                                                                                   | Windows, macOS, Linux, Steam Deck, browser (WASM), mobile — all planned targets                                              |
| **No mod distribution** — mods shared via forum posts and manual file copying; no discovery, no dependency management                                            | Workshop with in-game browser, auto-download on lobby join (CS:GO-style), semver dependencies, SHA-256 integrity             |
| **MiniYAML has no tooling** — custom format, no IDE support, no schema validation, no linting                                                                    | Standard YAML with `serde_yaml`; JSON Schema validation; IDE autocompletion works out of the box                             |
| **Balance debates split the community** — competitive rebalancing became permanent; no way to play with classic EA values                                        | Switchable presets: classic, OpenRA, Remastered — a lobby setting, not a mod (D019)                                          |
| **No hot-reload** — changing mod values requires game restart (YAML) or engine recompile (C#)                                                                    | YAML + Lua hot-reload during development; change a value, see it in-game immediately                                         |

## Design Goals

### 🎮 For Players

**Massive battles that don't stutter.** The engine is designed around efficiency — better algorithms, cache-friendly memory layout, zero garbage collection pauses. The target: a 2012 laptop with 2 cores handles 500-unit battles smoothly. Modern hardware should handle 2000+.

**Play everywhere.** Windows, macOS, Linux, Steam Deck, browser (via WebAssembly), and mobile are all planned targets.

**Better multiplayer.** A relay server architecture designed to eliminate lag switching, handle NAT traversal (no port forwarding), and provide desync detection that actually tells you what went wrong. Competitive play will get signed, tamper-proof replays.

**Switchable balance presets.** Choose between classic RA balance (EA source values), OpenRA balance, or Remastered balance in the lobby — not as a mod, as a game option.

**Optional AI-generated missions and campaigns (BYOLLM).** An in-game interface where you describe a scenario — "a desperate defense of a bridge against overwhelming Soviet armor with limited air support" — and an LLM generates a playable mission: terrain, objectives, enemy composition, triggers, briefing text. This requires you to bring your own LLM provider (local or cloud) — the engine never ships or requires one. Every feature works fully without it. This is a late-phase feature (Phase 7) that enhances the experience for players who opt in.

**Branching campaigns.** Non-linear campaign graphs with persistent state — unit rosters, veterancy, and equipment carry over between missions. Inspired by Operation Flashpoint's approach to scenario design.

### 🔧 For Modders

**Your OpenRA mods will work.** Iron Curtain is designed to load OpenRA's YAML rules, maps, sprite sheets, and audio. A migration tool will convert MiniYAML to standard YAML. MiniYAML also loads directly at runtime via auto-conversion. Your years of work won't be lost.

**Three tiers of modding power:**

| Tier      | Tool | Who It's For            | Example                                                   |
| --------- | ---- | ----------------------- | --------------------------------------------------------- |
| Data      | YAML | Everyone                | Change tank cost, add a new unit, tweak weapon stats      |
| Scripting | Lua  | Mission makers, modders | Custom mission triggers, unit abilities, AI behaviors     |
| Engine    | WASM | Power users             | New game mechanics, total conversions, custom pathfinding |

No C# required. No recompilation. WASM mods will run at near-native speed in a secure sandbox — they cannot access files, network, or memory they shouldn't.

**Workshop with dependency management.** A federated resource registry (inspired by crates.io and Artifactory) where any asset type — maps, sprites, music, balance patches, total conversions — can be published individually with semver dependencies and SHA-256 integrity checks. Community-hosted mirrors supported. No single point of failure.

**Scenario editor.** Create, test, and publish maps and missions without leaving the game — Operation Flashpoint / Arma 3 Eden-inspired in-engine editor (D038) with terrain painting, unit placement, visual triggers, waypoints, drag-and-drop logic modules, reusable compositions, Probability of Presence for replayability, Simple/Advanced mode, and a Zeus-inspired Game Master mode for live scenario manipulation.

### 🏗️ For Developers

**Rust from top to bottom.** Memory safety, fearless concurrency, no garbage collector. The simulation will be pure and deterministic — same inputs produce identical outputs on every platform, every time.

**Pluggable networking.** The simulation has zero knowledge of how orders arrive. Swap between lockstep, rollback, or relay by implementing a single trait. The game loop doesn't change.

**Bevy-powered.** Modern ECS architecture with automatic system scheduling, parallel queries, asset hot-reloading, and a massive ecosystem of plugins.

**Multi-game engine.** The engine core is game-agnostic. Red Alert is the default game module; Tiberian Dawn ships alongside it. RA2, Tiberian Sun, and community-created games are future modules on the same engine via a `GameModule` trait. Pathfinding (`Pathfinder` trait), spatial queries (`SpatialIndex` trait), rendering (`Renderable` trait), and camera (`ScreenToWorld` trait) are all pluggable — the architecture deliberately avoids closing doors on any classic RTS, including 3D games like Generals.

**Every crate designed to be useful standalone.** `ra-formats` will parse C&C file formats. `ic-protocol` will define the order system. `ic-sim` will run headless for AI training or automated testing. Use what you need.

## Comparison (Design Targets vs. Existing Options)

*Iron Curtain does not exist as a playable product yet. These comparisons show design targets, not shipped features.*

### vs. C&C Remastered Collection

|                     | Remastered Collection                                              | Iron Curtain (planned)                                                                      |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Graphics            | 4K remastered sprites                                              | Classic isometric sprites (HD asset support planned, visual enhancements possible via Bevy) |
| Platforms           | Windows, Xbox                                                      | Windows, macOS, Linux, Browser, Steam Deck, Mobile                                          |
| Multiplayer servers | Proprietary networking layer (not open-sourced)                    | Self-hostable relay servers, no single point of failure                                     |
| Modding             | Steam Workshop maps, limited mod API                               | YAML + Lua + WASM, total conversion capable                                                 |
| Source              | Original C++ engine GPL; remaster networking/rendering proprietary | Open source (license TBD)                                                                   |
| AI missions         | Fixed campaign only                                                | LLM-generated missions (Phase 7)                                                            |
| Engine              | Original C++ engine as DLL, called by proprietary C# client        | Modern Rust + Bevy                                                                          |
| Price               | $19.99                                                             | Free                                                                                        |

### vs. OpenRA

|                   | OpenRA                                               | Iron Curtain (planned)                                                     |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Language          | C# / .NET                                            | Rust (no GC, minimal runtime)                                              |
| Large battles     | Stutters at 300-500 units (community-reported)       | Targets 2000+ units via algorithmic efficiency                             |
| Desyncs           | Persistent problem (135+ tracked issues)             | Per-tick state hashing designed to pinpoint exact divergence               |
| Modding           | MiniYAML + C# (requires recompilation for deep mods) | Standard YAML + Lua + WASM (no recompilation ever)                         |
| Browser play      | Not possible                                         | WASM build planned (Phase 7)                                               |
| Networking        | TCP lockstep with server relay, static order latency | Relay server with time authority, lag-switch protection, sub-tick fairness |
| Map editor        | Standalone tool                                      | In-engine scenario editor with mission logic, triggers, modules (D038)     |
| AI content        | Hand-crafted campaigns                               | Hand-crafted + optional LLM-generated missions (BYOLLM)                    |
| Replays           | Full game recording and playback                     | Signed, tamper-proof, with desync diagnosis                                |
| Mod compatibility | Native format                                        | Loads OpenRA formats + provides migration tools                            |
| Community         | 18 years of maps, mods, servers                      | Designed for compatibility — shared server browser, same maps, same mods   |
| Maturity          | Stable, battle-tested                                | Design phase                                                               |

**What OpenRA got right (and we keep):** Cross-platform ethos, open source, community-driven, data-driven modding philosophy, trait-based unit composition, modernized UI conventions (attack-move, veterancy, fog of war, rally points). We aren't replacing the community — we're giving it a better engine.

### vs. the Original (1996)

Everything. But we love it, and the original game's assets, logic, and spirit are the foundation we build on. EA's GPL release of the original source code means we can study exactly how it worked and improve with full understanding.

## AI-Powered Mission Generation (Phase 7)

This is where the project aims to go beyond any existing Red Alert experience.

**Planned in-game mission generator** powered by LLM integration:

```
┌─────────────────────────────────────────────────┐
│  🎖️  Mission Briefing Generator                │
│                                                 │
│  Describe your scenario:                        │
│  ┌─────────────────────────────────────────┐    │
│  │ A covert Allied operation to destroy a  │    │
│  │ Soviet nuclear facility hidden in the   │    │
│  │ Ural mountains. Start with a small      │    │
│  │ commando team, steal a Soviet MCV to    │    │
│  │ establish a forward base.               │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Difficulty: ██████░░░░ Hard                    │
│  Map size:   Medium                             │
│  Factions:   Allies vs Soviet                   │
│                                                 │
│  [Generate Mission]  [Surprise Me]              │
└─────────────────────────────────────────────────┘
```

The LLM would generate:
- **Terrain and map layout** — mountains, rivers, base locations, chokepoints
- **Starting conditions** — your units, resources, tech level
- **Enemy composition and AI behavior** — defensive positions, patrol routes, attack timing
- **Mission objectives** — primary, secondary, bonus (Lua trigger scripts)
- **Briefing text and EVA voice-over cues** — in the style of the original campaigns
- **Difficulty scaling** — same scenario, different enemy strength and AI aggression

Generated missions are standard YAML + Lua — you can edit them, share them, learn from them. The LLM is a creative tool, not a black box.

**Future possibilities:**
- **Campaign generation** — connected multi-mission storylines with narrative arcs
- **Adaptive difficulty** — AI observes your playstyle and generates missions that challenge your weaknesses
- **Community sharing** — rate, remix, and share generated missions
- **Cooperative scenario design** — describe a scenario in chat, play it minutes later with friends

## Rendering

The core rendering goal is straightforward: **faithfully reproduce the classic Red Alert isometric look.** The same sprites, the same aesthetic, the same feel. HD sprite support is planned so modders can provide higher-resolution assets alongside the originals.

Because Iron Curtain builds on Bevy's rendering stack (which includes a full 2D and 3D pipeline via wgpu), modders will have access to capabilities far beyond the classic look — if they choose to use them:

- **Post-processing effects** — bloom, color grading, screen-space reflections on water
- **Dynamic lighting** — explosions illuminate nearby terrain and units, day/night cycles
- **Particle systems** — GPU-accelerated smoke, fire, debris, weather effects
- **Shader-based effects** — chrono-shift shimmer, iron curtain glow, tesla coil arcs, nuclear flash
- **3D rendering** — a Tier 3 (WASM) mod can replace the sprite renderer entirely with 3D models while the simulation remains unchanged
- **Smooth camera** — sub-pixel rendering, smooth zoom, cinematic replay camera

These are **modding possibilities enabled by the engine's architecture**, not development goals. The base game ships with the classic isometric aesthetic. Visual enhancements are content that modders and the community can build on top.

## Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Iron Curtain (ic-game)                         │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐             │
│  │ra-formats│  │  ic-sim  │  │ic-protocol│  │  ic-net  │             │
│  │          │  │          │  │           │  │          │             │
│  │.mix .shp │  │Determin- │  │PlayerOrder│  │Pluggable │             │
│  │.pal YAML │  │istic ECS │  │Timestamped│  │NetworkMod│             │
│  │MiniYAML  │  │FixedPoint│  │OrderCodec │  │Lockstep  │             │
│  │converter │  │Snapshot  │  │(SHARED)   │  │Relay     │             │
│  └──────────┘  └──────────┘  └───────────┘  │Rollback  │             │
│                                             └──────────┘             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ic-render │  │  ic-ui   │  │ ic-audio │  │ic-script │              │
│  │          │  │          │  │          │  │          │              │
│  │Bevy 2D   │  │Sidebar   │  │.aud play │  │Lua+WASM  │              │
│  │Isometric │  │Minimap   │  │EVA, music│  │Sandboxed │              │
│  │Shaders   │  │Build UI  │  │          │  │Modding   │              │
│  │PostFX    │  │          │  │          │  │          │              │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘              │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                            │
│  │  ic-ai   │  │  ic-llm  │  │ic-editor │                            │
│  │          │  │          │  │          │                            │
│  │Skirmish  │  │Mission   │  │Scenario  │                            │
│  │Campaign  │  │Generate  │  │Campaign  │                            │
│  │Scripted  │  │Adaptive  │  │GameMaster│                            │
│  └──────────┘  └──────────┘  └──────────┘                            │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │                  Bevy Engine (ECS + wgpu)                        ││
│  │         Scheduling · Rendering · Audio · Assets                  ││
│  └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

**Key architectural property:** `ic-sim` and `ic-net` never import from each other. They communicate only through `ic-protocol`, the shared boundary. The simulation is pure — it takes orders, produces state. It has no idea whether it's running single-player, networked, in a browser, headless for testing, or feeding an AI trainer.

## Resource Compatibility (Design Goal)

**Full compatibility with existing Red Alert and OpenRA resources is a core design goal.** None of this is implemented yet — these are the format targets for the `ra-formats` crate.

| Resource                                      | Target                                 | Phase |
| --------------------------------------------- | -------------------------------------- | ----- |
| OpenRA YAML rules (units, weapons, buildings) | Load directly, MiniYAML auto-converted | 0     |
| OpenRA maps (.oramap)                         | Load directly                          | 0     |
| OpenRA sprite sheets (.shp)                   | Parsed by ra-formats                   | 0     |
| OpenRA audio (.aud)                           | Parsed by ra-formats                   | 0     |
| Original .mix archives                        | Parsed by ra-formats                   | 0     |
| Original .pal palettes                        | Parsed by ra-formats                   | 0     |
| OpenRA mod packages                           | Migration tool (`ic mod import`)       | 0     |
| OpenRA server browser                         | Shared game listings via federation    | 5     |
| OpenRA replays                                | Viewable (not sim-identical)           | 5     |

If you've spent years building an OpenRA mod, Iron Curtain is designed to be your upgrade path — not a wall.

## How the Netcode Was Designed

Designing multiplayer networking for an RTS is hard. Getting it wrong means desyncs, lag, cheating, and frustrated players. Rather than guess, we did the research.

An LLM was used as a strict research tool — not to generate the design, but to systematically read and analyze the networking source code of over 20 open-source games and multiple academic papers. For each project, the LLM produced structured analyses: architecture breakdowns, protocol descriptions, vulnerability assessments, and cross-project comparisons. Every analysis was then reviewed, questioned, and verified by a human. The LLM accelerated comprehension across hundreds of thousands of lines of C, C++, Rust, Scala, and C# — the human made every design decision.

The full research is published in the `research/` directory. Here's what was studied:

**Electronic Arts GPL source releases** — Four EA codebases were analyzed: **C&C Generals/Zero Hour** (2003, the most sophisticated C&C networking code — adaptive run-ahead, delta-compressed wire format, packet router relay), **C&C Remastered Collection** (2020, Petroglyph Games — confirmed the original `OutList → DoList` order pipeline and integer math determinism), **C&C Red Alert** (1996, Westwood Studios — canonical gameplay values), and **C&C Tiberian Dawn** (1995, Westwood Studios — cross-reference for ambiguous behavior). All released under GPL v3.

**Valve's Counter-Strike 2** — CS2's publicly documented sub-tick processing model inspired the designed order fairness system. Two players acting in the same tick get their actions processed in the order they actually occurred.

**Open-source RTS engines** — **OpenRA** (18 years of community development — studied as both positive and negative reference), **0 A.D.** (Wildfire Games, 20+ years — dual-mode sync hashing, serialization testing), **Spring Engine** (powers Beyond All Reason and Zero-K — SyncDebugger binary search for desync diagnosis), **Warzone 2100** (open-sourced 2004, maintained 20+ years — Ed25519 identity, encrypted networking), **OpenBW** (clean-room StarCraft reimplementation — selective hashing, commit-reveal seeding), **Stratagus/Wargus** (general-purpose RTS engine — dual sync checks), **OpenTTD** (20+ years of mature deterministic lockstep — multi-level desync debugging, purity enforcement).

**Open-source non-RTS games** — **Minetest/Luanti** (15+ years — LagPool rate limiting that informed a core component of the security design), **Quake 3/ioquake3** (id Software — delta encoding and compression techniques from John Carmack), **Veloren** (Rust — closest architectural relative, transport abstraction), **Hypersomnia** (most sophisticated open-source rollback architecture found), **DDraceNetwork** (200+ servers — traffic monitoring, anti-abuse), **Space Station 14** (per-component visibility for anti-maphack), **Fish Folk Jumpy/Bones** (Rust ECS rollback networking), **Lichess** (100M+ games — matchmaking algorithms, dual AI anti-cheat, tournament scoring, Glicko-2 ratings), **Chrono Divide** (browser-based RTS — WASM target reference).

**Academic papers** — Bryant & Saiedian (2021, University of Kansas) on state saturation attacks and network architecture security; Buro (2002, University of Alberta) on hack-free RTS environments; Chambers et al. (2005) on information exposure in RTS; Yan & Randell (2005) on cheating classification.

Every major component of the netcode traces back to a real, working system. No single project had all the answers — the value was in studying enough of them to see which patterns emerge independently across unrelated codebases. Those are the patterns most likely to be correct.

### Beyond Netcode

The same research methodology applies to every major subsystem — not just netcode. The Workshop and P2P distribution design studied 13+ platforms (npm, Cargo, Nexus Mods, CurseForge, Steam Workshop, mod.io, Uber Kraken, Dragonfly, IPFS, and more). The AI system studied 7+ codebases (Spring Engine, 0 A.D., MicroRTS, Stratagus, and academic RTS AI research). The pathfinding design surveyed 6 engines. The development philosophy compiled 50+ sourced quotes from the original C&C creators.

Across the entire project: 50 recorded design decisions with rationale and alternatives, 19 standalone research documents, 20+ codebases studied at the source code level, ~35,000 lines of structured documentation — all built through 100+ commits of iterative refinement. The LLM accelerated the research; the human directed every question and made every decision. For the full methodology — how research is conducted, how the human-agent relationship works, and why this matters for quality — see [Chapter 14: Development Methodology](https://dk26.github.io/iron-curtain-design-docs/14-METHODOLOGY.html).

## Project Status

📐 **Design phase** — architecture documents in progress, implementation not yet started.

See the [design documents](https://dk26.github.io/iron-curtain-design-docs/) for the technical foundation:

| Document                                                                                      | Contents                                                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Foreword](https://dk26.github.io/iron-curtain-design-docs/FOREWORD.html)                     | Why this project exists — the personal story                        |
| [00-INDEX](https://dk26.github.io/iron-curtain-design-docs/00-INDEX.html)                     | Navigation and architectural invariants                             |
| [01-VISION](https://dk26.github.io/iron-curtain-design-docs/01-VISION.html)                   | Project goals and competitive landscape                             |
| [02-ARCHITECTURE](https://dk26.github.io/iron-curtain-design-docs/02-ARCHITECTURE.html)       | Core architecture, ECS, sim/render split                            |
| [03-NETCODE](https://dk26.github.io/iron-curtain-design-docs/03-NETCODE.html)                 | Pluggable networking, relay server, sub-tick ordering               |
| [04-MODDING](https://dk26.github.io/iron-curtain-design-docs/04-MODDING.html)                 | YAML + Lua + WASM modding tiers, workshop registry                  |
| [05-FORMATS](https://dk26.github.io/iron-curtain-design-docs/05-FORMATS.html)                 | File format support, original source insights                       |
| [06-SECURITY](https://dk26.github.io/iron-curtain-design-docs/06-SECURITY.html)               | Threat model and mitigations                                        |
| [07-CROSS-ENGINE](https://dk26.github.io/iron-curtain-design-docs/07-CROSS-ENGINE.html)       | OpenRA interop strategy                                             |
| [08-ROADMAP](https://dk26.github.io/iron-curtain-design-docs/08-ROADMAP.html)                 | 36-month development plan                                           |
| [09-DECISIONS](https://dk26.github.io/iron-curtain-design-docs/09-DECISIONS.html)             | Decision log with rationale (50 decisions)                          |
| [10-PERFORMANCE](https://dk26.github.io/iron-curtain-design-docs/10-PERFORMANCE.html)         | Efficiency-first performance philosophy                             |
| [11-OPENRA-FEATURES](https://dk26.github.io/iron-curtain-design-docs/11-OPENRA-FEATURES.html) | OpenRA feature catalog and gap analysis                             |
| [12-MOD-MIGRATION](https://dk26.github.io/iron-curtain-design-docs/12-MOD-MIGRATION.html)     | Mod migration case studies                                          |
| [13-PHILOSOPHY](https://dk26.github.io/iron-curtain-design-docs/13-PHILOSOPHY.html)           | Development philosophy and design review principles                 |
| [14-METHODOLOGY](https://dk26.github.io/iron-curtain-design-docs/14-METHODOLOGY.html)         | Development methodology, research rigor, AI-assisted design process |

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
