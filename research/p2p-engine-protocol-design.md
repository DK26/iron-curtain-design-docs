# P2P Engine Protocol Design — IC Workshop Distribution

> **Purpose:** Concrete wire protocol, piece scheduling, choking, signaling, and packaging specifications for IC's purpose-built P2P engine.
> **Date:** 2026-02-26
> **Referenced by:** D074, D049, research/bittorrent-p2p-libraries.md

---

## 1. BT Wire Protocol Messages (IC Implementation of BEP 3)

IC implements the standard BitTorrent wire protocol with IC-specific extensions negotiated via BEP 10. All multi-byte integers are big-endian unless otherwise noted (matching BT convention). Length prefixes do not include themselves.

### 1.1 Handshake (68 bytes, no length prefix)

The handshake is the first message on every TCP connection. It is NOT length-prefixed — it is always exactly 68 bytes.

```
Offset  Size  Field              Description
──────  ────  ─────              ───────────
0       1     pstrlen            Protocol name length. Always 19 (0x13).
1       19    pstr               "BitTorrent protocol" (ASCII, no null terminator)
20      8     reserved           Extension bits (see below)
28      20    info_hash          SHA-1 hash of the info dictionary from the .torrent / metainfo
48      20    peer_id            Peer identifier. IC uses "-IC0100-" prefix + 12 random bytes.
```

**Total: 1 + 19 + 8 + 20 + 20 = 68 bytes.**

#### Reserved Bytes (IC Extension Bits)

```
Byte  Bit   Meaning
────  ───   ───────
5     0x10  BEP 10 Extension Protocol supported (standard)
7     0x01  DHT supported (BEP 5, standard)
7     0x04  Fast Extension (BEP 6, optional)
5     0x20  IC Extension Suite (IC-specific, signals ic_auth + ic_priority support)
```

IC sets reserved bytes `[0x00, 0x00, 0x00, 0x00, 0x00, 0x30, 0x00, 0x05]` for a full-feature handshake (BEP 10 + IC extensions + DHT + Fast Extension).

#### Peer ID Format

```
-IC0100-<12 random ASCII chars>
```

`IC` = Iron Curtain client. `0100` = version 0.1.0 (4 chars, zero-padded). Matches Azureus-style convention for interoperability with standard BT tools.

### 1.2 Core Messages (BEP 3)

All messages after the handshake follow the format:

```
Offset  Size       Field
──────  ────       ─────
0       4          length_prefix (u32 BE) — total bytes following this field
4       1          message_id (u8)
5       variable   payload
```

A keep-alive is a message with `length_prefix = 0` and no message_id or payload (sent every 120 seconds).

#### Message Table

| Message ID | Name            | Length Prefix | Payload                                | Total Wire Bytes     |
|------------|-----------------|---------------|----------------------------------------|----------------------|
| —          | keep-alive      | 0             | (none)                                 | 4                    |
| 0          | choke           | 1             | (none)                                 | 5                    |
| 1          | unchoke         | 1             | (none)                                 | 5                    |
| 2          | interested      | 1             | (none)                                 | 5                    |
| 3          | not interested  | 1             | (none)                                 | 5                    |
| 4          | have            | 5             | piece_index: u32 BE                    | 9                    |
| 5          | bitfield        | 1+ceil(N/8)   | bitfield: ceil(N/8) bytes             | 5+ceil(N/8)          |
| 6          | request         | 13            | index: u32, begin: u32, length: u32   | 17                   |
| 7          | piece           | 9+block_len   | index: u32, begin: u32, block: [u8]   | 13+block_len         |
| 8          | cancel          | 13            | index: u32, begin: u32, length: u32   | 17                   |
| 20         | extended        | varies        | ext_msg_id: u8, payload: bencoded     | varies               |

#### Byte Layouts

**choke / unchoke / interested / not_interested:**
```
[0x00, 0x00, 0x00, 0x01,  // length = 1
 0x00]                      // message_id (0=choke, 1=unchoke, 2=interested, 3=not_interested)
```

**have:**
```
[0x00, 0x00, 0x00, 0x05,  // length = 5
 0x04,                      // message_id = 4
 PI3, PI2, PI1, PI0]       // piece_index: u32 BE
```

**bitfield:**
```
[LEN3, LEN2, LEN1, LEN0,  // length = 1 + ceil(total_pieces / 8)
 0x05,                      // message_id = 5
 B0, B1, B2, ...]          // bitfield bytes, MSB of first byte = piece 0
```

Spare bits in the last byte (when total_pieces % 8 != 0) MUST be zero.

**request / cancel:**
```
[0x00, 0x00, 0x00, 0x0D,  // length = 13
 0x06,                      // message_id = 6 (request) or 8 (cancel)
 I3, I2, I1, I0,           // piece index: u32 BE
 B3, B2, B1, B0,           // byte offset within piece: u32 BE
 L3, L2, L1, L0]           // block length: u32 BE (typically 16384 = 0x4000)
```

**piece:**
```
[LEN3, LEN2, LEN1, LEN0,  // length = 9 + block_length
 0x07,                      // message_id = 7
 I3, I2, I1, I0,           // piece index: u32 BE
 B3, B2, B1, B0,           // byte offset within piece: u32 BE
 D0, D1, D2, ...]          // block data (typically 16384 bytes)
```

### 1.3 BEP 10 Extension Handshake

After the BT handshake, peers supporting BEP 10 exchange an extended handshake (message_id=20, ext_msg_id=0). The payload is a bencoded dictionary.

**IC's extension handshake payload:**

```
d
  1:m d
    7:ic_auth  i1e
    11:ic_priority i2e
    11:ut_metadata i3e
  e
  1:v 18:Iron Curtain 0.1.0
  6:yourip 4:<4-byte IPv4 or 16-byte IPv6>
  12:ic_version i1e
  15:ic_capabilities i7e
  4:reqq i128e
e
```

Field descriptions:

| Key              | Type    | Description                                                                 |
|------------------|---------|-----------------------------------------------------------------------------|
| `m`              | dict    | Extension message ID mapping. Peers agree on IDs for each extension.        |
| `m.ic_auth`      | int     | Extension ID for IC authenticated announce token exchange.                  |
| `m.ic_priority`  | int     | Extension ID for IC piece priority hints.                                   |
| `m.ut_metadata`  | int     | Extension ID for BEP 9 metadata exchange.                                   |
| `v`              | string  | Client version string.                                                      |
| `yourip`         | bytes   | Remote peer's IP as seen by this peer.                                      |
| `ic_version`     | int     | IC extension protocol version (currently 1).                                |
| `ic_capabilities`| int     | Bitmask: bit 0 = desktop, bit 1 = browser/WASM, bit 2 = server/seed.       |
| `reqq`           | int     | Max outstanding request count this peer supports (IC default: 128).         |

### 1.4 IC Extension Messages (via BEP 10, message_id=20)

#### `ic_auth` — Authenticated Peer Token

Sent immediately after the extension handshake. Allows peers to prove community membership.

```
[LEN3, LEN2, LEN1, LEN0,    // length prefix
 0x14,                        // message_id = 20 (extended)
 EXT_ID,                      // ext_msg_id for ic_auth (negotiated in handshake)
 <bencoded payload>]
```

Bencoded payload:
```
d
  10:player_key 32:<32-byte Ed25519 public key>
  10:session_id 16:<16-byte random session identifier>
  9:issued_at i1740000000e
  9:signature 64:<64-byte Ed25519 signature over player_key || session_id || issued_at>
  12:community_id 32:<32-byte community server public key>
e
```

The receiving peer verifies the signature against the `player_key`. If the peer is a tracker or community server, it additionally verifies the `player_key` is registered in its community.

#### `ic_priority` — Piece Priority Hint

Sent by a peer to indicate piece urgency. This is advisory — the remote peer is not obligated to honor it, but well-behaved IC clients use it for scheduling.

