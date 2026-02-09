# 0 A.D. & Warzone 2100 — Netcode Architecture Analysis

> Research for Iron Curtain. Concrete technical findings from source code analysis.
> Repos: [0ad/0ad](https://github.com/0ad/0ad), [Warzone2100/warzone2100](https://github.com/Warzone2100/warzone2100)

---

## Table of Contents

1. [0 A.D. — Overview](#0-ad--overview)
2. [0 A.D. — Networking Model](#0-ad--networking-model)
3. [0 A.D. — Turn System & Lockstep](#0-ad--turn-system--lockstep)
4. [0 A.D. — Desync Detection & State Hashing](#0-ad--desync-detection--state-hashing)
5. [0 A.D. — Replay System](#0-ad--replay-system)
6. [0 A.D. — NAT Traversal (STUN)](#0-ad--nat-traversal-stun)
7. [0 A.D. — Rejoin & State Transfer](#0-ad--rejoin--state-transfer)
8. [0 A.D. — TimeWarp Debugging](#0-ad--timewarp-debugging)
9. [0 A.D. — Serialization Test Mode](#0-ad--serialization-test-mode)
10. [Warzone 2100 — Overview](#warzone-2100--overview)
11. [Warzone 2100 — Networking Model](#warzone-2100--networking-model)
12. [Warzone 2100 — Sync Debug & Desync Detection](#warzone-2100--sync-debug--desync-detection)
13. [Warzone 2100 — Replay System](#warzone-2100--replay-system)
14. [Warzone 2100 — Identity & Crypto](#warzone-2100--identity--crypto)
15. [Warzone 2100 — Blind Mode](#warzone-2100--blind-mode)
16. [Warzone 2100 — Permissions & Banning](#warzone-2100--permissions--banning)
17. [Warzone 2100 — Connection & Lobby Infrastructure](#warzone-2100--connection--lobby-infrastructure)
18. [Warzone 2100 — Notable Features](#warzone-2100--notable-features)
19. [Comparative Analysis](#comparative-analysis)
20. [Gap Analysis vs Iron Curtain](#gap-analysis-vs-iron-curtain)
21. [Techniques Worth Adopting](#techniques-worth-adopting)

---

## 0 A.D. — Overview

**Language:** C++ with SpiderMonkey JavaScript for gameplay scripting  
**Transport:** ENet (reliable UDP)  
**Topology:** Client-server (host acts as server)  
**Lobby:** XMPP (gloox library)  
**NAT Traversal:** STUN (RFC 5389) with XMPP/Jingle signaling  
**Key source paths:** `source/network/`, `source/simulation2/system/TurnManager.*`, `source/ps/Replay.*`

---

## 0 A.D. — Networking Model

### Architecture

The server runs in a **dedicated worker thread** (`CNetServerWorker`) separated from the host player's game loop, protected by `m_WorkerMutex`. This is a deliberate design: network server responsiveness is decoupled from the host's rendering framerate.

```
source/network/NetServer.h — CNetServerWorker
source/network/NetClient.h — CNetClient (FSM)
```

**Connection limits:** Max 41 simultaneous connections (8 players + 32 observers + 1 temporary).

### Client State Machine

`CNetClient` is implemented as a finite state machine (`CFsm<CNetClient>`) with these states:

| State              | Description                   |
| ------------------ | ----------------------------- |
| `NCS_UNCONNECTED`  | Initial state                 |
| `NCS_PREGAME`      | Connected, in lobby           |
| `NCS_LOADING`      | Loading game data             |
| `NCS_JOIN_SYNCING` | Rejoining an in-progress game |
| `NCS_INGAME`       | Playing                       |

State transitions are driven by network message types (`NMT_*`). The FSM-based approach provides clean separation of connection lifecycle phases.

### Disconnect Reasons

An enum of disconnect reasons provides diagnostic granularity:

- `NDR_KICKED`, `NDR_BANNED` — administrative
- `NDR_LOBBY_AUTH_FAILED` — authentication
- `NDR_INCORRECT_READY_TURN_COMMANDS`, `NDR_INCORRECT_READY_TURN_SIMULATED` — protocol violations (turn advancement out of order)
- `NDR_STUN_PORT_FAILED`, `NDR_STUN_ENDPOINT_FAILED` — NAT traversal failures

### Ping Threshold

```cpp
NETWORK_BAD_PING = DEFAULT_TURN_LENGTH * COMMAND_DELAY_MP / 2
```

Once a client's ping exceeds this threshold, the game effectively freezes for other players (lockstep stall).

---

## 0 A.D. — Turn System & Lockstep

### Core Parameters

```cpp
DEFAULT_TURN_LENGTH = 200  // ms per turn
COMMAND_DELAY_SP = 1       // single-player: commands execute next turn
COMMAND_DELAY_MP > 1       // multiplayer: commands delayed further
```

### Turn Flow

1. Client calls `PostCommand()` → command sent to server via `CSimulationMessage`
2. Server schedules command for `currentTurn + commandDelay`
3. Server tracks per-client readiness: `readyTurn` and `simulatedTurn`
4. `CheckClientsReady()` advances turns only when **all** clients report ready
5. Client calls `NotifyFinishedOwnCommands(turn)` and `NotifyFinishedUpdate(turn)` to signal progress

**Key design note:** The client currently does NOT add its own commands to the local queue — commands round-trip through the server. There's a TODO in the source: *"we should do this when the server stops sending our commands back to us"*.

### Stalling

Clients freeze if they reach `CURRENT_TURN + COMMAND_DELAY - 1` without receiving all commands for the next turn. No adaptive run-ahead — the system simply stalls.

### Server Turn Manager (`CNetServerTurnManager`)

```cpp
struct Client {
    u32 readyTurn;
    u32 simulatedTurn;
    bool isObserver;
    bool isOOS;
    CStrW playerName;
};

std::unordered_map<int, Client> m_ClientsData;
std::map<u32, std::map<int, std::string>> m_ClientStateHashes; // turn → {clientID → hash}
std::vector<u32> m_SavedTurnLengths;
```

The server enforces sequential turn advancement — if a client reports a turn that isn't exactly `simulatedTurn + 1`, it's disconnected with `NDR_INCORRECT_READY_TURN_SIMULATED`.

---

## 0 A.D. — Desync Detection & State Hashing

### Dual-Mode Hashing

0 A.D. implements **two hash modes** for different cost/coverage tradeoffs:

```cpp
bool TurnNeedsFullHash(u32 turn) const {
    if (turn == 1) return true;       // Check immediately for version mismatches
    if (turn % 20 == 0) return true;  // Full hash every ~10 seconds (at 200ms/turn)
    return false;
}
```

- **Quick hash:** Only hashes unit positions (`CID_Position` component). Fast enough to run every turn.
- **Full hash:** Hashes all serializable component state. Runs on turn 1 and every 20 turns.

### Hash Computation (`CComponentManager::ComputeStateHash`)

Uses a custom `CHashSerializer` built on Crypto++ hash functions. The hash includes:

1. RNG state (serialized `boost::random::rand48`)
2. Next entity ID counter
3. All components (full mode) or just Position components (quick mode)
4. Each component serialized via its `Serialize()` method into the hash stream

Hash length is **16 bytes** (128-bit).

### Hash Comparison Flow

1. Client computes hash after each turn update
2. Client sends `CSyncCheckMessage { turn, hash }` to server
3. Server collects hashes in `m_ClientStateHashes[turn][clientID]`
4. When all clients have submitted for a turn, server compares
5. Server assumes **host is correct** (first client's hash is "expected")
6. Mismatching clients flagged as OOS

### OOS Response

On desync detection:

1. Server broadcasts `CSyncErrorMessage { turn, expectedHash, OOSPlayerNames[] }`
2. Each client dumps state to files:
   - Text dump: `oos_dump.txt` (human-readable via `DumpDebugState`)
   - Binary dump: `oos_dump.dat` (full serialized state via `SerializeState`)
3. GUI shows which players are OOS and whether local hash matches host

**Notable:** Once `m_HasSyncError` is set, further sync checking is disabled — the server stops comparing hashes.

---

## 0 A.D. — Replay System

### Format

Text-based log format in `commands.txt`:

```
turn <N> <turnLength>
cmd <playerID> <JSON_command>
cmd <playerID> <JSON_command>
end
hash <hex_hash>           // full hash
hash-quick <hex_hash>     // quick hash (position-only)
```

### Recording (`CReplayLogger`)

```cpp
class CReplayLogger : public IReplayLogger {
    void StartGame(JS::MutableHandleValue attribs);  // game attributes as JSON
    void Turn(u32 n, u32 turnLength, std::vector<SimulationCommand>& commands);
    void Hash(const std::string& hash, bool quick);
    void SaveMetadata(const CSimulation2& simulation); // metadata.json for summary screen
};
```

- Commands are stringified to JSON via `Script::StringifyJSON`
- Stream is flushed after each turn
- Metadata saved at game end includes summary screen data

### Playback (`CReplayPlayer`, `CReplayTurnManager`)

The replay player:
1. Parses the text log line by line
2. Stores commands per turn in `m_ReplayCommands`
3. Stores turn lengths in `m_ReplayTurnLengths`
4. Stores hashes in `m_ReplayHash` (with quick/full flag)
5. On each turn completion, computes local hash and compares against stored hash
6. Fires `ReplayOutOfSync` GUI event on mismatch

**Replay verification flags** (command-line):
- `-serializationtest` — runs dual-sim serialization test during replay
- `-rejointest=N` — simulates a rejoin at turn N
- `-ooslog` — dumps full state every turn
- `-hashtest-full=X` — toggle full hash verification (default true)

### Design Notes

- Text format is human-readable and diff-friendly but not space-efficient
- No embedded map data (unlike Warzone 2100)
- No background writing thread — synchronous I/O on game thread
- Profile data every 20 turns (`PROFILE_TURN_INTERVAL = 20`)

---

## 0 A.D. — NAT Traversal (STUN)

### Implementation (`source/network/StunClient.cpp`)

Full RFC 5389 STUN implementation:

```cpp
static const u32 m_MagicCookie = 0x2112A442;
static const u16 m_MethodTypeBinding = 0x01;
static const u16 m_BindingSuccessResponse = 0x0101;
```

### Connection Flow

1. **Host discovery:** `FindPublicIP(ENetHost&)` sends STUN Binding Request to configured server (`lobby.stun.server:lobby.stun.port`), parses response for XOR-Mapped-Address or Mapped-Address attributes to learn public IP/port.

2. **Signaling via XMPP:** Host's connection data (IP, port, useSTUN flag, password, clientSalt) sent to client via XMPP stanza extension (`ConnectionData`). Uses Jingle ICE-UDP for candidate exchange.

3. **Hole punching:**
   - Host receives client's STUN endpoint via Jingle ICE-UDP candidate
   - Host calls `SendHolePunchingMessages()` — sends **3 STUN Binding Requests** to client's address with **200ms delay** between each
   - Client waits **1 second** (for host's punches to open NAT pinhole), then sends its own 3 punches
   - Client attempts ENet connection to host's public address

4. **Hairpinning fallback:** If client's public IP equals server's public IP (same NAT), client re-requests local IP via XMPP for direct LAN connection.

5. **Local IP discovery:** `FindLocalIP()` — opens UDP socket, connects to dummy address `100.0.100.0:9`, reads locally bound address.

### Authentication

```cpp
// Password hashed before transmission:
HashCryptographically(password, hostJID + password + engine_version)
```

Ban system with `m_FailedAttempts` map and `m_BanAfterNumberOfTries` threshold.

---

## 0 A.D. — Rejoin & State Transfer

### Rejoin Flow

When a player disconnects and reconnects mid-game:

1. Client transitions to `NCS_JOIN_SYNCING` state
2. Server sends full serialized game state in `m_JoinSyncBuffer` (compressed with zlib)
3. Client loads initial map, then deserializes buffered state:

```cpp
void CNetClient::LoadFinished() {
    DecompressZLib(m_JoinSyncBuffer, state, true);
    // State includes turn number prefix
    stream.read((char*)&turn, sizeof(turn));
    m_Game->GetSimulation2()->DeserializeState(stream);
    m_ClientTurnManager->ResetState(turn, turn);
}
```

4. During sync, client receives command batches and calls `UpdateFastForward()` to catch up
5. Server stores all commands in `m_SavedCommands` vector (indexed by turn) to support rejoin

### State Serialization Format

```
Number of SYSTEM_ENTITY component types
For each component type:
    Component type NAME (not ID — survives patching)
    Component state
Number of non-empty component types
For each component type:
    Component type name
    Number of entities
    For each entity:
        Entity ID
        Component state
```

Names are serialized instead of IDs so saved games survive patches that renumber component types.

### Caveats

- Server keeps **all** commands from game start (`m_SavedCommands`) — acknowledged as a potential RAM issue (TODO in source)
- Full state transfer requires complete serialization/deserialization — no delta/incremental approach
- `SimState::Freeze()` / `SimState::Thaw()` used by the Atlas editor for save/restore

---

## 0 A.D. — TimeWarp Debugging

A developer-only feature that records periodic state snapshots and allows rewinding:

```cpp
void CTurnManager::EnableTimeWarpRecording(size_t numTurns) {
    m_TimeWarpStates.clear();
    m_TimeWarpNumTurns = numTurns; // snapshot every N turns
}

void CTurnManager::RewindTimeWarp() {
    std::stringstream stream(m_TimeWarpStates.back());
    m_Simulation2.DeserializeState(stream);
    m_TimeWarpStates.pop_back();
    ResetState(1, m_CommandDelay);
}
```

- Snapshots stored as serialized strings in `std::list<std::string>`
- Snapshots taken every `NumberTurns` turns (default 10)
- **Disabled in networked games** (`if (g_IsNetworked) return;`)
- Also supports fast-forward at 20x speed (`FastForwardSpeed = 20`)
- Memory warning: "not intended for use over long periods of time"

### QuickSave/QuickLoad

Separate from TimeWarp, uses the same serialization mechanism:

```cpp
void QuickSave(JS::HandleValue GUIMetadata); // stores state + GUI metadata
void QuickLoad();                             // restores state, fires "SavegameLoaded" event
```

---

## 0 A.D. — Serialization Test Mode

A build-time testing feature that catches determinism bugs proactively:

```cpp
if (m_EnableSerializationTest || m_TestingRejoin) {
    // 1. Serialize state BEFORE update
    m_ComponentManager.SerializeState(primaryStateBefore.state);
    m_ComponentManager.ComputeStateHash(primaryStateBefore.hash, false);

    // 2. Deserialize into SECONDARY component manager
    m_SecondaryComponentManager->DeserializeState(secondaryStateBefore.state);

    // 3. Run update on BOTH primary and secondary
    UpdateComponents(m_ComponentManager, ...);
    UpdateComponents(*m_SecondaryComponentManager, ...);

    // 4. Compare state AFTER update
    if (primaryStateAfter.state != secondaryStateAfter.state ||
        primaryStateAfter.hash != secondaryStateAfter.hash) {
        ReportSerializationFailure(...);
    }
}
```

This maintains a **complete secondary simulation** that processes the same commands through serialize → deserialize → update and compares results. It catches:

- Non-deterministic serialization (state that doesn't round-trip)
- Uninitialized memory influencing simulation
- Missing serialization of state that affects gameplay

The `-rejointest=N` flag is a lighter version that starts the secondary sim only at turn N, specifically to catch rejoin-related desyncs.

---

## Warzone 2100 — Overview

**Language:** C++  
**Transport:** TCP sockets (default), optional GameNetworkingSockets  
**Topology:** Host-based relay (non-host clients communicate via host using `NET_SEND_TO_PLAYER`)  
**Crypto:** libsodium (Ed25519, XChaCha20-Poly1305)  
**Port Mapping:** miniUPnPC + libplum  
**Key source paths:** `lib/netplay/`, `src/multiopt.cpp`, `src/multijoin.cpp`, `src/screens/joiningscreen.cpp`

---

## Warzone 2100 — Networking Model

### Architecture

Host acts as message relay. Non-host clients send messages to host, which relays to other players via `NET_SEND_TO_PLAYER`. Direct client-to-client communication does not occur.

```cpp
// Key globals
static IListenSocket* server_listen_socket = nullptr;
static IClientConnection* bsocket = nullptr;                    // client→host socket
static IClientConnection* connected_bsocket[MAX_CONNECTED_PLAYERS] = {nullptr}; // host→client sockets
```

**Max message size:** 32,768 bytes (`MaxMsgSize`).  
**Net buffer:** `NET_BUFFER_SIZE = MaxMsgSize * 8` (256KB).  
**Protocol versioning:** Auto-generated `NETCODE_VERSION_MAJOR`/`NETCODE_VERSION_MINOR` from `autorevision` for compatibility checks.

### Connection Provider Abstraction

```cpp
class WzConnectionProvider {
    // Abstract interface for TCP sockets or GameNetworkingSockets
};

class ConnectionProviderRegistry {
    // Registry of available providers, switchable at runtime
};
```

This allows plugging in Valve's GameNetworkingSockets as an alternative transport — providing built-in encryption, NAT traversal, and relay support through Steam's infrastructure.

### Queue System

```cpp
// Synchronized game queues — all players process same messages at same game time
static NETQUEUE gameQueues[MAX_CONNECTED_PLAYERS + 1]; // +1 for replay spectator
static NETQUEUE broadcastQueue;
```

Game queues are synchronized: all players process the same messages at the same game time. Broadcast queue is for messages that don't need synchronization.

### Player Connection Status

```cpp
unsigned NET_PlayerConnectionStatus[CONNECTIONSTATUS_NORMAL][MAX_CONNECTED_PLAYERS];
```

Tracks connection health per player.

### Host Threading

Unlike 0 A.D.'s dedicated server thread, Warzone 2100's network processing runs on the **main game loop** — `NETrecvNet()` is called during the game update cycle. It handles:
- `NETfixPlayerCount()` — reconcile player count
- `NETacceptIncomingConnections()` — accept new TCP connections
- `NETallowJoining()` — process join requests, lobby registration
- `NETcheckPlayers()` — heartbeat/timeout checks

### Disconnect Handling

```cpp
static void NETplayerClientsDisconnect(const std::set<uint32_t>& indexes) {
    // 1. Close sockets (batch)
    // 2. Broadcast NET_PLAYER_DROPPED for each
    // 3. NET_DestroyPlayer() — reset slot
}
```

Distinguishes between clean leave (`NET_PLAYER_LEAVING` → `NETplayerLeaving`) and dropped connection (`NETplayerDropped`).

`PlayerReference` struct provides read-only access to player data even after disconnect — holds a detached copy of player state.

---

## Warzone 2100 — Sync Debug & Desync Detection

### Architecture (`lib/netplay/sync_debug.cpp`)

Circular buffer of `MAX_SYNC_HISTORY = 12` `SyncDebugLog` entries, each representing one game tick.

### CRC Accumulation

Every `syncDebug()` call during a tick updates a running **CRC32C** hash:

```cpp
// Entry types:
SyncDebugString     // function name + string description
SyncDebugValueChange // function + variable name + new value + id
SyncDebugIntList    // function + format string + up to 40 ints
```

Each call to `syncDebug()` updates the CRC with the function name and data. Value changes use `wz_htonl()` for byte-order independence.

### Per-Tick CRC

```cpp
using GameCrcType = uint16_t; // CRC truncated to 16 bits to save bandwidth
```

`nextDebugSync()` returns the accumulated CRC for the current tick and advances the circular buffer to the next slot. Only 16 bits are transmitted — a deliberate bandwidth/detection tradeoff.

### What Gets Synced

Per-droid sync logging (`_syncDebugDroid`):
- ID, player, position (x,y,z), rotation (direction, pitch, roll)
- Order type, order position, order list size
- Action, secondary order, body, move status

Per-structure sync logging (`_syncDebugStructure`):
- Structure details, current production/research

Map sync logging (`syncLogDumpAuxMaps`):
- Full auxiliary and blocking tile maps

### Desync Detection

```cpp
void checkDebugSync(uint32_t gameTime, GameCrcType checkCrc) {
    // Compare received CRC against local log
    // On mismatch:
    //   1. Dump local sync log
    //   2. Broadcast via NET_DEBUG_SYNC (chunked, max packet size per message)
    //   3. Write to logs/desync{time}_p{player}.txt
}
```

### Desync Log Management

```cpp
class DesyncLogOutputter {
    // Per-player log management
    static constexpr size_t MaxPlayerSyncDebugDumps = 2;    // max dumps per player
    static constexpr size_t MaxDesyncLogSize = 5 * 1024 * 1024; // 5MB per log
    static constexpr size_t kDefaultDebugSyncBufferSize = 4 * 1024 * 1024; // 4MB buffer
};
```

### Verbose Mode

```cpp
NET_setDebuggingModeVerboseOutputAllSyncLogs(untilGameTime);
```

Outputs **every** player's sync log for **every** tick until specified time. Warning in source: "significant performance impact."

### Backtrace Support

```cpp
_syncDebugBacktrace(); // Linux/glibc: uses backtrace()/backtrace_symbols()
// Uses CRC of function NAME (platform-independent) rather than raw backtrace
// This avoids false desyncs from different ASLR/compiler layouts
```

---

## Warzone 2100 — Replay System

### Format (`lib/netplay/netreplay.cpp`)

Binary format with `.wzrp` extension:

```
[Magic: 0x575A7270 ("WZrp")]
[JSON preamble: replayFormatVer, netcode versions, gameOptions]
[Message stream: type-prefixed, player-tagged]
[REPLAY_ENDED sentinel]
[JSON settings footer + size]
```

Current format version = 3, minimum supported = 3.

### Recording

```cpp
void NETreplaySaveStart();  // opens file, writes header
void NETreplaySaveNetMessage(const NetMessage& msg);  // filter & buffer
void NETreplaySaveStop();   // finalize & close
```

**Background writer thread** (`replaySaveThreadFunc`) consumes from `moodycamel::BlockingReaderWriterQueue`:

```cpp
// Messages buffered in latestWriteBuffer (default 32KB, max 2MB)
// before being queued to background thread for async I/O
```

**Message filtering:** Only game messages (`GAME_MIN_TYPE < type < GAME_MAX_TYPE`) are recorded. Each message is prefixed with the player byte.

### Stopping

```cpp
void NETreplaySaveStop() {
    // 1. Append REPLAY_ENDED sentinel message
    // 2. Queue empty buffer to signal thread completion
    // 3. Wait for thread join
    // 4. Append final JSON settings + size footer
}
```

### Loading

```cpp
void NETreplayLoadStart();  // validate magic + format version
void NETloadReplay();       // push all messages into gameQueues[player]
```

### Embedded Maps

```cpp
ReplayOptionsHandler::EmbeddedMapData  // supports embedding map binary data in replay files
```

This is a significant UX improvement — replays are self-contained.

### Auto-Cleanup

Old replays automatically deleted based on `war_getMaxReplaysSaved()` config.

---

## Warzone 2100 — Identity & Crypto

### EcKey Class (`lib/framework/crc.h/cpp`)

Wraps libsodium Ed25519:

```cpp
struct EC_KEY {
    unsigned char privateKey[crypto_sign_ed25519_SECRETKEYBYTES]; // 64 bytes
    unsigned char publicKey[crypto_sign_ed25519_PUBLICKEYBYTES];  // 32 bytes
};

class EcKey {
    void generate();           // crypto_sign_ed25519_keypair()
    Sig sign(const Bytes& msg); // crypto_sign_ed25519_detached()
    bool verify(const Sig& sig, const Bytes& msg); // crypto_sign_ed25519_verify_detached()
    std::string publicHashString(); // SHA256 of public key bytes
};
```

### SessionKeys Class

Derives **symmetric encryption keys** from Ed25519 keypairs for encrypted messaging:

```cpp
class SessionKeys {
    // Convert Ed25519 → Curve25519 for ECDH:
    //   crypto_sign_ed25519_pk_to_curve25519()
    //   crypto_sign_ed25519_sk_to_curve25519()

    // AEAD encryption:
    //   crypto_aead_xchacha20poly1305_ietf (24-byte nonces)

    Key receiveKey;
    Key sendKey;  // separate directional keys
    // WARNING: Not thread-safe for encryption
};
```

### Join Verification Flow

1. Client sends `pkey` (public key), `identity`, `encryptedChallengeResponse` in `NET_JOIN` message
2. Host validates public key via `identity.fromBytes(pkey, EcKey::Public)`
3. Host checks `netPermissionsCheck_Connect(identity)` against blacklist
4. Host creates `SessionKeys` with client, encrypts challenge response → sends in `NET_ACCEPTED`
5. Client verifies host's challenge response: decrypts with SessionKeys, verifies signature with `hostIdentity.verify()`
6. `VerifiedIdentity[playerIndex]` tracked per player

### Key Insight

The challenge-response flow provides **mutual authentication** — the client can verify it connected to the expected host. Iron Curtain's relay server design handles this differently (relay is the trusted authority), but for P2P or direct connections, mutual authentication is valuable.

---

## Warzone 2100 — Blind Mode

A privacy feature for competitive play:

```cpp
enum class BLIND_MODE { OFF, BLIND_GAME };

// When BLIND_MODE::BLIND_GAME:
EcKey generateBlindIdentity();           // random throwaway identity
EcKey getLocalSharedIdentity();          // returns blind identity during game
EcKey getTruePlayerIdentity();           // returns real identity only on host or after game ends
bool isBlindPlayerInfoState();           // controls when player info is revealed
```

Prevents players from identifying opponents by public key during the game. Real identities are only revealed to the host (for banning purposes) or after the game ends.

### Known Players Database

```cpp
bool isLocallyKnownPlayer(const std::string& name, const EcKey& key);
void addKnownPlayer(const std::string& name, const EcKey& key);
// Local-only database (knownPlayersDB) mapping player names to public keys
```

---

## Warzone 2100 — Permissions & Banning

### IP-Based Banning

```cpp
std::deque<PLAYER_IP> IPlist;  // max 1024 entries
void addIPToBanList(const char* ip);
void removeIPFromBanList(const char* ip);
bool onBanList(const char* ip);
bool isLoopbackIP(const char* ip);
```

### Identity-Based Permissions

```cpp
std::unordered_map<std::string, IdentityPermissions> identityPermissions;

enum class ConnectPermissions { Blocked, Allowed };

optional<ConnectPermissions> netPermissionsCheck_Connect(const EcKey& identity);
// Checks both base64 public key AND public hash (key takes precedence)
```

### User Config

```cpp
void NETloadUserConfigBanList();  // Load from file
// Uses re2 regex library for pattern matching
```

### Host-Side Anti-Rejoin

```cpp
PlayerManagementRecord playerManagementRecord;
// Tracks players that host moved to spectators
// Prevents them from rejoining as players (they can only rejoin as spectators)
```

---

## Warzone 2100 — Connection & Lobby Infrastructure

### Lobby Server Connection

```cpp
class LobbyServerConnectionHandler {
    enum class LobbyConnectionState {
        Disconnected,
        Connecting_WaitingForResponse,
        Connected
    };

    void connect();
    void disconnect();
    void sendUpdate();
    void sendKeepAlive();
    void run();  // State machine, called from main loop
};
```

- Sends `GAMESTRUCT` to lobby server on connect and periodically
- Automatic reconnection handling
- MOTD (Message of the Day) display
- Server update interval: `SERVER_UPDATE_MIN_INTERVAL = 7 * GAME_TICKS_PER_SEC`, max 25 ticks

### Port Mapping

Two backends:
- miniUPnPC — standard UPnP port mapping
- libplum — additional NAT traversal library

```cpp
PortMappingAsyncRequestHandle ipv4MappingRequest;
```

Port mapping is asynchronous and non-blocking.

### Connection Flow (Client Side)

```cpp
enum class JoiningState {
    NeedsPassword,
    AwaitingConnection,
    AwaitingInitialNetcodeHandshakeAck,
    // ... further states for join protocol
};
```

1. Client opens async connection (15s timeout)
2. Sends `NETCODE_VERSION_MAJOR` + `NETCODE_VERSION_MINOR`
3. Waits for host version acknowledgment
4. Sends `NET_JOIN` with name, mod list, password, player type, public key, encrypted challenge response
5. Host validates, creates session keys, sends `NET_ACCEPTED` with encrypted host challenge response
6. Client verifies host identity
7. Socket promoted from transient to permanent (`NETpromoteJoinAttemptToEstablishedConnectionToHost`)

### Multi-Connection Fallback

```cpp
std::vector<JoinConnectionDescription> connectionList;
size_t currentConnectionIdx = 0;
size_t numJoinRedirects = 0;
```

Client can try multiple connection paths (direct, relay, redirects) sequentially.

---

## Warzone 2100 — Notable Features

### Async Join Approval

```cpp
void NETsetAsyncJoinApprovalRequired(bool required);
bool NETsetAsyncJoinApprovalResult(
    const std::string& uniqueJoinID,
    AsyncJoinApprovalAction action,       // Approve, ApproveSpectators, Reject
    optional<uint8_t> explicitPlayerIdx,
    LOBBY_ERROR_TYPES rejectedReason,
    optional<std::string> customRejectionMessage
);
```

Host can asynchronously approve/reject join requests, with the option to force players into spectator slots.

### Spectator System

Full spectator support with dedicated slots, `isSpectator` flag, and ability to move between player/spectator roles (`NETmovePlayerToSpectatorOnlySlot`, `NETrequestSpectatorToPlay`).

### File Transfer

```cpp
void NETsendFile(...);
void NETrecvFile(...);
// For map/mod distribution to joining players
// Downloads tracked via wzFiles per player
```

### Player Index Swapping

```cpp
static bool swapPlayerIndexes(uint32_t playerIndexA, uint32_t playerIndexB);
// Swaps socket connections, multistats, identity info, NetPlay.players entries
```

### Game Story Logger

```cpp
class GameStoryLogger {
    // Logs game frames every 15 seconds
    // Records research events, debug mode changes, player attributes
    // Outputs JSON reports for spectators/autohosters
};
```

### Netlog Statistics

```cpp
// Per-packet-type stats: count + bytes sent/received
// Sync counter logging: joins, kicks, drops, left, banned, cantjoin, rejected
```

### Kick Voting

```cpp
resetKickVoteData();
// Players can vote to kick others
```

### Data Integrity Tracking

```cpp
ingame.DataIntegrity[player] = false;  // tracked per player
ingame.DesyncCounter[player] = 0;      // desync events per player
ingame.LagCounter[player] = 0;         // lag events per player
```

### Player Leave Mode

```cpp
enum class PLAYER_LEAVE_MODE { ... };
game.playerLeaveMode = ...; // configurable behavior when players leave
```

---

## Comparative Analysis

| Feature                  | 0 A.D.                                  | Warzone 2100                           | Iron Curtain (planned)                                         |
| ------------------------ | --------------------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| **Transport**            | ENet (reliable UDP)                     | TCP + optional GameNetworkingSockets   | DTLS 1.3 / TLS 1.3                                             |
| **Topology**             | Client-server (host)                    | Host-based relay                       | Dedicated relay server                                         |
| **Server threading**     | Dedicated worker thread                 | Main loop                              | Relay is separate process                                      |
| **Turn length**          | 200ms fixed                             | Configurable                           | Configurable                                                   |
| **Command delay**        | Fixed (SP=1, MP>1)                      | Fixed                                  | Adaptive run-ahead                                             |
| **State hash**           | 128-bit (Crypto++)                      | 16-bit CRC32C                          | Per-tick full hash                                             |
| **Hash frequency**       | Quick every turn, full every 20         | Every tick (16-bit)                    | Every tick (full)                                              |
| **Desync dump**          | Text + binary state dump                | Per-entity sync log + chunked transfer | Snapshots + state diff                                         |
| **Replay format**        | Text (JSON commands)                    | Binary (.wzrp) with background writer  | Binary (initial state + TickOrders, Ed25519-signed hash chain) |
| **Replay maps**          | Not embedded                            | Embedded in replay                     | Embedded in replay (adopted from WZ2100)                       |
| **NAT traversal**        | STUN (RFC 5389) + XMPP signaling        | miniUPnPC + libplum                    | Relay (NAT-free)                                               |
| **Identity**             | XMPP lobby accounts                     | Ed25519 persistent keys                | Ed25519 per-order signing                                      |
| **Encryption**           | XMPP TLS (lobby only)                   | XChaCha20-Poly1305 (SessionKeys)       | DTLS 1.3 (all traffic)                                         |
| **Mutual auth**          | Password hash                           | Challenge-response with Ed25519        | Relay-certified                                                |
| **Blind mode**           | No                                      | Yes (random throwaway identity)        | No (not planned)                                               |
| **Spectators**           | Yes (32 slots)                          | Yes (dedicated slots, role switching)  | Yes (configurable delay for anti-coaching)                     |
| **File transfer**        | No (mods pre-installed)                 | Yes (map/mod transfer)                 | Workshop system (D030)                                         |
| **Rejoin**               | Full state serialization + fast-forward | Not supported mid-game                 | Snapshot-based (D010) + pending order sync                     |
| **Serialization test**   | Dual-sim comparison mode                | No                                     | Dual-mode hashing (RNG + periodic full)                        |
| **Banning**              | IP + lobby                              | IP + Ed25519 identity                  | Relay-certified results                                        |
| **Async join**           | No                                      | Yes (approve/reject/spectator)         | Yes (relay-managed join approval)                              |
| **Kick voting**          | No                                      | Yes                                    | Yes (relay-facilitated, majority vote)                         |
| **Connection providers** | ENet only                               | Pluggable (TCP/GNS)                    | Pluggable (NetworkModel trait)                                 |
| **Lobby**                | XMPP (gloox)                            | Custom lobby server                    | Tracking server (TrackingServer trait)                         |

---

## Gap Analysis vs Iron Curtain

### Iron Curtain Already Has (Advantages)

1. **Dedicated relay server** — Neither 0 A.D. nor WZ2100 has this. Both use host-as-relay, meaning the host's connection quality affects everyone. IC's relay design (D007) is architecturally superior.

2. **Sub-tick timestamps** (D008) — Neither game has this. CS2-inspired fairness for simultaneous actions.

3. **Adaptive run-ahead** — 0 A.D. has no adaptive delay (fixed `COMMAND_DELAY_MP`). WZ2100 also uses fixed timing. IC plans Generals-style adaptive run-ahead.

4. **Full per-tick state hashing** — WZ2100 truncates to 16 bits. 0 A.D. only does full hashes every 20 turns. IC plans full hash every tick. (But should consider the performance cost — 0 A.D.'s "quick mode" is instructive.)

5. **Per-order Ed25519 signing** — WZ2100 uses Ed25519 for identity, not per-order. 0 A.D. has no order signing. IC signs every order.

6. **Transport encryption** — IC plans DTLS 1.3 for all traffic. WZ2100 encrypts with XChaCha20-Poly1305 at the application layer. 0 A.D. only encrypts the lobby (XMPP TLS), not game traffic.

7. **Pluggable network model trait** — IC's `GameLoop<N: NetworkModel>` is cleaner than either game's approach. WZ2100's `ConnectionProviderRegistry` is transport-level only.

8. **Fixed-point determinism** — IC mandates no floats in sim (D009). 0 A.D. uses fixed-point math for positions but has floats elsewhere. WZ2100 has similar mixed usage.

### Iron Curtain Should Consider Adding

1. **Dual-mode hashing (quick + full)** — 0 A.D.'s approach of cheap position-only hashes every turn + expensive full hashes periodically is pragmatic. IC's "full hash every tick" target may be too expensive at scale. Consider a configurable quick/full cadence.

2. **Serialization test mode** — 0 A.D.'s dual-sim comparison is an excellent automated determinism testing tool. IC should implement something similar: run a secondary ECS world that processes serialized-then-deserialized state through the same tick, and compare. This catches serialization bugs before they become multiplayer desyncs.

3. **Detailed per-entity desync logging** — WZ2100's `syncDebug()` system that logs individual droid/structure state with function-level granularity is far more diagnostic than just "hashes don't match." IC should instrument key ECS systems to produce per-entity sync logs that can be diffed across clients.

4. **Replay with embedded maps** — WZ2100 embeds map data in replay files, making them self-contained. IC should do this.

5. **Background replay writer** — WZ2100 uses a lock-free queue (`moodycamel::BlockingReaderWriterQueue`) to write replays on a background thread. IC should use similar async I/O to avoid replay recording affecting sim performance.

6. **Blind/anonymous mode** — WZ2100's blind identity system is relevant for competitive play. Consider for IC's ranked matchmaking — prevent identity-based metagaming during games.

7. **Mutual authentication** — WZ2100's challenge-response flow lets clients verify the host's identity. While IC's relay handles this, direct-connect/LAN modes would benefit from mutual auth.

8. **Async join approval** — WZ2100 allows the host to asynchronously approve/reject/redirect join requests. IC's relay server should support this for moderated games.

9. **Spectator-to-player switching** — WZ2100 supports dynamic role changes. IC should design the spectator system to allow this.

10. **Connection provider abstraction** — WZ2100's `WzConnectionProvider` allows plugging in GameNetworkingSockets. IC should consider supporting Steam's networking library as an optional transport (in addition to the relay) for Steam users, piggybacking on Steam's relay infrastructure.

11. **Desync log transfer** — WZ2100 chunks and sends desync logs between players via `NET_DEBUG_SYNC` messages. This allows the host (or a spectator) to receive all clients' sync state for comparison without requiring manual file collection.

12. **Player management records** — WZ2100 tracks which players were kicked/moved-to-spectators, preventing them from rejoining in the same role. IC's relay should maintain similar session-level player management state.

13. **Game story logging** — WZ2100's `GameStoryLogger` records periodic game frames, research events, debug state as JSON for autohosters and spectators. IC already plans this via OTEL (D031) + SQLite (D034), which is more comprehensive.

14. **CRC of function names for cross-platform backtrace sync** — WZ2100's approach of using CRC of function names instead of raw backtraces for sync checks is clever: it's platform-independent. If IC instruments sync debugging, should use a similar approach.

### Iron Curtain Probably Doesn't Need

1. **STUN/ICE for NAT traversal** — IC's relay server design (D007) makes STUN unnecessary for the default multiplayer path. 0 A.D. needs STUN because it's P2P. IC might want STUN only for optional direct-connect/LAN discovery, which is low priority.

2. **Host-based relay topology** — Both games use host-as-relay, which ties network quality to one player. IC's dedicated relay is better.

3. **IP-based banning** — IC should use identity-based (Ed25519 key) banning through the relay. IP bans are unreliable (VPNs, dynamic IPs). WZ2100 uses both; 0 A.D. uses IP + XMPP accounts.

4. **Text-based replay format** — 0 A.D.'s text format is diff-friendly but inefficient. IC should use binary (like WZ2100) with optional tools for human-readable export.

---

## Techniques Worth Adopting

### Priority 1 — High-Value, Low-Effort

| Technique                       | Source | Why                                                                       | Effort |
| ------------------------------- | ------ | ------------------------------------------------------------------------- | ------ |
| Quick/full hash cadence         | 0 A.D. | Position-only hash every tick, full every N ticks — pragmatic performance | Low    |
| Background replay writer        | WZ2100 | Lock-free queue + background thread for zero-impact recording             | Low    |
| Embedded maps in replays        | WZ2100 | Self-contained replays, better UX                                         | Low    |
| Per-entity sync instrumentation | WZ2100 | `syncDebug()`-style logging in key ECS systems                            | Medium |
| Replay auto-cleanup             | WZ2100 | `max_replays_saved` config, auto-delete oldest                            | Low    |

### Priority 2 — High-Value, Medium-Effort

| Technique                    | Source | Why                                                                     | Effort |
| ---------------------------- | ------ | ----------------------------------------------------------------------- | ------ |
| Serialization test mode      | 0 A.D. | Dual-sim determinism verification — catches bugs before they're desyncs | Medium |
| Blind mode for ranked        | WZ2100 | Privacy in competitive play                                             | Medium |
| Async join approval          | WZ2100 | Moderated games, bot-hosted servers                                     | Medium |
| Desync log transfer protocol | WZ2100 | Automated cross-client desync diagnosis                                 | Medium |
| Spectator role switching     | WZ2100 | Player ↔ spectator transitions                                          | Medium |

### Priority 3 — Nice-to-Have

| Technique               | Source | Why                                          | Effort          |
| ----------------------- | ------ | -------------------------------------------- | --------------- |
| TimeWarp debugging      | 0 A.D. | Developer-mode state snapshots for debugging | Low             |
| Kick voting             | WZ2100 | Community moderation                         | Low             |
| Game story logger       | WZ2100 | Already planned via D031/D034                | Already planned |
| Steam GNS transport     | WZ2100 | Optional transport for Steam users           | High            |
| STUN for direct-connect | 0 A.D. | LAN/direct connection fallback               | Medium          |

---

*Research conducted 2025-02. Source code as of latest `main` branches.*
