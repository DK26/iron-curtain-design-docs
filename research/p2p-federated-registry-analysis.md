# P2P Federated Resource Registry — Standalone Platform Analysis

> **Purpose:** This document examines the concept of a P2P-powered federated resource registry as a **standalone platform** — independent of Iron Curtain. The IC Workshop (D030+D049) is the first implementation, but the architecture is domain-agnostic. This analysis explores whether it should be extracted as a reusable platform serving multiple games, creative tools, and other fields.
>
> **Status:** Research / exploration (February 2026). Not a committed design decision.

## The Gap in the Market

There is no open-source platform that combines all of:

1. **Federated resource registry** — multiple repository sources (local/remote/virtual) merged into one view, Artifactory-style
2. **P2P distribution** — BitTorrent/WebTorrent for cost-sustainable delivery at scale
3. **Zero-infrastructure bootstrap** — git-hosted package index that costs $0 and works from day one
4. **Browser-compatible P2P** — WebTorrent enables browser-to-browser distribution (WASM builds, web apps)
5. **Rich package management** — semver dependencies, lockfiles, transitive resolution, promotion channels
6. **Content integrity** — SHA-256 checksums, signed manifests, supply chain security
7. **Creator ecosystem** — publisher identities, reputation, license enforcement, tip links

Existing solutions solve subsets of this problem:

| Solution                  | Registry |  P2P  | Federation | Self-host | In-game SDK | Dependencies | Zero-cost bootstrap | Open source |
| ------------------------- | :------: | :---: | :--------: | :-------: | :---------: | :----------: | :-----------------: | :---------: |
| **Nexus Mods**            |    ✅     |   ❌   |     ❌      |     ❌     |      ❌      |      ❌       |          ❌          |   partial   |
| **mod.io**                |    ✅     |   ❌   |     ❌      |     ❌     |      ✅      |   partial    |          ❌          |   partial   |
| **Steam Workshop**        |    ✅     |   ❌   |     ❌      |     ❌     |      ✅      |      ❌       |          ❌          |      ❌      |
| **Modrinth**              |    ✅     |   ❌   |     ❌      |     ❌     |      ❌      |      ✅       |          ❌          |      ✅      |
| **CurseForge** (Overwolf) |    ✅     |   ❌   |     ❌      |     ❌     |   partial   |      ✅       |          ❌          |      ❌      |
| **Thunderstore**          |    ✅     |   ❌   |     ❌      |     ❌     |      ❌      |      ✅       |          ❌          |      ✅      |
| **ModDB / GameBanana**    |    ✅     |   ❌   |     ❌      |     ❌     |      ❌      |      ❌       |          ❌          |      ❌      |
| **Uber Kraken**           | partial  |   ✅   |     ❌      |     ✅     |      ❌      |      ❌       |          ❌          |      ✅      |
| **Dragonfly (CNCF)**      |    ❌     |   ✅   |     ❌      |     ✅     |      ❌      |      ❌       |          ❌          |      ✅      |
| **JFrog Artifactory**     |    ✅     |  ✅*   |     ✅      |     ✅     |      ❌      |      ✅       |          ❌          |      ❌      |
| **IPFS**                  |    ❌     |   ✅   |     ✅      |     ✅     |      ❌      |      ❌       |          ❌          |      ✅      |
| **npm / crates.io**       |    ✅     |   ❌   |     ❌      |     ❌     |      ❌      |      ✅       |       partial       |      ✅      |
| **Homebrew**              |    ✅     |   ❌   |     ❌      |  partial  |      ❌      |      ✅       |          ✅          |      ✅      |

\* JFrog Artifactory P2P is an enterprise add-on, not included in the open-source edition.

**Nobody offers all eight.** mod.io is the closest to IC's in-game integration vision but is proprietary, centralized, VC-funded, and has no P2P or self-hosting. JFrog Artifactory has federation and P2P but targets enterprise DevOps, not game players. The open-source modding registries (Modrinth, Thunderstore) have dependency resolution but are centralized — they eat CDN costs, can't be self-hosted, and have no P2P. Nexus Mods is the largest by user count but has no in-game integration, no P2P, no dependency resolution, and was recently sold to a growth-focused gaming company.

## The Platform Concept

### Vision

An open-source, self-hostable, federated resource registry with P2P distribution. Think:

> **"Artifactory's federation model + BitTorrent's distribution + Homebrew's git-index bootstrap + Steam Workshop's UX — as an open-source platform any project can embed."**

### Working Name Candidates

The platform needs an identity separate from Iron Curtain:

- **Depot** — a place where things are stored and distributed
- **Forge** — where things are made and shared (but overloaded: SourceForge, CurseForge)
- **Bazaar** — open market for exchange (but `bzr` VCS)
- **Armory** — storage for equipment/resources
- **Vault** — secure storage with distribution
- **Relay** — passing things between peers (but IC already uses "relay" for netcode)
- **Harbor** — safe port for resources (but already a CNCF container registry project)

*No name chosen. This is a brainstorming list for if/when the platform is extracted.*

### Core Architecture (game-agnostic)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Platform Core                                │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  Registry     │  │  P2P Engine  │  │  Federation Layer     │  │
│  │  - Metadata   │  │  - BitTorrent│  │  - Source aggregation │  │
│  │  - Search     │  │  - WebTorrent│  │  - Local/Remote/      │  │
│  │  - Deps       │  │  - Seeding   │  │    Virtual/Git-Index  │  │
│  │  - Ratings    │  │  - Fallback  │  │  - Replication        │  │
│  │  - Integrity  │  │  - Tracker   │  │  - Priority/dedup     │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  Publisher    │  │  CLI Tool    │  │  Embeddable Client    │  │
│  │  Identity     │  │  - publish   │  │  Library (Rust)       │  │
│  │  - Auth       │  │  - install   │  │  - search/browse      │  │
│  │  - Reputation │  │  - search    │  │  - install/update     │  │
│  │  - Tokens     │  │  - update    │  │  - seed/download      │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │                    │                      │
    ┌────┴────┐         ┌────┴────┐            ┌────┴────┐
    │  Game A │         │ Game B  │            │ Tool C  │
    │  (IC)   │         │ (other) │            │ (non-   │
    │         │         │         │            │  game)  │
    └─────────┘         └─────────┘            └─────────┘
```

### What the Platform Provides

1. **Server binary** — a single Rust executable: metadata registry (SQLite + FTS5) + BitTorrent/WebTorrent tracker + HTTP fallback + REST API
2. **Client library** — embeddable Rust crate for any application to search, install, update, seed
3. **CLI tool** — publish, install, search, update, audit — like `cargo` or `npm` for arbitrary resources
4. **Git-index support** — zero-cost bootstrap with a GitHub repo as the package index
5. **Package format** — `.pkg` (ZIP with `manifest.yaml`) — like IC's `.icpkg` but game-agnostic
6. **Federation protocol** — multiple servers + git indexes + local directories compose a single view
7. **WebTorrent bridge** — browser-based applications participate in P2P alongside native clients
8. **Publisher identity** — authentication, API tokens, reputation, signing

### What the Platform Does NOT Provide

- Game-specific logic (dependency on specific game modules, lobby integration, faction-specific anything)
- UI components (each game/app builds its own browser on top of the client library)
- Content moderation policy (the platform provides tools — reporting, takedowns, publisher verification — but each deployment defines its own policy)
- Payment processing (tip links and external payment URLs only, per IC's D035)

## Use Cases Beyond Gaming

### 1. Game Mod Distribution (primary — IC is first user)

**The problem:** Every game with a modding community faces the same infrastructure challenge. Mods need discovery, versioning, dependency resolution, integrity verification, and distribution — and the game's developers usually can't afford CDN hosting at scale.

**Current solutions and their limits:**
- **Steam Workshop:** Platform lock-in. No self-hosting, no federation, no dependency resolution, no P2P. Only available if your game is on Steam.
- **mod.io:** Closest to IC's embeddable approach — SDK for Unreal/Unity/C++, in-game UI, console-certified, cross-platform. But proprietary SaaS, VC-funded ($30M+, Tencent-backed), centralized. No P2P, no self-hosting, no federation. Free tier exists but you're a customer, not an owner. If mod.io changes pricing, policies, or shuts down, adopters have no fallback.
- **Nexus Mods:** Largest platform (70.7M users, 21B downloads), but a web portal with external mod manager (Vortex) — no in-game integration. Free users get throttled downloads. Premium membership to unlock speed. No dependency resolution. Recently sold (June 2025) to Chosen, a growth-focused gaming company — community concern about future direction.
- **Modrinth / CurseForge / Thunderstore:** Centralized services. If they shut down or change policies, the community loses everything. No self-hosting. Limited to specific games (mostly Minecraft / mod-loader ecosystems). Modrinth is open source and growing; CurseForge is Overwolf-owned with controversial overlay.
- **ModDB / GameBanana:** Legacy web portals (founded 2001–2002). Manual upload/download, community features, editorial content. No API for in-game integration, no dependency resolution. ModDB is run by the same company as mod.io (DBolical). GameBanana is strong in Source Engine modding (CS, TF2). Both are important community hubs but architecturally limited.
- **Game-specific mod portals:** Every game reinvents the wheel. No shared infrastructure.

**What the platform offers:** Any game ships with a mod registry that costs $0 to start (git-index), scales with P2P, supports federation (community servers), and doesn't depend on any external service. Games on Steam can *also* sync to Steam Workshop, but it's additive, never required.

**Potential adopters:**
- Open-source RTS games (0 A.D., Spring Engine, OpenRA, Widelands)
- Open-source FPS games (Xonotic, OpenArena, Cube 2)
- Open-source RPGs (FLARE, Veloren)
- Indie games with modding support
- Emulation communities (ROM hacks, texture packs, translation patches)
- Tabletop simulator mods (custom models, scripts, scenarios)

### 2. Creative Asset Distribution

**The problem:** Digital artists, musicians, sound designers, and 3D modelers share assets across platforms (Itch.io, OpenGameArt, Freesound, Sketchfab) with no unified package management, no dependency resolution, no integrity verification, and no P2P.

**What the platform offers:**
- **Game asset packs** — sprites, textures, 3D models, audio, music. Published as versioned packages with license metadata. Any game engine (Godot, Bevy, Unity, Unreal) could embed the client library.
- **Music sample libraries** — instrument samples, sound effects, loops. Musicians share versioned packs with license enforcement. DAWs could embed the client.
- **Font distribution** — versioned font packages with license metadata and dependency support (base font + language packs).
- **Template/preset packs** — for creative tools (Blender material packs, Photoshop brush sets, video editor LUT packs).

### 3. AI/ML Model Distribution

**The problem:** AI models are large binary artifacts (100MB–100GB+) that need versioning, integrity verification, and efficient distribution. Hugging Face Hub is the dominant registry, but it's centralized, CDN-hosted, and expensive at scale.

**What the platform offers:**
- P2P distribution dramatically reduces hosting costs for popular models
- Federated registries allow organizations to host private model servers that compose with public ones
- Semver and dependency resolution work for model + tokenizer + config bundles
- Git-index bootstrap works for small model catalogs
- WebTorrent enables browser-based ML tools to participate in P2P

**Existing gap:** Hugging Face doesn't offer P2P, self-hosting, or federation. Ollama distributes models but has no registry/dependency model. The platform could serve as an open-source alternative for model distribution.

### 4. Scientific Data Distribution

**The problem:** Scientific datasets are large (GB–TB), need integrity verification, and are shared across institutions. Current solutions: institutional FTP servers, cloud storage (expensive at scale), domain-specific portals. No unified package management.

**What the platform offers:**
- P2P reduces institutional bandwidth costs
- Federation allows each institution to host its own registry while contributing to a shared view
- Integrity verification (SHA-256, signed manifests) is critical for reproducible science
- Dependency resolution handles datasets that build on other datasets
- Git-index scales to thousands of datasets before needing a server

### 5. Software Plugin Ecosystems

**The problem:** Plugin-based applications (IDEs, browsers, creative tools) each build their own registry from scratch. VS Code Marketplace, Obsidian Community Plugins, Blender Add-ons — all solve the same problem independently with no shared infrastructure.

**What the platform offers:** A ready-made registry + distribution layer that any application can embed. The client library handles search, dependency resolution, P2P download, integrity verification. The application provides the UI and plugin-loading logic.

## Requirements for Standalone Extraction

### What Would Need to Change from IC's Workshop Design

IC's Workshop is designed as part of the Iron Curtain engine. Extracting it as a standalone platform requires:

| IC Workshop Concept                         | Standalone Platform Equivalent         | Change Required                                                                                                   |
| ------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ResourcePackage`                           | `Package`                              | Remove `game_module`, `engine_version` — make them optional metadata fields                                       |
| `ResourceCategory` (Music, Sprites, Map...) | Configurable categories per deployment | No hardcoded categories — each deployment defines its own                                                         |
| `ic mod publish`                            | `<platform> publish`                   | Rename CLI, remove game-specific flags                                                                            |
| `.icpkg` format                             | `.pkg` or configurable extension       | Same format (ZIP + manifest.yaml), different extension                                                            |
| `mod.yaml`                                  | `manifest.yaml` or `package.yaml`      | Same schema, different name                                                                                       |
| Workshop browser (Bevy UI)                  | Client library + reference web UI      | Platform provides REST API + embeddable Rust client. Reference web frontend (HTML/JS) included.                   |
| `ic-game` integration                       | SDK/library integration                | Platform ships as a Rust crate, not a Bevy plugin                                                                 |
| Lobby auto-download                         | Application-defined triggers           | Platform provides "download these packages" API. Application decides when to call it.                             |
| Publisher reputation (D030)                 | Pluggable reputation system            | Core: download counts, publish history, account age. Extensible: each deployment can add domain-specific signals. |

### Architecture Principles for the Standalone Platform

1. **Library-first.** The platform is primarily a Rust library (`libworkshop`?) that applications embed. The server and CLI are thin wrappers around the library.
2. **Protocol-defined.** The federation protocol, manifest format, and API are documented specifications — not just Rust implementation details. Other languages can implement clients.
3. **Zero opinion on content type.** The platform doesn't know what a "mod" or "sprite" is. It knows: packages, versions, dependencies, checksums, publishers. Domain semantics are the application's responsibility.
4. **Deployable at every scale.** From a git-index with 5 packages to a federated network with millions. The same client library works at both ends.
5. **Self-hosting is a first-class use case.** Community servers, institutional servers, air-gapped deployments. No dependency on any central authority except DNS.
6. **Sustainability-first.** P2P distribution is not optional — it's the core value proposition. The platform exists because centralized distribution is financially unsustainable for community projects.

### Phased Extraction Strategy

