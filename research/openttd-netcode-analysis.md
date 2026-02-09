# OpenTTD — Netcode Architecture Analysis

> Research for Iron Curtain. Concrete technical findings from source code analysis.
> Repo: [OpenTTD/OpenTTD](https://github.com/OpenTTD/OpenTTD) — C++, GPLv2, 20+ years of active development

---

## Table of Contents

1. [Overview](#overview)
2. [Networking Model — Client-Server Deterministic Lockstep](#networking-model--client-server-deterministic-lockstep)
3. [Frame Synchronization & Command Distribution](#frame-synchronization--command-distribution)
4. [Desync Detection — RNG Seed Comparison](#desync-detection--rng-seed-comparison)
5. [Desync Debugging Infrastructure](#desync-debugging-infrastructure)
6. [Cache Validation System (CheckCaches)](#cache-validation-system-checkcaches)
7. [Command-Log Replay System](#command-log-replay-system)
8. [Command Validation & Security](#command-validation--security)
9. [Command Rate Limiting & Bandwidth Control](#command-rate-limiting--bandwidth-control)
10. [Client Join Flow — Map Transfer & Catchup](#client-join-flow--map-transfer--catchup)
11. [Lag Detection & Client Management](#lag-detection--client-management)
12. [Admin Port — External Monitoring Protocol](#admin-port--external-monitoring-protocol)
13. [Save/Load Architecture — Versioned Chunk System](#saveload-architecture--versioned-chunk-system)
14. [Game Coordinator & Server Discovery](#game-coordinator--server-discovery)
15. [Signature & Integrity Validation](#signature--integrity-validation)
16. [Comparative Analysis](#comparative-analysis)
17. [Techniques Worth Adopting for Iron Curtain](#techniques-worth-adopting-for-iron-curtain)

---

## Overview

**Language:** C++ (modern C++20 features, templates, smart pointers)
**Transport:** TCP (game connections), UDP (server discovery/broadcast), TCP (admin port, game coordinator)
**Model:** Client-server deterministic lockstep — server is authoritative on frame advancement and command scheduling; clients execute the same simulation locally
**Compression:** LZO, zlib, LZMA (savegames/map transfer — selectable)
**History:** 20+ years of active multiplayer development (fork of Transport Tycoon Deluxe); one of the most battle-tested deterministic lockstep implementations in open-source gaming

### Why Study This

OpenTTD is arguably the most mature open-source deterministic lockstep implementation. Unlike RTS games with short matches, OpenTTD games can run for hundreds of in-game years across multiple sessions, making desync tolerance and debugging mission-critical. Its solutions to desync diagnosis, mid-game joins, version-spanning save compatibility, and external monitoring are more sophisticated than any RTS we've analyzed. The admin port concept has no equivalent in our previous analyses and maps directly to Iron Curtain's relay server observability goals.

### Key Source Paths

```
src/network/network.cpp              — Main game loop (NetworkGameLoop)
src/network/network_server.cpp       — Server tick, frame/sync/command sending, join flow
src/network/network_client.cpp       — Client game loop, desync check, ACK system
src/network/network_command.cpp      — Command distribution, rate limiting, sanitization
src/network/network_admin.cpp        — Admin port protocol implementation
src/network/network_coordinator.cpp  — Game Coordinator (server listing/NAT)
src/network/core/tcp_game.h          — Packet type enum definitions
src/network/core/tcp_admin.h         — Admin protocol packet definitions
src/network/network_internal.h       — Frame counters, sync variables
src/command.cpp                      — Command execution, desync logging
src/cachecheck.cpp                   — CheckCaches() desync validation
src/saveload/saveload.cpp            — Chunk-based save/load system
src/saveload/saveload.h              — SaveLoad struct, version gating
src/debug.cpp                        — Debug output routing (desync → commands-out.log)
docs/desync.md                       — Comprehensive desync theory & replay guide
docs/debugging_desyncs.md            — Practical desync debugging guide
```

---

## Networking Model — Client-Server Deterministic Lockstep

OpenTTD uses a **client-server topology** where the server is the authoritative source of frame advancement and command scheduling, but every client (including the server itself) runs the full deterministic simulation independently. This is neither pure P2P lockstep nor a state-authoritative server — the server acts as an **order relay with frame-gating authority**.

### Architecture

```
src/network/network.h:18-21
```

```cpp
extern bool _networking;         // are we in networking mode?
extern bool _network_server;     // network-server is active
extern bool _network_available;  // is network mode available?
extern bool _network_dedicated;  // are we a dedicated server?
```

The server maintains four critical frame counters:

```
src/network/network_internal.h:55-68
```

```cpp
extern uint32_t _frame_counter_server; // The frame_counter of the server
extern uint32_t _frame_counter_max;    // To where we may go with our clients
extern uint32_t _frame_counter;        // The current frame
extern uint32_t _last_sync_frame;      // Last time a sync packet was sent

extern uint32_t _sync_seed_1;         // Seed to compare during sync checks
extern uint32_t _sync_seed_2;         // Second part of the seed (optional)
extern uint32_t _sync_frame;          // The frame to perform the sync check
```

### Server Game Loop

The server's `NetworkGameLoop()` increments `_frame_counter`, advances `_frame_counter_max` (the frame ceiling clients are allowed to reach), executes commands, runs `StateGameLoop()`, captures RNG state, and then calls `NetworkServer_Tick()` to inform clients:

```
src/network/network.cpp:1234-1264
```

```cpp
// Server path in NetworkGameLoop():
CheckPauseOnJoin();
CheckMinActiveClients();
NetworkDistributeCommands();

bool send_frame = false;
_frame_counter++;
if (_frame_counter > _frame_counter_max) {
    _frame_counter_max = _frame_counter + _settings_client.network.frame_freq;
    send_frame = true;
}

NetworkExecuteLocalCommandQueue();
StateGameLoop();

_sync_seed_1 = _random.state[0];
_sync_seed_2 = _random.state[1];

NetworkServer_Tick(send_frame);
```

The `frame_freq` setting (default: 1) controls how many frames the server advances before telling clients about the new ceiling. Higher values reduce packet frequency but increase input latency.

### Client Game Loop

Clients advance frames as fast as possible up to `_frame_counter_max` (the server-imposed ceiling), then stop and wait:

```
src/network/network.cpp:1265-1281
```

```cpp
// Client path:
if (_frame_counter_server > _frame_counter) {
    // Run frames to catch up with server
    while (_frame_counter_server > _frame_counter) {
        if (!ClientNetworkGameSocketHandler::GameLoop()) return;
    }
} else {
    // Normal: advance up to the max
    if (_frame_counter_max > _frame_counter) {
        if (!ClientNetworkGameSocketHandler::GameLoop()) return;
    }
}
```

Each client `GameLoop()` tick increments `_frame_counter`, executes commands from the local queue, and runs `StateGameLoop()`:

```
src/network/network_client.cpp:223-230
```

```cpp
/* static */ bool ClientNetworkGameSocketHandler::GameLoop()
{
    _frame_counter++;
    NetworkExecuteLocalCommandQueue();
    StateGameLoop();
    // ... desync check follows
}
```

**Iron Curtain relevance:** This is exactly the `NetworkModel` trait pattern IC uses: the sim is pure (`StateGameLoop` = `apply_tick`), and the network model controls when ticks advance. OpenTTD's `frame_freq` is analogous to IC's relay server batching window. The server-controlled frame ceiling is more conservative than IC's planned relay timing — IC can do sub-tick timestamp ordering within a window, while OpenTTD just batches commands into the next available frame.

---

## Frame Synchronization & Command Distribution

### Packet Types

The core protocol defines a minimal set of game-state packets:

```
src/network/core/tcp_game.h:79-101
```

```
PACKET_SERVER_FRAME     — Server tells client the current frame and max
PACKET_CLIENT_ACK       — Client confirms which frame it has executed
PACKET_SERVER_SYNC      — Server sends RNG state for desync check
PACKET_CLIENT_COMMAND   — Client sends a command to the server
PACKET_SERVER_COMMAND   — Server distributes a command to all clients
```

### Server Sends Frame + Token

The `SendFrame()` function tells each client the current frame, the maximum frame they may advance to, and optionally a random token for liveness checking:

```
src/network/network_server.cpp:640-665
```

```cpp
NetworkRecvStatus ServerNetworkGameSocketHandler::SendFrame()
{
    auto p = std::make_unique<Packet>(this, PACKET_SERVER_FRAME);
    p->Send_uint32(_frame_counter);
    p->Send_uint32(_frame_counter_max);
#ifdef ENABLE_NETWORK_SYNC_EVERY_FRAME
    p->Send_uint32(_sync_seed_1);
    p->Send_uint32(_sync_seed_2);
#endif
    // Random token for liveness validation
    if (this->last_token == 0) {
        this->last_token = InteractiveRandomRange(UINT8_MAX - 1) + 1;
        p->Send_uint8(this->last_token);
    }
    this->SendPacket(std::move(p));
    return NETWORK_RECV_STATUS_OKAY;
}
```

The **random token** is a clever anti-lag mechanism: the server sends a random value, and the client echoes it back in its ACK. If the token doesn't come back within `max_lag_time`, the server kicks the client. This validates that the client is actually processing packets rather than just holding the connection open.

### Client ACK Frequency

Clients send ACKs every `DAY_TICKS` frames (roughly once per in-game day), not every frame. This keeps ACK traffic low for long-running games:

```
src/network/network_client.cpp:924-932
```

```cpp
// Send ACK only once per day
if (!_network_first_time && last_ack_frame < _frame_counter) {
    last_ack_frame = _frame_counter + Ticks::DAY_TICKS;
    Debug(net, 7, "Sent ACK at {}", _frame_counter);
    SendAck();
}
```

### Command Scheduling

When a client sends a command, it sets `frame = 0` (unknown). The server assigns the actual execution frame — always at least 1 tick in the future to ensure fairness:

```
src/network/network_server.cpp:685-703
```

```cpp
NetworkRecvStatus ServerNetworkGameSocketHandler::SendCommand(const CommandPacket &cp)
{
    auto p = std::make_unique<Packet>(this, PACKET_SERVER_COMMAND);
    this->NetworkGameSocketHandler::SendCommand(*p, cp);
    p->Send_uint32(cp.frame);   // Server-assigned execution frame
    p->Send_bool  (cp.my_cmd);  // Whether this command originated from this client
    this->SendPacket(std::move(p));
    return NETWORK_RECV_STATUS_OKAY;
}
```

The server delays its own commands by 1 tick so that other clients' commands scheduled for the same frame aren't disadvantaged. This is simpler than IC's sub-tick timestamp approach (D008) but addresses the same fairness concern.

**Iron Curtain relevance:** IC's relay server design (D007) follows the same pattern of server-assigned frame numbers. OpenTTD's approach of delaying server commands by 1 tick is a simpler alternative to sub-tick ordering — worth considering as a fallback if sub-tick timestamps prove complex.

---

## Desync Detection — RNG Seed Comparison

OpenTTD's desync detection is based on comparing **RNG state** rather than full state hashes. After each tick, the server captures the two 32-bit values of the random number generator state and periodically sends them to clients via `PACKET_SERVER_SYNC`:

### Server Sync Packets

```
src/network/network_server.cpp:666-684
```

```cpp
NetworkRecvStatus ServerNetworkGameSocketHandler::SendSync()
{
    auto p = std::make_unique<Packet>(this, PACKET_SERVER_SYNC);
    p->Send_uint32(_frame_counter);
    p->Send_uint32(_sync_seed_1);
#ifdef NETWORK_SEND_DOUBLE_SEED
    p->Send_uint32(_sync_seed_2);
#endif
    this->SendPacket(std::move(p));
    return NETWORK_RECV_STATUS_OKAY;
}
```

The sync frequency is configurable via `sync_freq`. By default, sync packets are sent periodically (not every frame). A compile-time define `ENABLE_NETWORK_SYNC_EVERY_FRAME` enables per-frame sync for intensive debugging.

### Client-Side Desync Check

When the client reaches the specified sync frame, it compares its local RNG state against the server's:

```
src/network/network_client.cpp:223-249
```

```cpp
if (_sync_frame != 0) {
    if (_sync_frame == _frame_counter) {
#ifdef NETWORK_SEND_DOUBLE_SEED
        if (_sync_seed_1 != _random.state[0] || _sync_seed_2 != _random.state[1]) {
#else
        if (_sync_seed_1 != _random.state[0]) {
#endif
            ShowNetworkError(STR_NETWORK_ERROR_DESYNC);
            Debug(desync, 1, "sync_err: {:08x}; {:02x}",
                  TimerGameEconomy::date, TimerGameEconomy::date_fract);
            Debug(net, 0, "Sync error detected");
            my_client->ClientError(NETWORK_RECV_STATUS_DESYNC);
            return false;
        }
        // First time sync → tell server we're ready
        if (_network_first_time) {
            _network_first_time = false;
            SendAck();
        }
        _sync_frame = 0;
    } else if (_sync_frame < _frame_counter) {
        Debug(net, 1, "Missed frame for sync-test: {} / {}",
              _sync_frame, _frame_counter);
        _sync_frame = 0;
    }
}
```

### Why RNG-Based Sync Works

The insight is that if the random number generator state matches, then all game state that depends on randomness (combat outcomes, timing, AI decisions, etc.) must have followed the same path. Any divergence in deterministic simulation will eventually cause RNG state to diverge as well. This is far cheaper than hashing all game state every tick.

**Limitation:** RNG-based detection has a lag — if the desync doesn't immediately affect random calls, detection could be delayed by many frames. OpenTTD compensates with its elaborate `CheckCaches` validation (see below).

**Iron Curtain comparison:** IC plans full `state_hash()` every tick (§ "Simulation Architecture" in AGENTS.md), which is stronger but more expensive. RNG-based sync is a viable optimization: run cheap RNG comparison every tick, and do expensive full-state hashing only periodically or when RNG drift is detected. This layered approach could satisfy IC's performance targets while still catching desyncs early.

---

## Desync Debugging Infrastructure

OpenTTD has the most sophisticated desync debugging infrastructure of any game we've analyzed — a multi-level system refined over 20+ years.

### Debug Levels

From `docs/debugging_desyncs.md`:

```
Level 0: nothing
Level 1: dump commands to 'commands-out.log'
Level 2: level 1 + validate vehicle/company/station caches every tick
Level 3: level 2 + monthly savegames in autosave
Level 4+: same as level 3
```

### Command Logging

All commands are written to `commands-out.log` via the debug system. The routing happens in `DebugPrint()`:

```
src/debug.cpp:112-127
```

```cpp
void DebugPrint(std::string_view category, int level, std::string &&message)
{
    if (category == "desync" && level != 0) {
        static auto f = FioFOpenFile("commands-out.log", "wb", AUTOSAVE_DIR);
        if (!f.has_value()) return;
        fmt::print(*f, "{}{}\n", GetLogPrefix(true), message);
        fflush(*f);
    } else { /* normal debug output */ }
}
```

Each command is logged with a structured format containing the game date, company, command ID, error message ID, and the full serialized command data as hex:

```
src/command.cpp:252-263
```

```cpp
void CommandHelperBase::LogCommandExecution(Commands cmd, StringID err_message,
    const CommandDataBuffer &args, bool failed)
{
    Debug(desync, 1, "{}: {:08x}; {:02x}; {:02x}; {:08x}; {:08x}; {} ({})",
          failed ? "cmdf" : "cmd",
          (uint32_t)TimerGameEconomy::date.base(),
          TimerGameEconomy::date_fract,
          _current_company,
          cmd,
          err_message,
          FormatArrayAsHex(args),
          GetCommandName(cmd));
}
```

Example log lines:
```
cmd: 0001A3F0; 00; 01; 00000023; 00000000; 0A1B... (CmdBuildRoad)
sync: 0001A3F0; 00; DEADBEEF; CAFEBABE
save: 0001A3F0; 00; dmp_cmds_XXXXXXXX_YYYYYYYY.sav
```

The server also logs RNG state at the start of each game day:

```
src/network/network.cpp:1095-1112
```

```cpp
// Server logs sync state once per game day
if (TimerGameEconomy::date_fract == 0) {
    static TimerGameEconomy::Date last_log;
    if (last_log != TimerGameEconomy::date) {
        Debug(desync, 1, "sync: {:08x}; {:02x}; {:08x}; {:08x}",
              TimerGameEconomy::date, TimerGameEconomy::date_fract,
              _random.state[0], _random.state[1]);
        last_log = TimerGameEconomy::date;
    }
}
```

### Desync Savegame Naming Convention

```
docs/debugging_desyncs.md:28-36
```

```
Format: dmp_cmds_XXXXXXXX_YYYYYYYY.sav
  XXXXXXXX = hex representation of generation seed
  YYYYYYYY = hex representation of the in-game date
```

This sorts savegames by game and then by date, making it easy to find the right savegames when bisecting desyncs.

**Iron Curtain relevance:** IC should adopt this structured debug logging from day one. The log format (timestamped commands + periodic RNG state + periodic savegames) enables complete game reconstruction. IC's deterministic sim makes this even more powerful — with the same `commands-out.log` and starting state, any desync can be reproduced exactly.

---

## Cache Validation System (CheckCaches)

OpenTTD maintains derived caches (computed values) alongside authoritative state for performance. These caches can become inconsistent, causing desyncs. The `CheckCaches()` function in `cachecheck.cpp` validates every cache against the authoritative source data.

### What Gets Validated

```
src/cachecheck.cpp — CheckCaches()
```

The function validates:
- **Town caches** — population counts, supply statistics
- **Company infrastructure counts** — rail/road/water/airport tile counts
- **Vehicle caches** — NewGRF property overrides, vehicle position/speed caches
- **Train-specific caches** — consist length, weight, power, tractive effort
- **Road vehicle caches** — similar to train caches
- **Station docking tiles** — which tiles are valid dock positions
- **Station industries_near** — nearby industry associations
- **Town stations_near** — nearby station associations

The validation only runs at `_debug_desync_level >= 2`, so it has zero production overhead. When a mismatch is found, it logs the specific cache that diverged, narrowing the desync cause immediately.

### Typical Desync Causes

From `docs/desync.md`, the most common causes are:

1. **Incomplete savegame** — state not saved/loaded completely, so a joining client starts with slightly different state
2. **Cache mismatches** — especially with NewGRF (mod) content that changes cached properties
3. **Undefined behavior** — sorting with equal keys giving different orderings on different platforms, platform-dependent integer conversions
4. **Test-run side effects** — a command's "can I do this?" test-run accidentally modifying game state
5. **Non-command state changes** — game state altered outside the command system (bypassing deterministic ordering)

**Iron Curtain relevance:** The concept of validating derived caches is critical for IC's ECS design. Any Bevy component that caches a derived value (e.g., a pathfinding cache, fog-of-war visibility cache) needs equivalent validation. IC should implement a similar multi-level debug system: Level 1 for command logging, Level 2 for cache validation, Level 3 for periodic snapshots. The list of OpenTTD's desync causes maps directly to IC risks — especially #3 (platform-dependent behavior with fixed-point math edge cases) and #5 (state changes outside the order pipeline).

---

## Command-Log Replay System

OpenTTD's replay system is not a separate feature — it's a byproduct of the desync debugging infrastructure. Any game can be replayed by feeding the command log back into a dedicated server.

### How Replay Works

From `docs/desync.md`:

1. **Enable `DEBUG_DUMP_COMMANDS`** in `src/network/network_func.h`
2. Place `commands-out.log` (renamed to `commands.log`) in the save directory
3. Load the starting savegame on a dedicated server with `-d desync=3`
4. The server reads commands from `commands.log` and injects them at the logged timestamps

```
src/network/network_func.h:14-18
```

```cpp
// Uncomment to enable command replaying.
// See docs/desync.md for details.
// #define DEBUG_DUMP_COMMANDS
// #define DEBUG_FAILED_DUMP_COMMANDS
```

### Replay Command Injection

The replay logic is embedded directly in `NetworkGameLoop()`. It reads the command log line by line, parsing timestamps and command data, and injects commands at the correct game date/fract:

```
src/network/network.cpp:1112-1127
```

```cpp
#ifdef DEBUG_DUMP_COMMANDS
static auto f = FioFOpenFile("commands.log", "rb", SAVE_DIR);
static TimerGameEconomy::Date next_date(0);
static uint32_t next_date_fract;
static CommandPacket *cp = nullptr;
static bool check_sync_state = false;
static uint32_t sync_state[2];

while (f.has_value() && !feof(*f)) {
    if (TimerGameEconomy::date == next_date &&
        TimerGameEconomy::date_fract == next_date_fract) {
        if (cp != nullptr) {
            NetworkSendCommand(cp->cmd, cp->err_msg, nullptr,
                             cp->company, cp->data);
            // ...
```

During replay, the system also compares sync state values from the log against the live simulation. If they diverge, it triggers `NOT_REACHED()` (assertion failure), pinpointing exactly when the desync first occurred.

### Bisecting Desyncs with Savegames

The periodic savegames (`dmp_cmds_*.sav`) at debug level 3 allow binary search for desync timing:

```
docs/desync.md:205-222
```

The replay compares checksums from the log with the replayed game state. If the replay succeeds from the start savegame but fails from a mid-game savegame, the desync is caused by incomplete save/load (the most common cause). By trying progressively later savegames, developers can narrow the desync to a specific time window.

Additionally, `DEBUG_FAILED_DUMP_COMMANDS` enables logging of commands that fail their test-run, which helps identify commands whose test-run modifies game state (desync cause #4).

**Iron Curtain relevance:** IC's replay system (Phase 2) should use this same approach: replays are just command logs + initial state. The bisection technique using periodic snapshots is particularly valuable — IC should save snapshots at configurable intervals during multiplayer games, enabling server-side desync diagnosis without requiring client cooperation.

---

## Command Validation & Security

OpenTTD validates commands at multiple layers, with the server as the ultimate authority.

### Server-Side Validation

```
src/network/network_server.cpp — Receive_CLIENT_COMMAND()
```

The server performs these checks before accepting a client command:

1. **Server-only commands** — Commands marked `CommandFlag::Server` are rejected from clients (causes kick)
2. **Spectator restriction** — Non-spectator commands from spectators are rejected (causes kick)
3. **Company ownership** — Commands targeting a company the client doesn't belong to are rejected: `"NETWORK_ERROR_COMPANY_MISMATCH"`
4. **Offline-only commands** — Commands marked `CommandFlag::Offline` (like cheats) are rejected from networked clients
5. **String sanitization** — All string parameters are sanitized via `SanitizeStringsHelper` to prevent injection
6. **Client ID replacement** — Commands with `CommandFlag::ClientID` have their client ID replaced by the server, preventing spoofing: `NetworkReplaceCommandClientId()`
7. **CompanyControl restrictions** — Only `CCA_NEW` (create new company) is allowed from spectators; other company control operations are server-only

### Command Type Classification

```
src/command_type.h:429-454
```

Commands are categorized by type, which determines pause behavior:

```cpp
enum class CommandType : uint8_t {
    Landscape,          // Altering the map
    VehicleConstruction, // Building vehicles
    MoneyManagement,    // Loans
    VehicleManagement,  // Starting/stopping vehicles
    RouteManagement,    // Orders
    OtherManagement,    // Renaming, signs
    CompanySetting,     // Company settings
    ServerSetting,      // Pause/remove companies
    Cheat,              // Cheats
};
```

Commands marked `CommandFlag::Offline` (like `CmdMoneyCheat`) are only executable in single-player. The `IsCommandAllowedWhilePaused()` function checks whether a command can run during pause based on the `CommandPauseLevel` setting.

### Test-Then-Execute Pattern

Every command runs twice: first as a test-run (no side effects), then as execution (applied to game state). This is designed to catch insufficient funds, invalid placement, etc. before committing. A critical invariant is that the test-run must not modify game state — violations cause desyncs (OpenTTD's desync cause #4).

**Iron Curtain relevance:** IC's order validation inside `ra-sim` (D012) follows the same principle. OpenTTD's command flag system (`Server`, `Spectator`, `Offline`, `ClientID` replacement) maps well to IC's relay server validation. The command type classification for pause behavior is worth adopting for IC's lobby/in-game settings. The test-then-execute pattern validates IC's own plan for deterministic validation — critically, IC must ensure `validate_order()` is a pure function with no side effects.

---

## Command Rate Limiting & Bandwidth Control

### Per-Client Command Rate

The server limits how many commands per frame each client can execute:

```
src/network/network_command.cpp:327-343
```

```cpp
static void DistributeQueue(CommandQueue &queue, const NetworkClientSocket *owner)
{
    int to_go = _settings_client.network.commands_per_frame;
    if (owner == nullptr) {
        // Server gets a potentially higher limit
        to_go = std::max<int>(to_go,
            _settings_client.network.commands_per_frame_server);
    }

    for (auto cp = queue.begin(); cp != queue.end(); /* ... */) {
        // Skip commands not allowed while paused
        if (_pause_mode.Any() && !IsCommandAllowedWhilePaused(cp->cmd)) {
            ++cp;
            continue;
        }
        // ... distribute up to to_go commands this frame
    }
}
```

### Queue Overflow Protection

If a client's command queue exceeds `max_commands_in_queue`, the server drops the connection with `NETWORK_ERROR_TOO_MANY_COMMANDS`. This prevents malicious clients from flooding the command pipeline.

### Bandwidth Throttling

Per-client receive limits control how much data a client can send per frame:

```
src/network/network_server.cpp:1724-1744
```

```cpp
void NetworkServer_Tick(bool send_frame)
{
    for (NetworkClientSocket *cs : NetworkClientSocket::Iterate()) {
        cs->receive_limit = std::min<size_t>(
            cs->receive_limit + _settings_client.network.bytes_per_frame,
            _settings_client.network.bytes_per_frame_burst);
        // ...
    }
}
```

This implements a **token bucket** rate limiter: `bytes_per_frame` adds tokens each tick, `bytes_per_frame_burst` caps the bucket size. This allows short bursts while preventing sustained flooding.

**Iron Curtain relevance:** IC's `ProtocolLimits.max_orders_per_tick` (AGENTS.md § "Security Model") maps directly to OpenTTD's `commands_per_frame`. The token bucket bandwidth control is a good addition to IC's relay server — it handles bursty legitimate traffic (e.g., rapid build orders) while still capping sustained abuse. IC should adopt both per-frame command limits AND bandwidth-based receive limits as separate layers.

---

## Client Join Flow — Map Transfer & Catchup

OpenTTD supports mid-game joins, which requires transferring the full game state to the joining client.

### Join State Machine

```
src/network/network_internal.h:38-48
```

```cpp
enum NetworkJoinStatus : uint8_t {
    NETWORK_JOIN_STATUS_CONNECTING,
    NETWORK_JOIN_STATUS_AUTHORIZING,
    NETWORK_JOIN_STATUS_WAITING,       // Waiting for other joiners
    NETWORK_JOIN_STATUS_DOWNLOADING,   // Receiving map
    NETWORK_JOIN_STATUS_PROCESSING,    // Loading received map
    NETWORK_JOIN_STATUS_REGISTERING,
    NETWORK_JOIN_STATUS_GETTING_COMPANY_INFO,
};
```

### Map Transfer via Savegame

The server creates a savegame from the current state and streams it to the joining client:

```
src/network/network_server.cpp:576-614
```

```cpp
NetworkRecvStatus ServerNetworkGameSocketHandler::SendMap()
{
    if (this->status == STATUS_AUTHORIZED) {
        WaitTillSaved();  // Ensure any pending save completes
        this->savegame = std::make_shared<PacketWriter>(this);

        auto p = std::make_unique<Packet>(this, PACKET_SERVER_MAP_BEGIN);
        p->Send_uint32(_frame_counter);  // Frame when save was taken
        this->SendPacket(std::move(p));

        NetworkSyncCommandQueue(this);  // Give client any pending commands
        this->status = STATUS_MAP;

        this->last_frame = _frame_counter;
        this->last_frame_server = _frame_counter;

        // Generate savegame into network packet stream
        if (SaveWithFilter(this->savegame, true) != SL_OK)
            UserError("network savedump failed");
    }

    if (this->status == STATUS_MAP) {
        bool last_packet = this->savegame->TransferToNetworkQueue();
        if (last_packet) {
            this->savegame->Destroy();
            this->savegame = nullptr;
            // Wait for client to confirm map received
        }
    }
}
```

Key detail: `NetworkSyncCommandQueue(this)` sends the joining client all pending commands that were queued during the save, ensuring the client can catch up from the exact save point.

### Client Catchup

After loading the map, the client enters `STATUS_PRE_ACTIVE` and processes frames at accelerated speed until it catches up:

```
src/network/network_server.cpp:1238-1260
```

```cpp
NetworkRecvStatus ServerNetworkGameSocketHandler::Receive_CLIENT_ACK(Packet &p)
{
    // ...
    if (this->status == STATUS_PRE_ACTIVE) {
        // Not caught up yet?
        if (frame + Ticks::DAY_TICKS < _frame_counter)
            return NETWORK_RECV_STATUS_OKAY;

        // Caught up! Activate client
        this->status = STATUS_ACTIVE;
        this->last_token_frame = _frame_counter;
        IConsoleCmdExec("exec scripts/on_server_connect.scr 0");
    }
    // ...
}
```

### Queue-Based Map Waiting

If another client is already downloading the map, new joiners wait:

```
src/network/network_server.cpp:1796-1810
```

```cpp
case NetworkClientSocket::STATUS_MAP_WAIT:
    // Send keepalive every 2 seconds
    if (std::chrono::steady_clock::now() > cs->last_packet + std::chrono::seconds(2)) {
        cs->SendWait();
        cs->last_packet = std::chrono::steady_clock::now();
    }
    break;
```

**Iron Curtain relevance:** IC's snapshot system (D010) enables the same mid-game join pattern — serialize state as a snapshot, transfer via relay or direct connection, client loads and catches up. The queue-based waiting is relevant for IC's relay server when multiple players join simultaneously. IC should also adopt the "send pending commands after snapshot" pattern to close the gap between snapshot creation and join completion.

---

## Lag Detection & Client Management

### Multi-Level Timeout System

The server tracks lag per client based on their status, with stage-specific timeouts:

```
src/network/network_server.cpp:1744-1853
```

| Client Status                                | Timeout Setting     | What It Means                     |
| -------------------------------------------- | ------------------- | --------------------------------- |
| `STATUS_ACTIVE`                              | `max_lag_time`      | Client fell too far behind in sim |
| `STATUS_MAP_WAIT`                            | —                   | Keepalive every 2 seconds         |
| `STATUS_MAP`                                 | `max_download_time` | Map download took too long        |
| `STATUS_DONE_MAP` / `STATUS_PRE_ACTIVE`      | `max_join_time`     | Loading/syncing took too long     |
| `STATUS_AUTH_GAME`                           | `max_password_time` | Password entry took too long      |
| `STATUS_AUTHORIZED` / `STATUS_NEWGRFS_CHECK` | `max_init_time`     | Initial handshake took too long   |

### Lag Calculation & Reporting

```
src/network/network.cpp:282-303
```

```cpp
uint NetworkCalculateLag(const NetworkClientSocket *cs)
{
    int lag = cs->last_frame_server - cs->last_frame;
    // If client missed their ACK after 1 DAY_TICKS, increase lag
    if (cs->last_frame_server + Ticks::DAY_TICKS +
        _settings_client.network.frame_freq < _frame_counter) {
        lag += _frame_counter - (cs->last_frame_server +
               Ticks::DAY_TICKS + _settings_client.network.frame_freq);
    }
    return lag;
}
```

The server distinguishes between "slow client" (packets arriving but behind) and "lost connection" (no packets at all), providing different warning messages for each case.

### Token-Based Liveness Check

The server also tracks `last_token_frame` separately from `last_frame` to distinguish true lag from token round-trip delay:

```
src/network/network_server.cpp:1261-1276
```

```cpp
// Token validation in Receive_CLIENT_ACK:
if (token == this->last_token) {
    this->last_token_frame = _frame_counter;
    this->last_token = 0;  // Request a new token
}
```

This prevents false positive lag detection when a single round-trip takes longer than expected but the client is otherwise keeping up.

**Iron Curtain relevance:** IC's relay server (D007) needs exactly this multi-level timeout system. The token-based liveness check is an elegant addition to IC's "relay owns the clock" model — it validates that clients are actively processing frames, not just maintaining a TCP connection. The distinction between "slow" and "disconnected" is important for IC's UX: "Player X is lagging" vs "Player X disconnected."

---

## Admin Port — External Monitoring Protocol

OpenTTD provides a **completely separate TCP protocol** for external administration and monitoring, running on a different port from the game connection. This is the most unique feature in OpenTTD's networking stack and has no equivalent in any other game we've analyzed.

### Architecture

```
src/network/network_admin.h — ServerNetworkAdminSocketHandler
src/network/core/tcp_admin.h — NetworkAdminSocketHandler (packet definitions)
```

The admin port is a separate connection pool with its own authentication, packet types, and send/receive cycle. External tools connect via TCP, authenticate, and then subscribe to event streams or poll for data.

### Event Types and Frequencies

Admin clients can subscribe to various update types at configurable frequencies:

```
src/network/core/tcp_admin.h:139-150
```

Available update types:
- `ADMIN_UPDATE_DATE` — Current game date
- `ADMIN_UPDATE_CLIENT_INFO` — Client join/leave/update events
- `ADMIN_UPDATE_COMPANY_INFO` — Company creation/update/removal
- `ADMIN_UPDATE_COMPANY_ECONOMY` — Money, income, cargo, company value
- `ADMIN_UPDATE_COMPANY_STATS` — Vehicle/station counts per company
- `ADMIN_UPDATE_CHAT` — Chat messages
- `ADMIN_UPDATE_CONSOLE` — Server console output
- `ADMIN_UPDATE_CMD_LOGGING` — Every command executed by any client
- `ADMIN_UPDATE_GAMESCRIPT` — GameScript JSON events

Each type supports different frequency options:
- `AdminUpdateFrequency::Poll` — On-demand via `ADMIN_POLL` packet
- `AdminUpdateFrequency::Daily` / `Weekly` / `Monthly` / `Quarterly` / `Annually` — Periodic push
- `AdminUpdateFrequency::Automatic` — Pushed whenever the event occurs

### Command Logging via Admin Port

The admin port can stream every command executed in the game, providing a real-time external audit log:

```
src/network/network_admin.cpp:644-664
```

```cpp
NetworkRecvStatus ServerNetworkAdminSocketHandler::SendCmdLogging(
    ClientID client_id, const CommandPacket &cp)
{
    auto p = std::make_unique<Packet>(this, ADMIN_PACKET_SERVER_CMD_LOGGING);
    p->Send_uint32(client_id);
    p->Send_uint8 (cp.company);
    p->Send_uint16(to_underlying(cp.cmd));
    p->Send_buffer(cp.data);
    p->Send_uint32(cp.frame);
    this->SendPacket(std::move(p));
    return NETWORK_RECV_STATUS_OKAY;
}
```

### Additional Capabilities

- **RCON** — Execute console commands remotely via `ADMIN_RCON` / `SERVER_RCON` packets
- **External chat** — Inject chat messages from external sources (e.g., Discord bot) via `ADMIN_EXTERNAL_CHAT`
- **GameScript communication** — Send/receive JSON to the in-game scripting engine via `ADMIN_GAMESCRIPT`
- **Ping/pong** — Latency measurement with arbitrary data echo
- **Secure authentication** — X25519 key exchange and authorized key lists, not just passwords

### Community Ecosystem

The admin port has spawned a rich ecosystem of third-party tools: Discord bots, web dashboards, statistics trackers, and automated tournament systems — all without modifying the game itself.

**Iron Curtain relevance:** This is a strong validation of IC's OTEL observability approach (D031). IC should implement an equivalent admin protocol for its relay server, exposed as a separate port or WebSocket endpoint. The key insight is that monitoring should be **a separate protocol on a separate connection**, not embedded in the game protocol. This separation means admin tools never affect game latency or security. IC's relay server could expose: match state, player stats, command logs, and relay health metrics via this channel, enabling the same rich ecosystem of community tools.

---

## Save/Load Architecture — Versioned Chunk System

OpenTTD's save/load system is remarkably sophisticated, providing backward compatibility across hundreds of versions with field-level version gating.

### Chunk-Based Format

```
src/saveload/saveload.h
```

The savegame format is organized into **chunks**, each identified by a 4-character tag:

```cpp
// Example chunk handlers (each registered for a specific data type):
// 'GRPS' — Vehicle groups
// 'GSDT' — GameScript data
// 'STPA' — Station parking
// etc.
```

Each chunk has a `ChunkHandler` that implements `Save()`, `Load()`, and optionally `FixPointers()`:

```cpp
class ChunkHandler {
    virtual void Save() const;
    virtual void Load() const;
    virtual void FixPointers() const;  // Post-load pointer resolution
};
```

### Version-Gated Fields

The `SaveLoad` struct describes each field with optional version bounds:

```cpp
// Field present from version X to version Y:
SLE_CONDVAR(LoggedAction, tick,
    SLE_FILE_U16 | SLE_VAR_U64,    // Stored as u16, loaded as u64
    SL_MIN_VERSION, SLV_U64_TICK_COUNTER  // Version range
);
```

The `SLE_CONDVAR` macro generates a `SaveLoad` descriptor that includes:
- Field name and offset within the struct
- Storage type (on disk) vs. memory type (in RAM)
- Minimum and maximum save version

During save, only fields applicable to the current version are written. During load, missing fields (from older versions) are skipped, and obsolete fields use `SL_NULL` to read and discard bytes.

### Pointer Fixup Phase

After all chunks are loaded, `SlFixPointers()` runs to convert serialized indices back to runtime pointers. References between objects (e.g., a vehicle's order list pointing to station objects) are saved as pool indices and resolved post-load.

### Compatible Table Headers

Modern OpenTTD uses `SlCompatTableHeader` to support field reordering and graceful handling of unknown fields — newer savegames can be partially loaded by older code, and vice versa.

### Compression Options

```
src/saveload/saveload.cpp
```

Three compression formats are supported:
- **LZO** — Fast compression/decompression, larger files
- **zlib** — Balanced compression ratio and speed
- **LZMA** — Best compression ratio, slowest

The format is autodetected on load. Saving defaults to zlib or LZMA depending on settings. A separate **threaded saving** path runs compression on a background thread.

### Map Transfer as Savegame

The same save/load system is used for network map transfer — when a client joins, the server generates a savegame and streams it over the network. This means the map transfer format inherits all the version compatibility of the save format.

**Iron Curtain relevance:** IC plans `snapshot()`/`restore()` for save games, replays, rollback and desync debugging (D010). OpenTTD's approach offers several lessons:

1. **Version-gated fields** — IC should plan for this from the start. Every serialized field should include a version tag so future IC versions can load older saves.
2. **Chunk-based format** — Maps naturally to ECS: each component type is a "chunk." This allows IC to add new component types without breaking old save files.
3. **Pointer fixup** — IC's ECS entities are already index-based (Bevy `Entity` is essentially a generational index), so this is simpler for IC than for OpenTTD's raw pointer model.
4. **Network reuse** — Using the same snapshot format for both saves and network joins eliminates a whole class of bugs. IC should ensure `Serialize`/`Deserialize` on `ra-sim` types serves both purposes.

---

## Game Coordinator & Server Discovery

### Coordinator Client

```
src/network/network_coordinator.cpp:734-754
```

OpenTTD uses a **Game Coordinator** service for server registration and NAT traversal. Servers register with the coordinator, which handles:

- Server listing for the in-game browser
- NAT hole-punching via STUN-like rendezvous
- Connection type detection (direct, STUN, relay fallback)
- Invite codes for direct connections

The coordinator runs as a separate service from the game server, similar to IC's tracking server concept.

### Server Types

```cpp
enum ServerGameType {
    SERVER_GAME_TYPE_LOCAL,    // Not listed (LAN only)
    SERVER_GAME_TYPE_PUBLIC,   // Listed on coordinator
    // ...
};
```

The coordinator is optional — games can run without it for LAN play.

**Iron Curtain relevance:** This validates IC's tracking server design. OpenTTD's coordinator handles the same responsibilities: discovery, NAT traversal, and connection brokering. The key difference is that IC's relay server combines the coordinator role with actual game traffic relay, while OpenTTD keeps them separate (coordinator for discovery, direct connection for gameplay).

---

## Signature & Integrity Validation

### Blake2b File Hashing

```
src/signature.cpp
```

OpenTTD uses **Blake2b** hashing for file integrity validation, particularly for NewGRF (mod) files. The signature system:

- Computes Blake2b hashes of content files
- Validates against JSON-formatted signature files
- Uses public key verification for trusted content
- Applies version-prefixed checksums to distinguish format versions

**Iron Curtain relevance:** IC's resource pack system (D030) needs similar integrity validation. Blake2b is a good choice — it's faster than SHA-256 and available in Rust via the `blake2` crate. IC should sign resource packs with Ed25519 (consistent with its replay signing plan) and verify with Blake2b content hashes.

---

## Comparative Analysis

### vs. Previous Analyses

| Feature                       | OpenTTD                                                                              | Spring Engine                      | 0 A.D.               | Warzone 2100 | OpenBW            | DDNet                       |
| ----------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------- | -------------------- | ------------ | ----------------- | --------------------------- |
| **Model**                     | Client-server lockstep                                                               | Client-server lockstep             | P2P lockstep         | P2P lockstep | P2P lockstep      | Client-server authoritative |
| **Desync detection**          | RNG seed comparison                                                                  | Full state CRC                     | Turn hash comparison | Game CRC     | Insync hash       | N/A (server authoritative)  |
| **Desync debugging**          | Multi-level (5 levels) with command log + cache validation + periodic saves + replay | Sync debugger with state checksums | Minimal              | Hash logging | Insync comparison | N/A                         |
| **Mid-game join**             | Yes (savegame transfer)                                                              | Yes (full state sync)              | No (game restart)    | Limited      | No                | Yes (snapshot)              |
| **Admin/monitoring**          | Full admin protocol                                                                  | None                               | None                 | None         | None              | External RCON               |
| **Save compatibility**        | Hundreds of versions                                                                 | Limited                            | Manual migration     | Limited      | Replay only       | N/A                         |
| **Command rate limiting**     | Per-frame + bandwidth bucket                                                         | None found                         | None found           | None found   | None found        | Rate limiting on actions    |
| **External chat integration** | Yes (admin port)                                                                     | IRC bridge                         | Lobby only           | None         | None              | None                        |

### Novel Techniques (Not Found in Previous Analyses)

1. **Multi-level desync debug system** — No other game offers configurable debug levels from "log commands only" to "validate all caches + monthly saves." Most games have either nothing or a single-level debug mode.

2. **Cache validation (CheckCaches)** — Systematic validation of derived/cached data against source-of-truth data. Other games hash the full state but don't distinguish between authoritative state and caches.

3. **Admin port as a separate protocol** — No other analyzed game provides a complete external monitoring API on a separate socket. This enables an ecosystem of community tools without game modification.

4. **Version-gated save fields** — Per-field save version ranges enabling backwards-compatible loading across hundreds of versions. Other games either break save compatibility or version the entire format.

5. **Token-based liveness check** — Random token echo for validating client responsiveness, separate from frame acknowledgment. Other games rely solely on heartbeat timeouts.

6. **Command-log-based replay with sync verification** — The replay system compares logged sync states against the replayed simulation, automatically detecting when divergence occurs. Other replay systems just play back without verification.

7. **Separate server command rate limit** — The server gets a potentially higher command rate than clients (`commands_per_frame_server`), acknowledging that the server may legitimately need to issue more commands (e.g., AI players running on the server).

---

## Techniques Worth Adopting for Iron Curtain

### 1. Multi-Level Debug Infrastructure (Priority: High)

Implement OpenTTD-style debug levels for `ra-sim`:
- **Level 0:** No debug overhead (production)
- **Level 1:** Log all orders to a structured file (equivalent to `commands-out.log`)
- **Level 2:** Run cache/derived-state validation every tick
- **Level 3:** Save periodic snapshots (configurable interval)

This is cheap to implement (each level adds a single `if` check in the hot path) and invaluable for desync diagnosis. Start this in Phase 2 alongside the replay system.

### 2. RNG-Based Sync as Primary, Full Hash as Fallback (Priority: High)

Use OpenTTD's approach of comparing RNG state every sync frame (cheap) and only computing full `state_hash()` periodically or when RNG drift is detected. For IC's fixed-point deterministic sim, this gives ~99% desync detection at ~1% of the cost of full-state hashing every tick.

### 3. Admin/Monitoring Protocol for Relay Server (Priority: Medium)

Implement a separate WebSocket-based monitoring protocol on IC's relay server, inspired by OpenTTD's admin port. Expose:
- Match state and player list
- Command stream (for external logging/analysis)
- RCON for server management
- Event subscriptions with configurable frequency

This pairs naturally with IC's OTEL approach (D031) — the admin protocol is the real-time event stream, OTEL is the aggregated metrics/traces.

### 4. Token Bucket Bandwidth Control (Priority: Medium)

Add per-client token bucket rate limiting to IC's relay server alongside the existing `max_orders_per_tick` cap. This handles bursty legitimate traffic (rapid build orders, unit selection spam) while still blocking sustained flooding. Parameters: `bytes_per_tick` (replenish rate) and `bytes_burst` (maximum bucket size).

### 5. Random Token Liveness Check (Priority: Medium)

Add a random token in FRAME packets that clients must echo back in their ACKs. This validates client liveness more robustly than simple heartbeat timeouts — a client can maintain a TCP connection without actually processing game frames, and the token catches this.

### 6. Structured Desync Savegame Naming (Priority: Low)

Adopt OpenTTD's `dmp_cmds_XXXXXXXX_YYYYYYYY.sav` naming convention (seed + date) for IC's periodic desync snapshots. Sorting by game seed groups snapshots from the same game together, and sorting by date within a game enables efficient bisection.

### 7. Version-Gated Snapshot Fields (Priority: Low, but plan early)

Design IC's `Serialize`/`Deserialize` implementations with version-gated fields from the start. Every serialized component should carry a version tag so that IC v2 can load IC v1 saves. This is much harder to retrofit than to include from the beginning. Consider a `#[since(version = N)]` attribute macro for `ra-sim` components.

### 8. Command Test-Run Purity Enforcement (Priority: High)

IC's order validation must be verified pure (no side effects). Following OpenTTD's hard-learned lesson, consider adding a `#[cfg(debug_assertions)]` snapshot-before/snapshot-after check around `validate_order()` in debug builds. If the state hash changes during validation, it's a bug.

---

*Analysis based on OpenTTD source code at [github.com/OpenTTD/OpenTTD](https://github.com/OpenTTD/OpenTTD) (GPLv2). OpenTTD is a registered trademark of the OpenTTD team. This document analyzes publicly available source code for research purposes.*
