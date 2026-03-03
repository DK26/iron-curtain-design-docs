# `p2p-distribute` — Standalone BitTorrent-Compatible P2P Distribution Engine

> **Purpose:** Iron Curtain needs a P2P distribution engine to power its Workshop (mod/map/asset delivery), lobby auto-download, and community server seeding. No existing Rust crate meets IC's requirements — WebRTC browser interop, embeddable tracker, "all knobs" configurability, and WASM support — so we build our own. This document is the complete design specification for that crate.
> **Date:** 2026-03-03
> **License:** MIT OR Apache-2.0 (D076 Tier 3 standalone crate — separate repo, no GPL code)
> **Referenced by:** D049 (Workshop P2P distribution), D074 (Community Server Bundle), D076 (Standalone Crate Extraction Strategy)
> **References:** `research/p2p-engine-protocol-design.md` (wire protocol), `research/bittorrent-p2p-libraries.md` (ecosystem study), `src/modding/workshop.md` (Workshop integration)

---

## 0. Executive Summary

### Why This Exists

Iron Curtain's Workshop (D049/D030) needs to distribute mods, maps, asset packs, and total conversions to players — including auto-download when joining a lobby. The `ic-server` community binary (D074) needs to permanently seed Workshop content. The browser build (WASM target) needs to download content from desktop peers. These requirements demand a P2P engine with:

- **Embeddable library** — runs inside the game client, the SDK, and the server binary
- **WebRTC transport** — browser ↔ desktop peer interop for the WASM target
- **Embedded tracker** — community servers operate as self-contained tracker+seeder nodes
- **Priority-aware scheduling** — lobby-urgent downloads preempt background seeding
- **Extensible auth and storage** — IC plugs in Ed25519 community auth (D052) and content-addressed storage (D049)
- **"All knobs" configurability** — server operators, LAN party hosts, and embedded clients all need different tuning

No existing Rust crate meets these requirements. `librqbit` (the closest) lacks WebRTC, embedded tracker, bandwidth scheduling, and WASM support. So we build our own.

### What It Is

`p2p-distribute` is a single published Rust crate that implements a BitTorrent-compatible P2P distribution engine, purpose-built to power IC's content delivery but designed cleanly enough to be useful beyond IC. It is a **library first** — embeddable in game clients, server binaries, and CLI tools — with optional surfaces (web API, CLI, metrics) gated behind feature flags.

The crate has **zero IC dependencies**. IC-specific behavior (auth, CAS storage, lobby priority) is injected at runtime via extensibility traits. This separation is required by D076 (standalone MIT/Apache-2.0 crate in a separate repo, no GPL contamination).

**Competitive position:** Fills a gap in the Rust ecosystem. `librqbit` is the closest prior art (Apache-2.0, tokio-based) but lacks WebRTC transport, embedded tracker, bandwidth throttling API, WASM support, and the "all knobs" configuration depth of `libtorrent-rasterbar`. `p2p-distribute` targets the intersection: `librqbit`'s Rust-native purity with `libtorrent`'s configurability and protocol completeness.

### Guiding Principles

1. **Built for IC, useful to anyone.** IC's Workshop, lobby auto-download, and community servers are the primary design drivers. The crate is general-purpose because good engineering demands clean boundaries — not because generality is the goal.
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
```

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

# ──── Optional functionality ────
geoip = ["dep:maxminddb"]           # GeoIP peer location lookup
plugins = []                        # Dynamic plugin API (extensible peer filter, storage, etc.)

# ──── Meta features ────
full = [
    "dht", "udp_tracker", "pex", "lsd", "utp", "encryption",
    "upnp_natpmp", "v2", "hybrid_v1_v2", "webrtc",
    "webapi", "rpc", "cli", "metrics", "tracing-integration",
    "geoip", "plugins"
]

# Minimal — for deeply embedded use (just TCP BT wire protocol)
minimal = []
```

**Rationale for `default`:** The default feature set includes the protocols needed for a well-behaved client on public BT networks: DHT (trackerless discovery), PEX (peer exchange), LSD (local discovery), uTP (background-friendly transport), encryption (privacy), and NAT traversal (home network compatibility). This is the "desktop balanced" experience without heavy optional surfaces (web API, CLI, metrics).

**Binary size impact (estimated):**

| Feature Set             | Approximate Added Size | Notes                                           |
| ----------------------- | ---------------------- | ----------------------------------------------- |
| `minimal` (no defaults) | ~2 MB                  | TCP only, tracker only, no extensions           |
| `default`               | ~4 MB                  | Full desktop client capabilities                |
| `full`                  | ~8 MB                  | Includes web server, CLI parser, GeoIP database |

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

[observability]
log_level = "info"
log_format = "json"
tracing_network_spans = false
```

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

The embedded tracker speaks standard BEP 3/15/23 protocols and is interoperable with any standard BitTorrent client. The tracker does not need to be used with the embedded client — it can operate standalone as a lightweight tracker.

---

## 7. IC Integration — The Primary Consumer

This crate exists because IC needs it. Every design decision — from the extensibility traits to the priority channel system to WebRTC support — traces back to a concrete IC requirement. The crate is standalone per D076 (Tier 3, Phase 5–6a) with **zero IC dependencies**, but IC is the reason it exists and the benchmark against which it is validated.

IC consumes it as follows:

| IC Component                           | How It Uses `p2p-distribute`                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workshop-core` (D050)                 | Embeds `Session` for Workshop package download/upload. Implements `StorageBackend` with IC's CAS blob store. Implements `DiscoveryBackend` with Workshop-aware peer discovery (lobby peers, seed list). |
| `ic-server` Workshop capability (D074) | Runs a `Session` + embedded tracker for permanent seeding. Implements `AuthPolicy` with IC's Ed25519 community authentication.                                                                          |
| `ic-game`                              | Imports `workshop-core` which imports `p2p-distribute`. Never uses `p2p-distribute` directly.                                                                                                           |

