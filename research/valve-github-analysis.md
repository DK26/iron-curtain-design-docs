# Valve GitHub — Public Repository Analysis

**Source:** https://github.com/ValveSoftware (54 public repositories)
**Analyzed:** February 2026
**Purpose:** Identify patterns, architecture lessons, and concrete techniques from Valve's public codebases that are relevant to Iron Curtain's netcode, Workshop, SDK, rendering, ranking, and serialization designs

## Repository Catalogue

Of Valve's 54 public repositories, the following are directly relevant to Iron Curtain:

| Repository                        | Stars | Relevance to IC                           | License      |
| --------------------------------- | ----- | ----------------------------------------- | ------------ |
| GameNetworkingSockets             | 9.2k  | Netcode, relay, encryption, P2P           | BSD-3-Clause |
| source-sdk-2013                   | 9.6k  | SDK architecture, delta encoding, modding | Source 1 SDK |
| halflife                          | 4.3k  | Classic engine networking                 | Valve SDK    |
| steam-audio                       | 2.7k  | Spatial audio, HRTF                       | Apache-2.0   |
| Fossilize                         | 733   | Crash-safe serialization, replay tooling  | MIT          |
| csgo-demoinfo                     | 507   | Demo/replay file parsing                  | BSD-2-Clause |
| counter-strike_regional_standings | —     | Ranking algorithm (Glicko)                | Apache-2.0   |
| ToGL                              | 2.1k  | Renderer abstraction layer                | Valve        |
| vogl                              | 1.4k  | GL debugger/profiler tooling              | MIT          |
| openvr                            | 6.7k  | VR API abstraction                        | BSD-3-Clause |

Other repositories (Proton, gamescope, dxvk, wine-related, platform tools) are not directly relevant to IC's design.

---

## Part 1: Netcode — GameNetworkingSockets (GNS)

GNS is Valve's production networking library, used in CS2, Dota 2, and other titles. It operates as a standalone open-source library (BSD-3-Clause) with a Rust binding (`gns-rs`). This is the most directly relevant Valve codebase for IC.

### 1.1 Connection Model: Message-Oriented, Not Stream-Oriented

GNS is **connection-oriented** (like TCP — you establish a connection, then send/receive on it) but **message-oriented** (like UDP — each send is a discrete message with preserved boundaries, not a byte stream). From the API header:

> "For the message semantics used here, the sizes WILL match. Each send call will match a successful read call on the remote host one-for-one."

This is the same hybrid IC designs for: connection handles for state management, but discrete messages preserving order boundaries rather than TCP-style byte streams.

**IC comparison:** IC's `Transport` trait (D054) is connection-oriented with `send()`/`recv()` of `TimestampedOrder` messages. GNS validates this approach — Valve converged on the same pattern for RTS-relevant use cases. IC's additional requirement of sub-tick timestamps (D008) is compatible with this model.

### 1.2 Reliability: Ack Vector Model (DCCP RFC 4340)

GNS uses an **ack vector model** derived from DCCP (RFC 4340) and influenced by Google QUIC. This is fundamentally different from TCP's sliding window:

- **Receiver** communicates per-packet received/not-received status via an RLE-encoded bitfield in every ack frame
- **Sender** deduces exactly which segments need retransmission based on the ack vector — no ambiguity about which packets were lost
- Reliable messages use **stream positions** (byte offsets into a reliable stream), not packet sequence numbers, so retransmission is at the byte level
- Unreliable messages use **message numbers** (monotonically increasing) with varint-encoded offsets for compact encoding

From the SNP wire format specification:

```
Ack frame layout:
  - Latest received packet number (varint)
  - RLE-encoded bitfield: received (1) / not-received (0) per preceding packet
  - 16-bit ack delay at 32µs resolution per ack
```

The 16-bit delay field (32µs resolution) means **every ack doubles as a ping measurement** — the receiver stamps how long it held the packet before acking, so the sender can compute true RTT continuously without dedicated ping packets.

**IC comparison:** IC's current "Frame Data Resilience" design (from Generals analysis) uses redundant frame data per packet. GNS's approach is more sophisticated — it provides exact knowledge of which packets arrived, enabling precise retransmission. Recommendation: IC should consider the ack vector model for its relay protocol. It's especially valuable for IC because:
1. Sub-tick timestamps need reliable delivery of individual orders, not bulk frame data
2. The relay server can inspect ack vectors to detect connection quality without deep packet inspection
3. Continuous RTT measurement eliminates the need for separate ping packets in the relay protocol

