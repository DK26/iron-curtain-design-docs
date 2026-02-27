# P2P Content Distribution — Design Study for IC Workshop

> **Purpose:** Study existing P2P and BitTorrent implementations to inform IC's own Workshop distribution engine.
> **Date:** 2026-02-26
> **Referenced by:** D074 (Community Server Bundle), D049 (Workshop Asset Formats & P2P Distribution)
> **Philosophy:** IC defines its own standard. Existing implementations are studied for protocol understanding, architectural patterns, and lessons learned — not as mandatory dependencies. If the best path is a purpose-built P2P engine, that's what gets built.

---

## 1. IC Workshop P2P Requirements

IC's Workshop distributes game content (mods, maps, asset packs, total conversions: 5 MB – 2 GB packages) to players. The distribution system must:

1. **Work across all IC platforms** — desktop (Windows, macOS, Linux), browser (WASM), Steam Deck, mobile (planned)
2. **Scale without infrastructure cost** — popular content should get faster to download, not more expensive to host
3. **Be BitTorrent-compatible** — leverage the proven, battle-tested BitTorrent wire protocol and ecosystem where it makes sense
4. **Include integrated tracking** — peer coordination built into the Workshop server, not a separate service
5. **Support browser↔desktop interop** — WASM builds must participate in the same swarm as desktop clients (via WebRTC)
6. **Provide bandwidth control** — configurable upload/download limits, seeding policies
7. **Use content-aware piece strategies** — rarest-first, endgame mode, lobby-priority seeding (D049)
8. **Be pure Rust** — no C/C++ FFI, no Boost, no OpenSSL dependency chain. WASM compilation must be possible.
9. **Be GPL v3 compatible** — all dependencies must be license-compatible

---

## 2. The BitTorrent Protocol — What IC Needs From It

BitTorrent is a well-specified, battle-tested protocol family. IC's P2P engine should speak standard BT wire protocol where possible (interoperability with existing tools, proven correctness) and extend it where IC's use case demands.

### BEPs (BitTorrent Enhancement Proposals) Relevant to IC

| BEP | Name | IC Relevance |
|-----|------|-------------|
| BEP 3 | The BitTorrent Protocol Specification | Core wire protocol. IC implements this. |
| BEP 5 | DHT Protocol | Decentralized peer discovery. Enables trackerless operation. |
| BEP 9 | Extension for Peers to Send Metadata Files | Magnet link support. Download torrent metadata from peers. |
| BEP 10 | Extension Protocol | Extensibility handshake. IC can advertise custom extensions. |
| BEP 23 | Tracker Returns Compact Peer Lists | Bandwidth-efficient tracker responses. |
| BEP 29 | uTP — Micro Transport Protocol | UDP-based transport that doesn't saturate home connections. |
| BEP 52 | The BitTorrent Protocol Specification v2 | Merkle tree piece hashing. Better integrity, per-file deduplication. May inform IC's content-addressed store (D049). |

### Where IC May Diverge or Extend

- **Package-aware piece prioritization:** Standard BT treats all pieces equally. IC knows which `.icpkg` a piece belongs to, which lobby needs it, and which player requested it. Priority channels (lobby-urgent > user-requested > background) are an IC-specific scheduling layer on top of standard piece selection.
- **Authenticated announce:** IC's tracker requires per-session tokens tied to client identity (D052 Ed25519). Standard BT trackers are anonymous. IC's announce protocol extends the standard with signed authentication.
- **Workshop metadata integration:** Standard BT distributes raw bytes. IC's system integrates with the Workshop registry — manifest lookup, dependency resolution, and version checking happen before the BT transfer begins.
- **WebRTC transport:** Standard BT uses TCP/uTP. Browser builds need WebRTC data channels (the WebTorrent approach). IC implements BT wire protocol over WebRTC for browser↔desktop interop.

---

## 3. Existing Implementations — Study Reference

These are studied for protocol understanding, architectural patterns, and lessons — not as hard dependencies. IC may use components from these where they fit without compromise, but the default stance is to implement what IC needs.

### 3.1 Client Libraries

#### librqbit (Rust)
- **Repository:** github.com/ikatson/rqbit
- **License:** Apache-2.0
- **What to study:** Session-based API design, tokio async architecture, uTP implementation (`librqbit-utp`), DHT implementation, piece selection logic, resume/persistence model. The best reference for how a modern Rust BT client structures its internals.
- **Could IC use it directly?** Possibly as a starting point or dependency for the core BT wire protocol on desktop, if it doesn't constrain IC's requirements. It lacks WebRTC transport, tracker functionality, bandwidth throttling API, and WASM support — all of which IC needs. If IC builds its own P2P engine, librqbit's source is the best Rust-native reference implementation to study.

