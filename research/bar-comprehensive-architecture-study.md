# Beyond All Reason (BAR) — Comprehensive Architecture Study

> **Purpose:** Deep technical analysis of BAR's engine architecture, networking, modding, community infrastructure, asset pipeline, strengths, and pain points — with actionable lessons for Iron Curtain.
>
> **Date:** 2026-02-25
> **Status:** Exploratory research (broad architecture study)
> **Complements:** `bar-recoil-source-study.md` (narrow process/tooling lessons), `spring-engine-netcode-analysis.md` (deep netcode source study)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Engine Architecture](#2-engine-architecture)
3. [Networking Model](#3-networking-model)
4. [Modding System](#4-modding-system)
5. [Community Infrastructure](#5-community-infrastructure)
6. [Build and Asset Pipeline](#6-build-and-asset-pipeline)
7. [What BAR Does Well](#7-what-bar-does-well)
8. [Known Pain Points](#8-known-pain-points)
9. [Actionable Lessons for Iron Curtain](#9-actionable-lessons-for-iron-curtain)

---

## 1. Project Overview

Beyond All Reason (BAR) is an open-source RTS game built on the **Recoil engine**, a hard fork of the Spring RTS engine from the 105.0 branch. As of early 2025, BAR has surpassed 10,000 daily active users and 2,200 concurrent players, with 43,000 Discord members. The project has 2.8k GitHub stars and 267+ contributors.

**Key facts:**
- Engine: Recoil (C++ 83.5%, forked from Spring 105.0)
- Game logic: Lua (89.7% of the game repo)
- Lobby: Chobby (Lua-based, being replaced by Electron/Vue/TypeScript client)
- Server middleware: Teiserver (Elixir)
- Infrastructure spans 15+ repositories
- Seven published games use the Recoil engine (BAR, Zero-K, etc.)

**Sources:**
- <https://github.com/beyond-all-reason/Beyond-All-Reason>
- <https://github.com/beyond-all-reason/spring>
- <https://www.beyondallreason.info/development/development-of-bar>

---

## 2. Engine Architecture

### 2.1 The Engine/Game Split

BAR's architecture has a clean separation between the **Recoil engine** (C++) and the **game content** (Lua + assets). This is the defining architectural pattern:

| Layer | Language | Repo | Responsibility |
|-------|----------|------|---------------|
| Engine (Recoil) | C++ | `beyond-all-reason/spring` | Physics, rendering, networking, Lua VM hosting, pathfinding, collision |
| Game logic | Lua | `beyond-all-reason/Beyond-All-Reason` | Unit definitions, weapon balance, game rules, AI, UI widgets |
| Lobby/Launcher | Lua (legacy) / TypeScript+Vue (new) | `BYAR-Chobby` / `bar-lobby` | Matchmaking, server browsing, accounts, downloads |
| Server middleware | Elixir | `beyond-all-reason/teiserver` | Accounts, ratings, moderation, lobby room management |

The engine provides a **Lua API surface** that the game content calls into. The game is loaded as a mod/archive (`.sdd` directory or `.sd7` compressed archive) by the engine at startup. The engine itself knows nothing about specific units, factions, or game rules.

### 2.2 Game Content Organization

The BAR game repo is organized by domain:

```
luarules/gadgets/   — 262 server-side game logic scripts (synced + unsynced)
luaui/Widgets/      — 291 client-side UI scripts
units/              — Unit definitions as Lua tables (organized by faction/type)
weapons/            — Weapon definitions
gamedata/           — Balance data, configuration
objects3d/          — 3D models (S3O format)
effects/            — Particle and visual effects
shaders/            — GLSL shader code
sounds/, music/     — Audio assets
```

### 2.3 Unit Definition Format

Units are defined as **Lua table literals** returning structured data. Example fields from `armham.lua`:

```lua
{
  buildpic = "...",
  buildtime = 2800,
  health = 580,
  metalcost = 130,
  speed = 1.65,
  sightdistance = 510,
  movementclass = "KBOT3",
  objectname = "Units/ArmBots/ARMHAM.s3o",
  weapondefs = {
    lightplasma = {
      range = 700,
      reloadtime = 2.3,
      damage = { default = 140, vtol = 8 },
      weaponvelocity = 230,
    },
  },
  customparams = { model_author = "...", subfolder = "ArmBots" },
}
```

This is essentially a **data-driven** approach where the engine interprets Lua tables as configuration. The format supports nested structures for weapons, sounds, destruction effects, and custom parameters.

### 2.4 Mod Options System

The `modoptions.lua` file defines ~80+ configurable game options using a structured format:

- Types: `list`, `string`, `number`, `bool`, `section`, `separator`
- Each option has: `key`, `name`, `desc`, `type`, `def` (default), `section`
- Supports dynamic dependencies between options
- Options include: unit limits (max 32,000), game end modes, resource sharing, no-rush timers, PvE modes (Raptors, Scavengers), cheat multipliers
- Applied at game start, not runtime-modifiable

### 2.5 Rendering Architecture

BAR recently underwent a major renderer upgrade to **GL4** (modern OpenGL 4):

- **Legacy approach:** Sequential per-unit draw calls (load model, push transform, draw, pop)
- **GL4 approach:** All models uploaded to GPU buffers at load time; transformation data batched into single GPU buffer; instancing groups units by model type for single draw call per faction
- **Result:** 2x FPS in normal gameplay, 3-8x in heavy endgame, up to 10x in synthetic benchmarks

**Sources:**
- <https://www.beyondallreason.info/news/groundbreaking-engine-improvements-are-live-multithreaded-pathing-and-new-renderer-deployed>
- <https://recoilengine.org/>

---

## 3. Networking Model

### 3.1 Deterministic Lockstep

Recoil uses **server-authoritative deterministic lockstep**, the same fundamental model as classic 90s/2000s RTS games (C&C, StarCraft, Age of Empires):

- Only **player inputs** (commands) are transmitted, not game state
- Each client independently simulates identical game state from identical inputs
- The server runs at 30 Hz (`GAME_SPEED = 30`) and broadcasts `NETMSG_NEWFRAME` each tick
- Clients only advance simulation when they receive the server's frame message
- Keyframes sent every 16th frame for sync checking
- Even singleplayer runs a local server internally

**Bandwidth characteristics:** Proportional to input count, not object count. A game with 3,000 units uses roughly the same bandwidth as one with 100, since only player commands are sent.

### 3.2 Determinism Implementation

The hardest technical challenge in lockstep is ensuring **bitwise-identical** simulation across all clients:

- **STREFLOP library:** Forces all floating-point operations to behave identically across hardware by deactivating CPU-specific FPU optimizations and standardizing rounding behavior
- **SSE preference over x87:** BAR/Recoil prefers SSE instructions which have fewer configuration conflicts than legacy x87 FPU
- **Custom math functions:** Deterministic implementations of sin, cos, tan, exp, log (standard library versions optimize for speed, not cross-platform consistency)
- **x86-64 only:** Cross-platform determinism is restricted to x86-64 architecture
- **No external physics library:** Custom collision detection to maintain determinism

**Key insight from Spring developers:** "Errors that occur in floating-point arithmetic like digit cancellation or truncation are sensitive to every operand digit." Simple truncation strategies fail; rigorous FPU control is the only reliable approach.

### 3.3 Desync Detection and Recovery

Desyncs are detected via **checksumming** and recovered through a multi-stage protocol:

**Detection:**
- Running checksum (`SyncChecker`) computed on game state properties each frame
- Checksums transmitted to host and compared
- Position vectors cast to `int3` before checksumming to tolerate minor float variance
- Optional deep debugger (`SyncDebugger`) tracks write history to pinpoint exact divergence source line

**Recovery protocol:**
1. Client detects checksum mismatch
2. Host pauses all clients, transmits granular checksums (per-unit, per-sector)
3. Clients advance to host's frame despite desync
4. Clients report which segments failed validation
5. Host transmits required state data
6. Host resumes gameplay

**Known desync causes:**
- NaN values in calculations
- Memory corruption
- Lua `pairs()` iteration on tables with function/coroutine keys (non-deterministic ordering)
- Late-connecting clients
- FPU mode changes by third-party libraries

### 3.4 Buffering and Latency

- Input packets are **queued in a buffer** of 3-6 simulation frames (100-200ms) beyond base ping
- Buffer size dynamically adjusts during laggy matches
- Reported ping values include buffer overhead
- No rollback or prediction — pure lockstep with buffering

### 3.5 Replays and Saves

- **Replays:** Stored as `.sdfz` files — literally a recording of the network command queue. Replaying means feeding the same commands through the deterministic simulation
- Replay files contain: header (version, time), script section (game/mod/map settings), demostream (timestamped commands), player statistics, team statistics
- **Saves:** "Imperfect snapshot" of game state. Perfect mid-game join or backward replay seeking is not implemented
- Cannot jump to arbitrary timepoints (must simulate forward from start)
- Forward-only replay watching (no rewind)

### 3.6 Architectural Tradeoffs (BAR's Own Assessment)

**Advantages:**
- Minimal bandwidth
- Small replay files
- Resistance to client-side state manipulation cheats
- Server-light architecture (server forwards commands, doesn't simulate)

**Disadvantages:**
- Cannot jump to arbitrary timepoints in replays
- Must simulate entire game state on every client (enables maphacking since all state is local)
- Desync prevention requires extreme engineering care
- Mid-game rejoin is fragile
- Late-game performance degrades as simulation grows (every client simulates everything)

**Sources:**
- <https://recoilengine.org/articles/netcode-overview/>
- <https://springrts.com/phpbb/viewtopic.php?t=33030>
- <https://springrts.com/wiki/Syncing_System>
- <https://springrts.com/wiki/Debugging_sync_errors>

---

## 4. Modding System

### 4.1 Dual-Layer Plugin Architecture

BAR's modding system is split into two complementary layers:

**Gadgets (LuaRules) — Server-side game logic:**
- Can run in **synced** (deterministic, authoritative) or **unsynced** (visual-only) mode
- Synced gadgets: unit creation, damage application, command execution, game rules enforcement
- Unsynced gadgets: visualization, effects that don't affect game state
- Communication: synced code calls `SendToUnsynced()` to message unsynced code
- 262 gadgets in BAR covering: AI systems, command processing, unit mechanics, game modes, environmental systems, physics

**Widgets (LuaUI) — Client-side UI components:**
- Run only in **unsynced** context — cannot affect game simulation
- Handle: UI rendering, player input, visual effects, camera control, sound
- Can send messages to synced gadgets via `Spring.SendLuaRulesMsg()`
- 291 widgets in BAR covering: camera, commands, graphics, GUI, debug, sound, map, unit automation
- Users can write and load custom widgets (controllable via `allowuserwidgets` modoption)

### 4.2 Plugin Lifecycle

Both gadgets and widgets follow a standardized lifecycle:

1. **Discovery:** VFS scanning finds `.lua` files in designated directories
2. **Sandboxing:** Each plugin runs in a controlled environment with restricted API access
3. **Metadata:** `GetInfo()` returns plugin identity and requirements
4. **Initialization:** `Initialize()` called on activation
5. **Runtime:** Call-ins (`Update()`, `DrawScreen()`, `KeyPress()`, `UnitCreated()`, etc.) dispatched based on registration
6. **Shutdown:** `Shutdown()` called on removal

**Execution order:** Plugins execute in layer order. Drawing and input call-ins use reverse iteration (higher layers render on top, intercept input first). Reordering deferred until call stack unwinds to prevent mid-call-in crashes.

### 4.3 Inter-Plugin Communication

- **Widget Global (`WG{}`):** Shared table for widget-to-widget communication
- **Gadget Global (`GG{}`):** Shared table for gadget-to-gadget communication
- **`RegisterGlobal()`:** Expose functions in `_G`, tracked by owner
- **Action handlers:** Text commands and keybinds route through unified dispatcher

### 4.4 Modding DX (Developer Experience)

**Current state:** BAR officially states "we don't support full moddability and customization" during Alpha. Custom widgets are supported; full game mods are planned for later.

**Tweaking system (current workaround):**
- **tweakunits:** Targeted stat changes to individual units via base64-encoded Lua tables
- **tweakdefs:** Programmatic mass modifications via base64-encoded Lua scripts
- Applied at game start by lobby boss via `!bset` commands
- Maximum 9 tweaks per game session
- Requires base64 encoding (poor ergonomics)

**Full modding (planned):**
- Mods are loaded as archives (`.sdd` directories or `.sd7` compressed)
- User widgets load from filesystem (`VFS.RAW`); game widgets from archives (`VFS.ZIP`)
- No recompilation required for Lua-based changes
- Hot-reloading supported for widgets during development

**Pain points for modders:**
- Must understand synced vs unsynced distinction to avoid desyncs
- Lua sandboxing restricts available APIs
- Gadget state doesn't persist to disk (runtime-only)
- Widget folder restructuring (breaking change) forced community widget updates
- Competitive integrity concerns: custom widgets can provide unfair automation advantages in ranked play

**Sources:**
- <https://deepwiki.com/beyond-all-reason/Beyond-All-Reason/8-development-and-modding>
- <https://gist.github.com/efrec/153081a7d43db3ad7a3c4fc5c9a689f8>
- <https://www.beyondallreason.info/faq>

---

## 5. Community Infrastructure

### 5.1 Overall Architecture

BAR's community infrastructure is a distributed system spanning multiple services:

```
Player → Launcher (Spring Launcher / bar-lobby)
       → Lobby Client (Chobby / bar-lobby)
       → Teiserver (accounts, ratings, moderation, matchmaking)
       → SPADS (game server hosting, battle room management)
       → Recoil Engine (dedicated, game simulation)
       → BAR Live Services (replays, leaderboards)
       → CDN (asset distribution)
```

### 5.2 Teiserver (Central Server)

**Technology:** Elixir, PostgreSQL, MIT license, 5,218 commits, 55 contributors

**Responsibilities:**
- Account management and authentication
- Player ratings (OpenSkill algorithm)
- Moderation (mute, ban, etc.)
- Lobby room management and permissions
- Middleware between client components and game servers
- Match history and statistics

**Current protocol:** SpringLobby Protocol (legacy)
**Future protocol:** Tachyon (JSON Schema-based, in development)

### 5.3 Rating System

BAR uses **OpenSkill** (Bayesian inference, similar to TrueSkill):

- **Skill (mu):** Estimated player capability, moves with wins/losses
- **Uncertainty (sigma):** Confidence measure, starts at 8.33 for new players, decreases with games played
- **Match Rating:** `mu - 1*sigma` (used for lobby balancing)
- **Leaderboard Rating:** `mu - 3*sigma` (99.85% confidence, used for rankings)
- Separate ratings per mode: Duel (1v1), Small Teams (2-5v5), Large Teams (6v6+), FFA, Team FFA
- Larger team games produce smaller rating changes (harder to attribute individual contribution)

**Lobby balancing algorithm:**
1. Select team with lowest combined rating
2. That team picks the highest-rated available player
3. Repeat until all players assigned
4. Parties grouped together when possible

### 5.4 Game Server Hosting (SPADS)

**SPADS** (Spring Perl Autohost Dedicated Server):
- Manages individual battle rooms
- Communicates with engine via "Autohost" protocol with admin privileges
- Handles vote commands (e.g., `!stop`, `!lock`)
- Configuration synced across instances daily at noon UTC
- Regional deployment: AU, EU, US servers managed via Ansible playbooks

**Being replaced by:** Recoil Autohost (TypeScript/Node.js) — new component that spins up engine instances and translates engine-to-server communication. Under development with basic functionality.

### 5.5 Tournament Support

- `$tournament` command locks battle rooms to competitors and official casters
- Seeding based on 1v1 Leaderboard
- **Challonge** used for bracket management (external service)
- Structured caster qualification guidelines
- Alpha Cup series running since 2021 with prize pools

### 5.6 Replay Infrastructure

- Replays automatically saved as `.sdfz` files
- Hosted on BAR Live Services (bar-rts.com)
- Public datasets published twice weekly from Teiserver + replay databases
- Replay browser integrated into lobby client
- Privacy concern: replays contain system fingerprinting information (hardware details)

### 5.7 Asset Distribution

- **pr-downloader:** CLI tool for efficient incremental updates
- **RapidTools:** Repository packaging converter
- **rapid-hosting:** Build server infrastructure
- Maps hosted on dedicated CDN
- Spring Launcher handles pre-game downloads and updates

### 5.8 Monitoring

- VictoriaMetrics + Grafana stack for observability
- healthchecks.io for uptime monitoring
- All infrastructure managed via Ansible playbooks on manually-provisioned VMs

**Sources:**
- <https://beyond-all-reason.github.io/infrastructure/current_infra/>
- <https://beyond-all-reason.github.io/infrastructure/components/>
- <https://beyond-all-reason.github.io/infrastructure/new_client/>
- <https://www.beyondallreason.info/guide/rating-and-lobby-balance>
- <https://github.com/beyond-all-reason/teiserver>

---

## 6. Build and Asset Pipeline

### 6.1 3D Model Format

- Primary format: **S3O** (Spring 3D Object) — engine-native binary format
- Conversion tool: **OBJ2S3O** for converting between OBJ and S3O formats, including ambient occlusion baking
- GLTF import from Blender also supported in newer Recoil versions
- Models stored in `objects3d/` directory

### 6.2 Map Format

Maps are `.sd7` archives (zip) containing three components:

1. **Compiled map files:**
   - `.smf` (Spring Map File) — terrain data
   - `.smt` (Spring Map Tiles) — tiled texture data

2. **Texture layers:**
   - Heightmap: 16-bit PNG, `(64 * mapsize) + 1` pixels
   - Metalmap: 8-bit RGB BMP, `16 * mapsize` pixels (red channel = metal density)
   - Diffuse texture: 8-bit RGB BMP, `512 * mapsize` pixels
   - Normalmap: DDS, `512 * mapsize` (8K preferred)
   - Specularmap: DDS, `256 * mapsize`
   - Grassmap: BMP/TGA, `16 * mapsize`
   - Splatmap: RGBA PNG/TGA, min 2048px wide (for detail texture blending)
   - Skybox: DDS cubemap, 2K per side

3. **Configuration:** `mapinfo.lua` — Lua table defining map metadata, start positions, atmosphere settings

**Tools required:** Photoshop/GIMP, World Machine (for heightmap generation), Spring Map Compiler, SpringBoard Editor

### 6.3 Game Content Distribution

- Game content loaded from `.sdd` directories (development) or `.sd7` archives (distribution)
- Dev workflow: clone repo into engine's `data/games/BAR.sdd/`, create `devmode.txt`, launch
- Content updates distributed via rapid packaging system through CDN
- No compilation step for game logic changes (Lua interpreted at load time)

### 6.4 Engine Build System

- CMake-based build
- Docker containerization available for reproducible builds
- Git submodules for dependencies (source packages without submodules cannot compile — known issue)
- Tracy profiler integration for performance analysis
- Supports both Docker and native compilation paths

**Sources:**
- <https://www.beyondallreason.info/guide/mapping-1-file-structure-prerequisites>
- <https://github.com/beyond-all-reason/OBJ2S3O>
- <https://recoilengine.org/>

---

## 7. What BAR Does Well

### 7.1 Scale

BAR consistently demonstrates the ability to run games with **3,000+ units** and has hosted events with **40v40 (80 players)** and even 160 participants in a single game. This is exceptional for an open-source RTS and proves that lockstep networking can scale to massive player counts when bandwidth is input-proportional.

### 7.2 Engine/Game Separation

The clean split between C++ engine and Lua game logic means:
- Game designers can iterate without recompiling the engine
- Multiple games can share the same engine (7 published titles on Recoil)
- Community contributors can modify game balance, add units, and create game modes with pure Lua
- Rapid development cycle for gameplay changes

### 7.3 Community Building

- Bottom-up mentor system where experienced players help newcomers
- Active moderation team scaled with player growth
- Structured competitive scene (Alpha Cup tournament series since 2021)
- 30%+ player growth in 2025 alone
- 43,000 Discord members with active development channels

### 7.4 GL4 Renderer Modernization

The transition from legacy OpenGL to GL4 instanced rendering was a major technical success:
- 2-10x FPS improvement depending on scenario
- Enables endgame scenarios that were previously unplayable
- Demonstrates that engine-level rendering improvements can be retrofitted into a mature codebase

### 7.5 Multithreaded Pathfinding

Despite the engine's historically single-threaded simulation, BAR successfully parallelized pathfinding:
- 4-5x improvement in pathfinding performance
- Requests queued and dispatched per frame
- Terrain deformation recalculations run multithreaded with rate limiting
- Careful cache management to prevent desyncs in threaded context

### 7.6 Comprehensive Widget Ecosystem

291 UI widgets provide deep customization:
- Camera systems, HUD customization, automation helpers
- Debug/profiling tools built as widgets
- Community can extend the UI without engine changes
- Widgets hot-reload during development

### 7.7 Data Publishing

BAR publishes match datasets twice weekly in easy-to-consume formats, enabling:
- Third-party analysis tools
- Community-driven balance research
- Academic/research use

---

## 8. Known Pain Points

### 8.1 Engine Fork Maintenance Burden

BAR forked Spring 105.0 into "Recoil" because merging upstream changes had become impractical. This creates ongoing costs:
- Maintaining a full C++ game engine is substantial work for a volunteer team
- Past merge attempts with upstream Spring failed
- The fork "gets more and more complex and will be at some point unmaintainable by hobbyists" (community developer concern)
- Build system issues: source packages missing git submodules prevent compilation

### 8.2 Floating-Point Determinism Fragility

The STREFLOP-based determinism approach works but is inherently fragile:
- Restricted to x86-64 (no ARM/mobile/console without rewriting determinism approach)
- Any library that modifies FPU state can cause desyncs
- Desync debugging requires special builds with sync trace enabled
- Lua table iteration with non-deterministic key types (`pairs()` on tables with function keys) causes subtle desyncs
- Cannot easily verify determinism across different compiler versions/flags

### 8.3 Lockstep Limitations

- **No mid-game join:** Saves are "imperfect snapshots" — true reconnection requires replaying from start
- **No replay seeking:** Can only fast-forward, never rewind or jump to timestamp
- **Maphack vulnerability:** Every client has full game state (inherent to lockstep)
- **Late-game performance:** Every client must simulate everything — 3,000 units means 3,000 units of computation per client regardless of what's on screen

### 8.4 Modding Restrictions During Alpha

- "We don't support full moddability" — official stance during Alpha
- Tweaking system requires base64 encoding (terrible DX)
- Maximum 9 tweaks per game session
- No workshop/mod distribution system yet
- Custom widgets in ranked play create competitive integrity concerns (automation advantages)

### 8.5 Infrastructure Complexity

15+ repositories spanning multiple technology stacks:
- Engine: C++
- Game: Lua
- Server: Elixir
- Lobby (legacy): Lua
- Lobby (new): TypeScript/Vue/Electron
- Autohost (legacy): Perl (SPADS)
- Autohost (new): TypeScript/Node.js
- Infrastructure: Ansible

The ongoing migration from legacy to new systems means dual maintenance burden:
- Chobby → bar-lobby transition
- SpringLobby Protocol → Tachyon Protocol transition
- SPADS → Recoil Autohost transition
- All running in parallel during transition period

### 8.6 SPADS Architecture Issues

Battle room management was split between Teiserver and SPADS, "which leads to bugs." The new architecture consolidates this into Teiserver, but the migration is ongoing.

### 8.7 Rating System Bugs

- Players with negative skill only see 0.0 on website (confusing)
- Equal-skill players could gain infinite FFA rating playing each other
- Larger team games make individual contribution attribution difficult

### 8.8 Single-Threaded Simulation Core

Despite pathfinding and rendering improvements, the core simulation loop remains largely single-threaded:
- Late-game with thousands of units bottlenecks on single-core performance
- CPU affinity issues on Linux where all threads end up on one core
- Collision handling identified as highest computation cost in late game (now partially threaded)

### 8.9 Replay Privacy

Replay files contain system fingerprinting information (hardware details), raising privacy concerns. This is a design oversight in the replay format.

**Sources:**
- <https://springrts.com/phpbb/viewtopic.php?t=49489>
- <https://springrts.com/phpbb/viewtopic.php?t=45598>
- <https://springrts.com/phpbb/viewtopic.php?t=49896>
- <https://github.com/beyond-all-reason/Beyond-All-Reason/issues/5173>
- <https://github.com/beyond-all-reason/teiserver/issues/434>

---

## 9. Actionable Lessons for Iron Curtain

### 9.1 Determinism: Fixed-Point Beats STREFLOP

**BAR's approach:** Use STREFLOP to force consistent floating-point behavior across x86-64 hardware.

**BAR's pain:** Platform-locked to x86-64. Fragile — any library touching FPU state can desync. Requires custom math function implementations. Still not perfectly reliable.

**IC lesson:** IC's decision to use **fixed-point math (i32/i64, no f32/f64 in sim)** is decisively superior. It eliminates the entire class of FPU-determinism problems, enables ARM/WASM/mobile targets, and is verifiable at compile time. This is one of the strongest architectural advantages IC has over BAR/Recoil. Never compromise on this.

### 9.2 Engine/Game Separation is Essential

**BAR's approach:** C++ engine provides Lua API; game logic is 100% Lua data + scripts.

**IC lesson:** IC's crate boundary between `ic-sim` (pure deterministic simulation) and game modules (YAML + Lua + WASM) achieves the same separation with stronger guarantees. The key insight from BAR is that this separation enables:
- Multiple games on one engine (BAR proves this with 7 Recoil titles)
- Non-programmer balance iteration (Lua tables / IC's YAML)
- Community game modes without engine changes
- Rapid iteration without recompilation

IC should ensure the boundary is as clean as BAR's — a game module should be loadable without any engine recompilation.

### 9.3 Synced/Unsynced is the Right Mental Model

**BAR's approach:** Gadgets (synced = affects simulation, unsynced = visual only) vs Widgets (always client-local).

**IC lesson:** This maps directly to IC's architecture:
- `ic-sim` crate = synced (deterministic, authoritative)
- Client-side rendering/UI = unsynced (local only)
- Lua/WASM scripts in sim = synced tier
- UI-only scripts = unsynced tier

BAR's experience shows this distinction must be **taught as a core concept**, not an implementation detail. Modders who don't understand it will create desyncs. IC's docs and SDK must make this boundary visible and enforceable (type-system enforced where possible, since Rust enables this better than Lua).

### 9.4 Widget Ecosystem is a Killer Feature

**BAR's 291 widgets** demonstrate that letting the community extend the UI is enormously valuable. Camera mods, automation helpers, analytics overlays, accessibility tools — all implemented without engine changes.

**IC lesson:** Plan for a rich client-side extension system early. IC's tiered modding (YAML/Lua/WASM) should have a clear "client-only UI extension" tier that:
- Cannot affect simulation
- Can be toggled per-player
- Has a clear policy for ranked play (BAR struggles with this — some widgets provide unfair automation)
- Supports hot-reload during development

The ranked-play policy should be decided upfront, not retroactively. BAR is still debating which widgets to allow in competitive modes.

### 9.5 Replay Format Should Be Designed, Not Accumulated

**BAR's replay format** evolved organically and now contains:
- System fingerprinting data (privacy issue)
- Non-standard binary encoding requiring reverse engineering
- No seeking capability (forward-only)

**IC lesson:** Design the replay format deliberately from day one:
- Explicit schema (not ad hoc binary)
- Privacy-conscious (no hardware fingerprinting in replay data)
- Include periodic state snapshots to enable seeking/rewind
- Plan for signed replays (IC's `D052` signed credentials/results)
- Consider a human-readable header with binary command stream

### 9.6 Lobby/Server Architecture: Consolidate Early

**BAR's pain:** Battle room logic split between Teiserver and SPADS caused bugs. Now undergoing expensive migration to consolidate.

**IC lesson:** IC's lobby/server architecture should have clear ownership of each concern from the start:
- One service owns matchmaking and room management (not split across two)
- Protocol designed before implementation (BAR's Tachyon approach is correct but late)
- Avoid Perl-based legacy systems (SPADS is being replaced for good reason)

### 9.7 Rating System: Choose Algorithm Carefully

**BAR's approach:** OpenSkill (Bayesian, similar to TrueSkill) with separate ratings per mode.

**IC lesson:** OpenSkill is a solid choice. Key design decisions to adopt:
- Separate ratings per game mode (1v1, team, FFA)
- `mu - k*sigma` formula with different k values for matchmaking vs leaderboards
- Acknowledge that large team games make individual attribution hard
- Test edge cases (BAR's infinite FFA rating bug from equal-skill players)

### 9.8 Multithreading: Pathfinding First, Sim Later

**BAR's approach:** Successfully parallelized pathfinding (4-5x speedup) while keeping core sim single-threaded.

**IC lesson:** This validates IC's approach of keeping the simulation deterministic and single-threaded while parallelizing expensive subsystems:
- Pathfinding is the highest-value parallelization target
- Collision detection is second (BAR identifies this as highest late-game cost)
- Rendering is already parallel (Bevy handles this)
- The sim tick itself should remain single-threaded for determinism

### 9.9 Asset Pipeline: Keep It Simple

**BAR's map pipeline** requires: Photoshop/GIMP + World Machine + Spring Map Compiler + SpringBoard Editor + manual DDS/PNG/BMP manipulation at specific resolutions.

**IC lesson:** This is too complex. IC should aim for:
- A unified editor that handles map creation end-to-end (D038 Scenario Editor)
- Standard formats (PNG heightmaps, standard PBR texture workflow)
- Automated compilation/packaging (no manual resolution calculations)
- Clear documentation of exactly what's needed (BAR's guide is good but the toolchain is fragmented)

### 9.10 Don't Fork an Engine You Can't Maintain

**BAR's biggest strategic risk:** They forked a massive C++ engine and are now responsible for maintaining it with volunteer labor. The fork diverges further from upstream every day.

**IC lesson:** Building a new engine in Rust/Bevy is actually less risky than forking an existing C++ engine, because:
- You own the architecture decisions from day one
- No upstream divergence to manage
- Modern tooling (cargo, Bevy ecosystem) vs legacy C++ build systems
- Smaller, more focused codebase purpose-built for the use case

The cost is higher initial development time, but the long-term maintenance burden is lower and the architecture can be designed rather than inherited.

### 9.11 Community Infrastructure is Product

**BAR's success** comes substantially from community infrastructure, not just the game:
- Mentoring system
- Active moderation
- Tournament support
- Public data access
- Multiple communication channels

**IC lesson:** Community infrastructure should be planned as part of the product, not bolted on after launch. IC's decisions around community platform (D046), player profiles (D053), achievements (D036), and governance (D037) are correctly treating this as first-class work.

---

## Non-Lessons (What IC Should NOT Copy)

1. **Floating-point determinism approach** — IC's fixed-point math is strictly superior
2. **Lua-only modding** — IC's tiered YAML/Lua/WASM is more flexible and safer
3. **C++ engine** — IC is correct to use Rust/Bevy
4. **SPADS architecture** — Perl autohost with split responsibility is an anti-pattern
5. **Base64-encoded tweaks** — Terrible DX, IC should have proper mod packaging from the start
6. **Organic replay format** — Design it deliberately
7. **Alpha-phase modding restrictions** — IC should support modding from early milestones, not defer it

---

## Summary Matrix

| Aspect | BAR Approach | IC Approach | BAR Validates IC? |
|--------|-------------|-------------|-------------------|
| Determinism | STREFLOP (float normalization) | Fixed-point (no floats in sim) | IC is stronger |
| Networking | Lockstep, server-authoritative | Lockstep default, pluggable trait | IC is more flexible |
| Engine/Game split | C++ engine / Lua game | Rust engine / YAML+Lua+WASM game | Both good, IC has better type safety |
| Modding tiers | Gadgets (synced) + Widgets (client) | YAML (data) + Lua (scripts) + WASM (total conversion) | IC is more graduated |
| Rating | OpenSkill per-mode | Planned (similar approach) | BAR provides proven template |
| Replay format | Ad hoc binary | Designed schema (planned) | IC can learn from BAR's mistakes |
| Asset pipeline | Fragmented tool chain | Unified editor (planned) | IC's approach is better DX |
| Community infra | Distributed multi-service | Planned integrated platform | Both ambitious, IC can learn from BAR's migration pain |
| Platform targets | x86-64 only | x86-64, ARM, WASM, mobile | IC is broader (enabled by fixed-point) |
| Scale demonstrated | 3,000 units, 80+ players | TBD | BAR sets the bar (pun intended) |
