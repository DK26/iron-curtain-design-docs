## D074: Community Server — Unified Binary with Capability Flags

|                |                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                                                          |
| **Phase**      | Phase 2 (health + logging), Phase 4 (Workshop seeding), Phase 5 (full Community Server with all capabilities), Phase 6a (federation, self-update, advanced ops)                  |
| **Depends on** | D007 (relay server), D030 (Workshop registry), D034 (SQLite), D049 (P2P distribution), D052 (community servers), D055 (ranked matchmaking), D072 (server management)            |
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

| Component | Designed in | Binary name used |
|-----------|------------|-----------------|
| Relay (order router) | D007 | `ic-relay` (D072) |
| Tracking server (game browser) | 03-NETCODE.md | unspecified |
| Workshop server (content hosting) | D030, D049 | unspecified |
| Community server (ranking, matchmaking, moderation) | D052 | `ic-server` (mentioned once) |
| Server management (CLI, dashboard) | D072 | `ic-relay` |

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

The one vulnerability lockstep cannot solve is **maphack** — since every client runs the full simulation, all game state exists in client memory, and fog of war is a rendering filter, not a data boundary. IC addresses this with `FogAuthoritativeNetwork` (06-SECURITY.md) — a `NetworkModel` variant (D006) where the server runs the sim and sends each client only the entities they can see. This is a heavier deployment (real CPU per game, not just order routing), but it uses the same `ic-server` binary, the same `NetworkModel` trait, and the same capability infrastructure. An operator enables it per-room or per-match-type; it is not a separate product or a deferred feature.

| Deployment | Server runs sim? | Maphack-proof? | Cost | Use case |
|---|---|---|---|---|
| **Relay (default)** | No — order router only | No (fog is client-side) | ~2–10 KB/game | Casual, ranked, LAN, most play |
| **FogAuth** | Yes — full sim, partial state to each client | Yes | Real CPU per game | Tournaments, high-stakes, anti-cheat-critical |
| **Listen server** | No — embedded relay in host client | No | Zero infrastructure | "Host Game" button, zero setup |

All three are `NetworkModel` implementations behind the same trait. Clients use the same protocol. The sim has zero imports from `ic-net` (D006 invariant).

When a capability is disabled:
- Its ICRP endpoints are not registered (404 for capability-specific routes)
- Its health fields are omitted from `/health` response
- Its dashboard pages are hidden
- Its CLI subcommands return "capability not enabled" with instructions to enable
- Its background tasks do not start (zero CPU/memory overhead)

#### Deployment Presets

Presets are named configurations that set sensible defaults for common use cases. They extend D072's deployment profiles (which control gameplay parameters) with capability selection:

| Preset | Capabilities Enabled | Use Case |
|--------|---------------------|----------|
| `minimal` | relay | Dedicated game server only — LAN party, small clan, testing |
| `community` | relay, tracker, workshop, ranking | Standard community server (default) |
| `competitive` | relay, tracker, workshop, ranking, matchmaking, moderation | Tournament / league server |
| `workshop-seed` | workshop | Dedicated content seeder (bandwidth volunteer) |
| `custom` | operator picks | Advanced operators |

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

| Page | Capability | Shows |
|------|-----------|-------|
| **Status** (home) | all | Server health, enabled capabilities, system metrics |
| **Players** | relay | Connected players, ping, kick/ban |
| **Matches** | relay | Active/recent matches, replays |
| **Server Log** | all | Live log viewer |
| **Config** | all | `server_config.toml` with inline editing |
| **Bans** | relay | Ban list management |
| **Backups** | all | SQLite backup/restore |
| **Workshop** | workshop | Seeded packages, peer connections, download stats |
| **Rankings** | ranking | Leaderboard, rating distribution, season status |
| **Moderation** | moderation | Review queue, case history, reviewer stats |
| **Tracker** | tracker | Listed games, heartbeat status |

Pages for disabled capabilities do not appear in the navigation.

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

