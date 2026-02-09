# Minetest (Luanti) & Lichess — Architecture Analysis

> Research for Iron Curtain. Concrete technical findings from source code analysis.
> Repos: [minetest/minetest](https://github.com/minetest/minetest), [lichess-org/lila](https://github.com/lichess-org/lila)

---

## Table of Contents

- [Minetest (Luanti) \& Lichess — Architecture Analysis](#minetest-luanti--lichess--architecture-analysis)
  - [Table of Contents](#table-of-contents)
  - [Minetest — Overview](#minetest--overview)
    - [Why Study This](#why-study-this)
  - [Minetest — Custom UDP Transport (MTP)](#minetest--custom-udp-transport-mtp)
    - [Dual-Thread Architecture](#dual-thread-architecture)
    - [Per-Peer RTT/Jitter Statistics](#per-peer-rttjitter-statistics)
  - [Minetest — Channel-Based Reliable/Unreliable Messaging](#minetest--channel-based-reliableunreliable-messaging)
    - [Per-Channel Reliability](#per-channel-reliability)
  - [Minetest — SRP Authentication Protocol](#minetest--srp-authentication-protocol)
    - [Zero-Knowledge Password Proof](#zero-knowledge-password-proof)
  - [Minetest — Client State Machine](#minetest--client-state-machine)
    - [Rigorous Connection Lifecycle](#rigorous-connection-lifecycle)
  - [Minetest — Anti-Cheat: LagPool \& Movement Validation](#minetest--anti-cheat-lagpool--movement-validation)
    - [LagPool: Time-Budget Anti-Cheat](#lagpool-time-budget-anti-cheat)
    - [Server-Side Movement Validation](#server-side-movement-validation)
  - [Minetest — CSM Restriction Flags (Client-Side Mod Sandboxing)](#minetest--csm-restriction-flags-client-side-mod-sandboxing)
    - [Server-Controlled Client Mod Permissions](#server-controlled-client-mod-permissions)
  - [Minetest — Content-Addressed Media Delivery](#minetest--content-addressed-media-delivery)
    - [SHA1-Based Asset Distribution](#sha1-based-asset-distribution)
    - [Dynamic Media Push](#dynamic-media-push)
  - [Minetest — Anti-Amplification \& Rate Limiting](#minetest--anti-amplification--rate-limiting)
    - [Half-Open Connection Anti-DDoS](#half-open-connection-anti-ddos)
    - [Receive-Side Rate Limiting](#receive-side-rate-limiting)
  - [Minetest — Active Block System (Spatial Interest Management)](#minetest--active-block-system-spatial-interest-management)
    - [Player-Radius-Based Activation](#player-radius-based-activation)
  - [Lichess — Overview](#lichess--overview)
    - [Why Study This](#why-study-this-1)
  - [Lichess — Dual AI Anti-Cheat (Irwin \& Kaladin)](#lichess--dual-ai-anti-cheat-irwin--kaladin)
    - [Two Independent Detection Systems](#two-independent-detection-systems)
  - [Lichess — PlayerFlags Pattern Matching (Statistical Cheat Detection)](#lichess--playerflags-pattern-matching-statistical-cheat-detection)
    - [Eight Binary Flags → Deterministic Classification](#eight-binary-flags--deterministic-classification)
  - [Lichess — Auto-Analysis Trigger Heuristics](#lichess--auto-analysis-trigger-heuristics)
    - [Smart Game Selection for Anti-Cheat Analysis](#smart-game-selection-for-anti-cheat-analysis)
  - [Lichess — WMMatching (Weighted Maximum Matching for Pools)](#lichess--wmmatching-weighted-maximum-matching-for-pools)
    - [Optimal Pairing via Graph Theory](#optimal-pairing-via-graph-theory)
    - [Pair Score Function](#pair-score-function)
    - [Rating-Dependent Max Score](#rating-dependent-max-score)
  - [Lichess — Lame Player Segregation \& RageSit Counter](#lichess--lame-player-segregation--ragesit-counter)
    - [Behavioral Reputation System](#behavioral-reputation-system)
    - [Miss Bonus (Urgency)](#miss-bonus-urgency)
  - [Lichess — Glicko Rating With Color Advantage \& Regulation](#lichess--glicko-rating-with-color-advantage--regulation)
    - [Color Advantage Correction](#color-advantage-correction)
    - [Speed-Specific Rating Inflation Control](#speed-specific-rating-inflation-control)
    - [Bot Game Rating Halving](#bot-game-rating-halving)
  - [Lichess — Arena Tournament Scoring (Streaks, Berserk, Draw Penalties)](#lichess--arena-tournament-scoring-streaks-berserk-draw-penalties)
    - [Bitfield-Encoded Score Components](#bitfield-encoded-score-components)
    - [Scoring Rules](#scoring-rules)
    - [Fire/Streak Mechanic](#firestreak-mechanic)
    - [Draw Streak Penalty](#draw-streak-penalty)
    - [Berserk Mechanic](#berserk-mechanic)
  - [Lichess — Swiss Tournament (FIDE TRF, Virtual Opponents, Forbidden Pairings)](#lichess--swiss-tournament-fide-trf-virtual-opponents-forbidden-pairings)
    - [FIDE Tournament Report Format](#fide-tournament-report-format)
    - [Sonneborn-Berger Tiebreak With Virtual Opponents for Byes](#sonneborn-berger-tiebreak-with-virtual-opponents-for-byes)
    - [Forbidden Pairings](#forbidden-pairings)
  - [Lichess — Arena Pairing System (AntmaPairing + Color History)](#lichess--arena-pairing-system-antmapairing--color-history)
    - [Weighted Maximum Matching for Arena Tournaments](#weighted-maximum-matching-for-arena-tournaments)
    - [Dynamic Rank Factor](#dynamic-rank-factor)
    - [Tiered Pairing Strategy](#tiered-pairing-strategy)
  - [Lichess — Wave-Based Pool Matchmaking](#lichess--wave-based-pool-matchmaking)
    - [Wave Actor Model](#wave-actor-model)
    - [Anti-Double-Pairing](#anti-double-pairing)
    - [Liveness Tracking](#liveness-tracking)
  - [Comparative Analysis](#comparative-analysis)
    - [Anti-Cheat Approaches](#anti-cheat-approaches)
    - [Matchmaking Algorithms](#matchmaking-algorithms)
    - [Rating Systems](#rating-systems)
    - [Tournament Formats](#tournament-formats)
  - [Techniques Worth Adopting for Iron Curtain](#techniques-worth-adopting-for-iron-curtain)
    - [1. LagPool Time-Budget Rate Limiting (from Minetest)](#1-lagpool-time-budget-rate-limiting-from-minetest)
    - [2. Half-Open Connection Anti-Amplification (from Minetest)](#2-half-open-connection-anti-amplification-from-minetest)
    - [3. SRP Authentication for Self-Hosted Servers (from Minetest)](#3-srp-authentication-for-self-hosted-servers-from-minetest)
    - [4. CSM Restriction Flags as Capability Manifest Template (from Minetest)](#4-csm-restriction-flags-as-capability-manifest-template-from-minetest)
    - [5. Dual AI Anti-Cheat With Tiered Actions (from Lichess)](#5-dual-ai-anti-cheat-with-tiered-actions-from-lichess)
    - [6. PlayerFlags Pattern Matching for RTS (from Lichess)](#6-playerflags-pattern-matching-for-rts-from-lichess)
    - [7. WMMatching for Matchmaking Pools (from Lichess)](#7-wmmatching-for-matchmaking-pools-from-lichess)
    - [8. Wave-Based Pool Architecture (from Lichess)](#8-wave-based-pool-architecture-from-lichess)
    - [9. Arena Scoring: Fire/Streak/Berserk/Draw Penalty (from Lichess)](#9-arena-scoring-firestreakberserkdraw-penalty-from-lichess)
    - [10. Speed-Specific Rating Inflation Factors (from Lichess)](#10-speed-specific-rating-inflation-factors-from-lichess)
    - [11. Content-Addressed Asset Delivery (from Minetest)](#11-content-addressed-asset-delivery-from-minetest)
    - [12. Swiss Tournament Virtual Opponents for Byes (from Lichess)](#12-swiss-tournament-virtual-opponents-for-byes-from-lichess)
    - [Novel Patterns Not Found in Previous Research](#novel-patterns-not-found-in-previous-research)

---

## Minetest — Overview

**Language:** C++ (with Lua scripting)
**Transport:** Custom UDP protocol ("MTP" — Minetest Transport Protocol)
**Model:** Client-server authoritative (server runs full sim, validates client actions)
**Content delivery:** SHA1-based content addressing with zstd compression
**Key source paths:** `src/network/networkprotocol.h`, `src/network/mtp/impl.h`, `src/server.h`, `src/server/player_sao.h`, `src/server/clientiface.h`

### Why Study This

Minetest is a mature open-source voxel engine with 15+ years of refinement on its networking stack. While not an RTS, it solves problems IC will face: secure authentication without a central account server, server-controlled client mod sandboxing, content-addressed asset delivery to arbitrary clients, and anti-cheat in an environment where clients have full mod access. Its SRP auth, CSM restriction flags, LagPool anti-cheat, and media delivery system are all novel compared to previously analyzed games.

---

## Minetest — Custom UDP Transport (MTP)

### Dual-Thread Architecture

Minetest's connection layer uses dedicated send and receive threads, with the game loop communicating via thread-safe queues:

```
src/network/mtp/impl.h — Connection class
```

```cpp
class Connection final : public IConnection {
    UDPSocket m_udpSocket;
    // Command queue: user -> SendThread
    MutexedQueue<ConnectionCommandPtr> m_command_queue;
    // Event queue: ReceiveThread -> user
    MutexedQueue<ConnectionEventPtr> m_event_queue;
    
    std::unique_ptr<ConnectionSendThread> m_sendThread;
    std::unique_ptr<ConnectionReceiveThread> m_receiveThread;
    
    std::map<session_t, Peer *> m_peers;
};
```

The send thread manages packet serialization, reliable retransmission, and per-peer packet quotas. The receive thread handles deserialization, split packet reassembly, and protocol-level flow control. This decoupling means the game loop never blocks on network I/O.

```
src/network/mtp/threads.h — Send thread internals
```

```cpp
class ConnectionSendThread : public Thread {
    unsigned int m_max_packet_size;
    float m_timeout;
    std::queue<OutgoingPacket> m_outgoing_queue;
    unsigned int m_max_data_packets_per_iteration;
    unsigned int m_max_packets_requeued = 256;
};
```

**Iron Curtain relevance:** IC's relay server will need similar decoupling — the sim tick must never block on network I/O. The dual-queue pattern (command queue in, event queue out) maps cleanly to IC's `NetworkModel` interface where orders come in and state/events go out.

### Per-Peer RTT/Jitter Statistics

Every peer tracks detailed round-trip statistics:

```
src/network/mtp/impl.h — RTT statistics struct
```

```cpp
struct rttstats {
    float jitter_min = FLT_MAX;
    float jitter_max = 0.0f;
    float jitter_avg = -1.0f;
    float min_rtt = FLT_MAX;
    float max_rtt = 0.0f;
    float avg_rtt = -1.0f;
};
```

Six stat types are queryable per peer: `MIN_RTT`, `MAX_RTT`, `AVG_RTT`, `MIN_JITTER`, `MAX_JITTER`, `AVG_JITTER`. These are computed from rolling samples (default 1000-sample window via `RTTStatistics()`). The connection also tracks per-connection rate stats via `getLocalStat(rate_stat_type)`.

**Iron Curtain relevance:** IC's relay server needs per-client RTT/jitter tracking for adaptive run-ahead (D007, inspired by Generals' netcode). Minetest's 6-metric stat model is more granular than most — IC should track at minimum avg_rtt and avg_jitter per player for the relay server's latency-adaptive tick scheduling.

---

## Minetest — Channel-Based Reliable/Unreliable Messaging

### Per-Channel Reliability

Every message specifies both a channel number and a reliability flag:

```
src/network/mtp/impl.h — Send signature
```

```cpp
void Send(session_t peer_id, u8 channelnum, NetworkPacket *pkt, bool reliable);
```

Channels provide independent ordered streams — reliable messages on channel 0 don't block unreliable messages on channel 1. The receive thread handles four packet types, each with a dedicated handler:

```
src/network/mtp/threads.h — Packet type routing
```

```cpp
struct PacketTypeHandler {
    SharedBuffer<u8> (ConnectionReceiveThread::*handler)(
        Channel *channel, const SharedBuffer<u8> &packet,
        Peer *peer, u8 channelnum, bool reliable);
};

// Four packet types: Control, Original, Split, Reliable
static const PacketTypeHandler packetTypeRouter[PACKET_TYPE_MAX];
```

Split packets handle oversized payloads via `addSplitPacket()` with per-channel sequence numbers (`getNextSplitSequenceNumber(u8 channel)`). This allows large terrain data to split across packets without fragmenting small order messages on other channels.

**Iron Curtain relevance:** IC's relay protocol should use separate channels: orders on a reliable ordered channel, voice/chat on a reliable unordered channel, spectator state diffs on an unreliable channel. This is more granular than the single-channel approach seen in OpenBW or DDNet.

---

## Minetest — SRP Authentication Protocol

### Zero-Knowledge Password Proof

Minetest uses SRP (Secure Remote Password) for authentication — the server never sees or stores the player's password, only a verifier derived from it:

```
src/network/networkprotocol.h — Auth mechanism flags
```

```cpp
enum AuthMechanism {
    AUTH_MECHANISM_NONE = 0,
    AUTH_MECHANISM_LEGACY_PASSWORD = 1 << 0,  // deprecated
    AUTH_MECHANISM_SRP = 1 << 1,              // primary
    AUTH_MECHANISM_FIRST_SRP = 1 << 2,        // account creation
};
```

The handshake flow:
1. Client → `TOSERVER_INIT` (protocol version, player name)
2. Server → `TOCLIENT_HELLO` (allowed auth mechanisms, SRP salt + verifier params)
3. Client → `TOSERVER_SRP_BYTES_A` (SRP ephemeral public value)
4. Server → `TOCLIENT_SRP_BYTES_S_B` (server proof + ephemeral)
5. Client → `TOSERVER_SRP_BYTES_M` (client proof)
6. Server → `TOCLIENT_AUTH_ACCEPT` (success + player position)

The server stores `enc_pwd` (the SRP verifier) and negotiates mechanism via `allowed_auth_mechs` bitmask. First-time accounts use `AUTH_MECHANISM_FIRST_SRP` to create the verifier.

```
src/server/clientiface.h — Per-client auth state
```

```cpp
class RemoteClient {
    std::string enc_pwd = "";
    bool create_player_on_auth_success = false;
    AuthMechanism chosen_mech = AUTH_MECHANISM_NONE;
    void *auth_data = nullptr;
    u32 allowed_auth_mechs = 0;
};
```

**Iron Curtain relevance:** IC uses Ed25519 session keys for order signing (D006 security model). SRP is complementary — it solves the *authentication* problem (proving identity) while Ed25519 solves *integrity* (proving orders weren't tampered). For IC's self-hosted community servers (where players don't have Steam/platform accounts), SRP would let server operators run account systems without ever handling plaintext passwords. This is especially relevant for the "community self-hosting is a first-class use case" principle.

---

## Minetest — Client State Machine

### Rigorous Connection Lifecycle

Every client connection transitions through a well-defined state machine with 9 states:

```
src/server/clientiface.h — Client states
```

```cpp
enum ClientState {
    CS_Invalid,
    CS_Disconnecting,
    CS_Denied,
    CS_Created,        // peer connected, no data yet
    CS_HelloSent,      // server sent HELLO, awaiting auth
    CS_AwaitingInit2,  // auth passed, awaiting INIT2
    CS_InitDone,       // definitions being sent
    CS_DefinitionsSent,// media transfer complete
    CS_Active,         // fully connected, playing
    CS_SudoMode        // elevated privileges (password change)
};
```

State transitions are enforced by `notifyEvent(ClientStateEvent)` — only valid transitions are allowed. The key design insight: there's a fixed timeout on the init/auth phase:

```cpp
// Note that this puts a fixed timeout on the init & auth phase for a client.
// (lingering is enforced until CS_InitDone)
static constexpr int LINGER_TIMEOUT = 12; // seconds
```

Any client that doesn't complete authentication within 12 seconds is dropped. This prevents slowloris-style attacks where a connection is opened but never completes the handshake.

The `CS_SudoMode` state is notable — it allows a fully-connected player to temporarily elevate privileges for sensitive operations (password change), requiring re-authentication. After the operation completes, the client returns to `CS_Active`.

**Iron Curtain relevance:** IC's relay server should implement a similar strict state machine for connections. The 12-second linger timeout is a simple but effective DoS mitigation. The SudoMode concept could apply to IC's tournament mode — a player could temporarily elevate to "tournament admin" mode with re-authentication.

---

## Minetest — Anti-Cheat: LagPool & Movement Validation

### LagPool: Time-Budget Anti-Cheat

Minetest's most novel anti-cheat mechanism is `LagPool` — a time-based budget that limits how fast a player can perform actions:

```
src/server/player_sao.h — LagPool implementation
```

```cpp
class LagPool {
    float m_pool = 15.0f;  // current budget
    float m_max = 15.0f;   // max budget

    void add(float dtime) {
        m_pool -= dtime;
        if (m_pool < 0) m_pool = 0;
    }

    bool grab(float dtime) {
        if (dtime <= 0) return true;
        if (m_pool + dtime > m_max) return false;  // over budget!
        m_pool += dtime;
        return true;
    }
};
```

Two pools exist per player: `m_dig_pool` (for block digging) and `m_move_pool` (for movement). The pool replenishes over real time and is consumed by actions. If a player acts faster than the pool fills, the action is rejected. This elegantly handles lag compensation — legitimate lag causes the pool to fill up, giving the player a burst budget when they reconnect. But sustained cheating (speed hacking, insta-mining) drains the pool dry.

### Server-Side Movement Validation

```
src/server/player_sao.h — Movement cheat detection
```

```cpp
class PlayerSAO {
    // Cheat prevention
    LagPool m_dig_pool;
    LagPool m_move_pool;
    v3f m_last_good_position;
    float m_time_from_last_teleport = 0.0f;
    float m_time_from_last_punch = 0.0f;
    v3s16 m_nocheat_dig_pos = v3s16(32767, 32767, 32767);
    float m_nocheat_dig_time = 0.0f;
    v3f m_max_speed_override = v3f(0.0f, 0.0f, 0.0f);

    bool checkMovementCheat();  // returns true if cheated
};
```

The server tracks the "last good position" and teleports cheaters back. The `nocheat_dig_pos`/`nocheat_dig_time` pair validates that digging started at the correct position and took sufficient time.

Server-side anti-cheat flags categorize violations:

```
src/server.h — Anti-cheat flag categories
```

```cpp
// Actions: FLAG_MOD_MASK (0x0FFF) | TYPE_MASK (0xF000)
// Types:
#define AC_DIGGING      0x01 // digging too fast, wrong position
#define AC_INTERACTION  0x02 // interact from too far, wrong target
#define AC_MOVEMENT     0x04 // moving too fast, teleporting
```

**Iron Curtain relevance:** The LagPool pattern is directly applicable to IC's order validation. Instead of hard `max_orders_per_tick` caps, IC could use a time-budget pool per player: placing buildings, issuing move commands, and queuing production all consume from the pool. The pool refills at a rate matching legitimate play speed. This is more nuanced than the hard caps described in AGENTS.md's `ProtocolLimits.max_orders_per_tick`. Combined with the relay server's tick ownership, this creates layered rate limiting: architectural (relay owns clock) + behavioral (LagPool catches burst abuse).

---

## Minetest — CSM Restriction Flags (Client-Side Mod Sandboxing)

### Server-Controlled Client Mod Permissions

Minetest allows servers to restrict what client-side mods (CSMs) can do — a form of runtime sandboxing controlled by the server:

```
src/network/networkprotocol.h — CSM restriction flags
```

```cpp
enum CSMRestrictionFlags : u64 {
    CSM_RF_NONE = 0x00000000,
    CSM_RF_LOAD_CLIENT_MODS  = 0x00000001, // block CSM loading entirely
    CSM_RF_CHAT_MESSAGES     = 0x00000002, // block CSM chat sends
    CSM_RF_READ_ITEMDEFS     = 0x00000004, // block item definition access
    CSM_RF_READ_NODEDEFS     = 0x00000008, // block node definition access
    CSM_RF_LOOKUP_NODES      = 0x00000010, // block node lookups (anti-xray)
    CSM_RF_READ_PLAYERINFO   = 0x00000020, // block player info access
};
```

The server sends `TOCLIENT_CSM_RESTRICTION_FLAGS` after authentication, and the client is expected to enforce these restrictions. The `CSM_RF_LOOKUP_NODES` flag is specifically designed to combat x-ray mods — if the server blocks node lookups, a client mod can't query what blocks are behind walls.

**Iron Curtain relevance:** This maps directly to IC's WASM mod capability system (AGENTS.md security model: "Capability-based API. No `get_all_units()` — only `get_visible_units()`"). Minetest validates that IC's approach of per-capability sandboxing is viable in production. The key difference: in IC, restrictions are architectural (WASM modules physically can't access APIs they weren't granted), while in Minetest they're cooperative (the client is *asked* to restrict CSMs). IC's approach is strictly stronger, but Minetest's flag system could serve as a template for the capability manifest format.

---

## Minetest — Content-Addressed Media Delivery

### SHA1-Based Asset Distribution

Minetest's media delivery system uses content-addressed hashing for efficient asset distribution:

```
src/server.h — Media info structure
```

```cpp
struct MediaInfo {
    std::string path;
    std::string sha1_digest;  // content hash = identity
};

// Server maintains a media map
std::unordered_map<std::string, MediaInfo> m_media;
```

The delivery protocol works in two phases:

1. **Announce:** Server sends `TOCLIENT_ANNOUNCE_MEDIA` — a list of all media files with their SHA1 hashes and an optional remote media server URL.
2. **Request:** Client compares hashes against its local cache, sends `TOSERVER_REQUEST_MEDIA` only for files it doesn't have.

```
src/network/networkprotocol.h — Media protocol messages
```

```cpp
// Announce: lists all media with hashes + optional remote URL
TOCLIENT_ANNOUNCE_MEDIA = 0x3C,
// Client requests specific files by name
TOSERVER_REQUEST_MEDIA = 0x24,
// Server sends requested media (zstd compressed)
TOCLIENT_MEDIA = 0x38,
```

The `zstd` compression is applied to media payloads. An optional "remote media server" URL lets servers offload bandwidth to HTTP CDNs — the game server only serves media that the CDN doesn't have.

### Dynamic Media Push

```
src/server.h — Dynamic media at runtime
```

```cpp
bool sendMediaData(session_t peer_id, const std::string &name,
                   const std::string &data);
// Client receives: TOCLIENT_MEDIA_PUSH_HASH_SET
```

Servers can push new media at runtime (mods adding textures, custom sounds). The client tracks which media it has already received (`m_media_sent` set) to prevent duplicate transfers:

```cpp
bool markMediaSent(const std::string &name) {
    auto insert_result = m_media_sent.emplace(name);
    return insert_result.second; // true = was inserted (new)
}
```

**Iron Curtain relevance:** IC's workshop resource registry (D030) needs a content-addressed system for mod assets. Minetest's SHA1 + remote URL + dedup pattern is production-proven. IC should use SHA-256 (as D030 specifies) but follow the same announce→request→deliver protocol. The remote media server concept maps to IC's CDN plans for workshop content. The dedup tracking prevents bandwidth consumption attacks (also seen in clientiface.h comments).

---

## Minetest — Anti-Amplification & Rate Limiting

### Half-Open Connection Anti-DDoS

Minetest has a specific defense against UDP amplification attacks — connections are "half-open" until the client proves it received the server's response:

```
src/network/mtp/impl.h — Half-open connection tracking
```

```cpp
class Peer {
    /*
     * Until the peer has communicated with us using their assigned peer id
     * the connection is considered half-open.
     * During this time we inhibit re-sending any reliables or pings. This
     * is to avoid spending too many resources on a potential DoS attack
     * and to make sure Minetest servers are not useful for UDP amplification.
     */
    bool m_half_open = true;
    
    void SetFullyOpen() {
        MutexAutoLock lock(m_exclusive_access_mutex);
        m_half_open = false;
    }
};
```

While half-open, the server won't retransmit reliable packets or send pings — cutting the amplification factor to near zero. Only after the client proves liveness (by using its assigned peer_id in a response) does the connection become fully open.

### Receive-Side Rate Limiting

The receive thread has per-second rate limiting for new peer connection attempts:

```
src/network/mtp/threads.h — Rate limiter for new connections
```

```cpp
struct RateLimitHelper {
    u64 time = 0;
    int counter = 0;
    bool logged = false;

    void tick() {
        u64 now = porting::getTimeS();
        if (time != now) {
            time = now;
            counter = 0;
            logged = false;
        }
    }
};

RateLimitHelper m_new_peer_ratelimit;
```

This prevents connection storms. The `logged` flag ensures only one warning per second to avoid log flooding.

**Iron Curtain relevance:** IC's relay server should implement half-open connection tracking. The principle is simple: don't invest resources (reliable retransmission, tick slot allocation, memory) in a connection until the client proves it's legitimate. This is more efficient than the "receive-side parsers had zero bounds checking" problem identified in Generals' source code (AGENTS.md security model). The rate limiter for new connections is essential for any public-facing relay.

---

## Minetest — Active Block System (Spatial Interest Management)

### Player-Radius-Based Activation

Minetest only simulates world regions near active players, using an `ActiveBlockList`:

```
src/serverenvironment.h — Active block management
```

```cpp
class ActiveBlockList {
    // Updates the active block set based on player positions
    // Each player defines an activation radius
    // Only blocks within the radius are "active" (ticked)
};
```

The `GetNextBlocks()` method on `RemoteClient` uses priority-sorted block transfers:

```
src/server/clientiface.h — Priority block sending
```

```cpp
struct PrioritySortedBlockTransfer {
    float priority;    // lower = higher priority
    v3s16 pos;         // block position
    session_t peer_id;
    
    bool operator < (const PrioritySortedBlockTransfer &other) const {
        return priority < other.priority;
    }
};
```

Blocks closer to the player get higher priority. The system also tracks:
- `m_blocks_sent` — blocks the client has (don't re-send)
- `m_blocks_sending` — blocks currently in-flight (throttle)
- `m_blocks_occ` — blocks occluded at current distance (skip)

**Iron Curtain relevance:** While IC's lockstep model requires all clients to have the same sim state, the *render* side benefits from similar interest management. The relay server (in fog-authoritative mode, future `FogAuthoritativeNetwork`) would need exactly this pattern — only send entity data within each player's fog-of-war radius. The priority-sorted transfer queue is also useful for IC's spectator streaming.

---

## Lichess — Overview

**Language:** Scala (server) + TypeScript (client)
**Architecture:** Monolithic server (`lila`) with modular structure, MongoDB + Redis
**Anti-cheat:** Dual AI system (Irwin + Kaladin) + statistical pattern matching
**Matchmaking:** Wave-based pool system with WMMatching algorithm
**Rating:** Glicko-2 with color advantage correction and speed-specific inflation regulation
**Tournaments:** Arena (streak-based scoring) + Swiss (FIDE-compliant TRF format)
**Key source paths:** `modules/irwin/`, `modules/evaluation/`, `modules/pool/`, `modules/rating/`, `modules/tournament/arena/`, `modules/swiss/`

### Why Study This

Lichess is the largest open-source competitive gaming platform — 100M+ games played, 10M+ registered users, sophisticated anti-cheat that's evolved over a decade. While it's turn-based (chess), the competitive infrastructure problems are identical to IC's: how to detect cheaters without kernel-level anti-cheat, how to pair players fairly with varying skill levels, and how to run tournaments at scale. Lichess's solutions are battle-tested at a scale no open-source RTS has achieved.

---

## Lichess — Dual AI Anti-Cheat (Irwin & Kaladin)

### Two Independent Detection Systems

Lichess runs two separate AI anti-cheat systems in parallel, each with independent thresholds for auto-marking (banning) vs. reporting (flagging for human review):

**Irwin** (older system) — activation percentage model:

```
modules/irwin/src/main/IrwinApi.scala — Irwin mark/report thresholds
```

```scala
lazy val thresholds = IrwinThresholds.makeSetting("irwin", settingStore)

private def markOrReport(report: IrwinReport): Funit =
  userApi.getTitle(report.suspectId.value).flatMap { title =>
    if report.activation >= thresholds.get().mark && title.isEmpty then
      // Auto-mark (ban) — but ONLY if player has no title
      modApi.autoMark(report.suspectId, report.note)
    else if report.activation >= thresholds.get().report then
      // Auto-report (flag for human moderator review)
      reportApi.create(Report.Candidate(
        reporter = Reporter(irwin.user),
        suspect = suspect,
        reason = lila.report.Reason.Cheat,
        text = s"${report.activation}% over ${report.games.size} games"
      ))
    else funit
  }
```

Critical design choice: **titled players (GMs, IMs, etc.) are never auto-banned** — they only get reports for human review. This prevents false-positive PR disasters.

Irwin processes games with full analysis (engine evaluation per move), streaming game data including PGN, move times, and centipawn analysis values to an external AI model.

**Kaladin** (newer system) — prediction-based model with priority queue:

```
modules/irwin/src/main/KaladinApi.scala — Kaladin priority and prediction
```

```scala
private def request(sus: Suspect, requester: KaladinUser.Requester) =
  sus.user.noBot.so:
    sequence(sus):
      _.fold(KaladinUser.make(sus, requester).some)(_.queueAgain(requester))
        .so: req =>
          for
            user <- userApi.withPerfs(sus.user)
            enoughMoves <- hasEnoughRecentMoves(user)
            _ <- if enoughMoves then
              insightApi.indexAll(user.user, force = false) >>
              coll(_.update.one($id(req.id), req, upsert = true)).void
            else funit
          yield ()
```

Kaladin requires a minimum of **1050 recent moves** in blitz or rapid games (last 6 months) before analyzing a player. This prevents false positives on inactive players or those with too few samples.

```scala
private val minMoves = 1050
```

Kaladin's priority queue weights suspicion sources:

| Priority Source   | Weight |
| ----------------- | ------ |
| Moderator request | 100    |
| Cheat report      | 30     |
| Tournament leader | 20     |
| Top online player | 10     |

Kaladin's `readResponses` polls for completed analyses and processes them:

```scala
private def markOrReport(user: KaladinUser, pred: KaladinUser.Pred): Funit =
  if pred.percent >= thresholds.get().mark then
    userApi.getTitle(user.id).dmap(_.isDefined).flatMap:
      if _ then sendReport  // titled? report only
      else modApi.autoMark(user.suspectId, pred.note)  // no title? auto-ban
  else if pred.percent >= thresholds.get().report then sendReport
  else funit
```

**Iron Curtain relevance:** IC plans "relay-side behavioral analysis (APM patterns, reaction times, input entropy)" per AGENTS.md security model. Lichess demonstrates that detection should be multi-layered with independent systems, threshold-separated into auto-action vs. human-review tiers, and protected by a celebrity exception (top-ranked or titled players require human review). For IC: auto-ban threshold and report-to-moderator threshold should be separate, configurable, and titled/top-ranked players should never be auto-banned. The priority queue concept is directly useful — tournament leaders and top ladder players should be checked first since cheating there has highest impact.

---

## Lichess — PlayerFlags Pattern Matching (Statistical Cheat Detection)

### Eight Binary Flags → Deterministic Classification

Lichess computes 8 binary flags per game, then uses pattern matching against these flags to produce a deterministic classification:

```
modules/evaluation/src/main/PlayerAssessment.scala — Flag computation
```

```scala
lazy val flags: PlayerFlags = PlayerFlags(
  suspiciousErrorRate,          // SF1: low average centipawn loss
  alwaysHasAdvantage,           // SF2: never in a losing position
  highBlurRate || highChunkBlurRate,  // BLR1: tab-out detected (blur API)
  moderateBlurRate || moderateChunkBlurRate, // BLR2: moderate tab-outs
  highlyConsistentMoveTimes || highlyConsistentMoveTimeStreaksOf(pov), // HCMT
  moderatelyConsistentMoveTimes(pov), // MCMT
  noFastMoves(pov),             // NFM: no moves faster than X
  basics.hold                    // Holds: mouse hold alerts
)
```

The flags are then matched against known cheat patterns:

```scala
def assessment: GameAssessment =
  import GameAssessment.*
  val assessment = flags match
    //              SF1 SF2 BLR1 BLR2 HCMT MCMT NFM Holds
    case PlayerFlags(T, _, T, _, _, _, T, _) => Cheating
    case PlayerFlags(T, _, _, T, _, _, _, _) => Cheating
    case PlayerFlags(T, _, _, _, T, _, _, _) => Cheating
    case PlayerFlags(_, _, T, _, T, _, _, _) => Cheating
    case PlayerFlags(_, _, _, T, _, T, _, _) => LikelyCheating
    case PlayerFlags(T, _, _, _, _, _, _, T) => LikelyCheating
    case PlayerFlags(_, _, _, _, T, _, _, _) => LikelyCheating
    case PlayerFlags(_, T, T, _, _, _, _, _) => LikelyCheating
    case PlayerFlags(_, T, _, _, _, T, T, _) => Unclear
    case PlayerFlags(T, _, _, _, _, T, T, _) => Unclear
    case PlayerFlags(T, _, _, F, _, F, T, _) => Unclear
    case PlayerFlags(T, _, _, _, _, _, F, _) => UnlikelyCheating
    case PlayerFlags(F, F, _, _, _, _, _, _) => NotCheating
    case _                                   => NotCheating
```

Key detection signals:
- **Blur detection:** Lichess's browser client fires "blur" events when the player tabs away to an analysis tool. `highestChunkBlursOf` checks sliding 12-move windows.
- **Move time consistency:** `moveTimeCoefVariation < 0.47` indicates inhumanly consistent timing (engine copy-paste).
- **Highly consistent move time streaks:** Sliding windows of CVs, only in games with > 60 seconds estimated total time.
- **No fast moves:** Absence of fast moves combined with high accuracy is suspicious — humans occasionally move quickly even when playing well.
- **Hold alert:** The browser client detects mouse-hold patterns (selecting a piece, holding it while engine evaluates, then placing it).

The classification is then adjusted:
- In antichess variant, extra leniency (many consecutive bishop moves are natural strategy, not a sign of engine use)
- Losing players get one tier more lenient classification
- Time control factor adjusts severity: `Bullet/Blitz → 1.25`, `Rapid → 1.0`, `Classical → 0.6`

**Iron Curtain relevance:** IC doesn't have browser blur events, but the pattern-matching approach is gold. Translate to RTS: compute flags like "inhuman APM consistency" (CV of APM over time), "perfect micro" (no wasted clicks, every click is a valid order), "impossible reaction time" (reacting to fog-revealed units in < 100ms), "no idle time" (human players have natural pauses), "consistent order timing" (bot-like regularity in build queue timing). Use the same flag → pattern → classification → action pipeline. The time-control factor maps to game speed settings — faster game speeds should have lower detection thresholds since humans are sloppier under time pressure.

---

## Lichess — Auto-Analysis Trigger Heuristics

### Smart Game Selection for Anti-Cheat Analysis

Not every game is analyzed — Lichess selects games based on suspicious signals:

```
modules/mod/src/main/AssessApi.scala — Auto-analysis triggers
```

```scala
val shouldAnalyse: Fu[Option[AutoAnalysis.Reason]] =
  if !gameApi.analysable(game) then fuccess(none)
  // Titled players always get analyzed
  else if game.speed >= chess.Speed.Blitz && players.exists(_.user.hasTitle) then
    fuccess(TitledPlayer.some)
  else if !game.source.exists(assessableSources.contains) then fuccess(none)
  else if game.isCorrespondence then fuccess(none)     // skip correspondence
  else if game.playedPlies < PlayerAssessment.minPlies then fuccess(none) // too short (<36 plies)
  else if game.playedPlies > 95 then fuccess(none)     // too long
  else if game.rated.no then fuccess(none)              // casual games skipped
  else if game.createdAt.isBefore(bottomDate) then fuccess(none)  // older than 6 months
  else if isUpset then fuccess(Upset.some)              // big rating upset (winner 250+ below loser)
  else if suspCoefVariation(White) then fuccess(WhiteMoveTime.some)
  else if suspCoefVariation(Black) then fuccess(BlackMoveTime.some)
  else
    gameRepo.holdAlert.game(game).map { holdAlerts =>
      if lila.game.Player.HoldAlert.suspicious(holdAlerts) then HoldAlert.some
      else if game.speed == chess.Speed.Bullet && randomPercent(70) then none
      else if game.players.exists(manyBlurs) then Blurs.some
      else if game.players.exists(winnerGreatProgress) then WinnerRatingProgress.some
      // New players who win get extra scrutiny (75% chance)
      else if winnerNbGames.so(_ < 40) && randomPercent(75) then NewPlayerWin.some
      else none
    }
```

Notable triggers:
- **Upset detection:** Winner rated 250+ below stable-rated loser → always analyze
- **Rating progress:** Winner gaining 80+ rating points → analyze
- **New player wins:** Players with < 40 games who win → 75% chance of analysis
- **Bullet game sampling:** 70% of bullet games are *skipped* even with other signals (too much noise)

The assessable sources are limited: `Lobby, Pool, Arena, Swiss, Simul` — friend games and API games are excluded.

**Iron Curtain relevance:** IC shouldn't analyze every match. Translate: analyze when a player's rating jumps dramatically, when a low-game-count player beats experienced players, when a player wins a tournament or reaches top ladder positions. Random sampling a percentage of other rated matches. Skip unrated/custom games entirely. This conserves server resources while focusing detection where cheating has the most impact.

---

## Lichess — WMMatching (Weighted Maximum Matching for Pools)

### Optimal Pairing via Graph Theory

Lichess uses the WMMatching algorithm (Blossom V / Edmonds' maximum weight matching) to find globally optimal pairings in matchmaking pools:

```
modules/pool/src/main/MatchMaking.scala — Core matching logic
```

```scala
object MatchMaking:
  def apply(members: Vector[PoolMember]): Vector[Couple] =
    val (lames, fairs) = members.partition(_.lame)
    naive(lames) ++ (wmMatching(fairs) | naive(fairs))
```

The key insight: **lame players are segregated first**, then fair players get optimal matching. If WMMatching fails (rare edge cases), it falls back to naive rank-sorted pairing.

### Pair Score Function

The quality of every potential pairing is a single integer — lower is better, `None` means forbidden:

```scala
private def pairScore(a: PoolMember, b: PoolMember): Option[Int] =
  val conflict =
    a.userId == b.userId ||           // can't play yourself
    ratingRangeConflict(a, b) ||      // outside preferred range
    ratingRangeConflict(b, a) ||
    blockList(a, b) ||                // mutual blocks
    blockList(b, a)
  if conflict then none
  else
    val score =
      a.ratingDiff(b).value           // base: rating difference
        - missBonus(a).atMost(missBonus(b))  // urgency bonus
        - rangeBonus(a, b)            // both have compatible ranges
        - ragesitBonus(a, b)          // behavior matching
        - provisionalBonus(a, b)      // both provisional? pair them
    score.some.filter(_ <= ratingToMaxScore(a.rating.atMost(b.rating)))
```

### Rating-Dependent Max Score

A pairing is **forbidden** if the score exceeds a rating-dependent threshold:

```scala
private def ratingToMaxScore(rating: IntRating) =
  if rating < IntRating(1000) then 130
  else if rating < IntRating(1500) then 100
  else rating.value / 15
```

At 1500 rating, matching is tightest (max score 100). Below 1000, matching is looser (130). Above 1500, matching loosens proportionally — at 3000, max score is 200. This means beginners and experts have wider pools, while the "average" rating range has the strictest matching quality.

**Iron Curtain relevance:** IC plans Glicko-2 ratings (AGENTS.md competitive infrastructure). The WMMatching algorithm should be adopted for IC's matchmaking pool. The pair score function translates directly: `ratingDiff - missBonus - mapPreferenceBonus - ragesitBonus`. The rating-dependent max score ensures tight matching where the player population is dense and looser matching at rating extremes where the population is sparse.

---

## Lichess — Lame Player Segregation & RageSit Counter

### Behavioral Reputation System

Lichess maintains a `rageSitCounter` per player that tracks rage-quit behavior. This counter affects matchmaking in two ways:

1. **Lame segregation:** Players flagged as "lame" (e.g., sandbagging, detected cheaters awaiting review) are paired only with other lame players via `naive()` — they don't get WMMatching quality.

2. **RageSit-based pairing affinity:**

```
modules/pool/src/main/MatchMaking.scala — RageSit bonus
```

```scala
private def ragesitBonus(a: PoolMember, b: PoolMember) =
  if a.rageSitCounter >= -2 && b.rageSitCounter >= -2 then 30      // good + good = bonus
  else if a.rageSitCounter <= -12 && b.rageSitCounter <= -12 then 60 // very bad + very bad
  else if a.rageSitCounter <= -5 && b.rageSitCounter <= -5 then 30   // bad + bad
  else (abs(a.rageSitCounter - b.rageSitCounter).atMost(10)) * -20   // mismatch = penalty
```

The scoring creates three behavioral tiers:
- **Good players** (counter ≥ -2): Paired with each other preferentially (+30 bonus)
- **Bad players** (counter ≤ -5): Paired with each other (+30 bonus)
- **Very bad players** (counter ≤ -12): Strongly bonded to each other (+60 bonus)
- **Mismatch** (good paired with bad): Up to -200 penalty, effectively forbidden

### Miss Bonus (Urgency)

The miss bonus increases every wave a player waits without being paired:

```scala
private def missBonus(p: PoolMember) =
  (p.misses * 12)
    .atMost(460 + (p.rageSitCounter.atMost(-3)) * 20) // capped, lower for bad sit counter
    .atLeast(0)
```

Players with bad rageSit counters have a *lower maximum miss bonus* — they wait longer and the system works less hard to find them matches. At counter -3, max miss bonus drops from 460 to 400; at -13, it drops to 200.

**Iron Curtain relevance:** IC should implement a similar behavioral reputation system. Track: leaving ranked games before they end, surrendering repeatedly in first 2 minutes (sandbagging), disconnecting without returning. The tiered pairing (good with good, bad with bad) protects the experience of honorable players without outright banning. The miss bonus cap based on behavior is especially elegant — rage-quitters naturally face longer queue times without explicit punishment.

---

## Lichess — Glicko Rating With Color Advantage & Regulation

### Color Advantage Correction

Lichess uses different Glicko calculators depending on the variant, each with a different color advantage correction:

```
modules/rating/src/main/Glicko.scala — Calculator variants
```

```scala
val calculator = GlickoCalculator(ratingPeriodsPerDay = periodsPerDay)

val calculatorWithCrazyhouseAdvantage = GlickoCalculator(
  ratingPeriodsPerDay = periodsPerDay,
  colorAdvantage = ColorAdvantage.crazyhouse
)

val calculatorWithStandardAdvantage = GlickoCalculator(
  ratingPeriodsPerDay = periodsPerDay,
  colorAdvantage = ColorAdvantage.standard
)
```

Key parameters:
- `periodsPerDay = 0.21436` — chosen so a typical player's rating deviation goes from 60→110 in 1 year of inactivity
- `maxRatingDelta = 700` — single-game rating swing cap
- `minRating = 400`, `maxRating = 4000` — absolute bounds
- `defaultVolatility = 0.09`, `maxVolatility = 0.1` — tight volatility range
- `pairingDefault = 1450` (not 1500) — virtual rating for first pairing to make expected score 50% without changing the actual default rating
- `defaultBot = 3000` — bots start at high rating to avoid stomping new players

### Speed-Specific Rating Inflation Control

```
modules/rating/src/main/RatingRegulator.scala — Inflation factors
```

```scala
private val factors = Map(
  PerfKey.rapid     -> 1.015,
  PerfKey.classical -> 1.010,
  PerfKey.blitz     -> 1.005,
  PerfKey.bullet    -> 1.010,
  PerfKey.ultraBullet -> 1.013,
  PerfKey.atomic    -> 1.02,
  PerfKey.antichess -> 1.02
)
```

When a player **gains** rating, the gain is multiplied by the speed-specific factor. Losses are not modified. This counteracts the natural rating deflation that occurs in zero-sum rating systems as players leave, and the factors differ per speed because different time controls have different deflation rates.

### Bot Game Rating Halving

```scala
val halvedAgainstBot = regulated.mapWithColor: (color, glicko) =>
  if !isBot(color) && isBot(!color)
  then glicko.average(before(color))  // halve the rating change
  else glicko
```

Rating changes against bots are halved by averaging the post-game rating with the pre-game rating. This prevents farming bots for rating inflation.

**Iron Curtain relevance:** IC plans Glicko-2 (AGENTS.md). Adopt the speed-specific inflation factors — IC will have different game speeds that should have different deflation characteristics. The `pairingDefault` of 1450 (lower than actual default of 1500) is a clever trick for first-game pairing fairness. Bot game halving maps directly — IC could have AI opponents with ratings, and halving gains prevents farming. The volatility bounds (0.09 ± 0.01) prevent rating oscillation and should be adopted. Per-queue ratings (1v1, 2v2, FFA per AGENTS.md) need separate inflation factors.

---

## Lichess — Arena Tournament Scoring (Streaks, Berserk, Draw Penalties)

### Bitfield-Encoded Score Components

Arena scoring uses a compact bitfield encoding for each game result:

```
modules/tournament/src/main/arena/ArenaSheet.scala — Score encoding
```

```scala
object Flag:
  val Null    = Flag(0)    // draw during draw streak → 0 points
  val Normal  = Flag(1)    // standard
  val StreakStarter = Flag(2) // first win in streak
  val Double  = Flag(3)    // on fire! → double points

object Berserk:
  val No      = Berserk(0 << 2)
  val Valid   = Berserk(1 << 2)  // berserked AND not-so-quick finish
  val Invalid = Berserk(2 << 2)  // berserked but game too quick

object Result:
  val Win  = Result(0 << 4)
  val Draw = Result(1 << 4)
  val Loss = Result(2 << 4)
  val DQ   = Result(3 << 4)  // quick draw → penalized

extension (s: Score)
  def flag: Flag       = Flag(s & 0x3)
  def berserk: Berserk = Berserk(s & (0x3 << 2))
  def res: Result      = Result(s & (0x3 << 4))
```

### Scoring Rules

```scala
def value: Int = ((res, flag) match
  case (Result.Win, Flag.Double) => 4  // win on fire = 4 pts
  case (Result.Win, _)           => 2  // normal win = 2 pts
  case (Result.Draw, Flag.Double) => 2 // draw on fire = 2 pts
  case (Result.Draw, Flag.Null)  => 0  // draw during draw streak = 0 pts!
  case (Result.Draw, _)          => 1  // normal draw = 1 pt
  case _                         => 0  // loss = 0
) + {
  if res == Result.Win && berserk == Berserk.Valid then 1 else 0 // berserk win bonus
}
```

### Fire/Streak Mechanic

The "on fire" state activates after two consecutive wins:

```scala
def isOnFire: Boolean =
  scores.headOption.exists(_.res == Result.Win) &&
  scores.lift(1).exists(_.res == Result.Win)
```

While on fire, wins are worth 4 points and draws are worth 2. A streak-starting win is tagged with `Flag.StreakStarter` — if the next game is a loss, it reverts to `Flag.Normal` retroactively.

### Draw Streak Penalty

Consecutive draws beyond the first are nullified to discourage draw farming:

```scala
@scala.annotation.tailrec
private def isDrawStreak(scores: List[Score]): Boolean =
  scores match
    case Nil => false
    case (s: Score) :: more =>
      s.isWin match
        case None       => true    // previous was also a draw → streak
        case Some(true) => false   // previous was a win → no streak
        case Some(false) => isDrawStreak(more) // previous was loss → keep checking
```

Additionally, draws in long games from bot players are always flagged `Null`:

```scala
if version != V1 && (!p.longGame(variant) || isBotSync(userId)) && isDrawStreak(scores)
then Flag.Null  // 0 points for draw during draw streak
```

### Berserk Mechanic

Players can "berserk" — halving their clock time for a chance at +1 point on win. But the game must not be too quick, or the berserk is invalidated:

```scala
val berserk =
  if p.berserkOf(userId) then
    if p.notSoQuickFinish then Berserk.Valid   // earned the bonus
    else Berserk.Invalid                        // game too short, no bonus
  else Berserk.No
```

**Iron Curtain relevance:** IC plans arena tournaments with "streak/fire bonuses, berserk mechanic" (AGENTS.md competitive infrastructure). Lichess provides the gold-standard implementation. The bitfield encoding is efficiently serializable. The draw streak penalty prevents boring play — in an RTS arena, this translates to penalizing repeated draws (stalemates/timeouts). The berserk mechanic could map to an RTS concept like "playing with a handicap" (fewer starting units? shorter build time?) for bonus points. The retroactive flag rewrite (StreakStarter → Normal on loss) is a subtle detail that makes the streak system feel fair.

---

## Lichess — Swiss Tournament (FIDE TRF, Virtual Opponents, Forbidden Pairings)

### FIDE Tournament Report Format

Lichess outputs Swiss tournament data in FIDE TRF format — the international standard for tournament reporting:

```
modules/swiss/src/main/SwissTrf.scala — TRF format output
```

```scala
private def tournamentLines(swiss: Swiss) = Source(List(
  s"012 ${swiss.name}",
  s"022 $baseUrl/swiss/${swiss.id}",
  s"032 Lichess",
  s"042 ${dateFormatter.print(swiss.startsAt)}",
  s"052 ${swiss.finishedAt.so(dateFormatter.print)}",
  s"062 ${swiss.nbPlayers}",
  s"092 Individual: Swiss-System",
  s"XXR ${swiss.settings.nbRounds}",
  s"XXC ${Color.fromWhite(swiss.id.value(0).toInt % 2 == 0).name}1"
))
```

Each player line includes per-round data with opponent ID, color assignment, and outcome:

```scala
private def playerLine(swiss, playerIds)(p, pairings, sheet): Bits =
  List(
    3  -> "001",
    8  -> playerIds.getOrElse(p.userId, 0).toString,
    (15 + p.userId.value.size) -> p.userId.value,
    52 -> p.rating.toString,
    84 -> f"${sheet.points.value}%1.1f"
  ) ::: swiss.allRounds.zip(sheet.outcomes).flatMap { case (rn, outcome) =>
    val pairing = pairings.get(rn)
    List(
      95 -> pairing.map(_.opponentOf(p.userId)).flatMap(playerIds.get).so(_.toString),
      97 -> pairing.map(_.colorOf(p.userId)).so(_.fold("w", "b")),
      99 -> (outcome match {
        case Win => "1"; case Loss => "0"; case Draw => "="
        case Bye => "U"; case ForfeitWin => "+"; case ForfeitLoss => "-"
        case Absent => "-"; case Late => "H"; case Ongoing => "Z"
      })
    ).map((l, s) => (l + (rn.value - 1) * 10, s))
  }
```

### Sonneborn-Berger Tiebreak With Virtual Opponents for Byes

When a player gets a bye (no opponent), Lichess creates a **virtual opponent** per the FIDE handbook:

```
modules/swiss/src/main/SwissScoring.scala — Virtual opponent construction
```

```scala
case ((tieBreak, perfSum), (round, Some(_: SwissPairing.Bye))) =>
  /* https://handbook.fide.com/files/handbook/C02Standards.pdf
     For tie-break purposes a player who has no opponent will be
     considered as having played against a virtual opponent who has
     the same number of points at the beginning of the round and
     who draws in all the following rounds. */
  val virtualOpponentOutcomes =
    SwissSheet.Outcome.ForfeitLoss ::
    List.fill((rounds - round).value)(SwissSheet.Outcome.Draw)
  val pointsOfVirtualOpponent =
    playerSheet.pointsAfterRound(round - 1) +
    SwissSheet.pointsFor(virtualOpponentOutcomes)
  val newTieBreak = tieBreak + pointsOfVirtualOpponent.value
  newTieBreak -> perfSum
```

### Forbidden Pairings

Server administrators can specify forbidden pairings (e.g., to prevent friends from being matched):

```scala
private def forbiddenPairings(swiss: Swiss, playerIds: PlayerIds): Source[String, ?] =
  if swiss.settings.forbiddenPairings.isEmpty then Source.empty[String]
  else Source.fromIterator: () =>
    swiss.settings.forbiddenPairings.linesIterator.flatMap:
      _.trim.toLowerCase.split(' ').map(_.trim) match
        case Array(u1, u2) if u1 != u2 =>
          for
            id1 <- playerIds.get(UserId(u1))
            id2 <- playerIds.get(UserId(u2))
          yield s"XXP $id1 $id2"
        case _ => none
```

The `XXP` records are a TRF extension for forbidden pairings, output in the standard format for external pairing engines.

**Iron Curtain relevance:** IC plans Swiss tournaments with "FIDE TRF format, Sonneborn-Berger tiebreak" (AGENTS.md competitive infrastructure). Lichess provides a working implementation. The virtual opponent construction for byes is essential for fair tiebreaking — without it, players who receive byes (likely in odd-count tournaments) are penalized in tiebreaks. Forbidden pairings are useful for IC's tournament mode to prevent clan-mates from facing each other (or to enforce cross-team matchups in team events).

---

## Lichess — Arena Pairing System (AntmaPairing + Color History)

### Weighted Maximum Matching for Arena Tournaments

Arena tournament pairing uses the same WMMatching algorithm as pool matchmaking, but with a different score function:

```
modules/tournament/src/main/arena/AntmaPairing.scala — Arena pair scoring
```

```scala
def pairScore(a: RPlayer, b: RPlayer): Option[Int] =
  if justPlayedTogether(a.player.userId, b.player.userId) ||
     !a.colorHistory.couldPlay(b.colorHistory, maxStrike)
  then None  // forbidden: just played each other, or color conflict
  else
    Some:
      Math.abs(a.rank.value - b.rank.value) * rankFactor(a, b) +
      Math.abs(a.player.rating.value - b.player.rating.value)
```

Constraints:
- **No repeat opponents:** `justPlayedTogether` checks `lastOpponents` hash
- **Color balance:** `colorHistory.couldPlay` enforces max 3 consecutive same-color games (`maxStrike = 3`)

### Dynamic Rank Factor

The rank factor increases for top players to ensure leaders play each other:

```
modules/tournament/src/main/arena/PairingSystem.scala — Rank factor
```

```scala
def rankFactorFor(players: List[RankedPlayerWithColorHistory])
  : (RPlayer, RPlayer) => Int =
  val maxRank = players.maxBy(_.rank.value).rank
  (a, b) =>
    val rank = a.rank.atMost(b.rank)
    300 + 1700 * (maxRank - rank).value / maxRank.value
```

For rank 1 players, rankFactor ≈ 2000; for bottom-ranked players, rankFactor ≈ 300. This means a rank 1 vs rank 5 difference weighs much more than a rank 300 vs rank 310 difference — leaders face leaders.

### Tiered Pairing Strategy

Large tournaments use a hybrid approach:

```scala
if nbIdles < 2 then Nil
else if data.tour.isRecentlyStarted && !data.tour.isTeamBattle then
  initialPairings(idles)               // random pairing at start
else if nbIdles <= maxGroupSize then
  bestPairings(data, idles)            // WMMatching for ≤100 players
else
  val groupSize = (nbIdles / 4 * 2).atMost(maxGroupSize)
  bestPairings(data, idles.take(groupSize)) :::        // top group: optimal
  bestPairings(data, idles.slice(groupSize, groupSize * 2)) ::: // 2nd group: optimal
  proximityPairings(idles.slice(groupSize * 2, groupSize * 8))  // rest: proximity
```

The top 2× `maxGroupSize` players get WMMatching (expensive but high quality). The remaining players get cheap proximity pairing (adjacent in the ranking). This balances pairing quality where it matters most (tournament leaders) with computational efficiency for the tail.

**Iron Curtain relevance:** IC's tournament system should use this tiered approach. With potentially hundreds of players in an arena, full WMMatching on all players is O(n³). Lichess's solution — full optimization for the top ~200, proximity pairing for the rest — is the right tradeoff. The rank factor ensuring leaders play leaders prevents a #1 player from farming low-ranked opponents while #2 catches up. The color history system maps to IC's faction/team assignment balance.

---

## Lichess — Wave-Based Pool Matchmaking

### Wave Actor Model

Each matchmaking pool (e.g., "5+0 rated", "3+2 rated") runs as an independent actor:

```
modules/pool/src/main/PoolActor.scala — Wave scheduling
```

```scala
final private class PoolActor(config: PoolConfig, ...) extends Actor:
  var members = Vector.empty[PoolMember]
  private var lastPairedUserIds = Set.empty[UserId]

  def scheduleWave() =
    nextWave = context.system.scheduler.scheduleOnce(
      config.wave.every + ThreadLocalRandom.nextInt(1000).millis,
      self, ScheduledWave
    )
```

Each wave:
1. Collects current pool members
2. Steals compatible players from the lobby hook system (`hookThieve`)
3. Runs `MatchMaking(candidates)` to find optimal pairings
4. Starts games for paired players
5. Un-paired players get `incMisses` — increasing their urgency for next wave

```scala
case HookThieve.PoolHooks(hooks) =>
  val candidates = members ++ hooks.map(_.member)
  val pairings = MatchMaking(candidates)
  val pairedMembers = pairings.flatMap(_.members)
  
  // Steal hooks that were matched
  hookThieve.stolen(hooks.filter(h => pairedMembers.exists(m => h.member.userId.is(m.userId))))
  
  // Remaining members stay in pool with incremented miss counter
  members = members.diff(pairedMembers).map(_.incMisses)
  
  gameStarter(config, pairings)
  lastPairedUserIds = pairedMembers.view.map(_.userId).toSet
  scheduleWave()
```

### Anti-Double-Pairing

A player who was just paired is blocked from immediate re-pairing:

```scala
case Join(joiner) if lastPairedUserIds(joiner.userId) =>
  // don't pair someone twice in a row, it's probably a client error
```

### Liveness Tracking

The client sends periodic SRI (Socket Request ID) heartbeats. Disconnected players are cleaned up:

```scala
case Sris(sris) =>
  members = members.filter: member =>
    member.from != PoolFrom.Socket || sris.contains(member.sri)
```

**Iron Curtain relevance:** IC's matchmaking should use this wave-based approach rather than immediate pairing. Waves allow the system to accumulate a pool of candidates and find globally optimal pairings rather than greedily matching the first compatible pair. The miss counter + urgency bonus ensures no one waits forever. The `FullWave` trigger (fires when enough players are waiting) provides fast pairing during peak times. IC should run separate pool actors per queue (1v1, 2v2, FFA) and per game module.

---

## Comparative Analysis

### Anti-Cheat Approaches

| System            | Detection Method                 | Action Model        | Works Without Central Server? |
| ----------------- | -------------------------------- | ------------------- | ----------------------------- |
| Minetest          | LagPool time-budget + position   | Server rejects      | N/A (server-auth)             |
| Lichess (Irwin)   | External AI on game analysis     | Auto-mark / report  | No                            |
| Lichess (Kaladin) | Prediction model on insight data | Auto-mark / report  | No                            |
| Lichess (Flags)   | 8-flag pattern matching          | Per-game assessment | Yes (deterministic)           |
| DDraceNetwork     | EMA traffic + antibot ABI        | Kick / ban          | Yes (plugin-based)            |
| **IC (planned)**  | **Behavioral analysis at relay** | **Detection only**  | **Relay-dependent**           |

### Matchmaking Algorithms

| System           | Algorithm                 | Optimality                      | Fairness Features                                         |
| ---------------- | ------------------------- | ------------------------------- | --------------------------------------------------------- |
| Lichess Pool     | WMMatching                | Global optimal                  | Lame segregation, rageSit, urgency                        |
| Lichess Arena    | WMMatching + prox         | Tiered                          | Rank factor, color history, no-rept                       |
| Lichess Swiss    | External pairing          | FIDE-compliant                  | Forbidden pairings, virtual opps                          |
| OpenRA           | Lobby-based               | Manual                          | None                                                      |
| **IC (planned)** | **Glicko-2 + WMMatching** | **Global optimal (wave-based)** | **Per-queue ratings, lame segregation, rageSit affinity** |

### Rating Systems

| System           | Algorithm    | Corrections                                    | Abuse Prevention                                            |
| ---------------- | ------------ | ---------------------------------------------- | ----------------------------------------------------------- |
| Lichess          | Glicko-2     | Color advantage, speed inflation               | Bot halving, max delta 700                                  |
| Chess.com        | Glicko-2     | Unknown corrections                            | Unknown                                                     |
| **IC (planned)** | **Glicko-2** | **Per-speed inflation factors (from Lichess)** | **Bot game halving, max delta cap, behavioral segregation** |

### Tournament Formats

| System           | Arena (streak-based) | Swiss (FIDE) | Additional Features                     |
| ---------------- | -------------------- | ------------ | --------------------------------------- |
| Lichess          | Yes (fire/berserk)   | Yes (TRF)    | Team battles, draw streak null, berserk |
| FACEIT/etc.      | No                   | Swiss-like   | ELO-based seeding                       |
| **IC (planned)** | **Planned**          | **Planned**  | **Bracket API, certified results**      |

---

## Techniques Worth Adopting for Iron Curtain

### 1. LagPool Time-Budget Rate Limiting (from Minetest)

Replace IC's planned hard `max_orders_per_tick` cap with a LagPool-style time-budget system at the relay server. Each player has a pool that refills at a rate matching legitimate play speed. Orders consume from the pool. This handles burst activity (legitimate mass-select) while catching sustained abuse (bot spam). The pool's lag-compensating behavior (fills up during real lag) makes it inherently tolerant of network jitter.

### 2. Half-Open Connection Anti-Amplification (from Minetest)

IC's relay server should mark all new UDP connections as "half-open" and inhibit retransmission and ping responses until the client proves liveness by using its assigned session ID. This prevents the relay from being usable as a UDP amplification reflector — critical for any internet-facing server.

### 3. SRP Authentication for Self-Hosted Servers (from Minetest)

For IC's community self-hosting use case (servers without Steam/platform auth), implement SRP authentication. The server never sees passwords, only verifiers. This complements IC's Ed25519 order signing — SRP proves identity, Ed25519 proves order integrity. No custom crypto needed — SRP implementations exist for Rust (`srp` crate).

### 4. CSM Restriction Flags as Capability Manifest Template (from Minetest)

IC's WASM mod capability system (D005) should define capabilities as a bitmask similar to Minetest's CSM restriction flags. Server operators can control which capabilities each mod is granted. The bitmask format is efficient for runtime checking. Minetest's flag set can serve as the starting vocabulary: `READ_UNITS`, `READ_MAP`, `READ_PLAYERS`, `SEND_CHAT`, `MODIFY_UI`.

### 5. Dual AI Anti-Cheat With Tiered Actions (from Lichess)

IC should run two independent detection systems with separate thresholds. Threshold tiers: auto-ban (high confidence), report-to-moderator (medium confidence), flag-for-review (low confidence). Titled/top-ranked players should never be auto-banned — only reported. The priority queue concept (tournament leaders checked first) focuses resources where cheating has the most impact. Minimum game count before analysis (Lichess: 1050 moves / ~35 games) prevents false positives on new accounts.

### 6. PlayerFlags Pattern Matching for RTS (from Lichess)

Define IC-specific cheat detection flags: `InhumanAPMConsistency` (CV of APM across game < threshold), `PerfectMicro` (zero wasted clicks), `ImpossibleReactionTime` (reacting to unscouted events), `NoIdleTime` (no natural human pauses), `ConsistentBuildTiming` (bot-like regularity), `AlwaysAdvantage` (never in a losing economy state), `SuspiciousHoldPattern` (mouse hold → perfect action). Use pattern matching against flag combinations for deterministic classification, exactly like Lichess's 8-flag system.

### 7. WMMatching for Matchmaking Pools (from Lichess)

Adopt the Blossom V / Edmonds' maximum weight matching algorithm for IC's matchmaking. The pair score function template: `ratingDiff - missBonus - mapPreferenceBonus - ragesitBonus - provisionalBonus`. The `scalalib.WMMatching` library is well-documented; equivalent Rust implementations exist. Lame player segregation and behavioral affinity pairing protect the experience of honorable players.

### 8. Wave-Based Pool Architecture (from Lichess)

Run matching in periodic waves rather than greedy first-match. Accumulate candidates → run WMMatching → start games → increment miss counters for unmatched. Separate actors per queue (1v1, 2v2, FFA) and per game module. Full waves trigger early when enough players are waiting. This produces globally better pairings than greedy matching at the cost of a few seconds of latency.

### 9. Arena Scoring: Fire/Streak/Berserk/Draw Penalty (from Lichess)

Adopt Lichess's arena scoring system wholesale. The bitfield encoding (flag + berserk + result in 6 bits) is compact and deterministic. The draw streak penalty discourages boring play. The berserk mechanic (play with a handicap for bonus points on win) creates risk/reward decisions that make arena tournaments exciting. The retroactive streak rewrite (StreakStarter → Normal on subsequent loss) feels fair. Map berserk to RTS: "start with fewer MCVs" or "no radar for first 2 minutes."

### 10. Speed-Specific Rating Inflation Factors (from Lichess)

IC should apply different inflation correction factors per game speed. Faster game speeds (short timer) likely have different player churn patterns than long matches. The formula is simple: on rating gain, multiply by `(1 + factor)`. The factor can be calibrated empirically post-launch by measuring deflation rates per speed tier. Bot game rating halving prevents AI farming.

### 11. Content-Addressed Asset Delivery (from Minetest)

For IC's workshop resource registry (D030), follow Minetest's announce→request→deliver pattern with SHA-256 content hashing. Clients compare hashes against local cache and only download new/changed files. Support remote media server URLs for CDN offloading. Track what's been sent per client to prevent duplicate transfers and bandwidth abuse.

### 12. Swiss Tournament Virtual Opponents for Byes (from Lichess)

When implementing IC's Swiss tournaments, follow the FIDE handbook for bye handling: virtual opponent with equal points who draws remaining rounds. This prevents bye receivers from being penalized in Sonneborn-Berger tiebreaks. Forbidden pairings support is essential for team-based events.

---

### Novel Patterns Not Found in Previous Research

These techniques are new compared to all previously analyzed codebases (Spring Engine, 0 A.D., Warzone 2100, Veloren, Hypersomnia, OpenBW, DDraceNetwork):

1. **Minetest's LagPool** — Time-budget anti-cheat that self-compensates for legitimate network lag. Not seen in any other analyzed game. Superior to hard rate caps for order validation.
2. **Minetest's SRP authentication** — Zero-knowledge password proof for self-hosted servers. No other analyzed game uses SRP; most rely on platform auth (Steam) or no auth at all.
3. **Minetest's CSM restriction flags** — Server-controlled client mod sandboxing as a bitmask. The closest pattern is WASM capability-based sandboxing, but this approach lets the *server* define the policy rather than the mod.
4. **Minetest's half-open connection state** — Anti-amplification defense for UDP servers. Simple but not seen in other analyzed games (Generals had no amplification protection at all).
5. **Lichess's dual AI anti-cheat** (Irwin + Kaladin running independently) — No other analyzed codebase uses multiple independent AI detection systems with separate action thresholds.
6. **Lichess's 8-flag pattern matching** — Deterministic cheat classification from computed binary features. More systematic than DDNet's EMA traffic monitoring or Minetest's position validation.
7. **Lichess's WMMatching** — Graph-theoretic optimal pairing. No other analyzed game uses maximum weight matching for matchmaking; most use greedy or random approaches.
8. **Lichess's rageSit behavioral reputation** — Behavioral tiering that affects matchmaking affinity without outright punishment. Not seen in any analyzed game's matchmaking.
9. **Lichess's arena fire/berserk/draw-streak** mechanics — The most sophisticated tournament scoring system found in any open-source game. Bitfield encoding is novel for compact serialization.
10. **Lichess's rating inflation regulation** — Speed-specific rating gain multipliers. Not found in any other open-source rating system implementation.
11. **Lichess's virtual opponent for Swiss byes** — FIDE-compliant tiebreak handling for byes. Crucial for tournament fairness, not implemented in any previously analyzed game.
