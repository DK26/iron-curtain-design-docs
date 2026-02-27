# Fog-Authoritative Server Design

**Purpose:** Complete design for `FogAuthoritativeNetwork` — Iron Curtain's maphack-proof server mode. This document specifies the server-side simulation loop, per-client visibility computation, entity state delta wire format, priority accumulator, bandwidth budgeting, client-side reconciliation, and the `NetworkModel` trait implementation. A developer should be able to implement FogAuth from this document alone.

**Date:** 2026-02-26

**Referenced by:** D006, D007, D074, 06-SECURITY.md (V1)

**Philosophy:** This is not a deferred feature. FogAuth ships as a `NetworkModel` variant in the same `ic-server` binary (D074). The relay capability and FogAuth capability coexist — an operator enables FogAuth per-room or per-match-type via `server_config.toml`. The same `NetworkModel` trait boundary that makes relay invisible to `ic-sim` makes FogAuth invisible to `ic-sim`.

---

## 1. Architecture Overview

In relay mode, the server is a dumb order router — it never touches `ic-sim`. In FogAuth mode, the server runs a full `ic-sim` instance (the same deterministic simulation that clients run in lockstep mode) and becomes both **time authority** (like relay) and **simulation authority** (unlike relay).

### Data Flow

```
  Client A                      Server                        Client B
  ────────                      ──────                        ────────
  issue order ──────────────►  receive order
                                validate (D012)
                                apply to authoritative sim
                                tick sim
                                compute visibility(A) ─────►  [not sent to B]
                                compute visibility(B) ──────────────────────►
                                                              receive state delta
  receive state delta ◄────────
  update partial world          update partial world
  interpolate / predict         interpolate / predict
  render                        render
```

### Key Properties

1. **Server runs full sim.** The server creates a `Simulation` via the same public constructor that single-player uses. `ic-sim` has no knowledge it is running server-side — the sim/net boundary invariant is preserved.

2. **Clients run a partial sim.** Clients do NOT run the full deterministic simulation. They maintain a partial world containing only the entities the server has told them about. Client-side logic is limited to interpolation, prediction, and rendering.

3. **Visibility is the data boundary.** The server computes per-client fog of war using the `FogProvider` trait (D041). Each client receives only the entities visible to their player. An entity outside a client's vision never appears in their network traffic — maphack is architecturally impossible.

4. **Visibility changes produce enter/leave events.** When an entity enters a client's vision, the server sends `EntityEnter` (full entity state). When it leaves, the server sends `EntityLeave`. While visible, only changed fields are sent as `EntityUpdate` deltas.

5. **The sim/net boundary is preserved.** `ic-sim` has zero imports from `ic-net`. They share only `ic-protocol`. The FogAuth server creates a sim instance and reads its state through the same public API that the renderer uses. The `FogProvider` trait lives in `ic-sim`; the networking code that serializes visibility deltas lives in `ic-net`.

---

## 2. Server-Side Sim Loop

### Main Loop Pseudocode

```rust
/// FogAuth server main loop — runs inside ic-server when fogauth capability is enabled.
/// One instance per active game room.
fn fogauth_game_loop(
    sim: &mut Simulation,           // full authoritative sim instance
    fog: &mut dyn FogProvider,      // RadiusFogProvider or ElevationFogProvider
    clients: &mut ClientMap,        // connected players + their visibility state
    config: &FogAuthConfig,
    transport: &mut dyn Transport,  // D054 transport abstraction
) {
    let tick_interval = Duration::from_nanos(1_000_000_000 / config.tick_rate as u64);
    let mut tick: u64 = 0;
    let mut next_tick_deadline = Instant::now() + tick_interval;

    loop {
        // ── Phase 1: Collect orders within tick deadline ──
        // Same deadline system as relay (D007). Orders arriving after the
        // deadline are queued for the next tick.
        let mut tick_orders: Vec<TimestampedOrder> = Vec::new();

        while Instant::now() < next_tick_deadline {
            if let Some(order) = transport.poll_order(next_tick_deadline - Instant::now()) {
                tick_orders.push(order);
            }
        }

        // ── Phase 2: Validate orders (D012 pipeline) ──
        let validated_orders: Vec<TimestampedOrder> = tick_orders
            .into_iter()
            .filter(|order| {
                let validity = sim.validate_order(order.player, &order.order);
                match validity {
                    OrderValidity::Valid => true,
                    OrderValidity::Rejected(reason) => {
                        log::warn!("Rejected order from {:?}: {:?}", order.player, reason);
                        // Send rejection notification to client (reliable channel)
                        transport.send_rejection(order.player, tick, reason);
                        false
                    }
                }
            })
            .collect();

        // ── Phase 3: Apply orders to authoritative sim ──
        sim.apply_orders(tick, &validated_orders);

        // ── Phase 4: Tick the sim ──
        sim.tick();
        tick += 1;

        // ── Phase 5: Update fog of war for all players ──
        for (player_id, client) in clients.iter_mut() {
            let sight_sources = sim.sight_sources(*player_id);
            fog.update_visibility(*player_id, &sight_sources, sim.terrain());
        }

        // ── Phase 6: Compute and send per-client visibility deltas ──
        for (player_id, client) in clients.iter_mut() {
            let deltas = compute_visibility_deltas(
                *player_id,
                &mut client.visibility_state,
                fog,
                sim,
                tick,
            );

            let budget = config.bytes_per_tick_per_client();
            let prioritized = apply_priority_accumulator(
                &mut client.priority_state,
                &deltas,
                budget,
                tick,
            );

            let message = serialize_state_update(tick, &prioritized);

            // State updates go on the unreliable channel (Bryant & Saiedian 2021).
            // Next update supersedes if this one is lost.
            transport.send_unreliable(*player_id, &message);
        }

        // ── Phase 7: Advance deadline ──
        next_tick_deadline += tick_interval;

        // If we're behind, skip ticks (don't accumulate debt)
        if Instant::now() > next_tick_deadline {
            let skipped = ((Instant::now() - next_tick_deadline).as_nanos()
                / tick_interval.as_nanos()) as u64;
            next_tick_deadline += tick_interval * (skipped as u32 + 1);
            log::warn!("FogAuth tick overrun: skipped {} ticks", skipped);
        }
    }
}
```

### Timing Analysis

