## D054: Extended Switchability — Transport, Cryptographic Signatures, and Snapshot Serialization

|                |                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                        |
| **Driver**     | Architecture switchability audit identified three subsystems that are currently hardcoded but carry meaningful risk of regret within 5–10 years |
| **Depends on** | D006 (NetworkModel), D010 (Snapshottable sim), D041 (Trait-abstracted subsystems), D052 (Community Servers & SCR)                               |

### Problem

The engine already trait-abstracts 23 subsystems (D041 inventory) and data-drives 7 more through YAML/Lua. But an architecture switchability audit identified three remaining subsystems where the *implementation* is hardcoded below an existing abstraction layer, creating risks that are cheap to mitigate now but expensive to fix later:

1. **Transport layer** — `NetworkModel` abstracts the logical protocol (lockstep vs. rollback) but not the transport beneath it. Raw UDP is hardcoded. WASM builds cannot use raw UDP sockets at all — browser multiplayer is blocked until this is abstracted. WebTransport and QUIC are maturing rapidly and may supersede raw UDP for game transport within the engine's lifetime.

2. **Cryptographic signature scheme** — Ed25519 is hardcoded in ~15 callsites across the codebase: SCR records (D052), replay signature chains, Workshop index signing, `CertifiedMatchResult`, key rotation records, and community identity. Ed25519 is excellent today (128-bit security, fast, compact), but NIST's post-quantum transition timeline (ML-DSA standardized 2024, recommended migration by ~2035) means the engine may need to swap signature algorithms without breaking every signed record in existence.

3. **Snapshot serialization codec** — `SimSnapshot` is serialized with bincode + LZ4, hardcoded in the save/load path. Bincode is not self-describing — schema changes (adding a field, reordering an enum) silently produce corrupt deserialization rather than a clean error. Cross-version save compatibility requires codec-version awareness that doesn't currently exist.

Each uses the right abstraction mechanism for its specific situation: **Transport** gets a trait (open-ended, third-party implementations expected, hot path where monomorphization matters), **SignatureScheme** gets an enum (closed set of 2–3 algorithms, runtime dispatch needed for mixed-version verification), and **SnapshotCodec** gets version-tagged dispatch (internal versioning, no pluggability needed). The total cost is ~80 lines of definitions. The benefit is that none of these becomes a rewrite-required bottleneck when reality changes.

### The Principle (from D041)

Abstract the *transport mechanism*, not the *data*. If the concern is "which bytes go over which wire" or "which algorithm signs these bytes" or "which codec serializes this struct" — that's a mechanism that can change independently of the logic above it. The logic (lockstep protocol, credential verification, snapshot semantics) stays identical regardless of which mechanism implements it.

### 1. `Transport` — Network Transport Abstraction

