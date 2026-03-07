# 03 — Network Architecture

## Our Netcode

Iron Curtain ships **one default gameplay netcode** today: relay-assisted deterministic lockstep with sub-tick order fairness. This is the recommended production path, not a buffet of equal options in the normal player UX. The `NetworkModel` trait still exists for more than testing: it lets us run single-player and replay modes cleanly, support multiple deployments (dedicated relay / embedded relay), and preserve the ability to introduce deferred compatibility bridges or replace the default netcode under explicitly deferred milestones (for example `M7+` interop experiments or `M11` optional architecture work) if evidence warrants it (e.g., cross-engine interop experiments, architectural flaws discovered in production). Those paths require explicit decision/tracker placement and are not part of `M4` exit criteria.

Scope note: in this chapter, "P2P" refers only to direct gameplay transport (a deferred/optional mode), not Workshop/content distribution. Workshop P2P remains in scope via D049/D074.

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
    // === Game-agnostic core (all RTS game modules use these) ===
    Move { units: Vec<UnitTag>, target: WorldPos },
    Attack { units: Vec<UnitTag>, target: Target },
    Stop { units: Vec<UnitTag> },
    Idle,  // Explicit no-op — keeps player in the tick's order list for timing/presence
    ChatMessage { channel: ChatChannel, text: String },  // D059 — display/replay only, no game state effect
    ChatCommand { cmd: String, args: Vec<String> },       // Mod-registered sim commands (D058)
    CheatCode(CheatId),                                   // Hidden cheat activation (D058)
    SetCvar { name: String, value: String },              // DEV_ONLY/SERVER cvar mutation
    Vote(VoteOrder),                                      // Surrender, kick, remake, draw, custom (vote-framework.md)
    // === Game-module extensibility (D018/D039, multi-game.md rule 7) ===
    // Game modules register their own order types via this variant.
    // The payload is serde-serialized by the game module and deserialized
    // by its OrderValidator (D041). The engine core routes these opaquely.
    // RA1 examples: Build, Sell, SetRallyPoint, Deploy, Stance, etc.
    GameOrder(GameSpecificOrder),
}

/// Opaque game-module order. The engine core does not inspect this;
/// the game module's OrderValidator (D041) deserializes and validates it.
/// `type_tag` identifies the order kind (game module assigns its own IDs).
/// `payload` is the serde-serialized order data.
#[derive(Clone, Serialize, Deserialize, Hash)]
pub struct GameSpecificOrder {
    pub type_tag: u16,
    pub payload: Vec<u8>,
}

/// UnitTag is the stable external entity identity (02-ARCHITECTURE.md § External
/// Entity Identity). Generational index into a fixed-size pool — deterministic,
/// cheap (4 bytes), safe across save/load/network boundaries. Bevy Entity is
/// NEVER serialized into orders or replays.
/// See also: type-safety.md § Newtype Policy.

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
//
// Authentication note: TimestampedOrder is the sim-level type (ic-protocol).
// The transport layer in ic-net wraps each order in an AuthenticatedOrder
// (Ed25519 signature from a per-session ephemeral keypair) before
// transmission. The relay verifies signatures before forwarding.
// See vulns-protocol.md § Vulnerability 16 for the signing scheme and
// system-wiring.md for the integration site.
//
// Chat routing note: ChatMessage orders are per-recipient filtered by the
// relay based on ChatChannel (D059). Team chat goes only to same-team clients,
// Whisper only to the target. This is safe because ChatMessage does not affect
// game state — the sim records it for replay but makes no state-changing
// decisions. Sync hashes cover game state only. The relay's order_stream_hash
// (V13 certification) covers the full pre-filtering stream; per-recipient
// filtering happens after hashing. See relay-architecture.md.

pub struct TickOrders {
    pub tick: SimTick,
    pub orders: Vec<TimestampedOrder>,
}

impl TickOrders {
    /// CS2-style: process in chronological order within the tick.
    /// Uses a caller-provided scratch buffer to avoid per-tick heap allocation.
    /// The buffer is cleared and reused each tick (see TickScratch pattern in 10-PERFORMANCE.md).
    /// Tie-break by player ID so equal timestamps remain deterministic if a
    /// deferred non-relay mode is ever enabled. Relay modes already emit
    /// canonical normalized timestamps, but the helper remains safe.
    pub fn chronological<'a>(&'a self, scratch: &'a mut Vec<&'a TimestampedOrder>) -> &'a [&'a TimestampedOrder] {
        scratch.clear();
        scratch.extend(self.orders.iter());
        scratch.sort_by_key(|o| (o.sub_tick_time, o.player));
        scratch.as_slice()
    }
}
```
