# C&C Generals / Zero Hour — Netcode Analysis

**Source:** https://github.com/electronicarts/CnC_Generals_Zero_Hour (GPL v3)
**Analyzed:** February 2026
**Purpose:** Identify netcode patterns valuable for Iron Curtain's network architecture

## Overview

Generals (2003) / Zero Hour (2003) uses a UDP-based deterministic lockstep architecture with ~500KB of networking source code across `GameNetwork/` directory. The codebase is split between `Generals/` and `GeneralsMD/` (Mission Disk = Zero Hour). Key classes: `Network`, `ConnectionManager`, `Connection`, `Transport`, `FrameDataManager`, `FrameData`, `FrameMetrics`, `NAT`, `FirewallHelper`, `NetPacket`.

## Architecture Layers

```
Network (singleton, top-level orchestrator)
  └─ ConnectionManager (manages all connections, relay logic)
       └─ Connection (per-player, send/recv)
            └─ Transport (UDP socket wrapper)
                 └─ Raw UDP
```

The `Network` class implements `NetworkInterface` and acts as the bridge between `GameLogic` (simulation) and the transport layer. Commands flow:

```
GameLogic::CommandList → Network::GetCommandsFromCommandList()
  → Network::SendCommandsToConnectionManager()
    → ConnectionManager → Connection → Transport → UDP

UDP → Transport → Connection → ConnectionManager::processNetCommand()
  → Network::AllCommandsReady() → Network::RelayCommandsToCommandList()
    → GameLogic::processCommandList()
```

## Finding 1: Adaptive Run-Ahead (Latency + FPS)

### Mechanism

Generals dynamically adjusts input delay (`runAhead`) based on **both** network latency **and** client frame rate. Default run-ahead is 30 frames at 30 FPS (~1 second of input delay).

```cpp
// NetworkUtil.cpp
Int MAX_FRAMES_AHEAD = 128;
Int MIN_RUNAHEAD = 10;
Int FRAME_DATA_LENGTH = (MAX_FRAMES_AHEAD + 1) * 2;  // 258 slots per player

// Network.cpp — init
m_runAhead = min(max(30, MIN_RUNAHEAD), MAX_FRAMES_AHEAD / 2);
m_frameRate = 30;
```

The `NETCOMMANDTYPE_RUNAHEAD` command carries both `runAhead` value and `frameRate`:

```cpp
// NetCommandMsg.h
class NetRunAheadCommandMsg : public NetCommandMsg {
    UnsignedShort m_runAhead;
    UnsignedByte m_frameRate;
    UnsignedShort m_averageLatency;
    UnsignedByte m_averageFps;
};
```

Run-ahead changes are **synchronized network commands** — all clients execute the change on the same frame:

```cpp
// NetworkUtil.cpp
Bool IsCommandSynchronized(NetCommandType type) {
    if ((type == NETCOMMANDTYPE_GAMECOMMAND) ||
        (type == NETCOMMANDTYPE_FRAMEINFO) ||
        (type == NETCOMMANDTYPE_PLAYERLEAVE) ||
        (type == NETCOMMANDTYPE_DESTROYPLAYER) ||
        (type == NETCOMMANDTYPE_RUNAHEAD))  // ← run-ahead change is synchronized
    {
        return TRUE;
    }
    return FALSE;
}
```

### FrameMetrics — The Decision Data

`FrameMetrics` tracks a rolling latency history and "packet arrival cushion":

```cpp
// FrameMetrics.h
class FrameMetrics {
    Real *m_latencyList;              // Rolling latency history (round-trip to packet router)
    time_t *m_pendingLatencies;       // Latencies "in the air"
    Real m_averageLatency;            // Running average (subtracted old, added new — O(1))

    // Packet arrival cushion — how many frames early do commands arrive?
    UnsignedInt m_cushionIndex;
    Int m_minimumCushion;             // Minimum cushion in recent history
};
```

The "cushion" is measured at the packet router by comparing `executionFrame - currentFrame` when all commands for a frame arrive. If cushion gets too small, run-ahead needs to increase.

### IC Applicability

