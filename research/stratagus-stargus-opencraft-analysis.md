# Stratagus / Stargus / OpenCraft — Analysis for Iron Curtain

> **Date:** 2026-02-13
> **Purpose:** Document lessons applicable to Iron Curtain from the Stratagus engine, its Stargus (StarCraft) game module, and the OpenCraft project.

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Stratagus Engine Architecture](#2-stratagus-engine-architecture)
3. [Game Module Pattern](#3-game-module-pattern)
4. [Lua AI Scripting Model](#4-lua-ai-scripting-model)
5. [External AI Interface](#5-external-ai-interface)
6. [Lua Sandbox and Security](#6-lua-sandbox-and-security)
7. [Difficulty Scaling via Per-Player Speed Factors](#7-difficulty-scaling-via-per-player-speed-factors)
8. [Data Extraction Pipeline (Stargus)](#8-data-extraction-pipeline-stargus)
9. [OpenCraft — Minimal Findings](#9-opencraft--minimal-findings)
10. [Lessons for Iron Curtain](#10-lessons-for-iron-curtain)
11. [Sources](#11-sources)

---

## 1. Project Overview

### Stratagus

**Repo:** `Wargus/stratagus` | **Language:** C++ 85%, GLSL 10%, Lua | **License:** GPL-2.0 | **Stars:** ~703

Stratagus is a **game-agnostic real-time strategy engine** originally derived from FreeCraft (itself derived from Craft, a WarCraft engine clone). It powers multiple game modules:

- **Wargus** — WarCraft II data (the primary/most-complete module)
- **Stargus** — StarCraft data (incomplete, unmaintained)
- **War1gus** — WarCraft I data

The engine provides: rendering, pathfinding (A*), networking (P2P UDP lockstep), AI, Lua scripting, save/load, map editing. Game-specific content (unit types, AI scripts, tilesets, campaign logic) lives entirely in Lua scripts and data files — the engine binary is identical across all game modules.

### Stargus

**Repo:** `Wargus/stargus` | **Language:** C++ 78.5%, Lua 11.2% | **Stars:** ~145

Stargus is a **data extraction and conversion tool** plus Lua game scripts that adapt StarCraft's assets for the Stratagus engine. It is not a game engine — it sits on top of Stratagus. Key components:

- **startool** — extracts assets from StarCraft's MPQ archives (sprites, palettes, tilesets, sounds, videos)
- **Kaitai Struct parsers** — formal binary format schemas for StarCraft `.dat` files (`units_dat.ksy`, `weapons_dat.ksy`, `flingy_dat.ksy`, etc.)
- **Lua game scripts** — unit definitions, AI configurations, tileset mappings for Stratagus

The project is tagged "incomplete" and "unmaintained" on GitHub.

### OpenCraft

**Repo:** `forrestv/opencraft` | **Language:** Python | **Stars:** ~4

Self-described as "Open-source reimplementation of Starcraft. Mainly useful for Python Starcraft file format readers." Contains two versions (v1, v2), each with format readers for palettes, tilesets, maps, fonts, `.spk` files, `.tbl` string tables, and unit data. Includes a basic pathfinder (C extension exposed to Python) and minimal game loop. Inactive project — no meaningful architecture lessons for Iron Curtain.

---

## 2. Stratagus Engine Architecture

### Initialization Sequence

```
InitLua()
  → LuaRegisterModules()     -- registers C functions into Lua
    → AiCclRegister()         -- AI-specific Lua functions
    → PathfinderCclRegister() -- pathfinding config
    → ...
  → InitAiModule()
  → InitSound()
  → LoadCcl("stratagus.lua") -- game module's entry script
  → InitVideo()
```

The engine's initialization is **Lua-first**: all module registration happens before the main game script loads. The game module's `stratagus.lua` then defines unit types, tilesets, AI behaviors, and game rules — all in Lua.

### AI Tick Pipeline

Called once per second for each AI player:

```
AiEachSecond(player)
  → AiExecuteScript()    -- advance the AI's Lua script (coroutine-like)
  → AiCheckUnits()       -- verify all requested units exist
  → AiResourceManager()  -- allocate harvesters based on Collect[] ratios
  → AiForceManager()     -- recruit units into force composition targets
  → AiCheckMagic()       -- handle spell/ability usage
  → AiSendExplorers()    -- dispatch exploration (rate-limited: 1 per 5 seconds)
```

This is the same **priority-based manager hierarchy** pattern (Script → Economy → Production → Military → Utility) identified independently in Spring Engine, 0 A.D. Petra, and MicroRTS (see `rts-ai-implementation-survey.md` §9). Stratagus is a fourth independent confirmation.

### Save/Load via Lua Serialization

Stratagus saves game state as **Lua scripts** that reconstruct the state on load. `SaveAiPlayer()` emits:

```lua
DefineAiPlayer(0,
  "ai-type", "wc2-land-attack",
  "script", "wc2_ai_loop",
  "sleep-cycles", 0,
  "force", {0, "complete", "role", "attack", "types", {3, "unit-knight", 2, "unit-archer"}, ...},
  "collect", {"gold", 50, "wood", 50, "oil", 0},
  ...
)
```

This is elegant for debugging (human-readable save files) but fragile — any change to the Lua API breaks save compatibility. IC's binary snapshot approach (D010) with versioned serialization is more robust.

### Fletcher32 Checksums on Loaded Scripts

Stratagus computes Fletcher32 checksums on loaded Lua scripts for integrity verification. This is a lighter-weight approach than IC's planned Ed25519 signing for Workshop content (D030), but validates the principle: verify script integrity before execution.

---

## 3. Game Module Pattern

Stratagus separates engine from game content via a launcher pattern:

```c
// gameheaders/stratagus-game-launcher.h
// Games are separate executables that find the Stratagus binary
// and launch it with their data path as an argument.
```

Each game module (Wargus, Stargus, War1gus) is a separate executable that:
1. Locates the Stratagus engine binary
2. Points it at the module's data directory
3. Stratagus loads the module's `stratagus.lua` entry point

The engine has **zero knowledge** of WC2 vs SC vs WC1. All game-specific content lives in:
- Lua scripts (unit definitions, AI, campaign logic, UI layout)
- Extracted/converted asset files (sprites, audio, tilesets)

**IC parallel:** This directly validates our `GameModule` trait pattern (D018/D039). Stratagus proves that a single RTS engine can power WC1, WC2, and StarCraft — three quite different games — with game-specific content entirely in data and scripts. Our approach is more structured (Rust traits vs. Lua-everything), but the core principle is identical.

---

## 4. Lua AI Scripting Model

### DefineAi and Step Functions

Stratagus AI is defined as named Lua scripts registered with `DefineAi()`:

```lua
DefineAi("wc2-land-attack", "human", "class_ai", custom_ai)
```

The AI script is a **table of step functions** executed sequentially. Each function returns `true` to wait (re-execute next tick) or `false` to advance to the next step:

```lua
local simple_ai = {
    function() return AiSleep(AiGetSleepCycles()) end,
    function() return AiNeed("unit-town-hall") end,
    function() return AiWait("unit-town-hall") end,
    function() return AiSet("unit-peasant", 4) end,
    function() return AiNeed("unit-human-barracks") end,
    function() return AiWait("unit-human-barracks") end,
    function() return AiForce(1, {"unit-footman", 3, "unit-archer", 2}) end,
    function() return AiForceRole(1, "attack") end,
    function() return AiWaitForce(1) end,
    function() return AiAttackWithForce(1) end,
    function() return AiLoop(simple_ai_loop, stratagus.gameData.AIState.loop_index) end,
}
```

### Full Lua AI API

~25 C-registered functions exposed to Lua:

| Function                             | Purpose                                           |
| ------------------------------------ | ------------------------------------------------- |
| `DefineAi(name, race, class, func)`  | Register a named AI script                        |
| `AiNeed(unit_type)`                  | Request that a unit type exists (build if absent) |
| `AiSet(unit_type, count)`            | Set desired count of a unit type                  |
| `AiWait(unit_type)`                  | Block until unit type exists                      |
| `AiForce(id, {type, count, ...})`    | Define a force composition target                 |
| `AiForceRole(id, "attack"/"defend")` | Assign role to a force                            |
| `AiCheckForce(id)`                   | Check if force is at desired strength             |
| `AiWaitForce(id)`                    | Block until force is complete                     |
| `AiAttackWithForce(id)`              | Send force to attack (AI chooses target)          |
| `AiAttackWithForces({ids})`          | Coordinated multi-force attack                    |
| `AiWaitForces({ids})`                | Wait for multiple forces simultaneously           |
| `AiSetCollect({0,50,50,0,0,0,0})`    | Set resource gathering ratios (%)                 |
| `AiSetReserve({0,800,200,...})`      | Set resource minimums to maintain                 |
| `AiSleep(frames)`                    | Pause script execution for N frames               |
| `AiResearch(upgrade)`                | Research an upgrade                               |
| `AiUpgradeTo(unit_type)`             | Upgrade units to improved type                    |
| `AiPlayer()`                         | Get current AI player index                       |
| `AiGetRace()`                        | Get AI player's race/faction                      |
| `AiSetBuildDepots(bool)`             | Toggle automatic depot building                   |
| `AiLoop(table, index)`               | Loop back to start of a step table                |
| `AiDebug(bool)`                      | Toggle AI debug output                            |
| `AiDump()`                           | Dump AI state for debugging                       |
| `AiGetSleepCycles()`                 | Get configured sleep duration                     |
| `AiReleaseForce(id)`                 | Release units from a force                        |

### Composition Target Pattern

`AiForce()` implements a **declarative army composition system**: the modder specifies what they want, and the engine's C++ `AiForceManager()` works to recruit/produce units matching the specification. This is exactly the "composition target" pattern we adopted for IC's `ProductionManager` (D043).

The `AiSetCollect({0, 50, 50, 0, 0, 0, 0})` pattern — percentage-based resource allocation across resource types — maps directly to IC's `EconomyManager` share-based allocation. This is now confirmed across four independent codebases: Stratagus, Spring Engine, 0 A.D., and IC.

### Self-Admitted Limitations

From `src/ai/ai.cpp`:

> *"Stratagus uses a very simple scripted AI. There are no optimizations yet. The complete AI was written on one weekend."*

The AI has no threat assessment, no adaptive strategy, no terrain analysis. Forces attack "the opponent" without strategic coordination. This confirms the pattern seen in EA RA: rushed AI that works but isn't good. IC's research-informed approach (D043 implementation architecture with Lanchester scoring, influence maps, and fuzzy engagement logic) addresses exactly these gaps.

---

## 5. External AI Interface

Stratagus has a **TCP socket-based external AI interface** for reinforcement learning research:

### Engine Side (C++)

```cpp
// AiProcessorSetup(host, port, num_state_vars, num_actions)
// Connects to an external AI agent via TCP socket.
CTCPSocket *s = new CTCPSocket();
s->Connect(h);
buf[0] = 'I';
buf[1] = (uint8_t)stateDim;
buf[2] = (uint8_t)actionDim;
s->Send(buf, 3);

// AiProcessorStep(handle, reward, state_table)
// Sends state + reward, receives action index.
// Protocol: 'S' prefix + uint32 reward + N uint32 state vars → recv uint8 action

// AiProcessorEnd(handle)
// Sends final state with 'E' prefix, closes socket.
```

### External Agent Side (Python)

```python
# external_ai_example.py
sock = socket.socket(family=socket.AF_INET)
sock.bind(("127.0.0.1", 9292))
sock.listen(5)

while True:
    (clientsocket, address) = sock.accept()
    while True:
        command = clientsocket.recv(1)
        if command == b"I":
            num_state = ord(clientsocket.recv(1))
            num_actions = ord(clientsocket.recv(1))
        elif command == b"S":
            # receive state variables
            args = struct.unpack(state_fmt, r)
            # select action (random, RL policy, etc.)
            act = random.choice(range(num_actions))
            clientsocket.sendall(bytearray([act]))
        elif command == b"E":
            # episode ended
            break
```

### Relevance to IC

This is a **simple but functional interface** for ML/RL training. It validates the concept of an external AI socket protocol. IC's `AiStrategy` trait (D041) is more structured, but we should consider:

1. **Headless training mode** as part of `ic mod test` — expose game state via a similar protocol for ML researchers
2. **`LlmOrchestratorAi` (D044)** could optionally use a socket interface instead of in-process LLM calls
3. **D042 (Player behavioral profiles)** — external training harness for `StyleDrivenAi`

The protocol is crude (flat array of uint32 state variables, single byte action index), but the architecture — engine as environment, external process as agent — is sound. IC's version should use structured state representation (JSON or protobuf) and support async communication to avoid blocking the sim tick.

---

## 6. Lua Sandbox and Security

### Selective Standard Library Loading

Stratagus selectively loads Lua standard libraries:

```cpp
void InitLua()
{
    // Always loaded:
    luaopen_base(Lua);
    luaopen_table(Lua);
    luaopen_string(Lua);
    luaopen_math(Lua);
    luaopen_debug(Lua);
    
    // Conditionally loaded (development only):
    #ifdef DEBUG
    luaopen_io(Lua);
    luaopen_package(Lua);
    #endif
    
    // Release builds: no io, no package — scripts cannot
    // read/write files or load external modules.
}
```

In release builds, `io` and `package` are excluded entirely. Scripts cannot access the filesystem or load arbitrary Lua modules.

### IC Implications

IC's Lua sandbox (04-MODDING.md) already specifies "no `io`, `os`, `require` from filesystem" but doesn't enumerate which standard libraries **are** loaded. Stratagus provides a concrete precedent. IC should be **stricter** than Stratagus:

| Lua Stdlib  | Stratagus (release) | IC Recommendation | Rationale                                                                                                                                                                |
| ----------- | ------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `base`      | ✅                   | ✅ (selective)     | Remove `dofile`, `loadfile`, `load` (arbitrary code execution)                                                                                                           |
| `table`     | ✅                   | ✅                 | Safe — table manipulation only                                                                                                                                           |
| `string`    | ✅                   | ✅                 | Safe — string manipulation only                                                                                                                                          |
| `math`      | ✅                   | ✅ (modified)      | Replace `math.random` with deterministic engine PRNG                                                                                                                     |
| `os`        | ✅                   | ❌                 | Stratagus loads this but IC shouldn't — `os.execute()`, `os.remove()`, `os.rename()` are dangerous. IC already removes `os.time/clock/date`; better to exclude entirely. |
| `debug`     | ✅                   | ❌                 | Can inspect/modify internals, bypass sandboxing. Development-only if needed.                                                                                             |
| `io`        | ❌                   | ❌                 | Filesystem access — never in sandbox                                                                                                                                     |
| `package`   | ❌                   | ❌                 | Module loading — never in sandbox                                                                                                                                        |
| `coroutine` | Implicit            | ✅                 | Useful for mission scripting flow control                                                                                                                                |
| `utf8`      | N/A (Lua 5.3+)      | ✅                 | Safe — Unicode string handling                                                                                                                                           |

---

## 7. Difficulty Scaling via Per-Player Speed Factors

Stratagus's `CPlayer` struct includes per-player speed multipliers:

```cpp
class CPlayer {
    int SpeedResourcesHarvest[MaxCosts]{}; // speed factor for harvesting resources
    int SpeedResourcesReturn[MaxCosts]{};  // speed factor for returning resources
    int SpeedBuild = 0;                    // speed factor for building
    int SpeedTrain = 0;                    // speed factor for training
    int SpeedUpgrade = 0;                  // speed factor for upgrading
    int SpeedResearch = 0;                 // speed factor for researching
};
```

These allow AI players to have resource/production bonuses without changing the underlying game logic. This is exactly IC's **engine-level scaling axis** in the two-axis difficulty system (D043) — inspired by 0 A.D. and AoE2, and now independently confirmed in Stratagus.

---

## 8. Data Extraction Pipeline (Stargus)

### Kaitai Struct for Binary Format Parsing

Stargus uses [Kaitai Struct](https://kaitai.io/) — a declarative binary format description language — to parse StarCraft's `.dat` files. Kaitai schemas (`.ksy` files) generate type-safe parsers:

**Parsed formats:**
- `units_dat.ksy` — unit properties (HP, cost, speed, weapons, etc.)
- `weapons_dat.ksy` — weapon damage, range, cooldown
- `flingy_dat.ksy` — movement/animation data
- `sprites_dat.ksy` — sprite references and dimensions
- `images_dat.ksy` — image properties
- `sfxdata_dat.ksy` — sound effect references
- `portdata_dat.ksy` — portrait video references
- `upgrades_dat.ksy` — upgrade costs and effects
- `orders_dat.ksy` — order/command definitions
- `techdata_dat.ksy` — technology tree data
- `mapdata_dat.ksy` — map metadata
- `iscript_bin.ksy` — animation instruction scripts
- Tileset formats: `tileset_cv5.ksy`, `tileset_vx4.ksy`, `tileset_vf4.ksy`, `tileset_vr4.ksy`

### Hub Pattern for Data Access

```cpp
class DataHub : public KaitaiConverter {
    DataHub(std::shared_ptr<Hurricane> hurricane) {
        init_units_dat();
        init_weapons_dat();
        init_flingy_dat();
        init_sprites_dat();
        // ... all .dat files loaded into typed objects
    }
    
    std::shared_ptr<units_dat_t> units;
    std::shared_ptr<weapons_dat_t> weapons;
    // ...
};
```

### Archive Abstraction Layer

Stargus abstracts archive access behind a `Hurricane` base class with two implementations:
- `Storm` — reads MPQ archives (original StarCraft)
- `Casc` — reads CASC archives (Remastered StarCraft)
- `Breeze` — reads from a plain directory (extracted files)

This is relevant to `ra-formats`: IC should consider a similar abstraction if supporting both `.mix` archives (original RA) and any future archive formats.

### IC Relevance

- **Kaitai Struct as documentation layer:** While `ra-formats` doesn't need to use Kaitai Struct (Rust's type system + serde provides equivalent safety), Kaitai `.ksy` schemas are valuable as **machine-readable documentation** for binary formats. If IC ever publishes format specifications, Kaitai schemas are the standard interchange format.
- **Archive abstraction:** `ra-formats` should expose a trait for archive access, allowing transparent reading from `.mix` files, directories, or future formats.

---

## 9. OpenCraft — Minimal Findings

OpenCraft (`forrestv/opencraft`, Python, 4 stars) is too minimal to offer meaningful architectural lessons. Its value is limited to:

- **Proof of concept:** StarCraft binary format parsing is feasible in any language (not just C++)
- **Format reader inventory:** `bin.py` (binary utils), `units.py` (unit data), `font.py`, `spk.py` (parallax stars), `tbl.py` (string tables), `wav.py`, `lo.py` (overlay offsets)
- **C extension pathfinder:** A compiled C pathfinder exposed to Python via ctypes — demonstrates the pattern of using a faster language for performance-critical subsystems

No architectural insights, no meaningful AI, no networking, no modding system. The project confirms that format parsing is the easiest part of building an RTS — the hard part is everything else.

---

## 10. Lessons for Iron Curtain

### Confirmed Design Decisions

These IC decisions are independently validated by Stratagus:

| IC Decision                                     | Stratagus Evidence                                               |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| Game-agnostic engine + game modules (D018/D039) | Single engine powers WC1, WC2, and StarCraft                     |
| Priority-based manager hierarchy (D043)         | `AiEachSecond()`: Script → Units → Resources → Forces → Magic    |
| Composition target system (D043)                | `AiForce(id, {type, count})` + `AiWaitForce()`                   |
| Resource ratio allocation (D043)                | `AiSetCollect({0, 50, 50, 0, 0, 0, 0})`                          |
| Two-axis difficulty (D043)                      | `SpeedResourcesHarvest[]`, `SpeedBuild`, `SpeedTrain` per player |
| AI event callbacks (D041)                       | `AiHelpMe()`, `AiUnitKilled()`, `AiNeedMoreSupply()`             |
| Data-driven everything (Philosophy §4)          | All unit types, AI behaviors, game rules defined in Lua          |

### New Actionable Items

| Finding                                                 | IC Impact                                                                      | Priority |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ | -------- |
| Lua AI API primitives (`AiForce`, `AiSetCollect`, etc.) | `ic-script` should expose similar primitives for Tier 2 AI modding             | Phase 4  |
| Explicit Lua stdlib policy per tier                     | 04-MODDING.md + 06-SECURITY.md should enumerate allowed/blocked stdlib modules | Phase 4  |
| External AI socket interface                            | Consider adding to `ic-ai` for ML training and LLM integration                 | Phase 4+ |
| Archive abstraction layer                               | `ra-formats` should trait-abstract archive access                              | Phase 0  |
| Kaitai Struct as format documentation                   | Consider publishing `.ksy` schemas alongside `ra-formats`                      | Optional |
| Lua-definable damage formulas                           | `DamageResolver` (D041) could support Tier 2 Lua overrides                     | Phase 4+ |

### Anti-Lessons

| Stratagus Pattern               | Why IC Does Better                                           |
| ------------------------------- | ------------------------------------------------------------ |
| "Written in one weekend" AI     | IC uses research-informed implementation (D043)              |
| Global mutable `AiPlayer*`      | IC uses ECS — no global mutable state                        |
| No AI performance budgeting     | IC has per-component tick-time budgets (10-PERFORMANCE.md)   |
| Lua-as-save-format              | IC uses binary snapshots with versioned serialization (D010) |
| `os` and `debug` libs available | IC excludes these entirely from the Lua sandbox              |

---

## 11. Sources

| Project   | Repository           | Key Files Examined                                                                                                                                                                                                        |
| --------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stratagus | `Wargus/stratagus`   | `src/ai/ai.cpp`, `src/ai/ai_local.h`, `src/ai/script_ai.cpp`, `doc/scripts/ai.html`, `src/include/player.h`, `src/include/ai.h`, `external_ai_example.py`, `src/network/netconnect.cpp`, `src/network/online_service.cpp` |
| Stargus   | `Wargus/stargus`     | `src/startool.cpp`, `src/startool_mpq.h`, `src/dat/DataHub.cpp`, `src/tileset/TilesetHub.h`, `src/kaitai/meson.build`, `src/Hurricane.cpp`, `src/Storm.cpp`, `src/Casc.cpp`, `src/stargus.cpp`                            |
| OpenCraft | `forrestv/opencraft` | `opencraft-v2/src/read/`, `opencraft-v2/src/Pathfinder/`, `opencraft-v2/src/game/`                                                                                                                                        |
