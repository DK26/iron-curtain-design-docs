# 06 — Security & Threat Model

## Fundamental Constraint

In deterministic lockstep, every client runs the full simulation. Every player has **complete game state in memory** at all times. This shapes every vulnerability and mitigation.

## Threat Matrix by Network Model

| Threat                | Pure P2P Lockstep       | Relay Server Lockstep   | Authoritative Fog Server |
| --------------------- | ----------------------- | ----------------------- | ------------------------ |
| Maphack               | **OPEN**                | **OPEN**                | **BLOCKED** ✓            |
| Order injection       | Sim rejects             | Server rejects          | Server rejects           |
| Order forgery         | Ed25519 per-order sigs  | Server stamps + sigs    | Server stamps + sigs     |
| Lag switch            | **OPEN**                | **BLOCKED** ✓           | **BLOCKED** ✓            |
| Eavesdropping         | DTLS encrypted          | TLS encrypted           | TLS encrypted            |
| Packet forgery        | AEAD rejects            | TLS rejects             | TLS rejects              |
| Protocol DoS          | Rate limit + size caps  | Relay absorbs + limits  | Server absorbs + limits  |
| State saturation      | **OPEN**                | Rate caps ✓             | Rate caps ✓              |
| Desync exploit        | Possible                | Server-only analysis    | N/A                      |
| Replay tampering      | **OPEN**                | Signed ✓                | Signed ✓                 |
| WASM mod cheating     | Sandbox                 | Sandbox                 | Sandbox                  |
| Reconciler abuse      | N/A                     | N/A                     | Bounded + signed ✓       |
| Join code brute-force | Rate limit + expiry     | Rate limit + expiry     | Rate limit + expiry      |
| Tracking server abuse | Rate limit + validation | Rate limit + validation | Rate limit + validation  |
| Version mismatch      | Handshake ✓             | Handshake ✓             | Handshake ✓              |

**Recommendation:** Relay server is the minimum for ranked/competitive play. Fog-authoritative server for high-stakes tournaments.

**A note on lockstep and DoS resilience:** Bryant & Saiedian (2021) observe that deterministic lockstep is surprisingly the *best* architecture for resisting volumetric denial-of-service attacks. Because the simulation halts and awaits input from all clients before progressing, an attacker attempting to exhaust a victim's bandwidth unintentionally introduces lag into their own experience as well. The relay server model adds further resilience — the relay absorbs attack traffic without forwarding it to clients.

## Vulnerability 1: Maphack (Architectural Limit)

### The Problem
Both clients must simulate everything (enemy movement, production, harvesting), so all game state exists in process memory. Fog of war is a rendering filter — the data is always there.

Every lockstep RTS has this problem: OpenRA, StarCraft, Age of Empires.

### Mitigations (partial, not solutions)

**Memory obfuscation** (raises bar for casual cheats):
```rust
pub struct ObfuscatedWorld {
    inner: World,
    xor_key: u64,  // rotated every N ticks
}
```

**Partitioned memory** (harder to scan):
```rust
pub struct PartitionedWorld {
    visible: World,              // Normal memory
    hidden: ObfuscatedStore,     // Encrypted, scattered, decoy entries
}
```

**Actual solution: Fog-Authoritative Server**
Server runs full sim, sends each client only entities they can see. Breaks pure lockstep. Requires server compute per game.

```rust
pub struct FogAuthoritativeNetwork {
    known_entities: HashSet<EntityId>,
}
impl NetworkModel for FogAuthoritativeNetwork {
    fn poll_tick(&mut self) -> Option<TickOrders> {
        // Returns orders AND visibility deltas:
        // "Entity 47 entered your vision at (30, 8)"
        // "Entity 23 left your vision"
    }
}
```

**Trade-off:** Relay server (just forwards orders) = cheap VPS handles thousands of games. Authoritative sim server = real CPU per game.

