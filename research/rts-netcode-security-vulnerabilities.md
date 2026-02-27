# RTS Netcode Security Vulnerabilities

> Research document for Iron Curtain — comprehensive security vulnerability analysis.
> Sources: C&C Generals/Zero Hour GPL source code, OpenRA issue tracker, academic literature, CVE databases.

## Executive Summary

No formal CVEs exist for C&C Generals/Zero Hour networking. However, source code analysis reveals **12+ exploitable vulnerability classes** across the GameNetwork codebase, ranging from trivially exploitable buffer overflows to architectural weaknesses inherent to lockstep RTS networking. The codebase reflects 2003-era security practices: no bounds checking on receive-side parsing, XOR "encryption" with a fixed key, no packet authentication, and trust-based validation.

Zero results were found in CVE databases (cve.org, exploit-db) for "Command and Conquer" — the game shipped before systematic game vulnerability tracking existed. The OpenRA issue tracker also returned zero results for security-specific queries, though their 135+ desync issues imply network robustness problems that overlap with security concerns.

Academic literature (Buro 2002 "ORTS: A hack-free RTS game environment", Chambers et al. 2005 "Mitigating information exposure to cheaters in real-time strategy games", Yan & Randell 2005 "A systematic classification of cheating in online games", Bryant & Saiedian 2021 "An evaluation of videogame network architecture performance and security") confirms that lockstep RTS games have fundamental architectural vulnerabilities that cannot be solved without server-authoritative simulation.

---

## Category 1: Buffer Overflow / Memory Corruption

### VULN-001: NetPacket Constructor Over-Read (CRITICAL)

**Source:** `GeneralsMD/Code/GameEngine/Source/GameNetwork/NetPacket.cpp` line ~1909

```cpp
NetPacket::NetPacket(TransportMessage *msg) {
    init();
    m_packetLen = msg->length;
    memcpy(m_packet, msg->data, MAX_PACKET_SIZE);  // Always copies 476 bytes
    // ...
}
```

**Problem:** Always copies `MAX_PACKET_SIZE` (476) bytes from `msg->data` regardless of actual `msg->length`. If the underlying transport message buffer is smaller than 476 bytes (e.g., a short UDP datagram), this reads past the end of the source buffer.

**Exploitability:** Medium — requires the transport layer to provide a buffer smaller than MAX_PACKET_SIZE. The `doRecv()` function reads into a `TransportMessage` struct which itself is MAX_MESSAGE_LEN (1024) bytes, so the source buffer is large enough. The vulnerability is an information leak rather than a crash — the packet will contain stale/uninitialized data from the buffer, but `m_packetLen` correctly records the actual length for parsing.

**Iron Curtain mitigation:** Use Rust's `&[u8]` slices. The compiler enforces bounds at the type system level — you cannot copy more bytes than a slice contains.

---

### VULN-002: Chat Message Stack Buffer Overflow (CRITICAL)

**Source:** `GeneralsMD/Code/GameEngine/Source/GameNetwork/NetPacket.cpp` line ~5556-5578

```cpp
NetCommandMsg * NetPacket::readChatMessage(UnsignedByte *data, Int &i) {
    UnsignedShort text[256];           // 512 bytes on stack
    UnsignedByte length;               // Single byte from network
    memcpy(&length, data + i, sizeof(UnsignedByte));
    ++i;
    memcpy(text, data + i, length * sizeof(UnsignedShort));  // Up to 255 * 2 = 510 bytes
    i += length * sizeof(UnsignedShort);
    text[length] = 0;
    // ...
}
```

**Problem:** `length` is a single byte (0-255) from the network. With `length = 255`, the memcpy copies 510 bytes into a 512-byte buffer, which fits. However, the `readDisconnectChatMessage` at line ~5556 has the *identical* pattern. The real danger is that `length` controls how far `i` advances past the packet boundary — no check ensures `data + i + length * sizeof(UnsignedShort)` stays within `MAX_PACKET_SIZE`. A malicious packet can cause reads past the end of the packet buffer into adjacent memory.

**Exploitability:** High — attacker sends a crafted chat message with `length` close to 255, causing the parser to read past the packet buffer boundary. While this is a heap read (packet is on the heap as `m_packet[MAX_PACKET_SIZE]`), the out-of-bounds read could leak sensitive data or crash the process.

