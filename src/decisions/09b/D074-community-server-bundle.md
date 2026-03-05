## D074: Community Server — Unified Binary with Capability Flags

|                |                                                                                                                                                                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                                                                                                                                                                                                                 |
| **Phase**      | Phase 2 (health + logging), Phase 4 (Workshop seeding), Phase 5 (full Community Server with all capabilities), Phase 6a (federation, self-update, advanced ops)                                                                                                                                                                          |
| **Depends on** | D007 (relay server), D030 (Workshop registry), D034 (SQLite), D049 (P2P distribution), D052 (community servers), D055 (ranked matchmaking), D072 (server management)                                                                                                                                                                     |
| **Driver**     | Multiple decisions describe overlapping server-side components (relay, tracking, Workshop, ranking, matchmaking, moderation) as conceptually separate services with inconsistent naming (`ic-relay` vs `ic-server`). Operators need a single binary with a single setup experience — not five separate services to install and maintain. |

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Multi-phase (Phase 2 health → Phase 4 Workshop seeding → Phase 5 full Community Server → Phase 6a federation)
- **Canonical for:** Unified `ic-server` binary, capability flag model, Workshop-as-BitTorrent-client philosophy, community discovery seed list, operator setup experience, federated content moderation (Content Advisory Records), Workshop safety model ("cannot get it wrong")
- **Scope:** `ic-net`, `ic-server` binary, `server_config.toml`, Docker images, deployment templates, community seed list repo, Content Advisory Record (CAR) format
- **Decision:** All server-side capabilities (relay, tracker, Workshop P2P seeder, ranking, matchmaking, moderation) ship as a **single `ic-server` binary** with independently toggleable `[capabilities]` flags in `server_config.toml`. The Workshop capability is fundamentally a **specialized BitTorrent client/seeder**, not a web application. Community discovery uses a **static seed list** hosted in a separate GitHub repo, complementing each community's real-time tracker. Federated content moderation uses **Content Advisory Records (CARs)** — Ed25519-signed advisories that communities share to coordinate trust signals about Workshop content, with consensus-based enforcement ("Garden Fence" model).
- **Why:**
  - Resolves naming inconsistency (`ic-relay` vs `ic-server`) — the binary is `ic-server`
  - Formalizes D052's capability list into concrete config flags
  - "$5 VPS operator" runs one binary, not five services
  - Workshop-as-P2P-seeder eliminates the need for centralized CDN infrastructure
  - IC builds its own P2P engine — studies existing implementations but does not bend around their limitations
  - Static seed list provides zero-cost community discovery with no single point of failure
- **Non-goals:** Microservice architecture, mandatory cloud hosting, centralized content CDN, dependence on external BT library limitations, centralized moderation authority
- **Out of current scope:** WebTorrent bridge for browser builds (Phase 5+), Kubernetes Operator multi-capability CRD (Phase 6a), Steam Workshop bridge
- **Invariants preserved:** Sim/net boundary unchanged; server never runs simulation; relay remains an order router with time authority; sandbox safety is architectural (not policy) — default settings make harm impossible, not just unlikely
- **Defaults / UX behavior:** Default preset is `community` (relay + tracker + workshop + ranking). `ic-server` with no config auto-creates `server_config.toml` with `community` preset. First-run setup wizard via `ic-server --setup` or web dashboard on first access.
- **Security / Trust impact:** Each capability inherits its own trust model (D052 Ed25519 identity for ranking, D007 relay signing for match certification). Capability isolation: disabling a capability removes its ICRP endpoints, health fields, and attack surface. Content Advisory Records (CARs) provide federated, Ed25519-signed content trust signals; Garden Fence consensus prevents single-community censorship.
- **Public interfaces / types / commands:** `[capabilities]` config section, `--preset` CLI flag, deployment presets (`minimal`, `community`, `competitive`, `workshop-seed`, `custom`), `ic-server --setup`, Content Advisory Record (CAR) format, `[content_trust]` config section, `[workshop.moderation]` quarantine config
- **Affected docs:** `09b-networking.md`, `09-DECISIONS.md`, `AGENTS.md`, `15-SERVER-GUIDE.md` (D072 references `ic-relay` → `ic-server`), `architecture/install-layout.md`
- **Keywords:** community server, ic-server, unified binary, capability flags, workshop bittorrent, P2P seeder, seed list, community discovery, deployment preset, server bundle, content advisory record, CAR, federated moderation, Garden Fence, consensus trust, quarantine, advisory sync, content trust, blocklist, signed advisory, safe by default, cannot get it wrong, no permission fatigue, sandbox safety