**High.** Even with our relay server design, adaptive run-ahead matters because:
- The relay needs to decide its tick deadline (how long to wait for orders)
- Client FPS awareness prevents slow machines from causing stalls
- The `RunAheadMetrics` command pattern maps cleanly to our `NetworkDiagnostics`

## Finding 2: Three-State Frame Readiness + Resend

### Mechanism

`FrameData::allCommandsReady()` returns a three-state enum, not a bool:

```cpp
// Inferred from usage patterns
enum FrameDataReturnType {
    FRAMEDATA_READY,      // All commands received, verified
    FRAMEDATA_WAITING,    // Still waiting for commands
    FRAMEDATA_CORRUPTED   // Commands received but CRC mismatch — need resend
};
```

When corrupted data is detected, the system requests retransmission:

```cpp
// ConnectionManager.cpp
if (msg->getNetCommandType() == NETCOMMANDTYPE_FRAMERESENDREQUEST) {
    processFrameResendRequest((NetFrameResendRequestCommandMsg *)msg);
    return TRUE;  // Don't relay — handle locally
}
```

Historical frames are preserved for recovery:

```cpp
// ConnectionManager.cpp comment:
// "BGC - To account for the case where the host disconnects without sending the
//  same commands to all players, we now have to keep around the last 'run ahead'
//  frames so we can potentially send those commands to the other players in the
//  game so they can catch up."
```

`FrameDataManager` uses a circular buffer of 258 slots (`FRAME_DATA_LENGTH`) with modular indexing:

```cpp
void FrameDataManager::resetFrame(UnsignedInt frame, Bool isAdvancing) {
    UnsignedInt frameindex = frame % FRAME_DATA_LENGTH;
    m_frameData[frameindex].reset();
    if (isAdvancing) {
        m_frameData[frameindex].setFrame(frame + MAX_FRAMES_AHEAD);
    }
}
```

### IC Applicability

**Medium-high.** For UDP-based networking (which we use), packet corruption and loss are facts of life. Adding corruption detection with automatic resend is much better than just timing out and inserting Idle. Our `FrameDataManager` equivalent should support this three-state model.

## Finding 3: Delta-Compressed Wire Format

### Mechanism

`NetPacket` uses a tag-length-value (TLV) format where fields are only written when they differ from the previous command:

```cpp
Bool NetPacket::addFrameCommand(NetCommandRef *msg) {
    NetFrameCommandMsg *cmdMsg = (NetFrameCommandMsg *)(msg->getCommand());

    // Only write type if changed
    if (m_lastCommandType != cmdMsg->getNetCommandType()) {
        m_packet[m_packetLen] = 'T';  // Tag: Type
        ++m_packetLen;
        m_packet[m_packetLen] = cmdMsg->getNetCommandType();
        m_packetLen += sizeof(UnsignedByte);
        m_lastCommandType = cmdMsg->getNetCommandType();
    }

    // Only write frame if changed
    if (m_lastFrame != cmdMsg->getExecutionFrame()) {
        m_packet[m_packetLen] = 'F';  // Tag: Frame
        ++m_packetLen;
        UnsignedInt newframe = cmdMsg->getExecutionFrame();
        memcpy(m_packet + m_packetLen, &newframe, sizeof(UnsignedInt));
        m_packetLen += sizeof(UnsignedInt);
        m_lastFrame = newframe;
    }

    // Only write relay if changed
    if (m_lastRelay != msg->getRelay()) {
        m_packet[m_packetLen] = 'R';  // Tag: Relay
        ...
    }

    // Command ID only if non-sequential
    if (((m_lastCommandID + 1) != cmdMsg->getID()) || needNewCommandID) {
        m_packet[m_packetLen] = 'C';  // Tag: CommandID
        ...
    }

    // Data is always written (different payload per command type)
    m_packet[m_packetLen] = 'D';  // Tag: Data
    ...
}
```

### Frame Repeat Compression

Empty ticks (no commands, just a frame heartbeat) compress to a single `Z` byte:

```cpp
Bool NetPacket::isFrameRepeat(NetCommandRef *msg) {
    // Conditions for compression:
    // 1. Previous command was also a FRAMEINFO
    // 2. This frame's command count is 0 (empty)
    // 3. Frame number is exactly previous + 1
    // 4. Same relay
    // 5. Command ID is exactly previous + 1
    if (m_lastCommand->getCommand()->getNetCommandType() != NETCOMMANDTYPE_FRAMEINFO) return FALSE;
    if (framemsg->getCommandCount() != 0) return FALSE;
    if (framemsg->getExecutionFrame() != (lastmsg->getExecutionFrame() + 1)) return FALSE;
    if (msg->getRelay() != m_lastCommand->getRelay()) return FALSE;
    if (framemsg->getID() != (lastmsg->getID() + 1)) return FALSE;
    return TRUE;  // → write 'Z' instead of full command
}
```

### Packet Size Constraint

```cpp
#define MAX_PACKET_SIZE 476  // Fits in single IP fragment (no fragmentation)
```

Staying under the MTU minus IP/UDP headers ensures no IP-level fragmentation, which would multiply packet loss probability.

### IC Applicability

**Medium.** Our `OrderCodec` trait should implement a similar delta-encoding scheme. Most RTS ticks have 0-2 orders from any given player — the frame-repeat compression alone would reduce traffic dramatically. The MTU-aware packet sizing is a smart constraint to adopt.

## Finding 4: Debug Network Simulation

### Mechanism

Debug/internal builds include latency injection and packet loss simulation. The `Network` class tracks:

```cpp
// Network.cpp (internal/debug builds)
Bool m_networkOn;  // Can be toggled off for testing
```

`Transport` layer supports configurable artificial delays and packet drop rates for testing edge cases without needing actual bad networks.

### IC Applicability

**Medium.** Essential development tool. Should be built into `NetworkModel` implementations from the start:

```rust
// Proposed IC equivalent
pub struct NetworkSimulationConfig {
    pub artificial_latency_ms: u32,      // Added to each packet
    pub latency_jitter_ms: u32,          // Random ± jitter
    pub packet_loss_percent: f32,        // 0.0–100.0
    pub packet_corruption_percent: f32,  // Flip random bits
    pub bandwidth_limit_kbps: Option<u32>,
}
```

## Finding 5: Disconnect Blame Attribution

### Mechanism

Generals has a 7-type disconnect protocol:

```cpp
// NetCommandTypes (disconnect-related):
NETCOMMANDTYPE_KEEPALIVE          // Regular heartbeat
NETCOMMANDTYPE_DISCONNECTKEEPALIVE // Keepalive during disconnect phase
NETCOMMANDTYPE_DISCONNECTPLAYER    // Request to disconnect a player
NETCOMMANDTYPE_DISCONNECTCHAT      // Chat during disconnect screen
NETCOMMANDTYPE_DISCONNECTVOTE      // Vote on who to disconnect
NETCOMMANDTYPE_DISCONNECTSCREENOFF // Dismiss disconnect screen
NETCOMMANDTYPE_DISCONNECTFRAME     // Coordinated disconnect at specific frame
```

The `Network` class tracks ping state for blame attribution:

```cpp
// Network.h
UnsignedInt getPingFrame();
Int getPingsSent();
Int getPingsRecieved();  // [sic — typo in original source]
```

When a player appears disconnected:
1. Ping all players to verify who's actually unreachable
2. Show disconnect screen to remaining players
3. Players vote on who to disconnect (prevents false blame)
4. Agree on a specific frame number to remove the player (deterministic)
5. Keep 65 frames of historical data for potential recovery

### IC Applicability

**Low — relay handles this.** Our relay server already knows who's late (it has direct connections to all players). The voting/graceful-disconnect protocol is still valuable for competitive integrity — it gives remaining players agency rather than just dropping them.

## Finding 6: Packet Router with Failover (Validates Our Design)

### Mechanism

Generals implements a "packet router" — one player in a P2P game collects all commands and rebroadcasts (star topology). This is determined via `PACKETROUTERQUERY` / `PACKETROUTERACK` handshake.

```cpp
// ConnectionManager.cpp
void ConnectionManager::doRelay() {
    // Queries transport for commands that need relaying.
    // Assumption: a command will only be relayed once.
}

void ConnectionManager::sendRemoteCommand(NetCommandRef *msg) {
    // Relay to all other connections (packet router only)
    // Also tracks "packet arrival cushion" metrics
}
```