```
[LEN3, LEN2, LEN1, LEN0,    // length prefix
 0x14,                        // message_id = 20 (extended)
 EXT_ID,                      // ext_msg_id for ic_priority (negotiated in handshake)
 <bencoded payload>]
```

Bencoded payload:
```
d
  6:pieces l i42e i43e i44e i100e e
  8:priority i2e
  6:reason 12:lobby-urgent
e
```

| Field      | Type      | Description                                                     |
|------------|-----------|-----------------------------------------------------------------|
| `pieces`   | list[int] | Piece indices this hint applies to.                             |
| `priority` | int       | 0 = background, 1 = user-requested, 2 = lobby-urgent.          |
| `reason`   | string    | Human-readable reason: `"lobby-urgent"`, `"user-requested"`, `"background"`, `"endgame"`. |

---

## 2. Piece Picker with Priority Channels

IC's piece picker extends standard rarest-first with three priority tiers and package awareness. The picker runs on every request cycle (when a request slot opens up).

### 2.1 Priority Tiers

| Tier | Value | Preemption | Use Case |
|------|-------|------------|----------|
| `LobbyUrgent` | 2 | Cancels in-flight background requests, reassigns bandwidth | Player joined lobby, needs mod NOW |
| `UserRequested` | 1 | Queues normally, does not preempt | Player clicked "Download" in Workshop browser |
| `Background` | 0 | Lowest priority, can be cancelled by higher tiers | Pre-fetch trending content, seed completion |

### 2.2 Data Structures

```rust
use std::collections::{BTreeMap, BinaryHeap, HashMap, HashSet};
use std::cmp::Reverse;

/// Piece index is a u32 (matches BT protocol)
type PieceIndex = u32;
type PackageId = [u8; 32]; // SHA-256 of package manifest

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum PiecePriority {
    Background = 0,
    UserRequested = 1,
    LobbyUrgent = 2,
}

/// Entry in the priority heap. Lower rarity = rarer = picked first.
#[derive(Debug, Clone, Eq, PartialEq)]
struct PieceEntry {
    rarity: u32,       // number of peers that have this piece
    piece_index: PieceIndex,
}

impl Ord for PieceEntry {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // Min-heap by rarity (rarest first), then by piece_index for determinism
        other.rarity.cmp(&self.rarity)
            .then_with(|| other.piece_index.cmp(&self.piece_index))
    }
}

impl PartialOrd for PieceEntry {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

struct PiecePicker {
    /// Priority queues: highest priority tier is checked first.
    /// Within each tier, pieces are ordered rarest-first.
    queues: BTreeMap<PiecePriority, BinaryHeap<PieceEntry>>,

    /// Maps piece index → package ID for package-aware scheduling.
    piece_to_package: HashMap<PieceIndex, PackageId>,

    /// Tracks which pieces are currently in-flight (requested but not yet received).
    in_flight: HashMap<PieceIndex, InFlightInfo>,

    /// Pieces we already have (verified).
    completed: HashSet<PieceIndex>,

    /// Rarity map: piece_index → count of peers that have it.
    rarity: HashMap<PieceIndex, u32>,

    /// Total pieces in the torrent.
    total_pieces: u32,
}

struct InFlightInfo {
    peer_id: [u8; 20],
    priority: PiecePriority,
    requested_at: std::time::Instant,
    block_offset: u32,
    block_length: u32,
}
```

### 2.3 Piece Pick Algorithm

```
FUNCTION pick_next_piece(picker, available_peers) -> Option<(PieceIndex, PeerId)>:
    // Phase 1: Check for endgame mode
    remaining = picker.total_pieces - picker.completed.len() - picker.in_flight.len()
    IF remaining <= ENDGAME_THRESHOLD (5):
        RETURN pick_endgame(picker, available_peers)

    // Phase 2: Iterate priority tiers from highest to lowest
    FOR priority IN [LobbyUrgent, UserRequested, Background]:
        queue = picker.queues[priority]
        IF queue.is_empty():
            CONTINUE

        // Phase 2a: If LobbyUrgent and we have Background in-flight, preempt
        IF priority == LobbyUrgent:
            preempt_background_requests(picker)

        // Phase 2b: Pick rarest piece from this tier that a peer can serve
        WHILE NOT queue.is_empty():
            entry = queue.peek()
            IF entry.piece_index IN picker.completed:
                queue.pop()  // already have it
                CONTINUE
            IF entry.piece_index IN picker.in_flight:
                // Already requested — skip unless endgame
                queue.pop()
                CONTINUE

            // Find a peer that has this piece
            candidate_peer = select_peer_for_piece(entry.piece_index, available_peers)
            IF candidate_peer IS SOME:
                queue.pop()
                RETURN Some((entry.piece_index, candidate_peer))
            ELSE:
                queue.pop()  // no peer can serve it now, skip
                CONTINUE

    RETURN None  // nothing to request

FUNCTION preempt_background_requests(picker):
    // Cancel all in-flight Background requests to free bandwidth for LobbyUrgent
    FOR (piece, info) IN picker.in_flight:
        IF info.priority == Background:
            send_cancel(info.peer_id, piece, info.block_offset, info.block_length)
            // Re-enqueue the piece at its original priority
            picker.queues[Background].push(PieceEntry {
                rarity: picker.rarity[piece],
                piece_index: piece,
            })
    picker.in_flight.retain(|_, info| info.priority != Background)

FUNCTION pick_endgame(picker, available_peers) -> Option<(PieceIndex, PeerId)>:
    // In endgame mode: request all missing pieces from ALL peers that have them.
    // On first receive, send cancel to all other peers.
    FOR piece_index IN 0..picker.total_pieces:
        IF piece_index IN picker.completed:
            CONTINUE
        FOR peer IN available_peers:
            IF peer.has_piece(piece_index) AND NOT already_requested_from(piece_index, peer):
                RETURN Some((piece_index, peer.id))
    RETURN None

FUNCTION select_peer_for_piece(piece_index, available_peers) -> Option<PeerId>:
    // From peers that have this piece, select the one with:
    // 1. Lowest current request count (spread load)
    // 2. Highest upload rate to us (reciprocity)
    // 3. Tiebreak: random
    candidates = available_peers
        .filter(|p| p.has_piece(piece_index) AND p.state == Unchoked AND p.request_count < MAX_REQUESTS_PER_PEER)
        .sort_by(|a, b| a.request_count.cmp(&b.request_count)
            .then(b.upload_rate.cmp(&a.upload_rate)))
    RETURN candidates.first().map(|p| p.id)
```

### 2.4 Pipeline Limits

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `MAX_REQUESTS_PER_PEER` | 3 | Prevents single-peer saturation; allows parallel utilization |
| `MAX_REQUESTS_PER_SWARM` | 5 | Limits total outstanding requests to prevent memory bloat |
| `ENDGAME_THRESHOLD` | 5 | Pieces remaining before endgame activates |
| `BLOCK_SIZE` | 16384 (16 KiB) | Standard BT block size, universally supported |
| `PIECE_SIZE` | 262144 (256 KiB) | IC default for Workshop packages; adjustable per torrent |
| `REQUEST_TIMEOUT` | 30 seconds | Time before an in-flight request is considered stalled and re-requested |

### 2.5 Rarity Updates

Rarity is updated on three events:
1. **`have` received from peer:** `rarity[piece] += 1`, re-insert into appropriate priority queue.
2. **`bitfield` received from peer:** update rarity for all pieces in the bitfield.
3. **Peer disconnects:** `rarity[piece] -= 1` for all pieces that peer had.

Priority assignment for newly discovered pieces:
- If piece belongs to a package with an active lobby-urgent request → `LobbyUrgent`
- If piece belongs to a package the user explicitly requested → `UserRequested`
- Otherwise → `Background`

---

## 3. Choking Algorithm

IC's choking algorithm is based on the standard BT tit-for-tat with IC-specific extensions for lobby context.

