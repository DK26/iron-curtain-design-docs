# C&C Remastered Collection — Technical Research Report

> **Repository:** [`electronicarts/CnC_Remastered_Collection`](https://github.com/electronicarts/CnC_Remastered_Collection)
> **Scope:** Networking, synchronization, rendering, threading, anti-cheat, replay system
> **Method:** Source code analysis only. Every claim is backed by a specific file and line reference.
> **Date:** 2025-06

---

## Table of Contents

1. [Network Model](#1-network-model)
2. [Protocol (TCP / UDP)](#2-protocol)
3. [Order / Command Synchronization (OutList / DoList)](#3-order--command-synchronization)
4. [Desync Handling & Sync Hash](#4-desync-handling--sync-hash)
5. [Server Infrastructure](#5-server-infrastructure)
6. [Replay System](#6-replay-system)
7. [Anti-Cheat Measures](#7-anti-cheat-measures)
8. [Threading Model](#8-threading-model)
9. [Rendering Pipeline](#9-rendering-pipeline)
10. [Key Differences from Original 1996 Code](#10-key-differences-from-original-1996-code)

---

## 1. Network Model

**Verdict: Deterministic lockstep, peer-to-peer, with frame-synchronized advancement.**

The original C++ engine uses a classic deterministic lockstep model. Every player runs the same simulation; only player **commands** (not game state) are transmitted. All peers must agree before advancing.

### Evidence

**Frame-sync gate — `Can_Advance()`** (referenced in `REDALERT/QUEUE.CPP`):
A peer may only advance to the next frame if:
1. Its current frame < the oldest frame reported by any peer + `MaxAhead`
2. Every peer's receive count ≥ their send count (all packets acknowledged)

The function `Queue_AI_Multiplayer()` (`REDALERT/QUEUE.CPP` line 824+) orchestrates the multiplayer tick:
1. Call `Wait_For_Players()` — blocks until all peers' packets arrive or timeout
2. Call `Generate_Timing_Event()` — master adjusts `MaxAhead` / `DesiredFrameRate` every 128 frames
3. Call `Queue_Record()` — save DoList to disk if recording
4. Call `Execute_DoList()` — run all commands scheduled for this frame
5. Call `Clean_DoList()` — remove executed/stale events

**Game mode dispatch — `Queue_AI()`** (`REDALERT/QUEUE.CPP` lines 336–378):
```cpp
void Queue_AI(void) {
    if (Session.Play) {
        Queue_Playback();
    } else {
        switch (Session.Type) {
            case GAME_SKIRMISH:
            case GAME_NORMAL:
                Queue_AI_Normal();
                break;
            case GAME_MODEM:
            case GAME_NULL_MODEM:
            case GAME_IPX:
            case GAME_INTERNET:
            case GAME_TEN:
            case GAME_MPATH:
                Queue_AI_Multiplayer();
                break;
        }
    }
}
```

The Tiberian Dawn equivalent (`TIBERIANDAWN/QUEUE.CPP` lines 302–346) uses global `GameToPlay` instead of `Session.Type`.

---

## 2. Protocol

**Verdict: UDP (SOCK_DGRAM) via Winsock 1.1. IPX as legacy fallback. TCP only used for initial handshake in older code path.**

### UDP Implementation

**`REDALERT/WSPUDP.CPP`** (lines 19–410+):
- Creates a `SOCK_DGRAM` (UDP) socket bound to `PlanetWestwoodPortNumber`
- Uses `WSAAsyncSelect` for async I/O with window message `WM_UDPASYNCEVENT`
- Handles `FD_READ` (calls `recvfrom`) and `FD_WRITE` (calls `sendto`)
- `UDPInterfaceClass` extends `WinsockInterfaceClass`

**`REDALERT/WSPROTO.H`** (line 142+) — explicit protocol constraint:
> *"only supports connectionless packet protocols like UDP & IPX. Connection orientated or streaming protocols like TCP are not supported"*

### Connection Class Hierarchy

```
ConnectionClass (CONNECT.H/CPP)          — base: retry/timeout/ACK logic
├── SequencedConnClass (SEQCONN.H)       — ordered delivery
├── NonSequencedConnClass (NOSEQCON.CPP) — unordered delivery
└── NullModemConnClass (NULLCONN.CPP)    — serial/modem

CommBufferClass (COMBUF.H)               — packet ring buffer with ACK tracking
CommQueueClass (COMQUEUE.H)              — simpler queue for SequencedConnClass
ConnManClass (CONNMGR.H)                 — abstract connection manager

IPXGlobalConnClass (IPXGCONN.CPP)        — IPX transport
UDPInterfaceClass (WSPUDP.CPP/H)         — UDP transport (extends WinsockInterfaceClass)
TcpipManagerClass (TCPIP.CPP/H)          — older Winsock path: TCP handshake → UDP game
MPlayerManClass (MPMGRW.CPP/MPMGRD.H)   — remaster multiplayer manager (delegates to DLL)
```

### TCP Role

`TcpipManagerClass` (`REDALERT/TCPIP.CPP`) uses TCP (`SOCK_STREAM`) only for the initial connection handshake. Once the game starts, all gameplay packets go over UDP.

---

## 3. Order / Command Synchronization

**Verdict: Three-queue pipeline — OutList → network → DoList → Execute_DoList(). Commands are scheduled `MaxAhead` frames into the future.**

### The Pipeline

1. **Player input** → `Queue_Mission()` (`REDALERT/QUEUE.CPP` line 269) creates an `EventClass` and adds it to `OutList`
2. **OutList → DoList** — In single-player, `Queue_AI_Normal()` transfers directly (`REDALERT/QUEUE.CPP` lines 403–440). In multiplayer, `Build_Send_Packet()` serializes OutList events into a network packet, sent to all peers via `Send_Packets()`. Received events are unpacked by `Breakup_Receive_Packet()` into `DoList`.
3. **DoList → Execution** — `Execute_DoList()` iterates through DoList in a deterministic order (by player ID array), executing events whose `Frame` field matches the current game frame.

### Event Scheduling

Events are stamped with `Frame + MaxAhead` when created, ensuring all peers receive and queue them before execution time arrives.

**`Queue_AI_Normal()` — single-player transfer** (`REDALERT/QUEUE.CPP` lines 403–440):
```cpp
while (OutList.Count) {
    OutList.First().IsExecuted = false;
    if (!DoList.Add(OutList.First())) { ; }
    OutList.Next();
}
```

**`Add_Uncompressed_Events()` — multiplayer packet building** (`TIBERIANDAWN/QUEUE.CPP` lines 2237–2262):
```cpp
OutList.First().MPlayerID = MPlayerLocalID;
OutList.First().IsExecuted = 0;
if (!DoList.Add(OutList.First())) { return (size); }
memcpy(((char *)buf) + size, &OutList.First(), sizeof(EventClass));
size += sizeof(EventClass);
```

### EventClass Structure

**`REDALERT/EVENT.H`** / **`TIBERIANDAWN/EVENT.H`**:
- `Type` — `EventType` enum: `EXIT`, `OPTIONS`, `FRAMEINFO`, `PROCESS_TIME`, `TIMING`, `RESPONSE_TIME`, `MEGAMISSION`, `PROPOSE_DRAW`, `RETRACT_DRAW`, etc.
- `Frame` — 27 bits: game frame when event should execute
- `ID` — 4 bits: player index
- `IsExecuted` — 1 bit: marks event as processed

### Execution Order

**`Execute_DoList()`** (`TIBERIANDAWN/QUEUE.CPP` lines 2874–2896) — deterministic iteration:
```cpp
// Execute events in the order of the MPlayerID array.
// This array is stored in the same order on all systems.
for (i = 0; i < MPlayerCount; i++) {
    house = MPlayerHouses[i];
    housep = HouseClass::As_Pointer(house);
    // ... execute events for this house
}
```

### Dynamic Timing Adaptation

The **master** (host / first player) generates `TIMING` events every 128 frames to adjust the pace:

**`Generate_Real_Timing_Event()`** (`REDALERT/QUEUE.CPP`):
```
maxahead = (resp_time * DesiredFrameRate) / (2 * 60)
```
Rounded up to next `FrameSendRate` multiple, minimum = `3 × FrameSendRate`.

**Constants** (`REDALERT/SESSION.H`):
- `MODEM_MIN_MAX_AHEAD = 5`
- `NETWORK_MIN_MAX_AHEAD = 2`

**Westwood Online defaults** (`REDALERT/WOL_GSUP.CPP`):
- `Session.MaxAhead = 15`
- `Session.FrameSendRate = 3`

**`DesiredFrameRate`** = `MIN(user game speed setting, hardware capability: 60 / highest_ticks)`

Internet games get longer timeouts:
```
net->Set_Timing(resp_time + 10, -1, ((resp_time + 10) * 8) + 15)  // Internet
net->Set_Timing(resp_time * 4, -1, (resp_time * 4) + 15)          // LAN
```

---

## 4. Desync Handling & Sync Hash

**Verdict: CRC-based per-frame hash of all game entities. Compared via FRAMEINFO events. Debug dump to file on mismatch.**

### CRC Computation

**`Compute_Game_CRC()`** (`REDALERT/QUEUE.CPP` lines 3800–3880) hashes the following each frame:

| Entity Type | Fields Hashed |
|---|---|
| Infantry | Coord, PrimaryFacing, Speed, NavCom, Mission, TarCom |
| Units | Coord, PrimaryFacing, SecondaryFacing |
| Vessels | Coord, PrimaryFacing, Speed, NavCom, Strength, Mission, TarCom |
| Buildings | Coord, PrimaryFacing |
| Houses | Credits, Power, Drain |
| Map Layers | Coord, What_Am_I() |
| Logic Layers | Coord, What_Am_I() |
| Random seed | `Scen.RandomNumber` (RA) / `rand()` (TD) |

CRC values are stored in a circular buffer:
```cpp
static unsigned long GameCRC;
static unsigned long CRC[32];  // last 32 frames
```

### CRC Comparison

**`Execute_DoList()`** (`REDALERT/QUEUE.CPP` line 3378+):
When processing a `FRAMEINFO` event from another player, the code compares their CRC against ours. The first 32 frames are skipped (no history yet). On mismatch:
```cpp
CCMessageBox().Process("OUT OF SYNC");
```

### Desync Debugging

**`Print_CRCs()`** (`REDALERT/QUEUE.CPP` lines 3934+, `TIBERIANDAWN/QUEUE.CPP` lines 3516+):
Dumps exhaustive per-house, per-unit-type state to `"OUT.TXT"`:
- COORD, Facing, SecondaryFacing, Mission, Type for every unit per player
- Allows developers to diff the output between two machines to identify the exact entity that diverged

**Trap mechanism** — `Session.TrapPrintCRC`: if set, `Queue_Playback()` will call `Print_CRCs()` at a specific frame and exit, enabling targeted desync diagnosis during replay.

---

## 5. Server Infrastructure

**Verdict: No dedicated game server exists in the C++ source. The architecture is pure peer-to-peer. The "master" is simply the first player (host) who generates timing events.**

### Evidence of No Server

- No server binary, server loop, or authority logic exists anywhere in the open-source C++ code.
- `Session.Am_I_Master()` in Red Alert (or `MPlayerLocalID == MPlayerID[0]` in TD) determines the "master" — this player generates `TIMING` events to adjust `MaxAhead` and `DesiredFrameRate`, but does NOT act as a game state authority.
- All peers run identical simulation; the master only controls pacing, not game truth.

### Westwood Online

**`REDALERT/WOLAPIOB.H`** (lines 322–335): `WolapiObject` class handles Westwood Online lobby functions — channel creation, player pinging, messaging, kicking — but this is a **lobby/matchmaking service**, not a game server. No game data flows through it during play.

### Remaster Networking

The remaster's multiplayer networking is handled entirely by the **C# GlyphX client layer**, which is NOT included in the open-source release. The C++ DLL operates as a headless simulation engine — see [Section 10](#10-key-differences-from-original-1996-code).

---

## 6. Replay System

**Verdict: Record/playback system that serializes DoList events to disk per frame. Also supports "attract mode" (automated demo playback).**

### Recording — `Queue_Record()`

**`REDALERT/QUEUE.CPP`** (lines 3608–3632), **`TIBERIANDAWN/QUEUE.CPP`** (lines 3140–3164):

```cpp
static void Queue_Record(void) {
    // Count events for this frame
    j = 0;
    for (i = 0; i < DoList.Count; i++) {
        if (Frame == DoList[i].Frame && !DoList[i].IsExecuted) j++;
    }
    // Write count, then each event
    Session.RecordFile.Write(&j, sizeof(j));
    for (i = 0; i < DoList.Count; i++) {
        if (Frame == DoList[i].Frame && !DoList[i].IsExecuted) {
            Session.RecordFile.Write(&DoList[i], sizeof(EventClass));
        }
    }
}
```

Called from `Queue_AI_Normal()` and `Queue_AI_Multiplayer()` when `Session.Record` is true.

### Playback — `Queue_Playback()`

**`REDALERT/QUEUE.CPP`** (lines 3659–3784), **`TIBERIANDAWN/QUEUE.CPP`** (lines 3191–3386):

1. Compute CRC for current frame (for sync verification during playback)
2. Read event count from file
3. Read each `EventClass`, set `IsExecuted = 0`, add to DoList
4. Call `Execute_DoList()` → `Clean_DoList()` as normal

### Playback Controls

- **ESC** stops playback immediately
- **Attract mode** (`Session.Attract` / `AllowAttract`): playback stops on any mouse movement — used for menu-screen demo loops
- **CRC trap**: if `Session.TrapPrintCRC` is set, playback calls `Print_CRCs()` at the target frame and exits

### Recording Header

**`Save_Recording_Values()`** (`REDALERT/INIT.CPP` lines 3624–3636):
```cpp
bool Save_Recording_Values(CCFileClass &file) {
    Session.Save(file);               // MaxAhead, FrameSendRate, DesiredFrameRate, etc.
    file.Write(&BuildLevel, ...);
    file.Write(&Debug_Unshroud, ...);
    file.Write(&Seed, ...);           // Random seed for deterministic replay
    file.Write(&Scen.Scenario, ...);
    file.Write(Scen.ScenarioName, ...);
    file.Write(&Whom, ...);
    file.Write(&Special, ...);
    file.Write(&Options, ...);
    return true;
}
```

### Auxiliary: `Do_Record_Playback()`

**`TIBERIANDAWN/CONQUER.CPP`** (lines 4070–4187):
Separately records/plays back camera position and selected-object list each frame, with CRC verification of the selection list.

---

## 7. Anti-Cheat Measures

**Verdict: No anti-cheat code exists in the C++ source. The only "anti-tamper" mechanism is a WChat heartbeat check that served as anti-piracy for Westwood Online.**

### WChat Heartbeat (Anti-Piracy, Not Anti-Cheat)

**`REDALERT/EVENT.CPP`** (lines 957–994):
```cpp
// TIMING event handler:
Session.MaxAhead += DDEServer.Time_Since_Heartbeat() / (70 * 60);
```
If the game was launched from WChat and WChat stops sending DDE heartbeats, `MaxAhead` silently increases, degrading network performance until the game becomes unplayable. This is **anti-piracy** (ensures the game was launched from legitimate Westwood Online client), not anti-cheat.

### Version Matching

**`REDALERT/VERSION.H`** (lines 139–167):
`VersionClass` enforces `MIN_VERSION` / `MAX_VERSION` range checking when connecting. Peers outside the version range are rejected. This prevents version mismatch, not cheating.

### What's Not Present

- No order validation (orders are executed as-is; no affordability/prerequisite/ownership checks)
- No cheat detection (no APM analysis, no memory scanning, no hash verification of client binary)
- No server-side authority (pure P2P — every client is fully trusted)
- No replay signing or tamper detection

### Implication for Iron Curtain

This confirms IC's design decision (D012) to implement **deterministic order validation inside the sim** is a genuine improvement over the original architecture, which had zero validation.

---

## 8. Threading Model

**Verdict: Game logic is entirely single-threaded. Only background threads exist for VQ video file I/O and multimedia timer callbacks.**

### Main Game Loop

**`Main_Loop()`** in `TIBERIANDAWN/CONQUER.CPP`: A single function called repeatedly — processes input, runs AI, advances simulation, renders. In DLL mode, `CNC_Advance_Instance()` wraps this as a synchronous call: the C# host calls it, it runs one complete frame, and returns.

### Threads Found (None Are Game Logic)

| Thread | File | Purpose |
|---|---|---|
| `Thread_Read` | `TIBERIANDAWN/CONQUER.CPP` line 1852+ | VQ video file I/O — `CreateThread()` for async video loading |
| `MouseCriticalSection` | `MOUSE.H` (both games) | `CRITICAL_SECTION` protecting mouse cursor rendering state |
| `TimerThreadHandle` | `TIMERINI.CPP` (both games) | Win32 multimedia timer callback thread |

### DLL Mode (Remaster)

**`REDALERT/DLLInterface.cpp`** (lines 1672–1897):
`CNC_Advance_Instance(uint64 player_id)` is a synchronous exported function. The C# GlyphX client calls it on its own thread; the C++ code runs a single frame and returns. There is no internal threading or parallelism in the C++ simulation.

---

## 9. Rendering Pipeline

**Verdict: Pure software rendering in the C++ layer. The original engine renders to `GraphicBufferClass` (RAM buffers). The remaster intercepts draw calls via `DLL_Draw_Intercept` and forwards sprite metadata to the C# GlyphX client for GPU rendering.**

### Original Rendering

The original engine is 100% software-rendered:
- Sprites (`.shp` files) are blitted to `GraphicBufferClass` RAM buffers
- Palette-based 8-bit rendering with `PaletteClass`
- No GPU API calls (no OpenGL, no DirectDraw 3D, no Direct3D)
- `Map.Render()` in the main loop draws the tactical view

### Remaster Rendering Bridge

**`DLLInterface.cpp`** (both games):
- `DLL_Draw_Intercept` — captures draw calls from the original engine. Instead of blitting to a buffer, it records sprite position, frame, palette, and flags into `DLLExportClass` data structures.
- `CNC_Get_Game_State()` — the C# client calls this to retrieve the captured render state.
- **`DLLInterface.h`** defines the render output structures:
  - `CNCObjectStruct` — position, type, shape, frame, cloak state, health, selection status
  - `CNCMapDataStruct` — map cell data
  - `DllObjectTypeEnum` — `INFANTRY, UNIT, AIRCRAFT, BUILDING, TERRAIN, ANIM, BULLET, OVERLAY, SMUDGE, VESSEL`, etc.

### No Shader Code

There is zero shader (GLSL / HLSL), GPU compute, or modern graphics API code in the open-source C++ release. All GPU rendering for the remaster is in the proprietary C# GlyphX layer.

---

## 10. Key Differences from Original 1996 Code

### 10.1 Glyphx_Queue_AI — The Critical Change

**The remaster completely bypasses the original networking code.**

**`REDALERT/DLLInterface.cpp`** and **`TIBERIANDAWN/DLLInterface.cpp`** (line 6029 in TD):

When `Session.Type == GAME_GLYPHX_MULTIPLAYER`, `CNC_Advance_Instance()` calls `Glyphx_Queue_AI()` instead of the original `Queue_AI()`:

```cpp
// Simplified Glyphx_Queue_AI():
// 1. Move OutList → DoList directly (no network)
while (OutList.Count) {
    OutList.First().IsExecuted = 0;
    if (!DoList.Add(OutList.First())) break;
    OutList.Next();
}
// 2. Execute events for all houses
for (each house) {
    for (each DoList entry) {
        if (Frame >= DoList[j].Frame) {
            DoList[j].Execute();
            DoList[j].IsExecuted = 1;
        }
    }
}
// 3. Clean DoList
```

This means:
- **No `Wait_For_Players()`** — no frame-sync blocking
- **No `Send_Packets()` / `Process_Receive_Packet()`** — no P2P networking
- **No `Generate_Timing_Event()`** — no dynamic MaxAhead adaptation
- **No CRC comparison** — desync detection is handled externally by GlyphX

The C++ DLL is effectively a **deterministic simulation engine** that the C# client drives frame-by-frame.

### 10.2 DLL as Simulation Engine

**`DLLExportClass` comment** (`REDALERT/DLLInterface.cpp`):
> *"Class to implement the interface, and contain additional game state required by the conversion from peer/peer to client/server"*

The remaster converts the architecture from **peer-to-peer** (original) to **client-server** (C# client = authority + renderer, C++ DLL = simulation worker).

### 10.3 Multiplayer Never Exits

**`CNC_Advance_Instance()`** (`REDALERT/DLLInterface.cpp` line 1893):
```cpp
// GAME_GLYPHX_MULTIPLAYER: always return true
// Don't respect GameActive. Game will end in multiplayer on win/loss
return true;
```

In the original, `GameActive = false` could stop the game loop. The remaster ignores this for multiplayer — the C# layer decides when the game ends.

### 10.4 Complete DLL API Surface

**`DLLInterfaceVersion.h`**: `CNC_DLL_API_VERSION = 0x102`

Exported C functions (all in `DLLInterface.cpp`):

| Function | Purpose |
|---|---|
| `CNC_Version` | Return DLL API version |
| `CNC_Init` | Initialize the engine |
| `CNC_Config` | Configure game settings |
| `CNC_Add_Mod_Path` | Register mod content directory |
| `CNC_Start_Instance_Variation` | Start a game (standard maps) |
| `CNC_Start_Custom_Instance` | Start a game (custom content) |
| `CNC_Advance_Instance` | Run one simulation frame |
| `CNC_Get_Game_State` | Retrieve render/UI state for the frame |
| `CNC_Get_Visible_Page` | Get legacy render buffer |
| `CNC_Handle_Input` | Forward mouse/keyboard input |
| `CNC_Handle_Structure_Request` | Place building command |
| `CNC_Handle_Unit_Request` | Unit command |
| `CNC_Handle_Sidebar_Request` | Sidebar click |
| `CNC_Handle_ControlGroup_Request` | Ctrl+number group |
| `CNC_Handle_Game_Request` | Game-level commands |
| `CNC_Handle_Game_Settings_Request` | Settings changes |
| `CNC_Handle_Human_Team_Wins` | Declare team victory |
| `CNC_Save_Load` | Save/load game state |
| `CNC_Set_Home_Cell` | Set camera home position |
| `CNC_Start_Mission_Timer` | Mission countdown |
| `CNC_Get_Start_Game_Info` | Initial game setup data |
| `CNC_Read_INI` | Parse INI configuration |

### 10.5 Multi-Player Per-House Processing

The DLL processes sidebar actions for **all multiplayer players** within a single `CNC_Advance_Instance()` call (iterating `Session.Players`). This is different from the original where each peer only processed their own sidebar.

### 10.6 Audio Changes

**`REDALERT/AUDIO.CPP`** (lines 783–811):
Original audio playback code is `#if 0`'d out. Speech is forwarded to the C# layer via `On_Speech()` callback. The C++ engine no longer plays audio directly.

### 10.7 Steve Tall (Petroglyph) Modifications

Many remaster changes are dated and attributed:
- `// 3/12/2019 10:52AM - ST` (earliest found, `TIBERIANDAWN/DLLInterface.cpp`)
- `// MBL 06.17.2019 KO` — Mark Lohman disabling audio code
- `// MBL 02.06.2020` — later MBL modifications

The DLL interface layer was developed at **Petroglyph Games** (founded by former Westwood developers), which handled the C++ engine work for the remaster.

---

## Summary: Architecture Comparison

| Aspect | Original (1996) | Remaster (2020) |
|---|---|---|
| **Network model** | Deterministic lockstep P2P | C# client-server (not in open source) |
| **Protocol** | UDP (Winsock) + IPX | Unknown (C# layer) |
| **Sync** | OutList → network → DoList | OutList → DoList directly (Glyphx_Queue_AI) |
| **Desync detection** | CRC per frame, compared in FRAMEINFO events | External to C++ DLL |
| **Server** | None (pure P2P, host = "master" for timing) | Unknown (C# layer) |
| **Replay** | Queue_Record/Queue_Playback (DoList serialization) | Preserved in C++ but unused by remaster |
| **Anti-cheat** | None (WChat heartbeat = anti-piracy only) | Unknown (C# layer) |
| **Threading** | Single-threaded game logic | Same — DLL is called synchronously |
| **Rendering** | Software (palette-based 8-bit blitting) | DLL_Draw_Intercept → C# → GPU |
| **Audio** | Direct WAV/AUD playback | Callback to C# layer |

---

## Relevance to Iron Curtain

| IC Design | Remastered Collection Evidence | Impact |
|---|---|---|
| **D006 — Pluggable networking** | Original has networking hardwired into Queue_AI_Multiplayer. Remaster proves the value of separating sim from net (Glyphx_Queue_AI) | Validates our trait-based approach |
| **D009 — Fixed-point math** | Original uses integer coordinates (Coord, PrimaryFacing) throughout. No floats in simulation. | Confirms historical precedent |
| **D010 — Snapshottable state** | CRC system hashes Infantry/Unit/Vessel/Building/House/Map. `SessionClass::Save()` serializes multiplayer state. | Our `snapshot()` mirrors this but goes further |
| **D012 — Order validation in sim** | **No order validation exists in original.** Orders execute unconditionally. | Major improvement opportunity |
| **D007 — Relay server** | No dedicated server in original (pure P2P). Host controls timing only. | Relay server is strictly superior |
| **D008 — Sub-tick timestamps** | Orders scheduled `MaxAhead` frames ahead — no sub-frame ordering | Sub-tick timestamps improve fairness |
| **D015 — Efficiency-first** | Single-threaded, zero-allocation lockstep. Game ran on 1995 hardware. | Validates our pyramid approach |
| **Replay system** | Simple DoList serialization — count + events per frame | Our replay system should be at least as capable |
