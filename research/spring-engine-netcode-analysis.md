# Spring RTS Engine — Networking & Netcode Architecture Analysis

> **Source Repository:** https://github.com/spring/spring (GPL v2)
> **Language:** C++ (~95%), Lua (~4%)
> **Engine Version Analyzed:** `main` branch (2025)
> **Related Game Analyzed:** Beyond All Reason (https://github.com/beyond-all-reason/Beyond-All-Reason)

## Executive Summary

Spring is a mature open-source RTS engine powering games like Beyond All Reason (BAR), Zero-K, and historically Balanced Annihilation. Its networking architecture is **server-authoritative deterministic lockstep over UDP** with a custom reliability layer. The engine supports thousands of units through staggered/amortized simulation updates. Desync detection uses a lightweight running checksum (`SyncChecker`) with an optional deep debugger (`SyncDebugger`) that can pinpoint the exact synced variable assignment where divergence occurred. The engine runs at a default tick rate of 30 Hz (`GAME_SPEED = 30`) with visual interpolation between sim frames.

---

## 1. Networking Model

### 1.1 Architecture: Server-Authoritative Lockstep

Spring uses a **client-server** model where even singleplayer runs a local server. From `rts/Net/Protocol/NetProtocol.cpp`:

> *"Even when playing singleplayer, this is the way of communicating with the server."*

From `rts/Net/GameServer.cpp`:

> *"responsible for receiving, checking and forwarding gamedata to the clients"*

**Key flow:**
1. Server runs in `CGameServer::Update()` (~3000-line file at `rts/Net/GameServer.cpp`)
2. Server calls `CreateNewFrame()` to advance the simulation clock
3. Server broadcasts `NETMSG_NEWFRAME` (every frame) and `NETMSG_KEYFRAME` (every 16th frame, `serverKeyframeInterval = 16`)
4. Clients only call `SimFrame()` when they receive `NETMSG_NEWFRAME` from the server
5. Client processes network in `CGame::ClientReadNet()` at `rts/Net/NetCommands.cpp`

**Frame creation formula** (in `CreateNewFrame()`):
```cpp
frameTimeLeft += ((GAME_SPEED * 0.001f) * internalSpeed * timeElapsed);
numNewFrames = ceil(frameTimeLeft);
// timeElapsed capped at 200ms to prevent large frame jumps
```

**Host throttling** — When the server has a local client (non-dedicated), it limits how far ahead the server can get:
```cpp
// simFramesBehind =  0 --> ratio = 0.00 --> maxNewFrames = 30
// simFramesBehind = 15 --> ratio = 0.5  --> maxNewFrames = 15
// simFramesBehind = 30 --> ratio = 1.00 --> maxNewFrames =  1
const float simFramesBehind = serverFrameNum - players[localClientNumber].lastFrameResponse;
const float simFrameMixRatio = std::min(simFramesBehind / GAME_SPEED, 1.0f);
const unsigned int maxNewFrames = mix(curSimRate * 1.0f, 0.0f, simFrameMixRatio);
```

### 1.2 Connection Types

Spring has three connection implementations, all inheriting from `CConnection` (`rts/System/Net/Connection.h`):

| Type                 | File                                             | Purpose                                                                                                                                   |
| -------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `UDPConnection`      | `rts/System/Net/UDPConnection.cpp` (~1150 lines) | Primary network transport with custom reliability                                                                                         |
| `LocalConnection`    | `rts/System/Net/LocalConnection.cpp`             | Shared-memory for same-process client/server. "Directly connects the respective input-buffers." Max 2 instances. No timeout, no reconnect |
| `LoopbackConnection` | `rts/System/Net/LoopbackConnection.cpp`          | Dummy queue bouncing packets back to sender (AI connections)                                                                              |

### 1.3 UDP Reliability Protocol

Spring implements its own reliability layer on top of raw UDP in `UDPConnection`. This is NOT TCP — it's a custom protocol optimized for game traffic.

**Packet header format** (10 bytes total):
```
4 bytes (int32)  packetNumber     — sequence number
4 bytes (int32)  lastContinuous   — piggyback ACK (highest contiguous packet received)
1 byte  (uint8)  nakType          — negative acknowledgment indicator
1 byte  (uint8)  checksum         — CRC for corruption detection
```

**Chunk structure** (5-byte header + payload):
```
4 bytes (int32)  chunkNumber      — per-chunk sequence number
1 byte  (uint8)  chunkSize        — payload size (max 254)
N bytes          data[]           — payload
```

**Key constants** (`rts/System/Net/UDPConnection.h`):
- `udpMaxPacketSize = 4096` — max UDP datagram size
- `maxChunkSize = 254` — max payload per chunk
- `chunksPerSec = 30` — rate limit for chunk sending

**NAK (Negative Acknowledgment) mechanism:**
- Negative `nakType` values = continuous NAK: resend N packets starting from `lastContinuous + 1`
- Positive `nakType` values = specific packet index to resend

**Flush / Send logic** (`UDPConnection::Flush()`):
- Fragments large messages to respect MTU (`MaximumTransmissionUnit`, default 1400 bytes)
- Bandwidth-limited: checks `outgoing.GetAverage(true) <= globalConfig.linkOutgoingBandwidth`
- Rate-limited to `chunksPerSec` (30 chunks/second)
- Small packets get additional delay: `requiredLength = ((200 >> netLossFactor) - elapsed) / 10`

**Resend strategy** (`SendIfNecessary()`):
- Complex multi-strategy approach alternating between forward, middle, and reverse iterators through the resend queue
- Limits resends to `20 * netLossFactor` per cycle
- Handles high-latency connections by varying which unacked chunks get resent first

**Bandwidth tracking** (`BandwidthUsage`):
- Exponential moving average over 100ms windows
- Formula: `average = (average * 9 + rate) / 10.0f`

**Statistics tracking:**
- Bytes sent/received, packets sent/received
- Overhead ratio (header bytes vs payload)
- Dropped and resent chunk counts

### 1.4 Connection Management

`UDPListener` (`rts/System/Net/UDPListener.cpp`) manages multiple UDP connections. New connections are accepted when:
```cpp
lastContinuous == -1 && nakType == 0  // and first chunk is #0
```

**CRC validation** in `ProcessRawPacket()`: corrupted packets are silently dropped.

---

## 2. Desync Detection & Debugging

Spring has two complementary systems controlled by compile flags:

| System       | Compile Flag | Memory Cost | Purpose                                  |
| ------------ | ------------ | ----------- | ---------------------------------------- |
| SyncChecker  | `SYNCCHECK`  | Negligible  | Lightweight running checksum per frame   |
| SyncDebugger | `SYNCDEBUG`  | 32–256 MB   | Deep root-cause analysis with backtraces |

Both configured in `CMakeLists.txt`. `SYNCDEBUG` requires `SYNCCHECK=TRUE` and recommends a DEBUG build.

### 2.1 SyncChecker — Lightweight Checksum

**File:** `rts/System/Sync/SyncChecker.h`

A running checksum (`g_checksum`) initialized to `0xfade1eaf` at the start of each frame via `NewFrame()`. However, the checksum actually resets every 4096 frames:
```cpp
if ((gs->frameNum & 4095) == 0) CSyncChecker::NewFrame();
```

**Checksum algorithm** (size-optimized switch on data width):
```cpp
// 1 byte:
g_checksum += *(unsigned char*)p;
g_checksum ^= g_checksum << 10;
g_checksum += g_checksum >> 1;

// 2 bytes:
g_checksum += *(unsigned short*)p;
g_checksum ^= g_checksum << 11;
g_checksum += g_checksum >> 17;

// 4 bytes:
g_checksum += *(unsigned int*)p;
g_checksum ^= g_checksum << 16;
g_checksum += g_checksum >> 11;
```

With `TRACE_SYNC_HEAVY` enabled, uses HsiehHash instead for stronger collision resistance.

**Synced code boundaries** (`rts/System/Sync/SyncedPrimitiveBase.h`):
- `ENTER_SYNCED_CODE()` / `LEAVE_SYNCED_CODE()` — reference-counted `inSyncedCode` counter
- `ASSERT_SYNCED(x)` — calls `Sync::Assert()` which feeds data into both SyncChecker and SyncDebugger
- `Sync::Assert()` also asserts `CSyncChecker::InSyncedCode()` to catch unsanctioned synced access

**Called at critical points:**
```cpp
// In CGame::SimFrame() at rts/Game/Game.cpp:
ENTER_SYNCED_CODE();
ASSERT_SYNCED(gsRNG.GetGenState());
good_fpu_control_registers("CGame::SimFrame");
// ... entire simulation ...
ASSERT_SYNCED(gsRNG.GetGenState());
LEAVE_SYNCED_CODE();
```

### 2.2 Server-Side Sync Verification

**File:** `rts/Net/GameServer.cpp`, `CheckSync()` (lines 583–737)

Two modes depending on whether the server has a local client:

**Dictatorship mode** (with local client / hosted game):
- All client checksums must match the local client's checksum
- Local client is always "right"

**Democracy mode** (dedicated server):
- Majority checksum wins via frequency counting
- Groups desynced players by checksum: `desyncGroups[checksum].push_back(playerNum)`

**Timing constants:**
- `SYNCCHECK_TIMEOUT = 300` frames — how long to wait for sync responses
- `SYNCCHECK_MSG_TIMEOUT = 400` frames — how long before warning about missing responses

**On desync detection:**
1. Sets `spring::exitCode = spring::EXIT_CODE_DESYNC`
2. Broadcasts pause to all clients
3. Triggers SyncDebugger protocol (if compiled with `SYNCDEBUG`)

### 2.3 SyncDebugger — Deep Root-Cause Analysis

**File:** `rts/System/Sync/SyncDebugger.h` / `SyncDebugger.cpp`

A heavyweight debugging system that records **every synced variable assignment** with optional backtraces.

**Storage constants:**
- `MAX_STACK = 5` — backtrace depth
- `BLOCK_SIZE = 2048` — items per block
- `HISTORY_SIZE = 2048` — number of blocks
- Total capacity: **4,194,304** synced variable assignments tracked in a circular buffer

**Memory usage:**
- Server with backtraces: ~160 MB (32-bit) or ~256 MB (64-bit)
- Client without backtraces: ~32 MB

**Data structures:**
```cpp
struct HistItem {
    unsigned data;  // XOR checksum of assigned value
};

struct HistItemWithBacktrace {
    const char* op;         // operator (e.g., "+=")
    unsigned frameNum;       // simulation frame
    unsigned bt_size;        // backtrace depth
    void* bt[MAX_STACK];     // backtrace pointers
    unsigned data;           // XOR checksum
};
```

**Desync diagnosis protocol** (5-step binary search):

1. **Server detects desync** → sends `NETMSG_SD_CHKREQUEST` with frame number to all clients
2. **Clients respond** (`ClientSendChecksumResponse()`): Compute HsiehHash over each of the 2048 blocks (each containing 2048 items), send all 2048 block checksums + total `flop` count
3. **Server compares blocks** (`ServerQueueBlockRequests()`): Identifies which blocks differ between players
4. **Server drills down** (`ServerHandlePendingBlockRequests()`): Sends `NETMSG_SD_BLKREQUEST` for divergent blocks, one at a time
5. **Client sends detailed data** (`ClientSendBlockResponse()`): Sends all 2048 individual item checksums for the requested block
6. **Server finds exact divergence** (`ServerReceivedBlockResponses()` → `ServerDumpStack()`): Identifies the exact first divergent assignment and logs the backtrace

**Testing:** `/fakedesync` console command in `SyncedGameCommands.cpp` intentionally modifies unit positions to trigger the full desync debugging pipeline.

### 2.4 Synced Primitive Types

**File:** `rts/System/Sync/SyncedPrimitiveBase.h`

Wrapper types that automatically call sync tracking on every assignment:
- `SyncedSshort`, `SyncedSchar`, `SyncedFloat`, `SyncedSint`, `SyncedUint`

Example: `SyncedFloat3` (`rts/System/Sync/SyncedFloat3.h`) — a 3D vector where each component assignment feeds into the sync system.

Test coverage at `test/engine/System/Sync/TestSyncedPrimitive.cpp` validates implicit conversions work correctly.

### 2.5 Determinism Infrastructure

- **`streflop` library:** Cross-platform deterministic floating-point. `streflop_init<streflop::Simple>()` called at startup, after thread creation, and before/after threaded pathfinding updates
- **FPU validation:** `good_fpu_init()` at startup, `good_fpu_control_registers()` called per-frame in `SimFrame()` and `Update()`
- **Deterministic RNG:** `CGlobalSynced::gsRNG` seeded with `gsRNG.SetSeed(18655, true)` — state asserted at frame boundaries
- **Heading lookup table:** Pre-computed heading-to-vector table with `HEADING_CHECKSUM` validated at initialization
- **Path checksum:** `CPathEstimator::CalcChecksum()` uses SHA-based hash, verified between clients via `NETMSG_PATH_CHECKSUM`

**Note:** Spring uses `float` (not fixed-point) for simulation, relying on `streflop` for cross-platform determinism. This is a different approach from Iron Curtain's fixed-point design.

---

## 3. Input Delay, Frame Consumption & Interpolation

### 3.1 Frame Consumption Rate

Clients don't process `NETMSG_NEWFRAME` messages as fast as possible. Instead, they smooth consumption to avoid stuttering. The core logic is in `CGame::UpdateNumQueuedSimFrames()` at `rts/Net/NetCommands.cpp`.

**With smoothing buffer** (default, `UseNetMessageSmoothingBuffer = true`):
```cpp
// Conservative policy: take minimum of current and previous queue size
// "we *NEVER* want the queue to run completely dry (by not keeping a few
// messages buffered) because this leads to micro-stutter which is WORSE
// than trading latency for smoothness"
if (numQueuedFrames < lastNumQueuedSimFrames) {
    lastNumQueuedSimFrames = numQueuedFrames;
} else {
    // trust the past more than the future
    lastNumQueuedSimFrames = mix(lastNumQueuedSimFrames * 1.0f, numQueuedFrames * 1.0f, 0.1f);
}

// Target: stay ~2 frames behind server
consumeSpeedMult = GAME_SPEED * gs->speedFactor + lastNumQueuedSimFrames - (2 * gs->speedFactor);
```

**Without smoothing** (legacy "SPRING95" mode):
```cpp
consumeSpeedMult = GAME_SPEED * gs->speedFactor + (numQueuedFrames / 2) - 1;
```

**Queue empty handling:**
```cpp
if (numQueuedFrames == 0)
    msgProcTimeLeft = -1000.0f * gs->speedFactor;  // negative value = wait for next frame
```

### 3.2 Processing Time Budget

`UpdateNetMessageProcessingTimeLeft()` computes how much time the client can spend processing sim frames before needing to render:

```cpp
// At <N> Hz we should consume one simframe message every (1000/N) ms
// <dt> since last call will typically be some small fraction of this
// so we eat through the queue at a rate proportional to that fraction
msgProcTimeLeft += (consumeSpeedMult * deltaReadNetTime.toMilliSecsf());
```

`GetNetMessageProcessingTimeLimit()` balances sim vs draw time, especially critical during reconnection:
```cpp
// reconnectSimDrawBalance = 0.15f → 85% sim, 15% draw during catch-up
const float maxSimFPS    = (1.0f - reconnectSimDrawBalance) * 1000.0f / avgSimFrameTime;
const float minDrawFPS   =         reconnectSimDrawBalance  * 1000.0f / avgDrawFrameTime;
const float simDrawRatio = maxSimFPS / minDrawFPS;
return Clamp(simDrawRatio * gu->avgSimFrameTime, 5.0f, 1000.0f / minDrawFPS);
```

The main `ClientReadNet()` loop respects both time budget **and** wall-clock deadline:
```cpp
const spring_time msgProcEndTime = spring_gettime() + spring_msecs(GetNetMessageProcessingTimeLimit());

while (true) {
    if (msgProcTimeLeft <= 0.0f) break;
    if (spring_gettime() > msgProcEndTime) break;
    // ... process next network message ...
}
```

### 3.3 Visual Interpolation

`CGame::UpdateUnsynced()` at `rts/Game/Game.cpp` computes a `timeOffset` for smooth rendering between discrete sim frames:

```cpp
globalRendering->weightedSpeedFactor = 0.001f * gu->simFPS;
globalRendering->timeOffset = (currentTime - lastFrameTime).toMilliSecsf() * globalRendering->weightedSpeedFactor;
```

This `timeOffset` (range ~0.0 to ~1.0) represents progress between the last sim frame and the next, used by rendering code to interpolate unit positions. Units store `preFramePos` (position at start of current sim frame) for this purpose.

**Skipping mode:** When fast-forwarding (e.g., during demo playback), rendering drops to 2 Hz (`minDrawFPS = 2`) to maximize sim throughput.

---

## 4. Reconnection & Late-Join

### 4.1 Reconnection Mechanism

**Key files:** `rts/Net/Protocol/NetProtocol.cpp`, `rts/Net/GameServer.cpp`

**Player states** (in `GameParticipant`):
- `UNCONNECTED` → `CONNECTED` → `INGAME` → (optionally) `DISCONNECTED`
- Flags: `isReconn` (currently reconnecting), `isMidgameJoin` (joined after game start)

**Packet cache for reconnection:**
```cpp
// GameServer stores all broadcast packets when reconnection/spectator join is possible
if (canReconnect || allowSpecJoin || !gameHasStarted)
    packetCache.push_back(packet);  // deque of all broadcast packets
```

On reconnect, the server replays the entire `packetCache` to the reconnecting client.

**Client-side reconnect flow:**
1. `CNetProtocol::NeedsReconnect()` checks `reconnectTimeout` (default 15 seconds)
2. `AttemptReconnect()` sends reconnect request with version string and platform info
3. UDPConnection level: `CopyConnection()` preserves connection state across reconnect attempts
4. `reconnectTime` incremented each attempt

**Server-side reconnect handling** (`BindConnection()`):
- Version matching: first client sets `refClientVersion`, all subsequent must match
- Password verification
- `killExistingLink` flag to clean up old connection

### 4.2 Catch-Up Behavior

During reconnection, the sim/draw balance shifts dramatically:

```cpp
// CGlobalUnsynced at rts/Game/GlobalUnsynced.h:
static constexpr float reconnectSimDrawBalance = 0.15f;
// → 15% of CPU time for drawing, 85% for catching up simulation
```

The client fast-forwards through queued sim frames while maintaining minimal rendering (2 FPS minimum).

**Progress tracking:** Server sends `NETMSG_GAME_FRAME_PROGRESS` periodically (every 150 frames) so reconnecting clients know how far behind they are. BAR uses this in `luaui/Widgets/gui_rejoinprogress.lua` to show a catch-up progress bar.

**Speed exclusion:** Reconnecting players are excluded from the lag protection speed calculation:
```cpp
if (player.isReconn && curPing < 2 * GAME_SPEED)
    player.isReconn = false;  // only clear reconnecting flag once caught up
```

### 4.3 Mid-Game Spectator Join

`AllowSpectatorJoin` (default `true`) allows spectators to join running games:
- `NETMSG_CREATE_NEWPLAYER` sent to all existing clients
- New spectator receives full `packetCache` replay
- Spectators can potentially replace AFK players (see BAR section)

---

## 5. Performance Optimizations for Large Unit Counts

### 5.1 Staggered Unit Updates

**File:** `rts/Sim/Units/UnitHandler.cpp`

The full `CUnitHandler::Update()` pipeline per frame:
```cpp
void CUnitHandler::Update() {
    DeleteUnits();
    UpdateUnitMoveTypes();    // every unit, every frame
    QueueDeleteUnits();
    UpdateUnitLosStates();    // every unit, every frame
    SlowUpdateUnits();        // STAGGERED — batch per frame
    UpdateUnits();            // every unit, every frame
    UpdateUnitWeapons();      // every unit, every frame
}
```

**SlowUpdate staggering** — expensive per-unit operations are spread across `UNIT_SLOWUPDATE_RATE` frames:
```cpp
void CUnitHandler::SlowUpdateUnits() {
    // reset iterator every UNIT_SLOWUPDATE_RATE frames
    if ((gs->frameNum % UNIT_SLOWUPDATE_RATE) == 0)
        activeSlowUpdateUnit = 0;

    // process (totalUnits / UNIT_SLOWUPDATE_RATE) + 1 units this frame
    for (size_t n = (activeUnits.size() / UNIT_SLOWUPDATE_RATE) + 1;
         (activeSlowUpdateUnit < activeUnits.size() && n != 0);
         ++activeSlowUpdateUnit) {
        activeUnits[activeSlowUpdateUnit]->SlowUpdate();
        // ... also SlowUpdateWeapons(), SlowUpdateLocalModel() ...
        n--;
    }
}
```

**What SlowUpdate does** (expensive operations, `rts/Sim/Units/Unit.cpp`):
- Position error parameter updates
- Water damage calculation
- Paralysis decay
- Resource production/consumption (metal, energy, wind)
- Health regeneration (auto-heal, idle-heal)
- Cloaking state updates
- Kamikaze checks
- Seismic pings
- Terrain type calculation
- Command AI slow update
- Movement type slow update (path replanning)

### 5.2 Staggered LOS Updates

**File:** `rts/Sim/Misc/LosHandler.cpp`

Line-of-sight updates are also staggered AND multi-threaded:
```cpp
void CLosHandler::Update() {
    #if (USE_STAGGERED_UPDATES == 1)
    const size_t losBatchRate = UNIT_SLOWUPDATE_RATE;
    const size_t losBatchSize = std::max(size_t(1), activeUnits.size() / losBatchRate);
    const size_t losBatchMult = gs->frameNum % losBatchRate;
    // ... compute min/max unit index for this frame's batch ...
    #endif

    for_mt(0, losTypes.size(), [&](const int idx) {
        // Multi-threaded across LOS types (LOS, radar, sonar, etc.)
        // Within each type, only process this frame's batch of units
    });
}
```

The `for_mt()` macro (`rts/System/Threading/ThreadPool.h`) dispatches work across the thread pool when `THREADPOOL` is defined, otherwise falls back to a simple sequential loop.

### 5.3 Staggered Pathfinding (QTPFS)

**File:** `rts/Sim/Path/QTPFS/PathManager.cpp`

The Quad-Tree PathFinder System supports staggered layer updates:
```cpp
#ifdef QTPFS_STAGGERED_LAYER_UPDATES
// For a mod with N move-types, any unit waits
// (N / LAYERS_PER_UPDATE) sim-frames minimum before
// its pathfinding request executes
const unsigned int numPathTypeUpdates = std::min(nodeLayers.size(), LAYERS_PER_UPDATE);
#endif
```

Path layer initialization uses Spring's thread pool (`SpawnSpringThreads`), with `streflop` re-initialized after threaded work to restore deterministic FPU state.

### 5.4 Feature (Wreckage) Handler

**File:** `rts/Sim/Features/FeatureHandler.cpp`

Features only update when they have active physics (falling, burning):
```cpp
void CFeatureHandler::Update() {
    // Cleanup every 32 frames
    if ((gs->frameNum & 31) == 0) {
        // ... free deleted feature IDs ...
    }
    // Only update features that need it (physics active)
    updateFeatures.erase(
        std::remove_if(updateFeatures.begin(), updateFeatures.end(), updatePred),
        updateFeatures.end()
    );
}
```

### 5.5 Factory Frequency Optimization

**File:** `rts/Sim/Units/UnitTypes/Factory.cpp`

Factories use frame-skipped checks for expensive operations:
```cpp
// Only bugger-off check every (UNIT_SLOWUPDATE_RATE / 2) frames
if ((gs->frameNum & (UNIT_SLOWUPDATE_RATE >> 1)) == 0)
    CGameHelper::BuggerOff(pos + frontdir * radius * 0.5f, ...);
```

### 5.6 Lua Garbage Collection Pacing

**File:** `rts/Lua/LuaHandle.cpp`

GC is tied to sim speed with time-bounded cycles:
```cpp
const float gcSpeedFactor = Clamp(gs->speedFactor * ..., 1.0f, 50.0f);
const float gcLoopRunTime = Clamp((gcBaseRunTime * gcRunTimeMult) / gcSpeedFactor, minLoopRunTime, maxLoopRunTime);
// Perform GC cycles until time runs out
const spring_time endTime = startTime + spring_msecs(gcLoopRunTime);
```

### 5.7 Headless Mode

When running without rendering (`BuildType::IsHeadless()`), the engine calculates maximum sim frame time and sleeps any remaining budget:
```cpp
const float msecMaxSimFrameTime = 1000.0f / (GAME_SPEED * gs->wantedSpeedFactor);
const float msecDifSimFrameTime = (lastSimFrameTime - lastFrameTime).toMilliSecsf();
const float msecSleepTime = (msecMaxSimFrameTime - msecDifSimFrameTime) * 0.5f;
if (msecSleepTime > 0.0f) spring_sleep(spring_msecs(msecSleepTime));
```

### 5.8 Profiling / Timing Infrastructure

`SCOPED_TIMER()` macros throughout the codebase track time spent in each subsystem:
```cpp
SCOPED_TIMER("Sim::Unit::Update");
SCOPED_TIMER("Sim::Unit::SlowUpdate");
SCOPED_TIMER("Sim::Unit::Weapon");
SCOPED_TIMER("Sim::Los");
SCOPED_TIMER("Sim::Path");
SCOPED_TIMER("Sim::Features");
SCOPED_TIMER("Sim::Script");
SCOPED_SPECIAL_TIMER("Sim");
```

---

## 6. Speed Control & Lag Protection

### 6.1 LagProtection Algorithm

**File:** `rts/Net/GameServer.cpp`, `LagProtection()` (lines 864–940)

The server dynamically adjusts game speed based on the slowest client's performance.

**Per-player metrics:**
```cpp
curPing = ((serverFrameNum - player.lastFrameResponse) * 1000) / (GAME_SPEED * internalSpeed);
// Player reports CPU usage via NETMSG_CPU_USAGE every second
```

**Two speed control modes** (toggled by `/speedcontrol` command):

| Mode | Name              | Method                             | Target CPU |
| ---- | ----------------- | ---------------------------------- | ---------- |
| 1    | Average (default) | Median CPU/ping from sorted arrays | 60%        |
| 2    | Highest           | Maximum CPU usage                  | 75%        |

**Speed adjustment formula:**
```cpp
float newSpeed = internalSpeed / refCpuUsage * wantedCpuUsage;
newSpeed = Clamp(newSpeed, 0.1f, userSpeedFactor);
// Smooth to reduce impact of CPU spikes
newSpeed = (newSpeed + internalSpeed) * 0.5f;
```

**Non-dedicated host safeguard:**
```cpp
const float invSimDrawFract = 1.0f - CGlobalUnsynced::reconnectSimDrawBalance;
const float maxSimFrameRate = (1000.0f / gu->avgSimFrameTime) * invSimDrawFract;
// Constrains speed so host can keep up
```

### 6.2 CPU Usage Reporting

**File:** `rts/Net/NetCommands.cpp`, `SendClientProcUsage()`

Clients report CPU usage every second:
```cpp
const float simProcUsage  = profiler.GetTimePercentage("Sim");
const float drawProcUsage = (profiler.GetTimePercentage("Draw") / max(1.0f, globalRendering->FPS))
                           * CGlobalUnsynced::minDrawFPS;
const float totalProcUsage = simProcUsage + drawProcUsage;
clientNet->Send(CBaseNetProtocol::Get().SendCPUUsage(totalProcUsage));
```

---

## 7. Anti-Cheat & Security

### 7.1 Architectural Maphack Vulnerability

Like all deterministic lockstep engines, Spring is architecturally vulnerable to maphack — every client has the full game state. The engine mitigates this through:
- **LoS system:** Rendering only shows units visible to the player's alliance
- No obfuscation or memory protection against memory-reading tools
- No server-authoritative fog of war (no equivalent to Spring's `FogAuthoritativeNetwork` concept)

### 7.2 Order Validation

The server validates orders before forwarding:
- Connection-level validation in `ProcessPacket()`
- Player number matching (can't send orders for other players)
- Game state checks (can't send game commands before game starts)

However, the actual **game-logic validation** (e.g., "can this player afford this unit?") happens deterministically in the simulation, not at the server network layer. This is similar to Iron Curtain's D012 design.

### 7.3 Rate Limiting

**File:** `rts/System/GlobalConfig.cpp`

```
LinkIncomingMaxPacketRate:    64 packets/sec
LinkIncomingMaxWaitingPackets: 512
// max lag from command spam = 512 / 64 = 8 seconds
LinkIncomingSustainedBandwidth: 2 KB/sec
LinkIncomingPeakBandwidth:     32 KB/sec
```

### 7.4 No Transport Encryption

Spring's UDP protocol uses a simple CRC checksum for corruption detection, not encryption. Traffic is sent in plaintext. There is no TLS/DTLS wrapper.

---

## 8. Unique Techniques & Notable Design Patterns

### 8.1 Network Testing Infrastructure

**File:** `rts/System/Net/UDPConnection.h` (with `NETWORK_TEST` compile flag)

Built-in latency and packet loss emulation:
```cpp
#define PACKET_LOSS_FACTOR 50           // 50% regular loss probability
#define SEVERE_PACKET_LOSS_FACTOR 1     // burst loss
#define SEVERE_PACKET_LOSS_MAX_COUNT 10 // burst length
#define PACKET_MIN_LATENCY 750          // ms
#define PACKET_MAX_LATENCY 1250         // ms
#define PACKET_CORRUPTION_FACTOR 0      // CRC corruption

// Latency emulation: delays packets using wall-clock offset
EMULATE_LATENCY: spring_gettime() + spring_msecs(MIN + (MAX-MIN) * RANDOM())
// Loss emulation: combines regular probability with severe burst loss
EMULATE_PACKET_LOSS()
// Corruption: randomizes CRC byte
EMULATE_PACKET_CORRUPTION()
```

This is compiled in via `NETWORK_TEST` flag — not a runtime toggle. Useful for testing but requires a special build.

### 8.2 Demo/Replay System

**Files:** `CDemoRecorder`, `CDemoReader`

- All network packets recorded with frame-relative timestamps
- `CDemoReader` replays demos by feeding packets through the server
- `DemoFromDemo` option: record a new demo while watching an existing one
- During DemoFromDemo with godMode, sync response checksums are rewritten to prevent false desync warnings

### 8.3 Sim Frame Pipeline

The full `SimFrame()` execution order (`rts/Game/Game.cpp`, lines 1478–1569):

```
1.  ENTER_SYNCED_CODE()
2.  ASSERT_SYNCED(gsRNG.GetGenState())
3.  good_fpu_control_registers()
4.  gs->frameNum++
5.  spring_lua_alloc_update_stats() (every GAME_SPEED frames)
6.  eventHandler.CollectGarbage() (if luaGCControl == 0)
7.  eventHandler.GameFrame()      — Lua gadget/widget callbacks
8.  helper->Update()
9.  mapDamage->Update()
10. pathManager->Update()          — pathfinding
11. unitHandler.Update()           — all unit systems
12. projectileHandler.Update()     — projectile physics
13. featureHandler.Update()        — wreckage/map features
14. unitScriptEngine->Tick(33)     — unit animation scripts
15. envResHandler.Update()         — wind/tidal
16. losHandler->Update()           — line of sight (staggered + threaded)
17. unitDrawer->UpdateGhostedBuildings()
18. interceptHandler.Update()
19. teamHandler.GameFrame()
20. playerHandler.GameFrame()
21. avgSimFrameTime tracking
22. ASSERT_SYNCED(gsRNG.GetGenState())
23. LEAVE_SYNCED_CODE()
```

### 8.4 Global Configuration System

**File:** `rts/System/GlobalConfig.cpp`

All network parameters are runtime-configurable:

| Parameter                        | Default | Range           | Notes                           |
| -------------------------------- | ------- | --------------- | ------------------------------- |
| `NetworkLossFactor`              | 0       | 0–2             | Affects resend aggressiveness   |
| `InitialNetworkTimeout`          | 30s     | 10s+            | Timeout during connection setup |
| `NetworkTimeout`                 | 120s    | 0+ (0=disabled) | In-game timeout                 |
| `ReconnectTimeout`               | 15s     | 0+              | Reconnection window             |
| `MaximumTransmissionUnit`        | 1400    | 400+            | UDP packet size limit           |
| `LinkOutgoingBandwidth`          | 64 KB   | —               | Upload cap                      |
| `LinkIncomingSustainedBandwidth` | 2 KB    | —               | Download sustained cap          |
| `LinkIncomingPeakBandwidth`      | 32 KB   | —               | Download burst cap              |
| `LinkIncomingMaxPacketRate`      | 64/s    | —               | Max packets per second          |
| `LinkIncomingMaxWaitingPackets`  | 512     | —               | Max queued packets              |
| `UseNetMessageSmoothingBuffer`   | true    | —               | Frame consumption smoothing     |

### 8.5 Keyframe Interval

Every 16th frame (`serverKeyframeInterval = 16`) is a keyframe. The distinction between `NETMSG_NEWFRAME` and `NETMSG_KEYFRAME` allows sync checking to happen at keyframe boundaries rather than every frame, reducing sync traffic overhead.

---

## 9. Beyond All Reason (BAR) Networking

BAR relies **entirely** on the Spring engine's C++ networking layer. It has zero custom networking code. All BAR-specific networking concerns are handled at the Lua widget/gadget layer:

### 9.1 Rejoin Progress UI

**File:** `luaui/Widgets/gui_rejoinprogress.lua`

Displays catch-up progress when a client reconnects:
```lua
function widget:GameProgress(n)
    -- fires every 150 frames
    serverFrame = n
    -- Shows UI when framesLeft > CATCH_UP_THRESHOLD
end
```

### 9.2 AFK Player Handling

**File:** `luarules/gadgets/game_replace_afk_players.lua`

A "substitution" gadget allowing spectators to replace AFK players. Currently disabled due to issues with:
- Original player returning during replacement
- Openskill rating corruption
- Resign/unit sharing edge cases

### 9.3 Idle Player Tracking

**File:** `luarules/gadgets/cmd_idle_players.lua`

Tracks player presence and connection state:
```lua
playerInfoTableEntry.connected  -- is player connected
playerInfoTableEntry.pingOK     -- is ping acceptable
```

Used for AI hosting decisions (replace disconnected players with AI).

### 9.4 Voice Notifications

**File:** `sounds/voice/config.lua`

Multiplayer status events with voice lines:
- Disconnected, Reconnected, Lagging, CaughtUp, Resigned, Timedout

### 9.5 Pre-Game Coordination

**Files:** `luaui/Widgets/gui_pregameui.lua`, `game_initial_spawn.lua`

- Tracks `joined_game` messages from each player
- Starts auto-ready countdown when all players have joined
- References `NETMSG_STARTPLAYING = 4` from `BaseNetProtocol.h` for the 3-2-1 countdown

---

## 10. Relevance to Iron Curtain

### Similarities

| Aspect                              | Spring                              | Iron Curtain                                     |
| ----------------------------------- | ----------------------------------- | ------------------------------------------------ |
| Lockstep model                      | Server-authoritative lockstep       | Lockstep (pluggable via NetworkModel trait)      |
| Client processes orders from server | ✓                                   | ✓ (via NETMSG → apply_tick)                      |
| Desync detection via checksums      | ✓ (per-4096-frame rolling checksum) | ✓ (state_hash() every tick)                      |
| Replay system from network packets  | ✓                                   | ✓ (ReplayPlayback NetworkModel)                  |
| Staggered expensive updates         | ✓ (SlowUpdate amortized)            | ✓ (planned: fog every 1-4 ticks, path every 4-8) |
| Speed control for slow clients      | ✓ (LagProtection)                   | Planned (relay server owns clock)                |
| Singleplayer uses same net path     | ✓ (LocalConnection)                 | ✓ (LocalNetwork)                                 |

### Key Differences

| Aspect               | Spring                            | Iron Curtain                                                                 |
| -------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| Determinism approach | `streflop` (deterministic floats) | Fixed-point math (no floats in sim)                                          |
| Network transport    | Custom UDP reliability protocol   | Planned: DTLS 1.3 / TLS 1.3                                                  |
| Encryption           | None (plaintext CRC)              | Mandatory transport encryption                                               |
| Server model         | Embedded (in-process)             | Relay server (separate process)                                              |
| Anti-cheat           | Minimal (order ownership only)    | Architectural (relay validation, behavioral analysis, capability-based WASM) |
| Frame rate           | 30 Hz fixed                       | Configurable, likely 30 Hz                                                   |
| Reconnection         | Replay full packet cache          | Sim snapshots + restore                                                      |

### Techniques Worth Adopting

1. **SyncDebugger binary search protocol** — The 5-step block checksum narrowing to find the exact divergent variable assignment is elegant. Iron Curtain should implement something similar for desync debugging using its snapshot system.

2. **Frame consumption smoothing** — Spring's `consumeSpeedMult` formula that aims to stay ~2 frames behind the server, with conservative minimum tracking, is well-tuned for avoiding micro-stutter.

3. **Network testing infrastructure** — Compile-time packet loss/latency/corruption emulation is valuable. Iron Curtain should have equivalent testing capabilities, ideally as a runtime toggle rather than requiring recompilation.

4. **LagProtection dual-mode speed control** — The median vs maximum CPU usage modes give players control over how much the slowest player affects everyone. The 0.5 smoothing factor prevents oscillation.

5. **Staggered update pattern** — The `(frameNum % RATE)` batch selection with `(total / RATE) + 1` items per batch ensures all units get updated exactly once per cycle with even distribution. Simple and effective.

6. **`reconnectSimDrawBalance`** — The 85/15 sim/draw split during catch-up is a clean way to handle reconnection without freezing the UI entirely.

### Techniques to Avoid

1. **`streflop` for determinism** — Fragile. Depends on controlling FPU state across all threads and third-party libraries. Iron Curtain's fixed-point approach is more robust.

2. **No transport encryption** — Spring's plaintext UDP traffic is a security gap. Iron Curtain's DTLS 1.3 mandate is correct.

3. **Full packet cache replay for reconnection** — Scaling poorly with game length. Iron Curtain's snapshot-based reconnection (D010) is superior for long games.

4. **In-process server** — Spring's embedded server means the host has inherent advantages (zero latency, no packet loss). Iron Curtain's relay server design (D007) eliminates this asymmetry.
