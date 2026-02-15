# Blizzard GitHub — Public Repository Analysis

**Source:** https://github.com/Blizzard (26 public repositories)
**Analyzed:** February 2026
**Purpose:** Identify patterns, architecture lessons, and concrete techniques from Blizzard's public StarCraft II API and replay codebases relevant to Iron Curtain's simulation, replay, AI interface, observation model, and order validation designs

## Repository Catalogue

Of Blizzard's 26 public repositories, the following are directly relevant to Iron Curtain:

| Repository     | Stars | Relevance to IC                                          | License |
| -------------- | ----- | -------------------------------------------------------- | ------- |
| s2client-proto | 3,928 | SC2 API protocol (protobuf), game state model, orders    | MIT     |
| s2client-api   | 1,667 | C++ bot/research library, agent architecture, game loop  | MIT     |
| s2protocol     | 635   | SC2 replay decoder, per-build versioning, event taxonomy | MIT     |
| heroprotocol   | 398   | HotS replay decoder, shared replay architecture          | MIT     |
| api-wow-docs   | 533   | WoW web API documentation (minor reference)              | —       |

Other repositories (node-rdkafka, passport-bnet, omniauth-bnet, premake forks, qt-patches, clang fork, api-d3-docs, premake-androidmk, premake-xcode, etc.) are not relevant to IC's design.

---

## Part 1: SC2 API Protocol Architecture (s2client-proto)

The SC2 API uses protobuf over WebSocket (`localhost:5000/sc2api`). The game process is the server; external bots/observers connect as clients. Every message is a `Request`/`Response` pair with a `oneof` discriminator covering 20+ message types. Requests are queued and processed in order — clients can pipeline multiple requests. From `docs/protocol.md`:

> "You are allowed to send additional requests before receiving a response to an earlier request. Requests will be queued and processed in received order."

### 1.1 State Machine: Explicit Game Lifecycle

SC2 defines an explicit state machine with five states:

```
launched → init_game → in_game → ended → quit
                    ↘ in_replay → ended → quit
```

Each request type documents which states it is valid in. Sending an invalid request returns an error with only the `error` field populated. From `sc2api.proto`:

```protobuf
enum Status {
  launched = 1;     // Game launched, nothing happening yet
  init_game = 2;    // CreateGame called, host awaiting players
  in_game = 3;      // In a single/multiplayer game
  in_replay = 4;    // Watching a replay
  ended = 5;        // Game/replay ended, ready for new game
  quit = 6;         // Application shutting down
}
```

**IC comparison:** IC's game loop has a similar lifecycle but it's less formalized. The explicit state machine with documented valid transitions per request type is a pattern IC should adopt for its relay server protocol — each relay command should document which `ClientStatus` states accept it, and invalid commands should produce typed errors rather than silent failures.

### 1.2 Three-Interface Observation Model

SC2 exposes game state through three functionally-equivalent interfaces, each designed for a different consumer:

| Interface         | Purpose                         | Consumer               | Data Format                      |
| ----------------- | ------------------------------- | ---------------------- | -------------------------------- |
| **Raw**           | Direct game state, units by tag | Scripted bots, replays | Structured protobuf (Unit proto) |
| **Feature Layer** | Simplified grid-based images    | Machine learning       | 30+ ImageData channels (bitmaps) |
| **Rendered**      | Full fidelity rendered frame    | Advanced ML            | RGB pixel buffer                 |

Which interfaces are active is configured per game session via `InterfaceOptions`. Multiple can be active simultaneously — the same game state represented in each enabled format. From `docs/protocol.md`:

> "Observations will contain the same game state represented in each of the enabled interfaces. You are allowed to input actions using any of the enabled interfaces."

The **Raw interface** strips away all UI concepts (selection, camera) — the observation contains the state of all visible units, referenced by tag, with direct unit commands. The **Feature Layer interface** preserves full UI semantics (selection, camera movement) but simplifies them into grid-based actions.

**IC comparison:** This three-layer model directly validates IC's sim/render split (invariant 1). The Raw interface is what IC's `ic-sim` produces — pure game state. The Feature Layer and Rendered interfaces are what IC's `ic-render` and `ic-ui` provide. The key insight for IC is that a future external AI/bot API (Phase 4+) should expose the Raw interface first, as SC2 uses it for scripted bots and replay analysis. The Feature Layer equivalent is only needed if IC targets ML research.

### 1.3 Generational Unit Tags

SC2 units are identified by a 64-bit tag composed of an index and a recycle (generation) counter. From the `s2protocol` README and `heroprotocol` README:

```python
# Convert unit tag index, recycle pairs into unit tags
unit_tag = protocol.unit_tag(index, recycle)
```

The `raw.proto` Unit message stores this as a single `uint64 tag`, but internally it encodes `(index << 18) | recycle` (verified from tracker event documentation where index and recycle are separate fields). This generational index pattern ensures:

- No ABA problem: a tag for a destroyed unit won't accidentally refer to a new unit at the same index
- Compact identity: a single u64 is cheaper than a UUID
- O(1) lookup: index portion used for array access, recycle for validation

**IC comparison:** This is exactly the `slotmap`/`thunderdome` pattern in Rust. IC's `ic-sim` should use generational indices for all entity references — unit tags, projectile tags, order target IDs. Bevy's `Entity` type already uses a similar pattern (index + generation). The recommendation is to ensure that any external-facing API (replays, bot API, spectator protocol) exposes the same opaque generational tag, never raw ECS entity indices.

### 1.4 Fog-of-War: DisplayType and Selective Data

SC2's Unit proto includes a `DisplayType` enum that controls what data is available:

```protobuf
enum DisplayType {
  Visible = 1;      // Currently visible to the player
  Snapshot = 2;     // Last-known state in fog-of-war (may be stale)
  Hidden = 3;       // Not visible, limited data
  Placeholder = 4;  // Structure to be built
}
```

The Unit proto has 45+ fields, but **which fields are populated depends on DisplayType and Alliance**. From `sc2_unit.h`:

```cpp
// Not populated for snapshots
float health, health_max;          // Only for Visible units
float shield, shield_max;          // Only for Visible units
float energy, energy_max;          // Only for Visible units
bool is_flying, is_burrowed;       // Only for Visible units
float weapon_cooldown;             // Only for Visible units

// Not populated for enemies/snapshots
std::vector<UnitOrder> orders;     // Only for Self/Ally units
std::vector<PassengerUnit> passengers;  // Only for Self/Ally units
Tag engaged_target_tag;            // Only for Self/Ally units
std::vector<BuffID> buffs;         // Only for Self/Ally units
```

The **Snapshot** concept is architecturally significant: when a visible unit enters fog-of-war, the observer retains a "snapshot" of its last-known position and type. This snapshot is explicitly marked as potentially stale — the actual unit may have moved, morphed, or been destroyed.

**IC comparison:** IC's `FogProvider` trait (D041) should output units with a similar visibility classification. The Snapshot concept is particularly important for classic RTS — when units leave sight, the player sees a "ghost" of their last-known position. IC should define:
1. A `Visibility` enum in `ic-sim`: `Visible | Snapshot | Hidden` (Placeholder is SC2-specific)
2. Which component fields are exposed per visibility level — orders and internal state are never visible for enemy Snapshot units
3. The fog system should maintain a "last-seen snapshot" table for units that leave visibility

### 1.5 Request/Response + Dual Error Reporting

SC2 has two distinct error reporting paths for actions. From `docs/protocol.md`:

> **Immediate rejection:** "All actions are validated before they are executed. If an action fails initial validation, it will be reported back immediately in ResponseAction."
>
> **Late failure:** "Actions can also fail in the process of being executed. For example, if a unit was trying to build a structure at a distant location, but when it arrived there was an enemy unit in the way. These types of late errors are reported back in ResponseObservation."

The error taxonomy (`error.proto`) defines 214 distinct `ActionResult` codes covering every possible failure — from resource shortages (`NotEnoughMinerals`, `NotEnoughVespene`, `NotEnoughFood`) to targeting constraints (`MustTargetGroundUnits`, `CantTargetCloakedUnits`, `MustTargetBiologicalUnits`) to placement failures (`CantBuildOnThat`, `CantBuildTooCloseToResources`, `CantFindPlacementLocation`).

**IC comparison:** This dual-path error model maps directly to IC's `OrderValidator` (D012):

1. **Immediate validation** = IC's deterministic order validation inside `ic-sim`. Orders that fail basic validation (insufficient resources, wrong target type) are rejected before entering the order queue. This rejection must be deterministic — all clients must agree.
2. **Late failure** = orders that were valid when issued but fail during execution (path blocked, target died). These produce in-game events that all clients observe deterministically.

The 214-code error enum is a comprehensive reference for IC's own order rejection codes. IC should define a similarly detailed `OrderRejectionReason` enum in `ic-protocol`, covering at minimum: resource errors, target validity, placement validity, tech requirements, and state constraints.

### 1.6 Step-Based Deterministic Simulation

SC2's game loop matches IC's design exactly. From `docs/protocol.md`:

> **Singlestep Mode:** "The game simulation only advances once all players issue a Step request."
>
> **Realtime Mode:** "The game simulation will automatically advance. Uses the 'faster' game speed (22.4 gameloops per second)."

Step advancement: `RequestStep { count }` advances by N game loops. The fixed tick rate of 22.4 game loops/second in realtime mode corresponds to ~44.6ms per game loop.

On determinism, from `docs/protocol.md`:

> "The game simulation is completely deterministic when using the same random seed."

And crucially, the only randomness is cosmetic:

> "There is a tiny amount of randomness in the delay between Marine shots. This makes it so if you have a large group of marines that all start firing together, their shooting will quickly become out of sync and look less robotic."
>
> "The order in which units update is also randomized. This makes it so that if two players issue an attack on the exact same frame, it will be random which one performs the damage first and wins."

These cosmetic uses of randomness are seeded by `RequestCreateGame.random_seed` and are part of the deterministic simulation — same seed = same cosmetic randomness.

**IC comparison:** This perfectly validates IC's model:
- IC's fixed-step sim (FixedUpdate in Bevy) = SC2's game loop
- IC's fixed-point integer math = SC2's internally-integer sim (the API exposes floats, but tracker events use fixed-point ÷4096)
- IC's `random_seed` in game creation = SC2's `RequestCreateGame.random_seed`
- The cosmetic randomness pattern (seeded, deterministic, affects only visual/audio) is a technique IC should adopt: instead of identical firing patterns for all Marines/Rifle Infantry, introduce seeded visual variation

### 1.7 Replay Versioning and Data Compatibility

SC2's replay system requires exact binary+data version matching for deterministic playback. From `docs/protocol.md`:

> "StarCraft II uses a deterministic game simulation. Replays effectively just contain the user input of all players."
>
> "To play back the replay deterministically, you need to be running on the exact same version that was used in the original game."

SC2 separates **Binary Version** (game executable, identified by Base Build Number) from **Data Version** (game data, identified by Version Hash). A replay stores both. Playback requires launching the correct binary and providing the correct data version via `-dataVersion`.

The `s2protocol` library implements this with per-build Python modules (`versions/protocol89634.py`, etc.) — each build has its own decoder because the replay wire format can change between builds.