**Risk level: HIGH.** Browser multiplayer (Invariant #10: platform-agnostic) is blocked without this. WASM cannot open raw UDP sockets — it's a platform API limitation, not a library gap. Every browser RTS (Chrono Divide, OpenRA-web experiments) solves this by abstracting transport. We already abstract the protocol layer (`NetworkModel`); failing to abstract the transport layer below it is an inconsistency.

**Current state:** The connection establishment flow in `03-NETCODE.md` shows transport as a concern "below" `NetworkModel`:

```
Discovery → Connection establishment → NetworkModel constructed → Game loop
```

But connection establishment hardcodes UDP. A `Transport` trait makes this explicit.

**Trait definition:**

```rust
/// Abstracts a single bidirectional network channel beneath NetworkModel.
/// Each Transport instance represents ONE connection (to a relay, or to a
/// single peer in P2P). NetworkModel manages multiple Transport instances
/// for multi-peer P2P; relay mode uses a single Transport to the relay.
///
/// Lives in ic-net. NetworkModel implementations are generic over Transport.
///
/// Design: point-to-point, not connectionless. No endpoint parameter in
/// send/recv — the Transport IS the connection. For UDP, this maps to a
/// connected socket (UdpSocket::connect()). For WebSocket/QUIC, this is
/// the natural model. Multi-peer routing is NetworkModel's concern.
///
/// All transports expose datagram/message semantics. The protocol layer
/// (NetworkModel) always runs its own reliability and ordering — sequence
/// numbers, retransmission, frame resend (§ Frame Data Resilience). On
/// reliable transports (WebSocket), these mechanisms become no-ops at
/// runtime (retransmit timers never fire). This eliminates conditional
/// branches in NetworkModel and keeps a single code path and test matrix.
pub trait Transport: Send + Sync {
    /// Send a datagram/message to the connected peer. Non-blocking or
    /// returns WouldBlock. Data is a complete message (not a byte stream).
    fn send(&self, data: &[u8]) -> Result<(), TransportError>;

    /// Receive the next available message, if any. Non-blocking.
    /// Returns the number of bytes written to `buf`, or None if no
    /// message is available.
    fn recv(&self, buf: &mut [u8]) -> Result<Option<usize>, TransportError>;

    /// Maximum payload size for a single send() call.
    /// UdpTransport returns ~476 (MTU-safe). WebSocketTransport returns ~64KB.
    fn max_payload(&self) -> usize;

    /// Establish the connection to the target endpoint.
    fn connect(&mut self, target: &Endpoint) -> Result<(), TransportError>;

    /// Tear down the connection.
    fn disconnect(&mut self);
}
```

**Default implementations:**

| Implementation       | Backing                               | Platform         | Phase  | Notes                                                                                                                                                                                              |
| -------------------- | ------------------------------------- | ---------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UdpTransport`       | `std::net::UdpSocket`                 | Desktop, Server  | 5      | Default. Raw UDP, MTU-aware, same as current hardcoded behavior.                                                                                                                                   |
| `WebSocketTransport` | `tungstenite` / browser WebSocket API | WASM, Fallback   | 5      | Enables browser multiplayer. Reliable + ordered (NetworkModel's retransmit logic becomes a no-op — single code path, zero conditional branches). Higher latency than UDP but functional.           |
| `WebTransportImpl`   | WebTransport API                      | WASM (future)    | Future | Unreliable datagrams over QUIC. Best of both worlds — UDP-like semantics in the browser. Spec still maturing (W3C Working Draft).                                                                  |
| `QuicTransport`      | `quinn`                               | Desktop (future) | Future | Stream multiplexing, built-in encryption, 0-RTT reconnects. Candidate to replace raw UDP + custom reliability when QUIC ecosystem matures.                                                         |
| `MemoryTransport`    | `crossbeam` channel                   | Testing          | 2      | Zero-latency, zero-loss in-process transport. Already implied by `LocalNetwork` — this makes it explicit as a `Transport`. NetworkModel manages a `Vec<T>` of these for multi-peer test scenarios. |

**Relationship to `NetworkModel`:**

```rust
/// NetworkModel becomes generic over Transport.
/// Existing code that constructs LockstepNetwork or RelayLockstepNetwork
/// now specifies a Transport. For desktop builds, this is UdpTransport.
/// For WASM builds, this is WebSocketTransport.
///
/// Relay mode: single Transport to the relay server.
/// P2P mode: Vec<T> — one Transport per peer connection.
pub struct LockstepNetwork<T: Transport> {
    transport: T,       // relay mode: connection to relay
    // ... existing fields unchanged
}

pub struct P2PLockstepNetwork<T: Transport> {
    peers: Vec<T>,      // one connection per peer
    // ... existing fields unchanged
}

impl<T: Transport> NetworkModel for LockstepNetwork<T> {
    // All existing logic unchanged. send()/recv() calls go through
    // self.transport instead of directly calling UdpSocket methods.
    // Reliability layer (sequence numbers, retransmit, frame resend)
    // runs identically regardless of transport — on reliable transports,
    // retransmit timers simply never fire.
}
```

**What does NOT change:** The wire format (delta-compressed TLV), the `OrderCodec` trait, the `NetworkModel` trait API, connection discovery (join codes, tracking servers), or the relay server protocol. Transport is purely "how bytes move," not "what bytes mean."

**Why no `is_reliable()` method?** Adding reliability awareness to `Transport` would create conditional branches in `NetworkModel` — one code path for unreliable transports (full retransmit logic) and another for reliable ones (skip retransmit). This doubles the test matrix and creates subtle behavioral differences between deployment targets. Instead, `NetworkModel` always runs its full reliability layer. On reliable transports (WebSocket), retransmit timers never fire and the redundancy costs nothing at runtime. One code path, one test matrix, zero conditional complexity. This is the same approach used by ENet, Valve's GameNetworkingSockets, and most serious game networking libraries.

**Message lanes (from GNS):** `NetworkModel` multiplexes multiple logical streams (lanes) over a single `Transport` connection — each with independent priority and weight. Lanes are a protocol-layer concern, not a transport-layer concern: `Transport` provides raw byte delivery; `NetworkModel` handles lane scheduling, priority draining, and per-lane buffering. See `03-NETCODE.md` § Message Lanes for the lane definitions (`Orders`, `Control`, `Chat`, `Voice`, `Bulk`) and scheduling policy. The lane system ensures time-critical orders are never delayed by chat traffic, voice data, or bulk data — a pattern validated by GNS's configurable lane architecture (see `research/valve-github-analysis.md` § 1.4). The `Voice` lane (D059) carries relay-forwarded Opus VoIP frames as unreliable, best-effort traffic.

**Transport encryption (from GNS):** All multiplayer transports are encrypted with AES-256-GCM over an X25519 key exchange — the same cryptographic suite used by Valve's GameNetworkingSockets and DTLS 1.3. Encryption sits between `Transport` and `NetworkModel`, transparent to both layers. Each connection generates an ephemeral Curve25519 keypair for forward secrecy; the symmetric key is never reused across sessions. After key exchange, the handshake is signed with the player's Ed25519 identity key (D052) to bind the encrypted channel to a verified identity. The GCM nonce incorporates the packet sequence number, preventing replay attacks. See `03-NETCODE.md` § Transport Encryption for the full specification and `06-SECURITY.md` for the threat model. `MemoryTransport` (testing) and `LocalNetwork` (single-player) skip encryption.

**Pluggable signaling (from GNS):** Connection establishment is further decomposed into a `Signaling` trait — abstracting how peers exchange connection metadata (IP addresses, relay tokens, ICE candidates) before the `Transport` is established. This follows GNS's `ISteamNetworkingConnectionSignaling` pattern. Different deployment contexts use different signaling: relay-brokered, rendezvous + hole-punch, direct IP, or WebRTC for browser builds. Adding a new connection method (e.g., Steamworks P2P, Epic Online Services) requires only a new `Signaling` implementation — no changes to `Transport` or `NetworkModel`. See `03-NETCODE.md` § Pluggable Signaling for trait definition and implementations.

**Why not abstract this earlier (D006/D041)?** At D006 design time, browser multiplayer was a distant future target and raw UDP was the obvious choice. Invariant #10 (platform-agnostic) was added later, making the gap visible. D041 explicitly listed the transport layer in its inventory of *already-abstracted* concerns via `NetworkModel` — but `NetworkModel` abstracts the protocol, not the transport. This decision corrects that conflation.

### 2. `SignatureScheme` — Cryptographic Algorithm Abstraction

**Risk level: HIGH.** Ed25519 is hardcoded in ~15 callsites. NIST standardized ML-DSA (post-quantum signatures) in 2024 and recommends migration by ~2035. The engine's 10+ year lifespan means a signature algorithm swap is probable, not speculative. More immediately: different deployment contexts may want different algorithms (Ed448 for higher security margin, ML-DSA-65 for post-quantum compliance).

**Current state:** D052's SCR format deliberately has "No algorithm field. Always Ed25519." — this was the right call to prevent JWT's algorithm confusion vulnerability (CVE-2015-9235). But the solution isn't "hardcode one algorithm forever" — it's "the version field implies the algorithm, and the verifier looks up the algorithm from the version, never from attacker-controlled input."

**Why enum dispatch, not a trait?** The set of signature algorithms is small and closed — realistically 2–3 over the engine's entire lifetime (Ed25519 now, ML-DSA-65 later, possibly one more). This makes it fundamentally different from `Transport` (which is open-ended — anyone can write a new transport). A trait would introduce design tension: associated types (`PublicKey`, `SecretKey`, `Signature`) are not object-safe with `Clone`, meaning `dyn SignatureScheme` won't compile. But runtime dispatch is *required* — a player's credential file contains mixed-version SCRs (version 1 Ed25519 alongside future version 2 ML-DSA), and the verifier must handle both in the same loop. Workarounds exist (erase types to `Vec<u8>`, or drop `Clone`) but they sacrifice type safety that was the supposed benefit of the trait.

Enum dispatch resolves all of these tensions: exhaustive `match` with no default arm (compiler catches missing variants), `Clone`/`Copy` for free, zero vtable overhead, and idiomatic Rust for small closed sets. Adding a third algorithm someday means adding one enum variant — the compiler then flags every callsite that needs updating.

**Enum definition:**

```rust
/// Signature algorithm selection for all signed records.
/// Lives in ic-net (signing + verification are I/O concerns; ic-sim
/// never signs or verifies anything — Invariant #1).
///
/// NOT a trait. The algorithm set is small and closed (2–3 variants
/// over the engine's lifetime). Enum dispatch gives:
/// - Exhaustive match (compiler catches missing variants on addition)
/// - Clone/Copy for free
/// - Zero vtable overhead
/// - Runtime dispatch without object-safety headaches
///
/// Third-party signature algorithms are out of scope — cryptographic
/// agility is a security risk (see JWT CVE-2015-9235). The engine
/// controls which algorithms it trusts.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SignatureScheme {
    Ed25519,
    // MlDsa65,  // future: post-quantum (NIST FIPS 204)
}

