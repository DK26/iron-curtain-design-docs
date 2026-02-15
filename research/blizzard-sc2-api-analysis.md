# Blizzard Public GitHub Repositories — Analysis for Iron Curtain

> **Date:** 2026-02-14
> **Scope:** All repositories analyzed from primary source code. Claims are verified from files read directly.
> **License note:** s2client-proto and s2client-api are MIT-licensed. s2protocol and heroprotocol are MIT-licensed. All analysis is of publicly available, open-source code.

---

## Table of Contents

1. [Repository Overview](#1-repository-overview)
2. [Blizzard/s2client-proto — SC2 API Protocol](#2-blizzards2client-proto)
3. [Blizzard/s2client-api — C++ Client Library](#3-blizzards2client-api)
4. [Blizzard/s2protocol — Replay Decoder](#4-blizzards2protocol)
5. [Blizzard/heroprotocol — HotS Replay Decoder](#5-blizzardheroprotocol)
6. [Blizzard/FailoverQueue](#6-blizzardfailoverqueue)
7. [Cross-Cutting IC Recommendations](#7-cross-cutting-ic-recommendations)
8. [Summary Table](#8-summary-table)

---

## 1. Repository Overview

| Repository       | What It Is                                                              | Language | License | IC Relevance                                                                |
| ---------------- | ----------------------------------------------------------------------- | -------- | ------- | --------------------------------------------------------------------------- |
| `s2client-proto` | Protobuf protocol definition for the SC2 external API (websocket-based) | Protobuf | MIT     | **Very High** — game state observation, AI API, spatial data, debug tooling |
| `s2client-api`   | C++ wrapper library around the protobuf protocol                        | C++      | MIT     | **High** — game loop architecture, coordinator pattern, interface design    |
| `s2protocol`     | Python replay file decoder for StarCraft II                             | Python   | MIT     | **High** — replay event taxonomy, unit tag system, tracker events           |
| `heroprotocol`   | Python replay file decoder for Heroes of the Storm                      | Python   | MIT     | **Medium** — confirms Blizzard's shared replay architecture across titles   |
| `FailoverQueue`  | Repository does not exist at `Blizzard/FailoverQueue`                   | —        | —       | N/A                                                                         |

---

## 2. Blizzard/s2client-proto

### 2.1 Architecture: Observation-Action Model over WebSocket

The SC2 API uses a **protobuf-over-websocket** protocol. The game process runs as a server on `127.0.0.1:<port>`, and external clients (bots, replay analyzers) connect to `/sc2api`. All communication is strictly **Request → Response**. Requests are queued and processed in order; clients may pipeline requests without waiting for responses.

**State machine:**
```
Launched → (CreateGame) → Init_game → (JoinGame) → In_game → (LeaveGame) → Launched
                                                         ↓ (game ends)
                                                       Ended → (CreateGame) → Init_game
Launched → (StartReplay) → In_replay → (step to end) → Ended
```

Every `Response` carries a `status` field reflecting the current state. This is a clean, explicit FSM — no ambiguity about what operations are valid.

**> IC RECOMMENDATION:** IC's `GameLoop<N: NetworkModel, I: InputSource>` already has a state machine implicitly. Consider making it explicit with an enum-based FSM that tracks `Launching`, `InLobby`, `InGame`, `InReplay`, `Ended` states. SC2's approach of returning the current status in every response is a pattern worth adopting for IC's relay server protocol — every `ServerMessage` should carry current game phase.

### 2.2 Three-Interface Design (Raw / Feature Layer / Rendered)

SC2 exposes the **same game state** through three parallel interfaces, selectable via `InterfaceOptions` at game/replay start:

1. **Raw Data Interface** — Direct structured access to game state. Units are referenced by `uint64 tag`. No UI concepts (selection, camera). Designed for "scripted AI and replay analysis."
2. **Feature Layer Interface** — Image-based representation. Game world and UI rendered as grids of integer feature channels (unit_type, health, visibility, etc.). Each pixel represents a game cell. Designed for ML/neural network agents.
3. **Rendered Interface** — Full-fidelity rendered framebuffer. The actual game visuals as bitmap data.

All three can be active simultaneously. Actions can be input through any enabled interface.

**> IC RECOMMENDATION:** This three-tier observation model directly parallels IC's sim/render split (Invariant 1, 3). IC should consider designing its external AI API (D041's `AiStrategy` trait + future socket-based AI interface) with a similar tiered approach:
- **Raw:** Structured ECS state dump (equivalent to SC2's raw). This is what `ic-sim` snapshots already provide.
- **Spatial:** Grid-based spatial data (pathability, visibility, terrain height as `ImageData`). Useful for ML bots.
- The rendered interface is less relevant for IC since IC's renderer is Bevy-based and the sim is pure.

### 2.3 Game Speed and Stepping Model

From `docs/protocol.md`:

> The game simulation moves forward with a fixed time step. One unit of time is called a **GameLoop**.

Two modes:
- **Singlestep:** Simulation advances only when all players issue `RequestStep`. No speed restriction.
- **Realtime:** Simulation advances automatically at "faster" speed (22.4 gameloops/second).

`RequestStep` accepts a `count` parameter — the number of game loops to simulate for the next frame. The response notes:

> Max simulation_loop is (1<<19) before "end of time" will occur. The "end of time" is classified as the maximum number of game loops or absolute game time representable as a **positive fixed point number**.

This confirms SC2's internal sim uses **fixed-point time representation** (even though the external API often exposes `float` values for convenience). The game loop counter is an integer (`uint32 simulation_loop`).

**> IC RECOMMENDATION:** IC already plans fixed-point math (D009). The SC2 "end of time" at `1<<19 = 524,288` gameloops (≈6.5 hours at 22.4 loops/sec) is an important data point. IC should define its maximum game duration explicitly and document the fixed-point overflow boundary. At IC's likely tick rate of 15 Hz (per OpenRA's model), 524,288 ticks ≈ 9.7 hours, which is sufficient. Using `u32` for game loop counters provides `1<<32 / 15 ≈ 3.3 days` — more than enough.

### 2.4 Unit Representation and Tag System

From `raw.proto`, the `Unit` message is the central game state structure:

```protobuf
message Unit {
  optional DisplayType display_type = 1;    // Visible/Snapshot/Hidden/Placeholder
  optional Alliance alliance = 2;           // Self/Ally/Neutral/Enemy
  optional uint64 tag = 3;                  // Unique identifier for a unit
  optional uint32 unit_type = 4;
  optional int32 owner = 5;
  optional Point pos = 6;                   // 3D position (x, y, z floats)
  optional float facing = 7;
  optional float radius = 8;
  optional float build_progress = 9;        // [0.0, 1.0]
  optional CloakState cloak = 10;
  repeated uint32 buff_ids = 27;
  // ... health, shield, energy, orders, passengers, etc.
}
```

**Unit Tag System:** Tags are `uint64`. The s2protocol replay files reveal the internal structure:

```python
# From tracker events:
('m_unitTagIndex', 6, 0),    # uint32 index
('m_unitTagRecycle', 6, 1),  # uint32 recycle counter
```

The tag is composed of an **index** and a **recycle counter**. The `s2protocol` README explicitly states:

> Convert unit tag index, recycle pairs into unit tags (as seen in game events) with `protocol.unit_tag(index, recycle)`

This is a **generational index** pattern — the index identifies the slot, and the recycle counter disambiguates reuse of the same slot after a unit dies.

**> IC RECOMMENDATION:** IC should adopt this exact pattern for unit IDs in `ic-sim`. Rust's ecosystem has multiple generational index crates (`slotmap`, `thunderdome`, etc.) that implement this natively. The composed `u64` tag (index + generation in a single value) is ideal for network serialization and replay storage. Define:
```rust
#[derive(Copy, Clone, Eq, PartialEq, Hash, Serialize, Deserialize)]
pub struct UnitTag(u64);

impl UnitTag {
    pub fn new(index: u32, generation: u32) -> Self { ... }
    pub fn index(self) -> u32 { ... }
    pub fn generation(self) -> u32 { ... }
}
```

### 2.5 Fog-of-War: DisplayType Enum

```protobuf
enum DisplayType {
  Visible = 1;      // Fully visible
  Snapshot = 2;     // Dimmed version left behind after entering fog
  Hidden = 3;       // Fully hidden
  Placeholder = 4;  // Building that hasn't started construction
}
```

SC2 exposes **fog snapshots** — when a unit enters fog-of-war, the last known state (position, type, health) is preserved as a "Snapshot" display type. The actual unit may have moved or been destroyed.

The `Unit` message documents data availability by fog state:
- **Visible:** All fields populated
- **Snapshot:** Position and type populated, but health/energy/orders are NOT set
- **Hidden:** Not exposed through the API at all (only via cheat layers)
- **Enemy units:** Orders, passengers, cargo are never exposed regardless of visibility

Visibility is also exposed as a spatial grid:
```protobuf
message MapState {
  optional ImageData visibility = 1;    // 1 byte: 0=Hidden, 1=Fogged, 2=Visible, 3=FullHidden
  optional ImageData creep = 2;         // 1 bit creep layer
}
```

The `FeatureLayers` message has a parallel `visibility_map`:
```protobuf
optional ImageData visibility_map = 2;  // uint8. 0=Hidden, 1=Fogged, 2=Visible, 3=FullHidden
```

**> IC RECOMMENDATION:** IC's fog-of-war system (abstracted via `FogProvider` trait per D041) should implement a similar tiered visibility model:
1. `Visible` — full state available
2. `Fogged` (Snapshot) — last-known state preserved, marked as stale
3. `Hidden` — never revealed, no data
4. Consider SC2's `FullHidden` (value 3) for areas permanently hidden (e.g., map edges)

For the replay/observer system, IC should include a `DisplayType`-equivalent on every unit in observation snapshots. This tells replay viewers and spectator tools what information was available to each player at each moment. The pattern of selectively omitting fields based on fog state (no orders for enemies, no health for snapshots) reduces information leakage in multiplayer.

### 2.6 Spatial Data as ImageData Grids

SC2 represents all spatial data as grids using a single `ImageData` message:

```protobuf
message ImageData {
  optional int32 bits_per_pixel = 1;
  optional Size2DI size = 2;
  optional bytes data = 3;    // width * height * bits_per_pixel / 8
}
```

Map data from `StartRaw`:
```protobuf
message StartRaw {
  optional Size2DI map_size = 1;
  optional ImageData pathing_grid = 2;      // 1-bit: can units walk here?
  optional ImageData terrain_height = 3;    // 1 byte: height [-200, 200] → [0, 255]
  optional ImageData placement_grid = 4;    // 1-bit: can buildings be placed here?
  optional RectangleI playable_area = 5;
  repeated Point2D start_locations = 6;
}
```

Feature layers extend this with per-cell game state:
```protobuf
optional ImageData unit_type = 6;           // int32: unit type at this cell
optional ImageData unit_hit_points = 8;     // int32: HP at this cell
optional ImageData pathable = 29;           // 1-bit: walkability
optional ImageData buildable = 28;          // 1-bit: placement validity
optional ImageData player_relative = 11;    // uint8: Self/Ally/Neutral/Enemy
optional ImageData unit_density = 15;       // uint8: count of units at this cell
```

**> IC RECOMMENDATION:** IC should define a `GridData` type in `ic-sim` for spatial data:
```rust
pub struct GridData {
    pub width: u32,
    pub height: u32,
    pub bits_per_cell: u8,
    pub data: Vec<u8>,
}
```
This can represent pathing grids, terrain height, visibility maps, and buildability grids in a single format. The 1-bit pathing grid is efficient for network transmission and snapshot serialization. Terrain height encoded as `u8` (mapping the world range to [0, 255]) is a good compression for replays.

### 2.7 Coordinate System

From `common.proto`:
```protobuf
message Point2D { optional float x = 1; optional float y = 2; }
message Point { optional float x = 1; optional float y = 2; optional float z = 3; }
message PointI { optional int32 x = 1; optional int32 y = 2; }
```

- **World coordinates:** `Point2D` and `Point` (3D), range 0..255, bottom-left origin. Floats in the API.
- **Screen/minimap coordinates:** `PointI`, integer, top-left origin.
- Feature layers use screen coordinates (top-left origin).
- Raw interface uses world coordinates (bottom-left origin).

The `docs/protocol.md` notes: "All positions are based on game coordinates. The lower left of the map is (0, 0)."

**> IC RECOMMENDATION:** IC already defines `WorldPos { x, y, z }` with fixed-point coordinates (AGENTS.md Invariant 9). The SC2 API uses floats externally but the sim is deterministic, confirming the API is a translation layer. IC should expose fixed-point coordinates natively in its API and provide a float conversion only for external consumers. SC2's range of 0..255 per axis is notable — IC's fixed-point scale (pending decision P002) should ensure sufficient resolution within the coordinate range.

### 2.8 Query Interface (Pathfinding, Placement)

From `query.proto`:
```protobuf
message RequestQuery {
  repeated RequestQueryPathing pathing = 1;
  repeated RequestQueryAvailableAbilities abilities = 2;
  repeated RequestQueryBuildingPlacement placements = 3;
  optional bool ignore_resource_requirements = 4;
}

message RequestQueryPathing {
  oneof start {
    Point2D start_pos = 1;
    uint64 unit_tag = 2;    // Use unit's position and movement properties
  }
  optional Point2D end_pos = 3;
}

message ResponseQueryPathing {
  optional float distance = 1;    // 0 if no path exists
}
```

Key design choices:
- All queries are **batched** — you send arrays of requests and get arrays of responses. The C++ wrapper documentation emphasizes: "Always try and batch things up. These queries are effectively synchronous and will block until returned."
- Pathing queries can start from a position OR a unit tag (which inherits the unit's movement properties like flying).
- Building placement queries validate a specific ability at a specific position.
- `ignore_resource_requirements` is an option for exploring possibilities without cost constraints.

**> IC RECOMMENDATION:** IC's `Pathfinder` trait (D013, D045) should support batch queries natively:
```rust
pub trait Pathfinder {
    fn path_distance(&self, start: WorldPos, end: WorldPos) -> Option<FixedPoint>;
    fn path_distances_batch(&self, queries: &[(WorldPos, WorldPos)]) -> Vec<Option<FixedPoint>>;
    fn can_place(&self, unit_type: UnitTypeId, pos: WorldPos) -> bool;
    fn can_place_batch(&self, queries: &[(UnitTypeId, WorldPos)]) -> Vec<bool>;
}
```
The batch pattern matters for AI performance — an AI evaluating 50 potential build locations shouldn't make 50 round-trips.

### 2.9 Scoring and Statistics System

From `score.proto`:
```protobuf
message ScoreDetails {
  optional float idle_production_time = 1;
  optional float idle_worker_time = 2;
  optional float total_value_units = 3;
  optional float total_value_structures = 4;
  optional float killed_value_units = 5;
  optional float killed_value_structures = 6;
  optional float collected_minerals = 7;
  optional float collected_vespene = 8;
  optional float collection_rate_minerals = 9;    // Per minute estimate
  optional float collection_rate_vespene = 10;
  optional float spent_minerals = 11;
  optional float spent_vespene = 12;

  // Categorical breakdowns: none/army/economy/technology/upgrade
  optional CategoryScoreDetails food_used = 13;
  optional CategoryScoreDetails killed_minerals = 14;
  optional CategoryScoreDetails killed_vespene = 15;
  optional CategoryScoreDetails lost_minerals = 16;
  optional CategoryScoreDetails lost_vespene = 17;
  optional CategoryScoreDetails friendly_fire_minerals = 18;
  optional CategoryScoreDetails friendly_fire_vespene = 19;
  optional CategoryScoreDetails used_minerals = 20;    // Decremented on death
  optional CategoryScoreDetails used_vespene = 21;
  optional CategoryScoreDetails total_used_minerals = 22;  // Never decremented
  optional CategoryScoreDetails total_used_vespene = 23;

  optional VitalScoreDetails total_damage_dealt = 24;
  optional VitalScoreDetails total_damage_taken = 25;
  optional VitalScoreDetails total_healed = 26;

  optional float current_apm = 27;
  optional float current_effective_apm = 28;
}

message CategoryScoreDetails {
  optional float none = 1;
  optional float army = 2;
  optional float economy = 3;
  optional float technology = 4;
  optional float upgrade = 5;
}

message VitalScoreDetails {
  optional float life = 1;
  optional float shields = 2;
  optional float energy = 3;
}
```

**Key observations:**
- Scores are organized into **categories** (army/economy/technology/upgrade) — not just raw totals.
- Two resource tracking modes: `used_minerals` (current alive) vs `total_used_minerals` (cumulative including dead).
- Efficient worker/production metrics: `idle_production_time` and `idle_worker_time` are built-in.
- APM has two variants: raw (all actions) and effective (filtering redundant actions). Different action types have different APM weights.

**> IC RECOMMENDATION:** IC's scoring system (relevant to D036 achievements, D042 behavioral profiles) should adopt this categorical breakdown. Define:
```rust
pub struct ScoreCategory {
    pub army: FixedPoint,
    pub economy: FixedPoint,
    pub technology: FixedPoint,
    pub upgrade: FixedPoint,
}
```
The `idle_production_time` and `idle_worker_time` metrics are particularly valuable for AI difficulty assessment (D043) and player behavioral profiling (D042). Track these as first-class sim statistics, not derived post-hoc.

### 2.10 Error Handling: ActionResult Enum

From `error.proto`, SC2 defines **214 distinct action failure codes**. A representative sample:

```protobuf
enum ActionResult {
  Success = 1;
  NotSupported = 2;
  Error = 3;
  CantQueueThatOrder = 4;
  Retry = 5;
  Cooldown = 6;
  QueueIsFull = 7;
  NotEnoughMinerals = 9;
  NotEnoughVespene = 10;
  NotEnoughFood = 13;
  CantTargetThatUnit = 36;
  UnitCantMove = 38;
  BuildTechRequirementsNotMet = 40;
  CantBuildOnThat = 42;
  CantBuildLocationInvalid = 44;
  MustTargetUnit = 81;
  MustTargetVisibleUnit = 83;
  MustTargetGroundUnits = 113;
  CantTargetAirUnits = 112;
  TargetIsOutOfRange = 209;
  CouldntReachTarget = 208;
  // ... 214 total
}
```

The protocol has **two error reporting paths**:
1. **Immediate validation errors** — returned in `ResponseAction` when the action fails pre-validation (e.g., insufficient resources).
2. **Late execution errors** — returned in the next `ResponseObservation` when an action fails during execution (e.g., build site blocked when the unit arrives).

**> IC RECOMMENDATION:** IC's order validation (D012, `OrderValidator` trait per D041) should implement this dual-path error model:
1. **Synchronous rejection:** Order is rejected immediately upon submission — resources insufficient, tech not met, target invalid.
2. **Asynchronous failure:** Order accepted but fails during execution — path blocked, target destroyed, build site occupied.

The exhaustive error enum is worth studying but IC should use a more structured approach with error categories + detail rather than a flat enum of 200+ values. Consider:
```rust
pub enum OrderRejectReason {
    ResourceInsufficient(ResourceType),
    TechRequirementNotMet(TechId),
    InvalidTarget(TargetError),
    InvalidPlacement(PlacementError),
    UnitStateInvalid(UnitStateError),
    // ...
}
```

### 2.11 Debug Tooling

From `debug.proto`:
```protobuf
message DebugCommand {
  oneof command {
    DebugDraw draw = 1;           // Visual overlays
    DebugGameState game_state = 2; // Cheat modes
    DebugCreateUnit create_unit = 3;
    DebugKillUnit kill_unit = 4;
    DebugTestProcess test_process = 5;  // Hang/crash/exit for testing
    DebugSetScore score = 6;
    DebugEndGame end_game = 7;
    DebugSetUnitValue unit_value = 8;   // Set HP/energy/shields
  }
}

message DebugDraw {
  repeated DebugText text = 1;    // Screen-space or world-space text
  repeated DebugLine lines = 2;   // 3D lines
  repeated DebugBox boxes = 3;    // 3D boxes
  repeated DebugSphere spheres = 4;  // 3D spheres
}

enum DebugGameState {
  show_map = 1;       // Remove fog of war
  control_enemy = 2;  // Control enemy units
  food = 3;           // Disable supply cap
  free = 4;           // Disable resource costs
  all_resources = 5;  // Grant resources
  god = 6;            // Invincibility
  minerals = 7;
  gas = 8;
  cooldown = 9;       // Instant cooldowns
  tech_tree = 10;     // Unlock all tech
  upgrade = 11;       // All upgrades
  fast_build = 12;    // Instant construction
}
```

**Key pattern:** Debug primitives (text, lines, boxes, spheres) are **batched and persistent** — they continue drawing until the next `SendDebug` call replaces them. This avoids per-frame debug spam.

The `DebugTestProcess` with `hang`/`crash`/`exit` options is notable — it lets testing frameworks verify graceful handling of process failures.

**> IC RECOMMENDATION:** IC's scenario editor (D038) and debug tooling should include:
1. **Debug draw primitives** as a first-class sim interface. Define a `DebugDraw` resource in Bevy that systems can write to, rendered as an overlay by `ic-render`. Support text (screen + world space), lines, boxes, spheres, circles.
2. **Cheat commands** as a debug interface, not hardcoded — same set as SC2 (reveal map, god mode, instant build, free resources, etc.). Gate these behind a `debug_enabled` flag that is never set in ranked/multiplayer.
3. SC2's process-crash testing is relevant to IC's relay server resilience testing.

### 2.12 UI Interface

From `ui.proto`, the UI observation exposes:
```protobuf
message ObservationUI {
  repeated ControlGroup groups = 1;
  oneof panel {
    SinglePanel single = 2;
    MultiPanel multi = 3;
    CargoPanel cargo = 4;
    ProductionPanel production = 5;
  }
}

message ControlGroup {
  optional uint32 control_group_index = 1;
  optional uint32 leader_unit_type = 2;
  optional uint32 count = 3;
}
```

UI actions are structured:
```protobuf
message ActionControlGroup {
  enum ControlGroupAction {
    Recall = 1;         // Number key
    Set = 2;            // Ctrl+number
    Append = 3;         // Shift+number
    SetAndSteal = 4;    // Ctrl+Alt+number
    AppendAndSteal = 5; // Shift+Alt+number
  }
}
```

**> IC RECOMMENDATION:** The control group system with "steal" semantics (remove units from other groups when adding to this one) is an important UX detail for IC's UI design (D032, D033). The `SetAndSteal` / `AppendAndSteal` actions address a common player complaint about units being in multiple groups. IC should implement this as a toggleable QoL option (D033).

### 2.13 Observer Actions

```protobuf
message RequestObserverAction {
   repeated ObserverAction actions = 1;
}
```

SC2 has **separate action types for observers vs participants**. Observers can only move the camera and follow players. This is enforced at the protocol level.

**> IC RECOMMENDATION:** IC's relay server and spectator design should enforce this same split. Define separate `PlayerOrder` and `ObserverOrder` types in `ic-protocol`. The sim only processes `PlayerOrder`. Observer orders are handled by the client-side render layer without touching the sim.

### 2.14 Determinism Statement

From `docs/protocol.md`:

> The game simulation is completely deterministic when using the same random seed.

> StarCraft II uses a deterministic game simulation. Replays effectively just contain the user input of all players. When you run a replay, it is re-running the full game simulation by playing back the original user input.

> This means that to play back the replay deterministically, you need to be running on the exact same version that was used in the original game.

SC2 achieves determinism with **binary version + data version** pinning. Replays store both identifiers, and playback requires launching the exact matching executable.

**> IC RECOMMENDATION:** IC's replay system must store the engine version and game module version. IC has an advantage over SC2 here: because the sim is in `ic-sim` with no I/O, version compatibility is easier to maintain. However, IC should plan for version-tagged replay files from the start:
```rust
pub struct ReplayHeader {
    pub engine_version: SemVer,
    pub game_module: String,
    pub game_module_version: SemVer,
    pub balance_preset: String,  // D019
    pub random_seed: u64,
    pub player_info: Vec<PlayerInfo>,
    pub map_hash: [u8; 32],
}
```

---

## 3. Blizzard/s2client-api

### 3.1 Source Structure

```
src/
├── sc2api/       # Core API wrapper (agent, coordinator, game loop)
├── sc2lib/       # Utility library
├── sc2renderer/  # SDL-based debug renderer for feature layers
└── sc2utils/     # Path utilities, process management
```

Headers in `include/sc2api/`:
- `sc2_interfaces.h` — Pure virtual interfaces (ObservationInterface, ActionInterface, QueryInterface, DebugInterface)
- `sc2_agent.h` — Base class for user bots
- `sc2_coordinator.h` — Game/replay orchestrator
- `sc2_unit.h` — Unit data structures
- `sc2_game_settings.h` — Configuration types

### 3.2 Interface-Based Architecture

The C++ API is built on **pure virtual interfaces**:

```cpp
class ObservationInterface {
public:
    virtual uint32_t GetPlayerID() const = 0;
    virtual uint32_t GetGameLoop() const = 0;
    virtual Units GetUnits() const = 0;
    virtual Units GetUnits(Unit::Alliance alliance, Filter filter = {}) const = 0;
    virtual const Unit* GetUnit(Tag tag) const = 0;
    virtual const Score& GetScore() const = 0;
    virtual bool IsPathable(const Point2D& point) const = 0;
    virtual bool IsPlacable(const Point2D& point) const = 0;
    virtual float TerrainHeight(const Point2D& point) const = 0;
    virtual Visibility GetVisibility(const Point2D& point) const = 0;
    // ...
};

class ActionInterface {
public:
    virtual void UnitCommand(const Unit* unit, AbilityID ability, bool queued = false) = 0;
    virtual void UnitCommand(const Unit* unit, AbilityID ability, const Point2D& point, bool queued = false) = 0;
    virtual void UnitCommand(const Unit* unit, AbilityID ability, const Unit* target, bool queued = false) = 0;
    virtual void SendActions() = 0;
    // ...
};

class QueryInterface {
public:
    virtual float PathingDistance(const Point2D& start, const Point2D& end) = 0;
    virtual bool Placement(const AbilityID& ability, const Point2D& target_pos, const Unit* unit = nullptr) = 0;
    // + batch versions
};

class DebugInterface {
public:
    virtual void DebugTextOut(const std::string& out, const Point3D& pt3D, Color color, uint32_t size) = 0;
    virtual void DebugLineOut(const Point3D& p0, const Point3D& p1, Color color) = 0;
    virtual void DebugCreateUnit(UnitTypeID type, const Point2D& p, uint32_t player_id, uint32_t count) = 0;
    // ...
};
```

**> IC RECOMMENDATION:** This interface design maps directly to IC's trait-abstracted strategy (D041). IC should define similar Rust traits:

| SC2 Interface          | IC Equivalent                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ObservationInterface` | Bevy `Query` + `SimSnapshot` — IC doesn't need a separate observation interface because ECS queries ARE the observation |
| `ActionInterface`      | `PlayerOrder` submission through `ic-protocol`                                                                          |
| `QueryInterface`       | `Pathfinder` trait + `SpatialIndex` trait                                                                               |
| `DebugInterface`       | `DebugOverlay` resource in Bevy                                                                                         |

The key insight: SC2 needs these interfaces because the game runs as a separate process. IC's in-process design (sim as Bevy systems) means Observation ≈ ECS queries, which is more efficient.

### 3.3 Coordinator Pattern (Game Loop)

```cpp
class Coordinator {
public:
    bool LoadSettings(int argc, char** argv);
    void SetRealtime(bool value);
    void SetStepSize(int step_size);
    void SetParticipants(const std::vector<PlayerSetup>& participants);
    void LaunchStarcraft();
    bool StartGame(const std::string& map_path);
    bool Update();  // Step forward — THE main game loop call
    void LeaveGame();
    bool AllGamesEnded() const;
    // Replay-specific:
    bool SetReplayPath(const std::string& path);
    void AddReplayObserver(ReplayObserver* replay_observer);
};
```

The `Update()` method documentation:

> For non-real time: (1) Step simulation forward, (2) Wait for step completion → Observation received, parsed, events dispatched, (3) Call user's OnStep.
> For real time: (1) Request Observation (blocks), (2) Parse and dispatch events, (3) Dispatch batched unit actions.

**> IC RECOMMENDATION:** IC's `GameLoop<N, I>` already embodies this concept at a more generic level. The SC2 Coordinator's ability to handle both single-player and multi-instance multiplayer through the same interface is worth noting. IC's coordinator equivalent should similarly abstract whether it's running a local game, connecting to a relay, or processing replays.

### 3.4 Unit Data in C++ (Filter Pattern)

```cpp
typedef std::function<bool(const Unit& unit)> Filter;

// Usage:
auto marines = Observation()->GetUnits(Unit::Alliance::Self, IsUnit(UNIT_TYPEID::TERRAN_MARINE));
auto low_health = Observation()->GetUnits([](const Unit& u) { return u.health < u.health_max * 0.5f; });
```

The `UnitPool` class manages unit lifecycle:
```cpp
class UnitPool {
    static const size_t ENTRY_SIZE = 1000;
    std::vector<std::vector<Unit>> unit_pool_;  // Pooled allocation
    std::unordered_map<Tag, Unit*> tag_to_unit_;
    std::unordered_map<Tag, Unit*> tag_to_existing_unit_;
};
```

**> IC RECOMMENDATION:** In Bevy ECS, units are entities with components. IC doesn't need a custom unit pool — ECS provides this. However, the `Tag → Entity` mapping is important. IC should maintain a `HashMap<UnitTag, Entity>` resource for translating between network/replay unit tags and ECS entities.

### 3.5 Bot Callback Model

From `sc2_agent.h` and `sc2_client.h`:
```cpp
class Agent : public Client {
public:
    ActionInterface* Actions();
    ActionFeatureLayerInterface* ActionsFeatureLayer();
    // Inherited callbacks:
    // virtual void OnGameStart() = 0;
    // virtual void OnStep() = 0;
    // virtual void OnUnitCreated(const Unit* unit) = 0;
    // virtual void OnUnitDestroyed(const Unit* unit) = 0;
    // etc.
};
```

Bots override callbacks (`OnStep`, `OnUnitCreated`, `OnUnitDestroyed`) and issue actions through `Actions()`.

**> IC RECOMMENDATION:** IC's external AI API (for socket-based bots) should follow this event-driven callback model. Define events that trigger bot notifications:
```rust
pub enum GameEvent {
    GameStart(GameInfo),
    StepComplete(Observation),
    UnitCreated(UnitTag),
    UnitDestroyed(UnitTag),
    UnitIdle(UnitTag),
    BuildingComplete(UnitTag),
    UpgradeComplete(UpgradeId),
}
```

---

## 4. Blizzard/s2protocol

### 4.1 What It Is

A Python library for decoding StarCraft II `.SC2Replay` files. Replay files are MPQ archives (using `mpyq` library) containing multiple data streams, each decoded with version-specific protocol definitions.

### 4.2 Replay Structure

Each replay contains these decodable streams:
1. **Replay Header** — version info, game duration, elapsed game loops
2. **Game Details** — player list, map name, difficulty, game speed, results
3. **Replay Init Data** — full lobby state, player setup, game options
4. **Game Events** — player input (commands, selections, camera movements)
5. **Message Events** — chat, pings, loading progress
6. **Tracker Events** — sim-generated events (unit born/died, stats snapshots)
7. **Attribute Events** — key-value metadata

### 4.3 Version-Specific Protocol Files

The `s2protocol/versions/` directory contains **one Python file per game build number** (e.g., `protocol89634.py`). Each defines:
- `typeinfos` — Array of type definitions for the binary decoder
- `game_event_types` — Map from event ID to (type, name)
- `message_event_types` — Message event mappings
- `tracker_event_types` — Tracker event mappings

This is **version-pinned decoding** — each build may change the binary format of events, so the decoder must match the build that created the replay.

### 4.4 Tracker Event Taxonomy

From `protocol89634.py`, the tracker events are:

| Event ID | Name                    | Fields                                                                                                                |
| -------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 0        | `SPlayerStatsEvent`     | 38 score fields per player (minerals, vespene, food, killed/lost/used by category)                                    |
| 1        | `SUnitBornEvent`        | unitTagIndex, unitTagRecycle, unitTypeName, controlPlayerId, upkeepPlayerId, x, y, creatorUnitTag, creatorAbilityName |
| 2        | `SUnitDiedEvent`        | unitTagIndex, unitTagRecycle, killerPlayerId, x, y, killerUnitTag                                                     |
| 3        | `SUnitOwnerChangeEvent` | unitTagIndex, unitTagRecycle, controlPlayerId, upkeepPlayerId                                                         |
| 4        | `SUnitTypeChangeEvent`  | unitTagIndex, unitTagRecycle, unitTypeName                                                                            |
| 5        | `SUpgradeEvent`         | playerId, upgradeTypeName, count                                                                                      |
| 6        | `SUnitInitEvent`        | Same as UnitBorn but for units under construction                                                                     |
| 7        | `SUnitDoneEvent`        | unitTagIndex, unitTagRecycle (construction complete)                                                                  |
| 8        | `SUnitPositionsEvent`   | firstUnitIndex + delta-encoded position array                                                                         |
| 9        | `SPlayerSetupEvent`     | playerId, type, userId, slotId                                                                                        |

**Critical details from the README:**
- `m_scoreValueFoodUsed` and `m_scoreValueFoodMade` are in **fixed point (divide by 4096)**. All other values are integers.
- Unit positions in `SUnitPositionsEvent` are delta-encoded and scaled: `x = items[i+1] * 4`, `y = items[i+2] * 4`.
- Only units that have inflicted or taken damage appear in position events, with a limit of 256 per event.
- `SUnitInitEvent` → `SUnitDoneEvent` for buildings under construction. `SUnitBornEvent` for instantly-created units.
- Known issue: revived units are not tracked; placeholder units track death but not birth.

**> IC RECOMMENDATION:** IC's replay event system should adopt this taxonomy as a starting point. Define tracker events in `ic-protocol`:

```rust
pub enum TrackerEvent {
    PlayerStats { player_id: PlayerId, stats: PlayerStats },
    UnitBorn { tag: UnitTag, unit_type: UnitTypeId, owner: PlayerId, pos: WorldPos, creator: Option<UnitTag> },
    UnitDied { tag: UnitTag, killer: Option<PlayerId>, killer_unit: Option<UnitTag>, pos: WorldPos },
    UnitOwnerChange { tag: UnitTag, new_owner: PlayerId },
    UnitTypeChange { tag: UnitTag, new_type: UnitTypeId },
    UnitInitStarted { tag: UnitTag, unit_type: UnitTypeId, owner: PlayerId, pos: WorldPos },
    UnitInitComplete { tag: UnitTag },
    UpgradeComplete { player_id: PlayerId, upgrade: UpgradeId },
}
```

Key differences from SC2:
- IC should track **all** unit positions per tick (in sim snapshots), not just damage-involved units. IC's deterministic sim means the full state is reconstructible from orders alone, but explicit position events improve replay analysis tooling.
- The UnitInit/UnitDone split for construction is essential for replays — it tells viewers when a building started vs completed.
- SC2's fixed-point food values (÷4096) confirm that the internal sim uses fixed-point even though the external API exposes floats.

### 4.5 Game Event Types

The `game_event_types` dictionary maps ~100 event IDs. Key categories:

**Player Input:**
- `SCmdEvent` (27) — unit commands with ability, target, command flags
- `SSelectionDeltaEvent` (28) — selection changes (add/remove units)
- `SControlGroupUpdateEvent` (29) — control group modifications
- `SCameraUpdateEvent` (49) — camera position changes

**Game System:**
- `SGameCheatEvent` (26) — cheat commands
- `SResourceTradeEvent` (31) — resource transfers between allies
- `SAllianceEvent` (38) — alliance changes

**UI/Trigger:**
- `STriggerPingEvent` (36) — minimap pings
- `STriggerChatMessageEvent` (32) — in-game chat
- `STriggerCommandErrorEvent` (76) — "red text" error messages

The `SCmdEvent` structure is particularly detailed:
```python
('m_cmdFlags', 91, -11),      # 27-bit flags
('m_abil', 93, -10),          # ability link + command index + data
('m_data', 98, -9),           # target: None/TargetPoint/TargetUnit/Data
('m_sequence', 99, -8),       # sequence number
('m_otherUnit', 43, -7),      # optional secondary unit
('m_unitGroup', 43, -6),      # optional unit group
```

**> IC RECOMMENDATION:** IC's `PlayerOrder` in `ic-protocol` should include sequence numbers for desync diagnosis — if client and server sequence numbers diverge, it indicates dropped or reordered orders. The 27-bit command flags in SC2 encode modifiers (queued, autocast, etc.) as a bitfield, which is an efficient encoding for network transmission.

### 4.6 Binary Encoding

The protocol uses two decoders:
- `BitPackedDecoder` — for game events and init data (tightly packed bits)
- `VersionedDecoder` — for tracker events and headers (tagged fields for forward compatibility)

Game loop deltas use `SVarUint32` — a variable-length unsigned integer that encodes small deltas efficiently (0-63 in 1 byte, up to 2^32 with more bytes).

**> IC RECOMMENDATION:** IC's replay format should use a similar approach — variable-length delta encoding for game loop timestamps. For IC's `TimestampedOrder` (D008 sub-tick timestamps), the delta between consecutive orders within the same tick is typically 0, making varint encoding very efficient. Consider using Rust's `bincode` or `postcard` serialization with varint encoding for replay files.

---

## 5. Blizzard/heroprotocol

### 5.1 What It Is

Python library for decoding Heroes of the Storm `.StormReplay` files. Structurally identical to s2protocol — same architecture, same decoder infrastructure, version-specific protocol files.

### 5.2 Shared Blizzard Replay Architecture

heroprotocol decodes the same six data streams as s2protocol:
- Replay header, game details, replay init data
- Game events, message events, tracker events

The tracker event taxonomy is extended for HotS-specific concepts (heroes, talents, team levels) but the base events (`SUnitBornEvent`, `SUnitDiedEvent`, `SPlayerStatsEvent`) remain identical in structure.

The README documents the same unit tag index/recycle system:
> Convert unit tag index, recycle pairs into unit tags (as seen in game events) with `protocol.unit_tag(index, recycle)`

And the same known issues:
> There's a known issue where revived units are not tracked, and placeholder units track death but not birth.

### 5.3 IC Relevance

The primary relevance is confirmation that Blizzard's replay architecture generalizes across game titles. The same core pattern (MPQ archive → version-specific binary decoding → event streams) is used for both SC2 and HotS. This validates designing IC's replay system as a **game-module-agnostic event stream format** where RA1, TD, and future game modules all use the same replay container with module-specific event extensions.

**> IC RECOMMENDATION:** Define a core replay event vocabulary in `ic-protocol` that is game-module-independent. Game modules (RA1, TD) register additional event types at load time. The replay file format should be:
```
[Header: engine version, module, map hash, players]
[InitData: full lobby/game config snapshot]
[Stream 0: PlayerOrders (delta-encoded game loops)]
[Stream 1: TrackerEvents (sim-generated analytics)]
[Stream 2: MessageEvents (chat, pings)]
```

---

## 6. Blizzard/FailoverQueue

The repository `Blizzard/FailoverQueue` does not exist on GitHub. It may have been removed, renamed, or may exist under a different organization. No analysis possible.

---

## 7. Cross-Cutting IC Recommendations

### 7.1 External AI API Design (D041 + Future)

SC2's API demonstrates the gold standard for external bot interfaces in RTS games. IC should plan for a socket-based AI API as a Phase 4/5 deliverable:

**Protocol:** WebSocket + protobuf (or MessagePack for Rust ergonomics). Same observation/action model.

**Stepping model:** Support both singlestep (for AI training) and realtime (for live games). In singlestep mode, the sim blocks until all bot clients have submitted their actions for the current tick.

**Key interfaces to expose:**
1. Observation (filtered by fog-of-war per player)
2. Actions (order submission)
3. Queries (pathing distance, placement validity)
4. Debug (draw overlays, cheat commands — training only)
5. Game lifecycle (create, join, step, leave, replay)

### 7.2 Sim/Render Split Validation

SC2's three-interface design (Raw/FeatureLayer/Rendered) is architectural proof that separating "game state" from "visual representation" is not just theoretically clean but practically necessary for:
- Bot/AI integration
- Replay analysis tooling
- Spectator/observer modes with different information levels
- ML research

IC's Invariant 1 (pure deterministic sim) and the clean `ic-sim` / `ic-render` split are validated by SC2's architecture.

### 7.3 Fog-of-War Information Architecture

SC2's approach of **selectively populating fields based on visibility** is the right model:
- Fully visible units: all fields
- Fog snapshots: position + type only, marked stale
- Enemy units: never expose orders, passengers, production queue
- Hidden: no data at all

IC's fog provider should enforce this at the observation layer, not just the render layer.

### 7.4 Replay Format Design Principles from SC2

1. **Store orders, not state:** Replays are player input, not state snapshots. The sim is deterministic, so the state is reconstructible.
2. **Version-pin everything:** Replay files must embed enough version information to reproduce the exact sim.
3. **Separate analytical events from player input:** Tracker events (unit born/died/stats) are generated by the sim specifically for analysis — they're not player input and not needed for replay playback, but are invaluable for stat tools.
4. **Delta-encode timestamps:** Most events cluster at specific game loops. Delta encoding is highly efficient.
5. **Support partial replay loading:** SC2 separates header/details from event streams so that tools can read metadata without decoding the full replay.

### 7.5 Fixed-Point Observations

SC2's external API uses floats, but the internal sim is deterministic (confirmed by the "same random seed = same result" statement and the fixed-point food values in tracker events: "divide by 4096 for integer values"). This is a presentation-layer conversion.

IC should learn from this: expose fixed-point natively to Rust consumers, and provide float conversion helpers only for external API consumers and debug display. Never convert to float inside `ic-sim`.

---

## 8. Summary Table

| SC2 Pattern                                             | IC Applicability                       | Priority  | Design Doc |
| ------------------------------------------------------- | -------------------------------------- | --------- | ---------- |
| Generational unit tags (`index + recycle → u64`)        | Unit identity system in `ic-sim`       | Phase 2   | D010       |
| DisplayType fog-of-war enum (`Visible/Snapshot/Hidden`) | `FogProvider` trait output             | Phase 2   | D041       |
| Dual error paths (immediate rejection + late failure)   | `OrderValidator` validation flow       | Phase 2   | D012       |
| Categorized scoring (army/economy/tech/upgrade)         | Score tracking, achievement prereqs    | Phase 3   | D036       |
| Tracker event taxonomy (UnitBorn/Died/Init/Done)        | Replay event stream in `ic-protocol`   | Phase 2   | —          |
| Batch query interface (pathing distances, placements)   | `Pathfinder` and `SpatialIndex` traits | Phase 2   | D013, D045 |
| WebSocket + protobuf bot API                            | External AI interface                  | Phase 4-5 | D041       |
| Singlestep mode for AI training                         | `GameLoop` stepping control            | Phase 4   | D043       |
| Debug draw primitives (text, lines, boxes, spheres)     | Scenario editor + debug mode           | Phase 3   | D038       |
| Spatial data as `ImageData` grids                       | Map data format, visibility grids      | Phase 1-2 | —          |
| Observer/participant action separation                  | Relay server + spectator protocol      | Phase 5   | D041       |
| Delta-encoded replay timestamps                         | Replay file format                     | Phase 2   | D010       |
| Version-pinned replay playback                          | Replay header format                   | Phase 2   | D010       |
| Control group steal semantics                           | UI QoL options                         | Phase 3   | D033       |
| Idle worker/production time tracking                    | AI difficulty, player profiles         | Phase 3-4 | D042, D043 |
| Separate `APM` vs `EPM` (effective actions)             | Player statistics                      | Phase 3   | D042       |