**IC comparison:** IC's `SnapshotCodec` version dispatch (D054) addresses the same problem. Recommendations:
1. IC replays should store: engine version, sim version hash, mod version hash, random seed
2. IC should maintain a version registry mapping sim version → codec version, similar to SC2's `versions.json`
3. Unlike SC2, IC should aim for forward-compatible replay codecs where possible (using `serde` with `#[serde(default)]` for new fields) to reduce the need for multiple codec versions

---

## Part 2: Game Data Model

### 2.1 Stable IDs and Ability Remapping

Every game element has a **stable integer ID** that persists across patches. From `data.proto`:

```protobuf
message AbilityData {
  optional uint32 ability_id = 1;       // Stable ID
  optional string link_name = 2;        // Catalog name
  optional uint32 remaps_to_ability_id = 7;  // Generic ability ID
  enum Target {
    None = 1;           // No target required
    Point = 2;          // Requires position
    Unit = 3;           // Requires unit target
    PointOrUnit = 4;    // Either position or unit
    PointOrNone = 5;    // Position or no target (e.g., building add-ons)
  }
}
```

The `remaps_to_ability_id` field is architecturally clever: many abilities are game-specific variants of the same logical action (BUILD_TECHLAB_BARRACKS, BUILD_TECHLAB_FACTORY, BUILD_TECHLAB_STARPORT all remap to BUILD_TECHLAB). SC2 also publishes `stableid.json` mapping ability IDs to canonical names, updated per patch.

**IC comparison:** IC's YAML-defined abilities should include:
1. **Stable IDs** assigned at definition time (not derived from YAML file order)
2. **Ability remapping** — multiple game-specific abilities mapping to a single generic ability ID, useful for mod compatibility and order validation
3. **Target type declaration** — each ability's Target enum eliminates ambiguous order parsing

### 2.2 Unit Type Data as Balance Definitions

From `data.proto`, the `UnitTypeData` message encodes everything needed for game balance:

```protobuf
message UnitTypeData {
  optional uint32 unit_id = 1;          // Stable ID
  optional string name = 2;
  optional uint32 mineral_cost = 12;
  optional uint32 vespene_cost = 13;
  optional float food_required = 14;
  optional float food_provided = 18;
  optional float build_time = 17;
  optional float sight_range = 25;
  optional float movement_speed = 9;
  optional float armor = 10;
  repeated Weapon weapons = 11;         // Multiple weapons per unit
  repeated Attribute attributes = 8;    // Light, Armored, Biological, etc.
  optional Race race = 16;
  optional uint32 tech_requirement = 23;
  optional bool require_attached = 24;  // Add-on requirement
  repeated uint32 tech_alias = 21;      // Other units satisfying same tech req
  optional uint32 unit_alias = 22;      // Morphed variant of this unit
}

message Weapon {
  enum TargetType { Ground = 1; Air = 2; Any = 3; }
  optional float damage = 2;
  repeated DamageBonus damage_bonus = 3;  // Per-attribute bonus damage
  optional uint32 attacks = 4;            // Hits per attack (Colossus = 2)
  optional float range = 5;
  optional float speed = 6;              // Time between attacks
}
```

The `Attribute` enum (Light, Armored, Biological, Mechanical, Robotic, Psionic, Massive, Structure, Hover, Heroic, Summoned) drives the entire damage bonus system — weapons deal bonus damage to specific attribute types.

**IC comparison:** This data model is very close to what IC needs for YAML unit definitions. Key patterns to adopt:
1. **Multiple weapons per unit** — not just a single attack value
2. **Attribute-based damage bonuses** — IC's existing OpenRA compatibility layer already supports armor types; the SC2 model adds the explicit DamageBonus-per-attribute structure
3. **tech_alias + unit_alias** — morph chains and tech equivalence are first-class data, not special-case code
4. **`attacks` field** — number of hits per attack cycle, important for accurate DPS calculation
5. **`require_attached`** — add-on/dependency relationships expressed in data

### 2.3 Score System: Comprehensive Performance Metrics

From `score.proto`, SC2 tracks exhaustive per-player performance metrics:

```protobuf
message ScoreDetails {
  optional float idle_production_time = 1;   // Lost production time (stacking)
  optional float idle_worker_time = 2;       // Lost worker time (stacking)
  optional float total_value_units = 3;      // Spent on completed units
  optional float total_value_structures = 4; // Spent on completed structures
  optional float killed_value_units = 5;     // Destroyed enemy unit value
  optional float killed_value_structures = 6;// Destroyed enemy structure value
  optional float collected_minerals = 7;     // Total minerals collected
  optional float collected_vespene = 8;      // Total vespene collected
  optional float collection_rate_minerals = 9;  // Current income/min
  optional float collection_rate_vespene = 10;  // Current income/min
  optional float spent_minerals = 11;    // Increment on spend, decrement on cancel
  optional float spent_vespene = 12;     // Increment on spend, decrement on cancel
  optional float current_apm = 27;       // Recent raw APM
  optional float current_effective_apm = 28; // Recent effective APM

  // Per-category breakdowns (none/army/economy/technology/upgrade)
  optional CategoryScoreDetails food_used = 13;
  optional CategoryScoreDetails killed_minerals = 14;
  optional CategoryScoreDetails killed_vespene = 15;
  optional CategoryScoreDetails lost_minerals = 16;
  optional CategoryScoreDetails lost_vespene = 17;
  optional CategoryScoreDetails friendly_fire_minerals = 18;
  optional CategoryScoreDetails friendly_fire_vespene = 19;
  optional CategoryScoreDetails used_minerals = 20;     // Decremented on death
  optional CategoryScoreDetails total_used_minerals = 22; // Never decremented

  optional VitalScoreDetails total_damage_dealt = 24;
  optional VitalScoreDetails total_damage_taken = 25;
  optional VitalScoreDetails total_healed = 26;
}
```