### 1.3 Lanes: Head-of-Line Blocking Control

GNS introduces **lanes** — multiple independent message streams on a single connection, each with configurable priority and weight:

```
ConfigureConnectionLanes(hConn, nNumLanes, pLanePriorities, pLaneWeights)

Example: 3 lanes with priorities [0, 10, 10] and weights [NA, 20, 5]
- Lane 0 (priority 0): Always sent first (highest priority)
- Lane 1 (priority 10, weight 20): ~80% of remaining bandwidth
- Lane 2 (priority 10, weight 5): ~20% of remaining bandwidth
```

Key properties:
- Reliable messages within a lane are delivered in order
- Messages across lanes may be delivered out of order
- Each lane has independent message numbering starting at 1
- Idle lanes don't accumulate "credits" — bandwidth sharing is instantaneous
- Lane 0 has minimal wire overhead; other lanes add a small per-message cost
- Maximum ~8 lanes recommended for performance; 255 hard limit

**IC comparison:** IC's current design doesn't have lane-equivalent concepts. For an RTS, lanes could be valuable:
- **Lane 0 (high priority):** Player orders — must arrive ASAP for lockstep/rollback
- **Lane 1 (medium priority):** Chat, pings, alliance notifications
- **Lane 2 (low priority):** Replay metadata, statistics updates, non-critical sync

This maps naturally to IC's relay architecture: the relay server could prioritize order forwarding over chat forwarding, reducing perceived input latency under congestion. Recommendation: Consider adding lane support to the `Transport` trait or to the relay protocol specification.

### 1.4 Encryption: AES-GCM-256 + Curve25519

GNS encrypts every packet:
- **Key exchange:** Curve25519 (same as IC's Ed25519 foundation in D052)
- **Packet encryption:** AES-GCM-256 per packet
- **Key derivation:** QUIC-style
- Authentication certificates are optional but recommended

Without certificates, GNS still provides basic encryption against eavesdropping but is vulnerable to MITM. With certificates (or a shared secret), full authentication is achieved.

**IC comparison:** IC's D052 uses Ed25519 for signed credentials and records. GNS validates using Curve25519-family cryptography for the transport layer. IC should consider:
1. **Transport-layer encryption** (AES-GCM per packet) as a relay protocol requirement — currently IC's D054 Transport trait doesn't specify encryption
2. **Certificate-based authentication** for relay→server connections, with the relay acting as a trusted intermediary that can validate identities without exposing the underlying crypto to the sim

### 1.5 P2P Architecture: Pluggable Signaling

GNS's P2P design has three remarkable properties relevant to IC:

**a) Pluggable signaling:** The signaling service (how peers discover each other and exchange connection metadata) is a replaceable interface:
```cpp
class ISteamNetworkingConnectionSignaling {
    virtual bool SendSignal(HSteamNetConnection, const void*, int) = 0;
    virtual void Release() = 0;
};
```
Requirements are minimal: small datagrams, best-effort delivery. Any transport works (WebSocket, HTTP POST, carrier pigeon). This matches IC's philosophy of trait-abstracted subsystems.

**b) Symmetric connect mode:** Either peer can initiate the connection. No client/server role distinction required. Enabled via `k_ESteamNetworkingConfig_SymmetricConnect`. This is valuable for IC's peer-to-peer scenarios where all players are equal.

**c) Always-relay for privacy:** Steam's SDR (Steam Datagram Relay) always relays traffic between untrusted peers to **hide IP addresses**. The relay network provides NAT traversal as a side effect. This directly validates IC's D007 (relay server as default) — Valve's conclusion is the same: relay-first for security, with direct P2P only as an optimization when both peers opt in.

**IC comparison:** IC's relay architecture (D007) is strongly validated by GNS's SDR. The pluggable signaling interface is a pattern IC should adopt for the `ic-net` crate — the signaling mechanism should be trait-abstracted, not hardcoded to any specific service.

### 1.6 Loopback Testing

