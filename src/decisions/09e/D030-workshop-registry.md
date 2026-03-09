## D030: Workshop Resource Registry & Dependency System

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 0–3 (Git index MVP), Phase 3–4 (P2P added), Phase 4–5 (minimal viable Workshop), Phase 6a (full federation), Phase 7+ (advanced discovery)
- **Canonical for:** Workshop resource registry model, dependency semantics, resource granularity, and federated package ecosystem strategy
- **Scope:** Workshop package identities/manifests, dependency resolution, registry/index architecture, publish/install flows, resource licensing/AI-usage metadata
- **Decision:** IC’s Workshop is a **crates.io-style resource registry** where assets and mods are publishable as independent versioned resources with semver dependencies, license metadata, and optional AI-usage permissions.
- **Why:** Enables reuse instead of copy-paste, preserves attribution, supports automation/CI publishing, and gives both humans and LLM agents a structured way to discover and compose community content.
- **Non-goals:** A monolithic “mods only” Workshop with no reusable resource granularity; forcing a single centralized infrastructure from day one.
- **Invariants preserved:** Federation-first architecture (aligned with D050), compatibility with existing mod packaging flows, and community ownership/self-hosting principles.
- **Defaults / UX behavior:** Workshop packages are versioned resources; dependencies can be required or optional; auto-download/install resolves dependency trees for players/lobbies.
- **Compatibility / Export impact:** Resource registry supports both IC-native and compatibility-oriented content; D049 defines canonical format recommendations and P2P delivery details.
- **Security / Trust impact:** License metadata and `ai_usage` permissions are first-class; supports automated policy checks and creator consent for agentic tooling.
- **Performance / Ops impact:** Phased rollout starts with a low-cost Git index and grows toward full infrastructure only as needed.
- **Public interfaces / types / commands:** `publisher/name@version` IDs, semver dependency ranges in `mod.yaml`, `.icpkg` packages, `ic mod publish/install/init`
- **Affected docs:** `src/04-MODDING.md`, `src/decisions/09e-community.md` (D049/D050/D061), `src/decisions/09c-modding.md`, `src/17-PLAYER-FLOW.md`
- **Revision note summary:** None
- **Keywords:** workshop registry, dependencies, semver, icpkg, federated workshop, reusable resources, ai_usage permissions, mod publish

**Decision:** The Workshop operates as a crates.io-style resource registry where any game asset — music, sprites, textures, **video cutscenes**, **rendered cutscene sequence bundles**, maps, sound effects, palettes, voice lines, UI themes, templates — is publishable as an independent, versioned, licensable resource that others (including LLM agents, with author consent) can discover, depend on, and pull automatically. Authors control AI access to their resources separately from the license via `ai_usage` permissions.

**Rationale:**
- OpenRA has no resource sharing infrastructure — modders copy-paste files, share on forums, lose attribution
- Individual resources (a single music track, one sprite sheet) should be as easy to publish and consume as full mods
- A dependency system eliminates duplication: five mods that need the same HD sprite pack declare it as a dependency instead of each bundling 200MB of sprites
- License metadata protects community creators and enables automated compatibility checking
- LLM agents generating missions need a way to discover and pull community assets without human intervention
- The mod ecosystem grows faster when building blocks are reusable — this is why npm/crates.io/pip changed their respective ecosystems
- CI/CD-friendly publishing (headless CLI, scoped API tokens) lets serious mod teams automate their release pipeline — no manual uploads

**Key Design Elements:**

### Phased Delivery Strategy

The Workshop design below is comprehensive, but it ships incrementally:

| Phase     | Scope                                                                                                                                                                                                                                                                  | Complexity   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Phase 0–3 | **Git-hosted index:** `workshop-index` GitHub repo as package registry (`index.yaml` + per-package manifests). `.icpkg` files stored on GitHub Releases (free CDN). Community contributes via PR. `git-index` source type in Workshop client. Zero infrastructure cost | Minimal      |
| Phase 3–4 | **Add P2P:** BitTorrent tracker ($5-10/month VPS). Package manifests gain `torrent` source entries. P2P delivery for large packages. Git index remains discovery layer. Format recommendations published                                                               | Low–Medium   |
| Phase 4–5 | **Minimal viable Workshop:** Full Workshop server (search, ratings, deps) + integrated P2P tracker + `ic mod publish` + `ic mod install` + in-game browser + auto-download on lobby join                                                                               | Medium       |
| Phase 6a  | **Full Workshop:** Federation, community servers join P2P swarm, replication, promotion channels, CI/CD token scoping, creator reputation, DMCA process, Steam Workshop as optional source                                                                             | High         |
| Phase 7+  | **Advanced:** LLM-driven discovery, premium hosting tiers                                                                                                                                                                                                              | Low priority |

The Artifactory-level federation design is the end state, not the MVP. Ship simple, iterate toward complex. P2P delivery (D049) is integrated from Phase 3–4 because centralized hosting costs are a sustainability risk — better to solve early than retrofit. Workshop packages use the `.icpkg` format (ZIP with `manifest.yaml`) — see D049 for full specification.

**Cross-engine validation:** O3DE's **Gem system** uses a declarative `gem.json` manifest with explicit dependency declarations, version constraints, and categorized tags — the same structure IC targets for Workshop packages. O3DE's template system (`o3de register --template-path`) scaffolds new projects from standard templates, validating IC's planned `ic mod init --template=...` CLI command. Factorio's mod portal uses semver dependency ranges (e.g., `>= 1.1.0`) with automatic resolution — the same model IC should use for Workshop package dependencies. See `research/godot-o3de-engine-analysis.md` § O3DE and `research/mojang-wube-modding-analysis.md` § Factorio.

### Resource Identity & Versioning

Every Workshop resource gets a globally unique identifier: `publisher/name@version`.

- **Publisher** = author username or organization (e.g., `alice`, `community-hd-project`)
- **Name** = resource name, lowercase with hyphens (e.g., `soviet-march-music`, `allied-infantry-hd`)
- **Version** = semver (e.g., `1.2.0`)
- Full ID example: `alice/soviet-march-music@1.2.0`

### Resource Categories (Expanded)

Resources aren't limited to mod-sized packages. Granularity is flexible:

| Category           | Granularity Examples                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Music              | Single track, album, soundtrack                                                                                                                             |
| Sound Effects      | Weapon sound pack, ambient loops, UI sounds                                                                                                                 |
| Voice Lines        | EVA pack, unit response set, faction voice pack                                                                                                             |
| Sprites            | Single unit sheet, building sprites, effects pack                                                                                                           |
| Textures           | Terrain tileset, UI skin, palette-indexed sprites                                                                                                           |
| Palettes           | Theater palette, faction palette, seasonal palette                                                                                                          |
| Maps               | Single map, map pack, tournament map pool                                                                                                                   |
| Missions           | Single mission, mission chain                                                                                                                               |
| Campaign Chapters  | Story arc with persistent state                                                                                                                             |
| Scene Templates    | Tera scene template for LLM composition                                                                                                                     |
| Mission Templates  | Tera mission template for LLM composition                                                                                                                   |
| Cutscenes / Video  | Briefing video, in-game cinematic, tutorial clip                                                                                                            |
| UI Themes          | Sidebar layout, font pack, cursor set                                                                                                                       |
| Balance Presets    | Tuned unit/weapon stats as a selectable preset                                                                                                              |
| QoL Presets        | Gameplay behavior toggle set (D033) — sim-affecting + client-only toggles                                                                                   |
| Experience Profile | Combined balance + theme + QoL + AI + pathfinding + render mode (D019+D032+D033+D043+D045+D048)                                                             |
| Resource Packs     | Switchable asset layer for any category — see `04-MODDING.md` § "Resource Packs"                                                                            |
| Script Libraries   | Reusable Lua modules, utility functions, AI behavior scripts, trigger templates, console automation scripts (`.iccmd`) — see D058 § "Competitive Integrity" |
| LLM Model Packs    | CPU-optimized GGUF weights + manifest — downloaded on demand by Tier 1 built-in inference (D047)                                                            |
| LLM Configurations | Exported provider/routing/prompt-strategy presets — no API keys (D047 § Workshop Integration)                                                               |
| Full Mods          | Traditional mod (may depend on individual resources)                                                                                                        |

