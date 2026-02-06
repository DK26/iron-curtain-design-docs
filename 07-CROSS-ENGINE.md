# 07 — Cross-Engine Compatibility

## The Three Layers of Compatibility

```
Layer 3:  Protocol compatibility    (can they talk?)          → Achievable
Layer 2:  Simulation compatibility  (do they agree on state?) → Hard wall
Layer 1:  Data compatibility        (do they load same rules?)→ Very achievable
```

## Layer 1: Data Compatibility (DO THIS)

Load the same YAML rules, maps, unit definitions, weapon stats as OpenRA.

- `ra-formats` crate parses MiniYAML and converts to standard YAML
- Same maps work on both engines
- Existing mod data migrates automatically
- **Status:** Core part of Phase 0, already planned

## Layer 2: Simulation Compatibility (THE HARD WALL)

For lockstep multiplayer, both engines must produce **bit-identical** results every tick. This is nearly impossible because:

- **Pathfinding order:** Tie resolution depends on internal data structures (C# `Dictionary` vs Rust `HashMap` iteration order)
- **Fixed-point details:** OpenRA uses `WDist`/`WPos`/`WAngle` with 1024 subdivisions. Must match exactly — same rounding, same overflow
- **System execution order:** Does movement resolve before combat? OpenRA's `World.Tick()` has a specific order
- **RNG:** Must use identical algorithm, same seed, advanced same number of times in same order
- **Language-level edge cases:** Integer division rounding, overflow behavior between C# and Rust

**Conclusion:** Achieving bit-identical simulation requires bug-for-bug reimplementation of OpenRA in Rust. That's a port, not our own engine.

## Layer 3: Protocol Compatibility (ACHIEVABLE BUT POINTLESS ALONE)

OpenRA's network protocol is open source — simple TCP, frame-based lockstep, `Order` objects. Could implement it. But protocol compatibility without simulation compatibility → connect, start, desync in seconds.

## Realistic Strategy: Progressive Compatibility Levels

### Level 0: Shared Lobby, Separate Games (Phase 5)

```rust
pub trait CommunityBridge {
    fn publish_game(&self, game: &GameLobby) -> Result<()>;
    fn browse_games(&self) -> Result<Vec<GameListing>>;
    fn fetch_map(&self, hash: &str) -> Result<MapData>;
    fn share_replay(&self, replay: &ReplayData) -> Result<()>;
}
```

Implement OpenRA's master server protocol. Games show up in same browser. Your-engine players play your-engine players. Same community, different executables.

### Level 1: Replay Compatibility (Phase 5-6)

Decode OpenRA replay files via `OpenRACodec`, feed through your sim. They'll desync eventually, but can watch most of a replay before drift. Useful and shippable.

### Level 2: Casual Cross-Play with Periodic Resync (Future)

Both engines run their sim. Every N ticks, authoritative checkpoint broadcast. On desync, reconciler snaps entities to authoritative positions. Visible as slight rubber-banding. Acceptable for casual play.

### Level 3: Competitive Cross-Play via Embedded Authority (Future)

Your client embeds a headless OpenRA sim process. OpenRA sim is the authority. Your Rust sim runs ahead for prediction and smooth rendering. Reconciler corrects drift. Like FPS client-side prediction, but for RTS.

### Level 4: True Lockstep Cross-Play (Probably Never)

Requires bit-identical sim. Effectively a port. Architecture doesn't prevent it, but not worth pursuing.

## Architecture for Compatibility

### OrderCodec: Wire Format Translation

```rust
pub trait OrderCodec: Send + Sync {
    fn encode(&self, order: &TimestampedOrder) -> Result<Vec<u8>>;
    fn decode(&self, bytes: &[u8]) -> Result<TimestampedOrder>;
    fn protocol_id(&self) -> ProtocolId;
}

pub struct OpenRACodec {
    order_map: OrderTranslationTable,
    coord_transform: CoordTransform,
}

impl OrderCodec for OpenRACodec {
    fn encode(&self, order: &TimestampedOrder) -> Result<Vec<u8>> {
        match &order.order {
            PlayerOrder::Move { unit_ids, target } => {
                let wpos = self.coord_transform.to_wpos(target);
                openra_wire::encode_move(unit_ids, wpos)
            }
            // ... other order types
        }
    }
}
```

### SimReconciler: External State Correction

```rust
pub trait SimReconciler: Send + Sync {
    fn check(&mut self, local_tick: u64, local_hash: u64) -> ReconcileAction;
    fn receive_authority_state(&mut self, state: AuthState);
}

pub enum ReconcileAction {
    InSync,                              // Authority agrees
    Correct(Vec<EntityCorrection>),      // Minor drift — patch entities
    Resync(SimSnapshot),                 // Major divergence — reload snapshot
    Autonomous,                          // No authority — local sim is truth
}
```

### ProtocolAdapter: Transparent Network Wrapping

```rust
pub struct ProtocolAdapter<N: NetworkModel> {
    inner: N,
    codec: Box<dyn OrderCodec>,
    reconciler: Option<Box<dyn SimReconciler>>,
}

impl<N: NetworkModel> NetworkModel for ProtocolAdapter<N> {
    // Wraps any NetworkModel to speak a foreign protocol
    // GameLoop has no idea it's talking to OpenRA
}
```

### Usage

```rust
// Native play — nothing special
let game = GameLoop::new(sim, renderer, LockstepNetwork::new(server));

// OpenRA-compatible play — just wrap the network
let adapted = ProtocolAdapter {
    inner: OpenRALockstepNetwork::new(openra_server),
    codec: Box::new(OpenRACodec::new()),
    reconciler: Some(Box::new(OpenRAReconciler::new())),
};
let game = GameLoop::new(sim, renderer, adapted);
// GameLoop is identical. Zero changes.
```

## What to Build Now (Phase 0) to Keep the Door Open

Costs almost nothing today, enables everything later:

1. **`OrderCodec` trait** in `ra-protocol` — orders are wire-format-agnostic from day one
2. **`CoordTransform`** in `ra-formats` — coordinate systems are explicit, not implicit
3. **`Simulation::snapshot()`/`restore()`/`apply_correction()`** — sim is correctable from outside
4. **`ProtocolAdapter` slot** in `NetworkModel` trait — network layer is wrappable

None of these add complexity to the sim or game loop. They're just ensuring the right seams exist.

## What NOT to Chase

- Don't try to match OpenRA's sim behavior bit-for-bit
- Don't try to connect to OpenRA game servers for actual gameplay
- Don't compromise your architecture for cross-engine edge cases
- Focus on making switching easy and the experience better, not on co-existing