#### libtorrent-rasterbar (C++)
- **Repository:** github.com/arvidn/libtorrent
- **License:** BSD-3-Clause
- **What to study:** The gold standard for BT implementation. 20+ years of protocol knowledge baked in. Study its piece picker algorithms, choking/unchoking strategies, DHT implementation, uTP congestion control, and bandwidth management. Arvid Norberg's blog posts and design documents are the best available literature on practical BT implementation.
- **Could IC use it directly?** No. C++ dependency chain (Boost, OpenSSL) prevents WASM. All Rust bindings are abandoned. But its source code and documentation are invaluable reference material for anyone implementing BT from scratch.

#### webtorrent-rs (Rust)
- **Repository:** crates.io/crates/webtorrent-rs
- **License:** Unknown
- **What to study:** WebRTC transport implementation over BT wire protocol. The only Rust attempt at WebTorrent. Maintainer warns it's experimental ("vibe-coded"). Study for architectural ideas on bridging WebRTC and BT, not as a dependency.

#### WebTorrent (JavaScript)
- **Repository:** github.com/webtorrent/webtorrent
- **License:** MIT
- **What to study:** The canonical WebTorrent implementation. How it bridges standard BT peers and WebRTC peers. Signaling via WebSocket trackers. The hybrid swarm model where desktop and browser clients interoperate. This is the reference for IC's browser↔desktop interop design.

### 3.2 Tracker Implementations

#### aquatic (Rust)
- **Repository:** github.com/greatest-ape/aquatic
- **License:** Apache-2.0
- **What to study:** High-performance pure-Rust tracker. `aquatic_udp` handles standard UDP tracker protocol. `aquatic_ws` handles WebTorrent signaling via WebSocket — the critical piece for browser peer discovery. Production-proven at ~80K req/s. Study its protocol crates (`aquatic_udp_protocol`, `aquatic_ws_protocol`) for the tracker protocol implementation details.
- **Could IC use it?** The protocol crates could potentially be used to implement IC's embedded tracker. The standalone server binaries require Linux 5.8+ (io_uring) and are designed as separate processes, not embeddable libraries. IC may implement its own tracker using aquatic's protocol crates as a foundation, or implement the (relatively simple) tracker protocol from scratch to avoid the io_uring constraint.

#### Torrust Tracker (Rust)
- **Repository:** github.com/torrust/torrust-tracker
- **License:** AGPL-3.0-only
- **What to study:** More portable than aquatic (Axum-based, no io_uring). SQLite/MySQL persistence. Management API. Study for tracker administration patterns. **Cannot be embedded** due to AGPL-3.0 license — would require making the entire engine source available to network users.

#### chihaya (Go)
- **Repository:** github.com/chihaya/chihaya
- **License:** BSD-2-Clause
- **What to study:** Pluggable middleware architecture. Used at scale by Facebook. Study for tracker extensibility patterns (pre-hook, post-hook middleware for rate limiting, authentication, metrics).

### 3.3 Related P2P Systems (Non-BitTorrent)

#### IPFS / libp2p
- **What to study:** Content-addressed storage (CAS) model — IC already uses CAS for Workshop blobs (D049). libp2p's modular transport architecture (TCP, WebRTC, QUIC as swappable transports). Rust implementation (`rust-libp2p`) is mature.
- **Relevance:** IC's CAS blob store (SHA-256 addressed) is conceptually similar to IPFS. The transport modularity pattern (trait-based transport selection) aligns with IC's `NetworkModel` trait philosophy.

#### Dat / Hypercore Protocol
- **What to study:** Append-only merkle tree structure. Version-aware content distribution. Relevant to Workshop's versioned packages — a new version of a mod shares unchanged pieces with the previous version.

---

## 4. Architectural Decisions for IC's P2P Engine

Based on studying the above, here are the key architectural questions and the IC-appropriate answers:

### Build vs. Adopt

| Component | Decision | Reasoning |
|-----------|---------|-----------|
| **BT wire protocol** | Build (or adapt from librqbit if it fits) | Core to IC's functionality. Must support IC-specific extensions (auth, priority channels, WebRTC transport). Too important to be constrained by an external library's API. |
| **BT tracker protocol** | Build (potentially using aquatic protocol crates) | Simple protocol. IC needs it embedded in `ic-server`, not as a separate process. Must integrate with IC's authenticated announce. |
| **WebRTC transport** | Build | No production Rust implementation exists. IC implements BT wire protocol over WebRTC data channels using `web-sys` (browser) and a native WebRTC stack (desktop bridge). |
| **DHT** | Adopt or build | DHT (BEP 5) is complex but well-specified. Could use librqbit's DHT implementation if available as a standalone crate, or implement from the BEP spec. |
| **uTP** | Adopt or build | uTP (BEP 29) is a UDP congestion control protocol. `librqbit-utp` is a standalone crate that could be used directly. Alternatively, QUIC (via `quinn`) provides similar benefits with modern TLS. |
| **Bencode** | Adopt | Trivial format. Multiple Rust crates exist (`serde_bencode`, `bt_bencode`). No reason to rewrite. |

