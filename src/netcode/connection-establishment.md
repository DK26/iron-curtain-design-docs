# Connection Establishment

Connection method is a concern *below* the `NetworkModel`. By the time a `NetworkModel` is constructed, transport is already established. The discovery/connection flow:

```
Discovery (tracking server / join code / direct IP / QR)
  → Signaling (pluggable — see below)
    → Transport::connect() (UdpTransport, WebSocketTransport, etc.)
      → NetworkModel constructed over Transport (EmbeddedRelayNetwork<T> or RelayLockstepNetwork<T>)
        → Game loop runs — sim doesn't know or care how connection happened
```

The transport layer is abstracted behind a `Transport` trait (D054). Each `Transport` instance represents a single bidirectional channel (point-to-point). `NetworkModel` implementations are generic over `Transport` — both relay modes use one `Transport` to the relay. This enables different physical transports per platform — raw UDP (connected socket) on desktop, WebSocket in the browser, `MemoryTransport` in tests — without conditional branches in `NetworkModel`. The protocol layer always runs its own reliability; on reliable transports the retransmit logic becomes a no-op. See `decisions/09d/D054-extended-switchability.md` for the full trait definition and implementation inventory.

### Commit-Reveal Game Seed

The initial RNG seed that determines all stochastic outcomes (combat rolls, scatter patterns, AI decisions) must not be controllable by any single player. A host who chooses the seed can pre-compute favorable outcomes (e.g., "with seed 0xDEAD, my first tank shot always crits"). This is a known exploit in direct-peer lockstep designs and was identified in Hypersomnia's security analysis (see `research/veloren-hypersomnia-openbw-ddnet-netcode-analysis.md`).

IC uses a **commit-reveal protocol** to generate the game seed collaboratively:

```rust
/// Phase 1: Each player generates a random contribution and commits its hash.
/// All commitments must arrive before any reveal — prevents last-player advantage.
pub struct SeedCommitment {
    pub player: PlayerId,
    pub commitment: [u8; 32],  // SHA-256(player_seed_contribution || nonce)
}

/// Phase 2: After all commitments are collected, each player reveals their contribution.
/// The relay verifies reveal matches commitment.
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

**Listen server:** The embedded relay collects all commitments and reveals, following the same protocol as a dedicated relay.

**Single-player:** Skip commit-reveal. The client generates the seed directly.

```rust
/// The final game seed used to initialize the simulation RNG.
/// Computed via commit-reveal XOR of all player contributions.
pub type GameSeed = u64;
```

### Transport Encryption

All multiplayer connections are encrypted. The encryption layer sits between `Transport` and `NetworkModel` — transparent to both:

- **Key exchange:** Curve25519 (X25519) for ephemeral key agreement. Each connection generates a fresh keypair; the shared secret is never reused across sessions.
- **Symmetric encryption:** AES-256-GCM for authenticated encryption of all payload data. The GCM authentication tag detects tampering; no separate integrity check needed.
- **Sequence binding:** The AES-GCM nonce incorporates the packet sequence number, binding encryption to the reliability layer's sequence space. Replay attacks (resending a captured packet) fail because the nonce won't match. Retransmitted packets receive a new sequence number (and thus a new nonce) — the payload is re-encrypted. See `wire-format.md` § Retransmission.
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

**Signaling** is the mechanism by which participants exchange connection metadata (IP addresses, relay tokens, ICE candidates) before the transport connection is established. Valve's GNS abstracts signaling behind `ISteamNetworkingConnectionSignaling` — a trait that decouples the connection establishment mechanism from the transport.

IC adopts this pattern. Signaling is abstracted behind a trait in `ic-net`:

```rust
/// Abstraction for connection signaling — how peers exchange
/// connection metadata before Transport is established.
///
/// Different deployment contexts use different signaling:
/// - Relay mode: relay server brokers the introduction
/// - Browser (WASM): WebRTC signaling server
///
/// The trait uses non-blocking polling — `recv_signal` returns `Ok(None)`
/// when no message is available. Signaling involves network I/O and may
/// take multiple round-trips (ICE candidate gathering, STUN/TURN), but
/// callers drive progress by polling rather than awaiting futures.
pub trait Signaling: Send + Sync {
    /// Send a signaling message to the target peer.
    fn send_signal(&mut self, peer: &PeerId, msg: &SignalingMessage) -> Result<(), SignalingError>;
    /// Poll for the next incoming signaling message (non-blocking).
    fn recv_signal(&mut self) -> Result<Option<(PeerId, SignalingMessage)>, SignalingError>;
}