GNS provides `CreateSocketPair()` — creates two connected connections talking to each other in-process. By default, this bypasses the network entirely (no encryption, no packet simulation). Optionally, `bUseNetworkLoopback=true` sends through 127.0.0.1 with full encryption and simulated lag/loss.

**IC comparison:** This directly validates IC's `LocalNetwork` pattern for testing (D006). IC's `GameLoop<N: NetworkModel, I: InputSource>` pattern, where `N` can be `LocalNetwork` for deterministic testing, is architecturally equivalent. GNS shows Valve found the same testing pattern essential.

### 1.7 Poll Groups: Efficient Multi-Connection Message Retrieval

GNS allows grouping connections into poll groups and retrieving messages from all connections in a single call:
```cpp
CreatePollGroup() → HSteamNetPollGroup
SetConnectionPollGroup(hConn, hPollGroup)
ReceiveMessagesOnPollGroup(hPollGroup, ppOutMessages, nMaxMessages)
```

Messages from different connections are interleaved in receive order. Each message carries its connection handle.

**IC comparison:** For a relay server handling multiple game sessions, poll groups are a scalable pattern. IC's relay server should consider a similar approach — grouping all connections for a single game session and polling them together, rather than iterating per-connection.

### 1.8 Nagle Timer

GNS supports a configurable Nagle timer — small messages are buffered and coalesced into fewer packets. `FlushMessagesOnConnection()` forces immediate send.

**IC comparison:** For IC's lockstep model, Nagle-style batching is essential. Orders within a single tick should be coalesced into a single packet. IC's relay protocol should specify when to flush (at tick boundaries) vs. when to batch (within a tick for multiple orders from the same player).

### 1.9 Wire Format Design

The SNP (Steam Networking Protocol) wire format is transport-agnostic and uses a frame-based structure:

| Frame Type              | Purpose                            | Encoding                       |
| ----------------------- | ---------------------------------- | ------------------------------ |
| Unreliable segment      | Discrete message delivery          | Varint message number + offset |
| Reliable stream segment | Ordered byte stream delivery       | Stream position (byte offset)  |
| Stop-waiting            | Receiver can discard old ack state | Minimum expected packet number |
| Ack                     | Packet receipt confirmation        | RLE bitfield + per-ack delay   |
| Lane selection          | Switch lane for subsequent frames  | Lane index                     |

Key design choices:
- **Varint encoding throughout** — compact for typical values, expandable for edge cases
- **Transport-agnostic** — same payload format whether over raw UDP, WebRTC, or relay
- **Frame types are composable** — a single packet can contain multiple frame types

**IC comparison:** IC's protocol design should adopt transport-agnostic payload framing. The `ic-protocol` crate's `OrderCodec` trait already abstracts encoding, but the wire format for the relay protocol should be explicitly designed with composable frame types rather than fixed packet structures. Varint encoding is a natural fit for Rust (`postcard` already uses varint).

---

## Part 2: SDK Architecture — Source SDK 2013

### 2.1 Tiered Architecture

Source SDK organizes code into numbered tiers:

| Tier    | Purpose              | Example Contents                                     |
| ------- | -------------------- | ---------------------------------------------------- |
| tier0   | Platform abstraction | Threading, memory, debug output, platform detection  |
| tier1   | Core data structures | String tables, key-values, UTL containers, byte swap |
| tier2   | Engine services      | File system, rendering context, sound system         |
| tier3   | High-level systems   | VScript, game UI, full engine interface              |
| public/ | Shared interfaces    | All cross-module contracts (headers only)            |

Each tier depends only on lower tiers. `public/` contains only interface headers — the contracts between modules.

**IC comparison:** IC's crate structure (`ic-protocol`, `ic-sim`, `ic-net`, `ic-render`, etc.) is a crate-based equivalent. The key lesson is Source's `public/` directory — a dedicated location for **shared interface contracts**. IC achieves this differently via Rust crate boundaries and trait definitions, but the principle is identical. IC's most critical "public" boundary is `ic-protocol`, which must remain the ONLY shared dependency between `ic-sim` and `ic-net`.

### 2.2 Delta Encoding via Send/Receive Tables

Source's networking uses a property-based delta encoding system defined in `dt_common.h`, `dt_send.h`, and `dt_recv.h`:

**Property types:**
```c
enum SendPropType {
    DPT_Int,       DPT_Float,    DPT_Vector,
    DPT_VectorXY,  DPT_String,   DPT_Array,
    DPT_DataTable   // Nested tables
};
```

**Property flags for compression:**
- `SPROP_UNSIGNED` — unsigned integer encoding
- `SPROP_COORD` — world coordinate encoding (special float compression)
- `SPROP_COORD_MP` — multiplayer-optimized coordinate encoding
- `SPROP_COORD_MP_LOWPRECISION` — 3-bit fractional (vs. 5-bit normal)
- `SPROP_COORD_MP_INTEGRAL` — integer-only coordinates
- `SPROP_VARINT` — variable-length integer encoding
- `SPROP_NOSCALE` — raw float, no range compression
- `SPROP_NORMAL` — unit normal vector encoding
- `SPROP_CHANGES_OFTEN` — moved to head of send table for smaller index

The `SPROP_CHANGES_OFTEN` flag is particularly clever: frequently-changing properties get small indices in the delta encoding, reducing per-update overhead.

**IC comparison:** IC's lockstep model doesn't delta-encode game state (only orders are sent). However, for:
1. **Snapshot serialization** (D010) — property-level delta encoding could dramatically reduce save file sizes and snapshot comparison cost for desync debugging
2. **Spectator mode** — if IC ever adds a spectator protocol that streams game state, Source's delta encoding is the gold standard
3. **Replay files** — delta-encoded state snapshots interleaved with orders would make replays more efficient to seek

### 2.3 CNetworkVar: Automatic Change Detection

Source SDK's `networkvar.h` implements a C++ template system where variables **automatically detect when they change** and flag their entity as dirty:

```cpp
template<class Type, class Changer>
class CNetworkVarBase {
    const Type& Set(const Type &val) {
        if (memcmp(&m_Value, &val, sizeof(Type))) {
            NetworkStateChanged();  // Flag entity as dirty
            m_Value = val;
        }
        return m_Value;
    }
};
```

Key design properties:
- **memcmp-based change detection** — only marks dirty if the value actually changed
- **Per-variable tracking** — `NetworkStateChanged(void *pVar)` carries a pointer to the specific variable that changed
- **Chain propagation** — embedded structs forward change notifications to their parent entity
- **Array element tracking** — `CNetworkArray` tracks changes per-element, not per-array

**IC comparison:** In Bevy ECS, change detection is built into the framework via `Changed<T>` and `Mut<T>`. But the per-variable granularity of Source's approach is worth noting for IC's snapshot system. When diffing snapshots for desync debugging, per-field change tracking would identify exactly which component field diverged — not just "some component changed." Consider deriving a `#[track_changes]` attribute macro for `ic-sim` components that need field-level desync diagnostics.

### 2.4 VPK: Asset Packaging Format

Source SDK uses VPK (Valve Pak) files for asset distribution. The `vpklib/` directory implements the format. VPK files are:
- Indexed archives (directory + data split)
- Support streaming (assets loaded on demand, not extracted)
- Versioned (VPK v1, v2 with different header formats)

**IC comparison:** IC's Workshop asset packaging (D049) targets Bevy-native formats with BitTorrent/WebTorrent for distribution. VPK's indexed-archive approach validates the design: assets should be addressable within a package without extraction. IC's format should include a directory/manifest at the start of each package file for random access.

### 2.5 VScript: Embedded Scripting

Source SDK includes VScript support (`vscript/`), a scripting abstraction layer. The name "VScript" is the API — multiple backend languages can implement it (Squirrel was the primary implementation, Lua was experimented with).

**IC comparison:** IC's tiered modding (D003/D004/D005) — YAML → Lua → WASM — is more structured. The lesson from VScript is: abstract the scripting API from the scripting runtime. IC's Lua API (D024) should be defined as a set of function signatures and behaviors, not tied to implementation details of the Lua runtime. This way, if a WASM mod wants to call the same API, it can — the API is the contract, not the runtime.

---

## Part 3: Serialization — Fossilize

Fossilize is Valve's library for serializing Vulkan pipeline state to a binary database. Despite its graphics-specific purpose, its serialization architecture has broad applicability.

### 3.1 Crash-Safe Binary Database (.foz format)