At 30 ticks/s, the total time budget per tick is **33.3 ms**. The budget breaks down as follows:

| Phase | Estimated Cost | Notes |
|---|---|---|
| Order collection + validation | ~0.1 ms | Negligible; orders are small, validation is O(orders) |
| Sim tick | 1-5 ms | Same cost as client-side sim tick. Map-dependent. |
| Fog update (all players) | 0.5-2 ms | Depends on player count and sight source count |
| Visibility delta computation | 0.2-0.5 ms | HashMap lookups + set difference |
| Priority accumulator + serialization | 0.1-0.3 ms | Sort + serialize top-N entities |
| Transport send | 0.1-0.2 ms | Kernel buffer copy, not blocking |
| **Total** | **~2-8 ms** | **Leaves 25+ ms headroom at 30 ticks/s** |

For a 2-player game with a medium map (~500 entities), expect ~3 ms per tick. For an 8-player game with a large map (~2000 entities), expect ~8 ms per tick. The 33.3 ms budget provides comfortable headroom in both cases.

---

## 3. Visibility Computation

### Per-Client Tracking State

```rust
/// Tracks what each client knows about. Maintained server-side per connected client.
struct VisibilityState {
    /// Entities the client currently knows about, with the last state we sent.
    known: HashMap<EntityId, LastSentState>,
    /// Hash of sight source positions from last tick — skip recomputation if unchanged.
    sight_hash: u64,
}

struct LastSentState {
    position: WorldPos,
    health: u16,
    health_max: u16,
    facing: WAngle,
    target_id: Option<EntityId>,
    state_flags: u16,
    cargo_count: u8,
    animation_state: u8,
    veterancy: u8,
    owner: PlayerId,
    last_sent_tick: u64,
}
```

### Per-Tick Visibility Delta Algorithm

```rust
fn compute_visibility_deltas(
    player_id: PlayerId,
    vis_state: &mut VisibilityState,
    fog: &dyn FogProvider,
    sim: &Simulation,
    tick: u64,
) -> Vec<EntityDelta> {
    let mut deltas = Vec::new();

    // Step 1: Query current visible entity set from FogProvider
    let currently_visible: HashSet<EntityId> =
        fog.visible_entities(player_id).iter().copied().collect();

    // Step 2: Find entities that LEFT vision (were known, no longer visible)
    let known_ids: Vec<EntityId> = vis_state.known.keys().copied().collect();
    for entity_id in &known_ids {
        if !currently_visible.contains(entity_id) {
            deltas.push(EntityDelta::Leave { entity_id: *entity_id });
            vis_state.known.remove(entity_id);
        }
    }

    // Step 3: Process currently visible entities
    for &entity_id in &currently_visible {
        let current = sim.entity_state(entity_id);

        match vis_state.known.get(&entity_id) {
            None => {
                // Step 3a: NEW entity — send full state (EntityEnter)
                let state = LastSentState::from_entity(&current, tick);
                deltas.push(EntityDelta::Enter {
                    entity_id,
                    entity_type: current.entity_type,
                    owner: current.owner,
                    position: current.position,
                    health: current.health,
                    health_max: current.health_max,
                    facing: current.facing,
                    flags: current.state_flags,
                    animation_state: current.animation_state,
                });
                vis_state.known.insert(entity_id, state);
            }
            Some(last_sent) => {
                // Step 3b: KNOWN entity — compute field-level delta
                let mut field_mask: u16 = 0;
                if current.position != last_sent.position   { field_mask |= FIELD_POSITION; }
                if current.health != last_sent.health       { field_mask |= FIELD_HEALTH; }
                if current.facing != last_sent.facing       { field_mask |= FIELD_FACING; }
                if current.target_id != last_sent.target_id { field_mask |= FIELD_TARGET; }
                if current.state_flags != last_sent.state_flags { field_mask |= FIELD_STATE_FLAGS; }
                if current.cargo_count != last_sent.cargo_count { field_mask |= FIELD_CARGO; }
                if current.animation_state != last_sent.animation_state { field_mask |= FIELD_ANIMATION; }
                if current.veterancy != last_sent.veterancy { field_mask |= FIELD_VETERANCY; }
                if current.owner != last_sent.owner         { field_mask |= FIELD_OWNER; }

                if field_mask != 0 {
                    // Step 3c: Something changed — send EntityUpdate
                    deltas.push(EntityDelta::Update {
                        entity_id,
                        field_mask,
                        position: if field_mask & FIELD_POSITION != 0 { Some(current.position) } else { None },
                        health: if field_mask & FIELD_HEALTH != 0 { Some(current.health) } else { None },
                        facing: if field_mask & FIELD_FACING != 0 { Some(current.facing) } else { None },
                        target_id: if field_mask & FIELD_TARGET != 0 { Some(current.target_id) } else { None },
                        state_flags: if field_mask & FIELD_STATE_FLAGS != 0 { Some(current.state_flags) } else { None },
                        cargo_count: if field_mask & FIELD_CARGO != 0 { Some(current.cargo_count) } else { None },
                        animation_state: if field_mask & FIELD_ANIMATION != 0 { Some(current.animation_state) } else { None },
                        veterancy: if field_mask & FIELD_VETERANCY != 0 { Some(current.veterancy) } else { None },
                        owner: if field_mask & FIELD_OWNER != 0 { Some(current.owner) } else { None },
                    });

                    // Step 3d: Update known state
                    let entry = vis_state.known.get_mut(&entity_id).unwrap();
                    *entry = LastSentState::from_entity(&current, tick);
                }
            }
        }
    }

    deltas
}
```

### Field Mask Bit Definitions

```rust
const FIELD_POSITION:    u16 = 1 << 0;   // WorldPos (3 x i32 = 12 bytes)
const FIELD_HEALTH:      u16 = 1 << 1;   // u16 (2 bytes)
const FIELD_FACING:      u16 = 1 << 2;   // WAngle i32 (4 bytes)
const FIELD_TARGET:      u16 = 1 << 3;   // EntityId u32 (4 bytes, 0 = no target)
const FIELD_STATE_FLAGS: u16 = 1 << 4;   // u16 (2 bytes)
const FIELD_CARGO:       u16 = 1 << 5;   // u8 (1 byte)
const FIELD_ANIMATION:   u16 = 1 << 6;   // u8 (1 byte)
const FIELD_VETERANCY:   u16 = 1 << 7;   // u8 (1 byte)
const FIELD_OWNER:       u16 = 1 << 8;   // u8 (1 byte, for capture/mind-control)
// Bits 9-15 reserved for future fields (garrison state, cloak level, etc.)
```

