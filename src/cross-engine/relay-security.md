# IC-Hosted Cross-Engine Relay: Security Architecture

When IC hosts and a foreign client (e.g., OpenRA) joins IC's relay, IC controls the entire server-side trust pipeline. This section specifies exactly what IC enforces, what it cannot enforce, and the protocol-level design for foreign client sessions. The core principle: **"join our server"** is always more secure than **"we join theirs"** because IC's relay infrastructure — time authority, order validation, behavioral analysis, replay signing — applies to every connected client regardless of engine.

## Foreign Client Connection Pipeline

```
Foreign Client (OpenRA)                    IC Relay Server
        │                                        │
        ├──── X25519 key exchange ───────────────►│
        │     + Ed25519 identity binding (D052)   │ derive AES-256-GCM session key
        │                                        │ (TransportCrypto — connection-establishment.md)
        ├──── ProtocolIdentification ───────────►│
        │     { engine: "openra", version: "..." }│ select OrderCodec
        │                                        │
        │◄─── CapabilityNegotiation ─────────────┤
        │     { supported_orders: [...],          │
        │       hash_sync: true/false,            │
        │       validation_level: "structural" }  │
        │                                        │
        ├──── JoinLobby ────────────────────────►│ assign trust tier
        │                                        │ notify all players of tier
        │◄─── LobbyState + TrustLabels ─────────┤
```

```rust
/// Per-connection state for a foreign client on IC's relay.
pub struct ForeignClientSession {
    pub player_id: PlayerId,
    pub codec: Box<dyn OrderCodec>,
    pub protocol_id: ProtocolId,
    pub engine_version: String,
    pub trust_tier: CrossEngineTrustTier,
    pub capabilities: CrossEngineCapabilities,
    pub behavior_profile: PlayerBehaviorProfile, // Kaladin — same as native clients
    pub rejection_count: u32,                    // orders that failed validation
    pub last_hash_match: Option<u64>,            // last tick where state hashes agreed
}

/// What the foreign client reported supporting during capability negotiation.
pub struct CrossEngineCapabilities {
    pub known_order_types: Vec<OrderTypeId>,  // order types the codec can translate
    pub supports_hash_sync: bool,             // can produce state hashes for reconciliation
    pub supports_corrections: bool,           // can apply SimReconciler corrections
    pub reported_tick_rate: u32,              // client's expected ticks per second
}
```

## Trust Tier Classification

Every connection is classified into a trust tier that determines what IC can guarantee. The tier is assigned at connection time based on protocol handshake results and is **visible to all players in the lobby**.

```rust
pub enum CrossEngineTrustTier {
    /// Native IC client. Full anti-cheat pipeline.
    Native,
    /// Known foreign engine with version-matched codec. High-fidelity order
    /// translation via codec; relay applies structural validation; full sim
    /// validation (D012) runs on every IC client after broadcast.
    VerifiedForeign { engine: ProtocolId, codec_version: SemVer },
    /// Unknown engine or unrecognized version. IC can only enforce
    /// time authority, rate limiting, and replay logging. Order validation
    /// is structural only (bounds/format) — sim-level validation may
    /// reject valid foreign orders due to semantic mismatch.
    UnverifiedForeign { engine: String },
}
```

| Tier                           | Client Type                                                   | IC Relay Enforces (before broadcast)                                                                                    | IC Clients Enforce (after broadcast)                        | IC Cannot Enforce                                                                    |
| ------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Tier 0: Native**             | IC client                                                     | Time authority, structural order validation, rate limiting, behavioral analysis, replay signing, evidence chain signing | Full sim validation (D012) — all IC clients agree on result | Maphack (lockstep architectural limit)                                               |
| **Tier 1: Verified Foreign**   | Known engine (e.g., OpenRA) with version-matched `OrderCodec` | Time authority, structural order validation (high-fidelity codec), rate limiting, behavioral analysis, replay signing   | Full sim validation (D012) — all IC clients agree on result | Client binary integrity, foreign sim agreement, maphack                              |
| **Tier 2: Unverified Foreign** | Unknown engine or version without matched codec               | Time authority, rate limiting, structural order validation (format/bounds only), replay logging                         | Full sim validation (D012) — all IC clients agree on result | Behavioral baselines (unknown input characteristics), foreign sim agreement, maphack |

**Validation model (one rule):** The relay performs **structural validation only** for all tiers — it does NOT run `ic-sim` (relay-architecture.md). Full sim validation (D012) runs deterministically on every **IC client** after the relay broadcasts the order — foreign clients run their own sim (which may diverge; see IC-as-authority flow below). The tier difference is codec fidelity (Tier 1 has a version-matched codec that translates foreign orders to IC types accurately; Tier 2 can only check format/bounds) and behavioral baseline calibration (Tier 1 has per-engine noise floors; Tier 2 does not). Sim validation scope is identical across all tiers for IC participants.

**Policy:** Ranked/certified matches require all-Tier-0 (native IC only). Cross-engine matches are **unranked by default** but IC's relay still enforces every layer it can — the match is more secure than unmanaged interop even without ranked certification.

## Order Validation for Foreign Clients