The distinction between `used_minerals` (decremented when units die) and `total_used_minerals` (never decremented) enables both current-state and historical analysis. APM tracking distinguishes raw APM from effective APM (filtering out redundant actions like control group spam).

**IC comparison:** IC's post-game statistics (D036 achievements, D053 player profiles) should track similar metrics. Recommendations:
1. Define a `GameScore` struct in `ic-sim` that accumulates during gameplay
2. Track the same categories: resource collection rates, military value killed/lost, idle time, damage dealt/taken
3. APM tracking (raw + effective) is essential for player profiles and replay analysis
4. The `used` vs `total_used` distinction is important for charts (current army value vs. total investment)

---

## Part 3: Spatial Representation

### 3.1 Map Data as Bitmap Grids

SC2 encodes static map data as binary grids. From `raw.proto`:

```protobuf
message StartRaw {
  optional Size2DI map_size = 1;
  optional ImageData pathing_grid = 2;      // 1-bit per cell
  optional ImageData terrain_height = 3;    // 1-byte per cell
  optional ImageData placement_grid = 4;    // 1-bit per cell
  optional RectangleI playable_area = 5;
  repeated Point2D start_locations = 6;
}
```

The `ImageData` format is a generic binary grid:

```protobuf
message ImageData {
  optional int32 bits_per_pixel = 1;
  optional Size2DI size = 2;
  optional bytes data = 3;    // Raw binary bitmap
}
```

This encoding is extremely compact: a 256×256 pathing grid is just 8KB (1 bit/cell). Terrain height at 1 byte/cell is 64KB. Together, a full map's static data fits in under 100KB.

**IC comparison:** IC's map format should adopt this pattern for static grid data. RA1 maps use similar cell-based data — IC should store pathing, height, and buildability as compact bitfield/bytefield grids rather than per-cell structs. This is both more cache-friendly and more compact for network transmission and replay embedding.

### 3.2 Runtime Map State

Dynamic map state is also encoded as grids. From `raw.proto`:

```protobuf
message MapState {
  optional ImageData visibility = 1;  // 1-byte: 0=Hidden, 1=Fogged, 2=Visible, 3=FullHidden
  optional ImageData creep = 2;       // 1-bit: Zerg creep present
}
```

Four visibility levels in the fog-of-war grid:
- **Hidden (0):** Never explored
- **Fogged (1):** Previously explored, currently not visible
- **Visible (2):** Currently visible
- **FullHidden (3):** Special hidden state

**IC comparison:** IC's `FogProvider` trait should produce a per-cell visibility grid with at least three states (Hidden/Fogged/Visible). The 1-byte-per-cell encoding is compact enough for per-frame transmission in spectator mode. IC's fog system should:
1. Maintain a visibility grid updated each sim tick
2. Use the same grid resolution as the terrain (1 cell = 1 grid pixel)
3. Track "explored" state separately from "visible" state (Fogged = explored but not currently visible)

### 3.3 Feature Layer Architecture for AI

SC2's Feature Layer interface (`spatial.proto`) encodes the full game state as 30+ image channels:

```protobuf
message FeatureLayers {
  optional ImageData height_map = 1;              // uint8 [-200,200] → [0,255]
  optional ImageData visibility_map = 2;           // uint8 (Hidden/Fogged/Visible)
  optional ImageData player_id = 5;                // uint8 [1-16]
  optional ImageData unit_type = 6;                // int32 (unit type ID)
  optional ImageData unit_hit_points = 8;          // int32
  optional ImageData unit_hit_points_ratio = 17;   // uint8 [0%,100%] → [0,255]
  optional ImageData player_relative = 11;        // uint8 (Self/Ally/Neutral/Enemy)
  optional ImageData unit_density = 15;           // uint8 (count of overlapping units)
  optional ImageData pathable = 29;               // 1-bit
  optional ImageData buildable = 28;              // 1-bit
  // ... 20+ more channels
}
```

Each channel uses the appropriate precision — 1-bit for binary flags, uint8 for ratios, int32 for IDs. Ratio encodings compress values: `[0%, 100%]` → `[0, 255]`.

**IC comparison:** If IC ever targets ML research (Phase 7+, LLM integration), the Feature Layer model provides the template. For near-term relevance, the ratio encoding pattern is useful for compact network transmission of health/shield values in spectator mode — uint8 ratios are 4x smaller than float32 values with negligible information loss for display purposes.

---

## Part 4: Order Validation and Query Interface

### 4.1 Pathfinding Queries

SC2 exposes pathfinding as a query interface, not just an internal system. From `query.proto`:

```protobuf
message RequestQueryPathing {
  oneof start {
    Point2D start_pos = 1;     // Start from position
    uint64 unit_tag = 2;       // Start from unit (accounts for unit properties)
  }
  optional Point2D end_pos = 3;
}

message ResponseQueryPathing {
  optional float distance = 1;  // 0 if no path exists
}
```

Queries can be batched: `RequestQuery` accepts arrays of pathing, ability, and placement queries. From `docs/protocol.md`:

> **Performance note:** "Always try and batch things up. These queries are effectively synchronous and will block until returned."

**IC comparison:** IC's `Pathfinder` trait (D013) should include a distance query method alongside pathfinding. The batch query pattern is essential for AI — an AI evaluating multiple attack paths should be able to query all distances in a single call, not N sequential calls. Recommended trait extension:

```rust
trait Pathfinder {
    fn find_path(&self, start: WorldPos, end: WorldPos) -> Option<Path>;
    fn path_distance(&self, start: WorldPos, end: WorldPos) -> Option<FixedPoint>;
    fn batch_distances(&self, queries: &[(WorldPos, WorldPos)]) -> Vec<Option<FixedPoint>>;
}
```

