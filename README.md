# ⚡ Iron Curtain


### Red Alert, rebuilt from the ground up in Rust.

*The classic you remember. The engine you deserve. The future you get to shape.*

---

Iron Curtain is an open-source RTS engine that brings Command & Conquer: Red Alert into the modern era — not as a remaster with a fresh coat of paint, but as a complete reimagination of what the engine can be. Built in Rust on top of Bevy, it loads your existing OpenRA mods, maps, and assets while delivering performance, modding power, and platform reach that neither OpenRA nor the Remastered Collection can offer.

> ⚠️ Design in progress...

## Why This Exists

Red Alert defined the RTS genre in 1996. Three decades later, there are two ways to play it:

**The Remastered Collection** looks beautiful but changes almost nothing under the hood. The servers are struggling. The modding is limited. It only runs on Windows and Xbox. The engine is closed source.

**OpenRA** is a remarkable community achievement — cross-platform, open source, actively developed for 18 years. But it's built on C#/.NET, and it shows: large battles stutter, desyncs are common and nearly impossible to debug, and deep modding requires writing C# against an aging codebase.

Iron Curtain asks: *what if we kept everything OpenRA got right — the community, the mods, the maps, the cross-platform spirit — and rebuilt the engine with today's best tools?*

## What You Get

### 🎮 For Players

**Massive battles that don't stutter.** The engine is designed around efficiency — better algorithms, cache-friendly memory layout, zero garbage collection pauses. A 2012 laptop with 2 cores runs 500-unit battles smoothly. Modern hardware handles thousands of units without breaking a sweat.

**Play everywhere.** Native on Windows, macOS, Linux. In the browser via WebAssembly. On Steam Deck. On mobile (planned). You and your friends don't need the same platform.

**Better multiplayer.** A relay server architecture eliminates lag switching, handles NAT traversal (no port forwarding), and provides desync detection that actually tells you what went wrong. Competitive play gets signed, tamper-proof replays.

**AI-generated missions and campaigns.** An in-game interface lets you describe a scenario — "a desperate defense of a bridge against overwhelming Soviet armor with limited air support" — and an LLM generates a playable mission: terrain, objectives, enemy composition, triggers, briefing text. Infinite replayability beyond what any hand-crafted campaign can offer.

### 🔧 For Modders

**Your OpenRA mods just work.** Iron Curtain loads OpenRA's YAML rules, maps, sprite sheets, and audio. A migration tool converts MiniYAML to standard YAML. Your years of work aren't lost.

**Three tiers of modding power:**

| Tier      | Tool | Who It's For            | Example                                                   |
| --------- | ---- | ----------------------- | --------------------------------------------------------- |
| Data      | YAML | Everyone                | Change tank cost, add a new unit, tweak weapon stats      |
| Scripting | Lua  | Mission makers, modders | Custom mission triggers, unit abilities, AI behaviors     |
| Engine    | WASM | Power users             | New game mechanics, total conversions, custom pathfinding |

No C# required. No recompilation. WASM mods run at near-native speed in a secure sandbox — they literally cannot access files, network, or memory they shouldn't.

**In-engine map editor.** Create, test, and publish maps without leaving the game. Hot-reload your changes instantly.

### 🏗️ For Developers

**Rust from top to bottom.** Memory safety, fearless concurrency, no garbage collector. The simulation is pure and deterministic — same inputs produce identical outputs on every platform, every time.

**Pluggable networking.** The simulation has zero knowledge of how orders arrive. Swap between lockstep, rollback, client-server, or your own custom model by implementing a single trait. The game loop doesn't change.

**Bevy-powered.** Modern ECS architecture with automatic system scheduling, parallel queries, asset hot-reloading, and a massive ecosystem of plugins. Custom render passes and SIMD for the hot paths that need them.

**Every crate is useful standalone.** `ra-formats` parses C&C file formats. `ra-protocol` defines the order system. `ra-sim` runs headless for AI training or automated testing. Use what you need.

## Comparison

### vs. C&C Remastered Collection

