# 03 — Network Architecture

## Core Design: Pluggable Network Model

The network layer is fully abstracted behind a trait. The simulation and game loop never know which network model is running.

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

### Planned Implementations

| Implementation            | Use Case                            | Priority |
| ------------------------- | ----------------------------------- | -------- |
| `LocalNetwork`            | Single player, tests                | Phase 2  |
| `ReplayPlayback`          | Watching replays                    | Phase 2  |
| `LockstepNetwork`         | OpenRA-style multiplayer            | Phase 5  |
| `RelayLockstepNetwork`    | Relay server with time authority    | Phase 5  |
| `FogAuthoritativeNetwork` | Anti-maphack (server runs sim)      | Future   |
| `RollbackNetwork`         | GGPO-style (requires sim snapshots) | Future   |
| `ProtocolAdapter<N>`      | Cross-engine compatibility wrapper  | Future   |

### Benefits of Trait Abstraction

- Sim never touches networking concerns
- Full testability (run entire sim with `LocalNetwork`)
- Community can contribute better netcode without understanding game logic
- Players could choose network model in lobby (if both agree)
- Cross-engine adapters wrap existing models transparently

## Shared Protocol Types

Defined in `ra-protocol` crate — the ONLY shared dependency between sim and net:

```rust
#[derive(Clone, Serialize, Deserialize, Hash)]
pub enum PlayerOrder {
    Move { unit_ids: Vec<UnitId>, target: CellPos },
    Attack { unit_ids: Vec<UnitId>, target: Target },
    Build { structure: StructureType, position: CellPos },
    SetRallyPoint { building: BuildingId, position: CellPos },
    Sell { building: BuildingId },
    // ... every possible player action
}

/// Sub-tick timestamp on every order (CS2-inspired)
#[derive(Clone, Serialize, Deserialize)]
pub struct TimestampedOrder {
    pub player: PlayerId,
    pub order: PlayerOrder,
    pub sub_tick_time: f64,  // fractional time within the tick window
}

pub struct TickOrders {
    pub tick: u64,
    pub orders: Vec<TimestampedOrder>,
}

impl TickOrders {
    /// CS2-style: process in chronological order within the tick
    pub fn chronological(&self) -> impl Iterator<Item = &TimestampedOrder> {
        let mut sorted = self.orders.clone();
        sorted.sort_by(|a, b| a.sub_tick_time.partial_cmp(&b.sub_tick_time).unwrap());
        sorted.into_iter()
    }
}
```

## CS2 Sub-Tick: What We Borrow

### What CS2 Does

Counter-Strike 2 introduced "sub-tick" architecture: instead of processing all actions at discrete tick boundaries, the client timestamps every input with sub-tick precision. The server collects inputs from all clients and processes them in chronological order within each tick window. The server still ticks at 64Hz, but events are ordered by their actual timestamps.

### What's Relevant for RTS

The core idea — **timestamped orders processed in chronological order within a tick** — produces fairer results for edge cases:

- Two players grabbing the same crate → the one who clicked first gets it
- Engineer vs engineer racing to capture a building → chronological winner
- Simultaneous attack orders → processed in actual order, not arrival order

### What's NOT Relevant

CS2 is client-server authoritative with prediction and interpolation. An RTS with hundreds of units can't afford server-authoritative simulation — the bandwidth would be enormous. We stay with deterministic lockstep (clients run identical sims), so CS2's prediction/reconciliation doesn't directly apply.

## Network Model Details

### Model 1: Lockstep with Input Delay (starting model)

```
Local input at tick 50 → scheduled for tick 53 (3-tick delay)
Remote input has 3 ticks to arrive before we need it
Delay dynamically adjusted based on connection quality
```

This is what OpenRA and most RTS games use. The "lag" players feel is intentional input delay, not network stalling.

### Model 2: Relay Server with Time Authority (recommended default)

```
┌────────┐         ┌──────────────┐         ┌────────┐
│Player A│────────▶│ Relay Server │◀────────│Player B│
│        │◀────────│  (timestamped│────────▶│        │
└────────┘         │   ordering)  │         └────────┘
                   └──────────────┘
```

The relay server does NOT run the sim. It:
1. Receives timestamped orders from all players
2. Orders them chronologically (CS2 insight)
3. Broadcasts canonical tick order to all clients
4. Detects lag switches and cheating attempts
5. Handles NAT traversal (no port forwarding needed)

