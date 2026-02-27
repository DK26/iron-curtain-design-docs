# Relay Wire Protocol Design — Byte-Level Specification

> **Purpose:** Fill the concrete algorithm/wire-format gaps in Iron Curtain's relay netcode. The architectural docs (03-NETCODE.md, D007) describe the relay model, type signatures, and design rationale thoroughly but never specify byte-level wire formats, serialization rules, or concrete algorithms. This document is the implementor's reference: a developer should be able to write the serialization layer, relay state machine, and adaptive timing algorithms from this document alone.
> **Date:** 2026-02-26
> **Referenced by:** 03-NETCODE.md, D007 (relay default), D054 (transport/crypto switchability), D052 (community servers/SCR), 06-SECURITY.md, 05-FORMATS.md
> **Depends on:** 03-NETCODE.md (protocol types, architecture), D054 (Transport trait, AES-256-GCM + Curve25519), D052 (Ed25519 identity), research/generals-zero-hour-netcode-analysis.md, research/valve-github-analysis.md

---

## 1. Order Serialization Format (Byte-Level TLV)

03-NETCODE.md describes "delta-compressed TLV" with tag bytes `T`, `K`, `P`, `S`, `D` but never gives byte layouts. This section is the complete specification.

### 1.1 Primitive Encoding Rules

