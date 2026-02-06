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

| Implementation | Use Case | Priority |
|---------------|----------|----------|
| `LocalNetwork` | Single player, tests | Phase 2 |
| `ReplayPlayback` | Watching replays | Phase 2 |
| `LockstepNetwork` | OpenRA-style multiplayer | Phase 5 |
| `RelayLockstepNetwork` | Relay server with time authority | Phase 5 |
| `FogAuthoritativeNetwork` | Anti-maphack (server runs sim) | Future |
| `RollbackNetwork` | GGPO-style (requires sim snapshots) | Future |
| `ProtocolAdapter<N>` | Cross-engine compatibility wrapper | Future |

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