Fossilize's `.foz` format is designed to be **robust against abrupt write termination** (process crash, power loss). Writing is append-only, so a partial write corrupts at most the last entry — everything previously written remains valid.

**IC comparison:** IC's save game format (via `ic-sim` snapshots, D010) should adopt similar crash-safety guarantees. If a save operation is interrupted, the previous valid save should be recoverable. Fossilize's approach: write the new entry entirely, then update the index/header as the final atomic step.

### 3.2 StateRecorder / StateReplayer Pattern

Fossilize separates recording from replaying:

- **StateRecorder:** Captures state as it occurs, writes to the database (optionally in a background thread)
- **StateReplayer:** Reads the database and replays the recorded state

The recorder runs as a Vulkan layer — it intercepts API calls, serializes their state, and passes through to the real driver. The replayer deserializes and re-executes.

**IC comparison:** This is directly applicable to IC's replay system. The pattern maps to:
- **StateRecorder** → IC's replay recorder (captures `TimestampedOrder` stream + periodic sim snapshots)
- **StateReplayer** → IC's replay playback (feeds orders back through the sim)
- **Background thread recording** → IC should record replays asynchronously to avoid frame drops. The recorder accumulates orders in a buffer and a background task writes them to disk.

### 3.3 Hash-Based Cross-Object References

Fossilize uses **content hashes** as keys for cross-object references. A pipeline references a shader module by the hash of its creation info, not by an index or pointer. Hash 0 = null reference.

**IC comparison:** IC's Workshop (D049) could use content-addressed storage — assets referenced by their content hash. This enables:
1. Deduplication across mod packages
2. Integrity verification (hash mismatch = corruption or tampering)
3. Cache-friendly distribution (same content = same key regardless of source)

### 3.4 CLI Toolchain

Fossilize provides focused CLI tools: `fossilize-replay`, `fossilize-merge-db`, `fossilize-convert-db`, `fossilize-disasm`, `fossilize-opt`. Each tool does one thing well.

**IC comparison:** IC's `ic` CLI tool (D020) should follow this pattern — focused subcommands rather than a monolithic tool. `ic replay inspect`, `ic mod validate`, `ic asset convert`, etc.

### 3.5 Crash Handler for Recording

Fossilize installs a crash handler (SIGSEGV handler on Linux) that serializes the pipeline that was being compiled at the time of the crash. This aids debugging by capturing the exact state that caused the failure.

**IC comparison:** IC should consider crash-time state capture for desync debugging. When a desync is detected (or a crash occurs during sim), automatically serializing the current sim snapshot would enable post-mortem analysis without requiring reproduction.

---

## Part 4: Ranking — Counter-Strike Regional Standings

Valve published their CS2 regional ranking algorithm as open-source JavaScript. This is directly relevant to IC's `RankingProvider` trait (D041/D052).

### 4.1 Glicko Rating System (Adapted)

The implementation uses a modified Glicko system:

```javascript
class GlickoTeam {
    constructor(rank, rd) {
        this.rank = rank;    // Rating (starts at 1500)
        this.rd = rd;        // Rating Deviation (fixed at 75)
    }
}

const Q = Math.log(10) / 400;  // Scaling constant
// 400-point difference ≈ 90% expected win probability
```

Key adaptation: **RD (Rating Deviation) is fixed at 75**, which effectively converts Glicko into an Elo-like system (no uncertainty decay). This simplification makes sense for team-based competitive play where match frequency is high.

### 4.2 Information Content Weighting

The most novel aspect is `informationContent` — a parameter that scales how much a match affects rankings:

- Low-information matches (exhibition, unranked, mismatched tournaments) contribute less to rating changes
- High-information matches (major tournaments, well-matched teams) contribute more
- This prevents rating inflation/deflation from low-quality matches

**IC comparison:** IC's `RankingProvider` trait should support match quality weighting. For IC, information content could be derived from:
1. Game mode (ranked vs. casual)
2. Player count balance (1v1 is higher information than 3v1)
3. Game duration (very short games may indicate disconnection, not skill)
4. Map symmetry rating

### 4.3 Seeding Formula

New teams are seeded using a weighted combination:

```javascript
seed = w1 * bountyCollected +     // Prize money won
       w2 * bountyOffered  +      // Prize money of opponents
       w3 * opponentNetwork +     // Size/quality of opponent network
       w4 * lanFactor              // LAN vs online multiplier
```

