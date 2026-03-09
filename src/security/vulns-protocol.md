## Vulnerability 14: Transport Layer Attacks (Eavesdropping & Packet Forgery)

### The Problem

If game traffic is unencrypted or weakly encrypted, any on-path observer (same WiFi, ISP, VPN provider) can read all game data and forge packets. C&C Generals used XOR with a fixed starting key `0xFade` — this is not encryption. The key is hardcoded, the increment (`0x00000321`) is constant, and a comment in the source reads "just for fun" (see `Transport.cpp` lines 42-56). Any packet could be decrypted instantly even before the GPL source release. Combined with no packet authentication (the "validation" is a simple non-cryptographic CRC), an attacker had full read/write access to all game traffic.

This is not a theoretical concern. Game traffic on public WiFi, tournament LANs, or shared networks is trivially interceptable.

### Mitigation: Mandatory AEAD Transport Encryption

```rust
/// Transport-layer encryption for all multiplayer traffic.
/// See `03-NETCODE.md` § "Transport Encryption" for the canonical `TransportCrypto` struct.
///
/// Cipher selection validated by Valve's GameNetworkingSockets (GNS) production deployment:
/// AES-256-GCM + X25519 key exchange, with Ed25519 identity binding.
/// See `connection-establishment.md` § "Transport Encryption" for the canonical
/// `TransportCrypto` struct and `system-wiring.md` for the `EncryptedTransport<T>` wrapper.
///
/// All modes use the same crypto primitives — X25519 key exchange, AES-256-GCM
/// authenticated encryption, Ed25519 identity binding. The encryption layer
/// (`EncryptedTransport<T>`) wraps any `Transport` implementation, sitting between
/// Transport and NetworkModel. There is no TLS termination model — the relay
/// forwards encrypted datagrams; clients and relay share session keys established
/// during connection handshake.
pub struct TransportCrypto {
    cipher: Aes256Gcm,       // derived from X25519 shared secret
    send_nonce: u32,         // incremented per packet
    recv_nonce: u32,
    session_salt: [u8; 8],   // ensures cross-session nonce uniqueness
}
```