### 3.1 Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| `REGULAR_UNCHOKE_INTERVAL` | 10 seconds | How often to recalculate regular unchoke set |
| `OPTIMISTIC_UNCHOKE_INTERVAL` | 30 seconds | How often to rotate the optimistic unchoke slot |
| `MAX_UNCHOKED_PEERS` | 4 | Maximum regularly unchoked peers (excluding optimistic + lobby) |
| `OPTIMISTIC_UNCHOKE_SLOTS` | 1 | Number of optimistic unchoke slots |

### 3.2 Choking Round Pseudocode

```
FUNCTION run_choke_round(swarm_state):
    // ──── Phase 0: Lobby peers are NEVER choked ────
    lobby_peers = swarm_state.peers
        .filter(|p| p.has_lobby_urgent_interest)
    FOR peer IN lobby_peers:
        peer.choke_state = Unchoked
        peer.choke_reason = LobbyExempt

    non_lobby_peers = swarm_state.peers
        .filter(|p| NOT p.has_lobby_urgent_interest)

    // ──── Phase 1: Regular unchoke (every 10 seconds) ────
    IF time_since_last_regular_unchoke >= REGULAR_UNCHOKE_INTERVAL:

        IF swarm_state.am_seeding:
            // Seed mode: unchoke peers with lowest completion (help newcomers)
            ranked = non_lobby_peers
                .filter(|p| p.is_interested)
                .sort_by(|a, b| a.completion_pct.cmp(&b.completion_pct))  // lowest first
        ELSE:
            // Leech mode: unchoke peers who upload most to us (reciprocity)
            ranked = non_lobby_peers
                .filter(|p| p.is_interested)
                .sort_by(|a, b| b.upload_rate_to_us.cmp(&a.upload_rate_to_us))  // highest first

        unchoke_set = ranked.take(MAX_UNCHOKED_PEERS)
        choke_set = non_lobby_peers.difference(unchoke_set).difference(lobby_peers)

        FOR peer IN unchoke_set:
            IF peer.choke_state == Choked:
                send_unchoke(peer)
                peer.choke_state = Unchoked
                peer.choke_reason = Regular

        FOR peer IN choke_set:
            IF peer.choke_state == Unchoked AND peer.choke_reason != Optimistic:
                send_choke(peer)
                peer.choke_state = Choked

        swarm_state.last_regular_unchoke = now()

    // ──── Phase 2: Optimistic unchoke (every 30 seconds) ────
    IF time_since_last_optimistic_unchoke >= OPTIMISTIC_UNCHOKE_INTERVAL:

        // Choke the previous optimistic unchoke (if not in regular set or lobby set)
        IF swarm_state.optimistic_peer IS SOME:
            prev = swarm_state.optimistic_peer
            IF prev.choke_reason == Optimistic:
                send_choke(prev)
                prev.choke_state = Choked

        // Select a new random choked peer that is interested
        candidates = non_lobby_peers
            .filter(|p| p.choke_state == Choked AND p.is_interested)
        IF NOT candidates.is_empty():
            // Prefer peers we haven't unchoked recently (anti-starvation)
            // Weight newly connected peers 3x higher
            selected = weighted_random(candidates, weight_fn = |p| {
                IF p.connected_duration < Duration::secs(60): 3
                ELSE: 1
            })
            send_unchoke(selected)
            selected.choke_state = Unchoked
            selected.choke_reason = Optimistic
            swarm_state.optimistic_peer = Some(selected)

        swarm_state.last_optimistic_unchoke = now()
```

### 3.3 IC Extension: Lobby Peer Exemption

When a peer sends an `ic_priority` message with `priority = 2` (LobbyUrgent), that peer is flagged as `has_lobby_urgent_interest = true`. This flag means:

- The peer is **never choked** regardless of upload rate or reciprocity.
- The peer does **not** count toward the `MAX_UNCHOKED_PEERS` limit.
- If the peer already had pieces flowing at Background priority, those requests are upgraded.

The flag is cleared when the peer sends an `ic_priority` message with `priority < 2` or disconnects.

**Rationale:** A player waiting in a lobby for a mod download must not be blocked by the choking algorithm. Lobby-urgent is a social contract — the lobby is stalling because this player needs content. Every peer should cooperate.

### 3.4 Seed-Mode Choking

When IC is seeding (has all pieces), the upload strategy changes:

- **Regular unchoke:** Unchoke the 4 interested peers with the **lowest** completion percentage. This helps newcomers complete faster, which in turn creates more seeders.
- **Optimistic unchoke:** Same as leech mode — random choked interested peer every 30 seconds.
- **Lobby exemption:** Still applies. Lobby peers are never choked.

---

## 4. Authenticated Announce Protocol

IC extends BEP 15 (UDP Tracker Protocol) with authenticated announce. This allows IC's tracker to differentiate community members from anonymous peers and to enforce swarm policies (e.g., quarantined content restricted to verified members only).

### 4.1 Standard BEP 15 UDP Tracker Flow (Baseline)

```
Client                              Tracker
  |                                    |
  |--- Connect Request (16 bytes) ---->|
  |<-- Connect Response (16 bytes) ----|
  |                                    |
  |--- Announce Request (98+ bytes) -->|
  |<-- Announce Response (20+ bytes) --|
```

### 4.2 IC Announce Request (Extended BEP 15)

The standard BEP 15 announce request is 98 bytes. IC appends additional fields after byte 98.

```
Offset  Size   Field               Description
──────  ────   ─────               ───────────
0       8      connection_id       From connect response
8       4      action              1 = announce
12      4      transaction_id      Random u32, echoed in response
16      20     info_hash           SHA-1 of torrent info dict
36      20     peer_id             "-IC0100-" + 12 random bytes
56      8      downloaded          Bytes downloaded so far (u64 BE)
64      8      left                Bytes remaining (u64 BE)
72      8      uploaded            Bytes uploaded so far (u64 BE)
80      4      event              0=none, 1=completed, 2=started, 3=stopped
84      4      ip_address          0 = use sender IP (default)
88      4      key                 Random u32 for IP-change identification
92      4      num_want            Number of peers desired (-1 = default)
96      2      port                Listening port (u16 BE)
─── Standard BEP 15 ends at byte 98 ───
98      2      ic_version          IC protocol version (u16 BE, currently 1)
100     2      ic_token_len        Length of ic_token field (u16 BE)
102     var    ic_token            Auth token (see § 4.3). Length = ic_token_len.
102+T   2      ic_capabilities     Bitmask (u16 BE): bit 0=desktop, 1=browser, 2=server
```

**Total: 104 + ic_token_len bytes.**

If `ic_version` is 0 or the packet is exactly 98 bytes, the tracker treats it as a standard anonymous announce. This provides backward compatibility with non-IC clients.

### 4.3 Auth Token Format

The `ic_token` field contains a binary-packed authentication token:

```
Offset  Size   Field         Description
──────  ────   ─────         ───────────
0       32     player_key    Ed25519 public key of the announcing player
32      16     session_id    Random 16-byte session identifier (generated at client startup)
48      8      issued_at     Unix timestamp in seconds (u64 BE) when token was created
56      64     signature     Ed25519 signature over the concatenation: player_key || session_id || issued_at
```

**Total: 120 bytes.** So `ic_token_len` = 120 for v1 tokens.

#### Token Construction (Client Side)

```
message = player_key (32 bytes) || session_id (16 bytes) || issued_at (8 bytes BE)
signature = ed25519_sign(player_secret_key, message)
ic_token = player_key || session_id || issued_at || signature
```

#### Token Verification (Tracker Side)

```
FUNCTION verify_ic_token(token: IcToken) -> Result<(), AuthError>:
    // 1. Check token freshness (reject tokens older than 24 hours)
    IF now() - token.issued_at > Duration::hours(24):
        RETURN Err(TokenExpired)

    // 2. Verify Ed25519 signature
    message = token.player_key || token.session_id || token.issued_at
    IF NOT ed25519_verify(token.player_key, message, token.signature):
        RETURN Err(InvalidSignature)

    // 3. (Optional) Check if player_key is registered with this community
    IF community_requires_membership:
        IF NOT community_members.contains(token.player_key):
            RETURN Err(NotAMember)

    RETURN Ok(())
```