### Optimization: Sight Source Hashing

Recomputing fog of war every tick for every player is wasteful when units are stationary (e.g., turtling player, idle phase). The server hashes all sight source positions and skips `fog.update_visibility()` if the hash is unchanged:

```rust
fn should_recompute_visibility(
    player_id: PlayerId,
    sim: &Simulation,
    vis_state: &mut VisibilityState,
) -> bool {
    let sight_sources = sim.sight_sources(player_id);
    let mut hasher = FxHasher::default();
    for (pos, range) in &sight_sources {
        pos.hash(&mut hasher);
        range.hash(&mut hasher);
    }
    let new_hash = hasher.finish();

    if new_hash == vis_state.sight_hash {
        return false; // No sight sources moved — skip fog recomputation
    }
    vis_state.sight_hash = new_hash;
    true
}
```

This optimization is safe because fog visibility depends only on sight source positions and terrain (which is static). When no sight sources move, visibility cannot change. Typical savings: 30-60% of fog recomputations skipped during mid-game defensive phases.

---

## 4. Entity State Delta Wire Format

All multi-byte integers are little-endian. The format is designed for the unreliable channel — each `StateUpdate` message is self-contained (no dependency on previous messages).

### StateUpdate Message Envelope

```
┌──────────────────────────────────────────────────────────────────┐
│  message_type     1 byte     (0x20 = state_update)               │
│  tick             8 bytes    (u64 LE, authoritative tick number)  │
│  player_id        2 bytes    (u16 LE, recipient player ID)       │
│  delta_count      2 bytes    (u16 LE, number of EntityDelta)     │
│  deltas           variable   (delta_count x EntityDelta)         │
├──────────────────────────────────────────────────────────────────┤
│  Header: 13 bytes + variable payload                             │
└──────────────────────────────────────────────────────────────────┘
```

#### Byte-Offset Table (StateUpdate Header)

```
Offset  Size   Field
──────  ────   ─────
0       1      message_type: u8 (0x20 = state_update)
1       8      tick: u64 LE (authoritative tick number)
9       2      player_id: u16 LE (recipient player — for routing/validation)
11      2      delta_count: u16 LE (number of EntityDelta entries)
13      var    deltas: [EntityDelta] × delta_count
```

Total header: 13 bytes. The `player_id` field identifies the intended recipient; the transport layer uses it for routing validation (ensuring a StateUpdate is not delivered to the wrong client). On the wire, the header is immediately followed by `delta_count` concatenated `EntityDelta` payloads with no padding.

### EntityDelta: Enter (type 0x01)

Full entity state — sent when an entity becomes visible to a client.

```
┌──────────────────────────────────────────────────────────────────┐
│  delta_type       1 byte     (0x01 = enter)                      │
│  entity_id        4 bytes    (u32 LE)                            │
│  entity_type      2 bytes    (u16 LE, unit/structure type index) │
│  owner            1 byte     (u8, player ID)                     │
│  position.x       4 bytes    (i32 LE, fixed-point world X)      │
│  position.y       4 bytes    (i32 LE, fixed-point world Y)      │
│  position.z       4 bytes    (i32 LE, fixed-point world Z)      │
│  health           2 bytes    (u16 LE)                            │
│  health_max       2 bytes    (u16 LE)                            │
│  facing           4 bytes    (i32 LE, WAngle)                   │
│  flags            2 bytes    (u16 LE, state flags)               │
│  animation_state  1 byte     (u8)                                │
├──────────────────────────────────────────────────────────────────┤
│  Total: 31 bytes per EntityEnter                                 │
└──────────────────────────────────────────────────────────────────┘
```

#### Byte-Offset Table (EntityEnter)

```
Offset  Size   Field
──────  ────   ─────
0       1      delta_type: u8 (0x01 = enter)
1       4      entity_id: u32 LE
5       2      entity_type: u16 LE (unit/structure type index from mod registry)
7       1      owner: u8 (player ID, 0 = neutral)
8       4      position.x: i32 LE (SimCoord, 1024 = 1.0 cells)
12      4      position.y: i32 LE (SimCoord)
16      4      position.z: i32 LE (SimCoord)
20      2      health: u16 LE (current HP)
22      2      health_max: u16 LE (max HP — needed for health bars)
24      4      facing: i32 LE (WAngle)
28      2      flags: u16 LE (bit 0=cloaked, bit 1=burrowed, bit 2=deployed,
                               bit 3=in_transport, bit 4=under_construction)
30      1      animation_state: u8 (idle=0, moving=1, attacking=2, harvesting=3, ...)
```

Total: **31 bytes** per EntityEnter. All fields are fixed-width, no variable-length encoding. The `flags` field uses the same bit layout as the field_mask `FIELD_STATE_FLAGS` value — the client can store and compare them directly.

### EntityDelta: Update (type 0x02)

Partial entity state — only fields whose bits are set in `field_mask` are present, in bit order (bit 0 first).

```
┌──────────────────────────────────────────────────────────────────┐
│  delta_type       1 byte     (0x02 = update)                     │
│  entity_id        4 bytes    (u32 LE)                            │
│  field_mask       2 bytes    (u16 LE, which fields follow)       │
│  [position]       0 or 12 bytes  (if bit 0 set: 3 x i32 LE)    │
│  [health]         0 or 2 bytes   (if bit 1 set: u16 LE)         │
│  [facing]         0 or 4 bytes   (if bit 2 set: i32 LE)         │
│  [target_id]      0 or 4 bytes   (if bit 3 set: u32 LE)         │
│  [state_flags]    0 or 2 bytes   (if bit 4 set: u16 LE)         │
│  [cargo_count]    0 or 1 byte    (if bit 5 set: u8)             │
│  [animation]      0 or 1 byte    (if bit 6 set: u8)             │
│  [veterancy]      0 or 1 byte    (if bit 7 set: u8)             │
│  [owner]          0 or 1 byte    (if bit 8 set: u8)             │
├──────────────────────────────────────────────────────────────────┤
│  Minimum: 7 bytes (no fields changed — should not be sent)       │
│  Typical: 7 + 12 = 19 bytes (position-only update, most common) │
│  Maximum: 7 + 12 + 2 + 4 + 4 + 2 + 1 + 1 + 1 + 1 = 35 bytes   │
└──────────────────────────────────────────────────────────────────┘
```

