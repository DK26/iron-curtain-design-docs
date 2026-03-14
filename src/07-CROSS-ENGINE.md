# 07 — Cross-Engine Compatibility

## The Three Layers of Compatibility

```
Layer 3:  Protocol compatibility    (can they talk?)          → Achievable
Layer 2:  Simulation compatibility  (do they agree on state?) → Hard wall
Layer 1:  Data compatibility        (do they load same rules?)→ Very achievable
```

## Layer 1: Data Compatibility (DO THIS)

Load the same YAML rules, maps, unit definitions, weapon stats as OpenRA.

- `cnc-formats` provides the clean-room MiniYAML parser; `ra-formats` wraps it for IC's asset pipeline and converts to standard YAML
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

Full architecture: see `decisions/09f/D056-replay-import.md`.

### Level 2: Casual Cross-Play with Periodic Resync (Future)

Both engines run their sim. Every N ticks, authoritative checkpoint broadcast. On desync, reconciler snaps entities to authoritative positions. Visible as slight rubber-banding. Acceptable for casual play.

### Level 3: Competitive Cross-Play via Embedded Authority (Future)

Your client embeds a headless OpenRA sim process. OpenRA sim is the authority. Your Rust sim runs ahead for prediction and smooth rendering. Reconciler corrects drift. Like FPS client-side prediction, but for RTS.

### Level 4: True Lockstep Cross-Play (Probably Never)

Requires bit-identical sim. Effectively a port. Architecture doesn't prevent it, but not worth pursuing.

## Where the Cross-Engine Layer Sits (and Where It Does NOT)

Cross-engine compatibility is a **boundary layer around the sim**, not a modification inside it.

### Canonical placement (crate / subsystem ownership)

```
┌──────────────────────────────────────────────────────────────────────┐
│                     IC APP / GAME LOOP (ic-game)                    │
│                                                                      │
│  UI / Lobby / Browser / Replay Viewer (ic-ui)                        │
│    └─ engine tags, divergence UI, warnings, compatibility UX         │
│                                                                      │
│  Network boundary / adapters (ic-net)                                │
│    ├─ CommunityBridge (Level 0 discovery / listing / fetch)          │
│    ├─ ProtocolAdapter + OrderCodec (wire translation)                │
│    ├─ SimReconciler (Level 2+ drift correction policy)               │
│    └─ DivergenceTracker / bridge diagnostics                         │
│                                                                      │
│  Shared wire types (ic-protocol)                                     │
│    └─ TimestampedOrder / PlayerOrder / codec seams                   │
│                                                                      │
│  Data / asset compatibility (cnc-formats + ra-formats)              │
│    └─ MiniYAML, maps, replay decoders, coordinate transforms         │
│                                                                      │
│  Deterministic simulation (ic-sim)                                   │
│    └─ NO cross-engine protocol logic, NO foreign-server awareness    │
│       only public snapshot/restore/apply_correction seams            │
└──────────────────────────────────────────────────────────────────────┘
```

### Hard boundary (non-negotiable)

The cross-engine layer **must not**:
- add foreign-protocol branching inside `ic-sim`
- make `ic-sim` import foreign engine code/protocols
- bypass deterministic order validation in sim (D012)
- silently weaken relay/ranked trust guarantees for native IC matches

The cross-engine layer **may**:
- translate wire formats (`OrderCodec`)
- wrap network models (`ProtocolAdapter`)
- surface drift and compatibility warnings
- apply bounded external corrections via explicit sim APIs in deferred casual/authority modes (`M7+`, unranked by default unless separately certified)

### How it works in practice (by responsibility)

- **Data compatibility (Layer 1)** lives mostly in `ra-formats` + content-loading docs (`D023`, `D024`, `D025`) and is usable without any network interop.
- **Community/discovery compatibility (Level 0)** lives in `CommunityBridge` (`ic-net` / `ic-server`) and `ic-ui` browser/lobby UX.
- **Replay compatibility (Level 1)** uses replay decoders + foreign order codecs + divergence tracking; it is analysis/viewing tooling, not a live trust path.
- **Casual live cross-play (Level 2+)** adds `ProtocolAdapter` and `SimReconciler` around a `NetworkModel`; the sim remains unchanged.

## Cross-Engine Trust & Anti-Cheat Capability Matrix (Important)

Cross-engine compatibility levels are **not equal** from a trust, anti-cheat, or ranked-certification perspective.