### 4.4 IC Announce Response (Extended BEP 15)

```
Offset  Size   Field               Description
──────  ────   ─────               ───────────
0       4      action              1 = announce
4       4      transaction_id      Echoed from request
8       4      interval            Re-announce interval in seconds
12      4      leechers            Number of leechers in swarm
16      4      seeders             Number of seeders in swarm
20      6*N    peers               Compact peer list (BEP 23): 4 bytes IP + 2 bytes port each
─── Standard BEP 15 ends here ───
20+6N   2      ic_flags            Bitmask (u16 BE): bit 0 = auth_accepted, bit 1 = swarm_restricted
22+6N   2      ic_advisory_count   Number of active CARs for this info_hash (u16 BE)
```

### 4.5 Swarm Access Control

| Content Type | Anonymous Peers | Authenticated Peers | Quarantined Content |
|-------------|----------------|--------------------|--------------------|
| Public packages | Allowed | Allowed | Not accessible |
| Community-only packages | Rejected (no peers returned) | Allowed | Not accessible |
| Quarantined packages | Rejected | Moderator-only | Moderators get peers |

The tracker uses the `ic_token` to determine access. Anonymous peers (no `ic_token` or `ic_version` = 0) receive peers only for public content. The tracker returns an empty peer list (not an error) for content the peer cannot access — this prevents information leakage about the existence of restricted swarms.

---

## 5. WebRTC Signaling Protocol

Browser builds cannot use TCP or UDP. IC uses WebRTC data channels as the transport layer, with the BT wire protocol running on top. Signaling is coordinated through the Workshop server's WebSocket endpoint, following the aquatic_ws pattern.

### 5.1 WebSocket Signaling Endpoint

```
wss://<workshop-host>:19710/ws/announce
```

The WebSocket connection serves dual purposes:
1. Standard WebTorrent-compatible signaling (peer discovery + WebRTC offer/answer relay)
2. IC extension messages (auth, priority hints)

### 5.2 Signaling Message Types

All messages are JSON over WebSocket text frames.

#### Announce (Browser → Tracker)

```json
{
    "action": "announce",
    "info_hash": "<40-char hex SHA-1>",
    "peer_id": "<40-char hex peer ID>",
    "offers": [
        {
            "offer_id": "<20-char hex random>",
            "offer": {
                "type": "offer",
                "sdp": "<SDP string>"
            }
        }
    ],
    "numwant": 5,
    "uploaded": 0,
    "downloaded": 0,
    "left": 1048576,
    "event": "started",
    "ic_version": 1,
    "ic_token": "<hex-encoded 120-byte auth token>"
}
```

The `offers` array contains pre-generated WebRTC offers. The tracker relays these to selected peers.

#### Offer Relay (Tracker → Desktop/Browser Peer)

```json
{
    "action": "announce",
    "info_hash": "<40-char hex SHA-1>",
    "peer_id": "<40-char hex offering peer's ID>",
    "offer_id": "<20-char hex>",
    "offer": {
        "type": "offer",
        "sdp": "<SDP string from offering peer>"
    }
}
```

#### Answer (Receiving Peer → Tracker → Offering Peer)

```json
{
    "action": "announce",
    "info_hash": "<40-char hex SHA-1>",
    "peer_id": "<40-char hex answering peer's ID>",
    "to_peer_id": "<40-char hex offering peer's ID>",
    "offer_id": "<20-char hex>",
    "answer": {
        "type": "answer",
        "sdp": "<SDP answer string>"
    }
}
```

#### ICE Candidate (Peer → Tracker → Peer)

For trickle ICE (optional, improves connection setup time):

```json
{
    "action": "ice_candidate",
    "info_hash": "<40-char hex SHA-1>",
    "peer_id": "<40-char hex sender's ID>",
    "to_peer_id": "<40-char hex recipient's ID>",
    "offer_id": "<20-char hex>",
    "candidate": {
        "candidate": "candidate:1 1 UDP 2130706431 192.168.1.100 54321 typ host",
        "sdpMLineIndex": 0,
        "sdpMid": "data"
    }
}
```

#### Scrape (Optional)

```json
{
    "action": "scrape",
    "info_hash": "<40-char hex SHA-1>"
}
```

Response:
```json
{
    "action": "scrape",
    "info_hash": "<40-char hex SHA-1>",
    "complete": 12,
    "incomplete": 3
}
```

### 5.3 Connection Flow

```
Browser Peer (WASM)        Workshop Server (WS Tracker)       Desktop Peer (TCP+WebRTC)
     |                              |                                   |
     |-- WS Connect --------------->|                                   |
     |-- Announce + SDP Offer ----->|                                   |
     |                              |-- Relay Offer ------------------->|
     |                              |                                   |
     |                              |<-- SDP Answer -------------------|
     |<-- Relay Answer -------------|                                   |
     |                              |                                   |
     |===================== WebRTC Data Channel ========================|
     |                                                                  |
     |-- BT Handshake (68 bytes) ------>                                |
     |<-- BT Handshake (68 bytes) ------|                               |
     |-- BEP 10 Extension Handshake --->                                |
     |<-- BEP 10 Extension Handshake ---|                               |
     |                                                                  |
     |<========= Standard BT wire protocol over data channel =========>|
```

### 5.4 Workshop Server as Bridge Node

The Workshop server (`ic-server` with workshop capability) speaks all three transports simultaneously:

```
                    ┌───────────────────────┐
                    │   ic-server Workshop  │
                    │                       │
Desktop ◄──TCP────►│   BT Wire Protocol    │◄──WebRTC──► Browser
Desktop ◄──uTP────►│   Engine              │◄──WebRTC──► Browser
                    │                       │
                    │   Piece Cache (disk)  │
                    └───────────────────────┘
```

- A piece received from a desktop peer over TCP is immediately available to browser peers over WebRTC, and vice versa.
- The server maintains a single unified piece store — no duplication between transport worlds.
- The server appears as a single peer in the swarm (one peer_id) but accepts connections on all transports.

### 5.5 WebRTC Data Channel Configuration

```javascript
// Browser-side (WASM via web-sys)
let config = RTCConfiguration {
    ice_servers: [
        { urls: "stun:stun.l.google.com:19302" },
        // Community servers can optionally run TURN for restrictive NATs
    ],
    bundle_policy: "max-bundle",
};

let data_channel_config = RTCDataChannelInit {
    ordered: true,          // BT wire protocol requires ordered delivery
    max_retransmits: null,  // Reliable delivery (no loss tolerance)
    protocol: "bittorrent", // Informational label
};
```

Data channel name: `"ic-bt"`. The data channel carries raw BT wire protocol bytes — the same byte stream that would flow over TCP. No additional framing is needed because WebRTC data channels provide message boundaries and reliable ordered delivery.

---

## 6. `icpkg` Binary Header

The `.icpkg` format is IC's Workshop package format. It is designed so that package metadata can be fetched with a single HTTP Range request (first 4096 bytes), while the actual content is a standard ZIP archive starting at a fixed offset.

### 6.1 Binary Layout

```
Offset      Size              Field                    Description
──────      ────              ─────                    ───────────
0           4                 magic                    "ICPK" (0x49, 0x43, 0x50, 0x4B)
4           2                 header_version           u16 LE. Currently 1.
6           4                 manifest_length          u32 LE. Byte length of the YAML manifest.
10          32                manifest_hash            SHA-256 of the manifest YAML bytes.
42          manifest_length   manifest                 UTF-8 encoded YAML manifest.
42+N        (4096-42-N)       padding                  Zero bytes. Pads to exactly 4096 bytes.
4096        (file_end-4096)   archive                  Standard ZIP archive (self-contained).
```