#### Byte-Offset Table (EntityUpdate)

```
Offset  Size   Field
──────  ────   ─────
0       1      delta_type: u8 (0x02 = update)
1       4      entity_id: u32 LE
5       2      field_mask: u16 LE (which fields follow — see bit definitions below)
7       var    payload: only fields whose bit is set in field_mask, in bit order:
               bit 0: position      12 bytes  (3 × i32 LE, WorldPos { x, y, z })
               bit 1: health         2 bytes  (u16 LE)
               bit 2: facing         4 bytes  (i32 LE, WAngle)
               bit 3: target_id      4 bytes  (u32 LE, 0 = no target)
               bit 4: state_flags    2 bytes  (u16 LE)
               bit 5: cargo_count    1 byte   (u8)
               bit 6: animation      1 byte   (u8)
               bit 7: veterancy      1 byte   (u8, 0-3)
               bit 8: owner          1 byte   (u8 — for capture/mind-control events)
               bits 9-15: reserved (must be 0)
```

Minimum: **7 bytes** (header + field_mask, no fields — should never be sent). Typical: **19 bytes** (position-only update, the most common case during movement). Maximum: **35 bytes** (all 9 fields present). The decoder reads fields in strict bit order (bit 0 first, bit 8 last); any reserved bits set in field_mask cause the decoder to reject the message.

### EntityDelta: Leave (type 0x03)

Entity left vision — client should remove it.

```
┌──────────────────────────────────────────────────────────────────┐
│  delta_type       1 byte     (0x03 = leave)                      │
│  entity_id        4 bytes    (u32 LE)                            │
├──────────────────────────────────────────────────────────────────┤
│  Total: 5 bytes per EntityLeave                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### Byte-Offset Table (EntityLeave)

```
Offset  Size   Field
──────  ────   ─────
0       1      delta_type: u8 (0x03 = leave)
1       4      entity_id: u32 LE
```

Total: **5 bytes**. No additional payload. The client removes the entity from its partial world (after a render-layer fade-out).

### Wire Format Summary

| Delta Type | Type Byte | Fixed Size | Variable Size | Typical Size |
|---|---|---|---|---|
| EntityEnter | 0x01 | 31 bytes | - | 31 bytes |
| EntityUpdate | 0x02 | 7 bytes | 0-28 bytes | 19 bytes (position only) |
| EntityLeave | 0x03 | 5 bytes | - | 5 bytes |

### Channel Segregation (Bryant & Saiedian 2021)

Following the traffic class segregation recommendation from 06-SECURITY.md:

- **Reliable ordered channel:** Client orders (small, loss-intolerant, latency-critical). Uses the same TLV delta-compressed format as relay mode (03-NETCODE.md).
- **Unreliable channel:** Server state updates (`StateUpdate` messages). Loss-tolerant because each update is self-contained and the next update supersedes. No retransmission, no head-of-line blocking.

Both channels share the same D054 `Transport` abstraction. The message type byte (0x20 for state updates vs. the existing relay message types) disambiguates at the receiver.

---

## 5. Fiedler Priority Accumulator

When the number of visible entity deltas exceeds the bandwidth budget, the server must decide which entities to send first. Fiedler (2015) devised a priority accumulator that ensures no entity is permanently starved while high-priority entities are updated more frequently.

### Data Structure

```rust
struct EntityPriority {
    entity_id: EntityId,
    base_priority: u16,     // Fixed-point at 256 scale (NOT sim float)
    accumulated: u32,       // Accumulates each tick, reset on send
    last_sent_tick: u64,    // For staleness bonus
}
```

### Base Priority Tiers

| Entity Category | Base Priority | Fixed-Point Value | Rationale |
|---|---|---|---|
| Own units | 1.0 | 256 | Player needs immediate feedback on their own forces |
| Nearby visible enemies (< 15 cells) | 0.8 | 204 | Combat-relevant — micro decisions depend on this |
| Distant visible enemies (>= 15 cells) | 0.4 | 102 | Strategically relevant but not time-critical |
| Neutral structures | 0.2 | 51 | Rarely change; relevant for tech/capture decisions |
| Terrain / decoration entities | 0.1 | 26 | Almost never change; low urgency |

"Nearby" is defined as Chebyshev distance < 15 cells from any of the player's units. The server computes this using the same `SpatialIndex` trait (D013) that the sim uses for range queries.

### Staleness Bonus

Each tick an entity is NOT sent, it accumulates a staleness bonus:

```
staleness_bonus = (current_tick - last_sent_tick) * 3
```

The constant `3` is per-tick. This means an entity unsent for 100 ticks (~3.3 seconds) gains 300 bonus priority on top of its base accumulation.

### Concrete Constants

```rust
// Priority tier constants (base_priority values at 1024 scale):
const PRIORITY_OWN_UNITS: u16          = 1024;  // 1.0 — always highest
const PRIORITY_NEARBY_ENEMIES: u16     = 819;   // 0.8
const PRIORITY_DISTANT_ENEMIES: u16    = 410;   // 0.4
const PRIORITY_NEUTRAL_STRUCTURES: u16 = 205;   // 0.2
const PRIORITY_TERRAIN_OBJECTS: u16    = 102;   // 0.1

// "Nearby" threshold: Chebyshev distance < 15 cells from any of the player's
// own units. Squared to avoid sqrt in the hot path.
// 15 cells × 1024 SimCoord per cell = 15360 SimCoord units.
const NEARBY_THRESHOLD_SQ: i64 = 15360 * 15360;  // 235,929,600