---

### The Problem: Five Services, Three Names, Zero Packaging

The existing design describes these server-side components across separate decisions:

| Component                                           | Designed in   | Binary name used             |
| --------------------------------------------------- | ------------- | ---------------------------- |
| Relay (order router)                                | D007          | `ic-relay` (D072)            |
| Tracking server (game browser)                      | 03-NETCODE.md | unspecified                  |
| Workshop server (content hosting)                   | D030, D049    | unspecified                  |
| Community server (ranking, matchmaking, moderation) | D052          | `ic-server` (mentioned once) |
| Server management (CLI, dashboard)                  | D072          | `ic-relay`                   |

D052 states: "The `ic-server` binary bundles all capabilities into a single process with feature flags." D072 designs the full management experience but scopes it to relay only under the name `ic-relay`. The research file (`research/p2p-federated-registry-analysis.md`) proposes `ic-server all` but classifies it as an opportunity, not a settled decision.

**D074 resolves this:** one binary, one name, one config, one setup experience.

---

### 1. The Unified Binary: `ic-server`

The binary is `ic-server`. All references to `ic-relay` in D072 are superseded by `ic-server`. The relay is one capability among six, not the identity of the binary.

#### Capability Flags

Each capability is independently enabled in `server_config.toml`:

```toml
[capabilities]
relay = true          # Dedicated game server — order router with time authority (D007)
tracker = true        # Game discovery / server browser
workshop = true       # Content hosting via P2P seeding (D030, D049)
ranking = true        # Rating authority, signs SCRs (D052)
matchmaking = true    # Skill-based queue (D055)
moderation = false    # Overwatch-style review system (D052, opt-in)
```

**"Relay" is IC's dedicated server.** Unlike traditional game engines (Unreal, Source) where a dedicated server runs a headless simulation, IC's dedicated server is an **order router with time authority** (D007). It receives player orders, validates them (D012), assigns sub-tick timestamps (D008), and rebroadcasts — it never runs the sim. This makes it extremely lightweight (~2–10 KB memory per game) and is why it's called "relay." The same `RelayCore` library component can also be embedded inside a game client for listen-server mode ("Host Game" button, zero external infrastructure). Enabling the `relay` capability in `ic-server` is what makes it a dedicated game server — capable of hosting multiplayer matches, handling NAT traversal, blocking lag switches, signing replays, and providing the trust anchor for ranked play.

**Why a relay is sufficient — and when it isn't.** IC uses **deterministic lockstep**: all clients run the exact same simulation from the same validated orders. Players send commands ("move unit to X", "build tank"), not state ("I have 500 tanks"). A compromised client cannot report more units, stronger units, or extra resources — the simulation computes state identically on every machine. Invalid orders (build without resources, control enemy units) are rejected deterministically by every client's sim and by the relay before broadcast (D012). A cheater who modifies their local state simply desyncs from every other player and gets detected by per-tick sync hash comparison.

The one vulnerability lockstep cannot solve is **maphack** — since every client runs the full simulation, all game state exists in client memory, and fog of war is a rendering filter, not a data boundary. IC addresses this with `FogAuthoritativeNetwork` (06-SECURITY.md) — a `NetworkModel` variant (D006) where the server runs the sim and sends each client only the entities they can see. This is a heavier deployment (real CPU per game, not just order routing), but it uses the same `ic-server` binary, the same `NetworkModel` trait, and the same capability infrastructure. An operator enables it per-room or per-match-type — it is not a separate product. The architecture (trait abstraction, capability flags, server binary) supports FogAuth from day one; implementation ships at `M11` (`P-Optional`).

| Deployment          | Server runs sim?                             | Maphack-proof?          | Cost                | Use case                                      |
| ------------------- | -------------------------------------------- | ----------------------- | ------------------- | --------------------------------------------- |
| **Relay (default)** | No — order router only                       | No (fog is client-side) | ~2–10 KB/game       | Casual, ranked, LAN, most play                |
| **FogAuth**         | Yes — full sim, partial state to each client | Yes                     | Real CPU per game   | Tournaments, high-stakes, anti-cheat-critical |
| **Listen server**   | No — embedded relay in host client           | No                      | Zero infrastructure | "Host Game" button, zero setup                |