The seed is remapped to the 400–2000 rating range.

**IC comparison:** IC could use a similar seeding approach for new players entering ranked play:
1. **Calibration matches** (equivalent to bountyCollected) — direct performance measurement
2. **Opponent quality** (equivalent to opponentNetwork) — who you played against matters
3. The specific factors would differ (no prize money), but the weighted-combination approach to seeding is sound

### 4.4 Ranking Criteria

- Minimum 5 matches played to appear in rankings
- Must have defeated at least 1 distinct opponent
- RD decays over time: `sqrt(rd² + C²*t)` where C=34.6 — inactive players' ratings become less certain

**IC comparison:** These are sensible defaults for IC's ranking system. The 5-match minimum prevents noise; the distinct-opponent requirement prevents collusion (can't rank by repeatedly beating the same person).

### 4.5 Model Validation

Valve validates their ranking model by:
1. Binning expected win rates into 5% buckets
2. Comparing expected vs. observed win rates within each bucket
3. Computing Spearman's rank correlation (ρ = 0.98 — excellent)

**IC comparison:** IC should plan for ranking model validation from day one. This means logging expected win probabilities alongside match results, so the model can be evaluated post-hoc.

---

## Part 5: Renderer Abstraction — ToGL

ToGL is Valve's Direct3D 9 → OpenGL translation layer, extracted from the Dota 2 source tree:

- Implements a subset of Direct3D 9.0c as OpenGL calls
- Includes a **bytecode-level HLSL → GLSL shader translator** (NOT source-level — operates on compiled shader bytecode)
- Supports SM3 features including Multiple Render Targets
- Some Source Engine-specific hardcoding (centroid masks, shadow depth samplers)