Cross-project reuse is a **planned requirement**, not a hypothetical (see D050 in `09-DECISIONS.md`). The author intends to build additional game projects (XCOM-inspired tactics, Civilization-inspired 4X, Operation Flashpoint/ArmA-inspired military sim) that will consume the same Workshop core library. These projects may use engines other than Bevy.

| Phase       | Scope                                                                                                                                                                                                 | Timing       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Phase A** | IC's Workshop ships as a separate crate within the IC monorepo. API designed to be game-agnostic from the start. Zero Bevy dependencies in the core library. IC wraps it via a thin Bevy plugin.      | IC Phase 3–4 |
| **Phase B** | Extract the Workshop core into a standalone repo when the second game project begins. Add reference CLI and web frontend. Remove any remaining IC-specific leaks. Publish to crates.io.               | IC Phase 5–6 |
| **Phase C** | Second game project (likely the OFP/ArmA clone, which has the strongest Workshop need due to large mod sizes) integrates the library. Real-world validation across engines. Protocol spec stabilizes. | IC Phase 6+  |
| **Phase D** | The platform gets its own name, repo, and contributor community. IC and the other game projects are consumers, not owners.                                                                            | Post-launch  |

**Critical design principle:** Designing the Workshop core as game-agnostic from Phase A is the right call regardless. It produces cleaner code, better APIs, and a more testable system. The cost of game-agnosticism is near-zero; the option value is high. With multiple planned consumers, the option value becomes a certainty.

## Competitive Deep Dives

### Nexus Mods — The Largest Modding Platform

