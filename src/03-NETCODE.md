# 03 — Network Architecture

## Our Netcode

Iron Curtain uses **one** netcode: relay-assisted deterministic lockstep with sub-tick order fairness. It's not a menu of alternatives — it's a single, unified design. The `NetworkModel` trait exists so we can test this netcode, run it in single-player, and deploy it with or without a relay server — not because we're building multiple netcodes.

Key influences:
- **Counter-Strike 2** — sub-tick timestamps for order fairness
- **C&C Generals/Zero Hour** — adaptive run-ahead, frame resilience, delta-compressed wire format, disconnect handling
- **OpenTTD** — multi-level desync debugging, token-based liveness, reconnection via state transfer
- **Minetest** — time-budget rate control (LagPool), half-open connection defense
- **OpenRA** — what to avoid: TCP stalling, static order latency, shallow sync buffers
- **Bryant & Saiedian (2021)** — state saturation taxonomy, traffic class segregation

## The Protocol

All protocol types live in the `ra-protocol` crate — the ONLY shared dependency between sim and net:

```rust
#[derive(Clone, Serialize, Deserialize, Hash)]
pub enum PlayerOrder {
    Move { unit_ids: Vec<UnitId>, target: WorldPos },
    Attack { unit_ids: Vec<UnitId>, target: Target },
    Build { structure: StructureType, position: WorldPos },
    SetRallyPoint { building: BuildingId, position: WorldPos },
    Sell { building: BuildingId },
    Idle,  // Explicit no-op — keeps player in the tick's order list for timing/presence
    // ... every possible player action
}

/// Sub-tick timestamp on every order (CS2-inspired, see below)
#[derive(Clone, Serialize, Deserialize)]
pub struct TimestampedOrder {
    pub player: PlayerId,
    pub order: PlayerOrder,
    pub sub_tick_time: u32,  // microseconds within the tick window (0 = tick start)
}
// NOTE: sub_tick_time is an integer (microseconds offset from tick start).
// At 15 ticks/sec the tick window is ~66,667µs — u32 is more than sufficient.
// Integer ordering avoids any platform-dependent float comparison behavior
// and keeps ra-protocol free of floating-point types entirely.

pub struct TickOrders {
    pub tick: u64,
    pub orders: Vec<TimestampedOrder>,
}

impl TickOrders {
    /// CS2-style: process in chronological order within the tick
    pub fn chronological(&self) -> impl Iterator<Item = &TimestampedOrder> {
        let mut sorted = self.orders.clone();
        sorted.sort_by_key(|o| o.sub_tick_time);
        sorted.into_iter()
    }
}
```

## How It Works

### Architecture: Relay with Time Authority

The relay server is the recommended deployment for multiplayer. It does NOT run the sim — it's a lightweight order router with time authority:

```
┌────────┐         ┌──────────────┐         ┌────────┐
│Player A│────────▶│ Relay Server │◀────────│Player B│
│        │◀────────│  (timestamped│────────▶│        │
└────────┘         │   ordering)  │         └────────┘
                   └──────────────┘
```

Every tick:
1. The relay receives timestamped orders from all players
2. Orders them chronologically within the tick (CS2 insight — see below)
3. Broadcasts the canonical `TickOrders` to all clients
4. All clients run the identical deterministic sim on those orders

The relay also:
- Detects lag switches and cheating attempts (see anti-lag-switch below)
- Handles NAT traversal (no port forwarding needed)
- Signs replays for tamper-proofing (see `06-SECURITY.md`)
- Validates order signatures and rate limits (see `06-SECURITY.md`)

This design was validated by C&C Generals/Zero Hour's "packet router" — a client-side star topology where one player collected and rebroadcast all commands. Same concept, but our server-hosted version eliminates host advantage and adds neutral time authority. See `research/generals-zero-hour-netcode-analysis.md`.

For small games (2-3 players) on LAN or with direct connectivity, the same netcode runs without a relay via P2P lockstep (see "The NetworkModel Trait" section below for deployment modes).

### Sub-Tick Order Fairness (from CS2)

Counter-Strike 2 introduced "sub-tick" architecture: instead of processing all actions at discrete tick boundaries, the client timestamps every input with sub-tick precision. The server collects inputs from all clients and processes them in chronological order within each tick window. The server still ticks at 64Hz, but events are ordered by their actual timestamps.

For an RTS, the core idea — **timestamped orders processed in chronological order within a tick** — produces fairer results for edge cases:

- Two players grabbing the same crate → the one who clicked first gets it
- Engineer vs engineer racing to capture a building → chronological winner
- Simultaneous attack orders → processed in actual order, not arrival order

**What's NOT relevant from CS2:** CS2 is client-server authoritative with prediction and interpolation. An RTS with hundreds of units can't afford server-authoritative simulation — the bandwidth would be enormous. We stay with deterministic lockstep (clients run identical sims), so CS2's prediction/reconciliation doesn't apply.

### Adaptive Run-Ahead (from C&C Generals)

Every lockstep RTS has inherent input delay — the game schedules your order a few ticks into the future so remote players' orders have time to arrive:

```
Local input at tick 50 → scheduled for tick 53 (3-tick delay)
Remote input has 3 ticks to arrive before we need it
Delay dynamically adjusted based on connection quality AND client performance
```

This input delay ("run-ahead") is not static. It adapts dynamically based on **both** network latency **and** client frame rate — a pattern proven by C&C Generals/Zero Hour (see `research/generals-zero-hour-netcode-analysis.md`). Generals tracked a 200-sample rolling latency history plus a "packet arrival cushion" (how many frames early orders arrive) to decide when to adjust. Their run-ahead changes were themselves synchronized network commands, ensuring all clients switch on the same frame.

We adopt this pattern:

```rust
/// Sent periodically by each client to report its performance characteristics.
/// The relay server (or P2P host) uses this to adjust the tick deadline.
pub struct ClientMetrics {
    pub avg_latency_us: u32,      // Rolling average RTT to relay/host (microseconds)
    pub avg_fps: u16,             // Client's current rendering frame rate
    pub arrival_cushion: i16,     // How many ticks early orders typically arrive
    pub tick_processing_us: u32,  // How long the client takes to process one sim tick
}
```

Why FPS matters: a player running at 15 FPS needs roughly 67ms to process and display each frame. If run-ahead is only 2 ticks (66ms at 30 tps), they have zero margin — any network jitter causes a stall. By incorporating FPS into the adaptive algorithm, we prevent slow machines from dragging down the experience for everyone.

For the relay deployment, `ClientMetrics` informs the relay's tick deadline calculation. For P2P lockstep, all clients agree on a shared run-ahead value (just like Generals' synchronized `RUNAHEAD` command).

### Anti-Lag-Switch

The relay server owns the clock. If your orders don't arrive within the tick deadline, they're dropped — replaced with `PlayerOrder::Idle`. Lag switch only punishes the attacker:

```rust
impl RelayServer {
    fn process_tick(&mut self, tick: u64) {
        let deadline = Instant::now() + self.tick_deadline; // e.g., 120ms
        
        for player in &self.players {
            match self.receive_orders_from(player, deadline) {
                Ok(orders) => self.tick_orders.add(player, orders),
                Err(Timeout) => {
                    // Missed deadline → strikes system
                    // Game never stalls for honest players
                    self.tick_orders.add(player, PlayerOrder::Idle);
                }
            }
        }
        self.broadcast_tick_orders(tick);
    }
}
```

Repeated late deliveries accumulate strikes. Enough strikes → disconnection. The relay's tick cadence is authoritative — client clock is irrelevant. See `06-SECURITY.md` for the full anti-cheat implications.

**Token-based liveness** (from OpenTTD): The relay embeds a random nonce in each FRAME packet. The client must echo it in their ACK. This distinguishes "slow but actively processing" from "TCP-alive but frozen" — a client that maintains a connection without processing game frames (crashed renderer, debugger attached, frozen UI) is caught within one missed token, not just by eventual heartbeat timeout. The token check is separate from frame acknowledgment: legitimate lag (slow packets) delays the ACK but eventually echoes the correct token, while a frozen client never echoes.

### Order Rate Control

Order throughput is controlled by three independent layers, each catching what the others miss:

**Layer 1 — Time-budget pool (primary).** Inspired by Minetest's LagPool anti-cheat system. Each player has an order budget that refills at a fixed rate per tick and caps at a burst limit:

```rust
pub struct OrderBudget {
    pub tokens: u32,         // Current budget (each order costs 1 token)
    pub refill_per_tick: u32, // Tokens added per tick (e.g., 16 at 30 tps)
    pub burst_cap: u32,       // Maximum tokens (e.g., 128)
}

impl OrderBudget {
    fn tick(&mut self) {
        self.tokens = (self.tokens + self.refill_per_tick).min(self.burst_cap);
    }
    
    fn try_consume(&mut self, count: u32) -> u32 {
        let accepted = count.min(self.tokens);
        self.tokens -= accepted;
        accepted // excess orders silently dropped
    }
}
```

Why this is better than a flat cap: normal play (5-10 orders/tick) never touches the limit. Legitimate bursts (mass-select 50 units and move) consume from the burst budget and succeed. Sustained abuse (bot spamming hundreds of orders per second) exhausts the budget within a few ticks, and excess orders are silently dropped. During real network lag (no orders submitted), the budget refills naturally — when the player reconnects, they have a full burst budget for their queued commands.

**Layer 2 — Bandwidth throttle.** A token bucket rate limiter on raw bytes per client (from OpenTTD). `bytes_per_tick` adds tokens each tick, `bytes_per_tick_burst` caps the bucket. This catches oversized orders or rapid data that might pass the order-count budget but overwhelm bandwidth. Parameters are tuned so legitimate traffic never hits the limit.

**Layer 3 — Hard ceiling.** An absolute maximum of 256 orders per player per tick (defined in `ProtocolLimits`). This is the last resort — if somehow both budget and bandwidth checks fail, this hard cap prevents any single player from flooding the tick's order list. See `06-SECURITY.md` § Vulnerability 15 for the full `ProtocolLimits` definition.

**Half-open connection defense** (from Minetest): New UDP connections to the relay are marked half-open. The relay inhibits retransmission and ping responses until the client proves liveness by using its assigned session ID in a valid packet. This prevents the relay from being usable as a UDP amplification reflector — critical for any internet-facing server.

### Frame Data Resilience (from C&C Generals)

UDP is unreliable — packets can arrive corrupted, duplicated, reordered, or not at all. Inspired by C&C Generals' `FrameDataManager` (see `research/generals-zero-hour-netcode-analysis.md`), our frame data handling uses a three-state readiness model rather than a simple ready/waiting binary:

```rust
pub enum FrameReadiness {
    Ready,                     // All orders received and verified
    Waiting,                   // Still expecting orders from one or more players
    Corrupted { from: PlayerId }, // Orders received but failed integrity check — request resend
}
```

When `Corrupted` is detected, the system automatically requests retransmission from the specific player (or relay). A circular buffer retains the last N ticks of sent frame data (Generals used 65 frames) so resend requests can be fulfilled without re-generating the data.

This is strictly better than pure "missed deadline → Idle" fallback: a corrupted packet that arrives on time gets a second chance via resend rather than being silently replaced with no-op. The deadline-based Idle fallback remains as the last resort if resend also fails.

### Wire Format: Delta-Compressed TLV (from C&C Generals)

Inspired by C&C Generals' `NetPacket` format (see `research/generals-zero-hour-netcode-analysis.md`), the native wire format uses delta-compressed tag-length-value (TLV) encoding:

- **Tag bytes** — single ASCII byte identifies the field: `T`ype, `K`(tic**K**), `P`layer, `S`ub-tick, `D`ata
- **Delta encoding** — fields are only written when they differ from the previous order in the same packet. If the same player sends 5 orders on the same tick, the player ID and tick number are written once.
- **Empty-tick compression** — ticks with no orders compress to a single byte (Generals used `Z`). In a typical RTS, ~80% of ticks have zero orders from any given player.
- **MTU-aware packet sizing** — packets stay under 476 bytes (single IP fragment, no UDP fragmentation). Fragmented UDP packets multiply loss probability — if any fragment is lost, the entire packet is dropped.

For typical RTS traffic (0-2 orders per player per tick, long stretches of idle), this compresses wire traffic by roughly 5-10x compared to naively serializing every `TimestampedOrder`.

For cross-engine play, the wire format is abstracted behind an `OrderCodec` trait — see `07-CROSS-ENGINE.md`.

### Desync Detection & Debugging

Desyncs are the hardest problem in lockstep netcode. OpenRA has 135+ desync issues in their tracker — they hash game state per frame (via `[VerifySync]` attribute) but their sync report buffer is only 7 frames deep, which often isn't enough to capture the divergence point. Our architecture makes desyncs both **detectable** AND **diagnosable**, drawing on 20+ years of OpenTTD's battle-tested desync debugging infrastructure.

#### Dual-Mode State Hashing

Every tick, each client hashes their sim state. But a full `state_hash()` over the entire ECS world is expensive. We use a two-tier approach (validated by both OpenTTD and 0 A.D.):

- **Primary: RNG state comparison.** Every sync frame, clients exchange their deterministic RNG seed. If the RNG diverges, the sim has diverged — this catches ~99% of desyncs at near-zero cost. The RNG is advanced by every stochastic sim operation (combat rolls, scatter patterns, AI decisions), so any state divergence quickly contaminates it.
- **Fallback: Full state hash.** Periodically (every N ticks, configurable — default 120, ~4 seconds at 30 tps) or when RNG drift is detected, compute and compare a full `state_hash()`. This catches the rare case where a desync affects only deterministic state that doesn't touch the RNG.

The relay server (or P2P peers) compares hashes. On mismatch → desync detected at a specific tick. Because the sim is snapshottable (D010), dump full state and diff to pinpoint exact divergence — entity by entity, component by component.

#### Debug Levels (from OpenTTD)

Desync diagnosis uses configurable debug levels. Each level adds overhead, so higher levels are only enabled when actively hunting a bug:

```rust
/// Debug levels for desync diagnosis. Set via config or debug console.
/// Each level includes all lower levels.
pub enum DesyncDebugLevel {
    /// Level 0: No debug overhead. RNG sync only. Production default.
    Off = 0,
    /// Level 1: Log all orders to a structured file (order-log.bin).
    /// Enables order-log replay for offline diagnosis.
    OrderLog = 1,
    /// Level 2: Run derived-state validation every tick.
    /// Checks that caches (spatial hash, fog grid, pathfinding data)
    /// match authoritative state. Zero production impact — debug only.
    CacheValidation = 2,
    /// Level 3: Save periodic snapshots at configurable interval.
    /// Names: desync_{game_seed}_{tick}.snap for bisection.
    PeriodicSnapshots = 3,
}
```

**Level 1 — Order logging.** Every order is logged to a structured binary file with the tick number and sync state at that tick. This enables **order-log replay**: load the initial state + replay orders, comparing logged sync state against replayed state at each tick. When they diverge, you've found the exact tick where the desync was introduced. OpenTTD has used this technique for 20+ years — it's the most effective desync diagnosis tool ever built for lockstep games.

**Level 2 — Cache validation.** Systematic validation of derived/cached data against source-of-truth data every tick. The spatial hash, fog-of-war grid, pathfinding caches, and any other precomputed data are recomputed from authoritative ECS state and compared. A mismatch means a cache update was missed somewhere — a cache bug, not a sim bug. OpenTTD's `CheckCaches()` function validates towns, companies, vehicles, and stations this way. This catches an entire class of bugs that full-state hashing misses (the cache diverges, but the authoritative state is still correct — until something reads the stale cache).

**Level 3 — Periodic snapshots.** Save full sim snapshots at a configurable interval (default: every 300 ticks, ~10 seconds). Snapshots are named `desync_{game_seed}_{tick}.snap` — sorting by seed groups snapshots from the same game, sorting by tick within a game enables binary search for the divergence point. This is OpenTTD's `dmp_cmds_XXXXXXXX_YYYYYYYY.sav` pattern adapted for IC.

#### Validation Purity Enforcement

Order validation (D012, `06-SECURITY.md` § Vulnerability 2) must have **zero side effects**. OpenTTD learned this the hard way — their "test run" of commands sometimes modified state, causing desyncs that took years to find. In debug builds, we enforce purity automatically:

```rust
#[cfg(debug_assertions)]
fn validate_order_checked(&mut self, player: PlayerId, order: &PlayerOrder) -> OrderValidity {
    let hash_before = self.state_hash();
    let result = self.validate_order(player, order);
    let hash_after = self.state_hash();
    assert_eq!(hash_before, hash_after,
        "validate_order() modified sim state! Order: {:?}, Player: {:?}", order, player);
    result
}
```

This `debug_assert` catches validation impurity at the moment it happens, not weeks later when a desync report arrives. Zero cost in release builds.

### Disconnect Handling (from C&C Generals)

Graceful disconnection is a first-class protocol concern, not an afterthought. Inspired by Generals' 7-type disconnect protocol (see `research/generals-zero-hour-netcode-analysis.md`), we handle disconnects deterministically:

**With relay:** The relay server detects disconnection via heartbeat timeout and notifies all clients of the specific tick on which the player is removed. All clients process the removal on the same tick — deterministic.

**P2P (without relay):** When a player appears unresponsive:
1. **Ping verification** — all players ping the suspect to confirm unreachability (prevents false blame from asymmetric routing)
2. **Blame attribution** — ping results determine who is actually disconnected vs. who is just slow
3. **Coordinated removal** — remaining players agree on a specific tick number to remove the disconnected player, ensuring all sims stay synchronized
4. **Historical frame buffer** — recent frame data is preserved so if the disconnecting player was also the packet router (P2P star topology), other players can recover missed frames