**IC comparison:** IC uses Bevy's wgpu abstraction (D002), which already handles backend translation (Vulkan, Metal, DX12, GL). ToGL's approach of bytecode-level shader translation is relevant if IC ever needs to support shader mods that compile on one backend and run on another. However, wgpu + naga already handle this for WGSL. The main lesson: renderer abstraction layers inevitably accumulate engine-specific hacks (see ToGL's hardcoded centroid masks). IC should keep engine-specific rendering knowledge in `ic-render`, not in the abstraction layer.

---

## Part 6: Additional Patterns from Other Repositories

### 6.1 steam-audio: Spatial Audio (Apache-2.0)

Steam Audio provides HRTF-based spatial audio, occlusion, and reverb. It's a standalone C library with bindings for Unity, Unreal, and FMOD.

**IC comparison:** IC's `ic-audio` crate (Phase 3) could potentially use Steam Audio for spatial audio effects. Its Apache-2.0 license is compatible with IC's GPL v3. However, the dependency cost (C library, non-trivial binary size) may not be justified for an isometric 2D game where spatial audio is less critical. Worth evaluating when `ic-audio` design begins.

### 6.2 csgo-demoinfo: Replay File Tooling

Valve provides a public C++ demo file parser for CS:GO. The tool reads `.dem` files and extracts events, player state, and round outcomes.

**IC comparison:** IC should plan for a similar public replay parsing tool — a standalone binary that reads IC replay files and outputs structured data (JSON, CSV). This enables:
1. Community-built statistics sites
2. Tournament analysis tools
3. Anti-cheat review workflows
4. The `ic` CLI could include an `ic replay parse` subcommand

### 6.3 vogl: Debug Tooling

Valve's OpenGL debugger captures and replays GL call streams. Key pattern: the capture/replay model is explicitly designed for debugging, not optimized for performance.

**IC comparison:** IC should separate debug/profiling infrastructure from production code paths. Capture-for-debugging (like sim state recording for desync analysis) should have zero cost when disabled and comprehensive coverage when enabled, matching IC's D031 observability design.

---

## Summary: Actionable Recommendations for IC

### Netcode (highest impact)

| Finding                      | Recommendation                                      | IC Design Impact                |
| ---------------------------- | --------------------------------------------------- | ------------------------------- |
| GNS ack vector model         | Consider ack vectors for relay protocol reliability | Relay protocol design (Phase 5) |
| GNS lanes                    | Add lane-like priority levels to Transport trait    | D054 Transport trait            |
| GNS always-relay for privacy | Already validated by IC's D007                      | Confirms D007                   |
| GNS pluggable signaling      | Abstract signaling in ic-net                        | ic-net trait design             |
| GNS symmetric connect        | Support in P2P mode                                 | Phase 5 P2P                     |
| GNS per-ack RTT measurement  | Embed delay in ack frames; eliminate ping packets   | Relay protocol wire format      |
| GNS loopback socket pairs    | Already validated by IC's LocalNetwork              | Confirms D006                   |
| GNS Nagle batching           | Batch orders within tick, flush at tick boundary    | Order batching strategy         |

### Workshop / Distribution

| Finding                     | Recommendation                              | IC Design Impact       |
| --------------------------- | ------------------------------------------- | ---------------------- |
| VPK indexed archives        | Include manifest/directory at package start | D049 package format    |
| Fossilize content hashing   | Content-addressed asset storage             | D049 Workshop dedup    |
| Fossilize crash-safe writes | Append-only with final header update        | Save format robustness |
| Fossilize CLI toolchain     | Focused ic CLI subcommands                  | D020 Mod SDK           |

### SDK / Modding

| Finding                      | Recommendation                                   | IC Design Impact        |
| ---------------------------- | ------------------------------------------------ | ----------------------- |
| Source tiered architecture   | Validate ic-protocol as the "public/" boundary   | Crate architecture      |
| CNetworkVar change detection | Per-field change tracking for desync diagnostics | ic-sim snapshot diffing |
| VScript API abstraction      | Define modding API independently of Lua runtime  | D024 Lua API design     |
| SPROP_CHANGES_OFTEN          | Prioritize frequently-changing data in encoding  | Snapshot delta format   |

### Ranking / Matchmaking

| Finding                      | Recommendation                                | IC Design Impact      |
| ---------------------------- | --------------------------------------------- | --------------------- |
| Glicko with fixed RD         | Simple, proven rating system                  | D052 RankingProvider  |
| informationContent weighting | Weight matches by mode, balance, duration     | Ranking trait design  |
| Seeding formula              | Calibration matches + opponent quality        | New player onboarding |
| 5-match minimum              | Minimum games before ranking                  | Anti-noise threshold  |
| Model validation methodology | Log expected win probabilities for evaluation | Telemetry design      |

### Serialization / Replay

| Finding                      | Recommendation                                    | IC Design Impact        |
| ---------------------------- | ------------------------------------------------- | ----------------------- |
| StateRecorder/Replayer       | Async background recording of orders + snapshots  | Replay system (Phase 2) |
| Crash-time state capture     | Auto-snapshot on desync detection                 | Desync debugging        |
| Public replay parsing tool   | ic replay parse CLI subcommand                    | D020 CLI design         |
| Delta encoding for snapshots | Property-level diffing for save/replay efficiency | D010 snapshots          |

---

## Appendix: GNS vs IC Transport Trait Comparison

| Aspect               | GNS                                                   | IC Transport (D054)                           |
| -------------------- | ----------------------------------------------------- | --------------------------------------------- |
| Connection model     | Connection-oriented, message-oriented                 | Connection-oriented, message-oriented         |
| Reliability          | Ack vector (DCCP), sender-side retransmit             | "Always run reliability" (per D054)           |
| Reliability exposed? | Yes: reliable + unreliable per message                | No: reliability is internal to Transport      |
| Encryption           | AES-GCM-256 + Curve25519                              | Not specified (D052 uses Ed25519 for signing) |
| Lanes / priorities   | Yes: configurable lanes with priority + weight        | No equivalent                                 |
| NAT traversal        | ICE/WebRTC + STUN/TURN                                | Relay-first (D007)                            |
| Loopback testing     | CreateSocketPair()                                    | LocalNetwork struct                           |
| Signaling            | Pluggable trait (ISteamNetworkingConnectionSignaling) | Not specified                                 |
| P2P mode             | Symmetric connect, optional relay                     | Future consideration                          |
| Wire format          | Transport-agnostic SNP frames                         | TBD                                           |

The table highlights two gaps in IC's current Transport design:
1. **No lane/priority concept** — worth adding as an optional extension
2. **No encryption specification** — should be addressed before Phase 5

Both gaps are addressable without violating any IC architectural invariants.