Foreign orders pass through the same validation pipeline as native orders, with one additional decoding step:

```
Wire bytes → OrderCodec.decode() → TimestampedOrder → validate_order() → accept/reject
```

```rust
/// Extends the relay's order processing for foreign client connections.
/// The relay performs structural validation only — it does NOT run ic-sim.
/// Full sim validation (D012) happens deterministically on every IC client
/// after the relay forwards the order. Foreign clients run their own sim. The return type reflects this:
/// `StructurallyChecked<T>` means "decoded + structurally valid," NOT
/// "sim-verified." See type-safety.md § Verified Wrapper Policy for
/// the distinction — `Verified<T>` is reserved for post-sim validation.
pub struct ForeignOrderPipeline {
    pub codec: Box<dyn OrderCodec>,
    /// Orders that decode successfully but fail structural validation.
    /// Logged for behavioral scoring — repeated invalid orders indicate
    /// a modified client or exploit attempt.
    pub rejection_log: Vec<(SimTick, PlayerId, PlayerOrder, OrderValidity)>,
}

/// Wrapper indicating relay-level structural checks have passed.
/// Weaker than `Verified<T>` (which requires sim validation via D012).
/// The relay cannot produce `Verified<T>` because it does not run the sim
/// (relay-architecture.md § "does NOT run the sim").
pub struct StructurallyChecked<T> {
    inner: T,
    _private: (),
}

impl<T> StructurallyChecked<T> {
    pub(crate) fn new(inner: T) -> Self {
        Self { inner, _private: () }
    }
    pub fn inner(&self) -> &T { &self.inner }
    pub fn into_inner(self) -> T { self.inner }
}

impl ForeignOrderPipeline {
    /// Process a foreign wire packet into a structurally checked order.
    /// Returns `StructurallyChecked<TimestampedOrder>` — downstream relay
    /// code can trust that decoding and structural validation passed, but
    /// full sim validation (D012) occurs on each client after broadcast.
    pub fn process(&mut self, tick: SimTick, player: PlayerId, raw: &[u8]) -> Result<StructurallyChecked<TimestampedOrder>, ForeignOrderError> {
        // Step 1: Decode via engine-specific codec
        let order = self.codec.decode(raw)
            .map_err(|e| ForeignOrderError::DecodeFailed(e))?;

        // Step 2: Structural validation (field bounds, order type recognized)
        if !order.order.is_structurally_valid() {
            return Err(ForeignOrderError::StructurallyInvalid);
        }

        // Step 3: Relay forwards the structurally valid order to all clients.
        // Full sim validation (D012) runs deterministically on every IC client —
        // all IC clients agree on acceptance/rejection. Foreign clients run
        // their own sim and may diverge (see IC-as-authority flow). The relay's
        // structural check is a first-pass filter that rejects obviously
        // malformed orders before broadcast, reducing wasted bandwidth.

        Ok(StructurallyChecked::new(order))
    }
}
```

**Fail-closed policy:** Orders that don't map to any recognized IC order type are rejected and logged. The relay does not forward unknown order types — this prevents foreign clients from injecting protocol-level payloads that IC can't validate.

**Validation asymmetry — the key insight:** When IC hosts, the relay structurally validates ALL orders from ALL clients before broadcasting, and every IC client then runs full sim validation (D012) deterministically. Foreign clients run their own sim — they receive the same broadcast but may process orders differently, with divergence corrected via the IC-as-authority flow below. A foreign client running a modified engine that skips its own validation still has every order structurally checked by IC's relay and sim-validated by every IC client. This is strictly better than the reverse scenario (IC joining a foreign server) where only IC's own orders are self-validated and the foreign server may not validate at all.

## Behavioral Analysis on Foreign Clients

The Kaladin behavioral analysis pattern (`06-SECURITY.md` § Vulnerability 10) runs identically on foreign client input streams. The relay's `PlayerBehaviorProfile` tracks timing coefficient of variation, reaction time distribution, and APM anomaly patterns regardless of which engine produced the input.

**Per-engine baseline calibration:** Foreign engines may buffer, batch, or pace input differently than IC's client. OpenRA's TCP-based order submission may introduce different jitter patterns than IC's relay protocol. To prevent false positives, the behavioral model accepts a **per-`ProtocolId` noise floor** — a configurable baseline that accounts for engine-specific input characteristics:

```rust
/// Engine-specific behavioral analysis calibration.
pub struct EngineBaselineProfile {
    pub protocol_id: ProtocolId,
    pub expected_timing_jitter_ms: f64,     // additional jitter from engine's input pipeline
    pub min_reaction_time_ms: f64,          // adjusted floor for this engine
    pub apm_variance_tolerance: f64,        // wider tolerance if engine batches orders
}
```

Even for unranked cross-engine matches, behavioral scores are recorded and forwarded to the ranking authority's evidence corpus. This builds the dataset needed for a later explicit certification decision (`M7+`/`M11`) on whether cross-engine matches can ever qualify for ranked play.

## Sim Reconciliation Under IC Authority

When IC hosts a Level 2 cross-engine match, IC's simulation is the **reference authority**. This inverts the trust model compared to IC joining a foreign server:

```rust
/// Determines which sim produces authoritative state in cross-engine play.
pub enum CrossEngineAuthorityMode {
    /// IC relay hosts the match. IC sim produces authoritative state hashes.
    /// Foreign clients reconcile TO IC's state. IC never accepts external corrections.
    IcAuthority {
        /// Ticks between authoritative hash broadcasts.
        hash_interval_ticks: u64,          // default: 30 (~2 seconds at Slower default ~15 tps)
        /// Maximum entity correction magnitude IC will instruct foreign clients to apply.
        max_correction_magnitude: FixedPoint,
    },

    /// Foreign server hosts the match. IC client reconciles to foreign state.
    /// Bounded by is_sane_correction() (see SimReconciler) — but weaker trust posture.
    ForeignAuthority {
        reconciler: Box<dyn SimReconciler>, // existing bounded reconciler
    },
}
```

**IC-as-authority flow:**
1. One IC client's sim is designated the **reference sim** (default). Alternatively, operators can deploy relay-headless mode where `ic-server` runs `ic-sim` headlessly — this is a special deployment similar to FogAuth (see D074 deployment table).
2. Every `hash_interval_ticks`, the reference sim broadcasts a state hash to all clients
3. Foreign clients compare against their own sim state
4. On divergence: the reference sim sends `EntityCorrection` packets to foreign clients (bounded by `max_correction_magnitude`)
5. Foreign clients apply corrections to converge toward IC's state
6. **IC never accepts inbound corrections** — `SimReconciler` is not instantiated on the authority side

**Why this matters:** When IC joins an OpenRA server, IC must trust the foreign server's corrections (bounded by `is_sane_correction()`, but still accepting external state). When OpenRA joins IC, the trust arrow points outward — IC dictates state, never receives corrections. A compromised foreign client can refuse corrections (causing visible desync and eventual disconnection) but cannot inject false state into IC's sim.

## Security Comparison: IC Hosts vs. IC Joins

| Security Property       | IC Hosts (foreign joins IC)                                                                                                                                                                                                | Foreign Hosts (IC joins foreign)                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Time authority**      | IC relay — trusted, enforced                                                                                                                                                                                               | Foreign server — untrusted                                |
| **Order validation**    | Relay structurally validates ALL clients' orders; full sim validation (D012) on every IC client after broadcast                                                                                                            | Only IC validates its own orders locally                  |
| **Rate limiting**       | IC's 3-layer system on all clients                                                                                                                                                                                         | Foreign server's policy (unknown, possibly none)          |
| **Behavioral analysis** | Kaladin on ALL client input streams                                                                                                                                                                                        | Only on IC client's own input                             |
| **Replay signing**      | IC relay signs — certified evidence chain                                                                                                                                                                                  | Foreign replay format, likely unsigned                    |
| **Sim authority**       | IC sim is reference — corrections flow outward                                                                                                                                                                             | Foreign sim is reference — IC accepts bounded corrections |
| **Correction trust**    | IC never accepts external corrections                                                                                                                                                                                      | IC must trust foreign corrections (bounded)               |
| **Evidence signing**    | Relay signs order log + replay (Ed25519) — evidence chain for post-match review, NOT ranked certification (cross-engine matches are unranked by default; ranked requires explicit M7+/M11 decision per 07-CROSS-ENGINE.md) | Uncertified — P2P trust at best                           |
| **Maphack prevention**  | Same — lockstep architectural limit                                                                                                                                                                                        | Same — lockstep architectural limit                       |
| **Client integrity**    | Cannot verify foreign binary                                                                                                                                                                                               | Cannot verify foreign binary                              |

**Bottom line:** IC-hosted cross-engine play gives IC control over 7 of 10 security properties. IC-joining-foreign gives IC control over 1 (its own local validation). The recommendation for cross-engine play is clear: **always prefer IC as host**.

## Cross-Engine Lobby Trust UX

When a foreign client joins an IC-hosted lobby, the UI must communicate trust posture clearly:

- **Player cards** show an engine badge (`IC`, `OpenRA`, `Unknown`) and trust tier icon (shield for Tier 0, half-shield for Tier 1, outline-shield for Tier 2)
- **Warning banner** appears if any player is Tier 1 or Tier 2: `"Cross-engine match — IC relay enforces time authority, structural order validation, and behavioral analysis. Full sim validation runs on every IC client. Client integrity and foreign sim agreement are not guaranteed."`
- **Tooltip per player** shows exactly what IS and ISN'T enforced for that player's trust tier
- **Host setting:** `max_foreign_tier: u8` — controls which foreign clients may join. `0` = native IC clients only (Tier 0). `1` = allow verified foreign clients (Tier 0 + Tier 1). `2` = allow any client (Tier 0 + Tier 1 + Tier 2). Default is `0` for ranked (enforced by ranking authority), `2` for unranked casual. The value is a ceiling on the foreign tier admitted — higher number = more permissive.
- **Match record** includes trust tier metadata — so later evidence analysis (for any `M7+`/`M11` certification decision) can correlate trust tier with match quality/incidents
