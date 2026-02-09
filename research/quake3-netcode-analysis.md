# Quake 3 (ioquake3) — Netcode Architecture Analysis

> Research for Iron Curtain. Concrete technical findings from source code analysis.
> Repo: [ioquake/ioq3](https://github.com/ioquake/ioq3)

---

## Table of Contents

1. [Overview](#overview)
2. [Snapshot-Based Networking & Delta Compression](#snapshot-based-networking--delta-compression)
3. [Variable-Length Delta Encoding & Huffman Compression](#variable-length-delta-encoding--huffman-compression)
4. [Client-Side Prediction & Misprediction Correction](#client-side-prediction--misprediction-correction)
5. [Bandwidth Management](#bandwidth-management)
6. [Anti-Cheat at the Protocol Level](#anti-cheat-at-the-protocol-level)
7. [Network Simulation & Testing](#network-simulation--testing)
8. [Demo / Replay System](#demo--replay-system)
9. [Comparative Analysis — Novel Techniques](#comparative-analysis--novel-techniques)
10. [Techniques Worth Adopting for Iron Curtain](#techniques-worth-adopting-for-iron-curtain)

---

## Overview

**Language:** C  
**Engine Model:** Client-server authoritative with client-side prediction  
**Transport:** UDP with custom reliability layer (`net_chan.c`)  
**Snapshot Rate:** Server-configurable (`sv_fps`, typically 20-40 Hz); per-client rate via `snaps` userinfo  
**Compression:** Two-layer pipeline — table-driven field-level delta encoding + static Huffman coding on the bitstream  
**Key source paths:** `code/qcommon/msg.c`, `code/qcommon/net_chan.c`, `code/qcommon/huffman.c`, `code/server/sv_snapshot.c`, `code/server/sv_net_chan.c`, `code/client/cl_parse.c`, `code/client/cl_net_chan.c`, `code/cgame/cg_predict.c`, `code/game/bg_pmove.c`

### Why Study This

Quake 3 (1999) established the canonical snapshot networking model that nearly every modern FPS derives from — server-authoritative state, client-side prediction with server reconciliation, delta-compressed snapshots, and Huffman-coded bitstreams. While Iron Curtain uses lockstep (not client-server), Q3's delta encoding pipeline, bandwidth management, and anti-tamper techniques are directly relevant. The table-driven field-level delta system is one of the most elegant compression designs in game networking, and the layered compression approach (delta → Huffman) is applicable to IC's snapshot serialization for replays, save games, and desync debugging.

---

## Snapshot-Based Networking & Delta Compression

### Server-Side Snapshot Construction

The server builds a per-client snapshot every frame via `SV_BuildClientSnapshot()` in `sv_snapshot.c`. Three key stages:

1. **PVS (Potentially Visible Set) Culling:** The server determines which entities each client can see using BSP cluster visibility, area connectivity (`CM_AreasConnected`), and recursive portal entity expansion. Entities outside the client's PVS are never sent.

2. **Entity Collection & Sorting:** Visible entities are collected into a `clientSnapshot_t` structure and sorted by entity number via `qsort`. This sort order is critical — it enables the dual-cursor delta merge algorithm.

3. **Delta Transmission:** `SV_WriteSnapshotToClient()` selects the client's last acknowledged snapshot as the delta base (from `client->frames[deltaMessage & PACKET_MASK]`). If the delta base is unavailable (too old, client not yet active, or first snapshot), it falls back to a non-delta (full) snapshot.

```c
// sv_snapshot.c — Packet format (from header comment):
// 4 bytes   sequence number
// <reliable commands>
// 1 byte    svc_snapshot
// 4 bytes   serverTime
// 1 byte    deltaNum (0 = non-delta, else offset from current)
// 1 byte    snapFlags (SNAPFLAG_RATE_DELAYED, SNAPFLAG_NOT_ACTIVE)
// 1 byte    areaBytes
// <areabits>
// <delta playerstate>
// <delta packetentities>
```

### Dual-Cursor Entity Delta Merge

`SV_EmitPacketEntities()` implements the most important algorithm in Q3 networking — a dual-cursor sorted merge walk that compares old and new entity lists:

```c
// sv_snapshot.c:100-145 — Dual-cursor merge (simplified)
oldnum = oldent ? oldent->number : 99999;
newnum = newent->number;

while (newnum != MAX_GENTITIES - 1) {
    if (newnum == oldnum) {
        // Entity exists in both frames → delta encode changes
        MSG_WriteDeltaEntity(msg, oldent, newent, qfalse);
        // advance both cursors
    } else if (newnum < oldnum) {
        // New entity (not in old frame) → delta from baseline
        MSG_WriteDeltaEntity(msg, &sv.svEntities[newnum].baseline, newent, qtrue);
        // advance new cursor only
    } else { // oldnum < newnum
        // Entity removed → write remove marker
        MSG_WriteDeltaEntity(msg, oldent, NULL, qtrue);
        // advance old cursor only
    }
}
// Terminate with entity number MAX_GENTITIES - 1
```

**Key insight: Entity baselines.** When an entity first appears in a client's view, Q3 doesn't send it as a blind full-state dump. Instead, each entity has a stored "baseline" (`svEntity_t.baseline`) that was established at map start. The first-sight delta is encoded against this baseline, which typically has many fields already correct (especially for static entities), dramatically reducing the initial transmission cost.

**Circular buffer for snapshots:** Both client and server use `PACKET_BACKUP` (32) circular buffer slots for snapshot history:

```c
// server.h
#define PACKET_BACKUP   32
#define PACKET_MASK     31

typedef struct clientSnapshot_s {
    int             areabytes;
    byte            areabits[MAX_MAP_AREA_BYTES];
    playerState_t   ps;
    int             num_entities;
    int             first_entity;    // index into circular svs.snapshotEntities[]
    int             messageSent;     // svs.time when sent
    int             messageAcked;    // svs.time when acked
    int             messageSize;     // for rate estimation
} clientSnapshot_t;
```

**Iron Curtain relevance:** IC doesn't use client-server snapshots, but the dual-cursor sorted merge algorithm is directly applicable to delta-encoding sim state for replays and save games. The baseline concept maps to IC's initial game state — delta-encode each frame's state against the initial state for first-frame replay compression.

---

## Variable-Length Delta Encoding & Huffman Compression

### Table-Driven Field-Level Delta

Q3's delta encoding system in `msg.c` is table-driven: a `netField_t` array defines every field of `entityState_t` and `playerState_t` with metadata for encoding:

```c
// msg.c — Field definition structure
typedef struct {
    char    *name;
    int     offset;     // byte offset into the struct
    int     bits;       // 0 = float, >0 = integer of N bits
} netField_t;

// Entity state field table (50+ fields, sorted by change frequency)
netField_t entityStateFields[] = {
    { NETF(pos.trTime),      32 },
    { NETF(pos.trBase[0]),    0 },  // 0 bits = float
    { NETF(pos.trBase[1]),    0 },
    { NETF(pos.trDelta[0]),   0 },
    { NETF(pos.trDelta[1]),   0 },
    { NETF(pos.trBase[2]),    0 },
    { NETF(apos.trBase[1]),   0 },
    { NETF(pos.trDelta[2]),   0 },
    { NETF(apos.trBase[0]),   0 },
    { NETF(event),            10 },
    // ... ~40 more fields
};
```

**Critical design decision: fields are sorted by change frequency**, not by struct layout. This means the "index of last changed field" byte (written first) is minimized — if only the commonly-changing fields (position, time) differ, the index is small and fewer per-field bits need to be examined.

### Three-Tier Float Encoding

`MSG_WriteDeltaEntity()` uses a three-tier encoding for float fields that is unique among the games we've studied:

```c
// msg.c:790-830 — Float encoding tiers
#define FLOAT_INT_BITS  13
#define FLOAT_INT_BIAS  (1 << (FLOAT_INT_BITS - 1))  // 4096

if (*toF == 0.0f) {
    // Tier 1: Zero float — 2 bits total (changed=1, zero=1)
    MSG_WriteBits(msg, 0, 1);  // not full float
    MSG_WriteBits(msg, 0, 1);  // is zero
} else {
    int trunc = (int)*toF;
    if (trunc == *toF && trunc + FLOAT_INT_BIAS >= 0
        && trunc + FLOAT_INT_BIAS < (1 << FLOAT_INT_BITS)) {
        // Tier 2: Small integer — 15 bits total (changed=1, notZero=1, isSmallInt=1, 13-bit biased value)
        MSG_WriteBits(msg, 0, 1);  // not full float
        MSG_WriteBits(msg, 1, 1);  // not zero
        MSG_WriteBits(msg, trunc + FLOAT_INT_BIAS, FLOAT_INT_BITS);
    } else {
        // Tier 3: Full float — 33 bits total (changed=1, isFullFloat=1, 32-bit raw)
        MSG_WriteBits(msg, 1, 1);  // is full float
        MSG_WriteBits(msg, *toF, 32);
    }
}
```

**Why this matters:** In practice, most position/velocity deltas are small integers (e.g., clipped by `trap_SnapVector`). The biased-int encoding saves 17-18 bits per float field vs. always sending 32 bits. For a typical entity with 3 position + 3 velocity floats all changing, this saves ~105 bits per entity per snapshot.

### Integer Field Optimization

Integer fields also get special zero handling:

```c
// msg.c:835-855 — Integer encoding
if (*toF == 0) {
    MSG_WriteBits(msg, 0, 1);  // is zero — 1 bit total
} else {
    MSG_WriteBits(msg, 1, 1);  // not zero
    MSG_WriteBits(msg, *toF, bits);  // full value
}
```

### Change Count Byte

Before writing per-field deltas, Q3 writes a single byte — the index of the last changed field. The decoder reads fields 0 through this index checking change bits, and all fields above it are implicitly unchanged. This is a simple but effective run-length shortcut.

### Compile-Time Struct Validation

Q3 enforces that every field in `entityState_t` is exactly 32 bits, verified at compile time:

```c
// msg.c:742
if (numFields + 1 != sizeof(*from) / 4) {
    Com_Error(ERR_DROP, "...");
}
```

This means every field (ints, floats, enums) occupies 4 bytes, allowing the delta codec to treat the struct as a flat array of 32-bit values and iterate without type-specific logic.

### Static Huffman Coding Layer

On top of the delta encoding, Q3 applies **static Huffman coding** to the bitstream. Unlike adaptive Huffman (which DDraceNetwork uses for OOB messages), Q3 uses a pre-computed frequency table:

```c
// msg.c:1396-1670 — Static frequency table (256 entries)
int msg_hData[256] = {
    250315,  // byte 0x00 (most common — null/zero bytes)
    41193,   // byte 0x01
    6292,    // byte 0x02
    // ... 253 more entries
    13504,   // byte 0xFF
};

// Initialization builds an adaptive Huffman tree seeded with these frequencies
void MSG_initHuffman(void) {
    Huff_Init(&msgHuff);
    for (i = 0; i < 256; i++) {
        for (j = 0; j < msg_hData[i]; j++) {
            Huff_addRef(&msgHuff.compressor, (byte)i);
            Huff_addRef(&msgHuff.decompressor, (byte)i);
        }
    }
}
```

The tree is "adaptive" in implementation (`huffman.c` uses Sayood's Adaptive Huffman algorithm with weight-based doubly-linked list reordering), but **seeded with a fixed frequency table derived from real game traffic analysis**. It is initialized once at startup and reused for all packets — making it effectively static. The frequencies represent typical Q3 network traffic byte distributions (zeros are overwhelmingly common in delta-encoded data).

**Dual-mode I/O:** The `MSG_WriteBits()` / `MSG_ReadBits()` functions operate in two modes:
- **Bitstream mode (default):** Each byte passes through Huffman coding via `Huff_offsetTransmit`/`Huff_offsetReceive`. Sub-byte bit fields (1-7 bits) are written directly, then aligned bytes go through Huffman.
- **OOB mode:** Raw byte-aligned writes bypass Huffman entirely. Used for connectionless packets (server queries, challenges).

```c
// msg.c:142-165 — MSG_WriteBits (bitstream mode)
if (bits & 7) {
    int nbits = bits & 7;
    for (i = 0; i < nbits; i++) {
        Huff_putBit((value & 1), msg->data, &msg->bit);
        value >>= 1;
    }
    bits -= nbits;
}
if (bits) {
    for (i = 0; i < bits; i += 8) {
        Huff_offsetTransmit(&msgHuff.compressor, (value & 0xff),
                            msg->data, &msg->bit, msg->maxsize << 3);
        value >>= 8;
    }
}
```

**Compression for OOB messages:** Connectionless OOB messages (server browser queries, etc.) use a separate per-message adaptive Huffman via `Huff_Compress()` / `Huff_Decompress()`. This builds a fresh tree per message, writes the uncompressed size as a 2-byte header, then Huffman-encodes the payload.

**Iron Curtain relevance:** The two-layer compression pipeline (semantic delta → statistical coding) is the key takeaway. IC should:
1. Apply delta encoding at the field level when serializing snapshots for replays/saves
2. Apply a static Huffman or other entropy coder on top of the delta-encoded bitstream
3. Profile real IC network/replay data to build an optimal frequency table

---

## Client-Side Prediction & Misprediction Correction

### Shared Physics Code (bg_pmove.c)

Q3's prediction system is enabled by a shared physics module — `bg_pmove.c` — compiled into both server and client. The `Pmove()` function takes a `pmove_t` (containing a `playerState_t` and a `usercmd_t`) and produces a new `playerState_t`:

```c
// bg_pmove.c:2020-2043 — Pmove entry point
void Pmove(pmove_t *pmove) {
    int finalTime = pmove->cmd.serverTime;

    // clamp move duration to 1000ms max
    if (finalTime > pmove->ps->commandTime + 1000) {
        pmove->ps->commandTime = finalTime - 1000;
    }

    // chop the move up to prevent framerate-dependent behavior
    while (pmove->ps->commandTime != finalTime) {
        int msec = finalTime - pmove->ps->commandTime;
        if (pmove->pmove_fixed) {
            if (msec > pmove_msec) msec = pmove_msec;
        } else {
            if (msec > 66) msec = 66;
        }
        pmove->cmd.serverTime = pmove->ps->commandTime + msec;
        PmoveLocal(pmove);
    }
}
```

**Fixed timestep subdivision:** `Pmove` chops moves into sub-frames of `pmove_msec` (8-33ms, configurable). This ensures physics results are identical regardless of client framerate — a form of determinism within the prediction window.

### Prediction Loop (cg_predict.c)

`CG_PredictPlayerState()` is called every client frame. It:

1. Starts from the most recent server-acknowledged playerstate (`cg.snap->ps`)
2. Replays all unacknowledged user commands (from `CMD_BACKUP` circular buffer)
3. Produces `cg.predictedPlayerState` — the locally predicted state

```c
// cg_predict.c:436-625 — Prediction loop (simplified)
void CG_PredictPlayerState(void) {
    // demo playback: interpolate, don't predict
    if (cg.demoPlayback || (cg.snap->ps.pm_flags & PMF_FOLLOW)) {
        CG_InterpolatePlayerState(qfalse);
        return;
    }

    // no prediction mode: just interpolate
    if (cg_nopredict.integer || cg_synchronousClients.integer) {
        CG_InterpolatePlayerState(qtrue);
        return;
    }

    // Start from server state
    cg.predictedPlayerState = cg.snap->ps;
    cg.physicsTime = cg.snap->serverTime;

    // Replay all unacknowledged commands
    current = trap_GetCurrentCmdNumber();
    for (cmdNum = current - CMD_BACKUP + 1; cmdNum <= current; cmdNum++) {
        trap_GetUserCmd(cmdNum, &cg_pmove.cmd);
        
        if (cg_pmove.cmd.serverTime <= cg.predictedPlayerState.commandTime)
            continue;  // already applied by server

        Pmove(&cg_pmove);
    }
}
```

### Misprediction Error Decay

When the predicted state doesn't match the server's state, Q3 uses **exponential error decay** rather than snapping:

```c
// cg_predict.c:520-560 — Error detection and decay
if (cg.predictedPlayerState.commandTime == oldPlayerState.commandTime) {
    VectorSubtract(oldPlayerState.origin, adjusted, delta);
    float len = VectorLength(delta);

    if (len > 0.1) {
        if (cg_errorDecay.integer) {
            int t = cg.time - cg.predictedErrorTime;
            float f = (cg_errorDecay.value - t) / cg_errorDecay.value;
            if (f < 0) f = 0;
            if (f > 0 && cg_showmiss.integer)
                CG_Printf("Double prediction decay: %f\n", f);
            VectorScale(cg.predictedError, f, cg.predictedError);
        } else {
            VectorClear(cg.predictedError);
        }
        VectorAdd(delta, cg.predictedError, cg.predictedError);
        cg.predictedErrorTime = cg.oldTime;
    }
}
```

The `cg.predictedError` vector is added to the render position, decaying over `cg_errorDecay` milliseconds. This produces smooth correction without visible teleporting.

### Predictable Events System

Q3 distinguishes **predictable events** (jump sounds, item pickups) from **non-predictable events** (damage taken, powerup expiry). Predictable events are generated during local `Pmove()` and compared against the server's event sequence:

```c
// cg_playerstate.c:229-257 — Predictable event reconciliation
for (i = ps->eventSequence - MAX_PS_EVENTS; i < ps->eventSequence; i++) {
    if (i >= ops->eventSequence
        || (i > ops->eventSequence - MAX_PS_EVENTS
            && ps->events[i & (MAX_PS_EVENTS-1)] != ops->events[i & (MAX_PS_EVENTS-1)])) {
        // New event or server corrected a predicted event
        event = ps->events[i & (MAX_PS_EVENTS-1)];
        CG_EntityEvent(cent, cent->lerpOrigin);
        cg.predictableEvents[i & (MAX_PREDICTED_EVENTS-1)] = event;
    }
}
```

**Iron Curtain relevance:** While IC uses lockstep and doesn't need client-side prediction, the error decay approach is useful for visual smoothing when network jitter causes slight timing variations. The predictable events pattern maps to IC's order validation — deterministic validation within the sim means events are "predictable" in that all clients agree.

---

## Bandwidth Management

### Per-Client Rate Control

Q3 implements rate-based bandwidth management per-client via `SV_RateMsec()`:

```c
// sv_client.c — Rate calculation
int SV_RateMsec(client_t *client, int messageSize) {
    int rate = client->rate;
    int rateMsec;

    // Account for UDP/IP header overhead
    int headerSize = (client->netchan.remoteAddress.type == NA_IP6) ? 48 : 28;
    messageSize += headerSize;

    rateMsec = messageSize * 1000 / (rate * com_timescale->value);
    return rateMsec;
}
```

The server tracks `client->nextSnapshotTime` and won't send another snapshot until `rateMsec` has elapsed since the last one. When a client is rate-limited, the snapshot includes `SNAPFLAG_RATE_DELAYED` so the client knows it's missing updates due to bandwidth.

### Snapshot Rate Clamping

Clients specify their desired snapshot rate via the `snaps` userinfo key, clamped to `[1, sv_fps]`:

```c
// sv_client.c — SV_UserinfoChanged
val = Info_ValueForKey(cl->userinfo, "snaps");
if (strlen(val)) {
    i = atoi(val);
    if (i < 1) i = 1;
    else if (i > sv_fps->integer) i = sv_fps->integer;
    cl->snapshotMsec = 1000 / i;
}
```

### Fragment Deduplication Guard

The server avoids sending a new snapshot while fragments from the previous one are still pending:

```c
// sv_snapshot.c — SV_SendClientSnapshot
if (client->netchan.unsentFragments || client->netchan_start_queue) {
    client->rateDelayed = qtrue;
    return;
}
```

This prevents the delta base from becoming invalid — if a fragmented snapshot is partially sent and a new one starts, the client's acknowledged delta base would be from a message it never fully received.

### Packet Fragmentation

The `net_chan.c` layer handles fragmentation for messages exceeding `FRAGMENT_SIZE` (1300 bytes, derived from `MAX_PACKETLEN` 1400 minus 100 bytes overhead):

```c
// net_chan.c — Constants
#define MAX_PACKETLEN   1400
#define FRAGMENT_SIZE   (MAX_PACKETLEN - 100)  // 1300 bytes
#define PACKET_HEADER   10

// Fragment header format:
// 4 bytes   sequence | FRAGMENT_BIT
// 2 bytes   qport (client only)
// 4 bytes   checksum
// 2 bytes   fragment start offset
// 2 bytes   fragment length
```

Fragment reassembly is strictly sequential — out-of-order fragments are dropped and the entire message must be retransmitted. The last fragment is detected when `fragmentStart == unsentLength` and `fragmentLength != FRAGMENT_SIZE`.

**Iron Curtain relevance:** IC's relay server design should implement similar fragment-aware rate pacing. The guard against sending new snapshots while fragments are pending is especially important — in IC's context, sending a new tick's orders while the previous tick's orders are still fragmenting would corrupt the delta chain for replay compression.

---

## Anti-Cheat at the Protocol Level

### XOR Stream Cipher (Legacy Protocol)

Q3 uses a simple but effective XOR stream cipher to prevent trivial packet inspection and replay:

```c
// sv_net_chan.c — SV_Netchan_Encode (simplified)
void SV_Netchan_Encode(client_t *client, msg_t *msg) {
    int serverId = cycled_serverId;
    int key = client->challenge ^ serverId;
    
    // Use the last acknowledged reliable command as additional key material
    string = client->reliableCommands[client->reliableAcknowledge & (MAX_RELIABLE_COMMANDS - 1)];
    
    // XOR each byte: key ^ (reliable_command_string_byte << (i & 1))
    for (i = SV_ENCODE_START; i < msg->cursize; i++) {
        if (!string[index]) index = 0;
        if (string[index] > 127 || string[index] == '%') {
            key ^= '.' << (i & 1);
        } else {
            key ^= string[index] << (i & 1);
        }
        index++;
        *(msg->data + i) ^= key;
    }
}
```

**Key derivation components:**
- `client->challenge`: Established during connection handshake, unique per session
- `serverId` (outgoing sequence): Changes every packet
- Last reliable command string: Changes as game events occur

This means the XOR key stream is different for every packet and changes mid-stream based on game-specific content (reliable commands), making static analysis impractical.

### Challenge-Based UDP Spoofing Protection

Every packet includes a checksum derived from the connection challenge and sequence number:

```c
// net_chan.c — Anti-spoofing checksum
#define NETCHAN_GENCHECKSUM(challenge, sequence) \
    ((challenge) ^ ((sequence) * (challenge)))
```

The receiver verifies this checksum, rejecting packets from attackers who don't know the challenge value. Since the challenge is established during the encrypted connection handshake, an attacker cannot spoof packets without first observing the connection setup.

### Pure Server File Verification (sv_pure)

When `sv_pure` is enabled, the server enforces that clients load only approved PK3 files:

1. Server sends `sv_paks` (checksums of all loaded PK3s) and `sv_pakNames` to clients in `systemInfo`
2. Client sends back `cp` (checksum proof) command with checksums of its loaded PK3s
3. Server's `SV_VerifyPaks_f()` validates:
   - `cgame.qvm` and `ui.qvm` checksums match server's expectations
   - Client has no additional PK3s not present on server
   - XOR'd checksum chain matches (prevents simple replay of another client's proof)

```c
// sv_client.c:1342-1360 — Checksum chain verification
nChkSum1 = sv.checksumFeed;  // Random seed per map load
for (i = 0; i < nClientPaks; i++) {
    nChkSum1 ^= nClientChkSum[i];
}
nChkSum1 ^= nClientPaks;  // Encode count into final hash
if (nChkSum1 != nClientChkSum[nClientPaks]) {
    bGood = qfalse;  // Client tampered with checksums
}
```

The `checksumFeed` is a random value generated at map load (`rand() << 16 ^ rand() ^ Com_Milliseconds()`), preventing pre-computed checksum tables.

### Keyed User Command Delta Encoding

User commands (movement inputs) are delta-encoded with an XOR key derived from the server time, making it harder to inject forged commands:

```c
// msg.c — MSG_WriteDeltaUsercmdKey
void MSG_WriteDeltaUsercmdKey(msg_t *msg, int key, usercmd_t *from, usercmd_t *to) {
    // Delta encode serverTime
    if (to->serverTime - from->serverTime < 256) {
        MSG_WriteBits(msg, 1, 1);  // 8-bit delta
        MSG_WriteBits(msg, to->serverTime - from->serverTime, 8);
    } else {
        MSG_WriteBits(msg, 0, 1);  // 32-bit full
        MSG_WriteBits(msg, to->serverTime, 32);
    }

    // XOR key is serverTime, changed per-cmd
    key ^= to->serverTime;

    // Angles are XOR'd with the key
    MSG_WriteBits(msg, (to->angles[0] - from->angles[0]) ^ (key & 0xFFFF), 16);
    // ... more fields
}
```

**Iron Curtain relevance:** IC already plans Ed25519 per-order signing (far superior to XOR), but the pure server checksum chain concept maps directly to IC's mod validation — ensuring clients in a multiplayer game are running identical mod files. The `checksumFeed` randomization per map load is a simple anti-replay technique worth adopting.

---

## Network Simulation & Testing

### Built-In Packet Delay Simulation

Q3 includes packet delay simulation via `cl_packetdelay` and `sv_packetdelay` cvars, implemented with a timestamp-queued send buffer:

```c
// net_chan.c — Delayed packet queue
typedef struct packetQueue_s {
    struct packetQueue_s *next;
    int length;
    byte *data;
    netadr_t to;
    int release;  // timestamp when packet should actually be sent
} packetQueue_t;

void NET_QueuePacket(int length, const void *data, netadr_t to, int offset) {
    packetQueue_t *new = S_Malloc(sizeof(packetQueue_t));
    new->data = S_Malloc(length);
    Com_Memcpy(new->data, data, length);
    new->length = length;
    new->to = to;
    new->release = Sys_Milliseconds() + (int)((float)offset / com_timescale->value);
    // append to queue
}

// In NET_FlushPacketQueue(), packets are sent only when Sys_Milliseconds() >= release
```

### Diagnostic Cvars

Q3 provides extensive network debugging tools:

| Cvar               | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `cg_showmiss`      | Prints prediction misses and teleport events           |
| `cl_showTimeDelta` | Displays time synchronization delta values             |
| `cl_shownet`       | Shows incoming packet breakdown (size, message types)  |
| `cl_showSend`      | Shows outgoing packet details                          |
| `cl_timegraph`     | Visual graph of frame times                            |
| `cl_nodelta`       | Disables delta compression (forces full snapshots)     |
| `sv_showloss`      | Server-side packet loss reporting                      |
| `sv_padPackets`    | Artificially inflate packet size for bandwidth testing |

### Visual Lagometer

The cgame draws a real-time lagometer (`cg_draw.c`) showing two data streams:
- **Upper bar:** Interpolation/extrapolation offset per rendered frame (green = interpolating, yellow = extrapolating)
- **Lower bar:** Ping and dropped packet history per snapshot

```c
// cg_draw.c — CG_AddLagometerFrameInfo / CG_AddLagometerSnapshotInfo
// Each frame logs: offset = cg.time - cg.latestSnapshotTime
// Each snapshot logs: ping, snapshot number gaps (drops)
```

**Iron Curtain relevance:** IC should implement equivalent diagnostics, especially for lockstep debugging:
- `sv_padPackets` equivalent for relay server bandwidth testing
- `cl_packetdelay` / `sv_packetdelay` for testing lockstep behavior under latency
- A lagometer-style display showing tick timing, order receive timing, and lockstep synchronization health

---

## Demo / Replay System

### Recording Architecture

Q3's demo system records server-to-client network messages directly to disk:

```c
// cl_main.c:613-650 — CL_WriteDemoMessage
void CL_WriteDemoMessage(msg_t *msg, int headerBytes) {
    int len, swlen;

    // Write server message sequence number
    len = clc.serverMessageSequence;
    swlen = LittleLong(len);
    FS_Write(&swlen, 4, clc.demofile);

    // Write message length (excluding header)
    len = msg->cursize - headerBytes;
    swlen = LittleLong(len);
    FS_Write(&swlen, 4, clc.demofile);

    // Write message data (excluding header)
    FS_Write(msg->data + headerBytes, len, clc.demofile);
}
```

**Demo file format:**
```
[4 bytes: server sequence] [4 bytes: message length] [message data]
[4 bytes: server sequence] [4 bytes: message length] [message data]
...
[4 bytes: -1] [4 bytes: -1]  // EOF marker
```

### Bootstrap Recording

When recording starts, `CL_Record_f()` first writes a synthetic gamestate message containing:
- All configstrings
- All entity baselines
- The checksum feed

This allows the demo to be played back independently without needing the original connection.

```c
// cl_main.c:770-810 — First demo message (gamestate)
MSG_WriteByte(&buf, svc_gamestate);
MSG_WriteLong(&buf, clc.serverCommandSequence);

// Dump all configstrings
for (i = 0; i < MAX_CONFIGSTRINGS; i++) {
    if (cl.gameState.stringOffsets[i]) {
        MSG_WriteByte(&buf, svc_configstring);
        MSG_WriteShort(&buf, i);
        MSG_WriteBigString(&buf, cl.gameState.stringData + cl.gameState.stringOffsets[i]);
    }
}

// Dump all baselines
for (i = 0; i < MAX_GENTITIES; i++) {
    ent = &cl.entityBaselines[i];
    if (!ent->number) continue;
    MSG_WriteByte(&buf, svc_baseline);
    MSG_WriteDeltaEntity(&buf, &nullstate, ent, qtrue);
}
```

### Delta Wait Optimization

Recording doesn't start capturing network messages until a non-delta (full) snapshot arrives:

```c
// cl_main.c:767
clc.demowaiting = qtrue;  // don't save until non-delta message

// cl_parse.c:224 — Clear on non-delta snapshot
if (!deltaNum) {
    clc.demowaiting = qfalse;  // we can start recording now
}
```

This ensures the demo file starts with a valid complete state, not a delta that references an unavailable earlier snapshot.

### Playback

Playback uses `CL_ReadDemoMessage()`, which reads messages from the file and feeds them through `CL_ParseServerMessage()` — the same parser used for live network messages:

```c
// cl_main.c:935-980 — Demo playback
void CL_ReadDemoMessage(void) {
    msg_t buf;
    byte bufData[MAX_MSGLEN];

    // Read sequence number
    FS_Read(&s, 4, clc.demofile);
    clc.serverMessageSequence = LittleLong(s);

    // Read message length
    FS_Read(&buf.cursize, 4, clc.demofile);
    buf.cursize = LittleLong(buf.cursize);
    if (buf.cursize == -1) { CL_DemoCompleted(); return; }

    // Read message data
    FS_Read(buf.data, buf.cursize, clc.demofile);

    // Parse through normal network message handler
    clc.lastPacketTime = cls.realtime;
    CL_ParseServerMessage(&buf);
}
```

### Timed Demo Benchmarking

Q3 includes a `timedemo` mode that plays a demo as fast as possible, recording per-frame duration statistics (min/max/mean/stddev):

```c
// cl_main.c:873-920 — Frame duration tracking
clc.timeDemoDurations[(clc.timeDemoFrames - 1) % MAX_TIMEDEMO_DURATIONS] = frameDuration;

// Result: "N frames M.Ms N.N fps min/avg/max/stddev ms"
Com_sprintf(buffer, sizeof(buffer),
    "%i frames %3.1f seconds %3.1f fps %d.0/%.1f/%d.0/%.1f ms",
    clc.timeDemoFrames, time/1000.0,
    clc.timeDemoFrames * 1000.0 / time,
    clc.timeDemoMinDuration, time / (float)clc.timeDemoFrames,
    clc.timeDemoMaxDuration, CL_DemoFrameDurationSDev());
```

### VoIP in Demos

ioquake3 extended the demo format to include VoIP data by injecting synthetic server messages containing VoIP frames:

```c
// cl_input.c:808-835 — Inject VoIP into demo recording
if (clc.demorecording && !clc.demowaiting) {
    msg_t fakemsg;
    byte fakedata[MAX_MSGLEN];
    MSG_Init(&fakemsg, fakedata, sizeof(fakedata));
    MSG_Bitstream(&fakemsg);
    MSG_WriteLong(&fakemsg, clc.reliableAcknowledge);
    MSG_WriteByte(&fakemsg, svc_voipOpus);
    MSG_WriteShort(&fakemsg, clc.clientNum);
    // ... write VoIP frame data
    MSG_WriteByte(&fakemsg, svc_EOF);
    CL_WriteDemoMessage(&fakemsg, 0);
}
```

**Iron Curtain relevance:** IC's replay format should adopt the same approach of recording the raw order stream rather than full snapshots. The bootstrap gamestate concept maps to IC's initial sim state. The key differences: IC records `TickOrders` (inputs) not snapshots (outputs), and IC's deterministic replay doesn't need delta base management — just replay the orders. However, the delta-wait pattern is relevant: start recording only when a clean sync point exists.

---

## Comparative Analysis — Novel Techniques

Compared to previously analyzed games (Spring Engine, 0 A.D., Warzone 2100, Veloren, Hypersomnia, OpenBW, DDraceNetwork), Q3 introduces several techniques not seen in any of them:

### 1. Table-Driven Field-Level Delta with Frequency Sorting

**Unique to Q3.** No other analyzed game uses a metadata table that both defines the encoding schema AND orders fields by change frequency. DDraceNetwork has snapshot delta compression, but uses struct-level diffing (byte-by-byte XOR). Spring Engine deltas are per-message, not per-field. Q3's approach minimizes the "last changed field index" byte, saving bits proportional to how well the frequency sorting matches actual game traffic.

### 2. Three-Tier Float Encoding (Zero / Biased-Int / Full-Float)

**Unique to Q3.** No other analyzed game distinguishes between zero floats, small-integer floats, and full-precision floats. This is especially effective because `trap_SnapVector()` snaps velocities to integers, making the biased-int path hit frequently. The 13-bit biased encoding saves 17 bits per field vs. full float — for 6 position/velocity components, that's ~100 bits per entity.

### 3. Entity Baselines for First-Sight Delta Compression

**Unique to Q3.** Other games either send full entity state on first sight or delta from zero/null. Q3 establishes baselines at map load — initial entity state that serves as a known reference point. When an entity first enters a client's PVS, the delta is computed against this baseline, which is typically very close to the current state for static entities (doors, items, triggers), saving significant bandwidth.

### 4. Layered Compression: Semantic Delta + Statistical Coding

**Unique combination.** DDraceNetwork uses 3-stage compression (delta → Huffman → zlib), but Q3's approach is more tightly integrated: the Huffman coding is applied at the bit level during delta encoding, not as a separate post-processing stage. This means the Huffman tree is optimized for the byte distribution of delta-encoded game data, not raw data.

### 5. XOR Stream Cipher Using Reliable Command Content as Key Material

**Unique approach.** Warzone 2100 uses Ed25519+XChaCha20 (modern crypto), DDraceNetwork has no packet encryption, and other analyzed games have no transport-level encryption. Q3's XOR cipher is weak by modern standards but clever in using game-specific content (reliable command strings) as part of the key stream, making the cipher contextually dependent on game state.

### 6. PVS-Based Per-Client Server-Side Entity Culling

**Partially shared with Veloren** (which does region-based culling), but Q3's BSP-based PVS with portal recursion is more sophisticated — it uses pre-computed visibility data from the map compiler, area connectivity checks, and recursive portal entity expansion to determine per-client visibility. Other analyzed games either don't cull (lockstep games send everything) or use simpler distance-based checks.

### 7. Visual Lagometer as Built-In Diagnostic

**Unique as built-in.** While other games have network statistics, Q3's lagometer is a real-time visual display rendered directly in the game world, showing both interpolation state and ping history. Most analyzed games either have text-only stats or no live diagnostics.

### 8. Adaptive Time Synchronization with Three Drift Modes

**More sophisticated than equivalents.** Q3's `CL_AdjustTimeDelta()` uses three modes:
- Hard reset for >500ms drift
- Fast adjust (halve the delta) for >100ms drift
- Slow drift (±1-2ms per snapshot) for small corrections

DDraceNetwork and other analyzed games use simpler timestamp-based sync. Q3's multi-mode approach gives faster recovery from large disruptions while maintaining smooth behavior during normal play.

---

## Techniques Worth Adopting for Iron Curtain

### High Priority

1. **Table-driven field-level delta encoding for replay/snapshot serialization.** Define IC component fields in a metadata table with `{name, offset, bits}`. Sort by change frequency (profiled from real gameplay). Use for replay compression, save game delta encoding, and desync diagnostic dumps. This directly reduces replay file sizes and snapshot comparison bandwidth.

2. **Three-tier numeric encoding.** For IC's fixed-point math (`i32`/`i64`), implement tier-1 zero detection (1 bit), tier-2 small-delta encoding (configurable bit width), and tier-3 full value. Since IC uses integers for determinism, the float-specific tier-2 (biased int) becomes a "small delta" tier where most per-tick changes fit in 8-12 bits rather than 32.

3. **Static Huffman coding layer.** Profile real IC network/replay data to build an optimal byte frequency table. Apply Huffman coding on top of delta-encoded data. Use separate frequency tables for different data streams (orders vs. snapshots vs. desync dumps).

4. **Packet delay simulation (`cl_packetdelay` / `sv_packetdelay` equivalent).** Essential for testing lockstep behavior under simulated latency. Implement in `ra-net` as a configurable delay queue in the `NetworkModel` trait implementations.

### Medium Priority

5. **Entity baselines for snapshot serialization.** When writing replays, store the initial sim state as a "baseline." Delta-encode subsequent snapshots against it. This maps naturally to IC's `snapshot()` / `restore()` — the first snapshot is the baseline.

6. **Dual-cursor sorted merge for entity diffing.** Use for desync debugging — when two clients produce different state hashes, sort their entity lists by ID and walk them with the dual-cursor algorithm to identify exactly which entities differ and in which fields.

7. **Lagometer-style network diagnostic.** Build a real-time visual display for lockstep health: tick timing, order receive timing, latency to each player, hash match confirmations. Render as an overlay widget in `ra-ui`.

8. **Checksum chain for mod file validation.** When connecting to a multiplayer game, exchange PK3/YAML file checksums with a random per-session feed XOR'd into the chain. Prevents clients from running modified rule files in ranked games.

### Low Priority

9. **Demo bootstrap pattern.** When starting replay recording, first write a complete sim state before recording the order stream. This allows seeking to arbitrary points by restoring the state + replaying orders from there.

10. **Fragment-aware rate pacing.** The relay server should not send a new tick's order batch while the previous batch's fragments are still in flight. Track fragment acknowledgment and pace accordingly.
