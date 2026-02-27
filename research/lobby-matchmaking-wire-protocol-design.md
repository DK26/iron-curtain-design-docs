# Lobby, Matchmaking & Server Discovery Wire Protocol Design

> **Purpose:** Specify the complete wire protocol for lobby management, matchmaking queues, server discovery, credential exchange, and lobby-to-game transitions. The relay wire protocol (relay-wire-protocol-design.md) covers in-game order flow and the connection handshake but stops at the lobby boundary. This document fills the remaining P004 gaps: every message a client sends or receives between "I want to find a game" and "the game tick clock starts."
> **Date:** 2026-02-26
> **Resolves:** P004 (Lobby/matchmaking protocol specifics)
> **Referenced by:** 03-NETCODE.md, D052 (community servers/SCR), D055 (ranked matchmaking), D071 (ICRP), D072 (server management), match-lifecycle.md
> **Depends on:** relay-wire-protocol-design.md (frame format, handshake, GameConfig), D052 (Ed25519 identity, SCR format), D055 (Glicko-2, tiers, map veto, queue design), D071 (ICRP JSON-RPC), D072 (ic-server binary)

---

## 1. Protocol Overview & Message Taxonomy

All lobby and matchmaking messages fall into six protocol phases. Each message has a direction, reliability requirement, and lane assignment within the relay frame format (relay-wire-protocol-design.md Section 2).

### 1.1 Message Catalog

**Discovery Protocol** (UDP query, separate from relay connection):

| Message                | ID     | Direction | Transport     | Reliability |
|------------------------|--------|-----------|---------------|-------------|
| `ServerListQuery`      | `0x01` | C→Seed    | UDP query     | Unreliable  |
| `ServerListResponse`   | `0x02` | Seed→C    | UDP query     | Unreliable  |
| `ServerPing`           | `0x03` | C→S       | UDP query     | Unreliable  |
| `ServerPong`           | `0x04` | S→C       | UDP query     | Unreliable  |
| `LanDiscoveryBcast`    | `0x05` | C→LAN     | mDNS/UDP bcast| Unreliable  |
| `LanDiscoveryReply`    | `0x06` | S→C       | UDP unicast   | Unreliable  |

**Lobby Management** (relay connection established, Chat lane, reliable):

| Message                | ID     | Direction | Lane   | Reliability |
|------------------------|--------|-----------|--------|-------------|
| `LobbyListQuery`      | `0x20` | C→S       | Chat   | Reliable    |
| `LobbyListResponse`   | `0x21` | S→C       | Chat   | Reliable    |
| `CreateLobby`         | `0x22` | C→S       | Chat   | Reliable    |
| `CreateLobbyResult`   | `0x23` | S→C       | Chat   | Reliable    |
| `JoinLobby`           | `0x24` | C→S       | Chat   | Reliable    |
| `JoinLobbyResult`     | `0x25` | S→C       | Chat   | Reliable    |
| `LeaveLobby`          | `0x26` | C→S       | Chat   | Reliable    |
| `LobbyUpdate`         | `0x27` | C→S       | Chat   | Reliable    |
| `LobbyState`          | `0x28` | S→C       | Chat   | Reliable    |
| `LobbyDelta`          | `0x29` | S→C       | Chat   | Reliable    |
| `SlotUpdate`          | `0x2A` | C→S       | Chat   | Reliable    |
| `PlayerReady`         | `0x2B` | C→S       | Chat   | Reliable    |
| `LobbyChat`           | `0x2C` | C→S       | Chat   | Reliable    |
| `LobbyChatBroadcast`  | `0x2D` | S→C       | Chat   | Reliable    |
| `KickPlayer`          | `0x2E` | C→S       | Chat   | Reliable    |
| `KickNotification`    | `0x2F` | S→C       | Chat   | Reliable    |

**Matchmaking Queue** (relay connection established, Chat lane, reliable):

| Message                | ID     | Direction | Lane   | Reliability |
|------------------------|--------|-----------|--------|-------------|
| `QueueJoin`           | `0x40` | C→S       | Chat   | Reliable    |
| `QueueJoinResult`     | `0x41` | S→C       | Chat   | Reliable    |
| `QueueStatus`         | `0x42` | S→C       | Chat   | Reliable    |
| `QueueLeave`          | `0x43` | C→S       | Chat   | Reliable    |
| `MatchFound`          | `0x44` | S→C       | Chat   | Reliable    |
| `MatchAccept`         | `0x45` | C→S       | Chat   | Reliable    |
| `MatchDecline`        | `0x46` | C→S       | Chat   | Reliable    |
| `MatchCancelled`      | `0x47` | S→C       | Chat   | Reliable    |
| `MapVetoTurn`         | `0x48` | S→C       | Chat   | Reliable    |
| `MapVetoBan`          | `0x49` | C→S       | Chat   | Reliable    |
| `MapVetoResult`       | `0x4A` | S→C       | Chat   | Reliable    |
| `ReQueue`             | `0x4B` | C→S       | Chat   | Reliable    |

**Credential Exchange** (during lobby join or matchmaking, Chat lane, reliable):

| Message                | ID     | Direction | Lane   | Reliability |
|------------------------|--------|-----------|--------|-------------|
| `PresentCredentials`  | `0x60` | C→S       | Chat   | Reliable    |
| `CredentialVerified`  | `0x61` | S→C       | Chat   | Reliable    |
| `CredentialRejected`  | `0x62` | S→C       | Chat   | Reliable    |
| `RatingUpdate`        | `0x63` | S→C       | Chat   | Reliable    |

**Lobby → Game Transition** (relay connection, Control lane, reliable):

| Message                | ID     | Direction | Lane    | Reliability |
|------------------------|--------|-----------|---------|-------------|
| `ReadyCheckStart`     | `0x80` | S→C       | Control | Reliable    |
| `ReadyCheckAccept`    | `0x81` | C→S       | Control | Reliable    |
| `ReadyCheckDecline`   | `0x82` | C→S       | Control | Reliable    |
| `ReadyCheckResult`    | `0x83` | S→C       | Control | Reliable    |
| `LoadingProgress`     | `0x84` | C→S       | Control | Reliable    |
| `AllLoadedCountdown`  | `0x85` | S→C       | Control | Reliable    |
| `GameStart`           | `0x86` | S→C       | Control | Reliable    |
| `GameEnded`           | `0x87` | S→C       | Control | Reliable    |
| `PostGameLobby`       | `0x88` | S→C       | Chat    | Reliable    |

**Server Registration (ICRP)** (JSON-RPC over WebSocket/HTTP, see D071):

| Method                          | Direction | Transport   |
|---------------------------------|-----------|-------------|
| `ic/server.register`           | S→Seed    | HTTPS       |
| `ic/server.heartbeat`          | S→Seed    | HTTPS       |
| `ic/server.deregister`         | S→Seed    | HTTPS       |
| `ic/lobby.create`              | Tool→S    | ICRP WS     |
| `ic/lobby.configure`           | Tool→S    | ICRP WS     |
| `ic/matchmaking.status`        | Tool→S    | ICRP WS     |

### 1.2 Lane Assignments

Lobby and matchmaking messages reuse the relay frame format's lane system (relay-wire-protocol-design.md Section 2.2):

- **Control lane (0):** Transition messages (ready check, loading, countdown, game start). Highest priority, reliable.
- **Chat lane (1):** Lobby management, matchmaking queue, credential exchange, lobby chat. Reliable, moderate priority.
- **Discovery:** Separate UDP query protocol outside the relay connection (no lane — independent packet format).

---

## 2. Server Discovery Protocol

### 2.1 Discovery Architecture

```
                    ┌──────────────────────────┐
                    │  Community Seed List      │
                    │  (GitHub-hosted JSON)     │
                    │  HTTPS + Ed25519 signed   │
                    └──────────┬───────────────┘
                               │
                  ┌────────────┼────────────────┐
                  │            │                 │
                  ▼            ▼                 ▼
           ┌──────────┐ ┌──────────┐     ┌──────────┐
           │ Server A │ │ Server B │ ... │ Server N │
           │ (relay)  │ │ (relay)  │     │ (relay)  │
           └──────────┘ └──────────┘     └──────────┘
                  ▲            ▲                 ▲
                  │            │                 │
                  └────────────┼────────────────┘
                               │
                         ┌─────────┐
                         │ Client  │  (UDP query to each server)
                         └─────────┘
```

Clients discover servers through three channels:

1. **Community seed list** — A JSON file hosted on GitHub (e.g., `https://raw.githubusercontent.com/niceguysfinishlast/iron-curtain-servers/main/servers.json`), signed with the community's Ed25519 key. Downloaded over HTTPS at client startup and cached locally.
2. **Cached known servers** — Servers the client has connected to before, stored in the local SQLite database (D034). Persists across sessions.
3. **LAN discovery** — mDNS broadcast for local servers (D072 portable server).

### 2.2 Seed List Format

```json
{
  "version": 1,
  "updated_at": "2026-02-26T12:00:00Z",
  "community_key": "ed25519:<base64-encoded-public-key>",
  "servers": [
    {
      "address": "play.ironcurtain.gg:19711",
      "name": "Official IC — Europe",
      "region": "eu-west",
      "capabilities": 127,
      "version_min": "0.5.0",
      "version_max": "0.5.2"
    }
  ],
  "signature": "<base64-encoded-Ed25519-signature-over-canonical-JSON>"
}
```

