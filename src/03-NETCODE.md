# 03 — Network Architecture

## Our Netcode

Iron Curtain ships **one default gameplay netcode** today: relay-assisted deterministic lockstep with sub-tick order fairness. This is the recommended production path, not a buffet of equal options in the normal player UX. The `NetworkModel` trait still exists for more than testing: it lets us run single-player and replay modes cleanly, support multiple deployments (dedicated relay / embedded relay / P2P LAN), and preserve the ability to introduce deferred compatibility bridges or replace the default netcode under explicitly deferred milestones (for example `M7+` interop experiments or `M11` optional architecture work) if evidence warrants it (e.g., cross-engine interop experiments, architectural flaws discovered in production). Those paths require explicit decision/tracker placement and are not part of `M4` exit criteria.

**Keywords:** netcode, relay lockstep, `NetworkModel`, sub-tick timestamps, reconnection, desync debugging, replay determinism, compatibility bridge, ranked authority, relay server

Key influences:
- **Counter-Strike 2** — sub-tick timestamps for order fairness
- **C&C Generals/Zero Hour** — adaptive run-ahead, frame resilience, delta-compressed wire format, disconnect handling
- **Valve GameNetworkingSockets (GNS)** — ack vector reliability, message lanes with priority/weight, per-ack RTT measurement, pluggable signaling, transport encryption, Nagle-style batching (see `research/valve-github-analysis.md`)
- **OpenTTD** — multi-level desync debugging, token-based liveness, reconnection via state transfer
- **Minetest** — time-budget rate control (LagPool), half-open connection defense
- **OpenRA** — what to avoid: TCP stalling, static order latency, shallow sync buffers
- **Bryant & Saiedian (2021)** — state saturation taxonomy, traffic class segregation

## The Protocol

All protocol types live in the `ic-protocol` crate — the ONLY shared dependency between sim and net:

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

/// Sub-tick timestamp on every order (CS2-inspired, see below).
/// In relay modes this is a client-submitted timing hint that the relay
/// normalizes/clamps before broadcasting canonical TickOrders.
#[derive(Clone, Serialize, Deserialize)]
pub struct TimestampedOrder {
    pub player: PlayerId,
    pub order: PlayerOrder,
    pub sub_tick_time: u32,  // microseconds within the tick window (0 = tick start)
}
// NOTE: sub_tick_time is an integer (microseconds offset from tick start).
// At 15 ticks/sec the tick window is ~66,667µs — u32 is more than sufficient.
// Integer ordering avoids any platform-dependent float comparison behavior
// and keeps ic-protocol free of floating-point types entirely.

pub struct TickOrders {
    pub tick: u64,
    pub orders: Vec<TimestampedOrder>,
}

impl TickOrders {
    /// CS2-style: process in chronological order within the tick.
    /// Uses a caller-provided scratch buffer to avoid per-tick heap allocation.
    /// The buffer is cleared and reused each tick (see TickScratch pattern in 10-PERFORMANCE.md).
    /// Tie-break by player ID so equal timestamps remain deterministic in P2P/LAN modes
    /// (relay modes may already emit canonical normalized timestamps, but the helper stays safe).
    pub fn chronological<'a>(&'a self, scratch: &'a mut Vec<&'a TimestampedOrder>) -> &'a [&'a TimestampedOrder] {
        scratch.clear();
        scratch.extend(self.orders.iter());
        scratch.sort_by_key(|o| (o.sub_tick_time, o.player));
        scratch.as_slice()
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
2. Validates/normalizes client timestamp hints into canonical sub-tick timestamps (relay-owned timing calibration + skew bounds)
3. Orders them chronologically within the tick (CS2 insight — see below)
4. Broadcasts the canonical `TickOrders` to all clients
5. All clients run the identical deterministic sim on those orders

The relay also:
- Detects lag switches and cheating attempts (see anti-lag-switch below)
- Handles NAT traversal (no port forwarding needed)
- Signs replays for tamper-proofing (see `06-SECURITY.md`)
- Validates order signatures and rate limits (see `06-SECURITY.md`)

This design was validated by C&C Generals/Zero Hour's "packet router" — a client-side star topology where one player collected and rebroadcast all commands. Same concept, but our server-hosted version eliminates host advantage and adds neutral time authority. See `research/generals-zero-hour-netcode-analysis.md`.

Further validated by Embark Studios' **Quilkin** (1,510★, Apache 2.0, co-developed with Google Cloud Gaming) — a production UDP proxy for game servers built in Rust. Quilkin implements the relay as a **composable filter chain**: each packet passes through an ordered pipeline of filters (Capture → Firewall → RateLimit → TokenRouter → Timestamp → Debug), and filters can be added, removed, or reordered without touching routing logic. IC's relay should adopt this composable architecture: order validation → sub-tick timestamps → replay recording → anti-cheat → forwarding, each implemented as an independent filter. See `research/embark-studios-rust-gamedev-analysis.md` § Quilkin.

For small games (2-3 players) on LAN or with direct connectivity, the same netcode runs without a relay via P2P lockstep (see "The NetworkModel Trait" section below for deployment modes).

### RelayCore: Library, Not Just a Binary

The relay logic — order collection, sub-tick sorting, time authority, anti-lag-switch, token liveness — lives as a library component (`RelayCore`) inside `ic-net`, not only as a standalone server binary. This enables three deployment modes for the same relay functionality:

```
ic-net/
├── relay_core       ← The relay logic: order collection, sub-tick sorting,
│                       time authority, anti-lag-switch, token liveness,
│                       replay signing, composable filter chain
├── relay_server     ← Standalone binary wraps RelayCore (multi-game, headless)
└── embedded_relay   ← Game client wraps RelayCore (single game, host plays)
```

**`RelayCore`** is a pure-logic component — no I/O, no networking. It accepts incoming order packets, sorts them by sub-tick timestamp, produces canonical `TickOrders`, and runs the composable filter chain. The embedding layer (standalone binary or game client) handles actual network I/O and feeds packets into `RelayCore`.

```rust
/// The relay engine. Embedding-agnostic — works identically whether
/// hosted in a standalone binary or inside a game client.
pub struct RelayCore {
    tick: u64,
    pending_orders: Vec<TimestampedOrder>,
    filter_chain: Vec<Box<dyn RelayFilter>>,
    liveness_tokens: HashMap<PlayerId, LivenessToken>,
    clock_calibration: HashMap<PlayerId, ClockCalibration>,
    // ... anti-lag-switch state, replay signer, etc.
}

impl RelayCore {
    /// Feed an incoming order packet. Called by the network layer.
    pub fn receive_order(&mut self, player: PlayerId, order: TimestampedOrder) { ... }
    
    /// Produce the canonical TickOrders for this tick.
    /// Sub-tick sorts, runs filter chain, advances tick counter.
    pub fn finalize_tick(&mut self) -> TickOrders { ... }
    
    /// Generate liveness token for the next frame.
    pub fn next_liveness_token(&mut self, player: PlayerId) -> u32 { ... }
}
```

This creates three relay deployment modes:

| Mode                 | Who Runs RelayCore                             | Who Plays                    | Relay Quality                                | Use Case                              |
| -------------------- | ---------------------------------------------- | ---------------------------- | -------------------------------------------- | ------------------------------------- |
| **Dedicated server** | Standalone binary (`relay-server`)             | All clients connect remotely | Full sub-tick, multi-game, neutral authority | Server rooms, Pi, competitive, ranked |
| **Listen server**    | Game client embeds it (`EmbeddedRelayNetwork`) | Host plays + others connect  | Full sub-tick, single game, host plays       | Casual, community, "Host Game" button |
| **P2P direct**       | Nobody — no relay                              | All clients peer directly    | No time authority, client-side sorting       | LAN, ≤3 players                       |

**Listen server vs. Generals' star topology.** C&C Generals used a star topology where the host player collected and rebroadcast orders — but the host had **host advantage**: zero self-latency, ability to peek at orders before broadcasting. With IC's embedded `RelayCore`, the host's own orders go through the same `RelayCore` pipeline as everyone else's. Clients submit sub-tick timestamp *hints* from local clocks; the relay converts them into relay-canonical timestamps using the same normalization logic for every player. The host doesn't get a privileged code path.

**Trust boundary for ranked play.** An embedded relay runs inside the host's process — a malicious host could theoretically modify `RelayCore` behavior (drop opponents' orders, manipulate timestamps). For **ranked/competitive** play, the matchmaking system requires connection to an official or community-verified relay server (standalone binary on trusted infrastructure). For **casual, LAN, and custom games**, the embedded relay is perfect — zero setup, "Host Game" button just works, no external server needed.

**Connecting clients can't tell the difference.** Both the standalone binary and the embedded relay present the same protocol. `RelayLockstepNetwork` on the client side connects identically — it doesn't know or care whether the relay is a dedicated server or running inside another player's game client. This is a deployment concern, not a protocol concern.

### Connection Lifecycle Type State

Network connections transition through a fixed lifecycle: `Connecting → Authenticated → InLobby → InGame → Disconnecting`. Calling the wrong method in the wrong state is a security risk — processing game orders from an unauthenticated connection, or sending lobby messages during gameplay, shouldn't be possible to write accidentally.