| Component | Approach |
|-----------|---------|
| **BT wire protocol** | Implement from BEP 3/5/9/10/23/29 specs. Standard protocol — clients interoperate with any BT peer. |
| **Embedded tracker** | Built into `ic-server`. Simple announce/scrape protocol with IC-specific authenticated announce (D052 Ed25519 identity). No external tracker dependency. |
| **WebRTC transport** | BT wire protocol over WebRTC data channels. Enables browser↔desktop interop. Workshop server acts as bridge node speaking TCP + uTP + WebRTC simultaneously. |
| **Bandwidth control** | First-class configurable upload/download limits, seeding policies, per-peer throttling. |
| **Content-aware scheduling** | IC's domain knowledge produces better piece selection than any generic BT client. Lobby-urgent priority, rarest-first within tiers, endgame mode, background pre-fetch. |
| **Metadata service** | Thin REST API for package manifests, search, and dependency resolution. Secondary to the P2P transfer layer. |

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

| Repository | Contains | Purpose |
|---|---|---|
| `iron-curtain/workshop-index` | Package manifests + download URLs | Content discovery (Phase 0–3) |
| `iron-curtain/community-servers` | Community server endpoints + public keys | Community discovery |

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

| Distribution | What | Phase |
|---|---|---|
| **Standalone binary** | Single `ic-server` binary + README | Phase 5 |
| **Docker** | `ghcr.io/ironcurtain/ic-server:latest` (scratch + musl, ~8–12 MB) | Phase 5 |
| **Docker (debug)** | `ghcr.io/ironcurtain/ic-server:debug` (Debian slim, includes curl/sqlite3) | Phase 5 |
| **One-click deploy** | Templates for DigitalOcean, Hetzner, Railway, Fly.io | Phase 5 |
| **Helm chart** | `ironcurtain/community-server` (extends D072's Kubernetes Operator) | Phase 6a |

Docker image naming changes from D072:
- `relay:latest` → `ic-server:latest`
- `relay:debug` → `ic-server:debug`

Dockerfile targets change from `--bin ic-relay` to `--bin ic-server`. All other Docker design (scratch + musl, non-root user, `/data` volume, multi-arch) carries forward unchanged from D072.

---

### 5. Federated Content Moderation — Signed Advisories

IC's existing design covers content safety at the single-server level (WASM sandbox, supply chain defense, publisher trust tiers, DMCA process — see 06-SECURITY.md and D030). The gap is **cross-community coordination**: a publisher banned on one community has no automatic sanctions on another. The federated model deliberately avoids a central authority, but needs a mechanism for communities to share moderation signals.

Study of how other platforms handle this (see `research/federated-content-moderation-analysis.md`):
- **Mastodon/Fediverse:** shared blocklists with consensus thresholds ("Garden Fence" — a domain must be blocked by N of M reference servers). Each instance chooses its trust anchors.
- **Minecraft (fractureiser incident):** account compromise propagated malware via auto-updates. Community-organized investigation was faster than platform response. Neither CurseForge nor Modrinth mandated author code signing afterward.
- **npm/crates.io:** Sigstore provenance attestations, transparency logs, 7–14 day quarantine catches most malicious packages.
- **Steam Workshop:** minimal moderation, no sandboxing — account compromises propagate malware instantly. IC's sandbox architecture is already far ahead.

#### Content Advisory Records (CARs)

> **Full protocol specification:** For the byte-level CAR binary envelope, CBOR payload format, inter-server sync protocol, client-side aggregation algorithm, revocation/supersession semantics, key rotation/compromise recovery, and SQLite storage schema, see `research/content-advisory-protocol-design.md`.

Community servers sign advisories about Workshop content using their Ed25519 key (same infrastructure as D052's Signed Credential Records):

```yaml
# Signed by: Wolfpack Community (ed25519:a1d4...e8f2)
type: content_advisory
resource: "coolmodder/awesome-tanks@2.1.0"
action: block              # block | warn | endorse
category: malware           # malware | policy_violation | dmca | quality | abandoned
reason: "WASM module requests network access not present in v2.0.0; exfiltrates player data"
evidence_hash: "sha256:7f3a..."
timestamp: 2026-03-15T14:00:00Z
sequence: 42
```

CAR properties:
- **Signed and attributable** — verifiable Ed25519 signature from a known community server
- **Scoped to specific versions** — `publisher/package@version`, not blanket bans on a publisher
- **Action levels** — `block` (refuse to install/seed), `warn` (display advisory, user decides), `endorse` (positive trust signal)
- **Monotonic sequence numbers** — prevents replay attacks, same pattern as D052 SCRs

#### Consensus-Based Trust (the "Garden Fence")

The game client aggregates CARs from all communities the player is connected to. Configurable trust policy in `settings.toml`:

```toml
[content_trust]
# How many community servers must flag content before auto-blocking?
block_threshold = 2          # Block if 2+ trusted communities issue "block" CARs
warn_threshold = 1           # Warn if 1+ trusted community issues "warn" CAR

# Which communities does this player trust for advisories?
# "subscribed" = all communities the player has joined
# "verified" = only communities marked verified in the seed list
advisory_sources = "subscribed"

# Allow overriding advisories for specific packages? (power users)
allow_override = false
```

Default behavior: if 2+ of the player's subscribed communities flag a package as `block`, it is blocked. If 1+ flags it as `warn`, a warning is displayed but the player can proceed. Players who want stricter or looser policies adjust thresholds.

#### Tracker-Level Enforcement

Community servers with the Workshop capability enforce advisories at the P2P layer:
- **Refuse to seed** blocklisted content — the tracker drops the info hash, the seeder stops serving pieces
- **Propagate advisories to peers** — clients connected to a community's Workshop receive its CARs as part of the metadata sync
- This is the BitTorrent-layer equivalent of Mastodon's defederation — content becomes unavailable through that community's infrastructure

#### Advisory Sync Between Community Servers

Community servers can subscribe to each other's advisory feeds (opt-in):

```toml
[moderation]
# Subscribe to advisories from other communities
advisory_subscriptions = [
    "ed25519:7f3a...b2c1",   # IC Official
    "ed25519:c3b7...9a12",   # Competitive League
]

# Auto-apply advisories from subscribed sources?
auto_apply_block = false      # false = queue for local moderator review
auto_apply_warn = true        # true = auto-apply warn advisories
```

Small communities without dedicated moderators can subscribe to the official community's advisory feed and auto-apply warnings, while queuing blocks for local review. Large communities make independent decisions.

#### No Silent Auto-Updates

Unlike Steam Workshop, IC never silently updates installed content:
- `ic.lock` pins exact versions + SHA-256 checksums
- `ic mod update --review` shows a diff before applying
- `ic mod rollback [resource] [version]` for instant reversion
- A compromised publisher account cannot push malware to existing installs — users must explicitly update

This is the single most important defense against the fractureiser-class attack (compromised author account pushes malicious update that auto-propagates to all users).

#### Quarantine-Before-Release

Configurable per Workshop server:

```toml
[workshop.moderation]
# Hold new publications for review before making them available?
quarantine_new_publishers = true     # First-time publishers: always hold
quarantine_new_resources = true      # New resources from any publisher: hold
quarantine_updates = false           # Updates from trusted publishers: auto-release
quarantine_duration_hours = 24       # How long to hold before auto-release (0 = manual only)
```

The official Workshop server holds new publishers' first submissions for 24 hours. Community servers set their own policies. This catches the majority of malicious uploads (npm data shows 7–14 day quarantine catches most attacks).

#### Player-Facing Workshop Safety: "Cannot Get It Wrong"

The guiding principle for Workshop UX is not "warn the player" — it is **design the system so the player cannot make a dangerous mistake with default settings**. Warnings are a failure of design. If the system needs a warning, the default should be changed so the warning is unnecessary.

**Layer 1 — Sandbox makes content structurally harmless.** Every Workshop resource runs inside IC's capability sandbox (D005 WASM, D004 Lua limits, D003 YAML schema validation). A mod cannot access the filesystem, network, or any OS resource unless its manifest declares the capability AND the sandbox grants it. With default settings, no Workshop content can:
- Read or write files outside its declared data directory
- Open network connections
- Execute native code
- Access other mods' data without declared dependency
- Modify engine internals outside its declared trait hooks

This is not a policy — it is an architectural constraint enforced by the WASM sandbox. A player who installs the most malicious mod imaginable, with default settings, gets a mod that can at worst misbehave within its own gameplay scope (e.g., spawn too many units, play loud sounds). It cannot steal credentials, install malware, or exfiltrate data.

**Layer 2 — Defaults are maximally restrictive, not maximally permissive.**

| Setting | Default | Effect |
|---------|---------|--------|
| `content_trust.block_threshold` | `2` | Content blocked by 2+ communities is auto-blocked |
| `content_trust.warn_threshold` | `1` | Content flagged by 1+ community shows advisory |
| `content_trust.allow_override` | `false` | Player cannot bypass blocks without changing config |
| `workshop.auto_update` | `false` | Updates never install silently |
| `workshop.allow_untrusted_sources` | `false` | Only configured Workshop sources are accepted |
| `workshop.max_download_size_mb` | `100` | Downloads exceeding 100 MB require confirmation |

A player who never touches settings gets the safest possible experience. Every relaxation is an explicit opt-in that requires editing config or using `--allow-*` CLI flags.

**Layer 3 — No permission fatigue.** Because the sandbox makes content structurally safe (Layer 1), IC does **not** prompt the player with capability permission dialogs on every install. There is no "This mod wants to access your files — Allow / Deny?" because mods cannot access files regardless of what the player clicks. The only prompts are:
- **Size confirmation** — downloads over the configured threshold (D030)
- **Unknown source** — content from a Workshop source the player hasn't configured (D052)
- **Active advisory** — content with a `warn`-level CAR from a trusted community

Three prompts, each actionable, each rare. No dialog boxes that train players to click "OK" without reading.

**Layer 4 — Transparency without burden.** Information is available but never blocking:
- **Trust badges** on Workshop listings (Verified, Prolific, Foundation, Curator — D030) let players make informed choices at browse time, not install time
- **Capability manifest** displayed on the Workshop listing page shows what the mod declares (e.g., "Uses: custom UI panels, audio playback, network — lobby chat integration"). This is informational, not a permission request — the sandbox enforces limits regardless
- **Advisory history** visible on the resource page: which communities have endorsed or warned about this content, and why
- **`ic mod audit`** available for power users who want full dependency tree + license + advisory analysis — never required for normal use

**Layer 5 — Recovery is trivial.** If something does go wrong:
- `ic mod rollback [resource] [version]` — instant reversion to any previous version
- `ic mod disable [resource]` — immediately deactivates without uninstalling
- `ic content verify` — checks all installed content against checksums
- `ic content repair` — re-fetches corrupted or tampered content
- Deactivated content is inert — zero CPU, zero filesystem access, zero network

**The test:** A non-technical player who clicks "Install" on every Workshop resource they see, never reads a description, never changes a setting, and never runs a CLI command should be **exactly as safe** as a security-conscious power user. The difference between the two players is not safety — it is choice (the power user can relax restrictions for specific trusted content). Safety is not a skill check.

#### Relationship to Existing Moderation Design

CARs are specifically for **Workshop content** (packages, mods, maps). They complement but do not replace:
- **D052's Overwatch-style review** — for player behavior (cheating, griefing, harassment)
- **D030's publisher trust tiers** — for publisher reputation within a single Workshop server
- **06-SECURITY.md's supply chain defense** — for technical content integrity (checksums, anomaly detection, provenance)

CARs add the missing **cross-community coordination layer** — the mechanism for communities to share trust signals about content.

---

### 6. Cross-References & Resolved Gaps

| Gap | Resolution |
|-----|-----------|
| D072 calls binary `ic-relay`, install layout calls it `ic-server` | **Resolved:** binary is `ic-server`. All D072 management interfaces apply to the unified binary. |
| D052 mentions `ic-server` with feature flags but never specifies them | **Resolved:** `[capabilities]` section in `server_config.toml` with six flags. |
| Workshop server described as separate binary in D030/D049 | **Resolved:** Workshop is a capability within `ic-server`, deployable standalone via `workshop-seed` preset. |
| No P2P engine design study | **Resolved:** IC builds its own P2P engine from BT specs, informed by studying existing implementations. Design study in `research/bittorrent-p2p-libraries.md`. |
| No community discovery mechanism beyond per-community tracking | **Resolved:** Static seed list in `iron-curtain/community-servers` GitHub repo. |
| No operator setup experience for server deployment | **Resolved:** First-run wizard via `ic-server --setup` and web dashboard. |
| D072 dashboard pages relay-only | **Resolved:** Dashboard extends per-capability (Workshop, Rankings, Moderation, Tracker pages). |
| Docker images named `relay:*` | **Resolved:** renamed to `ic-server:*`. |
| No cross-community content moderation coordination | **Resolved:** Content Advisory Records (CARs) — Ed25519-signed advisories shared between communities, with Garden Fence consensus thresholds. |
| No defense against fractureiser-class attacks (compromised author auto-updates) | **Resolved:** `ic.lock` pins versions + SHA-256; no silent auto-updates; quarantine-before-release for new publications. |

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