impl SignatureScheme {
    /// Sign a message. Returns the signature bytes.
    pub fn sign(&self, sk: &[u8], msg: &[u8]) -> Vec<u8> {
        match self {
            Self::Ed25519 => ed25519_sign(sk, msg),
            // Self::MlDsa65 => ml_dsa_65_sign(sk, msg),
        }
    }

    /// Verify a signature against a public key and message.
    pub fn verify(&self, pk: &[u8], msg: &[u8], sig: &[u8]) -> bool {
        match self {
            Self::Ed25519 => ed25519_verify(pk, msg, sig),
            // Self::MlDsa65 => ml_dsa_65_verify(pk, msg, sig),
        }
    }

    /// Generate a new keypair. Returns (public_key, secret_key).
    pub fn generate_keypair(&self) -> (Vec<u8>, Vec<u8>) {
        match self {
            Self::Ed25519 => ed25519_generate_keypair(),
            // Self::MlDsa65 => ml_dsa_65_generate_keypair(),
        }
    }

    /// Public key size in bytes. Determines SCR binary format layout.
    pub fn public_key_len(&self) -> usize {
        match self {
            Self::Ed25519 => 32,
            // Self::MlDsa65 => 1952,
        }
    }

    /// Signature size in bytes. Determines SCR binary format layout.
    pub fn signature_len(&self) -> usize {
        match self {
            Self::Ed25519 => 64,
            // Self::MlDsa65 => 3309,
        }
    }
}
```

**Algorithm variants:**

| Variant   | Algorithm | Key Size   | Sig Size   | Phase  | Notes                                                                      |
| --------- | --------- | ---------- | ---------- | ------ | -------------------------------------------------------------------------- |
| `Ed25519` | Ed25519   | 32 bytes   | 64 bytes   | 5      | Default. Current behavior. 128-bit security. Fast, compact, battle-tested. |
| `MlDsa65` | ML-DSA-65 | 1952 bytes | 3309 bytes | Future | Post-quantum. NIST FIPS 204. Larger keys/sigs but quantum-resistant.       |

**Version-implies-algorithm (preserving D052's anti-confusion guarantee):**

D052's SCR format already has a `version` byte (currently `0x01`). The version-to-algorithm mapping is hardcoded in the *verifier*, never read from the record itself:

```rust
/// Version → SignatureScheme mapping.
/// This is the verifier's lookup table, NOT a field in the signed record.
/// Preserves D052's guarantee: no algorithm negotiation, no attacker-controlled
/// algorithm selection. The version byte is set by the issuer at signing time;
/// the verifier uses it to select the correct verification algorithm.
///
/// Returns Result, not panic — version bytes come from user-provided files
/// (credential stores, replays, save files) and must fail gracefully.
fn scheme_for_version(version: u8) -> Result<SignatureScheme, CredentialError> {
    match version {
        0x01 => Ok(SignatureScheme::Ed25519),
        // 0x02 => Ok(SignatureScheme::MlDsa65),
        _ => Err(CredentialError::UnknownVersion(version)),
    }
}
```

**What changes in the SCR binary format:** Nothing structurally. The `version` byte already exists. What changes is the *interpretation*:

- **Before (D052):** "Version is for format evolution. Algorithm is always Ed25519."
- **After (D054):** "Version implies both format layout AND algorithm. Version 1 = Ed25519 (32-byte keys, 64-byte sigs). Version 2 = ML-DSA-65 (1952-byte keys, 3309-byte sigs). The verifier dispatches on version, never on an attacker-controlled field."

The variable-length fields (`community_key`, `player_key`, `signature`) are already length-implied by `version` — version 1 readers know key=32, sig=64. Version 2 readers know key=1952, sig=3309. No length prefix needed because the version fully determines the layout.

**Backward compatibility:** A version 1 SCR issued by a community running Ed25519 remains valid forever. A community migrating to ML-DSA-65 issues version 2 SCRs. Both can coexist in a player's credential file. Version 1 SCRs don't expire or become invalid — they just can't be *newly issued* once the community upgrades.

**Affected callsites (all change from direct `ed25519_dalek` calls to `SignatureScheme` enum method calls):**

- SCR record signing/verification (D052 — community servers + client)
- Replay signature chain (`TickSignature` in `05-FORMATS.md`)
- Workshop index signing (D049 — CI signing pipeline)
- `CertifiedMatchResult` (D052 — relay server)
- Key rotation records (D052 — community servers)
- Player identity keypairs (D052/D053)

**Why not a `version` field in each signature?** Because that's exactly JWT's `alg` header vulnerability. The version lives in the *container* (SCR record header, replay file header, Workshop index header) — not in the signature itself. The container's version is written by the issuer and verified structurally (known offset, not parsed from attacker-controlled payload). This is the same defense D052 already uses; D054 just extends it to support future algorithms.

### 3. `SnapshotCodec` — Save/Replay Serialization Versioning

**Risk level: MEDIUM.** Bincode is fast and compact but not self-describing — if any field in `SimSnapshot` is added, removed, or reordered, deserialization silently produces garbage or panics. The save format header already has a `version: u16` field (`05-FORMATS.md`), but no code dispatches on it. Today, version is always 1 and the codec is always bincode + LZ4. This works until the first schema change — which is inevitable as the sim evolves through Phase 2–7.

**This is NOT a trait in `ic-sim`.** Snapshot serialization is I/O — it belongs in `ic-game` (save/load) and `ic-net` (snapshot transfer for late-join). The sim produces/consumes `SimSnapshot` as an in-memory struct. How that struct becomes bytes is the codec's concern.

**Codec dispatch (version → codec):**

```rust
/// Version-to-codec dispatch for SimSnapshot serialization.
/// Lives in ic-game (save/load path) and ic-net (snapshot transfer).
///
/// NOT a trait — there's no pluggability need here. Game modules don't
/// provide custom codecs. This is internal versioning, not extensibility.
/// A match statement is simpler, more explicit, and easier to audit than
/// a trait registry.
pub fn encode_snapshot(
    snapshot: &SimSnapshot,
    version: u16,
) -> Result<Vec<u8>, CodecError> {
    let serialized = match version {
        1 => bincode::serialize(snapshot)
            .map_err(|e| CodecError::Serialize(e.to_string()))?,
        2 => postcard::to_allocvec(snapshot)
            .map_err(|e| CodecError::Serialize(e.to_string()))?,
        _ => return Err(CodecError::UnknownVersion(version)),
    };
    Ok(lz4_flex::compress_prepend_size(&serialized))
}