| Level                                         | What It Enables                                               | Trust / Anti-Cheat Capability                                                                                                                                                               | Ranked / Certified Match Policy                                                         |
| --------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **0** Shared lobby/browser                    | Community discovery, map/mod browsing, engine-tagged lobbies  | No live gameplay anti-cheat shared across engines. IC anti-cheat applies only to actual IC-hosted matches. External engine listings retain their own trust model.                           | N/A (discovery only)                                                                    |
| **1** Replay compatibility                    | Import/view/analyze foreign replays, divergence tracking      | Useful for analysis and regression testing. Can support anti-cheat review workflows **only** as evidence tooling (integrity depends on replay signatures/source). No live enforcement.      | Not a live match mode                                                                   |
| **2** Casual cross-play + periodic resync     | Playable cross-engine matches with visible drift correction   | Limited anti-cheat posture. `SimReconciler` bounds/caps help reject absurd corrections, but authority trust and correction semantics create new abuse surfaces. Rubber-banding is expected. | **Unranked by default**                                                                 |
| **3** Embedded foreign authority + prediction | Stronger cross-engine fidelity via embedded authority process | Better behavioral integrity than Level 2 if authority is trusted and verified, but adds binary trust, sandboxing, version drift, and attestation complexity. Still a high-risk trust path.  | **Unranked by default** unless separately certified by an explicit `M7+`/`M11` decision |
| **4** True lockstep cross-play                | Bit-identical cross-engine lockstep                           | In theory can approach native lockstep trust if the entire stack is equivalent; in practice this is effectively a port and outside project scope.                                           | Not planned                                                                             |

### Anti-cheat warning (default posture)

- **Native IC ranked play** remains the primary competitive path (IC relay + IC validation + IC certification chain).
- **Cross-engine live play** (Level 2+) is a compatibility feature first, not a competitive integrity feature.
- Any promotion of a cross-engine mode to ranked/certified status requires a **separate explicit decision** (`M7+`/`M11`) covering trust model, authority attestation, replay/signature requirements, and enforcement/appeals.

## Cross-Engine Host Modes (Operator / Product Packaging)

To avoid vague claims like "IC can host cross-engine with anti-cheat," define host modes by **what IC is actually responsible for**.

| Host Mode                                  | Primary Purpose                                                                | Typical Compatibility Level(s)            | What IC Controls                                                                                                 | Anti-Cheat / Trust Value                                                                                                                               | Ranked / Certification                              |
| ------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| **Discovery Gateway**                      | Unified browser/listings/maps/mod metadata across communities/engines          | Level 0                                   | Listing aggregation, engine tagging, join routing, metadata fetch                                                | UX clarity + trust labeling only. No live gameplay enforcement.                                                                                        | Not a gameplay mode                                 |
| **Replay Analysis Authority**              | Import/verify/analyze replays for moderation, regression, and education        | Level 1                                   | Replay decoding, provenance labeling, divergence tracking, evidence tooling                                      | Detection/review support only; no live prevention. Quality depends on replay integrity/source.                                                         | Not a gameplay mode                                 |
| **Casual Interop Relay**                   | Experimental/casual cross-engine live matches                                  | Level 2 (and some Level 3 experiments)    | Session relay, protocol adaptation, timing normalization (where applicable), bounded reconciliation policy, logs | Better than unmanaged interop: can reduce abuse and provide evidence, but cannot claim full IC-certified anti-cheat against foreign clients.           | **Unranked by default**                             |
| **Embedded Authority Bridge Host**         | Higher-fidelity cross-engine experiments with hosted foreign authority process | Level 3                                   | Host process supervision, adapter/reconciler policy, logs, optional attestation scaffolding                      | Potentially stronger trust than Level 2, but still high complexity and not equivalent to native IC certified play without explicit certification work. | **Unranked by default** unless separately certified |
| **Certified IC Relay** *(native baseline)* | Standard IC multiplayer (same engine)                                          | Native IC path (not a cross-engine level) | IC relay authority, IC validation/certification chain, signed replays/results                                    | Full IC anti-cheat/trust posture (as defined by D007/D012/D052 and security policies).                                                                 | Ranked-eligible when queue/mode rules allow         |

### Practical interpretation

- Yes, IC can act as a **better trust gateway** for mixed-engine play (especially logging, relay hygiene, protocol sanity checks, and moderation evidence).
- No, IC cannot automatically grant **native IC anti-cheat guarantees** to foreign clients/sims just by hosting the server.
- The right claim for Level 2/3 is usually: **"more observable and better bounded than unmanaged interop"**, not **"fully secure/certified"**.

## Long-Term Visual-Style Parity Vision (2D vs 3D, Cross-Engine)

One of IC's long-term differentiator goals is to allow players to join the **same battle** from different clients and visual styles, for example:

- one player using a classic 2D presentation (IC classic renderer or a foreign client such as OpenRA in a compatible mode)
- another player using an IC 3D visual skin/presentation mode (Bevy-powered render path)

This is compatible with D011 **if** the project treats it as:
- a **cross-engine / compatibility-layer feature** (not a sim-compatibility promise)
- a **presentation-style parity feature** (2D vs 3D camera/rendering), not different gameplay rules
- a **trust-labeled mode** with explicit fairness and certification boundaries

### Fairness guardrails for 2D-vs-3D mixed-client play

To describe such matches as "fair" in any meaningful sense, IC must preserve gameplay parity:

- same authoritative rules / timing / order semantics for the selected host mode
- no extra hidden information from the 3D client (fog/LOS must match the mode's rules)
- no camera/zoom/rotation affordances that create unintended scouting or situational-awareness advantages beyond the mode's declared limits
- no differences in pathing, hit detection semantics, or command timings due to visual skin choice
- trust labels must still reflect the **actual host mode** (`IC Certified`, `Cross-Engine Experimental`, `Foreign Engine`, etc.), not the visual style alone

### Product/messaging rule (important)

This is a **North Star vision** tied to both:
- cross-engine host/trust work (Level 2+/D011/D052; `M7`)
- switchable render modes / visual infrastructure (D048; `M11`)

Do not market it as a guaranteed ranked/certified feature unless a separate explicit `M7+`/`M11` decision certifies a specific mixed-client trust path.

## IC-Hosted Cross-Engine Relay: Security Architecture

When IC hosts and a foreign client joins IC's relay, IC controls the entire server-side trust pipeline. The core principle: **"join our server"** is always more secure than **"we join theirs"** — IC's relay infrastructure (time authority, order validation, behavioral analysis, replay signing) applies to every connected client regardless of engine. IC-hosted cross-engine play gives IC control over 7 of 10 security properties; IC-joining-foreign gives control over 1.

**Full detail:** [Relay Security Architecture](cross-engine/relay-security.md) — foreign client connection pipeline, trust tier classification (Native/VerifiedForeign/UnverifiedForeign), `ForeignOrderPipeline` with `StructurallyChecked<TimestampedOrder>` return type (relay-level structural validation; full sim validation via D012 happens on each client after broadcast), per-engine behavioral baselines, sim reconciliation under IC authority (`CrossEngineAuthorityMode`), IC-hosts-vs-IC-joins security comparison matrix, and lobby trust UX.

## Cross-Engine Gotchas (Design + UX + Security Warnings)

These are the common traps that make cross-engine features look better on paper than they behave in production.

### 1) Shared browser != shared gameplay trust

If IC shows OpenRA/CnCNet/other-engine lobbies in one browser, players will assume they can join any game with the same fairness guarantees.

**Required UX warning:** engine tags and trust labels must be visible (`IC Certified`, `IC Casual`, `Foreign Engine`, `Cross-Engine Experimental`), especially in lobby/join flows.

### 2) Protocol compatibility does NOT create fair play by itself

`OrderCodec` can make packets understandable. It does not:
- align simulations
- align tick semantics
- align sub-tick fairness
- align validation logic
- align anti-cheat evidence chains

Without an authority/reconciliation plan, protocol interop just produces faster desyncs.

### 3) Reconciler corrections are a security surface

Any Level 2+ design that applies external corrections introduces a new attack vector:
- malicious or compromised authority sends bad corrections
- stale sync inflates acceptable drift
- correction spam creates invisible advantage or denial-of-service

Mitigations (documented across `07-CROSS-ENGINE.md` and `06-SECURITY.md`) include:
- bounded correction sanity checks (`is_sane_correction()`)
- capped `ticks_since_sync`
- escalation to `Resync` / `Autonomous`
- rejection counters and audit logging

### 4) Replay import is great evidence, but evidence quality varies

Foreign replay analysis (Level 1) is excellent for:
- regression testing
- moderation triage
- player education / review

But anti-cheat enforcement quality depends on source integrity:
- signed relay replays > unsigned local captures
- full packet chain > partial replay summary
- version-matched decoder > best-effort legacy parser

UI and moderation tooling should label replay provenance clearly.

### 5) Feature mismatch and semantic mismatch are easy to underestimate

Even when names match ("attack-move", "guard", "deploy"), semantics may differ:
- targeting rules
- queue behavior
- fog/shroud timing
- pathfinding tie-breaks
- transport/load/unload edge cases

Cross-engine lobbies/modes must negotiate a **capability profile** and fail fast (with explanation) when required features do not map cleanly.

### 6) Cross-engine anti-cheat capability is mode-specific, not one global claim

Do not market or document "cross-engine anti-cheat" as a single capability. Instead, describe:
- what is prevented (e.g., absurd state corrections rejected)
- what is only detectable (e.g., replay drift or suspicious timing)
- what is out of scope (e.g., certifying foreign engine client integrity)

### 7) Competitive/ranked pressure will arrive before the trust model is ready

If a cross-engine mode is fun, players will ask for ranked support immediately. The correct default response is:
- keep it unranked/casual
- collect telemetry/replays
- validate stability and trust assumptions
- promote only after a separate certification decision

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
const MAX_TICKS_SINCE_SYNC: u64 = 300; // ~20 seconds at Slower default ~15 tps

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
let game = GameLoop::new(sim, renderer, RelayLockstepNetwork::new(server));

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

Costs almost nothing today, enables deferred cross-engine milestones (`M7` trust/interop host modes and `M11` visual/interop expansion):

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