### Transport Strategy

```
Desktop (Windows/macOS/Linux)
├── TCP     — standard BT, always available
├── uTP     — UDP-based, doesn't saturate connections
└── WebRTC  — for bridging with browser peers (Workshop server acts as bridge)

Browser (WASM)
└── WebRTC  — only option, via web-sys / WebRTC data channels

Workshop Server (ic-server with workshop capability)
├── TCP     — seeds to desktop peers
├── uTP     — seeds to desktop peers
└── WebRTC  — seeds to browser peers, bridges the two swarms
```

The Workshop server is the **bridge node** — it speaks all transports simultaneously, allowing desktop and browser clients to participate in the same logical swarm even though they can't connect directly.

### Peer Scoring & Piece Selection

IC's piece selection is more sophisticated than standard BT because IC has domain knowledge:

1. **Lobby-urgent priority:** When a player joins a lobby and needs a mod, that mod's pieces get maximum priority across all peers in the lobby. Peers who already have the content seed directly to the joining player.
2. **Rarest-first within priority tier:** Standard BT rarest-first within each priority level.
3. **Endgame mode:** For the last ~5 pieces, duplicate requests to multiple peers to prevent stall.
4. **Background pre-fetch:** Popular/trending content can be pre-fetched during idle time.

Peer scoring (D049 § peer scoring) uses a weighted multi-dimensional score:
```
PeerScore = Capacity(0.4) + Locality(0.3) + SeedStatus(0.2) + LobbyContext(0.1)
```

### The Workshop Server as Permanent Seed

The Workshop capability in `ic-server` is not a web server that also seeds — it is a **BitTorrent seeder that also serves metadata**:

1. Permanently seeds all hosted content via BT wire protocol
2. Runs an embedded tracker for peer coordination
3. Serves a thin REST API for package manifests, search, and dependency resolution
4. Bridges desktop and browser swarms via dual TCP+WebRTC transport

"Hosting a Workshop" = running a dedicated P2P seeder. The metadata API is secondary. The bytes flow over BitTorrent.

---

## 5. Existing Ecosystem Landscape Summary

| Project | Language | License | IC Use |
|---------|----------|---------|--------|
| librqbit | Rust | Apache-2.0 | **Study reference.** Best Rust BT implementation. Possible component if it doesn't constrain IC. |
| libtorrent-rasterbar | C++ | BSD-3 | **Study reference only.** Best BT docs and algorithms. Cannot embed (C++, no WASM). |
| aquatic | Rust | Apache-2.0 | **Study reference.** Protocol crates may be usable for tracker. |
| WebTorrent (JS) | JavaScript | MIT | **Study reference.** Canonical WebRTC↔BT bridge design. |
| webtorrent-rs | Rust | Unknown | **Study reference.** Only Rust WebTorrent attempt. Experimental. |
| Torrust | Rust | AGPL-3.0 | **Study reference only.** License prevents embedding. |
| chihaya | Go | BSD-2 | **Study reference only.** Middleware architecture patterns. |
| libp2p (Rust) | Rust | MIT | **Study reference.** Transport modularity, CAS model. |
| Transmission | C | GPL-2.0 | **Not usable.** License incompatible, not embeddable. |

---

## 6. Key Lessons from Studying the Ecosystem

1. **The BT wire protocol is simple.** The hard parts are DHT, uTP congestion control, and WebRTC signaling — not the core peer-to-peer transfer. IC can implement the wire protocol straightforwardly.

2. **WebRTC↔BT bridging is an unsolved problem in Rust.** No production library exists. WebTorrent (JS) proves the concept works. IC will need to build this — it's the hardest piece, but also the most valuable (enables browser builds to participate in Workshop P2P).

3. **Trackers are trivially simple.** The tracker protocol is a thin announce/scrape API. IC should embed this directly in `ic-server` rather than depending on an external tracker. The only complexity is WebSocket signaling for WebTorrent peers, which aquatic's protocol crates document well.

4. **Content-addressed storage is the right model.** Both IPFS and IC's Workshop (D049) use SHA-256 content addressing. This enables cross-version deduplication — when a mod updates, only changed pieces need re-downloading.

5. **uTP vs. QUIC is an open question.** Standard BT uses uTP (BEP 29) for UDP transport. QUIC (`quinn` crate, pure Rust, mature) provides similar congestion control with modern TLS and multiplexing. IC could speak uTP for BT compatibility and QUIC for IC-to-IC optimized transfers. This is a future optimization, not a Phase 4–5 requirement.

6. **Peer scoring with domain knowledge is IC's advantage.** Standard BT clients are generic. IC knows which lobby a player is in, which mod they need, how popular content is, and where peers are geographically. This domain knowledge produces better piece selection than any generic BT client can achieve.