pub fn decode_snapshot(
    data: &[u8],
    version: u16,
) -> Result<SimSnapshot, CodecError> {
    let decompressed = lz4_flex::decompress_size_prepended(data)
        .map_err(|e| CodecError::Decompress(e.to_string()))?;
    match version {
        1 => bincode::deserialize(&decompressed)
            .map_err(|e| CodecError::Deserialize(e.to_string())),
        2 => postcard::from_bytes(&decompressed)
            .map_err(|e| CodecError::Deserialize(e.to_string())),
        _ => Err(CodecError::UnknownVersion(version)),
    }
}

/// Errors from snapshot/replay codec operations. Surfaced in UI as
/// "incompatible save file" or "corrupted replay" — never a panic.
#[derive(Debug)]
pub enum CodecError {
    UnknownVersion(u16),
    Serialize(String),
    Deserialize(String),
    Decompress(String),
}
```

**Why postcard as the likely version 2?**

| Property          | bincode (v1)               | postcard (v2 candidate)                                                                                                                                     |
| ----------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-describing   | No                         | Yes (with `postcard-schema`)                                                                                                                                |
| Varint integers   | No (fixed-width)           | Yes (smaller payloads)                                                                                                                                      |
| Schema evolution  | Field add = silent corrupt | Field append = `#[serde(default)]` compatible (same as bincode); structural mismatch = detected and rejected at load time (vs. bincode's silent corruption) |
| `#[serde]` compat | Yes                        | Yes                                                                                                                                                         |
| `no_std` support  | Limited                    | Full (embedded-friendly)                                                                                                                                    |
| Speed             | Very fast                  | Very fast (within 5%)                                                                                                                                       |
| WASM support      | Yes                        | Yes (designed for it)                                                                                                                                       |