|                     | Remastered Collection                                  | Iron Curtain                                                                          |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Graphics            | 4K remastered sprites                                  | OpenRA sprites + Bevy rendering pipeline (shaders, post-processing, HD asset support) |
| Platforms           | Windows, Xbox                                          | Windows, macOS, Linux, Browser, Steam Deck, Mobile (planned)                          |
| Multiplayer servers | Community reports severe instability                   | Self-hostable relay servers, no single point of failure                               |
| Modding             | Steam Workshop maps, limited mod API                   | YAML + Lua + WASM, total conversion capable                                           |
| Source              | Closed (original source released separately under GPL) | Fully open source                                                                     |
| AI missions         | Fixed campaign only                                    | LLM-generated missions with infinite variety                                          |
| Engine              | Original C++ engine with compatibility patches         | Modern Rust + Bevy, built for the next decade                                         |
| Price               | $19.99                                                 | Free                                                                                  |

### vs. OpenRA

|                   | OpenRA                                               | Iron Curtain                                                               |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Language          | C# / .NET                                            | Rust (no GC, no runtime overhead)                                          |
| Large battles     | Stutters at 300-500 units (community-reported)       | Targets 2000+ units via algorithmic efficiency                             |
| Desyncs           | Common, nearly impossible to debug                   | Per-tick state hashing pinpoints exact divergence                          |
| Modding           | MiniYAML + C# (requires recompilation for deep mods) | Standard YAML + Lua + WASM (no recompilation ever)                         |
| Browser play      | Not possible                                         | WASM build, playable in browser                                            |
| Networking        | Basic lockstep, desyncs common                       | Relay server with time authority, lag-switch protection, sub-tick fairness |
| Map editor        | Standalone tool (recently revamped)                  | In-engine editor with live preview                                         |
| AI content        | Hand-crafted campaigns                               | Hand-crafted + LLM-generated missions                                      |
| Replays           | Basic recording                                      | Signed, tamper-proof, diagnosable                                          |
| Mod compatibility | Native format                                        | Loads OpenRA formats + provides migration tools                            |
| Community         | 18 years of maps, mods, servers                      | Compatible — shared server browser, same maps, same mods                   |
| Maturity          | Stable, battle-tested                                | In development                                                             |

**What OpenRA got right (and we keep):** Cross-platform ethos, open source, community-driven, data-driven modding philosophy, trait-based unit composition, modernized UI conventions (attack-move, veterancy, fog of war, rally points). We aren't replacing the community — we're giving it a better engine.

### vs. the Original (1996)

Everything. But we love it, and the original game's assets, logic, and spirit are the foundation we build on. EA's GPL release of the original source code means we can study exactly how it worked and improve with full understanding.

## AI-Powered Mission Generation

This is where the project goes beyond any existing Red Alert experience.

**In-game mission generator** powered by LLM integration:

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

The LLM generates:
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

Building on Bevy opens up visual possibilities that neither OpenRA (SDL/OpenGL) nor the Remastered Collection's fixed pipeline can match:

- **Post-processing effects** — bloom, color grading, screen-space reflections on water
- **Dynamic lighting** — explosions illuminate nearby terrain and units, day/night cycles
- **Particle systems** — GPU-accelerated smoke, fire, debris, weather effects
- **Shader-based effects** — chrono-shift shimmer, iron curtain glow, tesla coil arcs, nuclear flash
- **HD asset pipeline** — support for high-resolution sprite sheets alongside classic assets
- **Smooth camera** — sub-pixel rendering, smooth zoom, cinematic replay camera

All of this while maintaining the classic isometric aesthetic. The game should look like Red Alert remembered through rose-tinted glasses — not photorealistic, but *better than you remember.*

## Architecture at a Glance