// Per-tick staleness bonus (at 1024 scale): 0.1 per 30 ticks.
// 102 / 30 ≈ 3.4 per tick in 1024-scale fixed-point.
// The existing staleness_bonus of 3 (at 256 scale) maps to ~12 at 1024 scale.
// Using integer 3 per tick at 256 scale (configurable via server_config.toml).
const STALENESS_BONUS_PER_TICK: u32 = 3;
```

The 1024-scale constants here match the fixed-point conventions used throughout the engine (SimCoord scale). The `EntityPriority::base_priority` field uses the 256-scale values from the tier table above for compact storage (`u16`); when computing accumulation, the values are equivalent because all comparisons are relative — only the ratio between tiers matters, not the absolute scale.

### Per-Tick Accumulation

```rust
/// Accumulate priority for a single entity. Called once per entity per tick
/// for all entities that have a pending delta.
fn accumulate(entry: &mut EntityPriority, current_tick: u64) {
    let staleness = (current_tick - entry.last_sent_tick) as u32;
    let staleness_bonus = staleness * STALENESS_BONUS_PER_TICK;
    entry.accumulated += entry.base_priority as u32 + staleness_bonus;
}
```

### Full Algorithm

```rust
fn apply_priority_accumulator(
    priority_state: &mut HashMap<EntityId, EntityPriority>,
    deltas: &[EntityDelta],
    budget_bytes: usize,
    current_tick: u64,
) -> Vec<EntityDelta> {
    // Step 1: Accumulate priority for all entities with pending deltas
    for delta in deltas {
        let entity_id = delta.entity_id();
        let entry = priority_state.entry(entity_id).or_insert_with(|| {
            EntityPriority {
                entity_id,
                base_priority: classify_priority(delta),
                accumulated: 0,
                last_sent_tick: current_tick,
            }
        });

        // Add base priority + staleness bonus
        let staleness = ((current_tick - entry.last_sent_tick) * STALENESS_BONUS_PER_TICK as u64) as u32;
        entry.accumulated += entry.base_priority as u32 + staleness;
    }

    // Step 2: Sort by accumulated priority (descending)
    let mut prioritized: Vec<&mut EntityPriority> = priority_state
        .values_mut()
        .filter(|p| deltas.iter().any(|d| d.entity_id() == p.entity_id))
        .collect();
    prioritized.sort_unstable_by(|a, b| b.accumulated.cmp(&a.accumulated));

    // Step 3: Fill bandwidth budget
    let mut result = Vec::new();
    let mut bytes_used: usize = 13; // StateUpdate header

    for entry in &mut prioritized {
        let delta = deltas.iter().find(|d| d.entity_id() == entry.entity_id).unwrap();
        let delta_size = delta.wire_size();

        if bytes_used + delta_size > budget_bytes {
            // Budget exhausted — remaining deltas carry over (accumulated preserved)
            break;
        }

        result.push(delta.clone());
        bytes_used += delta_size;

        // Reset accumulated priority for sent entities
        entry.accumulated = 0;
        entry.last_sent_tick = current_tick;
    }

    // Step 4: Entities that didn't fit keep their accumulated priority.
    // They will have even higher priority next tick.

    // Step 5: Clean up entries for entities no longer in any delta
    // (left vision or destroyed). Defer cleanup to avoid allocation churn.

    result
}
```

### Starvation Guarantee

With the staleness bonus of 3 per tick, even the lowest-priority entity (base 26 = terrain/decoration) reaches dominant priority within a bounded time:

- A terrain entity accumulates `26 + 3*t` per tick where `t` is ticks since last sent.
- The highest-priority entity (own units, base 256) resets to 0 when sent.
- After `N` unsent ticks, terrain priority = `26*N + 3*(1+2+...+N)` = `26N + 1.5N^2`.
- After ~100 ticks (~3.3 seconds), terrain priority = `2600 + 15000 = 17600`.
- A freshly-sent own-unit has priority 256.
- The terrain entity dominates within ~100 ticks.

**Worst case:** Under sustained maximum load (all entities changing every tick), the lowest-priority entity is guaranteed an update within ~300 ticks (~10 seconds). In practice, most entities are sent within 1-3 ticks because the bandwidth budget comfortably fits the typical visible set.

### Starvation Timing by Priority Tier

| Entity Category | Base Priority | Accumulates to 256 (own-unit level) in | Real Time (at 30 tps) |
|---|---|---|---|
| Own units (256) | 256 | 1 tick (immediate) | 33 ms |
| Nearby enemies (204) | 204 | ~1-2 ticks | 33-66 ms |
| Distant enemies (102) | 102 | ~37 ticks | 1.2 s |
| Neutral structures (51) | 51 | ~100 ticks | 3.3 s |
| Terrain/decoration (26) | 26 | ~300 ticks (worst case) | 10.0 s |

These are worst-case values assuming the budget is fully saturated every tick. In practice, budget saturation is rare outside massive battles; during typical gameplay, even terrain entities receive updates within 1-3 ticks.

---

## 6. Bandwidth Budget

### Target Parameters

| Parameter | Default Value | Config Key |
|---|---|---|
| Bandwidth per client | 64 KB/s | `fogauth.bandwidth_per_client_kbps` |
| Tick rate | 30 ticks/s | `fogauth.tick_rate` |
| Bytes per tick per client | 2184 bytes | (computed: 65536 / 30) |
| Max entities per update | 200 | `fogauth.max_entities_per_update` |
| Priority staleness bonus | 3 | `fogauth.priority_staleness_bonus` |

### Per-Tick Budget Breakdown

At 2184 bytes per tick per client, with 13 bytes of StateUpdate header overhead:

| Scenario | Entities | Delta Types | Bytes | Fits in Budget? |
|---|---|---|---|---|
| Quiet phase (few changes) | ~20 updates | 20 x 19 bytes (position) | ~391 bytes | Yes, 18% used |
| Active combat (many changes) | ~80 updates | 60 updates + 10 enters + 10 leaves | ~1471 bytes | Yes, 67% used |
| Large battle (stress case) | ~150 deltas | 100 updates + 30 enters + 20 leaves | ~2831 bytes | Exceeds — priority accumulator trims |
| Initial join / vision expansion | ~100 enters | 100 x 31 bytes | ~3113 bytes | Exceeds — spread across 2 ticks |

### Capacity Estimates (Per-Tick, Worst Case)

With 13 bytes of StateUpdate header, the remaining delta budget is **2,171 bytes/tick**.

```
Delta type capacity (homogeneous worst case):
  EntityEnter  (31 bytes each):  2171 / 31  = ~70 entities/tick
  EntityUpdate (avg 19 bytes):   2171 / 19  = ~114 updates/tick
  EntityUpdate (max 35 bytes):   2171 / 35  = ~62 updates/tick
  EntityLeave  (5 bytes each):   2171 / 5   = ~434 leaves/tick