A failover mechanism existed (commented-out `determineRouterFallbackPlan()` method suggests it was planned but may not have been fully implemented).

### IC Applicability

**Validation.** This perfectly validates our relay server design (D007) — Generals invented a client-side version of exactly what we're building server-side. Our approach is better (neutral authority, no host advantage, built-in anti-cheat), but the concept is proven by a shipped AAA title.

## Additional Observations

### CRC Desync Detection

Generals uses per-frame CRC hashing via a polymorphic `Xfer`/`Snapshot` pattern. The `GameLogic::processCommandList()` compares CRC values from all players:

```cpp
void GameLogic::processCommandList(CommandList *list) {
    std::map<Int, UnsignedInt>::const_iterator crcIt = m_cachedCRCs.begin();
    Int validatorCRC = crcIt->second;
    while (++crcIt != m_cachedCRCs.end()) {
        Int validatedCRC = crcIt->second;
        if (validatorCRC != validatedCRC) {
            DEBUG_CRASH(("CRC mismatch!"));
            // ... desync handling
        }
    }
}
```

On desync, debug builds dump the full game state and random seed:
```cpp
void Network::setSawCRCMismatch() {
    TheRecorder->logCRCMismatch();
    DEBUG_LOG(("GameLogic frame = %d\n", TheGameLogic->getFrame()));
    DEBUG_LOG(("GetGameLogicRandomSeedCRC() = %d\n", GetGameLogicRandomSeedCRC()));
    // Dump full CRC breakdown per subsystem
}
```

This is similar to OpenRA's `[VerifySync]` approach but with richer debug dumps. Our design (D010: snapshottable state + `state_hash()`) supersedes both — we can diff full snapshots, not just detect mismatches.

### Packet Obfuscation

```cpp
// XOR every other byte pair with 0xFade — "just for fun" (source comment)
```

Not real security. Our TLS/DTLS approach is correct.

### Synchronized vs Non-Synchronized Commands

25+ network command types, cleanly categorized:
- **Synchronized:** Must execute on identical frame across all clients (`GAMECOMMAND`, `FRAMEINFO`, `PLAYERLEAVE`, `DESTROYPLAYER`, `RUNAHEAD`)
- **Non-synchronized:** Processed immediately, not frame-locked (`KEEPALIVE`, `FILEPROGRESS`, `FRAMERESENDREQUEST`, `PACKETROUTERQUERY`, etc.)

This clean separation is a good pattern. Our `PlayerOrder` enum covers the synchronized commands; we should explicitly define the non-synchronized control messages too.

### Memory Management

Generals uses memory pools for all network objects (`MEMORY_POOL_GLUE_WITH_USERLOOKUP_CREATE`) — zero heap allocation during gameplay. Validates our "zero per-tick allocation" target (Invariant #5, Performance Pyramid #5).

## Not Valuable for IC

- **NAT traversal / FirewallHelper** — Generals' 5-phase NAT classification system (simple, dumb mangling, smart mangling, destination-port-delta, Netgear bug) was impressive engineering for 2003 but our relay-first design sidesteps the problem. Modern STUN/TURN via `webrtc-rs` or similar handles the P2P fallback case better than hand-rolled port prediction.
- **GameSpy integration patterns** — Historical curiosity. Separate-thread with message-queue-to-game-thread is standard practice.
- **XOR packet obfuscation** — Not real security.

## Summary of Findings for IC Adoption

| Finding                              | Value       | Affects                                  | Phase   |
| ------------------------------------ | ----------- | ---------------------------------------- | ------- |
| Adaptive run-ahead (latency + FPS)   | High        | Relay tick deadline, QoS auto-profile    | Phase 5 |
| Three-state frame readiness + resend | Medium-High | All UDP `NetworkModel` impls             | Phase 5 |
| Delta-compressed wire format         | Medium      | `OrderCodec` / `NativeCodec`             | Phase 5 |
| Debug network simulation tools       | Medium      | All `NetworkModel` impls, dev tooling    | Phase 2 |
| Disconnect blame attribution         | Low         | Relay-handled, competitive integrity     | Phase 5 |
| Packet router validates relay design | Validation  | Confirms D007 was the right call         | —       |