**Anti-lag-switch mechanism:**

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

### Model 3: Fog-Authoritative Server (anti-maphack)

Server runs full sim, sends each client only entities they should see. Breaks pure lockstep (clients run partial sims), requires server compute per game. See `06-SECURITY.md` for details.

### Model 4: Rollback / GGPO-style (experimental future)

Requires snapshottable sim (already designed). Client predicts with local input, rolls back on misprediction. Expensive for RTS (re-simulating hundreds of entities), but feasible with Rust's performance. See GGPO documentation for reference implementation.

## Input Responsiveness: Why Our Model Feels Faster

Every lockstep RTS has inherent input delay — the game must wait for all players' orders before advancing. This is **architectural**, not a bug. But how much delay, and who pays for it, varies dramatically.

### OpenRA's Stalling Model

OpenRA uses classic lockstep where the **entire game freezes** until the slowest client submits orders:

```
Tick 50: waiting for Player A's orders... ✓ (10ms)
         waiting for Player B's orders... ✓ (15ms)
         waiting for Player C's orders... ⏳ (280ms — bad WiFi)
         → ALL players frozen for 280ms. Everyone suffers.
```

Additionally:
- Orders are batched every `NetFrameInterval` frames (not every tick), adding batching delay
- The server adds `OrderLatency` frames to every order (typically 3 ticks into the future)
- `TickScale` dynamically slows the game to match the worst connection
- Even in **single player**, `EchoConnection` projects orders 1 frame forward
- C# GC pauses (5-50ms) add unpredictable jank on top of the architectural delay

The perceived input lag when clicking units in OpenRA is ~100-200ms — a combination of intentional lockstep delay, order batching, and runtime overhead.

### Our Relay Model: No Stalling

The relay server owns the clock. It broadcasts tick orders on a fixed deadline — missed orders are replaced with `PlayerOrder::Idle`:

```
Tick 50: relay deadline = 80ms
         Player A orders arrive at 10ms  → ✓ included
         Player B orders arrive at 15ms  → ✓ included  
         Player C orders arrive at 280ms → ✗ missed deadline → Idle
         → Relay broadcasts at 80ms. No stall. Player C's units idle.
```

Honest players on good connections always get responsive gameplay. A lagging player hurts only themselves.

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

This is purely cosmetic — the sim doesn't advance until the confirmed order arrives. But it eliminates the **perceived** lag that makes OpenRA feel sluggish. The selection ring snaps, the unit rotates, the acknowledgment voice plays — all before the network round-trip completes.

### Input Latency Comparison

| Factor                      | OpenRA                              | Iron Curtain (Relay)                  | Improvement                            |
| --------------------------- | ----------------------------------- | ------------------------------------- | -------------------------------------- |
| Waiting for slowest client  | Yes — everyone freezes              | No — relay drops late orders          | Eliminates worst-case stalls entirely  |
| Order batching interval     | Every N frames (`NetFrameInterval`) | Every tick                            | No batching delay                      |
| Order scheduling delay      | +3 ticks (`OrderLatency`)           | +1 tick (next relay broadcast)        | ~2 ticks faster                        |
| Tick processing time        | 30-60ms (limits tick rate)          | ~8ms (allows higher tick rate)        | 4-8x faster per tick                   |
| Achievable tick rate        | ~15 tps                             | 30+ tps                               | 2x shorter lockstep window             |
| GC pauses during processing | 5-50ms random jank                  | 0ms                                   | Eliminates unpredictable hitches       |
| Visual feedback on click    | Waits for order confirmation        | Immediate (cosmetic prediction)       | Perceived lag drops to near-zero       |
| Single-player order delay   | 1 projected frame (~66ms at 15 tps) | 0 frames (`LocalNetwork` = next tick) | Zero delay                             |
| Worst connection impact     | Freezes all players                 | Only affects the lagging player       | Architectural fairness                 |
| Future: rollback prediction | Not possible (no snapshots)         | Possible (D010 enables GGPO)          | Could eliminate all perceived MP delay |

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

## Desync Detection & Debugging

Every `NetworkModel` must accept `report_sync_hash()`. The system works:

1. Each client hashes their sim state after each tick
2. Hashes are compared (by relay server, or exchanged P2P)
3. On mismatch → desync detected at specific tick
4. Because sim is snapshottable, dump full state and diff to pinpoint exact divergence

This is a **killer feature OpenRA lacks**. OpenRA desyncs are common and nearly impossible to debug. Our architecture makes them diagnosable.

## OrderCodec: Wire Format Abstraction

For future cross-engine play and protocol versioning:

```rust
pub trait OrderCodec: Send + Sync {
    fn encode(&self, order: &TimestampedOrder) -> Result<Vec<u8>>;
    fn decode(&self, bytes: &[u8]) -> Result<TimestampedOrder>;
    fn protocol_id(&self) -> ProtocolId;
}

/// Native format — fast, compact, versioned
pub struct NativeCodec { version: u32 }

/// Translates to/from OpenRA's wire format
pub struct OpenRACodec {
    order_map: OrderTranslationTable,
    coord_transform: CoordTransform,
}
```

See `07-CROSS-ENGINE.md` for full cross-engine compatibility design.

## Replay System

Replays are a natural byproduct of the architecture:

```
Replay file = initial state + sequence of TickOrders
Playback = feed TickOrders through Simulation via ReplayPlayback NetworkModel
```

Replays are signed by the relay server for tamper-proofing (see `06-SECURITY.md`).

## Connection Establishment

Connection method is a concern *below* `NetworkModel`. By the time a `NetworkModel` is constructed, transport is already established. The discovery/connection flow:

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

When direct P2P fails (symmetric NAT, corporate firewalls), fall back to relay. The relay server is already designed for this (Model 2). Connection through relay also provides lag-switch protection and sub-tick ordering as a bonus.

### Via Tracking Server

Player browses public game listings, picks one, client connects directly to the host (or relay). See Tracking Servers section below.

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

The server itself is straightforward — a REST or WebSocket API backed by an in-memory store with TTL expiry. No database needed. Listings expire if the host stops sending heartbeats.

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
                          │ Relay  │ │ Relay  │ │ Relay  │   ← stateless per-game
                          │  Pod   │ │  Pod   │ │  Pod   │      sessions (sticky)
                          └────────┘ └────────┘ └────────┘
```

### Design Principles

1. **Just a binary.** Each server is a single Rust executable with zero mandatory dependencies. Run it directly (`./tracking-server` or `./relay-server`), as a systemd service, in Docker, or in Kubernetes — whatever suits the operator. No database, no runtime, no JVM. Download, configure, run.

2. **Stateless processes.** Each tracking server instance holds no critical state — for a single-instance deployment, listings live in memory with TTL expiry. For multi-instance deployments, listings are shared via Redis (or equivalent KV store). Killing the process loses nothing permanent. Relay servers hold per-game session state but games are short-lived; if a relay dies, the game reconnects or falls back to P2P.

3. **Community self-hosting is a first-class use case.** A clan, tournament organizer, or hobbyist runs the same binary on their own machine. No cloud account needed. No Docker needed. The binary reads a config file or env vars and starts listening. For those who prefer containers, `docker-compose up` works too. For production scale, Helm charts are available.

4. **Federation, not centralization.** The client aggregates listings from multiple tracking servers simultaneously (already designed — see `tracking_servers` list in settings). If the official server goes down, community servers still work. If all tracking servers go down, direct IP / join codes / QR still work. The architecture degrades gracefully, never fails completely.

5. **Relay servers are regional.** Players connect to the nearest relay for lowest latency. The tracking server listing includes the relay region. Community relays in underserved regions improve the experience for everyone.

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
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9091/healthz"]

  redis:
    image: redis:7-alpine       # only needed for multi-instance tracking
    profiles: ["scaled"]
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

| Failure                      | Impact                                             | Recovery                                                   |
| ---------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| Tracking server dies         | Browse requests fail; existing games unaffected    | Restart process; multi-instance setups have other replicas |
| All tracking servers down    | No game browser; existing games unaffected         | Direct IP, join codes, QR still work                       |
| Relay server dies            | Games on that instance disconnect                  | Clients reconnect to another instance or fall back to P2P  |
| Official infra fully offline | Community tracking/relay servers still operational | Federation means no single operator is critical            |

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
  B → R ← C        R = relay, all benefits of Model 2
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