Mixed typical tick (combat):
  10 enters + 60 updates (position) + 10 leaves =
    10×31 + 60×19 + 10×5 = 310 + 1140 + 50 = 1500 bytes → fits comfortably

Mixed worst-case tick (large battle reveal):
  30 enters + 100 updates (position+health) + 20 leaves =
    30×31 + 100×21 + 20×5 = 930 + 2100 + 100 = 3130 bytes → exceeds,
    priority accumulator trims to ~2171 bytes, remainder carries to next tick
```

### Overflow Handling

When deltas exceed the bandwidth budget:

1. The priority accumulator sorts all pending deltas by accumulated priority.
2. The top-N deltas that fit within the budget are sent this tick.
3. Remaining deltas are NOT dropped — their accumulated priority is preserved and grows.
4. Next tick, unsent deltas compete with new deltas. Thanks to staleness bonus, previously-unsent deltas have higher priority.
5. No entity is ever permanently starved (see starvation guarantee in Section 5).

### Configuration

```toml
[fogauth]
# Bandwidth cap per connected client (kilobytes per second).
# Higher values = faster updates, more server bandwidth usage.
# 64 KB/s is comfortable for 1v1 to 4v4 over broadband.
bandwidth_per_client_kbps = 64

# Hard cap on entity deltas per StateUpdate message.
# Prevents pathological cases from consuming CPU on serialization.
max_entities_per_update = 200

# Per-tick staleness bonus for the priority accumulator.
# Higher values = faster convergence for low-priority entities.
# Lower values = more bandwidth reserved for high-priority entities.
priority_staleness_bonus = 3

# Tick rate for the authoritative sim (Hz).
# Must match the sim's expected tick rate.
tick_rate = 30
```

---

## 7. Client-Side Reconciler

In FogAuth mode, the client does NOT run `ic-sim`. Instead, it maintains a **partial world** — a collection of entities received via `StateUpdate` messages — and uses interpolation and prediction to produce smooth visuals between server updates.

### Entity Lifecycle

```rust
/// Client-side entity state — maintained by the FogAuth reconciler.
struct ClientEntity {
    entity_id: EntityId,
    entity_type: u16,
    owner: PlayerId,
    position: WorldPos,         // last received from server
    velocity: WorldVec,         // estimated from position deltas
    health: u16,
    health_max: u16,
    facing: WAngle,
    flags: u16,
    animation_state: u8,
    last_update_tick: u64,
    interpolation_start: WorldPos,  // position at start of interpolation
    interpolation_progress: f32,    // 0.0-1.0, render-layer only (not sim)
}
```

### Message Processing

**On EntityEnter:**
1. Create a new `ClientEntity` with the received state.
2. Set velocity to zero (no prior data).
3. Spawn render entity immediately at received position.
4. Play a "reveal" visual effect if the entity was not previously explored (render layer decision).

**On EntityUpdate:**
1. Look up the existing `ClientEntity` by `entity_id`.
2. For each field set in `field_mask`, update the corresponding field.
3. If position changed: compute velocity estimate = `(new_position - old_position) / ticks_elapsed`.
4. Set `interpolation_start` to the current rendered position, reset `interpolation_progress` to 0.
5. The render layer smoothly interpolates from `interpolation_start` to `position` over one tick interval.

**On EntityLeave:**
1. Mark the entity for removal.
2. The render layer plays a fade-out animation (fog closing in).
3. After the fade completes (~0.3 seconds), destroy the render entity.
4. Remove the `ClientEntity` from the partial world.

### Sanity Bounds

To prevent visual artifacts from packet loss or delayed updates:

```rust
const MAX_UNIT_SPEED: i32 = 256; // fixed-point cells per tick (fastest unit in RA1)