All three are `NetworkModel` implementations behind the same trait. Clients use the same protocol. The sim has zero imports from `ic-net` (D006 invariant).

When a capability is disabled:
- Its ICRP endpoints are not registered (404 for capability-specific routes)
- Its health fields are omitted from `/health` response
- Its dashboard pages are hidden
- Its CLI subcommands return "capability not enabled" with instructions to enable
- Its background tasks do not start (zero CPU/memory overhead)

#### Deployment Presets

Presets are named configurations that set sensible defaults for common use cases. They extend D072's deployment profiles (which control gameplay parameters) with capability selection:

| Preset          | Capabilities Enabled                                       | Use Case                                                    |
| --------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| `minimal`       | relay                                                      | Dedicated game server only — LAN party, small clan, testing |
| `community`     | relay, tracker, workshop, ranking                          | Standard community server (default)                         |
| `competitive`   | relay, tracker, workshop, ranking, matchmaking, moderation | Tournament / league server                                  |
| `workshop-seed` | workshop                                                   | Dedicated content seeder (bandwidth volunteer)              |
| `custom`        | operator picks                                             | Advanced operators                                          |

```
$ ic-server --preset community
[INFO] Iron Curtain Community Server v0.5.0
[INFO] Config: server_config.toml (created with 'community' preset)
[INFO] Capabilities: relay, tracker, workshop, ranking
[INFO] ICRP: ws://127.0.0.1:19710
[INFO] Web dashboard: http://127.0.0.1:19710/dashboard
[INFO] Health: http://127.0.0.1:19710/health
[INFO] Game: udp://0.0.0.0:19711
[INFO] Workshop P2P: seeding 0 packages, tracker active
[INFO] Ready.
```

#### Unified Health Endpoint

The `/health` response adapts to enabled capabilities:

```json
{
  "status": "ok",
  "version": "0.5.0",
  "uptime_seconds": 307320,
  "capabilities": ["relay", "tracker", "workshop", "ranking"],
  "relay": {
    "player_count": 6,
    "player_max": 12,
    "active_matches": 1,
    "tick_rate": 30
  },
  "tracker": {
    "listed_games": 3,
    "browse_requests_per_min": 12
  },
  "workshop": {
    "packages_seeded": 47,
    "active_peers": 12,
    "upload_bytes_sec": 524288,
    "download_bytes_sec": 0
  },
  "ranking": {
    "rated_players": 342,
    "matches_rated_today": 28
  },
  "system": {
    "cpu_percent": 12.3,
    "memory_mb": 142,
    "db_size_mb": 8.2
  }
}
```

Fields for disabled capabilities are omitted entirely.

#### Unified Dashboard

D072's web dashboard extends per-capability:

| Page              | Capability | Shows                                               |
| ----------------- | ---------- | --------------------------------------------------- |
| **Status** (home) | all        | Server health, enabled capabilities, system metrics |
| **Players**       | relay      | Connected players, ping, kick/ban                   |
| **Matches**       | relay      | Active/recent matches, replays                      |
| **Server Log**    | all        | Live log viewer                                     |
| **Config**        | all        | `server_config.toml` with inline editing            |
| **Bans**          | relay      | Ban list management                                 |
| **Backups**       | all        | SQLite backup/restore                               |
| **Workshop**      | workshop   | Seeded packages, peer connections, download stats   |
| **Rankings**      | ranking    | Leaderboard, rating distribution, season status     |
| **Moderation**    | moderation | Review queue, case history, reviewer stats          |
| **Tracker**       | tracker    | Listed games, heartbeat status                      |

Pages for disabled capabilities do not appear in the navigation.

#### Configuration Versioning and Migration

`server_config.toml` includes a `config_version` field that enables automatic migration when operators upgrade their server binary:

```toml
[meta]
config_version = 3
```

When the server encounters `config_version` lower than the current binary's expected version:
1. Parse the old format
2. Apply migration rules (rename fields, move sections, adjust defaults)
3. Log warnings: `[WARN] Config field 'relay.max_connections' is deprecated, use 'relay.connection_limit'`
4. Write the migrated config to `server_config.toml` (preserving comments via `toml_edit`)
5. Continue with the migrated values

This ensures that a `$5 VPS operator` who runs `ic server update apply` doesn't end up with a silently broken config where renamed fields fall back to defaults. D072's existing "unknown key detection with typo suggestions" catches typos; config versioning catches intentional renames between versions.

