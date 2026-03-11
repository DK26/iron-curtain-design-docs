# Modding System  Workshop (Federated Resource Registry, P2P Distribution, Moderation)

Full design for the Workshop content distribution platform: federated repository architecture, P2P delivery, resource registry with semver dependencies, licensing, moderation, LLM-driven discovery, Steam integration, modpacks, and Workshop API. Decisions D030, D035, D036, D049.

### Configurable Workshop Server

The Workshop is the single place players go to **browse, install, and share** game content — mods, maps, music, sprites, voice packs, everything. Behind the scenes it's a federated resource registry (D030) that merges multiple repository sources into one seamless view. Players never need to know where content is hosted — they just see "Workshop" and hit install.

> **Workshop Ubiquitous Language (DDD)**
>
> The Workshop bounded context uses the following vocabulary consistently across design docs, Rust structs, YAML keys, CLI commands, and player-facing UI. These are the domain terms — implementation pattern origins (Artifactory, npm, crates.io) are referenced for context but are not the vocabulary.
>
> | Domain Term | Rust Type (planned) | Definition |
> |---|---|---|
> | **Resource** | `ResourcePackage` | Any publishable unit: mod, map, music track, sprite pack, voice pack, template, balance preset. The atomic unit of the Workshop. |
> | **Publisher** | `Publisher` | The identity (person or organization) that publishes resources. The `alice/` prefix in `alice/soviet-march-music@1.2.0`. Owns the name, controls releases. |
> | **Repository** | `Repository` | A storage location for resources. Types: Local, Remote, Git Index. |
> | **Workshop** | `Workshop` (aggregate root) | The virtual merged view across all repositories. What players browse. What the `ic` CLI queries. The bounded context itself. |
> | **Manifest** | `ResourceManifest` | The metadata file (`manifest.yaml`) describing a resource: name, version, dependencies, checksums, license. |
> | **Package** | `.icpkg` | The distributable archive (ZIP with manifest). The physical artifact. |
> | **Collection** | `Collection` | A curated set of resources (modpack, map pool, theme bundle). |
> | **Dependency** | `Dependency` | A declared requirement on another resource, with semver range. |
> | **Channel** | `Channel` | Maturity stage: `dev`, `beta`, `release`. Controls visibility. |
>
> *Player-facing UI may use friendlier synonyms ("content", "creator", "install") but the code, config files, and design docs use the terms above.*

The technical architecture is inspired by JFrog Artifactory's federated repository model — multiple sources aggregated into a single view with priority-based deduplication. This gives us the power of npm/crates.io-style package management with a UX that feels like Steam Workshop to players.

#### Repository Types