### 4.2 Placement Queries

From `query.proto`:

```protobuf
message RequestQueryBuildingPlacement {
  optional int32 ability_id = 1;        // Build ability
  optional Point2D target_pos = 2;      // Where to place
  optional uint64 placing_unit_tag = 3; // Unit doing the placement (optional)
}

message ResponseQueryBuildingPlacement {
  optional ActionResult result = 1;     // Success or specific error code
}
```

The `placing_unit_tag` field is important: some placements depend on the placing unit's properties (e.g., Barracks placing a Tech Lab requires space for both the Barracks and the Lab).

**IC comparison:** IC's building placement validation should include the placing unit's context. For RA1, this matters for MCV deployment (needs clear area), construction yard placement, and any unit-constrained building. The placement query should return a typed error code, not just bool, so the UI can show the specific reason placement failed.

### 4.3 ActionResult: Comprehensive Order Rejection Taxonomy

SC2's `error.proto` defines 214 distinct `ActionResult` codes. Key categories:

| Category  | Examples                                                                 | Count |
| --------- | ------------------------------------------------------------------------ | ----- |
| Resource  | NotEnoughMinerals, NotEnoughVespene, NotEnoughFood, TooMuchMinerals      | ~19   |
| Targeting | MustTargetGroundUnits, CantTargetCloakedUnits, MustTargetBiologicalUnits | ~100+ |
| Placement | CantBuildOnThat, CantBuildTooCloseToResources, CantFindPlacementLocation | ~20   |
| Ability   | Cooldown, QueueIsFull, TechRequirementsNotMet, OrderQueueIsFull          | ~15   |
| Transport | NotEnoughRoomToLoadUnit, CantLoadOtherPlayersUnits, CantUnloadUnitsThere | ~10   |
| Other     | CouldntReachTarget, TargetIsOutOfRange, AlreadyTargeted                  | ~20   |

The Must/Cant pairing pattern is elegant: `MustTargetGroundUnits` (ability requires ground targets) and `CantTargetGroundUnits` (ability cannot be used on ground) are complementary constraints.

**IC comparison:** IC's `OrderRejectionReason` enum in `ic-protocol` should follow this pattern. For Phase 2 (sim implementation), start with a minimal subset — resource errors, target validity, placement validity, tech requirements — and expand as new systems are added. The Must/Cant pairing pattern ensures every constraint is expressible. The enum should be defined in `ic-protocol` (not `ic-sim`) so that both the sim and the UI can reference the same error codes.

---

## Part 5: Replay Architecture

### 5.1 Per-Build Protocol Versioning

SC2 replays are stored as MPQ archives containing multiple event streams. Each replay is tied to a specific game build. From `s2protocol/s2_cli.py`:

```python
# Read header with any protocol — header format is stable
header = latest().decode_replay_header(contents)

# Header contains the build number
baseBuild = header['m_version']['m_baseBuild']

# Load the correct protocol decoder for this build
protocol = build(baseBuild)

# Decode with the build-specific protocol
details = protocol.decode_replay_details(contents)
game_events = protocol.decode_replay_game_events(contents)
tracker_events = protocol.decode_replay_tracker_events(contents)
```

The `s2protocol/versions/` directory contains one Python module per build (e.g., `protocol89634.py`), each defining the exact binary encoding for that build's events. The header format is stable across all versions — any decoder can read it to determine the required build version.

**IC comparison:** IC's replay format should adopt this two-level approach:
1. **Stable header** — always readable by any version, contains: engine version, sim version hash, mod version hash, random seed, player info, map reference
2. **Version-specific event encoding** — the body of the replay uses a codec determined by the sim version hash

IC's advantage is that Rust's `serde` with `#[serde(default)]` provides forward compatibility that SC2's binary formats lack. IC should need far fewer codec versions than SC2's 100+ protocol files.

### 5.2 Replay File Structure

SC2 replays contain six independent event streams within an MPQ archive:

| Stream                     | Contents                                  | Purpose               |
| -------------------------- | ----------------------------------------- | --------------------- |
| `replay.details`           | Player names, heroes, game result         | Quick summary         |
| `replay.initData`          | Lobby state, settings, cache handles      | Game setup            |
| `replay.game.events`       | Player inputs (commands, selections)      | Deterministic replay  |
| `replay.message.events`    | Chat, pings                               | Social replay         |
| `replay.tracker.events`    | Analytical events (births, deaths, stats) | Post-game analysis    |
| `replay.attributes.events` | Lobby attributes (player settings)        | Metadata              |
| `replay.gamemetadata.json` | Machine-readable game metadata            | Quick metadata access |

The separation of `game.events` (for deterministic playback) from `tracker.events` (for analysis) is architecturally significant. Tracker events are not inputs — they're derived data sampled from the simulation state at periodic intervals. They exist solely for post-game analysis tools.

**IC comparison:** IC's replay format should separate:
1. **Order stream** — `TimestampedOrder` sequence, sufficient for deterministic replay
2. **Analysis stream** — derived events (unit births, deaths, damage events, economy snapshots) for stats/analysis
3. **Chat/social stream** — messages, pings, alliance changes
4. **Metadata** — game settings, player info, map reference

This separation means replay analysis tools never need to re-simulate — they can read the analysis stream directly. The order stream is the authoritative record; the analysis stream is a convenience cache.

### 5.3 Tracker Event Taxonomy

SC2 defines a specific vocabulary for analytical events in replays. From the `s2protocol` and `heroprotocol` READMEs:

| Event                 | Description                    | Notes                             |
| --------------------- | ------------------------------ | --------------------------------- |
| `SUnitBornEvent`      | Unit created fully constructed | Birth of combat/worker units      |
| `SUnitInitEvent`      | Unit begins construction       | Start of build process            |
| `SUnitDoneEvent`      | Unit completes construction    | Matches a prior SUnitInitEvent    |
| `SUnitDiedEvent`      | Unit destroyed                 | Can follow either Born or Init    |
| `SUnitPositionsEvent` | Batch position update          | Max 256 units, combat-active only |
| `SPlayerStatsEvent`   | Periodic player statistics     | Fixed-point: food values ÷4096    |

Key detail — `SUnitPositionsEvent` uses delta-encoded unit indices and approximate positions:

```python
unitIndex = event['m_firstUnitIndex']
for i in range(0, len(event['m_items']), 3):
    unitIndex += event['m_items'][i + 0]   # Delta-encoded index
    x = event['m_items'][i + 1] * 4        # Approximate position
    y = event['m_items'][i + 2] * 4        # Approximate position
```

Positions are approximate (multiplied by 4 from encoded values), and only units that have inflicted or taken damage are included. This aggressive filtering keeps tracker data compact even in large battles.

Known issues acknowledged by Blizzard:
> "There's a known issue where revived units are not tracked, and placeholder units track death but not birth."

**IC comparison:** IC's analysis event stream should adopt this taxonomy:
1. **UnitCreated** (≈ SUnitBornEvent) — unit added to sim, includes position, type, owner
2. **UnitConstructionStarted** (≈ SUnitInitEvent) — building begins
3. **UnitConstructionCompleted** (≈ SUnitDoneEvent) — building finished
4. **UnitDestroyed** (≈ SUnitDiedEvent) — unit removed from sim, includes killer info
5. **UnitPositionSample** (≈ SUnitPositionsEvent) — periodic position snapshots for heatmap/movement analysis
6. **PlayerStatSnapshot** (≈ SPlayerStatsEvent) — periodic economy/military summary

The delta-encoded position events with combat-only filtering is a smart bandwidth optimization IC should adopt for its analysis stream.

### 5.4 Fixed-Point in Tracker Events

From the `s2protocol` README:

> "In NNet.Replay.Tracker.SPlayerStatsEvent, m_scoreValueFoodUsed and m_scoreValueFoodMade are in fixed point (divide by 4096 for integer values). All other values are in integers."

This confirms SC2 uses fixed-point internally (4096 = 2^12 scale) despite exposing floats in the API. The 4096 scale aligns with OpenRA's 1024 scale (both powers of 2).

**IC comparison:** IC's pending decision P002 (fixed-point scale) should consider SC2's 4096 (2^12) as a data point alongside OpenRA's 1024 (2^10). Higher scale = more precision but larger value range. For RA1 gameplay where positions and distances need moderate precision, 1024 or 4096 are both viable.

---

## Part 6: Agent/Bot Architecture (s2client-api)

### 6.1 Coordinator: Game Lifecycle Manager

The `Coordinator` class manages the entire game lifecycle — launching SC2, establishing WebSocket connections, creating/joining games, running the step loop, and processing replays. From `sc2_coordinator.h`:

```cpp
class Coordinator {
    bool LoadSettings(int argc, char** argv);
    void SetMultithreaded(bool value);
    void SetRealtime(bool value);
    void SetStepSize(int step_size);
    void SetDataVersion(const std::string& version);  // For replay version matching
    void SetParticipants(const std::vector<PlayerSetup>& participants);
    bool StartGame(const std::string& map_path);
    bool Update();  // Step simulation forward, dispatch events
    void LeaveGame();
    bool HasReplays() const;
};
```

The `Update()` method is the core loop, with different behavior per mode:
- **Non-realtime:** Step → Wait → Parse observation → Dispatch events → Call OnStep
- **Realtime:** Request observation → Wait → Parse → Dispatch → Send actions

**IC comparison:** IC's `GameLoop<N: NetworkModel, I: InputSource>` is architecturally equivalent to the Coordinator. The key design lesson is the explicit separation of settings configuration (before game start) from runtime stepping (the Update loop). IC's equivalent should also cleanly separate lobby/setup state from in-game state.

### 6.2 Client → Agent → ClientEvents Hierarchy

SC2's bot architecture uses inheritance with clear separation of concerns:

```
ClientEvents (event callbacks: OnGameStart, OnStep, OnUnitDestroyed, etc.)
    └── Client (read-only interfaces: Observation, Query, Debug)
        └── Agent (action interfaces: Actions, ActionsFeatureLayer)
```

From `sc2_client.h`, the event callbacks include:

```cpp
virtual void OnGameStart() {}
virtual void OnStep() {}
virtual void OnUnitDestroyed(const Unit*) {}
virtual void OnUnitCreated(const Unit*) {}
virtual void OnUnitIdle(const Unit*) {}           // Unit lost all orders
virtual void OnUpgradeCompleted(UpgradeID) {}
virtual void OnBuildingConstructionComplete(const Unit*) {}
virtual void OnUnitEnterVision(const Unit*) {}    // Enemy enters fog-of-war
virtual void OnNuclearLaunchDetected() {}
virtual void OnError(const std::vector<ClientError>&, const std::vector<std::string>&) {}
```

The `OnUnitIdle` event is particularly useful — it fires when a unit transitions from having orders to having no orders, enabling reactive behavior (auto-assign idle workers).

**IC comparison:** If IC adds a bot/scripting API beyond Lua (D024), this event hierarchy is proven. The events map to IC's sim events:
- `OnUnitCreated` → Bevy `Added<Unit>` system
- `OnUnitDestroyed` → Bevy `RemovedComponents<Unit>` system
- `OnUnitIdle` → system that detects order queue empty transition
- `OnBuildingConstructionComplete` → construction system completion event