**Entity prioritization (Fiedler's priority accumulator):** When the fog-authoritative server sends partial state to each client, it must decide *what* to send within the bandwidth budget. Fiedler (2015) devised a priority accumulator that tracks object priority persistently between frames — objects accrue additional priority based on staleness (time since last update). High-priority objects (units in combat, projectiles) are sent every frame; low-priority objects (distant static structures) are deferred but eventually sent. This ensures a strict bandwidth upper bound while guaranteeing no object is permanently starved. Iron Curtain's `FogAuthoritativeNetwork` should implement this pattern: player-owned units and nearby enemies at highest priority, distant visible terrain objects at lowest, with staleness-based promotion ensuring eventual consistency.

**Traffic class segregation:** In FogAuth mode, player *input* (orders) and server *state* (entity updates) have different reliability requirements. Orders are small, latency-critical, and loss-intolerant — best suited for a reliable ordered channel. State updates are larger, frequent, and can tolerate occasional loss (the next update supersedes) — suited for an unreliable channel with delta compression. Bryant & Saiedian (2021) recommend this segregation. A dual-channel approach (reliable for orders, unreliable for state) optimizes both latency and bandwidth.

## Vulnerability 2: Order Injection / Spoofing

### The Problem
Malicious client sends impossible orders (build without resources, control enemy units).

### Mitigation: Deterministic Validation in Sim

```rust
fn validate_order(&self, player: PlayerId, order: &PlayerOrder) -> OrderValidity {
    match order {
        PlayerOrder::Build { structure, position } => {
            let house = self.player_state(player);
            if house.credits < structure.cost() { return Rejected(InsufficientFunds); }
            if !house.has_prerequisite(structure) { return Rejected(MissingPrerequisite); }
            if !self.can_place_building(player, structure, position) { return Rejected(InvalidPlacement); }
            Valid
        }
        PlayerOrder::Move { unit_ids, .. } => {
            for id in unit_ids {
                if self.unit_owner(*id) != Some(player) { return Rejected(NotOwner); }
            }
            Valid
        }
        // Every order type validated
    }
}
```

**Key:** Validation is deterministic and inside the sim. All clients run the same validation → all agree on rejections → no desync. Relay server also validates before broadcasting (defense in depth).

## Vulnerability 3: Lag Switch (Timing Manipulation)

### The Problem
Player deliberately delays packets → opponent's game stalls → attacker gets extra thinking time.

### Mitigation: Relay Server with Time Authority

```rust
impl RelayServer {
    fn process_tick(&mut self, tick: u64) {
        let deadline = Instant::now() + self.tick_deadline;
        for player in &self.players {
            match self.receive_orders_from(player, deadline) {
                Ok(orders) => self.tick_orders.add(player, orders),
                Err(Timeout) => {
                    // Missed deadline → always Idle (never RepeatLast —
                    // repeating the last order benefits the attacker)
                    self.tick_orders.add(player, PlayerOrder::Idle);
                    self.player_strikes[player] += 1;
                    // Enough strikes → disconnect
                }
            }
        }
        // Game never stalls for honest players
        self.broadcast_tick_orders(tick);
    }
}
```

Server owns the clock. Miss the window → your orders are replaced with Idle. Lag switch only punishes the attacker. Repeated late deliveries accumulate strikes; enough strikes trigger disconnection. See `03-NETCODE.md` § Order Rate Control for the full three-layer rate limiting system (time-budget pool + bandwidth throttle + hard ceiling).

## Vulnerability 4: Desync Exploit for Information Gathering

### The Problem
Cheating client intentionally causes desync, then analyzes desync report to extract hidden state.

### Mitigation: Server-Side Only Desync Analysis

```rust
pub struct DesyncReport {
    pub tick: u64,
    pub player_hashes: HashMap<PlayerId, u64>,
    // Full state diffs are SERVER-SIDE ONLY
    // Never transmitted to clients
}
```

Never send full state dumps to clients. Clients only learn "desync detected at tick N." Admins can review server-side diffs.

## Vulnerability 5: WASM Mod as Attack Vector

### The Problem
Malicious mod reads entity positions, sends data to external overlay, or subtly modifies local sim.

### Mitigation: Capability-Based API Design

The WASM host API surface IS the security boundary:

```rust
pub struct ModCapabilities {
    pub read_own_state: bool,
    pub read_visible_state: bool,
    // read_fogged_state doesn't exist as a capability — the API function doesn't exist
    pub issue_orders: bool,
    pub filesystem: FileAccess,    // Usually None
    pub network: NetworkAccess,    // Usually None
}

pub enum NetworkAccess {
    None,
    AllowList(Vec<String>),
    // Never unrestricted
}
```

**Key principle:** Don't expose `get_all_units()` or `get_enemy_state()`. Only expose `get_visible_units()` which checks fog. Mods literally cannot request hidden data because the function doesn't exist.

## Vulnerability 6: Replay Tampering

### The Problem
Modified replay files to fake tournament results.

### Mitigation: Signed Hash Chain

```rust
pub struct SignedReplay {
    pub data: ReplayData,
    pub server_signature: Ed25519Signature,
    pub hash_chain: Vec<(u64, u64)>,  // tick, cumulative_hash
}

impl SignedReplay {
    pub fn verify(&self, server_public_key: &PublicKey) -> bool {
        // 1. Verify server signature
        // 2. Verify hash chain integrity (tampering any tick invalidates all subsequent)
    }
}
```

## Vulnerability 7: Reconciler as Attack Surface

### The Problem
If the client accepts "corrections" from an external authority (cross-engine reconciler), a fake server could send malicious corrections.

### Mitigation: Bounded and Authenticated Corrections

```rust
fn is_sane_correction(&self, c: &EntityCorrection) -> bool {
    match &c.field {
        CorrectionField::Position(new_pos) => {
            let current = self.sim.entity_position(c.entity);
            let max_drift = MAX_UNIT_SPEED * self.ticks_since_sync;
            current.distance_to(new_pos) <= max_drift
        }
        CorrectionField::Credits(amount) => {
            *amount >= 0 && 
            (*amount - self.last_known_credits).abs() <= MAX_CREDIT_DELTA
        }
    }
}
```

All corrections must be: signed by the authority, bounded to physically possible values, and rejectable if suspicious.

## Vulnerability 8: Join Code Brute-Forcing

### The Problem
Join codes (e.g., `IRON-7K3M`) enable NAT-friendly P2P connections via a rendezvous server. If codes are short, an attacker can brute-force codes to join games uninvited — griefing lobbies or extracting connection info.

A 4-character alphanumeric code has ~1.7 million combinations. At 1000 requests/second, exhausted in ~28 minutes. Shorter codes are worse.

### Mitigation: Length + Rate Limiting + Expiry

```rust
pub struct JoinCode {
    pub code: String,          // 6-8 chars, alphanumeric, no ambiguous chars (0/O, 1/I/l)
    pub created_at: Instant,
    pub expires_at: Instant,   // TTL: 5 minutes (enough to share, too short to brute-force)
    pub uses_remaining: u32,   // 1 for private, N for party invites
}

impl RendezvousServer {
    fn resolve_code(&mut self, code: &str, requester_ip: IpAddr) -> Result<ConnectionInfo> {
        // Rate limit: max 5 resolve attempts per IP per minute
        if self.rate_limiter.check(requester_ip).is_err() {
            return Err(RateLimited);
        }
        // Lookup and consume
        match self.codes.get(code) {
            Some(entry) if entry.expires_at > Instant::now() => Ok(entry.connection_info()),
            _ => Err(InvalidCode),  // Don't distinguish "expired" from "nonexistent"
        }
    }
}
```

**Key choices:**
- 6+ characters from a 32-char alphabet (no ambiguous chars) = ~1 billion combinations
- Rate limit resolves per IP (5/minute blocks brute-force, legitimate users never hit it)
- Codes expire after 5 minutes (limits attack window)
- Invalid vs expired returns the same error (no information leakage)

## Vulnerability 9: Tracking Server Abuse

### The Problem
The tracking server is a public API. Abuse vectors:
- **Spam listings** — flood with fake games, burying real ones
- **Phishing redirects** — listing points to a malicious IP that mimics a game server but captures client info
- **DDoS** — overwhelm the server to deny game discovery for everyone

OpenRA's master server has been DDoSed before. Any public game directory faces this.

### Mitigation: Standard API Hardening

```rust
pub struct TrackingServerConfig {
    pub max_listings_per_ip: u32,        // 3 — one IP rarely needs more
    pub heartbeat_interval: Duration,    // 30s — listing expires if missed
    pub listing_ttl: Duration,           // 2 minutes without heartbeat → removed
    pub browse_rate_limit: u32,          // 30 requests/minute per IP
    pub publish_rate_limit: u32,         // 5 requests/minute per IP
    pub require_valid_game_port: bool,   // Server verifies the listed port is reachable
}
```

**Spam prevention:** Limit listings per IP. Require heartbeats (real games send them, spam bots must sustain effort). Optionally verify the listed port actually responds to a game protocol handshake.

**Phishing prevention:** Client validates the game protocol handshake before showing the lobby. A non-game server at the listed IP fails handshake and is silently dropped from the browser.

**DDoS:** Standard infrastructure — CDN/reverse proxy for the browse API, rate limiting, geographic distribution. The tracking server is stateless and trivially horizontally scalable (it's just a filtered list in memory).

## Vulnerability 10: Client Version Mismatch

### The Problem
Players with different client versions join the same game. Even minor differences in sim code (bug fix, balance patch) cause immediate desyncs. This looks like a bug to users, destroys trust, and wastes time. Age of Empires 2 DE had years of desync issues partly caused by version mismatches.

### Mitigation: Version Handshake at Connection

```rust
pub struct VersionInfo {
    pub engine_version: SemVer,        // e.g., 0.3.1
    pub sim_hash: u64,                 // hash of compiled sim logic (catches patched binaries)
    pub mod_manifest_hash: u64,        // hash of loaded mod rules (catches different mod versions)
    pub protocol_version: u32,         // wire protocol version
}

impl GameLobby {
    fn accept_player(&self, remote: &VersionInfo) -> Result<()> {
        if remote.protocol_version != self.host.protocol_version {
            return Err(IncompatibleProtocol);
        }
        if remote.sim_hash != self.host.sim_hash {
            return Err(SimVersionMismatch);
        }
        if remote.mod_manifest_hash != self.host.mod_manifest_hash {
            return Err(ModMismatch);
        }
        Ok(())
    }
}
```

**Key:** Check version during lobby join, not after game starts. The relay server and tracking server listings both include `VersionInfo` so incompatible games are filtered from the browser entirely.

## Vulnerability 11: Speed Hack / Clock Manipulation

### The Problem
A cheating client runs the local simulation faster than real time—either by manipulating the system clock or by feeding artificial timing into the game loop. In a pure P2P lockstep model, every client agrees on a tick cadence, so a faster client could potentially submit orders slightly sooner, giving a micro-advantage in reaction time.

### Mitigation: Relay Server Owns the Clock

In `RelayLockstepNetwork`, the relay server is the sole time authority. It advances the game by broadcasting canonical tick boundaries. The client's local clock is irrelevant—a client that "runs faster" just finishes processing sooner and waits for the next server tick. Orders submitted before the tick window opens are discarded.

```rust
impl RelayServer {
    fn tick_loop(&mut self) {
        loop {
            let tick_start = Instant::now();
            let tick_end = tick_start + self.tick_interval;

            // Collect orders only within the valid window
            let orders = self.collect_orders_until(tick_end);

            // Orders with timestamps outside the current tick window are rejected
            for order in &orders {
                if order.timestamp < self.current_tick_start
                    || order.timestamp > tick_end
                {
                    self.flag_suspicious(order.player, "out-of-window order");
                    continue;
                }
            }

            self.broadcast_tick_orders(self.current_tick, &orders);
            self.current_tick += 1;
            self.current_tick_start = tick_end;
        }
    }
}
```

**For pure P2P (no relay):** Speed hacks are harder to exploit because all clients must synchronize at each tick barrier — a client that runs faster simply idles. However, a desynced clock can cause subtle timing issues. This is another reason relay server is the recommended default for competitive play.

## Vulnerability 12: Automation / Scripting (Botting)

### The Problem
External tools (macros, overlays, input injectors) automate micro-management with superhuman precision: perfect unit splitting, instant reaction to enemy attacks, pixel-perfect targeting at 10,000+ APM. This is indistinguishable from a skilled player at a protocol level — the client sends valid orders at valid times.

### Mitigation: Behavioral Analysis (Relay-Side)

The relay server observes order patterns without needing access to game state:

```rust
pub struct PlayerBehaviorProfile {
    pub orders_per_tick: RingBuffer<u32>,          // rolling APM
    pub reaction_times: RingBuffer<Duration>,       // time from event to order
    pub order_precision: f64,                       // how tightly clustered targeting is
    pub sustained_apm_peak: Duration,               // how long max APM sustained
    pub pattern_entropy: f64,                        // randomness of input timing
}

impl RelayServer {
    fn analyze_behavior(&self, player: PlayerId) -> SuspicionScore {
        let profile = &self.profiles[player];
        let mut score = 0.0;

        // Sustained inhuman APM (>600 for extended periods)
        if profile.sustained_apm_above(600, Duration::from_secs(30)) {
            score += 0.4;
        }

        // Perfectly periodic input (bots often have metronomic timing)
        if profile.pattern_entropy < HUMAN_ENTROPY_FLOOR {
            score += 0.3;
        }

        // Reaction times consistently under human minimum (~150ms)
        if profile.avg_reaction_time() < Duration::from_millis(100) {
            score += 0.3;
        }

        SuspicionScore(score)
    }
}
```

**Key design choices:**
- **Detection, not prevention.** We can't conclusively prove automation from order patterns alone. The system flags suspicion for review, not automatic bans.
- **Relay-side only.** Analysis happens on the server — cheating clients can't detect or adapt to the analysis.
- **Replay-based post-hoc analysis.** Tournament replays can be analyzed after the fact with more sophisticated models (timing distribution analysis, reaction-to-fog-reveal correlation).
- **Community reporting.** Player reports feed into suspicion scoring — a player flagged by both the system and opponents warrants review.

**What we deliberately DON'T do:**
- No kernel-level anti-cheat (Vanguard, EAC-style). We're an open-source game — intrusive anti-cheat contradicts our values and doesn't work on Linux/WASM anyway.
- No input rate limiting. Capping APM punishes legitimate high-skill players. Detection, not restriction.

## Vulnerability 13: Match Result Fraud

### The Problem
In competitive/ranked play, match results determine ratings. A dishonest client could claim a false result, or colluding players could submit fake results to manipulate rankings.

### Mitigation: Relay-Certified Match Results

```rust
pub struct CertifiedMatchResult {
    pub match_id: MatchId,
    pub players: Vec<PlayerId>,
    pub result: MatchOutcome,          // winner(s), losers, draw, disconnect
    pub final_tick: u64,
    pub duration: Duration,
    pub final_state_hash: u64,         // hash of sim state at game end
    pub replay_hash: [u8; 32],         // SHA-256 of the full replay data
    pub server_signature: Ed25519Signature, // relay server signs the result
}

impl RankingService {
    fn submit_result(&mut self, result: &CertifiedMatchResult) -> Result<()> {
        // Only accept results signed by a trusted relay server
        if !self.verify_relay_signature(result) {
            return Err(UntrustedSource);
        }
        // Cross-check: if any player also submitted a replay, verify hashes match
        self.update_ratings(result);
        Ok(())
    }
}
```

**Key:** Only relay-server-signed results update rankings. Direct P2P games can be played for fun but don't affect ranked standings.

## Vulnerability 14: Transport Layer Attacks (Eavesdropping & Packet Forgery)

### The Problem

If game traffic is unencrypted or weakly encrypted, any on-path observer (same WiFi, ISP, VPN provider) can read all game data and forge packets. C&C Generals used XOR with a fixed starting key `0xFade` — this is not encryption. The key is hardcoded, the increment (`0x00000321`) is constant, and a comment in the source reads "just for fun" (see `Transport.cpp` lines 42-56). Any packet could be decrypted instantly even before the GPL source release. Combined with no packet authentication (the "validation" is a simple non-cryptographic CRC), an attacker had full read/write access to all game traffic.

This is not a theoretical concern. Game traffic on public WiFi, tournament LANs, or shared networks is trivially interceptable.

### Mitigation: DTLS 1.3 / Noise Protocol

```rust
pub enum TransportSecurity {
    /// Relay mode: clients connect via TLS 1.3 to the relay server.
    /// The relay terminates TLS and re-encrypts for each recipient.
    /// Simplest model — clients authenticate to the relay, relay handles forwarding.
    RelayTls {
        server_cert: Certificate,
        client_session_token: SessionToken,
    },

    /// Direct P2P: DTLS 1.3 over UDP for encrypted datagrams.
    /// Key exchange during connection establishment (noise protocol handshake).
    DirectDtls {
        peer_public_key: Ed25519PublicKey,
        session_keys: ChaCha20Poly1305Keys,
    },
}
```

**Key design choices:**
- **Never roll custom crypto.** Generals' XOR is the cautionary example. Use established libraries (`rustls`, `snow` for noise protocol, `ring` for primitives).
- **Relay mode makes this simple.** Clients open a TLS connection to the relay — standard web-grade encryption. The relay is the trust anchor.
- **Direct P2P uses DTLS.** UDP-compatible TLS. The connection establishment phase (join code / direct IP) exchanges public keys. The noise protocol (`snow` crate) is an alternative with lower overhead for game traffic.
- **Authenticated encryption.** Every packet is both encrypted AND authenticated (ChaCha20-Poly1305 or AES-256-GCM). Tampering is detected and the packet is dropped. This eliminates the entire class of packet-modification attacks that Generals' XOR+CRC allowed.
- **No encrypted passwords on the wire.** Lobby authentication uses session tokens issued during TLS handshake. Generals transmitted "encrypted" passwords using trivially reversible bit manipulation (see `encrypt.cpp` — passwords truncated to 8 characters, then XOR'd). We use SRP or OAuth2 — passwords never leave the client.

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
}

/// Command type dispatch uses exhaustive matching — unknown types return Err.
fn parse_command(reader: &mut BoundedReader, cmd_type: u8) -> Result<NetCommand, ProtocolError> {
    match cmd_type {
        CMD_FRAME => parse_frame_command(reader),
        CMD_ORDER => parse_order_command(reader),
        CMD_CHAT  => parse_chat_command(reader),
        CMD_ACK   => parse_ack_command(reader),
        CMD_FILE  => parse_file_command(reader),
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

## Vulnerability 16: Order Source Authentication (P2P Forgery)

### The Problem

In relay mode, the relay server stamps each order with the authenticated sender's player slot — forgery is prevented by the trusted relay. But in direct P2P modes (`LockstepNetwork`), orders contain a self-declared `playerID`. A malicious client can forge orders with another player's ID, sending commands for units they don't own.

Generals' `ConstructNetCommandMsgFromRawData` reads the player ID from the 'P' tag in the packet data with no validation against the source address. Any peer can claim to be any player.

Order *validation* (D012) catches ownership violations — commanding units you don't own is rejected deterministically. But without authentication, a malicious client can still forge valid orders *as* the victim player (e.g., ordering the victim's units to walk into danger). Validation checks whether the *order* is legal for that player — it doesn't check whether the *sender* is that player.

### Mitigation: Ed25519 Per-Order Signing

```rust
pub struct AuthenticatedOrder {
    pub order: TimestampedOrder,
    pub signature: Ed25519Signature,  // Signed by sender's session keypair
}

/// Each player generates an ephemeral Ed25519 keypair at game start.
/// Public keys are exchanged during lobby setup (over TLS — see Vulnerability 14).
/// The relay server also holds all public keys and validates signatures before forwarding.
pub struct SessionAuth {
    pub player_id: PlayerId,
    pub signing_key: Ed25519SigningKey,   // Private — never leaves client
    pub peer_keys: HashMap<PlayerId, Ed25519VerifyingKey>,  // All players' public keys
}

impl SessionAuth {
    /// Sign an outgoing order
    pub fn sign_order(&self, order: &TimestampedOrder) -> AuthenticatedOrder {
        let bytes = order.to_canonical_bytes();
        let signature = self.signing_key.sign(&bytes);
        AuthenticatedOrder { order: order.clone(), signature }
    }

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
- **Ephemeral session keys.** Generated fresh for each game. No long-lived keys to steal. Key exchange happens during lobby setup over the encrypted channel (Vulnerability 14).
- **Defense in depth.** Relay mode: relay validates signatures AND stamps orders. P2P mode: each client validates all peers' signatures. Both: sim validates order legality (D012).
- **Overhead is minimal.** Ed25519 signing is ~15,000 ops/second on a single core. At peak RTS APM (~300 orders/minute = 5/second), signature overhead is negligible.
- **Replays include signatures.** The signed order chain in replays allows post-hoc verification that no orders were tampered with — useful for tournament dispute resolution.

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
/// of budget/bandwidth — the last resort.
pub struct ProtocolLimits {
    pub max_orders_per_tick: usize,     // 256 — no player can flood the pipeline
    pub max_order_size: usize,          // 4 KB — no single oversized order
    pub max_pending_data_per_peer: usize, // 256 KB — total buffered per connection
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

**Lesson from the ESO case study:** The Elder Scrolls Online relied on client-side "soft throttling" (animations that gate input) alongside server-side "hard throttling" (cooldown timers). Players bypassed the soft throttle by using different input types to interrupt animations — the priority/interrupt system intended for reactive defense became an exploit. The lesson: **client-side throttling that can be circumvented by input type-switching is ineffective.** Server-side validation is the real throttle — which is exactly what our relay does. Zenimax eventually moved block validation server-side, adding an RTT penalty — the same trade-off our relay architecture accepts by design.

> **Academic reference:** Bryant, B.D. & Saiedian, H. (2021). *An evaluation of videogame network architecture performance and security.* Computer Networks, 192, 108128. DOI: [10.1016/j.comnet.2021.108128](https://doi.org/10.1016/j.comnet.2021.108128). Companion: Bryant, B.D. & Saiedian, H. (2021). *A State Saturation Attack against Massively Multiplayer Online Videogames.* ICISSP 2021.

## Vulnerability 18: Workshop Supply Chain Compromise

### The Problem

A trusted mod author's account is compromised (or goes rogue), and a malicious update is pushed to a widely-depended-upon Workshop resource. Thousands of players auto-update and receive the compromised package.

**Precedent:** The Minecraft **fractureiser** incident (June 2023). A malware campaign compromised CurseForge and Bukkit accounts, injecting a multi-stage downloader into popular mods. The malware stole browser credentials, Discord tokens, and cryptocurrency wallets. It propagated through the dependency chain — mods depending on compromised libraries inherited the payload. The incident affected millions of potential downloads before detection. CurseForge had SHA-256 checksums and author verification, but neither helped because the attacker *was* the authenticated author pushing a "legitimate" update.

IC's WASM sandbox (Vulnerability 5) prevents runtime exploits — a malicious WASM mod cannot access the filesystem or network without explicit capabilities. But the supply chain threat is broader than WASM: YAML rules can reference malicious asset URLs, Lua scripts execute with access to the Lua sandbox surface, and even non-code resources (sprites, audio) could exploit parser vulnerabilities.

### Mitigation: Defense-in-Depth Supply Chain Security

**Layer 1 — Reproducible builds and build provenance:**

- Workshop server records build metadata: source repository URL, commit hash, build environment, and builder identity.
- `ic mod publish --provenance` attaches a signed build attestation (inspired by SLSA/Sigstore). Consumers can verify that the published artifact was built from a specific commit in a public repository.
- Provenance is encouraged, not required — solo modders without CI/CD can still publish directly. But provenance-verified resources get a visible badge in the Workshop browser.

**Layer 2 — Update anomaly detection (Workshop server-side):**

- **Size delta alerts:** If a mod update changes package size by >50%, flag for review before making it available as `release`. Small balance tweaks don't triple in size.
- **New capability requests:** If a WASM module's declared capabilities change between versions (e.g., suddenly requests `network: AllowList`), flag for moderator review.
- **Dependency injection:** If an update adds new transitive dependencies that didn't exist before, flag. This was fractureiser's propagation vector.
- **Rapid-fire updates:** Multiple publishes within minutes to the same resource trigger rate limiting and moderator notification.

**Layer 3 — Author identity and account security:**

- **Two-factor authentication** required for Workshop publishing accounts (TOTP or WebAuthn).
- **Scoped API tokens** (D030) — CI/CD tokens can publish but not change account settings or transfer namespace ownership. A compromised CI token cannot escalate to full account control.
- **Namespace transfer requires manual moderator approval** — prevents silent account takeover.
- **Verified author badge** — linked GitHub/GitLab identity provides a second factor of trust. If a Workshop account is compromised but the linked Git identity is not, the community has a signal.

**Layer 4 — Client-side verification:**

- `ic.lock` pins exact versions AND SHA-256 checksums. `ic mod install` refuses mismatches. A supply chain attacker who replaces a package on the server cannot affect users who have already locked their dependencies.
- **Update review mode:** `ic mod update --review` shows a diff of what changed in each dependency before applying updates. Human review of changes before accepting is the last line of defense.
- **Rollback:** `ic mod rollback [resource] [version]` instantly reverts a dependency to a known-good version.

**Layer 5 — Incident response:**

- Workshop moderators can **yank** a specific version (remove from download but not from existing `ic.lock` files — users who already have it keep it, new installs get the previous version).
- **Security advisory system:** Workshop server can push advisories for specific resource versions. `ic mod audit` checks for advisories. The in-game mod manager displays warnings for affected resources.
- Community-hosted Workshop servers replicate advisories from the official server (opt-in).

**What this does NOT include:**
- Bytecode analysis or static analysis of WASM modules — too complex, too many false positives, and the capability sandbox is the real defense.
- Mandatory code review for all updates — doesn't scale. Anomaly detection targets the high-risk cases.
- Blocking updates entirely — that fragments the ecosystem. The goal is detection and fast response, not prevention of all possible attacks.

**Phase:** Basic SHA-256 verification and scoped tokens ship with initial Workshop (Phase 4–5). Anomaly detection and provenance attestation in Phase 6a. Security advisory system in Phase 6a. 2FA requirement for publishing accounts from Phase 5 onward.

## Competitive Integrity Summary

Iron Curtain's anti-cheat is **architectural, not bolted on.** Every defense emerges from design decisions made for other reasons:

| Threat              | Defense                                           | Source                                      |
| ------------------- | ------------------------------------------------- | ------------------------------------------- |
| Maphack             | Fog-authoritative server                          | Network model architecture                  |
| Order injection     | Deterministic validation in sim                   | Sim purity (invariant #1)                   |
| Order forgery (P2P) | Ed25519 per-order signing                         | Session auth design                         |
| Lag switch          | Relay server owns the clock                       | Relay architecture (D007)                   |
| Speed hack          | Relay tick authority                              | Same as above                               |
| State saturation    | Time-budget pool + bandwidth throttle + hard caps | OrderBudget + ProtocolLimits + relay (D007) |
| Eavesdropping       | DTLS / TLS transport encryption                   | Transport security design                   |
| Packet forgery      | Authenticated encryption (AEAD)                   | Transport security design                   |
| Protocol DoS        | BoundedReader + size caps + rate limits           | Protocol hardening                          |
| Replay tampering    | Ed25519 signed hash chain                         | Replay system design                        |
| Automation          | Behavioral analysis + community reports           | Relay-side observability                    |
| Result fraud        | Relay-certified match results                     | Relay architecture                          |
| Version mismatch    | Protocol handshake                                | Lobby system                                |
| WASM mod abuse      | Capability-based sandbox                          | Modding architecture (D005)                 |
| Desync exploit      | Server-side only analysis                         | Security by design                          |
| Supply chain attack | Anomaly detection + provenance + 2FA + lockfile   | Workshop security (D030)                    |

**No kernel-level anti-cheat.** Open-source, cross-platform, no ring-0 drivers. We accept that lockstep RTS will always have a maphack risk in P2P/relay modes — the fog-authoritative server is the real answer for high-stakes play.

**Performance as anti-cheat.** Our tick-time targets (< 10ms on 8-core desktop) mean the relay server can run games at full speed with headroom for behavioral analysis. Stuttery servers with 40ms ticks can't afford real-time order analysis — we can.