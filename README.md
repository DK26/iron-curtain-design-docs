# ⚡ Iron Curtain


### Red Alert, rebuilt from the ground up in Rust.

*The classic you remember. The engine you deserve. The future you get to shape.*

---

Iron Curtain is an open-source RTS engine designed to bring Command & Conquer: Red Alert into the modern era — not as a remaster with a fresh coat of paint, but as a complete reimagination of what the engine can be. Built in Rust on top of Bevy, it will load your existing OpenRA mods, maps, and assets while targeting performance, modding power, and platform reach that neither OpenRA nor the Remastered Collection can offer.

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

**Map editor.** Create, test, and publish maps without leaving the game, with live preview and hot-reload. (Architecture — in-engine vs. separate process — is still under evaluation.)

### 🏗️ For Developers

**Rust from top to bottom.** Memory safety, fearless concurrency, no garbage collector. The simulation will be pure and deterministic — same inputs produce identical outputs on every platform, every time.

**Pluggable networking.** The simulation has zero knowledge of how orders arrive. Swap between lockstep, rollback, or relay by implementing a single trait. The game loop doesn't change.

**Bevy-powered.** Modern ECS architecture with automatic system scheduling, parallel queries, asset hot-reloading, and a massive ecosystem of plugins.

**Multi-game engine.** The engine core is game-agnostic. Red Alert is the first game module; Tiberian Dawn, RA2, and original games are future modules on the same engine via a `GameModule` trait.

**Every crate designed to be useful standalone.** `ra-formats` will parse C&C file formats. `ra-protocol` will define the order system. `ra-sim` will run headless for AI training or automated testing. Use what you need.

## Comparison (Design Targets vs. Existing Options)

*Iron Curtain does not exist as a playable product yet. These comparisons show design targets, not shipped features.*

### vs. C&C Remastered Collection

|                     | Remastered Collection                                              | Iron Curtain (planned)                                                                |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Graphics            | 4K remastered sprites                                              | OpenRA sprites + Bevy rendering pipeline (shaders, post-processing, HD asset support) |
| Platforms           | Windows, Xbox                                                      | Windows, macOS, Linux, Browser, Steam Deck, Mobile                                    |
| Multiplayer servers | Proprietary networking layer (not open-sourced)                    | Self-hostable relay servers, no single point of failure                               |
| Modding             | Steam Workshop maps, limited mod API                               | YAML + Lua + WASM, total conversion capable                                           |
| Source              | Original C++ engine GPL; remaster networking/rendering proprietary | Open source (license TBD)                                                             |
| AI missions         | Fixed campaign only                                                | LLM-generated missions (Phase 7)                                                      |
| Engine              | Original C++ engine as DLL, called by proprietary C# client        | Modern Rust + Bevy                                                                    |
| Price               | $19.99                                                             | Free                                                                                  |

### vs. OpenRA

|                   | OpenRA                                               | Iron Curtain (planned)                                                     |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Language          | C# / .NET                                            | Rust (no GC, minimal runtime)                                              |
| Large battles     | Stutters at 300-500 units (community-reported)       | Targets 2000+ units via algorithmic efficiency                             |
| Desyncs           | Persistent problem (135+ tracked issues)             | Per-tick state hashing designed to pinpoint exact divergence               |
| Modding           | MiniYAML + C# (requires recompilation for deep mods) | Standard YAML + Lua + WASM (no recompilation ever)                         |
| Browser play      | Not possible                                         | WASM build planned (Phase 7)                                               |
| Networking        | TCP lockstep with server relay, static order latency | Relay server with time authority, lag-switch protection, sub-tick fairness |
| Map editor        | Standalone tool                                      | In-engine editor with live preview (architecture TBD)                      |
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

## Bevy Rendering Capabilities

Building on Bevy will open up visual possibilities beyond what OpenRA or the Remastered Collection currently offer:

- **Post-processing effects** — bloom, color grading, screen-space reflections on water
- **Dynamic lighting** — explosions illuminate nearby terrain and units, day/night cycles
- **Particle systems** — GPU-accelerated smoke, fire, debris, weather effects
- **Shader-based effects** — chrono-shift shimmer, iron curtain glow, tesla coil arcs, nuclear flash
- **HD asset pipeline** — support for high-resolution sprite sheets alongside classic assets
- **Smooth camera** — sub-pixel rendering, smooth zoom, cinematic replay camera

All of this while maintaining the classic isometric aesthetic. The game should look like Red Alert remembered through rose-tinted glasses — not photorealistic, but *better than you remember.*

## Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Iron Curtain (ra-game)                         │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐             │
│  │ra-formats│  │ ra-sim   │  │ra-protocol│  │  ra-net  │             │
│  │          │  │          │  │           │  │          │             │
│  │.mix .shp │  │Determin- │  │PlayerOrder│  │Pluggable │             │
│  │.pal YAML │  │istic ECS │  │Timestamped│  │NetworkMod│             │
│  │MiniYAML  │  │FixedPoint│  │OrderCodec │  │Lockstep  │             │
│  │converter │  │Snapshot  │  │(SHARED)   │  │Relay     │             │
│  └──────────┘  └──────────┘  └───────────┘  │Rollback  │             │
│                                             └──────────┘             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ra-render │  │  ra-ui   │  │ ra-audio │  │ra-script │              │
│  │          │  │          │  │          │  │          │              │
│  │Bevy 2D   │  │Sidebar   │  │.aud play │  │Lua+WASM  │              │
│  │Isometric │  │Minimap   │  │EVA, music│  │Sandboxed │              │
│  │Shaders   │  │Build UI  │  │          │  │Modding   │              │
│  │PostFX    │  │          │  │          │  │          │              │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘              │
│                                                                      │
│  ┌──────────┐  ┌──────────┐                                          │
│  │  ra-ai   │  │  ra-llm  │                                          │
│  │          │  │          │                                          │
│  │Skirmish  │  │Mission   │                                          │
│  │Campaign  │  │Generate  │                                          │
│  │Scripted  │  │Adaptive  │                                          │
│  └──────────┘  └──────────┘                                          │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │                  Bevy Engine (ECS + wgpu)                        ││
│  │         Scheduling · Rendering · Audio · Assets                  ││
│  └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

**Key architectural property:** `ra-sim` and `ra-net` never import from each other. They communicate only through `ra-protocol`, the shared boundary. The simulation is pure — it takes orders, produces state. It has no idea whether it's running single-player, networked, in a browser, headless for testing, or feeding an AI trainer.

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

## Project Status

📐 **Design phase** — architecture documents in progress, implementation not yet started.

See the [design documents](https://dk26.github.io/iron-curtain-design-docs/) for the technical foundation:

| Document                                                                                      | Contents                                              |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [Foreword](https://dk26.github.io/iron-curtain-design-docs/FOREWORD.html)                     | Why this project exists — the personal story          |
| [00-INDEX](https://dk26.github.io/iron-curtain-design-docs/00-INDEX.html)                     | Navigation and architectural invariants               |
| [01-VISION](https://dk26.github.io/iron-curtain-design-docs/01-VISION.html)                   | Project goals and competitive landscape               |
| [02-ARCHITECTURE](https://dk26.github.io/iron-curtain-design-docs/02-ARCHITECTURE.html)       | Core architecture, ECS, sim/render split              |
| [03-NETCODE](https://dk26.github.io/iron-curtain-design-docs/03-NETCODE.html)                 | Pluggable networking, relay server, sub-tick ordering |
| [04-MODDING](https://dk26.github.io/iron-curtain-design-docs/04-MODDING.html)                 | YAML + Lua + WASM modding tiers, workshop registry    |
| [05-FORMATS](https://dk26.github.io/iron-curtain-design-docs/05-FORMATS.html)                 | File format support, original source insights         |
| [06-SECURITY](https://dk26.github.io/iron-curtain-design-docs/06-SECURITY.html)               | Threat model and mitigations                          |
| [07-CROSS-ENGINE](https://dk26.github.io/iron-curtain-design-docs/07-CROSS-ENGINE.html)       | OpenRA interop strategy                               |
| [08-ROADMAP](https://dk26.github.io/iron-curtain-design-docs/08-ROADMAP.html)                 | 36-month development plan                             |
| [09-DECISIONS](https://dk26.github.io/iron-curtain-design-docs/09-DECISIONS.html)             | Decision log with rationale (33 decisions)            |
| [10-PERFORMANCE](https://dk26.github.io/iron-curtain-design-docs/10-PERFORMANCE.html)         | Efficiency-first performance philosophy               |
| [11-OPENRA-FEATURES](https://dk26.github.io/iron-curtain-design-docs/11-OPENRA-FEATURES.html) | OpenRA feature catalog and gap analysis               |
| [12-MOD-MIGRATION](https://dk26.github.io/iron-curtain-design-docs/12-MOD-MIGRATION.html)     | Mod migration case studies                            |

## Contributing

This project is in its earliest stages. If you're interested in:

- **Rust game development** — the engine needs builders
- **RTS game design** — balancing, mechanics, mission design
- **C&C reverse engineering** — format parsing, behavior matching
- **Networking** — relay server, netcode models
- **AI/ML** — LLM mission generation, adaptive difficulty
- **Art** — HD sprites, effects, UI design

...we'd love to hear from you. Open an issue, start a discussion, or just say hello.

## License

[TBD — GPL v3, MIT, and Apache 2.0 are under consideration]

## Acknowledgments

- **Westwood Studios** — for creating Red Alert and defining the RTS genre
- **Electronic Arts** — for releasing the original source code under GPL v3
- **The OpenRA team** — 18 years of brilliant community engineering that we build upon and respect
- **The Bevy community** — for building the Rust game engine we needed
- **Frank Klepacki** — Hell March forever

**Created by David Krasnitsky**

---

*"Kirov reporting."*
