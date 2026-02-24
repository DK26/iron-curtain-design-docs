# 01 — Vision & Competitive Landscape

## Project Vision

Build a Rust-native RTS engine that:
- Supports OpenRA resource formats (`.mix`, `.shp`, `.pal`, YAML rules)
- Reimagines internals with modern architecture (not a port)
- Explores different tradeoffs: performance, modding depth, portability, and multiplayer architecture
- Provides OpenRA mod compatibility as the zero-cost migration path
- Is **game-agnostic at the engine layer** — built for the C&C community but designed to power any classic RTS (D039). Ships with Red Alert (default) and Tiberian Dawn as built-in game modules; RA2, Tiberian Sun, and community-created games are future modules on the same engine (RA2 is a future community goal, not a scheduled deliverable)

## Community Pain Points We Address

These are the most frequently reported frustrations from the C&C community — sourced from OpenRA's issue tracker (135+ desync issues alone), competitive player feedback (15+ RAGL seasons), modder forums, and the Remastered Collection's reception. Every architectural decision in this document traces back to at least one of these. This section exists so that anyone reading this document for the first time understands *why* the engine is designed the way it is.

### Critical — For Players

**1. Desyncs ruin multiplayer games.**
OpenRA has 135+ desync issues in its tracker. The sync report buffer is only 7 frames deep — when a desync occurs mid-game, diagnosis is often impossible. Players lose their game with no explanation. This is the single most-complained-about multiplayer issue.
→ *IC answer:* Per-tick state hashing follows the Spring Engine's `SyncDebugger` approach — binary search identifies the exact tick and entity that diverged. Fixed-point math (no floats in sim — invariant #1) eliminates the most common source of cross-platform non-determinism. See [03-NETCODE.md](03-NETCODE.md) for the full desync diagnosis design.

**2. Random performance drops.**
Even at low unit counts, something "feels off" — micro-stutters from garbage collection pauses, unpredictable frame timing. In competitive play, a stutter during a crucial micro moment loses games. C#/.NET's garbage collector is non-deterministic in timing.
→ *IC answer:* Rust has no garbage collector. Zero per-tick allocation is an invariant (not a goal — a rule). The efficiency pyramid (see [10-PERFORMANCE.md](10-PERFORMANCE.md)) prioritizes better algorithms and cache layout before reaching for threads. Target: 500-unit battles smooth on a 2-core 2012 laptop.

**3. Campaigns are systematically incomplete.**
OpenRA's multiplayer-first culture has left single-player campaigns unfinished across multiple supported games: Dune 2000 has only 1 of 3 campaigns playable, TD campaigns are also incomplete, and there's no automatic mission progression — players exit to menu between missions.
→ *IC answer:* Campaign completeness is a first-class exit criterion for every shipped game module. Branching campaign graphs with persistent unit rosters, veterancy, and equipment carry-over (D021) go beyond completion to innovation. Continuous flow: briefing → mission → debrief → next mission, no menu breaks.