The client verifies the signature against the community key before trusting the list. Signature covers the canonical JSON (keys sorted, no whitespace) of everything except the `signature` field itself.

### 2.3 Server Query Protocol

Server discovery uses a lightweight UDP query protocol, independent of the relay connection. This allows clients to ping servers without establishing a full encrypted session.

**Query packet format:**

```
ServerListQuery (C→S):
Offset  Size  Field
──────  ────  ─────
0       4     magic: 0x49435351 ("ICSQ" — Iron Curtain Server Query)
4       1     query_version: u8 (currently 0x01)
5       1     query_type: u8 (0x01 = ServerInfo, 0x02 = LobbyList)
6       4     challenge: u32 LE (random nonce, echoed in response to prevent spoofing)
10      2     client_version: u16 LE (protocol version)
```
Total: 12 bytes.

**Response packet format:**

```
ServerListResponse (S→C):
Offset  Size     Field
──────  ────     ─────
0       4        magic: 0x49435352 ("ICSR" — Iron Curtain Server Response)
4       1        query_version: u8 (0x01)
5       1        response_type: u8 (matches query_type)
6       4        challenge: u32 LE (echoed from query)
10      2        payload_len: u16 LE
12      varies   payload: CBOR-encoded ServerInfo or LobbyList
```

**Why CBOR for discovery payloads:** Discovery responses contain variable-length strings (server name, map names, mod names) and optional fields that evolve over protocol versions. CBOR (RFC 8949) is self-describing, compact, and schema-flexible — adding a new field to `ServerInfo` does not break older clients. In contrast, the relay's in-game TLV format (relay-wire-protocol-design.md Section 1) is optimized for tiny fixed-schema orders where CBOR's overhead would be wasteful.

### 2.4 ServerInfo Structure

```rust
/// CBOR-serialized server information returned by ServerListQuery.
#[derive(Serialize, Deserialize)]
pub struct ServerInfo {
    /// Server display name (UTF-8, max 64 bytes).
    pub name: String,
    /// Bitfield of enabled capabilities (see D052 capability table).
    /// Bit 0: workshop_source, Bit 1: game_relay, Bit 2: ranking_authority,
    /// Bit 3: matchmaking, Bit 4: achievement_authority,
    /// Bit 5: campaign_benchmarks, Bit 6: moderation
    pub capabilities: u8,
    /// Current connected player count.
    pub player_count: u16,
    /// Maximum player capacity.
    pub max_players: u16,
    /// Server protocol version.
    pub protocol_version: u16,
    /// Geographic region tag (e.g., "eu-west", "us-east", "ap-southeast").
    pub region: String,
    /// Server uptime in seconds (capped at u32::MAX).
    pub uptime_secs: u32,
    /// Active game modules (e.g., ["ra", "td"]).
    pub game_modules: Vec<String>,
    /// Number of active lobbies.
    pub active_lobbies: u16,
    /// Number of active matches (games in progress).
    pub active_matches: u16,
    /// Number of players in matchmaking queues.
    pub queued_players: u16,
    /// Server-set message of the day (max 256 bytes, UTF-8).
    pub motd: Option<String>,
    /// Required mod profile for this server (None = vanilla).
    pub mod_profile: Option<String>,
    /// Ed25519 public key of the server's community identity.
    pub community_key: [u8; 32],
}
```

### 2.5 Lobby Listing Within a Server

After establishing a relay connection (relay-wire-protocol-design.md Section 9), clients can query the server's lobby list:

```
LobbyListQuery (0x20, C→S):
  D (Data):
    filter_flags: u8     — Bit 0: hide_full, Bit 1: hide_started,
                           Bit 2: hide_password, Bit 3: friends_only
    game_module: u8      — 0 = any, 1+ = specific module index
    max_results: u8      — 0 = server default (typically 50)

LobbyListResponse (0x21, S→C):
  D (Data):
    lobby_count: varint
    lobbies: [LobbyListEntry; lobby_count]  — CBOR-encoded array
```

```rust
#[derive(Serialize, Deserialize)]
pub struct LobbyListEntry {
    pub lobby_id: u32,
    pub name: String,
    pub host_name: String,
    pub player_count: u8,
    pub max_players: u8,
    pub game_module: String,
    pub map_name: String,
    pub game_speed: u8,
    pub has_password: bool,
    pub state: LobbyListState,
    pub mod_profile: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub enum LobbyListState {
    WaitingForPlayers,
    ReadyCheck,
    Loading,
    InProgress,
}
```

### 2.6 Refresh Protocol

- **Server browser:** Client polls each server with `ServerPing` (type `0x03`) every **15 seconds** while the server browser is open. Response is `ServerPong` (type `0x04`) containing a minimal update (player_count, active_lobbies, active_matches, ping_ms computed from round-trip).
- **Lobby list:** Client sends `LobbyListQuery` on first view, then every **5 seconds** while the lobby browser panel is open. The server returns the full list each time (lobby lists are small — typically <2 KB for 50 lobbies). Delta updates add protocol complexity that is not justified for lists this small.
- **Cache eviction:** Servers that fail to respond to 3 consecutive pings (45 seconds) are marked offline in the local cache. They remain in the cache for 24 hours before removal.

### 2.7 LAN Discovery (mDNS)

For D072's portable server and LAN party use:

- IC servers broadcast mDNS service type `_ironcurtain._udp.local.`
- Service TXT record contains: `v=<protocol_version>`, `name=<server_name>`, `players=<count>/<max>`, `modules=<comma-separated>`
- Clients listen for mDNS announcements on the local network
- LAN servers appear in a dedicated "Local Network" section of the server browser, above internet servers
- No authentication for LAN discovery (trusted local network assumption)

---

## 3. Lobby Management Wire Protocol

### 3.1 GameSettings Structure

All lobby settings are captured in a single structure, serialized as CBOR for lobby messages. This structure maps directly to the `GameConfig` frame (relay-wire-protocol-design.md Section 7.1) at game start.

```rust
/// Complete game settings for a lobby. CBOR-serialized in lobby messages.
/// At game start, the relay converts this to the binary GameConfig frame.
#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub struct GameSettings {
    /// Map identifier (references the asset system).
    pub map_id: String,
    /// SHA-256 hash of the map file.
    pub map_hash: [u8; 32],
    /// Game speed preset (0=Slowest, 1=Slower, 2=Normal, 3=Faster, 4=Fastest).
    pub game_speed: u8,
    /// Starting credits preset index.
    pub starting_credits: u8,
    /// Starting tech level (0=low, 1=medium, 2=high).
    pub tech_level: u8,
    /// Crate spawning enabled.
    pub crates: bool,
    /// Fog of war mode (0=explored, 1=fog, 2=shroud).
    pub fog_of_war: u8,
    /// Short game mode (destroy all production buildings to win).
    pub short_game: bool,
    /// Unit cap per player (0 = unlimited).
    pub unit_cap: u16,
    /// Balance preset identifier (D019).
    pub balance_preset: String,
    /// Mod profile name (None = vanilla).
    pub mod_profile: Option<String>,
    /// Game module identifier ("ra", "td", etc.).
    pub game_module: String,
    /// Tick rate (typically 15 or 30).
    pub tick_rate: u8,
    /// Pause configuration override (None = server default).
    pub pause_config: Option<PauseConfig>,
    /// Vote configuration override (None = server default).
    pub vote_config: Option<VoteConfigOverride>,
    /// Spectator configuration.
    pub spectator_config: SpectatorConfig,
    /// Custom rules blob for mod-defined settings (opaque bytes, max 4 KB).
    pub custom_rules: Vec<u8>,
}
```

### 3.2 CreateLobby

```
CreateLobby (0x22, C→S):
  D (Data): CBOR-encoded CreateLobbyRequest

CreateLobbyResult (0x23, S→C):
  D (Data): CBOR-encoded CreateLobbyResponse
```

```rust
#[derive(Serialize, Deserialize)]
pub struct CreateLobbyRequest {
    /// Lobby display name (UTF-8, max 64 bytes).
    pub name: String,
    /// Password hash (Argon2id). None = public lobby.
    pub password_hash: Option<[u8; 32]>,
    /// Maximum players (2–16).
    pub max_players: u8,
    /// Initial game settings.
    pub settings: GameSettings,
    /// Whether this is a ranked lobby (requires matchmaking capability).
    pub ranked: bool,
}

#[derive(Serialize, Deserialize)]
pub enum CreateLobbyResponse {
    Ok {
        lobby_id: u32,
        /// Full lobby state (creator is host and occupies slot 0).
        lobby_state: LobbyState,
    },
    Error {
        code: LobbyErrorCode,
        message: String,
    },
}

#[derive(Serialize, Deserialize)]
pub enum LobbyErrorCode {
    ServerFull,
    InvalidSettings,
    RankedNotAvailable,
    RateLimited,
    NameTooLong,
    ModProfileNotFound,
    Banned,
}
```

### 3.3 JoinLobby

```
JoinLobby (0x24, C→S):
  D (Data): CBOR-encoded JoinLobbyRequest

JoinLobbyResult (0x25, S→C):
  D (Data): CBOR-encoded JoinLobbyResponse
```

