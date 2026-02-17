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

Implement community master server protocols (OpenRA and CnCNet). IC games show up in both browsers, tagged by engine. Your-engine players play your-engine players. Same community, different executables. CnCNet is particularly important — it's the home of the classic C&C competitive community (RA1, TD, TS, RA2, YR) and has maintained multiplayer infrastructure for these games for over a decade. Appearing in CnCNet's game browser ensures IC doesn't fragment the existing community.

### Level 1: Replay Compatibility (Phase 5-6)

Decode OpenRA `.orarep` and Remastered Collection replay files via `ra-formats` decoders (`OpenRAReplayDecoder`, `RemasteredReplayDecoder`), translate orders via `ForeignReplayCodec`, feed through IC's sim via `ForeignReplayPlayback` NetworkModel. They'll desync eventually (different sim — D011), but the `DivergenceTracker` monitors and surfaces drift in the UI. Players can watch most of a replay before visible divergence. Optionally convert to `.icrep` for archival and analysis tooling.

This is also the foundation for **automated behavioral regression testing** — running foreign replay corpora headlessly through IC's sim to catch gross behavioral bugs (units walking through walls, harvesters ignoring ore). Not bit-identical verification, but "does this look roughly right?" sanity checks.

Full architecture: see `09-DECISIONS.md` § D056.

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

**Correction bounds (V35):** `is_sane_correction()` validates every entity correction before applying it. Bounds prevent a malicious authority server from teleporting units or granting resources:

```rust
/// Maximum ticks since last sync before bounds stop growing.
/// Prevents unbounded drift acceptance if sync messages stop arriving.
const MAX_TICKS_SINCE_SYNC: u64 = 300; // 10 seconds at 30 tps

/// Maximum resource correction per sync cycle (one harvester full load).
const MAX_CREDIT_DELTA: i64 = 5000;

fn is_sane_correction(correction: &EntityCorrection, ticks_since_sync: u64) -> bool {
    let capped_ticks = ticks_since_sync.min(MAX_TICKS_SINCE_SYNC);
    let max_pos_delta = MAX_UNIT_SPEED * capped_ticks as i64;
    match correction {
        EntityCorrection::Position(delta) => delta.magnitude() <= max_pos_delta,
        EntityCorrection::Credits(delta) => delta.abs() <= MAX_CREDIT_DELTA,
        EntityCorrection::Health(delta) => delta.abs() <= 1000,
        _ => true,
    }
}
```

If >5 consecutive corrections are rejected, the reconciler escalates to `Resync` (full snapshot) or `Autonomous` (disconnect from authority).

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

## Known Behavioral Divergences Registry

IC is not bug-for-bug compatible with OpenRA (Invariant #7, D011). The sim is a clean-sheet implementation that loads the same data but processes it differently. Modders migrating from OpenRA need a structured list of **what behaves differently and why** — not a vague "results may vary" disclaimer.

This registry is maintained as implementation proceeds (Phase 2+). Each entry documents:

| Field               | Description                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| **System**          | Which subsystem diverges (pathfinding, damage, fog, production, etc.)       |
| **OpenRA behavior** | What OpenRA does, with trait/class reference                                |
| **IC behavior**     | What IC does differently                                                    |
| **Rationale**       | Why IC diverges (bug fix, performance, design choice, Remastered alignment) |
| **Mod impact**      | What breaks for modders, and how to adapt                                   |
| **Severity**        | Cosmetic / Minor gameplay / Major gameplay / Balance-affecting              |

**Planned divergence categories** (populated during Phase 2 implementation):

- **Pathfinding:** IC's multi-layer hybrid (JPS + flow field + ORCA-lite) produces different routes than OpenRA's A* with custom heuristics. Group movement patterns differ. Tie-breaking order differs (Rust `HashMap` vs C# `Dictionary` iteration). Units may take different paths to the same destination.
- **Damage model:** Rounding differences in fixed-point arithmetic. IC uses the EA source code's integer math as reference (D009) — OpenRA may round differently in edge cases.
- **Fog of war:** Reveal radius computation, edge-of-vision behavior, shroud update timing may differ between IC's implementation and OpenRA's `Shroud`/`FogVisibility` traits.
- **Production queue:** Build time calculations, queue prioritization, and multi-factory bonus computation may produce slightly different timings.
- **RNG:** Different PRNG algorithm and advancement order. Scatter patterns, miss chances, and random delays will differ even with the same seed.
- **System execution order:** IC's Bevy `FixedUpdate` schedule vs OpenRA's `World.Tick()` ordering. Movement-before-combat vs combat-before-movement produces different outcomes in edge cases.

**Modder-facing output:** The divergence registry is published as part of the modding documentation and queryable via `ic mod check --divergences` (lists known divergences relevant to a mod's used features). The D056 foreign replay import system also surfaces divergences empirically — when an OpenRA replay diverges during IC playback, the `DivergenceTracker` can pinpoint which system caused the drift.

**Relationship to D023 (vocabulary compatibility):** D023 ensures OpenRA trait *names* are accepted as YAML aliases. This registry addresses the harder problem: even when the names match, the *behavior* may differ. A mod that depends on specific OpenRA rounding behavior or pathfinding quirks needs to know.

**Phase:** Registry structure defined in Phase 2 (when sim implementation begins and concrete divergences are discovered). Populated incrementally throughout Phase 2-5. Published alongside `11-OPENRA-FEATURES.md` gap analysis.

## What to Build Now (Phase 0) to Keep the Door Open

Costs almost nothing today, enables everything later:

1. **`OrderCodec` trait** in `ic-protocol` — orders are wire-format-agnostic from day one
2. **`CoordTransform`** in `ra-formats` — coordinate systems are explicit, not implicit
3. **`Simulation::snapshot()`/`restore()`/`apply_correction()`** — sim is correctable from outside
4. **`ProtocolAdapter` slot** in `NetworkModel` trait — network layer is wrappable

None of these add complexity to the sim or game loop. They're just ensuring the right seams exist.

## What NOT to Chase

- Don't try to match OpenRA's sim behavior bit-for-bit
- Don't try to connect to OpenRA game servers for actual gameplay
- Don't compromise your architecture for cross-engine edge cases
- Focus on making switching easy and the experience better, not on co-existing