**Iron Curtain mitigation:** Rust slices with bounds checking. Chat deserialization should use `serde` with explicit length limits and validation before buffer access.

---

### VULN-003: File Message Unbounded Copy (CRITICAL)

**Source:** `GeneralsMD/Code/GameEngine/Source/GameNetwork/NetPacket.cpp` line ~5699-5725

```cpp
NetCommandMsg * NetPacket::readFileMessage(UnsignedByte *data, Int &i) {
    char filename[_MAX_PATH];
    char *c = filename;

    while (data[i] != 0) {   // No bounds check on 'i' or filename length
        *c = data[i];
        ++c;
        ++i;
    }
    *c = 0;
    ++i;

    UnsignedInt dataLength = 0;
    memcpy(&dataLength, data + i, sizeof(dataLength));  // dataLength from network
    i += sizeof(dataLength);

    UnsignedByte *buf = NEW UnsignedByte[dataLength];   // Network-controlled allocation
    memcpy(buf, data + i, dataLength);                  // Network-controlled copy size
    i += dataLength;
    // ...
}
```

**Problem:** Three vulnerabilities in one function:
1. **Filename buffer overflow:** The `while (data[i] != 0)` loop copies bytes to a stack buffer `filename[_MAX_PATH]` with no length check. A crafted packet without a null terminator overflows the stack.
2. **Unbounded allocation:** `dataLength` is read directly from network data and used as an allocation size. Attacker can request gigabytes of allocation (DoS).
3. **Out-of-bounds read:** `memcpy(buf, data + i, dataLength)` copies `dataLength` bytes from the packet buffer — which may only have a few bytes left — into the newly allocated buffer. Reads past the packet buffer. Within the wrapper system, this data comes from reassembled chunks that can be very large, making this particularly dangerous.

**Exploitability:** Critical — this is a classic remote stack buffer overflow (filename parsing) combined with a heap-based DoS (arbitrary allocation). The file message system is used for map transfer in lobbies.

**Iron Curtain mitigation:** Use `serde` deserialization with `#[serde(deserialize_with = "...")]` validators. File transfer should use a dedicated protocol with cryptographic integrity checks (SHA-256 of expected content), not inline packet embedding.

---

### VULN-004: Wrapper Message Unbounded Data (HIGH)

**Source:** `GeneralsMD/Code/GameEngine/Source/GameNetwork/NetPacket.cpp` line ~5651-5697

```cpp
NetCommandMsg * NetPacket::readWrapperMessage(UnsignedByte *data, Int &i) {
    // ... reads wrappedCommandID, chunkNumber, numChunks, totalDataLength, dataLength, dataOffset
    // All from network data with no validation

    msg->setData(data + i, dataLength);  // dataLength from network
    i += dataLength;
    // ...
}
```

The `setData` function allocates and copies:
```cpp
void NetWrapperCommandMsg::setData(UnsignedByte *data, UnsignedInt dataLength) {
    m_data = NEW UnsignedByte[dataLength];    // network-controlled allocation
    memcpy(m_data, data, dataLength);          // network-controlled copy
    m_dataLength = dataLength;
}
```

**Problem:** The wrapper/chunking system allows reassembly of commands larger than MAX_PACKET_SIZE. `numChunks`, `totalDataLength`, and `dataLength` are all network-supplied with no upper bounds. An attacker can claim `totalDataLength` of billions of bytes, causing the `NetCommandWrapperListNode` to allocate a massive buffer.

**Exploitability:** High — reliable DoS via memory exhaustion. The chunking system will happily allocate arbitrary amounts of memory waiting for all chunks to arrive.

**Iron Curtain mitigation:** Hard cap on reassembled command size (e.g., 64KB for map files, configurable). Reject wrapper commands with `totalDataLength` above the cap. Track per-connection memory usage.

---

### VULN-005: receive-side Parser Has No Bounds Checking (CRITICAL)

**Source:** All `read*Message` functions in `NetPacket.cpp` (lines ~5200-5800)

Every receive-side message parser (`readGameMessage`, `readFrameMessage`, `readAckStage1Message`, `readChatMessage`, `readWrapperMessage`, etc.) follows this pattern:

```cpp
NetCommandMsg * NetPacket::readFrameMessage(UnsignedByte *data, Int &i) {
    UnsignedShort cmdCount = 0;
    memcpy(&cmdCount, data + i, sizeof(UnsignedShort));  // No check that i + 2 <= dataLength
    i += sizeof(UnsignedShort);
    // ...
}
```

**Problem:** None of the `read*Message` functions receive or check the total data length. They operate on raw `(UnsignedByte *data, Int &i)` with no size parameter. They advance `i` past the end of the actual data and read garbage or crash.

The *outer* loop in `ConstructNetCommandMsgFromRawData` does check `offset < dataLength` before reading each TLV tag, but once it dispatches to a `read*Message` function, that function reads an arbitrary number of bytes without any bounds check. A crafted packet with a valid 'D' tag but truncated data section will cause out-of-bounds reads inside the read function.

The `getCommandList()` function has the same issue — it dispatches based on command type but the individual readers have no guardrails.

**Exploitability:** Critical — any `read*Message` function can be triggered with insufficient data. The `readGameMessage` function is worst: it reads `numArgTypes` and `argCount` from the packet, then calls `readGameMessageArgumentFromPacket` that many times. Each call does `memcpy` of 4-12 bytes. An attacker sends `numArgTypes = 255, argCount = 255` with a truncated packet and forces reads far past the buffer boundary.

**Iron Curtain mitigation:** Rust's `serde` with custom deserializer that tracks remaining bytes. Every read operation checks available length first. Alternatively, use a `Cursor<&[u8]>` that returns `Err` on underflow.

---

### VULN-006: PacketClass Trusted Size Field (CRITICAL)

**Source:** `Generals/Code/Tools/mangler/wnet/packet.cpp` and `matchbot/wnet/packet.cpp`

```cpp
PacketClass::PacketClass(char *curbuf) {
    Size = ntohs(*((unsigned short *)curbuf));  // Network-supplied
    // ...
    remaining_size = Size - 4;
    while (remaining_size > 0) {
        // Reads field.Size via ntohs from network data
        // Uses field.Size to control memcpy length
    }
}
```

**Problem:** `Size` is read directly from network data and controls the entire parsing loop. If `Size` is very large, parsing reads past the actual buffer. Each field within the loop also has a network-supplied `Size` used for memcpy.

**Exploitability:** Critical — this is in the mangler/matchbot tools, not the game client itself, but the pattern is instructive. Classic trusted-length vulnerability.

