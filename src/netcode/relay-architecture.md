# How It Works

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

For small games on LAN, the host's game client embeds `RelayCore` as a listen server (see "The NetworkModel Trait" section below for deployment modes).

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

| Mode                 | Who Runs RelayCore                             | Who Plays                    | Relay Quality                                | QoS Calibration                                     | Use Case                                   |
| -------------------- | ---------------------------------------------- | ---------------------------- | -------------------------------------------- | --------------------------------------------------- | ------------------------------------------ |
| **Dedicated server** | Standalone binary (`relay-server`)             | All clients connect remotely | Full sub-tick, multi-game, neutral authority | Full (relay-driven calibration + bounded auto-tune) | Server rooms, Pi, competitive, ranked      |
| **Listen server**    | Game client embeds it (`EmbeddedRelayNetwork`) | Host plays + others connect  | Full sub-tick, single game, host plays       | Full (same `RelayCore` calibration pipeline)        | Casual, community, LAN, "Host Game" button |

**What "relay-only" means for players.** Every multiplayer game runs through a relay — but the relay can be the host's own machine. A player clicking "Host Game" runs `RelayCore` locally; friends connect via join code, direct IP, or game browser. No external server, no account, no infrastructure. This is the same player experience as direct P2P ("I host, you join, we play") with the addition of neutral timing, anti-cheat, and signed replays that raw P2P cannot provide. The only scenario requiring external infrastructure is ranked/competitive play, where the matchmaking system routes through a dedicated relay on trusted infrastructure so neither player is the host.

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