IC's Lua API (D024) should expose these same event hooks. The `OnUnitIdle` event is particularly valuable for AI — OpenRA's Lua API doesn't have a direct equivalent.

### 6.3 Interface Separation

SC2 rigorously separates interfaces by concern:

| Interface                 | Purpose                                          | Access Level            |
| ------------------------- | ------------------------------------------------ | ----------------------- |
| `ObservationInterface`    | Read-only game state                             | All (agents, observers) |
| `ActionInterface`         | Unit commands (batch + send)                     | Agents only             |
| `QueryInterface`          | Blocking queries (pathing, placement, abilities) | All                     |
| `DebugInterface`          | Debug drawing + cheats                           | All (debug builds)      |
| `ObserverActionInterface` | Camera control                                   | Observers only          |
| `AgentControlInterface`   | Game restart                                     | Agents only             |

The `ActionInterface` batches commands: individual `UnitCommand()` calls accumulate, and `SendActions()` dispatches them all. In non-realtime mode, `SendActions()` is called automatically at step boundaries. In realtime mode, the bot must call it explicitly.

**IC comparison:** This validates IC's trait separation approach. IC's key interfaces map naturally:
- `ObservationInterface` → IC's sim state (read via Bevy queries)
- `ActionInterface` → IC's `PlayerOrder` submission via `ic-protocol`
- `QueryInterface` → IC's `Pathfinder` and `SpatialIndex` traits
- `DebugInterface` → IC's ic-render debug overlay

The batching-then-dispatch pattern for actions is directly applicable to IC's order processing: orders accumulate during a tick, then are processed together during the FixedUpdate step.

---

## Part 7: Debug Infrastructure

### 7.1 Debug Drawing API

SC2's `DebugInterface` provides four drawing primitives, all operating in 3D world space:

```protobuf
message DebugDraw {
  repeated DebugText text = 1;     // Screen-space or world-space text
  repeated DebugLine lines = 2;    // World-space lines
  repeated DebugBox boxes = 3;     // World-space AABB boxes
  repeated DebugSphere spheres = 4;// World-space spheres
}
```

Debug draws are **queued and batched** via `SendDebug()`. Drawn primitives persist between frames until the next `SendDebug()` call. This means debug visualization has zero cost unless actively used, and the draw state is explicitly managed.

**IC comparison:** IC's `ic-render` crate should include debug drawing primitives during development phases with the same characteristics:
1. **Queued + batched** — no per-frame overhead unless debug mode is active
2. **Persistent until replaced** — avoid redrawing static debug info every frame
3. **Both screen-space and world-space text** — screen-space for UI overlays, world-space for unit labels
4. **Configurable color** — color-coded debug info for different systems (pathfinding=yellow, combat=red, etc.)

### 7.2 Debug Game Commands

From `debug.proto`, SC2 provides cheat commands for development and testing:

```protobuf
enum DebugGameState {
  show_map = 1;       // Remove fog-of-war
  control_enemy = 2;  // Issue commands to enemy units
  food = 3;           // Disable supply limit
  free = 4;           // Free cost
  all_resources = 5;  // Give resources
  god = 6;            // Invincibility
  minerals = 7;
  gas = 8;
  cooldown = 9;       // Instant cooldowns
  tech_tree = 10;     // Unlock all tech
  upgrade = 11;       // All upgrades
  fast_build = 12;    // Accelerated construction
}

message DebugCreateUnit {
  optional uint32 unit_type = 1;
  optional int32 owner = 2;
  optional Point2D pos = 3;
  optional uint32 quantity = 4;
}

message DebugTestProcess {
  enum Test { hang = 1; crash = 2; exit = 3; }
  optional int32 delay_ms = 2;
}
```

The `DebugTestProcess` command is particularly clever — intentionally triggering hangs, crashes, or exits to test stability and error recovery.

**IC comparison:** IC's Scenario Editor (D038) and debug tooling should include equivalent commands. For development:
1. Debug cheat commands (show_map, free_build, god_mode, fast_build) are essential for gameplay testing
2. `DebugCreateUnit` with quantity and position is needed for stress testing and scenario setup
3. `DebugTestProcess` is brilliant for testing crash recovery — IC should include similar fault injection for desync detection testing

---

## Summary: Actionable Recommendations for IC

### Simulation (highest impact)

| Finding                                   | Recommendation                                             | IC Design Impact          |
| ----------------------------------------- | ---------------------------------------------------------- | ------------------------- |
| Generational unit tags (index + recycle)  | Use slotmap/thunderdome pattern for entity IDs             | ic-sim entity identity    |
| DisplayType fog-of-war enum               | Define Visibility enum: Visible/Snapshot/Hidden in ic-sim  | FogProvider trait (D041)  |
| Selective field population per visibility | Limit exposed component fields based on fog state          | FogProvider output design |
| Cosmetic randomness from seed             | Add seeded visual variation (attack timing, etc.)          | ic-sim + ic-render        |
| Explicit game lifecycle state machine     | Formalize state machine with valid transitions per command | Relay protocol (Phase 5)  |

### Data Model

| Finding                                  | Recommendation                                                | IC Design Impact            |
| ---------------------------------------- | ------------------------------------------------------------- | --------------------------- |
| Stable IDs for all game elements         | Assign stable YAML-defined IDs, not file-order derived        | ic-sim + ra-formats         |
| Ability remapping (remaps_to_ability_id) | Generic ability aliases for mod compatibility                 | ic-sim ability system       |
| Target type declaration on abilities     | Include Target enum (None/Point/Unit/PointOrUnit) per ability | Order validation            |
| Multiple weapons per unit                | weapon list, not single attack                                | YAML unit definitions       |
| Attribute-based damage bonuses           | DamageBonus per attribute type in weapon data                 | DamageResolver trait (D041) |
| tech_alias + unit_alias                  | Morph chains and tech equivalence as data                     | YAML tech tree              |

