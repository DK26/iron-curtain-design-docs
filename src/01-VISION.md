# 01 — Vision & Competitive Landscape

## Project Vision

Build a Rust-native RTS engine that:
- Supports OpenRA resource formats (`.mix`, `.shp`, `.pal`, YAML rules)
- Reimagines internals with modern architecture (not a port)
- Explores different tradeoffs: performance, modding depth, portability, and multiplayer architecture
- Provides OpenRA mod compatibility as the zero-cost migration path
- Is **game-agnostic at the engine layer** — Red Alert is the first game module; RA2, Tiberian Dawn, and original games are future modules on the same engine (RA2 is a future community goal, not a scheduled deliverable)

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

**In-Engine Map Editor**

OpenRA's map editor is a standalone tool. Our editor runs inside the game with live preview, instant testing, and direct publishing. Lower barrier to content creation.

### Architectural Differences from OpenRA

OpenRA is a mature, actively maintained project with 18 years of community investment. These are genuine architectural differences, not criticisms:

| Area          | OpenRA                                   | Iron Curtain                                                        |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| Runtime       | C# / .NET (mature, productive)           | Rust — no GC, predictable perf, WASM target                         |
| Threading     | Single-threaded game loop (verified)     | Parallel systems via ECS                                            |
| Modding       | Powerful but requires C# for deep mods   | YAML + Lua + WASM (no compile step)                                 |
| Map editor    | Separate tool, recently improved         | In-engine editor (Phase 6)                                          |
| Multiplayer   | 135+ desync issues tracked               | Snapshottable sim designed for desync pinpointing                   |
| Competitive   | Community ladders via CnCNet             | Integrated ranked matchmaking, tournament mode                      |
| Portability   | Desktop (Windows, macOS, Linux)          | Desktop + WASM (browser) + mobile                                   |
| Maturity      | 18 years, battle-tested, large community | Clean-sheet modern design, unproven                                 |
| Campaigns     | Some incomplete (TD, Dune 2000)          | Branching campaigns with persistent state (D021)                    |
| Mission flow  | Manual mission selection between levels  | Continuous flow: briefing → mission → debrief → next                |
| Asset quality | Cannot fix original palette/sprite flaws | Bevy post-FX: palette correction, color grading, optional upscaling |

### What Makes People Actually Switch

1. **Better performance** — visible: bigger maps, more units, no stutters
2. **Campaigns that flow** — branching paths, persistent units, no menu between missions, failure continues the story
3. **Better modding** — WASM scripting, in-engine editor, hot reload
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

Red Alert has a dedicated competitive community (primarily through OpenRA and CnCNet). CnCNet provides community ladders and tournament infrastructure, but there's no integrated ranked system, no automated anti-cheat, and desyncs remain a persistent issue (135+ tracked in OpenRA's issue tracker). This is a significant opportunity.

### Ranked Matchmaking

- **Rating system:** Glicko-2 (improvement over Elo — accounts for rating volatility and inactivity, used by Lichess, FIDE, many modern games)
- **Seasons:** 3-month ranked seasons with placement matches (10 games), league tiers (Bronze → Silver → Gold → Platinum → Diamond → Master), end-of-season rewards
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
- **AI behavior.** How the original skirmish AI makes decisions, builds bases, attacks. Reference for `ra-ai`.

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

See D019, D032, and D033 in `src/09-DECISIONS.md`.

## Timing Assessment

- EA source just released (fresh community interest)
- Rust gamedev ecosystem mature (wgpu stable, ECS crates proven)
- No competition in Rust RTS space
- OpenRA showing architectural age despite active development
- WASM/browser gaming increasingly viable
- Multiple EA source releases provide unprecedented reference material

**Verdict:** Window of opportunity is open now.