All multi-byte integers are **little-endian** (matching Rust's native byte order on all target platforms). Variable-length integers use **unsigned LEB128** (same as DWARF, protobuf, and WebAssembly).

```
LEB128 encoding:
  Value 0-127:      1 byte   (high bit clear)
  Value 128-16383:  2 bytes  (high bit set on first byte)
  Value up to 2^21: 3 bytes
  Maximum: 5 bytes for u32, 10 bytes for u64
```

Signed integers that can be negative (e.g., `arrival_delta_us`) use **signed LEB128** (ZigZag encoding: `(n << 1) ^ (n >> 31)` before unsigned LEB128).

**Fixed-size fields** (hashes, signatures, nonces) are written at their natural width with no length prefix — the field type determines the size.

### 1.2 TLV Tag Byte Assignments

Each TLV field begins with a single tag byte. The tag encodes both the field identity and, for common cases, whether the value is elided (delta-compressed away).

```
Tag Byte Layout:
  Bits 7-4: Field type (0-15)
  Bit  3:   Delta flag (1 = value elided, use previous)
  Bits 2-0: Reserved (must be 0, used for future extension)

Field Type Table:
  0x00  'T'  FrameType     — u8, identifies the message type
  0x01  'K'  Tick          — u64 varint, simulation tick number
  0x02  'P'  Player        — u8, player ID (0-15, max 16 players)
  0x03  'S'  SubTick       — u32 varint, sub-tick timestamp in microseconds
  0x04  'D'  Data          — variable, order payload (see below)
  0x05  'N'  Count         — u16 varint, number of orders in batch
  0x06  'H'  Hash          — u64 fixed, sync hash
  0x07  'Q'  SeqNum        — u32 fixed, packet sequence number
  0x08  'A'  AckVector     — 12 bytes fixed (u32 latest_recv_seq + u64 mask)
  0x09  'R'  PeerDelay     — u16 fixed, microseconds
  0x0A  'L'  Lane          — u8, message lane ID
  0x0B  'F'  Flags         — u8, per-frame-type flags
  0x0C  'V'  LivenessToken — u32 fixed, token nonce
  0x0D  'M'  Metrics       — variable, ClientMetrics or TimingFeedback
  0x0E  'W'  Window        — u32 varint, tick window in microseconds
  0x0F       (reserved)
```

When the delta flag (bit 3) is set, the tag byte is followed by **no value bytes** — the decoder reuses the most recent value for that field type from the same packet. This is how player ID and tick number are elided when a single player sends multiple orders in one tick.

### 1.3 PlayerOrder Variant Tags

The `Data` field (`0x04`) begins with a **variant tag byte** identifying which `PlayerOrder` enum variant follows, then the variant's fields:

```
Variant Tag Table:
  0x00  Idle            — no payload (0 bytes)
  0x01  Move            — unit_ids + target: WorldPos
  0x02  Attack          — unit_ids + target: Target
  0x03  Build           — structure: StructureType + position: WorldPos
  0x04  SetRallyPoint   — building: BuildingId + position: WorldPos
  0x05  Sell            — building: BuildingId
  0x06  Repair          — building: BuildingId
  0x07  Stop            — unit_ids
  0x08  Guard           — unit_ids + target: UnitId
  0x09  Patrol          — unit_ids + waypoints: Vec<WorldPos>
  0x0A  AttackMove      — unit_ids + target: WorldPos
  0x0B  Deploy          — unit_ids
  0x0C  SetStance       — unit_ids + stance: u8
  0x0D  ProduceUnit     — building: BuildingId + unit_type: u16
  0x0E  CancelProduction — building: BuildingId + queue_index: u8
  0x0F  UseAbility      — unit_ids + ability_id: u16 + target: Option<Target>
  0x10  Waypoint        — unit_ids + waypoints: Vec<WorldPos> + queue: bool
  0x11-0xEF              (reserved for future order types)
  0xF0-0xFF              (reserved for mod-defined orders via Lua/WASM)
```

### 1.4 Compound Field Encodings

**UnitId list (`unit_ids`):**
```
Offset  Size      Field
──────  ────      ─────
0       varint    count (number of unit IDs)
*       4*count   unit IDs (u32 LE, fixed-width — IDs are densely packed, varint saves little)
```

**WorldPos (fixed-point coordinates, scale 1024 per research/fixed-point-math-design.md):**
```
Offset  Size   Field
──────  ────   ─────
0       4      x: i32 LE (SimCoord, 1024 = 1.0 cells)
4       4      y: i32 LE (SimCoord)
```
Total: 8 bytes. Fixed-width because coordinates span the full i32 range.

**Target (union type):**
```
Offset  Size      Field
──────  ────      ─────
0       1         target_type: u8 (0 = Ground position, 1 = Unit, 2 = Building)
1       varies    payload:
                    type 0: WorldPos (8 bytes)
                    type 1: UnitId u32 LE (4 bytes)
                    type 2: BuildingId u32 LE (4 bytes)
```

**StructureType / UnitType:** `u16 LE` — index into the mod's type registry.

**BuildingId:** `u32 LE` — entity ID.

### 1.5 Delta Encoding Rules

Within a single packet, fields are delta-compressed against the **previous order in the same packet**. The encoder maintains a "previous context" for each field type:

1. **Tick (`K`):** Written once at the start of each batch. Subsequent orders in the same tick set the delta flag. If orders span multiple ticks within one packet (rare — only during catch-up replay), the tick is re-emitted with the new value.

2. **Player (`P`):** Written once per player. If a batch contains orders from multiple players (relay broadcasting canonical TickOrders), player is re-emitted when it changes.

3. **SubTick (`S`):** Always written (not delta-compressed). Sub-tick values vary per order and compression gain is negligible.

4. **Data (`D`):** Always written (the order payload is never elided).

5. **FrameType (`T`):** Written once per packet. All TLV fields in a packet share the same frame type.

**Encoding order within a packet:** `T K N [P S D] [P S D] ...` — frame type, tick, count, then repeated (player, sub-tick, data) tuples. When player or tick doesn't change, the delta-flagged tag byte is emitted (1 byte, no value).

### 1.6 Worked Example: 3 Orders from Same Player, Same Tick

Scenario: Player 2 issues Move, Attack, Stop on tick 1500, sub-tick times 12000, 34000, 55000 microseconds. All targeting the same 3 units (IDs: 7, 14, 22).

```
Byte offset  Hex            Meaning
───────────  ───            ───────
 0           0x00           Tag: FrameType (0x00), no delta
 1           0x01           Value: OrderBatch frame type
 2           0x10           Tag: Tick (0x01 << 4)
 3-4         0xDC 0x0B      Value: 1500 as LEB128 (0xDC 0x0B)
 5           0x50           Tag: Count (0x05 << 4)
 6           0x03           Value: 3 orders
 ── Order 1 ──
 7           0x20           Tag: Player (0x02 << 4)
 8           0x02           Value: player ID 2
 9           0x30           Tag: SubTick (0x03 << 4)
10-11        0xE0 0x5D      Value: 12000 as LEB128
12           0x40           Tag: Data (0x04 << 4)
13           0x01           Variant: Move
14           0x03           unit_ids count: 3
15-18        07 00 00 00    UnitId 7
19-22        0E 00 00 00    UnitId 14
23-26        16 00 00 00    UnitId 22
27-34        [8 bytes]      target WorldPos (x, y as i32 LE)
 ── Order 2 ──
35           0x28           Tag: Player with delta flag (0x02 << 4 | 0x08) — elided
36           0x30           Tag: SubTick
37-39        0xD0 0x89 0x02 Value: 34000 as LEB128
40           0x40           Tag: Data
41           0x02           Variant: Attack
42           0x03           unit_ids count: 3
43-54        [12 bytes]     UnitId 7, 14, 22
55           0x01           target_type: Unit
56-59        [4 bytes]      target UnitId
 ── Order 3 ──
60           0x28           Tag: Player with delta flag — elided
61           0x30           Tag: SubTick
62-64        0xD8 0xAD 0x03 Value: 55000 as LEB128
65           0x40           Tag: Data
66           0x07           Variant: Stop
67           0x03           unit_ids count: 3
68-79        [12 bytes]     UnitId 7, 14, 22
```

**Total: ~80 bytes** for 3 orders. Naive serialization (3x full TimestampedOrder with fixed u64 tick, u8 player, u32 sub_tick, plus order payload) would be approximately 3 * (8 + 1 + 4 + ~25) = ~114 bytes. Delta compression saves ~30% here; savings increase with longer batches and idle-heavy traffic.

### 1.7 Empty-Tick Compression

A tick with zero orders from all players compresses to the `TickComplete` frame type:

```
Byte  Hex   Meaning
────  ───   ───────
0     0x00  Tag: FrameType
1     0x02  Value: TickComplete
2     0x10  Tag: Tick
3-4   varint tick number
5     0x60  Tag: Hash (if sync check tick)
6-13  u64   fast sync hash
```

At 30 tps, ~80% of ticks have zero orders from any given player. Empty ticks cost 5-14 bytes each (5 without hash, 14 with hash on sync-check ticks).

---

## 2. Relay Frame Format

### 2.1 Packet Header

Every UDP packet begins with a fixed 16-byte header, followed by one or more TLV-encoded frames:

```
Relay Packet Header (16 bytes):
Offset  Size  Field             Description
──────  ────  ─────             ───────────
0       1     protocol_version  Always 0x01. Reject mismatched versions immediately.
1       1     flags             Bit flags (see below)
2       1     lane_id           MessageLane enum value (0-4)
3       1     frame_count       Number of TLV frames in this packet (1-255)
4       4     seq_num           Packet sequence number (u32 LE, monotonic per-connection)
8       4     ack_latest_seq    AckVector: latest received sequence number from peer
12      2     ack_mask_lo       AckVector: lower 16 bits of received_mask
14      2     peer_delay_us     PeerDelay: microseconds since receiving ack_latest_seq
```

**Flags byte:**
```
Bit  Meaning
───  ───────
0    encrypted (1 = AES-256-GCM encrypted payload follows header)
1    fragmented (1 = this packet is a fragment; see fragmentation below)
2    compressed (1 = LZ4 block compression on payload before encryption)
3    priority_ack (1 = this packet requests immediate ack — used for reliability)
4-7  reserved (must be 0)
```

**Full AckVector transmission:** The 16-bit `ack_mask_lo` in the header covers the 16 most recent packets (sufficient for ~500ms at 30 pps). The full 64-bit `received_mask` is transmitted in a Control-lane `AckExtended` frame every 500ms or when significant gaps are detected. This keeps the header compact (16 bytes) while preserving the full 64-packet ack history from 03-NETCODE.md.

### 2.2 Frame Types

After the packet header, the payload contains `frame_count` TLV-encoded frames. Each frame begins with a FrameType tag. The complete frame type table:

```
FrameType   Value   Lane      Direction        Description
─────────   ─────   ────      ─────────        ───────────
OrderBatch  0x01    Orders    Client→Relay     Player submits orders for current tick
TickOrders  0x02    Orders    Relay→Client     Canonical orders for a tick (broadcast)
TickComplete 0x03   Control   Relay→Client     Tick with zero orders (optimization)
SyncHash    0x04    Control   Bidirectional    Fast sync hash (u64) for desync detection
TimingFb    0x05    Control   Relay→Client     TimingFeedback (arrival stats)
ClientMet   0x06    Control   Client→Relay     ClientMetrics (perf report)
Liveness    0x07    Control   Relay→Client     Liveness token challenge
LivenessAck 0x08    Control   Client→Relay     Liveness token response
RunAhead    0x09    Control   Relay→All        Run-ahead change command
AckExtended 0x0A    Control   Bidirectional    Full 64-bit ack vector
ChatMsg     0x0B    Chat      Bidirectional    Chat message (UTF-8 text)
VoiceFrame  0x0C    Voice     Bidirectional    Opus-encoded audio frame
BulkData    0x0D    Bulk      Bidirectional    Replay/observer/telemetry data
GameConfig  0x0E    Control   Relay→Client     Game seed + settings at match start
LoadStatus  0x0F    Control   Client→Relay     Loading progress report
GameState   0x10    Control   Relay→All        Game state transition
DesyncReq   0x11    Control   Relay→Client     Desync debug data request
DesyncRpt   0x12    Bulk      Client→Relay     Desync debug report
Snapshot    0x13    Bulk      Client→Client    State snapshot for reconnection
SnapAck     0x14    Control   Client→Relay     Snapshot transfer acknowledgment
Disconnect  0x15    Control   Bidirectional    Graceful disconnect notification
Kick        0x16    Control   Relay→Client     Player kicked/dropped notification
VoteReq     0x17    Chat      Client→Relay     Vote request (pause, kick, etc.)
VoteStatus  0x18    Chat      Relay→All        Vote status update
Ping        0x19    Control   Bidirectional    Explicit ping (supplementary to ack RTT)
Pong        0x1A    Control   Bidirectional    Ping response
```

### 2.3 MTU-Aware Sizing

All packets target a maximum of **476 bytes** of UDP payload. This ensures:
- 476 (payload) + 8 (UDP header) + 20 (IPv4 header) = 504 bytes, well under the 576-byte minimum IPv4 MTU
- No IP fragmentation on any path (fragmented UDP packets multiply loss probability)
- Headroom for IPv6 (40-byte header) and tunneling overhead

**Effective payload budget per packet:**
- 16 bytes: packet header
- 0 or 28 bytes: encryption overhead (if encrypted: 12-byte nonce + 16-byte GCM auth tag)
- Remaining: ~432 bytes (encrypted) or ~460 bytes (unencrypted) for TLV frames

### 2.4 Fragmentation Strategy

If a single tick's orders exceed one packet (rare in RTS — requires ~30+ orders in one tick):

```
Fragment Header (replaces normal header bytes 2-3 when fragmented flag is set):
Offset  Size  Field
──────  ────  ─────
2       1     fragment_id      Identifies the logical message being fragmented (u8, wraps)
3       1     fragment_info    Bits 7-4: fragment_index (0-15), Bits 3-0: fragment_total (1-16)
```

**Rules:**
- Each fragment gets its own packet sequence number (for ack-vector tracking)
- The receiver buffers fragments until all arrive or a timeout expires (200ms)
- If any fragment is lost, the sender retransmits the entire logical message (not individual fragments) — simpler than per-fragment retransmit and the event is rare
- Maximum 16 fragments per logical message = 16 * 432 = ~6.9 KB maximum logical message size
- If a message exceeds 16 fragments, it must be split at the application layer (e.g., snapshot chunks)

---

## 3. Sub-Tick Ordering Tiebreak Algorithm

### 3.1 Overview

The relay maintains a per-player **clock calibration** that maps client-claimed sub-tick timestamps into relay-canonical time. The algorithm has three phases: offset estimation, skew detection, and canonical timestamp assignment.

### 3.2 Per-Player Clock Calibration State

```rust
/// Per-player timing calibration maintained by the relay.
/// Updated on every received packet using RTT and arrival timing.
pub struct ClockCalibration {
    /// Estimated clock offset: relay_time - client_time (microseconds).
    /// Positive means client clock is behind relay clock.
    offset_us: i64,

    /// Exponentially weighted moving average of offset samples.
    /// Alpha = 0.1 (slow adaptation to prevent spoofing).
    offset_ewma_us: i64,

    /// Jitter envelope: standard deviation of recent offset samples.
    /// Used to define the "feasible" range for client timestamps.
    jitter_us: u32,

    /// Number of calibration samples collected.
    sample_count: u32,

    /// Timestamp of last calibration update.
    last_update_us: u64,

    /// Consecutive suspicious timestamp count (for anti-abuse scoring).
    suspicious_count: u16,
}
```

### 3.3 Calibration Update (On Every Received Packet)

```
fn update_calibration(cal: &mut ClockCalibration, packet: &ReceivedPacket) {
    // 1. Compute one-way delay estimate from RTT
    //    RTT is measured via the ack-vector mechanism (03-NETCODE.md § Per-Ack RTT)
    let rtt_us = packet.measured_rtt_us;
    let one_way_us = rtt_us / 2;  // symmetric assumption (standard for game netcode)

    // 2. Estimate client-to-relay clock offset from this sample
    //    client_send_time + one_way_delay ≈ relay_recv_time
    //    offset = relay_recv_time - client_send_time - one_way_delay
    let sample_offset = (packet.relay_recv_time_us as i64)
        - (packet.client_send_time_us as i64)
        - (one_way_us as i64);

    // 3. Update EWMA (alpha = 0.1 for stability; integer approximation)
    //    ewma = ewma * 9/10 + sample * 1/10
    cal.offset_ewma_us = (cal.offset_ewma_us * 9 + sample_offset) / 10;

    // 4. Update jitter estimate (EWMA of absolute deviation)
    let deviation = (sample_offset - cal.offset_ewma_us).unsigned_abs() as u32;
    cal.jitter_us = (cal.jitter_us * 7 + deviation * 1) / 8;  // alpha = 0.125

    // 5. After warmup period (>= 10 samples), adopt EWMA as offset
    cal.sample_count = cal.sample_count.saturating_add(1);
    if cal.sample_count >= 10 {
        cal.offset_us = cal.offset_ewma_us;
    }

    cal.last_update_us = packet.relay_recv_time_us;
}
```

### 3.4 Canonical Timestamp Assignment

When the relay finalizes a tick, it assigns canonical sub-tick timestamps to all orders:

```
fn normalize_timestamp(
    cal: &ClockCalibration,
    client_sub_tick_us: u32,
    tick_window_us: u32,      // e.g., 66_667 for 15 tps, 33_333 for 30 tps
) -> u32 {
    // 1. Map client sub-tick hint into relay time
    let mapped = (client_sub_tick_us as i64) + cal.offset_us;

    // 2. Define feasible envelope: mapped ± (3 * jitter)
    //    3-sigma covers 99.7% of legitimate timing variation
    let jitter_bound = (cal.jitter_us as i64) * 3;
    let feasible_min = mapped - jitter_bound;
    let feasible_max = mapped + jitter_bound;

    // 3. Clamp to tick window [0, tick_window_us)
    let clamped = mapped
        .max(0)
        .min((tick_window_us - 1) as i64);

    // 4. Flag suspicious if mapped was far outside feasible envelope
    //    (handled externally — increment suspicious_count, log for anti-abuse)
    //    A timestamp is suspicious if the raw client claim differs from the
    //    mapped value by more than 2x the jitter envelope.

    clamped as u32
}
```

### 3.5 Canonical Tiebreak Rule

After normalization, the relay sorts all orders within a tick by:

```
sort_key(order) = (normalized_sub_tick_time, player_id)
```

This is a **lexicographic** comparison: first by timestamp (earlier = first), then by player ID (lower ID = first) for identical timestamps. This matches the `chronological()` helper in 03-NETCODE.md's `TickOrders` definition.

**Why player_id as tiebreaker:** Player IDs are assigned at game start and are deterministic. In the common case (timestamps differ by at least 1 microsecond), the tiebreaker never activates. When it does, it provides a stable, deterministic ordering that all clients reproduce identically.

### 3.6 Skew Detection and Clamping

If a player's clock drifts excessively (offset changes by more than 50ms between calibration updates), the relay applies **hard clamping**:

```rust
const MAX_OFFSET_DRIFT_US: i64 = 50_000;  // 50ms

fn check_skew(cal: &mut ClockCalibration, new_offset_sample: i64) -> bool {
    let drift = (new_offset_sample - cal.offset_us).abs();
    if drift > MAX_OFFSET_DRIFT_US {
        // Reject this sample — do not update EWMA
        cal.suspicious_count = cal.suspicious_count.saturating_add(1);

        // After 10 consecutive suspicious samples, reset calibration
        // (player may have legitimately changed network path)
        if cal.suspicious_count >= 10 {
            cal.offset_us = new_offset_sample;
            cal.offset_ewma_us = new_offset_sample;
            cal.suspicious_count = 0;
            cal.sample_count = 1;
        }
        return true;  // suspicious
    }
    cal.suspicious_count = 0;
    false
}
```

---

## 4. Adaptive Run-Ahead Calculation Formula

### 4.1 The Formula

The relay computes a global run-ahead value (in ticks) that all clients use. The formula uses the worst-case player metrics to ensure no honest player is disadvantaged:

```rust
/// Compute the run-ahead in ticks. Called by the relay whenever any
/// player's ClientMetrics update arrives.
fn compute_run_ahead(
    players: &[PlayerMetrics],
    tick_interval_us: u32,  // e.g., 33_333 for 30 tps
) -> u8 {
    // 1. Find the worst-case (maximum) RTT among all players
    let max_rtt_us = players.iter()
        .map(|p| p.avg_latency_us)
        .max()
        .unwrap_or(0) as u64;

    // 2. Find the worst-case jitter (from TimingFeedback)
    let max_jitter_us = players.iter()
        .map(|p| p.jitter_us)
        .max()
        .unwrap_or(0) as u64;

    // 3. Compute FPS penalty: if worst client runs below 30 FPS,
    //    add time equal to their frame interval minus the tick interval.
    //    At 15 FPS, frame interval = 66,667 us; penalty = 66,667 - 33,333 = 33,333 us.
    let min_fps = players.iter()
        .map(|p| p.avg_fps)
        .min()
        .unwrap_or(30);
    let fps_penalty_us = if min_fps > 0 && min_fps < 30 {
        (1_000_000u64 / min_fps as u64).saturating_sub(tick_interval_us as u64)
    } else {
        0
    };

    // 4. Compute the worst-case arrival cushion deficit.
    //    Negative cushion means orders are arriving late.
    let worst_cushion = players.iter()
        .map(|p| p.arrival_cushion)
        .min()
        .unwrap_or(0);
    let cushion_penalty_us = if worst_cushion < 0 {
        (-worst_cushion as u64) * (tick_interval_us as u64)
    } else {
        0
    };

    // 5. Total required buffer time
    //    = half_rtt (one-way) + 2*jitter (safety margin) + fps_penalty + cushion_deficit
    let buffer_us = (max_rtt_us / 2)
        + (max_jitter_us * 2)
        + fps_penalty_us
        + cushion_penalty_us;

    // 6. Convert to ticks, rounding up
    let raw_ticks = (buffer_us + tick_interval_us as u64 - 1) / tick_interval_us as u64;

    // 7. Clamp to bounds
    let clamped = raw_ticks.max(MIN_RUN_AHEAD as u64).min(MAX_RUN_AHEAD as u64);

    clamped as u8
}

const MIN_RUN_AHEAD: u8 = 2;   // Minimum 2 ticks (~66ms at 30 tps) — even on LAN
const MAX_RUN_AHEAD: u8 = 15;  // Maximum 15 ticks (~500ms at 30 tps) — beyond this, gameplay degrades
```

### 4.2 Tick Deadline Calculation

The relay's per-tick deadline determines when it stops waiting for orders and broadcasts:

```
fn compute_tick_deadline(
    run_ahead_ticks: u8,
    tick_interval_us: u32,
    player_metrics: &[PlayerMetrics],
) -> u64 {
    // Deadline = tick_interval + margin from worst player's metrics
    // The margin accounts for the fact that orders submitted at the current tick
    // are scheduled run_ahead_ticks into the future.
    //
    // Example: run_ahead = 3, tick_interval = 33,333 us
    // Orders for tick T+3 can arrive any time during ticks T, T+1, T+2.
    // Deadline for tick T+3 = start_of_tick_T+3 - one_tick_interval
    // This gives all players (run_ahead - 1) ticks to deliver their orders.

    let max_one_way_us = player_metrics.iter()
        .map(|p| p.avg_latency_us / 2)
        .max()
        .unwrap_or(0);

    let max_jitter_us = player_metrics.iter()
        .map(|p| p.jitter_us)
        .max()
        .unwrap_or(0);

    // Deadline = one_way_latency + 2*jitter + 10ms safety margin
    let deadline_us = (max_one_way_us + max_jitter_us * 2 + 10_000) as u64;

    // Cap at 2x tick interval to prevent excessively long waits
    deadline_us.min((tick_interval_us as u64) * 2)
}
```

### 4.3 Synchronized Run-Ahead Change Protocol

When the relay decides to change the run-ahead (because metrics changed significantly), it broadcasts a `RunAhead` frame — a synchronized network command, following Generals' pattern:

```
RunAhead Frame:
  FrameType: 0x09
  Fields:
    K (Tick):       The tick at which the new run-ahead takes effect
    D (Data):
      new_run_ahead: u8    — the new run-ahead value in ticks
      effective_tick: u64   — varint, same as K (redundant for verification)

All clients switch to the new run-ahead on the same tick — deterministic.
```

**Hysteresis:** The relay only broadcasts a RunAhead change if:
1. The new computed value differs from the current value by at least 1 tick
2. At least 60 ticks (~2 seconds at 30 tps) have passed since the last change
3. The new value has been stable (same computed result) for at least 30 ticks (~1 second)

This prevents rapid oscillation when a player's connection quality is fluctuating.

### 4.4 Concrete Defaults

| Parameter                     | Value    | Rationale                                                               |
| ----------------------------- | -------- | ----------------------------------------------------------------------- |
| `MIN_RUN_AHEAD`               | 2 ticks  | Even LAN connections need 1 tick for processing + 1 for delivery margin |
| `MAX_RUN_AHEAD`               | 15 ticks | 500ms at 30 tps — beyond this, the game feels unresponsive              |
| Default (good connection)     | 3 ticks  | ~100ms total — covers typical broadband RTT (~40ms) + jitter            |
| Default (moderate connection) | 5 ticks  | ~167ms — covers 100ms RTT + 30ms jitter                                 |
| Default (poor connection)     | 8 ticks  | ~267ms — covers 200ms RTT + 50ms jitter                                 |
| Tick deadline safety margin   | 10ms     | Accounts for OS scheduling jitter on relay                              |
| Hysteresis cooldown           | 60 ticks | Prevents oscillation                                                    |
| Hysteresis stability          | 30 ticks | New value must be stable before broadcasting                            |

---

## 5. Desync Recovery Protocol

### 5.1 Message Flow

The full desync detection → localization → recovery flow:

```
  Client A            Relay             Client B
  ────────            ─────             ────────

  ── Detection (every sync-check tick) ──
  SyncHash(T,h_A) ──────►
                     compare             ◄────── SyncHash(T,h_B)
                     h_A != h_B → DESYNC DETECTED at tick T

  ── Localization (Merkle tree descent) ──
                     ──────► DesyncReq(T, depth=0)
  DesyncRpt ◄────────        ──────────────────► DesyncReq(T, depth=0)
  (root hash)                                    DesyncRpt(root hash)
                     compare root children
                     ──────► DesyncReq(T, depth=1, subtree=LEFT)
                                                 DesyncReq(T, depth=1, subtree=LEFT)
  DesyncRpt ◄────────                    ──────► DesyncRpt(2 child hashes)
                     ... repeat until leaf (archetype) identified ...
                     LOG: "Desync at tick T, archetype: UnitPosition"

  ── Recovery Decision ──
  (see decision matrix below)
```

### 5.2 Desync Request / Report Frame Formats

**DesyncReq (0x11):**
```
Offset  Size    Field
──────  ────    ─────
0       varint  tick: u64               — the tick where desync was detected
1+      1       depth: u8               — Merkle tree depth to query (0 = root)
2+      varint  subtree_index: u32      — which subtree at this depth (0-based)
3+      1       level: DesyncDebugLevel — how much data to include in response
```

**DesyncRpt (0x12):**
```
Offset  Size      Field
──────  ────      ─────
0       varint    tick: u64
1+      1         depth: u8
2+      varint    subtree_index: u32
3+      1         node_count: u8         — number of hash values following
4+      8*N       hashes: [u64; N]       — fast sync hashes for child nodes
5+      varint    payload_len: u32       — length of optional debug payload
6+      varies    payload: [u8]          — compressed archetype snapshot (if leaf, level >= 3)
```

### 5.3 Recovery Decision Matrix

| Game Mode      | Desync Severity                                        | Action                                                                                        |
| -------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Ranked         | Any desync                                             | Pause game (vote timer 15s), log full report, void match if unresolved                        |
| Casual (relay) | Single-tick glitch (hashes re-converge within 3 ticks) | Log warning, continue — transient desyncs from timer precision differences often self-correct |
| Casual (relay) | Persistent desync (>3 ticks)                           | Pause game, offer vote: resync from snapshot or end match                                     |
| LAN / P2P      | Any                                                    | Log warning, offer host-initiated resync or continue                                          |

### 5.4 Resync via State Transfer

When players vote to resync (or in ranked where it's automatic on persistent desync):

```
  Donor Client         Relay              Desynced Client
  ────────────         ─────              ───────────────

  1. Relay selects donor (lowest latency, matching majority hash)
                       ──────► GameState(Paused, "resyncing")
                                          ◄────── GameState(Paused)

  2. Relay requests snapshot from donor at current tick T
                       ◄────── SnapRequest(T)
  Create snapshot
  Snapshot(T, chunk 1) ──────►
  Snapshot(T, chunk 2) ──────►             ──────► Snapshot(T, chunk 1)
  ...                                              Snapshot(T, chunk 2)
  Snapshot(T, final)   ──────►             ──────► Snapshot(T, final)

  3. Desynced client verifies snapshot hash
                                          SnapAck(T, ok) ──────►

  4. Desynced client loads snapshot, enters CatchingUp state
  5. Relay resumes game
                       ──────► GameState(Running)
```

**Snapshot chunking:** Snapshots are split into chunks of at most 400 bytes (fitting in one encrypted packet). Each chunk includes a chunk index and total count. The receiver reassembles and decompresses. Typical game state for a 2v2 mid-game is ~20-50 KB = 50-125 chunks. At 30 packets/second per client, this takes ~2-4 seconds.

**Snapshot verification:** The desynced client computes `state_hash()` of the loaded snapshot and compares it against the relay-coordinated sync hash for tick T. If they match, the snapshot is accepted. If not, the relay retries with a different donor (up to 2 retries) or aborts resync and voids the match (ranked) or ends the game (casual).

---

## 6. Transport Encryption Frame Format

D054 specifies AES-256-GCM + Curve25519 but no packet layout. This section fills that gap.

### 6.1 Encrypted Packet Layout

When the `encrypted` flag (bit 0) in the packet header is set, the payload after the 16-byte header is encrypted:

```
Encrypted Packet Layout:
Offset  Size    Field
──────  ────    ─────
0       16      packet_header (cleartext — always readable for routing)
16      12      nonce (96-bit AES-GCM nonce)
28      varies  ciphertext (encrypted TLV frames)
N-16    16      auth_tag (AES-GCM authentication tag)

Total overhead: 16 (header) + 12 (nonce) + 16 (auth_tag) = 44 bytes
Max ciphertext: 476 - 44 = 432 bytes
```

**Nonce construction:** The 96-bit nonce is constructed deterministically from the packet sequence number to prevent reuse:

```
nonce[0..4]   = connection_id (u32 LE, assigned during handshake)
nonce[4..8]   = seq_num (u32 LE, from packet header)
nonce[8..12]  = direction (u32 LE: 0x00000001 for client→relay, 0x00000002 for relay→client)
```

This construction guarantees nonce uniqueness as long as sequence numbers don't wrap within a single session (u32 supports ~4 billion packets = ~37 hours at 30 pps — well beyond any game session). The `direction` field prevents nonce collision between the two directions of a bidirectional connection.

**Authenticated Additional Data (AAD):** The 16-byte packet header is used as AAD in the GCM authentication — it is authenticated but not encrypted. This means the header is tamper-proof (the auth tag covers it) while remaining readable for routing and ack processing without decryption.

### 6.2 Key Exchange Handshake (Curve25519 ECDH)

The connection handshake establishes a shared AES-256-GCM session key using Curve25519 Elliptic Curve Diffie-Hellman:

```
  Client                                  Relay
  ──────                                  ─────

  1. Generate ephemeral Curve25519 keypair
     (client_eph_pk, client_eph_sk)

  2. ClientHello ─────────────────────────►
     { protocol_version: u8,
       client_eph_pk: [u8; 32],
       supported_ciphers: u8,           // bitmask (bit 0 = AES-256-GCM)
       client_identity_pk: [u8; 32],    // Ed25519 public key (D052)
       timestamp: u64 }                 // relay time estimate (anti-replay)

  3.                                       Generate ephemeral Curve25519 keypair
                                           (relay_eph_pk, relay_eph_sk)
                                           Compute shared_secret = X25519(relay_eph_sk, client_eph_pk)

  4. ◄──────────────────────────── ServerHello
     { relay_eph_pk: [u8; 32],
       selected_cipher: u8,
       connection_id: u32,
       challenge: [u8; 32] }            // random challenge for Ed25519 auth

  5. Compute shared_secret = X25519(client_eph_sk, relay_eph_pk)
     Derive session key: AES_key = HKDF-SHA256(
       ikm = shared_secret,
       salt = client_eph_pk || relay_eph_pk,
       info = b"ic-relay-session-v1",
       len = 32
     )

  6. Sign challenge with Ed25519 identity key
     ClientAuth ──────────────────────────►
     { signature: [u8; 64],              // Ed25519(client_identity_sk, challenge)
       encrypted_payload: [u8; ...] }    // AES-GCM test message (proves key derivation)

  7.                                       Verify Ed25519 signature against client_identity_pk
                                           Decrypt test payload (proves both sides derived same key)
                                           Look up player identity from client_identity_pk

  8. ◄──────────────────────── SessionEstablished
     { player_id: u8,                    // assigned player slot
       game_id: u64,                     // game session identifier
       encrypted: true }                 // all subsequent packets are encrypted

  All subsequent packets use the derived AES-256-GCM session key.
```

**Forward secrecy:** Both sides use **ephemeral** Curve25519 keypairs that are discarded after key derivation. Even if a player's long-term Ed25519 key is compromised, past session traffic cannot be decrypted (the ephemeral keys are gone).

**Anti-replay:** The `timestamp` field in ClientHello must be within 30 seconds of the relay's clock. The relay rejects replayed ClientHello messages by maintaining a short-lived set of recent `(client_identity_pk, timestamp)` pairs.

### 6.3 Handshake Packet Sizes

```
ClientHello:     1 + 32 + 1 + 32 + 8 = 74 bytes
ServerHello:     32 + 1 + 4 + 32     = 69 bytes
ClientAuth:      64 + ~32 (test msg)  = ~96 bytes
SessionEstab:    1 + 8 + 1            = 10 bytes (encrypted)
```

Total handshake: ~249 bytes across 4 messages. At typical broadband latencies, handshake completes in 2 RTTs (~80-200ms).

---

## 7. Game Seed Encoding

### 7.1 GameConfig Message Format

The `GameConfig` frame (type `0x0E`) is sent by the relay to all clients after the lobby transitions to the Loading state. It contains everything needed to initialize a deterministic simulation:

```
GameConfig Frame Layout:
Offset  Size      Field                Description
──────  ────      ─────                ───────────
0       varint    config_version       Format version (currently 1)
1+      8         game_id              u64 LE, unique game session ID
9+      8         rng_seed             u64 LE, deterministic RNG seed
17+     varint    tick_rate            Ticks per second (typically 15 or 30)
18+     varint    map_name_len         Length of map name string
19+     varies    map_name             UTF-8 map identifier
        32        map_hash             SHA-256 hash of map file
        1         player_count         Number of players (1-16)

  ── Per-player entries (repeated player_count times) ──
        1         player_id            Slot index (0-based)
        1         team                 Team assignment (0-based, 0xFF = no team)
        1         faction              Faction/side index
        1         color                Color index
        1         is_ai                0 = human, 1 = AI
        1         ai_difficulty        AI difficulty level (0-3, ignored if human)
        32        identity_pk          Ed25519 public key (zeros if AI)

  ── Game settings ──
        1         game_speed           Game speed preset index
        1         starting_credits     Starting credits preset index
        1         tech_level           Starting tech level
        1         crates               0 = disabled, 1 = enabled
        1         fog_of_war           0 = explored, 1 = fog, 2 = shroud
        1         short_game           0 = normal, 1 = short game (destroy all production)
        varint    custom_rules_len     Length of custom rules blob (0 if none)
        varies    custom_rules         Mod-defined settings (opaque to the protocol layer)
```

### 7.2 Deterministic Config Hash

All clients compute a SHA-256 hash of the serialized GameConfig to verify they received identical configurations:

```rust
fn compute_config_hash(config: &GameConfig) -> [u8; 32] {
    let mut hasher = Sha256::new();
    // Hash all fields in a canonical byte order
    hasher.update(&config.config_version.to_le_bytes());
    hasher.update(&config.game_id.to_le_bytes());
    hasher.update(&config.rng_seed.to_le_bytes());
    hasher.update(&config.tick_rate.to_le_bytes());
    hasher.update(config.map_name.as_bytes());
    hasher.update(&config.map_hash);
    hasher.update(&[config.player_count]);
    for player in &config.players {
        hasher.update(&[player.player_id, player.team, player.faction,
                        player.color, player.is_ai as u8, player.ai_difficulty]);
        hasher.update(&player.identity_pk);
    }
    hasher.update(&[config.game_speed, config.starting_credits, config.tech_level,
                    config.crates, config.fog_of_war, config.short_game]);
    hasher.update(&config.custom_rules);
    hasher.finalize().into()
}
```

Clients exchange config hashes via `SyncHash` frames during the Loading state. A mismatch before the game starts indicates a protocol error or tampering — the relay aborts the game with a `ConfigMismatch` error.

---

## 8. Relay State Machine

### 8.1 States and Transitions

```
            ┌──────────────────────────────────────┐
            │                                      │
            ▼                                      │
  ┌─────────────┐    all players    ┌──────────┐  │   all players
  │   Lobby     │──── ready ──────►│ Loading  │  │   loaded
  │             │                   │          │──┘
  │ - chat      │  ◄── player      │ - map    │
  │ - settings  │     unready      │   load   │
  │ - slots     │                   │ - config │
  └─────┬───────┘                   │   hash   │
        │                           └────┬─────┘
        │ host closes                    │ all loaded + config hash match
        │ or timeout                     │
        ▼                                ▼
  ┌──────────┐                   ┌───────────┐
  │ Disbanded │                   │  Running  │◄─────── resume (vote passed)
  │           │                   │           │
  └──────────┘                   │ - orders  ├──────── pause vote ──►┌────────┐
                                  │ - sync    │                       │ Paused │
                                  │ - timing  │◄────────────────────┤        │
                                  └─────┬─────┘                       │ - vote │
                                        │                             │   timer│
                                        │ game over /                 └───┬────┘
                                        │ all disconnect /                │
                                        │ desync void                    │ vote timer
                                        ▼                                │ expires
                                  ┌──────────┐                           │ (resume)
                                  │  Ended   │◄──────────────────────────┘
                                  │          │
                                  │ - results│
                                  │ - replay │
                                  └──────────┘
```

### 8.2 State Definitions

```rust
/// Relay game session state machine.
pub enum GameSessionState {
    /// Lobby: accepting player joins, setting changes, ready toggles.
    Lobby {
        players: Vec<LobbyPlayer>,
        settings: GameSettings,
        host: PlayerId,
    },

    /// Loading: game config distributed, waiting for all clients to load.
    Loading {
        config: GameConfig,
        config_hash: [u8; 32],
        loaded_players: HashSet<PlayerId>,
        timeout_deadline: Instant,  // 60 seconds from state entry
    },

    /// Running: active gameplay. Orders flow, sync checks run.
    Running {
        current_tick: u64,
        run_ahead: u8,
        player_metrics: HashMap<PlayerId, PlayerMetrics>,
        clock_calibration: HashMap<PlayerId, ClockCalibration>,
        liveness_tokens: HashMap<PlayerId, u32>,
        strike_counts: HashMap<PlayerId, u8>,
    },

    /// Paused: game frozen, vote in progress.
    Paused {
        paused_at_tick: u64,
        vote: PauseVote,
        resume_deadline: Instant,  // auto-resume after 60 seconds
    },

    /// Ended: game complete. Results certified, replay finalized.
    Ended {
        final_tick: u64,
        result: GameResult,
        replay_hash: [u8; 32],
    },

    /// Disbanded: lobby closed before game started.
    Disbanded,
}
```

### 8.3 Transition Messages

| Transition          | Trigger Message        | Direction | Conditions                                                  |
| ------------------- | ---------------------- | --------- | ----------------------------------------------------------- |
| Lobby → Loading     | `GameState(Loading)`   | Relay→All | All players ready, host starts game                         |
| Loading → Running   | `GameState(Running)`   | Relay→All | All players report LoadStatus(100%), config hashes match    |
| Loading → Disbanded | `GameState(Disbanded)` | Relay→All | Timeout (60s) or player disconnect during load              |
| Running → Paused    | `GameState(Paused)`    | Relay→All | Pause vote passes (majority) or admin pause                 |
| Paused → Running    | `GameState(Running)`   | Relay→All | Resume vote passes or auto-resume timer (60s)               |
| Paused → Ended      | `GameState(Ended)`     | Relay→All | Vote timer expires with majority voting "end match"         |
| Running → Ended     | `GameState(Ended)`     | Relay→All | Game over condition, all players disconnect, or desync void |
| Lobby → Disbanded   | `GameState(Disbanded)` | Relay→All | Host leaves or closes lobby                                 |

### 8.4 GameState Frame Format

```
GameState Frame (type 0x10):
  K (Tick):        Tick at which the transition takes effect
  D (Data):
    state: u8       — new state enum value (0=Lobby..5=Disbanded)
    reason: u8      — reason code (0=normal, 1=timeout, 2=disconnect, 3=desync, 4=vote, 5=admin)
    payload_len: varint
    payload: varies  — state-specific data (e.g., GameResult for Ended state)
```

### 8.5 Vote-Based Pausing

```
VoteReq Frame (type 0x17):
  D (Data):
    vote_type: u8    — 0=pause, 1=resume, 2=end_match, 3=kick_player
    target: u8       — for kick: target player_id; otherwise 0
    reason_len: varint
    reason: UTF-8    — optional human-readable reason

VoteStatus Frame (type 0x18):
  D (Data):
    vote_type: u8
    votes_for: u8
    votes_against: u8
    votes_needed: u8  — majority threshold
    time_remaining_ms: u16
    result: u8        — 0=pending, 1=passed, 2=failed, 3=expired
```

**Vote rules:**
- Pause vote: simple majority (>50% of connected players)
- Resume vote: simple majority
- End match: 2/3 majority
- Kick player: 2/3 majority (excluded player cannot vote)
- Vote timeout: 30 seconds
- Only one vote active at a time
- Players who have disconnected are excluded from the voter pool

---

## 9. Connection Handshake

### 9.1 Full Connection Establishment Sequence

This section combines the transport-level encryption handshake (Section 6.2) with application-level authentication and session establishment:

```
  Client                                     Relay
  ──────                                     ─────

  ── Phase 1: Transport Encryption (see Section 6.2) ──

  ClientHello ─────────────────────────────►
  (ephemeral Curve25519 pk, Ed25519 identity pk)

  ◄─────────────────────────────── ServerHello
  (ephemeral Curve25519 pk, challenge, connection_id)

  Both sides derive AES-256-GCM session key via HKDF.

  ClientAuth ──────────────────────────────►
  (Ed25519 signature over challenge, encrypted test payload)

  ◄───────────────────────── SessionEstablished
  (player_id assignment, game_id)

  ── All traffic from here is AES-256-GCM encrypted ──

  ── Phase 2: Lobby Join ──

  JoinLobby ───────────────────────────────►
  { room_code: [u8; 6],                     // 6-char alphanumeric join code
    credentials: Option<SCR> }               // signed credential records (D052)

  ◄──────────────────────────── LobbyState
  { players: Vec<LobbyPlayer>,
    settings: GameSettings,
    host: PlayerId,
    your_slot: PlayerId }

  ── Phase 3: Ready + Game Start ──

  ReadyToggle ─────────────────────────────►
  { ready: bool }

  ◄──────────────────────────── GameState(Loading)
  ◄──────────────────────────── GameConfig

  ... load map, verify config hash ...

  LoadStatus(100%) ────────────────────────►

  ◄──────────────────────────── GameState(Running)

  ── Phase 4: Gameplay ──
  OrderBatch ──────────────────────────────►
  ◄──────────────────────────── TickOrders
  ... repeat for game duration ...
```

### 9.2 Session Token Format

After the handshake, the `connection_id` (u32) serves as the session token. It is embedded in every packet's nonce construction (Section 6.1) and used by the relay for connection routing.

```
Session Token Properties:
- 32-bit random value, generated by relay during ServerHello
- Unique per connection (relay maintains a HashSet for collision detection)
- Used in nonce construction (prevents cross-connection nonce reuse)
- NOT a secret (it's in every packet's nonce, which is cleartext)
- Session expires on disconnect, timeout (5 min idle), or game end
```

### 9.3 Reconnection Authentication

A player reconnecting to an active game uses the same handshake but adds a reconnection token:

```
ClientHello (reconnection variant):
  All fields from standard ClientHello, plus:
    reconnect_flag: u8       = 0x01
    game_id: u64             = the active game's ID
    last_known_tick: u64     = last tick the client processed
    session_proof: [u8; 64]  = Ed25519(client_sk, game_id || last_known_tick || timestamp)
```

The relay verifies:
1. `client_identity_pk` matches a player in the active game
2. `session_proof` signature is valid
3. The game is still in Running or Paused state
4. The player has not been permanently dropped (timeout was not exceeded)

On success, the relay enters the snapshot transfer flow (Section 5.4).

### 9.4 Half-Open Connection Defense

Following 03-NETCODE.md's specification (from Minetest):

```
Half-Open Connection State:
1. New UDP packets from unknown sources are marked "half-open"
2. Relay allocates minimal state: source address + timestamp only (~20 bytes)
3. Relay sends ServerHello but does NOT:
   - Allocate a connection_id
   - Add to any game session
   - Respond to pings
   - Retransmit anything
4. Client must complete ClientAuth within 5 seconds
5. Only after successful ClientAuth does the relay allocate full connection state
6. Half-open connections are evicted after 5 seconds or when the half-open pool is full (FIFO)
7. Maximum half-open connections: 100 per relay instance
```

This prevents the relay from being used as a UDP amplification reflector — an unauthenticated client can only trigger a single 69-byte ServerHello response, and the relay does not retransmit it.

---

## 10. Protocol Constants Summary

A consolidated reference of all protocol constants defined in this document:

| Constant                        | Value             | Section       | Description                                      |
| ------------------------------- | ----------------- | ------------- | ------------------------------------------------ |
| `PROTOCOL_VERSION`              | `0x01`            | 2.1           | Packet header protocol version                   |
| `MAX_PACKET_SIZE`               | 476 bytes         | 2.3           | Maximum UDP payload                              |
| `MAX_ENCRYPTED_PAYLOAD`         | 432 bytes         | 2.3           | Payload after header + encryption overhead       |
| `MAX_FRAGMENT_COUNT`            | 16                | 2.4           | Maximum fragments per logical message            |
| `MIN_RUN_AHEAD`                 | 2 ticks           | 4.1           | Minimum run-ahead (even on LAN)                  |
| `MAX_RUN_AHEAD`                 | 15 ticks          | 4.1           | Maximum run-ahead                                |
| `RUN_AHEAD_HYSTERESIS_COOLDOWN` | 60 ticks          | 4.3           | Minimum ticks between run-ahead changes          |
| `RUN_AHEAD_HYSTERESIS_STABLE`   | 30 ticks          | 4.3           | Stability window before broadcasting change      |
| `CALIBRATION_ALPHA`             | 0.1 (9/10 + 1/10) | 3.3           | EWMA smoothing for clock offset                  |
| `JITTER_ALPHA`                  | 0.125 (7/8 + 1/8) | 3.3           | EWMA smoothing for jitter estimate               |
| `CALIBRATION_WARMUP`            | 10 samples        | 3.3           | Samples before trusting calibration              |
| `MAX_OFFSET_DRIFT`              | 50,000 us         | 3.6           | Maximum clock offset change before flagging      |
| `SKEW_RESET_THRESHOLD`          | 10 consecutive    | 3.6           | Suspicious samples before calibration reset      |
| `JITTER_SIGMA_BOUND`            | 3                 | 3.4           | Sigma multiplier for feasible timestamp envelope |
| `TICK_DEADLINE_SAFETY`          | 10,000 us         | 4.2           | Safety margin in tick deadline calculation       |
| `NONCE_SIZE`                    | 12 bytes          | 6.1           | AES-GCM nonce size                               |
| `AUTH_TAG_SIZE`                 | 16 bytes          | 6.1           | AES-GCM authentication tag size                  |
| `HANDSHAKE_TIMEOUT`             | 5,000 ms          | 9.4           | Half-open connection timeout                     |
| `MAX_HALF_OPEN`                 | 100               | 9.4           | Maximum half-open connections                    |
| `LOADING_TIMEOUT`               | 60,000 ms         | 8.2           | Maximum time in Loading state                    |
| `PAUSE_TIMEOUT`                 | 60,000 ms         | 8.2           | Auto-resume after pause                          |
| `VOTE_TIMEOUT`                  | 30,000 ms         | 8.5           | Vote expiration time                             |
| `SNAPSHOT_CHUNK_SIZE`           | 400 bytes         | 5.4           | Maximum snapshot chunk payload                   |
| `RECONNECT_TIMEOUT`             | 60,000 ms         | 03-NETCODE.md | Maximum reconnection window                      |
| `IDLE_TIMEOUT_UNAUTH`           | 60,000 ms         | 03-NETCODE.md | Unauthenticated idle timeout                     |
| `IDLE_TIMEOUT_AUTH`             | 300,000 ms        | 03-NETCODE.md | Authenticated idle timeout                       |
| `MAX_ORDERS_PER_TICK`           | 256               | 03-NETCODE.md | Hard ceiling per player per tick                 |
| `MAX_PLAYERS`                   | 16                | 7.1           | Maximum players per game session                 |

---

## 11. Cross-Reference Index

| Topic                                                            | This Document        | Existing Doc                                       |
| ---------------------------------------------------------------- | -------------------- | -------------------------------------------------- |
| Protocol types (`PlayerOrder`, `TimestampedOrder`, `TickOrders`) | Section 1            | 03-NETCODE.md § The Protocol                       |
| Delta-compressed TLV description                                 | Section 1            | 03-NETCODE.md § Wire Format                        |
| AckVector, PeerDelay                                             | Section 2.1          | 03-NETCODE.md § Ack Vector Reliability             |
| Sub-tick ordering concept                                        | Section 3            | 03-NETCODE.md § Sub-Tick Order Fairness            |
| Clock calibration concept                                        | Section 3            | 03-NETCODE.md § Relay-Side Timestamp Normalization |
| Adaptive run-ahead concept                                       | Section 4            | 03-NETCODE.md § Adaptive Run-Ahead                 |
| ClientMetrics, TimingFeedback types                              | Section 4            | 03-NETCODE.md § Input Timing Feedback              |
| Desync detection (Merkle tree)                                   | Section 5            | 03-NETCODE.md § Desync Detection & Debugging       |
| DesyncDebugReport type                                           | Section 5            | 03-NETCODE.md § Desync Log Transfer Protocol       |
| Transport encryption concept                                     | Section 6            | D054 § Transport Encryption                        |
| Ed25519 identity                                                 | Section 9            | D052 § Community Servers                           |
| Relay deployment modes                                           | Sections 8-9         | D007, 03-NETCODE.md § RelayCore                    |
| Connection lifecycle type state                                  | Section 9            | 03-NETCODE.md § Connection Lifecycle Type State    |
| Reconnection flow                                                | Section 5.4, 9.3     | 03-NETCODE.md § Reconnection                       |
| Order rate control                                               | — (not re-specified) | 03-NETCODE.md § Order Rate Control                 |
| Message lanes                                                    | Section 2.2          | 03-NETCODE.md § Message Lanes                      |
| Half-open defense                                                | Section 9.4          | 03-NETCODE.md § Half-Open Connection Defense       |
| Replay format                                                    | — (not re-specified) | 05-FORMATS.md § Replay File Format                 |
| ProtocolLimits                                                   | Section 10           | 06-SECURITY.md § Vulnerability 15                  |
| Fixed-point WorldPos                                             | Section 1.4          | research/fixed-point-math-design.md                |
