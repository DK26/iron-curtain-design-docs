# Veloren, Hypersomnia, OpenBW & DDraceNetwork — Netcode Architecture Analysis

> Research for Iron Curtain. Concrete technical findings from source code analysis.
> Repos: [veloren/veloren](https://github.com/veloren/veloren), [TeamHypersomnia/Hypersomnia](https://github.com/TeamHypersomnia/Hypersomnia), [OpenBW/openbw](https://github.com/OpenBW/openbw), [ddnet/ddnet](https://github.com/ddnet/ddnet)

---

## Table of Contents

1. [Veloren — Overview](#veloren--overview)
2. [Veloren — Transport & Protocol Layer](#veloren--transport--protocol-layer)
3. [Veloren — Region-Based Entity Sync](#veloren--region-based-entity-sync)
4. [Veloren — NetSync Trait & Component Filtering](#veloren--netsync-trait--component-filtering)
5. [Veloren — Compression Strategies](#veloren--compression-strategies)
6. [Veloren — Stream Priority System](#veloren--stream-priority-system)
7. [Hypersomnia — Overview](#hypersomnia--overview)
8. [Hypersomnia — Dual-Arena Rollback Architecture](#hypersomnia--dual-arena-rollback-architecture)
9. [Hypersomnia — Misprediction Detection & Smoothing](#hypersomnia--misprediction-detection--smoothing)
10. [Hypersomnia — Predictability System](#hypersomnia--predictability-system)
11. [Hypersomnia — Server Architecture & Competitive Infrastructure](#hypersomnia--server-architecture--competitive-infrastructure)
12. [Hypersomnia — Authentication & Resync](#hypersomnia--authentication--resync)
13. [OpenBW — Overview](#openbw--overview)
14. [OpenBW — Lockstep Synchronization](#openbw--lockstep-synchronization)
15. [OpenBW — Insync Hash Verification](#openbw--insync-hash-verification)
16. [OpenBW — Action Scheduling & Latency Buffer](#openbw--action-scheduling--latency-buffer)
17. [OpenBW — Replay System & Snapshots](#openbw--replay-system--snapshots)
18. [OpenBW — Client UID & Game Start Sync](#openbw--client-uid--game-start-sync)
19. [DDraceNetwork — Overview](#ddracenetwork--overview)
20. [DDraceNetwork — Snapshot Delta Compression](#ddracenetwork--snapshot-delta-compression)
21. [DDraceNetwork — Adaptive Snapshot Rate](#ddracenetwork--adaptive-snapshot-rate)
22. [DDraceNetwork — Anti-Abuse Infrastructure](#ddracenetwork--anti-abuse-infrastructure)
23. [DDraceNetwork — Antibot Plugin Architecture](#ddracenetwork--antibot-plugin-architecture)
24. [Comparative Analysis](#comparative-analysis)
25. [Techniques Worth Adopting for Iron Curtain](#techniques-worth-adopting-for-iron-curtain)

---

## Veloren — Overview

**Language:** Rust  
**ECS:** specs (not Bevy, but same paradigm — parallel ECS with systems)  
**Transport:** Custom `veloren-network-protocol` crate with TCP, QUIC (via `quinn`), and MPSC (in-process) backends  
**Model:** Client-server authoritative (not lockstep — server runs full sim, clients render server snapshots)  
**Compression:** LZ4 (`lz_fear`) for protocol-level, Deflate (`flate2`) for terrain chunks, PNG-based voxel encoding  
**Key source paths:** `network/protocol/src/`, `server/src/sys/entity_sync.rs`, `common/net/src/`

### Why Study This

Veloren is the closest architectural relative to Iron Curtain in the Rust ecosystem — a large Rust game with ECS, custom networking, and a real production playerbase. While its authoritative server model differs from IC's lockstep, its transport abstraction, compression pipeline, and ECS-aware sync patterns are directly relevant.

---

## Veloren — Transport & Protocol Layer

### Multi-Transport Abstraction

Veloren's `veloren-network-protocol` crate provides a unified API over three transport backends, abstracted via `SendProtocol`/`RecvProtocol` traits:

```
network/protocol/src/lib.rs — Module structure
network/src/channel.rs:30-55 — Protocols enum: Tcp, Mpsc, Quic
```

```rust
pub enum Protocols {
    Tcp((TcpSendProtocol<TcpDrain>, TcpRecvProtocol<TcpSink>)),
    Mpsc((MpscSendProtocol<MpscDrain>, MpscRecvProtocol<MpscSink>)),
    #[cfg(feature = "quic")]
    Quic((QuicSendProtocol<QuicDrain>, QuicRecvProtocol<QuicSink>)),
}
```

**Iron Curtain relevance:** This is exactly the pattern IC needs for its `NetworkModel` trait. The `Mpsc` variant serves as `LocalNetwork` for singleplayer/testing. The `Quic` variant demonstrates how to layer QUIC over the same abstraction. IC should consider adding a QUIC transport alongside its planned UDP lockstep.

### Stream Promises (QoS Flags)

Each stream has configurable guarantees via a `Promises` bitflag:

```rust
// network/protocol/src/types.rs:25-42
pub struct Promises: u8 {
    const ORDERED           = 0b00000001;
    const CONSISTENCY       = 0b00000010;  // checksum verification
    const GUARANTEED_DELIVERY = 0b00000100;
    const COMPRESSED        = 0b00001000;  // LZ4 compression
    const ENCRYPTED         = 0b00010000;
}
```

Different game data uses different promise combinations: terrain chunks use `COMPRESSED`, chat uses `ORDERED | GUARANTEED_DELIVERY`, position updates can drop `GUARANTEED_DELIVERY` for lower latency.

**Iron Curtain relevance:** IC's order channel needs `ORDERED | GUARANTEED_DELIVERY | CONSISTENCY`. Spectator streams and replay data could use `COMPRESSED` without strict ordering. The bitflag approach is cleaner than separate channel types.

### Protocol Versioning & Anti-DDoS

```rust
// network/protocol/src/types.rs:46
pub const VELOREN_NETWORK_VERSION: [u32; 3] = [0, 6, 0];
pub(crate) const VELOREN_MAGIC_NUMBER: [u8; 7] = *b"VELOREN";
```

```rust
// network/protocol/src/message.rs:82-93
impl ITMessage {
    pub(crate) fn new(sid: Sid, length: u64, _allocator: &mut BytesMut) -> Self {
        Self {
            sid,
            length,
            data: BytesMut::with_capacity((length as usize).min(ALLOC_BLOCK /* anti-ddos */)),
        }
    }
}
```

Message allocation is capped at `ALLOC_BLOCK` to prevent memory exhaustion from malicious length fields — exactly the `BoundedReader` pattern specified in IC's `06-SECURITY.md`.

---

## Veloren — Region-Based Entity Sync

### RegionMap Partitioning

The server world is partitioned into regions of `2^9 = 512` blocks. Each client subscribes to regions within their view distance:

```
server/src/sys/entity_sync.rs — Full ECS sync system
server/src/sys/subscription.rs — Region subscription management
```

The system uses `specs::BitSet` for efficient tracking of which entities are in which regions. On each tick:

1. For each client, determine subscribed regions based on position + view distance
2. For entities entering a subscribed region: send full component sync
3. For entities within subscribed regions: send delta updates for changed components
4. For entities leaving subscribed regions: send deletion

### Component Change Tracking

```
server/src/sys/sentinel.rs — TrackedStorages, UpdateTrackers
```

The `TrackedStorages` struct wraps all synced component storages with change tracking. `create_sync_packages()` generates minimal delta packages containing only changed components since the last sync — preventing full entity re-serialization each tick.

### Parallel Sync with Rayon

Entity sync across regions is parallelized using rayon, partitioning by X-axis range:

```
server/src/sys/terrain_sync.rs — View-distance based chunk sending with X-axis partitioning
```

**Iron Curtain relevance:** While IC uses lockstep (no entity sync needed — all clients run the full sim), the region subscription pattern is directly applicable to:
- **Fog-authoritative server mode** (future): only send visible entity state per player
- **Spectator streaming**: partition the map and only send viewed areas
- **WASM mod sandboxing**: `get_visible_units()` rather than `get_all_units()` maps directly to this region-based filtering

### Distance-Based Sync Throttling

```
server/src/sys/entity_sync.rs:L447 — entity_view_distance for outcomes
```

Distant entities receive lower-fidelity updates. Physics outcomes (particle effects, sound events) are filtered by distance — a client doesn't receive explosion particles from across the map.

**Iron Curtain relevance:** Directly applicable to IC's simulation LOD system (invariant #5 in AGENTS.md). Even in lockstep, the *render* data sent to spectators or replay viewers could use distance-based filtering.

---

## Veloren — NetSync Trait & Component Filtering

### The NetSync Trait

```rust
// common/net/src/sync/net_sync.rs
pub trait NetSync: specs::Component + Clone + Send + Sync {
    const SYNC_FROM: SyncFrom;
}
```

```rust
pub enum SyncFrom {
    AnyEntity,         // Sync this component for all entities
    ClientEntity,      // Only sync for the client's own entity
    ClientSpectatorEntity, // Sync for client entity OR spectated entity
}
```

### Synced Components Macro

Over 40 components are registered with `NetSync` impl:

```
common/net/src/synced_components.rs — ~40+ components with NetSync
```

Each component specifies who receives it. For example:
- `Health` → `SyncFrom::AnyEntity` (everyone sees everyone's HP)
- `Inventory` → `SyncFrom::ClientEntity` (only your own inventory)
- `CharacterState` → `SyncFrom::AnyEntity` (animation state visible to all)

### Client-Side Interpolation

```rust
// common/state/src/state.rs
InterpBuffer<Pos>   // Client-side position interpolation
InterpBuffer<Vel>   // Velocity interpolation
InterpBuffer<Ori>   // Orientation interpolation
Last<Pos>, Last<Vel>, Last<Ori>  // Server-side delta detection
```

The `InterpBuffer<T>` pattern provides smooth visual movement between discrete server updates, with server-side `Last<T>` components tracking the most recently sent value to compute deltas.

### Force Update System

A counter-based system ensures eventual convergence: if a component hasn't been synced for N ticks, it's force-sent regardless of change detection. This prevents stuck state from dropped packets.

**Iron Curtain relevance:** The `SyncFrom` enum maps conceptually to IC's WASM mod capability system. IC's `get_visible_units()` vs `get_all_units()` API directly parallels `AnyEntity` vs `ClientEntity`. The force-update counter pattern is useful for IC's fog-authoritative server mode.

---

## Veloren — Compression Strategies

### Multi-Layer Compression

Veloren uses a sophisticated multi-layer compression approach:

1. **Protocol-level LZ4** (`lz_fear::raw::compress2`): Per-stream optional compression via `COMPRESSED` promise

```rust
// network/src/message.rs:44-61
let mut compressed_data = Vec::with_capacity(serialized_data.len() / 4 + 10);
let mut table = lz_fear::raw::U32Table::default();
lz_fear::raw::compress2(&serialized_data, 0, &mut table, &mut compressed_data).unwrap();
```

2. **Terrain-level Deflate** (`flate2`): Higher-ratio compression for large terrain chunks

```rust
// common/net/src/msg/compression.rs:30-58
impl<T: Serialize> CompressedData<T> {
    pub fn compress(t: &T, level: u32) -> Self {
        let uncompressed = encode_to_vec(t, legacy()).unwrap();
        if uncompressed.len() >= 32 {
            let buf = Vec::with_capacity(uncompressed.len() / 10);
            let mut encoder = DeflateEncoder::new(buf, Compression::new(level));
            // ...
        } else {
            // Small data sent uncompressed
        }
    }
}
```

3. **Voxel-specific PNG encoding** (`QuadPngEncoding`, `TriPngEncoding`): Domain-specific compression that packs 3D voxel data into 2D PNG images with lossy/lossless variants

```rust
// common/net/src/msg/server.rs:96-115
pub fn via_heuristic(chunk: &TerrainChunk, lossy_compression: bool) -> Self {
    if lossy_compression && (chunk.get_max_z() - chunk.get_min_z() <= 128) {
        Self::quadpng(chunk)  // Lossy, smaller
    } else {
        Self::deflate(chunk)  // Lossless, larger
    }
}
```

**Iron Curtain relevance:** IC's replay files and save games (`Serialize`/`Deserialize` on all `ic-sim` types) would benefit from similar multi-layer compression: fast LZ4 for real-time network traffic, higher-ratio Deflate for on-disk replays. The threshold-based heuristic (compress only if > 32 bytes) avoids compression overhead on small messages like player orders.

---

## Veloren — Stream Priority System

### Priority Manager (PrioManager)

```
network/protocol/src/prio.rs — Priority-based bandwidth allocation
network/protocol/src/types.rs:12-15 — Prio type (u8, 0-7)
```

Each stream has a priority (0 = highest, 7 = lowest) and a `guaranteed_bandwidth` allocation. During flush:

1. Guaranteed bandwidth is allocated first to each stream
2. Remaining bandwidth is shared among streams at the same priority level
3. Higher-priority streams are flushed before lower ones

```rust
// network/protocol/src/quic.rs:275-293
async fn flush(&mut self, bandwidth: Bandwidth, dt: Duration)
    -> Result<Bandwidth, ProtocolError<Self::CustomErr>>
{
    let (frames, _) = self.store.grab(bandwidth, dt);
    // Priority-ordered frame iteration...
}
```

**Iron Curtain relevance:** IC's relay server could use priority-based bandwidth allocation:
- Priority 0: Player orders (tiny, critical)
- Priority 1: Desync detection hashes
- Priority 2: Chat messages
- Priority 3: Spectator data / replay streaming

---

## Hypersomnia — Overview

**Language:** C++ (modern C++17)  
**Genre:** Competitive top-down multiplayer shooter (Steam title, app ID 2660970)  
**Transport:** `netcode.io` + `yojimbo` (reliable UDP) + WebRTC for browser clients  
**Model:** Server-authoritative with client-side prediction and rollback  
**Platform:** Desktop (native) + Browser (WASM via WebRTC)  
**Key source paths:** `src/application/setups/server/`, `src/application/network/`, `src/game/modes/`

### Why Study This

Hypersomnia is the most architecturally sophisticated rollback netcode implementation in an open-source competitive game. While IC uses lockstep (not rollback), Hypersomnia's misprediction detection, state hashing, ranked infrastructure, and authentication patterns are directly transferable.

---

## Hypersomnia — Dual-Arena Rollback Architecture

### Referential vs Predicted Arena

```cpp
// src/application/setups/client/client_setup.h
class client_setup {
    // Server-authoritative state (ground truth)
    cosmos referential_arena;
    // Client prediction (speculatively advanced)
    cosmos predicted_arena;
};
```

The client maintains two complete copies of the game world. The `referential_arena` receives confirmed server state. The `predicted_arena` is speculatively advanced with local input. When a server snapshot arrives:

1. Apply it to `referential_arena`
2. Compare `predicted_arena`'s state hash against expected
3. If mismatch → re-simulate from `referential_arena` forward with buffered inputs
4. Apply misprediction smoothing to visuals

### Entropy-Based Step System

```cpp
// src/application/network/server_step_entropy.h
using server_step_entropy = mode_entropy;

struct compact_server_step_entropy {
    std::vector<client_entropy_entry> players;
    mode_entropy_general general;
};
```

"Entropy" in Hypersomnia's codebase means "player input for a given simulation step" — equivalent to IC's `PlayerOrder`. The server collects all player entropies, packs them into a `compact_server_step_entropy`, and distributes to all clients.

**Iron Curtain relevance:** This is structurally identical to IC's `TickOrders` concept: `compact_server_step_entropy ≈ TickOrders { frame: u32, orders: Vec<PlayerOrder> }`. The naming convention of "entropy" (information-theoretic: the non-deterministic input to an otherwise deterministic system) is more precise than "orders" and worth considering.

---

## Hypersomnia — Misprediction Detection & Smoothing

### Hash-Based Detection

```cpp
// src/application/network/simulation_receiver.h:L268
// meta.state_hash vs predicted_step.state_hash
// If mismatch → repredict
// Also checks entropy mismatch
```

After each server step arrives, the receiver compares:
1. The server's `state_hash` against the client's predicted hash for that step
2. The server's entropy (input) against the client's predicted entropy

If either mismatches, the client must "repredict" — restore `referential_arena` and re-simulate forward.

### Visual Smoothing After Misprediction

```cpp
// src/application/network/simulation_receiver.cpp:L134
// drag_mispredictions_into_past()
positional_slowdown_multiplier * num_predicted_steps
rotational_slowdown_multiplier * num_predicted_steps
```

When a misprediction occurs, entities snap to their corrected positions in the simulation, but the *visual representation* is smoothed over multiple frames using multipliers that scale with how many steps were re-predicted. Larger prediction windows → slower visual correction → less jarring rubber-banding.

### Interpolation Preservation

```cpp
// src/application/setups/client/client_setup.cpp:L2214
save_interpolations();    // Before reprediction
// ... repredict ...
restore_interpolations(); // After reprediction
```

Interpolation state (visual positions between ticks) is saved before reprediction and restored after, preventing visual artifacts during the correction process.

**Iron Curtain relevance:** While IC's lockstep doesn't need client-side prediction, these patterns apply to:
- **Rollback network model** (future): IC's `RollbackNetwork` implementation will need exactly this dual-state architecture
- **Cross-engine reconciliation** (Level 3): prediction + reconciliation against an OpenRA authority
- **Spectator latency hiding**: smoothing between received and predicted game states

---

## Hypersomnia — Predictability System

### Per-Effect Prediction Control

```cpp
// src/game/detail/view_input/predictability_info.h
enum class predictability {
    ALWAYS,      // Always predict (player's own actions)
    NEVER,       // Never predict (other players' effects)
    ONLY_BY,     // Only predict if caused by local player
};
```

Each visual/audio effect has a `predictability` tag. The `prediction_input` system uses `play_predictable`/`play_unpredictable` flags to determine what to render:

- Client's own gunshot sound: `ALWAYS` predicted → plays immediately
- Enemy's gunshot: `NEVER` predicted → waits for server confirmation
- Explosion from client's grenade: `ONLY_BY` → predicted only for the thrower

**Iron Curtain relevance:** IC's lockstep means all clients see the same state simultaneously, so prediction filtering isn't needed for gameplay. But for audio/visual effects in the render layer (`ic-render`, `ic-audio`), this pattern enables:
- Playing weapon fire sounds immediately on input for the local player (before the next tick confirms it)
- Deferring effects that depend on combat resolution (hit/miss)
- Speculative UI feedback (build queue click → immediate visual response, confirmation next tick)

---

## Hypersomnia — Server Architecture & Competitive Infrastructure

### Server Client State Machine

```cpp
// src/application/setups/server/server_client_state.h:59-103
struct server_client_state {
    client_state_type state;
    net_time_t when_connected;
    net_time_t when_kicked;
    net_time_t last_keyboard_activity_time;
    
    downloading_type downloading_status;
    std::string authenticated_id;
    bool verified_has_no_ban;
    
    uint32_t session_id;
    client_pause_state web_client_paused;
    uint32_t entropies_since_pause;
};
```

### Timeout & AFK Management

```cpp
// src/application/setups/server/server_vars.h:130-152
float web_client_network_timeout_secs = 1.5f;   // Browser clients: shorter
float client_network_timeout_secs = 3.0f;       // Native clients: longer
uint32_t move_to_spectators_if_afk_for_secs = 120;
uint32_t kick_if_afk_for_secs = 7200;
uint32_t reset_resync_timer_once_every_secs = 10;
```

Different timeout values for web vs native clients, with a progressive AFK response: move to spectators after 2 minutes, kick after 2 hours.

### Ranked Match System

```cpp
// src/application/setups/server/server_setup.cpp:L2195
bool server_setup::is_ranked_server() const {
    return vars.ranked.autostart_when != ranked_autostart_type::NEVER;
}
```

Ranked infrastructure includes:
- Steam + Web authentication (`auth_request_payload`, Steam Web API ticket validation)
- Match result reporting to backend API (`report_ranked_match_url`)
- Ban checking via HTTP API (`check_ban_url`)
- Timing-attack-resistant password comparison (`safe_equal()` for RCON)
- Per-server Discord/Telegram webhook integration for match notifications

### Masterserver / Server Browser

```cpp
// src/application/masterserver/server_heartbeat.h:29-56
struct server_heartbeat {
    server_name_type server_name;
    arena_identifier current_arena;
    uint8_t num_online_humans;
    uint8_t num_online;
    uint8_t server_slots;
    nat_detection_result nat;
    game_version_identifier server_version;
    uint8_t ranked_state;  // 0=unranked, 1=ranked_waiting, 2=ranked_live
    bool require_authentication;
};
```

The masterserver is a separate binary that:
- Receives UDP heartbeats from game servers
- Provides HTTP API for the server list
- Supports WebRTC signaling for browser clients
- Assigns WebRTC aliases for official servers based on geographic location
- Tracks server metadata including NAT type

**Iron Curtain relevance:** Hypersomnia's masterserver architecture closely mirrors IC's planned tracking server design:
- Heartbeat-based server registration → IC's `TrackingServer` trait
- Separate ranked state signaling → IC's lobby system
- WebRTC support for browser clients → IC's WASM target
- The `server_heartbeat` struct is a good template for IC's server listing protocol

---

## Hypersomnia — Authentication & Resync

### Resync Mechanism

```cpp
// src/application/setups/server/server_handle_payload.hpp:L335
// RESYNC_ARENA request → full solvable state re-send
// Rate-limited by reset_resync_timer_once_every_secs
```

When a client detects desync, it can request a full arena resync. The server rate-limits these requests (one every 10 seconds by default) to prevent abuse. The resync sends the complete "solvable" (deterministic) state.

### Non-Determinism Bug Case Study

From Hypersomnia's bug database: a desync was caused by a shared RNG being used for both gameplay movement pathfinding and decorative particle systems. The fix: separate RNG instances for deterministic and cosmetic systems.

**Iron Curtain relevance:** This validates IC's design of keeping simulation (`ic-sim`) completely separate from rendering (`ic-render`). Any RNG in `ic-sim` must be deterministic and serialized; `ic-render` can use its own non-deterministic RNG for particles, UI animations, etc.

---

## OpenBW — Overview

**Language:** C++ (header-heavy, template-based)  
**Game:** StarCraft: Brood War reimplementation  
**Model:** Deterministic lockstep (matching original BW behavior)  
**Transport:** Custom lightweight protocol over raw sockets  
**RNG:** LCG (Linear Congruential Generator, matching original BW)  
**Fixed-point:** Custom `fixed_point<integer_bits, fractional_bits, is_signed>` template  
**Key source paths:** `sync.h`, `actions.h`, `replay.h`, `replay_saver.h`, `util.h`

### Why Study This

OpenBW is the **most directly relevant** codebase to Iron Curtain: a clean-room C++ reimplementation of a classic RTS engine with deterministic lockstep, fixed-point math, replay system, and identical-to-original gameplay. Its networking, sync verification, and determinism patterns are directly transferable to IC.

---

## OpenBW — Lockstep Synchronization

### Class Hierarchy

```
state_functions          → Core deterministic sim
  └─ action_functions    → Parses & executes player actions
      └─ sync_functions  → Network synchronization layer
          └─ replay_functions → Replay playback
```

```cpp
// sync.h:184-186
struct sync_functions: action_functions {
    sync_state& sync_st;
    explicit sync_functions(state& st, action_state& action_st, sync_state& sync_st)
        : action_functions(st, action_st), sync_st(sync_st) {}
};
```

This hierarchy enforces a critical invariant: `state_functions` has NO networking awareness. `action_functions` only knows about action parsing. Only `sync_functions` deals with network synchronization. This clean layering exactly maps to IC's `ic-sim` → `ic-protocol` → `ic-net` boundary.

### Sync State

```cpp
// sync.h:18-108
struct sync_state {
    int latency = 2;  // Input delay (frames)
    bool game_started = false;
    int sync_frame = 0;
    
    struct client_t {
        uid_t uid;
        int player_slot = -1;
        a_vector<uint8_t> buffer;        // Action data buffer
        a_circular_vector<scheduled_action> scheduled_actions;
        uint8_t frame = 0;               // Client's current frame
        std::chrono::steady_clock::time_point last_synced;
    };
    
    a_list<client_t> clients;
    client_t* local_client;
    
    int successful_action_count = 0;
    int failed_action_count = 0;
    std::array<uint32_t, 4> insync_hash{};  // Rolling hash array
    uint8_t insync_hash_index = 0;
};
```

**Key detail:** `latency = 2` means actions are scheduled 2 frames ahead — the classic lockstep input delay. This matches the original StarCraft behavior and is the simplest possible lockstep implementation.

### Frame Synchronization

```cpp
// sync.h:929-947
void sync_next_frame() {
    if (!sync_st.has_initialized) {
        // ... initialize slot state ...
    }
    ++sync_st.sync_frame;
    send_client_frame();
    
    // Hash check every 32 frames
    if (sync_st.game_started && sync_st.sync_frame % 32 == 0) {
        update_insync_hash();
        send_insync_check();
    }
}
```

The `sync()` method coordinates frame-by-frame lockstep:

```cpp
// sync.h:958-979
void sync() {
    sync_next_frame();
    server.set_timeout(std::chrono::seconds(1), ...);
    server.poll(...);
    // Wait until all clients are at the same frame
    auto pred = [this]() { return all_clients_in_sync(); };
    // ...
}
```

### Executing Scheduled Actions

```cpp
// sync.h:190-213
void execute_scheduled_actions(action_F&& action_f) {
    for (auto i = sync_st.clients.begin(); i != sync_st.clients.end();) {
        sync_state::client_t* c = &*i;
        ++i;
        while (!c->scheduled_actions.empty() 
               && (uint8_t)sync_st.sync_frame == c->scheduled_actions.front().frame) {
            auto act = c->scheduled_actions.front();
            c->scheduled_actions.pop_front();
            c->buffer_begin = act.data_end;
            data_loading::data_reader_le r(
                data + act.data_begin, data + act.data_end);
            if (!action_f(c, r)) break;
        }
    }
}
```

This is the core of the lockstep execution: actions scheduled for frame N are executed when `sync_frame` reaches N. The circular buffer design avoids reallocation.

**Iron Curtain relevance:** This maps directly to IC's `Simulation::apply_tick(&mut self, orders: &TickOrders)`. The `latency = 2` pattern validates IC's sub-tick timestamp approach (D008) — by assigning timestamps within the delay window, IC can improve on BW's strict frame-based ordering.

---

## OpenBW — Insync Hash Verification

### FNV-1a Hash Over Sim State

```cpp
// sync.h:625-649
void update_insync_hash() {
    uint32_t hash = 2166136261u;  // FNV-1a offset basis
    auto add = [&](auto v) {
        hash ^= (uint32_t)v;
        hash *= 16777619u;        // FNV-1a prime
    };
    
    // Action counts
    add(sync_st.successful_action_count);
    add(sync_st.failed_action_count);
    
    // RNG state
    add(st.lcg_rand_state);
    
    // All player resources
    for (auto v : st.current_minerals) add(v);
    for (auto v : st.current_gas) add(v);
    for (auto v : st.total_minerals_gathered) add(v);
    for (auto v : st.total_gas_gathered) add(v);
    
    // Active entity counts
    add(st.active_orders_size);
    add(st.active_bullets_size);
    add(st.active_thingies_size);
    
    // Per-unit HP + shields (using raw fixed-point values)
    for (unit_t* u : ptr(st.visible_units)) {
        add((u->shield_points + u->hp).raw_value);
        add(u->exact_position.x.raw_value);
        add(u->exact_position.y.raw_value);
    }
    
    // Rolling 4-hash array
    if (sync_st.insync_hash_index == sync_st.insync_hash.size() - 1)
        sync_st.insync_hash_index = 0;
    else 
        ++sync_st.insync_hash_index;
    sync_st.insync_hash[sync_st.insync_hash_index] = hash;
}
```

### What Gets Hashed (Priority Order)

1. **Action counts** — catches order processing divergence
2. **LCG random state** — catches RNG divergence (most common desync source)
3. **Player resources** — catches economic divergence
4. **Active entity counts** — catches unit creation/destruction divergence
5. **Per-unit position + HP** — catches movement/combat divergence (uses `raw_value` of fixed-point, not float conversion)

### Rolling Hash Array

The 4-element rolling hash array means the server checks the last 4 hash checkpoints (every 32 frames = every ~128 frames of history). This provides a window for diagnosis: which 32-frame block first diverged?

**Iron Curtain relevance:** This is a concrete model for IC's `state_hash()`. Key insights:
- Use FNV-1a (fast, simple, good distribution for hash comparison)
- Hash **raw fixed-point values**, never convert to float for hashing
- Include RNG state — it's the #1 desync source
- Include action counts as a cheap early divergence detector
- A rolling hash array (IC could use 4-8 entries) enables pinpointing *when* desync started
- Hash every N ticks, not every tick (OpenBW uses 32 — IC should make this configurable)

---

## OpenBW — Action Scheduling & Latency Buffer

### Circular Action Buffer

```cpp
// sync.h:223-278
bool schedule_action(sync_state::client_t* client, reader_T&& r) {
    size_t n = r.left();
    auto& buffer = client->buffer;
    // ... circular buffer management with wrap-around ...
    
    const size_t max_size = 1024u * 4 * sync_st.latency;
    // Buffer grows dynamically up to max_size
    
    client->scheduled_actions.push_back({
        (uint8_t)(client->frame + sync_st.latency),  // Execute at frame + latency
        pos, buffer_end
    });
    return true;
}
```

Actions are stored in a circular byte buffer with O(1) append and dequeue. The `max_size` scales with latency — higher latency → larger buffer needed to store pending actions.

### Action Processing (Message Types)

```cpp
// sync.h:779-927 — process_messages()
// Pre-game messages: id_client_uid, id_game_info, id_start_game,
//                    id_occupy_slot, id_set_race, id_leave_game
// In-game messages: Player actions (forwarded to action_functions),
//                   id_insync_check (desync detection)
```

The message processing cleanly separates pre-game lobby state (slot assignment, race selection) from in-game actions. The `id_game_started_escape` byte serves as an escape prefix for administrative messages during gameplay.

**Iron Curtain relevance:** The circular buffer pattern with latency-scaled sizing is directly applicable to IC's order buffering. IC's `ProtocolLimits.max_orders_per_tick` maps to OpenBW's `max_size` cap.

---

## OpenBW — Replay System & Snapshots

### Replay File Format

```cpp
// replay.h — replay_functions inherits action_functions
// File structure:
//   Identifier: 0x53526572 ("reSR" backwards)
//   Game info buffer (633 bytes)
//   Action data (variable)
//   Map data (variable)
//   CRC32 verification
```

### Replay Recording

```cpp
// replay_saver.h
struct replay_saver_state {
    uint32_t random_seed;
    std::string player_name;
    int map_tile_width, map_tile_height;
    uint8_t active_player_count;
    uint8_t slot_count;
};
```

The replay system records:
1. Initial game setup (seed, map, players)
2. Frame-by-frame action history
3. Map tile data for self-contained replays

### Custom Replay Compression

```cpp
// replay_saver.h:L222+
// LZ-style bit-level compression with distance/length encoding
// Max distance: (64 << distance_bits) - 1
// Max length: 518
```

A custom LZ-style compressor operates at the bit level rather than byte level, achieving better ratios for the structured action data typically found in RTS replays.

### Snapshot System (via API)

```cpp
// mini-openbwapi/openbwapi.h:1078-1106
void saveSnapshot(std::string id);
void loadSnapshot(const std::string& id);
void deleteSnapshot(const std::string& id);
std::vector<std::string> listSnapshots();
void setRandomSeed(uint32_t value);
```

OpenBW provides a full snapshot system for save/load via the BWAPI, with named snapshots stored in memory. `setRandomSeed()` allows resetting RNG state for deterministic replay from a snapshot.

**Iron Curtain relevance:** IC's `snapshot()` / `restore()` design maps directly. The named-snapshot approach enables IC's planned features: save games, desync debugging, rollback. The `setRandomSeed()` demonstrates that RNG state must be part of the snapshot — IC must include `lcg_rand_state` (or equivalent) in every snapshot.

---

## OpenBW — Client UID & Game Start Sync

### UID Generation

```cpp
// sync.h:34-55
static uid_t generate() {
    uid_t r;
    std::array<uint32_t, 8> arr;
    arr[0] = 42;  // Constant salt
    arr[1] = (uint32_t)std::chrono::high_resolution_clock::now().time_since_epoch().count();
    arr[2] = (uint32_t)std::hash<std::thread::id>()(std::this_thread::get_id());
    arr[3] = (uint32_t)std::chrono::high_resolution_clock::now().time_since_epoch().count();
    arr[4] = (uint32_t)std::chrono::steady_clock::now().time_since_epoch().count();
    arr[5] = (uint32_t)std::chrono::high_resolution_clock::now().time_since_epoch().count();
    arr[6] = (uint32_t)std::chrono::system_clock::now().time_since_epoch().count();
    arr[7] = 1;
    std::seed_seq seq(arr.begin(), arr.end());
    seq.generate(r.vals.begin(), r.vals.end());
    // Additional CRC32 mixing
    data_loading::crc32_t crc32;
    for (auto& v : r.vals) {
        v ^= crc32(c, n);
    }
    return r;
}
```

Multiple entropy sources (three different clocks + thread ID) ensure unique UIDs even for simultaneously-launched clients.

### Game Start Synchronization

```cpp
// sync.h:686-700
void start_game(uint32_t seed) {
    // Derive deterministic seed from all client UIDs + server seed
    a_string seed_str;
    for (auto& v : sync_st.clients) seed_str += v.uid.str();
    uint32_t rand_state = seed ^ data_loading::crc32_t()(
        (const uint8_t*)seed_str.data(), seed_str.size());
    st.lcg_rand_state = rand_state;
    
    // Randomize player slots using the deterministic LCG
    // ... Fisher-Yates shuffle using lcg_rand() ...
}
```

The game's initial RNG state is derived from ALL client UIDs XOR'd with a CRC32 hash, then passed through the LCG. This means:
- The seed is unpredictable (depends on all participants)
- It's deterministic (all clients derive the same seed from the same UIDs)
- Slot randomization uses the game's own deterministic RNG

**Iron Curtain relevance:** IC should use a similar approach for initial game seed:
1. Each player generates a cryptographic commitment to a random value
2. All commitments are exchanged before any values are revealed (commit-reveal scheme)
3. Final seed = XOR of all revealed values

This is more secure than OpenBW's approach (OpenBW's UIDs are predictable from timing), but the architecture is the same. The key insight: **seed derivation is itself a deterministic function of all participants**, not a server-chosen value.

---

## DDraceNetwork — Overview

**Language:** C/C++  
**Genre:** Cooperative platformer (Teeworlds fork)  
**Transport:** Custom UDP protocol with Huffman-compressed snapshots  
**Model:** Server-authoritative with client-side prediction  
**Scale:** 128 clients per server (expanded from Teeworlds' 16)  
**Database:** SQLite for player records, racing times  
**Key source paths:** `src/engine/server/`, `src/engine/client/`, `src/engine/shared/snapshot.*`, `src/game/server/`

### Why Study This

DDraceNetwork handles the largest player counts of any game in this study (128 simultaneous clients). Its snapshot delta compression, adaptive snapshot rate, and comprehensive anti-abuse infrastructure are directly relevant to IC's multiplayer scalability and security design.

---

## DDraceNetwork — Snapshot Delta Compression

### Compression Pipeline

DDNet uses a 3-stage compression pipeline for snapshots, documented in `src/engine/docs/snapshots.txt`:

1. **Delta compression**: Compare new snapshot against last-acknowledged snapshot, emit only differences

```cpp
// src/engine/shared/snapshot.cpp:509-610
int CSnapshotDelta::UnpackDelta(const CSnapshot *pFrom, CSnapshot *pTo, 
    const void *pSrcData, int DataSize, bool Sixup)
{
    CData *pDelta = (CData *)pSrcData;
    // pDelta contains: NumDeletedItems, NumUpdateItems, item diffs
    
    // Copy non-deleted items from previous snapshot
    for (int i = 0; i < pFrom->NumItems(); i++) {
        // ... skip if in deleted list ...
    }
    // Apply updates: XOR against previous values
}
```

2. **Variable-integer encoding**: Convert 32-bit integers to variable-length format (similar to UTF-8)

```
// Each byte has an "extend" bit indicating more bytes follow
// First byte also has a sign bit
// Heavily biased toward small values (which delta compression produces)
```

3. **Huffman coding**: Static Huffman tree weighted toward 0 (deltas are mostly zero)

### Per-Item-Type Data Rate Tracking

```cpp
// src/engine/shared/snapshot.h:78-109
class CSnapshotDelta {
    uint64_t m_aSnapshotDataRate[CSnapshot::MAX_TYPE + 1];
    uint64_t m_aSnapshotDataUpdates[CSnapshot::MAX_TYPE + 1];
};
```

DDNet tracks bandwidth consumption per network object type — allowing developers to visualize which game objects consume the most bandwidth. The client can render this as a debug overlay.

### CRC Verification

```cpp
// src/engine/client/client.cpp:2101-2124
if (pTmpBuffer3->Crc() != Crc) {
    m_SnapCrcErrors++;
    if (m_SnapCrcErrors > 10) {
        // Too many errors → request full resync
        m_aAckGameTick[Conn] = -1;
        SendInput();
        m_SnapCrcErrors = 0;
    }
}
```

Snapshot CRC is verified after delta decompression. Occasional errors (bit flips) are tolerated, but > 10 consecutive errors trigger a full resync by setting `AckGameTick = -1`.

**Iron Curtain relevance:** While IC's lockstep doesn't use snapshot delta compression for gameplay, the technique applies to:
- **Spectator/replay streaming**: stream game state to observers efficiently
- **Save game compression**: delta between autosave points
- **Per-type bandwidth tracking** is valuable for debugging IC's relay server throughput

---

## DDraceNetwork — Adaptive Snapshot Rate

### Three-Phase Rate System

```cpp
// src/engine/server/server.cpp:1021-1040
void CServer::DoSnapshot() {
    // INIT: 1 snapshot every 10 ticks (~5/sec)
    if (m_aClients[i].m_SnapRate == CClient::SNAPRATE_INIT 
        && (Tick() % 10) != 0)
        continue;
    
    // RECOVER: 1 snapshot per second
    if (m_aClients[i].m_SnapRate == CClient::SNAPRATE_RECOVER 
        && (Tick() % TickSpeed()) != 0)
        continue;
    
    // FULL: every tick or every 2nd tick (based on sv_high_bandwidth)
}
```

| Phase   | Rate      | When                              |
| ------- | --------- | --------------------------------- |
| INIT    | 5/sec     | First connecting, until first ACK |
| FULL    | 25-50/sec | Normal gameplay                   |
| RECOVER | 1/sec     | No ACK received for > 1 second    |

The server drops to recovery rate when a client hasn't acknowledged recent snapshots — preventing bandwidth waste on a disconnecting client.

### Input Timing Feedback

```cpp
// src/engine/server/server.cpp:1857-1873
// Server sends NETMSG_INPUTTIMING back to client:
const int TimeLeft = (TickStartTime(IntendedTick) - time_get()) / (time_freq() / 1000);
CMsgPacker Msgp(NETMSG_INPUTTIMING, true);
Msgp.AddInt(IntendedTick);
Msgp.AddInt(TimeLeft);   // How many ms early/late the input arrived
```

The server tells each client exactly how early or late their input arrived relative to the intended tick. The client uses this to adjust its input timing — a form of adaptive run-ahead similar to Generals' approach.

**Iron Curtain relevance:** The input timing feedback pattern maps directly to IC's relay server design. IC's relay can measure client input arrival times and report them back, enabling clients to self-adjust their send timing for optimal latency.

---

## DDraceNetwork — Anti-Abuse Infrastructure

### Network Traffic Rate Limiting

```cpp
// src/engine/server/server.cpp:1673-1697
double Limit = (double)(Config()->m_SvNetlimit * 1024) / time_freq();

if (m_aClients[ClientId].m_Traffic > Limit) {
    m_NetServer.NetBan()->BanAddr(&pPacket->m_Address, 600, "Stressing network");
    return;
}

// Exponential moving average of traffic rate
m_aClients[ClientId].m_Traffic = 
    (Alpha * ((double)pPacket->m_DataSize / Diff)) + 
    (1.0 - Alpha) * m_aClients[ClientId].m_Traffic;
```

Traffic is monitored per-client using an exponential moving average (EMA). If traffic exceeds `SvNetlimit * 1024` bytes/sec, the client is auto-banned for 600 seconds. The EMA smoothing prevents single-packet spikes from triggering bans.

### DNSBL Integration

```cpp
// src/engine/server/server.h:95-229
enum class EDnsblState {
    NONE,
    PENDING,
    BLACKLISTED,
    WHITELISTED,
};
```

DDNet integrates DNS blacklist lookups for VPN/proxy detection. Blacklisted IPs are restricted (e.g., chat disabled) rather than completely blocked — a pragmatic balance between security and accessibility.

### Spam Protection

```
src/game/server/gamecontext.cpp:L4958 — ProcessSpamProtection()
```

Tick-based chat cooldown (`SvChatDelay`), IP-based mute system with reasons and expiry, Unicode skeleton-based name matching for ban evasion prevention (`engine/server/name_ban.h`).

### Connection Flood Detection

```
src/engine/server/network_server.cpp:L299 — SvVanConnPerSecond
src/engine/server/server.cpp:L2122 — SvServerInfoPerSecond (default 50)
```

Rate limiting on connection attempts and server info queries, with per-second counters.

### Database Rate Limiting

```
src/game/server/score.cpp:L54 — RateLimitPlayer()
```

Per-player tick-based cooldown on SQL queries — preventing players from spamming score lookups and overloading the database.

**Iron Curtain relevance:** DDNet's multi-layered anti-abuse system is a comprehensive model for IC's relay server:
- **EMA traffic monitoring** → IC's `ProtocolLimits.max_orders_per_tick` should use EMA, not hard cap
- **DNSBL integration** → IC's relay could flag known VPN/proxy addresses
- **Database rate limiting** → IC's SQLite queries (D034) need per-player throttling
- **Progressive penalties** (restrict → mute → ban) rather than binary block/allow

---

## DDraceNetwork — Antibot Plugin Architecture

### Closed-Source Plugin With Open ABI

```cpp
// src/engine/server/antibot.h
class IEngineAntibot {
    virtual void OnPlayerInit(int ClientId) = 0;
    virtual void OnSpawn(int ClientId) = 0;
    virtual void OnHammerFire(int ClientId) = 0;
    virtual void OnHammerHit(int ClientId) = 0;
    virtual void OnDirectInput(int ClientId, const void *pInput) = 0;
    virtual void OnCharacterTick(int ClientId) = 0;
    virtual void OnHookAttach(int ClientId, bool Player) = 0;
    virtual void OnEngineClientMessage(int ClientId, const void *pData, int Size) = 0;
    virtual void OnEngineServerMessage(int ClientId, const void *pData, int Size) = 0;
};
```

The antibot system is a dynamically-loaded module with a stable ABI (`ANTIBOT_ABI_VERSION`). The engine feeds behavioral events through these hooks; the module's logic is closed-source to prevent circumvention.

**Iron Curtain relevance:** IC has decided against kernel-level anti-cheat (AGENTS.md security model), favoring architectural defenses. DDNet's approach offers a middle ground: an **optional behavioral analysis plugin** loaded at the relay server. The hooks (`OnDirectInput`, `OnCharacterTick`) map to IC's concept of "relay-side behavioral analysis (APM patterns, reaction times, input entropy)." The key insight: define the hook interface in `ic-protocol` or the relay crate, let the implementation be swappable.

---

## Comparative Analysis

### Network Models

| Game             | Model                      | Transport                      | Determinism | Topology         |
| ---------------- | -------------------------- | ------------------------------ | ----------- | ---------------- |
| Veloren          | Server-authoritative       | TCP/QUIC/MPSC                  | No          | Client-server    |
| Hypersomnia      | Server-auth + rollback     | netcode.io + WebRTC            | Per-arena   | Client-server    |
| OpenBW           | Deterministic lockstep     | Custom UDP                     | Full        | Peer-to-peer     |
| DDraceNetwork    | Server-authoritative       | Custom UDP                     | No          | Client-server    |
| **Iron Curtain** | **Deterministic lockstep** | **DTLS 1.3 / TLS 1.3 (relay)** | **Full**    | **Relay server** |

### Desync Detection Approaches

| Game             | Method                    | Granularity             | Frequency       |
| ---------------- | ------------------------- | ----------------------- | --------------- |
| OpenBW           | FNV-1a over sim state     | RNG + resources + units | Every 32 frames |
| Hypersomnia      | State hash comparison     | Full arena hash         | Every step      |
| DDraceNetwork    | CRC per snapshot          | Per-snapshot            | Every snapshot  |
| **IC (planned)** | `state_hash()` every tick | Configurable            | Every tick      |

OpenBW's approach (hash every 32 frames, rolling 4-hash window) is the most efficient for a lockstep RTS. IC should make the interval configurable (D031 observability) and use a rolling window for diagnosis.

### Compression Techniques

| Game             | Method                                                        | Typical Ratio                   |
| ---------------- | ------------------------------------------------------------- | ------------------------------- |
| Veloren          | LZ4 (realtime) + Deflate (terrain)                            | ~4:1 / ~10:1                    |
| DDraceNetwork    | Delta + VarInt + Huffman                                      | ~10-50:1 for snapshots          |
| OpenBW           | Custom LZ (bit-level) for replays                             | Unknown                         |
| **IC (planned)** | Delta-compressed TLV (from Generals) + empty-tick compression | Target: <100 bytes/tick typical |

### Anti-Abuse Layers

| Game             | Traffic Monitoring | Auth          | Plugin System | Rate Limiting   |
| ---------------- | ------------------ | ------------- | ------------- | --------------- |
| Veloren          | Message caps       | Account-based | No            | No              |
| Hypersomnia      | AFK detection      | Steam + Web   | No            | RCON rate       |
| DDraceNetwork    | EMA traffic + ban  | None          | Antibot ABI   | Per-query       |
| **IC (planned)** | ProtocolLimits     | Session-based | Behavioral    | Per-tick orders |

---

## Techniques Worth Adopting for Iron Curtain

### 1. FNV-1a Rolling Hash Array (from OpenBW)

Copy OpenBW's `update_insync_hash()` pattern: FNV-1a over RNG state, positions (raw fixed-point), resource counts. Use a rolling 4-8 element hash array. Check every N ticks (configurable, default 16-32). This is IC's `state_hash()` implementation.

### 2. Multi-Transport Abstraction With Promises (from Veloren)

Veloren's `Promises` bitflag system applied to IC's `NetworkModel` trait: define per-stream QoS requirements. IC's relay protocol should support `ORDERED | GUARANTEED | COMPRESSED` for orders and `COMPRESSED` only for spectator data.

### 3. Adaptive Snapshot Rate (from DDraceNetwork)

DDNet's INIT → FULL → RECOVER rate scaling is applicable to IC's spectator streaming and eventual fog-authoritative mode. Don't send full-rate data to clients that aren't keeping up.

### 4. EMA Traffic Monitoring (from DDraceNetwork)

Replace hard `max_orders_per_tick` caps with EMA-based traffic monitoring at IC's relay server. This catches sustained overload while tolerating legitimate burst activity (e.g., selecting many units simultaneously).

### 5. Behavioral Analysis Plugin ABI (from DDraceNetwork)

Define an `IAntibot` trait in IC's relay server with hooks for: `on_player_input`, `on_order_submitted`, `on_tick_complete`. Ship a default no-op implementation. Allow server operators to load custom analysis modules. This implements IC's "relay-side behavioral analysis" without hardcoding detection logic.

### 6. Separate RNG for Cosmetic Systems (from Hypersomnia)

Hypersomnia's desync bug (shared RNG between sim and particles) validates IC's `ic-sim`/`ic-render` separation. Ensure `ic-sim`'s RNG is never read by `ic-render`. Any "random" visual effect (particle spread, idle animations) must use its own RNG seeded independently.

### 7. Input Timing Feedback (from DDraceNetwork)

DDNet's `INPUTTIMING` message tells clients exactly how early/late their input arrived. IC's relay should report per-client timing delta, enabling adaptive run-ahead (aligns with Generals' approach, D007).

### 8. Commit-Reveal Game Seed (inspired by OpenBW)

OpenBW derives the game seed from XOR of all client UIDs. IC should improve on this with a commit-reveal scheme: each player commits `hash(random_value)` before revealing `random_value`, preventing any single player from manipulating the final seed.

### 9. Resync Rate Limiting (from Hypersomnia)

Hypersomnia rate-limits resync requests to once per 10 seconds. If IC implements reconnection or fog-authoritative mode, resync requests should be similarly throttled to prevent abuse.

### 10. Per-Type Bandwidth Tracking (from DDraceNetwork)

DDNet tracks `m_aSnapshotDataRate` per network object type and renders it as a debug overlay. IC should track bandwidth per `PlayerOrder` type in the relay server — this feeds directly into D031 (observability/OTEL metrics).

---

### Novel Patterns Not Found in Previous Research

These techniques are new compared to the 0 A.D./Warzone 2100 analysis:

1. **Veloren's `SyncFrom` enum** — Component-level visibility filtering by owner. Maps to IC's WASM mod capability system.
2. **Hypersomnia's predictability system** — Per-effect prediction control (`ALWAYS`/`NEVER`/`ONLY_BY`). Applicable to IC's audio system for immediate feedback on local player actions.
3. **OpenBW's FNV-1a hash with rolling window** — More efficient than 0 A.D.'s per-tick full hash. Concrete improvement over IC's current `state_hash()` design.
4. **DDNet's 3-phase snapshot rate** (INIT/FULL/RECOVER) — Not seen in any other analyzed codebase. Directly applicable to IC's spectator/relay throughput management.
5. **Hypersomnia's dual-arena architecture** — Most complete open-source rollback implementation found. Direct reference for IC's future `RollbackNetwork` model.
6. **DDNet's Antibot ABI** — Stable hook interface for swappable behavioral analysis. New pattern for IC's server-side analysis.