**IC-specific extensions build on top of `p2p-distribute`'s traits:**

| IC Extension           | Trait Used                   | What It Does                                                                                            |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| Lobby-urgent priority  | `PriorityChannel::Custom(2)` | IC's lobby priority scheduling (D049 § piece picker) maps to `p2p-distribute`'s priority channel system |
| Authenticated announce | `AuthPolicy`                 | IC's Ed25519 tokens (see `research/p2p-engine-protocol-design.md` § ic_auth)                            |
| Community peer filter  | `PeerFilter`                 | IC's community membership verification                                                                  |
| CAS blob storage       | `StorageBackend`             | IC's content-addressed local deduplication store (D049)                                                 |
| Workshop metadata API  | External (not in crate)      | IC's manifest/search/dependency resolution sits above the P2P layer                                     |

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

| Test                       | What                                                                | How                                              |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------ |
| Two-peer transfer          | Client A seeds, Client B downloads, verify complete                 | Two `Session` instances in one process           |
| Multi-peer swarm           | 10 peers, 1 initial seeder, verify all complete                     | 10 `Session` instances                           |
| Tracker-mediated discovery | Client discovers peers only via tracker, verify transfer            | Embedded tracker + 2 clients                     |
| DHT-only discovery         | No tracker, DHT bootstrap, verify peer discovery                    | DHT-enabled sessions with bootstrap nodes        |
| Magnet link                | Client B joins via magnet URI, acquires metadata from A             | BEP 9 metadata exchange test                     |
| Fast resume                | Seed, crash (kill), restart, verify no recheck needed               | Store fast resume, verify piece states restored  |
| Config layering            | Profile + file + runtime override, verify final config              | Config resolution unit tests                     |
| Profile switching          | Change profile at runtime, verify behavior changes                  | Session::set_config with new profile             |
| Priority channels          | Three torrents at different priorities, verify bandwidth allocation | Multi-torrent transfer with priority measurement |
| WebRTC transfer            | Desktop peer ↔ WebRTC peer via signaling                            | Feature-gated integration test                   |

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

**Exit criteria:** Client behind a NAT can automatically map a port and be reachable. uTP transfers work and yield bandwidth to TCP traffic.

### Milestone 8: v2/Hybrid Support

**Duration:** 3–4 weeks (feature-gated, can be deferred)

**Deliverables:**
- BEP 52 v2 torrent support:
  - Merkle tree piece hashing (SHA-256)
  - Per-file piece trees
  - v2 metainfo parsing
- Hybrid v1+v2 torrent support
- v2-aware piece picker (per-file trees)

**Exit criteria:** Client can download and seed v2 and hybrid torrents. v1 and v2 peers interoperate on hybrid torrents.

### Milestone 9: Control Surfaces

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
- **Metrics** (`metrics` feature): Prometheus-compatible `/metrics` endpoint
- **GeoIP** (`geoip` feature): Peer country/city lookup, optional peer filtering by country

**Exit criteria:** A headless daemon can be fully controlled via web API and CLI. Metrics endpoint produces valid Prometheus output.

### Milestone 10: Hardening & Completion

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

10. **Extension points work:** At least one non-trivial custom implementation of `StorageBackend`, `PeerFilter`, and `AuthPolicy` exists (in tests or examples) demonstrating the trait API works for real use cases.

---

## Cross-References

| Document                                            | Relationship                                                                                                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `research/p2p-engine-protocol-design.md`            | Wire-level protocol spec (BEP 3/5/9/10/15, IC extensions, WebRTC signaling, icpkg header). `p2p-distribute` implements the protocol-standard subset; IC-specific extensions are layered via traits. |
| `research/bittorrent-p2p-libraries.md`              | Ecosystem study. Informed build-vs-adopt decisions. `librqbit` (Apache-2.0) is the primary Rust reference.                                                                                          |
| `src/decisions/09a/D076-standalone-crates.md`       | `p2p-distribute` is Tier 3 (Phase 5–6a). MIT OR Apache-2.0. Separate repo.                                                                                                                          |
| `src/decisions/09e/D049-workshop-assets.md`         | Workshop P2P delivery strategy, `.icpkg` format, CAS storage, peer scoring. `p2p-distribute` is the engine; D049 is the IC integration layer.                                                       |
| `src/decisions/09b/D074-community-server-bundle.md` | `ic-server` Workshop capability uses `p2p-distribute` for permanent seeding.                                                                                                                        |
| `src/modding/workshop.md`                           | Workshop user experience, auto-download, modpacks. Sits above `p2p-distribute`.                                                                                                                     |
| `research/p2p-federated-registry-analysis.md`       | Competitive landscape (Uber Kraken, Dragonfly, IPFS). Informed peer scoring, scheduling, and architecture.                                                                                          |