**N-1 compatibility guarantee:** The current server version accepts configuration from the previous version. This gives operators a one-version upgrade window before migration is mandatory.

**Phase:** Config migration is a Phase 5 concern (when community servers exist and upgrades become a real operational concern). The `config_version` field should be present from the first `server_config.toml` schema definition.

#### Secrets Separation

Sensitive values (ICRP passwords, OAuth tokens, identity keys) are separated from general configuration:

```toml
# server_config.toml — no plaintext secrets
[admin]
identity_key_file = "secrets/admin.key"    # reference, not inline

[icrp]
# password not stored here — injected via env var or secrets file
```

```toml
# secrets.toml — separate file, stricter permissions (0600 on Unix)
[icrp]
password_hash = "$argon2id$..."    # hashed, not plaintext
```

The `ic server validate-config` command warns if it detects plaintext secrets in `server_config.toml`:

```
[WARN] server_config.toml contains 'icrp.password' in plaintext.
       Move to secrets.toml or use env var IC_ICRP_PASSWORD.
```

**Precedence:** Environment variables (`IC_ICRP_PASSWORD`, etc.) override `secrets.toml`, which overrides `server_config.toml`. This aligns with the three-layer config precedence (D064: TOML → env vars → runtime cvars) and the standard Docker/K8s pattern of injecting secrets via environment.

**Phase:** Security hygiene item. Addressed in Phase 5 alongside the server management CLI. See `research/cloud-native-lessons-for-ic-platform.md` § 11.

#### Server Capability Labels

Federation servers carry key-value metadata labels beyond boolean capability flags, enabling intelligent routing:

```toml
[server.labels]
region = "eu-west"
game_module = "ra1"
tier = "competitive"
provider = "community-guild-xyz"
bandwidth_class = "high"      # gigabit, high, medium, low
```

The matchmaking system routes players by label selector: "find a relay in `region=eu-west` with `tier=competitive` and `game_module=ra1`." This is more expressive than priority-based source ordering and enables:

- **Geographic routing:** Players connect to the nearest relay (lower latency)
- **Game-module routing:** RA1 players go to RA1 servers, TD players go to TD servers
- **Tier routing:** Ranked games go to `tier=competitive` servers, casual games to `tier=casual`
- **Capability routing:** A player needing Workshop content is routed to a server with `workshop` capability

Labels are self-declared metadata — they are not verified by the federation protocol. Mislabeled servers produce suboptimal routing, not security failures (matchmaking falls back to any available server).

**Phase:** Server labels extend D074's capability flags from booleans to key-value metadata. Implementable when the federation protocol is designed (Phase 5). See `research/cloud-native-lessons-for-ic-platform.md` § 7 for rationale.

---

### 2. Workshop as BitTorrent Client

The Workshop capability is not a web application that serves files over HTTP. It is a **specialized BitTorrent client** — a dedicated seeder that permanently seeds all content in its repository and acts as a BitTorrent tracker for peer coordination.

#### What "Hosting a Workshop" Means

Running a Workshop means running a P2P seeder:

1. **Seeding:** The Workshop capability permanently seeds all `.icpkg` packages in its repository via standard BitTorrent protocol. It is always available as a peer for any content it hosts.
2. **Tracking:** The Workshop runs an embedded BitTorrent tracker that coordinates peer discovery for its hosted content. Players connecting to this community's Workshop discover peers through this tracker.
3. **Metadata:** A thin HTTP REST API serves package manifests, search results, and dependency metadata. This is lightweight — manifests are small YAML files, not asset data. The heavy lifting (actual content transfer) is always BitTorrent.
4. **Auto-seeding by players:** Players who download content automatically seed it to other peers (D049, opt-out available in `settings.toml`). Popular content has many seeders. The Workshop server is the permanent seed; players are transient seeds.

#### Workshop-Only Deployment

Community members who want to contribute bandwidth without hosting games can run:

```
$ ic-server --preset workshop-seed
[INFO] Iron Curtain Community Server v0.5.0
[INFO] Capabilities: workshop
[INFO] Workshop P2P: seeding 47 packages, tracker active
[INFO] No relay, tracker, or ranking capabilities enabled.
[INFO] Ready. Contributing bandwidth to the community.
```

This is the BitTorrent seed box use case. A community might have one `competitive` server for games and three `workshop-seed` instances spread across regions for content distribution.