IC uses Rust's **type state pattern** to make invalid state transitions a compile error instead of a runtime bug:

```rust
use std::marker::PhantomData;

/// Marker types — zero-sized, exist only in the type system.
pub struct Connecting;
pub struct Authenticated;
pub struct InLobby;
pub struct InGame;

/// A network connection whose valid operations are determined by its state `S`.
/// `PhantomData<S>` is zero-sized — no runtime cost.
pub struct Connection<S> {
    stream: TcpStream,
    player_id: Option<PlayerId>,
    _state: PhantomData<S>,
}

impl Connection<Connecting> {
    /// Verify credentials. Consumes the Connecting connection,
    /// returns an Authenticated one. Can't be called twice.
    pub fn authenticate(self, cred: &Credential) -> Result<Connection<Authenticated>, AuthError> {
        // ... verify Ed25519 signature (D052), assign PlayerId
    }
    // send_order() doesn't exist here — won't compile.
}

impl Connection<Authenticated> {
    /// Join a game lobby. Consumes Authenticated, returns InLobby.
    pub fn join_lobby(self, room: RoomId) -> Result<Connection<InLobby>, LobbyError> {
        // ... register with lobby, send player list
    }
}

impl Connection<InLobby> {
    /// Transition to in-game when the lobby starts.
    pub fn start_game(self, game_id: GameId) -> Connection<InGame> {
        // ... initialize per-connection game state
    }

    pub fn send_chat(&self, msg: &ChatMessage) { /* ... */ }
    // send_order() doesn't exist here — won't compile.
}

impl Connection<InGame> {
    /// Submit a game order. Only available during gameplay.
    pub fn send_order(&self, order: &TimestampedOrder) { /* ... */ }

    /// Return to lobby after match ends.
    pub fn end_game(self) -> Connection<InLobby> {
        // ... cleanup per-connection game state
    }
}
```

**Why this matters for IC:**

- **Security by construction.** The relay server handles untrusted connections. A bug that processes game orders from a connection still in `Connecting` state is an exploitable vulnerability. Type state makes it a compile error — not a runtime check someone might forget.
- **Zero runtime cost.** `PhantomData<S>` is zero-sized. The state transitions compile to the same machine code as passing a struct between functions. No enum discriminant, no match statement, no branch prediction miss.
- **Self-documenting API.** The method signatures *are* the state machine documentation. If `send_order()` only exists on `Connection<InGame>`, no developer needs to check whether "Am I allowed to send orders here?" — the compiler already answered.
- **Ownership-driven transitions.** Each transition *consumes* the old connection and returns a new one. You can't accidentally keep a reference to the `Connecting` version after authentication. Rust's move semantics enforce this automatically.

**Where NOT to use type state:** Game entities. Units change state constantly at runtime (idle → moving → attacking → dead) driven by data-dependent conditions — that's a runtime state machine (`enum` + `match` with exhaustiveness checking), not a compile-time type state. Type state is for state machines with a fixed, known-at-compile-time set of transitions — like connection lifecycle, file handles (open/closed), or build pipeline stages.

### Sub-Tick Order Fairness (from CS2)

Counter-Strike 2 introduced "sub-tick" architecture: instead of processing all actions at discrete tick boundaries, the client timestamps every input with sub-tick precision. The server collects inputs from all clients and processes them in chronological order within each tick window. The server still ticks at 64Hz, but events are ordered by their actual timestamps.

For an RTS, the core idea — **timestamped orders processed in chronological order within a tick** — produces fairer results for edge cases:

- Two players grabbing the same crate → the one who clicked first gets it
- Engineer vs engineer racing to capture a building → chronological winner
- Simultaneous attack orders → processed in actual order, not arrival order

**What's NOT relevant from CS2:** CS2 is client-server authoritative with prediction and interpolation. An RTS with hundreds of units can't afford server-authoritative simulation — the bandwidth would be enormous. We stay with deterministic lockstep (clients run identical sims), so CS2's prediction/reconciliation doesn't apply.

#### Why Sub-Tick Instead of a Higher Tick Rate

In client-server FPS (CS2, Overwatch), a tick is just a simulation step — the server runs alone and sends corrections. In **lockstep**, a tick is a **synchronization barrier**: every tick requires collecting all players' orders (or hitting the deadline), processing them deterministically, advancing the full ECS simulation, and exchanging sync hashes. Each tick is a coordination point between all players.

This means higher tick rates have multiplicative cost in lockstep:

| Approach                 | Sim Cost                        | Network Cost                                                    | Fairness Outcome                                                            |
| ------------------------ | ------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **30 tps + sub-tick**    | 30 full sim updates/sec         | 30 sync barriers/sec, 3-tick run-ahead for 100ms buffer         | Fair — orders sorted by timestamp within each tick                          |
| **128 tps, no sub-tick** | 128 full sim updates/sec (4.3×) | 128 sync barriers/sec, ~13-tick run-ahead for same 100ms buffer | Unfair — ties within 8ms windows still broken by player ID or arrival order |
| **128 tps + sub-tick**   | 128 full sim updates/sec (4.3×) | 128 sync barriers/sec                                           | Fair — but at enormous cost for zero additional benefit                     |

At 128 tps, you're running all pathfinding, spatial queries, combat resolution, fog updates, and economy for 500+ units 128 times per second instead of 30. That's a 4× CPU increase with no gameplay benefit — RTS units move cell-to-cell, not sub-millimeter. Visual interpolation already makes 30 tps look smooth at 60+ FPS render.

Critically, **128 tps doesn't even eliminate the problem sub-tick solves.** Two orders landing in the same 8ms window still need a tiebreaker. You've paid 4× the cost and still need sub-tick logic (or unfair player-ID tiebreaking) for simultaneous orders.

Sub-tick **decouples order fairness from simulation rate.** That's why it's the right tool: it solves the fairness problem without paying the simulation cost. A tick's purpose in lockstep is synchronization, and you want the *fewest* synchronization barriers that still produce good gameplay — not the most.

#### Relay-Side Timestamp Normalization (Trust Boundary)

The relay's "time authority" guarantee is only meaningful if it does **not** blindly trust client-claimed sub-tick timestamps. Therefore:

- **Client `sub_tick_time` is a hint, not an authoritative fact**
- **Relay assigns the canonical timestamp** that is broadcast in `TickOrders`
- **Impossible timestamps are clamped/flagged**, not accepted as-is

The relay maintains a per-player timing calibration (offset/skew estimate + jitter envelope) derived from transport RTT samples and timing feedback. When an order arrives, the relay:

1. Determines the relay tick window the order belongs to (or drops it as late)
2. Computes a feasible arrival-time envelope for that player in that tick
3. Maps the client's `sub_tick_time` hint into relay time using the calibration
4. Clamps to the feasible envelope and `[0, tick_window_us)` bounds
5. Emits the **relay-normalized** `sub_tick_time` in canonical `TickOrders`

Orders with repeated timestamp claims outside the allowed skew budget are treated as suspicious (telemetry + anti-abuse scoring; optional strike escalation in ranked relay deployments). This preserves the fairness benefit of sub-tick ordering while preventing "I clicked first" spoofing by client clock manipulation.

In **P2P lockstep**, there is no neutral time authority, so this normalization is not possible. P2P keeps the deterministic `(sub_tick_time, player_id)` ordering rule and explicitly accepts reduced fairness (acceptable for LAN/small-group play).

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

#### Input Timing Feedback (from DDNet)

The relay server periodically reports order arrival timing **back to each client**, enabling client-side self-calibration. This pattern is proven by DDNet's timing feedback system (see `research/veloren-hypersomnia-openbw-ddnet-netcode-analysis.md`) where the server reports how early/late each player's input arrived:

```rust
/// Sent by the relay to each client after every N ticks (default: 30).
/// Tells the client how its orders are arriving relative to the tick deadline.
pub struct TimingFeedback {
    pub avg_arrival_delta_us: i32,  // +N = arrived N μs before deadline, -N = late
    pub late_count: u16,            // orders missed deadline in this window
    pub jitter_us: u32,             // arrival time variance
}
```

The client uses this feedback to adjust when it submits orders — if orders are consistently arriving just barely before the deadline, the client shifts submission earlier. If orders are arriving far too early (wasting buffer), the client can relax. This is a feedback loop that converges toward optimal submission timing without the relay needing to adjust global tick deadlines, reducing the number of late drops for marginal connections.

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

**Relay connection limits:** In addition to per-player order rate control, the relay enforces connection-level limits to prevent resource exhaustion (see `06-SECURITY.md` § Vulnerability 24):

- **Max total connections per relay instance:** configurable, default 1000. Returns 503 when at capacity.
- **Max connections per IP:** configurable, default 5. Prevents single-source connection flooding.
- **New connection rate per IP:** max 10/sec (token bucket). Prevents rapid reconnection spam.
- **Memory budget per connection:** bounded; torn down if exceeded.
- **Idle timeout:** 60 seconds for unauthenticated, 5 minutes for authenticated.