- **Website:** https://www.nexusmods.com
- **Founded:** 2001 (as Morrowind Chronicles). Owner: Black Tree Gaming Ltd. Sold to Chosen in June 2025.
- **Scale:** 70.7M registered users, 4,297 games supported, 21B+ total downloads (as of February 2026). The largest game modding platform by every metric.
- **Model:** Web portal + external mod manager (Vortex, GPL-3.0). Free accounts with throttled download speeds and ads. Premium membership ($40/year or $5/month) removes ads, uncaps download speed, enables multi-threaded downloads.
- **API:** REST API with API key auth. Rate-limited: 2,500 requests/day, 100/hr after daily limit. Endpoints for mods, files, games, users. Download links generated server-side.
- **Features:** Mod pages with screenshots/changelogs, endorsements, user tracking, download statistics, mod categories. Collections feature (curated modpacks). Donation Points system for creator earnings. Forum and wiki per game.
- **Client:** Vortex mod manager (Electron, GPL-3.0). The NexusMods.App (C#, Avalonia, GPL-3.0, 2.1k★) was in development but **discontinued in January 2026**, with focus returning to Vortex.
- **Strengths:** Massive user base, game-agnostic (any PC game), strong brand recognition, Donation Points system is well-received, comprehensive mod pages.
- **Weaknesses:** No in-game integration (mods are downloaded via external app/browser). No P2P (CDN-only, throttled for free users). No dependency resolution (install order is manual). No self-hosting or federation (single operator). No API for programmatic mod management at scale. Recent ownership change creates uncertainty.
- **IC relevance:** Nexus Mods dominates the general PC modding space but is architecturally a web 1.0 platform with a bolted-on mod manager. IC competes on a completely different axis: in-engine integration, P2P distribution, dependency resolution, federation, self-hosting. The C&C modding community doesn't primarily use Nexus — most C&C mods are distributed through ModDB, game-specific forums, or OpenRA's GitHub releases. IC could add Nexus as a `remote` repository source for discoverability, but it's not a primary channel.

### mod.io — Embeddable UGC Middleware

- **Website:** https://mod.io
- **Founded:** 2017 by Scott Reismanis (same founder as ModDB, 2002). Company: DBolical Pty Ltd (Melbourne, Australia). Funded: $4M seed (Play Ventures, Sequoia Surge, Makers Fund), $26M Series A (Tencent, LEGO Ventures/Kirkbi). ISO 27001 certified.
- **Scale:** 2.5B+ downloads, 38.1M+ monthly active users, 1.6M+ creators, 332 live games.
- **Model:** UGC middleware SaaS. Games integrate the mod.io SDK (Unreal Engine plugin, Unity plugin, or C++ SDK for custom engines). mod.io handles hosting, moderation, CDN, analytics. Free tier available; enterprise pricing for advanced features. Revenue from B2B fees + UGC Monetization Solutions (marketplace for premium UGC).
- **Key clients:** Larian Studios (Baldur's Gate 3), Focus Entertainment (SnowRunner), Sega, Bandai Namco, Gearbox, Techland (Dying Light 2), Kalypso (Tropico 6), GSC Game World, Brace Yourself Games.
- **Cross-platform:** First UGC-certified middleware for consoles. Supports PC (Steam/GOG/Epic/Game Pass), PlayStation 4/5, Xbox One/Series X, Nintendo Switch/Switch 2, Meta Quest VR, iOS/Android.
- **Features:** White-label in-game UGC browsing, modular in-game UI components, per-platform moderation and targeted releases, rules engine automation, advanced metrics dashboards, community events/contests, creator insider/early access programs, SSO integration, Cloud Cooking (server-side mod processing).
- **Moderation:** Four levels of content checks, AI-assisted moderation, rules engine for automated actions. Per-platform release control.
- **Monetization:** Turnkey UGC marketplace — cross-platform premium UGC, customizable revenue share, creator payouts, partner program. **This is a significant philosophical difference from IC (D035).**
- **Strengths:** Best-in-class in-game integration UX. Console certification (PlayStation, Xbox, Nintendo — something no open-source alternative offers). White label branding. Enterprise-grade moderation. Proven at AAA scale (Baldur's Gate 3).
- **Weaknesses:** Proprietary backend (SDKs are open, service is not). No P2P distribution (CDN-only). No self-hosting (you depend on mod.io's infrastructure). No federation (single operator). VC-funded with monetization focus. If mod.io raises prices, changes terms, or shuts down, adopters have no self-hosted fallback. Data lives on their servers.
- **IC relevance:** mod.io is the architecturally closest comparison to what IC's Workshop aims to be: an embeddable SDK that gives any game in-engine mod browsing and management. The critical differences: IC is open source, self-hostable, federated, and P2P-distributed. mod.io is what IC's Workshop would look like as a commercial SaaS product. IC can study mod.io's UX patterns (in-game browsing, per-platform releases, moderation rules engine) without adopting their centralized model. **Should IC use mod.io?** No — it would mean depending on a proprietary, VC-funded service with no self-hosting, no P2P, and a monetization philosophy (paid UGC) that conflicts with IC's community principles (D035: no mandatory paywalls on mods). However, a `remote` repository adapter that proxies mod.io content into IC's federated view could be built (similar to how Artifactory proxies npm/Maven).

### ModDB / GameBanana — Legacy Modding Portals

- **ModDB:** https://moddb.com — Founded 2002 by Scott Reismanis. One of the oldest modding communities. 12,500+ mods registered, 108M+ downloads (as of 2015). Run by DBolical Pty Ltd (same company as mod.io). Annual Mod of the Year awards. Web-based: manual upload/download, mod pages with screenshots/news, community features. Hosts many C&C mods. No API for in-game integration, no dependency resolution, no P2P.
- **GameBanana:** https://gamebanana.com — Founded 2001. Focused on game skins, models, maps, and other visual mods. Strongest in Source Engine games (Counter-Strike, Team Fortress 2, Half-Life). Community-driven with submission guidelines and featuring. Ad-supported. Similarly web-based with manual downloads.
- **IndieDB:** https://indiedb.com — Spin-off of ModDB (launched 2010), focused on indie games rather than mods.
- **IC relevance:** ModDB is where much of the C&C community already publishes mods. Important as a community hub and visibility channel. IC could add ModDB as a `remote` repository source, though ModDB's lack of a proper API makes this harder than Nexus or mod.io. GameBanana is not relevant for C&C specifically but represents the broader landscape. The key lesson from both: web portals with manual download are the status quo for most modding communities. IC's in-engine integration is a generational leap from this model.

### Uber Kraken — P2P Docker Registry (Deep Dive)

- **Repo:** https://github.com/uber/kraken (Apache 2.0, 6.6k★)
- **Architecture:** Five components — Agent + Origin + Tracker + Build-Index + Proxy
- **Scale:** In production at Uber since 2018. Distributes 1M+ blobs/day in busiest cluster. 20K 100MB–1G blobs in <30 seconds at peak. Supports 15k+ hosts per cluster.
- **License:** Apache 2.0

#### Architecture Components

| Component       | Role                                                                                                                                                          | IC Equivalent                           | Key Design                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Agent**       | Deployed on every host. Implements Docker registry interface. Announces to tracker. Connects to peers for P2P download/upload.                                | IC game client (embedded P2P engine)    | `CADownloadStore` for content-addressable piece storage. Configurable bandwidth limits (`egress_bits_per_sec`, `ingress_bits_per_sec`). Connection limits (`max_open_conn: 10` default). Seeder TTI (5min in-memory, 6h on-disk before eviction).                                    |
| **Origin**      | Dedicated seeders. Stores blobs on disk backed by pluggable storage (S3, GCS, ECR, HDFS, HTTP, Docker Registry). Self-healing hash ring (rendezvous hashing). | IC seed box                             | `BlobRefresher` lazily fetches blobs from remote backends on first request. `MetaInfoGenerator` creates torrent metadata (piece hashes) on upload, with configurable `PieceLengths` map (file-size → piece-length). `WriteBackManager` handles async write-back to storage backends. |
| **Tracker**     | Tracks peers and seeders, instructs them to form sparse graph. Self-healing hash ring.                                                                        | IC BitTorrent tracker                   | Redis-backed `PeerStore` with time-window buckets (`peer_set_window_size × max_peer_set_windows` = TTL). `PeerHandoutPolicy` interface for pluggable peer selection. `AnnounceInterval` default 3s. `PeerHandoutLimit: 50` peers per announce response.                              |
| **Build-Index** | Maps human-readable tags to blob digests (content-addressed). Powers cross-cluster replication with duplicated queues + retry.                                | IC Workshop index (tag→package mapping) | Pluggable storage backends. `Remotes` configured as `addr: [regex_pattern]` for cross-cluster tag replication. Self-healing hash ring.                                                                                                                                               |
| **Proxy**       | Implements Docker registry interface for uploads. Routes layers to responsible Origin via hash ring. Uploads tags to Build-Index.                             | IC `ic mod publish` CLI flow            | Stateless. Just routes to Origin + Build-Index.                                                                                                                                                                                                                                      |

#### P2P Protocol Design

Kraken replaced standard BitTorrent with a custom protocol for tighter integration. Key design decisions and their IC implications:

**Graph Topology — Pseudo-Random Regular Graph:**
Kraken's tracker orchestrates peers to form a high-connectivity, small-diameter graph. Simulation scripts (`random_regular_graph.py`) model this with configurable `DEGREE` and `PEER_COUNT` constants. A second simulation (`procedural_generated_graph.py`) models real-world connection dynamics with `SOFT_CONNECTION_LIMIT: 5` and `MAX_CONNECTION_LIMIT: 20`. Kraken claims 80% theoretical / 60% actual max upload/download speed utilization. Standard BitTorrent swarms achieve lower utilization because connection topology is ad hoc.

*IC implication:* Standard BitTorrent is adequate for IC's internet-scale use case. Kraken's topology optimization matters at datacenter scale (15K hosts, sub-30-second distribution). IC's mod downloads are minutes-scale, not seconds-scale, so the marginal gain of graph optimization doesn't justify the added tracker complexity. However, if IC ever needs lobby-synchronized fast downloads (e.g., all players downloading a 50MB mod in <10s for a tournament), Kraken's approach provides a proven blueprint.

**Peer Handout Policy (Pluggable):**
Kraken defines an `assignmentPolicy` interface with `assignPriority(peer) → (priority, label)`. `SortPeers` excludes the source peer and sorts by priority. Two implementations ship:
- `default` — all peers get the same priority (random selection)
- `completeness` — seeders (priority 0, highest) → origins (priority 1) → incomplete peers (priority 2, lowest)

*IC implication:* IC should adopt the pluggable policy pattern. IC's default policy should be richer than Kraken's because IC operates over the internet:
- Geographic proximity (prefer peers in same region — reduces latency)
- Connection quality (prefer peers with lower measured RTT)
- Completion status (prefer seeders, like Kraken's `completeness` policy)
- Lobby context (prefer peers in the same lobby — they're guaranteed to have the content)
- NAT-friendliness (prefer peers behind open NATs or with port forwarding)

**Piece Request Policies:**
Kraken implements two piece request strategies:
- `default` — random reservoir sampling (picks pieces randomly from incomplete set)
- `rarest_first` — priority queue sorted by fewest peers having each piece (standard BitTorrent approach)

Configuration: `PipelineLimit: 3` (max concurrent piece requests per peer), `EndgameThreshold` (when remaining pieces ≤ threshold, enables duplicate piece requests to multiple peers), `PieceRequestTimeout: 4s base + 4s/MB` (scales with piece size).

*IC implication:* IC should default to `rarest_first` — it's the standard BitTorrent approach, well-validated for internet conditions. Endgame mode is essential (prevents the "last piece" stall problem). Pipeline limit of 3 is reasonable for internet. Piece request timeout should be more generous for internet — `8s base + 6s/MB` to accommodate residential connections.

**Connection State Machine:**
```
pending ──announce──► active ──timeout/error──► blacklisted
   ▲                    │                          │
   │                    ▼                          │
   └──────────── cooldown (TTL) ◄──────────────────┘
```
`MaxOpenConnectionsPerTorrent` and `MaxMutualConnections` prevent resource exhaustion. Blacklisted peers are skipped in handout. Connections have TTL (`conn_tti`, `conn_ttl`) for cleanup.

*IC implication:* Adopt this state machine directly. IC should use lower connection limits (5–8 instead of Kraken's 10) because residential connections have less bandwidth to share. Blacklisting should include ISP-throttling detection (if a peer consistently produces zero throughput, blacklist temporarily).

**Announce Cycle:**
Agents announce to tracker every 3s (default), dynamically adjustable by tracker response. Max interval protection prevents unbounded growth. Announce includes: PeerID, Digest, InfoHash, Bitfield, RemoteBitfields (bitfields of peer's neighbors — cluster awareness).

*IC implication:* 3s is too aggressive for internet. IC should default to `30s` with tracker-driven dynamic adjustment (faster during active downloads, slower when seeding idle content). The `RemoteBitfields` concept (sharing neighbor state) is clever for datacenter but unnecessary for IC — standard BitTorrent peer exchange (PEX) handles this.

**Handshake Protocol:**
Protobuf-based. Exchanges: PeerID, Digest, InfoHash, Bitfield, RemoteBitfields, Namespace. Compact and extensible.

*IC implication:* IC should use a similar compact handshake. Add `GameModule` and `EngineVersion` fields so peers can validate compatibility before transferring data.

#### Storage & Content Management

**Pluggable Storage Backends:**
Origins route storage requests by namespace to different backends. Multiple backends simultaneously (e.g., S3 for one namespace, GCS for another, Docker Registry read-only for a third). Bandwidth throttling per-origin.

*IC implication:* IC's seed boxes should support pluggable storage — local disk (default), S3-compatible (for large deployments), and HTTP proxy (for mirroring existing file hosts). Namespace-based routing maps to IC's game module routing (RA1 content on one backend, TD on another).

**MetaInfo Generation:**
`PieceLengths` config maps file size ranges to piece lengths. Larger files get larger pieces (fewer pieces = less metadata overhead). MetaInfo stored as JSON alongside content, serialized to Redis for tracker storage.

*IC implication:* IC should adopt size-based piece length configuration:
- `< 5MB` → no pieces (HTTP-only, per D049 existing design)
- `5–50MB` → 256KB pieces (fine-grained, good for partial recovery)
- `50–500MB` → 1MB pieces (balanced)
- `> 500MB` → 4MB pieces (reduced metadata overhead)

**Content Lifecycle (TTI/TTL):**
- `seeder_tti: 5m` — completed torrents stay in memory for 5 minutes without reads, then evict from memory (remain on disk)
- Disk cleanup: configurable TTI (default 6h) before old content is purged from disk
- `leecher_tti` — incomplete downloads evicted after timeout

*IC implication:* IC clients should keep recently downloaded packages in the seeding pool for at least 30 minutes (longer than Kraken's 5m, because IC peers are fewer and each seeder is more valuable). Disk cache should be configurable — default 2GB, evict LRU when over limit.

#### Health & Monitoring

**Active Health Checks:**
Origins ping each other (fails: 3, passes: 2, interval: 30s). A node is marked unhealthy after 3 consecutive failures and healthy after 2 consecutive passes. Hash ring removes unhealthy nodes.

**Passive Health Checks:**
Agents piggyback on announce requests (fails: 3, fail_timeout: 5m). If an Agent can't reach the tracker 3 times, it's marked unhealthy.

*IC implication:* IC's seed boxes should implement active health checks (heartbeat between seed nodes). The tracker should implement passive health checks on peers (if a peer doesn't announce within 2× the announce interval, mark as offline). This is standard BitTorrent tracker behavior but Kraken's explicit configuration is worth documenting.

**Metrics:**
Tally-based stats throughout (StatsD exporter). Per-module tagged metrics for granular monitoring.

*IC implication:* Ties directly to IC's OTEL telemetry (D031). Workshop P2P metrics should include: download throughput per source (P2P vs HTTP), peer count per package, seeding ratio, announce latency, piece completion rate.

#### Cross-Cluster Replication

Build-Index powers cross-cluster replication with "simple duplicated queues with retry." Remotes configured as `addr: [regex_pattern]` — matching tag names are replicated to the configured remote cluster.

*IC implication:* This maps directly to IC's Workshop federation replication. When a community Workshop server is configured as a `remote` source, it can replicate selected content from the official server using the same pattern — configurable regex on resource IDs to control what gets replicated. Build-Index's queue-with-retry pattern is simple and robust.

#### Kraken Limitations & Where IC Diverges

| Kraken Design Choice                             | IC's Different Need                                | IC's Approach                                                                  |
| ------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Datacenter-optimized (low latency, 10Gbps links) | Internet-optimized (50–500ms RTT, 1–100 Mbps)      | Longer timeouts, lower connection limits, more generous announce intervals     |
| Single-cluster (no federation)                   | Federated multi-source (D030)                      | Repository types (local/remote/git-index/virtual) with priority-based dedup    |
| Container images only                            | Any game asset (mods, maps, music, sprites)        | Generic `.icpkg` format with `manifest.yaml`                                   |
| No search/ratings/dependencies                   | Full registry (search, deps, ratings, collections) | SQLite + FTS5 registry alongside P2P tracker                                   |
| Redis-backed peer store                          | Minimal infrastructure requirements                | SQLite or in-memory peer store for small deployments, Redis optional for large |
| 3s announce interval (datacenter)                | 30s default (internet, mobile-friendly)            | Tracker-driven dynamic adjustment                                              |
| Agent on every host (always running)             | Game client (runs only when player is playing)     | Seed pool lives while game is running + configurable background seeding        |
| 15K hosts per cluster (massive swarm)            | 10–10K peers per popular package                   | Standard BitTorrent swarm adequate; Kraken's graph topology is overkill        |
| No browser support needed                        | WASM/browser is a first-class target               | WebTorrent for browser⟷desktop interop                                         |

#### Key Takeaways for IC Workshop P2P Design

1. **Pluggable policies are the right abstraction.** Kraken's `assignmentPolicy` for peer selection and configurable piece request policy prove that different deployment conditions need different strategies. IC should expose pluggable peer selection and piece request policies, even if shipping with sensible defaults.
2. **Endgame mode is essential.** Duplicate piece requests near completion prevent stalls. Ship this from day one.
3. **Bandwidth limiting is not optional for residential users.** Kraken configures `egress_bits_per_sec` / `ingress_bits_per_sec` per agent. IC must do the same — residential users can't have their connection saturated by mod seeding.
4. **Health checks prevent stale peer lists.** Active (seed-to-seed) + passive (tracker-observed) health checks keep the swarm accurate. Stale peers waste connection attempts.
5. **Size-based piece length is better than fixed piece length.** Kraken's `PieceLengths` map adapts to content size. IC should do the same.
6. **Content lifecycle needs explicit TTI/TTL.** Kraken's seeder_tti (memory) and disk TTI (storage) prevent unbounded resource consumption. IC needs similar — especially important for mobile (D010 platform-agnostic).
7. **Cross-cluster replication via queues is simple and works.** No need for complex consensus — just queue + retry. IC's Workshop federation replication can use the same pattern.
8. **Simulation tools validate topology before deployment.** Kraken ships Python scripts that simulate P2P graph behavior. IC should include similar tools for testing Workshop P2P under various network conditions.
9. **Connection state machine with blacklisting prevents thrashing.** Don't keep retrying bad peers. Blacklist temporarily, retry after cooldown.
10. **The tracker is lightweight — don't over-engineer it.** Kraken's tracker is essentially a peer list + hash ring + handout policy. IC's Workshop tracker can be a SQLite table + announce endpoint + sort algorithm. It runs in the same binary as the metadata server.

### Dragonfly — CNCF P2P Distribution (Deep Dive)

- **Repo:** https://github.com/dragonflyoss/dragonfly (Apache 2.0, 3k★)
- **Client Repo:** https://github.com/dragonflyoss/client (Rust rewrite of dfdaemon, v2)
- **Architecture:** Manager + Scheduler + Seed Peer + Peer (dfdaemon)
- **Scale:** CNCF Graduated (October 2025). Production at Alibaba, Ant Group, Baidu, JD.com, Bilibili, and others. Optimized for large-scale container image and AI model distribution.
- **License:** Apache 2.0
- **Security:** Trail of Bits security audit (2023)

#### Architecture Components

| Component     | Role                                                                                                                           | IC Equivalent                                   | Key Design                                                                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manager**   | Central control plane. Manages cluster relationships, scheduler/seed-peer association, dynamic config, preheat jobs, REST+gRPC | No direct equivalent (IC uses git-index/server) | Go service backed by GORM+MySQL for persistence, Redis+`go-freelru` for caching (LRU, xxhash, 1024 entries, 30s TTL). Console UI. Manages `SchedulerCluster` ↔ `SeedPeerCluster` many-to-many associations. Cluster searcher evaluates best cluster for each connecting client.                      |
| **Scheduler** | Intelligent scheduling. Assigns pieces from optimal parents based on multi-dimensional scoring. Maintains DAG-based peer graph | IC tracker (peer selection logic)               | Go service with pluggable `Evaluator` interface. Builds a directed acyclic graph of download relationships. Filters, scores, and ranks candidate parents per download. GC system for expired tasks/peers (JobTTL: 6h, AuditTTL: 7d). Dynamic config refresh from Manager.                            |
| **Seed Peer** | Dedicated download origin. Back-to-source when no peers have content. Consistent hash ring for load distribution               | IC seed box                                     | Consistent hashing (`hashring` library) distributes tasks across seed peers. Automatically triggered when first peer requests content. Reports piece metadata to Scheduler as download progresses — enables scheduling of subsequent pieces before seed peer finishes.                               |
| **Peer**      | Client-side daemon. HTTP proxy intercepts container runtime pulls. Downloads via P2P, uploads to other peers                   | IC game client (embedded P2P engine)            | Go daemon (v1), **rewritten in Rust for v2** (`dragonflyoss/client` repo — separate from main repo). Registers tasks with Scheduler, receives parent assignments, reports progress. FSM states: PeerStatePending → PeerStateReceivedTiny/Small/Normal/Empty → PeerStateSucceeded or PeerStateFailed. |

#### Scheduling & Evaluator Algorithm

This is Dragonfly's most distinctive subsystem and the reason it exists as a separate project rather than just using BitTorrent. The Scheduler makes centralized decisions about which peer downloads from which parent, using a multi-dimensional scoring function. Source: `scheduler/scheduling/evaluator/evaluator_default.go`.

**The Core Formula:**
```
TotalScore = (LoadQuality × 0.6) + (IDCAffinity × 0.2) + (LocationAffinity × 0.1) + (HostType × 0.1)
```

Four dimensions, weighted by importance. Load quality dominates — 60% of the score measures whether a candidate parent can actually serve right now, not just whether it has the content.

**LoadQuality Sub-Scoring:**
```
LoadQuality = (PeakBandwidthUsage × 0.5) + (BandwidthDuration × 0.3) + (Concurrency × 0.2)
```

Three sub-metrics capture instantaneous capacity, sustained load, and connection saturation:

| Sub-Metric         | Formula                                                      | What It Measures                                                                                                                           |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| PeakBandwidthUsage | `1 - (TxBandwidth / MaxTxBandwidth)`                         | Instantaneous bandwidth headroom. A peer using 90% of its bandwidth scores 0.1; a peer using 10% scores 0.9.                               |
| BandwidthDuration  | `1 - (UploadContentLength × 8 / MaxTxBandwidth / 60)`        | Sustained load over a 60-second window. Prevents selecting a peer that's technically below peak but has been uploading heavily all minute. |
| ConcurrencyScore   | `1 / (ConcurrentUploadPieceCount / PieceCountNeeded)` if > 1 | Upload slot saturation. `PieceCountNeeded = MaxTxBandwidth / (16MB × 8)`. If serving more pieces than bandwidth supports, score drops.     |

*IC implication:* IC's tracker currently returns peers sorted by a simple 5-tier priority (seeders → lobby peers → geographic → recent → random). Dragonfly's LoadQuality scoring reveals a more rigorous approach to capacity-aware selection. IC could adopt a simplified version: track each peer's current upload bandwidth utilization (reported in announce) and prefer peers with more spare capacity. This is simpler than Dragonfly's three sub-metrics but captures the same core insight — "can this peer actually serve me right now?"

**IDC (Internet Data Center) Affinity:**
Binary match: same IDC = 1.0, different IDC = 0.0. Simple but effective for datacenter deployments where cross-DC traffic is expensive.

*IC implication:* IC doesn't have IDC boundaries, but the concept maps to "network locality." IC could assign clients to regions (e.g., EU-West, US-East, Asia) and prefer same-region peers. This already exists in IC's geographic proximity preference, but Dragonfly's binary approach (same/different, no gradient) is worth considering as simpler to implement and reason about.

**Location Affinity — Hierarchical Geographic Matching:**
```
Location = "country|province|city|zone|cluster"
Score = matched_prefix_elements / 5
```

Pipe-delimited hierarchical string, up to 5 elements. Score is the fraction of elements that match from the left. Two peers in the same country but different cities score 0.2. Same city different zone: 0.6. Same zone: 0.8.

*IC implication:* **This is directly valuable for IC.** IC's current geographic preference is binary (same region / different region). Dragonfly's hierarchical approach is more nuanced without being complex. IC could use `continent|country|region|city` (4 levels) and score `matched / 4`. This produces better peer selection in geographically diverse swarms — preferring a peer in the same city over one in the same country, and one in the same country over one on the same continent. Client self-reports location (derived from IP geolocation or user config), stored in announce.

**HostType Score:**
Seed peers in `Running` or `ReceivedNormal` state score 1.0; normal peers score 0.5. Simple but effective — seed infrastructure is always preferred when available.

*IC implication:* Maps directly to IC's seed box preference. IC's seed boxes should score higher than regular peers, matching this pattern.

**IsBadParent — Statistical Anomaly Detection:**
```
if samples < 2000:
    bad = (lastCost > 20 × meanCost)
else:
    bad = (lastCost > meanCost + 3 × stddev)  # three-sigma rule
```

Two regimes: when data is sparse (< 2000 sample points), use a simple ratio threshold (20× mean); when data is sufficient, apply the three-sigma rule from statistics. Once a parent is marked bad, it's excluded from candidate lists.

*IC implication:* **More sophisticated than IC's current binary blacklist.** IC blacklists peers after zero-throughput timeout (30s). Dragonfly's statistical approach detects degradation before total failure — a peer whose latency is 3σ above the mean is probably experiencing issues even if it hasn't timed out. IC should adopt a version of this: track per-peer piece transfer times, flag peers whose last transfer took > `max(3 × mean, 2 × p95)` of observed transfer times, demote them in scoring (not hard-blacklist — they might recover).

**Persistent Task Evaluation (Different Weights):**
For persistent/cached content (tasks that live across restarts), the evaluator uses different weights:
```
PersistentScore = (IDCAffinity × 0.7) + (LocationAffinity × 0.3)
```

No LoadQuality dimension — persistent content is about placement, not instantaneous capacity. Locality dominates.

*IC implication:* IC's Workshop resources are inherently persistent (not ephemeral downloads). The insight that persistent content should be scored differently from live downloads is valid — for Workshop browsing/search (not time-critical), location affinity matters more than instantaneous peer bandwidth. IC should use a locality-weighted scoring for Workshop index synchronization and background cache warming.

**Manager-Level Cluster Selection:**
When a client first connects, the Manager evaluates which scheduler cluster is best:
```
ClusterScore = cidrAffinity×CIDR + hostnameAffinity×Hostname + idcAffinity×IDC + locationAffinity×Location + clusterType×ClusterType
```

This is a separate scoring function from the per-download evaluator — it runs once on connection, routing the client to the most appropriate cluster.

*IC implication:* If IC ever runs multiple Workshop servers (federated deployment), a similar cluster-routing function would help. When a client is configured with multiple `remote` sources, IC could evaluate which source is best for a specific download using network-proximity scoring. This is a Phase 6+ optimization.

#### Task & Piece Model

Every download in Dragonfly is a **Task** (identified by SHA-256 hash of the URL + metadata). Tasks are divided into **Pieces**. The Scheduler maintains a DAG of peer-task relationships.

**Task Size Scoping:**
```
EmptyFileSize    = 0 bytes     → ScopeEmpty
TinyFileSize     = 128 bytes   → ScopeTiny (metadata only, no P2P needed)
SmallFileSize    = 1 piece     → ScopeSmall (single piece, direct download)
Everything else               → ScopeNormal (full P2P scheduling)
```

*IC implication:* IC's current 3-tier model (<5MB HTTP-only, 5–50MB mixed, >50MB P2P-only) is coarser but more appropriate for IC's use case. Dragonfly's distinction between Empty/Tiny/Small matters for container images (manifests are small, layers are large). For IC, `manifest.yaml` files are always small and served via HTTP; `.icpkg` packages are the P2P candidates. The key lesson is validating IC's approach: skip P2P for small content, it adds overhead without benefit.

**DAG-Based Peer Graph:**
Unlike BitTorrent (which uses unstructured swarms), Dragonfly maintains a directed acyclic graph where each edge represents a download relationship: `child → parent`. The Scheduler explicitly controls these edges.

```
Seed Peer ──► Peer A ──► Peer D
     │            │
     └──► Peer B  └──► Peer E
              │
              └──► Peer C
```

`FindCandidateParents()` queries the DAG for available parents, `filterCandidateParents()` removes blocked/failed parents, then the evaluator scores and ranks the remaining candidates. Configuration: `CandidateParentLimit: 1–20` (default 4), `FilterParentLimit: 10–1000` (default 40).

*IC implication:* BitTorrent's unstructured swarm is simpler and more resilient to churn (random peer failure doesn't cascade). Dragonfly's DAG provides optimal scheduling in controlled environments but is fragile when peers arrive/leave unpredictably (exactly IC's internet scenario). **IC should stay with BitTorrent swarms for robustness** but adopt the candidate filtering concept: when the tracker builds a peer list, filter out known-bad peers before ranking (same effect, simpler implementation).

**Task ID — Content-Addressed:**
`TaskID = SHA256(URL + tag + application + filtered_query_params)`. Content-addressed means duplicate requests for the same content converge on the same task and peer graph.

*IC implication:* IC already uses SHA-256 package hashes as identifiers (D030). Dragonfly validates that content-addressing is the right approach for deduplication across requests.

#### Persistent Cache & Storage

Dragonfly provides three resource layers, each with different persistence and performance characteristics:

| Layer             | Storage   | Lifetime                                       | Use Case                             |
| ----------------- | --------- | ---------------------------------------------- | ------------------------------------ |
| `standard`        | In-memory | Ephemeral (survives only while task is active) | Active downloads                     |
| `persistent`      | Redis     | TTL-based (configurable expiration)            | Frequently accessed content          |
| `persistentcache` | Redis     | TTL-based + replica management                 | Content that must survive peer churn |

**Persistent cache** adds `PersistentReplicaCount` — the system ensures N replicas of cached content exist across healthy peers. If a peer holding a replica goes offline, the system detects this and triggers re-replication to maintain the target count.

**Redis Lua Scripts:** Atomic operations on peer/task storage use Redis Lua scripts for consistency. Operations like "find all peers for a task" and "register peer for task" are transactional.

**In-Memory Cache:** Package-level cache (`pkg/cache`) with a janitor goroutine for expiration, gob serialization, and `OnEvicted` callbacks. Manager-level caching uses `go-freelru` (LRU, xxhash) with 1024 default capacity and 30s TTL.

*IC implication:* IC's design already includes tiered storage (in-memory peer lists while running, SQLite persistence for registry, disk cache for packages). The **replica count concept** is valuable: IC's Workshop server (Phase 5+) could track how many seed boxes hold each popular package and trigger re-seeding if the count drops below a threshold. This is especially important for the "always available" guarantee — if the last seed box holding a package goes offline, it should be re-seeded from HTTP origin before it becomes unavailable.

#### Multi-Cluster Management

Dragonfly's Manager manages multiple `SchedulerCluster` entities, each with Scopes:
```
SchedulerCluster {
    Name, BIO,
    Config { CandidateParentLimit: 1-20, FilterParentLimit: 10-1000, JobRateLimit },
    ClientConfig { LoadLimit },
    Scopes { IDC, Location, CIDRs: ["10.0.0.0/8"], Hostnames: ["*.east.example.com"] },
    IsDefault,
    SeedPeerClusters: many2many
}
```

Each scheduler cluster can associate with multiple seed peer clusters. When a client connects, the Manager's cluster searcher evaluates `CIDR affinity + hostname affinity + IDC affinity + location affinity + cluster type` to route the client to the best cluster.

**Critical limitation: No cross-cluster P2P.** Peers in Cluster A cannot download from peers in Cluster B. The multi-cluster model is management-only — it helps large organizations (hundreds of datacenters) organize their Dragonfly deployment, but each cluster is an isolated P2P island.

**Jobs/Preheat across clusters:** The Manager can dispatch preheat jobs (pre-warm content) to specific scheduler clusters and seed peer clusters. This is the only form of cross-cluster coordination.

*IC implication:* **IC's federated design is fundamentally different and more capable.** IC's `remote` repository type already provides cross-server content discovery — a client can browse content from Server A and Server B in one unified view. IC's P2P swarm is not cluster-bounded — any peer seeding a package can serve any other peer requesting it, regardless of which server they originally downloaded from. Dragonfly's cluster isolation is appropriate for large organizations with network segmentation but would be a limitation for IC's open-internet community model. However, Dragonfly's cluster scoping (CIDR, hostname, IDC, location) is good design for the *optional* network segmentation IC might need for enterprise users or LAN party scenarios.

#### Health, Monitoring & GC

**Prometheus Metrics:** Built-in. Task/peer metrics, download/upload throughput, scheduling latency, GC stats. Mirrors IC's OTEL commitment (D031).

**GC System:** The Scheduler runs garbage collection with configurable intervals:
- `JobTTL: 6 hours` — completed preheat jobs expire
- `AuditTTL: 7 days` — audit logs expire
- Peers expire from task graph when they fail health checks or disconnect
- Redis-backed persistent resources expire via TTL

**Priority System (6 tiers):**
```
Level0 (lowest) → Level1 → Level2 → Level3 → Level4 → Level5 → Level6 (highest)
```

Tasks are assigned a priority level. Higher-priority tasks get preferential scheduling (better parents, more bandwidth allocation). This enables QoS differentiation — a critical production image pull can preempt a background prefetch.

*IC implication:* IC doesn't need 6 priority levels, but 2–3 are valuable: `lobby-urgent` (player needs this mod to join a match — highest priority), `user-requested` (player browsing Workshop and clicked download), `background` (cache warming, auto-updates, pre-download for subscribed mods). This maps to D049's existing lobby auto-download priority concept.

**Dynamic Configuration Refresh:**
Schedulers periodically fetch config from Manager and cache locally. Config changes (e.g., adjusting `CandidateParentLimit`) propagate without restart.

*IC implication:* IC's Workshop server should support runtime config refresh (via SIGHUP or admin API) without restart. Useful for self-hosters who need to adjust rate limits, peer limits, or moderation rules without downtime.

#### Community & Known Limitations

**RFC #3713 — Parent Selection Based on Node State Awareness** (issue `dragonflyoss/dragonfly#3713`, status: `on-hold`):

This community RFC reveals a significant limitation acknowledged by the Dragonfly developers. Despite the sophisticated evaluator-based scoring described above, **piece-level parent selection is actually FCFS** (First Come First Served). The evaluator scores parents when a *task* starts, but once parents are assigned, individual *pieces* are fetched from whichever parent reports having them first — not from the optimal parent for each piece.

The RFC proposes three new modules:
- **ParentStateServer**: Background daemon on upload peers, periodically reports local network bandwidth and disk I/O state to connected clients
- **ParentStateSyncer**: Background daemon on download peers, maintains LRU cache of parent states, synchronizes via gRPC streaming
- **PieceCollector**: Uses parent state awareness to select the optimal parent *per piece*, not just per task

The proposed algorithm: save piece metadata in per-parent queues, use a weighted-random selection based on real-time parent bandwidth/IO state, fall back to next-best queue if selected parent's queue is empty.

*IC implication:* **This validates IC's BitTorrent-based approach.** BitTorrent's piece-level selection (rarest-first from any connected peer) is inherently more adaptive than Dragonfly's current FCFS-within-assigned-parents model. BitTorrent peers naturally load-balance by serving pieces to whichever requestor asks first, and rarest-first ensures swarm-wide piece diversity. The RFC shows Dragonfly is moving *toward* what BitTorrent already does well. IC should not adopt Dragonfly's centralized scheduling model — the decentralized BitTorrent model is already better at piece-level adaptation for internet conditions.

**Other Notable Issues:**
- **#4604**: Image pull failure with 25GB image + rate limiting → digest mismatch. Reveals edge case with very large files and interrupted downloads. IC's `.icpkg` packages are typically 5–500MB (much smaller than AI models), but the lesson is: content integrity verification must be piece-level, not just whole-file.
- **#4421**: Python SDK for AI model distribution. Shows Dragonfly expanding beyond container images into AI/ML — validating that P2P distribution is a general-purpose need.

**v2 Rust Client:**
Dragonfly v2 rewrote the client daemon in Rust (`dragonflyoss/client` repository). This is notable because it validates the Rust-for-P2P-client choice that IC is making with `ic-workshop`. The main scheduler and manager remain in Go — only the client (the performance-critical, widely-deployed component) was rewritten.

#### Dragonfly Limitations & Where IC Diverges

| Dragonfly Design Choice                            | IC's Different Need                              | IC's Approach                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Centralized scheduler (single point of control)    | Decentralized, resilient to server failure       | BitTorrent swarm — no central scheduler. Tracker is a peer list, not a decision-maker. Peers self-organize.         |
| DAG-based peer graph (fragile to churn)            | Internet peers join/leave unpredictably          | Unstructured swarm with rarest-first piece selection. Peer departure = lost connections, not graph corruption.      |
| Kubernetes-centric deployment                      | "Just a binary" deployment (D034)                | Single binary game client. Server is one binary + SQLite. No K8s, no Redis, no MySQL required.                      |
| Four component types (Manager/Scheduler/Seed/Peer) | Minimal infrastructure                           | Two roles: client (P2P peer) + server (tracker + registry + optional seed). Server is optional for git-index phase. |
| No cross-cluster P2P                               | Global P2P swarm regardless of server            | Any peer can serve any other peer. Server federation is for discovery, not P2P isolation.                           |
| No general-purpose registry (works *alongside*)    | Full package registry (search, deps, ratings)    | Workshop IS the registry — search, versioning, dependency resolution, collections. Not a sidecar.                   |
| No browser support                                 | WASM/browser is first-class (D010)               | WebTorrent for browser-to-browser and browser-to-desktop P2P.                                                       |
| FCFS piece-level selection (RFC #3713 to fix)      | Adaptive piece selection                         | BitTorrent rarest-first already provides what Dragonfly's RFC proposes. IC ships this from day one.                 |
| Redis required for persistence                     | Zero external dependencies                       | SQLite for registry, in-memory for active peer lists, disk for package cache. No Redis.                             |
| Container image focus                              | Game assets (mods, maps, music, sprites)         | Generic `.icpkg` format with `manifest.yaml`. Content-type-agnostic.                                                |
| Enterprise scale (Alibaba, Baidu)                  | Community scale (10–10K concurrent per resource) | BitTorrent scales well at this range without centralized scheduling overhead.                                       |

#### Key Takeaways for IC Workshop from Dragonfly

1. **Multi-dimensional peer scoring beats simple priority tiers.** Dragonfly's `LoadQuality(0.6) + IDCAffinity(0.2) + LocationAffinity(0.1) + HostType(0.1)` demonstrates that combining capacity, locality, and node type into a weighted score produces better parent selection than IC's current approach of linear priority tiers. IC should evolve toward weighted scoring for peer handout.

2. **Hierarchical location affinity is simple and effective.** `"country|province|city|zone"` with prefix matching is trivial to implement and meaningfully improves locality. IC should adopt `continent|country|region|city` (4-level) hierarchical location scoring for peer selection.

3. **Statistical bad-peer detection outperforms binary blacklisting.** Dragonfly's three-sigma rule (for sufficient samples) and 20× ratio (for sparse data) catch degrading peers before they fail completely. IC should track per-peer transfer times and demote (not hard-blacklist) peers that are statistically slow.

4. **Capacity-aware peer selection is the right direction.** Dragonfly's LoadQuality scoring (bandwidth headroom + sustained load + concurrency) and the RFC #3713 community feedback both point to the same insight: knowing whether a peer CAN serve right now matters more than knowing it HAS the content. IC peers should report bandwidth utilization in announce; the tracker should prefer peers with spare capacity.

5. **Content-addressed task IDs prevent duplicate work.** `SHA256(URL + metadata)` means multiple requests for the same content converge on one swarm. IC already does this with package-hash-as-swarm-ID (D049).

6. **Persistent replica count ensures availability.** Dragonfly's `PersistentReplicaCount` maintains N copies of important content across healthy peers. IC's Workshop server (Phase 5+) should track replica counts for popular resources and trigger re-seeding when replicas drop below threshold.

7. **Priority tiers for download QoS are necessary.** Dragonfly's 7-level priority enables critical vs. background downloads. IC needs at least 3: lobby-urgent (blocking gameplay), user-requested, background (cache warming).

8. **Preheat/prefetch is valuable for predictable demand.** Dragonfly's preheat jobs pre-warm content on seed peers before demand arrives. IC can adapt this: when a lobby host sets required mods, the server can pre-seed those mods to seed boxes before players join (predictable demand pattern).

9. **Dynamic config without restart is a quality-of-life feature.** Dragonfly schedulers refresh config from Manager periodically. IC's Workshop server should support runtime config changes (rate limits, peer limits, moderation rules) without restart.

10. **The centralized scheduler is unnecessary for IC's scale.** Dragonfly's Scheduler adds significant complexity. It's justified at Alibaba scale (millions of concurrent downloads) but overkill for IC's community scale. BitTorrent's decentralized approach is simpler, more resilient, and already handles piece-level adaptation better (per RFC #3713). IC should not adopt centralized scheduling.

11. **The Rust client rewrite validates IC's technology choice.** Dragonfly V2 rewrote the performance-critical client in Rust while keeping the control plane in Go. IC is already all-Rust. This confirms that when a P2P project needs maximum client performance, Rust is where it ends up.

### Modrinth — Open-Source Game Mod Registry

- **Website:** https://modrinth.com
- **Scope:** Mod registry primarily for Minecraft (Java and Bedrock), expanding to other games. Open-source server (Rust), open API.
- **Features:** Search, versioning, dependency resolution, collections, creator profiles, OAuth, mod loader detection, automatic compatibility checking.
- **Distribution:** Centralized CDN. No P2P. No self-hosting option (the API is open but there's no self-hostable server binary for community deployments).
- **Scale:** ~100K projects, millions of monthly downloads. Growing fast as CurseForge alternative.
- **Limitations:** Centralized (single operator). No P2P (CDN costs funded by donations + ads). No federation (can't compose with community servers). Minecraft-centric API design.
- **IC relevance:** Best-in-class UX reference for mod browsing, search, dependency resolution, and creator profiles. IC's Workshop browser takes direct UX inspiration from Modrinth. The key differentiators we provide: P2P distribution, federation, self-hosting, game-agnosticism, git-index bootstrap.

### JFrog Artifactory — Enterprise Artifact Management

- **Product:** Commercial (with free tier). The reference implementation for federated artifact repositories.
- **Federation model:** Local (you create here), Remote (proxied from another server, cached), Virtual (merged view). This is exactly IC's D030 repository model.
- **P2P:** Available as "JFrog Distribution" add-on. Enterprise feature, not open source.
- **Features:** Multi-format (Maven, npm, Docker, PyPI, etc.), promotion channels, replication, integrity verification, access control, build integration.
- **Limitations:** Enterprise pricing ($$$). Not designed for end-user content distribution. No WebTorrent/browser P2P. Overkill for community projects.
- **IC relevance:** The architectural inspiration for IC's repository model. IC borrows the local/remote/virtual pattern and adds git-index as a fourth type, P2P as the distribution layer, and game-mod-domain features. Artifactory validates that the federated repository model works at enterprise scale (thousands of servers, millions of artifacts).

### IPFS — Content-Addressed Decentralized Storage (Deep Dive)

- **Repos:** [ipfs/kubo](https://github.com/ipfs/kubo) (Go reference impl, 16.5k★), [ipfs/boxo](https://github.com/ipfs/boxo) (shared Go libraries including Bitswap), [ipfs/specs](https://github.com/ipfs/specs) (specifications), [libp2p/go-libp2p](https://github.com/libp2p/go-libp2p) (networking stack)
- **License:** MIT (Kubo), Apache-2.0 (libp2p)
- **Model:** Content-addressed — every piece of content gets a unique CID (Content Identifier) based on its cryptographic hash. CID structure is `Multibase + CIDversion + Multicodec + Multihash`. Any node can serve any content. Discovery via Distributed Hash Table (DHT) + Bitswap protocol + mDNS (local) + Delegated HTTP routing.

#### Architecture Overview

IPFS separates concerns into three layers:

1. **Data representation** — CIDs (content addressing), IPLD (data model, Merkle DAGs), UnixFS (file/directory encoding). Content is chunked into blocks (default 256KB), structured into DAGs (Directed Acyclic Graphs), and each block identified by its CID.
2. **Content routing** — finding which peers have which blocks. Four subsystems: Kademlia DHT (global discovery), Bitswap want-have protocol (connected-peer discovery), mDNS (LAN discovery), Delegated HTTP routing (offload routing to API servers).
3. **Data transfer** — actually moving blocks. Bitswap (primary), HTTP gateways (read-only), CAR files (offline archives/"sneakernet").

**CID flexibility** is both a strength and a complexity source: different chunk sizes, DAG layouts (balanced vs trickle), codecs (UnixFS, dag-cbor, raw), CID versions (v0/v1), and hash algorithms (sha-256, blake3) all produce different CIDs for the same file. "CID Profiles" (community-documented standard parameter combinations) are an emerging solution for reproducibility.

#### Bitswap Protocol (from specs + boxo source)

Bitswap is message-based (not request-response). Three protocol versions:

- **1.0.0** — Basic wantlists (list of CIDs) + blocks. Peers send wants; responders send blocks.
- **1.1.0** — CIDv1 support. Uses CID prefix (codec+hash function) for proper handling on receive side.
- **1.2.0** (current) — The significant upgrade. Adds:
  - **Want-Have / Want-Block distinction** — "Do you have block X?" vs "Send me block X." Two-phase discovery reduces wasted bandwidth.
  - **DontHave responses** — Explicit "I don't have it" rather than silence. Eliminates timeout-based detection.
  - **PendingBytes** — "I have N bytes queued for you." Flow control signal.
  - **sendDontHave flag** — Requestor can opt-in/out of DontHave responses.

**Block size limit:** 2MiB soft limit (Bitswap spec), 4MiB hard limit (libp2p message max). Tests verify boundary behavior.

**Bitswap as content routing:** The want-have mechanism enables Bitswap to function as a bare-bones content routing system for already-connected peers — before falling back to the DHT for global discovery. ProviderSearchDelay (default 1s) controls how long Bitswap waits before asking the DHT.

#### Decision Engine (boxo/bitswap/server/internal/decision/engine.go)

The Bitswap server's decision engine manages what to send to whom, when. Key patterns:

**PeerTaskQueue** — A priority queue of pending requests from peers. Tasks have Topic (CID), Priority (from wantlist), Work (block size for want-block, presence size for want-have). The queue merges duplicates: if a peer sends want-have then want-block for the same CID, want-block wins (higher Work).

**Pluggable TaskComparator** — Custom prioritization logic. Default: priority field from wantlist. Operators can inject application-specific ordering (e.g., prioritize frequently-requested content, or deprioritize large blocks).

**PeerBlockRequestFilter** — Per-peer access control. A function `(PeerID, CID) → bool` that can deny specific blocks to specific peers. Used for access control, content policies, or subscription-based serving.

**Fairness mechanisms:**
- `MaxOutstandingBytesPerPeer` (default 1MB): Caps how much data is queued for any single peer. Range: 250KB (very fair, slower) to 10MB (less fair, faster). Prevents one greedy peer from monopolizing server bandwidth.
- `MaxQueuedWantlistEntriesPerPeer`: Limits wantlist size per peer. Excess entries truncated by priority. Prevents memory exhaustion from malicious peers sending huge wantlists.
- `MaxCidSize`: Rejects CIDs with pathologically large varint encodings. Memory protection against malformed/malicious requests.

**WantHaveReplaceSize** (default 1024 bytes): For small blocks, skip the HAVE response and just send the block directly. Saves a round-trip. Configurable.

**TargetMessageSize** (default 16KB): Batches outgoing responses into optimally-sized messages. Tasks are popped from the queue until the message reaches this size, then sent as one envelope.

**Envelope pattern:** Responses assembled into `Envelope{Peer, Message, Sent()}`. The `Sent()` callback signals the task queue that work is complete. Clean producer-consumer with backpressure via the outbox channel.

**Work-signal channel:** A single-buffered channel (capacity 1) for "new work available" notifications. If the channel is already full, the signal is a no-op — someone is already processing. Elegant thundering-herd prevention.

#### Score Ledger (boxo scoreledger.go)

Tracks peer reputation for connection management:

```
Score formula:
  lscore = bytesRecv / (bytesRecv + bytesSent)   // 0.0 to 1.0
  score = (shortScore + longScore) * (lscore * 0.5 + 0.75)
```

- **EWMA** (Exponentially Weighted Moving Average) with separate short-term and long-term decay rates
- **Prefers peers we NEED** (high recv/sent ratio) over peers that need us (takers)
- **Score → PeerTagger integration:** High-scoring peers get "protected" connections that survive connection pruning. Low-scoring peers risk disconnection during resource pressure.
- **PeerLedger** (functional) vs **ScoreLedger** (evaluative) separation: PeerLedger tracks what each peer wants (wantlists). ScoreLedger tracks how useful each peer is. Clean separation of concerns.

#### Routing System (kubo routing/composer.go)

**Routing Composer pattern** — Separates content routing into 5 independently-configurable concerns:

1. `GetValueRouter` — Resolve IPNS names, retrieve DHT values
2. `PutValueRouter` — Publish IPNS records, store DHT values
3. `FindPeersRouter` — Locate peers by PeerID
4. `FindProvidersRouter` — Find who has a specific CID
5. `ProvideRouter` — Announce that we have a specific CID

Each concern can use a different backend: DHT, delegated HTTP, custom. This decomposition is elegant — "find who has content" is independent of "announce we have content."

**Dual DHT (WAN/LAN):** Separate routing tables for public internet and local network. Only the WAN DHT is exposed publicly. LAN peers discovered via mDNS without internet.

**Sweep Provider** (Kubo v0.39+): For nodes with many CIDs (e.g., pinning services), announcing each CID individually is O(N) DHT lookups. Sweep Provider divides the DHT keyspace into regions by prefix, estimates DHT size (~10K servers), calculates regions with ≥20 peers each, and batches CIDs allocated to the same DHT region. For 100K CIDs, this reduces DHT lookups by 97% vs legacy serial announcing. The work is spread evenly over the reprovide interval (~22h).

**Delegated Routing over HTTP:** Nodes can offload content routing to HTTP API servers (`/routing/v1/` standard interface). Lightweight clients don't need to participate in the DHT at all — they ask a delegated router "who has CID X?" over HTTP. This decouples routing from the P2P network.

**Accelerated DHT Client** (`fullrt.FullRT`): Maintains a full view of the DHT routing table via background crawl (5-10 min initialization). Provides content without individual lookups — directly allocates provider records to the closest known peers. Resource-intensive but eliminates per-CID latency.

#### Persistence & Garbage Collection (kubo gc/gc.go + pin system)

**Pinning model** — Content persists only if explicitly pinned:
- **Direct pin:** Pin a single block
- **Recursive pin:** Pin a block and all blocks it references (entire DAG)
- **MFS (Mutable File System):** Files added to MFS are implicitly pinned
- **Remote pinning:** Delegate persistence to third-party services via standardized API (status flow: queued → pinning → pinned → failed)

**Garbage collection** — Mark-and-sweep:
1. Mark: All recursively-pinned blocks + their descendants + directly-pinned blocks + pinner internal blocks
2. Sweep: Iterate all blocks in blockstore, delete any not in the marked set
3. GC lock: Pin operations hold a lock to prevent concurrent GC from deleting blocks being pinned

**Provider record lifecycle:** Records expire after ~22h (`amino.DefaultProvideValidity`). Nodes must periodically re-announce what they have. Network churn (nodes leaving) causes the DHT to "forget" content locations. This is the root cause of many "content not found" reports.

**Remote Pinning Service API:** Standardized REST API (`pinning-services-api-spec`) for delegating persistence to infrastructure providers. Pin statuses: queued/pinning/pinned/failed. Kubo stores remote service credentials with API key concealment (keys hidden from `ipfs config show`).

#### Broadcast Control (Kubo ≥0.36)

Reduces Bitswap broadcast noise by choosing a subset of peers for want-have messages:
- `MaxPeers`: Total cap on broadcast recipients
- `LocalPeers` / `PeeredPeers`: Guaranteed slots for local and explicitly-peered nodes
- `MaxRandomPeers`: Random selection cap
- `SendToPendingPeers`: Prefer peers who previously responded with wanted blocks
- Smart selection: Peers who previously had blocks we wanted are prioritized for future wants

#### Community Pain Points (from GitHub Issues)

1. **#3065: Bandwidth limiting** (73 👍, OPEN since 2016, 76 comments) — The #1 most-upvoted issue. IPFS has no built-in bandwidth limiting. DHT traffic can drown out Bitswap transfer traffic. Options debated: per-peer, per-subnet, per-protocol, and global limiting — each with trade-offs. Still unresolved after 9 years.

2. **#3320: IPFS kills consumer routers** (17 👍, "Don't Kill Routers" milestone) — IPFS opens too many connections. NAT table overflow, connection tracking exhaustion on consumer routers. This is a fundamental tension: DHT wants many connections for routing efficiency, but residential NAT hardware has finite capacity.

3. **#6383: Content Resolution Performance** (19 👍, meta-issue) — Documents the full taxonomy of content discovery failures: (a) peers behind NAT are unreachable, (b) DHT lookup is slow for cold content, (c) DHT is "forgetful" — provider records expire after 12-22h and network churn causes information loss, (d) gateway is a shared resource bottleneck. The "forgetful DHT" insight is key: ephemeral peer announcements are unreliable for content that needs to be always-available.

4. **#3860: IPNS very slow** (31 👍, 105 comments, 8 years to close) — Name resolution (IPNS → CID mapping) takes 5-30 seconds on first load. Caching helps subsequent loads, but cold lookups are painful. Root cause: IPNS requires DHT lookup + record verification + sometimes multiple hops. Fixed in Kubo 0.20+ with routing improvements, but exemplifies the latency cost of indirection.

5. **Server/Client mode separation** — Kubo added `Bitswap.ServerEnabled` flag to allow download-only nodes. Not everyone wants to serve content. Bandwidth-constrained users (mobile, metered connections) need a client-only mode.

#### What IPFS Got Right — Lessons for IC

1. **Content addressing is identity** — CID = hash means verification is intrinsic. No separate integrity check needed. IC already uses SHA-256 for integrity; IPFS validates and extends this principle.

2. **Want-Have / Want-Block protocol** — Two-phase discovery within connected peers is elegant. "Do you have X?" is cheap; "Send me X" is expensive. Ask first, then request. IC's P2P could use a similar lightweight probe before committing to a block transfer.

3. **Routing Composer (separation of routing concerns)** — Find-providers, provide, find-peers as independent pluggable backends. IC could separate "who has package X" (registry query) from "announce I'm seeding X" (tracker announce) from "find nearby peers" (LAN discovery) — each with independent configuration.

4. **EWMA peer scoring** — Time-decaying reputation is more robust than instantaneous measurement. Better than Kraken's simple blacklist or Dragonfly's snapshot-based LoadQuality. IC should use EWMA for peer reputation, not just the three-sigma statistical check from Dragonfly.

5. **MaxOutstandingBytesPerPeer fairness** — Simple, configurable, effective. One parameter controls the fairness-vs-throughput trade-off. IC should adopt this directly.

6. **WantHaveReplaceSize optimization** — For tiny data (<1KB), skip the "I have it" step and send directly. IC application: for small metadata files (<4KB manifest fragments), embed in peer announcements or send immediately rather than going through the full piece request pipeline.

7. **Broadcast control with selective peer targeting** — Prefer peers who previously had what you wanted. Don't spray wants to all peers. IC should be selective about announce messages — prioritize peers who previously served useful pieces.

8. **Dual DHT (WAN/LAN)** — Separating local and wide-area discovery is perfect for IC. LAN party mode uses local multicast discovery (fast, no internet needed). WAN uses tracker/registry. Same concept, validated at scale.

9. **Delegated routing over HTTP** — The registry server IS a delegated router. When a peer asks "who has package X?", the registry responds with a peer list — exactly like IPFS's delegated HTTP routing. IPFS validates this pattern standardized as `/routing/v1/`.

10. **PeerTagger / connection manager integration** — Protecting useful peers from connection pruning ensures the most productive connections survive under resource pressure. IC should integrate peer scoring with connection management.

11. **CAR files (Content Addressable Archives)** — Serialized content-addressed data for offline transport. Directly validates IC's `ic workshop export-bundle` concept for LAN party scenarios.

12. **Server/Client mode separation** — Not every node should serve. Mobile players, metered connections, and low-bandwidth peers should be able to download without being forced to upload. IC should support configurable upload participation.

#### What IPFS Got Wrong — Anti-Patterns IC Avoids

1. **Complexity exposed to end users** — Running an IPFS node requires understanding CIDs, pinning, DHT, GC, and daemon management. IC must hide all P2P complexity. Players click "download" and it works.

2. **Unreliable availability via ephemeral DHT** — Content disappears when the last pinner goes offline, and provider records expire after ~22h even while the node is running. IC solves this structurally: the git-index and registry server are authoritative "who has what" sources that don't expire. P2P discovery augments, never replaces, the authoritative index.

3. **No bandwidth limiting for 9+ years** — The #1 community complaint, still unresolved. IC must ship bandwidth limiting from day one. Residential internet is not datacenter bandwidth.

4. **Router-killing connection volume** — DHT maintenance + Bitswap wantlists + hole-punching overwhelms consumer NAT tables. IC must cap concurrent P2P connections conservatively (default: 50, configurable). Pre-connected lobby peers are more valuable than a massive swarm.

5. **No incentive structure** — IPFS relies on altruism for hosting/pinning. Content becomes unreachable when volunteers leave. IC has a natural incentive: players in the same game automatically share content as a side effect of playing. Lobby P2P creates free, demand-correlated distribution.

6. **Slow cold-content discovery** — First DHT lookup for unpopular content: 5-30 seconds. IC avoids this entirely — the registry/index tells you where content lives before you start P2P. No DHT walk needed.

7. **Provider record expiry without authoritative backup** — The DHT is the only source of truth for content location, and records expire. IC has multiple authoritative sources (git-index, registry DB, tracker state) that don't expire.

8. **CID non-determinism** — Same file can produce different CIDs depending on chunks/codec/DAG layout. CID "profiles" are a workaround, not a solution. IC uses a single well-defined hash algorithm (SHA-256) over the entire package file — one file, one hash, always.

#### IC Relevance — Summary

IPFS solves a fundamentally different problem (permanent decentralized storage) than IC needs (efficient distribution of popular content to game players). BitTorrent remains the right distribution protocol — simpler, faster for large files, better suited for "hot download" use cases where content is actively wanted by many people at once.

However, IPFS contributes several valuable design patterns to IC's Workshop:

| IPFS Pattern                                          | IC Adoption                                                      | Priority |
| ----------------------------------------------------- | ---------------------------------------------------------------- | -------- |
| Want-Have / Want-Block two-phase protocol             | Lightweight peer probing before piece requests                   | Phase 5  |
| EWMA peer scoring with short/long-term decay          | Replace pure statistical detection with time-decaying reputation | Phase 5  |
| Routing Composer (5 independent concerns)             | Separate find-providers / announce / find-peers configuration    | Phase 5  |
| MaxOutstandingBytesPerPeer fairness                   | Direct adoption — configurable per-peer bandwidth cap            | Phase 5  |
| WantHaveReplaceSize (skip HAVE for tiny data)         | Embed small metadata in announce responses                       | Phase 5  |
| Broadcast control (target responsive peers)           | Selective announce to proven-useful peers                        | Phase 5  |
| Dual discovery (WAN/LAN)                              | LAN multicast discovery + WAN tracker/registry                   | Phase 5  |
| Delegated HTTP routing                                | Registry server as authoritative peer discovery endpoint         | Phase 3+ |
| Server/Client mode separation                         | Download-only mode for bandwidth-constrained players             | Phase 5  |
| PeerTagger (protect useful connections)               | Integrate scoring with connection management                     | Phase 5  |
| Sweep Provider (batch announcements)                  | Batch tracker announces for seed boxes with large catalogs       | Phase 5+ |
| CAR archives                                          | Already designed: `ic workshop export-bundle` for LAN scenarios  | Phase 4  |
| Bandwidth limiting (learned from IPFS's 9-year gap)   | Ship from day one, per-flow-type limiting                        | Phase 5  |
| Connection count cap (learned from router-kill issue) | Default 50 concurrent P2P connections, configurable              | Phase 5  |

## Key Insight: Why This Doesn't Exist Yet

The gap exists because the use cases traditionally broke along four axes:

1. **Enterprise (Artifactory, Sonatype Nexus Repository):** Has federation, dependency resolution, and promotion channels. But enterprise customers pay for CDN — P2P is a nice-to-have optimization, not a survival requirement. And they don't need browser compatibility or end-user UX.

2. **Consumer/Community portals (Nexus Mods, ModDB, GameBanana):** Has great community features, creator profiles, and discovery. But architecturally web 1.0 — no in-game integration, no dependency resolution, manual download workflows. Funded by ads/premium and don't need P2P because the operator absorbs CDN cost.

3. **UGC middleware (mod.io, Steam Workshop):** Has in-game integration and cross-platform support. But centralized SaaS — no P2P, no federation, no self-hosting. mod.io is VC-funded with monetization focus. Steam Workshop is platform-locked. Neither is open source at the backend level.

4. **Infrastructure (Kraken, Dragonfly):** Has P2P at scale. But designed for DevOps, not end users. No registry features (search, ratings, deps). No browser compatibility. Datacenter-optimized.

**IC's position — and the potential standalone platform — sits at the intersection:** community-funded (so P2P is essential, not optional), game-oriented (so UX and in-engine integration matter), open-source (so federation and self-hosting are requirements), and targeting multiple platforms including browsers (so WebTorrent is needed).

This intersection was too niche for any existing project to optimize for. mod.io came closest by building embeddable UGC middleware, but took the VC-funded SaaS path instead of the open-source federated path. The rise of open-source games, AI model distribution, and community-driven creative tools means the addressable market for an open alternative is growing.

## Open Questions

1. **Is the market large enough to justify a standalone project?** IC alone justifies the engineering effort. But standalone extraction only makes sense if other projects would adopt it. Early signal: are any open-source games or creative tools frustrated with their current mod/asset distribution?

2. **Should the platform be Rust-only?** The server and reference client would be Rust. But if the platform serves multiple ecosystems, client libraries for Python, JavaScript/TypeScript, and C/C++ would be needed. The protocol and manifest format should be language-agnostic specifications.

3. **Governance model for a standalone platform.** If extracted, who owns it? Options: Linux Foundation project (like Dragonfly), independent foundation, IC team maintains it, or community governance with elected maintainers.

4. **Naming and branding.** The platform needs a name that's not "Iron Curtain Workshop" — something generic and memorable. This matters more than it seems: adoption requires identity.

5. **How much should the first version assume about content type?** Fully generic (just "packages with metadata") vs. creative/game-aware (built-in concepts like "mod", "asset pack", "map"). The library-first approach suggests: generic core with domain-specific extensions.

6. **Integration with existing registries.** Could the platform serve as a P2P distribution layer in front of existing registries (Modrinth, Hugging Face, npm)? A `remote` repository that proxies and caches from an existing API, then serves via P2P, would be immediately useful.

7. **Relationship with mod.io.** Could IC's Workshop client library serve as an open-source alternative to mod.io's proprietary SDK? mod.io has proven the "embeddable UGC middleware" market exists (332 games, $30M+ funding). An open-source, self-hostable, P2P-enabled alternative to mod.io's SDK would be valuable beyond IC. Alternatively, IC could offer a mod.io `remote` repository adapter — proxying mod.io content into IC's federated view — for games where mod.io is the existing community standard.

8. **C&C community distribution channels.** The C&C modding community currently uses ModDB, game-specific forums, GitHub releases, and Discord. Not primarily Nexus Mods or Steam Workshop. IC's Workshop should integrate with where the community _already_ publishes, not assume a greenfield.

## Lessons Applied to IC Workshop — Cross-Platform Synthesis

This section synthesizes actionable design improvements for IC's Workshop (D030/D049) drawn from all platforms studied. Each lesson names its source, describes the pattern, and explains how IC adapts it.

### P2P Engine Design (from Kraken + Dragonfly + IPFS + Blizzard)

| Lesson                                      | Source                                                                    | IC Adaptation                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pluggable peer selection policy**         | Kraken `assignmentPolicy` interface                                       | IC's tracker returns a sorted peer list using a configurable policy. Default: prefer seeders → lobby peers → geographically close → random. Plugin interface allows community-contributed policies.                                                                                                                             |
| **Rarest-first piece selection**            | Kraken `rarestFirstPolicy`, standard BitTorrent                           | IC defaults to rarest-first. Random selection available as fallback for low-peer-count scenarios where rarest-first degenerates.                                                                                                                                                                                                |
| **Endgame mode**                            | Kraken `EndgameThreshold`                                                 | When remaining pieces ≤ threshold (default: 5), IC sends duplicate piece requests to multiple peers. Prevents "last piece" stalls.                                                                                                                                                                                              |
| **Bandwidth limiting per client**           | Kraken `egress_bits_per_sec` / `ingress_bits_per_sec`, IPFS #3065         | IC exposes `max_upload_speed` and `max_download_speed` in `settings.toml`. Default upload: 1 MB/s. Default download: unlimited. IPFS's 9-year-unresolved bandwidth issue (#3065, 73 👍) proves this must ship from day one.                                                                                                      |
| **Connection count limiting**               | IPFS #3320 ("Don't Kill Routers" milestone)                               | Cap concurrent P2P connections (default: 50, configurable). IPFS's router-killing problem (NAT table overflow from excessive connections) is a cautionary tale. Lobby peers (high-value) get priority slots; background discovery gets the rest.                                                                                |
| **Connection state machine**                | Kraken `connstate` (pending/active/blacklisted)                           | IC adopts the same state machine. Adds ISP-throttling detection: if a peer produces zero useful throughput over 30s, temporarily blacklist (5min cooldown).                                                                                                                                                                     |
| **Size-based piece length**                 | Kraken `PieceLengths` config                                              | IC uses: <5MB → HTTP-only (no pieces), 5–50MB → 256KB pieces, 50–500MB → 1MB pieces, >500MB → 4MB pieces. Configurable in `settings.toml`.                                                                                                                                                                                      |
| **Health checks for seed infrastructure**   | Kraken active (origin-to-origin) + passive (tracker-observed)             | IC's seed boxes implement heartbeat health checks (30s interval, 3 failures → unhealthy). Tracker marks peers offline after 2× announce interval without contact.                                                                                                                                                               |
| **Content lifecycle (TTI/TTL)**             | Kraken `seeder_tti: 5m`, disk TTI: 6h                                     | IC keeps downloaded packages in seeding pool for 30min after game exit (longer than Kraken's 5min — fewer IC peers, each more valuable). Disk cache: configurable max (default 2GB), LRU eviction.                                                                                                                              |
| **Simulation tools for P2P testing**        | Kraken Python simulation scripts                                          | IC should include CLI tools (`ic workshop simulate`) that model P2P distribution under various peer counts, bandwidth limits, and churn rates. Validates Workshop behavior before deployment.                                                                                                                                   |
| **Intelligent scheduling (centralized)**    | Dragonfly Scheduler                                                       | Deferred. Dragonfly's centralized piece assignment is more sophisticated than BitTorrent but requires a more complex tracker. If IC's Workshop ever handles 10K+ concurrent downloaders for a single resource, Dragonfly's approach provides a proven upgrade path.                                                             |
| **Multi-dimensional peer scoring**          | Dragonfly evaluator: `Load(0.6) + IDC(0.2) + Loc(0.1) + Type(0.1)`        | IC evolves from linear priority tiers to weighted scoring. Default weights: `Capacity(0.4) + Locality(0.3) + SeedStatus(0.2) + LobbyContext(0.1)`. Capacity = spare bandwidth reported in announce. Locality = hierarchical location match. SeedStatus = seed box > seeder > leecher. LobbyContext = same-lobby bonus.          |
| **Hierarchical location affinity**          | Dragonfly `"country\|province\|city\|zone"` prefix matching               | IC adopts 4-level `continent\|country\|region\|city` location strings. Score = `matched_prefix / 4`. Client self-reports (from IP geolocation or user config). Improves peer selection in geographically diverse swarms without complex GeoIP infrastructure.                                                                   |
| **Statistical bad-peer detection**          | Dragonfly three-sigma rule (<2000: 20×mean, ≥2000: mean+3σ)               | IC tracks per-peer piece transfer times. Peers whose last transfer exceeds `max(3 × mean, 2 × p95)` are demoted in scoring (not hard-blacklisted). Replaces binary 30s timeout for degradation detection. Hard blacklist reserved for zero-throughput (complete failure).                                                       |
| **EWMA peer scoring (time-decaying)**       | IPFS Bitswap ScoreLedger (boxo)                                           | Complement Dragonfly's statistical detection with EWMA reputation tracking: separate short-term and long-term decay rates, score peers by `(shortScore + longScore) × (recv_ratio × 0.5 + 0.75)`. Time-decaying reputation is more robust than instantaneous snapshots — a peer that was bad 10 minutes ago may have recovered. |
| **Per-peer fairness cap**                   | IPFS `MaxOutstandingBytesPerPeer` (default 1MB)                           | Cap queued data per peer. Configurable: 250KB (very fair, slower) to 10MB (less fair, faster). Prevents a single greedy peer from monopolizing upload bandwidth. Direct adoption from IPFS.                                                                                                                                     |
| **Want-Have / Want-Block two-phase**        | IPFS Bitswap v1.2.0 protocol                                              | Lightweight peer probing: ask connected peers "do you have piece X?" before requesting transfer. Reduces wasted bandwidth when peers don't have the requested piece. Maps to BitTorrent HAVE messages but with explicit "I don't have it" (DontHave) responses — eliminates timeout-based negative detection.                   |
| **Skip-HAVE for tiny data**                 | IPFS `WantHaveReplaceSize` (default 1024 bytes)                           | For small data (<4KB, e.g., manifest metadata, piece maps), skip the "do you have it?" probe and send directly. Saves a round-trip. Application: embed small metadata in announce responses rather than requiring a separate transfer.                                                                                          |
| **Broadcast control (target useful peers)** | IPFS Kubo v0.36+ broadcast limiter                                        | Don't spray want-messages to all peers. Prefer peers who previously had blocks we wanted (`SendToPendingPeers`). Reserve slots for local peers and explicit peered nodes. Reduces broadcast noise in large swarms.                                                                                                              |
| **Dual discovery (WAN/LAN)**                | IPFS Dual DHT (WAN + LAN via mDNS)                                        | Separate local and wide-area peer discovery. LAN: multicast discovery (fast, no internet, zero-config). WAN: tracker/registry queries. LAN party mode auto-discovers same-network peers without tracker involvement. IPFS validates this dual-discovery concept at scale.                                                       |
| **Delegated routing via HTTP**              | IPFS Delegated HTTP Routing (`/routing/v1/`)                              | IC's registry server IS a delegated router. Client asks registry "who has package X?" over HTTP; registry responds with peer list. Standardized RESTful interface. IPFS proved this pattern works — lightweight clients can skip P2P routing entirely and query an HTTP endpoint.                                               |
| **Server/Client mode separation**           | IPFS `Bitswap.ServerEnabled` flag                                         | Allow download-only nodes. Mobile players, metered connections, and bandwidth-constrained users can disable upload participation. Upload is encouraged (via lobby P2P benefit) but never forced.                                                                                                                                |
| **PeerTagger (protect useful connections)** | IPFS Bitswap PeerTagger + connection manager                              | Integrate peer scoring with connection management. High-scoring peers get "protected" connections that survive connection pruning under resource pressure. Ensures the most productive peers remain connected even when the connection budget is tight.                                                                         |
| **Batch provider announcements**            | IPFS Sweep Provider (Kubo v0.39+), 97% reduction for 100K CIDs            | IC seed boxes serving large catalogs batch tracker announces by region/shard rather than individually. Groups packages assigned to the same tracker shard into single announcements. Relevant when seed boxes serve 1000+ packages.                                                                                             |
| **Capacity-aware peer selection**           | Dragonfly LoadQuality (bandwidth headroom + sustained load + concurrency) | IC peers report current upload utilization in announce (`upload_bw_used / upload_bw_max`). Tracker prefers peers with more spare capacity. Simpler than Dragonfly's 3-metric LoadQuality but captures the core insight: "can this peer serve right now?"                                                                        |
| **Persistent replica count**                | Dragonfly `PersistentReplicaCount`                                        | IC Workshop server (Phase 5+) tracks how many seed boxes hold each popular resource. If count drops below threshold (default: 2), triggers re-seeding from HTTP origin. Ensures the "always available" guarantee without relying on ephemeral peers.                                                                            |
| **Download priority tiers**                 | Dragonfly 7-level priority system (Level0–Level6)                         | IC uses 3 tiers: `lobby-urgent` (blocking gameplay — highest), `user-requested` (manual Workshop download), `background` (cache warming, auto-updates, subscribed mod pre-download). lobby-urgent preempts background downloads.                                                                                                |
| **Preheat/prefetch for predictable demand** | Dragonfly preheat jobs (pre-warm content on seed peers)                   | When lobby host sets required mods, IC server pre-seeds those mods to seed boxes before players join. Predictable demand pattern — lobby creation is the prefetch signal. Also: auto-subscribe to Workshop resources for background pre-download.                                                                               |
| **Runtime config refresh**                  | Dragonfly Scheduler ← Manager periodic config sync                        | IC Workshop server supports runtime config changes (rate limits, peer limits, moderation rules) via SIGHUP or admin API. No restart required. Important for self-hosters managing live deployments.                                                                                                                             |
| **CDN + P2P hybrid delivery**               | Blizzard NGDP/Agent, IPFS HTTP retrieval fallback                         | IC's HTTP fallback + P2P preferred strategy is an implicit hybrid. IPFS's addition of Bitswap-over-HTTP validates dual-transport. For Phase 5+, IC could add CDN origin integration — seed boxes behind Cloudflare/R2 provide the "CDN" layer that fills the swarm initially, then P2P takes over.                              |

### Registry & Discovery UX (from mod.io + Modrinth + Nexus)

| Lesson                                     | Source                                                | IC Adaptation                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **In-game mod browsing as first-class UX** | mod.io embeddable SDK, white-label UI components      | IC's in-game Workshop browser is the primary interface. Not a web redirect, not an external app. The browser works against any backend (git-index in Phase 0–3, full server in Phase 5+). mod.io proved this UX matters — 332 games adopted it.                                                               |
| **Per-platform targeted releases**         | mod.io per-platform moderation and release control    | IC resources can declare `platforms: [windows, linux, macos, wasm]` in manifest.yaml. Workshop server validates platform compat on install. Not Phase 0, but the manifest schema should accommodate it from day one.                                                                                          |
| **Moderation rules engine**                | mod.io automated moderation with rules engine         | IC's Workshop server (Phase 5+) should support configurable moderation rules: auto-hold resources from new publishers, flag resources over size threshold, auto-approve updates from trusted publishers. Rules defined in YAML server config, not hardcoded.                                                  |
| **Search UX**                              | Modrinth faceted search, filtering, category taxonomy | IC's Workshop browser provides: full-text search (FTS5), filter by category/game-module/license/platform, sort by relevance/date/popularity/rating. Phase 0–3: client-side filter over cached index. Phase 5+: server-side FTS5. Modrinth's UX is the quality bar.                                            |
| **Collections as curated bundles**         | Nexus Mods Collections, Modrinth modpacks             | IC supports both Modpacks (strict: pinned versions, load order, tested compatibility) and Collections (loose: curated lists, recommended versions). Collections are first-class Workshop resource type — not just a web feature. Publishable, versionable, installable via `ic mod install`.                  |
| **Creator profiles with attribution**      | Nexus Mods Donation Points, mod.io creator tools      | Publisher profiles (Phase 5+) show: all published resources, download counts, community ratings, account age, tip links (D035). No payment processing — links to Ko-fi/Patreon/GitHub Sponsors only. Nexus's Donation Points and mod.io's creator tools prove creators care about attribution and visibility. |
| **Download count / popularity signals**    | Nexus, mod.io, Modrinth — all surface popularity      | Phase 5+ Workshop server tracks download counts, weekly trending, "hot this week." Critical for discovery in a growing catalog. Phase 0–3: no server-side tracking, deferred.                                                                                                                                 |

### Moderation & Trust (from mod.io + Nexus + CurseForge)

| Lesson                           | Source                                               | IC Adaptation                                                                                                                                                                                                                                                                    |
| -------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Publisher verification tiers** | mod.io verified publishers, Nexus trusted authors    | IC publishers progress through trust tiers: Unverified → Verified (email confirmed) → Trusted (N successful publishes, no violations) → Featured (editor's pick). Tier affects auto-approval rules and UI placement.                                                             |
| **Automated content scanning**   | mod.io four-level content checks                     | Phase 5+ Workshop server scans uploads: file format validation, SHA-256 integrity, manifest schema compliance, size limits. No automated "content moderation" of creative work — that's policy, not engineering. But structural validation catches malformed/malicious packages. |
| **Community reporting workflow** | Nexus, mod.io, CurseForge all have report flows      | IC's Workshop server (Phase 5+) supports: report button on every resource, report categories (license violation, malware, DMCA, inappropriate), moderator review queue, publisher notification, appeal process. DMCA with due process per D030.                                  |
| **Ownership change protection**  | CurseForge (Overwolf ownership → community friction) | IC's Workshop is open source. The server binary, client library, protocol, and index format are all open. If the "official" IC Workshop server changes policy, the community can fork and self-host with zero architecture change. This is the ultimate ownership protection.    |

### CI/CD & Developer Experience (from Artifactory + Homebrew + crates.io)

| Lesson                                 | Source                                        | IC Adaptation                                                                                                                                                                                                                                                                 |
| -------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scoped API tokens for publishing**   | Artifactory, npm                              | IC's `ic auth` flow generates scoped tokens: `publish` (upload new versions), `admin` (manage publisher settings), `readonly` (browse/download). Tokens stored in `~/.ic/credentials.yaml`. No password-in-command-line.                                                      |
| **CI/CD-friendly publishing**          | Artifactory CI/CD integration, GitHub Actions | `ic mod publish` works in CI environments: reads credentials from environment variables (`IC_AUTH_TOKEN`), supports `--non-interactive` flag, returns structured JSON output for pipeline parsing. GitHub Actions template provided.                                          |
| **Lockfile for reproducible installs** | Cargo `Cargo.lock`, npm `package-lock.json`   | Already designed: `ic.lock` records exact versions + SHA-256 per dependency. CI builds use `ic mod install --locked` (fail if lockfile doesn't match). Lockfile checked into version control.                                                                                 |
| **Sparse index fetch**                 | crates.io sparse HTTP index                   | Phase 5+ optimization. Instead of fetching the entire `index.yaml` (which grows with catalog size), the client fetches only manifests for requested/updated packages via HTTP range requests or per-publisher index files. crates.io proved this scales beyond 150K packages. |

### Community & Ecosystem (from ModDB + GameBanana + Steam Workshop)

| Lesson                                        | Source                                               | IC Adaptation                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lobby auto-download as the killer feature** | Steam Workshop, CS:GO                                | Lobby auto-download is IC's #1 Workshop feature. When a player joins a lobby with missing mods, download starts immediately — P2P from lobby peers (fastest) → swarm → HTTP fallback. No "go to the web portal and download manually." This single feature eliminates the #1 friction point in every modding community studied. Hard Phase 5 requirement. |
| **Bridge existing communities**               | ModDB (C&C community home), GameBanana (Source mods) | IC's `remote` repository type can proxy content from existing platforms. Priority: ModDB (where C&C mods live) → GitHub Releases (where OpenRA mods live). Full API adapters are Phase 6+ — but the architecture supports them from day one.                                                                                                              |
| **Editorial/featured content**                | ModDB Mod of the Year, GameBanana featured section   | Phase 5+ Workshop server supports: staff picks, Mod of the Week, seasonal highlights. Manual curation for quality signal on top of algorithmic sorting. Competitive map pool curation (D037) is a specialized form of this.                                                                                                                               |
| **Offline/LAN bundles**                       | LAN party use case (all platforms fail at this)      | `ic workshop export-bundle` creates a portable archive of selected resources. `ic workshop import-bundle` loads into local repository. Works fully offline. None of the commercial platforms support this — it's a genuine differentiator for the C&C LAN party community.                                                                                |

### Anti-Patterns to Avoid (from competitive research)

| Anti-Pattern                           | Source                              | Why IC Avoids It                                                                                                                                                             |
| -------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Throttled downloads for free users** | Nexus Mods (premium for full speed) | IC's P2P removes the incentive for throttling. No CDN costs to recoup. Everyone gets full speed.                                                                             |
| **Mandatory overlay/launcher**         | CurseForge (Overwolf overlay)       | No overlay. The Workshop is integrated directly into the game engine. No separate app required.                                                                              |
| **Paid UGC marketplace**               | mod.io UGC Monetization Solutions   | IC follows D035: no mandatory paywalls on mods. Voluntary tip links only. Paid UGC creates perverse incentives (mod authors competing for money, fragmenting the community). |
| **Platform lock-in**                   | Steam Workshop (Steam-only games)   | IC's Workshop works on all platforms: Windows, macOS, Linux, WASM, mobile. Steam Workshop integration is additive (an additional `steam` source type), never required.       |
| **External mod manager required**      | Nexus Mods (Vortex)                 | No external tool. The in-game browser and `ic` CLI handle everything. Vortex exists because Nexus has no in-game integration — IC does.                                      |
| **Single-operator centralization**     | All commercial platforms            | IC's federation model means no single operator. Official server + community servers + git-index all coexist. If the official server disappears, the community continues.     |

## Netcode ↔ Workshop Cross-Pollination

IC's netcode infrastructure (`03-NETCODE.md`) and Workshop infrastructure (D030/D049/D050) were designed independently but share deep structural parallels. Both are internet-facing server-client systems with federation, heartbeats, peer management, security hardening, and community self-hosting. This section catalogs concrete patterns that transfer between the two systems.

### Independently Parallel Designs

These patterns were designed separately in both systems but are essentially the same concept:

| Pattern                      | Netcode                                                                                                                | Workshop                                                                                                                   | Observation                                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Directory service**        | `TrackingServer` trait: `publish()`, `update()`, `unpublish()`, `browse()`. Lists active game lobbies                  | Workshop server: `publish()`, `search()`, `resolve()`. Lists available packages                                            | Both are "what's available?" services. Structurally identical: stateless REST API, ephemeral or persistent listings, federation across multiple instances      |
| **Heartbeat / TTL expiry**   | Tracking server: 30-second heartbeat, listings expire after TTL                                                        | BitTorrent tracker: announce every 30s, peers expire after 2× announce interval                                            | Same mechanism, same default interval (30s). Share the implementation                                                                                          |
| **Federation**               | `tracking_servers:` list in settings — client aggregates game listings from multiple tracking servers                  | `sources:` list in settings — client aggregates package listings from multiple Workshop sources (remote, git-index, local) | Same principle: no single source of truth, client merges from multiple authorities. Should share the aggregation logic (multi-source merge with deduplication) |
| **Connection state machine** | Peer states: connecting → active → disconnected (with reconnection via snapshot transfer)                              | P2P peer states: pending → active → blacklisted (with 5min cooldown → re-eligible)                                         | Nearly identical FSMs. Netcode adds reconnection; Workshop adds cooldown-based rehabilitation. Both should consider adopting the other's extension             |
| **Deployment model**         | "Just a binary." 5-min setup. SQLite or in-memory. Docker optional, Helm for k8s. Community self-hosting first-class   | Same: standalone Rust binary, embedded storage, Docker/Helm, community self-hosting                                        | 7 backend design principles from `03-NETCODE.md` apply verbatim to Workshop. Should be stated as shared principles, not designed independently                 |
| **Observability**            | OTEL metrics: `relay.*`, `tracking.*`. `/healthz`, `/readyz`, `/metrics`. Pre-built Grafana dashboards                 | OTEL metrics: `workshop.*`. Same endpoints. Same dashboards                                                                | Unified naming convention across all IC backend services enables a single Grafana template for all three server types                                          |
| **Graceful degradation**     | Tracking server down → join codes → direct IP. Relay down → P2P lockstep. Each failure has a documented fallback       | Workshop server down → git-index. P2P unavailable → HTTP fallback. Each failure has a documented fallback                  | Same resilience philosophy. Should share a unified "failure modes" table across all backend services                                                           |
| **Bandwidth/rate control**   | Three-layer: `OrderBudget` (time-budget pool) + token bucket bandwidth throttle + hard cap (`ProtocolLimits`)          | `max_upload_speed`, `max_download_speed`, `MaxOutstandingBytesPerPeer` cap                                                 | Netcode's three-layer model is more sophisticated. Workshop should adopt the same layered structure (see "Netcode → Workshop" below)                           |
| **Ed25519 signing**          | Per-order signing with ephemeral session keys (P2P). Relay stamps authenticated sender slot. Replay hash chains signed | SHA-256 checksums in manifest. Publisher identity via API tokens. No manifest-level signature yet                          | Netcode's signing infrastructure is more mature. Workshop should adopt Ed25519 manifest signing using the same key management code (see below)                 |

### Patterns from Netcode → Workshop

These patterns are well-designed in the netcode and should be adopted by the Workshop:

**1. Three-layer rate control for Workshop APIs**

The netcode's `OrderBudget` (Minetest `LagPool` pattern) + bandwidth throttle + hard cap is more sophisticated than the Workshop's current flat `max_upload_speed` / `max_download_speed` configuration. The Workshop should adopt the same layered model for its publish/download APIs:

- **Layer 1 — Per-peer request budget (time-budget pool):** Each P2P peer gets a token pool that refills at a fixed rate. Sending a piece request costs tokens. Pool empty → requests queued, not dropped. This is more nuanced than `MaxOutstandingBytesPerPeer` alone — it naturally throttles fast peers without penalizing slow ones
- **Layer 2 — Aggregate bandwidth throttle:** Token bucket across all peers combined. Prevents total bandwidth consumption from exceeding configured limits even when individual peers are within budget
- **Layer 3 — Hard cap on concurrent transfers:** Maximum simultaneous piece transfers (default: 50 connections, from IPFS router-protection lesson). Absolute safety net

The Workshop currently has layers 2 and 3 (bandwidth limits + connection cap) but lacks layer 1 (per-peer fairness budget). The per-peer fairness cap (`MaxOutstandingBytesPerPeer`) approximates this but doesn't have the time-budget self-refilling property.

**2. Token-based liveness for P2P peers**

The netcode relay embeds a random nonce in FRAME packets; the client must echo it to prove it's actually processing data (not just TCP-alive but frozen — OpenTTD pattern). Workshop P2P peers currently detect liveness only via heartbeat timeouts (announce interval × 2).

Apply to Workshop: embed a nonce in piece delivery packets; the receiving peer must echo it in its next piece request. A peer that's "TCP-alive but not transferring" (connection open, no useful work) gets detected in one round-trip rather than waiting for the full 60-second announce timeout. This tightens the feedback loop for the statistical bad-peer detection already designed (three-sigma rule).

**3. Half-open connection defense for Workshop tracker**

The netcode relay inhibits retransmission to unverified clients until they prove liveness, preventing UDP amplification attacks (Minetest pattern). The Workshop's BitTorrent tracker is equally internet-facing and equally vulnerable. Any UDP-based announce endpoint should implement the same defense: new connections get a challenge; only proven-alive peers get full service. This is standard for BitTorrent trackers (BEP-15 connection IDs) but should be explicitly documented as sharing the netcode's pattern.

**4. Frame resilience → piece transfer resilience**

Netcode: three-state `FrameReadiness` (Ready / Waiting / Corrupted) with directed resend for corrupted data. When a frame arrives corrupted, the relay requests retransmission from the specific sender.

Workshop: BitTorrent already has piece hashing (SHA-256), but a failed hash check typically means "discard and re-request from any peer." Adopting the netcode's directed-resend pattern: if a piece arrives from peer A and fails hash verification, re-request specifically from peer A (they may have a transient error). If it fails again, mark peer A as suspect (feeds into the statistical bad-peer detection) and try a different peer. This is more data-efficient than immediately switching peers on first failure.

**5. Network simulation tools**

The netcode references Generals' debug network simulation tools and `NetworkSimConfig` (simulated latency, packet loss, jitter). The Workshop already has a placeholder for `ic workshop simulate` (from the Kraken lessons). These should share a common network simulation framework — one tool that can simulate both game networking degradation and P2P transfer degradation. A single `ic simulate` command with subcommands:

```
ic simulate network --latency 200ms --loss 5%        # game netcode simulation
ic simulate workshop --peers 20 --bandwidth 1mbps    # P2P distribution simulation
ic simulate combined --game 4p --mod-size 50mb        # end-to-end: lobby join with auto-download
```

**6. Ed25519 signing for Workshop manifests**

The netcode signs orders (ephemeral session keys) and replays (hash chains). Workshop packages have SHA-256 integrity but no publisher-level cryptographic identity. Apply the same Ed25519 infrastructure:

- Publisher identity is an Ed25519 keypair (not just an API token)
- `manifest.yaml` includes a publisher signature field
- Client verifies: "this manifest was signed by the publisher who claims to own this package"
- API tokens are derived from/authorized by the publisher key (scoped delegation)
- Key management code shared between netcode (session keys) and Workshop (publisher keys)

This addresses the supply-chain attack surface more robustly than API tokens alone (lesson from fractureiser). A compromised API token can be revoked and reissued; a compromised signing key requires a key rotation ceremony — but the damage from a compromised signing key is auditable (every published version has a signature, so you can identify exactly which versions were signed by the attacker).

### Patterns from Workshop → Netcode

These patterns were developed for Workshop P2P (often adopted from IPFS/Dragonfly/Kraken research) and should inform netcode design:

**1. EWMA time-decaying reputation → relay player quality scoring**

Workshop: EWMA (Exponentially Weighted Moving Average) with short-term and long-term decay rates for peer reputation scoring (from IPFS Bitswap ScoreLedger).

Netcode: The relay server tracks `relay.player.suspicion_score` for botting detection, and the strikes system tracks late delivery. But neither uses time-decaying reputation — a player who had a bad connection yesterday gets the same treatment as one who's bad right now.

Apply EWMA scoring to relay-side player connection quality: track RTT variance, missed-deadline frequency, and desync frequency as time-decaying reputations. Benefits:
- A player who had temporary network issues 30 minutes ago isn't treated as "chronically bad"
- Persistent bad actors accumulate score across sessions (stored in relay's SQLite, D034)
- The relay can make smarter decisions: assign stricter deadlines to low-reputation players, grant more lenient deadlines to high-reputation ones
- The same scoring code is already being built for Workshop — reuse it

**2. Multi-dimensional weighted scoring → relay server selection**

Workshop: `Capacity(0.4) + Locality(0.3) + SeedStatus(0.2) + ApplicationContext(0.1)` — a multi-dimensional weighted formula for selecting which peer to request pieces from.

Netcode: Currently "connect to nearest relay" for relay selection. With multiple relays available (as the server ecosystem grows), simple "nearest" is suboptimal — a slightly loaded near relay may be worse than a lightly loaded slightly farther relay.

Apply multi-dimensional scoring to relay selection: `Latency(0.5) + Load(0.3) + Region(0.2)`. The relay publishes its current load in its tracking server listing (or via a `/status` endpoint). The client scores available relays and connects to the highest-scoring one, not just the geographically nearest. The same weighted-scoring infrastructure built for Workshop peer selection is directly reusable.

**3. Hierarchical location affinity → relay/tracking region model**

Workshop: 4-level `continent|country|region|city` location hierarchy (from Dragonfly). Score = matched prefix depth / 4.

Netcode: Relay regions are flat strings (`eu-west`, `us-east`, `ap-southeast`). Tracking server shows relay region as a single tag.

Adopt the same 4-level hierarchy for relay/tracking infrastructure:
- Relay servers self-report their location hierarchy
- Tracking server listings include hierarchical location, not just flat region labels
- Spectators/observers (lower priority than players) can be routed to slightly farther relays with capacity, using the hierarchical similarity score
- The same `LocationAffinity` scoring function used for Workshop peer selection works for relay selection

**4. Priority-ordered federation → tracking server aggregation**

Workshop: `sources:` with priority ordering — when the same package appears in multiple sources, highest-priority source wins.

Tracking server: `tracking_servers:` list with no priority ordering — just a flat list. If the same game listing appears on multiple tracking servers (e.g., because a community server mirrors the official one), there's no tiebreaking rule.

Add priority ordering to tracking server aggregation: official tracking server = priority 1, community = priority 2, tournament-specific = priority 0 (highest). When the same game listing appears on multiple trackers, apply the same deduplication logic as Workshop's virtual repository merge: highest-priority source wins, with a configurable strategy (priority vs. merge vs. first-seen).

**5. Day-one resource limiting (IPFS #3065 lesson)**

Workshop learned from IPFS's 9-year-unresolved bandwidth limiting issue (#3065, 73 👍): resource limiting that isn't shipped at launch becomes a permanent technical debt.

Netcode: The relay server has rate limiting for orders (three-layer system) but no explicit per-session CPU/memory limits. If a game session with 8 players and 3000 units generates extremely high order volume, the relay's CPU usage for validation/routing could spike.

Apply the same day-one principle: relay server should ship with configurable per-session resource limits (max memory per game session, max CPU time per tick of order routing). These can be generous defaults (most games will never hit them), but having the knobs from day one prevents a "resource contention under load" issue from becoming a 9-year TODO.

### Shared Infrastructure Opportunities

Beyond pattern transfer, these are opportunities to share actual code or binaries:

**1. Unified server binary**

Currently three separate binaries are planned: tracking-server, relay-server, workshop-server. All are lightweight Rust services. For community self-hosters (a first-class use case), running three separate processes is operational overhead.

Consider a unified `ic-server` binary:
```
ic-server tracking    # run tracking server only
ic-server relay       # run relay server only
ic-server workshop    # run BitTorrent tracker + Workshop API only
ic-server all         # run all services in one process
```

A small community operator runs `ic-server all` on a $5/month VPS and gets game discovery, multiplayer relay, and mod distribution in a single process. Larger deployments run them separately for scaling. This follows the "just a binary" principle to its logical conclusion. Each mode shares: OTEL setup, config loading (`settings.toml`), health endpoints, SQLite management, graceful shutdown.

**2. Shared federation library**

Both tracking server aggregation and Workshop source resolution perform multi-source federation: query multiple servers, merge results, deduplicate, handle partial failures. The logic is generic:

```rust
/// Shared multi-source federation logic.
/// Used by tracking server aggregation AND Workshop source resolution.
trait FederatedSource<T: Identifiable + Prioritized> {
    async fn query(&self) -> Result<Vec<T>>;
    fn priority(&self) -> u8;
}

fn federated_merge<T>(sources: &[impl FederatedSource<T>]) -> Vec<T> {
    // Query all sources (parallel, with timeout per source)
    // Deduplicate by identity (T::id())
    // On conflict, highest priority wins
    // Return merged results
}
```

This belongs in the Workshop core library (D050) since it's already positioned as game-agnostic infrastructure. Both the tracking server and Workshop server import and use it. This eliminates separately-maintained merge logic in both systems.

**3. Shared auth/identity layer**

Netcode: Ed25519 session keys for order signing. Workshop: API tokens for publishing (with Ed25519 manifest signing proposed above).

Unify: a player has one Ed25519 identity keypair. From this, they derive:
- **Session keys** for multiplayer (ephemeral, per-game)
- **Publishing authority** for Workshop (long-lived, scoped tokens delegated from the main key)
- **Profile identity** for rankings, achievements, reputation

One key, multiple scopes, one management interface. Reduces complexity for players (one key to backup/manage) and for the codebase (one key management library). The Workshop core library (D050) provides the identity primitives; game-specific integrations add scoped delegation.

**4. Shared peer/player scoring infrastructure**

Workshop needs multi-dimensional EWMA scoring for P2P peers. Netcode needs EWMA scoring for player connection quality and relay selection. Matchmaking needs player skill scoring (Glicko-2 — different algorithm, but same infrastructure for time-decaying scores stored in SQLite).

Extract a generic scoring library:
```rust
/// Time-decaying weighted score with configurable dimensions.
struct PeerScore<const N: usize> {
    dimensions: [EwmaValue; N],
    weights: [f32; N],            // f32 OK — scoring is presentation, not sim
    last_update: Instant,
}
```

Workshop, relay, and matchmaking all import the same scoring primitives with different dimension definitions and weights. The EWMA math, time decay, and SQLite persistence logic is written once.

### Summary

The netcode and Workshop designs share far more infrastructure DNA than their independent origins would suggest. The most impactful actions are:

1. **State shared deployment principles explicitly** — the 7 backend principles from `03-NETCODE.md` apply to all IC server-side components, including Workshop
2. **Adopt three-layer rate control for Workshop** — direct pattern transfer from netcode, improves on Workshop's current flat rate limiting
3. **Adopt EWMA scoring for relay player quality** — direct pattern transfer from Workshop research, improves on netcode's binary strikes model
4. **Unify server binary** — `ic-server all` for small community operators, separate processes for large deployments
5. **Share the federation library** — both systems merge from multiple sources; write the logic once (fits naturally in D050's core library)
6. **Share auth/identity** — one Ed25519 keypair per player, scoped for multiplayer + publishing + profile
7. **Token-based liveness for P2P peers** — netcode pattern adapted for Workshop, tightens bad-peer detection loop
8. **Ed25519 manifest signing** — netcode signing infrastructure adapted for Workshop supply-chain security

## Conclusion

The P2P federated resource registry is a distinct and underserved architectural pattern. IC's Workshop design is the most comprehensive open-source attempt at this combination. With confirmed plans for multiple consuming projects (XCOM-inspired tactics, Civilization-inspired 4X, OFP/ArmA-inspired military sim — see D050), the architecture MUST be game-agnostic from day one:

1. **Cleaner code** — no game-specific assumptions in the registry/distribution layer
2. **Better testing** — the platform can be tested in isolation without game engine dependencies
3. **Amortized investment** — the significant Workshop engineering effort serves 4+ game projects, not one
4. **Validation** — if the architecture works across RTS, tactics, 4X, and military sim, it's a proven design
5. **Engine diversity** — future projects may not use Bevy, so the core library must have zero engine dependency

**Recommendation:** Design the Workshop core as a game-agnostic, engine-agnostic Rust library from IC Phase 3. Maintain clear boundaries between platform core (registry, distribution, federation) and per-project integration (engine plugin, auto-download triggers, format recommendations, manifest extension fields). Extract to standalone repo when the second game project begins (likely IC Phase 5–6). See D050 in `09-DECISIONS.md` for the full two-layer architecture definition.