```rust
#[derive(Serialize, Deserialize)]
pub struct JoinLobbyRequest {
    /// Target lobby ID.
    pub lobby_id: u32,
    /// Password (plaintext over the already-encrypted relay connection;
    /// server verifies against stored Argon2id hash).
    pub password: Option<String>,
    /// Signed credential records for this community (see Section 5).
    pub credentials: Option<CredentialChain>,
}

#[derive(Serialize, Deserialize)]
pub enum JoinLobbyResponse {
    Ok {
        /// Full lobby state snapshot.
        lobby_state: LobbyState,
        /// Assigned slot index.
        your_slot: u8,
    },
    Error {
        code: JoinErrorCode,
        message: String,
    },
}

#[derive(Serialize, Deserialize)]
pub enum JoinErrorCode {
    LobbyNotFound,
    LobbyFull,
    WrongPassword,
    GameInProgress,
    Banned,
    VersionMismatch,
    ModProfileMissing,
    CredentialRejected,
}
```

### 3.4 LeaveLobby

```
LeaveLobby (0x26, C→S):
  D (Data):
    reason: u8    — 0 = voluntary, 1 = disconnect
```

The server broadcasts a `LobbyDelta` to remaining players with the player removal. If the leaving player was host, host migrates to the player with the lowest slot index.

### 3.5 LobbyUpdate (Settings Change)

Only the host can change lobby settings. The client sends a delta — only the fields that changed.

```
LobbyUpdate (0x27, C→S):
  D (Data): CBOR-encoded LobbySettingsDelta
```

```rust
/// Delta update for lobby settings. Only present fields are changed.
/// Absent fields (None) retain their current value.
#[derive(Serialize, Deserialize, Default)]
pub struct LobbySettingsDelta {
    pub map_id: Option<String>,
    pub map_hash: Option<[u8; 32]>,
    pub game_speed: Option<u8>,
    pub starting_credits: Option<u8>,
    pub tech_level: Option<u8>,
    pub crates: Option<bool>,
    pub fog_of_war: Option<u8>,
    pub short_game: Option<bool>,
    pub unit_cap: Option<u16>,
    pub balance_preset: Option<String>,
    pub mod_profile: Option<Option<String>>,
    pub tick_rate: Option<u8>,
    pub max_players: Option<u8>,
    pub spectator_config: Option<SpectatorConfig>,
    pub custom_rules: Option<Vec<u8>>,
}
```

The server validates the delta (e.g., rejects invalid map hashes, out-of-range values), applies it, and broadcasts a `LobbyDelta` (0x29) to all lobby members. Any setting change unreadies all players (prevents stale ready state after rule changes).

### 3.6 SlotUpdate

```
SlotUpdate (0x2A, C→S):
  D (Data): CBOR-encoded SlotUpdateRequest
```

```rust
#[derive(Serialize, Deserialize)]
pub struct SlotUpdateRequest {
    /// Target slot index.
    pub slot_id: u8,
    /// Action to perform on this slot.
    pub action: SlotAction,
}

#[derive(Serialize, Deserialize)]
pub enum SlotAction {
    /// Assign the slot to a specific team.
    SetTeam { team: u8 },
    /// Choose faction for this slot.
    SetFaction { faction: u8 },
    /// Choose color for this slot.
    SetColor { color: u8 },
    /// Add an AI player to an empty slot.
    AddAi { difficulty: u8 },
    /// Remove an AI player from a slot.
    RemoveAi,
    /// Lock a slot (prevent joins). Host only.
    Lock,
    /// Unlock a slot. Host only.
    Unlock,
    /// Move a player to a different slot. Host only.
    MovePlayer { target_slot: u8 },
    /// Swap two players between slots. Host only.
    SwapPlayers { other_slot: u8 },
}
```

**Permissions:**
- Any player can change their own slot's team, faction, and color.
- Only the host can modify other players' slots, add/remove AI, lock/unlock slots, and move/swap players.
- Any slot change unreadies the affected player(s).

### 3.7 PlayerReady

```
PlayerReady (0x2B, C→S):
  D (Data):
    ready: u8    — 0 = unready, 1 = ready
```

When all human players are ready, the host can start the game (or the server auto-starts after a 5-second countdown if all players are ready and auto-start is enabled in server config).

### 3.8 LobbyChat

```
LobbyChat (0x2C, C→S):
  D (Data):
    message_len: varint
    message: UTF-8 (max 500 bytes)

LobbyChatBroadcast (0x2D, S→C):
  D (Data):
    sender_slot: u8
    sender_name_len: varint
    sender_name: UTF-8
    message_len: varint
    message: UTF-8
    timestamp: u32 LE (unix epoch seconds, truncated)
```

Rate limited: 5 messages per 10 seconds per player (server-configurable). Messages exceeding the limit are silently dropped with a rate-limit notification sent only to the sender.

### 3.9 KickPlayer

```
KickPlayer (0x2E, C→S):
  D (Data):
    target_slot: u8
    reason: u8    — 0 = no reason, 1 = AFK, 2 = disruptive, 3 = wrong settings

KickNotification (0x2F, S→C):
  D (Data):
    kicked_slot: u8
    reason: u8
```

Only the host can kick players from the lobby. The kicked player receives a `KickNotification` followed by a connection close. Kicked players cannot rejoin the same lobby for 5 minutes (tracked by Ed25519 identity, not IP).

### 3.10 LobbyState (Full Sync)

Sent to players on join and on request (e.g., after reconnection).

```
LobbyState (0x28, S→C):
  D (Data): CBOR-encoded LobbyStateSnapshot
```

```rust
#[derive(Serialize, Deserialize)]
pub struct LobbyStateSnapshot {
    pub lobby_id: u32,
    pub name: String,
    pub host_slot: u8,
    pub has_password: bool,
    pub ranked: bool,
    pub settings: GameSettings,
    pub slots: Vec<LobbySlot>,
    pub chat_history: Vec<LobbyChatMessage>,
}

#[derive(Serialize, Deserialize)]
pub struct LobbySlot {
    pub slot_id: u8,
    pub state: SlotState,
    pub team: u8,
    pub faction: u8,
    pub color: u8,
}

#[derive(Serialize, Deserialize)]
pub enum SlotState {
    Empty,
    Locked,
    Human {
        player_name: String,
        identity_pk: [u8; 32],
        ready: bool,
        /// Rating summary if credentials were presented and verified.
        rating: Option<RatingSummary>,
    },
    Ai {
        difficulty: u8,
        name: String,
    },
}

#[derive(Serialize, Deserialize)]
pub struct RatingSummary {
    pub rating: i64,
    pub deviation: i64,
    pub tier_name: String,
    pub division: u8,
    pub matches_played: u32,
}

#[derive(Serialize, Deserialize)]
pub struct LobbyChatMessage {
    pub sender_name: String,
    pub message: String,
    pub timestamp: u32,
}
```

### 3.11 LobbyDelta (Incremental Update)

After any lobby change, the server broadcasts a delta to all lobby members:

```
LobbyDelta (0x29, S→C):
  D (Data): CBOR-encoded LobbyDeltaEvent
```

```rust
#[derive(Serialize, Deserialize)]
pub enum LobbyDeltaEvent {
    PlayerJoined {
        slot: LobbySlot,
    },
    PlayerLeft {
        slot_id: u8,
        reason: u8,
    },
    SettingsChanged {
        delta: LobbySettingsDelta,
    },
    SlotChanged {
        slot: LobbySlot,
    },
    PlayerReadyChanged {
        slot_id: u8,
        ready: bool,
    },
    HostMigrated {
        new_host_slot: u8,
    },
    AllUnreadied {
        /// Reason why all players were unreadied (settings change, slot change, etc.)
        reason: String,
    },
}
```

---

## 4. Matchmaking Queue Protocol

### 4.1 QueueJoin

```
QueueJoin (0x40, C→S):
  D (Data): CBOR-encoded QueueJoinRequest

QueueJoinResult (0x41, S→C):
  D (Data): CBOR-encoded QueueJoinResponse
```

```rust
#[derive(Serialize, Deserialize)]
pub struct QueueJoinRequest {
    /// Queue mode.
    pub mode: QueueMode,
    /// Preferred faction (for faction-specific rating, D055).
    pub faction_preference: FactionPreference,
    /// Maps the player wants to ban from the seasonal pool.
    /// Pre-submitted to speed up the veto phase.
    pub map_veto_preferences: Vec<String>,
    /// Credentials for this community (required for ranked).
    pub credentials: Option<CredentialChain>,
    /// Party members (for team queues). Empty for solo.
    pub party_member_ids: Vec<[u8; 32]>,
}

#[derive(Serialize, Deserialize)]
pub enum QueueMode {
    Ranked1v1,
    RankedTeam { team_size: u8 },
    UnrankedCompetitive { team_size: u8 },
}

#[derive(Serialize, Deserialize)]
pub enum FactionPreference {
    /// Play a specific faction. Rating for this faction is used in matchmaking.
    Specific { faction: u8 },
    /// Random faction. Unified rating is used.
    Random,
}

#[derive(Serialize, Deserialize)]
pub enum QueueJoinResponse {
    Ok {
        /// Estimated wait time in seconds (-1 = unknown).
        estimated_wait_secs: i32,
        /// Current queue population for this mode.
        queue_population: u32,
    },
    Error {
        code: QueueErrorCode,
        message: String,
    },
}

#[derive(Serialize, Deserialize)]
pub enum QueueErrorCode {
    AlreadyInQueue,
    AlreadyInLobby,
    CooldownActive { remaining_secs: u32 },
    CredentialRequired,
    CredentialExpired,
    PartyTierGapTooLarge,
    ModeNotAvailable,
    PlacementRequired,
    Banned,
}
```

