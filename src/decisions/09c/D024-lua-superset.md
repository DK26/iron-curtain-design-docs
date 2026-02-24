## D024: Lua API — Strict Superset of OpenRA

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 4 (Lua scripting runtime), Phase 6a (full API stabilization)
- **Execution overlay mapping:** `M4.SCRIPT.LUA_RUNTIME` (P-Core); API surface finalized at `M6.MOD.API_STABLE`
- **Deferred features / extensions:** `LLM` global (Phase 7), `Workshop` global (Phase 6a)
- **Deferral trigger:** Respective milestone start
- **Canonical for:** Lua scripting API surface, OpenRA mission script compatibility, IC extension globals
- **Scope:** `ic-script` crate, Lua VM integration, `04-MODDING.md`
- **Decision:** IC's Lua API is a strict superset of OpenRA's 16 global objects. All OpenRA Lua missions run unmodified — same function names, same parameter signatures, same return types. IC adds extension globals (Campaign, Weather, Layer, SubMap, etc.) that do not conflict with any OpenRA name.
- **Why:**
  - Hundreds of existing OpenRA mission scripts must work without modification
  - Superset guarantees forward compatibility — new IC globals never shadow existing ones
  - Modders learn one API; skills transfer between OpenRA and IC
  - API surface is testable independently of the Lua VM implementation (D004)
- **Non-goals:** Binary compatibility with OpenRA's C# Lua host. IC uses `mlua` (Rust); same API surface, different host implementation. Also not a goal: supporting OpenRA's deprecated or internal-only Lua functions.
- **Invariants preserved:** Deterministic sim (Lua scripts produce `PlayerOrder`s that flow through the sim; scripts do not directly mutate sim state). Sandbox boundary (resource limits, no filesystem access without capability tokens).
- **Public interfaces / types / commands:** 16 OpenRA globals + 11 IC extension globals (see tables below)
- **Affected docs:** `04-MODDING.md` § Lua API, `modding/campaigns.md` (Campaign global examples)
- **Keywords:** Lua API, scripting, OpenRA compatibility, mission scripting, globals, superset, Campaign, Weather, Trigger

---

### OpenRA-Compatible Globals (16, all supported identically)

| Global | Purpose |
|--------|---------|
| `Actor` | Create, query, manipulate actors |
| `Map` | Terrain, bounds, spatial queries |
| `Trigger` | Event hooks (OnKilled, AfterDelay, OnEnteredFootprint, etc.) |
| `Media` | Audio, video, text display |
| `Player` | Player state, resources, diplomacy |
| `Reinforcements` | Spawn units at edges/drops |
| `Camera` | Pan, position, shake |
| `DateTime` | Game time queries (ticks, seconds) |
| `Objectives` | Mission objective management |
| `Lighting` | Global lighting control |
| `UserInterface` | UI text, notifications |
| `Utils` | Math, random, table utilities |
| `Beacon` | Map beacon management |
| `Radar` | Radar ping control |
| `HSLColor` | Color construction |
| `WDist` | Distance unit conversion |

### IC Extension Globals (additive, no conflicts)

| Global | Purpose | Phase |
|--------|---------|-------|
| `Campaign` | Branching campaign state, roster access, flags (D021) | Phase 4 |
| `Weather` | Dynamic weather control (D022) | Phase 4 |
| `Layer` | Map layer activation/deactivation for dynamic mission flow | Phase 4 |
| `SubMap` | Sub-map transitions (interiors, underground) | Phase 6b |
| `Region` | Named region queries | Phase 4 |
| `Var` | Mission/campaign variable access | Phase 4 |
| `Workshop` | Mod metadata queries | Phase 6a |
| `LLM` | LLM integration hooks (D016) | Phase 7 |
| `Achievement` | Achievement trigger/query API (D036) | Phase 5 |
| `Tutorial` | Tutorial step management, hints, UI highlighting (D065) | Phase 4 |
| `Ai` | AI scripting primitives — force composition, patrol, attack (D043) | Phase 4 |

### Stability Guarantee

- OpenRA globals **never change signature**. Function names, parameter types, and return types are frozen.
- New IC extension globals may be added in any phase. Extension globals never shadow OpenRA names.
- **Major version bumps** (IC 2.0, 3.0, etc.) are the only mechanism for breaking API changes. Within a major version, the API surface is append-only.
- The API specification is the contract, not the VM implementation. Switching Lua VM backends (`mlua` → LuaJIT, Luau, or future alternative) must not change mod script behavior.

### API Design Principle

The Lua API is defined as an engine-level abstraction independent of the VM implementation. This follows Valve's Source Engine VScript pattern: the API surface is the stable contract, not the runtime. A mod that calls `Actor.Create("tank", pos)` depends on the API spec, not on how `mlua` dispatches the call. WASM mods (Tier 3) access the equivalent API through host functions with identical semantics — prototype in Lua, port to WASM by translating syntax.
