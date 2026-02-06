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
| AI content         | Fixed campaigns                    | Fixed campaigns + community missions    | LLM-generated missions and campaigns                       |
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
- GPU particle systems: smoke, fire, debris, weather
- Shader effects: chrono-shift shimmer, iron curtain glow, tesla arcs, nuclear flash
- Smooth camera: sub-pixel rendering, cinematic replay camera, smooth zoom
- HD asset pipeline alongside classic sprites

The visual goal: Red Alert as you remember it through rose-tinted glasses — classic aesthetic, modern polish.

**In-Engine Map Editor**

OpenRA's map editor is a standalone tool. Our editor runs inside the game with live preview, instant testing, and direct publishing. Lower barrier to content creation.

### OpenRA's Limitations (what we improve on)

| Area        | OpenRA Today                             | Our Engine                                   |
| ----------- | ---------------------------------------- | -------------------------------------------- |
| Runtime     | C# / .NET — GC pauses, heavy runtime     | Rust — no GC, predictable perf               |
| Threading   | Single-threaded game loop                | Parallel systems via ECS                     |
| Modding     | Powerful but requires C# for deep mods   | YAML + Lua + WASM (no compile step)          |
| Map editor  | Separate tool, recently improved         | In-engine editor (Phase 6)                   |
| Multiplayer | Desyncs common, hard to debug            | Snapshottable sim enables desync pinpointing |
| Portability | Desktop only (Mono/.NET)                 | Native + WASM (browser) + mobile             |
| Engine age  | Started 2007, showing architectural debt | Clean-sheet modern design                    |

### What Makes People Actually Switch

1. **Better performance** — visible: bigger maps, more units, no stutters
2. **Better modding** — WASM scripting, in-engine editor, hot reload
3. **Runs everywhere** — browser via WASM, mobile, Steam Deck natively
4. **Better multiplayer** — desync debugging, smoother netcode, relay server
5. **OpenRA mod compatibility** — existing community migrates without losing work

Item 5 is the linchpin. If existing mods just work, migration cost drops to near zero.

## Competitive Landscape

### Active Projects

**OpenRA** (C#) — The project to beat
- 14.8k GitHub stars, actively maintained
- Latest release: 20250330 (March 2025) — new map editor, HD asset support, post-processing
- Mature community, mod ecosystem, server infrastructure

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

## Timing Assessment

- EA source just released (fresh community interest)
- Rust gamedev ecosystem mature (wgpu stable, ECS crates proven)
- No competition in Rust RTS space
- OpenRA showing architectural age despite active development
- WASM/browser gaming increasingly viable

**Verdict:** Window of opportunity is open now.
