# Tracking Servers & Backend Infrastructure

## Tracking Servers (Game Browser)

A tracking server (also called master server) lets players discover and publish games. It is NOT a relay — no game data flows through it. It's a directory.

```rust
/// Tracking server API — implemented by ic-net, consumed by ic-ui
pub trait TrackingServer: Send + Sync {
    /// Host publishes their game to the directory
    fn publish(&self, listing: &GameListing) -> Result<ListingId>;
    /// Host updates their listing (player count, status)
    fn update(&self, id: ListingId, listing: &GameListing) -> Result<()>;
    /// Host removes their listing (game started or cancelled)
    fn unpublish(&self, id: ListingId) -> Result<()>;
    /// Browser fetches current listings with optional filters
    fn browse(&self, filter: &BrowseFilter) -> Result<Vec<GameListing>>;
}

pub struct GameListing {
    pub host: ConnectionInfo,     // IP:port, relay ID, or join code
    pub map: MapMeta,             // name, hash, player count
    pub rules: RulesMeta,         // mod, version, custom rules
    pub players: Vec<PlayerInfo>, // current players in lobby
    pub status: LobbyStatus,     // waiting, in_progress, full
    pub engine: EngineId,         // "iron-curtain" or "openra" (for cross-browser)
    pub required_mods: Vec<ModDependency>, // mods needed to join (D030: auto-download)
}

/// Mod dependency for auto-download on lobby join (D030).
/// When a player joins a lobby, the client checks `required_mods` against
/// local cache. Missing mods are fetched from the Workshop automatically
/// (CS:GO-style). See `04-MODDING.md` § "Auto-Download on Lobby Join".
pub struct ModDependency {
    pub id: String,               // Workshop resource ID: "namespace/name"
    pub version: VersionReq,      // semver range
    pub checksum: Sha256Hash,     // integrity verification
    pub size_bytes: u64,          // for progress UI and consent prompt
}
```

### Official Tracking Server

We run one. Games appear here by default. Free, community-operated, no account required to browse (account required to host, to prevent spam).

### Custom Tracking Servers

Communities, clans, and tournament organizers run their own. The client supports a list of tracking server URLs in settings. This is the Quake/Source master server model — decentralized, resilient.

```toml
# settings.toml
[[tracking_servers]]
url = "https://track.ironcurtain.gg"     # official

[[tracking_servers]]
url = "https://rts.myclan.com/track"     # clan server

[[tracking_servers]]
url = "https://openra.net/master"        # OpenRA shared browser (Level 0 compat)

[[tracking_servers]]
url = "https://cncnet.org/master"        # CnCNet shared browser (Level 0 compat)
```

**Tracking server trust model (V28):** All tracking server URLs must use HTTPS — plain HTTP is rejected. The game browser shows trust indicators: bundled sources (official, OpenRA, CnCNet) display a verified badge; user-added sources display "Community" or "Unverified." Games listed from unverified sources connecting via unknown relays show "Unknown relay — first connection." When connecting to any listing, the client performs a full protocol handshake (version check, encryption, identity verification) before revealing user data. Maximum 10 configured tracking servers to limit social engineering surface.

### Shared Browser with OpenRA & CnCNet

Implementing community master server protocols means Iron Curtain games can appear in OpenRA's and CnCNet's game browsers (and vice versa), tagged by engine. Players see the full C&C community in one place regardless of which client they use. This is the Level 0 cross-engine compatibility from `07-CROSS-ENGINE.md`.

CnCNet is the community-run multiplayer platform for the original C&C game executables (RA1, TD, TS, RA2, YR). It provides tunnel servers (UDP relay for NAT traversal), a master server / lobby, a client/launcher, ladder systems, and map distribution. CnCNet is where the classic C&C competitive community lives — integration at the discovery layer ensures IC doesn't fragment the existing community but instead makes it larger.