For competitive/ranked games, disconnect blame feeds into the match result: the blamed player takes the loss; remaining players can optionally continue or end the match without penalty.

### Reconnection

A disconnected player can rejoin a game in progress. This uses the same snapshottable sim (D010) that enables save games and replays:

1. **Reconnecting client contacts the relay** (or host in P2P). The relay verifies identity via the session key established at game start.
2. **Server creates a snapshot** of the current sim state and streams it to the reconnecting client. Any pending orders queued during the snapshot are sent alongside it (from OpenTTD: `NetworkSyncCommandQueue`), closing the gap between snapshot creation and delivery.
3. **Client loads the snapshot** and enters a catchup state, processing ticks at accelerated speed until it reaches the current tick.
4. **Client becomes active** once it's within one tick of the server. Orders resume flowing normally.

```rust
pub enum ClientStatus {
    Connecting,          // Transport established, awaiting authentication
    Authorized,          // Identity verified, awaiting state transfer
    Downloading,         // Receiving snapshot
    CatchingUp,          // Processing ticks at accelerated speed
    Active,              // Fully synced, orders flowing
}
```

The relay server sends keepalive messages to the reconnecting client during download (prevents timeout) and queues that player's slot as `PlayerOrder::Idle` until catchup completes. Other players experience no interruption — the game never pauses for a reconnection.

**Timeout:** If reconnection doesn't complete within a configurable window (default: 60 seconds), the player is permanently dropped. This prevents a malicious player from cycling disconnect/reconnect to disrupt the game indefinitely.

### Visual Prediction (Cosmetic, Not Sim)

The render layer provides **instant visual feedback** on player input, before the order is confirmed by the network:

```rust
// ra-render: immediate visual response to click
fn on_move_order_issued(click_pos: WorldPos, selected_units: &[Entity]) {
    // Show move marker immediately
    spawn_move_marker(click_pos);
    
    // Start unit turn animation toward target (cosmetic only)
    for unit in selected_units {
        start_turn_preview(unit, click_pos);
    }
    
    // Selection acknowledgement sound plays instantly
    play_unit_response_audio(selected_units);
    
    // The actual sim order is still in the network pipeline.
    // Units will begin real movement when the order is confirmed next tick.
    // The visual prediction bridges the gap so the game feels instant.
}
```

This is purely cosmetic — the sim doesn't advance until the confirmed order arrives. But it eliminates the **perceived** lag. The selection ring snaps, the unit rotates, the acknowledgment voice plays — all before the network round-trip completes.

## Why It Feels Faster Than OpenRA

Every lockstep RTS has inherent input delay — the game must wait for all players' orders before advancing. This is **architectural**, not a bug. But how much delay, and who pays for it, varies dramatically.

### OpenRA's Stalling Model

OpenRA uses TCP-based lockstep where the game advances only when ALL clients have submitted orders for the current net frame (`OrderManager.TryTick()` checks `pendingOrders.All(...)`):

```
Tick 50: waiting for Player A's orders... ✓ (10ms)
         waiting for Player B's orders... ✓ (15ms)
         waiting for Player C's orders... ⏳ (280ms — bad WiFi)
         → ALL players frozen for 280ms. Everyone suffers.
```

Additionally (verified from source):
- Orders are batched every `NetFrameInterval` frames (not every tick), adding batching delay
- The server adds `OrderLatency` frames to every order (default 1 for local, higher for MP game speeds)
- `OrderBuffer` dynamically adjusts per-player `TickScale` (up to 10% speedup) based on delivery timing
- Even in **single player**, `EchoConnection` projects orders 1 frame forward
- C# GC pauses add unpredictable jank on top of the architectural delay

The perceived input lag when clicking units in OpenRA is estimated at ~100-200ms — a combination of intentional lockstep delay, order batching, and runtime overhead.

### Our Model: No Stalling

The relay server owns the clock. It broadcasts tick orders on a fixed deadline — missed orders are replaced with `PlayerOrder::Idle`:

```
Tick 50: relay deadline = 80ms
         Player A orders arrive at 10ms  → ✓ included
         Player B orders arrive at 15ms  → ✓ included  
         Player C orders arrive at 280ms → ✗ missed deadline → Idle
         → Relay broadcasts at 80ms. No stall. Player C's units idle.
```

Honest players on good connections always get responsive gameplay. A lagging player hurts only themselves.

### Input Latency Comparison

*OpenRA values are from source code analysis, not runtime benchmarks. Tick processing times are estimates.*

| Factor                      | OpenRA                               | Iron Curtain                                          | Improvement                            |
| --------------------------- | ------------------------------------ | ----------------------------------------------------- | -------------------------------------- |
| Waiting for slowest client  | Yes — everyone freezes               | No — relay drops late orders                          | Eliminates worst-case stalls entirely  |
| Order batching interval     | Every N frames (`NetFrameInterval`)  | Every tick                                            | No batching delay                      |
| Order scheduling delay      | +`OrderLatency` ticks                | +1 tick (next relay broadcast)                        | Fewer ticks of delay                   |
| Tick processing time        | Estimated 30-60ms (limits tick rate) | ~8ms (allows higher tick rate)                        | 4-8x faster per tick                   |
| Achievable tick rate        | ~15 tps                              | 30+ tps                                               | 2x shorter lockstep window             |
| GC pauses during processing | C# GC characteristic                 | 0ms                                                   | Eliminates unpredictable hitches       |
| Visual feedback on click    | Waits for order confirmation         | Immediate (cosmetic prediction)                       | Perceived lag drops to near-zero       |
| Single-player order delay   | 1 projected frame (~66ms at 15 tps)  | 0 frames (`LocalNetwork` = next tick)                 | Zero delay                             |
| Worst connection impact     | Freezes all players                  | Only affects the lagging player                       | Architectural fairness                 |
| Architectural headroom      | No sim snapshots                     | Snapshottable sim (D010) enables future rollback/GGPO | Path to eliminating perceived MP delay |

