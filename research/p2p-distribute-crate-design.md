# `p2p-distribute` — Standalone P2P Content Distribution Engine

> **Purpose:** A foundational, general-purpose P2P content distribution engine. Iron Curtain is the primary consumer — using it across Workshop delivery, lobby auto-download, community server seeding, replay distribution, and update delivery — but the crate is designed as domain-agnostic infrastructure suitable for any application that needs to move content between peers efficiently: game engines, package managers, media platforms, IoT firmware delivery, and beyond. No existing Rust crate meets the combined requirements — WebRTC browser interop, embeddable tracker, priority-aware scheduling, content channels, revocation infrastructure, "all knobs" configurability, and WASM support — so we build our own. This document is the complete design specification for that crate.
> **Date:** 2026-03-05
> **License:** MIT OR Apache-2.0 (D076 Tier 3 standalone crate — separate repo, no GPL code)
> **Referenced by:** D049 (Workshop P2P distribution), D074 (Community Server Bundle), D076 (Standalone Crate Extraction Strategy)
> **References:** `research/p2p-engine-protocol-design.md` (wire protocol), `research/bittorrent-p2p-libraries.md` (ecosystem study), `src/modding/workshop.md` (Workshop integration)

---

## 0. Executive Summary

### Why This Exists

Iron Curtain needs P2P content distribution across multiple subsystems — Workshop mod/map delivery (D049/D030), lobby auto-download, community server seeding (D074), replay distribution, and game update delivery — and no existing Rust crate meets the combined requirements. Beyond IC, the same problem recurs in every domain that moves versioned content between parties: package managers, AI model distribution, media platforms, IoT firmware, federated social networks, plugin ecosystems.

`p2p-distribute` is designed as **foundational infrastructure** — a crate that IC depends on broadly, and that other projects can depend on for entirely different use cases. IC uses the features it needs (embeddable sessions, priority scheduling, embedded tracker, WebRTC browser interop, revocation-aware block lists); a media platform uses what it needs (streaming piece selection, content channels); a package manager uses what it needs (integrity, revocation, CAS storage). The crate is capability-rich; consumers are selective.

The requirements that drove the build-over-adopt decision:

- **Embeddable library** — runs inside game clients, server binaries, CLI tools, and any application
- **WebRTC transport** — browser ↔ desktop peer interop for WASM targets
- **Embedded tracker** — self-contained tracker+seeder nodes for community/enterprise deployments
- **Priority-aware scheduling** — lobby-urgent downloads preempt background seeding (generalizes to any multi-priority consumer)
- **Content channels** — append-only streams of versioned snapshots for mutable/streaming content (live configs, feeds, incremental updates)
- **Revocation infrastructure** — block lists, tracker de-listing, and revocation-aware piece transfer for supply chain security
- **Streaming piece selection** — sequential/hybrid strategies for progressive playback and preview-during-download
- **Extensible auth and storage** — pluggable via traits; IC uses Ed25519 community auth (D052) and CAS storage (D049)
- **"All knobs" configurability** — server operators, LAN party hosts, embedded clients, and autonomous agents all need different tuning

No existing Rust crate meets these requirements. `librqbit` (the closest) lacks WebRTC, embedded tracker, bandwidth scheduling, and WASM support. So we build our own.

### What It Is

`p2p-distribute` is a single published Rust crate that implements a BitTorrent-compatible P2P content distribution engine. It is a **foundational infrastructure library** — embeddable in game clients, server binaries, CLI tools, package managers, media players, IoT controllers, and any application that needs efficient peer-to-peer content transfer. Optional surfaces (web API, CLI, metrics) are gated behind feature flags.

The crate has **zero IC dependencies**. IC-specific behavior (auth, CAS storage, lobby priority) is injected at runtime via extensibility traits. This separation is required by D076 (standalone MIT/Apache-2.0 crate in a separate repo, no GPL contamination). Iron Curtain is the primary consumer and validation benchmark, but the crate's API is domain-agnostic.

**Competitive position:** Fills a gap in the Rust ecosystem. `librqbit` is the closest prior art (Apache-2.0, tokio-based) but lacks WebRTC transport, embedded tracker, bandwidth throttling API, content channels, revocation infrastructure, WASM support, and the "all knobs" configuration depth of `libtorrent-rasterbar`. `p2p-distribute` targets the intersection: `librqbit`'s Rust-native purity with `libtorrent`'s configurability and protocol completeness, plus capabilities no existing BT library offers (content channels, revocation-aware transfers, streaming piece strategies).

### Guiding Principles

1. **Foundational infrastructure, IC-validated.** The crate is designed as general-purpose P2P infrastructure. IC is the primary consumer and validation benchmark — every feature traces to a real requirement from IC or its planned sibling projects (D050). The crate is useful to anyone because it solves universal distribution problems, not as a side effect of clean boundaries.
2. **Library-first.** The crate is a Rust library with a clean `Session` API. CLI, web API, and metrics are optional feature-gated surfaces.
3. **One crate, feature-gated surfaces.** A single published crate name. Compile-time feature flags control which protocol extensions (DHT, uTP, PEX), transports (WebRTC), and surfaces (CLI, web API, metrics) are included.
4. **MIT OR Apache-2.0.** Maximally permissive. No GPL code copied — BEP specs, permissive references (librqbit Apache-2.0, WebTorrent MIT, aquatic Apache-2.0, chihaya BSD-2), and clean-room implementation from protocol specifications only.
5. **All knobs.** Every behavioral parameter is configurable at runtime. Safe defaults via named profiles. Power users can tune everything `libtorrent-rasterbar` exposes and more.
6. **Safe by default.** The `default` feature set is small and safe for embedding. `full` enables everything. Profiles provide sane defaults for common deployment shapes.
7. **Protocol-complete.** All major modern BitTorrent capabilities: v1, v2, hybrid, DHT, PEX, LSD, uTP, encryption, magnet links, NAT traversal, WebRTC (browser interop).

### Non-Goals

- **No GUI.** This is a library. GUI clients are built on top of the API.
- **No torrent search/scraping.** No built-in torrent site integration. Discovery of .torrent files / magnet links is the caller's responsibility. An optional `Resolver`/`DiscoveryBackend` trait allows external plugins.
- **No hardcoded IC logic.** IC-specific behavior lives in IC's crates, injected via traits. The P2P engine never imports IC types.

---

## 1. Build vs. Adopt — Why We Build Our Own

This section records the decision to build a purpose-built P2P engine rather than adopt an existing crate. It is preserved here so the rationale is available when the decision is questioned in the future.

### The Ecosystem as of 2026

The Rust BitTorrent ecosystem has one serious client library (`librqbit`, Apache-2.0), one high-performance tracker (`aquatic`, Apache-2.0, Linux-only), one AGPL tracker (`Torrust`, license-incompatible), and zero production WebRTC↔BT bridges. The JavaScript ecosystem has `WebTorrent` (MIT), which proves the browser↔desktop concept but is not usable from Rust/WASM.

### IC's Hard Requirements vs. librqbit (Best Candidate)

| IC Requirement                                                               | librqbit                         | Verdict   |
| ---------------------------------------------------------------------------- | -------------------------------- | --------- |
| Embeddable library (Session API, tokio)                                      | Yes                              | ✅ Fits    |
| WebRTC transport (WASM browser ↔ desktop interop)                            | No — TCP/uTP only                | ❌ Blocker |
| Embedded tracker (ic-server is tracker+seeder)                               | No — client only                 | ❌ Blocker |
| Priority-aware piece scheduling (lobby-urgent / user-requested / background) | No — standard rarest-first only  | ❌ Blocker |
| Pluggable auth via traits (Ed25519 community tokens, D052)                   | No extension mechanism           | ❌ Blocker |
| "All knobs" runtime config for server operators                              | Partial — limited runtime config | ⚠️ Gap     |
| WASM compilation target                                                      | No                               | ❌ Blocker |

**Four hard blockers, one gap.** `librqbit` covers roughly 30% of what IC needs. Forking and extending it to cover the remaining 70% would require rearchitecting its transport layer (not pluggable), adding an embedded tracker (not designed for this), building a priority scheduling system (would conflict with its piece picker), and adding extension handshake infrastructure (no BEP 10 trait API). The estimated effort to fork-and-extend is 25–35 weeks — only ~10 weeks less than building clean, but with inherited architectural constraints and upstream maintenance burden for code we didn't design.

### Component-Level Build vs. Adopt

Not everything needs building from scratch. The decision is granular — build the orchestration layer, adopt leaf-node crates:

**Build (IC-specific requirements, no suitable crate exists):**

| Component                             | Why Build                                                                                                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BT wire protocol layer                | Must support pluggable transports (TCP, uTP, WebRTC over the same peer wire abstraction). No existing crate abstracts transport this way.                                                                       |
| Piece picker with priority channels   | IC's lobby-urgent / user-requested / background scheduling is unique to game engine content delivery. No generic BT client has this.                                                                            |
| Choking algorithm with domain scoring | `PeerScore = Capacity(0.4) + Locality(0.3) + SeedStatus(0.2) + LobbyContext(0.1)` — IC's game-context-aware scoring is a competitive advantage over generic BT.                                                 |
| Embedded tracker                      | Must live inside `ic-server`, support authenticated announce (Ed25519), and bridge WebSocket signaling for browser peers. No embeddable Rust tracker exists (Torrust is AGPL, aquatic requires io_uring/Linux). |
| Session / config / profile system     | The "all knobs" API with layered config, runtime mutation, and named profiles. This is the integration surface between the P2P engine and every IC consumer.                                                    |
| Extension handshake infrastructure    | BEP 10 with IC's auth and priority extensions negotiated via extensibility traits (`AuthPolicy`, `PeerFilter`, `RatePolicy`).                                                                                   |

**Adopt (well-solved problems, quality crates exist):**

| Component                      | Crate                                                        | License           | Why Adopt                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Bencode codec                  | `serde_bencode` or `bt_bencode`                              | MIT               | Trivial, well-tested. No reason to rewrite serialization for a stable format.                                               |
| SHA-1 / SHA-256 hashing        | `sha1` / `sha2`                                              | MIT OR Apache-2.0 | Crypto primitives — always adopt, never roll your own.                                                                      |
| WebRTC data channels           | `str0m` or `webrtc-rs` (native), `web-sys` (WASM)            | MIT OR Apache-2.0 | WebRTC stack is massive (DTLS, SCTP, ICE, SDP). Building this would dwarf the entire P2P engine effort.                     |
| uTP transport                  | Evaluate `librqbit-utp` (if standalone) or build from BEP 29 | Apache-2.0        | Complex congestion control (LEDBAT). Reuse if the crate is cleanly separable; build if it drags in librqbit internals.      |
| QUIC (future uTP alternative)  | `quinn`                                                      | MIT OR Apache-2.0 | Mature, well-maintained. Modern TLS + multiplexing. Future optimization path for IC-to-IC transfers.                        |
| Tracker protocol serialization | Evaluate `aquatic_udp_protocol` / `aquatic_ws_protocol`      | Apache-2.0        | Simple announce/scrape message types. Use if they work without io_uring dependency; build if not (the protocol is trivial). |
| Async runtime                  | `tokio`                                                      | MIT               | Industry standard. No alternative for async Rust at this scale.                                                             |

### Cost/Benefit Summary

| Path                                         | Estimated Effort | Outcome                                                                                                                                                                                                                    |
| -------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build with targeted adoption** (this plan) | ~35–45 weeks     | Architecture designed around IC's transport abstraction from day one. Clean extensibility traits. No upstream dependency risk. Full control of every behavioral parameter. MIT/Apache-2.0 with no license ambiguity.       |
| **Fork + extend librqbit**                   | ~25–35 weeks     | ~10 weeks faster to first download. But: fight existing architecture at every extension point (transport, tracker, priority, auth). Inherit maintenance burden for code we didn't design. Single-maintainer upstream risk. |
| **Wrap libtorrent-rasterbar via FFI**        | Not viable       | C++ dependency chain (Boost, OpenSSL). No WASM. No iOS/Android. Abandoned Rust bindings.                                                                                                                                   |
| **Use libp2p instead of BitTorrent**         | ~40–50 weeks     | Powerful but over-engineered for file transfer. Different wire protocol means no interop with standard BT clients/tools. Larger binary, more complexity, unfamiliar protocol for community server operators.               |

### Decision

**Build `p2p-distribute` as a purpose-built crate, adopting leaf-node dependencies (bencode, crypto, WebRTC stack, async runtime) but owning the core orchestration.** The ~10-week delta vs. forking buys architectural fitness, long-term maintainability, and zero upstream risk — a worthwhile trade for infrastructure that IC will depend on for its entire lifetime.

This decision was evaluated 2026-03-03 against the Rust P2P ecosystem as it existed at that date. If a Rust crate emerges that covers IC's WebRTC + embedded tracker + priority scheduling + pluggable auth requirements, the decision should be revisited — but as of this writing, no such crate exists or is on a trajectory to exist.

---

## 2. Public API (Library-First)

### 1.1 Core Session API