#### P2P Engine: IC Defines the Standard

IC builds its own P2P content distribution engine — purpose-built for game Workshop content, implemented in pure Rust, speaking standard BitTorrent wire protocol where it makes sense and extending it where IC's use case demands.

Existing implementations (librqbit, libtorrent-rasterbar, aquatic, WebTorrent) are **studied for protocol understanding and architectural patterns**, not adopted as hard dependencies. If a component fits perfectly without constraining IC, it may be used. But IC does not bend around external limitations — it implements what it needs. See `research/bittorrent-p2p-libraries.md` for the full design study.

**What IC's P2P engine implements:**

| Component                    | Approach                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BT wire protocol**         | Implement from BEP 3/5/9/10/23/29 specs. Standard protocol — clients interoperate with any BT peer.                                                                     |
| **Embedded tracker**         | Built into `ic-server`. Simple announce/scrape protocol with IC-specific authenticated announce (D052 Ed25519 identity). No external tracker dependency.                |
| **WebRTC transport**         | BT wire protocol over WebRTC data channels. Enables browser↔desktop interop. Workshop server acts as bridge node speaking TCP + uTP + WebRTC simultaneously.            |
| **Bandwidth control**        | First-class configurable upload/download limits, seeding policies, per-peer throttling.                                                                                 |
| **Content-aware scheduling** | IC's domain knowledge produces better piece selection than any generic BT client. Lobby-urgent priority, rarest-first within tiers, endgame mode, background pre-fetch. |
| **Metadata service**         | Thin REST API for package manifests, search, and dependency resolution. Secondary to the P2P transfer layer.                                                            |

**Transport strategy:**

```
Desktop (Windows/macOS/Linux)
├── TCP     — standard BT, always available
├── uTP     — UDP-based, doesn't saturate home connections
└── WebRTC  — bridges with browser peers

Browser (WASM)
└── WebRTC  — only option, via web-sys / WebRTC data channels

Workshop Server (ic-server with workshop capability)
├── TCP     — seeds to desktop peers
├── uTP     — seeds to desktop peers
└── WebRTC  — seeds to browser peers, bridges both swarms
```

**Where IC extends beyond standard BitTorrent:**

- **Package-aware piece prioritization:** Standard BT treats all pieces equally. IC knows which `.icpkg` a piece belongs to, which lobby needs it, and which player requested it. Priority channels (lobby-urgent > user-requested > background) schedule on top of standard piece selection.
- **Authenticated announce:** IC's tracker requires per-session tokens tied to Ed25519 identity (D052). Standard BT trackers are anonymous.
- **Workshop registry integration:** Manifest lookup, dependency resolution, and version checking happen before the BT transfer begins. Standard BT distributes raw bytes with no semantic awareness.
- **Peer scoring with domain knowledge (D049):** `PeerScore = Capacity(0.4) + Locality(0.3) + SeedStatus(0.2) + LobbyContext(0.1)`. IC knows lobby membership, geographic proximity, and content popularity — producing better peer selection than generic BT.

**Open design question (uTP vs. QUIC):** Standard BT uses uTP (BEP 29) for UDP transport. QUIC (`quinn` crate, pure Rust, mature) provides similar congestion control with modern TLS and multiplexing. IC could speak uTP for BT interop and QUIC for IC-to-IC optimized transfers. Decision deferred to Phase 4 implementation — both are viable.

#### Relationship to D049

D049 defines the P2P distribution protocol, piece selection strategies, peer scoring, and seeding configuration. D074 does not change any of that. D074 establishes that:

- The Workshop capability in `ic-server` is the **deployment vehicle** for D049's P2P design
- IC builds a purpose-built P2P engine informed by studying the best existing implementations
- "Workshop server" = "dedicated P2P seeder + embedded tracker + thin metadata API"

---

### 3. Community Discovery via Seed List

#### The Problem

Players need to discover communities. The tracking server (03-NETCODE.md) handles real-time game session discovery within a community. But how does a player find communities in the first place?

#### Solution: Static Seed List + Real-Time Tracking

Two-layer discovery, analogous to DNS:

**Layer 1 — Static Seed List (community discovery):**

A separate lightweight GitHub repository (e.g., `iron-curtain/community-servers`) hosts a YAML file listing known community servers:

```yaml
# community-servers.yaml
version: 1
updated: 2026-02-26T12:00:00Z

communities:
  - name: "Iron Curtain Official"
    region: global
    endpoints:
      relay: "relay.ironcurtain.gg:19711"
      tracker: "tracker.ironcurtain.gg:19710"
      workshop: "workshop.ironcurtain.gg:19710"
      icrp: "wss://api.ironcurtain.gg:19710"
    public_key: "ed25519:7f3a...b2c1"
    capabilities: [relay, tracker, workshop, ranking, matchmaking, moderation]
    verified: true

  - name: "Wolfpack Clan"
    region: eu-west
    endpoints:
      relay: "wolfpack.example.com:19711"
      tracker: "wolfpack.example.com:19710"
      workshop: "wolfpack.example.com:19710"
      icrp: "wss://wolfpack.example.com:19710"
    public_key: "ed25519:a1d4...e8f2"
    capabilities: [relay, tracker, ranking]
    verified: false

  - name: "Southeast Asia Community"
    region: ap-southeast
    endpoints:
      relay: "sea-ra.example.com:19711"
    public_key: "ed25519:c3b7...9a12"
    capabilities: [relay]
    verified: false
```

- Community servers register by submitting a PR. Maintainers merge after basic verification (server responds to health check, public key matches).
- The game client fetches this list on startup (single HTTP GET to raw.githubusercontent.com — CDN-backed, same pattern as D030's Git Index).
- Same proven pattern as Homebrew taps, crates.io-index, Winget, Nixpkgs.
- Zero hosting cost. No single point of failure beyond GitHub.

**Layer 2 — Real-Time Tracking (game session discovery):**

Each community server with the `tracker` capability runs its own real-time game session tracker (as designed in 03-NETCODE.md). The seed list provides the tracker endpoints. Clients connect to each community's tracker to see live games.

Small communities without the `tracker` capability: clients connect directly to the community's relay endpoint. The relay itself reports its hosted games to connected clients.

#### Relationship to D030's Git Index

D030's Workshop Git Index (`iron-curtain/workshop-index`) hosts content package manifests. The community seed list (`iron-curtain/community-servers`) hosts community server addresses. Same pattern, different purpose:

| Repository                       | Contains                                 | Purpose                       |
| -------------------------------- | ---------------------------------------- | ----------------------------- |
| `iron-curtain/workshop-index`    | Package manifests + download URLs        | Content discovery (Phase 0–3) |
| `iron-curtain/community-servers` | Community server endpoints + public keys | Community discovery           |

---

### 4. Operator Setup Experience

#### First-Run Wizard

When `ic-server` starts with no existing `server_config.toml`, it enters a first-run setup flow. Two entry points:

**Terminal wizard** (`ic-server --setup`):

```
$ ic-server --setup

  ╔══════════════════════════════════════════╗
  ║  Iron Curtain Community Server Setup     ║
  ╚══════════════════════════════════════════╝

  Choose a deployment preset:

  [1] minimal       — Relay only (LAN party, small clan)
  [2] community     — Relay + tracker + workshop + ranking (recommended)
  [3] competitive   — All capabilities including moderation
  [4] workshop-seed — Workshop seeder only (bandwidth volunteer)
  [5] custom        — Choose individual capabilities

  > 2

  Server name: My Community Server
  Public address (leave blank for auto-detect): play.mycommunity.gg
  Admin identity (Ed25519 public key): ed25519:7f3a...b2c1

  Register with the community seed list? (submit a PR to iron-curtain/community-servers)
  [y/n] > y

  Config written to: server_config.toml
  Starting server...
```

**Web dashboard first-run:** If `ic-server` starts without config, it creates a minimal config, starts with all capabilities disabled, and serves only the setup wizard page on the dashboard. The operator completes setup in the browser, the config is written, and the server restarts with selected capabilities.

#### Packaging

| Distribution          | What                                                                       | Phase    |
| --------------------- | -------------------------------------------------------------------------- | -------- |
| **Standalone binary** | Single `ic-server` binary + README                                         | Phase 5  |
| **Docker**            | `ghcr.io/ironcurtain/ic-server:latest` (scratch + musl, ~8–12 MB)          | Phase 5  |
| **Docker (debug)**    | `ghcr.io/ironcurtain/ic-server:debug` (Debian slim, includes curl/sqlite3) | Phase 5  |
| **One-click deploy**  | Templates for DigitalOcean, Hetzner, Railway, Fly.io                       | Phase 5  |
| **Helm chart**        | `ironcurtain/community-server` (extends D072's Kubernetes Operator)        | Phase 6a |

Docker image naming changes from D072:
- `relay:latest` → `ic-server:latest`
- `relay:debug` → `ic-server:debug`

Dockerfile targets change from `--bin ic-relay` to `--bin ic-server`. All other Docker design (scratch + musl, non-root user, `/data` volume, multi-arch) carries forward unchanged from D072.

---

### 5. Federated Content Moderation — Signed Advisories

> **Full section:** [D074 — Federated Moderation](D074/D074-federated-moderation.md)

Content Advisory Records (CARs) — Ed25519-signed advisories shared between communities using Garden Fence consensus thresholds. Covers: CAR format, consensus trust, tracker enforcement, advisory sync, no-silent-auto-updates defense (fractureiser-class), quarantine-before-release, five-layer player-facing safety model ("cannot get it wrong"), and relationship to existing moderation (D052 behavioral review, D030 publisher trust, 06-SECURITY supply chain).

---

### 6. Cross-References & Resolved Gaps

| Gap                                                                             | Resolution                                                                                                                                                       |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D072 calls binary `ic-relay`, install layout calls it `ic-server`               | **Resolved:** binary is `ic-server`. All D072 management interfaces apply to the unified binary.                                                                 |
| D052 mentions `ic-server` with feature flags but never specifies them           | **Resolved:** `[capabilities]` section in `server_config.toml` with six flags.                                                                                   |
| Workshop server described as separate binary in D030/D049                       | **Resolved:** Workshop is a capability within `ic-server`, deployable standalone via `workshop-seed` preset.                                                     |
| No P2P engine design study                                                      | **Resolved:** IC builds its own P2P engine from BT specs, informed by studying existing implementations. Design study in `research/bittorrent-p2p-libraries.md`. |
| No community discovery mechanism beyond per-community tracking                  | **Resolved:** Static seed list in `iron-curtain/community-servers` GitHub repo.                                                                                  |
| No operator setup experience for server deployment                              | **Resolved:** First-run wizard via `ic-server --setup` and web dashboard.                                                                                        |
| D072 dashboard pages relay-only                                                 | **Resolved:** Dashboard extends per-capability (Workshop, Rankings, Moderation, Tracker pages).                                                                  |
| Docker images named `relay:*`                                                   | **Resolved:** renamed to `ic-server:*`.                                                                                                                          |
| No cross-community content moderation coordination                              | **Resolved:** Content Advisory Records (CARs) — Ed25519-signed advisories shared between communities, with Garden Fence consensus thresholds.                    |
| No defense against fractureiser-class attacks (compromised author auto-updates) | **Resolved:** `ic.lock` pins versions + SHA-256; no silent auto-updates; quarantine-before-release for new publications.                                         |

### Decisions NOT Changed by D074

D074 is a consolidation and packaging decision. It does not alter:

- D007's relay architecture (filter chain, sub-tick ordering, time authority)
- D030's registry design (semver, dependency resolution, repository types)
- D049's P2P protocol (piece selection, peer scoring, seeding config, `.icpkg` format)
- D052's credential system (SCR format, Ed25519 identity, trust chain)
- D055's ranked system (Glicko-2, tiers, seasons, matchmaking queue)
- D072's management interfaces (CLI, dashboard, in-game admin, ICRP — only extends them to all capabilities)

---

### Execution Overlay Mapping

- **Phase 2:** `/health` endpoint includes `capabilities` field. Structured logging works for all capabilities.
- **Phase 4:** Workshop capability ships with `ic-server`. IC's own P2P engine (BT wire protocol, embedded tracker, piece scheduling). `workshop-seed` preset available. Basic Workshop dashboard page.
- **Phase 5:** Full Community Server with all six capabilities. First-run wizard. Docker images renamed. Deployment presets. Dashboard pages for all capabilities. Community seed list repo created. Content Advisory Records (CARs) — publish, subscribe, consensus-based enforcement. Quarantine-before-release for Workshop.
- **Phase 6a:** Federation across Community Servers. Cross-community advisory sync automation. Kubernetes Operator multi-capability CRD. Self-update. Advanced monitoring.
- **Priority:** `P-Core` (community server packaging is required for multiplayer infrastructure)
- **Feature Cluster:** `M5.INFRA.COMMUNITY_SERVER`