A published resource is just a `ResourcePackage` with the appropriate `ResourceCategory`. The existing `asset-pack` template and `ic mod publish` flow handle this natively — no separate command needed.

### Dependency Declaration

`mod.yaml` already has a `dependencies:` section. D030 formalizes the resolution semantics:

```yaml
# mod.yaml
dependencies:
  - id: "community-project/hd-infantry-sprites"
    version: "^2.0"                    # semver range (cargo-style)
    source: workshop                   # workshop | local | url
  - id: "alice/soviet-march-music"
    version: ">=1.0, <3.0"
    source: workshop
    optional: true                     # soft dependency — mod works without it
  - id: "bob/desert-terrain-textures"
    version: "~1.4"                    # compatible with 1.4.x
    source: workshop
```

Resource packages can also declare dependencies on other resources (transitive):

```yaml
# A mission pack depends on a sprite pack and a music track
dependencies:
  - id: "community-project/hd-sprites"
    version: "^2.0"
    source: workshop
  - id: "alice/briefing-videos"
    version: "^1.0"
    source: workshop
```

### Repository Types

The Workshop uses three repository types (architecture inspired by Artifactory's local/remote/virtual model):

| Source Type | Description                                                                                                                                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local**   | A directory on disk following Workshop structure. Stores resources you create. Used for development, LAN parties, offline play, pre-publish testing.                                                                                                              |
| **Remote**  | A Workshop server (official or community-hosted). Resources are downloaded and cached locally on first access. Cache is used for subsequent requests — works offline after first pull.                                                                            |
| **Virtual** | The aggregated view across all configured sources. The `ic` CLI and in-game browser query the virtual view — it merges listings from all local + remote + git-index sources, deduplicates by resource ID, and resolves version conflicts using priority ordering. |

The `settings.toml` `sources` list defines which local and remote sources compose the virtual view. This is the federation model — the client never queries raw servers directly, it queries the merged Workshop view.

### Package Integrity

Every published resource includes cryptographic checksums for integrity verification:

- **SHA-256 checksum** stored in the package manifest and on the Workshop server
- `ic mod install` verifies checksums after download — mismatch → abort + warning
- `ic.lock` records both version AND checksum for each dependency — guarantees byte-identical installs across machines
- Protects against: corrupted downloads, CDN tampering, mirror drift
- Workshop server computes checksums on upload; clients verify on download. Trust but verify.

### Hash and Signature Strategy (Fit-for-Purpose, D049/D052/D037)

IC uses a **layered integrity + authenticity model**:

- **SHA-256 (canonical interoperability digest):**
  - package manifest fields (`manifest_hash`, full-package hash)
  - `ic.lock` reproducibility checks
  - conservative, widely supported digest for cross-tooling/legal/provenance references
- **BLAKE3 (performance-oriented internal integrity, Phase 6a+ / `M9`):**
  - local CAS blob/chunk verification and repair acceleration
  - optional server-side chunk hashing and dedup optimization
  - may coexist with SHA-256; it does not replace SHA-256 as the canonical publish/interchange digest without a separate explicit decision
- **Ed25519 signatures (authenticity):**
  - signed index snapshots (git-index phase and later)
  - signed manifest/release records and publish-channel metadata (Workshop server phases)
  - trust claims ("official", "verified publisher", "reviewed") must be backed by signature-verifiable metadata, not UI labels alone

**Design choice:** The system signs **manifests/index/release metadata records**, not a bespoke wrapper around every content binary as the primary trust mechanism. File/package hashes provide integrity; signatures provide authenticity and provenance of the published metadata that references them.

This keeps verification fast, auditable, and compatible with D030 federation while avoiding unnecessary package-format complexity.

### Manifest Integrity & Confusion Prevention

The canonical package manifest is **inside the `.icpkg` archive** (`manifest.yaml`). The git-index entry and Workshop server metadata are derived summaries — never independent sources of truth. See `06-SECURITY.md` § Vulnerability 20 for the full threat analysis (inspired by the 2023 npm manifest confusion affecting 800+ packages).

- **`manifest_hash` field:** Every index entry includes `manifest_hash: SHA-256(manifest.yaml)` — the hash of the manifest file itself, separate from the full-package hash. Clients verify this independently.
- **CI validation (git-index phase):** PR validation CI downloads the `.icpkg`, extracts `manifest.yaml`, computes its hash, and verifies against the declared `manifest_hash`. Mismatch → PR rejected.
- **Client verification:** `ic mod install` verifies the extracted `manifest.yaml` matches the index's `manifest_hash` before processing mod content. Mismatch → abort.

### Version Immutability

Once version X.Y.Z is published, its content **cannot** be modified or overwritten. The SHA-256 hash recorded at publish time is permanent.

- **Yanking ≠ deletion:** Yanked versions are hidden from new `ic mod install` searches but remain downloadable for existing `ic.lock` files that reference them.
- **Git-index enforcement:** CI rejects PRs that modify fields in existing version manifest files. Only additions of new version files are accepted.
- **Registry enforcement (Phase 4+):** Workshop server API rejects publish requests for existing version numbers with HTTP 409 Conflict. No override flag.

### Typosquat & Name Confusion Prevention

Publisher-scoped naming (`publisher/package`) is the structural defense — see `06-SECURITY.md` § Vulnerability 19. Additional measures:

- **Name similarity checking at publish time:** Levenshtein distance + common substitution patterns checked against existing packages. Edit distance ≤ 2 from an existing popular package → flagged for manual review.
- **Disambiguation in mod manager:** When multiple similar names exist, the search UI shows a notice with download counts and publisher reputation.

### Reputation System Integrity

The Workshop reputation system (download count, average rating, dependency count, publish consistency, community reports) includes anti-gaming measures:

- **Rate-limited reviews:** One review per account per package. Accounts must be >7 days old with at least one game session to leave reviews.
- **Download deduplication:** Counts unique authenticated users, not raw download events. Anonymous downloads deduplicated by IP with a time window.
- **Sockpuppet detection:** Burst of positive reviews from newly created accounts → flagged for moderator review. Review weight is proportional to reviewer account age and activity.
- **Source repo verification (optional):** If a package links to a source repository, the publisher can verify push access to earn a "verified source" badge.

### Abandoned Package Policy

A published package is considered **abandoned** after 18+ months of inactivity AND no response to 3 maintainer contact attempts over 90 days.

- **Archive-first default:** Abandoned packages are archived (still installable, marked "unmaintained" with a banner) rather than transferred.
- **Transfer process:** Community can nominate a new maintainer. Requires moderator approval + 30-day public notice period. Original author can reclaim within 6 months.
- **Published version immutability survives transfer.** New maintainer can publish new versions but cannot modify existing ones.

### Promotion & Maturity Channels

Resources can be published to maturity channels, allowing staged releases:

| Channel   | Purpose                         | Visibility                      |
| --------- | ------------------------------- | ------------------------------- |
| `dev`     | Work-in-progress, local testing | Author only (local repos only)  |
| `beta`    | Pre-release, community testing  | Opt-in (users enable beta flag) |
| `release` | Stable, production-ready        | Default (everyone sees these)   |

```yaml
# mod.yaml
mod:
  version: "1.3.0-beta.1"            # semver pre-release tag
  channel: beta                       # publish to beta channel
```

- `ic mod publish --channel beta` → visible only to users who opt in to beta resources
- `ic mod publish` (no flag) → release channel by default
- `ic mod install` pulls from release channel unless `--include-beta` is specified
- Promotion: `ic mod promote 1.3.0-beta.1 release` → moves resource to release channel without re-upload

### Replication & Mirroring

Community Workshop servers can replicate from the official server (pull replication, Artifactory-style):

- **Pull replication:** Community server periodically syncs popular resources from official. Reduces latency for regional players, provides redundancy.
- **Selective sync:** Community servers choose which categories/publishers to replicate (e.g., replicate all Maps but not Mods)
- **Offline bundles:** `ic workshop export-bundle` creates a portable archive of selected resources for LAN parties or airgapped environments. `ic workshop import-bundle` loads them into a local repository.

### Dependency Resolution

> **Algorithm specification:** For the PubGrub algorithm choice, version range semantics, registry index format, diamond dependency handling, lock file TOML format, error reporting, and performance analysis, see `research/dependency-resolution-design.md`.

Cargo-inspired version solving:

- **Semver ranges:** `^1.2` (>=1.2.0, <2.0.0), `~1.2` (>=1.2.0, <1.3.0), `>=1.0, <3.0`, exact `=1.2.3`
- **Lockfile:** `ic.lock` records exact resolved versions + SHA-256 checksums for reproducible installs. In multi-source configurations, also records the **source identifier** per dependency (`source:publisher/package@version`) to prevent dependency confusion across federated sources (see `06-SECURITY.md` § Vulnerability 22).
- **Transitive resolution:** If mod A depends on resource B which depends on resource C, all three are resolved
- **Conflict detection:** Two dependencies requiring incompatible versions of the same resource → error with resolution suggestions
- **Deduplication:** Same resource pulled by multiple dependents is stored once in local cache
- **Offline resolution:** Once cached, all dependencies resolve from local cache — no network required

### CLI Extensions

```
ic mod resolve         # compute dependency graph, report conflicts
ic mod install         # download all dependencies to local cache
ic mod update          # update deps to latest compatible versions (respects semver)
ic mod tree            # display dependency tree (like `cargo tree`)
ic mod lock            # regenerate ic.lock from current mod.yaml
ic mod audit           # check dependency licenses for compatibility + source confusion detection
ic mod list             # list all local resources (state, size, last used, source)
ic mod remove <pkg>     # remove resource from disk (dependency-aware, prompts for cascade)
ic mod deactivate <pkg> # keep on disk but don't load (quick toggle without re-download)
ic mod activate <pkg>   # re-enable a deactivated resource
ic mod pin <pkg>        # mark as "keep" — exempt from auto-cleanup
ic mod unpin <pkg>      # allow auto-cleanup (returns to transient state)
ic mod clean            # remove all expired transient resources
ic mod clean --dry-run  # show what would be cleaned without removing anything
ic mod status           # disk usage summary: total, by category, by state, largest resources
```

These extend the existing `ic` CLI (D020), not replace it. `ic mod publish` already exists — it now also uploads dependency metadata and validates license presence.

### Local Resource Management

Without active management, a player's disk fills with resources from lobby auto-downloads, one-off map packs, and abandoned mods. IC treats this as a first-class design problem — not an afterthought.

**Resource lifecycle states:**

Every local resource is in exactly one of these states:

| State           | On disk? | Loaded by game? | Auto-cleanup eligible?                  | How to enter                                                                |
| --------------- | -------- | --------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| **Pinned**      | Yes      | Yes             | No — stays until explicitly removed     | `ic mod install`, "Install" in Workshop UI, `ic mod pin`, or auto-promotion |
| **Transient**   | Yes      | Yes             | Yes — after TTL expires                 | Lobby auto-download, transitive dependency of a transient resource          |
| **Deactivated** | Yes      | No              | No — explicit state, player decides     | `ic mod deactivate` or toggle in UI                                         |
| **Expiring**    | Yes      | Yes             | Yes — in grace period, deletion pending | Transient resource unused for `transient_ttl_days`                          |
| **Removed**     | No       | No              | N/A                                     | `ic mod remove`, auto-cleanup, or player confirmation                       |

**Pinned vs. Transient — the core distinction:**

- **Pinned** resources are things the player explicitly chose: they clicked "Install," ran `ic mod install`, marked a resource as "Keep," or selected a content preset/pack in the D069 setup or maintenance wizard. Pinned resources stay on disk forever until the player explicitly removes them. This is the default state for deliberate installations.
- **Transient** resources arrived automatically — lobby auto-downloads, dependencies pulled transitively by other transient resources. They're fully functional (loaded, playable, seedable) but have a time-to-live. After `transient_ttl_days` without being used in a game session (default: 30 days), they enter the **Expiring** state.

This distinction means a player who joins a modded lobby once doesn't accumulate permanent disk debt. The resources work for that session and stick around for a month in case the player returns to similar lobbies — then quietly clean up.

**Auto-promotion:** If a transient resource is used in 3+ separate game sessions, it's automatically promoted to Pinned. A non-intrusive notification tells the player: "Kept alice/hd-sprites — you've used it in 5 matches." This preserves content the player clearly enjoys without requiring manual action.

**Deactivation:**

Deactivated resources stay on disk but aren't loaded by the game. Use cases:
- Temporarily disable a heavy mod without losing it (and having to re-download 500 MB later)
- Keep content available for quick re-activation (one click, no network)
- Deactivated resources are still available as P2P seeds (configurable via `seed_deactivated` setting) since they're already integrity-verified

Dependency-aware: deactivating a resource that others depend on offers: "bob/tank-skins depends on this. Deactivate both? [Both / Just this one / Cancel]". Deactivating "just this one" means dependents that reference it will show a missing-dependency warning in the mod manager.

**Dependency-aware removal:**

`ic mod remove alice/hd-sprites` checks the reverse dependency graph:
- If nothing depends on it → remove immediately.
- If bob/tank-skins depends on it → prompt: "bob/tank-skins depends on alice/hd-sprites. Remove both? [Yes / No / Remove only alice/hd-sprites and deactivate bob/tank-skins]"
- `ic mod remove alice/hd-sprites --cascade` → removes the resource and all resources that become orphaned as a result (no explicit dependents left).
- Orphan detection: after any removal, scan for resources with zero dependents and zero explicit install (not pinned by the player). These are cleanup candidates.

**Storage budget and auto-cleanup:**

```toml
# settings.toml
[workshop]
cache_dir = "~/.ic/cache"

[workshop.storage]
budget_gb = 10                    # max transient cache before auto-cleanup (0 = unlimited)
transient_ttl_days = 30           # days of non-use before transient resources expire
cleanup_prompt = "weekly"         # never | after-session | weekly | monthly
low_disk_warning_gb = 5           # warn when OS free space drops below this
seed_deactivated = false          # P2P seed deactivated (but verified) resources
```

- `budget_gb` applies to **transient** resources only. Pinned and deactivated resources don't count against the auto-cleanup budget (but are shown in disk usage summaries).
- When transient cache exceeds `budget_gb`, the oldest (by last-used timestamp) transient resources are cleaned first — LRU eviction.
- At 80% of budget, the content manager shows a gentle notice: "Workshop cache is 8.1 / 10 GB. [Clean up now] [Adjust budget]"
- On low system disk space (below `low_disk_warning_gb`), cleanup suggestions become more prominent and include deactivated resources as candidates.

**Post-session cleanup prompt:**

After a game session that auto-downloaded resources, a non-intrusive toast appears:

```
 Downloaded 2 new resources for this match (47 MB).
  alice/hd-sprites@2.0    38 MB
  bob/desert-map@1.1       9 MB
 [Pin (keep forever)]  [They'll auto-clean in 30 days]  [Remove now]
```

The default (clicking away or ignoring the toast) is "transient" — resources stay for 30 days then auto-clean. The player only needs to act if they want to explicitly keep or immediately remove. This is the low-friction path: do nothing = reasonable default.

**Periodic cleanup prompt (configurable):**

Based on `cleanup_prompt` setting:
- `after-session`: prompt after every session that used transient resources
- `weekly` (default): once per week if there are expiring transient resources
- `monthly`: once per month
- `never`: fully manual — player uses `ic mod clean` or the content manager

The prompt shows total reclaimable space and a one-click "Clean all expired" button:

```
 Workshop cleanup: 3 resources unused for 30+ days (1.2 GB)
  [Clean all]  [Review individually]  [Remind me later]
```

**In-game Local Content Manager:**

Accessible from the Workshop tab → "My Content" (or a dedicated top-level menu item). This is the player's disk management dashboard:

```
┌──────────────────────────────────────────────────────────────────┐
│  My Content                                        Storage: 6.2 GB │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Pinned: 4.1 GB (12 resources)                               │ │
│  │ Transient: 1.8 GB (23 resources, 5 expiring soon)           │ │
│  │ Deactivated: 0.3 GB (2 resources)                           │ │
│  │ Budget: 1.8 / 10 GB transient    [Clean expired: 340 MB]    │ │
│  └──────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│  Filter: [All ▾]  [Any category ▾]  Sort: [Size ▾]  [Search…]  │
├────────────────────┬──────┬───────┬───────────┬────────┬────────┤
│ Resource           │ Size │ State │ Last Used │ Source │ Action │
├────────────────────┼──────┼───────┼───────────┼────────┼────────┤
│ alice/hd-sprites   │ 38MB │ 📌    │ 2 days ago│ Manual │ [···]  │
│ bob/desert-map     │  9MB │ ⏳    │ 28 days   │ Lobby  │ [···]  │
│ core/ra-balance    │  1MB │ 📌    │ today     │ Manual │ [···]  │
│ dave/retro-sounds  │ 52MB │ 💤    │ 3 months  │ Manual │ [···]  │
│ eve/snow-map       │  4MB │ ⏳⚠   │ 32 days   │ Lobby  │ [···]  │
└────────────────────┴──────┴───────┴───────────┴────────┴────────┘
│  📌 = Pinned  ⏳ = Transient  💤 = Deactivated  ⚠ = Expiring    │
│  [Select all]  [Bulk: Pin | Deactivate | Remove]                │
└──────────────────────────────────────────────────────────────────┘
```

The `[···]` action menu per resource:
- **Pin / Unpin** — toggle between pinned and transient
- **Deactivate / Activate** — toggle loading without removing
- **Remove** — delete from disk (dependency-aware prompt)
- **View in Workshop** — open the Workshop page for this resource
- **Show dependents** — what local resources depend on this one
- **Show dependencies** — what this resource requires
- **Open folder** — reveal the resource's cache directory in the file manager

**Bulk operations:** Select multiple resources → Pin all, Deactivate all, Remove all. "Select all transient" and "Select all expiring" shortcuts for quick cleanup.

**"What's using my disk?" view:** A treemap or bar chart showing disk usage by category (Maps, Mods, Resource Packs, Script Libraries) with the largest individual resources highlighted. Helps players identify space hogs quickly. Accessible from the storage summary at the top of the content manager.

**Group operations:**

- **Pin with dependencies:** `ic mod pin alice/total-conversion --with-deps` pins the resource AND all its transitive dependencies. Ensures the entire dependency tree is protected from auto-cleanup.
- **Remove with orphans:** `ic mod remove alice/total-conversion --cascade` removes the resource and any dependencies that become orphaned (no other pinned or transient resource needs them).
- **Modpack-aware:** Pinning a modpack (D030 § Modpacks) pins all resources in the modpack. Removing a modpack removes all resources that were only needed by that modpack.

**How resources from different sources interact:**

| Source                             | Default state             | Auto-cleanup?   |
| ---------------------------------- | ------------------------- | --------------- |
| `ic mod install` (explicit)        | Pinned                    | No              |
| Workshop UI "Install" button       | Pinned                    | No              |
| Lobby auto-download                | Transient                 | Yes (after TTL) |
| Dependency of a pinned resource    | Pinned (inherited)        | No              |
| Dependency of a transient resource | Transient (inherited)     | Yes             |
| `ic workshop import-bundle`        | Pinned                    | No              |
| Steam Workshop subscription        | Pinned (managed by Steam) | Steam handles   |

**Edge case — mixed dependency state:** If resource C is a dependency of both pinned resource A and transient resource B: C is treated as pinned (strongest state wins). If A is later removed, C reverts to transient (inheriting from B). The state is always computed from the dependency graph, not stored independently for shared deps.

**Phase:** Resource states (pinned/transient) and `ic mod remove/deactivate/clean/status` ship in Phase 4–5 with the Workshop. Storage budget and auto-cleanup prompts in Phase 5. In-game content manager UI in Phase 5–6a.


---

## Sub-Pages

| Section                 | Topic                                                                                                                                                                                        | File                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Deployment & Operations | Continuous deployment, content moderation/DMCA, modpack system, creator features (reputation, tipping, achievements), LLM integration, cross-engine registry, rationale, alternatives, phase | [D030-deployment-operations.md](D030/D030-deployment-operations.md) |
