# Desync Detection, Recovery & Visual Prediction

### Desync Detection & Debugging

Desyncs are the hardest problem in lockstep netcode. OpenRA has 135+ desync issues in their tracker — they hash game state per frame (via `[VerifySync]` attribute) but their sync report buffer is only 7 frames deep, which often isn't enough to capture the divergence point. Our architecture makes desyncs both **detectable** AND **diagnosable**, drawing on 20+ years of OpenTTD's battle-tested desync debugging infrastructure.

#### Dual-Mode State Hashing

Every tick, each client hashes their sim state. But a full `state_hash()` over the entire ECS world is expensive. We use a two-tier approach (validated by both OpenTTD and 0 A.D.):

- **Primary: Fast sync hash (`SyncHash`, per tick).** Every sync frame, clients submit a `SyncHash(u64)` — the Merkle root truncated to 64 bits (see `type-safety.md`). Because the deterministic RNG state is included in the Merkle tree, any RNG divergence contaminates the root — this catches ~99% of desyncs at near-zero cost per tick. The RNG is advanced by every stochastic sim operation (combat rolls, scatter patterns, AI decisions), so state divergence quickly propagates.
- **Fallback: Full state hash (`StateHash`, periodic).** Every N ticks (configurable — default 30, ~1 second at 30 tps), clients also submit a `StateHash([u8; 32])` — the full SHA-256 Merkle root. This provides collision-resistant verification and doubles as the input for the relay's replay `TickSignature` chain (see `formats/save-replay-formats.md`). The higher cadence versus the old 120-tick default reflects the dual use: desync fallback AND replay signing.

The relay authority compares hashes. On mismatch → desync detected at a specific tick. Because the sim is snapshottable (D010), dump full state and diff to pinpoint exact divergence — entity by entity, component by component.

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

**Selective replay verification** also benefits: a viewer can verify that a specific tick's state is authentic by checking the Merkle path from the tick's root hash to the replay's signature chain — without replaying the entire game. See `formats/save-replay-formats.md` § "Signature Chain" for how this integrates with relay-signed replays.

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

For offline diagnosis, the report is written to `desync_report_{game_seed}_{tick}.json` alongside the snapshot files.

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

For competitive/ranked games, disconnect blame feeds into the match result: the blamed player takes the loss; remaining players can optionally continue or end the match without penalty.

### Reconnection

A disconnected player can rejoin a game in progress. This uses the same snapshottable sim (D010) that enables save games and replays:

1. **Reconnecting client contacts the relay authority** (embedded or dedicated). The relay verifies identity via the session key established at game start.
2. **Relay coordinates state transfer.** The relay does **not** run the sim, so it selects a **snapshot donor** from active clients (typically a healthy, low-latency peer) and requests a transfer at a known tick boundary.
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