### Score / Statistics

| Finding                                          | Recommendation                                   | IC Design Impact            |
| ------------------------------------------------ | ------------------------------------------------ | --------------------------- |
| Comprehensive ScoreDetails                       | Define GameScore struct in ic-sim                | Post-game stats (D036/D053) |
| used vs total_used tracking                      | Track both current value and lifetime investment | Statistics system           |
| APM vs Effective APM                             | Raw + filtered action counting                   | Player profiles (D053)      |
| CategoryScoreDetails (army/economy/tech/upgrade) | Per-category resource/loss breakdowns            | Post-game analysis          |
| idle_production_time tracking                    | Measure lost production opportunities            | Performance metrics         |

### Order Validation

| Finding                             | Recommendation                                           | IC Design Impact      |
| ----------------------------------- | -------------------------------------------------------- | --------------------- |
| 214-code ActionResult enum          | Define comprehensive OrderRejectionReason in ic-protocol | OrderValidator (D012) |
| Dual error paths (immediate + late) | Distinguish validation rejection from execution failure  | Sim error handling    |
| Must/Cant pairing pattern           | Complementary constraint codes for every targeting rule  | Error categorization  |
| Batch pathfinding queries           | Add batch_distances() to Pathfinder trait                | AI performance (D043) |
| Placement queries with unit context | Include placing unit in placement validation             | Building system       |

### Replay Architecture

| Finding                               | Recommendation                                        | IC Design Impact        |
| ------------------------------------- | ----------------------------------------------------- | ----------------------- |
| Stable header + version-specific body | Two-level replay format with serde forward compat     | Replay format (Phase 2) |
| Separate event streams per purpose    | Order/Analysis/Chat/Metadata streams                  | Replay file structure   |
| Tracker event taxonomy                | UnitCreated/Destroyed/ConstructionStarted/etc. events | Analysis event stream   |
| Delta-encoded position events         | Compact position sampling for combat-active units     | Replay compression      |
| Fixed-point in tracker (÷4096)        | Consider 4096 scale alongside 1024 for P002           | Fixed-point decision    |

### Bot/AI Interface

| Finding                                       | Recommendation                                   | IC Design Impact          |
| --------------------------------------------- | ------------------------------------------------ | ------------------------- |
| Raw/FeatureLayer/Rendered interfaces          | Expose Raw interface first for bots/replays      | External AI API (Phase 4) |
| Coordinator lifecycle manager                 | Validate GameLoop<N, I> as equivalent pattern    | ic-game architecture      |
| Event callbacks (OnStep, OnUnitCreated, etc.) | Expose in Lua API and future bot API             | D024 Lua API              |
| OnUnitIdle event                              | Add idle transition detection                    | AI and scripting          |
| Batched action dispatch                       | Orders accumulate per tick, dispatch at boundary | Order processing          |

### Debug / Development

| Finding                                      | Recommendation                                     | IC Design Impact     |
| -------------------------------------------- | -------------------------------------------------- | -------------------- |
| Debug drawing (text, lines, boxes, spheres)  | Implement queued debug overlay in ic-render        | Development tooling  |
| Persistent draws until next SendDebug        | Avoid per-frame redraw of static debug info        | Performance          |
| Debug cheats (show_map, god, fast_build)     | Essential for gameplay testing and scenario editor | D038 Scenario Editor |
| DebugCreateUnit (type, owner, pos, quantity) | Implement for stress testing and scenario setup    | Testing framework    |
| DebugTestProcess (hang/crash/exit)           | Fault injection for crash/desync recovery testing  | Robustness testing   |

---

## Appendix: SC2 Unit Proto vs IC Unit Model Comparison

| Aspect          | SC2 (raw.proto + sc2_unit.h)            | IC (planned)                                 |
| --------------- | --------------------------------------- | -------------------------------------------- |
| Identity        | uint64 tag (index + recycle generation) | Bevy Entity (index + generation), equivalent |
| Position        | Point3D (float32 x, y, z)               | WorldPos { x, y, z } (fixed-point i32)       |
| Facing          | float32 radians                         | Fixed-point angle                            |
| Health          | float32 (health + health_max)           | Fixed-point (hp + hp_max)                    |
| Orders          | vector of UnitOrder (ability + target)  | Vec<PlayerOrder> via ic-protocol             |
| Fog state       | DisplayType enum on each unit           | Visibility enum via FogProvider              |
| Owner           | int32 player_id                         | PlayerId in ic-sim                           |
| Type            | UnitTypeID (stable int)                 | YAML-defined stable ID                       |
| Buffs           | vector of BuffID                        | Component-based (Bevy)                       |
| Transport       | passengers vector + cargo counts        | Component-based (Bevy)                       |
| Build progress  | float [0.0, 1.0]                        | Fixed-point [0, FP_ONE]                      |
| Weapon cooldown | float (time remaining)                  | Fixed-point tick counter                     |
| Cloaked         | CloakState enum (4 states)              | Component flag + detection system            |
| Alive tracking  | is_alive + last_seen_game_loop          | Bevy entity existence + fog snapshot table   |

The key architectural difference: SC2 represents units as flat structs with all data inlined; IC uses ECS with data decomposed into components. Both approaches are valid — SC2's is optimized for the protobuf wire format and external API, IC's is optimized for internal cache-friendly iteration. The external API (replays, bot interface) should present a flattened view similar to SC2's Unit proto, while the internal ECS layout remains decomposed.