**Integration scope:** Shared game browser only. CnCNet's tunnel servers are plain UDP proxies without IC's time authority, signed match results, behavioral analysis, or desync diagnosis — so IC games use IC relay servers for actual gameplay. Rankings and ladders are also separate (different game balance, different anti-cheat, different match certification). The bridge is purely for community discovery and visibility.

### Tracking Server Implementation

The server itself is straightforward — a REST or WebSocket API backed by an in-memory store with TTL expiry. No database needed — listings are ephemeral and expire if the host stops sending heartbeats.

> **Note:** The tracking server is the only backend service with truly ephemeral data. The relay, workshop, and matchmaking servers all persist data beyond process lifetime using embedded SQLite (D034). See `decisions/09e/D034-sqlite.md` for the full storage model.

## Backend Infrastructure (Tracking + Relay)

Both the tracking server and relay server are **standalone Rust binaries**. The simplest deployment is running the executable on any computer — a home PC, a friend's always-on machine, a €5 VPS, or a Raspberry Pi. No containers, no cloud, no special infrastructure required.

For larger-scale or production deployments, both services also ship as container images with docker-compose.yaml (one-command setup) and Helm charts (Kubernetes). But containers are an option, not a requirement.

There must never be a single point of failure that takes down the entire multiplayer ecosystem.

### Architecture

```
                          ┌───────────────────────────────────┐
                          │         DNS / Load Balancer        │
                          │   (track.ironcurtain.gg)          │
                          └─────┬──────────┬──────────┬───────┘
                                │          │          │
                          ┌─────▼──┐ ┌─────▼──┐ ┌────▼───┐
                          │Tracking│ │Tracking│ │Tracking│   ← stateless replicas
                          │  Pod   │ │  Pod   │ │  Pod   │      (horizontal scale)
                          └────────┘ └────────┘ └────────┘
                                         │
                          ┌──────────────▼──────────────┐
                          │   Redis / in-memory store     │   ← game listings (ephemeral)
                          │   (TTL-based expiry)          │      no persistent DB needed
                          └───────────────────────────────┘

                          ┌───────────────────────────────────┐
                          │         DNS / Load Balancer        │
                          │   (relay.ironcurtain.gg)          │
                          └─────┬──────────┬──────────┬───────┘
                                │          │          │
                          ┌─────▼──┐ ┌─────▼──┐ ┌────▼───┐
                          │ Relay  │ │ Relay  │ │ Relay  │   ← per-game sessions
                          │  Pod   │ │  Pod   │ │  Pod   │      (sticky, SQLite for
                          └────────┘ └────────┘ └────────┘       persistent records)
```

### Design Principles

1. **Just a binary.** Each server is a single Rust executable with zero mandatory external dependencies. Run it directly (`./tracking-server` or `./relay-server`), as a systemd service, in Docker, or in Kubernetes — whatever suits the operator. No external database, no runtime, no JVM. Download, configure, run. Services that need persistent storage use an embedded SQLite database file (D034) — no separate database process to install or operate.

2. **Stateless or self-contained.** The tracking server holds no critical state — listings live in memory with TTL expiry (for multi-instance: shared via Redis). The relay, workshop, and matchmaking servers persist data (match results, resource metadata, ratings) to an embedded SQLite file (D034). Killing a process loses only in-flight game sessions — persistent records survive in the `.db` file. Relay servers hold per-game session state in memory but games are short-lived; if a relay dies, recovery is **mode-specific**: casual/custom games may offer unranked continuation or fallback if supported, while ranked follows the degraded-certification / void policy (`06-SECURITY.md` V32) rather than silently switching authority paths.

3. **Community self-hosting is a first-class use case.** A clan, tournament organizer, or hobbyist runs the same binary on their own machine. No cloud account needed. No Docker needed. The binary reads a config file or env vars and starts listening. For those who prefer containers, `docker-compose up` works too. For production scale, Helm charts are available.