The version 1 → 2 migration path: saves with version 1 headers decode via bincode. New saves write version 2 headers and encode via postcard. Old saves remain loadable forever. The `SimSnapshot` struct itself doesn't change — only the codec that serializes it.

**Migration strategy (from Factorio + DFU analysis):** Mojang's DataFixerUpper uses algebraic optics (profunctor-based type-safe transformations) for Minecraft save migration — academically elegant but massively over-engineered for practical use (see `research/mojang-wube-modding-analysis.md`). Factorio's two-tier migration system is the better model: (1) **Declarative renames** — a YAML mapping of `old_field_name → new_field_name` per category, applied automatically by version number, and (2) **Lua migration scripts** — for complex structural transformations that can't be expressed as simple renames. Scripts are ordered by version and applied sequentially. This avoids DFU's complexity while handling real-world schema evolution. Additionally, every IC YAML rule file should include a `format_version` field (e.g., `format_version: "1.0.0"`) — following the pattern used by both Minecraft Bedrock (`"format_version": "1.26.0"` in every JSON entity file) and Factorio (`"factorio_version": "2.0"` in `info.json`). This enables the migration system to detect and transform old formats without guessing.

**Why NOT a trait?** Unlike Transport and SignatureScheme, snapshot codecs have zero pluggability requirement. No game module, mod, or community server needs to provide a custom snapshot serializer. This is purely internal version dispatch — a `match` statement is the right abstraction, not a trait. D041's principle: "abstract the *algorithm*, not the *data*." Snapshot serialization is data marshaling with no algorithmic variation — the right tool is version-tagged dispatch, not trait polymorphism.