### 4.2 QueueStatus

The server pushes status updates to queued players at regular intervals (every 5 seconds or on significant state change):

```
QueueStatus (0x42, S→C):
  D (Data): CBOR-encoded QueueStatusUpdate
```

```rust
#[derive(Serialize, Deserialize)]
pub struct QueueStatusUpdate {
    /// Current search range (one-sided, from D055 MatchmakingConfig).
    pub search_range: i64,
    /// Current estimated wait in seconds.
    pub estimated_wait_secs: i32,
    /// Queue population for this mode.
    pub queue_population: u32,
    /// Queue health indicator.
    pub queue_health: QueueHealth,
    /// Time spent in queue so far (seconds).
    pub elapsed_secs: u32,
}

/// Communicates D055's small-population degradation state to the client.
#[derive(Serialize, Deserialize)]
pub enum QueueHealth {
    /// Normal queue operation. Population sufficient for tight skill matching.
    Healthy,
    /// Widening search range. May take longer than usual.
    Widening { expanded_range: i64 },
    /// Low population. Match quality may be reduced.
    LowPopulation { players_in_mode: u32 },
    /// Desperation mode. Will match with any available player.
    Desperation,
}
```

### 4.3 QueueLeave

```
QueueLeave (0x43, C→S):
  D (Data):
    (empty — no payload needed)
```

Server responds with a `QueueStatus` containing `queue_population` for the mode (informational) or silently acknowledges. No penalty for leaving queue before match is found.

### 4.4 MatchFound

```
MatchFound (0x44, S→C):
  D (Data): CBOR-encoded MatchFoundNotification
```

```rust
#[derive(Serialize, Deserialize)]
pub struct MatchFoundNotification {
    /// Unique match identifier.
    pub match_id: u64,
    /// Deadline for accepting (unix timestamp, seconds).
    pub accept_deadline_secs: u32,
    /// Number of players in the match.
    pub player_count: u8,
    /// Game mode that was matched.
    pub mode: QueueMode,
    /// Relay server address (may differ from matchmaking server for
    /// cross-server matchmaking).
    pub relay_address: Option<String>,
}
```

### 4.5 Accept / Decline

```
MatchAccept (0x45, C→S):
  D (Data):
    match_id: u64 LE

MatchDecline (0x46, C→S):
  D (Data):
    match_id: u64 LE
```

If any player declines or times out (30 seconds, per match-lifecycle.md):

```
MatchCancelled (0x47, S→C):
  D (Data): CBOR-encoded MatchCancelledNotification
```

```rust
#[derive(Serialize, Deserialize)]
pub struct MatchCancelledNotification {
    pub match_id: u64,
    pub reason: MatchCancelReason,
    /// Whether the client is automatically re-queued.
    pub auto_requeued: bool,
}

#[derive(Serialize, Deserialize)]
pub enum MatchCancelReason {
    /// A player declined.
    PlayerDeclined,
    /// A player timed out (did not respond within 30 seconds).
    PlayerTimedOut,
    /// Server error.
    ServerError,
}
```

Non-declining players are re-queued with priority (placed at the front of the queue). The declining player receives a cooldown (D055/match-lifecycle.md: 1min → 5min → 15min escalating per 24hr window).

### 4.6 Map Veto Protocol (Ranked Only)

After all players accept, ranked matches enter the map veto phase (D055: alternating bans from a 7-map seasonal pool).

```
MapVetoTurn (0x48, S→C):
  D (Data): CBOR-encoded MapVetoTurnNotification
```

```rust
#[derive(Serialize, Deserialize)]
pub struct MapVetoTurnNotification {
    /// Current pool of remaining maps.
    pub remaining_maps: Vec<MapInfo>,
    /// Which player's turn it is to ban (anonymous — shown as "You" or "Opponent").
    pub your_turn: bool,
    /// Deadline for this ban (seconds from now).
    pub deadline_secs: u8,
    /// Number of bans completed so far.
    pub bans_completed: u8,
    /// Total bans required before map is selected.
    pub bans_total: u8,
}

#[derive(Serialize, Deserialize)]
pub struct MapInfo {
    pub map_id: String,
    pub display_name: String,
    /// Thumbnail hash for client-side lookup.
    pub thumbnail_hash: [u8; 32],
    pub player_slots: u8,
}
```

```
MapVetoBan (0x49, C→S):
  D (Data):
    map_id_len: varint
    map_id: UTF-8
```

After all bans are complete (6 bans for 7-map pool → 1 map remains):

```
MapVetoResult (0x4A, S→C):
  D (Data): CBOR-encoded MapVetoResultNotification
```

```rust
#[derive(Serialize, Deserialize)]
pub struct MapVetoResultNotification {
    /// The selected map.
    pub selected_map: MapInfo,
    /// Full ban history (anonymous — "Player A", "Player B" labels only).
    pub ban_history: Vec<MapBan>,
}

#[derive(Serialize, Deserialize)]
pub struct MapBan {
    pub banned_by: String,  // "Player A" or "Player B" (anonymous, D055 V27)
    pub map_id: String,
}
```

**Timeout handling:** If a player does not ban within 15 seconds, the server auto-bans a random map from the remaining pool on their behalf. If a player's pre-submitted `map_veto_preferences` (from `QueueJoin`) includes a map still in the pool, the server uses that preference automatically — reducing perceived latency for the veto phase.

**Identity reveal:** After the map is selected and both players confirm ready (via `ReadyCheckAccept`), the server reveals opponent identity (name, rating, tier badge) in the `ReadyCheckResult` message.

### 4.7 ReQueue (Post-Game)

```
ReQueue (0x4B, C→S):
  D (Data): CBOR-encoded ReQueueRequest
```

```rust
#[derive(Serialize, Deserialize)]
pub struct ReQueueRequest {
    /// Queue mode (same as before or different).
    pub mode: QueueMode,
    /// Faction preference (may change between games).
    pub faction_preference: FactionPreference,
    /// Updated map veto preferences.
    pub map_veto_preferences: Vec<String>,
}
```

**Re-queue optimization:** When a player re-queues from the post-game lobby, the server skips credential re-verification if:
1. The player's session is still active (connection not dropped).
2. Less than 5 minutes have elapsed since the last credential verification.
3. A `RatingUpdate` was delivered for the just-completed game (credentials are current).

This eliminates the ~50ms credential verification latency for back-to-back games.

---

## 5. Credential Exchange Protocol

### 5.1 Credential Chain Structure

Credentials follow the SCR (Signed Credential Record) format from D052. A credential chain includes the most recent SCR and enough context for the server to verify it.

```rust
/// Credential chain presented during lobby join or queue entry.
#[derive(Serialize, Deserialize)]
pub struct CredentialChain {
    /// The community this credential is for (Ed25519 public key).
    pub community_key: [u8; 32],
    /// The most recent Signed Credential Record.
    pub current_scr: SignedCredentialRecord,
    /// The previous SCR (for sequence number continuity verification).
    /// None if this is the player's first match on this community.
    pub previous_scr: Option<SignedCredentialRecord>,
}

/// A single Signed Credential Record (D052 SCR format).
#[derive(Serialize, Deserialize)]
pub struct SignedCredentialRecord {
    /// Monotonic sequence number (prevents replay attacks).
    pub sequence: u64,
    /// Player's Ed25519 public key (identity binding).
    pub player_key: [u8; 32],
    /// Glicko-2 rating (fixed-point, scale 1000).
    pub rating: i64,
    /// Glicko-2 rating deviation (fixed-point, scale 1000).
    pub deviation: i64,
    /// Glicko-2 volatility (fixed-point, scale 100000).
    pub volatility: i64,
    /// Total ranked matches played.
    pub matches_played: u32,
    /// Current season identifier.
    pub season_id: u16,
    /// Tier name at time of signing (informational, derived from rating).
    pub tier_name: String,
    /// Division within tier.
    pub division: u8,
    /// Timestamp of signing (unix epoch seconds).
    pub signed_at: u64,
    /// Match ID that produced this SCR (None for initial placement SCR).
    pub match_id: Option<u64>,
    /// Ed25519 signature by the community server over all preceding fields.
    pub signature: [u8; 64],
}
```

### 5.2 PresentCredentials

```
PresentCredentials (0x60, C→S):
  D (Data): CBOR-encoded CredentialChain
```

Sent during `JoinLobby` (embedded in the request) or `QueueJoin` (embedded in the request). Can also be sent standalone after connecting to a server, before joining a lobby — this allows the server to pre-verify and cache the result.

### 5.3 Verification Flow

```
Client                                Server
──────                                ──────

PresentCredentials ─────────────────►
  { community_key, current_scr,
    previous_scr }
                                      1. Verify community_key matches
                                         this server's community identity
                                      2. Verify Ed25519 signature on
                                         current_scr using community_key
                                      3. Verify player_key in SCR matches
                                         the client's identity_pk from
                                         the connection handshake
                                      4. Verify sequence number > last
                                         known sequence for this player
                                         (if server has history)
                                      5. Verify season_id matches
                                         current season
                                      6. Optional: verify previous_scr
                                         signature and sequence continuity

◄───────────────────── CredentialVerified
  { status, rating_summary }
  OR
◄───────────────────── CredentialRejected
  { reason }
```