```
┌──────────────────────────────────────────────────────────┐
│                     Iron Curtain                         │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ra-formats│  │ ra-sim   │  │  ra-net  │  │ra-script│ │
│  │          │  │          │  │          │  │         │ │
│  │.mix .shp │  │Determin- │  │Pluggable │  │Lua+WASM │ │
│  │.pal YAML │  │istic ECS │  │NetworkMod│  │Sandboxed│ │
│  │MiniYAML  │  │FixedPoint│  │Lockstep  │  │Modding  │ │
│  │converter │  │Snapshot  │  │Relay     │  │         │ │
│  └──────────┘  └──────────┘  │Rollback  │  └─────────┘ │
│                              └──────────┘               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ra-render │  │  ra-ui   │  │  ra-ai   │  │ ra-llm  │ │
│  │          │  │          │  │          │  │         │ │
│  │Bevy 2D   │  │Sidebar   │  │Skirmish  │  │Mission  │ │
│  │Isometric │  │Minimap   │  │Campaign  │  │Generate │ │
│  │Shaders   │  │Build UI  │  │Scripted  │  │Adaptive │ │
│  │PostFX    │  │Editor    │  │          │  │         │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │              Bevy Engine (ECS + wgpu)                ││
│  │     Scheduling · Rendering · Audio · Assets          ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

**Key property:** The simulation is pure. It takes orders, produces state. It has no idea whether it's running single-player, networked, in a browser, headless for testing, or feeding an AI trainer. Everything else plugs in around it.

## Resource Compatibility

**Full compatibility with existing Red Alert and OpenRA resources is a core goal.**

| Resource                                      | Status                                   |
| --------------------------------------------- | ---------------------------------------- |
| OpenRA YAML rules (units, weapons, buildings) | ✅ Load directly, MiniYAML auto-converted |
| OpenRA maps (.oramap)                         | ✅ Load directly                          |
| OpenRA sprite sheets (.shp)                   | ✅ Parsed by ra-formats                   |
| OpenRA audio                                  | ✅ Parsed by ra-formats                   |
| Original .mix archives                        | ✅ Parsed by ra-formats                   |
| Original .pal palettes                        | ✅ Parsed by ra-formats                   |
| OpenRA mod packages                           | ✅ Migration tool provided                |
| OpenRA server browser                         | 🔄 Shared game listings (planned)         |
| OpenRA replays                                | 🔄 Viewable (not sim-identical, planned)  |

If you've spent years building an OpenRA mod, Iron Curtain is your upgrade path — not a wall.

## Project Status

📐 **Design phase** — architecture documents finalized, implementation beginning.

See the [design documents](src/) for the complete technical foundation:

| Document                                  | Contents                                              |
| ----------------------------------------- | ----------------------------------------------------- |
| [00-INDEX](src/00-INDEX.md)               | Navigation and architectural invariants               |
| [01-VISION](src/01-VISION.md)             | Project goals and competitive landscape               |
| [02-ARCHITECTURE](src/02-ARCHITECTURE.md) | Core architecture, ECS, sim/render split              |
| [03-NETCODE](src/03-NETCODE.md)           | Pluggable networking, relay server, sub-tick ordering |
| [04-MODDING](src/04-MODDING.md)           | YAML + Lua + WASM modding tiers                       |
| [05-FORMATS](src/05-FORMATS.md)           | File format support, original source insights         |
| [06-SECURITY](src/06-SECURITY.md)         | Threat model and mitigations                          |
| [07-CROSS-ENGINE](src/07-CROSS-ENGINE.md) | OpenRA interop strategy                               |
| [08-ROADMAP](src/08-ROADMAP.md)           | 36-month development plan                             |
| [09-DECISIONS](src/09-DECISIONS.md)       | Decision log with rationale                           |
| [10-PERFORMANCE](src/10-PERFORMANCE.md)   | Efficiency-first performance philosophy               |

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

[TBD — GPL v3 to match EA's source release is under consideration]

## Acknowledgments

- **Westwood Studios** — for creating Red Alert and defining the RTS genre
- **Electronic Arts** — for releasing the original source code under GPL v3
- **The OpenRA team** — 18 years of brilliant community engineering that we build upon and respect
- **The Bevy community** — for building the Rust game engine we needed
- **Frank Klepacki** — Hell March forever

---

*"Kirov reporting."*