```rust
use std::path::PathBuf;
use std::time::Duration;

/// The top-level session. Manages all torrents, connections, and background tasks.
/// Constructed via `SessionBuilder` or `Session::new(config)`.
///
/// The session owns a tokio runtime (or runs on a caller-provided runtime).
/// All public methods are `&self` — the session is internally synchronized.
pub struct Session { /* ... */ }

/// Builder for constructing a Session with layered configuration.
pub struct SessionBuilder { /* ... */ }

/// Handle to a single torrent within a session. Cheaply cloneable (Arc-backed).
/// Dropped handles do not remove the torrent — use `TorrentHandle::remove()`.
pub struct TorrentHandle { /* ... */ }

/// How to add a torrent: .torrent file, magnet URI, or info hash.
pub enum TorrentSource {
    /// Path to a .torrent file on disk.
    TorrentFile(PathBuf),
    /// In-memory .torrent bytes.
    TorrentBytes(Vec<u8>),
    /// Magnet URI string (BEP 9 metadata exchange).
    MagnetUri(String),
    /// Raw info hash (requires DHT or tracker for metadata).
    InfoHash(InfoHash),
}

/// Per-torrent options that override session-level defaults.
#[derive(Debug, Clone, Default)]
pub struct AddTorrentOptions {
    /// Override download directory for this torrent.
    pub download_dir: Option<PathBuf>,
    /// Override rate limits for this torrent.
    pub rate_limits: Option<RateLimits>,
    /// Piece priority overrides (index → priority).
    pub piece_priorities: Option<Vec<(u32, PiecePriority)>>,
    /// File priority overrides (file index → priority).
    pub file_priorities: Option<Vec<(usize, FilePriority)>>,
    /// Tags for categorization and policy inheritance.
    pub tags: Vec<String>,
    /// Start paused (do not begin downloading).
    pub start_paused: bool,
    /// Sequential download mode (disable rarest-first).
    pub sequential: bool,
    /// Seeding goals that override session defaults.
    pub seeding_goals: Option<SeedingGoals>,
    /// Custom storage backend for this torrent (overrides session default).
    pub storage: Option<Box<dyn StorageBackend>>,
    /// Priority channel (for applications with multi-tier scheduling).
    pub priority: Option<PriorityChannel>,
}

impl Session {
    /// Create a new session from a fully resolved configuration.
    pub async fn new(config: SessionConfig) -> Result<Self, SessionError>;

    /// Add a torrent to the session.
    pub async fn add_torrent(
        &self,
        source: TorrentSource,
        options: AddTorrentOptions,
    ) -> Result<TorrentHandle, AddTorrentError>;

    /// Subscribe to session-level events.
    pub fn events(&self) -> impl Stream<Item = SessionEvent>;

    /// Get aggregate session statistics.
    pub fn stats(&self) -> SessionStats;

    /// List all torrent handles in this session.
    pub fn torrents(&self) -> Vec<TorrentHandle>;

    /// Find a torrent by info hash.
    pub fn find_torrent(&self, info_hash: &InfoHash) -> Option<TorrentHandle>;

    /// Apply a runtime configuration override. Takes effect immediately.
    pub fn set_config(&self, overrides: ConfigOverride) -> Result<(), ConfigError>;

    /// Get the current effective configuration.
    pub fn config(&self) -> &SessionConfig;

    /// Graceful shutdown: stop all torrents, save resume data, close connections.
    pub async fn shutdown(self) -> Result<(), SessionError>;

    /// Save resume data for all torrents (for crash recovery / fast restart).
    pub async fn save_resume_data(&self) -> Result<(), SessionError>;
}

impl TorrentHandle {
    /// Pause downloading/uploading for this torrent.
    pub async fn pause(&self) -> Result<(), TorrentError>;

    /// Resume a paused torrent.
    pub async fn resume(&self) -> Result<(), TorrentError>;

    /// Remove this torrent from the session.
    /// If `delete_files` is true, also removes downloaded data.
    pub async fn remove(self, delete_files: bool) -> Result<(), TorrentError>;

    /// Set piece-level priorities.
    pub fn set_piece_priorities(&self, priorities: &[(u32, PiecePriority)]);

    /// Set file-level priorities (mapped to piece priorities internally).
    pub fn set_file_priorities(&self, priorities: &[(usize, FilePriority)]);

    /// Set per-torrent rate limits.
    pub fn set_rate_limits(&self, limits: RateLimits);

    /// Set seeding goals for this torrent.
    pub fn set_seeding_goals(&self, goals: SeedingGoals);

    /// Force a piece recheck (re-verify all pieces from disk).
    pub async fn recheck(&self) -> Result<(), TorrentError>;

    /// Force a tracker re-announce.
    pub async fn reannounce(&self) -> Result<(), TorrentError>;

    /// Subscribe to torrent-level events.
    pub fn events(&self) -> impl Stream<Item = TorrentEvent>;

    /// Get current torrent statistics.
    pub fn stats(&self) -> TorrentStats;

    /// Get metadata (torrent info: name, files, piece count, etc.).
    /// Returns None if metadata hasn't been acquired yet (magnet link).
    pub fn metadata(&self) -> Option<&TorrentMetadata>;

    /// Get per-peer connection info.
    pub fn peers(&self) -> Vec<PeerStats>;

    /// Get per-tracker status.
    pub fn trackers(&self) -> Vec<TrackerStatus>;

    /// Get per-file progress.
    pub fn file_progress(&self) -> Vec<FileProgress>;

    /// Get piece availability map (how many peers have each piece).
    pub fn piece_availability(&self) -> Vec<u32>;

    /// The info hash for this torrent.
    pub fn info_hash(&self) -> InfoHash;

    /// Move completed files to a new directory.
    pub async fn move_storage(&self, new_path: PathBuf) -> Result<(), TorrentError>;

    /// Apply a torrent-level config override.
    pub fn set_config(&self, overrides: TorrentConfigOverride);
}

impl SessionBuilder {
    pub fn new() -> Self;

    /// Load a profile as the base configuration.
    pub fn profile(self, profile: Profile) -> Self;

    /// Apply a TOML/YAML/JSON config file on top of the current config.
    pub fn config_file(self, path: PathBuf) -> Result<Self, ConfigError>;

    /// Apply programmatic overrides.
    pub fn config_override(self, overrides: ConfigOverride) -> Self;

    /// Set a custom storage backend factory.
    pub fn storage_backend(self, factory: Box<dyn StorageBackendFactory>) -> Self;

    /// Set a custom peer filter.
    pub fn peer_filter(self, filter: Box<dyn PeerFilter>) -> Self;

    /// Set a custom rate policy.
    pub fn rate_policy(self, policy: Box<dyn RatePolicy>) -> Self;

    /// Set a custom discovery backend.
    pub fn discovery_backend(self, backend: Box<dyn DiscoveryBackend>) -> Self;

    /// Set a custom auth policy.
    pub fn auth_policy(self, policy: Box<dyn AuthPolicy>) -> Self;

    /// Set a custom metrics sink.
    pub fn metrics_sink(self, sink: Box<dyn MetricsSink>) -> Self;

    /// Set a custom log sink.
    pub fn log_sink(self, sink: Box<dyn LogSink>) -> Self;

    /// Build the session.
    pub async fn build(self) -> Result<Session, SessionError>;
}
```

### 1.2 Event Streaming

```rust
/// Session-level events.
#[derive(Debug, Clone)]
pub enum SessionEvent {
    /// A torrent was added.
    TorrentAdded { info_hash: InfoHash },
    /// A torrent finished downloading all pieces.
    TorrentCompleted { info_hash: InfoHash },
    /// A torrent was removed.
    TorrentRemoved { info_hash: InfoHash },
    /// A torrent encountered an error.
    TorrentError { info_hash: InfoHash, error: TorrentError },
    /// Session-level rate limit changed.
    RateLimitChanged { upload: Option<u64>, download: Option<u64> },
    /// DHT bootstrap completed.
    DhtReady { node_count: usize },
    /// NAT traversal port mapped.
    PortMapped { protocol: &'static str, external_port: u16 },
    /// External IP discovered.
    ExternalIpDiscovered { ip: std::net::IpAddr },
    /// Session is shutting down.
    ShuttingDown,
    /// Periodic session stats snapshot.
    StatsSnapshot(SessionStats),
}

/// Per-torrent events.
#[derive(Debug, Clone)]
pub enum TorrentEvent {
    /// Metadata acquired (from magnet link / peers).
    MetadataReceived,
    /// A piece was verified and completed.
    PieceCompleted { piece_index: u32 },
    /// All pieces completed — torrent is now seeding.
    DownloadCompleted,
    /// A peer connected.
    PeerConnected { peer_id: PeerId, addr: std::net::SocketAddr },
    /// A peer disconnected.
    PeerDisconnected { peer_id: PeerId, reason: DisconnectReason },
    /// Tracker announce succeeded.
    TrackerAnnounceOk { tracker_url: String, peers: usize, interval: Duration },
    /// Tracker announce failed.
    TrackerAnnounceFailed { tracker_url: String, error: String },
    /// A piece failed hash verification (bad data from peer).
    PieceHashFailed { piece_index: u32, peer: PeerId },
    /// Seeding goal reached.
    SeedingGoalReached { goal: SeedingGoalType },
    /// Torrent state changed (downloading → seeding, paused, etc.).
    StateChanged { old: TorrentState, new: TorrentState },
    /// File completed (all pieces belonging to this file are done).
    FileCompleted { file_index: usize },
    /// Alert: peer banned for protocol violation or bad data.
    PeerBanned { peer_id: PeerId, reason: BanReason },
    /// Torrent moved to new storage location.
    StorageMoved { new_path: PathBuf },
    /// Fast resume data loaded (skipped piece verification).
    FastResumeLoaded { verified_pieces: u32, total_pieces: u32 },
}

/// Torrent lifecycle states.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TorrentState {
    /// Resolving metadata from magnet link / peers.
    FetchingMetadata,
    /// Verifying existing pieces on disk (recheck).
    Checking,
    /// Actively downloading pieces.
    Downloading,
    /// All pieces present; actively uploading to peers.
    Seeding,
    /// Paused by user. No network activity.
    Paused,
    /// Stopped: seeding goal reached or removed from queue.
    Stopped,
    /// Error state: unrecoverable I/O or protocol error.
    Error,
    /// Queued: waiting for an active slot.
    Queued,
    /// Moving storage to new location.
    MovingStorage,
}
```

### 1.3 Statistics

```rust
/// Aggregate session statistics.
#[derive(Debug, Clone)]
pub struct SessionStats {
    /// Total bytes uploaded across all torrents since session start.
    pub total_uploaded: u64,
    /// Total bytes downloaded across all torrents since session start.
    pub total_downloaded: u64,
    /// Current aggregate upload rate (bytes/sec).
    pub upload_rate: u64,
    /// Current aggregate download rate (bytes/sec).
    pub download_rate: u64,
    /// Number of torrents in each state.
    pub torrent_counts: TorrentStateCounts,
    /// Total number of connected peers across all torrents.
    pub peer_count: usize,
    /// DHT node count (if DHT enabled).
    pub dht_nodes: Option<usize>,
    /// Number of open connections.
    pub open_connections: usize,
    /// Disk cache statistics.
    pub disk_cache: DiskCacheStats,
    /// Number of half-open connections.
    pub half_open_connections: usize,
    /// Uptime since session creation.
    pub uptime: Duration,
}

/// Per-torrent statistics.
#[derive(Debug, Clone)]
pub struct TorrentStats {
    pub state: TorrentState,
    pub info_hash: InfoHash,
    /// Total bytes of content (from metadata).
    pub total_size: u64,
    /// Bytes we have verified.
    pub downloaded_total: u64,
    /// Bytes downloaded this session (wire bytes, including overhead).
    pub downloaded_session: u64,
    /// Bytes uploaded this session.
    pub uploaded_session: u64,
    /// Current download rate (bytes/sec).
    pub download_rate: u64,
    /// Current upload rate (bytes/sec).
    pub upload_rate: u64,
    /// Completion fraction (0.0 – 1.0).
    pub progress: f64,
    /// Number of pieces completed / total.
    pub pieces_completed: u32,
    pub pieces_total: u32,
    /// Number of connected peers.
    pub peers_connected: usize,
    /// Number of peers in the swarm (from tracker).
    pub peers_total: usize,
    /// Seeds in swarm.
    pub seeds_total: usize,
    /// Current share ratio for this torrent.
    pub ratio: f64,
    /// ETA to completion (None if seeding or unknown).
    pub eta: Option<Duration>,
    /// Time spent in active download.
    pub active_duration: Duration,
    /// Number of corrupt pieces received (and discarded).
    pub corrupt_pieces: u64,
    /// Number of hash check failures.
    pub hash_failures: u64,
    /// Time added to session.
    pub added_at: std::time::SystemTime,
    /// Time download completed (None if still downloading).
    pub completed_at: Option<std::time::SystemTime>,
}

/// Per-peer statistics.
#[derive(Debug, Clone)]
pub struct PeerStats {
    pub peer_id: PeerId,
    pub addr: std::net::SocketAddr,
    pub transport: TransportType,
    pub client_name: Option<String>,
    pub upload_rate: u64,
    pub download_rate: u64,
    pub uploaded_to: u64,
    pub downloaded_from: u64,
    pub am_choking: bool,
    pub peer_choking: bool,
    pub am_interested: bool,
    pub peer_interested: bool,
    pub pieces_available: u32,
    pub pending_requests: u32,
    pub connection_duration: Duration,
    pub flags: PeerFlags,
}
```

### 1.4 Extensibility Traits

```rust
/// Pluggable storage backend. Default implementation: filesystem.
/// Custom implementations: memory-only, content-addressed store, IndexedDB (WASM).
pub trait StorageBackend: Send + Sync + 'static {
    /// Read a block of data from a piece.
    fn read_block(
        &self,
        piece_index: u32,
        offset: u32,
        length: u32,
    ) -> impl Future<Output = Result<Vec<u8>, StorageError>> + Send;

    /// Write a block of data to a piece.
    fn write_block(
        &self,
        piece_index: u32,
        offset: u32,
        data: &[u8],
    ) -> impl Future<Output = Result<(), StorageError>> + Send;

    /// Check if a piece exists and is readable (for fast resume).
    fn piece_exists(&self, piece_index: u32) -> impl Future<Output = bool> + Send;

    /// Pre-allocate storage for all pieces (optional optimization).
    fn preallocate(
        &self,
        total_size: u64,
    ) -> impl Future<Output = Result<(), StorageError>> + Send;

    /// Flush buffered writes to durable storage.
    fn flush(&self) -> impl Future<Output = Result<(), StorageError>> + Send;

    /// Move all data to a new directory.
    fn move_to(
        &self,
        new_path: PathBuf,
    ) -> impl Future<Output = Result<(), StorageError>> + Send;
}

/// Factory for creating storage backends (one per torrent).
pub trait StorageBackendFactory: Send + Sync + 'static {
    fn create(
        &self,
        info_hash: &InfoHash,
        metadata: &TorrentMetadata,
        download_dir: &Path,
    ) -> Result<Box<dyn StorageBackend>, StorageError>;
}

/// Pluggable peer discovery. Default: tracker + DHT + PEX + LSD.
/// Custom: application-specific discovery (lobby peers, seed lists).
pub trait DiscoveryBackend: Send + Sync + 'static {
    /// Discover peers for the given info hash.
    fn discover(
        &self,
        info_hash: &InfoHash,
    ) -> impl Future<Output = Vec<std::net::SocketAddr>> + Send;
}

/// Pluggable authentication policy. Default: no auth.
/// Custom: Ed25519 token auth, community membership, API keys.
pub trait AuthPolicy: Send + Sync + 'static {
    /// Evaluate whether a peer should be accepted.
    fn evaluate_peer(
        &self,
        peer_id: &PeerId,
        addr: &std::net::SocketAddr,
        extension_data: Option<&[u8]>,
    ) -> impl Future<Output = AuthDecision> + Send;

    /// Generate auth data to send to peers during handshake.
    fn local_auth_data(&self) -> Option<Vec<u8>>;
}

#[derive(Debug, Clone)]
pub enum AuthDecision {
    Accept,
    Reject { reason: String },
    /// Accept but mark as untrusted (deprioritize in scheduling).
    AcceptUntrusted,
}

/// Pluggable rate control policy. Default: token bucket.
/// Custom: time-of-day schedules, priority-aware, adaptive.
pub trait RatePolicy: Send + Sync + 'static {
    /// Get the allowed send budget (bytes) for this tick.
    fn upload_budget(&self, now: std::time::Instant) -> u64;
    /// Get the allowed receive budget (bytes) for this tick.
    fn download_budget(&self, now: std::time::Instant) -> u64;
    /// Notify the policy that bytes were consumed.
    fn record_usage(&self, direction: Direction, bytes: u64);
}

/// Pluggable peer filter. Default: none.
/// Custom: IP blocklists, country filters, ASN rules.
pub trait PeerFilter: Send + Sync + 'static {
    /// Returns true if the peer should be blocked.
    fn is_blocked(
        &self,
        addr: &std::net::SocketAddr,
        peer_id: Option<&PeerId>,
    ) -> bool;
}

/// Pluggable metrics export. Default: no-op.
/// Custom: Prometheus, OpenTelemetry, StatsD, custom dashboards.
#[cfg(feature = "metrics")]
pub trait MetricsSink: Send + Sync + 'static {
    fn record_counter(&self, name: &str, value: u64, labels: &[(&str, &str)]);
    fn record_gauge(&self, name: &str, value: f64, labels: &[(&str, &str)]);
    fn record_histogram(&self, name: &str, value: f64, labels: &[(&str, &str)]);
}

/// Pluggable log output. Default: `tracing` crate.
/// Custom: redirect to application logger, database, ring buffer.
pub trait LogSink: Send + Sync + 'static {
    fn log(&self, level: LogLevel, target: &str, message: &str);
}

/// Pluggable revocation policy. Default: no revocation.
/// Custom: registry-backed block lists, CRL-style revocation feeds.
pub trait RevocationPolicy: Send + Sync + 'static {
    /// Check whether an info hash is revoked. The engine calls this before
    /// downloading, seeding, or announcing. Returning `true` causes the
    /// engine to refuse all transfers for this hash and de-announce from
    /// trackers/DHT.
    fn is_revoked(&self, info_hash: &InfoHash) -> bool;

    /// Subscribe to revocation updates. The engine polls or listens for
    /// newly revoked hashes and applies them to active torrents.
    fn revocation_updates(&self) -> Option<impl Stream<Item = InfoHash> + Send>;

    /// Callback when a revoked hash is found active. The engine invokes
    /// this after stopping a torrent due to revocation, allowing the policy
    /// to log, alert, or delete cached data.
    fn on_revocation_applied(
        &self,
        info_hash: &InfoHash,
        action: RevocationAction,
    ) -> impl Future<Output = ()> + Send;
}

#[derive(Debug, Clone)]
pub enum RevocationAction {
    /// Torrent stopped and de-announced, data retained on disk.
    Stopped,
    /// Torrent stopped and data deleted.
    StoppedAndDeleted,
}
```