**Key design choices:**
- **Never roll custom crypto.** Generals' XOR is the cautionary example. Use established libraries (`ring` for AES-256-GCM and X25519, `ed25519-dalek` for identity binding).
- **Relay mode uses the same crypto as all modes.** Clients establish an X25519 key exchange with the relay during connection handshake, then all traffic is AES-256-GCM encrypted with sequence-bound nonces. The relay is the trust anchor — it decrypts inbound orders, validates them, and re-encrypts outbound TickOrders per recipient.
- **Authenticated encryption.** Every packet is both encrypted AND authenticated (AES-256-GCM). Tampering is detected and the packet is dropped. This eliminates the entire class of packet-modification attacks that Generals' XOR+CRC allowed.
- **No encrypted passwords on the wire.** Lobby authentication uses Ed25519 identity keys and SHA-256 challenge-response (see `connection-establishment.md`). Generals transmitted "encrypted" passwords using trivially reversible bit manipulation (see `encrypt.cpp` — passwords truncated to 8 characters, then XOR'd). We use cryptographic identity binding — passwords never leave the client.

**GNS-validated encryption model (see `research/valve-github-analysis.md` § 1):** Valve's GameNetworkingSockets uses AES-256-GCM + X25519 for transport encryption across all game traffic — the same primitive selection IC targets. Key properties validated by GNS's production deployment:

- **Per-packet nonce = sequence number.** GNS derives the AES-GCM nonce from the packet sequence number (see `03-NETCODE.md` § "Transport Encryption"). This eliminates nonce transmission overhead and makes replay attacks structurally impossible — replaying a captured packet with a stale sequence number produces an authentication failure. IC adopts this pattern.
- **Identity binding via Ed25519.** GNS binds the ephemeral X25519 session key to the peer's Ed25519 identity key during connection establishment. This prevents MITM attacks during key exchange — an attacker who intercepts the handshake cannot substitute their own key without failing the Ed25519 signature check. IC's `TransportCrypto` (defined in `03-NETCODE.md`) implements the same binding: the X25519 key exchange is signed by the peer's Ed25519 identity key, and the relay server verifies the signature before establishing the forwarding session.
- **Encryption is mandatory, not optional.** GNS does not support unencrypted connections — there is no "disable encryption for performance" mode. IC follows the same principle: all multiplayer traffic is encrypted, period. The overhead of AES-256-GCM with hardware AES-NI (available on all x86 CPUs since ~2010) is negligible for game-sized packets (~100-500 bytes per tick). Even on mobile ARM processors with ARMv8 crypto extensions, the cost is sub-microsecond per packet.

### What This Prevents
- Eavesdropping on game state (reading opponent's orders in transit)
- Packet injection (forging orders that appear to come from another player)
- Replay attacks (re-sending captured packets from a previous game)
- Credential theft (capturing lobby passwords from network traffic)

## Vulnerability 15: Protocol Parsing Exploitation (Malformed Input)

### The Problem

Even with memory-safe code, a malicious peer can craft protocol messages designed to exploit the parser: oversized fields that exhaust memory, deeply nested structures that blow the stack, or invalid enum variants that cause panics. The goal is denial of service — crashing or freezing the target.

C&C Generals' receive-side code is the canonical cautionary tale. The send-side is careful — every `FillBufferWith*` function checks `isRoomFor*` against `MAX_PACKET_SIZE`. But the receive-side parsers (`readGameMessage`, `readChatMessage`, `readFileMessage`, etc.) operate on raw `(UnsignedByte *data, Int &i)` with **no size parameter**. They trust every length field, blindly advance the read cursor, and never check if they've run past the buffer end. Specific examples verified in Generals GPL source:

- **`readFileMessage`**: reads a filename with `while (data[i] != 0)` — no length limit. A packet without a null terminator overflows a stack buffer. Then `dataLength` from the packet controls both `new UnsignedByte[dataLength]` (unbounded allocation) and `memcpy(buf, data + i, dataLength)` (out-of-bounds read).
- **`readChatMessage`**: `length` byte controls `memcpy(text, data + i, length * sizeof(UnsignedShort))`. No check that the packet actually contains that many bytes.
- **`readWrapperMessage`**: reassembles chunked commands with network-supplied `totalDataLength`. An attacker claiming billions of bytes forces unbounded allocation.
- **`ConstructNetCommandMsgFromRawData`**: dispatches to type-specific readers, but an unknown command type leaves `msg` as NULL, then dereferences it — instant crash.

Rust eliminates the buffer overflows (slices enforce bounds), but not the denial-of-service vectors.

### Mitigation: Defense-in-Depth Protocol Parsing

```rust
/// All protocol parsing goes through a BoundedReader that tracks remaining bytes.
/// Every read operation checks available length first. Underflow returns Err, never panics.
pub struct BoundedReader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> BoundedReader<'a> {
    pub fn read_u8(&mut self) -> Result<u8, ProtocolError> {
        if self.pos >= self.data.len() { return Err(ProtocolError::Truncated); }
        let val = self.data[self.pos];
        self.pos += 1;
        Ok(val)
    }

    pub fn read_bytes(&mut self, len: usize) -> Result<&'a [u8], ProtocolError> {
        if self.pos + len > self.data.len() { return Err(ProtocolError::Truncated); }
        let slice = &self.data[self.pos..self.pos + len];
        self.pos += len;
        Ok(slice)
    }

    pub fn remaining(&self) -> usize { self.data.len() - self.pos }
}

/// Hard limits on all protocol fields — reject before allocating.
/// These are the absolute ceilings. The primary rate control is the
/// time-budget pool (OrderBudget) — see `03-NETCODE.md` § Order Rate Control.
pub struct ProtocolLimits {
    pub max_order_size: usize,               // 4 KB — single order
    pub max_orders_per_tick: usize,           // 256 — per player (hard ceiling)
    pub max_chat_message_length: usize,       // 512 chars
    pub max_file_transfer_size: usize,        // 64 KB — map files
    pub max_pending_data_per_peer: usize,     // 256 KB — total buffered per connection
    pub max_reassembled_command_size: usize,  // 64 KB — chunked/wrapper commands
    // Voice/coordination limits (D059)
    pub max_voice_packets_per_second: u32,    // 50 (1 per 20ms frame)
    pub max_voice_packet_size: usize,         // 256 bytes (covers 64kbps Opus)
    pub max_pings_per_interval: u32,          // 3 per 5 seconds
    pub max_minimap_draw_points: usize,       // 32 per stroke
    pub max_tactical_markers_per_player: u8,  // 10
    pub max_tactical_markers_per_team: u8,    // 30
}

**Canonical rate-limit cross-reference (D059 ↔ ProtocolLimits):**

D059 defines communication rate limits by prose ("max 50 Opus frames/second", "max 3 pings per 5 seconds"). These are the *same values* as the `ProtocolLimits` struct fields above. To prevent drift between the two documents, this table is the single source of truth:

| D059 Prose Description        | `ProtocolLimits` Field            | Value     |
| ----------------------------- | --------------------------------- | --------- |
| Max 50 Opus frames/second     | `max_voice_packets_per_second`    | 50        |
| Max 256 bytes per Opus frame  | `max_voice_packet_size`           | 256 bytes |
| Max 3 pings per 5 seconds     | `max_pings_per_interval`          | 3 per 5s  |
| Max 32 draw points per stroke | `max_minimap_draw_points`         | 32        |
| Max 10 markers per player     | `max_tactical_markers_per_player` | 10        |
| Max 30 markers per team       | `max_tactical_markers_per_team`   | 30        |

If either document changes a rate limit, the other must be updated in the same change set. Implementation: these values derive from a shared `const` block in `ic-protocol`, not duplicated literals.

/// Command type dispatch uses exhaustive matching — unknown types return Err.
fn parse_command(reader: &mut BoundedReader, cmd_type: u8) -> Result<NetCommand, ProtocolError> {
    match cmd_type {
        CMD_FRAME => parse_frame_command(reader),
        CMD_ORDER => parse_order_command(reader),
        CMD_CHAT  => parse_chat_command(reader),
        CMD_FILE  => parse_file_command(reader),
        // Note: ACKs are header-level ack vectors (wire-format.md), not
        // standalone commands. They are parsed by the transport/reliability
        // layer before command dispatch reaches this point.
        _         => Err(ProtocolError::UnknownCommandType(cmd_type)),
    }
}
```

**Design principles (each addresses a specific Generals vulnerability):**

| Principle                        | Addresses                                         | Implementation                                                                  |
| -------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Length-delimited reads           | All read*Message functions lacking bounds checks  | `BoundedReader` with remaining-bytes tracking                                   |
| Hard size caps                   | Unbounded allocation via network-supplied lengths | `ProtocolLimits` checked before any allocation                                  |
| Exhaustive command dispatch      | NULL dereference on unknown command type          | Rust `match` with `_ => Err(...)`                                               |
| Per-connection memory budget     | Wrapper/chunking memory exhaustion                | Track per-peer buffered bytes, disconnect on exceeded                           |
| Rate limiting at transport layer | Packet flood consuming parse CPU                  | Max packets/second per source IP, connection cookies                            |
| Separate parse and execute       | Malformed input affecting game state              | Parse into validated types first, then execute. Parse failures never touch sim. |

**The core insight from Generals:** Send-side code is careful (validates sizes before building packets). Receive-side code trusts everything. This asymmetry is the root cause of most vulnerabilities. Our protocol layer must apply the same rigor to **parsing** as to **serialization** — which Rust's type system naturally encourages via `serde::Deserialize` with explicit error handling.

> For the full vulnerability catalog from Generals source code analysis, see `research/rts-netcode-security-vulnerabilities.md`.

## Vulnerability 16: Order Source Authentication

### The Problem

The relay server stamps each order with the authenticated sender's player slot — forgery is prevented by the trusted relay. Ed25519 per-order signing provides defense in depth: even if an attacker compromises the relay, forged orders are detectable.

### Mitigation: Ed25519 Per-Order Signing

`AuthenticatedOrder`, `ClientSessionAuth`, and `RelaySessionAuth` live in `ic-net` (transport layer), NOT in `ic-protocol`. The sim-level type is bare `TimestampedOrder` (defined in `protocol.md`). The signing/verification happens at the transport boundary: the client signs in `RelayLockstepNetwork::submit_order()` (using `ClientSessionAuth`) and the relay verifies before calling `RelayCore::receive_order()` (using `RelaySessionAuth`). The sim never sees signatures.

```rust
/// Transport-layer wrapper (ic-net). NOT an ic-protocol type.
pub struct AuthenticatedOrder {
    pub order: TimestampedOrder,
    pub signature: Ed25519Signature,  // Signed by sender's session keypair
}

/// Each player generates an ephemeral Ed25519 keypair at game start.
/// These are NOT the long-lived D052 identity keys (used for community
/// credentials, SCRs, and account recovery via BIP-39 mnemonic).
/// Session keys are distinct: generated fresh per match for forward
/// secrecy and compromise isolation. If a session key is extracted
/// mid-game, only that match's orders are forgeable — the player's
/// D052 identity and community reputation are unaffected.
/// Public keys are exchanged during lobby setup over the encrypted
/// channel (Vulnerability 14).

/// Client-side auth: signs outgoing orders before transmission.
/// The signing key never leaves the client process.
pub struct ClientSessionAuth {
    pub player_id: PlayerId,
    pub signing_key: Ed25519SigningKey,   // Private — never leaves client
}

impl ClientSessionAuth {
    /// Sign an outgoing order
    pub fn sign_order(&self, order: &TimestampedOrder) -> AuthenticatedOrder {
        let bytes = order.to_canonical_bytes();
        let signature = self.signing_key.sign(&bytes);
        AuthenticatedOrder { order: order.clone(), signature }
    }
}

/// Relay-side auth: verifies incoming order signatures from all players.
/// The relay holds all players' public keys (exchanged during lobby setup)
/// and validates every order before forwarding into the tick stream.
/// In embedded relay (listen server) mode, the host's RelayCore instance
/// performs verification using this same struct.
pub struct RelaySessionAuth {
    pub peer_keys: HashMap<PlayerId, Ed25519VerifyingKey>,  // All players' public keys
}

impl RelaySessionAuth {
    /// Verify an incoming order came from the claimed player
    pub fn verify_order(&self, auth_order: &AuthenticatedOrder) -> Result<(), AuthError> {
        let expected_key = self.peer_keys.get(&auth_order.order.player)
            .ok_or(AuthError::UnknownPlayer)?;
        let bytes = auth_order.order.to_canonical_bytes();
        expected_key.verify(&bytes, &auth_order.signature)
            .map_err(|_| AuthError::InvalidSignature)
    }
}
```

**Key design choices:**
- **Ephemeral session keys.** Generated fresh for each game. Distinct from D052 long-lived identity keys (see `decisions/09b/D052/D052-keys-operations-integration.md`). No long-lived keys to steal. Key exchange happens during lobby setup over the encrypted channel (Vulnerability 14).
- **Defense in depth.** Relay validates signatures AND stamps orders. Sim validates order legality (D012).
- **Overhead is minimal.** Ed25519 signing is ~15,000 ops/second on a single core. At peak RTS APM (~300 orders/minute = 5/second), signature overhead is negligible.
- **Replays include the relay-signed tick hash chain.** State hashes at signing cadence boundaries (every N ticks, default 30) are signed by the relay via `TickSignature` (see `formats/save-replay-formats.md` § Signature Chain). This sparse chain allows post-hoc verification that no tick outcomes were tampered with — useful for tournament dispute resolution. Per-order session signatures are NOT stored in replays; the replay verification model is tick-level, not order-level.

## Vulnerability 17: State Saturation (Order Flooding)

### The Problem

Bryant & Saiedian (2021) introduced the term "state saturation" to describe a class of lag-based attack where a player generates disproportionate network traffic through rapid game actions — starving other players' command messages and gaining a competitive edge. Their companion paper (*A State Saturation Attack against Massively Multiplayer Online Videogames*, ICISSP 2021) demonstrated this via animation canceling: rapidly interrupting actions generates far more state updates than normal play, consuming bandwidth that would otherwise carry opponents' orders.

The companion ICISSP paper (2021) demonstrated this empirically via Elder Scrolls Online: when players exploited animation canceling (rapidly alternating offensive and defensive inputs to bypass client-side throttling), network traffic increased by **+175% packets sent** and **+163% packets received** compared to the intended baseline. A prominent community figure demonstrated a **50% DPS increase** (70K → 107K) through this technique — proving the competitive advantage is real and measurable.

In an RTS context, this could manifest as:
- **Order flooding:** Spamming hundreds of move/stop/move/stop commands per tick to consume relay server processing capacity and delay other players' orders
- **Chain-reactive mod effects:** A mod creates ability chains that spawn hundreds of entities or effects per tick, overwhelming the sim and network (the paper's Risk of Rain 2 case study found "procedurally generated effects combined to produce unintended chain-reactive behavior which may ultimately overwhelm the ability for game clients to render objects or handle sending/receiving of game update messages")
- **Build order spam:** Rapidly queuing and canceling production to generate maximum order traffic

### Mitigation: Already Addressed by Design

Our architecture prevents state saturation at three independent layers — see `03-NETCODE.md` § Order Rate Control for the full design:

```rust
/// Layer 1: Time-budget pool (primary). Each player has an OrderBudget that
/// refills per tick and caps at a burst limit. Handles burst legitimately,
/// catches sustained abuse. Inspired by Minetest's LagPool.

/// Layer 2: Bandwidth throttle. Token bucket on raw bytes per client.
/// Catches oversized orders that pass the order-count budget.

/// Layer 3: Hard ceiling (ProtocolLimits). Absolute maximum regardless
/// of budget/bandwidth — the last resort. Single canonical definition —
/// see V15 above for the full struct with all fields including D059 voice
/// and coordination limits.
pub struct ProtocolLimits {
    // ... fields defined in V15 above (max_orders_per_tick, max_order_size,
    // max_pending_data_per_peer, voice/coordination limits, etc.)
}

/// The relay server enforces all three layers.
impl RelayServer {
    fn process_player_orders(&mut self, player: PlayerId, orders: Vec<PlayerOrder>) {
        // Layer 1: Consume from time-budget pool
        let budget_accepted = self.budgets[player].try_consume(orders.len() as u32);
        let orders = &orders[..budget_accepted as usize];

        // Layer 3: Hard cap as absolute ceiling
        let accepted = &orders[..orders.len().min(self.limits.max_orders_per_tick)];

        // Behavioral flag: sustained max-rate ordering is suspicious
        self.profiles[player].record_order_rate(accepted.len());

        self.tick_orders.add(player, accepted);
    }
}
```

**Why this works for Iron Curtain specifically:**
- **Relay server (D007) is the bandwidth arbiter.** Each player gets equal processing. One player's flood cannot starve another's inputs — the relay processes all players' orders independently within the tick window.
- **Order rate caps (ProtocolLimits)** prevent any single player from exceeding 256 orders per tick. Normal RTS play peaks around 5-10 orders/tick even at professional APM levels.
- **WASM mod sandbox** limits entity creation and instruction count per tick, preventing chain-reactive state explosions from mod code.
- **Sub-tick timestamps (D008)** ensure that even within a tick, order priority is based on actual submission time — not on who flooded more orders.

**Cheapest-first evaluation order (uBO pattern):** The three layers should be evaluated in ascending cost order: **hard ceiling first** (Layer 3 — a single integer comparison, O(1)), **then bandwidth throttle** (Layer 2 — token bucket check), **then time-budget pool** (Layer 1 — per-player accounting with burst tracking). This mirrors uBlock Origin's architecture where ~60% of requests are resolved by the cheapest layer (dynamic URL filtering) before the expensive static filter engine is consulted. The hard ceiling catches the obvious abuse (malformed packets, absurd order counts) before the nuanced per-player analysis runs. The code above shows Layer 1 first for conceptual clarity (it's the "primary" in design intent), but the runtime evaluation order should be cheapest-first for performance (see `research/ublock-origin-pattern-matching-analysis.md`).

**Lesson from the ESO case study:** The Elder Scrolls Online relied on client-side "soft throttling" (animations that gate input) alongside server-side "hard throttling" (cooldown timers). Players bypassed the soft throttle by using different input types to interrupt animations — the priority/interrupt system intended for reactive defense became an exploit. The lesson: **client-side throttling that can be circumvented by input type-switching is ineffective.** Server-side validation is the real throttle — which is exactly what our relay does. Zenimax eventually moved block validation server-side, adding an RTT penalty — the same trade-off our relay architecture accepts by design.

> **Academic reference:** Bryant, B.D. & Saiedian, H. (2021). *An evaluation of videogame network architecture performance and security.* Computer Networks, 192, 108128. DOI: [10.1016/j.comnet.2021.108128](https://doi.org/10.1016/j.comnet.2021.108128). Companion: Bryant, B.D. & Saiedian, H. (2021). *A State Saturation Attack against Massively Multiplayer Online Videogames.* ICISSP 2021.

#### EWMA Traffic Scoring (Relay-Side)

Beyond hard rate caps, the relay maintains an **exponential weighted moving average (EWMA)** of each player's order rate and bandwidth consumption. This catches sustained abuse patterns that stay just below the hard caps — a technique proven by DDNet's anti-abuse infrastructure (see `research/veloren-hypersomnia-openbw-ddnet-netcode-analysis.md`):

> **NaN/Inf hazard:** The `f64` fields below are vulnerable to NaN propagation under edge conditions (zero traffic, extreme bursts, denormalized floats). A NaN score silently disables abuse detection because `NaN > threshold` is always `false`. See **V34** in `vulns-infrastructure.md` for the mandatory NaN guard pattern, fail-closed defaults, and `alpha` range validation. The defended implementation there supersedes this simplified sketch. See also `type-safety.md` § Finite Float Policy.

```rust
/// Exponential weighted moving average for traffic monitoring.
/// α = 0.1 means ~90% of the score comes from the last ~10 ticks.
pub struct EwmaTrafficMonitor {
    pub orders_per_tick_avg: f64,     // EWMA of orders/tick
    pub bytes_per_tick_avg: f64,      // EWMA of bytes/tick
    pub alpha: f64,                   // Smoothing factor (default: 0.1)
    pub warning_threshold: f64,       // Sustained rate that triggers warning
    pub auto_throttle_threshold: f64, // Rate that triggers automatic throttling
    pub auto_ban_threshold: f64,      // Rate that triggers kick + temp ban
}

impl EwmaTrafficMonitor {
    pub fn update(&mut self, orders: u32, bytes: u32) {
        self.orders_per_tick_avg = self.alpha * orders as f64
            + (1.0 - self.alpha) * self.orders_per_tick_avg;
        self.bytes_per_tick_avg = self.alpha * bytes as f64
            + (1.0 - self.alpha) * self.bytes_per_tick_avg;
    }

    pub fn action(&self) -> TrafficAction {
        if self.orders_per_tick_avg > self.auto_ban_threshold {
            TrafficAction::KickAndTempBan
        } else if self.orders_per_tick_avg > self.auto_throttle_threshold {
            TrafficAction::ThrottleToBaseline
        } else if self.orders_per_tick_avg > self.warning_threshold {
            TrafficAction::LogWarning
        } else {
            TrafficAction::Allow
        }
    }
}
```

The EWMA approach catches a player who sustains 200 orders/tick for 10 seconds (clearly abusive) while allowing brief bursts of 200 orders/tick for 1-2 ticks (legitimate group selection commands). The thresholds are configurable per deployment.