```
CredentialVerified (0x61, S→C):
  D (Data): CBOR-encoded CredentialVerifiedResponse

CredentialRejected (0x62, S→C):
  D (Data): CBOR-encoded CredentialRejectedResponse
```

```rust
#[derive(Serialize, Deserialize)]
pub struct CredentialVerifiedResponse {
    pub status: VerificationStatus,
    pub rating_summary: RatingSummary,
}

#[derive(Serialize, Deserialize)]
pub enum VerificationStatus {
    /// Fully verified. SCR is current and valid.
    Valid,
    /// Valid but from a previous season. Rating will be soft-reset
    /// on next match completion.
    PreviousSeason,
    /// First time on this community. Placement matches required.
    NewPlayer,
}

#[derive(Serialize, Deserialize)]
pub struct CredentialRejectedResponse {
    pub reason: CredentialRejectReason,
    pub message: String,
}

#[derive(Serialize, Deserialize)]
pub enum CredentialRejectReason {
    /// Signature verification failed.
    InvalidSignature,
    /// Community key does not match this server.
    WrongCommunity,
    /// Player key in SCR does not match connection identity.
    IdentityMismatch,
    /// Sequence number is stale (possible replay attack).
    StaleSequence,
    /// SCR format is unrecognized.
    UnsupportedFormat,
    /// Community key has been revoked.
    CommunityKeyRevoked,
}
```

### 5.4 Rating Update Delivery (Post-Game)

After a match ends, the community server computes rating updates and delivers new SCRs:

```
RatingUpdate (0x63, S→C):
  D (Data): CBOR-encoded RatingUpdateDelivery
```

```rust
#[derive(Serialize, Deserialize)]
pub struct RatingUpdateDelivery {
    /// The match that produced this update.
    pub match_id: u64,
    /// New signed credential record.
    pub new_scr: SignedCredentialRecord,
    /// Rating change from this match (display purposes).
    pub rating_delta: i64,
    /// Deviation change from this match.
    pub deviation_delta: i64,
    /// New tier information.
    pub new_tier: String,
    pub new_division: u8,
    /// Whether the player was promoted, demoted, or unchanged.
    pub tier_change: TierChange,
}

#[derive(Serialize, Deserialize)]
pub enum TierChange {
    Promoted { from_tier: String, from_division: u8 },
    Demoted { from_tier: String, from_division: u8 },
    DivisionUp { from_division: u8 },
    DivisionDown { from_division: u8 },
    Unchanged,
}
```

The client stores the new SCR in local SQLite (D034) and presents it on subsequent lobby joins or queue entries.

### 5.5 Cross-Community Credentials

A player may hold credentials from multiple communities (D052: "the official IC community is just one of many"). When connecting to a server:

- The client presents credentials matching the server's `community_key`.
- If the client has no credentials for this community, the server treats them as a new player (`VerificationStatus::NewPlayer`).
- Credentials from other communities are not presented or verified — they are irrelevant to the current server's rankings.
- The client's local SQLite database stores SCRs keyed by `(community_key, player_key)`.

### 5.6 Credential Caching on Server

The server caches credential verification results per session:

- After successful verification, the server stores `(player_key, sequence, rating_summary)` in memory.
- Subsequent lobby joins or re-queues within the same connection skip full Ed25519 verification.
- Cache is invalidated on: connection drop, `RatingUpdate` delivery (new SCR supersedes cached), or server-configurable timeout (default: 30 minutes).

---

## 6. Lobby → Game Transition

This section maps the `ReadyCheckState` state machine from match-lifecycle.md to concrete wire messages.

### 6.1 Transition Flow

```
Lobby (all ready)
  │
  ▼
ReadyCheckStart (S→C)               ← Match found (matchmaking) or host starts (custom)
  │
  ├─ ReadyCheckAccept (C→S) ×N      ← Each player accepts within 30s
  │   or
  ├─ ReadyCheckDecline (C→S)        ← Player declines → back to queue/lobby
  │   or
  └─ (timeout, 30s)                 ← Same as decline
  │
  ▼
ReadyCheckResult (S→C)              ← All accepted → proceed; any declined → cancel
  │
  ▼ (if all accepted, ranked only)
MapVetoTurn / MapVetoBan cycle      ← See Section 4.6
  │
  ▼
MapVetoResult (S→C)                 ← Final map selected
  │
  ▼
GameState(Loading) (S→C)            ← Relay state transition (relay-wire-protocol-design.md §8)
GameConfig (S→C)                    ← Binary GameConfig frame (relay-wire-protocol-design.md §7)
  │
  ├─ LoadingProgress (C→S) ×N       ← Each client reports 0-100%
  │
  ▼ (all at 100%, config hashes match)
AllLoadedCountdown (S→C)            ← 3-second countdown
  │
  ▼
GameStart (S→C)                     ← References the GameConfig; game clock starts
  │
  ═══════════════════════════        ← In-game: relay wire protocol takes over
  │
  ▼
GameEnded (S→C)                     ← Match result
  │
  ▼
PostGameLobby (S→C)                 ← Stats, rating, re-queue option
  │
  ├─ ReQueue (C→S)                  ← Player re-queues
  └─ LeaveLobby (C→S)              ← Player leaves
```

### 6.2 ReadyCheckStart

```
ReadyCheckStart (0x80, S→C):
  D (Data):
    match_id: u64 LE
    deadline: u32 LE (unix epoch seconds)
    player_count: u8
    timeout_secs: u8 (30)
```

For custom lobbies, `match_id` is the lobby ID. For matchmaking, it is the match ID from `MatchFound`.

### 6.3 ReadyCheckAccept / Decline

```
ReadyCheckAccept (0x81, C→S):
  D (Data):
    match_id: u64 LE

ReadyCheckDecline (0x82, C→S):
  D (Data):
    match_id: u64 LE
```

### 6.4 ReadyCheckResult

```
ReadyCheckResult (0x83, S→C):
  D (Data): CBOR-encoded ReadyCheckResultPayload
```

```rust
#[derive(Serialize, Deserialize)]
pub struct ReadyCheckResultPayload {
    pub match_id: u64,
    pub outcome: ReadyCheckOutcome,
}

#[derive(Serialize, Deserialize)]
pub enum ReadyCheckOutcome {
    AllAccepted {
        /// Player identities revealed (for ranked, after anonymous veto).
        players: Vec<PlayerIdentity>,
    },
    Cancelled {
        reason: MatchCancelReason,
        auto_requeued: bool,
    },
}

#[derive(Serialize, Deserialize)]
pub struct PlayerIdentity {
    pub slot_id: u8,
    pub name: String,
    pub identity_pk: [u8; 32],
    pub rating: Option<RatingSummary>,
    pub faction: u8,
    pub team: u8,
}
```

### 6.5 LoadingProgress

```
LoadingProgress (0x84, C→S):
  D (Data):
    percent: u8 (0-100)
```

This maps directly to the `LoadStatus` frame (type `0x0F`) in relay-wire-protocol-design.md Section 2.2. The server rebroadcasts loading progress to all clients so each player sees a per-player loading bar.

Loading timeout: 120 seconds (match-lifecycle.md). If any player fails to reach 100% within the timeout, the match is cancelled with no penalty.

### 6.6 AllLoadedCountdown

```
AllLoadedCountdown (0x85, S→C):
  D (Data):
    seconds_remaining: u8 (3, 2, 1)
    match_id: u64 LE
```

Sent once per second during the 3-second countdown. Clients display a countdown overlay.

### 6.7 GameStart

```
GameStart (0x86, S→C):
  D (Data):
    match_id: u64 LE
    config_hash: [u8; 32]  — SHA-256 of the GameConfig (relay-wire-protocol-design.md §7.2)
```

This message signals that the deterministic simulation starts at tick 0. The `GameConfig` frame was already delivered during the Loading phase. `GameStart` confirms that all config hashes matched and the countdown completed. From this point, the relay wire protocol's in-game message flow takes over (OrderBatch, TickOrders, SyncHash, etc.).

### 6.8 GameEnded

```
GameEnded (0x87, S→C):
  D (Data): CBOR-encoded GameEndedPayload
```

```rust
#[derive(Serialize, Deserialize)]
pub struct GameEndedPayload {
    pub match_id: u64,
    pub final_tick: u64,
    /// Match outcome (maps to match-lifecycle.md MatchOutcome).
    pub outcome: MatchOutcomeWire,
    /// Certified match result (relay-signed).
    pub certified_result: CertifiedMatchResultWire,
    /// Replay file hash (for verification and download).
    pub replay_hash: [u8; 32],
}

#[derive(Serialize, Deserialize)]
pub enum MatchOutcomeWire {
    Completed {
        winner_slot: u8,
        reason: String,
    },
    Abandoned {
        leaver_slot: u8,
        tick: u64,
    },
    Draw,
    DesyncTerminated {
        first_divergence_tick: u64,
    },
    Voided,
}

/// Wire-format wrapper for the relay-certified match result.
#[derive(Serialize, Deserialize)]
pub struct CertifiedMatchResultWire {
    /// The raw CertifiedMatchResult bytes (binary, relay-signed).
    pub result_bytes: Vec<u8>,
    /// Ed25519 signature by the relay over result_bytes.
    pub relay_signature: [u8; 64],
    /// Relay's Ed25519 public key (for independent verification).
    pub relay_key: [u8; 32],
}
```

### 6.9 PostGameLobby