/// Signaling messages exchanged during connection establishment.
pub enum SignalingMessage {
    /// Offer to connect — includes transport capabilities, public key.
    Offer { transport_info: TransportInfo, identity_key: [u8; 32] },
    /// Answer to an offer — includes selected transport, public key.
    Answer { transport_info: TransportInfo, identity_key: [u8; 32] },
    /// ICE candidate for NAT traversal when hole-punching is used.
    IceCandidate { candidate: String },
    /// Connection rejected (lobby full, banned, etc.).
    Reject { reason: String },
}
```

**Default implementations:**

| Implementation        | Mechanism                      | When Used                         | Phase  |
| --------------------- | ------------------------------ | --------------------------------- | ------ |
| `RelaySignaling`      | Relay server brokers           | Relay multiplayer (default)       | 5      |
| `RendezvousSignaling` | Lightweight rendezvous + punch | Join code / QR to hosted relay    | 5      |
| `DirectSignaling`     | Out-of-band (no server)        | Direct IP to host/dedicated relay | 5      |
| `WebRtcSignaling`     | WebRTC signaling server        | Browser WASM hosted sessions      | Future |
| `MemorySignaling`     | In-process channels            | Tests                             | 2      |

This decoupling means adding a new connection method (e.g., Steam Networking Sockets or Epic Online Services signaling backends) requires only implementing `Signaling`, not modifying `NetworkModel` or `Transport`. The GNS precedent validates this — GNS users can plug in custom signaling for non-Steam platforms while keeping the same transport and reliability layer.

### Direct IP

Classic approach. Host shares `IP:port`, other player connects.

- Simplest to implement (UDP connect to the host's relay endpoint, done)
- Requires host to have a reachable IP (port forwarding or same LAN)
- Good for LAN parties, dedicated server setups, and power users

### Join Code (Recommended for Casual)

Host contacts a lightweight rendezvous server. Server assigns a short code (e.g., `IRON-7K3M`). Joiner sends code to same server. Server brokers a UDP hole-punch between the host relay endpoint and the joiner.

```
┌────────┐     1. register     ┌──────────────┐     2. resolve    ┌────────┐
│  Host  │ ──────────────────▶ │  Rendezvous  │ ◀──────────────── │ Joiner │
│        │ ◀── code: IRON-7K3M│    Server     │  code: IRON-7K3M──▶       │
│        │     3. hole-punch   │  (stateless)  │  3. hole-punch   │        │
│        │ ◀═══════════════════╪══════════════════════════════════▶│        │
└────────┘   conn to host relay  └──────────────┘                └────────┘
```

- No port forwarding needed (UDP hole-punch works through most NATs)
- Rendezvous server is stateless and trivial — it only brokers introductions, never sees game data
- Codes are short-lived (expire after use or timeout)
- Industry standard: Among Us, Deep Rock Galactic, It Takes Two

### QR Code

Same as join code, encoded as QR. Player scans from phone → opens game client with code pre-filled. Ideal for couch play, LAN events, and streaming (viewers scan to join).

### Via Relay Server

When direct host connectivity fails (symmetric NAT, corporate firewalls), fall back to a dedicated relay server route. Both paths remain relay-authoritative.

### Via Tracking Server

Player browses public game listings, picks one, client connects directly to the host (or relay). See Game Discovery section below.
