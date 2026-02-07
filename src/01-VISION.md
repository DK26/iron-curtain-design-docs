# 01 — Vision & Competitive Landscape

## Project Vision

Build a Rust-native RTS engine that:
- Supports OpenRA resource formats (`.mix`, `.shp`, `.pal`, YAML rules)
- Reimagines internals with modern architecture (not a port)
- Offers superior performance, modding, portability, and multiplayer
- Provides OpenRA mod compatibility as the zero-cost migration path
- Is **game-agnostic at the engine layer** — Red Alert is the first game module; RA2, Tiberian Dawn, and original games are future modules on the same engine

## Why This Deserves to Exist

### Capabilities Beyond OpenRA and the Remastered Collection

| Capability         | Remastered Collection              | OpenRA                                  | Iron Curtain                                               |
| ------------------ | ---------------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| Engine             | Original C++ with patches          | C# / .NET (2007)                        | Rust + Bevy (2026)                                         |
| Platforms          | Windows, Xbox                      | Windows, macOS, Linux                   | All + Browser + Mobile                                     |
| Max units (smooth) | ~200 (original engine limits)      | ~300-500 (community reports lag beyond) | 2000+ target                                               |
| Modding            | Steam Workshop maps, limited API   | MiniYAML + C# (recompile for deep mods) | YAML + Lua + WASM (no recompile ever)                      |
| AI content         | Fixed campaigns                    | Fixed campaigns + community missions    | Branching campaigns + LLM-generated missions               |
| Multiplayer        | Rebuilt but server issues reported | Lockstep with frequent desyncs          | Relay server, desync diagnosis, signed replays             |
| Graphics pipeline  | Fixed 4K sprite upscale            | SDL/OpenGL basic rendering              | Bevy + wgpu: shaders, post-FX, dynamic lighting, particles |
| Source             | Closed                             | Open (GPL)                              | Open (GPL)                                                 |
| Community assets   | Separate ecosystem                 | 18 years of maps/mods                   | Loads all OpenRA assets + migration tools                  |

### New Capabilities Not Found Elsewhere

**LLM-Generated Missions and Campaigns**

An in-game interface where players describe a scenario in natural language and receive a fully playable mission — map layout, objectives, enemy AI, triggers, briefing text. Generated content is standard YAML + Lua, fully editable and shareable.

Future extensions: multi-mission campaign generation, adaptive difficulty that responds to player style, cooperative scenario generation for multiplayer.

This transforms Red Alert from a game with finite content to a game with infinite content.

**Bevy Rendering Pipeline**

Building on Bevy's modern rendering stack unlocks visual capabilities impossible on OpenRA's SDL/OpenGL or the Remastered Collection's fixed pipeline:

- Post-processing: bloom, color grading, screen-space reflections on water
- Dynamic lighting: explosions illuminate surroundings, day/night cycles
- GPU particle systems: smoke, fire, debris, weather (rain, snow, sandstorm, fog, blizzard)
- Shader effects: chrono-shift shimmer, iron curtain glow, tesla arcs, nuclear flash
- Smooth camera: sub-pixel rendering, cinematic replay camera, smooth zoom
- HD asset pipeline alongside classic sprites

The visual goal: Red Alert as you remember it through rose-tinted glasses — classic aesthetic, modern polish.

**In-Engine Map Editor**

OpenRA's map editor is a standalone tool. Our editor runs inside the game with live preview, instant testing, and direct publishing. Lower barrier to content creation.

### OpenRA's Limitations (what we improve on)

| Area         | OpenRA Today                              | Our Engine                                           |
| ------------ | ----------------------------------------- | ---------------------------------------------------- |
| Runtime      | C# / .NET — GC pauses, heavy runtime      | Rust — no GC, predictable perf                       |
| Threading    | Single-threaded game loop                 | Parallel systems via ECS                             |
| Modding      | Powerful but requires C# for deep mods    | YAML + Lua + WASM (no compile step)                  |
| Map editor   | Separate tool, recently improved          | In-engine editor (Phase 6)                           |
| Multiplayer  | Desyncs common, hard to debug             | Snapshottable sim enables desync pinpointing         |
| Portability  | Desktop only (Mono/.NET)                  | Native + WASM (browser) + mobile                     |
| Engine age   | Started 2007, showing architectural debt  | Clean-sheet modern design                            |
| Campaigns    | Incomplete — many are broken or cut short | Branching campaigns with persistent state (D021)     |
| Mission flow | Manual mission selection between levels   | Continuous flow: briefing → mission → debrief → next |  | Asset quality | Cannot fix original palette/sprite flaws | Bevy post-FX: palette correction, color grading, optional upscaling |
### What Makes People Actually Switch

1. **Better performance** — visible: bigger maps, more units, no stutters
2. **Better modding** — WASM scripting, in-engine editor, hot reload
3. **Campaigns that flow** — branching paths, persistent units, no menu between missions, failure continues the story
4. **Runs everywhere** — browser via WASM, mobile, Steam Deck natively
4. **Better multiplayer** — desync debugging, smoother netcode, relay server
5. **OpenRA mod compatibility** — existing community migrates without losing work

Item 5 is the linchpin. If existing mods just work, migration cost drops to near zero.

## Competitive Landscape

### Active Projects

**OpenRA** (C#) — The project to beat
- 14.8k GitHub stars, actively maintained
- Latest release: 20250330 (March 2025) — new map editor, HD asset support, post-processing
- Mature community, mod ecosystem, server infrastructure
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
- **OpenRA's competitive rebalancing** makes units more "fair" for tournament play but strips the personality from the game. Every unit feels interchangeable and underwhelming. That's a valid design choice for competitive players, but it's not *our* default.
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

See `src/04-MODDING.md` § "Balance Presets" and D019 in `src/09-DECISIONS.md`.

## Timing Assessment

- EA source just released (fresh community interest)
- Rust gamedev ecosystem mature (wgpu stable, ECS crates proven)
- No competition in Rust RTS space
- OpenRA showing architectural age despite active development
- WASM/browser gaming increasingly viable
- Multiple EA source releases provide unprecedented reference material

**Verdict:** Window of opportunity is open now.