```
PostGameLobby (0x88, S→C):
  D (Data): CBOR-encoded PostGameLobbyPayload
```

```rust
#[derive(Serialize, Deserialize)]
pub struct PostGameLobbyPayload {
    pub match_id: u64,
    /// Per-player statistics summary.
    pub player_stats: Vec<PlayerMatchStats>,
    /// Rating update (delivered separately via RatingUpdate message,
    /// but previewed here for immediate display).
    pub rating_preview: Option<RatingPreview>,
    /// How long the post-game lobby remains open (seconds).
    pub lobby_timeout_secs: u16,
    /// Available actions.
    pub can_requeue: bool,
    pub can_report: bool,
    pub can_save_replay: bool,
}

#[derive(Serialize, Deserialize)]
pub struct PlayerMatchStats {
    pub slot_id: u8,
    pub name: String,
    pub faction: u8,
    pub team: u8,
    pub units_produced: u32,
    pub units_lost: u32,
    pub units_killed: u32,
    pub structures_built: u32,
    pub structures_lost: u32,
    pub resources_gathered: u64,
    pub resources_spent: u64,
    pub match_duration_ticks: u64,
}

#[derive(Serialize, Deserialize)]
pub struct RatingPreview {
    pub old_rating: i64,
    pub new_rating: i64,
    pub old_tier: String,
    pub old_division: u8,
    pub new_tier: String,
    pub new_division: u8,
    pub tier_change: TierChange,
}
```

---

## 7. ICRP Integration

### 7.1 Which Messages Use ICRP vs. Direct Relay Protocol

The lobby/matchmaking messages defined in Sections 2–6 are part of the **direct relay protocol** — binary frames over the encrypted UDP relay connection. ICRP (D071) is a separate JSON-RPC 2.0 API for external tools.

**ICRP endpoints for lobby/matchmaking** (admin and tournament tools):

| ICRP Method               | Permission Tier | Purpose |
|---------------------------|-----------------|---------|
| `ic/lobby.list`          | observer        | List all active lobbies (same data as `LobbyListResponse`) |
| `ic/lobby.create`        | admin           | Create a lobby programmatically (tournament tools) |
| `ic/lobby.configure`     | admin           | Change lobby settings (tournament management) |
| `ic/lobby.kick`          | admin           | Kick a player from a lobby |
| `ic/lobby.start`         | admin           | Force-start a lobby (skip ready check) |
| `ic/lobby.close`         | admin           | Close/disband a lobby |
| `ic/matchmaking.status`  | observer        | Query matchmaking queue statistics |
| `ic/matchmaking.cancel`  | admin           | Cancel a pending match (tournament tool) |
| `ic/server.info`         | observer        | Query server info (same data as `ServerInfo`) |

**Example: Tournament tool creating a lobby via ICRP:**

```json
{
  "jsonrpc": "2.0",
  "id": 42,
  "method": "ic/lobby.create",
  "params": {
    "name": "Tournament Round 3 - Match 7",
    "max_players": 2,
    "settings": {
      "map_id": "tournament_crossroads",
      "game_speed": 2,
      "starting_credits": 1,
      "fog_of_war": 2,
      "balance_preset": "competitive_s4",
      "game_module": "ra"
    },
    "ranked": false,
    "password": "t0urn4m3nt_r3_m7"
  }
}
```

### 7.2 Server-to-Server Communication

Cross-server matchmaking (e.g., a matchmaking server finding a relay on a different machine) uses ICRP over authenticated WebSocket between servers:

```
Matchmaking Server                    Relay Server
────────────────                      ────────────

ic/server.reserve_slot ──────────────►
  { match_id, players, settings }
                                      Validates capacity,
                                      reserves player slots
◄─────────────────────── result
  { relay_address, room_code }

(Clients connect to relay_address with room_code)
```

Server-to-server ICRP connections authenticate via mutual Ed25519 challenge-response (same as client authentication in relay-wire-protocol-design.md Section 9, but both sides present server identity keys).

### 7.3 Tournament Tool Integration

Tournament tools interact entirely through ICRP (D071), never through the binary relay protocol:

1. **Create match:** `ic/lobby.create` with tournament-specific settings.
2. **Invite players:** Share the room code via tournament platform (external to IC protocol).
3. **Monitor match:** `ic/state.subscribe` for match events.
4. **Manage match:** `ic/admin.pause`, `ic/lobby.kick` for admin actions.
5. **Retrieve results:** `ic/match.result` after game ends, including `CertifiedMatchResult`.

---

## 8. Message Frame Format

### 8.1 Lobby/Matchmaking Messages on the Relay Connection

All lobby and matchmaking messages (Sections 3–6) travel over the relay connection established in relay-wire-protocol-design.md Section 9. They reuse the same 16-byte packet header:

```
Relay Packet Header (16 bytes):
Offset  Size  Field
──────  ────  ─────
0       1     protocol_version (0x01)
1       1     flags (encrypted, fragmented, compressed, priority_ack)
2       1     lane_id (0 = Control, 1 = Chat)
3       1     frame_count
4       4     seq_num (u32 LE)
8       4     ack_latest_seq
12      2     ack_mask_lo
14      2     peer_delay_us
```

After the header, each frame begins with a TLV FrameType tag byte (relay-wire-protocol-design.md Section 1.2). Lobby/matchmaking messages extend the frame type table:

```
Extended FrameType Table (lobby/matchmaking):
FrameType      Value  Lane     Direction     Description
─────────      ─────  ────     ─────────     ───────────
LobbyMsg       0x1E   Chat     Bidirectional  Lobby management message
MatchmakingMsg 0x1F   Chat     Bidirectional  Matchmaking queue message
CredentialMsg  0x20   Chat     Bidirectional  Credential exchange message
TransitionMsg  0x21   Control  Bidirectional  Lobby→game transition message
```

Each extended frame type carries a sub-type byte (the message IDs from Section 1.1) followed by the CBOR payload:

```
Lobby/Matchmaking Frame Layout:
  T (FrameType): 0x1E / 0x1F / 0x20 / 0x21
  D (Data):
    sub_type: u8    — message ID (e.g., 0x22 = CreateLobby)
    payload_len: varint
    payload: CBOR-encoded message body
```

### 8.2 Discovery Messages (Separate UDP Protocol)

Discovery messages (Section 2.3) use their own lightweight UDP packet format, independent of the relay connection. They have a distinct magic number (`0x49435351` / `0x49435352`) to avoid confusion with relay packets (which start with `protocol_version = 0x01`).

Discovery packets are not encrypted — they contain only public information (server name, player count, etc.). The seed list itself is authenticated via Ed25519 signature and delivered over HTTPS.

### 8.3 Serialization Strategy: CBOR for Lobby, TLV for Gameplay

| Protocol Phase | Serialization | Rationale |
|---------------|---------------|-----------|
| Discovery     | CBOR          | Variable-length strings, optional fields, schema evolution needed |
| Lobby/Matchmaking | CBOR    | Schema flexibility (new settings, modes), human-debuggable, moderate frequency |
| Credential Exchange | CBOR  | Complex nested structures, cross-version compatibility |
| Transition    | Mixed         | Fixed fields (match_id, deadlines) as TLV; complex payloads (player lists, stats) as CBOR |
| In-Game       | TLV           | Fixed schema, high frequency (30 tps), minimal overhead (relay-wire-protocol-design.md) |

**Why CBOR over MessagePack, Protobuf, or JSON:**
- **vs. JSON:** 30–50% smaller for the same data. No parsing ambiguity (numbers are typed). Binary-native — no base64 encoding needed for byte arrays.
- **vs. MessagePack:** CBOR is an IETF standard (RFC 8949) with formal semantics. Both are similar in size and speed; CBOR wins on standardization and deterministic encoding (`core deterministic encoding` rules).
- **vs. Protobuf:** No schema compilation step. Self-describing — a CBOR decoder can parse any message without a .proto file. Better for a moddable game where schema evolves per community. Protobuf's advantage (smaller wire size, faster parsing) matters at in-game tick frequency but not at lobby message frequency (~1–10 messages/second).

### 8.4 CBOR Encoding Rules

All CBOR in this protocol uses **deterministic encoding** (RFC 8949 Section 4.2):
- Map keys sorted in bytewise lexicographic order of their canonical encoding.
- Integers encoded in the shortest form.
- No indefinite-length arrays/maps.

This ensures that identical logical messages produce identical byte sequences — important for signature verification and cache keying.

---

## 9. Security Considerations

### 9.1 Password-Protected Lobbies

Lobby passwords are hashed with **Argon2id** before storage on the server:

```rust
/// Password hashing parameters for lobby passwords.
/// These are deliberately lighter than user-account parameters because
/// lobby passwords are ephemeral (lobby lifetime) and low-value.
pub const LOBBY_ARGON2_PARAMS: Params = Params {
    m_cost: 16384,    // 16 MB memory
    t_cost: 2,        // 2 iterations
    p_cost: 1,        // 1 lane (single-threaded)
    output_len: 32,   // 256-bit hash
};
```

The client sends the plaintext password over the already-encrypted relay connection (AES-256-GCM, relay-wire-protocol-design.md Section 6). The server hashes it and compares against the stored hash. Passwords are never stored in plaintext and never logged.

### 9.2 Rate Limiting