## The NetworkModel Trait

The netcode described above is expressed as a trait — not because we're building multiple netcodes, but because it gives us testability, single-player support, and deployment flexibility. The sim and game loop never know which deployment mode is running.

```rust
pub trait NetworkModel: Send + Sync {
    /// Local player submits an order
    fn submit_order(&mut self, order: TimestampedOrder);
    /// Poll for the next tick's confirmed orders (None = not ready yet)
    fn poll_tick(&mut self) -> Option<TickOrders>;
    /// Report local sim hash for desync detection
    fn report_sync_hash(&mut self, tick: u64, hash: u64);
    /// Connection/sync status
    fn status(&self) -> NetworkStatus;
    /// Diagnostic info (latency, packet loss, etc.)
    fn diagnostics(&self) -> NetworkDiagnostics;
}
```

### Deployment Modes

The same netcode runs in four modes. The first two are utility adapters (no network involved). The last two are real multiplayer deployments of the same protocol:

| Implementation         | What It Is                                | When Used                      | Phase   |
| ---------------------- | ----------------------------------------- | ------------------------------ | ------- |
| `LocalNetwork`         | Pass-through — orders go straight to sim  | Single player, automated tests | Phase 2 |
| `ReplayPlayback`       | File reader — feeds saved orders into sim | Watching replays               | Phase 2 |
| `LockstepNetwork`      | P2P deployment (same protocol, no relay)  | LAN, ≤3 players, direct IP     | Phase 5 |
| `RelayLockstepNetwork` | Relay deployment (recommended for online) | Internet multiplayer, ranked   | Phase 5 |

`LockstepNetwork` and `RelayLockstepNetwork` implement the same netcode. The difference is topology: P2P uses direct connections (full mesh for 2-3 players, star topology for 4+), while relay routes everything through a neutral server. Both use adaptive run-ahead, frame resilience, delta-compressed TLV, and Ed25519 signing.

**Sub-tick ordering in P2P:** Without a neutral relay, there is no central time authority. Instead, each client sorts orders deterministically by `(sub_tick_time, player_id)` — the player ID tiebreaker ensures all clients produce the same canonical order even with identical timestamps. This is slightly less fair than relay ordering (clock skew between peers can bias who "clicked first"), but acceptable for LAN/small-group play where latencies are low. The relay deployment eliminates this issue entirely with neutral time authority, and additionally provides lag-switch protection, NAT traversal, and signed replays.

### Single-Player: Zero Delay

`LocalNetwork` processes orders on the very next tick with zero scheduling delay:

```rust
impl NetworkModel for LocalNetwork {
    fn submit_order(&mut self, order: TimestampedOrder) {
        // Order goes directly into the next tick — no delay, no projection
        self.pending.push(order);
    }
    
    fn poll_tick(&mut self) -> Option<TickOrders> {
        // Always ready — no waiting for other clients
        Some(TickOrders {
            tick: self.tick,
            orders: std::mem::take(&mut self.pending),
        })
    }
}
```

At 30 tps, a click-to-move in single player is confirmed within ~33ms — imperceptible to humans (reaction time is ~200ms). Combined with visual prediction, the game feels **instant**.

### Replay Playback

Replays are a natural byproduct of the architecture:

```
Replay file = initial state + sequence of TickOrders
Playback = feed TickOrders through Simulation via ReplayPlayback NetworkModel
```

Replays are signed by the relay server for tamper-proofing (see `06-SECURITY.md`).

## Future Architectures

The `NetworkModel` trait also keeps the door open for fundamentally different networking approaches in the future. These are NOT the same netcode — they are genuinely different architectures with different trade-offs. None are planned for initial development.

### Fog-Authoritative Server (anti-maphack)

Server runs full sim, sends each client only entities they should see. Breaks pure lockstep (clients run partial sims), requires server compute per game. Uses Fiedler's priority accumulator (2015) for bandwidth-bounded entity updates — units in combat are highest priority, distant static structures are deferred but eventually sent. See `06-SECURITY.md` § Vulnerability 1 for the full design including entity prioritization and traffic class segregation.

### Rollback / GGPO-Style (experimental)

Requires snapshottable sim (already designed via D010). Client predicts with local input, rolls back on misprediction. Expensive for RTS (re-simulating hundreds of entities), but feasible with Rust's performance. See GGPO documentation for reference implementation.

### Cross-Engine Protocol Adapter

A `ProtocolAdapter<N>` wrapper translates between Iron Curtain's native protocol and other engines' wire formats (e.g., OpenRA). Uses the `OrderCodec` trait for format translation. See `07-CROSS-ENGINE.md` for full design.

## OrderCodec: Wire Format Abstraction

For cross-engine play and protocol versioning, the wire format is abstracted behind a trait:

```rust
pub trait OrderCodec: Send + Sync {
    fn encode(&self, order: &TimestampedOrder) -> Result<Vec<u8>>;
    fn decode(&self, bytes: &[u8]) -> Result<TimestampedOrder>;
    fn protocol_id(&self) -> ProtocolId;
}

/// Native format — fast, compact, versioned (delta-compressed TLV)
pub struct NativeCodec { version: u32 }

/// Translates to/from OpenRA's wire format
pub struct OpenRACodec {
    order_map: OrderTranslationTable,
    coord_transform: CoordTransform,
}
```

See `07-CROSS-ENGINE.md` for full cross-engine compatibility design.

## Development Tools

### Network Simulation

Inspired by Generals' debug network simulation features, all `NetworkModel` implementations support artificial network condition injection:

```rust
/// Configurable network conditions for testing. Applied at the transport layer.
/// Only available in debug/development builds — compiled out of release.
pub struct NetworkSimConfig {
    pub latency_ms: u32,          // Artificial one-way latency added to each packet
    pub jitter_ms: u32,           // Random ± jitter on top of latency
    pub packet_loss_pct: f32,     // Percentage of packets silently dropped (0.0–100.0)
    pub corruption_pct: f32,      // Percentage of packets with random bit flips
    pub bandwidth_limit_kbps: Option<u32>,  // Throttle outgoing bandwidth
    pub duplicate_pct: f32,       // Percentage of packets sent twice
    pub reorder_pct: f32,         // Percentage of packets delivered out of order
}
```

This is invaluable for testing edge cases (desync under packet loss, adaptive run-ahead behavior, frame resend logic) without needing actual bad networks. Accessible via debug console or lobby settings in development builds.

### Diagnostic Overlay

A real-time network health display (inspired by Quake 3's lagometer) renders as a debug overlay in development builds:

- **Tick timing bar** — shows how long each sim tick takes to process, with color coding (green = within budget, yellow = approaching limit, red = over budget)
- **Order delivery timeline** — visualizes when each player's orders arrive relative to the tick deadline. Highlights late arrivals and idle substitutions.
- **Sync health** — shows RNG hash match/mismatch per sync frame. A red flash on mismatch gives immediate visual feedback during desync debugging.
- **Latency graph** — per-player RTT history (rolling 60 ticks). Shows jitter, trends, and spikes.

The overlay is toggled via debug console (`net_diag 1`) and compiled out of release builds. It uses the same data already collected by `NetworkDiagnostics` — no additional overhead.

## Connection Establishment

Connection method is a concern *below* the `NetworkModel`. By the time a `NetworkModel` is constructed, transport is already established. The discovery/connection flow:

```
Discovery (tracking server / join code / direct IP / QR)
  → Connection establishment (hole-punch / direct TCP+UDP)
    → NetworkModel constructed (LockstepNetwork or RelayLockstepNetwork)
      → Game loop runs — sim doesn't know or care how connection happened
```

### Direct IP

Classic approach. Host shares `IP:port`, other player connects.

- Simplest to implement (TCP connect, done)
- Requires host to have a reachable IP (port forwarding or same LAN)
- Good for LAN parties, dedicated server setups, and power users

### Join Code (Recommended for Casual)

Host contacts a lightweight rendezvous server. Server assigns a short code (e.g., `IRON-7K3M`). Joiner sends code to same server. Server brokers a UDP hole-punch between both players.

```
┌────────┐     1. register     ┌──────────────┐     2. resolve    ┌────────┐
│  Host  │ ──────────────────▶ │  Rendezvous  │ ◀──────────────── │ Joiner │
│        │ ◀── code: IRON-7K3M│    Server     │  code: IRON-7K3M──▶       │
│        │     3. hole-punch   │  (stateless)  │  3. hole-punch   │        │
│        │ ◀═══════════════════╪══════════════════════════════════▶│        │
└────────┘    direct P2P conn  └──────────────┘                   └────────┘
```

- No port forwarding needed (UDP hole-punch works through most NATs)
- Rendezvous server is stateless and trivial — it only brokers introductions, never sees game data
- Codes are short-lived (expire after use or timeout)
- Industry standard: Among Us, Deep Rock Galactic, It Takes Two

### QR Code

Same as join code, encoded as QR. Player scans from phone → opens game client with code pre-filled. Ideal for couch play, LAN events, and streaming (viewers scan to join).

### Via Relay Server

When direct P2P fails (symmetric NAT, corporate firewalls), fall back to the relay server. Connection through relay also provides lag-switch protection and sub-tick ordering as a bonus.

### Via Tracking Server

Player browses public game listings, picks one, client connects directly to the host (or relay). See Game Discovery section below.

## Tracking Servers (Game Browser)

A tracking server (also called master server) lets players discover and publish games. It is NOT a relay — no game data flows through it. It's a directory.

```rust
/// Tracking server API — implemented by ra-net, consumed by ra-ui
pub trait TrackingServer: Send + Sync {
    /// Host publishes their game to the directory
    fn publish(&self, listing: &GameListing) -> Result<ListingId>;
    /// Host updates their listing (player count, status)
    fn update(&self, id: ListingId, listing: &GameListing) -> Result<()>;
    /// Host removes their listing (game started or cancelled)
    fn unpublish(&self, id: ListingId) -> Result<()>;
    /// Browser fetches current listings with optional filters
    fn browse(&self, filter: &BrowseFilter) -> Result<Vec<GameListing>>;
}

pub struct GameListing {
    pub host: ConnectionInfo,     // IP:port, relay ID, or join code
    pub map: MapMeta,             // name, hash, player count
    pub rules: RulesMeta,         // mod, version, custom rules
    pub players: Vec<PlayerInfo>, // current players in lobby
    pub status: LobbyStatus,     // waiting, in_progress, full
    pub engine: EngineId,         // "iron-curtain" or "openra" (for cross-browser)
}
```

### Official Tracking Server

We run one. Games appear here by default. Free, community-operated, no account required to browse (account required to host, to prevent spam).

### Custom Tracking Servers

Communities, clans, and tournament organizers run their own. The client supports a list of tracking server URLs in settings. This is the Quake/Source master server model — decentralized, resilient.

```yaml
# settings.yaml
tracking_servers:
  - url: "https://track.ironcurtain.gg"    # official
  - url: "https://rts.myclan.com/track"     # clan server
  - url: "https://openra.net/master"        # OpenRA shared browser (Level 0 compat)
```

### OpenRA Shared Browser

Implementing the OpenRA master server protocol means Iron Curtain games can appear in OpenRA's game browser (and vice versa), tagged by engine. Players see the full community. This is the Level 0 cross-engine compatibility from `07-CROSS-ENGINE.md`.

### Tracking Server Implementation

The server itself is straightforward — a REST or WebSocket API backed by an in-memory store with TTL expiry. No database needed — listings are ephemeral and expire if the host stops sending heartbeats.

> **Note:** The tracking server is the only backend service with truly ephemeral data. The relay, workshop, and matchmaking servers all persist data beyond process lifetime using embedded SQLite (D034). See `09-DECISIONS.md` § D034 for the full storage model.

## Backend Infrastructure (Tracking + Relay)

Both the tracking server and relay server are **standalone Rust binaries**. The simplest deployment is running the executable on any computer — a home PC, a friend's always-on machine, a €5 VPS, or a Raspberry Pi. No containers, no cloud, no special infrastructure required.

For larger-scale or production deployments, both services also ship as container images with docker-compose.yaml (one-command setup) and Helm charts (Kubernetes). But containers are an option, not a requirement.

There must never be a single point of failure that takes down the entire multiplayer ecosystem.

### Architecture

```
                          ┌───────────────────────────────────┐
                          │         DNS / Load Balancer        │
                          │   (track.ironcurtain.gg)          │
                          └─────┬──────────┬──────────┬───────┘
                                │          │          │
                          ┌─────▼──┐ ┌─────▼──┐ ┌────▼───┐
                          │Tracking│ │Tracking│ │Tracking│   ← stateless replicas
                          │  Pod   │ │  Pod   │ │  Pod   │      (horizontal scale)
                          └────────┘ └────────┘ └────────┘
                                         │
                          ┌──────────────▼──────────────┐
                          │   Redis / in-memory store     │   ← game listings (ephemeral)
                          │   (TTL-based expiry)          │      no persistent DB needed
                          └───────────────────────────────┘

                          ┌───────────────────────────────────┐
                          │         DNS / Load Balancer        │
                          │   (relay.ironcurtain.gg)          │
                          └─────┬──────────┬──────────┬───────┘
                                │          │          │
                          ┌─────▼──┐ ┌─────▼──┐ ┌────▼───┐
                          │ Relay  │ │ Relay  │ │ Relay  │   ← per-game sessions
                          │  Pod   │ │  Pod   │ │  Pod   │      (sticky, SQLite for
                          └────────┘ └────────┘ └────────┘       persistent records)
```

### Design Principles

1. **Just a binary.** Each server is a single Rust executable with zero mandatory external dependencies. Run it directly (`./tracking-server` or `./relay-server`), as a systemd service, in Docker, or in Kubernetes — whatever suits the operator. No external database, no runtime, no JVM. Download, configure, run. Services that need persistent storage use an embedded SQLite database file (D034) — no separate database process to install or operate.

2. **Stateless or self-contained.** The tracking server holds no critical state — listings live in memory with TTL expiry (for multi-instance: shared via Redis). The relay, workshop, and matchmaking servers persist data (match results, resource metadata, ratings) to an embedded SQLite file (D034). Killing a process loses only in-flight game sessions — persistent records survive in the `.db` file. Relay servers hold per-game session state in memory but games are short-lived; if a relay dies, the game reconnects or falls back to P2P.

3. **Community self-hosting is a first-class use case.** A clan, tournament organizer, or hobbyist runs the same binary on their own machine. No cloud account needed. No Docker needed. The binary reads a config file or env vars and starts listening. For those who prefer containers, `docker-compose up` works too. For production scale, Helm charts are available.

4. **Federation, not centralization.** The client aggregates listings from multiple tracking servers simultaneously (already designed — see `tracking_servers` list in settings). If the official server goes down, community servers still work. If all tracking servers go down, direct IP / join codes / QR still work. The architecture degrades gracefully, never fails completely.

5. **Relay servers are regional.** Players connect to the nearest relay for lowest latency. The tracking server listing includes the relay region. Community relays in underserved regions improve the experience for everyone.

6. **Observable by default (D031).** All servers emit structured telemetry via OpenTelemetry (OTEL): metrics (Prometheus-compatible), distributed traces (Jaeger/Zipkin), and structured logs (Loki/stdout). Every server exposes `/healthz`, `/readyz`, and `/metrics` endpoints. Self-hosters get pre-built Grafana dashboards for relay (active games, RTT, desync events), tracking (listings, heartbeats), and workshop (downloads, resolution times). Observability is optional but ships with the infrastructure — `docker-compose.observability.yaml` adds Grafana + Prometheus + Loki with one command.

### Deployment Options

**Option 1: Just run the binary (simplest)**

```bash
# Download and run — no Docker, no cloud, no dependencies
./tracking-server --port 8080 --heartbeat-ttl 30s
./relay-server --port 9090 --region home --max-games 50
```

Works on any machine: home PC, spare laptop, Raspberry Pi, VPS. The tracking server uses in-memory storage by default — no Redis needed for a single instance.

**Option 2: Docker Compose (one-command setup)**

```yaml
# docker-compose.yaml (community self-hosting)
services:
  tracking:
    image: ghcr.io/iron-curtain/tracking-server:latest
    ports:
      - "8080:8080"
    environment:
      - STORE=memory           # or STORE=redis://redis:6379 for multi-instance
      - HEARTBEAT_TTL=30s
      - MAX_LISTINGS=1000
      - RATE_LIMIT=10/min      # per IP — anti-spam
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/healthz"]

  relay:
    image: ghcr.io/iron-curtain/relay-server:latest
    ports:
      - "9090:9090/udp"
      - "9090:9090/tcp"
    environment:
      - MAX_GAMES=100
      - MAX_PLAYERS_PER_GAME=16
      - TICK_TIMEOUT=5s         # drop orders after 5s — anti-lag-switch
      - REGION=eu-west          # reported to tracking server
    volumes:
      - relay-data:/data        # SQLite DB for match results, profiles (D034)
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9091/healthz"]

  redis:
    image: redis:7-alpine       # only needed for multi-instance tracking
    profiles: ["scaled"]

volumes:
  relay-data:                   # persistent storage for relay's SQLite DB
```

**Option 3: Kubernetes / Helm (production scale)**

For the official deployment or large community servers that need horizontal scaling:

```yaml
# helm/values.yaml (abbreviated)
tracking:
  replicas: 3
  resources:
    requests: { cpu: 100m, memory: 64Mi }
    limits: { cpu: 500m, memory: 128Mi }
  store: redis
  redis:
    url: redis://redis-master:6379

relay:
  replicas: 5                   # one pod per ~100 concurrent games
  resources:
    requests: { cpu: 200m, memory: 128Mi }
    limits: { cpu: 1000m, memory: 256Mi }
  sessionAffinity: ClientIP     # sticky sessions for relay game state
  regions:
    - name: eu-west
      replicas: 2
    - name: us-east
      replicas: 2
    - name: ap-southeast
      replicas: 1
```

### Cost Profile

Both services are lightweight — they forward small order packets, not game state:

| Deployment                    | Cost               | Serves                   | Requires                |
| ----------------------------- | ------------------ | ------------------------ | ----------------------- |
| Home PC / spare laptop        | Free (electricity) | ~50 concurrent games     | Port forwarding         |
| Raspberry Pi                  | ~€50 one-time      | ~50 concurrent games     | Port forwarding         |
| Single VPS (community)        | €5-10/month        | ~200 concurrent games    | Nothing special         |
| Small k8s cluster (official)  | €30-50/month       | ~2000 concurrent games   | Kubernetes knowledge    |
| Scaled k8s (launch day spike) | €100-200/month     | ~10,000 concurrent games | Kubernetes + monitoring |

The relay server is the heavier service (per-game session state, UDP forwarding) but still tiny — each game session is a few KB of buffered orders. A single pod handles ~100 concurrent games easily.

### Backend Language

The tracking and relay servers are standalone Rust binaries (not Bevy — no ECS needed). They share `ra-protocol` for order serialization. The relay server implements the relay-side of `RelayLockstepNetwork`. Both are simple enough to be developed in Phase 5 alongside the multiplayer client code.

### Failure Modes

| Failure                      | Impact                                                                                                 | Recovery                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Tracking server dies         | Browse requests fail; existing games unaffected                                                        | Restart process; multi-instance setups have other replicas |
| All tracking servers down    | No game browser; existing games unaffected                                                             | Direct IP, join codes, QR still work                       |
| Relay server dies            | Games on that instance disconnect; persistent data (match results, profiles) survives in SQLite (D034) | Clients reconnect to another instance or fall back to P2P  |
| Official infra fully offline | Community tracking/relay servers still operational                                                     | Federation means no single operator is critical            |

## Multi-Player Scaling (Beyond 2 Players)

The architecture supports N players with no structural changes. Every design element — deterministic lockstep, sub-tick ordering, relay server, desync detection — works for 2, 4, 8, or more players.

### How Each Component Scales

| Component             | 2 players                        | N players                        | Bottleneck                                                             |
| --------------------- | -------------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| **Lockstep sim**      | Both run identical sim           | All N run identical sim          | No change — sim processes `TickOrders` regardless of source count      |
| **Sub-tick ordering** | Sort 2 players' orders           | Sort N players' orders           | Negligible — orders per tick is small (players issue ~0-5 orders/tick) |
| **Relay server**      | Collects from 2, broadcasts to 2 | Collects from N, broadcasts to N | Linear in N. Bandwidth is tiny (orders are small)                      |
| **Desync detection**  | Compare 2 hashes                 | Compare N hashes                 | Trivial — one hash per player per tick                                 |
| **Input delay**       | Tuned to worst of 2 connections  | Tuned to worst of N connections  | **Real bottleneck** — one laggy player affects everyone                |
| **Direct P2P**        | 1 connection                     | N×(N-1)/2 mesh connections       | Mesh doesn't scale. Use star topology or relay for >4 players          |

### P2P Topology for Multi-Player

Direct P2P lockstep with 2-3 players uses a full mesh (everyone connects to everyone). Beyond that, use a star topology where one player acts as host:

```
2-3 players: full mesh (every client sends to every other)
  A ↔ B ↔ C ↔ A

4+ players: star via host (one player collects and rebroadcasts)
  B → A ← C        A = host, collects orders, broadcasts canonical tick
      ↑
      D

4+ players: relay server (recommended)
  B → R ← C        R = relay, all benefits of relay deployment
      ↑
      D
```

For 4+ players, the relay server is strongly recommended. It solves:
- NAT traversal for all players (not just host)
- Lag-switch protection for all players (not just host-enforced)
- No single player has hosting advantage (relay is neutral authority)
- Sub-tick ordering is globally fair

### The Real Scaling Limit: Sim Cost, Not Network

With N players, the sim has more units, more orders, and more state to process. This is a **sim performance** concern, not a network concern:

- 2-player game: ~200-500 units typically
- 4-player FFA or 2v2: ~400-1000 units
- 8-player: ~800-2000 units

The performance targets in `10-PERFORMANCE.md` already account for this. The efficiency pyramid (flowfields, spatial hash, sim LOD, amortized work) is designed for 2000+ units on mid-range hardware. An 8-player game is within budget.

### Team Games (2v2, 3v3, 4v4)

Team games work identically to FFA. Each player submits orders for their own units. The sim processes all orders from all players in sub-tick chronological order. Alliances, shared vision, and team chat are sim-layer and UI-layer concerns — the network model doesn't distinguish between ally and enemy.

### Observers / Spectators

Observers receive `TickOrders` but never submit any. They run the sim locally (full state, all players' perspective). In a relay server setup, the relay can optionally delay the observer feed by N ticks to prevent live coaching.

```rust
pub struct ObserverConnection {
    pub delay_ticks: u64,        // e.g., 30 ticks (~2 seconds) for anti-coaching
    pub receive_only: bool,      // true — observer never submits orders
}
```

### Player Limits

No hard architectural limit. Practical limits:
- **Lockstep input delay** — scales with the worst connection among N players. Beyond ~8 players, the slowest player's latency dominates everyone's experience.
- **Order volume** — N players generating orders simultaneously. Still tiny bandwidth (orders are small structs, not state).
- **Sim cost** — more players = more units = more computation. The efficiency pyramid handles this up to the hardware's limit.