The Workshop aggregates resources from multiple repository types (architecture inspired by Artifactory's local/remote/virtual model). Configure sources in `settings.toml` — or just use the default (which works out of the box):

| Source Type   | Description                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local**     | A directory on disk following Workshop structure. Stores resources you create. Used for development, LAN parties, offline play, pre-publish testing.                                                                            |
| **Git Index** | A git-hosted package index (Phase 0–3 default). Contains YAML manifests describing resources and download URLs — no asset files. Engine fetches `index.yaml` via HTTP or clones the repo. See D049 for full specification.      |
| **Remote**    | A Workshop server (official or community-hosted). Resources are downloaded and cached locally on first access. Cache is used for subsequent requests — works offline after first pull.                                          |
| **Virtual**   | The merged view across all configured sources — this is what players see as "the Workshop". Merges all local + remote + git-index sources, deduplicates by resource ID, and resolves version conflicts using priority ordering. |

```toml
# settings.toml — Phase 0-3 (before Workshop server exists)
[[workshop.sources]]
url = "https://github.com/iron-curtain/workshop-index"  # git-index: GitHub-hosted package registry
type = "git-index"
priority = 1                                  # highest priority in virtual view

[[workshop.sources]]
path = "C:/my-local-workshop"                 # local: directory on disk
type = "local"
priority = 2

[workshop]
deduplicate = true                # same resource ID from multiple sources → highest priority wins
cache_dir = "~/.ic/cache"         # local cache for downloaded content
```

```toml
# settings.toml — Phase 5+ (full Workshop server + git-index fallback)
[[workshop.sources]]
url = "https://workshop.ironcurtain.gg"       # remote: official Workshop server
type = "remote"
priority = 1

[[workshop.sources]]
url = "https://github.com/iron-curtain/workshop-index"  # git-index: still available as fallback
type = "git-index"
priority = 2

[[workshop.sources]]
url = "https://mods.myclan.com/workshop"      # remote: community-hosted
type = "remote"
priority = 3

[[workshop.sources]]
path = "C:/my-local-workshop"                 # local: directory on disk
type = "local"
priority = 4

[workshop]
deduplicate = true
cache_dir = "~/.ic/cache"
```

**Git-hosted index (git-index) — Phase 0–3 default:** A public GitHub repo (`iron-curtain/workshop-index`) containing YAML manifests per package — names, versions, SHA-256, download URLs (GitHub Releases), BitTorrent info hashes, dependencies. The engine fetches the consolidated `index.yaml` via a single HTTP GET to `raw.githubusercontent.com` (CDN-backed globally). Power users and the SDK can `git clone` the repo for offline browsing or scripting. Community contributes packages via PR. Proven pattern: Homebrew, crates.io-index, Winget, Nixpkgs. See D049 for full repo structure and manifest format.

**Official server (remote) — Phase 5+:** We host one. Default for all players. Curated categories, search, ratings, download counts. The git-index remains available as a fallback source.

**Community servers (remote):** Anyone can host their own (open-source server binary, same Rust stack as relay/tracking servers). Clans, modding communities, tournament organizers. Useful for private resources, regional servers, or alternative curation policies.

**Local directory (local):** A folder on disk that follows the Workshop directory structure. Works fully offline. Ideal for mod developers testing before publishing, or LAN-party content distribution.

**How the Workshop looks to players:** The in-game Workshop browser, the `ic` CLI, and the SDK all query the same merged view. They never interact with individual sources directly — the engine handles source selection, caching, and fallback transparently. A player browsing the Workshop in Phase 0–3 (backed by a git index) sees the same UI as a player in Phase 5+ (backed by a full Workshop server). The only difference is backend plumbing that's invisible to the user.

#### Phase 0–3: What Players Actually Experience

With only the git-hosted index and GitHub Releases as the backend, all core Workshop workflows work:

| Workflow           | What the player does                                               | What happens under the hood                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Browse**         | Opens Workshop in-game or runs `ic mod search`                     | Engine fetches `index.yaml` from GitHub (cached locally). Displays content list with names, descriptions, ratings, tags.                                                                                                   |
| **Install**        | Clicks "Install" or runs `ic mod install alice/soviet-march-music` | Resolves dependencies from index. Downloads `.icpkg` from GitHub Releases (HTTP). Verifies SHA-256. Extracts to local cache.                                                                                               |
| **Play with mods** | Joins a multiplayer lobby                                          | Auto-download checks `required_mods` against local cache. Missing content fetched from GitHub Releases (P2P when tracker is live in Phase 3-4).                                                                            |
| **Publish**        | Runs `ic mod publish`                                              | Packages content into `.icpkg`, computes SHA-256, uploads to GitHub Releases, generates index manifest, opens PR to `workshop-index` repo. *(Phase 0–3 publishes via PR; Phase 5+ publishes directly to Workshop server.)* |
| **Update**         | Runs `ic mod update`                                               | Fetches latest `index.yaml`, shows available updates, downloads new versions.                                                                                                                                              |

The in-game browser works with the git index from day one — it reads the same manifest format that the full Workshop server will use. Search is local (filter/sort on cached index data). Ratings and download counts are deferred to Phase 4-5 (when the Workshop server can track them), but all other features work.

#### Package Integrity

Every published resource includes cryptographic checksums for integrity verification:

- **SHA-256 checksum** stored in the package manifest and on the Workshop server
- `ic mod install` verifies checksums after download — mismatch → abort + warning
- `ic.lock` records both version AND SHA-256 checksum for each dependency — guarantees byte-identical installs across machines
- Protects against: corrupted downloads, CDN tampering, mirror drift
- Workshop server computes checksums on upload; clients verify on download

#### Promotion & Maturity Channels

Resources can be published to maturity channels, allowing staged releases:

| Channel   | Purpose                         | Visibility                      |
| --------- | ------------------------------- | ------------------------------- |
| `dev`     | Work-in-progress, local testing | Author only (local repos only)  |
| `beta`    | Pre-release, community testing  | Opt-in (users enable beta flag) |
| `release` | Stable, production-ready        | Default (everyone sees these)   |

```
ic mod publish --channel beta     # visible only to users who opt in to beta
ic mod publish                    # release channel (default)
ic mod promote 1.3.0-beta.1 release  # promote without re-upload
ic mod install --include-beta     # pull beta resources
```

#### Replication & Mirroring

Community Workshop servers can replicate from the official server (pull replication, Artifactory-style):

- **Pull replication:** Community server periodically syncs popular resources from official. Reduces latency for regional players, provides redundancy.
- **Selective sync:** Community servers choose which categories/publishers to replicate (e.g., replicate all Maps but not Mods)
- **Offline bundles:** `ic workshop export-bundle` creates a portable archive of selected resources for LAN parties or airgapped environments. `ic workshop import-bundle` loads them into a local repository.

#### P2P Distribution (BitTorrent/WebTorrent) — D049

Workshop delivery uses **peer-to-peer distribution** for large packages, with HTTP as both a **concurrent transport** (BEP 17/19 web seeding — HTTP mirrors participate simultaneously alongside BT peers in the piece scheduler) and a last-resort fallback. See `decisions/09e/D049/D049-web-seeding.md` for the full web seeding design. The Workshop server acts as both metadata registry (SQLite, lightweight) and BitTorrent tracker (peer coordination, lightweight). Actual content transfer happens peer-to-peer between players.

**Transport strategy by package size:**

| Package Size | Strategy                                                    | Rationale                                                      |
| ------------ | ----------------------------------------------------------- | -------------------------------------------------------------- |
| < 5MB        | HTTP direct only                                            | P2P overhead exceeds benefit. Maps, balance presets, palettes. |
| 5–50MB       | P2P + HTTP concurrent (web seeding); HTTP-only fallback     | Sprite packs, sound packs, script libraries.                   |
| > 50MB       | P2P + HTTP concurrent (web seeding); P2P strongly preferred | HD resource packs, cutscene packs, full mods.                  |

**How it works:**

1. `ic mod publish` packages `.icpkg` and publishes it. Phase 0–3: uploads to GitHub Releases + opens PR to `workshop-index`. Phase 3+: Workshop server computes BitTorrent info hash and starts seeding.
2. `ic mod install` fetches manifest (from git index or Workshop server), downloads content via BT + HTTP concurrently when web seed URLs exist in torrent metadata. If no BT peers or web seeds are available, falls back to HTTP direct download as a last resort.
3. Players who download automatically seed to others (opt-out in settings). Popular resources get faster — the opposite of CDN economics.
4. SHA-256 verification on complete package, same as D030's existing integrity design.
5. **WebTorrent** extends this to browser builds (WASM) — P2P over WebRTC. Desktop and browser clients interoperate.

**Seeding infrastructure:** A dedicated seed box (~$20-50/month VPS) permanently seeds all content, ensuring new/unpopular packages are always downloadable. Community seed volunteers and federated Workshop servers also seed. Lobby-optimized seeding prioritizes peers in the same lobby.

**P2P client configuration:** Players control P2P behavior in `settings.toml`. Bandwidth limiting is critical — residential users cannot have their connection saturated by mod seeding (a lesson from Uber Kraken's production deployment, where even datacenter agents need bandwidth caps):

```toml
# settings.toml — P2P distribution settings
[workshop.p2p]
max_upload_speed = "1 MB/s"          # Default seeding speed cap (0 = unlimited)
max_download_speed = "unlimited"      # Most users won't limit
seed_after_download = true            # Keep seeding while game is running
seed_duration_after_exit = "30m"      # Background seeding after game closes
cache_size_limit = "2 GB"             # LRU eviction when exceeded
prefer_p2p = true                     # false = always use HTTP direct
```

The P2P engine uses **rarest-first** piece selection, an **endgame mode** that sends duplicate requests for the last few pieces to prevent stalls, a **connection state machine** (pending → active → blacklisted) that avoids wasting time on dead or throttled peers, **statistical bad-peer detection** (demotes peers whose transfer times deviate beyond 3σ — adapted from Dragonfly's evaluator), and **3-tier download priority** (lobby-urgent / user-requested / background) for QoS differentiation. The underlying P2P infrastructure is the `p2p-distribute` crate (D076 Tier 3, MIT/Apache-2.0) — a foundational content distribution engine that IC uses across multiple subsystems, not just Workshop. `workshop-core` (D050) integrates `p2p-distribute` with Workshop-specific registry, federation, and revocation propagation. Full protocol design details — peer selection policy, weighted multi-dimensional scoring, piece request strategy, announce cycle, size-based piece lengths, health checks, preheat/prefetch, persistent replica count — are in `../decisions/09e/D049-workshop-assets.md` "P2P protocol design details."

**Cost:** A BitTorrent tracker costs $5-20/month. Centralized CDN for a popular 500MB mod downloaded 10K times = 5TB = $50-450/month. P2P reduces marginal distribution cost to near-zero.

See `../decisions/09e/D049-workshop-assets.md` for full design including security analysis, Rust implementation options, gaming industry precedent, and phased bootstrap strategy.

### Workshop Resource Registry & Dependency System (D030)

The Workshop operates as a **universal resource repository for game assets**. Any game asset — music, sprites, textures, cutscenes, maps, sound effects, voice lines, templates, balance presets — is individually publishable as a versioned, integrity-verified, licensed resource. Others (including LLM agents) can discover, depend on, and download resources automatically.

> **Standalone platform potential:** The Workshop's federated registry + P2P distribution architecture is game-agnostic by design. It could serve other games, creative tools, AI model distribution, and more. See `research/p2p-federated-registry-analysis.md` for analysis of this as a standalone platform, competitive landscape survey across 13+ platforms (Nexus Mods, mod.io, Steam Workshop, Modrinth, CurseForge, Thunderstore, ModDB, GameBanana, Uber Kraken, Dragonfly, Artifactory, IPFS, Homebrew), and actionable design lessons applied to IC.

#### Resource Identity & Versioning

Every Workshop resource gets a globally unique identifier:

```
Format:  publisher/name@version
Example: alice/soviet-march-music@1.2.0
         community-hd-project/allied-infantry-sprites@2.1.0
         bob/desert-tileset@1.0.3
```

- **Publisher** = author username or organization (the publishing identity)
- **Name** = resource name, lowercase with hyphens
- **Version** = semantic versioning (semver)

#### Dependency Declaration in `mod.toml`

Mods and resources declare dependencies on other Workshop resources:

```toml
# mod.toml
[dependencies]
"community-project/hd-infantry-sprites" = { version = "^2.0", source = "workshop" }
"alice/soviet-march-music" = { version = ">=1.0, <3.0", source = "workshop", optional = true }
"bob/desert-terrain-textures" = { version = "~1.4", source = "workshop" }
```

Dependencies are **transitive** — if resource A depends on B, and B depends on C, installing A pulls all three.

#### Dependency Resolution

Cargo-inspired version solving with lockfile:

| Concept               | Behavior                                                                          |
| --------------------- | --------------------------------------------------------------------------------- |
| Semver ranges         | `^1.2` (>=1.2.0, <2.0.0), `~1.2` (>=1.2.0, <1.3.0), `>=1.0, <3.0`, exact `=1.2.3` |
| Lockfile (`ic.lock`)  | Records exact resolved versions + SHA-256 checksums for reproducible installs     |
| Transitive resolution | Pulled automatically; diamond dependencies resolved to compatible version         |
| Conflict detection    | Two deps require incompatible versions → error with suggestions                   |
| Deduplication         | Same resource from multiple dependents stored once in local cache                 |
| Optional dependencies | `optional: true` — mod works without it; UI offers to install if available        |
| Offline resolution    | Once cached, all dependencies resolve from local cache — no network required      |

#### CLI Commands for Dependency Management

These extend the `ic` CLI (D020):

```
ic mod resolve         # compute dependency graph, report conflicts
ic mod install         # download all dependencies to local cache (verifies SHA-256)
ic mod update          # update deps to latest compatible versions (respects semver)
ic mod tree            # display dependency tree (like `cargo tree`)
ic mod lock            # regenerate ic.lock from current mod.toml
ic mod audit           # check dependency licenses for compatibility
ic mod promote         # promote resource to a higher channel (beta → release)
ic workshop export-bundle  # export selected resources as portable offline archive
ic workshop import-bundle  # import offline archive into local repository
```

Example workflow:
```
$ ic mod install
  Resolving dependencies...
  Downloading community-project/hd-infantry-sprites@2.1.0 (12.4 MB)
  Downloading alice/soviet-march-music@1.2.0 (4.8 MB)
  Downloading bob/desert-terrain-textures@1.4.1 (8.2 MB)
  3 resources installed, 25.4 MB total
  Lock file written: ic.lock

$ ic mod tree
  my-total-conversion@1.0.0
  ├── community-project/hd-infantry-sprites@2.1.0
  │   └── community-project/base-palettes@1.0.0
  ├── alice/soviet-march-music@1.2.0
  └── bob/desert-terrain-textures@1.4.1

$ ic mod audit
  ✓ All 4 dependencies have compatible licenses
  ✓ Your mod (CC-BY-SA-4.0) is compatible with:
    - hd-infantry-sprites (CC-BY-4.0) ✓
    - soviet-march-music (CC0-1.0) ✓
    - desert-terrain-textures (CC-BY-SA-4.0) ✓
    - base-palettes (CC0-1.0) ✓
```

#### License System

**Every published Workshop resource MUST have a `license` field.** Publishing without one is rejected by the Workshop server and by `ic mod publish`.

```toml
# In mod.toml
[mod]
license = "CC-BY-SA-4.0"             # SPDX identifier (required for publishing)
```

- Uses [SPDX identifiers](https://spdx.org/licenses/) for machine-readable classification
- Workshop UI displays license prominently on every resource listing
- `ic mod audit` checks the full dependency tree for license compatibility
- Common licenses for game assets:

| License             | Allows commercial use | Requires attribution | Share-alike | Notes                       |
| ------------------- | --------------------- | -------------------- | ----------- | --------------------------- |
| `CC0-1.0`           | ✅                     | ❌                    | ❌           | Public domain equivalent    |
| `CC-BY-4.0`         | ✅                     | ✅                    | ❌           | Most permissive with credit |
| `CC-BY-SA-4.0`      | ✅                     | ✅                    | ✅           | Copyleft for creative works |
| `CC-BY-NC-4.0`      | ❌                     | ✅                    | ❌           | Non-commercial only         |
| `MIT`               | ✅                     | ✅                    | ❌           | For code assets             |
| `GPL-3.0-only`      | ✅                     | ✅                    | ✅           | For code (EA source compat) |
| `LicenseRef-Custom` | varies                | varies               | varies      | Link to full text required  |

#### Optional EULA

Authors who need terms beyond what SPDX licenses cover can attach an End User License Agreement:

```yaml
mod:
  license: "CC-BY-4.0"                # SPDX license (always required)
  eula:
    url: "https://example.com/my-eula.txt"   # link to full EULA text
    summary: "No use in commercial products without written permission"
```

- **EULA is always optional.** The SPDX license alone is sufficient for most resources.
- **EULA cannot contradict the SPDX license.** `ic mod check` warns if the EULA appears to restrict rights the license explicitly grants. Example: `license: CC0-1.0` with an EULA restricting commercial use is flagged as contradictory.
- **EULA acceptance in UI:** When a user installs a resource with an EULA, the Workshop browser displays the EULA and requires explicit acceptance before download. Accepted EULAs are recorded in local SQLite (D034) so the prompt is shown only once per resource per user.
- **EULA is NOT a substitute for a license.** Even with an EULA, the `license` field is still required. The EULA adds terms; it doesn't replace the baseline.
- **Dependency EULAs surface during `ic mod install`:** If a dependency has an EULA the user hasn't accepted, the install pauses to show it. No silent EULA acceptance through transitive dependencies.

#### Workshop Terms of Service (Platform License)

**The GitHub model:** Just as GitHub's Terms of Service grant GitHub (and other users) certain rights to hosted content regardless of the repository's license, the IC Workshop requires acceptance of platform Terms of Service before any publishing. This ensures the platform can operate legally even when individual resources use restrictive licenses.

**What the Workshop ToS grants (minimum platform rights):**

By publishing a resource to the IC Workshop, the author grants IC (the platform) and its users the following irrevocable, non-exclusive rights:

1. **Hosting & distribution:** The platform may store, cache, replicate (D030 federation), and distribute the resource to users who request it. This includes P2P distribution (D049) where other users' clients temporarily cache and re-serve the resource.
2. **Indexing & search:** The platform may index resource metadata (title, description, tags, `llm_meta`) for search functionality, including full-text search (FTS5).
3. **Thumbnails & previews:** The platform may generate and display thumbnails, screenshots, previews, and excerpts of the resource for browsing purposes.
4. **Dependency resolution:** The platform may serve this resource as a transitive dependency when other resources declare a dependency on it.
5. **Auto-download in multiplayer:** The platform may automatically distribute this resource to players joining a multiplayer lobby that requires it (CS:GO-style auto-download, D030).
6. **Forking & derivation:** Other users may create derivative works of the resource **to the extent permitted by the resource's declared SPDX license**. The ToS does not expand license rights — it ensures the platform can mechanically serve the resource; what recipients may *do* with it is governed by the license.
7. **Metadata for AI agents:** The platform may expose resource metadata to LLM/AI agents **to the extent permitted by the resource's `ai_usage` field** (see `AiUsagePermission`). The ToS does not override `ai_usage: deny`.

**What the Workshop ToS does NOT grant:**
- No transfer of copyright. Authors retain full ownership.
- No right for the platform to modify the resource content (only metadata indexing and preview generation).
- No right to use the resource for advertising or promotional purposes beyond Workshop listings.
- No right for the platform to sub-license the resource beyond what the declared SPDX license permits.

**ToS acceptance flow:**
- First-time publishers see the ToS and must accept before their first `ic mod publish` succeeds.
- ToS acceptance is recorded server-side and in local SQLite. The ToS is not re-shown unless the version changes.
- `ic mod publish --accept-tos` allows headless acceptance in CI/CD pipelines.
- The ToS is versioned. When updated, publishers are prompted to re-accept on their next publish. Existing published resources remain distributed under the ToS version they were published under.

**Why this matters:**

Without platform ToS, an author could publish a resource with `All Rights Reserved` and then demand the Workshop stop distributing it — legally, the platform would have no right to host, cache, or serve the file. The ToS establishes the minimum rights the platform needs to function. This is standard for any content hosting platform (GitHub, npm, Steam Workshop, mod.io, Nexus Mods all have equivalent clauses).

**Community-hosted Workshop servers** define their own ToS. The official IC Workshop's ToS is the reference template. `ic mod publish` to a community server shows that server's ToS, not IC's. The engine provides the ToS acceptance infrastructure; the policy is per-deployment.

#### Minimum Age Requirement (COPPA)

**Workshop accounts require users to be 13 years or older.** Account creation presents an age gate; users who do not meet the minimum age cannot create a publishing account.

- Compliance with COPPA (US Children's Online Privacy Protection Act) and the UK Age Appropriate Design Code
- Users under 13 cannot create Workshop accounts, publish resources, or post reviews
- Users under 13 **can** play the game, browse the Workshop, and install resources — these actions don't require an account and collect no personal data
- In-game multiplayer lobbies with text chat follow the same age boundary for account-linked features
- This applies to the official IC Workshop. Community-hosted servers define their own age policies

#### Third-Party Content Disclaimer

Iron Curtain provides Workshop hosting infrastructure — not editorial approval. Resources published to the Workshop are provided by their respective authors under their declared SPDX licenses.

- **The platform is not liable** for the content, accuracy, legality, or quality of user-submitted Workshop resources
- **No warranty** is provided for Workshop resources — they are offered "as is" by their respective authors
- **DMCA safe harbor** applies — the Workshop follows the notice-and-takedown process documented in `../decisions/09e/D030-workshop-registry.md`
- **The Workshop does not review or approve resources before listing.** Anomaly detection (supply chain security) and community moderation provide the safety layer, not pre-publication editorial review

This disclaimer appears in the Workshop ToS that authors accept before publishing, and is visible to users in the Workshop browser footer.

#### Privacy Policy Requirements

The Workshop collects and processes data necessary for operation. Before any Workshop server deployment, a Privacy Policy must be published covering:

- **What data is collected:** Account identity, published resource metadata, download counts, review text, ratings, IP addresses (for abuse prevention)
- **Lawful basis:** Consent (account creation) and legitimate interest (platform security)
- **Retention:** Connection logs purged after configured retention window (default: 30 days). Account data retained while account is active. Deleted on account deletion request.
- **User rights (GDPR):** Right to access, right to rectification, right to erasure (account deletion deletes profile and reviews; published resources optionally transferable or removable), right to data portability (export in standard format)
- **Third parties:** Federated Workshop servers may replicate metadata. P2P distribution exposes IP addresses to other peers (same as multiplayer — see `../decisions/09e/D049-workshop-assets.md` privacy notes)

The Privacy Policy template ships with the Workshop server deployment. Community servers customize and publish their own.

**Phase:** ToS text drafted during Phase 3 (manifest format finalized). Requires legal review before official Workshop launch in Phase 4–5. CI/CD headless acceptance in Phase 5+.

#### Publishing Workflow

Publishing uses the existing `ic mod init` + `ic mod publish` flow — resources are packages with the appropriate `ResourceCategory`. The `ic mod publish` command detects the configured Workshop backend automatically:

- **Phase 0–3 (git-index):** `ic mod publish` packages the `.icpkg`, uploads it to GitHub Releases, generates a manifest YAML, and opens a PR to the `workshop-index` repo. The modder reviews and submits the PR. GitHub Actions validates the manifest.
- **Phase 5+ (Workshop server):** `ic mod publish` uploads directly to the Workshop server. No PR needed — the server validates and indexes immediately.

The command is the same in both phases — the backend is transparent to the modder.

```
# Publish a single music track
ic mod init asset-pack
# Edit mod.toml: set category to "Music", add license, add llm_meta
# Add audio files
ic mod check                   # validates license present, llm_meta recommended
ic mod publish                 # Phase 0-3: uploads to GitHub Releases + opens PR to index
                               # Phase 5+:  uploads directly to Workshop server
```

```toml
# Example: publishing a music pack
[mod]
id = "alice/soviet-march-music"
title = "Soviet March — Original Composition"
version = "1.2.0"
authors = ["alice"]
description = "An original military march composition for Soviet faction missions"
license = "CC-BY-4.0"
category = "Music"

[assets]
media = ["audio/soviet-march.ogg"]

[llm]
summary = "Military march music, Soviet theme, 2:30 duration, orchestral"
purpose = "Background music for Soviet mission briefings or victory screens"
gameplay_tags = ["soviet", "military", "march", "orchestral", "briefing"]
composition_hints = "Pairs well with Soviet faction voice lines for immersive briefings"
```

#### Moderation & Publisher Trust (D030)

> **Full section:** [Workshop Moderation & Publisher Trust](workshop-moderation.md)

Publisher trust tiers (Unverified→Verified→Trusted→Featured), asymmetric negative reputation federation, `RevocationRecord` propagation via `p2p-distribute` `RevocationPolicy` trait, three reconciliation loops (client content / federation trust / server health), YAML-configurable moderation rules engine, and community reporting workflow.

#### CI/CD Publishing Integration

`ic mod publish` is designed to work in CI/CD pipelines — not just interactive terminals. Inspired by Artifactory's CI integration and npm's automation tokens.

```yaml
# GitHub Actions example
- name: Publish to Workshop
  env:
    IC_AUTH_TOKEN: ${{ secrets.IC_WORKSHOP_TOKEN }}
  run: |
    ic mod check --strict
    ic mod publish --non-interactive --json
```

- **Scoped API tokens:** `ic auth create-token --scope publish` generates a token limited to publish operations. Separate scopes: `publish`, `admin`, `readonly`. Tokens stored in `~/.ic/credentials.yaml` locally, or `IC_AUTH_TOKEN` env var in CI.
- **Non-interactive mode:** `--non-interactive` flag skips all prompts (required for CI). `--json` flag returns structured output for pipeline parsing.
- **Lockfile verification in CI:** `ic mod install --locked` fails if `ic.lock` doesn't match `mod.toml` — ensures reproducible builds.
- **Pre-publish validation:** `ic mod check --strict` validates manifest, license, dependencies, SHA-256 integrity, and file format compliance before upload. Catch errors before hitting the server.

#### Platform-Targeted Releases

Resources can declare platform compatibility in `manifest.yaml`, enabling per-platform release control. Inspired by mod.io's per-platform targeting (console+PC+mobile) — adapted for IC's target platforms:

```yaml
# manifest.yaml
package:
  name: "hd-terrain-textures"
  platforms: [windows, linux, macos]     # KTX2 textures not supported on WASM
  # Omitting platforms field = available on all platforms (default)
```

The Workshop browser filters resources by the player's current platform. Platform-incompatible resources are hidden by default (shown grayed-out with an "Other platforms" toggle). Phase 0–3: no platform filtering (all resources visible). Phase 5+: server-side filtering.


---

## Sub-Pages

| Section           | Topic                                                                                                                                                                                                                    | File                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Workshop Features | LLM-driven resource discovery, Steam Workshop integration, in-game browser, modpacks, auto-download on lobby join, creator reputation, content moderation/DMCA, voluntary tipping, achievement integration, Workshop API | [workshop-features.md](workshop-features.md) |
