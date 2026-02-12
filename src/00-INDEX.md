# Iron Curtain — Design Documentation

## Project: Rust-Native RTS Engine

**Status:** Pre-development (design phase)  
**Date:** 2026-02-06  
**Codename:** Iron Curtain  
**Author:** David Krasnitsky  

## What This Is

A Rust-native RTS engine that supports OpenRA resource formats (`.mix`, `.shp`, `.pal`, YAML rules) and reimagines internals with modern architecture. Not a clone or port — a complementary project offering different tradeoffs (performance, modding, portability) with full OpenRA mod compatibility as the zero-cost migration path. OpenRA is an excellent project; IC explores what a clean-sheet Rust design can offer the same community.

## Document Index

| #   | Document                | Purpose                                                                                             | Read When...                                                                      |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 01  | `01-VISION.md`          | Project goals, competitive landscape, why this should exist                                         | You need to understand the project's purpose and market position                  |
| 02  | `02-ARCHITECTURE.md`    | Core architecture: crate structure, ECS, sim/render split, game loop                                | You need to make any structural or code-level decision                            |
| 03  | `03-NETCODE.md`         | Unified relay lockstep netcode, sub-tick ordering, adaptive run-ahead, NetworkModel trait           | You're working on multiplayer, networking, or the sim/network boundary            |
| 04  | `04-MODDING.md`         | YAML rules, Lua scripting, WASM modules, templating                                                 | You're working on data formats, scripting, or mod support                         |
| 05  | `05-FORMATS.md`         | File formats, original source code insights, compatibility layer                                    | You're working on asset loading, ra-formats crate, or OpenRA interop              |
| 06  | `06-SECURITY.md`        | Threat model, vulnerabilities, mitigations for online play                                          | You're working on networking, modding sandbox, or anti-cheat                      |
| 07  | `07-CROSS-ENGINE.md`    | Cross-engine compatibility, protocol adapters, reconciliation                                       | You're exploring OpenRA interop or multi-engine play                              |
| 08  | `08-ROADMAP.md`         | 36-month development plan with phased milestones                                                    | You need to plan work or understand phase dependencies                            |
| 09  | `09-DECISIONS.md`       | Decision log with rationale for every major choice                                                  | You want to understand WHY a decision was made, or revisit one                    |
| 10  | `10-PERFORMANCE.md`     | Efficiency-first performance philosophy, targets, profiling                                         | You're optimizing a system, choosing algorithms, or adding parallelism            |
| 11  | `11-OPENRA-FEATURES.md` | OpenRA feature catalog (~700 traits), gap analysis, migration mapping                               | You're assessing feature parity or planning which systems to build next           |
| 12  | `12-MOD-MIGRATION.md`   | Combined Arms mod migration, Remastered recreation feasibility                                      | You're validating modding architecture against real-world mods                    |
| 13  | `13-PHILOSOPHY.md`      | Development philosophy, game design principles, design review, lessons from C&C creators and OpenRA | You're reviewing design/code, evaluating a feature, or resolving a design tension |

## Key Architectural Invariants

These are non-negotiable across the entire project:

1. **Simulation is pure and deterministic.** No I/O, no floats, no network awareness. Takes orders, produces state. Period.
2. **Network model is pluggable via trait.** `GameLoop<N: NetworkModel, I: InputSource>` is generic over both network model and input source. The sim has zero imports from `ic-net`. They share only `ic-protocol`. Swapping lockstep for rollback touches zero sim code.
3. **Modding is tiered.** YAML (data) → Lua (scripting) → WASM (power). Each tier is optional and sandboxed.
4. **Bevy as framework.** ECS scheduling, rendering, asset pipeline, audio — Bevy handles infrastructure so we focus on game logic. Custom render passes and SIMD only where profiling justifies it.
5. **Efficiency-first performance.** Better algorithms, cache-friendly ECS, zero-allocation hot paths, simulation LOD, amortized work — THEN multi-core as a bonus layer. A 2-core laptop must run 500 units smoothly.
6. **Real YAML, not MiniYAML.** Standard `serde_yaml` with inheritance resolved at load time.
7. **OpenRA compatibility is at the data/community layer, not the simulation layer.** Same mods, same maps, shared server browser — but not bit-identical simulation.
8. **Full resource compatibility with Red Alert and OpenRA.** Every .mix, .shp, .pal, .aud, .oramap, and YAML rule file from the original game and OpenRA must load correctly. This is non-negotiable — the community's existing work is sacred.
9. **Engine core is game-agnostic.** No game-specific enums, resource types, or unit categories in engine core. Positions are 3D (`WorldPos { x, y, z }`). System pipeline is registered per game module, not hardcoded.
10. **Platform-agnostic by design.** Input is abstracted behind `InputSource` trait. UI layout is responsive (adapts to screen size via `ScreenClass`). No raw `std::fs` — all assets go through Bevy's asset system. Render quality is runtime-configurable.

## Crate Structure Overview

```
iron-curtain/
├── ra-formats     # .mix, .shp, .pal, YAML parsing, MiniYAML converter (C&C-specific, keeps ra- prefix)
├── ic-protocol    # PlayerOrder, TimestampedOrder, OrderCodec trait (SHARED boundary)
├── ic-sim         # Deterministic simulation (Bevy FixedUpdate systems)
├── ic-net         # NetworkModel trait + implementations (Bevy plugins)
├── ic-render      # Isometric rendering, shaders, post-FX (Bevy plugin)
├── ic-ui          # Game chrome: sidebar, minimap, build queue (Bevy UI)
├── ic-editor      # SDK: scenario editor, asset studio, campaign editor, Game Master mode (D038+D040, Bevy app)
├── ic-audio       # .aud playback, EVA, music (Bevy audio plugin)
├── ic-script      # Lua + WASM mod runtimes
├── ic-ai          # Skirmish AI, mission scripting
├── ic-llm         # LLM mission/campaign generation, asset generation, adaptive difficulty
└── ic-game        # Top-level Bevy App, ties all game plugins together (NO editor code)
```