**Key invariants:**
- Bytes 0–4095 are always the header block (exactly 4096 bytes).
- The ZIP archive at offset 4096 is self-contained — it can be extracted independently if copied out.
- `manifest_length` MUST be ≤ 4022 bytes (4096 - 42 - 32 for hash - padding minimum 0).
- The `manifest_hash` covers bytes 42 through 42+manifest_length-1 (the raw manifest YAML).
- Padding bytes MUST all be zero.

### 6.2 Header Byte Map (First 42 Fixed Bytes)

```
 0  1  2  3    4  5    6  7  8  9    10 11 12 13 14 15 16 17 18 19
[I  C  P  K ] [VV VV] [LL LL LL LL] [H  H  H  H  H  H  H  H  H  H
magic          ver     manifest_len   manifest_hash (first 10 of 32)

20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41
 H  H  H  H  H  H  H  H  H  H  H  H  H  H  H  H  H  H  H  H  H  H]
manifest_hash (remaining 22 of 32)

42 ...                     → manifest YAML starts here
42+manifest_length ...     → zero padding to byte 4095
4096 ...                   → ZIP archive starts here
```

### 6.3 Manifest YAML Example

```yaml
package:
  name: "awesome-tanks"
  publisher: "coolmodder"
  version: "2.1.0"
  ic_format: 1
  description: "Adds 12 new tank units with custom sprites and balance."
  license: "CC-BY-4.0"

dependencies:
  - name: "ra-base-assets"
    version: ">=1.0.0"

content:
  type: "mod"                # mod | map | campaign | total-conversion | asset-pack
  game_module: "red-alert"   # which IC game module this targets
  tags: ["units", "vehicles", "balance"]

files:
  count: 47
  total_size: 8392704        # bytes, uncompressed
  archive_offset: 4096
  archive_size: 5242880      # bytes of ZIP data

hashes:
  archive_sha256: "a1b2c3d4e5f6..."    # SHA-256 of ZIP archive (bytes 4096..EOF)
  package_sha256: "f6e5d4c3b2a1..."    # SHA-256 of entire .icpkg file

torrent:
  piece_length: 262144       # 256 KiB
  pieces_sha1:               # SHA-1 of each piece (hex, for BT compatibility)
    - "da39a3ee5e6b4b0d3255bfef95601890afd80709"
    - "..."
  info_hash: "2c26b46b68ffc68ff99b453c1d30413413422d706483bda0"
```

### 6.4 HTTP Range Request for Metadata

A client discovering a package needs only the manifest to decide whether to download:

```http
GET /packages/coolmodder/awesome-tanks/2.1.0.icpkg HTTP/1.1
Host: workshop.example.com
Range: bytes=0-4095
```

Response (4096 bytes): contains magic, version, manifest length, manifest hash, the full YAML manifest, and padding. The client:
1. Verifies magic bytes = "ICPK"
2. Reads manifest_length, extracts manifest YAML
3. Computes SHA-256 of manifest, verifies against manifest_hash
4. Parses YAML to get package metadata, dependencies, torrent info
5. Decides whether to proceed with full P2P download

---

## 7. DHT Decision: Implement BEP 5

IC implements standard Kademlia DHT (BEP 5) for trackerless peer discovery. This ensures Workshop content remains available even when the community tracker is temporarily down.

### 7.1 DHT Node Identity

Each IC client generates a 160-bit (20-byte) DHT node ID on first startup, stored in the local config. The node ID is NOT the peer_id — it is a separate identifier for DHT routing.

### 7.2 DHT Message Types (BEP 5)

All DHT messages are bencoded dictionaries sent over UDP.

| Query | Purpose | Key Fields |
|-------|---------|------------|
| `ping` | Liveness check | `{t: txn_id, y: "q", q: "ping", a: {id: node_id}}` |
| `find_node` | Find nodes close to a target | `{..., q: "find_node", a: {id: node_id, target: target_id}}` |
| `get_peers` | Find peers for an info_hash | `{..., q: "get_peers", a: {id: node_id, info_hash: hash}}` |
| `announce_peer` | Announce presence in a swarm | `{..., q: "announce_peer", a: {id: node_id, info_hash: hash, port: u16, token: token}}` |

### 7.3 IC DHT Extension: `ic_capabilities` in Announce

IC extends the `announce_peer` message with an optional `ic_cap` field:

```
{
    t: <txn_id>,
    y: "q",
    q: "announce_peer",
    a: {
        id: <20-byte node ID>,
        info_hash: <20-byte info hash>,
        port: <u16>,
        token: <token from get_peers response>,
        ic_cap: <u16>   // IC extension: capabilities bitmask
    }
}
```

`ic_cap` bitmask:

| Bit | Meaning |
|-----|---------|
| 0   | Desktop client (TCP + uTP available) |
| 1   | Browser client (WebRTC only) |
| 2   | Workshop server / permanent seed |
| 3   | Supports ic_auth (authenticated peering) |
| 4   | Has WebRTC bridge capability |

Non-IC DHT nodes ignore the unknown `ic_cap` field (bencoding is extensible). IC nodes use `ic_cap` to prefer connecting to compatible peers — e.g., a browser client will prefer peers with bit 4 (WebRTC bridge) set.

### 7.4 Bootstrap Nodes

IC's DHT bootstraps from:

1. **Community seed list servers:** Servers listed in `community-servers.yaml` (D074 § 3) that have the `workshop` capability also serve as DHT bootstrap nodes. The DHT port is the standard BT port + 1 (default: 19712).
2. **Public DHT bootstrap nodes:** IC optionally connects to the public BitTorrent DHT (`router.bittorrent.com:6881`, `dht.transmissionbt.com:6881`) for maximum peer discovery reach. This is configurable — communities that want isolation can disable public DHT.
3. **Cached nodes:** On shutdown, IC persists the 8 closest known good DHT nodes. On next startup, these are tried first before bootstrap nodes.

### 7.5 Routing Table

Standard Kademlia k-bucket structure:
- 160 buckets (one per bit of the 160-bit node ID space)
- Each bucket holds up to k=8 nodes
- Nodes are sorted by last-seen time (LRU eviction)
- Bucket refresh: if a bucket hasn't been queried in 15 minutes, perform a `find_node` for a random ID in that bucket's range

### 7.6 Rationale

| Alternative | Why Not |
|-------------|---------|
| Tracker-only | Single point of failure. If the tracker is down, no peer discovery. DHT is the safety net. |
| Skip DHT, rely on seed list | Seed list is for community discovery, not per-torrent peer discovery. Different layer. |
| Custom DHT protocol | No benefit. BEP 5 is well-specified, battle-tested, and interoperable with the public BT network. IC's extensions are additive. |

---

## 8. WASM/Browser Constraints

Browser builds run as WASM in a web page. This environment imposes fundamental constraints on P2P networking.

### 8.1 Transport Limitations

| Capability | Browser | Desktop |
|------------|---------|---------|
| TCP sockets | Not available | Available |
| UDP sockets | Not available | Available |
| WebRTC data channels | Available (primary transport) | Available (for browser interop) |
| WebSocket | Available (for signaling only) | Available |
| HTTP fetch | Available (for metadata + fallback) | Available |

**Consequence:** Browser peers participate in the BT swarm exclusively through WebRTC data channels. They discover peers via the WebSocket signaling endpoint (§ 5) and establish direct WebRTC connections.

### 8.2 Connection Lifetime

- Browser P2P connections do not survive page navigation or tab closure.
- Background tabs may be throttled by the browser (reduced timers, suspended WebRTC).
- No persistent background process — seeding only happens while the page is open and active.

**Mitigation:** Browser peers are treated as transient. The Workshop server (permanent seed) ensures content availability regardless of browser peer churn.

### 8.3 Piece Cache: IndexedDB

Browser peers cache downloaded pieces in IndexedDB for persistence across page reloads (but not across cache clears or private browsing):