**4. No competitive infrastructure.**
No ranked matchmaking, no automated anti-cheat, no signed replays. The competitive scene relies entirely on community-run CnCNet ladders and trust-based result reporting.
→ *IC answer:* Glicko-2 ranked matchmaking, relay-certified match results (signed by the relay server — fraud-proof), Ed25519-signed tamper-proof replays, tournament mode with configurable broadcast delay. See [01-VISION.md § Competitive Play](#competitive-play) and [06-SECURITY.md](06-SECURITY.md).

**5. Balance debates fractured the community.**
OpenRA's competitive rebalancing made iconic units feel less powerful — Tanya, MiGs, V2 rockets, Tesla coils all nerfed for tournament fairness. This was a valid competitive choice, but it became the *only* option. Players who preferred the original feel had no path forward. The community split over whether the game should feel like Red Alert or like a balanced esport.
→ *IC answer:* Switchable balance presets (D019) — classic EA values (default), OpenRA balance, Remastered balance, custom — are a lobby setting, not a total conversion. Choose your experience. No one's preference invalidates anyone else's.

**6. Platform reach is limited.**
The Remastered Collection is Windows/Xbox only. OpenRA covers Windows, macOS, and Linux but not browser or mobile. There's no way to play on a phone, in a browser, or on a Steam Deck without workarounds.
→ *IC answer:* Designed for Windows, macOS, Linux, Steam Deck, browser (WASM), and mobile from day one. Platform-agnostic architecture (invariant #10) — input abstracted behind traits, responsive UI, no raw filesystem access.

### Critical — For Modders

**7. Deep modding requires C#.**
OpenRA's YAML system covers ~80% of modding, but anything beyond value tweaks — new mechanics, total conversions, custom AI — requires writing C# against a large codebase with a .NET build toolchain. This limits the modder pool to people comfortable with enterprise software development.
→ *IC answer:* Three tiers — YAML (data, 80% of mods), Lua (scripting, missions and abilities), WASM (engine-level, total conversions) — no recompilation ever (invariant #3). WASM accepts any language. The modding barrier drops from "learn C# and .NET" to "edit a YAML file."

**8. MiniYAML has no tooling.**
OpenRA's custom data format has no IDE support, no schema validation, no linting, no standard parsing libraries. Every editor is a plain text editor. Typos and structural errors are discovered at runtime.
→ *IC answer:* Standard YAML with `serde_yaml` (D003). JSON Schema for validation. IDE autocompletion and error highlighting work out of the box with any YAML-aware editor.

**9. No mod distribution system.**
Mods are shared via forum posts and manual file copying. There's no in-game browser, no dependency management, no integrity verification, no one-click install.
→ *IC answer:* Workshop registry (D030) with in-game browser, auto-download on lobby join (CS:GO-style), semver dependencies, SHA-256 integrity, federated mirrors, Steam Workshop as optional source.

**10. No hot-reload.**
Changing a YAML value requires restarting the game. Changing C# code requires recompiling the engine. Iteration speed for mod development is slow.
→ *IC answer:* YAML + Lua hot-reload during development. Change a value, see it in-game immediately. WASM mods reload without game restart.

### Important — Structural

**11. Single-threaded performance ceiling.**
OpenRA's game loop is single-threaded (verified from source). There's a hard ceiling on how many units can be simulated per tick, regardless of how many CPU cores are available.
→ *IC answer:* Bevy's ECS scheduling enables parallel systems where profiling justifies it. But per the efficiency pyramid (D015), algorithmic improvements and cache layout come first — threading is the last optimization, not the first.

**12. Scenario editor is terrain-only.**
OpenRA's map editor handles terrain and actor placement but not mission logic — triggers, objectives, AI behavior, and scripting must be done in separate files by hand.
→ *IC answer:* The IC SDK (D038+D040) ships a full creative toolchain: visual trigger editor, drag-and-drop logic modules, campaign graph editor, Game Master mode, asset studio. Inspired by OFP/Arma 3 Eden — not just a map painter, a mission design environment.

---

> These pain points are not criticisms of OpenRA — they're structural consequences of technology choices made 18 years ago. OpenRA is a remarkable achievement. Iron Curtain exists because we believe the community deserves the next step.

## Why This Deserves to Exist

### Capabilities Beyond OpenRA and the Remastered Collection

| Capability         | Remastered Collection                            | OpenRA                                                                 | Iron Curtain                                                                         |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Engine             | Original C++ as DLL, proprietary C# client       | C# / .NET (2007)                                                       | Rust + Bevy (2026)                                                                   |
| Platforms          | Windows, Xbox                                    | Windows, macOS, Linux                                                  | All + Browser + Mobile                                                               |
| Max units (smooth) | Unknown (not benchmarked)                        | Community reports of lag in large battles (not independently verified) | 2000+ target                                                                         |
| Modding            | Steam Workshop maps, limited API                 | MiniYAML + C# (recompile for deep mods)                                | YAML + Lua + WASM (no recompile ever)                                                |
| AI content         | Fixed campaigns                                  | Fixed campaigns + community missions                                   | Branching campaigns with persistent state (D021)                                     |
| Multiplayer        | Proprietary networking (not open-sourced)        | TCP lockstep, 135+ desync issues tracked                               | Relay server, desync diagnosis, signed replays                                       |
| Competitive        | No ranked, no anti-cheat                         | Community ladders via CnCNet                                           | Ranked matchmaking, Glicko-2, relay-certified results                                |
| Graphics pipeline  | HD sprites, proprietary renderer                 | Custom renderer with post-processing (since March 2025)                | Classic isometric via Bevy + wgpu (HD assets, post-FX, shaders available to modders) |
| Source             | C++ engine GPL; networking/rendering proprietary | Open (GPL)                                                             | Open (GPL)                                                                           |
| Community assets   | Separate ecosystem                               | 18 years of maps/mods                                                  | Loads all OpenRA assets + migration tools                                            |
| Mod distribution   | Steam Workshop (maps only)                       | Manual file sharing, forum posts                                       | Workshop registry with in-game browser, auto-download on lobby join, Steam source    |
| Creator support    | None                                             | None                                                                   | Voluntary tipping, creator reputation scores, featured badges (D035)                 |
| Achievements       | Steam achievements                               | None                                                                   | Per-module + mod-defined achievements, Steam sync for Steam builds (D036)            |
| Governance         | EA-controlled                                    | Core team, community PRs                                               | Transparent governance, elected community reps, RFC process (D037)                   |

### New Capabilities Not Found Elsewhere

**Branching Campaigns with Persistent State (D021)**

Campaigns are directed graphs of missions, not linear sequences. Each mission can have multiple outcomes ("won with bridge intact" vs "won but bridge destroyed") that lead to different next missions. Failure doesn't end the campaign — defeat is another branch. Surviving units, veterancy, and equipment carry over between missions. Continuous flow: briefing → mission → debrief → next mission, no exit-to-menu between levels. Inspired by Operation Flashpoint.

**Optional LLM-Generated Missions (BYOLLM — power-user feature)**

For players who want more content: an optional in-game interface where players describe a scenario in natural language and receive a fully playable mission — map layout, objectives, enemy AI, triggers, briefing text. Generated content is standard YAML + Lua, fully editable and shareable. Requires the player to configure their own LLM provider (local or cloud) — the engine never ships or requires a specific model. Every feature works fully without an LLM configured.

**Rendering: Classic First, Modding Possibilities Beyond**

The core rendering goal is to **faithfully reproduce the classic Red Alert isometric aesthetic** — the same sprites, the same feel. HD sprite support is planned so modders can provide higher-resolution assets alongside the originals.

Because the engine builds on Bevy's rendering stack (which includes a full 2D and 3D pipeline via wgpu), modders gain access to capabilities far beyond the classic look — if they choose to use them:

- Post-processing: bloom, color grading, screen-space reflections on water
- Dynamic lighting: explosions illuminate surroundings, day/night cycles
- GPU particle systems: smoke, fire, debris, weather (rain, snow, sandstorm, fog, blizzard)
- Dynamic weather: real-time transitions (sunny → overcast → rain → storm), snow accumulation on terrain, puddle formation, seasonal effects — terrain textures respond to weather via palette tinting, overlay sprites, or shader blending (D022)
- Shader effects: chrono-shift shimmer, iron curtain glow, tesla arcs, nuclear flash
- Smooth camera: sub-pixel rendering, cinematic replay camera, smooth zoom
- 3D rendering: a Tier 3 (WASM) mod can replace the sprite renderer entirely with 3D models while the simulation stays unchanged

These are **modding possibilities enabled by the engine's architecture**, not development goals for the base game. The base game ships with the classic isometric aesthetic. Visual enhancements are content that modders and the community build on top.

**Scenario Editor & Asset Studio (D038 + D040)**

OpenRA's map editor is a standalone terrain/actor tool. The IC SDK ships a full creative toolchain as a separate application from the game — not just terrain/unit placement, but full mission logic: visual triggers with countdown/timeout timers, waypoints, drag-and-drop modules (wave spawner, patrol route, guard position, reinforcements, objectives), compositions (reusable prefabs), Probability of Presence per entity for replayability, layers, and a Game Master mode for live scenario manipulation. The SDK also includes an asset studio (D040) for browsing, editing, and generating game resources — sprites, palettes, terrain, chrome/UI themes — with optional LLM-assisted generation for non-artists. Inspired by Operation Flashpoint's mission editor, Arma 3's Eden Editor, and Bethesda's Creation Kit.

### Architectural Differences from OpenRA

OpenRA is a mature, actively maintained project with 18 years of community investment. These are genuine architectural differences, not criticisms:

| Area          | OpenRA                                   | Iron Curtain                                                                   |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| Runtime       | C# / .NET (mature, productive)           | Rust — no GC, predictable perf, WASM target                                    |
| Threading     | Single-threaded game loop (verified)     | Parallel systems via ECS                                                       |
| Modding       | Powerful but requires C# for deep mods   | YAML + Lua + WASM (no compile step)                                            |
| Map editor    | Separate tool, recently improved         | SDK scenario editor with mission logic + asset studio (D038+D040, Phase 6a/6b) |
| Multiplayer   | 135+ desync issues tracked               | Snapshottable sim designed for desync pinpointing                              |
| Competitive   | Community ladders via CnCNet             | Integrated ranked matchmaking, tournament mode                                 |
| Portability   | Desktop (Windows, macOS, Linux)          | Desktop + WASM (browser) + mobile                                              |
| Maturity      | 18 years, battle-tested, large community | Clean-sheet modern design, unproven                                            |
| Campaigns     | Some incomplete (TD, Dune 2000)          | Branching campaigns with persistent state (D021)                               |
| Mission flow  | Manual mission selection between levels  | Continuous flow: briefing → mission → debrief → next                           |
| Asset quality | Cannot fix original palette/sprite flaws | Bevy post-FX: palette correction, color grading, optional upscaling            |

### What Makes People Actually Switch

1. **Better performance** — visible: bigger maps, more units, no stutters
2. **Campaigns that flow** — branching paths, persistent units, no menu between missions, failure continues the story
3. **Better modding** — WASM scripting, SDK with scenario editor & asset studio, hot reload
4. **Competitive infrastructure** — ranked matchmaking, anti-cheat, tournaments, signed replays — OpenRA has none of this
5. **Player analytics** — post-game stats, career page, campaign dashboard with roster graphs — your match history is queryable data, not a forgotten replay folder
6. **Better multiplayer** — desync debugging, smoother netcode, relay server
7. **Runs everywhere** — browser via WASM, mobile, Steam Deck natively
8. **OpenRA mod compatibility** — existing community migrates without losing work
9. **Workshop with auto-download** — join a game, missing mods download automatically (CS:GO-style); no manual file hunting
10. **Creator recognition** — reputation scores, featured badges, optional tipping — modders get credit and visibility
11. **Achievement system** — per-game-module achievements stored locally, mod-defined achievements via YAML + Lua, Steam sync for Steam builds
12. **Optional LLM enhancements** (BYOLLM) — bring your own LLM for generated missions, adaptive briefings, coaching suggestions — a quiet power-user feature, not a headline

Item 8 is the linchpin. If existing mods just work, migration cost drops to near zero.

## Competitive Play

Red Alert has a dedicated competitive community (primarily through OpenRA and CnCNet). CnCNet provides community ladders and tournament infrastructure, but there's no integrated ranked system, no automated anti-cheat, and desyncs remain a persistent issue (135+ tracked in OpenRA's issue tracker). This is a significant opportunity. IC's `CommunityBridge` will integrate with both OpenRA's and CnCNet's game browsers (shared discovery, separate gameplay) so the C&C community stays unified.

### Ranked Matchmaking

- **Rating system:** Glicko-2 (improvement over Elo — accounts for rating volatility and inactivity, used by Lichess, FIDE, many modern games)
- **Seasons:** 3-month ranked seasons with placement matches (10 games), YAML-configurable tier system (D055 — Cold War military ranks for RA: Conscript → Supreme Commander, 7+2 tiers × 3 divisions), end-of-season rewards
- **Queues:** 1v1 (primary), 2v2 (team), FFA (experimental). Separate ratings per queue
- **Map pool:** Curated competitive map pool per season, community-nominated and committee-voted. Ranked games use pool maps only
- **Balance preset locked:** Ranked play uses a fixed balance preset per season (prevents mid-season rule changes from invalidating results)
- **Matchmaking server:** Lightweight Rust service, same infra pattern as tracking/relay servers (containerized, self-hostable for community leagues)

### Leaderboards

- Global, per-faction, per-map, per-game-module (RA1, TD, etc.)
- Public player profiles: rating history, win rate, faction preference, match history
- Replay links on every match entry — any ranked game is reviewable

### Tournament Support

- **Observer mode:** Spectators connect to relay server and receive tick orders with configurable delay
  - **No fog** — for casters (sees everything)
  - **Player fog** — fair spectating (sees what one player sees)
  - **Broadcast delay** — 1-5 minute configurable delay to prevent stream sniping
- **Bracket integration:** Tournament organizers can set up brackets via API; match results auto-report
- **Relay-certified results:** Every ranked and tournament match produces a `CertifiedMatchResult` signed by the relay server (see `06-SECURITY.md`). No result disputes.
- **Replay archive:** All ranked/tournament replays stored server-side for post-match analysis and community review

### Anti-Cheat (Architectural, Not Intrusive)

Our anti-cheat emerges from the architecture — not from kernel drivers or invasive monitoring:

| Threat               | Defense                               | Details                                                                |
| -------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| **Maphack**          | Fog-authoritative server (tournament) | Server sends only visible entities — `06-SECURITY.md` V1               |
| **Order injection**  | Deterministic validation in sim       | Every order validated before execution — `06-SECURITY.md` V2           |
| **Lag switch**       | Relay server time authority           | Miss the window → orders dropped — `06-SECURITY.md` V3                 |
| **Speed hack**       | Relay owns tick cadence               | Client clock is irrelevant — `06-SECURITY.md` V11                      |
| **Automation**       | Behavioral analysis                   | APM patterns, reaction times, input entropy — `06-SECURITY.md` V12     |
| **Result fraud**     | Relay-signed match results            | Only relay-certified results update rankings — `06-SECURITY.md` V13    |
| **Replay tampering** | Ed25519 hash chain                    | Tampered replay fails signature verification — `06-SECURITY.md` V6     |
| **WASM mod abuse**   | Capability sandbox                    | `get_visible_units()` only, no `get_all_units()` — `06-SECURITY.md` V5 |

**Philosophy:** No kernel-level anti-cheat (no Vanguard/EAC). We're open-source and cross-platform — intrusive anti-cheat contradicts our values and doesn't work on Linux/WASM. We accept that lockstep has inherent maphack risk in P2P modes. The fog-authoritative server is the real answer for high-stakes play.

### Performance as Competitive Advantage

Competitive play demands rock-solid performance — stutters during a crucial micro moment lose games:

| Metric                | Competitive Requirement | Our Target                       |
| --------------------- | ----------------------- | -------------------------------- |
| Tick time (500 units) | < 16ms (60 FPS smooth)  | < 10ms (8-core desktop)          |
| Render FPS            | 60+ sustained           | 144 target                       |
| Input latency         | < 1 frame               | Sub-tick ordering (D008)         |
| RAM (1000 units)      | < 200MB                 | < 200MB                          |
| Per-tick allocation   | 0 (no GC stutter)       | 0 bytes (invariant)              |
| Desync recovery       | Automatic               | Diagnosed to exact tick + entity |

## Competitive Landscape

### Active Projects

**OpenRA** (C#) — The community standard
- 14.8k GitHub stars, actively maintained, 18 years of community investment
- Latest release: 20250330 (March 2025) — new map editor, HD asset support, post-processing
- Mature community, mod ecosystem, server infrastructure — the project that proved open-source C&C is viable
- Multiplayer-first focus — single-player campaigns often incomplete (Dune 2000: only 1 of 3 campaigns fully playable; TD campaign also incomplete)
- SDK supports non-Westwood games (KKND, Swarm Assault, Hard Vacuum, Dune II remake) — validates our multi-game extensibility approach (D018)

**Vanilla Conquer** (C++)
- Cross-platform builds of actual EA source code
- Not reimagination — just making original compile on modern systems
- Useful reference for original engine behavior

**Chrono Divide** (TypeScript)
- Red Alert 2 running in browser, working multiplayer
- Proof that browser-based RTS is viable
- Study their architecture for WASM target

### Dead/Archived Projects (lessons learned)

**Chronoshift** (C++) — Archived July 2020
- Binary-level reimplementation attempt, only English 3.03 beta patch
- Never reached playable state
- **Lesson:** 1:1 binary compatibility is a dead end

**OpenRedAlert** (C++)
- Based on ancient FreeCNC/FreeRA, barely maintained
- **Lesson:** Building on old foundations doesn't work long-term

### Key Finding

**No Rust-based Red Alert or OpenRA ports exist.** The field is completely open.

## EA Source Release (February 2025)

EA released original Red Alert source code under GPL v3. Benefits:
- Understand exactly how original game logic works (damage, pathfinding, AI)
- Verify Rust implementation against original behavior
- Combined with OpenRA's 17 years of refinements: "how it originally worked" + "how it should work"

Repository: https://github.com/electronicarts/CnC_Red_Alert

## Reference Projects

These are the projects we actively study. Each serves a different purpose — do not treat them as interchangeable.

### OpenRA — https://github.com/OpenRA/OpenRA

**What to study:**
- **Source code:** Trait/component architecture, how they solved the same problems we'll face (fog of war, build queues, harvester AI, naval combat). Our ECS component model maps directly from their traits.
- **Issue tracker:** Community pain points surface here. Recurring complaints = design opportunities for us. Pay attention to issues tagged with performance, pathfinding, modding, and multiplayer.
- **UX/UI patterns:** OpenRA has 17 years of UI iteration. Their command interface (attack-move, force-fire, waypoints, control groups, rally points) is excellent. **Adopt their UX patterns for player interaction.**
- **Mod ecosystem:** Understand what modders actually build so our modding tiers serve real needs.

**What NOT to copy:**
- **Unit balance.** OpenRA deliberately rebalances units away from the original game toward competitive multiplayer fairness. This makes iconic units feel underwhelming (see Gameplay Philosophy below). We default to classic RA balance. This pattern repeats across every game they support — Dune 2000 units are also rebalanced away from originals.
- **Simulation internals bug-for-bug.** We're not bit-identical — we're better-algorithms-identical.
- **Campaign neglect.** OpenRA's multiplayer-first culture has left single-player campaigns systematically incomplete across all supported games. Dune 2000 has only 1 of 3 campaigns playable; TD campaigns are also incomplete; there's no automatic mission progression (players exit to menu between missions). **Campaign completeness is a first-class goal for us** — every shipped game module must have all original campaigns fully playable with continuous flow (D021). Beyond completeness, our campaign graph system enables what OpenRA can't: branching outcomes (different mission endings lead to different next missions), persistent unit rosters (surviving units carry forward with veterancy), and failure that continues the story instead of forcing a restart — inspired by Operation Flashpoint.

### EA Red Alert Source — https://github.com/electronicarts/CnC_Red_Alert

**What to study:**
- **Exact gameplay values.** Damage tables, weapon ranges, unit speeds, fire rates, armor multipliers. This is the canonical source for "how Red Alert actually plays." When OpenRA and EA source disagree on a value, **EA source wins for our classic preset.**
- **Order processing.** The `OutList`/`DoList` pattern maps directly to our `PlayerOrder → TickOrders → apply_tick()` architecture.
- **Integer math patterns.** Original RA uses integer math throughout for determinism — validates our fixed-point approach.
- **AI behavior.** How the original skirmish AI makes decisions, builds bases, attacks. Reference for `ic-ai`.

**Caution:** The codebase is 1990s C++ — tangled, global state everywhere, no tests. Extract knowledge, don't port patterns.

### EA Remastered Collection — https://github.com/electronicarts/CnC_Remastered_Collection

**What to study:**
- **UI/UX design.** The Remastered Collection has the best UI/UX of any C&C game. Clean, uncluttered, scales well to modern resolutions. **This is our gold standard for UI layout and information density.** Where OpenRA sometimes overwhelms with GUI elements, Remastered gets the density right.
- **HD asset pipeline.** How they upscaled and re-rendered classic assets while preserving the feel. Relevant for our rendering pipeline.
- **Sidebar design.** Classic sidebar with modern polish — study how they balanced information vs screen real estate.

### EA Tiberian Dawn Source — https://github.com/electronicarts/CnC_Tiberian_Dawn

**What to study:**
- **Shared C&C engine lineage.** TD and RA share engine code. Cross-referencing both clarifies ambiguous behavior in either.
- **Game module reference.** When we build the Tiberian Dawn game module (D018), this is the authoritative source for TD-specific logic.
- **Format compatibility.** TD `.mix` files, terrain, and sprites share formats with RA — validation data for `ra-formats`.

### Chrono Divide — (TypeScript, browser-based RA2)

**What to study:**
- Architecture reference for our WASM/browser target
- Proof that browser-based RTS with real multiplayer is viable

## Gameplay Philosophy

### Classic Feel, Modern UX

Iron Curtain's default gameplay targets the **original Red Alert experience**, not OpenRA's rebalanced version. This is a deliberate choice:

- **Units should feel powerful and distinct.** Tanya kills soldiers from range, fast, and doesn't die easily — she's a special operative, not a fragile glass cannon. MiG attacks should be devastating. V2 rockets should be terrifying. Tesla coils should fry anything that comes close. **If a unit was iconic in the original game, it should feel iconic here.**
- **OpenRA's competitive rebalancing** makes units more "fair" for tournament play but can dilute the personality of iconic units. That's a valid design choice for competitive players, but it's not *our* default.
- **OpenRA's UX/UI innovations are genuinely excellent** and we adopt them: attack-move, waypoint queuing, production queues, control group management, minimap interactions, build radius visualization. The Remastered Collection's UI density and layout is our gold standard for visual design.

### Switchable Balance Presets (D019)

Because reasonable people disagree on balance, the engine supports **balance presets** — switchable sets of unit values loaded from YAML at game start:

| Preset              | Source                       | Feel                                   |
| ------------------- | ---------------------------- | -------------------------------------- |
| `classic` (default) | EA source code values        | Powerful iconic units, asymmetric fun  |
| `openra`            | OpenRA's current balance     | Competitive fairness, tournament-ready |
| `remastered`        | Remastered Collection values | Slight tweaks to classic for QoL       |
| `custom`            | User-defined YAML overrides  | Full modder control                    |

Presets are just YAML files in `rules/presets/`. Switching preset = loading a different set of unit/weapon/structure YAML. No code changes, no mod required. The lobby UI exposes preset selection.

This is not a modding feature — it's a first-class game option. "Classic" vs "OpenRA" balance is a settings toggle, not a total conversion.

### Toggleable QoL Features (D033)

Beyond balance, every quality-of-life improvement added by OpenRA or the Remastered Collection is **individually toggleable**: attack-move, waypoint queuing, multi-queue production, health bar visibility, range circles, guard command, and dozens more. Built-in presets group these into coherent experience profiles:

| Experience Profile         | Balance (D019) | Theme (D032) | QoL Behavior (D033) | Feel                                     |
| -------------------------- | -------------- | ------------ | ------------------- | ---------------------------------------- |
| **Vanilla RA**             | `classic`      | `classic`    | `vanilla`           | Authentic 1996 — warts and all           |
| **OpenRA**                 | `openra`       | `modern`     | `openra`            | Full OpenRA experience                   |
| **Remastered**             | `remastered`   | `remastered` | `remastered`        | Remastered Collection feel               |
| **Iron Curtain** (default) | `classic`      | `modern`     | `iron_curtain`      | Classic balance + best QoL from all eras |

Select a profile, then override any individual setting. Want classic balance with OpenRA's attack-move but without build radius circles? Done. Good defaults, full customization.

See `src/decisions/09d/D019-balance-presets.md` and `src/decisions/09d/D033-qol-presets.md`, and D032 in `src/decisions/09c-modding.md`.

## Timing Assessment

- EA source just released (fresh community interest)
- Rust gamedev ecosystem mature (wgpu stable, ECS crates proven)
- No competition in Rust RTS space
- OpenRA showing architectural age despite active development
- WASM/browser gaming increasingly viable
- Multiple EA source releases provide unprecedented reference material

**Verdict:** Window of opportunity is open now.