4. **Five minutes from download to running server.** (Lesson from ArmA/OFP: the communities that survive decades are the ones where anyone can host a server.) The setup flow is: download one binary → run it → players connect. No registration, no account creation, no mandatory configuration beyond a port number. The binary ships with sane defaults — a tracking server with in-memory storage and 30-second heartbeat TTL, a relay server with 100-game capacity and 5-second tick timeout. Advanced configuration (Redis backing, TLS, OTEL, regions) is available but never required for first-time setup. A "Getting Started" guide in the community knowledge base walks through the entire process in under 5 minutes, including port forwarding. For communities that want managed hosting without touching binaries, IC provides one-click deploy templates for common platforms (DigitalOcean, Hetzner, Railway, Fly.io).

5. **Federation, not centralization.** The client aggregates listings from multiple tracking servers simultaneously (already designed — see `tracking_servers` list in settings). If the official server goes down, community servers still work. If all tracking servers go down, direct IP / join codes / QR still work. The architecture degrades gracefully, never fails completely.

6. **Relay servers are regional.** Players connect to the nearest relay for lowest latency. The tracking server listing includes the relay region. Community relays in underserved regions improve the experience for everyone.

7. **Observable by default (D031).** All servers emit structured telemetry via OpenTelemetry (OTEL): metrics (Prometheus-compatible), distributed traces (Jaeger/Zipkin), and structured logs (Loki/stdout). Every server exposes `/healthz`, `/readyz`, and `/metrics` endpoints. Self-hosters get pre-built Grafana dashboards for relay (active games, RTT, desync events), tracking (listings, heartbeats), and workshop (downloads, resolution times). Observability is optional but ships with the infrastructure — `docker-compose.observability.yaml` adds Grafana + Prometheus + Loki with one command.

> **Shared with Workshop infrastructure.** These 7 principles apply identically to the Workshop server (D030/D049). The tracking server, relay server, and Workshop server share deep structural parallels: federation, heartbeats, rate control, connection management, observability, community self-hosting. Several patterns transfer directly between the two systems — three-layer rate control from netcode to Workshop, EWMA peer scoring from Workshop research to relay player quality tracking, and shared infrastructure (unified server binary, federation library, auth/identity layer). See `research/p2p-federated-registry-analysis.md` § "Netcode ↔ Workshop Cross-Pollination" for the full analysis.

### Deployment Options

**Option 1: Just run the binary (simplest)**

```bash
# Download and run — no Docker, no cloud, no dependencies
./tracking-server --port 8080 --heartbeat-ttl 30s
./relay-server --port 9090 --region home --max-games 50
```

Works on any machine: home PC, spare laptop, Raspberry Pi, VPS. The tracking server uses in-memory storage by default — no Redis needed for a single instance.

**Option 2: Docker Compose (one-command setup)**

```yaml
# docker-compose.yaml (community self-hosting)
services:
  tracking:
    image: ghcr.io/iron-curtain/tracking-server:latest
    ports:
      - "8080:8080"
    environment:
      - STORE=memory           # or STORE=redis://redis:6379 for multi-instance
      - HEARTBEAT_TTL=30s
      - MAX_LISTINGS=1000
      - RATE_LIMIT=10/min      # per IP — anti-spam
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/healthz"]

  relay:
    image: ghcr.io/iron-curtain/relay-server:latest
    ports:
      - "9090:9090/udp"
      - "9090:9090/tcp"
    environment:
      - MAX_GAMES=100
      - MAX_PLAYERS_PER_GAME=16
      - TICK_TIMEOUT=5s         # drop orders after 5s — anti-lag-switch
      - REGION=eu-west          # reported to tracking server
    volumes:
      - relay-data:/data        # SQLite DB for match results, profiles (D034)
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9091/healthz"]

  redis:
    image: redis:7-alpine       # only needed for multi-instance tracking
    profiles: ["scaled"]

volumes:
  relay-data:                   # persistent storage for relay's SQLite DB
```

**Option 3: Kubernetes / Helm (production scale)**