fn apply_position_update(entity: &mut ClientEntity, new_pos: WorldPos, ticks_elapsed: u64) {
    let dx = (new_pos.x - entity.position.x).abs();
    let dy = (new_pos.y - entity.position.y).abs();
    let max_distance = MAX_UNIT_SPEED * ticks_elapsed as i32;

    if dx > max_distance || dy > max_distance {
        // Teleport — entity moved impossibly far. Snap, don't interpolate.
        log::warn!(
            "Entity {:?} position jump: ({}, {}) over {} ticks. Snapping.",
            entity.entity_id, dx, dy, ticks_elapsed
        );
        entity.position = new_pos;
        entity.velocity = WorldVec::ZERO;
        entity.interpolation_progress = 1.0; // skip interpolation
    } else {
        // Normal update — interpolate smoothly.
        entity.interpolation_start = entity.position;
        entity.interpolation_progress = 0.0;
        entity.velocity = WorldVec {
            x: (new_pos.x - entity.position.x) / ticks_elapsed as i32,
            y: (new_pos.y - entity.position.y) / ticks_elapsed as i32,
            z: (new_pos.z - entity.position.z) / ticks_elapsed as i32,
        };
        entity.position = new_pos;
    }
}
```

### Client-Side Prediction

Between server updates, the client advances entity positions along their last known velocity vector:

```rust
fn predict_entity_position(entity: &ClientEntity, ticks_since_update: u64) -> WorldPos {
    WorldPos {
        x: entity.position.x + entity.velocity.x * ticks_since_update as i32,
        y: entity.position.y + entity.velocity.y * ticks_since_update as i32,
        z: entity.position.z + entity.velocity.z * ticks_since_update as i32,
    }
}
```

This prediction is for rendering only — it does not affect game state. When the next server update arrives, the predicted position is corrected by smooth interpolation (not a hard snap, unless sanity bounds are exceeded).

### Own-Unit Responsiveness

For the local player's own units, the client sends orders to the server and optimistically starts visual feedback (move cursor, unit acknowledgment animation) before the server confirms. The server's `EntityUpdate` will correct any divergence. This keeps input feeling responsive despite the round-trip delay to the server.

---

## 8. Reconnection / Late Join

FogAuth dramatically simplifies reconnection compared to lockstep. In lockstep, a reconnecting player must replay potentially thousands of ticks to catch up. In FogAuth, the server has authoritative state — reconnection is a simple snapshot.

### New Player Joining

1. Server authenticates the new client (D007 handshake).
2. Server adds the client to the game room with an empty `VisibilityState`.
3. On the next tick, the server computes visibility for the new player normally.
4. All currently visible entities are sent as `EntityEnter` deltas — this is the **visibility snapshot**.
5. Subsequent ticks send only deltas as usual.

**Snapshot size estimate:**

| Scenario | Visible Entities | Snapshot Size | UDP Packets (MTU 476) |
|---|---|---|---|
| Early game (base + scouts) | ~50 | 50 x 31 = 1550 bytes | 4 packets |
| Mid game (active frontline) | ~150 | 150 x 31 = 4650 bytes | 10 packets |
| Late game (large armies) | ~200 | 200 x 31 = 6200 bytes | 14 packets |

Even the worst case (200 visible entities) fits in ~14 UDP packets. At 64 KB/s, the full snapshot transmits in under 100 ms. Since the snapshot is sent on the unreliable channel, individual packet loss causes only temporary entity gaps that are filled by the next tick's deltas — no retransmission needed.

### Reconnecting Player

Identical to new join. The server does NOT cache disconnected player state. When a player reconnects:

1. Their `VisibilityState` is reset to empty.
2. The server sends a fresh visibility snapshot.
3. The client rebuilds its partial world from the snapshot.

This is a deliberate simplification. Caching disconnected state adds complexity (how long to cache? memory cost?) for minimal benefit — the snapshot is small and fast.

### Spectators

Spectators receive the **union of all players' visible sets**. The server maintains a spectator `VisibilityState` that tracks: for each entity, is it visible to ANY player?

```rust
fn compute_spectator_visibility(
    fog: &dyn FogProvider,
    player_ids: &[PlayerId],
) -> HashSet<EntityId> {
    let mut visible = HashSet::new();
    for &player_id in player_ids {
        for &entity_id in fog.visible_entities(player_id) {
            visible.insert(entity_id);
        }
    }
    visible
}
```

Spectators see everything any player can see — but NOT what no player can see. This prevents spectator mode from being a maphack vector in tournament streaming setups. Tournament organizers who want full-map spectating can enable it per-room via configuration.

---

## 9. NetworkModel Implementation

`FogAuthoritativeNetwork` implements the `NetworkModel` trait (03-NETCODE.md lines 877-889). The implementation has two sides: the **client side** (runs in the game client's `GameLoop`) and the **server side** (runs inside `ic-server`). Only the client side implements `NetworkModel` — the server side is internal to `ic-server`.

### Client-Side Implementation

```rust
/// Client-side NetworkModel for FogAuth mode.
/// Receives entity state from the server instead of running the full sim.
pub struct FogAuthClientNetwork {
    /// Orders queued for sending to server.
    outgoing_orders: VecDeque<TimestampedOrder>,
    /// State updates received from server, awaiting consumption.
    incoming_updates: VecDeque<FogAuthTickData>,
    /// Transport connection to the FogAuth server.
    transport: Box<dyn Transport>,
    /// Connection status.
    status: NetworkStatus,
    /// Diagnostic counters.
    diag: FogAuthDiagnostics,
}

/// What poll_tick returns in FogAuth mode — orders AND state deltas.
pub struct FogAuthTickData {
    pub tick: u64,
    pub orders: Vec<TimestampedOrder>,   // validated orders for this tick
    pub state_deltas: Vec<EntityDelta>,  // visibility changes for this client
}

impl NetworkModel for FogAuthClientNetwork {
    fn submit_order(&mut self, order: TimestampedOrder) {
        // Queue order for sending to server on reliable channel.
        // The server validates and applies it — client does NOT apply locally.
        self.outgoing_orders.push_back(order.clone());
        self.transport.send_reliable(&serialize_order(&order));
    }

    fn poll_tick(&mut self) -> Option<TickOrders> {
        // Poll transport for incoming StateUpdate messages.
        while let Some(message) = self.transport.poll_unreliable() {
            if let Ok(update) = deserialize_state_update(&message) {
                self.incoming_updates.push_back(FogAuthTickData {
                    tick: update.tick,
                    orders: Vec::new(), // orders are implicit in state deltas
                    state_deltas: update.deltas,
                });
                self.diag.updates_received += 1;
                self.diag.entities_tracked = update.deltas.len();
            }
        }

        // Return the next pending tick data.
        // The GameLoop processes state deltas through the reconciler
        // instead of running the full sim tick.
        self.incoming_updates.pop_front().map(|data| {
            TickOrders {
                tick: data.tick,
                orders: data.orders,
                // EntityDeltas are communicated via a separate channel to the reconciler.
                // The TickOrders struct carries orders only — deltas are side-channeled.
            }
        })
    }

    fn report_sync_hash(&mut self, tick: u64, hash: u64) {
        // In FogAuth, the server IS authoritative — there is no peer-to-peer
        // sync hash comparison. The client hashes its partial world state and
        // sends it to the server. The server can optionally validate that the
        // client's partial state matches expectations (detecting client-side
        // state corruption or bugs). This is optional and can be disabled for
        // performance.
        if self.diag.sync_validation_enabled {
            self.transport.send_reliable(&serialize_sync_hash(tick, hash));
        }
    }

    fn status(&self) -> NetworkStatus {
        self.status.clone()
    }

    fn diagnostics(&self) -> NetworkDiagnostics {
        NetworkDiagnostics {
            latency_ms: self.transport.rtt_ms() / 2,
            packet_loss_pct: self.transport.loss_pct(),
            // FogAuth-specific fields exposed via the generic diagnostics map:
            custom: {
                let mut map = HashMap::new();
                map.insert("entities_tracked".into(), self.diag.entities_tracked as i64);
                map.insert("updates_received".into(), self.diag.updates_received as i64);
                map.insert("bandwidth_kbps".into(), self.diag.bandwidth_kbps as i64);
                map.insert("visibility_recompute_ms".into(), self.diag.visibility_recompute_us as i64 / 1000);
                map
            },
        }
    }
}
```

### Server-Side Architecture (Internal to ic-server)

The server side is NOT a `NetworkModel` implementation — it is internal to `ic-server`. The server-side architecture is described in Section 2 (sim loop) and Section 3 (visibility computation). Key components:

```rust
/// Server-side per-client state. Internal to ic-server.
struct FogAuthClient {
    player_id: PlayerId,
    transport_handle: TransportHandle,
    visibility_state: VisibilityState,
    priority_state: HashMap<EntityId, EntityPriority>,
    pending_orders: VecDeque<TimestampedOrder>,
}