| Action | Rate Limit | Window | Penalty for Violation |
|--------|-----------|--------|----------------------|
| Server discovery query | 10 queries/sec per source IP | 1 second | Drop packets, no response |
| Lobby list query | 2 queries/sec per connection | 1 second | Reject with error |
| Create lobby | 1 per 5 seconds per identity | 5 seconds | Reject with `RateLimited` |
| Join lobby | 3 per 10 seconds per identity | 10 seconds | Reject with `RateLimited` |
| Lobby chat | 5 messages per 10 seconds | 10 seconds | Silent drop, notify sender |
| Queue join | 1 per 3 seconds per identity | 3 seconds | Reject with `RateLimited` |
| Credential presentation | 2 per 10 seconds per identity | 10 seconds | Reject with `RateLimited` |

### 9.3 Lobby Spam Prevention

- **Lobby creation:** Maximum 3 active lobbies per identity across the server. Creating a 4th requires closing one.
- **Lobby names:** Filtered through the same content filter used for chat (D059). Names exceeding 64 bytes are truncated.
- **Ghost lobbies:** Lobbies with no human players for 60 seconds are automatically disbanded.
- **Lobby flooding:** If a single IP creates and abandons more than 10 lobbies in 5 minutes, that IP is temporarily blocked from lobby creation (1 hour).

### 9.4 Credential Replay Attack Prevention

SCR replay attacks are prevented by three mechanisms:

1. **Monotonic sequence numbers:** Each SCR has a `sequence` field that must be strictly increasing. The server tracks the highest known sequence per player. An SCR with a lower or equal sequence number is rejected with `StaleSequence`.

2. **Identity binding:** The `player_key` in the SCR must match the `identity_pk` from the connection handshake (relay-wire-protocol-design.md Section 9.1). An attacker who intercepts an SCR cannot use it without the corresponding Ed25519 private key.

3. **Temporal validity:** SCRs from previous seasons are accepted but flagged (`VerificationStatus::PreviousSeason`). Extremely old SCRs (>2 seasons old) are rejected — the player must re-place.

### 9.5 Discovery Protocol Security

- **Seed list:** Delivered over HTTPS with Ed25519 signature. Clients reject unsigned or incorrectly signed seed lists.
- **Server identity:** Each server has an Ed25519 keypair. The `community_key` in `ServerInfo` allows clients to verify they are connecting to a legitimate community member.
- **Amplification prevention:** Discovery query packets (12 bytes) produce responses of bounded size (max 1400 bytes). The challenge nonce prevents reflected DDoS (attacker cannot spoof source IP to redirect responses to a victim).
- **Spoofed server info:** A malicious server can lie about its name, player count, or capabilities in `ServerInfo`. This is acceptable — the client will discover the truth upon connecting. The seed list signature protects the initial server list; after that, clients verify server identity via the Ed25519 handshake.

### 9.6 Man-in-the-Middle Defense

- **Relay connection:** All relay traffic is encrypted with AES-256-GCM after the Curve25519 key exchange (relay-wire-protocol-design.md Section 6). MITM on the relay connection requires breaking Curve25519 ECDH.
- **Server identity verification:** Clients verify the server's Ed25519 public key against the seed list or their cached known-servers list. A MITM presenting a different key triggers a warning ("Server identity changed since your last visit").
- **Seed list integrity:** HTTPS + Ed25519 signature. MITM on the seed list requires compromising both the TLS certificate and the Ed25519 signing key.

---

## 10. Concrete Rust Types