These limits complement the order-level defenses — rate control handles abuse from established connections, connection limits prevent exhaustion of server resources before a game even starts.

### Frame Data Resilience (from C&C Generals + Valve GNS)

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

#### Ack Vector Reliability Model (from Valve GNS)

The reliability layer uses **ack vectors** — a compact bitmask encoding which of the last N packets were received — rather than TCP-style cumulative acknowledgment or selective ACK (SACK). This approach is borrowed from Valve's GameNetworkingSockets (which in turn draws from DCCP, RFC 4340). See `research/valve-github-analysis.md` § Part 1.

**How it works:** Every outgoing packet includes an ack vector — a bitmask where each bit represents a recently received packet from the peer. Bit 0 = the most recently received packet (identified by its sequence number in the header), bit 1 = the one before that, etc. A 64-bit ack vector covers the last 64 packets. The sender inspects incoming ack vectors to determine which of its sent packets were received and which were lost.

```rust
/// Included in every outgoing packet. Tells the peer which of their
/// recent packets we received.
pub struct AckVector {
    /// Sequence number of the most recently received packet (bit 0).
    pub latest_recv_seq: u32,
    /// Bitmask: bit N = 1 means we received (latest_recv_seq - N).
    /// 64 bits covers the last 64 packets at 30 tps ≈ ~2 seconds of history.
    pub received_mask: u64,
}
```

**Why ack vectors over TCP-style cumulative ACKs:**
- **No head-of-line blocking.** TCP's cumulative ACK stalls retransmission decisions when a single early packet is lost but later packets arrive fine. Ack vectors give per-packet reception status instantly.
- **Sender-side retransmit decisions.** The sender has full information about which packets were received and decides what to retransmit. The receiver never requests retransmission — it simply reports what it got. This keeps the receiver stateless with respect to reliability.
- **Natural fit for UDP.** Ack vectors assume an unreliable, unordered transport — exactly what UDP provides. On reliable transports (WebSocket), the ack vector still works but retransmit timers never fire (same "always run reliability" principle from D054).
- **Compact.** A 64-bit bitmask + 4-byte sequence number = 12 bytes per packet. TCP's SACK option can be up to 40 bytes.