```typescript
// IndexedDB schema (conceptual — implemented in Rust via wasm-bindgen)
interface IcPieceStore {
    dbName: "ic-workshop-pieces";
    objectStore: "pieces";
    keyPath: "key";  // "${info_hash_hex}:${piece_index}"
    value: {
        key: string;
        info_hash: Uint8Array;    // 20 bytes
        piece_index: number;       // u32
        data: Uint8Array;          // piece data (typically 256 KiB)
        verified: boolean;         // SHA-1 verified
        cached_at: number;         // Unix timestamp
        package_id: string;        // for LRU eviction by package
    };
    indexes: ["info_hash", "cached_at"];
}
```

**Eviction policy:** LRU by `cached_at`, with a configurable max cache size (default: 500 MB). Pieces belonging to actively-used packages are pinned and exempt from eviction.

### 8.4 HTTP Fallback

When P2P is unavailable (no WebRTC peers, restrictive network, or WASM build without WebRTC support), the browser client falls back to HTTP Range requests against the Workshop server's REST API:

```http
GET /api/v1/packages/coolmodder/awesome-tanks/2.1.0/piece/42 HTTP/1.1
Host: workshop.example.com
```

Response: raw piece data (256 KiB), with `Content-Type: application/octet-stream` and `Content-Length` header.

Or for full package download:

```http
GET /api/v1/packages/coolmodder/awesome-tanks/2.1.0.icpkg HTTP/1.1
Host: workshop.example.com
Range: bytes=4096-
```

The HTTP fallback is intentionally simple — it is a degraded mode, not the primary delivery mechanism. The Workshop server serves the same bytes over HTTP that it seeds over BT.

### 8.5 Feature Matrix by Platform

| Feature | Desktop (Native) | Browser (WASM) |
|---------|-----------------|----------------|
| TCP BT wire protocol | Yes | No |
| uTP transport | Yes | No |
| WebRTC data channel | Yes (bridge mode) | Yes (primary) |
| DHT participation | Yes (full) | No (no UDP) |
| Persistent seeding | Yes (background process) | No (page lifetime only) |
| Piece cache | Disk (content-addressed store) | IndexedDB |
| HTTP fallback | Yes | Yes |
| Bandwidth control | Full (upload/download limits) | Limited (no OS-level socket control) |
| Authenticated announce (UDP tracker) | Yes | No (uses WS announce) |
| Authenticated announce (WS tracker) | Yes | Yes |

---

## 9. Rust Type Definitions

Core types for IC's P2P engine. These live in the `ic-net` crate (or a future `ic-p2p` sub-crate within `ic-net`).