/// Server-side game room state. Internal to ic-server.
struct FogAuthRoom {
    sim: Simulation,
    fog: Box<dyn FogProvider>,
    clients: HashMap<PlayerId, FogAuthClient>,
    config: FogAuthConfig,
    tick: u64,
}
```

The `FogAuthRoom` owns the `Simulation` instance. It creates the sim via the same public constructor as single-player (`Simulation::new(map, game_module, config)`). The sim has no knowledge it is running server-side.

---

## 10. Deployment & Cost Model

### Enabling FogAuth

FogAuth runs on the `relay` capability — it is a mode of the game server, not a separate capability. Enable it per-room in `server_config.toml`:

```toml
[capabilities]
relay = true

[relay]
# Default network model for new rooms. Players can override per-room in lobby.
default_network_model = "lockstep"   # or "fog_authoritative"

[relay.fogauth]
# Rooms with fog_authoritative network model use these settings.
bandwidth_per_client_kbps = 64
max_entities_per_update = 200
priority_staleness_bonus = 3
tick_rate = 30
```

Alternatively, per-match-type configuration:

```toml
[relay.match_types.casual]
network_model = "lockstep"

[relay.match_types.ranked]
network_model = "lockstep"

[relay.match_types.tournament]
network_model = "fog_authoritative"
```

### Resource Cost Comparison

| Metric | Relay (Lockstep) | FogAuth |
|---|---|---|
| CPU per game per tick | ~0.01 ms | ~2-6 ms |
| Memory per game | ~10 KB (order buffers only) | ~2-10 MB (full sim state) |
| Bandwidth per game | ~1-5 KB/s (order forwarding) | ~64-256 KB/s (state per client) |
| Sim execution | None (clients run sim) | Full (server runs sim) |
| Fog computation | None (client-side) | Per-player, per-tick |

### Capacity Projections

| Server Tier | Monthly Cost | Relay Games (concurrent) | FogAuth Games (concurrent) |
|---|---|---|---|
| $5 VPS (1 vCPU, 1 GB RAM) | $5 | 1000+ | 5-15 |
| $20 VPS (2 vCPU, 4 GB RAM) | $20 | 5000+ | 20-50 |
| $50 dedicated (4 cores, 8 GB RAM) | $50 | 10000+ | 50-100 |

FogAuth is intentionally more expensive. It is designed for **tournaments and competitive play** where maphack prevention justifies the cost. The vast majority of games (casual, ranked, community) use relay lockstep, which is effectively free.

### Mixed-Mode Operation

A single `ic-server` instance can run both relay and FogAuth games concurrently. The operator sets a FogAuth game limit to prevent resource exhaustion:

```toml
[relay.fogauth]
max_concurrent_games = 10   # Limit FogAuth games to prevent OOM
```

When the limit is reached, new FogAuth game requests are queued or rejected with a "server at capacity" message.

---

## 11. Integration Notes

### ic-sim Invariant Preserved

The server creates a `Simulation` via the same public constructor as single-player:

```rust
let sim = Simulation::new(map_data, game_module, sim_config);
```

`ic-sim` has zero knowledge it is running server-side. It has no imports from `ic-net`. The FogAuth server reads sim state through the same public API that the renderer uses: `sim.entity_state(id)`, `sim.sight_sources(player)`, `sim.terrain()`. The sim produces state; the FogAuth server decides what to send to whom.

### FogProvider Reuse

The server instantiates the same `FogProvider` implementations as the client:

- **Phase 2:** `RadiusFogProvider` (RA1 circle-based visibility). Simple, fast, cache-friendly.
- **Future:** `ElevationFogProvider` (RA2/TS line-of-sight with terrain raycasting).

The `FogProvider` trait lives in `ic-sim` (D041). The FogAuth server in `ic-net`/`ic-server` depends on `ic-sim` only for the sim instance and trait definitions — this is the same dependency direction as the game client.

### D074 Capability Model

FogAuth runs on the `relay` capability. It is NOT a separate capability flag. The relay capability is IC's dedicated game server — FogAuth is one of its operating modes. This means:

- Enabling `relay = true` in `server_config.toml` enables both lockstep relay and FogAuth.
- The `network_model` setting (per-room or per-match-type) selects which mode a game uses.
- Disabling `relay` disables all game hosting, both lockstep and FogAuth.
- Health checks, metrics, and management CLI (D072) report FogAuth-specific data alongside relay data.

### Trust Label

Games running FogAuth are labeled in the lobby UI as:

```
Network: Fog-Authoritative (maphack-proof)
```

This label is server-asserted (the server reports its network model in the room metadata) and cannot be faked by the client. Players see which games offer maphack protection and can filter for it.

### Replay Recording

FogAuth games produce replays differently from lockstep:

- **Lockstep replay:** Records all orders. Any client can replay by re-simulating.
- **FogAuth replay:** Server records all orders (authoritative). The replay file contains the full order stream, allowing deterministic re-simulation by any client. The FogAuth server also optionally records per-player visibility snapshots at key intervals for spectator replay (showing what each player could see at any moment).

The replay format is the same certified format (D007 relay-signed). The server signs the replay because it is the authoritative source.

---

## References

- **Fiedler, G. (2015).** "State Synchronization" — priority accumulator for entity update scheduling under bandwidth constraints.
- **Bryant, R. E. & Saiedian, H. (2021).** Traffic class segregation for game networking — reliable channel for input, unreliable channel for state.
- **03-NETCODE.md** — `NetworkModel` trait definition, relay architecture, TLV wire format, deployment modes.
- **06-SECURITY.md** — Threat model, FogAuth stub, Fiedler priority accumulator citation, traffic class segregation.
- **D006** — Network model pluggability via trait, sim/net boundary invariant.
- **D007** — Relay server design, certified match results, replay signing.
- **D012** — Order validation pipeline.
- **D041** — `FogProvider` trait definition, trait-abstraction philosophy.
- **D054** — `Transport` trait abstraction.
- **D074** — Unified `ic-server` binary, capability flags, FogAuth as relay mode.