### 1.5 Storage Middleware Composition (Tower-Style Layers)

The extensibility traits above (§ 1.4) define *what* pluggable behaviors exist. This section defines *how* they compose — specifically for `StorageBackend`, which benefits most from middleware layering.

AnyFS (a Rust filesystem abstraction library) demonstrates that Tower-style `Layer` composition — where each middleware wraps an inner backend and delegates — is the natural pattern for storage concerns that are orthogonal to the core read/write path. `p2p-distribute`'s `StorageBackend` trait is already the right abstraction boundary; adding a `StorageLayer` trait enables composable pipelines without modifying the core trait.

```rust
/// A layer that wraps a StorageBackend to add cross-cutting concerns.
/// Inspired by Tower's Service/Layer pattern and AnyFS's Layer<B: Fs> trait.
pub trait StorageLayer<S: StorageBackend> {
    type Backend: StorageBackend;
    fn layer(self, inner: S) -> Self::Backend;
}

/// Extension trait enabling fluent `.layer()` on any StorageBackend.
pub trait StorageLayerExt: StorageBackend + Sized {
    fn layer<L: StorageLayer<Self>>(self, layer: L) -> L::Backend {
        layer.layer(self)
    }
}

impl<S: StorageBackend> StorageLayerExt for S {}
```

**Built-in storage layers:**

| Layer                 | Purpose                                                              | When to Use                                                   |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `IntegrityCheckLayer` | SHA-256 verify piece data on read; detect bit-rot or disk corruption | Always (cheap — hash is already computed for BT verification) |
| `ReadCacheLayer`      | LRU cache for frequently-read pieces during seeding                  | Seed boxes serving hot content to many peers                  |
| `MetricsLayer`        | Count read/write ops, bytes transferred, cache hit rate per torrent  | Server deployments with Prometheus/OTEL                       |
| `WriteBatchLayer`     | Buffer small writes and flush in batches to reduce disk IOPS         | High-throughput download scenarios                            |

**Composition example:**

```rust
// Seed box storage: integrity + read cache + metrics
let storage = FilesystemStorage::new("/data/torrents")
    .layer(IntegrityCheckLayer::new())
    .layer(ReadCacheLayer::new(256 * 1024 * 1024))  // 256 MB LRU
    .layer(MetricsLayer::new(registry));

// Embedded minimal client: just raw disk, no layers
let storage = FilesystemStorage::new("/tmp/downloads");

// WASM client: memory backend with write batching
let storage = MemoryStorage::new()
    .layer(WriteBatchLayer::new(Duration::from_millis(100)));
```

**Interaction with `StorageBackendFactory`:** The factory creates a per-torrent `StorageBackend`. Layers wrap the created backend:

```rust
pub struct LayeredStorageFactory<F, L> {
    inner: F,
    layer: L,
}

impl<F: StorageBackendFactory, L: StorageLayer<F::Backend> + Clone> StorageBackendFactory
    for LayeredStorageFactory<F, L>
{
    fn create(
        &self,
        info_hash: &InfoHash,
        metadata: &TorrentMetadata,
        download_dir: &Path,
    ) -> Result<Box<dyn StorageBackend>, StorageError> {
        let inner = self.inner.create(info_hash, metadata, download_dir)?;
        Ok(Box::new(self.layer.clone().layer(inner)))
    }
}
```

**Design notes:**

- **Zero-cost when unused:** Composition is compile-time generics (monomorphized). No boxing unless the user explicitly opts into `Box<dyn StorageBackend>` for runtime flexibility.
- **Layers are independent of core traits.** The `StorageBackend` trait (§ 1.4) is unchanged. An application that doesn't use layers pays zero cost. Layers are additive infrastructure.
- **Profile integration:** The `server_seedbox` profile defaults to `IntegrityCheckLayer + ReadCacheLayer`. The `embedded_minimal` profile uses raw storage with no layers. Custom profiles compose layers via the TOML-driven config (§ 3).
- **Custom layers:** Third parties implement `StorageLayer<S>` for encryption-at-rest, compression, content-addressed deduplication, or application-specific transforms. The trait is minimal enough that a custom layer is ~20 lines of delegation code.

> **Prior art:** AnyFS (`Fs` trait + `Layer<B: Fs>` + `LayerExt` blanket impl), Tower (`Service` + `Layer<S: Service>` + `ServiceExt`). Both demonstrate that the Layer pattern composes cleanly for I/O-bound middleware where the overhead of delegation is negligible relative to actual I/O time. AnyFS's strategic boxing insight also applies: bulk `read_block`/`write_block` return concrete types (zero-cost); only streaming iterators or dynamic dispatch boundaries use `Box`.

---

## 2.5 Content Channels (Feature: `channels`)

A Content Channel is a named, append-only stream of versioned content snapshots. While standard torrents are static (one info hash = one immutable piece set), content channels model **mutable, streaming content** — configuration feeds, live data streams, incremental model checkpoints, live balance patches, or any data flow where new versions arrive over time.

Content channels are an **optional crate feature** (`channels`). They build on the core torrent engine — each snapshot is a small content-addressed blob distributed via the same P2P infrastructure. The tracker manages peer discovery per-channel rather than per-snapshot.

```rust
/// Feature-gated: requires `channels` feature.
///
/// A content channel produces a sequence of snapshots, each identified
/// by a monotonically increasing sequence number and content hash.
/// Subscribers receive new snapshots as they are published.
#[cfg(feature = "channels")]
pub struct ContentChannel {
    /// Channel identity — typically `publisher/channel-name`.
    pub name: String,
    /// Current head snapshot (latest).
    pub head: Option<SnapshotInfo>,
    /// Retention: how many historical snapshots to keep accessible.
    pub retention: ChannelRetention,
    /// Maximum snapshot size in bytes.
    pub max_snapshot_size: u64,
    /// Content type hint (e.g., "application/json", "application/octet-stream").
    pub content_type: Option<String>,
}

#[cfg(feature = "channels")]
pub struct SnapshotInfo {
    pub sequence: u64,
    pub content_hash: Sha256Hash,
    pub timestamp: SystemTime,
    pub size_bytes: u64,
    pub parent_hash: Option<Sha256Hash>, // hash of previous snapshot (chain integrity)
}

#[cfg(feature = "channels")]
pub enum ChannelRetention {
    /// Keep last N snapshots.
    LastN(u32),
    /// Keep snapshots from the last duration.
    Duration(Duration),
    /// Keep all snapshots (unbounded).
    Unbounded,
}

/// Extension to Session for content channel operations.
#[cfg(feature = "channels")]
impl Session {
    /// Create a new content channel (publisher side).
    pub async fn create_channel(
        &self,
        config: ContentChannel,
    ) -> Result<ChannelHandle, ChannelError>;

    /// Subscribe to an existing channel (consumer side).
    /// Returns a receiver that yields new snapshots as they arrive.
    pub async fn subscribe_channel(
        &self,
        name: &str,
        tracker_url: &str,
    ) -> Result<ChannelSubscription, ChannelError>;

    /// Publish a new snapshot to a channel (publisher side).
    pub async fn publish_snapshot(
        &self,
        channel: &ChannelHandle,
        data: &[u8],
    ) -> Result<SnapshotInfo, ChannelError>;
}

#[cfg(feature = "channels")]
pub struct ChannelSubscription {
    /// Stream of incoming snapshots.
    pub snapshots: impl Stream<Item = Result<SnapshotData, ChannelError>> + Send,
    /// Current channel head at time of subscription.
    pub head: Option<SnapshotInfo>,
}

#[cfg(feature = "channels")]
pub struct SnapshotData {
    pub info: SnapshotInfo,
    pub data: Vec<u8>,
}
```

**P2P distribution for snapshots:** Each snapshot is a content-addressed blob. Subscribers who receive a snapshot automatically seed it to other subscribers for a configurable TTL (`retention`). The tracker manages peer discovery per-channel — subscribers announce to the channel's swarm, not per-snapshot. This avoids tracker churn for high-frequency channels.

**Offline-first:** Subscribers cache snapshots locally. On reconnect, they resume from their last received sequence number. Missed snapshots are fetched from peers or the origin. The retention policy determines how far back catch-up is possible.

**Relationship to core API:** Content channels are optional and compose with the core `Session` API. A session can manage both standard torrents and content channels simultaneously. Channel snapshots use the same `StorageBackend` trait as torrents. The `DiscoveryBackend`, `AuthPolicy`, and `PeerFilter` traits apply to channel peer connections identically.

---

## 2.6 Streaming Piece Selection (Feature: `streaming`)

The default piece selection strategy is rarest-first (maximizes swarm health). Some use cases need sequential or hybrid strategies — progressive download for preview-during-download, media streaming, or ordered data pipelines.

```rust
/// Feature-gated: requires `streaming` feature.
///
/// Piece selection strategy that can be set per-torrent via AddTorrentOptions
/// or changed at runtime via TorrentHandle.
#[cfg(feature = "streaming")]
pub enum PieceStrategy {
    /// Standard BitTorrent: rarest pieces first (maximizes swarm health).
    /// This is the default and does not require the `streaming` feature.
    RarestFirst,

    /// Strict sequential: pieces in order. Best for media playback where
    /// the consumer reads data from the start.
    Sequential {
        /// Pieces to pre-fetch ahead of current playback position.
        readahead: u32,
    },

    /// Hybrid streaming: sequential near the playback head, rarest-first
    /// for unclaimed pieces further ahead. Balances playback continuity
    /// with swarm health.
    StreamingHybrid {
        /// Pieces from current position treated as sequential (high priority).
        sequential_window: u32,
        /// Beyond the window, use rarest-first.
        /// Total readahead = sequential_window + rarest_first_lookahead.
        rarest_first_lookahead: u32,
    },
}
```

The `streaming` feature adds the `StreamingHybrid` strategy and the ability to dynamically reposition the sequential cursor via `TorrentHandle::set_playback_position(piece_index)`. Standard `sequential` mode (already in the `[pieces]` config group) does not require this feature flag.

---

## 2.7 Revocation Infrastructure

Revocation enables consumers to block distribution of specific content after discovery of malware, legal takedown, or supply chain compromise. This is a crate-level concern (not application-specific) because the P2P engine must stop transferring revoked content at the protocol layer — application-level blocking is insufficient since the engine would still seed to and download from peers.

The `RevocationPolicy` trait (§ 1.4) is the extension point. The crate provides a built-in implementation:

```rust
/// Built-in revocation policy backed by an in-memory block set.
/// Applications populate it from their own revocation feeds (registry,
/// federation, CRL, etc.).
pub struct BlockListRevocationPolicy {
    blocked: DashSet<InfoHash>,
}

impl BlockListRevocationPolicy {
    pub fn new() -> Self;

    /// Add a hash to the block list. Takes effect immediately —
    /// any active torrent with this hash is stopped and de-announced.
    pub fn block(&self, info_hash: InfoHash);

    /// Remove a hash from the block list (reinstatement).
    pub fn unblock(&self, info_hash: &InfoHash);

    /// Load a block list from a file (one hex-encoded info hash per line).
    pub fn load_from_file(&self, path: &Path) -> Result<usize, std::io::Error>;
}
```

**What happens when a hash is revoked:**
1. The engine stops all uploads for the hash (immediately — no grace period for malicious content).
2. The engine sends `not_interested` to all peers for this hash and closes connections.
3. The engine de-announces from all trackers and DHT for this hash.
4. The `RevocationPolicy::on_revocation_applied` callback fires, allowing the application to delete cached data, log the event, or notify the user.
5. Future announce requests for the hash are rejected by the embedded tracker (if running).

**What the crate does NOT do:** The crate does not decide *what* to revoke. Revocation decisions are made by the application layer — a registry operator, a federation consensus, a legal takedown, a malware scanner. The crate provides the enforcement mechanism. IC's `workshop-core` populates the `RevocationPolicy` from Workshop federation revocation records; a package manager populates it from its advisory database; other consumers populate it from their own sources.

---

## 2.8 Bucket-Based Scheduling

Several subsystems benefit from pre-partitioning entities into **buckets** — classified groups that replace flat linear scans with structured lookups. The crate uses bucket logic in three places: tracker-side peer selection, client-side connection pooling, and tracker-side content popularity classification. These are crate-level concerns — not application-specific — because they affect protocol-layer performance and fairness.

### 2.8.1 Tracker-Side Peer Bucketing

The embedded tracker (§ 6) pre-classifies announced peers into a hierarchical bucket tree. On each announce response, the tracker walks buckets from best-match outward until the peer handout limit is filled — O(k) where k = number of buckets, not O(n) over all peers in the swarm.

```rust
/// Peer bucket tree maintained by the embedded tracker.
/// Peers are inserted on announce and removed on expiry/stop.
/// The tree is indexed by (region, seed_status, transport) for fast
/// locality-aware peer selection.
pub struct PeerBucketTree {
    /// Root: continent → country/region → city
    /// Each leaf holds a `PeerBucketLeaf` partitioned by seed status and transport.
    regions: BTreeMap<RegionKey, RegionBucket>,
    /// Total peer count across all buckets (for stats).
    total_peers: usize,
}

/// 4-level hierarchical region key: continent|country|region|city.
/// Clients self-report via extension handshake (best-effort, not trusted
/// for security — only for peer selection optimization). GeoIP lookup
/// (feature-gated: `geoip`) provides server-side fallback.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RegionKey {
    pub continent: Option<String>,  // e.g. "EU", "NA", "AS"
    pub country: Option<String>,    // e.g. "DE", "US", "JP"
    pub region: Option<String>,     // e.g. "Bavaria", "California"
    pub city: Option<String>,       // e.g. "Munich", "San Francisco"
}

struct RegionBucket {
    /// Sub-partitioned by seed status and transport type.
    leaves: BTreeMap<(SeedStatus, TransportType), Vec<PeerEntry>>,
    /// Total peers in this region (for proportional sampling).
    count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum SeedStatus {
    /// Dedicated seed infrastructure (seed box, server capability).
    SeedBox,
    /// Completed seeder (has all pieces).
    Seeder,
    /// Actively downloading leecher (has some pieces, uploading too).
    Leecher,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum TransportType {
    /// Standard TCP (highest throughput, most common).
    Tcp,
    /// uTP over UDP (background-friendly, lower throughput).
    Utp,
    /// WebRTC data channel (browser peers — higher overhead, essential for WASM).
    WebRtc,
}
```