```rust
use std::collections::{BTreeMap, BinaryHeap, HashMap, HashSet};
use std::net::SocketAddr;
use std::time::{Duration, Instant};

// ──────────────────────── Core Identifiers ────────────────────────

/// Index of a piece within a torrent. Matches BT protocol u32.
pub type PieceIndex = u32;

/// 20-byte SHA-1 info hash identifying a torrent/swarm.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct InfoHash(pub [u8; 20]);

/// 20-byte peer identifier. Format: "-IC0100-" + 12 random bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PeerId(pub [u8; 20]);

/// 32-byte SHA-256 package identifier (hash of package manifest).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PackageId(pub [u8; 32]);

// ──────────────────────── Peer State ────────────────────────

/// Choking state of a peer connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChokeState {
    Choked,
    Unchoked,
}

/// Reason a peer was unchoked (used for choke round bookkeeping).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnchokeReason {
    /// Unchoked as one of the top-N uploaders (reciprocity).
    Regular,
    /// Unchoked as the random optimistic slot.
    Optimistic,
    /// Unchoked because the peer has lobby-urgent interest (never choked).
    LobbyExempt,
}

/// Information about a connected peer.
#[derive(Debug, Clone)]
pub struct PeerInfo {
    pub peer_id: PeerId,
    pub addr: SocketAddr,
    /// Transport this peer is connected over.
    pub transport: Transport,
    /// Our choking state toward this peer.
    pub am_choking: ChokeState,
    /// Whether this peer is choking us.
    pub peer_choking: ChokeState,
    /// Whether we are interested in this peer's pieces.
    pub am_interested: bool,
    /// Whether this peer is interested in our pieces.
    pub peer_interested: bool,
    /// Reason for current unchoke (if unchoked).
    pub unchoke_reason: Option<UnchokeReason>,
    /// Bitfield of pieces this peer has.
    pub pieces: Vec<bool>,
    /// Bytes per second this peer is uploading to us.
    pub upload_rate_to_us: u64,
    /// Bytes per second we are uploading to this peer.
    pub upload_rate_from_us: u64,
    /// Number of currently outstanding requests to this peer.
    pub pending_requests: u32,
    /// Whether this peer has sent a lobby-urgent priority hint.
    pub has_lobby_urgent_interest: bool,
    /// Completion percentage (0.0–1.0) based on bitfield.
    pub completion_pct: f32,
    /// When this peer connected.
    pub connected_at: Instant,
    /// IC extension capabilities (None if peer is not an IC client).
    pub ic_extension: Option<IcExtension>,
}

/// Transport type for a peer connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transport {
    Tcp,
    Utp,
    WebRtc,
}

// ──────────────────────── Priority & Scheduling ────────────────────────

/// Priority channel for piece scheduling.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PriorityChannel {
    /// Pre-fetch trending content, fill out partial packages.
    Background = 0,
    /// Player explicitly clicked "Download" in Workshop browser.
    UserRequested = 1,
    /// Player is in a lobby waiting for this content. Maximum urgency.
    LobbyUrgent = 2,
}

/// A request for a specific block within a piece.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PieceRequest {
    /// Which piece.
    pub piece_index: PieceIndex,
    /// Byte offset within the piece where this block starts.
    pub block_offset: u32,
    /// Length of the block (typically 16384 bytes).
    pub block_length: u32,
    /// Priority of this request.
    pub priority: PriorityChannel,
    /// Which peer this request was sent to.
    pub peer: PeerId,
    /// When the request was sent.
    pub sent_at: Instant,
}

// ──────────────────────── Swarm State ────────────────────────

/// Top-level state for a single swarm (one torrent / one info_hash).
#[derive(Debug)]
pub struct SwarmState {
    pub info_hash: InfoHash,
    /// Total number of pieces in this torrent.
    pub total_pieces: u32,
    /// Piece length in bytes (typically 262144 = 256 KiB).
    pub piece_length: u32,
    /// Connected peers.
    pub peers: HashMap<PeerId, PeerInfo>,
    /// Which pieces we have (verified).
    pub completed_pieces: HashSet<PieceIndex>,
    /// In-flight requests.
    pub in_flight: Vec<PieceRequest>,
    /// Priority queues for piece selection.
    pub priority_queues: BTreeMap<PriorityChannel, BinaryHeap<PieceEntry>>,
    /// Piece-to-package mapping.
    pub piece_to_package: HashMap<PieceIndex, PackageId>,
    /// Rarity map: how many peers have each piece.
    pub rarity: HashMap<PieceIndex, u32>,
    /// Are we seeding (have all pieces)?
    pub am_seeding: bool,
    /// Timestamp of last regular choke round.
    pub last_regular_unchoke: Instant,
    /// Timestamp of last optimistic unchoke rotation.
    pub last_optimistic_unchoke: Instant,
    /// Current optimistic unchoke peer.
    pub optimistic_peer: Option<PeerId>,
    /// Bytes uploaded since session start.
    pub total_uploaded: u64,
    /// Bytes downloaded since session start.
    pub total_downloaded: u64,
}

/// Entry in the piece priority heap.
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct PieceEntry {
    /// Number of peers that have this piece (lower = rarer = higher priority).
    pub rarity: u32,
    /// The piece index.
    pub piece_index: PieceIndex,
}

// Ordering: rarest first (min-heap by rarity), then lowest index for determinism.
impl Ord for PieceEntry {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        other.rarity.cmp(&self.rarity)
            .then_with(|| other.piece_index.cmp(&self.piece_index))
    }
}

impl PartialOrd for PieceEntry {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

// ──────────────────────── IC Extensions ────────────────────────

/// IC-specific extension data negotiated during BEP 10 handshake.
#[derive(Debug, Clone)]
pub struct IcExtension {
    /// IC protocol version (currently 1).
    pub version: u16,
    /// Capabilities bitmask: bit 0=desktop, 1=browser, 2=server.
    pub capabilities: u16,
    /// Extension message ID for ic_auth (assigned during handshake).
    pub auth_msg_id: Option<u8>,
    /// Extension message ID for ic_priority (assigned during handshake).
    pub priority_msg_id: Option<u8>,
    /// Whether this peer has been authenticated.
    pub authenticated: bool,
    /// Community this peer belongs to (if authenticated).
    pub community_key: Option<[u8; 32]>,
}

/// Authentication token sent via ic_auth extension message.
#[derive(Debug, Clone)]
pub struct AuthToken {
    /// Ed25519 public key of the player (32 bytes).
    pub player_key: [u8; 32],
    /// Random session identifier (16 bytes, generated at client startup).
    pub session_id: [u8; 16],
    /// Unix timestamp (seconds) when the token was created.
    pub issued_at: u64,
    /// Ed25519 signature over (player_key || session_id || issued_at).
    pub signature: [u8; 64],
}

impl AuthToken {
    /// Total serialized size of the token.
    pub const WIRE_SIZE: usize = 32 + 16 + 8 + 64; // = 120 bytes

    /// Serialize to wire format.
    pub fn to_bytes(&self) -> [u8; Self::WIRE_SIZE] {
        let mut buf = [0u8; Self::WIRE_SIZE];
        buf[0..32].copy_from_slice(&self.player_key);
        buf[32..48].copy_from_slice(&self.session_id);
        buf[48..56].copy_from_slice(&self.issued_at.to_be_bytes());
        buf[56..120].copy_from_slice(&self.signature);
        buf
    }

    /// Deserialize from wire format.
    pub fn from_bytes(data: &[u8; Self::WIRE_SIZE]) -> Self {
        let mut player_key = [0u8; 32];
        let mut session_id = [0u8; 16];
        let mut signature = [0u8; 64];
        player_key.copy_from_slice(&data[0..32]);
        session_id.copy_from_slice(&data[32..48]);
        let issued_at = u64::from_be_bytes(data[48..56].try_into().unwrap());
        signature.copy_from_slice(&data[56..120]);
        Self { player_key, session_id, issued_at, signature }
    }
}

// ──────────────────────── Tracker Protocol ────────────────────────

/// IC-extended UDP announce request (§ 4.2).
#[derive(Debug, Clone)]
pub struct AnnounceRequest {
    /// Connection ID from connect response.
    pub connection_id: u64,
    /// Always 1 for announce.
    pub action: u32,
    /// Random transaction ID, echoed in response.
    pub transaction_id: u32,
    pub info_hash: InfoHash,
    pub peer_id: PeerId,
    pub downloaded: u64,
    pub left: u64,
    pub uploaded: u64,
    /// 0=none, 1=completed, 2=started, 3=stopped.
    pub event: u32,
    /// 0 = use sender's IP.
    pub ip_address: u32,
    /// Random key for IP-change identification.
    pub key: u32,
    /// Number of peers desired. -1 = default.
    pub num_want: i32,
    /// Listening port.
    pub port: u16,
    // ── IC extensions (present if ic_version > 0) ──
    /// IC protocol version (0 = standard BEP 15, no IC extensions).
    pub ic_version: u16,
    /// Authentication token (None for anonymous announce).
    pub ic_token: Option<AuthToken>,
    /// Capabilities bitmask.
    pub ic_capabilities: u16,
}

/// IC-extended UDP announce response (§ 4.4).
#[derive(Debug, Clone)]
pub struct AnnounceResponse {
    /// Always 1 for announce.
    pub action: u32,
    /// Echoed from request.
    pub transaction_id: u32,
    /// Re-announce interval in seconds.
    pub interval: u32,
    /// Number of leechers in swarm.
    pub leechers: u32,
    /// Number of seeders in swarm.
    pub seeders: u32,
    /// Compact peer list: (IPv4, port) pairs.
    pub peers: Vec<(std::net::Ipv4Addr, u16)>,
    // ── IC extensions ──
    /// Bitmask: bit 0 = auth_accepted, bit 1 = swarm_restricted.
    pub ic_flags: u16,
    /// Number of active Content Advisory Records for this info_hash.
    pub ic_advisory_count: u16,
}

// ──────────────────────── icpkg Header ────────────────────────

/// Parsed header from an .icpkg file (first 4096 bytes).
#[derive(Debug, Clone)]
pub struct IcpkgHeader {
    /// Magic bytes. Must be [0x49, 0x43, 0x50, 0x4B] ("ICPK").
    pub magic: [u8; 4],
    /// Header format version (u16 LE). Currently 1.
    pub header_version: u16,
    /// Length of the manifest YAML in bytes (u32 LE).
    pub manifest_length: u32,
    /// SHA-256 hash of the manifest YAML bytes.
    pub manifest_hash: [u8; 32],
    /// The raw manifest YAML (UTF-8).
    pub manifest_yaml: String,
}

impl IcpkgHeader {
    /// Magic bytes constant.
    pub const MAGIC: [u8; 4] = [0x49, 0x43, 0x50, 0x4B]; // "ICPK"

    /// The header block is always exactly this many bytes.
    pub const BLOCK_SIZE: usize = 4096;

    /// Offset where the ZIP archive begins.
    pub const ARCHIVE_OFFSET: usize = 4096;

    /// Maximum manifest length (4096 - 4 magic - 2 version - 4 length - 32 hash).
    pub const MAX_MANIFEST_LENGTH: usize = 4096 - 42;

    /// Parse an IcpkgHeader from the first 4096 bytes of a file.
    /// Returns Err if magic is wrong, manifest_length exceeds bounds,
    /// or manifest_hash does not match.
    pub fn parse(block: &[u8; Self::BLOCK_SIZE]) -> Result<Self, IcpkgError> {
        let magic: [u8; 4] = block[0..4].try_into().unwrap();
        if magic != Self::MAGIC {
            return Err(IcpkgError::BadMagic(magic));
        }

        let header_version = u16::from_le_bytes(block[4..6].try_into().unwrap());
        let manifest_length = u32::from_le_bytes(block[6..10].try_into().unwrap());

        if manifest_length as usize > Self::MAX_MANIFEST_LENGTH {
            return Err(IcpkgError::ManifestTooLarge(manifest_length));
        }

        let mut manifest_hash = [0u8; 32];
        manifest_hash.copy_from_slice(&block[10..42]);

        let manifest_end = 42 + manifest_length as usize;
        let manifest_bytes = &block[42..manifest_end];

        // Verify SHA-256
        // (In real code: use sha2 crate)
        // let computed = sha256(manifest_bytes);
        // if computed != manifest_hash { return Err(IcpkgError::HashMismatch); }

        let manifest_yaml = String::from_utf8(manifest_bytes.to_vec())
            .map_err(|_| IcpkgError::InvalidUtf8)?;

        // Verify padding is all zeros
        for &byte in &block[manifest_end..Self::BLOCK_SIZE] {
            if byte != 0 {
                return Err(IcpkgError::NonZeroPadding);
            }
        }

        Ok(Self {
            magic,
            header_version,
            manifest_length,
            manifest_hash,
            manifest_yaml,
        })
    }
}

#[derive(Debug)]
pub enum IcpkgError {
    BadMagic([u8; 4]),
    ManifestTooLarge(u32),
    HashMismatch,
    InvalidUtf8,
    NonZeroPadding,
}
```

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| **D049** (Workshop Asset Formats & Distribution) | Defines P2P distribution strategy, peer scoring formula, seeding config, `.icpkg` format concepts. This document specifies the wire-level implementation. |
| **D052** (Community Servers with Portable Signed Credentials) | Defines Ed25519 identity system, SCR format. IC auth tokens (§ 4) use the same Ed25519 key infrastructure. |
| **D074** (Community Server Bundle) | Defines `ic-server` as unified binary, Workshop-as-BT-seeder philosophy, capability flags, Content Advisory Records. This document provides the protocol internals. |
| **research/bittorrent-p2p-libraries.md** | Design study of existing P2P implementations. Architectural decisions referenced here are grounded in that study. |