**Iron Curtain mitigation:** N/A for Iron Curtain directly (we won't have a mangler). But all protocol parsers must use length-delimited reads with remaining-bytes tracking.

---

## Category 2: Cryptographic Weaknesses

### VULN-007: XOR "Encryption" with Fixed Key (CRITICAL)

**Source:** `GeneralsMD/Code/GameEngine/Source/GameNetwork/Transport.cpp` lines 42-56

```cpp
// "Packet-level encryption is an XOR operation, for speed reasons."
static inline void encryptBuf( unsigned char *buf, Int len ) {
    UnsignedInt mask = 0x0000Fade;  // Fixed starting mask
    UnsignedInt *uintPtr = (UnsignedInt *) (buf);
    for (int i=0 ; i<len/4 ; i++) {
        *uintPtr = (*uintPtr) ^ mask;
        *uintPtr = htonl(*uintPtr);
        uintPtr++;
        mask += 0x00000321; // "just for fun"
    }
}
```

**Problem:** This is not encryption. The starting mask `0x0000Fade` and increment `0x00000321` are hardcoded constants visible in the source code (and trivially recoverable from binary analysis even before the GPL release). Any packet can be decrypted instantly. The comment "just for fun" in the source code acknowledges this.

Additionally, trailing bytes (when `len` is not a multiple of 4) are transmitted in plaintext.

**Exploitability:** Trivial — any network observer can decrypt all game traffic in real time. Combined with VULN-008 (no authentication), an attacker can read AND forge arbitrary packets.

**Iron Curtain mitigation:** Use DTLS 1.3 for transport encryption. The relay server model (D007) makes this simpler — clients authenticate to the relay, and the relay handles the TLS termination. For direct P2P, use noise protocol or WireGuard-style key exchange. Never roll custom crypto.

---

### VULN-008: No Packet Authentication (CRITICAL)

**Source:** `GeneralsMD/Code/GameEngine/Source/GameNetwork/Transport.cpp` lines 404-416

```cpp
// CRC computed, then XOR-encrypted
m_outBuffer[i].header.crc = crc.get();
encryptBuf((unsigned char *)&m_outBuffer[i], len + sizeof(TransportMessageHeader));
```

The CRC is a simple additive checksum, not a cryptographic MAC. Combined with the known XOR key, an attacker can:
1. Decrypt any packet
2. Modify the payload
3. Recompute the CRC
4. Re-encrypt with the known key

**Problem:** No HMAC, no digital signatures, no replay protection. An on-path attacker has full read/write access to all game traffic. The `isGeneralsPacket()` validation only checks a magic number and CRC — both of which an attacker can forge.

**Exploitability:** Trivial — if an attacker is on the network path (same WiFi, ISP-level, VPN provider, etc.), they can inject arbitrary game commands, drop specific packets, or modify orders in transit.

**Iron Curtain mitigation:** Ed25519-signed order packets with ephemeral session keys (see `06-SECURITY.md` § Vulnerability 16). Each player's orders are signed with their session key. The relay server validates signatures before forwarding. Replays include the signature chain for tamper detection.

---

### VULN-009: Lobby/Matchmaking Tool Encryption (HIGH)

**Source:** Multiple files in `Code/Tools/matchbot/encrypt.cpp` and `Code/GameEngine/Source/Common/System/encrypt.cpp`

```cpp
const char *EncryptString(const char *String) {
    // Simple bit-shifting and XOR against a base string
    for (UpCnt = 0, DnCnt = Length; UpCnt < Length; UpCnt++, DnCnt--)
        if (String[UpCnt] & 0x01)
            Temp_Buffer[UpCnt] = (String[UpCnt] << (String[UpCnt] & 0x01)) & String[DnCnt];
        else
            Temp_Buffer[UpCnt] = (String[UpCnt] << (String[UpCnt] & 0x01)) ^ String[DnCnt];
    // Maps to 64-char base string
}
```

**Problem:** Password "encryption" for matchmaking uses trivially reversible bit manipulation. Passwords can be recovered from network captures. The matchbot and mangler tools contain the same weak patterns. Worse, `MAX_ENCRYPTED_STRING = 8` means passwords are truncated to 8 characters before "encryption".

While the game also includes proper Blowfish, RSA (PKey), and RC4 implementations in the WWVegas library, the in-game network transport uses only XOR.

**Exploitability:** High — credential theft from network capture.

**Iron Curtain mitigation:** Use SRP (Secure Remote Password) or OAuth2 for authentication. Never transmit passwords, even encrypted. Use session tokens after initial auth.

---

## Category 3: Denial of Service

### VULN-010: Unbounded Memory Allocation via Network (HIGH)

**Source:** Multiple locations:
- `readFileMessage`: `NEW UnsignedByte[dataLength]` with network-supplied `dataLength`
- `readWrapperMessage` → `setData`: `NEW UnsignedByte[dataLength]` with network-supplied `dataLength`
- `NetCommandWrapperListNode`: Allocates `m_data` based on `totalDataLength` from reassembled chunks

**Problem:** An attacker can force the game client to allocate arbitrary amounts of memory by sending crafted wrapper/file messages with large `dataLength` or `totalDataLength` values. Since there's no per-connection or per-message size limit, a single malicious packet can cause the game to allocate gigabytes and crash with an out-of-memory error.

**Exploitability:** High — reliable remote crash/DoS against any player in a game lobby or match.

**Iron Curtain mitigation:** Hard limits on all size fields. 
```rust
const MAX_ORDER_SIZE: usize = 4096;       // Single order
const MAX_FILE_TRANSFER_SIZE: usize = 65536; // Map file transfer
const MAX_PENDING_DATA_PER_PEER: usize = 262144; // 256KB per peer
```
Reject packets exceeding these limits at the protocol layer. The relay server should enforce these limits before forwarding.

---

### VULN-011: Packet Flood / Amplification (MEDIUM)

**Source:** `Transport.cpp` `doRecv()` — processes all incoming packets in a while loop

```cpp
while ( (len=m_udpsock->Read(buf, MAX_MESSAGE_LEN, &from)) > 0 ) {
    // Process every packet, no rate limiting
}
```

**Problem:** No rate limiting on incoming packets. An attacker can flood the game port with packets, consuming CPU time in decrypt/parse operations even if the packets are ultimately rejected. Each packet requires:
1. XOR decryption (`len/4` XOR operations)
2. CRC validation
3. `isGeneralsPacket()` magic number check

**Exploitability:** Medium — requires ability to send UDP traffic to the game port. Standard UDP amplification attacks apply.

**Iron Curtain mitigation:** 
- Rate limiting at the transport layer (max packets per second per source IP)
- Connection cookie for anti-spoofing (similar to DTLS HelloVerifyRequest)
- Relay server absorbs and rate-limits before forwarding to clients

---

### VULN-012: Malformed Command Type Crash (MEDIUM)

**Source:** `ConstructNetCommandMsgFromRawData` and `getCommandList()` — command type dispatch

```cpp
if (commandType == NETCOMMANDTYPE_GAMECOMMAND) {
    msg = readGameMessage(data, offset);
} else if (commandType == NETCOMMANDTYPE_ACKBOTH) {
    // ...
} else if (...) {
    // ... many more types
}
// No default/else case — msg could be NULL
msg->setExecutionFrame(frame);  // NULL dereference if unknown type
```

**Problem:** If `commandType` doesn't match any known type, `msg` remains NULL from initialization. The code then calls `msg->setExecutionFrame(frame)` which dereferences NULL — instant crash.

**Exploitability:** Medium — send a packet with a valid TLV structure but an unknown command type byte. Causes NULL pointer dereference and game crash.

**Iron Curtain mitigation:** Rust's `match` with exhaustive pattern matching. Unknown variants return `Err(ProtocolError::UnknownCommandType(byte))` instead of proceeding.

---

## Category 4: State Manipulation / Cheating

### VULN-013: Maphack (Architectural — OPEN)

**Source:** Inherent to deterministic lockstep

**Problem:** All clients have complete game state in memory. Fog of war is a rendering filter only. Any memory reading tool can expose the full map. This affects every lockstep RTS: StarCraft, Age of Empires, OpenRA, and would affect Iron Curtain in its `RelayLockstepNetwork` / `EmbeddedRelayNetwork` modes.

**Iron Curtain mitigation:** 
- Default: Memory obfuscation (raises the bar for casual cheats)
- Competitive: `FogAuthoritativeNetwork` mode where the server runs the sim and sends only visible-to-player state
- See `06-SECURITY.md` for full design

---

### VULN-014: Order Spoofing / Injection (HIGH)

**Source:** `Transport.cpp` — player ID is embedded in the command, not validated against source

Commands include a `playerID` field that is set by the sender. In P2P mode, a malicious client can:
1. Forge commands with another player's `playerID`
2. Send commands for units they don't own
3. Issue build/production commands they haven't earned

**Exploitability:** High in P2P mode. The `ConstructNetCommandMsgFromRawData` parser reads `playerID` from the 'P' tag with no validation against the source address.

**Iron Curtain mitigation:** 
- Deterministic order validation inside the sim (D012) — every order is validated for ownership, affordability, prerequisites before execution
- Relay server stamps commands with the authenticated sender's player slot — forged `playerID` values are replaced with the actual sender
- Ed25519 signatures on orders (clients can verify other clients' orders)

---

### VULN-015: Lag Switch / Timing Manipulation (HIGH in P2P)

**Source:** Lockstep protocol — slowest client dictates game speed

**Problem:** In P2P lockstep, a player can artificially delay their packets to:
1. Gain extra decision-making time
2. Pause the game at critical moments
3. Force opponents to wait

Generals/ZH has adaptive run-ahead (see `research/generals-zero-hour-netcode-analysis.md`) with some disconnect detection, but the P2P model is fundamentally vulnerable.

**Iron Curtain mitigation:**
- Relay server owns the clock (D007) — if your orders don't arrive within the tick window, they're dropped
- Sub-tick timestamps (D008) — the relay records sub-tick timing for fair ordering
- Strikes system — repeated late deliveries result in disconnection
- The relay's tick cadence is authoritative — client clock is irrelevant

---

### VULN-016: Desync Exploitation (MEDIUM)

**Source:** Inherent to lockstep — desyncs can be weaponized

**Problem:** If an attacker can intentionally cause a desync (by sending modded data, corrupted YAML, or by exploiting floating-point differences), they can:
1. Crash all other clients (if desync detection aborts the game)
2. Gain advantageous state divergence (their client sees a different game than opponents)
3. Force a draw/no-result to avoid a loss

OpenRA has 135+ desync issues in their tracker, demonstrating this is a significant practical problem.

**Iron Curtain mitigation:**
- Fixed-point math (D009) — eliminates floating-point determinism issues
- `state_hash()` every tick for desync detection (D010)
- Relay server performs hash comparison — the majority hash wins, divergent clients are disconnected (not crashed)
- Certified match results (relay-signed) prevent result manipulation

---

## Category 5: NAT/Connection Infrastructure

### VULN-017: Mangler Response Spoofing (MEDIUM)

**Source:** `GeneralsMD/Code/GameEngine/Source/GameNetwork/NAT.cpp` and `FirewallHelper.cpp`

```cpp
// Mangler response validation
UnsignedShort mangledPort = TheFirewallHelper->getManglerResponse(m_packetID);
```

**Problem:** The mangler system uses `packetID` matching to associate responses, but the mangler-client protocol uses unencrypted UDP with a `ManglerData` struct containing a simple `magic` number and CRC. An attacker who can observe or predict the `packetID` (starts at `0x7f00`) can spoof mangler responses and redirect connections to their own server, enabling full MITM.

**Exploitability:** Medium — requires network position to intercept mangler traffic. But `packetID` starts at a predictable value, and the mangler protocol has no authentication.

**Iron Curtain mitigation:** N/A — Iron Curtain uses relay-based architecture (D007) which eliminates the need for NAT hole-punching. Direct connections use DTLS with certificate pinning. No third-party "mangler" service.

---

### VULN-018: Port Prediction for Connection Hijacking (LOW)

**Source:** `NAT.cpp` `processManglerResponse()` — port prediction algorithm

```cpp
if ((fwType & FirewallHelperClass::FIREWALL_TYPE_SIMPLE_PORT_ALLOCATION) != 0) {
    returnPort = mangledPort + delta;
} else {
    // Complex NAT32-specific port prediction
    // Comment: "This bit is probably doomed."
}
```

**Problem:** The NAT traversal system attempts to predict future port allocations based on observed patterns. The prediction algorithm is deterministic and based on a disclosed `delta` value. An attacker who knows the firewall type and delta (both exchanged in the clear) can predict the game port and race to establish a connection before the legitimate peer.

**Exploitability:** Low — requires precise timing and network position. Mostly theoretical.

**Iron Curtain mitigation:** Not applicable — relay architecture eliminates peer-to-peer NAT traversal.

---

## Category 6: General RTS Networking Vulnerabilities (from Literature)

### VULN-019: Information Exposure in Lockstep (Architectural)

**Source:** Chambers et al. 2005, Buro 2002 (ORTS)

All lockstep RTS games transmit full game state or sufficient orders to reconstruct it. Academic research confirms three approaches:
1. **Accept it** — most commercial games (StarCraft, AoE, Generals)
2. **Partitioned state** — ORTS project (server-authoritative, sends only visible state). Adds latency.
3. **Cryptographic fog** — hash-based commitment schemes. Theoretical; no commercial implementation.

**Iron Curtain mitigation:** Accept for default mode; fog-authoritative server for competitive (matches our existing design in D006 and `06-SECURITY.md`).

---

### VULN-020: Replay/Save File Exploitation (MEDIUM)

**Source:** Common pattern in RTS games

Replay files contain the complete sequence of orders. Maliciously crafted replay files could:
1. Exploit parsing vulnerabilities (same code path as live packet parsing)
2. Contain oversized commands that trigger buffer overflows during playback
3. Be modified to show false match results

The Generals `Recorder.cpp` uses `fread()` with no bounds checking — same vulnerability class as the network parsers.

**Iron Curtain mitigation:**
- Ed25519-signed hash chain for replays (D010)
- Replay parsing uses the same hardened deserialization as live protocol
- Replay files include version/checksum headers validated before playback

---

### VULN-021: Automation/Botting (MEDIUM)

**Source:** Yan & Randell 2005 "A systematic classification of cheating in online games"

Players can use external tools to automate micro-management at superhuman speeds: perfect build orders, instant unit ability usage, pixel-perfect targeting. No kernel-level anti-cheat can fully prevent this without invasive system access.

**Iron Curtain mitigation:**
- No kernel-level anti-cheat (principle decision — open source, cross-platform)
- Relay-side behavioral analysis: APM patterns, reaction times, input entropy
- Detection, not prevention — flag suspicious players for review
- Competitive integrity via ranked matchmaking with statistical anomaly detection

---

## Summary by Severity

| Severity      | Count | Vulnerability IDs                 |
| ------------- | ----- | --------------------------------- |
| CRITICAL      | 6     | VULN-001, 002, 003, 005, 006, 007 |
| HIGH          | 6     | VULN-004, 008, 009, 010, 014, 015 |
| MEDIUM        | 6     | VULN-011, 012, 016, 017, 020, 021 |
| LOW           | 1     | VULN-018                          |
| Architectural | 2     | VULN-013, 019                     |

## Key Takeaways for Iron Curtain

### What Rust eliminates by default
1. **Buffer overflows** (VULN-001 through 006) — Rust's borrow checker, slice bounds checking, and `serde` deserialization eliminate this entire class. This is the single biggest security improvement.
2. **Memory corruption** — Use-after-free, dangling pointers, uninitialized reads. All prevented by Rust's ownership model.

### What the relay architecture eliminates
3. **Packet injection/spoofing** (VULN-007, 008, 014) — Relay server authenticates all connections with TLS. Player slot is server-assigned, not self-declared.
4. **Lag switching** (VULN-015) — Relay owns the clock.
5. **NAT traversal attacks** (VULN-017, 018) — No peer-to-peer NAT hole-punching needed.

### What requires explicit design
6. **Maphack** (VULN-013, 019) — Architectural limit of lockstep. `FogAuthoritativeNetwork` mode needed for competitive.
7. **Desync exploitation** (VULN-016) — Per-tick state hashing + majority-rules disconnection.
8. **DoS via protocol** (VULN-010, 011) — Size limits on all protocol fields, rate limiting, connection cookies.
9. **Replay tampering** (VULN-020) — Ed25519-signed hash chains.
10. **Botting** (VULN-021) — Behavioral analysis, not kernel anti-cheat.

### Generals source code as a cautionary tale
The Generals codebase represents a "works until someone tries to break it" approach to network security. Send-side code validates carefully (all the `isRoomFor*` functions); receive-side code trusts everything. This asymmetry is the root cause of most vulnerabilities. Iron Curtain's protocol layer must apply the same rigor to **parsing** as to **serialization** — which Rust's type system naturally encourages via `serde::Deserialize` with explicit error handling.

---

## Academic Reference: Bryant & Saiedian (2021)

### Paper 1: "An evaluation of videogame network architecture performance and security"
- **Journal:** Computer Networks, Vol 192, 2021
- **DOI:** [10.1016/j.comnet.2021.108128](https://doi.org/10.1016/j.comnet.2021.108128)
- **Authors:** Blake D. Bryant (CISSP, PhD candidate at University of Kansas), Hossein Saiedian (Professor, University of Kansas)

Evaluates three competitive game networking approaches — **deterministic lockstep**, **snapshot interpolation**, and **state synchronization** — through three case studies (Risk of Rain 2, Dead by Daylight, and a third game exhibiting animation canceling). Introduces the "state saturation" concept. Evaluates the effects of client-side exploits, latency, and state synchronization on competitive gameplay. Recommends modifications to retain the benefits of animation canceling while reducing its negative performance and fairness impacts.

### Paper 2: "A State Saturation Attack against Massively Multiplayer Online Videogames"
- **Conference:** ICISSP 2021
- **Authors:** Same

Introduces **"state saturation"** — a lag-based attack where animation canceling (rapidly interrupting one action with another) generates disproportionate state update traffic that starves other players' command messages. The attacker gains competitive advantage because their rapid state changes consume network bandwidth while opponents' inputs are delayed or dropped. The Risk of Rain 2 case study demonstrated how "procedurally generated effects combined to produce unintended chain-reactive behavior which may ultimately overwhelm the ability for game clients to render objects or handle sending/receiving of game update messages."

### Relevance to Iron Curtain

| Paper Finding                                   | IC Design Element                          | Assessment                                                                                   |
| ----------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Three network architecture taxonomy             | Pluggable `NetworkModel` trait (D006)      | Validates our approach — each model has different security profile                           |
| State saturation via order flooding             | `ProtocolLimits.max_orders_per_tick` (256) | Already mitigated by rate caps                                                               |
| Relay prevents lag exploitation                 | Relay server with time authority (D007)    | Directly aligned with paper's recommendations                                                |
| Sub-tick fairness prevents timing exploits      | CS2 sub-tick timestamps (D008)             | Already designed                                                                             |
| Chain-reactive mod effects overwhelming clients | WASM sandbox resource limits               | Addressed: `WasmExecutionLimits` with per-tick instruction budget, entity spawn caps         |
| Dead by Daylight latency exploitation           | Relay-owned clock + behavioral analysis    | Already mitigated                                                                            |
| Lockstep resists volumetric DoS                 | `RelayLockstepNetwork` / `EmbeddedRelayNetwork` | Security advantage: attacker's lag hurts themselves too                                   |
| DOOM floating-point drift across hardware       | Fixed-point math, no floats in sim (D009)  | Validates our determinism approach — DOOM's P2P had this exact bug                           |
| StarCraft II intermediary store-and-forward     | Relay server architecture (D007)           | SC2 evolved from pure P2P to intermediary server — same as our relay                         |
| Fortnite player-perspective object scoping      | `FogAuthoritativeNetwork` (future)         | Validates our fog-authoritative design — same concept                                        |
| Fiedler's priority accumulator                  | `FogAuthoritativeNetwork` entity scoping   | Must implement: staleness-based priority for bandwidth management                            |
| Soft vs hard throttling bypass (ESO)            | Relay-side order validation                | Server-side validation is the real throttle, not client-side                                 |
| Traffic class segregation recommendation        | Protocol design                            | Consider: player input via UDP (low latency) vs state via TCP (reliability) for FogAuth mode |
| ESO animation canceling +175% traffic           | `ProtocolLimits` + rate caps               | Empirical proof: client-side exploits can nearly triple traffic                              |
| HeroEngine bandwidth limits (40,960 B/s)        | `ProtocolLimits` constants                 | Precedent for hard bandwidth caps in commercial game engines                                 |

### Empirical Data: State Saturation Quantification (ESO Case Study)

The ICISSP paper's Wireshark captures measured the network impact of animation canceling in The Elder Scrolls Online. A programmable mouse sent macros at 50ms intervals (~10 actions/sec). Baseline: walking generates 4.14 packets/sec sent.

| Scenario                                 | Packets Sent/s | Δ Sent      | Packets Recv/s | Δ Recv      |
| ---------------------------------------- | -------------- | ----------- | -------------- | ----------- |
| Idle                                     | 0.25           | —           | 0.19           | —           |
| Walking (baseline)                       | 4.14           | —           | 4.14           | —           |
| Light attack spam (hard-throttled)       | 4.20           | +1.4%       | 4.89           | +18.1%      |
| Offensive weaving (soft-throttle bypass) | 4.96           | +19.8%      | 5.66           | +36.7%      |
| Offensive + defensive weaving            | 11.40          | **+175.4%** | 10.90          | **+163.3%** |

Key takeaway: Hard throttling (cooldown timer) held at +1.4%. But soft throttling (animation gating) was bypassed by alternating input types, resulting in +175% traffic. The game's reactive priority/interrupt system — designed for defensive gameplay — became the exploit vector. Zenimax eventually moved block validation server-side (adding RTT penalty) to close the gap.

The paper provides academic validation for D006 (pluggable networking), D007 (relay server), and D008 (sub-tick timestamps). Our architecture addresses the identified vulnerabilities by design rather than requiring post-hoc mitigations.