**Announce response algorithm:**

```
FUNCTION select_peers_for_announce(tree, requester_region, requester_transport, limit) -> Vec<PeerEntry>:
    result = []

    // Phase 1: Same-city peers, matching transport, seeders first
    walk_bucket(tree, requester_region.full_match(), [SeedBox, Seeder, Leecher],
                [requester_transport, *other_transports], &mut result, limit)
    IF result.len() >= limit: RETURN result[..limit]

    // Phase 2: Same-country, widen city
    walk_bucket(tree, requester_region.country_match(), ..., &mut result, limit)
    IF result.len() >= limit: RETURN result[..limit]

    // Phase 3: Same-continent
    walk_bucket(tree, requester_region.continent_match(), ..., &mut result, limit)
    IF result.len() >= limit: RETURN result[..limit]

    // Phase 4: Global — any region
    walk_bucket(tree, RegionKey::any(), ..., &mut result, limit)
    RETURN result[..min(result.len(), limit)]
```

**Why this matters:** For popular Workshop content with thousands of peers, flat scoring (compute `PeerScore` for every peer on every announce) is O(n). Bucketing pre-sorts peers at announce time (O(1) insert into the right bucket) and serves responses by walking a small number of buckets (O(k), typically k < 20). Dragonfly uses the same pattern with its `country|province|city|zone|cluster` hierarchy. The bucket tree is the data structure; the weighted scoring formula (`PeerScore = Capacity(0.4) + Locality(0.3) + SeedStatus(0.2) + LobbyContext(0.1)`) is used *within* each bucket leaf to rank peers when a bucket has more candidates than needed.

**Configuration:**

```toml
[tracker.buckets]
# Enable hierarchical peer bucketing (disabling falls back to flat scoring).
enabled = true                       # Default: true
# Maximum peers per leaf bucket before eviction (oldest announcer evicted).
max_peers_per_leaf = 500             # Range: 50–10000. Default: 500
# Region key source: "self_report" (client extension), "geoip" (server lookup), "both" (prefer geoip).
region_source = "both"               # Default: "both" (requires `geoip` feature for server lookup)
# Proportional sampling: when filling announce response, sample proportionally
# from each matching region bucket rather than exhausting the closest first.
proportional_sampling = false        # Default: false (closest-first is better for latency)
```

### 2.8.2 Connection Pool Bucketing by Transport

The client-side connection manager partitions connection slots by transport type. Each transport gets guaranteed minimum slots and a maximum cap. This prevents cross-transport starvation — a swarm heavy with browser peers cannot fill all slots with high-overhead WebRTC connections, starving high-quality desktop TCP connections.

```rust
/// Per-transport connection slot allocation.
/// Guarantees each transport type baseline capacity.
/// Unused minimum slots from one transport are NOT redistributed
/// (this is intentional — the minimum is a guaranteed reservation).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionBuckets {
    pub tcp: TransportSlots,
    pub utp: TransportSlots,
    pub webrtc: TransportSlots,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransportSlots {
    /// Minimum guaranteed slots for this transport.
    /// The connection manager will not allocate these to other transports.
    pub min_slots: u32,
    /// Maximum slots for this transport (hard cap).
    pub max_slots: u32,
}

impl Default for ConnectionBuckets {
    fn default() -> Self {
        Self {
            tcp: TransportSlots { min_slots: 40, max_slots: 80 },
            utp: TransportSlots { min_slots: 10, max_slots: 30 },
            webrtc: TransportSlots { min_slots: 10, max_slots: 30 },
        }
    }
}
```

**Slot allocation algorithm:**

```
FUNCTION try_connect(peer_addr, transport) -> Result<(), ConnectionError>:
    bucket = connection_buckets[transport]
    active = count_active_connections(transport)

    // Hard cap: reject if transport bucket is full
    IF active >= bucket.max_slots:
        RETURN Err(TransportBucketFull)

    // Global cap: reject if total connections exceed max_connections_global
    IF total_active_connections() >= config.max_connections_global:
        // Try to evict a connection from an over-minimum transport
        IF NOT evict_over_minimum_connection(excluding = transport):
            RETURN Err(GlobalConnectionLimitReached)

    connect(peer_addr, transport)
    RETURN Ok(())

FUNCTION evict_over_minimum_connection(excluding) -> bool:
    // Find a transport (other than `excluding`) with active > min_slots.
    // Evict the lowest-scoring connection from that transport.
    FOR transport IN [Utp, WebRtc, Tcp].except(excluding):
        active = count_active_connections(transport)
        IF active > connection_buckets[transport].min_slots:
            evict_lowest_scoring(transport)
            RETURN true
    RETURN false
```

**Why this matters for IC:** Browser WASM clients use WebRTC, which has ~3x the connection overhead of TCP (DTLS handshake, SCTP negotiation, ICE candidate exchange). Without bucketing, a lobby with 80 browser clients and 20 desktop clients could saturate all connection slots with low-throughput WebRTC connections. Transport bucketing guarantees desktop peers retain capacity even when browser peers outnumber them. This is critical for IC's cross-platform multiplayer (D010) where desktop and browser clients interoperate in the same swarm.

### 2.8.3 Content Popularity Bucketing (Tracker-Side)

The embedded tracker automatically classifies content into popularity tiers based on recent announce frequency. This drives adaptive resource allocation — the seed box and tracker invest resources where they provide the most incremental value (the long tail), not where the swarm already self-serves (hot content).

```rust
/// Content popularity classification, maintained per-info-hash by the tracker.
/// Updated on every announce. Drives seed box bandwidth allocation and
/// tracker announce interval tuning.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PopularityTier {
    /// >100 unique announcers/hour. The swarm is self-sustaining.
    /// Seed box: minimal seeding (the crowd has coverage).
    /// Tracker: standard announce interval.
    Hot,
    /// 10–100 unique announcers/hour. Moderate swarm activity.
    /// Seed box: normal seeding bandwidth allocation.
    /// Tracker: standard announce interval.
    Warm,
    /// 1–10 unique announcers/hour. Few active peers.
    /// Seed box: elevated seeding priority (more bandwidth share).
    /// Tracker: shorter announce interval to discover peers faster.
    Cold,
    /// <1 unique announcer/day. Dormant content.
    /// Seed box: seed on-demand only (don't waste bandwidth pre-seeding).
    /// Tracker: can be demoted to passive tracking (respond to announces,
    /// but don't include in active scrape results).
    Frozen,
}

/// Popularity tracking state per info hash.
struct PopularityState {
    /// Rolling window of unique announcer count (per hour).
    announce_rate: ExponentialMovingAverage,
    /// Current tier classification.
    tier: PopularityTier,
    /// Timestamp of last tier transition (for hysteresis).
    last_transition: Instant,
}
```

**Classification algorithm:**

```
FUNCTION update_popularity(info_hash, now):
    state = popularity_states[info_hash]
    state.announce_rate.update(now)
    rate = state.announce_rate.per_hour()

    new_tier = classify(rate)

    // Hysteresis: require tier to be stable for 10 minutes before transitioning.
    // Prevents oscillation at tier boundaries (e.g., 99-101 announces/hour
    // flipping between Warm and Hot every minute).
    IF new_tier != state.tier AND (now - state.last_transition) > Duration::minutes(10):
        state.tier = new_tier
        state.last_transition = now
        emit_event(PopularityTierChanged { info_hash, old: state.tier, new: new_tier })

FUNCTION classify(announces_per_hour) -> PopularityTier:
    MATCH announces_per_hour:
        > 100 => Hot
        > 10  => Warm
        > 0.04 => Cold    // ~1/day = 0.042/hour
        _     => Frozen
```

**Seed box bandwidth allocation:**

The seed box allocates upload bandwidth inversely to swarm self-sufficiency. Hot content has plenty of seeders — the seed box contribution is marginal. Cold content has few seeders — the seed box is often the only reliable source.

```toml
[tracker.popularity]
enabled = true                       # Default: true
# EWMA decay factor for announce rate (higher = more responsive, more noisy).
ewma_alpha = 0.3                     # Range: 0.05–0.95. Default: 0.3
# Hysteresis duration before tier transition.
hysteresis_secs = 600                # Range: 60–3600. Default: 600 (10 min)

# Tier thresholds (announces per hour).
hot_threshold = 100                  # Default: 100
warm_threshold = 10                  # Default: 10
cold_threshold = 0.04                # Default: 0.04 (~1/day)

# Seed box bandwidth share weights per tier.
# Higher weight = more seed box bandwidth allocated to this tier.
# The seed box distributes spare bandwidth proportionally to these weights.
[tracker.popularity.seedbox_weights]
hot = 1                              # Minimal — swarm self-serves
warm = 4                             # Normal allocation
cold = 16                            # Elevated — few peers, seed box is critical
frozen = 8                           # On-demand — less than cold (only seed when requested)
```

**Why this matters:** Workshop content follows a power law — 5% of packages account for ~80% of downloads. Without popularity bucketing, the seed box seeds everything equally, wasting bandwidth on hot content that already has dozens of seeders while cold content (a long-tail map or niche voice pack) starves. With bucketing, the seed box focuses where it provides the most incremental value. The EWMA + hysteresis approach is adapted from Dragonfly's load-quality scoring — smooth, stable classification that avoids flapping at tier boundaries.

**Interaction with `PopularityClassifier` trait:**