For the official deployment or large community servers that need horizontal scaling:

```yaml
# helm/values.yaml (abbreviated)
tracking:
  replicas: 3
  resources:
    requests: { cpu: 100m, memory: 64Mi }
    limits: { cpu: 500m, memory: 128Mi }
  store: redis
  redis:
    url: redis://redis-master:6379

relay:
  replicas: 5                   # one pod per ~100 concurrent games
  resources:
    requests: { cpu: 200m, memory: 128Mi }
    limits: { cpu: 1000m, memory: 256Mi }
  sessionAffinity: ClientIP     # sticky sessions for relay game state
  regions:
    - name: eu-west
      replicas: 2
    - name: us-east
      replicas: 2
    - name: ap-southeast
      replicas: 1
```

### Cost Profile

Both services are lightweight — they forward small order packets, not game state. The relay does zero simulation: each game session costs ~2-10 KB of memory (buffered orders, liveness tokens, filter state) and ~5-20 µs of CPU per tick. This is pure packet routing, not game logic.

| Deployment                     | Cost               | Serves                   | Requires                |
| ------------------------------ | ------------------ | ------------------------ | ----------------------- |
| Embedded relay (listen server) | Free               | 1 game (host plays too)  | Port forwarding         |
| Home PC / spare laptop         | Free (electricity) | ~50 concurrent games     | Port forwarding         |
| Raspberry Pi                   | ~€50 one-time      | ~50 concurrent games     | Port forwarding         |
| Single VPS (community)         | €5-10/month        | ~200 concurrent games    | Nothing special         |
| Small k8s cluster (official)   | €30-50/month       | ~2000 concurrent games   | Kubernetes knowledge    |
| Scaled k8s (launch day spike)  | €100-200/month     | ~10,000 concurrent games | Kubernetes + monitoring |

The relay server is the heavier service (per-game session state, UDP forwarding) but still tiny — each game session is a few KB of buffered orders. A single pod handles ~100 concurrent games easily. The ~50 game estimates for home/Pi deployments are conservative practical guidance, not resource limits — the relay's per-game cost is so low that hardware I/O and network bandwidth are the actual ceilings.

### Backend Language

The tracking server is a standalone Rust binary (not Bevy — no ECS needed). It shares `ic-protocol` for order serialization.

The relay logic lives as a library (`RelayCore`) in `ic-net`. This library is used in two contexts:
- **`relay-server` binary** — standalone headless process that hosts multiple concurrent games. Not Bevy, no ECS. Uses `RelayCore` + async I/O (tokio). This is the "dedicated server" for community hosting, server rooms, and Raspberry Pis.
- **Game client** — `EmbeddedRelayNetwork` wraps `RelayCore` inside the game process. The host player runs the relay and plays simultaneously. Uses Bevy's async task system for I/O. This is the "Host Game" button.

Both share `ic-protocol` for order serialization. Both are developed in Phase 5 alongside the multiplayer client code. For the full async runtime architecture (tokio thread bridge for Bevy binaries, WASM portability, `IoBridge` trait), see `architecture/crate-graph.md` § "Async Architecture: Dual-Runtime with Channel Bridge."

### Failure Modes

| Failure                      | Impact                                                                                                 | Recovery                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tracking server dies         | Browse requests fail; existing games unaffected                                                        | Restart process; multi-instance setups have other replicas                                                                                                                                               |
| All tracking servers down    | No game browser; existing games unaffected                                                             | Direct IP, join codes, QR still work                                                                                                                                                                     |
| Relay server dies            | Games on that instance disconnect; persistent data (match results, profiles) survives in SQLite (D034) | **Casual/custom:** may offer unranked continuation via reconnect/fallback if supported. **Ranked:** no automatic authority-path switch; use degraded certification / void policy (`06-SECURITY.md` V32). |
| Official infra fully offline | Community tracking/relay servers still operational                                                     | Federation means no single operator is critical                                                                                                                                                          |