---

## 10. Workshop Package ↔ BitTorrent Piece Mapping

This section specifies how `.icpkg` packages (D049) map to BitTorrent pieces — closing the gap between the Workshop's package format and the P2P wire protocol defined in §§ 1–9 above. An implementer reading D049 (package format) and this document (BT protocol) should need nothing else to build the download pipeline.

### 10.1 Piece Size

All `.icpkg` torrents use a **fixed piece length of 256 KiB (262,144 bytes)**.

**Rationale:** 16 KiB pieces produce unacceptably large bitfields for total-conversion mods (a 500 MB package would require ~32,000 pieces — 4 KB bitfield per peer, O(n²) overhead in swarm state). 1 MiB pieces waste bandwidth on the many small packages that are common in Workshop (maps, balance patches, palette swaps) — a 300 KB map mod would still require downloading a full 1 MiB piece. 256 KiB is the standard choice for medium-size torrents and matches `libtorrent`'s default, keeping bitfield overhead manageable (~2,000 pieces for 500 MB) while remaining efficient for packages as small as a few hundred KB.

This value is a protocol constant. Clients MUST reject `.icpkg` torrent metadata with any other piece length.

### 10.2 Chunking Strategy

The `.icpkg` file — header block (first 4,096 bytes) followed by the ZIP archive (offset 4096 onward) — is treated as a **single contiguous byte stream**. Pieces are sequential 256 KiB slices of this stream. The final piece may be shorter than 256 KiB.

This is standard BT single-file behavior (BEP 3). No file-aware chunking, padding, or alignment is needed.

- **Info hash** = `SHA-1(bencoded info dictionary containing piece hashes)` — standard BT.
- **Per-piece hash** = `SHA-1(256 KiB slice)` — standard BT.
- **Piece count** = `ceil(file_size / 262144)`.

### 10.3 Manifest-Only Fetch Optimization

The `.icpkg` header is exactly 4,096 bytes (see D049 § icpkg binary layout). It contains the package manifest (YAML), the manifest's SHA-256 hash, and zero-padded reserved space. Because 4,096 < 262,144, the **entire header fits within piece 0**.

Clients can exploit this to inspect a package's manifest *before* committing to a full download:

1. Request **only piece 0** from the swarm (standard BT piece request).
2. Parse the 4,096-byte header to extract the manifest YAML.
3. Check name, version, dependencies, file list, license metadata, `ai_usage` flags — all without downloading the payload.
4. If acceptable, continue downloading pieces 1..N. If not (wrong version, missing dependency, license conflict), disconnect without wasting bandwidth.

**Priority integration:** Piece 0 is always assigned `lobby-urgent` priority in the piece picker (§ 6). When the client begins a new download, piece 0 is requested immediately from all connected peers, overriding rarest-first ordering. Once piece 0 is received and the manifest is validated, the remaining pieces revert to standard rarest-first scheduling.

### 10.4 CAS Dedup vs. BT Immutability

The Workshop uses **content-addressed storage (CAS)** for blob-level deduplication on disk (D049 § content-addressed blob store). BitTorrent uses **immutable info hashes** to identify torrents. These two systems interact as follows:

**BT info hashes are per-package and immutable.** Each version of an `.icpkg` file has a unique info hash derived from its content. Updating a package (new version, patched asset) produces a new `.icpkg` with a new info hash — it is a **new torrent**.

**CAS dedup is a local client optimization only.** It is invisible to the BT protocol:

- If the client already has blob `X` from package A (stored under its SHA-256 in the local CAS), and package B contains the same blob, the client stores **one copy** on disk. The second reference is a hard-link or reflink (where the filesystem supports it), or a symlink fallback.
- From BT's perspective, packages A and B are independent torrents with independent piece sets. Seeding package A does not contribute pieces to package B's swarm, even if they share identical blobs.

**Cross-version piece sharing** (seeding old-version pieces into a new-version swarm) is **not supported** under standard BT, because different info hashes imply completely independent piece namespaces. If profiling reveals significant bandwidth waste from near-identical successive versions, two future BEPs could enable this:

- **BEP 47 (Padding Files):** Aligns file boundaries to piece boundaries, enabling shared pieces when files are identical across versions.
- **BEP 52 (BitTorrent v2):** Introduces per-file Merkle trees, allowing piece-level dedup across torrents sharing identical files.

Both are **explicitly deferred** — the current design uses BEP 3 single-file torrents. The CAS layer already eliminates redundant disk storage; cross-swarm piece sharing is a future optimization, not a launch requirement.

### 10.5 Small Package Optimization

Workshop packages under 256 KiB (single piece) are common: individual maps, balance presets, palette swaps, small script libraries. For these, BitTorrent swarm overhead exceeds the transfer cost.

**Policy:** Packages that fit in a single BT piece (≤ 262,144 bytes) are served via **HTTP Range request fallback** from the Workshop server's REST API. No BT swarm is established.

- The Workshop server stores the `.icpkg` file and serves it directly over HTTPS.
- The client fetches the file with a standard `GET` request (or `Range` request for resume support).
- SHA-256 verification proceeds identically to the BT path — the integrity guarantee is the same.

**BT activation threshold:** P2P distribution activates only for packages exceeding 1 piece. This threshold is configurable in `settings.toml` (`workshop.p2p_min_pieces`, default `2`) — operators of community servers with generous bandwidth may raise it to reduce tracker load for medium packages.

This aligns with the size strategy table in D049 (< 5 MB → HTTP direct only), but enforces a hard floor at the piece level to avoid degenerate single-piece swarms.

### 10.6 Info Dictionary Format

The `.torrent` info dictionary for `.icpkg` packages follows standard BEP 3 single-file format (bencoded):

```
{
  "name": "<publisher>-<package>-<version>.icpkg",
  "piece length": 262144,
  "length": <total .icpkg file size in bytes>,
  "pieces": <concatenated SHA-1 hashes, 20 bytes per piece>
}
```

- **`name`**: Uses the Workshop's canonical naming convention: `<publisher>-<package>-<version>.icpkg` (e.g., `westwood-ra-hd-sprites-2.1.0.icpkg`). This is informational — the client uses the registry manifest, not the torrent name, for installation paths.
- **`piece length`**: Always 262,144. Clients MUST reject other values (§ 10.1).
- **`length`**: Total file size including the 4,096-byte header and the ZIP archive payload.
- **`pieces`**: Concatenated 20-byte SHA-1 hashes, one per piece. Length = `20 * ceil(length / 262144)`.

The info hash announced to the tracker (§ 4) and exchanged in the handshake (§ 1.1) is `SHA-1(bencode(info_dict))`.

### 10.7 Cross-References

| Reference | Relationship |
|-----------|-------------|
| **D049** (Workshop Asset Formats & Distribution) | Defines `.icpkg` binary layout (4,096-byte header + ZIP), CAS blob store, manifest schema, size-based delivery strategy. This section specifies the BT piece mapping for that format. |
| **D030** (Workshop Registry & Dependency System) | Defines package identities, versioning, dependency resolution. Package naming in § 10.6 follows D030 conventions. |
| **§ 6** (Piece Picker & Priority Channels) | `lobby-urgent` priority channel used for piece 0 manifest-only fetch (§ 10.3). |
| **§ 5** (Choking Algorithm) | Upload slot allocation applies unchanged — small packages bypass BT entirely (§ 10.5), large packages use standard choking. |
| **§ 4** (Tracker Protocol) | Announce/scrape for `.icpkg` torrents uses the IC-extended UDP tracker protocol with auth tokens. |