**Relationship to replay format:** The replay file format (`05-FORMATS.md`) also has a `version: u16` in its header. The same version-to-codec dispatch applies to replay tick frames (`ReplayTickFrame` serialization). Replay version 1 uses bincode + LZ4 block compression. A future version 2 could use postcard + LZ4. The replay header version and the save header version evolve independently — a replay viewer doesn't need to understand save files and vice versa.

### What Still Does NOT Need Abstraction

This audit explicitly confirmed that the following remain correctly un-abstracted (extending D041's "What Does NOT Need a Trait" table):

| Subsystem                  | Why No Abstraction Needed                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| YAML parser (`serde_yaml`) | Parser crate is a Cargo dependency swap — no trait needed, no code change beyond `Cargo.toml`.                                    |
| Lua runtime (`mlua`)       | Deeply integrated via `ic-script`. Switching Lua impls is a rewrite regardless of traits. The scripting *API* is the abstraction. |
| WASM runtime (`wasmtime`)  | Same — the WASM API is the abstraction, not the runtime binary.                                                                   |
| Compression (LZ4)          | Used in exactly two places (snapshot, replay). Swapping is a one-line change. No trait overhead justified.                        |
| Bevy                       | The engine framework. Abstracting Bevy is abstracting gravity. If Bevy is replaced, everything is rewritten.                      |
| State hash algorithm       | SHA-256 Merkle tree. Changing this requires coordinated protocol version bump across all clients — a trait wouldn't help.         |
| RNG (`DeterministicRng`)   | Already deterministic and internal to `ic-sim`. Swapping PRNG algorithms is a single-struct replacement. No polymorphism needed.  |

### Alternatives Considered

- **Abstract everything now** (rejected — violates D015's "no speculative abstractions"; the 7 items above don't carry meaningful regret risk)
- **Abstract nothing, handle it later** (rejected — Transport blocks WASM multiplayer *now*; SignatureScheme's 15 hardcoded callsites grow with every feature; SnapshotCodec's first schema change will force an emergency versioning retrofit)
- **Use `dyn` trait objects instead of generics for Transport** (rejected — `dyn Transport` adds vtable overhead on every `send()`/`recv()` in the hot network path; monomorphized generics are zero-cost. `Transport` is used in tight loops — static dispatch is correct here)
- **Make SignatureScheme a trait with associated types** (rejected — associated types are not object-safe with `Clone`, but runtime dispatch is required for mixed-version SCR verification. Erasing types to `Vec<u8>` sacrifices the type safety that was the supposed benefit. Enum dispatch gives exhaustive match, `Clone`/`Copy`, zero vtable, and compiler-enforced completeness when adding variants)
- **Make SignatureScheme a trait with `&[u8]` params (object-safe)** (rejected — works technically, but the algorithm set is small and closed. A trait implies open extensibility; the engine deliberately controls which algorithms it trusts. Enum is the idiomatic Rust pattern for closed dispatch)
- **Add algorithm negotiation to SCR** (rejected — this IS JWT's `alg` header. Version-implies-algorithm is strictly safer and already fits D052's format)
- **Use protobuf/flatbuffers for snapshot serialization** (rejected — adds external IDL dependency, `.proto` file maintenance, code generation step. Postcard gives schema stability within the `serde` ecosystem IC already uses)
- **Make SnapshotCodec a trait** (rejected — no pluggability requirement exists. A `match` statement is simpler and more auditable than a trait registry for internal version dispatch)
- **Add `is_reliable()` to Transport** (rejected — would create conditional branches in NetworkModel: one code path for unreliable transports with full retransmit, another for reliable transports that skips it. Doubles the test matrix. Instead, NetworkModel always runs its reliability layer; on reliable transports the retransmit timers simply never fire. Zero runtime cost, one code path)
- **Connectionless (endpoint-addressed) Transport API** (rejected — creates impedance mismatch: UDP is connectionless but WebSocket/QUIC are connection-oriented. Point-to-point model fits all transports naturally. For UDP, use connected sockets. Multi-peer routing is NetworkModel's concern, not Transport's)

### Relationship to Existing Decisions

- **D006 (NetworkModel):** `Transport` lives below `NetworkModel`. The connection establishment flow becomes: Discovery → Transport::connect() → NetworkModel constructed over Transport → Game loop. `NetworkModel` gains a `T: Transport` type parameter.
- **D010 (Snapshottable sim):** Snapshot encoding/decoding is the I/O layer around D010's `SimSnapshot`. D010 defines the struct; D054 defines how it becomes bytes.
- **D041 (Trait-abstracted subsystems):** `Transport` is added to D041's inventory table. `SignatureScheme` uses enum dispatch (not a trait) — it belongs in the "closed set" category alongside `SnapshotCodec`'s version dispatch. Both are version-tagged, exhaustive, and compiler-enforced. Neither needs the open extensibility that traits provide.
- **D052 (Community Servers & SCR):** The `version` byte in SCR format now implies the signature algorithm. D052's anti-algorithm-confusion guarantee is preserved — the defense shifts from "hardcode one algorithm" to "version determines algorithm, verifier never reads algorithm from attacker input."
- **Invariant #10 (Platform-agnostic):** `Transport` trait directly enables WASM multiplayer, the primary platform gap.

### Phase

- **Phase 2:** `MemoryTransport` for testing (already implied by `LocalNetwork`; making it explicit as a `Transport`). `SnapshotCodec` version dispatch (v1 = bincode + LZ4, matching current behavior).
- **Phase 5:** `UdpTransport`, `WebSocketTransport` (matching current hardcoded behavior — the trait boundary exists, the implementation is unchanged). `SignatureScheme::Ed25519` enum variant wired into all D052 SCR code, replacing direct `ed25519_dalek` calls.
- **Future:** `WebTransportImpl` (when spec stabilizes), `QuicTransport` (when ecosystem matures), `SignatureScheme::MlDsa65` variant (when post-quantum migration timeline firms up), `SnapshotCodec` v2 (postcard, when first `SimSnapshot` schema change occurs).

---

---