Applications that need custom classification (e.g., IC's Workshop could weight recency or community ratings into tier decisions) can override the built-in EWMA classifier:

```rust
/// Pluggable content popularity classification. Default: EWMA-based announce rate.
/// Custom: weighted by downloads, ratings, recency, or external signals.
pub trait PopularityClassifier: Send + Sync + 'static {
    /// Classify an info hash into a popularity tier.
    fn classify(&self, info_hash: &InfoHash, stats: &TorrentTrackerStats) -> PopularityTier;
}

/// Stats available to the classifier for each tracked torrent.
pub struct TorrentTrackerStats {
    pub unique_announcers_last_hour: f64,
    pub total_seeders: u32,
    pub total_leechers: u32,
    pub total_completed: u64,
    pub first_seen: SystemTime,
    pub last_announce: SystemTime,
}
```

### 2.8.4 Interaction Summary

| Bucket System                        | Where It Runs             | What It Replaces                              | Complexity                                  | Benefit                                                             |
| ------------------------------------ | ------------------------- | --------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- |
| Peer bucketing (§ 2.8.1)             | Embedded tracker          | Flat O(n) peer scoring on every announce      | O(1) insert, O(k) lookup (k = bucket count) | Fast announce response for popular content; better locality         |
| Connection pool buckets (§ 2.8.2)    | Client connection manager | Flat `max_connections_per_torrent` limit      | O(1) per-connect check                      | Prevents cross-transport starvation; guarantees transport diversity |
| Content popularity buckets (§ 2.8.3) | Embedded tracker          | Equal bandwidth allocation across all content | O(1) tier lookup (EWMA pre-computed)        | Seed box focuses bandwidth on long-tail content                     |

All three systems are **optional and backward-compatible**. Disabling peer bucketing falls back to flat scoring. Disabling connection pool bucketing uses the single `max_connections_per_torrent` limit. Disabling popularity bucketing uses equal bandwidth allocation. The bucket systems compose independently — they can be enabled in any combination.

---

## 3. Configuration System — "All Knobs"

### 2.1 Layering Architecture

Configuration is resolved from a stack of layers. Higher layers override lower layers. Within each layer, per-torrent overrides take precedence over session-level settings.

```
┌──────────────────────────────────────────────┐
│ Layer 5: Live runtime overrides (API)        │  ← Session::set_config() / TorrentHandle::set_config()
├──────────────────────────────────────────────┤
│ Layer 4: Per-torrent overrides               │  ← AddTorrentOptions
├──────────────────────────────────────────────┤
│ Layer 3: User config file                    │  ← config.toml / config.yaml / config.json
├──────────────────────────────────────────────┤
│ Layer 2: Profile defaults                    │  ← Profile::EmbeddedMinimal, etc.
├──────────────────────────────────────────────┤
│ Layer 1: Built-in defaults                   │  ← Hardcoded in crate, documented, safe
└──────────────────────────────────────────────┘
```

### 2.2 Schema Properties

- **Serializable/deserializable:** TOML (primary), YAML, JSON via `serde`.
- **Documented:** Every field has a doc comment, valid range, default value, and interaction notes.
- **Forward compatible:** Unknown fields in config files are preserved in a `_extra: HashMap<String, toml::Value>` and logged as warnings (not errors). Enables config files from newer versions to partially load in older versions.
- **Validated:** On load and on every runtime mutation. Validation returns structured errors with field path, expected range, and suggestion.
- **Versionable:** Schema includes a `config_version: u32` field. Migration functions transform old schemas to current. Breaking changes are documented in a migration guide.

### 2.3 Configuration Taxonomy — All Knob Groups

#### Group 1: Protocol & Compatibility

```toml
[protocol]
# BitTorrent protocol version support
v1_enabled = true                    # BEP 3 — classic BitTorrent. Default: true
v2_enabled = false                   # BEP 52 — Merkle tree pieces. Default: false (feature-gated)
hybrid_enabled = false               # v1+v2 hybrid torrents. Default: false (feature-gated)

# Tracker support
http_trackers_enabled = true         # HTTP/HTTPS tracker announces. Default: true
udp_trackers_enabled = true          # BEP 15 UDP tracker announces. Default: true (feature-gated)

# Decentralized discovery
dht_enabled = true                   # BEP 5 Kademlia DHT. Default: true (feature-gated)
pex_enabled = true                   # BEP 11 Peer Exchange. Default: true (feature-gated)
lsd_enabled = true                   # BEP 14 Local Service Discovery. Default: true (feature-gated)

# Magnet link support
metadata_exchange_enabled = true     # BEP 9 metadata from peers. Default: true
max_metadata_size = 10_485_760       # 10 MB. Reject metadata larger than this. Range: 1KB–100MB

# Transport protocol preference
utp_enabled = true                   # BEP 29 uTP (UDP transport). Default: true (feature-gated)
tcp_enabled = true                   # Standard TCP transport. Default: true
prefer_utp = false                   # Prefer uTP over TCP when both available. Default: false

# Encryption (BEP unofficial — MSE/PE)
encryption_mode = "prefer"           # "disabled" | "prefer" | "require". Default: "prefer"
                                    # "prefer": use encryption if peer supports it, fall back to plain
                                    # "require": reject peers that don't support encryption
                                    # "disabled": never use encryption (for debugging / LAN)

# Extension protocol
extension_protocol_enabled = true    # BEP 10 extension handshake. Default: true (required for most features)
```

**Interactions & pitfalls:**
- `dht_enabled = true` requires the `dht` feature flag at compile time.
- `utp_enabled = true` requires the `utp` feature flag.
- `encryption_mode = "require"` significantly reduces the peer pool on public swarms. Recommended only for private swarms.
- Disabling both `tcp_enabled` and `utp_enabled` is a validation error — at least one must be enabled.
- `v2_enabled` and `hybrid_enabled` require the `v2` / `hybrid_v1_v2` feature flags.
- `pex_enabled = false` is recommended for private trackers (PEX leaks peer lists).

#### Group 2: Networking

```toml
[network]
# Bind configuration
bind_address = "0.0.0.0"            # IPv4 bind address. Default: "0.0.0.0" (all interfaces)
bind_address_v6 = "::"              # IPv6 bind address. Default: "::" (all interfaces)
bind_interface = ""                  # Bind to specific network interface name. Default: "" (any)
ipv4_enabled = true                 # Enable IPv4. Default: true
ipv6_enabled = true                 # Enable IPv6. Default: true

# Port configuration
listen_port = 6881                   # Primary listen port. Range: 1–65535. Default: 6881
listen_port_range = [6881, 6999]     # If listen_port fails, try ports in this range.
port_randomization = false           # Randomize port within range on startup. Default: false

# Connection management
max_connections_global = 500         # Max open peer connections across all torrents. Range: 10–65535. Default: 500
max_connections_per_torrent = 100    # Max peers per torrent. Range: 5–5000. Default: 100
half_open_connection_limit = 50      # Max simultaneous connection attempts. Range: 5–500. Default: 50
connection_timeout = 10              # Seconds before a pending connection is abandoned. Range: 2–60. Default: 10
peer_timeout = 120                   # Seconds of inactivity before disconnecting a peer. Range: 30–600. Default: 120
handshake_timeout = 10               # Seconds to complete the BT handshake. Range: 2–30. Default: 10

# Transport-bucketed connection slots (§ 2.8.2)
# Partitions max_connections_per_torrent into per-transport guaranteed minimums
# and hard caps. Prevents cross-transport starvation (e.g., WebRTC flooding TCP).
enable_connection_buckets = true     # Enable transport-bucketed connection slots. Default: true
tcp_min_slots = 40                   # Minimum guaranteed TCP slots. Default: 40
tcp_max_slots = 80                   # Maximum TCP slots. Default: 80
utp_min_slots = 10                   # Minimum guaranteed uTP slots. Default: 10
utp_max_slots = 30                   # Maximum uTP slots. Default: 30
webrtc_min_slots = 10                # Minimum guaranteed WebRTC slots. Default: 10
webrtc_max_slots = 30                # Maximum WebRTC slots. Default: 30

# Connection retry
connect_retry_delay = 300            # Seconds before retrying a failed peer. Range: 30–3600. Default: 300 (5 min)
connect_retry_max_attempts = 3       # Max reconnect attempts before blacklisting. Range: 0–20. Default: 3
connect_retry_backoff_multiplier = 2.0 # Exponential backoff factor. Range: 1.0–10.0. Default: 2.0

# Proxy (optional)
# proxy_type = "socks5"             # "socks5" | "http_connect" | "none". Default: "none"
# proxy_host = "127.0.0.1"
# proxy_port = 9050
# proxy_auth_user = ""
# proxy_auth_pass = ""
# proxy_peer_connections = true      # Route peer connections through proxy. Default: true
# proxy_tracker_connections = true   # Route tracker connections through proxy. Default: true

# NAT traversal (feature-gated: upnp_natpmp)
upnp_enabled = true                  # UPnP port mapping. Default: true
nat_pmp_enabled = true               # NAT-PMP / PCP port mapping. Default: true
nat_mapping_refresh_interval = 1200  # Seconds between NAT mapping refreshes. Range: 300–7200. Default: 1200 (20 min)
nat_mapping_timeout = 7200           # Seconds before a NAT mapping is considered stale. Range: 600–86400. Default: 7200

# Keep-alive
keepalive_interval = 120             # Seconds between keep-alive messages. Range: 30–300. Default: 120
```

**Interactions & pitfalls:**
- `half_open_connection_limit` is critical on Windows (which has limited half-open socket capacity). Values > 100 may cause OS-level socket exhaustion.
- `proxy_peer_connections = true` with `utp_enabled = true` is incompatible (SOCKS proxies typically don't support UDP). Validation warns and disables uTP.
- `port_randomization = true` with `upnp_enabled = true` may cause frequent NAT mapping churn. Consider using a fixed port with UPnP.
- `enable_connection_buckets = true` requires `max_connections_per_torrent >= tcp_min_slots + utp_min_slots + webrtc_min_slots`. Validation rejects configurations where minimums exceed the per-torrent limit.
- If a transport is compile-time disabled (e.g., `webrtc` feature off), its bucket slots are redistributed to enabled transports proportionally.

#### Group 3: Peer Management

```toml
[peers]
# Choking algorithm
choking_algorithm = "standard"       # "standard" (BT tit-for-tat) | "rate_based" | "anti_leech". Default: "standard"
regular_unchoke_interval = 10        # Seconds between regular unchoke recalculations. Range: 5–60. Default: 10
optimistic_unchoke_interval = 30     # Seconds between optimistic unchoke rotation. Range: 10–120. Default: 30
max_unchoked_peers = 4               # Max regularly unchoked peers (exc. optimistic). Range: 1–50. Default: 4
optimistic_unchoke_slots = 1         # Optimistic unchoke slot count. Range: 1–10. Default: 1

# Seed-mode choking
seed_choking_algorithm = "fastest_upload"
                                    # "fastest_upload" — unchoke peers we upload fastest to
                                    # | "round_robin" — cycle through interested peers
                                    # | "anti_leech" — prioritize peers who seed back
                                    # | "rarest_first_seeder" — unchoke peers with lowest completion
                                    # Default: "fastest_upload"

# Peer scoring weights (0.0 – 1.0, must sum to ≤ 1.0)
peer_score_upload_weight = 0.4       # Weight for upload contribution to us. Default: 0.4
peer_score_latency_weight = 0.2      # Weight for connection latency (lower = better). Default: 0.2
peer_score_availability_weight = 0.3 # Weight for piece availability (rarer pieces = higher). Default: 0.3
peer_score_age_weight = 0.1          # Weight for connection age (older = more stable). Default: 0.1

# Ban / ignore thresholds
max_hash_failures_per_peer = 5       # Hash failures before banning a peer. Range: 1–100. Default: 5
max_protocol_errors_per_peer = 10    # Protocol errors (malformed messages) before banning. Range: 1–100. Default: 10
ban_duration = 3600                  # Seconds a banned peer stays blocked. Range: 60–86400. Default: 3600 (1 hour)
snubbed_timeout = 60                 # Seconds without a piece from an unchoked peer = "snubbed". Range: 15–300. Default: 60

# Peer limits
max_peers_reply = 60                 # Max peers returned to other peers in PEX. Range: 10–200. Default: 60
max_peer_list_size = 2000            # Max peers stored per torrent (connected + candidate). Range: 100–100000. Default: 2000
```

**Interactions & pitfalls:**
- `choking_algorithm = "anti_leech"` may violate the BT social contract and cause reduced reciprocity. Use in private swarms only.
- Score weights exceeding 1.0 in total are clamped and a warning is logged.
- `seed_choking_algorithm = "rarest_first_seeder"` is optimal for community health but suboptimal for individual upload speed. Best for seedboxes serving community content.

#### Group 4: Piece Selection & Completion

```toml
[pieces]
# Piece selection strategy
selection_strategy = "rarest_first"  # "rarest_first" | "sequential" | "random". Default: "rarest_first"
                                    # "rarest_first": standard BT — stabilizes swarm health
                                    # "sequential": download in order — for streaming/preview use cases
                                    # "random": random selection — avoids predictability in adversarial settings

# Rarest-first tuning
rarest_first_cutoff = 10             # Switch to random when this many random peers have a piece. Range: 1–100. Default: 10
                                    # (When most peers have a piece, rarest-first overhead doesn't help)

# Sequential mode tuning
sequential_readahead = 5             # Pieces to pre-fetch ahead of current position. Range: 0–50. Default: 5
first_last_piece_priority = true     # Prioritize first and last pieces for format detection. Default: true

# Endgame mode
endgame_mode_enabled = true          # Enable duplicate requests for final pieces. Default: true
endgame_threshold_pieces = 5         # Pieces remaining before endgame activates. Range: 1–50. Default: 5
endgame_max_duplicates = 3           # Max parallel requests per piece in endgame. Range: 2–10. Default: 3

# Request pipeline
requests_per_peer = 128              # Max outstanding requests to a single peer. Range: 1–500. Default: 128
                                    # (Higher = better throughput on high-latency links, at cost of memory)
request_timeout = 30                 # Seconds before a request is considered timed out. Range: 5–120. Default: 30

# Piece verification
strict_verification = true           # Re-verify piece on disk read (not just on write). Default: true
                                    # Catches disk corruption. Costs CPU. Disable for trusted local storage.

# Block size
block_size = 16384                   # Bytes per block request (sub-piece). DO NOT CHANGE — BT standard. Default: 16384
```

**Interactions & pitfalls:**
- `selection_strategy = "sequential"` is **harmful to swarm health** — it reduces piece diversity. Use only for streaming previews or when the application explicitly needs sequential access. Never use in a seedbox profile.
- `requests_per_peer = 128` is aggressive. On slow/metered connections, reduce to 16–32 to limit memory pressure.
- `strict_verification = true` doubles read I/O for every served block. Disable on trusted storage with ECC memory.

#### Group 5: Storage & Disk I/O

```toml
[storage]
# Directory layout
download_dir = "./downloads"         # Default download directory. Default: "./downloads"
layout = "per_torrent"               # "per_torrent" (subdir per torrent) | "flat" (all files in download_dir).
                                    # Default: "per_torrent"

# File preallocation
preallocation_mode = "sparse"        # "none" | "sparse" | "full". Default: "sparse"
                                    # "sparse": create sparse files (fast, may fragment, CoW-friendly)
                                    # "full": preallocate all bytes (slower on add, prevents ENOSPC mid-download)
                                    # "none": grow files on write

# Disk cache
cache_size_mb = 64                   # Write-back cache size in MB. Range: 4–4096. Default: 64
write_back_interval = 30             # Seconds between cache flushes to disk. Range: 1–300. Default: 30
read_cache_enabled = true            # Cache recently read blocks for re-serving. Default: true
read_cache_size_mb = 32              # Read cache size in MB. Range: 0–4096. Default: 32
sequential_read_ahead = true         # Pre-read adjacent blocks when serving. Default: true
sequential_read_ahead_pieces = 2     # Pieces to read ahead. Range: 0–10. Default: 2

# Fsync policy
fsync_policy = "session_end"         # "every_write" | "periodic" | "session_end" | "never". Default: "session_end"
                                    # "every_write": safest, slowest — survives any crash
                                    # "periodic": fsync every `write_back_interval` — balanced
                                    # "session_end": fsync only on clean shutdown — fastest, risks data loss on crash
                                    # "never": caller handles durability (embedded use)
fsync_interval = 60                  # Seconds between periodic fsyncs (if fsync_policy = "periodic"). Default: 60

# File handle management
max_open_files = 512                 # Max open file handles across all torrents. Range: 16–65536. Default: 512
                                    # LRU eviction when exceeded.

# Crash recovery & fast resume
fast_resume_enabled = true           # Save piece completion state for fast restart. Default: true
fast_resume_file = "resume.dat"      # Fast resume file name (one per torrent). Default: "resume.dat"
resume_save_interval = 300           # Seconds between automatic resume data saves. Range: 60–3600. Default: 300
recheck_on_crash_recovery = true     # Full piece recheck after unclean shutdown. Default: true

# Path safety (critical for untrusted .torrent files)
sanitize_paths = true                # Remove "..", absolute paths, reserved names from torrent file paths. Default: true
                                    # MUST be true for untrusted input. Disabling is a security risk.
max_path_length = 255                # Max path component length. Range: 64–4096. Default: 255
reject_hidden_files = false          # Reject torrents containing dotfiles. Default: false

# Move on complete (optional)
# move_on_complete_dir = ""          # Move completed torrents to this dir. Default: "" (disabled)
```

**Interactions & pitfalls:**
- `preallocation_mode = "full"` on a nearly-full disk may fail immediately on `add_torrent`. The error is caught and reported.
- `fsync_policy = "every_write"` reduces throughput by ~10x on spinning disks. Use `"periodic"` for a balance.
- `sanitize_paths = false` allows directory traversal attacks from malicious .torrent files. Only disable in fully trusted environments (e.g., application-generated torrents).
- `max_open_files` interacts with the OS limit — on Linux the default `ulimit -n` is 1024. Values above the OS limit cause `EMFILE` errors.

#### Group 6: Bandwidth & QoS

```toml
[bandwidth]
# Global rate limits (bytes/sec, 0 = unlimited)
max_upload_rate = 0                  # Global upload speed limit. Default: 0 (unlimited)
max_download_rate = 0                # Global download speed limit. Default: 0 (unlimited)

# Per-torrent defaults (overrideable per torrent)
default_torrent_upload_rate = 0      # Default per-torrent upload limit. Default: 0 (unlimited)
default_torrent_download_rate = 0    # Default per-torrent download limit. Default: 0 (unlimited)

# Rate limiter algorithm
rate_limiter = "token_bucket"        # "token_bucket" | "leaky_bucket" | "sliding_window". Default: "token_bucket"
rate_limiter_burst_factor = 1.5      # Allow bursts this factor above the limit. Range: 1.0–5.0. Default: 1.5

# Scheduling windows (optional — define time-based bandwidth policies)
# [[bandwidth.schedules]]
# days = ["mon", "tue", "wed", "thu", "fri"]
# hours = [9, 17]                    # 9 AM – 5 PM
# upload_rate = 1_048_576            # 1 MB/s during work hours
# download_rate = 5_242_880          # 5 MB/s during work hours
#
# [[bandwidth.schedules]]
# days = ["sat", "sun"]
# hours = [0, 24]                    # All day
# upload_rate = 0                    # Unlimited on weekends
# download_rate = 0

# Priority classes
enable_priority_classes = true       # Allow torrents to declare priority classes. Default: true
                                    # Priority classes: background (0), normal (1), interactive (2)
priority_class_bandwidth_shares = [1, 4, 16]
                                    # Bandwidth share weights for [background, normal, interactive].
                                    # Interactive gets 16x the bandwidth share of background.

# uTP background friendliness (feature-gated: utp)
utp_congestion_target_delay_ms = 100 # Target one-way delay for uTP congestion. Range: 25–500. Default: 100
                                    # Lower = more background-friendly (yields to TCP faster).
                                    # Higher = more aggressive (better throughput on idle links).

# Upload slot management
upload_slots_per_torrent = 4         # Unchoke slot count (matches Group 3, but bandwidth-specific). Default: 4
max_upload_slots_global = 0          # Global upload slot limit (0 = no global limit). Default: 0
```

**Interactions & pitfalls:**
- `max_upload_rate` applies after per-torrent limits — the effective upload is `min(per_torrent, global_remaining)`.
- Schedule conflicts (overlapping time windows) are resolved by most-specific-first (narrower window wins).
- `priority_class_bandwidth_shares` with `enable_priority_classes = false` is ignored without warning.
- Large `rate_limiter_burst_factor` may cause momentary bandwidth spikes visible to network monitors.

#### Group 7: Queueing & Lifecycle

```toml
[queue]
# Active torrent limits
max_active_downloads = 5             # Max simultaneously downloading torrents. Range: 1–1000. Default: 5
max_active_seeds = -1                # Max simultaneously seeding torrents. -1 = unlimited. Default: -1
max_active_total = -1                # Max total active (downloading + seeding). -1 = unlimited. Default: -1

# Queue ordering
queue_order = "sequential"           # "sequential" | "priority" | "smallest_first" | "largest_first"
                                    # Default: "sequential" (FIFO)

# Seeding goals (per-torrent overrideable)
[queue.seeding_goals]
target_ratio = 1.0                   # Stop seeding after reaching this share ratio. 0 = disabled. Default: 1.0
                                    # Range: 0.0–100.0
target_seed_time = 0                 # Stop seeding after this many seconds. 0 = disabled. Default: 0
target_availability = 0              # Stop seeding when swarm has N complete copies. 0 = disabled. Default: 0
                                    # Range: 0–100

# What to do when seeding goal is reached
on_goal_reached = "pause"            # "pause" | "remove" | "nothing". Default: "pause"
                                    # "pause": stop seeding but keep torrent in session
                                    # "remove": remove torrent entirely (careful with this)
                                    # "nothing": keep seeding (goal is informational only)

# Idle detection
idle_timeout = 0                     # Seconds of zero upload before considering torrent idle. 0 = disabled. Default: 0
on_idle = "nothing"                  # "nothing" | "pause" | "remove". Default: "nothing"

# Auto-management
auto_manage_enabled = true           # Automatically manage queue positions based on state. Default: true
auto_manage_interval = 30            # Seconds between queue management passes. Range: 5–300. Default: 30
```

**Interactions & pitfalls:**
- `on_goal_reached = "remove"` is dangerous — data may be lost if `move_on_complete_dir` is not set. Validation warns when `remove` is configured without a move directory.
- `target_ratio = 0` AND `target_seed_time = 0` AND `target_availability = 0` means "seed forever" (no goals). This is the default for seedbox profiles.
- `max_active_downloads = 1` optimizes per-torrent speed at the cost of multi-torrent parallelism.

#### Group 8: Security & Abuse Controls

```toml
[security]
# Hash verification (never disable in production)
verify_piece_hashes = true           # Verify SHA-1/SHA-256 on every received piece. Default: true
                                    # Disabling is a security vulnerability. Test-only.

# Data poisoning protection
poisoning_detection_enabled = true   # Track per-peer hash failure rates. Default: true
poisoning_ban_threshold = 3          # Hash failures from one peer before auto-ban. Range: 1–20. Default: 3
poisoning_ban_duration = 86400       # Seconds to ban a poisoning peer. Range: 3600—604800. Default: 86400 (24h)

# Tracker/DHT rate limiting
tracker_announce_min_interval = 60   # Minimum seconds between tracker announces. Range: 10–600. Default: 60
dht_query_rate_limit = 100           # Max DHT queries per second. Range: 10–10000. Default: 100
dht_bootstrap_rate_limit = 20        # Max simultaneous bootstrap queries. Range: 5–100. Default: 20

# Metadata safety (magnet links)
max_metadata_size_bytes = 10_485_760 # Max .torrent metadata from peers. Range: 1024–104857600. Default: 10MB
max_torrent_size_bytes = 0           # Max torrent content size (0 = unlimited). Default: 0
                                    # Useful for embedded systems with limited storage.

# Path safety (duplicated from storage for emphasis)
sanitize_file_paths = true           # MANDATORY for untrusted torrents. Default: true
reject_absolute_paths = true         # Reject torrents with absolute file paths. Default: true
reject_path_traversal = true         # Reject torrents with ".." in file paths. Default: true
reject_reserved_names = true         # Reject Windows reserved names (CON, PRN, etc.). Default: true

# Connection-level
max_message_length = 1_048_576       # Max BT message length (1 MB). Range: 65536–16777216. Default: 1MB
                                    # Protects against memory exhaustion from malformed messages.
```

#### Group 9: Automation Hooks

```toml
[automation]
# Watch folders (optional — adds torrents automatically)
# [[automation.watch_folders]]
# path = "/home/user/watch"
# check_interval = 10                # Seconds between folder scans. Range: 1–3600. Default: 10
# delete_on_add = false              # Delete .torrent file after adding. Default: false
# tags = ["auto-added"]              # Apply these tags to auto-added torrents.

# On-add hooks (callbacks via trait implementation or shell commands)
# on_add_command = ""                # Shell command to run when a torrent is added (optional).
# on_complete_command = ""           # Shell command to run when download completes (optional).
# on_remove_command = ""             # Shell command to run when a torrent is removed (optional).

# Tagging & category system
enable_tags = true                   # Enable tag-based organization. Default: true
enable_category_policies = true      # Enable per-tag/category config overrides. Default: true

# Example category policy:
# [[automation.categories]]
# name = "movies"
# download_dir = "/data/movies"     # Override download dir for this category
# seeding_target_ratio = 2.0        # Seed movies to 2:1
# max_upload_rate = 5_242_880       # Limit upload for movies to 5 MB/s
```

#### Group 10: Observability

```toml
[observability]
# Structured logging
log_level = "info"                   # "trace" | "debug" | "info" | "warn" | "error". Default: "info"
log_format = "json"                  # "json" | "text" | "compact". Default: "json"
log_file = ""                        # Log file path (empty = stderr). Default: ""
log_rotation = "daily"               # "daily" | "size" | "never". Default: "daily"
log_max_size_mb = 100                # Max log file size before rotation. Default: 100
log_max_files = 7                    # Max rotated log files to keep. Default: 7

# Event stream
event_stream_buffer_size = 1024      # Max buffered events before dropping. Range: 64–65536. Default: 1024

# Metrics (feature-gated: metrics)
# metrics_enabled = true
# metrics_endpoint = "0.0.0.0:9100"  # Prometheus scrape endpoint
# metrics_prefix = "p2p_distribute"

# Tracing spans (for detailed performance analysis)
tracing_network_spans = false        # Emit tracing spans for network operations. Default: false
tracing_disk_spans = false           # Emit tracing spans for disk operations. Default: false
tracing_protocol_spans = false       # Emit tracing spans for BT protocol messages. Default: false

# Debug dumps
debug_protocol_dump = false          # Dump raw protocol messages to file (opt-in). Default: false
debug_dump_dir = "./debug-dumps"     # Directory for protocol dumps. Default: "./debug-dumps"
debug_dump_max_size_mb = 100         # Max total dump size before oldest is deleted. Default: 100
```

---

## 4. Feature Flags (Compile-Time Surfaces)

```toml
# Cargo.toml feature definitions
[features]
default = ["dht", "pex", "lsd", "utp", "encryption", "upnp_natpmp"]

# ──── Protocol extensions ────
dht = []                            # BEP 5 Kademlia DHT for trackerless peer discovery
udp_tracker = []                    # BEP 15 UDP tracker protocol
pex = []                            # BEP 11 Peer Exchange
lsd = []                            # BEP 14 Local Service Discovery (multicast)
utp = []                            # BEP 29 Micro Transport Protocol (UDP-based)
encryption = []                     # MSE/PE stream encryption

# ──── NAT traversal ────
upnp_natpmp = []                    # UPnP + NAT-PMP automatic port mapping

# ──── BitTorrent v2 / Hybrid ────
v2 = []                             # BEP 52 BitTorrent v2 (Merkle tree hashing)
hybrid_v1_v2 = ["v2"]              # v1+v2 hybrid torrent support

# ──── Transport ────
webrtc = []                         # WebRTC data channel transport (browser interop)

# ──── Control surfaces ────
webapi = ["dep:axum", "dep:tower"]  # HTTP JSON control plane (REST API)
rpc = ["dep:serde_json"]            # JSON-RPC 2.0 control interface
cli = ["dep:clap"]                  # Built-in CLI binary

# ──── Observability ────
metrics = ["dep:metrics"]           # Prometheus / OpenTelemetry metric adapters
tracing-integration = ["dep:tracing"]  # tracing crate span integration

# ──── Content ────
channels = []                       # Content Channels — mutable, append-only versioned data streams (§ 2.5)
streaming = []                      # Streaming piece selection strategies (§ 2.6)
revocation = []                     # Revocation infrastructure — block list enforcement at protocol layer (§ 2.7)

# ──── Optional functionality ────
geoip = ["dep:maxminddb"]           # GeoIP peer location lookup
plugins = []                        # Dynamic plugin API (extensible peer filter, storage, etc.)

# ──── Meta features ────
full = [
    "dht", "udp_tracker", "pex", "lsd", "utp", "encryption",
    "upnp_natpmp", "v2", "hybrid_v1_v2", "webrtc",
    "webapi", "rpc", "cli", "metrics", "tracing-integration",
    "geoip", "plugins", "channels", "streaming", "revocation"
]

# Minimal — for deeply embedded use (just TCP BT wire protocol)
minimal = []
```

**Rationale for `default`:** The default feature set includes the protocols needed for a well-behaved client on public BT networks: DHT (trackerless discovery), PEX (peer exchange), LSD (local discovery), uTP (background-friendly transport), encryption (privacy), and NAT traversal (home network compatibility). This is the "desktop balanced" experience without heavy optional surfaces (web API, CLI, metrics).

**Binary size impact (estimated):**

| Feature Set             | Approximate Added Size | Notes                                                        |
| ----------------------- | ---------------------- | ------------------------------------------------------------ |
| `minimal` (no defaults) | ~2 MB                  | TCP only, tracker only, no extensions                        |
| `default`               | ~4 MB                  | Full desktop client capabilities                             |
| `default` + `channels`  | ~4.5 MB                | Desktop + content channel support                            |
| `full`                  | ~9 MB                  | Includes web server, CLI parser, GeoIP, channels, revocation |

---

## 5. Built-In Profiles

Profiles are named presets that set coherent defaults across all knob groups. They are the recommended starting point for most users. Every value set by a profile can be overridden by subsequent config layers.

### 4.1 `embedded_minimal`

**Use case:** Embedded in an application that needs basic P2P download capability with minimal resource footprint. IoT, mobile, or WASM environments.

```toml
# Profile: embedded_minimal
[protocol]
dht_enabled = false
pex_enabled = false
lsd_enabled = false
utp_enabled = false
metadata_exchange_enabled = true
encryption_mode = "prefer"
http_trackers_enabled = true
udp_trackers_enabled = false

[network]
max_connections_global = 50
max_connections_per_torrent = 20
half_open_connection_limit = 10
connection_timeout = 5
upnp_enabled = false
nat_pmp_enabled = false

[peers]
max_unchoked_peers = 2
optimistic_unchoke_slots = 1

[pieces]
requests_per_peer = 32
endgame_threshold_pieces = 3

[storage]
cache_size_mb = 8
read_cache_size_mb = 4
max_open_files = 32
fast_resume_enabled = true
fsync_policy = "session_end"
preallocation_mode = "none"

[bandwidth]
max_upload_rate = 524_288            # 512 KB/s default upload cap
max_download_rate = 0                # Unlimited download

[queue]
max_active_downloads = 2
max_active_seeds = 2
max_active_total = 4

[observability]
log_level = "warn"
tracing_network_spans = false
```

### 4.2 `desktop_balanced`

**Use case:** Desktop application, typical home connection. Good defaults for usability, moderate resource usage, NAT traversal on, all common discovery methods active.

```toml
# Profile: desktop_balanced
[protocol]
dht_enabled = true
pex_enabled = true
lsd_enabled = true
utp_enabled = true
metadata_exchange_enabled = true
encryption_mode = "prefer"
http_trackers_enabled = true
udp_trackers_enabled = true

[network]
max_connections_global = 500
max_connections_per_torrent = 100
half_open_connection_limit = 50
upnp_enabled = true
nat_pmp_enabled = true

[peers]
max_unchoked_peers = 4
optimistic_unchoke_slots = 1
choking_algorithm = "standard"

[pieces]
selection_strategy = "rarest_first"
requests_per_peer = 128
endgame_threshold_pieces = 5

[storage]
cache_size_mb = 64
read_cache_size_mb = 32
max_open_files = 512
preallocation_mode = "sparse"
fsync_policy = "periodic"
fast_resume_enabled = true

[bandwidth]
max_upload_rate = 0                  # Unlimited (user should set this)
max_download_rate = 0

[queue]
max_active_downloads = 5
max_active_seeds = -1
seeding_goals.target_ratio = 1.0

[observability]
log_level = "info"
```

### 4.3 `server_seedbox`

**Use case:** High-performance server with fast uplink. Hundreds or thousands of torrents. Aggressive caching. Full discovery. Strong scheduling controls.

```toml
# Profile: server_seedbox
[protocol]
dht_enabled = true
pex_enabled = true
lsd_enabled = false                  # Not useful on servers
utp_enabled = true
metadata_exchange_enabled = true
encryption_mode = "prefer"
http_trackers_enabled = true
udp_trackers_enabled = true

[network]
max_connections_global = 5000
max_connections_per_torrent = 200
half_open_connection_limit = 200
connection_timeout = 15
peer_timeout = 180
upnp_enabled = false                 # Servers have static ports
nat_pmp_enabled = false

[peers]
max_unchoked_peers = 8
optimistic_unchoke_slots = 2
seed_choking_algorithm = "rarest_first_seeder"  # Maximize swarm health
regular_unchoke_interval = 10
choking_algorithm = "rate_based"

[pieces]
selection_strategy = "rarest_first"
requests_per_peer = 256              # High pipeline depth for fast links
endgame_threshold_pieces = 10

[storage]
cache_size_mb = 512                  # Large write-back cache
read_cache_size_mb = 256             # Large read cache for serving
max_open_files = 4096
preallocation_mode = "full"          # Avoid fragmentation on server
fsync_policy = "periodic"
fsync_interval = 120
fast_resume_enabled = true
resume_save_interval = 600

[bandwidth]
max_upload_rate = 0                  # Unlimited — server has dedicated uplink
max_download_rate = 0

[queue]
max_active_downloads = 50
max_active_seeds = -1                # Seed everything
max_active_total = -1
seeding_goals.target_ratio = 0       # No ratio goal — seed forever

[network]
# Connection pool bucketing — prevents WebRTC/uTP from crowding TCP
enable_connection_buckets = true
tcp_min_slots = 80
tcp_max_slots = 160
utp_min_slots = 20
utp_max_slots = 60
webrtc_min_slots = 5
webrtc_max_slots = 20

[observability]
log_level = "info"
log_format = "json"
tracing_network_spans = false
```

> **Seed box note:** When a `PopularityClassifier` is registered, the `server_seedbox` profile automatically applies per-tier bandwidth weighting (§ 2.8.3). Cold and warm torrents receive proportionally more upload bandwidth than hot torrents, since hot swarms are self-sustaining. This ensures the seed box's limited uplink has maximum swarm health impact.

### 4.4 `lan_party`

**Use case:** Local network, fast transfers, low latency. LSD prioritized. Minimal WAN features.

```toml
# Profile: lan_party
[protocol]
dht_enabled = false                  # Not needed on LAN
pex_enabled = true                   # Peer exchange works great on LAN
lsd_enabled = true                   # Primary discovery method
utp_enabled = false                  # TCP is fine on LAN — no congestion concern
metadata_exchange_enabled = true
encryption_mode = "disabled"         # No need to encrypt on trusted LAN
http_trackers_enabled = true
udp_trackers_enabled = false

[network]
max_connections_global = 100
max_connections_per_torrent = 50
half_open_connection_limit = 50
connection_timeout = 3               # Fast timeouts on LAN
peer_timeout = 30
upnp_enabled = false                 # No NAT on LAN
nat_pmp_enabled = false

[peers]
max_unchoked_peers = 8               # Unchoke everyone on LAN
optimistic_unchoke_slots = 2

[pieces]
selection_strategy = "rarest_first"
requests_per_peer = 256              # Max pipeline depth — LAN is fast
endgame_threshold_pieces = 10

[storage]
cache_size_mb = 128
read_cache_size_mb = 64
preallocation_mode = "sparse"
fsync_policy = "session_end"         # Fast — LAN transfers are quick

[bandwidth]
max_upload_rate = 0                  # Unlimited on LAN
max_download_rate = 0

[queue]
max_active_downloads = 20
max_active_seeds = -1

[observability]
log_level = "info"
```

---

## 6. Embedded Tracker (Feature: `webapi`)

When the `webapi` feature is enabled, the crate optionally includes an **embedded BitTorrent tracker** that can run alongside the client. This enables self-contained deployments where one binary is both tracker and seeder.

```rust
/// Embedded tracker configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackerConfig {
    /// Enable the embedded tracker.
    pub enabled: bool,
    /// HTTP tracker bind address.
    pub http_bind: SocketAddr,
    /// UDP tracker bind address (if udp_tracker feature).
    #[cfg(feature = "udp_tracker")]
    pub udp_bind: Option<SocketAddr>,
    /// WebSocket signaling endpoint (for WebRTC browser peers).
    #[cfg(feature = "webrtc")]
    pub ws_bind: Option<SocketAddr>,
    /// Max torrents the tracker will track.
    pub max_tracked_torrents: usize,
    /// Max peers per torrent in the tracker.
    pub max_peers_per_torrent: usize,
    /// Announce interval to tell clients (seconds).
    pub announce_interval: u32,
    /// Minimum announce interval (seconds).
    pub min_announce_interval: u32,
    /// Access control: open (anyone), whitelist, or auth callback.
    pub access_mode: TrackerAccessMode,
    /// Hierarchical peer bucketing for fast announce responses (§ 2.8.1).
    pub peer_buckets: PeerBucketConfig,
    /// Content popularity classification for adaptive seed allocation (§ 2.8.3).
    pub popularity: PopularityConfig,
}

pub enum TrackerAccessMode {
    /// Anyone can announce.
    Open,
    /// Only info hashes in the whitelist.
    Whitelist(HashSet<InfoHash>),
    /// Custom auth callback (delegate to AuthPolicy trait).
    Auth,
}
```

The embedded tracker speaks standard BEP 3/15/23 protocols and is interoperable with any standard BitTorrent client. The tracker does not need to be used with the embedded client — it can operate standalone as a lightweight tracker. When peer bucketing is enabled (§ 2.8.1), the tracker pre-classifies announced peers into a region × seed-status × transport hierarchy for O(k) announce responses instead of O(n) flat scoring. When popularity classification is enabled (§ 2.8.3), the tracker maintains per-torrent popularity tiers that drive adaptive seed box bandwidth allocation.

---

## 7. IC Integration — The Primary Consumer

This crate exists because IC needs it. But IC is not the only possible consumer — `p2p-distribute` is foundational infrastructure that IC validates first. The crate is standalone per D076 (Tier 3, Phase 5–6a) with **zero IC dependencies**.

IC uses `p2p-distribute` across multiple subsystems, not just the Workshop:

| IC Component                           | `p2p-distribute` Features Used                                                  | How It Uses `p2p-distribute`                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workshop-core` (D050)                 | `Session`, `StorageBackend`, `DiscoveryBackend`, `RevocationPolicy`, `channels` | Embeds `Session` for Workshop package download/upload. CAS blob storage. Workshop-aware peer discovery. Revocation enforcement from federation. Content channels for live metadata feeds. |
| `ic-server` Workshop capability (D074) | `Session`, embedded tracker, `AuthPolicy`, `RevocationPolicy`                   | Permanent seeding + tracker for community server. Ed25519 community auth. Block list enforcement from moderation/DMCA decisions.                                                          |
| `ic-server` relay capability (D074)    | `channels`                                                                      | Content channels for live server configuration distribution (balance patches, map rotation announcements) to connected players.                                                           |
| `ic-game` lobby auto-download          | `Session` (via `workshop-core`), priority channels                              | Lobby-urgent priority scheduling for missing content when joining a game. Fast P2P download from lobby peers before match start.                                                          |
| `ic-game` replay sharing               | `Session`, `StorageBackend`                                                     | P2P distribution of `.icrep` replay files. Players who watch a replay seed it. Community replay archives.                                                                                 |
| `ic-game` update delivery              | `Session`, `streaming`                                                          | Game update distribution via P2P swarms, reducing CDN dependency. Streaming piece selection for progressive patching.                                                                     |

**IC-specific extensions build on top of `p2p-distribute`'s traits:**

| IC Extension            | Trait Used                   | What It Does                                                                                            |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| Lobby-urgent priority   | `PriorityChannel::Custom(2)` | IC's lobby priority scheduling (D049 § piece picker) maps to `p2p-distribute`'s priority channel system |
| Authenticated announce  | `AuthPolicy`                 | IC's Ed25519 tokens (see `research/p2p-engine-protocol-design.md` § ic_auth)                            |
| Community peer filter   | `PeerFilter`                 | IC's community membership verification                                                                  |
| CAS blob storage        | `StorageBackend`             | IC's content-addressed local deduplication store (D049)                                                 |
| Workshop revocation     | `RevocationPolicy`           | Workshop federation revocation records feed the block list. Moderation and DMCA takedowns propagate.    |
| Balance/config channels | Content Channels (§ 2.5)     | Live balance patch distribution, server config updates, tournament rule pushes                          |
| Workshop metadata API   | External (not in crate)      | IC's manifest/search/dependency resolution sits above the P2P layer                                     |

**Wire protocol:** `p2p-distribute` implements standard BEP 3/5/9/10/11/14/15/23/29/52 wire protocol as described in `research/p2p-engine-protocol-design.md` §§ 1–7. IC-specific extensions (ic_auth, ic_priority) are negotiated via BEP 10 and implemented as `AuthPolicy` and `PriorityChannel` trait implementations, not as hardcoded protocol extensions in the crate.

---

## 8. GPL Boundary & Licensing Rules

Per D076:

1. **MIT OR Apache-2.0 dual-licensed.** Standard Rust ecosystem permissive licensing.
2. **Separate Git repository** from the IC monorepo. Never in the GPL codebase.
3. **No GPL code copied.** Implementations are based on:
   - BEP specifications (public domain protocol specs)
   - `librqbit` source study (Apache-2.0)
   - `libtorrent-rasterbar` documentation and blog posts (behavior study only — no code copied from the BSD-3 codebase)
   - `aquatic` protocol crates (Apache-2.0) for tracker protocol reference
   - `WebTorrent` (MIT) for WebRTC signaling patterns
   - `chihaya` (BSD-2) for tracker middleware patterns
4. **`cargo-deny` in CI** rejects any transitive GPL dependency.
5. **`CONTRIBUTING.md`** states the no-GPL-cross-pollination rule explicitly.

**Dependencies (planned, all permissive):**

| Dependency                        | License           | Purpose                                      |
| --------------------------------- | ----------------- | -------------------------------------------- |
| `tokio`                           | MIT               | Async runtime                                |
| `serde` / `serde_json` / `toml`   | MIT OR Apache-2.0 | Serialization                                |
| `sha1` / `sha2`                   | MIT OR Apache-2.0 | Hash verification                            |
| `ed25519-dalek`                   | BSD-3             | Signature verification (for auth extensions) |
| `axum` (optional)                 | MIT               | Web API                                      |
| `clap` (optional)                 | MIT OR Apache-2.0 | CLI                                          |
| `metrics` (optional)              | MIT               | Metrics export                               |
| `tracing`                         | MIT               | Structured logging                           |
| `maxminddb` (optional)            | MIT OR Apache-2.0 | GeoIP lookup                                 |
| `bendy` or `serde_bencode`        | MIT               | Bencode serialization                        |
| `quinn` (optional, future)        | MIT OR Apache-2.0 | QUIC transport (alternative to uTP)          |
| `str0m` or `webrtc-rs` (optional) | MIT OR Apache-2.0 | WebRTC data channels                         |

---

## 9. Documentation Requirements

### 8.1 Knobs Reference

Every configuration field has a reference entry structured as:

```
### `[group].field_name`
- **Type:** `u32` / `string` / `bool` / ...
- **Default:** `<value>`
- **Range:** `<min>–<max>`
- **What it does:** One-paragraph explanation.
- **Interactions:** Which other fields affect or are affected by this.
- **Pitfalls:** What breaks when you set this wrong.
- **Profile values:** embedded_minimal=X, desktop_balanced=Y, server_seedbox=Z, lan_party=W
```

### 8.2 Recipes

Each recipe is a complete, copy-pasteable config file with narrative explanation:

1. **"Embedded in app"** — Minimal dependencies, small memory footprint, no background services. `default-features = false`. 10 torrents max.
2. **"NAS daemon"** — Always-on background service, modest hardware, fast resume, periodic fsync, bandwidth-limited to not saturate home connection.
3. **"High-performance seedbox"** — 1000+ torrents, high connection count, large caches, full seeding, server hardware assumptions.
4. **"Metered connection laptop"** — Strict bandwidth caps, time-based scheduling (unlimited at night, throttled during day), uTP background mode, conservative connection count.
5. **"LAN party"** — Fast local transfers, LSD discovery, no encryption, aggressive pipeline depth.
6. **"Workshop seeder (IC)"** — IC's specific Workshop seeder configuration showing how the traits are wired.

### 8.3 Migration Guide

For every config schema change across versions:

```
## Migration: v1 → v2

### Breaking changes
- `[network].max_connections` renamed to `[network].max_connections_global`
  - Action: rename the field in your config file
- `[storage].cache_size` changed from bytes to megabytes (`cache_size_mb`)
  - Action: divide your old value by 1048576

### New fields
- `[bandwidth].rate_limiter_burst_factor` (default: 1.5) — no action needed

### Automatic migration
The crate detects v1 config files (by `config_version = 1`) and migrates
automatically with warnings. To suppress: run `p2p-distribute migrate-config`.
```

---

## 10. Testing & Quality Gates

### 9.1 Protocol Correctness

| Test Category           | What                                                    | How                                                 |
| ----------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| Bencode codec           | Round-trip fuzz every bencoded type                     | `proptest` / `arbitrary` with structured generators |
| Metainfo parsing        | Parse real .torrent files from the wild                 | Corpus of 100+ real .torrent files in test fixtures |
| Peer wire messages      | Each BEP 3 message type: serialize/deserialize/validate | Unit tests + property tests for all message types   |
| Extension handshake     | BEP 10 negotiate/respond                                | Mock peer exchange tests                            |
| Tracker protocol (HTTP) | Announce/scrape against mock tracker                    | `wiremock` HTTP server                              |
| Tracker protocol (UDP)  | BEP 15 connect/announce/scrape                          | Custom UDP mock responder                           |
| DHT                     | BEP 5 routing, find_node, get_peers, announce_peer      | Simulated Kademlia network (10–100 nodes in memory) |
| PEX                     | BEP 11 message exchange, peer list merge                | Two-peer simulation                                 |
| Piece verification      | SHA-1 verify on receive, corrupt piece rejection        | Inject bad blocks, verify ban behavior              |
| Fast extension          | BEP 6 have_all/have_none/reject/allowed_fast            | Mock peer exchange                                  |

### 9.2 Resilience

| Test Category                   | What                                  | How                                            |
| ------------------------------- | ------------------------------------- | ---------------------------------------------- |
| Bencode fuzzing                 | Malformed input → no panic/UB         | `cargo fuzz` with `libfuzzer`, 1M+ iterations  |
| Message codec fuzzing           | Random bytes → graceful error         | `cargo fuzz` for peer wire message parser      |
| Metadata fuzzing                | Malformed .torrent / magnet metadata  | `cargo fuzz` for metainfo parser               |
| Network chaos: packet loss      | 5–30% packet loss on uTP/TCP          | `toxiproxy` or `netem` (Linux) in CI           |
| Network chaos: latency          | 50–500ms added latency                | Same infrastructure                            |
| Network chaos: disconnect storm | Random disconnects every 1–10 seconds | Custom test harness                            |
| Disk chaos: ENOSPC              | Filesystem fills mid-write            | tmpfs with limited size                        |
| Disk chaos: permission denied   | Read/write/delete fail after startup  | chmod changes during test                      |
| Disk chaos: partial write       | `sync` fails, simulating crash        | Kill process mid-flush, verify resume recovery |
| Path traversal                  | Malicious .torrent with `../` paths   | Dedicated test corpus                          |

### 9.3 Performance Benchmarks

| Benchmark                              | Metric                                        | Gate                            |
| -------------------------------------- | --------------------------------------------- | ------------------------------- |
| Piece selection throughput             | Pieces selected per second (1M piece torrent) | > 100,000/s                     |
| Disk cache hit rate                    | Cache hits / total reads under mixed workload | > 90% with default cache size   |
| Connection scaling                     | Time to establish 1000 connections            | < 30 seconds                    |
| Announce throughput (embedded tracker) | Announces/sec                                 | > 10,000/s                      |
| Bencode parse throughput               | MB/s of bencode parsing                       | > 100 MB/s                      |
| Memory per torrent                     | RSS per added torrent (idle)                  | < 50 KB                         |
| Memory per peer                        | RSS per connected peer                        | < 10 KB                         |
| SHA-1 hash throughput                  | Piece hash verification MB/s                  | > 500 MB/s (hardware-dependent) |

### 9.4 Integration Tests

| Test                       | What                                                                | How                                               |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| Two-peer transfer          | Client A seeds, Client B downloads, verify complete                 | Two `Session` instances in one process            |
| Multi-peer swarm           | 10 peers, 1 initial seeder, verify all complete                     | 10 `Session` instances                            |
| Tracker-mediated discovery | Client discovers peers only via tracker, verify transfer            | Embedded tracker + 2 clients                      |
| DHT-only discovery         | No tracker, DHT bootstrap, verify peer discovery                    | DHT-enabled sessions with bootstrap nodes         |
| Magnet link                | Client B joins via magnet URI, acquires metadata from A             | BEP 9 metadata exchange test                      |
| Fast resume                | Seed, crash (kill), restart, verify no recheck needed               | Store fast resume, verify piece states restored   |
| Config layering            | Profile + file + runtime override, verify final config              | Config resolution unit tests                      |
| Profile switching          | Change profile at runtime, verify behavior changes                  | Session::set_config with new profile              |
| Priority channels          | Three torrents at different priorities, verify bandwidth allocation | Multi-torrent transfer with priority measurement  |
| WebRTC transfer            | Desktop peer ↔ WebRTC peer via signaling                            | Feature-gated integration test                    |
| Peer bucket locality       | Multi-region swarm, verify announce returns locality-sorted peers   | Embedded tracker + simulated GeoIP regions        |
| Connection pool bucketing  | All transports active, verify guaranteed slot minimums under load   | Three-transport session with contention           |
| Popularity tier stability  | Request rate oscillates near tier boundary, verify no flapping      | EWMA + hysteresis stability over 10-minute window |

### 9.5 Cross-Platform CI

| Target                      | Tier                   | Notes                                      |
| --------------------------- | ---------------------- | ------------------------------------------ |
| `x86_64-unknown-linux-gnu`  | 1 (full test suite)    | Primary development platform               |
| `x86_64-pc-windows-msvc`    | 1 (full test suite)    | Windows — different socket behavior        |
| `x86_64-apple-darwin`       | 1 (full test suite)    | macOS — different kqueue behavior          |
| `aarch64-unknown-linux-gnu` | 2 (build + unit tests) | ARM server / Raspberry Pi                  |
| `wasm32-unknown-unknown`    | 2 (build + unit tests) | WASM — verifies no_std/alloc paths compile |
| `aarch64-apple-darwin`      | 2 (build + unit tests) | Apple Silicon                              |

---

## 11. Implementation Milestones

### Milestone 1: Core Engine

**Duration:** 4–6 weeks

**Deliverables:**
- Bencode codec (serialize/deserialize, serde integration)
- Torrent metainfo parser (v1 single-file, multi-file)
- Filesystem `StorageBackend` (read/write blocks, preallocation)
- BEP 3 peer wire protocol over TCP (handshake, all core messages, keep-alive)
- Piece hash verification (SHA-1)
- Basic piece picker (rarest-first)
- `Session::new()`, `Session::add_torrent()` (from .torrent file), `TorrentHandle::stats()`
- Event stream (`Session::events()`, `TorrentHandle::events()`)
- Unit tests for all codec/parser/protocol components

**Exit criteria:** Two instances can transfer a multi-file torrent over TCP with piece verification. No tracker needed (hard-coded peer address for testing).

### Milestone 2: Trackers & Basic Seeding

**Duration:** 3–4 weeks

**Deliverables:**
- HTTP tracker client (BEP 3 announce/scrape, BEP 23 compact peer lists)
- Full download→seed lifecycle
- Choking/unchoking algorithm (standard tit-for-tat + optimistic unchoke)
- Session statistics
- Torrent state machine (FetchingMetadata → Downloading → Seeding → Paused → etc.)
- `TorrentHandle::{pause, resume, remove}`
- Integration tests: tracker-mediated two-peer transfer

**Exit criteria:** A client can download a torrent by announcing to a public tracker, transition to seeding, and upload to other standard BT clients (e.g., Transmission, qBittorrent).

### Milestone 3: Configuration System

**Duration:** 3–4 weeks

**Deliverables:**
- Full config schema (all 10 knob groups)
- Config layering (built-in → profile → file → per-torrent → runtime)
- Config validation with structured error messages
- All four built-in profiles
- TOML/YAML/JSON deserialization
- `SessionBuilder` API
- `Session::set_config()` for runtime mutation
- Rate limiting (token bucket, global + per-torrent)
- Queue management (max active downloads/seeds, seeding goals)
- Config migration framework (version detection + automatic migration)
- Documentation: knobs reference for all fields

**Exit criteria:** All 10 configuration groups are configurable and validated. Profile switching works at runtime. Config file round-trips through serialize/deserialize without loss.

### Milestone 4: UDP Tracker, PEX, Magnet Links

**Duration:** 3–4 weeks

**Deliverables:**
- UDP tracker client (BEP 15 with connection ID management)
- PEX (BEP 11 — exchange peer lists with connected peers)
- Magnet URI handling (BEP 9 metadata exchange from peers)
- `TorrentSource::MagnetUri` support
- Priority channels (background / normal / interactive)
- Per-torrent config overrides
- Tags and category system

**Exit criteria:** Client can join a swarm via magnet link, acquire metadata from peers, download, and exchange peers via PEX. UDP tracker announces work.

### Milestone 5: DHT

**Duration:** 4–5 weeks

**Deliverables:**
- BEP 5 Kademlia DHT implementation:
  - Routing table (k-buckets, 160-bit address space)
  - ping, find_node, get_peers, announce_peer
  - Token management for announce_peer
  - Bucket refresh (15-minute timer)
  - Bootstrap from seed nodes + cached nodes
  - Persistent routing table (save/load on shutdown/startup)
- DHT rate limiting (configurable queries/sec)
- Trackerless torrent support
- Integration test: DHT-only peer discovery in a 10-node simulated network

**Exit criteria:** Client can discover peers and download a torrent using only DHT (no tracker). Routing table persists across restarts.

### Milestone 6: Storage Performance

**Duration:** 3–4 weeks

**Deliverables:**
- Write-back disk cache (configurable size, background flush)
- Read cache (LRU, configurable size)
- Fast resume (save/load piece completion state, skip recheck on clean shutdown)
- Crash recovery (full recheck on unclean shutdown, configurable)
- File preallocation modes (none/sparse/full)
- Fsync policy implementation (every_write/periodic/session_end/never)
- Max open files management (LRU file handle pool)
- Move-on-complete functionality
- Benchmarks: cache hit rate, write throughput, resume load time

**Exit criteria:** Fast resume restores a 10,000-piece torrent in < 1 second. Cache hit rate > 90% under mixed read/write workload with default settings.

### Milestone 7: NAT Traversal & uTP

**Duration:** 3–4 weeks

**Deliverables:**
- UPnP port mapping (discover gateway, add/refresh/remove mappings)
- NAT-PMP / PCP port mapping
- uTP (BEP 29) transport implementation:
  - UDP-based reliable transport
  - LEDBAT congestion control
  - Integration with peer wire protocol
- External IP discovery (from tracker `yourip`, UPnP, STUN)
- LSD (BEP 14 multicast local peer discovery)
- Feature-gated: all behind `upnp_natpmp`, `utp`, `lsd` flags
- **Connection pool bucketing by transport (§ 2.8.2):**
  - `ConnectionBuckets` implementation with per-transport min/max slots
  - Slot allocation algorithm (TCP, uTP, WebRTC guaranteed minimums)
  - Dynamic redistribution when a transport is disabled
  - Unit tests: transport starvation prevention under contention

**Exit criteria:** Client behind a NAT can automatically map a port and be reachable. uTP transfers work and yield bandwidth to TCP traffic. Connection pool bucketing enforces per-transport slot minimums under contention (no transport starved when all three active).

### Milestone 8: Content Channels, Streaming & Revocation

**Duration:** 4–5 weeks

**Deliverables:**
- **Content Channels** (`channels` feature):
  - `ContentChannel` creation, `SnapshotInfo` management, retention policies
  - `Session::create_channel()`, `Session::subscribe_channel()`, `Session::publish_snapshot()`
  - Per-channel peer swarm management (announce per-channel, not per-snapshot)
  - Offline catch-up: resume from last received sequence number
  - Integration test: publisher → 3 subscribers, verify all receive snapshots
- **Streaming piece selection** (`streaming` feature):
  - `PieceStrategy::Sequential`, `PieceStrategy::StreamingHybrid`
  - `TorrentHandle::set_playback_position()` for dynamic cursor repositioning
  - Integration test: streaming download with position seeking
- **Revocation infrastructure** (`revocation` feature):
  - `RevocationPolicy` trait implementation
  - `BlockListRevocationPolicy` built-in (in-memory + file-backed)
  - Immediate torrent stop + de-announce on revocation
  - Embedded tracker respects revocation (refuses announce for revoked hashes)
  - Integration test: mid-transfer revocation stops download and de-announces

**Exit criteria:** Content channels propagate snapshots to subscribers within 5 seconds. Streaming hybrid strategy maintains playback continuity while contributing to swarm health. Revocation of an active torrent stops all transfers within 1 second.

### Milestone 9: v2/Hybrid Support

**Duration:** 3–4 weeks (feature-gated, can be deferred)

**Deliverables:**
- BEP 52 v2 torrent support:
  - Merkle tree piece hashing (SHA-256)
  - Per-file piece trees
  - v2 metainfo parsing
- Hybrid v1+v2 torrent support
- v2-aware piece picker (per-file trees)

**Exit criteria:** Client can download and seed v2 and hybrid torrents. v1 and v2 peers interoperate on hybrid torrents.

### Milestone 10: Control Surfaces

**Duration:** 3–4 weeks

**Deliverables:**
- **Web API** (`webapi` feature): RESTful HTTP API via `axum`
  - GET /api/session/stats
  - GET /api/torrents
  - POST /api/torrents (add)
  - GET/DELETE /api/torrents/{hash}
  - PATCH /api/torrents/{hash} (pause/resume/set limits)
  - GET /api/torrents/{hash}/peers
  - GET /api/torrents/{hash}/files
  - WebSocket event stream
- **JSON-RPC** (`rpc` feature): JSON-RPC 2.0 over TCP/Unix socket
- **CLI** (`cli` feature): `p2p-distribute` binary with subcommands:
  - `download <magnet|torrent>`, `seed <dir>`, `status`, `config`, `profile`
- **Embedded tracker** (in `webapi`): HTTP announce/scrape, optional UDP
- **Tracker-side peer bucketing (§ 2.8.1):**
  - `PeerBucketTree` implementation (region × seed_status × transport)
  - Hierarchical `RegionKey` (continent|country|region|city) with GeoIP-sourced classification
  - Closest-outward bucket walk on announce response
  - Integration test: simulated multi-region swarm verifies locality-better peer lists
- **Content popularity bucketing (§ 2.8.3):**
  - `PopularityTier` classification (Hot/Warm/Cold/Frozen) with EWMA + hysteresis
  - Seed box bandwidth weight allocation per tier
  - `PopularityClassifier` trait with default EWMA implementation
  - Integration test: tier stability under boundary-crossing request rates
- **Metrics** (`metrics` feature): Prometheus-compatible `/metrics` endpoint
- **GeoIP** (`geoip` feature): Peer country/city lookup, optional peer filtering by country

**Exit criteria:** A headless daemon can be fully controlled via web API and CLI. Metrics endpoint produces valid Prometheus output. Embedded tracker produces locality-optimized peer lists via bucket walk. Popularity tiers are stable at boundaries (no flapping within 10-minute hysteresis window).

### Milestone 11: Hardening & Completion

**Duration:** 4–6 weeks

**Deliverables:**
- Fuzzing: bencode, message codec, metadata parser, .torrent file parser (1M+ iterations each)
- Chaos tests: network (packet loss, latency, disconnect storms), disk (ENOSPC, permissions, crash recovery)
- Performance benchmarks: piece selection, cache, connection scaling, tracker throughput
- Cross-platform CI: Linux, Windows, macOS, ARM, WASM
- Complete documentation:
  - README with quick-start
  - Full knobs reference
  - All 6 recipes
  - API rustdoc for all public types
  - Config migration guide (v1)
- `cargo-deny` configured: reject GPL, audit advisories
- Publish to crates.io

**Exit criteria:** All acceptance criteria met (see § 11). No known crashes from fuzzing. Performance gates pass. Documentation complete.

---

## 12. Acceptance Criteria

The crate is considered **successful** when all of the following are true:

1. **Embeddable with minimal features:** A third-party application can depend on `p2p-distribute` with `default-features = false` and reliably download a torrent over TCP from a tracker-announced swarm.

2. **Headless daemon at scale:** A headless daemon using the `server_seedbox` profile can manage 1,000+ torrents with stable memory usage, no connection leaks, and correct seeding behavior.

3. **All knobs documented:** Every configuration field has a reference entry with type, default, range, description, interactions, and pitfalls. No undocumented behavior.

4. **Profiles work out of the box:** Each of the four profiles (embedded_minimal, desktop_balanced, server_seedbox, lan_party) produces correct, stable behavior without additional configuration.

5. **Licensing verified:** `cargo-deny check licenses` passes with zero GPL dependencies. Dual MIT/Apache-2.0 license files present. CONTRIBUTING.md states no-GPL rule.

6. **API stability:** Public API follows Rust semver conventions. Breaking changes require major version bump. Config schema has version field and migration path.

7. **Interoperability:** Transfers work against at least three independent BT implementations (verified in integration tests): Transmission, qBittorrent, and librqbit.

8. **Fuzz-tested:** Bencode, wire protocol, and metadata parsers survive 1M+ fuzz iterations with no panics or undefined behavior.

9. **Cross-platform:** Builds and passes unit tests on x86_64 Linux/Windows/macOS. Builds on WASM (minimal feature set).

10. **Extension points work:** At least one non-trivial custom implementation of `StorageBackend`, `PeerFilter`, `AuthPolicy`, and `RevocationPolicy` exists (in tests or examples) demonstrating the trait API works for real use cases.

11. **Content channels work end-to-end:** A publisher can create a channel, publish snapshots, and subscribers receive them via P2P. Retention policies are enforced. Offline catch-up works.

12. **Revocation is immediate:** Revoking an active torrent stops all transfers within 1 second. The embedded tracker refuses announce requests for revoked hashes. The `RevocationPolicy` trait is demonstrably composable (test: registry-backed policy + file-backed fallback).

13. **Streaming selection works:** `StreamingHybrid` strategy delivers pieces sequentially near the cursor while maintaining rarest-first for the rest of the swarm. Dynamic cursor repositioning works without restarting the torrent.

14. **Bucket-based scheduling works:** Tracker-side peer bucketing produces locality-better peer lists than flat scoring (measured via simulated multi-region swarm). Connection pool bucketing enforces transport-type minimum guarantees under contention. Content popularity classification correctly categorizes into tiers with EWMA + hysteresis stability (no flapping at tier boundaries in 10-minute test window).

---

## Cross-References

| Document                                            | Relationship                                                                                                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `research/p2p-engine-protocol-design.md`            | Wire-level protocol spec (BEP 3/5/9/10/15, IC extensions, WebRTC signaling, icpkg header). `p2p-distribute` implements the protocol-standard subset; IC-specific extensions are layered via traits. |
| `research/bittorrent-p2p-libraries.md`              | Ecosystem study. Informed build-vs-adopt decisions. `librqbit` (Apache-2.0) is the primary Rust reference.                                                                                          |
| `src/decisions/09a/D076-standalone-crates.md`       | `p2p-distribute` is Tier 3 (Phase 5–6a). MIT OR Apache-2.0. Separate repo.                                                                                                                          |
| `src/decisions/09c/D050-workshop-library.md`        | Workshop as cross-project library. `workshop-core` is the middle layer between `p2p-distribute` (transport) and game integration. Three-layer model: `p2p-distribute` → `workshop-core` → IC.       |
| `src/decisions/09e/D049-workshop-assets.md`         | Workshop P2P delivery strategy, `.icpkg` format, CAS storage, peer scoring. `p2p-distribute` is the engine; D049 is the IC integration layer.                                                       |
| `src/decisions/09b/D074-community-server-bundle.md` | `ic-server` Workshop capability uses `p2p-distribute` for permanent seeding. Relay capability uses content channels for live config distribution.                                                   |
| `src/modding/workshop.md`                           | Workshop user experience, auto-download, modpacks, revocation propagation. Sits above `p2p-distribute`.                                                                                             |
| `research/p2p-federated-registry-analysis.md`       | Competitive landscape (Uber Kraken, Dragonfly, IPFS). Informed peer scoring, scheduling, and architecture.                                                                                          |
| `src/decisions/09e/D052-community-servers.md`       | Ed25519 credential system. `AuthPolicy` implementations validate IC's signed credential records. Revocation policy cross-references community trust infrastructure.                                 |