**Retransmission:** When the sender sees a gap in the ack vector (bit = 0 for a packet older than the latest ACK'd), it schedules retransmission. Retransmission uses exponential backoff per packet. The retransmit buffer is the same circular buffer used for frame resilience (last N ticks of sent data).

#### Per-Ack RTT Measurement (from Valve GNS)

Each outgoing packet embeds a small **delay field** — the time elapsed between receiving the peer's most recent packet and sending this response. The peer subtracts this processing delay from the observed round-trip to compute a precise one-way latency estimate:

```rust
/// Embedded in every packet header alongside the ack vector.
pub struct PeerDelay {
    /// Microseconds between receiving the peer's latest packet
    /// and sending this packet. The peer uses this to compute RTT:
    /// RTT = (time_since_we_sent_the_acked_packet) - peer_delay
    pub delay_us: u16,
}
```

**Why this matters:** Traditional RTT measurement requires dedicated ping/pong packets or timestamps that consume bandwidth. By embedding delay in every ack, RTT is measured continuously on every packet exchange — no separate ping packets needed. This provides smoother, more accurate latency data for adaptive run-ahead (see above) and removes the ~50ms ping interval overhead. The technique is standard in Valve's GNS and is also used by QUIC (RFC 9000).

#### Nagle-Style Order Batching (from Valve GNS)

Player orders are not sent immediately on input — they are batched within each tick window and flushed at tick boundaries:

```rust
/// Order batching within a tick window.
/// Orders accumulate in a buffer and are flushed as a single packet
/// at the tick boundary. This reduces packet count by ~5-10x during
/// burst input (selecting and commanding multiple groups rapidly).
pub struct OrderBatcher {
    /// Orders accumulated since last flush.
    pending: Vec<TimestampedOrder>,
    /// Flush when the tick boundary arrives (external trigger from game loop).
    /// Unlike TCP Nagle (which flushes on ACK), we flush on a fixed cadence
    /// aligned to the sim tick rate — deterministic, predictable latency.
    tick_rate: Duration,
}
```

Unlike TCP's Nagle algorithm (which flushes on receiving an ACK — coupling send timing to network conditions), IC flushes on a fixed tick cadence. This gives deterministic, predictable send timing: all orders within a tick window are batched into one packet, sent at the tick boundary. At 30 tps, this means at most ~33ms of batching delay — well within the adaptive run-ahead window and invisible to the player. The technique is validated by Valve's GNS batching strategy (see `research/valve-github-analysis.md` § 1.7).

### Wire Format: Delta-Compressed TLV (from C&C Generals)

Inspired by C&C Generals' `NetPacket` format (see `research/generals-zero-hour-netcode-analysis.md`), the native wire format uses delta-compressed tag-length-value (TLV) encoding:

- **Tag bytes** — single ASCII byte identifies the field: `T`ype, `K`(tic**K**), `P`layer, `S`ub-tick, `D`ata
- **Delta encoding** — fields are only written when they differ from the previous order in the same packet. If the same player sends 5 orders on the same tick, the player ID and tick number are written once.
- **Empty-tick compression** — ticks with no orders compress to a single byte (Generals used `Z`). In a typical RTS, ~80% of ticks have zero orders from any given player.
- **Varint encoding** — integer fields use variable-length encoding (LEB128) where applicable. Small values (tick deltas, player indices) compress to 1-2 bytes instead of fixed 4-8 bytes. Integers that are typically small (order counts, sub-tick offsets) benefit most; fixed-size fields (hashes, signatures) remain fixed.
- **MTU-aware packet sizing** — packets stay under 476 bytes (single IP fragment, no UDP fragmentation). Fragmented UDP packets multiply loss probability — if any fragment is lost, the entire packet is dropped.
- **Transport-agnostic framing** — the wire format is independent of the underlying transport (UDP, WebSocket, QUIC). The same TLV encoding works on all transports; only the packet delivery mechanism changes (D054). This follows GNS's approach of transport-agnostic SNP (Steam Networking Protocol) frames (see `research/valve-github-analysis.md` § Part 1).

For typical RTS traffic (0-2 orders per player per tick, long stretches of idle), this compresses wire traffic by roughly 5-10x compared to naively serializing every `TimestampedOrder`.

For cross-engine play, the wire format is abstracted behind an `OrderCodec` trait — see `07-CROSS-ENGINE.md`.

### Message Lanes (from Valve GNS)

Not all network messages have equal priority. Valve's GNS introduces **lanes** — independent logical streams within a single connection, each with configurable priority and weight. IC adopts this concept for its relay protocol to prevent low-priority traffic from delaying time-critical orders.

```rust
/// Message lanes — independent priority streams within a Transport connection.
/// Each lane has its own send queue. The transport drains queues by priority
/// (higher first) and weight (proportional bandwidth among same-priority lanes).
///
/// Lanes are a `NetworkModel` concern, not a `Transport` concern — Transport
/// provides a single byte pipe; NetworkModel multiplexes lanes over it.
/// This keeps Transport implementations simple (D054).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum MessageLane {
    /// Tick orders — highest priority, real-time critical.
    /// Delayed orders cause Idle substitution (anti-lag-switch).
    Orders = 0,
    /// Sync hashes, ack vectors, RTT measurements — protocol control.
    /// Must arrive promptly for desync detection and adaptive run-ahead.
    Control = 1,
    /// Chat messages, player status updates, lobby state.
    /// Important but not time-critical — can tolerate ~100ms extra delay.
    Chat = 2,
    /// Voice-over-IP frames (Opus-encoded). Real-time but best-effort —
    /// dropped frames use Opus PLC, not retransmit. See D059.
    Voice = 3,
    /// Replay data, observer feeds, telemetry.
    /// Lowest priority — uses spare bandwidth only.
    Bulk = 4,
}

/// Lane configuration — priority and weight determine scheduling.
pub struct LaneConfig {
    /// Higher priority lanes are drained first (0 = highest).
    pub priority: u8,
    /// Weight for proportional bandwidth sharing among same-priority lanes.
    /// E.g., two lanes at priority 1 with weights 3 and 1 get 75%/25% of
    /// remaining bandwidth after higher-priority lanes are satisfied.
    pub weight: u8,
    /// Per-lane buffering limit (bytes). If exceeded, oldest messages
    /// in the lane are dropped (unreliable lanes) or the lane stalls
    /// (reliable lanes). Prevents low-priority bulk data from consuming
    /// unbounded memory.
    pub buffer_limit: usize,
}
```

**Default lane configuration:**

| Lane      | Priority | Weight | Buffer | Reliability | Rationale                                               |
| --------- | -------- | ------ | ------ | ----------- | ------------------------------------------------------- |
| `Orders`  | 0        | 1      | 4 KB   | Reliable    | Orders must arrive; missed = Idle (deadline is the cap) |
| `Control` | 0        | 1      | 2 KB   | Unreliable  | Latest sync hash wins; stale hashes are useless         |
| `Chat`    | 1        | 1      | 8 KB   | Reliable    | Chat messages should arrive but can wait                |
| `Voice`   | 1        | 2      | 16 KB  | Unreliable  | Real-time voice; dropped frames use Opus PLC (D059)     |
| `Bulk`    | 2        | 1      | 64 KB  | Unreliable  | Telemetry/observer data uses spare bandwidth            |

The Orders and Control lanes share the highest priority tier — both are drained before any Chat or Bulk data is sent. Chat and Voice share priority tier 1 with a 2:1 weight ratio (voice gets more bandwidth because it's time-sensitive). This ensures that a player spamming chat messages, voice traffic, or a spectator feed generating bulk data never delays order delivery. The lane system is optional for `LocalNetwork` and `MemoryTransport` (where bandwidth is unlimited), but critical for the relay deployment where bandwidth to each client is finite. See `decisions/09g-interaction.md` § D059 for the full VoIP architecture.

**Relay server poll groups:** In a relay deployment serving multiple concurrent games, each game session's connections are grouped into a **poll group** (terminology from GNS). The relay's event loop polls all connections within a poll group together, processing messages for one game session in a batch before moving to the next. This improves cache locality (all state for one game is hot in cache during its processing window) and simplifies per-game rate limiting. The poll group concept is internal to the relay server — clients don't know or care whether they share a relay with other games.

### Desync Detection & Debugging

Desyncs are the hardest problem in lockstep netcode. OpenRA has 135+ desync issues in their tracker — they hash game state per frame (via `[VerifySync]` attribute) but their sync report buffer is only 7 frames deep, which often isn't enough to capture the divergence point. Our architecture makes desyncs both **detectable** AND **diagnosable**, drawing on 20+ years of OpenTTD's battle-tested desync debugging infrastructure.

#### Dual-Mode State Hashing

Every tick, each client hashes their sim state. But a full `state_hash()` over the entire ECS world is expensive. We use a two-tier approach (validated by both OpenTTD and 0 A.D.):

- **Primary: RNG state comparison.** Every sync frame, clients exchange their deterministic RNG seed. If the RNG diverges, the sim has diverged — this catches ~99% of desyncs at near-zero cost. The RNG is advanced by every stochastic sim operation (combat rolls, scatter patterns, AI decisions), so any state divergence quickly contaminates it.
- **Fallback: Full state hash.** Periodically (every N ticks, configurable — default 120, ~4 seconds at 30 tps) or when RNG drift is detected, compute and compare a full `state_hash()`. This catches the rare case where a desync affects only deterministic state that doesn't touch the RNG.

The relay server (or P2P peers) compares hashes. On mismatch → desync detected at a specific tick. Because the sim is snapshottable (D010), dump full state and diff to pinpoint exact divergence — entity by entity, component by component.

#### Merkle Tree State Hashing (Phase 2+)

A flat `state_hash()` tells you *that* state diverged, but not *where*. Diagnosing which entity or subsystem diverged requires a full state dump and diff — expensive for large games (500+ units, ~100KB+ of serialized state). IC addresses this by structuring the state hash as a **Merkle tree**, enabling binary search over *state within a tick* — not just binary search over ticks (which is what OpenTTD's snapshot bisection already provides).

The Merkle tree partitions ECS state by archetype (or configurable groupings — e.g., per-player, per-subsystem). Each leaf is the hash of one archetype's serialized components. Interior nodes are `SHA-256(left_child || right_child)` in the full debug representation. For live sync checks, IC transmits a compact **64-bit fast sync hash** (`u64`) derived from the Merkle root (or flat hash in Phase 2), preserving low per-tick bandwidth. Higher debug levels may include full 256-bit node hashes in `DesyncDebugReport` payloads for stronger evidence and better tooling. This costs the same as a flat hash (every byte is still hashed once) — the tree structure is overhead-free for the common case where hashes match.

When hashes *don't* match, the tree enables **logarithmic desync localization**:

1. Clients exchange the Merkle root's **fast sync hash** (same as today — one `u64` per sync frame).
2. On mismatch, clients exchange interior node hashes at depth 1 (2 hashes).
3. Whichever subtree differs, descend into it — exchange its children (2 more hashes).
4. Repeat until reaching a leaf: the specific archetype (or entity group) that diverged.

For a sim with 32 archetypes, this requires ~5 round trips of 2 hashes each (10 hashes total, ~320 bytes) instead of a full state dump (~100KB+). The desync report then contains the exact archetype and a compact diff of its components — actionable information, not a haystack.

```rust
/// Merkle tree over ECS state for efficient desync localization.
pub struct StateMerkleTree {
    /// Leaf fast hashes (u64 truncations / fast-sync form), one per archetype or entity group.
    /// Full SHA-256 nodes may be computed on demand for debug reports.
    pub leaves: Vec<(ArchetypeLabel, u64)>,
    /// Interior node fast hashes (computed bottom-up).
    pub nodes: Vec<u64>,
    /// Root fast hash — this is the state_hash() used for live sync comparison.
    pub root: u64,
}

impl StateMerkleTree {
    /// Returns the path of hashes needed to prove a specific leaf's
    /// membership in the tree. Used for selective verification.
    pub fn proof_path(&self, leaf_index: usize) -> Vec<u64> { /* ... */ }
}
```

**This pattern comes from blockchain state tries** (Ethereum's Patricia-Merkle trie, Bitcoin's Merkle trees for transaction verification), adapted for game state. The original insight — that a tree structure over hashed state enables O(log N) divergence localization without transmitting full state — is one of the few genuinely useful ideas to emerge from the Web3 ecosystem. IC uses it for desync debugging, not consensus.

**Selective replay verification** also benefits: a viewer can verify that a specific tick's state is authentic by checking the Merkle path from the tick's root hash to the replay's signature chain — without replaying the entire game. See `05-FORMATS.md` § Signature Chain for how this integrates with relay-signed replays.

**Phase:** Flat `state_hash()` ships in Phase 2 (sufficient for detection). Merkle tree structure added in Phase 2+ when desync diagnosis tooling is built. The tree is a strict upgrade — same root hash, more information on mismatch.

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

#### Desync Log Transfer Protocol

When a desync is detected, debug data must be collected from **all clients** — comparing state from just one side tells you that the states differ, but not which client diverged (or whether both did). 0 A.D. highlighted this gap: their desync reports were one-sided, requiring manual coordination between players to share debug dumps (see `research/0ad-warzone2100-netcode-analysis.md`).

IC automates cross-client desync data exchange through the relay:

1. **Detection:** Relay detects hash mismatch at tick T.
2. **Collection request:** Relay sends `DesyncDebugRequest { tick: T, level: DesyncDebugLevel }` to all clients.
3. **Client response:** Each client responds with a `DesyncDebugReport` containing its state hash, RNG state, Merkle node hashes (if Merkle tree is active), and optionally a compressed snapshot of the diverged archetype (identified by Merkle tree traversal).
4. **Relay aggregation:** Relay collects reports from all clients, computes a diff summary, and distributes the aggregated report back to all clients (or saves it for post-match analysis).

```rust
pub struct DesyncDebugReport {
    pub player: PlayerId,
    pub tick: u64,
    pub state_hash: u64,
    pub rng_state: u64,
    pub merkle_nodes: Option<Vec<(ArchetypeLabel, u64)>>,  // if Merkle tree active
    pub diverged_archetypes: Option<Vec<CompressedArchetypeSnapshot>>,
    pub order_log_excerpt: Vec<TimestampedOrder>,  // orders around tick T
}
```

In P2P mode, the host collects reports from all peers. For offline diagnosis, the report is written to `desync_report_{game_seed}_{tick}.json` alongside the snapshot files.

#### Serialization Test Mode (Determinism Verification)

A development-only mode that runs **two sim instances in parallel**, both processing the same orders, and compares their state after every tick. If the states ever diverge, the sim has a non-deterministic code path. This pattern is used by 0 A.D.'s test infrastructure (see `research/0ad-warzone2100-netcode-analysis.md`):

```rust
/// Debug mode: run dual sims to catch non-determinism.
/// Enabled via `--dual-sim` flag. Debug builds only.
#[cfg(debug_assertions)]
pub struct DualSimVerifier {
    pub primary: Simulation,
    pub shadow: Simulation,  // cloned from primary at game start
}

#[cfg(debug_assertions)]
impl DualSimVerifier {
    pub fn tick(&mut self, orders: &TickOrders) {
        self.primary.apply_tick(orders);
        self.shadow.apply_tick(orders);
        assert_eq!(
            self.primary.state_hash(), self.shadow.state_hash(),
            "Determinism violation at tick {}! Primary and shadow sims diverged.",
            orders.tick
        );
    }
}
```

This catches non-determinism immediately — no need to wait for a multiplayer desync report. Particularly valuable during development of new sim systems. The shadow sim doubles memory usage and CPU time, so this is **never** enabled in release builds or production. Running the test suite under dual-sim mode is a CI gate for Phase 2+.

#### Adaptive Sync Frequency

The full state hash comparison frequency adapts based on game phase stability (inspired by the adaptive snapshot rate patterns observed across multiple engines):

- **High frequency (every 30 ticks, ~1 second):** During the first 60 seconds of a match and immediately after any player reconnects — state divergence is most likely during transitions.
- **Normal frequency (every 120 ticks, ~4 seconds):** Standard play. Sufficient to catch divergence within a few seconds.
- **Low frequency (every 300 ticks, ~10 seconds):** Late-game with large unit counts, where the hash computation cost is non-trivial. The RNG sync check (near-zero cost) still runs every tick.

The relay can also request an out-of-band sync check after specific events (e.g., a player reconnection completes, a mod hot-reloads script).

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
2. **Relay/host coordinates state transfer.** In P2P, the host is the snapshot source. In relay mode, the relay does **not** run the sim, so it selects a **snapshot donor** from active clients (typically a healthy, low-latency peer) and requests a transfer at a known tick boundary.
3. **Donor creates snapshot** of its current sim state and streams it (via relay in relay mode) to the reconnecting client. Any pending orders queued during the snapshot are sent alongside it (from OpenTTD: `NetworkSyncCommandQueue`), closing the gap between snapshot creation and delivery.
4. **Snapshot verification before load.** The reconnecting client verifies the snapshot tick/hash against relay-coordinated sync data (latest agreed sync hash, or an out-of-band sync check requested by the relay immediately before transfer). If verification fails, the relay retries with a different donor or aborts reconnection.
5. **Client loads the snapshot** and enters a catchup state, processing ticks at accelerated speed until it reaches the current tick.
6. **Client becomes active** once it's within one tick of the server. Orders resume flowing normally.

```rust
pub enum ClientStatus {
    Connecting,          // Transport established, awaiting authentication
    Authorized,          // Identity verified, awaiting state transfer
    Downloading,         // Receiving snapshot
    CatchingUp,          // Processing ticks at accelerated speed
    Active,              // Fully synced, orders flowing
}
```

The relay server sends keepalive messages to the reconnecting client during download (prevents timeout), proxies donor snapshot chunks in relay mode, and queues that player's slot as `PlayerOrder::Idle` until catchup completes. Other players experience no interruption — the game never pauses for a reconnection.

**Frame consumption smoothing during catchup:** When a reconnecting client is processing ticks at accelerated speed (`CatchingUp` state), it must balance sim catchup against rendering responsiveness. If the client devotes 100% of CPU to sim ticks, the screen freezes during catchup — the player sees a frozen frame for seconds, then suddenly jumps to the present. Spring Engine solved this with an 85/15 split: 85% of each frame's time budget goes to sim catchup ticks, 15% goes to rendering the current state (see `research/spring-engine-netcode-analysis.md`). IC adopts a similar approach:

```rust
/// Controls how the client paces sim tick processing during reconnection.
/// Higher values = faster catchup but choppier rendering.
pub struct CatchupConfig {
    pub sim_budget_pct: u8,    // % of frame time for sim ticks (default: 80)
    pub render_budget_pct: u8, // % of frame time for rendering (default: 20)
    pub max_ticks_per_frame: u32, // Hard cap on sim ticks per render frame (default: 30)
}
```

The reconnecting player sees a fast-forward of the game (like a time-lapse replay) rather than a frozen screen followed by a jarring jump. The sim/render ratio can be tuned per platform — mobile clients may need a 70/30 split for acceptable visual feedback.

**Timeout:** If reconnection doesn't complete within a configurable window (default: 60 seconds), the player is permanently dropped. This prevents a malicious player from cycling disconnect/reconnect to disrupt the game indefinitely.

### Visual Prediction (Cosmetic, Not Sim)

The render layer provides **instant visual feedback** on player input, before the order is confirmed by the network:

```rust
// ic-render: immediate visual response to click
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

#### Cosmetic RNG Separation

Visual prediction and all render-side effects (particles, muzzle flash variation, shell casing scatter, smoke drift, death animations, idle fidgets, audio pitch variation) use a **separate non-deterministic RNG** — completely independent of the sim's deterministic PRNG. This is a critical architectural boundary (validated by Hypersomnia's dual-RNG design — see `research/veloren-hypersomnia-openbw-ddnet-netcode-analysis.md`):

```rust
// ic-sim: deterministic — advances identically on all clients
pub struct SimRng(pub StdRng); // seeded once at game start, never re-seeded

// ic-render: non-deterministic — each client generates different particles
pub struct CosmeticRng(pub ThreadRng); // seeded from OS entropy per client
```

**Why this matters:** If render code accidentally advances the sim RNG (e.g., a particle system calling `sim_rng.gen()` to randomize spawn positions), the sim desynchronizes — different clients render different particle counts, advancing the RNG by different amounts. This is an insidious desync source because the game *looks* correct but the RNG state has silently diverged. Separating the RNGs makes this bug **structurally impossible** — render code simply cannot access `SimRng`.

**Predictability tiers for visual effects:**

| Tier            | Determinism       | Examples                                                                | RNG Source                                                   |
| --------------- | ----------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| Sim-coupled     | Deterministic     | Projectile impact position, scatter pattern, unit facing after movement | `SimRng` (in `ic-sim`)                                       |
| Cosmetic-synced | Deterministic     | Muzzle flash frame (affects gameplay readability)                       | `SimRng` — because all clients must show the same visual cue |
| Cosmetic-free   | Non-deterministic | Smoke particles, shell casings, ambient dust, audio pitch variation     | `CosmeticRng` (in `ic-render`)                               |

Effects in the "cosmetic-free" tier can differ between clients without affecting gameplay — Player A sees 47 smoke particles, Player B sees 52, neither notices. Effects in "cosmetic-synced" are rare but exist when visual consistency matters for competitive readability (e.g., a Tesla coil's charge-up animation must match across spectator views).

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
| Architectural headroom      | No sim snapshots                     | Snapshottable sim (D010) enables optional rollback/GGPO experiments (`M11`, `P-Optional`) | Path to eliminating perceived MP delay |

## The NetworkModel Trait

The netcode described above is expressed as a trait because it gives us testability, single-player support, and deployment flexibility **and** preserves architectural escape hatches. The sim and game loop never know which deployment mode is running, and they also don't need to know if deferred milestones introduce (outside the `M4` minimal-online slice):

- a compatibility bridge/protocol adapter for cross-engine experiments (e.g., community interop with legacy game versions or OpenRA)
- a replacement default netcode if production evidence reveals a serious flaw or a better architecture

The product still ships one recommended/default multiplayer path; the trait exists so changing the path under a deferred milestone does not require touching `ic-sim` or the game loop.

```rust
pub trait NetworkModel: Send + Sync {
    /// Local player submits an order
    fn submit_order(&mut self, order: TimestampedOrder);
    /// Poll for the next tick's confirmed orders (None = not ready yet)
    fn poll_tick(&mut self) -> Option<TickOrders>;
    /// Report local fast sync hash (`u64`) for desync detection
    fn report_sync_hash(&mut self, tick: u64, hash: u64);
    /// Connection/sync status
    fn status(&self) -> NetworkStatus;
    /// Diagnostic info (latency, packet loss, etc.)
    fn diagnostics(&self) -> NetworkDiagnostics;
}
```

### Deployment Modes

The same netcode runs in five modes. The first two are utility adapters (no network involved). The last three are real multiplayer deployments of the same protocol:

| Implementation         | What It Is                                        | When Used                             | Phase   |
| ---------------------- | ------------------------------------------------- | ------------------------------------- | ------- |
| `LocalNetwork`         | Pass-through — orders go straight to sim          | Single player, automated tests        | Phase 2 |
| `ReplayPlayback`       | File reader — feeds saved orders into sim         | Watching replays                      | Phase 2 |
| `LockstepNetwork`      | P2P deployment (no relay)                         | LAN, ≤3 players, direct IP            | Phase 5 |
| `EmbeddedRelayNetwork` | Listen server — host embeds `RelayCore` and plays | Casual, community, "Host Game" button | Phase 5 |
| `RelayLockstepNetwork` | Dedicated relay (recommended for online)          | Internet multiplayer, ranked          | Phase 5 |

`LockstepNetwork`, `EmbeddedRelayNetwork`, and `RelayLockstepNetwork` implement the same netcode. The differences are topology and trust:

- **`LockstepNetwork`** — P2P direct connections (full mesh for 2-3 players). No relay, no time authority. Simplest, best for LAN.
- **`EmbeddedRelayNetwork`** — the host's game client runs `RelayCore` (see above) as a listen server. Other players connect to the host. Full sub-tick ordering, anti-lag-switch, and replay signing — same as a dedicated relay. The host plays normally while serving. Ideal for casual/community play: "Host Game" button, zero external infrastructure.
- **`RelayLockstepNetwork`** — clients connect to a standalone relay server on trusted infrastructure. Required for ranked/competitive play (host can't be trusted with relay authority). Recommended for internet play.

All three use adaptive run-ahead, frame resilience, delta-compressed TLV, and Ed25519 signing. The two relay-based modes (`EmbeddedRelayNetwork` and `RelayLockstepNetwork`) share identical `RelayCore` logic — connecting clients use `RelayLockstepNetwork` in both cases and cannot distinguish between them.

These deployments are the current lockstep family. The `NetworkModel` trait intentionally keeps room for deferred non-default implementations (e.g., bridge adapters, rollback experiments, fog-authoritative tournament servers) without changing sim code or invalidating the architectural boundary. Those paths are optional and not part of `M4` exit criteria.

### Example Deferred Adapter: `NetcodeBridgeModel` (Compatibility Bridge)

To make the architectural intent concrete, here is the shape of a **deferred compatibility bridge** implementation. This is not a promise of full cross-play with original RA/OpenRA; it is an example of how the `NetworkModel` boundary allows experimentation without touching `ic-sim`. Planned-deferral scope: cross-engine bridge experiments are tied to `M7.NET.CROSS_ENGINE_BRIDGE_AND_TRUST` / `M11` visual+interop follow-ons and are unranked by default unless a separate explicit decision certifies a mode.

**Use cases this enables (deferred / optional, `M7+` and `M11`):**

- Community-hosted bridge experiments for legacy game versions or OpenRA
- Discovery-layer interop plus limited live-play compatibility prototypes
- Transitional migrations if IC changes its default netcode under a separately approved deferred milestone

```rust
/// Example deferred adapter. Not part of the initial shipping set.
/// Wraps a protocol/transport bridge and translates between an external
/// protocol family and IC's canonical TickOrders interface.
pub struct NetcodeBridgeModel<B: ProtocolBridge> {
    bridge: B,
    inbound_ticks: VecDeque<TickOrders>,
    diagnostics: NetworkDiagnostics,
    status: NetworkStatus,
    // Capability negotiation / compatibility flags:
    // supported_orders, timing_model, hash_mode, etc.
}

impl<B: ProtocolBridge> NetworkModel for NetcodeBridgeModel<B> {
    fn submit_order(&mut self, order: TimestampedOrder) {
        self.bridge.submit_ic_order(order);
    }

    fn poll_tick(&mut self) -> Option<TickOrders> {
        self.bridge.poll_bridge();
        self.inbound_ticks.pop_front()
    }

    fn report_sync_hash(&mut self, tick: u64, hash: u64) {
        self.bridge.report_ic_sync_hash(tick, hash);
    }

    fn status(&self) -> NetworkStatus { self.status.clone() }
    fn diagnostics(&self) -> NetworkDiagnostics { self.diagnostics.clone() }
}
```

**What a bridge adapter is responsible for:**

- **Protocol translation** — external wire messages ↔ IC `TimestampedOrder` / `TickOrders`
- **Timing model adaptation** — map external timing/order semantics into IC tick/sub-tick expectations (or degrade gracefully with explicit fairness limits)
- **Capability negotiation** — detect unsupported features/order types and reject, stub, or map them explicitly
- **Authority/trust policy** — declare whether the bridge is relay-authoritative, P2P-trust, or observer-only
- **Diagnostics** — expose compatibility state, dropped/translated orders, and fidelity warnings via `NetworkDiagnostics`

**What a bridge adapter is NOT responsible for:**

- **Making simulations identical** across engines (D011 still applies)
- **Mutating `ic-sim` rules** to emulate foreign bugs/quirks in core engine code
- **Bypassing ranked trust rules** (bridge modes are unranked by default unless a separate explicit decision (`Dxxx` / `Pxxx`) certifies one)
- **Hiding incompatibilities** — unsupported semantics must be visible to users/operators

**Practical expectation:** Early bridge modes are most likely to ship (if ever) as **observer/replay/discovery** integrations first, then limited casual play experiments, with strict capability constraints. Competitive/ranked bridge play would require a separate explicit decision and a much stronger certification story.

**Sub-tick ordering in P2P:** Without a neutral relay, there is no central time authority. Instead, each client sorts orders deterministically by `(sub_tick_time, player_id)` — the player ID tiebreaker ensures all clients produce the same canonical order even with identical timestamps. This is slightly less fair than relay ordering (clock skew between peers can bias who "clicked first"), but acceptable for LAN/small-group play where latencies are low. The relay-based modes (embedded or dedicated) eliminate this issue entirely with neutral time authority, and additionally provide lag-switch protection, NAT traversal, and signed replays.

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

### Background Replay Writer

During live games, the replay file is written by a **background writer** using a lock-free queue — the sim thread never blocks on I/O. This prevents disk write latency from causing frame hitches (a problem observed in 0 A.D.'s synchronous replay recording — see `research/0ad-warzone2100-netcode-analysis.md`):

```rust
/// Non-blocking replay recorder. The sim thread pushes tick frames
/// into a lock-free queue; a background thread drains and writes.
pub struct BackgroundReplayWriter {
    queue: crossbeam::channel::Sender<ReplayTickFrame>,
    handle: std::thread::JoinHandle<()>,
}

impl BackgroundReplayWriter {
    /// Called from the sim thread after each tick. Never blocks.
    pub fn record_tick(&self, frame: ReplayTickFrame) {
        // crossbeam bounded channel — if the writer falls behind,
        // oldest frames are still in memory (not dropped). The buffer
        // is sized for ~10 seconds of ticks (300 frames at 30 tps).
        let _ = self.queue.try_send(frame);
    }
}
```

> **Security (V45):** `try_send` silently drops frames when the channel is full — contradicting the code comment. Lost frames break the Ed25519 signature chain (V4). Mitigations: track frame loss count in replay header, use `send_timeout(frame, 5ms)` instead of `try_send`, mark replays with lost frames as `incomplete` (playable but not ranked-verifiable), handle signature chain gaps explicitly. See `06-SECURITY.md` § Vulnerability 45.

The background thread writes frames incrementally — the `.icrep` file is always valid (see `05-FORMATS.md` § Replay File Format). If the game crashes, the replay up to the last flushed frame is recoverable. On game end, the writer flushes remaining frames, writes the final header (total ticks, final state hash), and closes the file.

## Deferred Optional Architectures

The `NetworkModel` trait also keeps the door open for fundamentally different networking approaches as deferred optional work. These are NOT the same netcode — they are genuinely different architectures with different trade-offs. They are outside `M4` and `M7` core lockstep productization scope unless promoted by a separate explicit decision and execution-overlay placement.

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

### Netcode Parameter Philosophy (D060)

Netcode parameters are **not** like graphics settings. Graphics preferences are subjective; netcode parameters have objectively correct values — or correct adaptive algorithms. A cross-game survey (C&C Generals, StarCraft/BW, Spring Engine, 0 A.D., OpenTTD, Factorio, CS2, AoE II:DE, original Red Alert) confirms that games which expose fewer netcode controls and invest in automatic adaptation have fewer player complaints and better perceived netcode quality.

IC follows a three-tier exposure model:

| Tier                         | Player-Facing Examples                                                                                                                     | Exposure                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Tier 1: Lobby GUI**        | Game speed (Slowest–Fastest)                                                                                                               | One setting. The only parameter where player preference is legitimate.      |
| **Tier 2: Console**          | `net.sync_frequency`, `net.show_diagnostics`, `net.desync_debug_level`, `net.simulate_latency/loss/jitter`                                 | Power users only. Flagged `DEV_ONLY` or `SERVER` in the cvar system (D058). |
| **Tier 3: Engine constants** | Tick rate (30 tps), sub-tick ordering, adaptive run-ahead, timing feedback, stall policy (never stall), anti-lag-switch, visual prediction | Fixed. These are correct engineering solutions, not preferences.            |

**Sub-tick ordering (D008) is always-on.** Cost: ~4 bytes per order + one sort of typically ≤5 items per tick. The mechanism is automatic, but the outcome is player-facing — who wins the engineer race, who grabs the contested crate, whose attack resolves first. These moments define close games. Making it optional would require two sim code paths, a deterministic fallback that's inherently unfair (player ID tiebreak), and a lobby setting nobody understands.

**Adaptive run-ahead is always-on.** Generals proved this over 20 years. Manual latency settings (StarCraft BW's Low/High/Extra High) were necessary only because BW lacked adaptive run-ahead. IC's adaptive system replaces the manual knob with a better automatic one.

**Visual prediction is always-on.** Factorio originally offered a "latency hiding" toggle. They removed it in 0.14.0 because always-on was always better — there was no situation where the player benefited from seeing raw lockstep delay.

Full rationale, cross-game evidence table, and alternatives considered: see `decisions/09b-networking.md` § D060.

## Connection Establishment

Connection method is a concern *below* the `NetworkModel`. By the time a `NetworkModel` is constructed, transport is already established. The discovery/connection flow:

```
Discovery (tracking server / join code / direct IP / QR)
  → Signaling (pluggable — see below)
    → Transport::connect() (UdpTransport, WebSocketTransport, etc.)
      → NetworkModel constructed over Transport (LockstepNetwork<T> or RelayLockstepNetwork<T>)
        → Game loop runs — sim doesn't know or care how connection happened
```

The transport layer is abstracted behind a `Transport` trait (D054). Each `Transport` instance represents a single bidirectional channel (point-to-point). `NetworkModel` implementations are generic over `Transport` — relay mode uses one `Transport` to the relay, P2P mode uses one `Transport` per peer. This enables different physical transports per platform — raw UDP (connected socket) on desktop, WebSocket in the browser, `MemoryTransport` in tests — without conditional branches in `NetworkModel`. The protocol layer always runs its own reliability; on reliable transports the retransmit logic becomes a no-op. See `decisions/09d-gameplay.md` § D054 for the full trait definition and implementation inventory.

### Commit-Reveal Game Seed

The initial RNG seed that determines all stochastic outcomes (combat rolls, scatter patterns, AI decisions) must not be controllable by any single player. A host who chooses the seed can pre-compute favorable outcomes (e.g., "with seed 0xDEAD, my first tank shot always crits"). This is a known exploit in P2P games and was identified in Hypersomnia's security analysis (see `research/veloren-hypersomnia-openbw-ddnet-netcode-analysis.md`).

IC uses a **commit-reveal protocol** to generate the game seed collaboratively:

```rust
/// Phase 1: Each player generates a random contribution and commits its hash.
/// All commitments must arrive before any reveal — prevents last-player advantage.
pub struct SeedCommitment {
    pub player: PlayerId,
    pub commitment: [u8; 32],  // SHA-256(player_seed_contribution || nonce)
}

/// Phase 2: After all commitments are collected, each player reveals their contribution.
/// The relay (or all peers in P2P) verify reveal matches commitment.
pub struct SeedReveal {
    pub player: PlayerId,
    pub contribution: [u8; 32],  // The actual random bytes
    pub nonce: [u8; 16],         // Nonce used in commitment
}

/// Final seed = XOR of all player contributions.
/// No single player can control the outcome — they can only influence
/// their own contribution, and the XOR of all contributions is
/// uniform-random as long as at least one player is honest.
fn compute_game_seed(reveals: &[SeedReveal]) -> u64 {
    let mut combined = [0u8; 32];
    for reveal in reveals {
        for (i, byte) in reveal.contribution.iter().enumerate() {
            combined[i] ^= byte;
        }
    }
    u64::from_le_bytes(combined[..8].try_into().unwrap())
}
```

**Relay mode:** The relay server collects all commitments, then broadcasts them, then collects all reveals, then broadcasts the final seed. A player who fails to reveal within the timeout is kicked (they were trying to abort after seeing others' commitments).

**P2P mode:** All peers exchange commitments via the mesh, then reveals. The protocol is the same — just decentralized.

**Single-player:** Skip commit-reveal. The client generates the seed directly.

### Transport Encryption

All multiplayer connections are encrypted. The encryption layer sits between `Transport` and `NetworkModel` — transparent to both:

- **Key exchange:** Curve25519 (X25519) for ephemeral key agreement. Each connection generates a fresh keypair; the shared secret is never reused across sessions.
- **Symmetric encryption:** AES-256-GCM for authenticated encryption of all payload data. The GCM authentication tag detects tampering; no separate integrity check needed.
- **Sequence binding:** The AES-GCM nonce incorporates the packet sequence number, binding encryption to the reliability layer's sequence space. Replay attacks (resending a captured packet) fail because the nonce won't match.
- **Identity binding:** After key exchange, the connection is upgraded by signing the handshake transcript with the player's Ed25519 identity key (D052). This binds the encrypted channel to a verified identity — a MITM cannot complete the handshake without the player's private key.

```rust
/// Transport encryption parameters. Negotiated during connection
/// establishment, applied to all subsequent packets.
pub struct TransportCrypto {
    /// AES-256-GCM cipher state (derived from X25519 shared secret).
    cipher: Aes256Gcm,
    /// Nonce counter — incremented per packet, combined with session
    /// salt to produce the GCM nonce. Overflow (at 2^32 packets ≈
    /// 4 billion) triggers rekeying.
    send_nonce: u32,
    recv_nonce: u32,
    /// Session salt — derived from handshake, ensures nonce uniqueness
    /// even if sequence numbers are reused across sessions.
    session_salt: [u8; 8],
}
```

This follows the same encryption model as Valve's GameNetworkingSockets (AES-GCM-256 + Curve25519) and DTLS 1.3 (key exchange + authenticated encryption + sequence binding). See `research/valve-github-analysis.md` § 1.5 and `06-SECURITY.md` for the full threat model. The `MemoryTransport` (testing) and `LocalNetwork` (single-player) skip encryption — there's no network to protect.

### Pluggable Signaling (from Valve GNS)

**Signaling** is the mechanism by which two peers exchange connection metadata (IP addresses, relay tokens, ICE candidates) before the transport connection is established. Valve's GNS abstracts signaling behind `ISteamNetworkingConnectionSignaling` — a trait that decouples the connection establishment mechanism from the transport.

IC adopts this pattern. Signaling is abstracted behind a trait in `ic-net`:

```rust
/// Abstraction for connection signaling — how peers exchange
/// connection metadata before Transport is established.
///
/// Different deployment contexts use different signaling:
/// - Relay mode: relay server brokers the introduction
/// - P2P with rendezvous: lightweight rendezvous server
/// - P2P direct: out-of-band (IP shared via join code, QR, etc.)
/// - Browser (WASM): WebRTC signaling server
///
/// The trait is async — signaling involves network I/O and may take
/// multiple round-trips (ICE candidate gathering, STUN/TURN).
pub trait Signaling: Send + Sync {
    /// Send a signaling message to the target peer.
    fn send_signal(&mut self, peer: &PeerId, msg: &SignalingMessage) -> Result<(), SignalingError>;
    /// Receive the next incoming signaling message, if any.
    fn recv_signal(&mut self) -> Result<Option<(PeerId, SignalingMessage)>, SignalingError>;
}

/// Signaling messages exchanged during connection establishment.
pub enum SignalingMessage {
    /// Offer to connect — includes transport capabilities, public key.
    Offer { transport_info: TransportInfo, identity_key: [u8; 32] },
    /// Answer to an offer — includes selected transport, public key.
    Answer { transport_info: TransportInfo, identity_key: [u8; 32] },
    /// ICE candidate for NAT traversal (P2P only).
    IceCandidate { candidate: String },
    /// Connection rejected (lobby full, banned, etc.).
    Reject { reason: String },
}
```

**Default implementations:**

| Implementation        | Mechanism                      | When Used                   | Phase  |
| --------------------- | ------------------------------ | --------------------------- | ------ |
| `RelaySignaling`      | Relay server brokers           | Relay multiplayer (default) | 5      |
| `RendezvousSignaling` | Lightweight rendezvous + punch | Join code / QR P2P          | 5      |
| `DirectSignaling`     | Out-of-band (no server)        | Direct IP, LAN              | 5      |
| `WebRtcSignaling`     | WebRTC signaling server        | Browser WASM P2P            | Future |
| `MemorySignaling`     | In-process channels            | Tests                       | 2      |

This decoupling means adding a new connection method (e.g., Steam P2P via Steamworks, Epic Online Services relay) requires only implementing `Signaling`, not modifying `NetworkModel` or `Transport`. The GNS precedent validates this — GNS users can plug in custom signaling for non-Steam platforms while keeping the same transport and reliability layer.

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
/// Tracking server API — implemented by ic-net, consumed by ic-ui
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
    pub required_mods: Vec<ModDependency>, // mods needed to join (D030: auto-download)
}

/// Mod dependency for auto-download on lobby join (D030).
/// When a player joins a lobby, the client checks `required_mods` against
/// local cache. Missing mods are fetched from the Workshop automatically
/// (CS:GO-style). See `04-MODDING.md` § "Auto-Download on Lobby Join".
pub struct ModDependency {
    pub id: String,               // Workshop resource ID: "namespace/name"
    pub version: VersionReq,      // semver range
    pub checksum: Sha256Hash,     // integrity verification
    pub size_bytes: u64,          // for progress UI and consent prompt
}
```

### Official Tracking Server

We run one. Games appear here by default. Free, community-operated, no account required to browse (account required to host, to prevent spam).

### Custom Tracking Servers

Communities, clans, and tournament organizers run their own. The client supports a list of tracking server URLs in settings. This is the Quake/Source master server model — decentralized, resilient.

```toml
# settings.toml
[[tracking_servers]]
url = "https://track.ironcurtain.gg"     # official

[[tracking_servers]]
url = "https://rts.myclan.com/track"     # clan server

[[tracking_servers]]
url = "https://openra.net/master"        # OpenRA shared browser (Level 0 compat)

[[tracking_servers]]
url = "https://cncnet.org/master"        # CnCNet shared browser (Level 0 compat)
```

**Tracking server trust model (V28):** All tracking server URLs must use HTTPS — plain HTTP is rejected. The game browser shows trust indicators: bundled sources (official, OpenRA, CnCNet) display a verified badge; user-added sources display "Community" or "Unverified." Games listed from unverified sources connecting via unknown relays show "Unknown relay — first connection." When connecting to any listing, the client performs a full protocol handshake (version check, encryption, identity verification) before revealing user data. Maximum 10 configured tracking servers to limit social engineering surface.

### Shared Browser with OpenRA & CnCNet

Implementing community master server protocols means Iron Curtain games can appear in OpenRA's and CnCNet's game browsers (and vice versa), tagged by engine. Players see the full C&C community in one place regardless of which client they use. This is the Level 0 cross-engine compatibility from `07-CROSS-ENGINE.md`.

CnCNet is the community-run multiplayer platform for the original C&C game executables (RA1, TD, TS, RA2, YR). It provides tunnel servers (UDP relay for NAT traversal), a master server / lobby, a client/launcher, ladder systems, and map distribution. CnCNet is where the classic C&C competitive community lives — integration at the discovery layer ensures IC doesn't fragment the existing community but instead makes it larger.

**Integration scope:** Shared game browser only. CnCNet's tunnel servers are plain UDP proxies without IC's time authority, signed match results, behavioral analysis, or desync diagnosis — so IC games use IC relay servers for actual gameplay. Rankings and ladders are also separate (different game balance, different anti-cheat, different match certification). The bridge is purely for community discovery and visibility.

### Tracking Server Implementation

The server itself is straightforward — a REST or WebSocket API backed by an in-memory store with TTL expiry. No database needed — listings are ephemeral and expire if the host stops sending heartbeats.

> **Note:** The tracking server is the only backend service with truly ephemeral data. The relay, workshop, and matchmaking servers all persist data beyond process lifetime using embedded SQLite (D034). See `decisions/09e-community.md` § D034 for the full storage model.

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

2. **Stateless or self-contained.** The tracking server holds no critical state — listings live in memory with TTL expiry (for multi-instance: shared via Redis). The relay, workshop, and matchmaking servers persist data (match results, resource metadata, ratings) to an embedded SQLite file (D034). Killing a process loses only in-flight game sessions — persistent records survive in the `.db` file. Relay servers hold per-game session state in memory but games are short-lived; if a relay dies, recovery is **mode-specific**: casual/custom games may offer unranked continuation or fallback if supported, while ranked follows the degraded-certification / void policy (`06-SECURITY.md` V32) rather than silently switching authority paths.

3. **Community self-hosting is a first-class use case.** A clan, tournament organizer, or hobbyist runs the same binary on their own machine. No cloud account needed. No Docker needed. The binary reads a config file or env vars and starts listening. For those who prefer containers, `docker-compose up` works too. For production scale, Helm charts are available.

4. **Five minutes from download to running server.** (Lesson from ArmA/OFP: the communities that survive decades are the ones where anyone can host a server.) The setup flow is: download one binary → run it → players connect. No registration, no account creation, no mandatory configuration beyond a port number. The binary ships with sane defaults — a tracking server with in-memory storage and 30-second heartbeat TTL, a relay server with 100-game capacity and 5-second tick timeout. Advanced configuration (Redis backing, TLS, OTEL, regions) is available but never required for first-time setup. A "Getting Started" guide in the community knowledge base walks through the entire process in under 5 minutes, including port forwarding. For communities that want managed hosting without touching binaries, IC provides one-click deploy templates for common platforms (DigitalOcean, Hetzner, Railway, Fly.io).

5. **Federation, not centralization.** The client aggregates listings from multiple tracking servers simultaneously (already designed — see `tracking_servers` list in settings). If the official server goes down, community servers still work. If all tracking servers go down, direct IP / join codes / QR still work. The architecture degrades gracefully, never fails completely.

6. **Relay servers are regional.** Players connect to the nearest relay for lowest latency. The tracking server listing includes the relay region. Community relays in underserved regions improve the experience for everyone.

7. **Observable by default (D031).** All servers emit structured telemetry via OpenTelemetry (OTEL): metrics (Prometheus-compatible), distributed traces (Jaeger/Zipkin), and structured logs (Loki/stdout). Every server exposes `/healthz`, `/readyz`, and `/metrics` endpoints. Self-hosters get pre-built Grafana dashboards for relay (active games, RTT, desync events), tracking (listings, heartbeats), and workshop (downloads, resolution times). Observability is optional but ships with the infrastructure — `docker-compose.observability.yaml` adds Grafana + Prometheus + Loki with one command.

> **Shared with Workshop infrastructure.** These 7 principles apply identically to the Workshop server (D030/D049). The tracking server, relay server, and Workshop server share deep structural parallels: federation, heartbeats, rate control, connection management, observability, community self-hosting. Several patterns transfer directly between the two systems — three-layer rate control from netcode to Workshop, EWMA peer scoring from Workshop research to relay player quality tracking, and shared infrastructure (unified server binary, federation library, auth/identity layer). See `research/p2p-federated-registry-analysis.md` § "Netcode ↔ Workshop Cross-Pollination" for the full analysis.

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

Both services are lightweight — they forward small order packets, not game state. The relay does zero simulation: each game session costs ~2-10 KB of memory (buffered orders, liveness tokens, filter state) and ~5-20 µs of CPU per tick. This is pure packet routing, not game logic.

| Deployment                     | Cost               | Serves                   | Requires                |
| ------------------------------ | ------------------ | ------------------------ | ----------------------- |
| Embedded relay (listen server) | Free               | 1 game (host plays too)  | Port forwarding         |
| Home PC / spare laptop         | Free (electricity) | ~50 concurrent games     | Port forwarding         |
| Raspberry Pi                   | ~€50 one-time      | ~50 concurrent games     | Port forwarding         |
| Single VPS (community)         | €5-10/month        | ~200 concurrent games    | Nothing special         |
| Small k8s cluster (official)   | €30-50/month       | ~2000 concurrent games   | Kubernetes knowledge    |
| Scaled k8s (launch day spike)  | €100-200/month     | ~10,000 concurrent games | Kubernetes + monitoring |

The relay server is the heavier service (per-game session state, UDP forwarding) but still tiny — each game session is a few KB of buffered orders. A single pod handles ~100 concurrent games easily. The ~50 game estimates for home/Pi deployments are conservative practical guidance, not resource limits — the relay's per-game cost is so low that hardware I/O and network bandwidth are the actual ceilings.

### Backend Language

The tracking server is a standalone Rust binary (not Bevy — no ECS needed). It shares `ic-protocol` for order serialization.

The relay logic lives as a library (`RelayCore`) in `ic-net`. This library is used in two contexts:
- **`relay-server` binary** — standalone headless process that hosts multiple concurrent games. Not Bevy, no ECS. Uses `RelayCore` + async I/O (tokio). This is the "dedicated server" for community hosting, server rooms, and Raspberry Pis.
- **Game client** — `EmbeddedRelayNetwork` wraps `RelayCore` inside the game process. The host player runs the relay and plays simultaneously. Uses Bevy's async task system for I/O. This is the "Host Game" button.

Both share `ic-protocol` for order serialization. Both are developed in Phase 5 alongside the multiplayer client code.

### Failure Modes

| Failure                      | Impact                                                                                                 | Recovery                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Tracking server dies         | Browse requests fail; existing games unaffected                                                        | Restart process; multi-instance setups have other replicas |
| All tracking servers down    | No game browser; existing games unaffected                                                             | Direct IP, join codes, QR still work                       |
| Relay server dies            | Games on that instance disconnect; persistent data (match results, profiles) survives in SQLite (D034) | **Casual/custom:** may offer unranked continuation via reconnect/fallback if supported. **Ranked:** no automatic authority-path switch; use degraded certification / void policy (`06-SECURITY.md` V32). |
| Official infra fully offline | Community tracking/relay servers still operational                                                     | Federation means no single operator is critical            |

## Match Lifecycle

> **Moved to [netcode/match-lifecycle.md](netcode/match-lifecycle.md)** for RAG/context efficiency.
>
> Complete operational flow: lobby creation, loading synchronization, in-game tick processing, pause/resume, disconnect handling, desync detection, replay finalization, and post-game cleanup.

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

Direct P2P lockstep with 2-3 players uses a full mesh (everyone connects to everyone). Beyond that, use the embedded relay (listen server) or a dedicated relay:

```
2-3 players: full mesh (P2P, no relay)
  A ↔ B ↔ C ↔ A

4+ players: embedded relay (listen server — host runs RelayCore and plays)
  B → A ← C        A = host + RelayCore, full sub-tick ordering
      ↑             Host's orders go through same pipeline as everyone's
      D

4+ players: dedicated relay server (recommended for competitive)
  B → R ← C        R = standalone relay binary, trusted infrastructure
      ↑             No player has hosting advantage
      D
```

For 4+ players, a relay (embedded or dedicated) is strongly recommended. Both modes solve:
- Sub-tick ordering with neutral time authority
- Lag-switch protection for all players
- Replay signing

The **dedicated relay** additionally provides:
- NAT traversal for all players (no port forwarding needed)
- No player has any hosting advantage (relay is on neutral infrastructure)
- Required for ranked/competitive play (untrusted host can't manipulate relay)

The **embedded relay** (listen server) additionally provides:
- Zero external infrastructure — "Host Game" button just works
- Full `RelayCore` pipeline (no host advantage in order processing — host's orders go through sub-tick sorting like everyone else's)
- Port forwarding required (same as any self-hosted server)

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