All message types consolidated as Rust structs/enums with serde derives. These are the wire-format types — they live in `ic-protocol` (the shared crate between client and server, per AGENTS.md invariant #2).

```rust
use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════════════════════════════
// Discovery Protocol Types
// ═══════════════════════════════════════════════════════════════════

/// Server information returned by the discovery query protocol.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ServerInfo {
    pub name: String,
    pub capabilities: u8,
    pub player_count: u16,
    pub max_players: u16,
    pub protocol_version: u16,
    pub region: String,
    pub uptime_secs: u32,
    pub game_modules: Vec<String>,
    pub active_lobbies: u16,
    pub active_matches: u16,
    pub queued_players: u16,
    pub motd: Option<String>,
    pub mod_profile: Option<String>,
    pub community_key: [u8; 32],
}

/// Entry in the lobby list returned by the server.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LobbyListEntry {
    pub lobby_id: u32,
    pub name: String,
    pub host_name: String,
    pub player_count: u8,
    pub max_players: u8,
    pub game_module: String,
    pub map_name: String,
    pub game_speed: u8,
    pub has_password: bool,
    pub state: LobbyListState,
    pub mod_profile: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum LobbyListState {
    WaitingForPlayers,
    ReadyCheck,
    Loading,
    InProgress,
}

// ═══════════════════════════════════════════════════════════════════
// Lobby Management Types
// ═══════════════════════════════════════════════════════════════════

/// Complete game settings for a lobby.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct GameSettings {
    pub map_id: String,
    pub map_hash: [u8; 32],
    pub game_speed: u8,
    pub starting_credits: u8,
    pub tech_level: u8,
    pub crates: bool,
    pub fog_of_war: u8,
    pub short_game: bool,
    pub unit_cap: u16,
    pub balance_preset: String,
    pub mod_profile: Option<String>,
    pub game_module: String,
    pub tick_rate: u8,
    pub pause_config: Option<PauseConfig>,
    pub vote_config: Option<VoteConfigOverride>,
    pub spectator_config: SpectatorConfig,
    pub custom_rules: Vec<u8>,
}

/// Pause configuration (from match-lifecycle.md).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct PauseConfig {
    pub max_pauses_per_player: u8,
    pub max_pause_duration_secs: u32,
    pub unpause_grace_secs: u32,
    pub spectator_visible_during_pause: bool,
    pub min_game_time_for_pause_secs: u32,
}

/// Spectator configuration (from match-lifecycle.md).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct SpectatorConfig {
    pub allow_live_spectators: bool,
    pub spectator_delay_ticks: u64,
    pub max_spectators: u32,
    pub full_visibility: bool,
}

/// Vote configuration overrides for this lobby.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct VoteConfigOverride {
    pub surrender_enabled: bool,
    pub kick_enabled: bool,
    pub remake_enabled: bool,
    pub draw_enabled: bool,
}

/// Delta update for lobby settings. None fields are unchanged.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct LobbySettingsDelta {
    pub map_id: Option<String>,
    pub map_hash: Option<[u8; 32]>,
    pub game_speed: Option<u8>,
    pub starting_credits: Option<u8>,
    pub tech_level: Option<u8>,
    pub crates: Option<bool>,
    pub fog_of_war: Option<u8>,
    pub short_game: Option<bool>,
    pub unit_cap: Option<u16>,
    pub balance_preset: Option<String>,
    pub mod_profile: Option<Option<String>>,
    pub tick_rate: Option<u8>,
    pub max_players: Option<u8>,
    pub spectator_config: Option<SpectatorConfig>,
    pub custom_rules: Option<Vec<u8>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CreateLobbyRequest {
    pub name: String,
    pub password_hash: Option<[u8; 32]>,
    pub max_players: u8,
    pub settings: GameSettings,
    pub ranked: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum CreateLobbyResponse {
    Ok {
        lobby_id: u32,
        lobby_state: LobbyStateSnapshot,
    },
    Error {
        code: LobbyErrorCode,
        message: String,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum LobbyErrorCode {
    ServerFull,
    InvalidSettings,
    RankedNotAvailable,
    RateLimited,
    NameTooLong,
    ModProfileNotFound,
    Banned,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JoinLobbyRequest {
    pub lobby_id: u32,
    pub password: Option<String>,
    pub credentials: Option<CredentialChain>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum JoinLobbyResponse {
    Ok {
        lobby_state: LobbyStateSnapshot,
        your_slot: u8,
    },
    Error {
        code: JoinErrorCode,
        message: String,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum JoinErrorCode {
    LobbyNotFound,
    LobbyFull,
    WrongPassword,
    GameInProgress,
    Banned,
    VersionMismatch,
    ModProfileMissing,
    CredentialRejected,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SlotUpdateRequest {
    pub slot_id: u8,
    pub action: SlotAction,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum SlotAction {
    SetTeam { team: u8 },
    SetFaction { faction: u8 },
    SetColor { color: u8 },
    AddAi { difficulty: u8 },
    RemoveAi,
    Lock,
    Unlock,
    MovePlayer { target_slot: u8 },
    SwapPlayers { other_slot: u8 },
}

/// Full lobby state snapshot.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LobbyStateSnapshot {
    pub lobby_id: u32,
    pub name: String,
    pub host_slot: u8,
    pub has_password: bool,
    pub ranked: bool,
    pub settings: GameSettings,
    pub slots: Vec<LobbySlot>,
    pub chat_history: Vec<LobbyChatMessage>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LobbySlot {
    pub slot_id: u8,
    pub state: SlotState,
    pub team: u8,
    pub faction: u8,
    pub color: u8,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum SlotState {
    Empty,
    Locked,
    Human {
        player_name: String,
        identity_pk: [u8; 32],
        ready: bool,
        rating: Option<RatingSummary>,
    },
    Ai {
        difficulty: u8,
        name: String,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RatingSummary {
    pub rating: i64,
    pub deviation: i64,
    pub tier_name: String,
    pub division: u8,
    pub matches_played: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LobbyChatMessage {
    pub sender_name: String,
    pub message: String,
    pub timestamp: u32,
}

/// Incremental lobby state update.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum LobbyDeltaEvent {
    PlayerJoined { slot: LobbySlot },
    PlayerLeft { slot_id: u8, reason: u8 },
    SettingsChanged { delta: LobbySettingsDelta },
    SlotChanged { slot: LobbySlot },
    PlayerReadyChanged { slot_id: u8, ready: bool },
    HostMigrated { new_host_slot: u8 },
    AllUnreadied { reason: String },
}

// ═══════════════════════════════════════════════════════════════════
// Matchmaking Queue Types
// ═══════════════════════════════════════════════════════════════════

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct QueueJoinRequest {
    pub mode: QueueMode,
    pub faction_preference: FactionPreference,
    pub map_veto_preferences: Vec<String>,
    pub credentials: Option<CredentialChain>,
    pub party_member_ids: Vec<[u8; 32]>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum QueueMode {
    Ranked1v1,
    RankedTeam { team_size: u8 },
    UnrankedCompetitive { team_size: u8 },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum FactionPreference {
    Specific { faction: u8 },
    Random,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum QueueJoinResponse {
    Ok {
        estimated_wait_secs: i32,
        queue_population: u32,
    },
    Error {
        code: QueueErrorCode,
        message: String,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum QueueErrorCode {
    AlreadyInQueue,
    AlreadyInLobby,
    CooldownActive { remaining_secs: u32 },
    CredentialRequired,
    CredentialExpired,
    PartyTierGapTooLarge,
    ModeNotAvailable,
    PlacementRequired,
    Banned,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct QueueStatusUpdate {
    pub search_range: i64,
    pub estimated_wait_secs: i32,
    pub queue_population: u32,
    pub queue_health: QueueHealth,
    pub elapsed_secs: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum QueueHealth {
    Healthy,
    Widening { expanded_range: i64 },
    LowPopulation { players_in_mode: u32 },
    Desperation,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MatchFoundNotification {
    pub match_id: u64,
    pub accept_deadline_secs: u32,
    pub player_count: u8,
    pub mode: QueueMode,
    pub relay_address: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MatchCancelledNotification {
    pub match_id: u64,
    pub reason: MatchCancelReason,
    pub auto_requeued: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum MatchCancelReason {
    PlayerDeclined,
    PlayerTimedOut,
    ServerError,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MapVetoTurnNotification {
    pub remaining_maps: Vec<MapInfo>,
    pub your_turn: bool,
    pub deadline_secs: u8,
    pub bans_completed: u8,
    pub bans_total: u8,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MapInfo {
    pub map_id: String,
    pub display_name: String,
    pub thumbnail_hash: [u8; 32],
    pub player_slots: u8,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MapVetoResultNotification {
    pub selected_map: MapInfo,
    pub ban_history: Vec<MapBan>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MapBan {
    pub banned_by: String,
    pub map_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReQueueRequest {
    pub mode: QueueMode,
    pub faction_preference: FactionPreference,
    pub map_veto_preferences: Vec<String>,
}

// ═══════════════════════════════════════════════════════════════════
// Credential Exchange Types
// ═══════════════════════════════════════════════════════════════════

/// Credential chain presented during lobby join or queue entry.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CredentialChain {
    pub community_key: [u8; 32],
    pub current_scr: SignedCredentialRecord,
    pub previous_scr: Option<SignedCredentialRecord>,
}

/// A single Signed Credential Record (D052 SCR format).
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignedCredentialRecord {
    pub sequence: u64,
    pub player_key: [u8; 32],
    pub rating: i64,
    pub deviation: i64,
    pub volatility: i64,
    pub matches_played: u32,
    pub season_id: u16,
    pub tier_name: String,
    pub division: u8,
    pub signed_at: u64,
    pub match_id: Option<u64>,
    pub signature: [u8; 64],
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CredentialVerifiedResponse {
    pub status: VerificationStatus,
    pub rating_summary: RatingSummary,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum VerificationStatus {
    Valid,
    PreviousSeason,
    NewPlayer,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CredentialRejectedResponse {
    pub reason: CredentialRejectReason,
    pub message: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum CredentialRejectReason {
    InvalidSignature,
    WrongCommunity,
    IdentityMismatch,
    StaleSequence,
    UnsupportedFormat,
    CommunityKeyRevoked,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RatingUpdateDelivery {
    pub match_id: u64,
    pub new_scr: SignedCredentialRecord,
    pub rating_delta: i64,
    pub deviation_delta: i64,
    pub new_tier: String,
    pub new_division: u8,
    pub tier_change: TierChange,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum TierChange {
    Promoted { from_tier: String, from_division: u8 },
    Demoted { from_tier: String, from_division: u8 },
    DivisionUp { from_division: u8 },
    DivisionDown { from_division: u8 },
    Unchanged,
}

// ═══════════════════════════════════════════════════════════════════
// Lobby → Game Transition Types
// ═══════════════════════════════════════════════════════════════════

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReadyCheckResultPayload {
    pub match_id: u64,
    pub outcome: ReadyCheckOutcome,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum ReadyCheckOutcome {
    AllAccepted {
        players: Vec<PlayerIdentity>,
    },
    Cancelled {
        reason: MatchCancelReason,
        auto_requeued: bool,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlayerIdentity {
    pub slot_id: u8,
    pub name: String,
    pub identity_pk: [u8; 32],
    pub rating: Option<RatingSummary>,
    pub faction: u8,
    pub team: u8,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GameEndedPayload {
    pub match_id: u64,
    pub final_tick: u64,
    pub outcome: MatchOutcomeWire,
    pub certified_result: CertifiedMatchResultWire,
    pub replay_hash: [u8; 32],
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum MatchOutcomeWire {
    Completed { winner_slot: u8, reason: String },
    Abandoned { leaver_slot: u8, tick: u64 },
    Draw,
    DesyncTerminated { first_divergence_tick: u64 },
    Voided,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CertifiedMatchResultWire {
    pub result_bytes: Vec<u8>,
    pub relay_signature: [u8; 64],
    pub relay_key: [u8; 32],
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PostGameLobbyPayload {
    pub match_id: u64,
    pub player_stats: Vec<PlayerMatchStats>,
    pub rating_preview: Option<RatingPreview>,
    pub lobby_timeout_secs: u16,
    pub can_requeue: bool,
    pub can_report: bool,
    pub can_save_replay: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlayerMatchStats {
    pub slot_id: u8,
    pub name: String,
    pub faction: u8,
    pub team: u8,
    pub units_produced: u32,
    pub units_lost: u32,
    pub units_killed: u32,
    pub structures_built: u32,
    pub structures_lost: u32,
    pub resources_gathered: u64,
    pub resources_spent: u64,
    pub match_duration_ticks: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RatingPreview {
    pub old_rating: i64,
    pub new_rating: i64,
    pub old_tier: String,
    pub old_division: u8,
    pub new_tier: String,
    pub new_division: u8,
    pub tier_change: TierChange,
}
```

---

## Protocol Constants Summary

| Constant | Value | Section | Description |
|----------|-------|---------|-------------|
| `DISCOVERY_MAGIC_QUERY` | `0x49435351` | 2.3 | Discovery query packet magic ("ICSQ") |
| `DISCOVERY_MAGIC_RESPONSE` | `0x49435352` | 2.3 | Discovery response packet magic ("ICSR") |
| `DISCOVERY_VERSION` | `0x01` | 2.3 | Discovery protocol version |
| `MAX_LOBBY_NAME_BYTES` | 64 | 3.2 | Maximum lobby name length |
| `MAX_CHAT_MESSAGE_BYTES` | 500 | 3.8 | Maximum lobby chat message length |
| `MAX_MOTD_BYTES` | 256 | 2.4 | Maximum server MOTD length |
| `MAX_CUSTOM_RULES_BYTES` | 4096 | 3.1 | Maximum custom rules blob size |
| `READY_CHECK_TIMEOUT_SECS` | 30 | 6.2 | Time to accept/decline a match |
| `LOADING_TIMEOUT_SECS` | 120 | 6.5 | Time for all clients to load |
| `COUNTDOWN_SECS` | 3 | 6.6 | Pre-game countdown duration |
| `POST_GAME_TIMEOUT_SECS` | 300 | 6.9 | Post-game lobby auto-close |
| `MAP_VETO_TIMEOUT_SECS` | 15 | 4.6 | Time per map veto turn |
| `CREDENTIAL_CACHE_TIMEOUT_SECS` | 1800 | 5.6 | Server-side credential cache TTL |
| `DISCOVERY_POLL_INTERVAL_SECS` | 15 | 2.6 | Server browser ping interval |
| `LOBBY_LIST_POLL_INTERVAL_SECS` | 5 | 2.6 | Lobby list refresh interval |
| `SERVER_OFFLINE_THRESHOLD` | 3 pings | 2.6 | Missed pings before marking offline |
| `LOBBY_GHOST_TIMEOUT_SECS` | 60 | 9.3 | Empty lobby auto-disband timeout |
| `KICK_REJOIN_COOLDOWN_SECS` | 300 | 3.9 | Time before kicked player can rejoin |
| `CHAT_RATE_LIMIT` | 5/10s | 3.8 | Lobby chat rate limit |
| `QUEUE_STATUS_INTERVAL_SECS` | 5 | 4.2 | Queue status push frequency |
| `REQUEUE_CREDENTIAL_SKIP_SECS` | 300 | 4.7 | Credential re-verification skip window |
