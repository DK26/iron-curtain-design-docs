# Decision Log — Community & Platform

Workshop, telemetry, storage, achievements, governance, premium content, player profiles, and data portability.

---

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

**Decision:** The Workshop operates as a crates.io-style resource registry where any game asset — music, sprites, textures, cutscenes, maps, sound effects, palettes, voice lines, UI themes, templates — is publishable as an independent, versioned, licensable resource that others (including LLM agents, with author consent) can discover, depend on, and pull automatically. Authors control AI access to their resources separately from the license via `ai_usage` permissions.

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

- **Pinned** resources are things the player explicitly chose: they clicked "Install," ran `ic mod install`, or marked a resource as "Keep." Pinned resources stay on disk forever until the player explicitly removes them. This is the default state for deliberate installations.
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

### Continuous Deployment

The `ic` CLI is designed for CI/CD pipelines — every command works headless (no interactive prompts). Authors authenticate via scoped API tokens (`IC_WORKSHOP_TOKEN` environment variable or `--token` flag). Tokens are scoped to specific operations (`publish`, `promote`, `admin`) and expire after a configurable duration. This enables:

- **Tag-triggered publish:** Push a `v1.2.0` git tag → CI validates, tests headless, publishes to Workshop automatically
- **Beta channel CI:** Every merge to `main` publishes to `beta`; explicit tag promotes to `release`
- **Multi-resource monorepos:** Matrix builds publish multiple resource packs from a single repo
- **Automated quality gates:** `ic mod check` + `ic mod test` + `ic mod audit` run before every publish
- **Scheduled compatibility checks:** Cron-triggered CI re-publishes against latest engine version to catch regressions

Works with GitHub Actions, GitLab CI, Gitea Actions, or any CI system — the CLI is a single static binary. See `04-MODDING.md` § "Continuous Deployment for Workshop Authors" for the full workflow including a GitHub Actions example.

### Script Libraries & Sharing

**Lesson from ArmA/OFP:** ArmA's modding ecosystem thrives partly because the community developed shared script libraries (CBA — Community Base Addons, ACE3's interaction framework, ACRE radio system) that became foundational infrastructure. Mods built on shared libraries instead of reimplementing common patterns. IC makes this a first-class Workshop category.

A Script Library is a Workshop resource containing reusable Lua modules that other mods can depend on:

```yaml
# mod.yaml for a script library resource
mod:
  name: "rts-ai-behaviors"
  category: script-library
  version: "1.0.0"
  license: "MIT"
  description: "Reusable AI behavior patterns for mission scripting"
  exports:
    - "patrol_routes"        # Lua module names available to dependents
    - "guard_behaviors"
    - "retreat_logic"
```

Dependent mods declare the library as a dependency and import its modules:

```lua
-- In a mission script that depends on rts-ai-behaviors
local patrol = require("rts-ai-behaviors.patrol_routes")
local guard  = require("rts-ai-behaviors.guard_behaviors")

patrol.create_route(unit, waypoints, { loop = true, pause_time = 30 })
guard.assign_area(squad, Region.Get("base_perimeter"))
```

**Key design points:**
- Script libraries are Workshop resources with the `script-library` category — they use the same dependency, versioning (semver), and resolution system as any other resource (see Dependency Declaration above)
- `require()` in the Lua sandbox resolves to installed Workshop dependencies, not filesystem paths — maintaining sandbox security
- Libraries are versioned independently — a library author can release 2.0 without breaking mods pinned to `^1.0`
- `ic mod check` validates that all `require()` calls in a mod resolve to declared dependencies
- Script libraries encourage specialization: AI behavior experts publish behavior libraries, UI specialists publish UI helper libraries, campaign designers share narrative utilities

This turns the Lua tier from "every mod reimplements common patterns" into a composable ecosystem — the same shift that made npm/crates.io transformative for their respective communities.

### License System

**Every published Workshop resource MUST have a `license` field.** Publishing without one is rejected.

```yaml
# In mod.yaml or resource manifest
mod:
  license: "CC-BY-SA-4.0"             # SPDX identifier (required for publishing)
```

- Uses [SPDX identifiers](https://spdx.org/licenses/) for machine-readable license classification
- Workshop UI displays license prominently on every resource listing
- `ic mod audit` checks the full dependency tree for license compatibility (e.g., CC-BY-NC dep in a CC-BY mod → warning)
- Common licenses for game assets: `CC-BY-4.0`, `CC-BY-SA-4.0`, `CC-BY-NC-4.0`, `CC0-1.0`, `MIT`, `GPL-3.0-only`, `LicenseRef-Custom` (with link to full text)
- Resources with incompatible licenses can coexist in the Workshop but `ic mod audit` warns when combining them
- **Optional EULA** for authors who need additional terms beyond SPDX (e.g., "no use in commercial products without written permission"). EULA cannot contradict the SPDX license. See `04-MODDING.md` § "Optional EULA"
- **Workshop Terms of Service (platform license):** By publishing, authors grant the platform minimum rights to host, cache, replicate, index, generate previews, serve as dependency, and auto-download in multiplayer — regardless of the resource's declared license. Same model as GitHub/npm/Steam Workshop. The ToS does not expand what *recipients* can do (that's the license) — it ensures the platform can mechanically operate. See `04-MODDING.md` § "Workshop Terms of Service"
- **Minimum age (COPPA):** Workshop accounts require users to be 13+. See `04-MODDING.md` § "Minimum Age Requirement"
- **Third-party content disclaimer:** IC is not liable for Workshop content. See `04-MODDING.md` § "Third-Party Content Disclaimer"
- **Privacy Policy:** Required before Workshop server deployment. Covers data collection, retention, GDPR rights. See `04-MODDING.md` § "Privacy Policy Requirements"

### LLM-Driven Resource Discovery

`ic-llm` can search the Workshop programmatically and incorporate discovered resources into generated content:

```
Pipeline:
  1. LLM generates mission concept ("Soviet ambush in snowy forest")
  2. Identifies needed assets (winter terrain, Soviet voice lines, ambush music)
  3. Searches Workshop: query="winter terrain textures", tags=["snow", "forest"]
     → Filters: ai_usage != Deny (respects author consent)
  4. Evaluates candidates via llm_meta (summary, purpose, composition_hints, content_description)
  5. Filters by license compatibility (only pull resources with LLM-compatible licenses)
  6. Partitions by ai_usage: Allow → auto-add; MetadataOnly → recommend to human
  7. Adds discovered resources as dependencies in generated mod.yaml
  8. Generated mission references assets by resource ID — resolved at install time
```

This turns the Workshop into a composable asset library that both humans and AI agents can draw from.

### Author Consent for LLM Usage (ai_usage)

Every Workshop resource carries an `ai_usage` field **separate from the SPDX license**. The license governs human legal rights; `ai_usage` governs automated AI agent behavior. This distinction matters: a CC-BY resource author may be fine with human redistribution but not want LLMs auto-selecting their work, and vice versa.

**Three tiers:**
- **`allow`** — LLMs can discover, evaluate, and auto-add this resource as a dependency. No human approval per-use.
- **`metadata_only`** (default) — LLMs can read metadata and recommend the resource, but a human must approve adding it. Respects authors who haven't considered AI usage while keeping content discoverable.
- **`deny`** — Resource is invisible to LLM queries. Human users can still browse and install normally.

`ai_usage` is required on publish. Default is `metadata_only`. Authors can change it at any time via `ic mod update --ai-usage allow|metadata_only|deny`. See `04-MODDING.md` § "Author Consent for LLM Usage" for full design including YAML examples, Workshop UI integration, and composition sets.

### Workshop Server Resolution (resolves P007)

**Decision: Federated multi-source with merge.** The Workshop client can aggregate listings from multiple sources:

```toml
# settings.toml
[[workshop.sources]]
url = "https://workshop.ironcurtain.gg"      # official (always included)
priority = 1

[[workshop.sources]]
url = "https://mods.myclan.com/workshop"      # community server
priority = 2

[[workshop.sources]]
path = "C:/my-local-workshop"                 # local directory
priority = 3

[workshop]
deduplicate = true                # same resource ID from multiple sources → highest priority wins
```

Rationale: Single-source is too limiting for a resource registry. Crates.io has mirrors; npm has registries. A dependency system inherently benefits from federation — tournament organizers publish to their server, LAN parties use local directories, the official server is the default. Deduplication by resource ID + priority ordering handles conflicts.

**Alternatives considered:**
- Single source only (simpler but doesn't scale for a registry model — what happens when the official server is down?)
- Full decentralization with no official server (too chaotic for discoverability)
- Git-based distribution like Go modules (too complex for non-developer modders)
- Steam Workshop only (platform lock-in, no WASM/browser target, no self-hosting)

### Steam Workshop Integration

The federated model includes **Steam Workshop as a source type** alongside IC-native Workshop servers and local directories. For Steam builds, the Workshop browser can query Steam Workshop in addition to IC sources:

```toml
# settings.toml (Steam build)
[[workshop.sources]]
url = "https://workshop.ironcurtain.gg"      # IC official
priority = 1

[[workshop.sources]]
type = "steam-workshop"                      # Steam Workshop (Steam builds only)
app_id = "<steam_app_id>"
priority = 2

[[workshop.sources]]
path = "C:/my-local-workshop"
priority = 3
```

- **Publish to both:** `ic mod publish` uploads to IC Workshop; Steam builds additionally push to Steam Workshop via Steamworks API. One command, dual publish.
- **Subscribe from either:** IC resources and Steam Workshop items appear in the same in-game browser (virtual view merges them).
- **Non-Steam builds are not disadvantaged.** IC's own Workshop is the primary registry. Steam Workshop is an optional distribution channel that broadens reach for creators on Steam.
- **Maps are the primary Steam Workshop content type** (matching Remastered's pattern). Full mods are better served by the IC Workshop due to richer metadata, dependency resolution, and federation.

### In-Game Workshop Browser

The Workshop is accessible from the main menu, not only via the `ic` CLI. The in-game browser provides:

- **Search** with full-text search (FTS5 via D034), category filters, tag filters, and sorting (popular, recent, trending, most-depended-on)
- **Resource detail pages** with description, screenshots/preview, license, author, download count, rating, dependency tree, changelog
- **One-click install** with automatic dependency resolution — same as `ic mod install` but from the game UI
- **Ratings and reviews** — 1-5 star rating plus optional text review per user per resource
- **Creator profiles** — browse all resources by a specific author, see their total downloads, reputation badges
- **Collections** — user-curated lists of resources ("My Competitive Setup", "Best Soviet Music"), shareable via link
- **Trending and featured** — algorithmically surfaced (time-weighted download velocity) plus editorially curated featured lists

### Auto-Download on Lobby Join

When a player joins a multiplayer lobby, the game automatically resolves and downloads any required mods, maps, or resource packs that the player doesn't have locally:

1. **Lobby advertises requirements:** The `GameListing` (see `03-NETCODE.md`) includes mod ID, version, and Workshop source for all required resources
2. **Client checks local cache:** Already have the exact version? Skip download.
3. **Missing resources auto-resolve:** Client queries the virtual Workshop repository, downloads missing resources via P2P (BitTorrent/WebTorrent — D049) with HTTP fallback. Lobby peers are prioritized as download sources (they already have the required content).
4. **Progress UI:** Download progress bar shown in lobby with source indicator (P2P/HTTP). Game start blocked until all players have all required resources.
5. **Rejection option:** Player can decline to download and leave the lobby instead.
6. **Size warning:** Downloads exceeding a configurable threshold (default 100MB) prompt confirmation before proceeding.

This matches CS:GO/CS2's pattern where community maps download automatically when joining a server — zero friction for players. It also solves ArmA Reforger's most-cited community complaint about mod management friction. P2P delivery means lobby auto-download is fast (peers in the same lobby are direct seeds) and free (no CDN cost per join). See D052 § "In-Lobby P2P Resource Sharing" for the full lobby protocol: room discovery, host-as-tracker, security model, and verification flow.

**Local resource lifecycle:** Resources downloaded this way are tagged as **transient** (not pinned). They remain fully functional but are subject to auto-cleanup after `transient_ttl_days` (default 30 days) of non-use. After the session, a non-intrusive toast offers: "[Pin (keep forever)] [They'll auto-clean in 30 days] [Remove now]". Frequently-used transient resources (3+ sessions) are automatically promoted to pinned. See D030 § "Local Resource Management" for the full lifecycle, storage budget, and cleanup UX.

### Creator Reputation System

Creators accumulate reputation through their Workshop activity. Reputation is displayed on resource listings and creator profiles:

| Signal              | Weight   | Description                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------------- |
| Total downloads     | Medium   | Cumulative downloads across all published resources                         |
| Average rating      | High     | Mean star rating across published resources (minimum 10 ratings to display) |
| Dependency count    | High     | How many other resources/mods depend on this creator's work                 |
| Publish consistency | Low      | Regular updates and new content over time                                   |
| Community reports   | Negative | DMCA strikes, policy violations reduce reputation                           |

**Badges:**
- **Verified** — identity confirmed (e.g., linked GitHub account)
- **Prolific** — 10+ published resources with ≥4.0 average rating
- **Foundation** — resources depended on by 50+ other resources
- **Curator** — maintains high-quality curated collections

Reputation is displayed but not gatekeeping — any registered user can publish. Reputation helps players discover trustworthy content in a growing registry.

### Content Moderation & DMCA/Takedown Policy

The Workshop requires a clear content policy and takedown process:

**Prohibited content:**
- Assets ripped from commercial games without permission (the ArmA community's perennial problem)
- Malicious content (WASM modules with harmful behavior — mitigated by capability sandbox)
- Content violating the license declared in its manifest
- Hate speech, illegal content (standard platform policy)

**Takedown process:**
1. **Reporter files takedown request** via Workshop UI or email, specifying the resource and the claim (DMCA, license violation, policy violation)
2. **Resource is flagged** — not immediately removed — and the author is notified with a 72-hour response window
3. **Author can counter-claim** (e.g., they hold the rights, the reporter is mistaken)
4. **Workshop moderators review** — if the claim is valid, the resource is delisted (not deleted — remains in local caches of existing users)
5. **Repeat offenders** accumulate strikes. Three strikes → account publishing privileges suspended. Appeals process available.
6. **DMCA safe harbor:** The Workshop server operator (official or community-hosted) follows standard DMCA safe harbor procedures. Community-hosted servers set their own moderation policies.

**License enforcement integration:**
- `ic mod audit` already checks dependency tree license compatibility
- Workshop server rejects publish if declared license conflicts with dependency licenses
- Resources with `LicenseRef-Custom` must provide a URL to full license text

**Rationale (from ArmA research):** ArmA's private mod ecosystem exists specifically because the Workshop can't protect creators or manage IP claims. Disney, EA, and others actively DMCA ArmA Workshop content. Bohemia established an IP ban list but the community found it heavy-handed. IC's approach: clear rules, due process, creator notification first — not immediate removal.

**Phase:** Minimal Workshop in Phase 4–5 (central server + publish + browse + auto-download); full Workshop (federation, Steam source, reputation, DMCA) in Phase 6a; preparatory work in Phase 3 (manifest format finalized).

---

---

## D031: Observability & Telemetry — OTEL Across Engine, Servers, and AI Pipeline

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Multi-phase (instrumentation foundation + server ops + advanced analytics/AI training pipelines)
- **Canonical for:** Unified telemetry/observability architecture, local-first telemetry storage, and optional OTEL export policy
- **Scope:** game client, relay/tracking/workshop servers, telemetry schema/storage, tracing/export pipeline, debugging and analytics tooling
- **Decision:** All components record structured telemetry to **local SQLite** as the primary sink using a shared schema; **OpenTelemetry is optional** export infrastructure for operators who want dashboards/traces.
- **Why:** Works offline, supports both players and operators, enables cross-component debugging (including desync analysis), and unifies gameplay/debug/ops/AI data collection under one instrumentation model.
- **Non-goals:** Requiring external collectors (Prometheus/OTEL backends) for normal operation; separate incompatible telemetry formats per component.
- **Invariants preserved:** Local-first data philosophy (D034/D061), offline-capable components, and mod/game agnosticism at the schema level.
- **Defaults / UX behavior:** Telemetry is recorded locally with retention/rotation; operators may optionally enable OTEL export for live dashboards.
- **Security / Trust impact:** Structured telemetry is designed for analysis without making external infrastructure mandatory; privacy-sensitive usage depends on the telemetry policy and field discipline in event payloads.
- **Performance / Ops impact:** Unified schema simplifies tooling and reduces operational complexity; tracing/puffin stack is chosen for low disabled overhead and production viability.
- **Public interfaces / types / commands:** shared `telemetry.db` schema, `tracing` instrumentation, optional OTEL exporters, analytics export/query tooling (see body)
- **Affected docs:** `src/06-SECURITY.md`, `src/03-NETCODE.md`, `src/decisions/09e-community.md` (D034/D061), `src/15-SERVER-GUIDE.md`
- **Revision note summary:** None
- **Keywords:** telemetry, observability, OTEL, OpenTelemetry, SQLite telemetry.db, tracing, puffin, local-first analytics, desync debugging

**Decision:** All components — game client, relay server, tracking server, workshop server — record structured telemetry to local SQLite as the primary sink. Every component runs fully offline; no telemetry depends on external infrastructure. OTEL (OpenTelemetry) is an optional export layer for server operators who want Grafana dashboards — it is never a requirement. The instrumentation layer is unified across all components, enabling operational monitoring, gameplay debugging, GUI usage analysis, pattern discovery, and AI/LLM training data collection.

**Rationale:**
- Backend servers (relay, tracking, workshop) are production infrastructure — they need health metrics, latency histograms, error rates, and distributed traces, just like any microservice
- The game engine already has rich internal state (per-tick `state_hash()`, snapshots, system execution times) but no structured way to export it for analysis
- Replay files capture *what happened* but not *why* — telemetry captures the engine's decision-making process (pathfinding time, order validation outcomes, combat resolution details) that replays miss
- Behavioral analysis (V12 anti-cheat) already collects APM, reaction times, and input entropy on the relay — OTEL is the natural export format for this data
- AI/LLM development needs training data: game telemetry (unit movements, build orders, engagement outcomes) is exactly the training corpus for `ic-ai` and `ic-llm`
- Bevy already integrates with Rust's `tracing` crate — OTEL export is a natural extension, not a foreign addition
- **Stack validated by production Rust game infrastructure:** Embark Studios' Quilkin (production game relay) uses the exact `tracing` + `prometheus` + OTEL stack IC targets, confirming it handles real game traffic at scale. Puffin (Embark's frame-based profiler) complements OTEL for per-tick instrumentation with ~1ns disabled overhead. IC's "zero cost when disabled" requirement is satisfied by puffin's `AtomicBool` guard and tracing's compile-time level filtering. See `research/embark-studios-rust-gamedev-analysis.md`
- Desync debugging needs cross-client correlation — distributed tracing (trace IDs) lets you follow an order from input → network → sim → render across multiple clients and the relay server
- A single instrumentation approach (OTEL) avoids the mess of ad-hoc logging, custom metrics files, separate debug protocols, and incompatible formats

**Key Design Elements:**

### Unified Local-First Storage

**Every component records telemetry to a local SQLite file. No exceptions.** This is the same principle as D034 (SQLite as embedded storage) and D061 (local-first data) applied to telemetry. The game client, relay server, tracking server, and workshop server all write to their own `telemetry.db` using an identical schema. No component depends on an external collector, dashboard, or aggregation service to function.

```sql
-- Identical schema on every component (client, relay, tracking, workshop)
CREATE TABLE telemetry_events (
    id            INTEGER PRIMARY KEY,
    timestamp     TEXT    NOT NULL,        -- ISO 8601 with microsecond precision
    session_id    TEXT    NOT NULL,        -- random per-process-lifetime
    component     TEXT    NOT NULL,        -- 'client', 'relay', 'tracking', 'workshop'
    game_module   TEXT,                    -- 'ra1', 'td', 'ra2', custom — set once per session (NULL on servers)
    mod_fingerprint TEXT,                  -- D062 SHA-256 mod profile fingerprint — updated on profile switch
    category      TEXT    NOT NULL,        -- event domain (see taxonomy below)
    event         TEXT    NOT NULL,        -- specific event name
    severity      TEXT    NOT NULL DEFAULT 'info',  -- 'trace','debug','info','warn','error'
    data          TEXT,                    -- JSON payload (structured, no PII)
    duration_us   INTEGER,                -- for events with measurable duration
    tick          INTEGER,                -- sim tick (gameplay/sim events only)
    correlation   TEXT                     -- trace ID for cross-component correlation
);

CREATE INDEX idx_telemetry_ts          ON telemetry_events(timestamp);
CREATE INDEX idx_telemetry_cat_event   ON telemetry_events(category, event);
CREATE INDEX idx_telemetry_session     ON telemetry_events(session_id);
CREATE INDEX idx_telemetry_game_module ON telemetry_events(game_module) WHERE game_module IS NOT NULL;
CREATE INDEX idx_telemetry_mod_fp      ON telemetry_events(mod_fingerprint) WHERE mod_fingerprint IS NOT NULL;
CREATE INDEX idx_telemetry_severity    ON telemetry_events(severity) WHERE severity IN ('warn', 'error');
CREATE INDEX idx_telemetry_correlation ON telemetry_events(correlation) WHERE correlation IS NOT NULL;
```

**Why one schema everywhere?** Aggregation scripts, debugging tools, and community analysis all work identically regardless of source. A relay operator can run the same `/analytics export` command as a player. Exported files from different components can be imported into a single SQLite database for cross-component analysis (desync debugging across client + relay). The aggregation tooling is a handful of SQL queries, not a specialized backend.

**Mod-agnostic by design, mod-aware by context.** The telemetry schema contains zero game-specific or mod-specific columns. Unit types, weapon names, building names, and resource types flow through as opaque strings — whatever the active mod's YAML defines. A total conversion mod's custom vocabulary (e.g., `unit_type: "Mammoth Mk.III"`) passes through unchanged without schema modification. The two denormalized context columns — `game_module` and `mod_fingerprint` — are set once per session on the client (updated on `ic profile activate` if the player switches mod profiles mid-session). On servers, these columns are populated per-game from lobby metadata. This means **every analytical query can be trivially filtered by game module or mod combination** without JOINing through `session.start`'s JSON payload:

```sql
-- Direct mod filtering — no JOINs needed
SELECT event, COUNT(*) FROM telemetry_events
WHERE game_module = 'ra1' AND category = 'input'
GROUP BY event ORDER BY COUNT(*) DESC;

-- Compare behavior across mod profiles
SELECT mod_fingerprint, AVG(json_extract(data, '$.apm')) AS avg_apm
FROM telemetry_events WHERE event = 'match.pace'
GROUP BY mod_fingerprint;
```

**Relay servers** set `game_module` and `mod_fingerprint` per-game from the lobby's negotiated settings — all events for that game inherit the context. When the relay hosts multiple concurrent games with different mods, each game's events carry the correct mod context independently.

**OTEL is an optional export layer, not the primary sink.** Server operators who want real-time dashboards (Grafana, Prometheus, Jaeger) can enable OTEL export — but it's a "nice-to-have" for sophisticated deployments, not a dependency. A community member running a relay server on a spare machine doesn't need to set up Prometheus. They get full telemetry in a SQLite file they can query with any SQL tool.

**Retention and rotation:** Each component's `telemetry.db` has a configurable max size (default: 100 MB for client, 500 MB for servers). When the limit is reached, the oldest events are pruned. `/analytics export` exports a date range to a separate file before pruning. Servers can also configure time-based retention (e.g., `telemetry.retention_days = 30`).

### Three Telemetry Signals (OTEL Standard)

| Signal  | What It Captures                                                  | Export Format        |
| ------- | ----------------------------------------------------------------- | -------------------- |
| Metrics | Counters, histograms, gauges — numeric time series                | OTLP → Prometheus    |
| Traces  | Distributed request flows — an order's journey through the system | OTLP → Jaeger/Zipkin |
| Logs    | Structured events with severity, context, correlation IDs         | OTLP → Loki/stdout   |

### Backend Server Telemetry (Relay, Tracking, Workshop)

Standard operational observability — same patterns used by any production Rust service. **All servers record to local SQLite** (`telemetry.db`) using the unified schema above. The OTEL metric names below double as the `event` field in the SQLite table — operators can query locally via SQL or optionally export to Prometheus/Grafana.

**Relay server metrics:**
```
relay.games.active                    # gauge: concurrent games
relay.games.total                     # counter: total games hosted
relay.orders.received                 # counter: orders received per tick
relay.orders.forwarded                # counter: orders broadcast
relay.orders.dropped                  # counter: orders missed (lag switch)
relay.tick.latency_ms                 # histogram: tick processing time
relay.player.rtt_ms                   # histogram: per-player round-trip time
relay.player.suspicion_score          # gauge: behavioral analysis score (V12)
relay.desync.detected                 # counter: desync events
relay.match.completed                 # counter: matches finished
relay.match.duration_s                # histogram: match duration
```

**Tracking server metrics:**
```
tracking.listings.active              # gauge: current game listings
tracking.heartbeats.received          # counter: heartbeats processed
tracking.heartbeats.expired           # counter: listings expired (TTL)
tracking.queries.total                # counter: browse/search requests
tracking.queries.latency_ms           # histogram: query latency
```

**Workshop server metrics:**
```
workshop.resources.total              # gauge: total published resources
workshop.resources.downloads          # counter: download events
workshop.resources.publishes          # counter: publish events
workshop.resolve.latency_ms           # histogram: dependency resolution time
workshop.resolve.conflicts            # counter: version conflicts detected
workshop.search.latency_ms            # histogram: search query time
```

#### Server-Side Structured Events (SQLite)

Beyond counters and gauges, each server records detailed structured events to `telemetry.db`. These are the events that actually enable troubleshooting and pattern analysis:

**Relay server events:**

| Event                 | JSON `data` Fields                                                                                            | Troubleshooting Value                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `relay.game.start`    | `game_id`, `map`, `player_count`, `settings_hash`, `balance_preset`, `game_module`, `mod_profile_fingerprint` | Which maps/settings/mods are popular?                       |
| `relay.game.end`      | `game_id`, `duration_s`, `ticks`, `outcome`, `player_count`                                                   | Match length distribution, completion vs. abandonment rates |
| `relay.player.join`   | `game_id`, `slot`, `rtt_ms`, `mod_profile_fingerprint`                                                        | Connection quality at join time, mod compatibility          |
| `relay.player.leave`  | `game_id`, `slot`, `reason` (quit/disconnect/kicked/timeout), `match_time_s`                                  | Why and when players leave — early ragequit vs. end-of-game |
| `relay.tick.process`  | `game_id`, `tick`, `order_count`, `process_us`, `stall_detected`                                              | Per-tick performance, stall diagnosis                       |
| `relay.order.forward` | `game_id`, `player`, `tick`, `order_type`, `sub_tick_us`, `size_bytes`                                        | Order volume, sub-tick fairness verification                |
| `relay.desync`        | `game_id`, `tick`, `diverged_players[]`, `hash_expected`, `hash_actual`                                       | Desync diagnosis — which tick, which players                |
| `relay.lag_switch`    | `game_id`, `player`, `gap_ms`, `orders_during_gap`                                                            | Cheating detection audit trail                              |
| `relay.suspicion`     | `game_id`, `player`, `score`, `contributing_factors{}`                                                        | Behavioral analysis transparency                            |

**Tracking server events:**

| Event                     | JSON `data` Fields                                                           | Troubleshooting Value                 |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| `tracking.listing.create` | `game_id`, `map`, `host_hash`, `settings_summary`                            | Game creation patterns                |
| `tracking.listing.expire` | `game_id`, `age_s`, `reason` (TTL/host_departed)                             | Why games disappear from the browser  |
| `tracking.query`          | `query_type` (browse/search/filter), `params`, `results_count`, `latency_ms` | Search effectiveness, popular filters |

**Workshop server events:**

| Event               | JSON `data` Fields                                          | Troubleshooting Value                             |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| `workshop.publish`  | `resource_id`, `type`, `version`, `size_bytes`, `dep_count` | Publishing patterns, resource sizes               |
| `workshop.download` | `resource_id`, `version`, `requester_hash`, `latency_ms`    | Download volume, popular resources                |
| `workshop.resolve`  | `root_resource`, `dep_count`, `conflicts`, `latency_ms`     | Dependency hell frequency, resolution performance |
| `workshop.search`   | `query`, `filters`, `results_count`, `latency_ms`           | What people are looking for, search quality       |

**Server export and analysis:** Every server supports the same commands as the client — `ic-server analytics export`, `ic-server analytics inspect`, `ic-server analytics clear`. A relay operator troubleshooting laggy matches runs a SQL query against their local `telemetry.db` — no Grafana required. The exported SQLite file can be attached to a bug report or shared with the project team, identical workflow to the client.

**Distributed traces:** A multiplayer game session gets a trace ID (the `correlation` field). Every order, tick, and desync event references this trace ID. Debug a desync by searching for the game's trace ID across the relay's `telemetry.db` and the affected clients' exported `telemetry.db` files — correlate events that crossed component boundaries. For operators with OTEL enabled, the same trace ID routes to Jaeger for visual timeline inspection.

**Health endpoints:** Every server exposes `/healthz` (already designed) and `/readyz`. Prometheus scrape endpoint at `/metrics` (when OTEL export is enabled). These are standard and compose with existing k8s deployment (Helm charts already designed in `03-NETCODE.md`).

### Game Engine Telemetry (Client-Side)

The engine emits structured telemetry for debugging, profiling, and AI training — but only when enabled. **Hot paths remain zero-cost when telemetry is disabled** (compile-time feature flag `telemetry`).

#### Performance Instrumentation

Per-tick system timing, already needed for the benchmark suite (`10-PERFORMANCE.md`), exported as OTEL metrics when enabled:

```
sim.tick.duration_us                  # histogram: total tick time
sim.system.apply_orders_us            # histogram: per-system time
sim.system.production_us
sim.system.harvesting_us
sim.system.movement_us
sim.system.combat_us
sim.system.death_us
sim.system.triggers_us
sim.system.fog_us
sim.entities.total                    # gauge: entity count
sim.entities.by_type                  # gauge: per-component-type count
sim.memory.scratch_bytes              # gauge: TickScratch buffer usage
sim.pathfinding.requests              # counter: pathfinding queries per tick
sim.pathfinding.cache_hits            # counter: flowfield cache reuse
sim.pathfinding.duration_us           # histogram: pathfinding computation time
```

#### Gameplay Event Stream

Structured events emitted during simulation — the raw material for AI training and replay enrichment:

```rust
/// Gameplay events emitted by the sim when telemetry is enabled.
/// These are structured, not printf-style — each field is queryable.
pub enum GameplayEvent {
    UnitCreated { tick: u64, entity: EntityId, unit_type: String, owner: PlayerId },
    UnitDestroyed { tick: u64, entity: EntityId, killer: Option<EntityId>, cause: DeathCause },
    CombatEngagement { tick: u64, attacker: EntityId, target: EntityId, weapon: String, damage: i32, remaining_hp: i32 },
    BuildingPlaced { tick: u64, entity: EntityId, structure_type: String, owner: PlayerId, position: WorldPos },
    HarvestDelivered { tick: u64, harvester: EntityId, resource_type: String, amount: i32, total_credits: i32 },
    OrderIssued { tick: u64, player: PlayerId, order: PlayerOrder, validated: bool, rejection_reason: Option<String> },
    PathfindingCompleted { tick: u64, entity: EntityId, from: WorldPos, to: WorldPos, path_length: u32, compute_time_us: u32 },
    DesyncDetected { tick: u64, expected_hash: u64, actual_hash: u64, player: PlayerId },
    StateSnapshot { tick: u64, state_hash: u64, entity_count: u32 },
}
```

These events are:
- **Emitted as OTEL log records** with structured attributes (not free-text — every field is filterable)
- **Collected locally** into a SQLite gameplay event log alongside replays (D034) — queryable with ad-hoc SQL without an OTEL stack
- **Optionally exported** to a collector for batch analysis (tournament servers, AI training pipelines)

#### State Inspection (Development & Debugging)

A debug overlay (via `bevy_egui`, already in the architecture) that reads live telemetry:

- Per-system tick time breakdown (bar chart)
- Entity count by type
- Network: RTT, order latency, jitter
- Memory: scratch buffer usage, component storage
- Pathfinding: active flowfields, cache hit rate
- Fog: cells updated this tick, stagger bucket
- Sim state hash (for manual desync comparison)

This is the "game engine equivalent of a Kubernetes dashboard" — operators of tournament servers or mod developers can inspect the engine's internal state in real-time.

### AI / LLM Training Data Pipeline

The gameplay event stream is the foundation for AI development:

| Consumer                      | Data Source                        | Purpose                                                                   |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `ic-ai` (skirmish AI)         | Gameplay events from human games   | Learn build orders, engagement timing, micro patterns                     |
| `ic-llm` (missions)           | Gameplay events + enriched replays | Learn what makes missions fun (engagement density, pacing, flow)          |
| `ic-editor` (replay→scenario) | Replay event log (SQLite)          | Direct extraction of waypoints, combat zones, build timelines into editor |
| `ic-llm` (replay→scenario)    | Replay event log + context         | Generate narrative, briefings, dialogue for replay-to-scenario pipeline   |
| Behavioral analysis           | Relay-side player profiles         | APM, reaction time, input entropy → suspicion scoring (V12)               |
| Balance analysis              | Aggregated match outcomes          | Win rates by faction/map/preset → balance tuning                          |
| Adaptive difficulty           | Per-player gameplay patterns       | Build speed, APM, unit composition → difficulty calibration               |
| Community analytics           | Workshop + match metadata          | Popular resources, play patterns, mod adoption → recommendations          |

**Privacy:** Gameplay events are associated with anonymized player IDs (hashed). No PII in telemetry. Players opt in to telemetry export (default: local-only for debugging). Tournament/ranked play may require telemetry for anti-cheat and certified results. See `06-SECURITY.md`.

**Data format:** Gameplay events export as structured OTEL log records → can be collected into Parquet/Arrow columnar format for batch ML training. The LLM training pipeline reads events, not raw replay bytes.

### Product Analytics — Comprehensive Client Event Taxonomy

The telemetry categories above capture what happens *in the simulation* (gameplay events, system timing) and on the *servers* (relay metrics, game lifecycle). A third domain is equally critical: **how players interact with the game itself** — which features are used, which are ignored, how people navigate the UI, how they play matches, and where they get confused or drop off.

This is the data that turns guessing into knowing: "42% of players never opened the career stats page," "players who use control groups average 60% higher APM," "the recovery phrase screen has a 60% skip rate — we should redesign the prompt," "right-click ordering outnumbers sidebar ordering 8:1 — invest in right-click UX, not sidebar polish."

**Core principle: the game client never phones home.** IC is an independent project — the client has zero dependency on any IC-hosted backend, analytics service, or telemetry endpoint. Product analytics are recorded to the local `telemetry.db` (same unified schema as every other component), stored locally, and stay local unless the player deliberately exports them. This matches the project's local-first philosophy (D034, D061) and ensures IC remains fully functional with no internet connectivity whatsoever.

**Design principles:**

1. **Offline-only by design.** The client contains no transmission code, no HTTP endpoints, no phone-home logic. There is no analytics backend to depend on, no infrastructure to maintain, no service to go offline.
2. **Player-owned data.** The `telemetry.db` file lives on the player's machine — the same open SQLite format they can query themselves (D034). It's their data. They can inspect it, export it, or delete it anytime.
3. **Voluntary export for bug reports.** `/analytics export` produces a self-contained file (JSON or SQLite extract) the player can review and attach to bug reports, forum posts, GitHub issues, or community surveys. The player decides when, where, and to whom they send it.
4. **Transparent and inspectable.** `/analytics inspect` shows exactly what's recorded. No hidden fields, no device fingerprinting. Players can query the SQLite table directly.
5. **Zero impact.** The game is fully functional with analytics recording on or off. No nag screens. Recording can be disabled via `telemetry.product_analytics` cvar (default: on for local recording).

**What product analytics explicitly does NOT capture:**
- Chat messages, player names, opponent names (no PII)
- Keystroke logging, raw mouse coordinates, screen captures
- Hardware identifiers, MAC addresses, IP addresses
- Filesystem contents, installed software, browser history

#### GUI Interaction Events

These events capture how the player navigates the interface — which screens they visit, which buttons they click, which features they discover, and where they spend their time. This is the primary source for UX insights.

| Event                  | JSON `data` Fields                                                                  | What It Reveals                                                          |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `gui.screen.open`      | `screen_id`, `from_screen`, `method` (button/hotkey/back/auto)                      | Navigation patterns — which screens do players visit? In what order?     |
| `gui.screen.close`     | `screen_id`, `duration_ms`, `next_screen`                                           | Time on screen — do players read the settings page for 2 seconds or 30?  |
| `gui.click`            | `widget_id`, `widget_type` (button/tab/toggle/slider/list_item), `screen`           | Which widgets get used? Which are dead space?                            |
| `gui.hotkey`           | `key_combo`, `action`, `context_screen`                                             | Hotkey adoption — are players discovering keyboard shortcuts?            |
| `gui.tooltip.shown`    | `widget_id`, `duration_ms`                                                          | Which UI elements confuse players enough to hover for a tooltip?         |
| `gui.sidebar.interact` | `tab`, `item_id`, `action` (select/scroll/queue/cancel), `method` (click/hotkey)    | Sidebar usage patterns — build queue behavior, tab switching             |
| `gui.minimap.interact` | `action` (camera_move/ping/attack_move/rally_point), `position_normalized`          | Minimap as input device — how often, for what?                           |
| `gui.build_placement`  | `structure_type`, `outcome` (placed/cancelled/invalid_position), `time_to_place_ms` | Build placement UX — how long does it take? How often do players cancel? |
| `gui.context_menu`     | `items_shown`, `item_selected`, `screen`                                            | Right-click menu usage and discoverability                               |
| `gui.scroll`           | `container_id`, `direction`, `distance`, `screen`                                   | Scroll depth — do players scroll through long lists?                     |
| `gui.panel.resize`     | `panel_id`, `old_size`, `new_size`                                                  | UI layout preferences                                                    |
| `gui.search`           | `context` (workshop/map_browser/settings/console), `query_length`, `results_count`  | Search usage patterns — what are players looking for?                    |

#### RTS Input Events

These events capture how the player actually plays the game — selection patterns, ordering habits, control group usage, camera behavior. This is the primary source for gameplay pattern analysis and understanding how players interact with the core RTS mechanics.

| Event               | JSON `data` Fields                                                                                                                                                                 | What It Reveals                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `input.select`      | `unit_count`, `method` (box_drag/click/ctrl_group/double_click/tab_cycle/select_all), `unit_types[]`                                                                               | Selection habits — do players use box select or control groups?                                            |
| `input.ctrl_group`  | `group_number`, `action` (assign/recall/append/steal), `unit_count`, `unit_types[]`                                                                                                | Control group adoption — which groups, how many units, reassignment frequency                              |
| `input.order`       | `order_type` (move/attack/attack_move/guard/patrol/stop/force_fire/deploy), `target_type` (ground/unit/building/none), `unit_count`, `method` (right_click/hotkey/minimap/sidebar) | How players issue orders — right-click vs. hotkey vs. sidebar? What order types dominate?                  |
| `input.build_queue` | `item_type`, `action` (queue/cancel/hold/repeat), `method` (click/hotkey), `queue_depth`, `queue_position`                                                                         | Build queue management — do players queue in advance or build-on-demand?                                   |
| `input.camera`      | `method` (edge_scroll/keyboard/minimap_click/ctrl_group_recall/base_hotkey/zoom_scroll/zoom_keyboard/zoom_pinch), `distance`, `duration_ms`, `zoom_level`                          | Camera control habits — which method dominates? How far do players scroll? What zoom levels are preferred? |
| `input.rally_point` | `building_type`, `position_type` (ground/unit/building), `distance_from_building`                                                                                                  | Rally point usage and placement patterns                                                                   |
| `input.waypoint`    | `waypoint_count`, `order_type`, `total_distance`                                                                                                                                   | Shift-queue / waypoint usage frequency and complexity                                                      |

#### Match Flow Events

These capture the lifecycle and pacing of matches — when they start, how they progress, why they end. The `match.pace` snapshot emitted periodically is particularly powerful: it creates a time-series of the player's economic and military state, enabling pace analysis, build order reconstruction, and difficulty curve assessment.

| Event                   | JSON `data` Fields                                                                                                                                                    | What It Reveals                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `match.start`           | `mode`, `map`, `player_count`, `ai_count`, `ai_difficulty`, `balance_preset`, `render_mode`, `game_module`, `mod_profile_fingerprint`                                 | What people play — which modes, maps, mods, settings                              |
| `match.pace`            | Emitted every 60s: `tick`, `apm`, `credits`, `power_balance`, `unit_count`, `army_value`, `tech_tier`, `buildings_count`, `harvesters_active`                         | Economic/military time-series — pacing, build order tendencies, when players peak |
| `match.end`             | `duration_s`, `outcome` (win/loss/draw/disconnect/surrender), `units_built`, `units_lost`, `credits_harvested`, `credits_spent`, `peak_army_value`, `peak_unit_count` | Win/loss context, game length, economic efficiency                                |
| `match.first_build`     | `structure_type`, `time_s`                                                                                                                                            | Build order opening — first building timing (balance indicator)                   |
| `match.first_combat`    | `time_s`, `attacker_units`, `defender_units`, `outcome`                                                                                                               | When does first blood happen? (game pacing metric)                                |
| `match.surrender_point` | `time_s`, `army_value_ratio`, `tech_tier_diff`, `credits_diff`                                                                                                        | At what resource/army deficit do players give up?                                 |
| `match.pause`           | `reason` (player/desync/lag_stall), `duration_s`                                                                                                                      | Pause frequency — desync vs. deliberate pauses                                    |

#### Session & Lifecycle Events

| Event                    | JSON `data` Fields                                                                                                                                     | What It Reveals                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `session.start`          | `engine_version`, `os`, `display_resolution`, `game_module`, `mod_profile_fingerprint`, `session_number` (incrementing per install)                    | Environment context — OS distribution, screen sizes, how many times they've launched                  |
| `session.mod_manifest`   | `game_module`, `mod_profile_fingerprint`, `unit_types[]`, `building_types[]`, `weapon_types[]`, `resource_types[]`, `faction_names[]`, `mod_sources[]` | Self-describing type vocabulary — makes exported telemetry interpretable without the mod's YAML files |
| `session.profile_switch` | `old_fingerprint`, `new_fingerprint`, `old_game_module`, `new_game_module`, `profile_name`                                                             | Mid-session mod profile changes — boundary marker for analytics segmentation                          |
| `session.end`            | `duration_s`, `reason` (quit/crash/update/system_sleep), `screens_visited[]`, `matches_played`, `features_used[]`                                      | Session shape — how long, what did they do, clean exit or crash?                                      |
| `session.idle`           | `screen_id`, `duration_s`                                                                                                                              | Idle detection — was the player AFK on the main menu for 20 minutes?                                  |

**`session.mod_manifest` rationale:** When telemetry records `unit_type: "HARV"` or `weapon: "Vulcan"`, these strings are meaningful only if you know the mod's type catalog. Without context, exported `telemetry.db` files require the original mod's YAML files to interpret event payloads. The `session.mod_manifest` event, emitted once per session (and again on `session.profile_switch`), captures the active mod's full type vocabulary — every unit, building, weapon, resource, and faction name defined in the loaded YAML rules. This makes exported telemetry **self-describing**: an analyst receiving a community-submitted `telemetry.db` can identify what `"HARV"` means without installing the mod. The manifest is typically 2–10 KB of JSON — negligible overhead for one event per session.

#### Settings & Configuration Events

| Event                  | JSON `data` Fields                                                           | What It Reveals                                               |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `settings.changed`     | `setting_path`, `old_value`, `new_value`, `screen`                           | Which defaults are wrong? What do players immediately change? |
| `settings.preset`      | `preset_type` (balance/theme/qol/render/experience), `preset_name`           | Preset popularity — Classic vs. Remastered vs. Modern         |
| `settings.mod_profile` | `action` (activate/create/delete/import/export), `profile_name`, `mod_count` | Mod profile adoption and management patterns                  |
| `settings.keybind`     | `action`, `old_key`, `new_key`                                               | Which keybinds do players remap? (ergonomics insight)         |

#### Onboarding Events

| Event                        | JSON `data` Fields                                                               | What It Reveals                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `onboarding.step`            | `step_id`, `step_name`, `action` (completed/skipped/abandoned), `time_on_step_s` | Where do new players drop off? Is the flow too long?                                         |
| `onboarding.tutorial`        | `tutorial_id`, `progress_pct`, `completed`, `time_spent_s`, `deaths`             | Tutorial completion and difficulty                                                           |
| `onboarding.first_use`       | `feature_id`, `session_number`, `time_since_install_s`                           | Feature discovery timeline — when do players first find the console? Career stats? Workshop? |
| `onboarding.recovery_phrase` | `action` (shown/written_confirmed/skipped), `time_on_screen_s`                   | Recovery phrase adoption — critical for D061 backup design                                   |

#### Error & Diagnostic Events

| Event            | JSON `data` Fields                                                     | What It Reveals                                                    |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `error.crash`    | `panic_message_hash`, `backtrace_hash`, `context` (screen/system/tick) | Crash frequency, clustering by context                             |
| `error.mod_load` | `mod_id`, `error_type`, `file_path_hash`                               | Which mods break? Which errors?                                    |
| `error.asset`    | `asset_path_hash`, `format`, `error_type`                              | Asset loading failures in the wild                                 |
| `error.desync`   | `tick`, `expected_hash`, `actual_hash`, `divergent_system_hint`        | Client-side desync evidence (correlates with relay `relay.desync`) |
| `error.network`  | `error_type`, `context` (connect/relay/workshop/tracking)              | Network failures by category                                       |
| `error.ui`       | `widget_id`, `error_type`, `screen`                                    | UI rendering/interaction bugs                                      |

#### Performance Sampling Events

Emitted periodically (not every frame — sampled to avoid overhead). These answer: "Are players hitting performance problems we don't see in development?"

| Event              | JSON `data` Fields                                                                   | Sampling Rate | What It Reveals                                                  |
| ------------------ | ------------------------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------- |
| `perf.frame`       | `p50_ms`, `p95_ms`, `p99_ms`, `max_ms`, `entity_count`, `draw_calls`, `gpu_time_ms`  | Every 10s     | Frame time distribution — who's struggling?                      |
| `perf.sim`         | `p50_us`, `p95_us`, `p99_us`, per-system `{system: us}` breakdown                    | Every 30s     | Sim tick budget — which systems are expensive for which players? |
| `perf.load`        | `what` (map/mod/assets/game_launch/screen), `duration_ms`, `size_bytes`              | On event      | Load times — how long does game startup take on real hardware?   |
| `perf.memory`      | `heap_bytes`, `component_storage_bytes`, `scratch_buffer_bytes`, `asset_cache_bytes` | Every 60s     | Memory pressure on real machines                                 |
| `perf.pathfinding` | `requests`, `cache_hits`, `cache_hit_rate`, `p95_compute_us`                         | Every 30s     | Pathfinding load in real matches                                 |

### Analytical Power: What Questions the Data Answers

The telemetry design above is intentionally structured for SQL queryability. Here are representative queries against the unified `telemetry_events` table that demonstrate the kind of insights this data enables — these queries work identically on client exports, server `telemetry.db` files, or aggregated community datasets:

**GUI & UX Insights:**

```sql
-- Which screens do players never visit?
SELECT json_extract(data, '$.screen_id') AS screen, COUNT(*) AS visits
FROM telemetry_events WHERE event = 'gui.screen.open'
GROUP BY screen ORDER BY visits ASC LIMIT 20;

-- How do players issue orders: right-click, hotkey, or sidebar?
SELECT json_extract(data, '$.method') AS method, COUNT(*) AS orders
FROM telemetry_events WHERE event = 'input.order'
GROUP BY method ORDER BY orders DESC;

-- Which settings do players change within the first session?
SELECT json_extract(data, '$.setting_path') AS setting,
       json_extract(data, '$.old_value') AS default_val,
       json_extract(data, '$.new_value') AS changed_to,
       COUNT(*) AS changes
FROM telemetry_events e
JOIN (SELECT DISTINCT session_id FROM telemetry_events
      WHERE event = 'session.start'
      AND json_extract(data, '$.session_number') = 1) first
  ON e.session_id = first.session_id
WHERE e.event = 'settings.changed'
GROUP BY setting ORDER BY changes DESC;

-- Control group adoption: what percentage of matches use ctrl groups?
SELECT
  COUNT(DISTINCT CASE WHEN event = 'input.ctrl_group' THEN session_id END) * 100.0 /
  COUNT(DISTINCT CASE WHEN event = 'match.start' THEN session_id END) AS pct_matches_with_ctrl_groups
FROM telemetry_events WHERE event IN ('input.ctrl_group', 'match.start');
```

**Gameplay Pattern Insights:**

```sql
-- Average match duration by mode and map
SELECT json_extract(data, '$.mode') AS mode,
       json_extract(data, '$.map') AS map,
       AVG(json_extract(data, '$.duration_s')) AS avg_duration_s,
       COUNT(*) AS matches
FROM telemetry_events WHERE event = 'match.end'
GROUP BY mode, map ORDER BY matches DESC;

-- Build order openings: what do players build first?
SELECT json_extract(data, '$.structure_type') AS first_building,
       COUNT(*) AS frequency,
       AVG(json_extract(data, '$.time_s')) AS avg_time_s
FROM telemetry_events WHERE event = 'match.first_build'
GROUP BY first_building ORDER BY frequency DESC;

-- APM distribution across the player base
SELECT
  CASE WHEN apm < 30 THEN 'casual (<30)'
       WHEN apm < 80 THEN 'intermediate (30-80)'
       WHEN apm < 150 THEN 'advanced (80-150)'
       ELSE 'expert (150+)' END AS skill_bucket,
  COUNT(*) AS snapshots
FROM (SELECT CAST(json_extract(data, '$.apm') AS INTEGER) AS apm
      FROM telemetry_events WHERE event = 'match.pace')
GROUP BY skill_bucket;

-- At what deficit do players surrender?
SELECT AVG(json_extract(data, '$.army_value_ratio')) AS avg_army_ratio,
       AVG(json_extract(data, '$.credits_diff')) AS avg_credit_diff,
       COUNT(*) AS surrenders
FROM telemetry_events WHERE event = 'match.surrender_point';
```

**Troubleshooting Insights:**

```sql
-- Crash frequency by context (which screen/system crashes most?)
SELECT json_extract(data, '$.context') AS context,
       json_extract(data, '$.backtrace_hash') AS stack,
       COUNT(*) AS occurrences
FROM telemetry_events WHERE event = 'error.crash'
GROUP BY context, stack ORDER BY occurrences DESC LIMIT 20;

-- Desync correlation: which maps/mods trigger desyncs?
-- (run across aggregated relay + client exports)
SELECT json_extract(data, '$.map') AS map,
       COUNT(CASE WHEN event = 'relay.desync' THEN 1 END) AS desyncs,
       COUNT(CASE WHEN event = 'relay.game.end' THEN 1 END) AS total_games,
       ROUND(COUNT(CASE WHEN event = 'relay.desync' THEN 1 END) * 100.0 /
             NULLIF(COUNT(CASE WHEN event = 'relay.game.end' THEN 1 END), 0), 1) AS desync_pct
FROM telemetry_events
WHERE event IN ('relay.desync', 'relay.game.end')
GROUP BY map ORDER BY desync_pct DESC;

-- Performance: which players have sustained frame drops?
SELECT session_id,
       AVG(json_extract(data, '$.p95_ms')) AS avg_p95_frame_ms,
       MAX(json_extract(data, '$.entity_count')) AS peak_entities
FROM telemetry_events WHERE event = 'perf.frame'
GROUP BY session_id
HAVING avg_p95_frame_ms > 33.3  -- below 30 FPS sustained
ORDER BY avg_p95_frame_ms DESC;
```

**Aggregation happens in the open, not in a backend.** If the project team wants to analyze telemetry across many players (e.g., for a usability study, balance patch, or release retrospective), they ask the community to voluntarily submit exports — the same model as open-source projects collecting crash dumps on GitHub. Community members run `/analytics export`, review the file, and attach it. Aggregation scripts live in the repository and run locally — anyone can reproduce the analysis.

**Console commands (D058) — identical on client and server:**

| Command                                                        | Action                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/analytics status`                                            | Show recording status, event count, `telemetry.db` size, retention settings       |
| `/analytics inspect [category] [--last N]`                     | Display recent events, optionally filtered by category                            |
| `/analytics export [--from DATE] [--to DATE] [--category CAT]` | Export to JSON/SQLite in `<data_dir>/exports/` with optional date/category filter |
| `/analytics clear [--before DATE]`                             | Delete events, optionally only before a date                                      |
| `/analytics on/off`                                            | Toggle local recording (`telemetry.product_analytics` cvar)                       |
| `/analytics query SQL`                                         | Run ad-hoc SQL against `telemetry.db` (dev console only, `DEV_ONLY` flag)         |

### Architecture: Where Telemetry Lives

**Primary path (always-on): local SQLite.** Every component writes to its own `telemetry.db`. This is the ground truth. No network, no infrastructure, no dependencies.

```
  ┌─────────────────────────────────────────────────────────────────┐
  │ Every component (client, relay, tracking, workshop)             │
  │                                                                 │
  │  Instrumentation    ──►  telemetry.db (local SQLite)            │
  │  (tracing + events)      ├── always written                     │
  │                          ├── /analytics inspect                 │
  │                          ├── /analytics export ──► .json file   │
  │                          │   (voluntary: bug report, feedback)  │
  │                          └── retention: max size / max age      │
  └─────────────────────────────────────────────────────────────────┘
```

**Optional path (server operators only): OTEL export.** Server operators who want real-time dashboards can enable OTEL export alongside the SQLite sink. This is a deployment choice for sophisticated operators — never a requirement.

```
  Servers with OTEL enabled:

  telemetry.db ◄── Instrumentation ──► OTEL Collector (optional)
  (always)         (tracing + events)       │
                                     ┌──────┴──────────────────┐
                                     │          │              │
                              ┌──────▼──┐ ┌────▼────┐ ┌───────▼───┐
                              │Prometheus│ │ Jaeger  │ │   Loki    │
                              │(metrics) │ │(traces) │ │(logs)     │
                              └──────────┘ └─────────┘ └─────┬─────┘
                                                             │
                                                      ┌──────▼──────┐
                                                      │ AI Training  │
                                                      │ (Parquet→ML) │
                                                      └─────────────┘
```

The dual-write approach means:
- **Every deployment** gets full telemetry in SQLite — zero setup required
- **Sophisticated deployments** can additionally route to Grafana/Prometheus/Jaeger for real-time dashboards
- Self-hosters can route OTEL to whatever they want (Grafana Cloud, Datadog, or just stdout)
- If the OTEL collector goes down, telemetry continues in SQLite uninterrupted — no data loss

### Implementation Approach

**Rust ecosystem:**
- `tracing` crate — Bevy already uses this; add structured fields and span instrumentation
- `opentelemetry` + `opentelemetry-otlp` crates — OTEL SDK for Rust
- `tracing-opentelemetry` — bridges `tracing` spans to OTEL traces
- `metrics` crate — lightweight counters/histograms, exported via OTEL

**Zero-cost engine instrumentation when disabled:** The `telemetry` feature flag gates **engine-level** instrumentation (per-system tick timing, `GameplayEvent` stream, OTEL export) behind `#[cfg(feature = "telemetry")]`. When disabled, all engine telemetry calls compile to no-ops. No runtime cost, no allocations, no branches. This respects invariant #5 (efficiency-first performance).

**Product analytics (GUI interaction, session, settings, onboarding, errors, perf sampling) always record to SQLite** — they are lightweight structured event inserts, not per-tick instrumentation. The overhead is negligible (one SQLite INSERT per user action, batched in WAL mode). Players who want to disable even this can set `telemetry.product_analytics false`.

**Transaction batching:** All SQLite INSERTs — both telemetry events and gameplay events — are explicitly batched in transactions to avoid per-INSERT fsync overhead:

| Event source      | Batch strategy                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Product analytics | Buffered in memory; flushed in a single `BEGIN`/`COMMIT` every 1 second or 50 events, whichever first   |
| Gameplay events   | Buffered per tick; flushed in a single `BEGIN`/`COMMIT` at end of tick (typically 1-20 events per tick) |
| Server telemetry  | Ring buffer; flushed in a single `BEGIN`/`COMMIT` every 100 ms or 200 events, whichever first           |

All writes happen on a dedicated I/O thread (or `spawn_blocking` task) — never on the game loop thread. The game loop thread only appends to a lock-free ring buffer; the I/O thread drains and commits. This guarantees that SQLite contention (including `busy_timeout` waits and WAL checkpoints) cannot cause frame drops.

**Ring buffer sizing:** The ring buffer must absorb all events generated during the worst-case I/O thread stall (WAL checkpoint on HDD: 200–500 ms). At peak event rates (~600 events/s during intense combat — gameplay events + telemetry + product analytics combined), a 500 ms stall generates ~300 events. **Minimum ring buffer capacity: 1024 entries** (3.4× headroom over worst-case). Each entry is a lightweight enum (~64–128 bytes), so the buffer occupies ~64–128 KB — negligible. If the buffer fills despite this sizing, events are dropped with a counter increment (same pattern as the replay writer's `frames_lost` tracking in V45). The I/O thread logs a warning on drain if drops occurred. This is a last-resort safety net, not an expected operating condition.

**Build configurations:**
| Build               | Engine Telemetry | Product Analytics (SQLite) | OTEL Export | Use case                                   |
| ------------------- | ---------------- | -------------------------- | ----------- | ------------------------------------------ |
| `release`           | Off              | On (local SQLite)          | Off         | Player-facing builds — minimal overhead    |
| `release-telemetry` | On               | On (local SQLite)          | Optional    | Tournament servers, AI training, debugging |
| `debug`             | On               | On (local SQLite)          | Optional    | Development — full instrumentation         |

### Self-Hosting Observability

Community server operators get observability for free. The docker-compose.yaml (already designed in `03-NETCODE.md`) can optionally include a Grafana + Prometheus + Loki stack:

```yaml
# docker-compose.observability.yaml (optional overlay)
services:
  otel-collector:
    image: otel/opentelemetry-collector:latest
    ports:
      - "4317:4317"    # OTLP gRPC
  prometheus:
    image: prom/prometheus:latest
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"    # dashboards
  loki:
    image: grafana/loki:latest
```

Pre-built Grafana dashboards ship with the project:
- **Relay Dashboard:** active games, player RTT, orders/sec, desync events, suspicion scores
- **Tracking Dashboard:** listings, heartbeats, query rates
- **Workshop Dashboard:** downloads, publishes, dependency resolution times
- **Engine Dashboard:** tick times, entity counts, system breakdown, pathfinding stats

**Alternatives considered:**
- Custom metrics format (less work initially, but no ecosystem — no Grafana, no alerting, no community tooling)
- StatsD (simpler but metrics-only — no traces, no structured logs, no distributed correlation)
- No telemetry (leaves operators blind and AI training without data)
- Always-on telemetry (violates performance invariant — must be zero-cost when disabled)

**Phase:** Unified `telemetry_events` SQLite schema + `/analytics` console commands in Phase 2 (shared across all components from day one). Engine telemetry (per-system timing, `GameplayEvent` stream) in Phase 2 (sim). Product analytics (GUI interaction, session, settings, onboarding, errors, performance sampling) in Phase 3 (alongside UI chrome). Server-side SQLite telemetry recording (relay, tracking, workshop) in Phase 5 (multiplayer). Optional OTEL export layer for server operators in Phase 5. Pre-built Grafana dashboards in Phase 5. AI training pipeline in Phase 7 (LLM).

---

---

## D034: SQLite as Embedded Storage for Services and Client

**Decision:** Use SQLite (via `rusqlite`) as the embedded database for all backend services that need persistent state and for the game client's local metadata indices. No external database dependency required for any deployment.

**What this means:** Every service that persists data beyond a single process lifetime uses an embedded SQLite database file. The "just a binary" philosophy (see `03-NETCODE.md` § Backend Infrastructure) is preserved — an operator downloads a binary, runs it, and persistence is a `.db` file next to the executable. No PostgreSQL, no MySQL, no managed database service.

**Where SQLite is used:**

### Backend Services

| Service                | What it stores                                                                                                              | Why not in-memory                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Relay server**       | `CertifiedMatchResult` records, `DesyncReport` events, `PlayerBehaviorProfile` history, replay archive metadata             | Match results and behavioral data are valuable beyond the game session — operators need to query desync patterns, review suspicion scores, link replays to match records. A relay restart shouldn't erase match history. |
| **Workshop server**    | Resource metadata, versions, dependencies, download counts, ratings, search index (FTS5), license data, replication cursors | This is a package registry — functionally equivalent to crates.io's data layer. Search, dependency resolution, and version queries are relational workloads.                                                             |
| **Matchmaking server** | Player ratings (Glicko-2), match history, seasonal league data, leaderboards                                                | Ratings and match history must survive restarts. Leaderboard queries (`top N`, per-faction, per-map) are natural SQL.                                                                                                    |
| **Tournament server**  | Brackets, match results, map pool votes, community reports                                                                  | Tournament state spans hours/days; must survive restarts. Bracket queries and result reporting are relational.                                                                                                           |

### Game Client (local)

| Data                   | What it stores                                                                   | Benefit                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Replay catalog**     | Player names, map, factions, date, duration, result, file path, signature status | Browse and search local replays without scanning files on disk. Filter by map, opponent, date range.                                                                                                                                                                                                                                                                                                                                 |
| **Save game index**    | Save name, campaign, mission, timestamp, playtime, thumbnail path                | Fast save browser without deserializing every save file on launch.                                                                                                                                                                                                                                                                                                                                                                   |
| **Workshop cache**     | Downloaded resource metadata, versions, checksums, dependency graph              | Offline dependency resolution. Know what's installed without scanning the filesystem.                                                                                                                                                                                                                                                                                                                                                |
| **Map catalog**        | Map name, player count, size, author, source (local/workshop/OpenRA), tags       | Browse local maps from all sources with a single query.                                                                                                                                                                                                                                                                                                                                                                              |
| **Gameplay event log** | Structured `GameplayEvent` records (D031) per game session                       | Queryable post-game analysis without an OTEL stack. Frequently-aggregated fields (`event_type`, `unit_type_id`, `target_type_id`) are denormalized as indexed columns for fast `PlayerStyleProfile` building (D042). Full payloads remain in `data_json` for ad-hoc SQL: `SELECT json_extract(data_json, '$.weapon'), AVG(json_extract(data_json, '$.damage')) FROM gameplay_events WHERE event_type = 'combat' AND session_id = ?`. |
| **Asset index**        | `.mix` archive contents, MiniYAML conversion cache (keyed by file hash)          | Skip re-parsing on startup. Know which `.mix` contains which file without opening every archive.                                                                                                                                                                                                                                                                                                                                     |

### Where SQLite is NOT used

| Area                | Why not                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`ic-sim`**        | No I/O in the sim. Ever. Invariant #1.                                                                                                                 |
| **Tracking server** | Truly ephemeral data — game listings with TTL. In-memory is correct.                                                                                   |
| **Hot paths**       | No DB queries per tick. All SQLite access is at load time, between games, or on UI/background threads.                                                 |
| **Save game data**  | Save files are serde-serialized sim snapshots loaded as a whole unit. No partial queries needed. SQLite indexes their *metadata*, not their *content*. |
| **Campaign state**  | Loaded/saved as a unit inside save games. Fits in memory. No relational queries.                                                                       |

### Why SQLite specifically

**The strategic argument: SQLite is the world's most widely deployed database format.** Choosing SQLite means IC's player data isn't locked behind a proprietary format that only IC can read — it's stored in an open, standardized, universally-supported container that anything can query. Python scripts, R notebooks, Jupyter, Grafana, Excel (via ODBC), DB Browser for SQLite, the `sqlite3` CLI, Datasette, LLM agents, custom analytics tools, research projects, community stat trackers, third-party companion apps — all of them can open an IC `.db` file and run SQL against it with zero IC-specific tooling. This is a deliberate architectural choice: **player data is a platform, not a product feature.** The community can build things on top of IC's data that we never imagined, using tools we've never heard of, because the interface is SQL — not a custom binary format, not a REST API that requires our servers to be running, not a proprietary export.

Every use case the community might invent — balance analysis, AI training datasets, tournament statistics, replay research, performance benchmarking, meta-game tracking, coach feedback tools, stream overlays reading live stat data — is a SQL query away. No SDK required. No reverse engineering. No waiting for us to build an export feature. The `.db` file IS the export.

This is also why SQLite is chosen over flat files (JSON, CSV): structured data in a relational schema with SQL query support enables questions that flat files can't answer efficiently. "What's my win rate with Soviet on maps larger than 128×128 against players I've faced more than 3 times?" is a single SQL query against `matches` + `match_players`. With JSON files, it's a custom script.

**The practical arguments:**

- **`rusqlite`** is a mature, well-maintained Rust crate with no unsafe surprises
- **Single-file database** — fits the "just a binary" deployment model. No connection strings, no separate database process, no credentials to manage
- **Self-hosting alignment** — a community relay operator on a €5 VPS gets persistent match history without installing or operating a database server
- **FTS5 full-text search** — covers workshop resource search and replay text search without Elasticsearch or a separate search service
- **WAL mode** — handles concurrent reads from web endpoints while a single writer persists new records. Sufficient for community-scale deployments (hundreds of concurrent users, not millions)
- **WASM-compatible** — `sql.js` (Emscripten build of SQLite) or `sqlite-wasm` for the browser target. The client-side replay catalog and gameplay event log work in the browser build
- **Ad-hoc investigation** — any operator can open the `.db` file in DB Browser for SQLite, DBeaver, or the `sqlite3` CLI and run queries immediately. No Grafana dashboards required. This fills the gap between "just stdout logs" and "full OTEL stack" for community self-hosters
- **Backup-friendly** — `VACUUM INTO` produces a self-contained, compacted copy safe to take while the database is in use (D061). A backup is just a file copy. No dump/restore ceremony
- **Immune to bitrot** — The Library of Congress recommends SQLite as a storage format for datasets. IC player data from 2027 will still be readable in 2047 — the format is that stable
- **Deterministic and testable** — in CI, gameplay event assertions are SQL queries against a test fixture database. No mock infrastructure needed

### Relationship to D031 (OTEL Telemetry)

D031 (OTEL) and D034 (SQLite) are complementary, not competing:

| Concern                   | D031 (OTEL)                                  | D034 (SQLite)                                                          |
| ------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| **Real-time monitoring**  | Yes — Prometheus metrics, Grafana dashboards | No                                                                     |
| **Distributed tracing**   | Yes — Jaeger traces across clients and relay | No                                                                     |
| **Persistent records**    | No — metrics are time-windowed, logs rotate  | Yes — match history, ratings, replays are permanent                    |
| **Ad-hoc investigation**  | Requires OTEL stack running                  | Just open the `.db` file                                               |
| **Offline operation**     | No — needs collector + backends              | Yes — works standalone                                                 |
| **Client-side debugging** | Requires exporting to a collector            | Local `.db` file, queryable immediately                                |
| **AI training pipeline**  | Yes — Parquet/Arrow export for ML            | Source data — gameplay events could be exported from SQLite to Parquet |

OTEL is for operational monitoring and distributed debugging. SQLite is for persistent records, metadata indices, and standalone investigation. Tournament servers and relay servers use both — OTEL for dashboards, SQLite for match history.

### Consumers of Player Data

SQLite isn't just infrastructure — it's a UX pillar. Multiple crates read the client-side database to deliver features no other RTS offers:

| Consumer                         | Crate             | What it reads                                                                          | What it produces                                                                                                  | Required?                                                 |
| -------------------------------- | ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Player-facing analytics**      | `ic-ui`           | `gameplay_events`, `matches`, `match_players`, `campaign_missions`, `roster_snapshots` | Post-game stats screen, career stats page, campaign dashboard with roster/veterancy graphs, mod balance dashboard | Always on                                                 |
| **Adaptive AI**                  | `ic-ai`           | `matches`, `match_players`, `gameplay_events`                                          | Difficulty adjustment, build order variety, counter-strategy selection based on player tendencies                 | Always on                                                 |
| **LLM personalization**          | `ic-llm`          | `matches`, `gameplay_events`, `campaign_missions`, `roster_snapshots`                  | Personalized missions, adaptive briefings, post-match commentary, coaching suggestions, rivalry narratives        | **Optional** — requires BYOLLM provider configured (D016) |
| **Player style profiles** (D042) | `ic-ai`           | `gameplay_events`, `match_players`, `matches`                                          | `player_profiles` table — aggregated behavioral models for local player + opponents                               | Always on (profile building)                              |
| **Training system** (D042)       | `ic-ai` + `ic-ui` | `player_profiles`, `training_sessions`, `gameplay_events`                              | Quick training scenarios, weakness analysis, progress tracking                                                    | Always on (training UI)                                   |

Player analytics, adaptive AI, player style profiles, and the training system are always available. LLM personalization and coaching activate only when the player has configured an LLM provider — the game is fully functional without it.

All consumers are read-only. The sim writes nothing (invariant #1) — `gameplay_events` are recorded by a Bevy observer system outside `ic-sim`, and `matches`/`campaign_missions` are written at session boundaries.

### Player-Facing Analytics (`ic-ui`)

No other RTS surfaces your own match data this way. SQLite makes it trivial — queries run on a background thread, results drive a lightweight chart component in `ic-ui` (Bevy 2D: line, bar, pie, heatmap, stacked area).

**Post-game stats screen** (after every match):
- Unit production timeline (stacked area: units built per minute by type)
- Resource income/expenditure curves
- Combat engagement heatmap (where fights happened on the map)
- APM over time, army value graph, tech tree timing
- Head-to-head comparison table vs opponent
- All data: `SELECT ... FROM gameplay_events WHERE session_id = ?`

**Career stats page** (main menu):
- Win rate by faction, map, opponent, game mode — over time and lifetime
- Rating history graph (Glicko-2 from matchmaking, synced to local DB)
- Most-used units, highest kill-count units, signature strategies
- Session history: date, map, opponent, result, duration — clickable → replay
- All data: `SELECT ... FROM matches JOIN match_players ...`

**Campaign dashboard** (D021 integration):
- Roster composition graph per mission (how your army evolves across the campaign)
- Veterancy progression: track named units across missions (the tank that survived from mission 1)
- Campaign path visualization: which branches you took, which missions you replayed
- Performance trends: completion time, casualties, resource efficiency per mission
- All data: `SELECT ... FROM campaign_missions JOIN roster_snapshots ...`

**Mod balance dashboard** (Phase 7, for mod developers):
- Unit win-rate contribution, cost-efficiency scatter plots, engagement outcome distributions
- Compare across balance presets (D019) or mod versions
- `ic mod stats` CLI command reads the same SQLite database
- All data: `SELECT ... FROM gameplay_events WHERE mod_id = ?`

### LLM Personalization (`ic-llm`) — Optional, BYOLLM

When a player has configured an LLM provider (see BYOLLM in D016), `ic-llm` reads the local SQLite database (read-only) and injects player context into generation prompts. This is entirely optional — every game feature works without it. No data leaves the device unless the user's chosen LLM provider is cloud-based.

**Personalized mission generation:**
- "You've been playing Soviet heavy armor for 12 games. Here's a mission that forces infantry-first tactics."
- "Your win rate drops against Allied naval. This coastal defense mission trains that weakness."
- Prompt includes: faction preferences, unit usage patterns, win/loss streaks, map size preferences — all from SQLite aggregates.

**Adaptive briefings:**
- Campaign briefings reference your actual roster: "Commander, your veteran Tesla Tank squad from Vladivostok is available for this operation."
- Difficulty framing adapts to performance: struggling player gets "intel reports suggest light resistance"; dominant player gets "expect fierce opposition."
- Queries `roster_snapshots` and `campaign_missions` tables.

**Post-match commentary:**
- LLM generates a narrative summary of the match from `gameplay_events`: "The turning point was at 8:42 when your MiG strike destroyed the Allied War Factory, halting tank production for 3 minutes."
- Highlights unusual events: first-ever use of a unit type, personal records, close calls.
- Optional — disabled by default, requires LLM provider configured.

**Coaching suggestions:**
- "You built 40 Rifle Infantry across 5 games but they had a 12% survival rate. Consider mixing in APCs for transport."
- "Your average expansion timing is 6:30. Top players expand at 4:00-5:00."
- Queries aggregate statistics from `gameplay_events` across multiple sessions.

**Rivalry narratives:**
- Track frequent opponents from `matches` table: "You're 3-7 against PlayerX. They favor Allied air rushes — here's a counter-strategy mission."
- Generate rivalry-themed campaign missions featuring opponent tendencies.

### Adaptive AI (`ic-ai`)

`ic-ai` reads the player's match history to calibrate skirmish and campaign AI behavior. No learning during the match — all adaptation happens between games by querying SQLite.

- **Difficulty scaling:** AI selects from difficulty presets based on player win rate over recent N games. Avoids both stomps and frustration.
- **Build order variety:** AI avoids repeating the same strategy the player has already beaten. Queries `gameplay_events` for AI build patterns the player countered successfully.
- **Counter-strategy selection:** If the player's last 5 games show heavy tank play, AI is more likely to choose anti-armor compositions.
- **Campaign-specific:** In branching campaigns (D021), AI reads the player's roster strength from `roster_snapshots` and adjusts reinforcement timing accordingly.

This is designer-authored adaptation (the AI author sets the rules for how history influences behavior), not machine learning. The SQLite queries are simple aggregates run at mission load time.

**Fallback:** When no match history is available (first launch, empty database, WASM/headless builds without SQLite), `ic-ai` falls back to default difficulty presets and random strategy selection. All SQLite reads are behind an `Option<impl AiHistorySource>` — the AI is fully functional without it, just not personalized.

### Client-Side Schema (Key Tables)

```sql
-- Match history (synced from matchmaking server when online, always written locally)
CREATE TABLE matches (
    id              INTEGER PRIMARY KEY,
    session_id      TEXT NOT NULL UNIQUE,
    map_name        TEXT NOT NULL,
    game_mode       TEXT NOT NULL,
    balance_preset  TEXT NOT NULL,
    mod_id          TEXT,
    duration_ticks  INTEGER NOT NULL,
    started_at      TEXT NOT NULL,
    replay_path     TEXT,
    replay_hash     BLOB
);

CREATE TABLE match_players (
    match_id    INTEGER REFERENCES matches(id),
    player_name TEXT NOT NULL,
    faction     TEXT NOT NULL,
    team        INTEGER,
    result      TEXT NOT NULL,  -- 'victory', 'defeat', 'disconnect', 'draw'
    is_local    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (match_id, player_name)
);

-- Gameplay events (D031 structured events, written per session)
-- Top fields denormalized as indexed columns to avoid json_extract() scans
-- during PlayerStyleProfile aggregation (D042). The full payload remains in
-- data_json for ad-hoc SQL queries and mod developer analytics.
CREATE TABLE gameplay_events (
    id              INTEGER PRIMARY KEY,
    session_id      TEXT NOT NULL,
    tick            INTEGER NOT NULL,
    event_type      TEXT NOT NULL,       -- 'unit_built', 'unit_killed', 'building_placed', ...
    player          TEXT,
    game_module     TEXT,                -- denormalized: 'ra1', 'td', 'ra2', custom (set once per session)
    mod_fingerprint TEXT,                -- denormalized: D062 SHA-256 (updated on profile switch)
    unit_type_id    INTEGER,             -- denormalized: interned unit type (nullable for non-unit events)
    target_type_id  INTEGER,             -- denormalized: interned target type (nullable)
    data_json       TEXT NOT NULL        -- event-specific payload (full detail)
);
CREATE INDEX idx_ge_session_event ON gameplay_events(session_id, event_type);
CREATE INDEX idx_ge_game_module ON gameplay_events(game_module) WHERE game_module IS NOT NULL;
CREATE INDEX idx_ge_unit_type ON gameplay_events(unit_type_id) WHERE unit_type_id IS NOT NULL;

-- Campaign state (D021 branching campaigns)
CREATE TABLE campaign_missions (
    id              INTEGER PRIMARY KEY,
    campaign_id     TEXT NOT NULL,
    mission_id      TEXT NOT NULL,
    outcome         TEXT NOT NULL,
    duration_ticks  INTEGER NOT NULL,
    completed_at    TEXT NOT NULL,
    casualties      INTEGER,
    resources_spent INTEGER
);

CREATE TABLE roster_snapshots (
    id          INTEGER PRIMARY KEY,
    mission_id  INTEGER REFERENCES campaign_missions(id),
    snapshot_at TEXT NOT NULL,   -- 'mission_start' or 'mission_end'
    roster_json TEXT NOT NULL    -- serialized unit list with veterancy, equipment
);

-- FTS5 for replay and map search (contentless — populated via triggers on matches + match_players)
CREATE VIRTUAL TABLE replay_search USING fts5(
    player_names, map_name, factions, content=''
);
-- Triggers on INSERT into matches/match_players aggregate player_names and factions
-- into the FTS index. Contentless means FTS stores its own copy — no content= source mismatch.
```

### Schema Migration

Each service manages its own schema using embedded SQL migrations (numbered, applied on startup). The `rusqlite` `user_version` pragma tracks the current schema version. Forward-only migrations — the binary upgrades the database file automatically on first launch after an update.

### Per-Database PRAGMA Configuration

Every SQLite database in IC gets a purpose-tuned PRAGMA configuration applied at connection open time. The correct settings depend on the database's access pattern (write-heavy vs. read-heavy), data criticality (irreplaceable credentials vs. recreatable cache), expected size, and concurrency requirements. A single "one size fits all" configuration would either sacrifice durability for databases that need it (credentials, achievements) or sacrifice throughput for databases that need speed (telemetry, gameplay events).

**All databases share these baseline PRAGMAs:**

```sql
PRAGMA journal_mode = WAL;          -- all databases use WAL (concurrent readers, non-blocking writes)
PRAGMA foreign_keys = ON;           -- enforced everywhere (except single-table telemetry)
PRAGMA encoding = 'UTF-8';         -- consistent text encoding
PRAGMA trusted_schema = OFF;        -- defense-in-depth: disable untrusted SQL functions in schema
```

`page_size` must be set **before** the first write to a new database (it cannot be changed after creation without `VACUUM`). All other PRAGMAs are applied on every connection open.

**Connection initialization pattern (Rust):**

```rust
/// Apply purpose-specific PRAGMAs to a freshly opened rusqlite::Connection.
/// Called immediately after Connection::open(), before any application queries.
fn configure_connection(conn: &Connection, config: &DbConfig) -> rusqlite::Result<()> {
    // page_size only effective on new databases (before first table creation)
    conn.pragma_update(None, "page_size", config.page_size)?;
    conn.pragma_update(None, "journal_mode", "wal")?;
    conn.pragma_update(None, "synchronous", config.synchronous)?;
    conn.pragma_update(None, "cache_size", config.cache_size)?;
    conn.pragma_update(None, "foreign_keys", config.foreign_keys)?;
    conn.pragma_update(None, "busy_timeout", config.busy_timeout_ms)?;
    conn.pragma_update(None, "temp_store", config.temp_store)?;
    conn.pragma_update(None, "wal_autocheckpoint", config.wal_autocheckpoint)?;
    conn.pragma_update(None, "trusted_schema", "off")?;
    if config.mmap_size > 0 {
        conn.pragma_update(None, "mmap_size", config.mmap_size)?;
    }
    if config.auto_vacuum != AutoVacuum::None {
        conn.pragma_update(None, "auto_vacuum", config.auto_vacuum.as_str())?;
    }
    Ok(())
}
```

#### Client-Side Databases

| PRAGMA / Database      | `gameplay.db`                                                 | `telemetry.db`         | `profile.db`              | `achievements.db`           | `communities/*.db`    | `workshop/cache.db`     |
| ---------------------- | ------------------------------------------------------------- | ---------------------- | ------------------------- | --------------------------- | --------------------- | ----------------------- |
| **Purpose**            | Match history, events, campaigns, replays, profiles, training | Telemetry event stream | Identity, friends, images | Achievement defs & progress | Signed credentials    | Workshop metadata cache |
| **synchronous**        | `NORMAL`                                                      | `NORMAL`               | `FULL`                    | `FULL`                      | `FULL`                | `NORMAL`                |
| **cache_size**         | `-16384` (16 MB)                                              | `-4096` (4 MB)         | `-2048` (2 MB)            | `-1024` (1 MB)              | `-512` (512 KB)       | `-4096` (4 MB)          |
| **page_size**          | `4096`                                                        | `4096`                 | `4096`                    | `4096`                      | `4096`                | `4096`                  |
| **mmap_size**          | `67108864` (64 MB)                                            | `0`                    | `0`                       | `0`                         | `0`                   | `0`                     |
| **busy_timeout**       | `2000` (2 s)                                                  | `1000` (1 s)           | `3000` (3 s)              | `3000` (3 s)                | `3000` (3 s)          | `3000` (3 s)            |
| **temp_store**         | `MEMORY`                                                      | `MEMORY`               | `DEFAULT`                 | `DEFAULT`                   | `DEFAULT`             | `MEMORY`                |
| **auto_vacuum**        | `NONE`                                                        | `NONE`                 | `INCREMENTAL`             | `NONE`                      | `NONE`                | `INCREMENTAL`           |
| **wal_autocheckpoint** | `2000` (≈8 MB WAL)                                            | `4000` (≈16 MB WAL)    | `500` (≈2 MB WAL)         | `100`                       | `100`                 | `1000`                  |
| **foreign_keys**       | `ON`                                                          | `OFF`                  | `ON`                      | `ON`                        | `ON`                  | `ON`                    |
| **Expected size**      | 10–500 MB                                                     | ≤100 MB (pruned)       | 1–10 MB                   | <1 MB                       | <1 MB each            | 1–50 MB                 |
| **Data criticality**   | Valuable (history)                                            | Low (recreatable)      | **Critical** (identity)   | High (player investment)    | **Critical** (signed) | Low (recreatable)       |

#### Server-Side Databases

| PRAGMA / Database      | Server `telemetry.db`        | Relay data                               | Workshop server                      | Matchmaking server             |
| ---------------------- | ---------------------------- | ---------------------------------------- | ------------------------------------ | ------------------------------ |
| **Purpose**            | High-throughput event stream | Match results, desync, behavior profiles | Resource registry, FTS5 search       | Ratings, leaderboards, history |
| **synchronous**        | `NORMAL`                     | `FULL`                                   | `NORMAL`                             | `FULL`                         |
| **cache_size**         | `-8192` (8 MB)               | `-8192` (8 MB)                           | `-16384` (16 MB)                     | `-8192` (8 MB)                 |
| **page_size**          | `4096`                       | `4096`                                   | `4096`                               | `4096`                         |
| **mmap_size**          | `0`                          | `0`                                      | `268435456` (256 MB)                 | `134217728` (128 MB)           |
| **busy_timeout**       | `5000` (5 s)                 | `5000` (5 s)                             | `10000` (10 s)                       | `10000` (10 s)                 |
| **temp_store**         | `MEMORY`                     | `MEMORY`                                 | `MEMORY`                             | `MEMORY`                       |
| **auto_vacuum**        | `NONE`                       | `NONE`                                   | `INCREMENTAL`                        | `NONE`                         |
| **wal_autocheckpoint** | `8000` (≈32 MB WAL)          | `1000` (≈4 MB WAL)                       | `1000` (≈4 MB WAL)                   | `1000` (≈4 MB WAL)             |
| **foreign_keys**       | `OFF`                        | `ON`                                     | `ON`                                 | `ON`                           |
| **Expected size**      | ≤500 MB (pruned)             | 10 MB–10 GB                              | 10 MB–10 GB                          | 1 MB–1 GB                      |
| **Data criticality**   | Low (operational)            | **Critical** (signed records)            | Moderate (rebuildable from packages) | **Critical** (player ratings)  |

**Tournament server** uses the same configuration as relay data — brackets, match results, and map pool votes are signed records with identical durability requirements (`synchronous=FULL`, 8 MB cache, append-only growth).

#### Table-to-File Assignments for D047 and D057

Not every table set warrants its own `.db` file. Two decision areas have SQLite tables that live inside existing databases:

- **D047 LLM provider config** (`llm_providers`, `llm_task_routing`) → stored in **`profile.db`**. These are small config tables (~dozen rows) containing encrypted API keys — they inherit `profile.db`'s `synchronous=FULL` durability, which is appropriate for data that includes secrets. Co-locating with identity data keeps all "who am I and what are my settings" data in one backup-critical file.
- **D057 Skill Library** (`skills`, `skills_fts`, `skill_embeddings`, `skill_compositions`) → stored in **`gameplay.db`**. Skills are analytical data produced from gameplay — they benefit from `gameplay.db`'s 16 MB cache and 64 MB mmap (FTS5 keyword search and embedding similarity scans over potentially thousands of skills). A mature skill library with embeddings may reach 10–50 MB, well within `gameplay.db`'s 10–500 MB expected range. Co-locating with `gameplay_events` and `player_profiles` keeps all AI/LLM-consumed data queryable in one file.

#### Configuration Rationale

**`synchronous` — the most impactful setting:**

- **`FULL`** for databases storing irreplaceable data: `profile.db` (player identity), `achievements.db` (player investment), `communities/*.db` (signed credentials that require server contact to re-obtain), relay match data (signed `CertifiedMatchResult` records), and matchmaking ratings (player ELO/Glicko-2 history). `FULL` guarantees that a committed transaction survives even an OS crash or power failure — the fsync penalty is acceptable because these databases have low write frequency.
- **`NORMAL`** for everything else. In WAL mode, `NORMAL` still guarantees durability against application crashes (the WAL is synced before committing). Only an OS-level crash during a checkpoint could theoretically lose a transaction — an acceptable risk for telemetry events, gameplay analytics, and recreatable caches.

**`cache_size` — scaled to query complexity:**

- `gameplay.db` gets 16 MB because it runs the most complex queries: multi-table JOINs for career stats, aggregate functions over thousands of gameplay_events, FTS5 replay search. The large cache keeps hot index pages in memory across analytical queries.
- Server Workshop gets 16 MB for the same reason — FTS5 search over the entire resource registry benefits from a large page cache.
- `telemetry.db` (client and server) gets a moderate cache because writes dominate reads. The write path doesn't benefit from large caches — it's all sequential inserts.
- Small databases (`achievements.db`, `communities/*.db`) need minimal cache because their entire content fits in a few hundred pages.

**`mmap_size` — for read-heavy databases that grow large:**

- `gameplay.db` at 64 MB: after months of play, this database may contain hundreds of thousands of gameplay_events rows. Memory-mapping avoids repeated read syscalls during analytical queries like `PlayerStyleProfile` aggregation (D042). The 64 MB limit keeps memory pressure manageable on the minimum-spec 4 GB machine — just 1.6% of total RAM. If the database exceeds 64 MB, the remainder uses standard reads. On systems with ≥8 GB RAM, this could be scaled up at runtime.
- Server Workshop and Matchmaking at 128–256 MB: large registries and leaderboard scans benefit from mmap. Workshop search scans FTS5 index pages; matchmaking scans rating tables for top-N queries. Server hardware typically has ≥16 GB RAM.
- Write-dominated databases (`telemetry.db`) skip mmap entirely — the write path doesn't benefit, and mmap can actually hinder WAL performance by creating contention between mapped reads and WAL writes.

**`wal_autocheckpoint` — tuned to write cadence, with gameplay override:**

- Client `telemetry.db` at 4000 pages (≈16 MB WAL): telemetry writes are bursty during gameplay (potentially hundreds of events per second during intense combat). A large autocheckpoint threshold batches writes and defers the expensive checkpoint operation, preventing frame drops. The WAL file may grow to 16 MB during a match and get checkpointed during the post-game transition.
- Server `telemetry.db` at 8000 pages (≈32 MB WAL): relay servers handling multiple concurrent games need even larger write batches. The 32 MB WAL absorbs write bursts without checkpoint contention blocking game event recording.
- `gameplay.db` at 2000 pages (≈8 MB WAL): moderate — gameplay_events arrive faster than profile updates but slower than telemetry. The 8 MB buffer handles end-of-match write bursts.
- Small databases at 100–500 pages: writes are rare; keep the WAL file small and tidy.

**HDD-safe WAL checkpoint strategy:** The `wal_autocheckpoint` thresholds above are tuned for SSDs. On a 5400 RPM HDD (common on the 2012 min-spec laptop), a WAL checkpoint transfers dirty pages back to the main database file at scattered offsets — **random I/O**. A 16 MB checkpoint can produce 4000 random 4 KB writes, taking 200–500+ ms on a spinning disk. If this triggers during gameplay, the I/O thread stalls, the ring buffer fills, and events are silently lost.

**Mitigation: disable autocheckpoint during active gameplay, checkpoint at safe points.**

```rust
/// During match load, disable automatic checkpointing on gameplay-active databases.
/// The I/O thread calls this after opening connections.
fn enter_gameplay_mode(conn: &Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "wal_autocheckpoint", 0)?; // 0 = disable auto
    Ok(())
}

/// At safe points (loading screen, post-game stats, main menu, single-player pause),
/// trigger a passive checkpoint that yields if it encounters contention.
fn checkpoint_at_safe_point(conn: &Connection) -> rusqlite::Result<()> {
    // PASSIVE: checkpoint pages that don't require blocking readers.
    // Does not block, does not stall. May leave some pages un-checkpointed.
    conn.pragma_update(None, "wal_checkpoint", "PASSIVE")?;
    Ok(())
}

/// On match end or app exit, restore normal autocheckpoint thresholds.
fn leave_gameplay_mode(conn: &Connection, normal_threshold: u32) -> rusqlite::Result<()> {
    conn.pragma_update(None, "wal_autocheckpoint", normal_threshold)?;
    // Full checkpoint now — we're in a loading/menu screen, stall is acceptable.
    conn.pragma_update(None, "wal_checkpoint", "TRUNCATE")?;
    Ok(())
}
```

**Safe checkpoint points** (I/O thread triggers these, never the game thread):
- Match loading screen (before gameplay starts)
- Post-game stats screen (results displayed, no sim running)
- Main menu / lobby (no active sim)
- Single-player pause menu (sim is frozen — user is already waiting)
- App exit / minimize / suspend

**WAL file growth during gameplay:** With autocheckpoint disabled, the WAL grows unbounded during a match. Worst case for a 60-minute match at peak event rates: telemetry.db WAL may reach ~50–100 MB, gameplay.db WAL ~20–40 MB. On a 4 GB min-spec machine, this is ~2–3% of RAM — acceptable. The WAL is truncated on the post-game `TRUNCATE` checkpoint. Players on SSDs experience no difference — checkpoint takes <50 ms regardless of timing.

**Detection:** The I/O thread queries storage type at startup via Bevy's platform detection (or heuristic: sequential read bandwidth vs. random IOPS ratio). If HDD is detected (or cannot be determined — conservative default), gameplay WAL checkpoint suppression activates automatically. SSD users keep the normal `wal_autocheckpoint` thresholds. The `storage.assume_ssd` cvar overrides detection.

**`auto_vacuum` — only where deletions create waste:**

- `INCREMENTAL` for `profile.db` (avatar/banner image replacements leave pages of dead BLOB data), `workshop/cache.db` (mod uninstalls remove metadata rows), and server Workshop (resource unpublish). Incremental mode marks freed pages for reuse without the full-table rewrite cost of `FULL` auto_vacuum. Reclamation happens via periodic `PRAGMA incremental_vacuum(N)` calls on background threads.
- `NONE` everywhere else. Telemetry uses DELETE-based pruning but full VACUUM is only warranted on export (compaction). Achievements, community credentials, and match history grow monotonically — no deletions means no wasted space. Relay match data is append-only.

**`busy_timeout` — preventing SQLITE_BUSY errors:**

- 1 second for client `telemetry.db`: telemetry writes must never cause visible gameplay lag. If the database is locked for over 1 second, something is seriously wrong — better to drop the event than stall the game loop.
- 2 seconds for `gameplay.db`: UI queries (career stats page) occasionally overlap with background event writes. All `gameplay.db` writes happen on a dedicated I/O thread (see "Transaction batching" above), so `busy_timeout` waits occur on the I/O thread — never on the game loop thread. 2 seconds is sufficient for typical contention.
- 5 seconds for server telemetry: high-throughput event recording on servers can create brief WAL contention during checkpoints. Server hardware and dedicated I/O threads make a 5-second timeout acceptable.
- 10 seconds for server Workshop and Matchmaking: web API requests may queue behind write transactions during peak load. A generous timeout prevents spurious failures.

**`temp_store = MEMORY` — for databases that run complex queries:**

- `gameplay.db`, `telemetry.db`, Workshop, Matchmaking: complex analytical queries (GROUP BY, ORDER BY, JOIN) may create temporary tables or sort buffers. Storing these in RAM avoids disk I/O overhead for intermediate results.
- Profile, achievements, community databases: queries are simple key lookups and small result sets — `DEFAULT` (disk-backed temp) is fine and avoids unnecessary memory pressure.

**`foreign_keys = OFF` for `telemetry.db` only:**

- The unified telemetry schema is a single table with no foreign keys. Disabling the pragma avoids the per-statement FK check overhead on every INSERT — measurable savings at high event rates.
- All other databases have proper FK relationships and enforce them.

#### WASM Platform Adjustments

Browser builds (via `sql.js` or `sqlite-wasm` on OPFS) operate under different constraints:

- **`mmap_size = 0`** always — mmap is not available in WASM environments
- **`cache_size`** reduced by 50% — browser memory budgets are tighter
- **`synchronous = NORMAL`** for all databases — OPFS provides its own durability guarantees and the browser may not honor fsync semantics
- **`wal_autocheckpoint`** kept at default (1000) — OPFS handles sequential I/O differently than native filesystems; large WAL files offer less benefit

These adjustments are applied automatically by the `DbConfig` builder when it detects the WASM target at compile time (`#[cfg(target_arch = "wasm32")]`).

### Scaling Path

SQLite is the default and the right choice for 95% of deployments. For the official infrastructure at high scale, individual services can optionally be configured to use PostgreSQL by swapping the storage backend trait implementation. The schema is designed to be portable (standard SQL, no SQLite-specific syntax). FTS5 is used for full-text search on Workshop and replay catalogs — a PostgreSQL backend would substitute `tsvector`/`tsquery` for the same queries. This is a future optimization, not a launch requirement.

Each service defines its own storage trait — no god-trait mixing unrelated concerns:

```rust
/// Relay server storage — match results, desync reports, behavioral profiles.
pub trait RelayStorage: Send + Sync {
    fn store_match_result(&self, result: &CertifiedMatchResult) -> Result<()>;
    fn query_matches(&self, filter: &MatchFilter) -> Result<Vec<MatchRecord>>;
    fn store_desync_report(&self, report: &DesyncReport) -> Result<()>;
    fn update_behavior_profile(&self, player: PlayerId, profile: &BehaviorProfile) -> Result<()>;
}

/// Matchmaking server storage — ratings, match history, leaderboards.
pub trait MatchmakingStorage: Send + Sync {
    fn update_rating(&self, player: PlayerId, rating: &Glicko2Rating) -> Result<()>;
    fn leaderboard(&self, scope: &LeaderboardScope, limit: u32) -> Result<Vec<LeaderboardEntry>>;
    fn match_history(&self, player: PlayerId, limit: u32) -> Result<Vec<MatchRecord>>;
}

/// Workshop server storage — resource metadata, versions, dependencies, search.
pub trait WorkshopStorage: Send + Sync {
    fn publish_resource(&self, meta: &ResourceMetadata) -> Result<()>;
    fn search(&self, query: &str, filter: &ResourceFilter) -> Result<Vec<ResourceListing>>;
    fn resolve_deps(&self, root: &ResourceId, range: &VersionRange) -> Result<DependencyGraph>;
}

/// SQLite implementation — each service gets its own SqliteXxxStorage struct
/// wrapping a rusqlite::Connection (WAL mode, foreign keys on, journal_size_limit set).
/// PostgreSQL implementations are optional, behind `#[cfg(feature = "postgres")]`.
```

### Alternatives Considered

- **JSON / TOML flat files** (rejected — no query capability; "what's my win rate on this map?" requires loading every match file and filtering in code; no indexing, no FTS, no joins; scales poorly past hundreds of records; the user's data is opaque to external tools unless we also build export scripts)
- **RocksDB / sled / redb** (rejected — key-value stores require application-level query logic for everything; no SQL means no ad-hoc investigation, no external tool compatibility, no community reuse; the data is locked behind IC-specific access patterns)
- **PostgreSQL as default** (rejected — destroys the "just a binary" deployment model; community relay operators shouldn't need to install and maintain a database server; adds operational complexity for zero benefit at community scale)
- **Redis** (rejected — in-memory only by default; no persistence guarantees without configuration; no SQL; wrong tool for durable structured records)
- **Custom binary format** (rejected — maximum vendor lock-in; the community can't build anything on top of it without reverse engineering; contradicts the open-standard philosophy)
- **No persistent storage; compute everything from replay files** (rejected — replays are large, parsing is expensive, and many queries span multiple sessions; pre-computed aggregates in SQLite make career stats and AI adaptation instant)

**Phase:** SQLite storage for relay and client lands in Phase 2 (replay catalog, save game index, gameplay event log). Workshop server storage lands in Phase 6a (D030). Matchmaking and tournament storage land in Phase 5 (competitive infrastructure). The `StorageBackend` trait is defined early but PostgreSQL implementation is deferred until scale requires it.

---

---

## D035: Creator Recognition & Attribution

**Decision:** The Workshop supports **voluntary creator recognition** through tipping/sponsorship links and reputation badges. Monetization is never mandatory — all Workshop resources are freely downloadable. Creators can optionally accept tips and link sponsorship profiles.

**Rationale:**
- The C&C modding community has a 30-year culture of free modding. Mandatory paid content would generate massive resistance and fragment multiplayer (can't join a game if you don't own a required paid map — ArmA DLC demonstrated this problem).
- Valve's Steam Workshop paid mods experiment (Skyrim, 2015) was reversed within days due to community backlash. The 75/25 revenue split (Valve/creator) was seen as exploitative.
- Nexus Mods' Donation Points system is well-received as a voluntary model — creators earn money without gating access.
- CS:GO/CS2's creator economy ($57M+ paid to creators by 2015) works because it's cosmetic-only items curated by Valve — a fundamentally different model than gating gameplay content.
- ArmA's commissioned mod ecosystem exists in a legal/ethical gray zone with no official framework — creators deserve better.
- Backend infrastructure (relay servers, Workshop servers, tracking servers) has real hosting costs. Sustainability requires some revenue model.

**Key Design Elements:**

### Creator Tipping

- **Tip jar on resource pages:** Every Workshop resource page has an optional "Support this creator" button. Clicking shows the creator's configured payment links.
- **Payment links, not payment processing.** IC does not process payments directly. Creators link their own payment platforms:

```yaml
# In mod.yaml or creator profile
creator:
  name: "Alice"
  tip_links:
    - platform: "ko-fi"
      url: "https://ko-fi.com/alice"
    - platform: "github-sponsors"
      url: "https://github.com/sponsors/alice"
    - platform: "patreon"
      url: "https://patreon.com/alice"
    - platform: "paypal"
      url: "https://paypal.me/alice"
```

- **No IC platform fee on tips.** Tips go directly to creators via their chosen platform. IC takes zero cut.
- **Aggregate tip link on creator profile:** Creator's profile page shows a single "Support Alice" button linking to their preferred platform.

### Infrastructure Sustainability

The Workshop and backend servers have hosting costs. Sustainability options (not mutually exclusive):

| Model                        | Description                                                                                                   | Precedent                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Community donations**      | Open Collective / GitHub Sponsors for the project itself                                                      | Godot, Blender, Bevy                |
| **Premium hosting tier**     | Optional paid tier: priority matchmaking queue, larger replay archive, custom clan pages                      | Discord Nitro, private game servers |
| **Sponsored featured slots** | Creators or communities pay to feature resources in the Workshop's "Featured" section                         | App Store featured placements       |
| **White-label licensing**    | Tournament organizers or game communities license the engine+infrastructure for their own branded deployments | Many open-source projects           |

**No mandatory paywalls.** The free tier is fully functional — all gameplay features, all maps, all mods, all multiplayer. Premium tiers offer convenience and visibility, never exclusive gameplay content.

**No loot boxes, no skin gambling, no speculative economy.** CS:GO's skin economy generated massive revenue but also attracted gambling sites, scams, and regulatory scrutiny. IC's creator recognition model is direct and transparent.

### Future Expansion Path

The Workshop schema supports monetization metadata from day one, but launches with tips-only:

```yaml
# Future schema (not implemented at launch)
mod:
  pricing:
    model: "free"                    # free | tip | paid (paid = future)
    tip_links: [...]                 # voluntary compensation
    # price: "2.99"                  # future: optional price for premium content
    # revenue_split: "70/30"         # future: creator/platform split
```

If the community evolves toward wanting paid content (e.g., professional-quality campaign packs), the schema is ready. But this is a community decision, not a launch feature.

**Alternatives considered:**
- Mandatory marketplace (Skyrim paid mods disaster — community backlash guaranteed)
- Revenue share on all downloads (creates perverse incentives, fragments multiplayer)
- No monetization at all (unsustainable for infrastructure; undervalues creators)
- EA premium content pathway (licensing conflicts with open-source, gives EA control the community should own)

**Phase:** Phase 6a (integrated with Workshop infrastructure), with creator profile schema defined in Phase 3.

---

---

## D036: Achievement System

**Decision:** IC includes a **per-game-module achievement system** with built-in and mod-defined achievements, stored locally in SQLite (D034), with optional Workshop sync for community-created achievement packs.

**Rationale:**
- Achievements provide progression and engagement outside competitive ranking — important for casual players who are the majority of the C&C community
- Modern RTS players expect achievement systems (Remastered, SC2, AoE4 all have them)
- Mod-defined achievements drive Workshop adoption: a total conversion mod can define its own achievement set, incentivizing players to explore community content
- SQLite storage (D034) already handles all persistent client state — achievements are another table

**Key Design Elements:**

### Achievement Categories

| Category        | Examples                                                                      | Scope                         |
| --------------- | ----------------------------------------------------------------------------- | ----------------------------- |
| **Campaign**    | "Complete Allied Campaign on Hard", "Zero casualties in mission 3"            | Per-game-module, per-campaign |
| **Skirmish**    | "Win with only infantry", "Defeat 3 brutal AIs simultaneously"                | Per-game-module               |
| **Multiplayer** | "Win 10 ranked matches", "Achieve 200 APM in a match"                         | Per-game-module, per-mode     |
| **Exploration** | "Play every official map", "Try all factions"                                 | Per-game-module               |
| **Community**   | "Install 5 Workshop mods", "Rate 10 Workshop resources", "Publish a resource" | Cross-module                  |
| **Mod-defined** | Defined by mod authors in YAML, registered via Workshop                       | Per-mod                       |

### Storage Schema (D034)

```sql
CREATE TABLE achievements (
    id              TEXT PRIMARY KEY,     -- "ra1.campaign.allied_hard_complete"
    game_module     TEXT NOT NULL,        -- "ra1", "td", "ra2"
    category        TEXT NOT NULL,        -- "campaign", "skirmish", "multiplayer", "community"
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    icon            TEXT,                 -- path to achievement icon asset
    hidden          BOOLEAN DEFAULT 0,    -- hidden until unlocked (surprise achievements)
    source          TEXT NOT NULL         -- "builtin" or workshop resource ID
);

CREATE TABLE achievement_progress (
    achievement_id  TEXT REFERENCES achievements(id),
    unlocked_at     TEXT,                 -- ISO 8601 timestamp, NULL if locked
    progress        INTEGER DEFAULT 0,    -- for multi-step achievements (e.g., "win 10 matches": progress=7)
    target          INTEGER DEFAULT 1,    -- total required for unlock
    PRIMARY KEY (achievement_id)
);
```

### Mod-Defined Achievements

Mod authors define achievements in their `mod.yaml`, which register when the mod is installed:

```yaml
# mod.yaml (achievement definition in a mod)
achievements:
  - id: "my_mod.survive_the_storm"
    title: "Eye of the Storm"
    description: "Survive a blizzard event without losing any buildings"
    category: skirmish
    icon: "assets/achievements/storm.png"
    hidden: false
    trigger: "lua"                     # unlock logic in Lua script
  - id: "my_mod.build_all_units"
    title: "Full Arsenal"
    description: "Build every unit type in a single match"
    category: skirmish
    icon: "assets/achievements/arsenal.png"
    trigger: "lua"
```

Lua scripts call `Achievement.unlock("my_mod.survive_the_storm")` when conditions are met. The achievement API is part of the Lua globals (alongside `Actor`, `Trigger`, `Map`, etc.).

### Design Constraints

- **No multiplayer achievements that incentivize griefing.** "Kill 100 allied units" → no. "Win 10 team games" → yes.
- **Campaign achievements are deterministic** — same inputs, same achievement unlock. Replays can verify achievement legitimacy.
- **Achievement packs are Workshop resources** — community can create themed achievement collections (e.g., "Speedrun Challenges", "Pacifist Run").
- **Mod achievements are sandboxed to their mod.** Uninstalling a mod hides its achievements (progress preserved, shown as "mod not installed").
- **Steam achievements sync** (Steam builds only) — built-in achievements map to Steam achievement API. Mod-defined achievements are IC-only.

**Alternatives considered:**
- Steam achievements only (excludes non-Steam players, can't support mod-defined achievements)
- No achievement system (misses engagement opportunity, feels incomplete vs modern RTS competitors)
- Blockchain-verified achievements (needless complexity, community hostility toward crypto/blockchain in games)

**Phase:** Phase 3 (built-in achievement infrastructure + campaign achievements), Phase 6b (mod-defined achievements via Workshop).

---

---

## D037: Community Governance & Platform Stewardship

**Decision:** IC's community infrastructure (Workshop, tracking servers, competitive systems) operates under a **transparent governance model** with community representation, clear policies, and distributed authority.

**Rationale:**
- OpenRA's community fragmented partly because governance was opaque — balance changes and feature decisions were made by a small core team without structured community input, leading to the "OpenRA isn't RA1" sentiment
- ArmA's Workshop moderation is perceived as inconsistent — some IP holders get mods removed, others don't, with no clear published policy
- CNCnet succeeds partly because it's community-run with clear ownership
- The Workshop (D030) and competitive systems create platform responsibilities: content moderation, balance curation, server uptime, dispute resolution. These need defined ownership.
- Self-hosting is a first-class use case (D030 federation) — governance must work even when the official infrastructure is one of many

**Key Design Elements:**

### Governance Structure

| Role                          | Responsibility                                                               | Selection                                                    |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Project maintainer(s)**     | Engine code, architecture decisions, release schedule                        | Existing (repository owners)                                 |
| **Workshop moderators**       | Content moderation, DMCA processing, policy enforcement                      | Appointed by maintainers, community nominations              |
| **Competitive committee**     | Ranked map pool, balance preset curation, tournament rules                   | Elected by active ranked players (annual)                    |
| **Game module stewards**      | Per-module balance/content decisions (RA1 steward, TD steward, etc.)         | Appointed by maintainers based on community contributions    |
| **Community representatives** | Advocate for community needs, surface pain points, vote on pending decisions | Elected by community (annual), at least one per major region |

### Transparency Commitments

- **Public decision log** (this document) for all architectural and policy decisions
- **Monthly community reports** for Workshop statistics (uploads, downloads, moderation actions, takedowns)
- **Open moderation log** for Workshop takedown actions (stripped of personal details) — the community can see what was removed and why
- **RFC process for major changes:** Balance preset modifications, Workshop policy changes, and competitive rule changes go through a public comment period before adoption
- **Community surveys** before major decisions that affect gameplay experience (annually at minimum)

### Self-Hosting Independence

The governance model explicitly supports community independence:

- Any community can host their own Workshop server, tracking server, and relay server
- Federation (D030) means community servers are peers, not subordinates to the official infrastructure
- If the official project becomes inactive, the community has all the tools, source code, and infrastructure to continue independently
- Community-hosted servers set their own moderation policies (within the framework of clear minimum standards for federated discovery)

### Community Groups

**Lesson from ArmA/OFP:** The ArmA community's longevity (25+ years) owes much to its clan/unit culture — persistent groups with shared mod lists, server configurations, and identity. IC supports this natively rather than leaving it to Discord servers and spreadsheets.

Community groups are lightweight persistent entities in the Workshop/tracking infrastructure:

| Feature                | Description                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| **Group identity**     | Name, tag, icon, description — displayed in lobby and in-game alongside player names                     |
| **Shared mod list**    | Group-curated list of Workshop resources. Members click "Sync" to install the group's mod configuration. |
| **Shared server list** | Preferred relay/tracking servers. Members auto-connect to the group's servers.                           |
| **Group achievements** | Community achievements (D036) scoped to group activities — "Play 50 matches with your group"             |
| **Private lobbies**    | Group members can create password-free lobbies visible only to other members                             |

Groups are **not** competitive clans (no group rankings, no group matchmaking). They are social infrastructure — a way for communities of players to share configurations and find each other. Competitive team features (team ratings, team matchmaking) are separate and independent.

**Storage:** Group metadata stored in SQLite (D034) on the tracking/Workshop server. Groups are federated — a group created on a community tracking server is visible to members who have that server in their `settings.toml` sources list. No central authority over group creation.

**Phase:** Phase 5 (alongside multiplayer infrastructure). Minimal viable implementation: group identity + shared mod list + private lobbies. Group achievements and server lists in Phase 6a.

### Community Knowledge Base

**Lesson from ArmA/OFP:** ArmA's community wiki (Community Wiki — formerly BI Wiki) is one of the most comprehensive game modding references ever assembled, entirely community-maintained. OpenRA has scattered documentation across GitHub wiki pages, the OpenRA book, mod docs, and third-party tutorials — no single authoritative reference.

IC ships a structured knowledge base alongside the Workshop:

- **Engine wiki** — community-editable documentation for engine features, YAML schema reference, Lua API reference, WASM host functions. Seeded with auto-generated content from the typed schema (every YAML field and Lua global gets a stub page).
- **Modding tutorials** — structured guides from "first YAML change" through "WASM total conversion." Community members can submit and edit tutorials.
- **Map-making guides** — scenario editor documentation with annotated examples.
- **Community cookbook** — recipe-style pages: "How to add a new unit type," "How to create a branching campaign," "How to publish a resource pack." Short, copy-pasteable, maintained by the community.

**Implementation:** The knowledge base is a static site (mdbook or similar) with source in a public git repository. Community contributions via pull requests — same workflow as code contributions. Auto-generated API reference pages are rebuilt on each engine release. The in-game help system links to knowledge base pages contextually (e.g., the scenario editor's trigger panel links to the triggers documentation).

**Not a forum.** The knowledge base is reference documentation, not discussion. Community discussion happens on whatever platforms the community chooses (Discord, forums, etc.). IC provides infrastructure for shared knowledge, not social interaction beyond Community Groups.

**Phase:** Phase 4 (auto-generated API reference from Lua/YAML schema). Phase 6a (community-editable tutorials, cookbook). Seeded by the project maintainer during development — the design docs themselves are the initial knowledge base.

### Creator Content Program

**Lesson from ArmA/OFP:** Bohemia Interactive's Creator DLC program (launched 2019) showed that a structured quality ladder — from hobbyist to featured to commercially published — works when the criteria are transparent and the community governs curation. The program produced professional-quality content (Global Mobilization, S.O.G. Prairie Fire, CSLA Iron Curtain) while keeping the free modding ecosystem healthy.

IC adapts this concept within D035's voluntary framework (no mandatory paywalls, no IC platform fee):

| Tier            | Criteria                                                                                  | Recognition                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Published**   | Meets Workshop minimum standards (valid metadata, license declared, no malware)           | Listed in Workshop, available for search and dependency                                            |
| **Reviewed**    | Passes community review (2+ moderator approvals for quality, completeness, documentation) | "Reviewed" badge on Workshop page, eligible for "Staff Picks" featured section                     |
| **Featured**    | Selected by Workshop moderators or competitive committee for exceptional quality          | Promoted in Workshop "Featured" section, highlighted in in-game browser, included in starter packs |
| **Spotlighted** | Seasonal showcase — community-voted "best of" for maps, mods, campaigns, and assets       | Front-page placement, social media promotion, creator interview/spotlight                          |

**Key differences from Bohemia's Creator DLC:**
- **No paid tier at launch.** All tiers are free. D035's future `paid` pricing model is available if the community evolves toward it, but the quality ladder operates independently of monetization.
- **Community curation, not publisher curation.** Workshop moderators and the competitive committee (both community roles) make tier decisions, not the project maintainer.
- **Transparent criteria.** Published criteria for each tier — creators know exactly what's needed to reach "Reviewed" or "Featured" status.
- **No exclusive distribution.** Featured content is Workshop content — it can be forked, depended on, and mirrored. No lock-in.

The Creator Content Program is a recognition and quality signal system, not a gatekeeping mechanism. The Workshop remains open to all — tiers help players find high-quality content, not restrict who can publish.

**Phase:** Phase 6a (integrated with Workshop moderator role from D037 governance structure). "Published" tier is automatic from Workshop launch (Phase 4–5). "Reviewed" and "Featured" require active moderators.

### Code of Conduct

Standard open-source code of conduct (Contributor Covenant or similar) applies to:
- Workshop resource descriptions and reviews
- In-game chat (client-side filtering, not server enforcement for non-ranked games)
- Competitive play (ranked games: stricter enforcement, report system, temporary bans for verified toxicity)
- Community forums and communication channels

**Alternatives considered:**
- BDFL (Benevolent Dictator for Life) model with no community input (faster decisions but risks OpenRA's fate — community alienation)
- Full democracy (too slow for a game project; bikeshedding on every decision)
- Corporate governance (inappropriate for an open-source community project)
- No formal governance (works early, creates problems at scale — better to define structure before it's needed)

**Phase:** Phase 0 (code of conduct, contribution guidelines), Phase 5 (competitive committee), Phase 7 (Workshop moderators, community representatives).

> **Phasing note:** This governance model is aspirational — it describes where the project aims to be at scale, not what launches on day one. At project start, governance is BDFL (maintainer) + trusted contributors, which is appropriate for a project with zero users. Formal elections, committees, and community representatives should not be implemented until there is an active community of 50+ regular contributors. The governance structure documented here is a roadmap, not a launch requirement. Premature formalization risks creating bureaucracy before there are people to govern.

---

---

## D046: Community Platform — Premium Content & Comprehensive Platform Integration

**Status:** Accepted
**Scope:** `ic-game`, `ic-ui`, Workshop infrastructure, platform SDK integration
**Phase:** Platform integration: Phase 5. Premium content framework: Phase 6a+.

### Context

D030 designs the Workshop resource registry including Steam Workshop as a source type. D035 designs voluntary creator tipping with explicit rejection of mandatory paid content. D036 designs the achievement system including Steam achievement sync. These decisions remain valid — D046 extends them in two directions that were previously out of scope:

1. **Premium content from official publishers** — allowing companies like EA to offer premium content (e.g., Remastered-quality art packs, soundtrack packs) through the Workshop, with proper licensing and revenue
2. **Comprehensive platform integration** — going beyond "Steam Workshop as a source" to full Steam platform compatibility (and other platforms: GOG, Epic, etc.)

### Decision

Extend the Workshop and platform layer to support *optional paid content from verified publishers* alongside the existing free ecosystem, and provide comprehensive platform service integration beyond just Workshop.

### Premium Content Framework

**Who can sell:** Only **verified publishers** — entities that have passed identity verification and (for copyrighted IP) provided proof of rights. This is NOT a general marketplace where any modder can charge money. The tipping model (D035) remains the primary creator recognition system.

**Use cases:**
- EA publishes Remastered Collection art assets (high-resolution sprites, remastered audio) as a premium resource pack. Players who own the Remastered Collection on Steam get it bundled; others can purchase separately.
- Professional content studios publish high-quality campaign packs, voice acting, or soundtrack packs.
- Tournament organizers sell premium cosmetic packs for event fundraising.

**What premium content CANNOT be:**
- **Gameplay-affecting.** No paid units, weapons, factions, or balance-changing content. Premium content is cosmetic or supplementary: art packs, soundtrack packs, voice packs, campaign packs (story content, not gameplay advantages).
- **Required for multiplayer.** No player can be excluded from a game because they don't own a premium pack. If a premium art pack is active, non-owners see the default sprites — never a "buy to play" gate.
- **Exclusive to one platform.** Premium content purchased through any platform is accessible from all platforms (subject to platform holder agreements).

```yaml
# Workshop resource metadata extension for premium content
resource:
  name: "Remastered Art Pack"
  publisher:
    name: "Electronic Arts"
    verified: true
    publisher_id: "ea-official"
  pricing:
    model: premium                    # free | tip | premium
    price_usd: "4.99"                # publisher sets price
    bundled_with:                     # auto-granted if player owns:
      - platform: steam
        app_id: 1213210              # C&C Remastered Collection
    revenue_split:
      platform_store: 30             # Steam/GOG/Epic standard store cut (from gross)
      ic_project: 10                 # IC Workshop hosting fee (from gross)
      publisher: 60                  # remainder to publisher
  content_type: cosmetic             # cosmetic | supplementary | campaign
  requires_base_game: true
  multiplayer_fallback: default      # non-owners see default assets
```

### Comprehensive Platform Integration

Beyond Workshop, IC integrates with platform services holistically:

| Platform Service       | Steam                                | GOG Galaxy                  | Epic                      | Standalone                     |
| ---------------------- | ------------------------------------ | --------------------------- | ------------------------- | ------------------------------ |
| **Achievements**       | Full sync (D036)                     | GOG achievement sync        | Epic achievement sync     | IC-only achievements (SQLite)  |
| **Friends & Presence** | Steam friends list, rich presence    | GOG friends, presence       | Epic friends, presence    | IC account friends (future)    |
| **Overlay**            | Steam overlay (shift+tab)            | GOG overlay                 | Epic overlay              | None                           |
| **Matchmaking invite** | Steam invite → lobby join            | GOG invite → lobby join     | Epic invite → lobby join  | Join code / direct IP          |
| **Cloud saves**        | Steam Cloud for save games           | GOG Cloud for save games    | Epic Cloud for save games | Local saves (export/import)    |
| **Workshop**           | Steam Workshop as source (D030)      | GOG Workshop (if supported) | N/A                       | IC Workshop (always available) |
| **DRM**                | **None.** IC is DRM-free always.     | DRM-free                    | DRM-free                  | DRM-free                       |
| **Premium purchases**  | Steam Commerce                       | GOG store                   | Epic store                | IC direct purchase (future)    |
| **Leaderboards**       | Steam leaderboards + IC leaderboards | IC leaderboards             | IC leaderboards           | IC leaderboards                |
| **Multiplayer**        | IC netcode (all platforms together)  | IC netcode                  | IC netcode                | IC netcode                     |

**Critical principle: All platforms play together.** IC's multiplayer is platform-agnostic (IC relay servers, D007). A Steam player, a GOG player, and a standalone player can all join the same lobby. Platform services (friends, invites, overlay) are convenience features — never multiplayer gates.

### Platform Abstraction Layer

The `PlatformServices` trait is defined in `ic-ui` (where platform-aware UI — friends list, invite buttons, achievement popups — lives). Concrete implementations (`SteamPlatform`, `GogPlatform`, `StandalonePlatform`) live in `ic-game` and are injected as a Bevy resource at startup. `ic-ui` accesses the trait via `Res<dyn PlatformServices>`.

```rust
/// Engine-side abstraction over platform services.
/// Defined in ic-ui; implementations in ic-game, injected as Bevy resource.
pub trait PlatformServices: Send + Sync {
    /// Sync an achievement unlock to the platform
    fn unlock_achievement(&self, id: &str) -> Result<(), PlatformError>;

    /// Set rich presence status
    fn set_presence(&self, status: &str, details: &PresenceDetails) -> Result<(), PlatformError>;

    /// Get friends list (for invite UI)
    fn friends_list(&self) -> Result<Vec<PlatformFriend>, PlatformError>;

    /// Invite a friend to the current lobby
    fn invite_friend(&self, friend: &PlatformFriend) -> Result<(), PlatformError>;

    /// Upload save to cloud storage
    fn cloud_save(&self, slot: &str, data: &[u8]) -> Result<(), PlatformError>;

    /// Download save from cloud storage
    fn cloud_load(&self, slot: &str) -> Result<Vec<u8>, PlatformError>;

    /// Platform display name
    fn platform_name(&self) -> &str;
}
```

Implementations: `SteamPlatform` (via Steamworks SDK), `GogPlatform` (via GOG Galaxy SDK), `StandalonePlatform` (no-op or IC-native services).

### Monetization Model for Backend Services

D035 established that IC infrastructure has real hosting costs. D046 formalizes the backend monetization model:

| Revenue Source                   | Description                                                                           | D035 Alignment          |
| -------------------------------- | ------------------------------------------------------------------------------------- | ----------------------- |
| **Community donations**          | Open Collective, GitHub Sponsors — existing model                                     | ✓ unchanged             |
| **Premium relay tier**           | Optional paid tier: priority queue, larger replay archive, custom clan pages          | ✓ D035                  |
| **Verified publisher fees**      | Publishers pay a listing fee + revenue share for premium Workshop content             | NEW — extends D035      |
| **Sponsored featured slots**     | Workshop featured section for promoted resources                                      | ✓ D035                  |
| **Platform store revenue share** | Steam/GOG/Epic take their standard cut on premium purchases made through their stores | NEW — platform standard |

**Free tier is always fully functional.** Premium content is cosmetic/supplementary. Backend monetization sustainably funds relay servers, tracking servers, and Workshop infrastructure without gating gameplay.

### Relationship to Existing Decisions

- **D030 (Workshop):** D046 extends D030's schema with `pricing.model: premium` and `publisher.verified: true`. The Workshop architecture (federated, multi-source) supports premium content as another resource type.
- **D035 (Creator recognition):** D046 does NOT replace tipping. Individual modders use tips (D035). Verified publishers use premium pricing (D046). Both coexist — a modder can publish free mods with tip links AND work for a publisher that sells premium packs.
- **D036 (Achievements):** D046 formalizes the multi-platform achievement sync that D036 mentioned briefly ("Steam achievements sync for Steam builds").
- **D037 (Governance):** Premium content moderation, verified publisher approval, and revenue-related disputes fall under community governance (D037).

### Alternatives Considered

- No premium content ever (rejected — leaves money on the table for both the project and legitimate IP holders like EA; the Remastered art pack use case is too valuable)
- Open marketplace for all creators (rejected — Skyrim paid mods disaster; tips-only for individual creators, premium only for verified publishers)
- Platform-exclusive content (rejected — violates cross-platform play principle)
- IC processes all payments directly (rejected — regulatory burden, payment processing complexity; delegate to platform stores and existing payment processors)

---

---

## D049: Workshop Asset Formats & Distribution — Bevy-Native Canonical, P2P Delivery

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Multi-phase (Workshop foundation + distribution + package tooling)
- **Canonical for:** Workshop canonical asset format recommendations and P2P package distribution strategy
- **Scope:** Workshop package format/distribution, client download/install pipeline, format recommendations for IC modules, HTTP fallback behavior
- **Decision:** The Workshop recommends **modern Bevy-native formats** (OGG/PNG/WAV/WebM/KTX2/GLTF) as canonical for new content while fully supporting legacy C&C formats for compatibility; package delivery uses **P2P (BitTorrent/WebTorrent) with HTTP fallback**.
- **Why:** Lower hosting cost, better Bevy integration/tooling, safer/more mature parsers for untrusted content, and lower friction for new creators using standard tools.
- **Non-goals:** Dropping legacy C&C format support; making Workshop format choices universal for all future engines/projects consuming the Workshop core library.
- **Invariants preserved:** Full resource compatibility for existing C&C assets remains intact; Workshop protocol/package concepts are separable from IC-specific format preferences (D050).
- **Defaults / UX behavior:** New content creators are guided toward modern formats; legacy assets still load and publish without forced conversion.
- **Compatibility / Export impact:** Legacy formats remain important for OpenRA/RA1 workflows and D040 conversion pipelines; canonical Workshop recommendations do not invalidate export targets.
- **Security / Trust impact:** Preference for widely audited decoders is an explicit defense-in-depth choice for untrusted Workshop content.
- **Performance / Ops impact:** P2P delivery reduces CDN cost and scales community distribution; modern formats integrate better with Bevy runtime loading paths.
- **Public interfaces / types / commands:** `.icpkg` (IC-specific package wrapper), Workshop P2P/HTTP delivery strategy, `ic mod build/publish` workflow (as referenced across modding docs)
- **Affected docs:** `src/04-MODDING.md`, `src/05-FORMATS.md`, `src/decisions/09c-modding.md`, `src/decisions/09f-tools.md`
- **Revision note summary:** None
- **Keywords:** workshop formats, p2p delivery, bittorrent, webtorrent, bevy-native assets, png ogg webm, legacy c&c compatibility, icpkg

**Decision:** The Workshop's canonical asset formats are **Bevy-native modern formats** (OGG, PNG, WAV, WebM, KTX2, GLTF). C&C legacy formats (.aud, .shp, .pal, .vqa, .mix) are fully supported for backward compatibility but are not the recommended distribution format for new content. Workshop delivery uses **peer-to-peer distribution** (BitTorrent/WebTorrent protocol) with HTTP fallback, reducing hosting costs from CDN-level to a lightweight tracker.

> **Note (D050):** The format recommendations in this section are **IC-specific** — they reflect Bevy's built-in asset pipeline. The Workshop's P2P distribution protocol and package format are engine-agnostic (see D050). Future projects consuming the Workshop core library will define their own format recommendations based on their engine's capabilities. The `.icpkg` extension, `ic mod` CLI commands, and `game_module` manifest fields are likewise IC-specific — the Workshop core library uses configurable equivalents.

### The Format Problem

The engine serves two audiences with conflicting format needs:

1. **Legacy community:** Thousands of existing .shp, .aud, .mix, .pal assets. OpenRA mods. Original game files. These must load.
2. **New content creators:** Making sprites in Aseprite/Photoshop, recording audio in Audacity/Reaper, editing video in DaVinci Resolve. These tools export PNG, OGG, WAV, WebM — not .shp or .aud.

Forcing new creators to encode into C&C formats creates unnecessary friction. Forcing legacy content through format converters before it can load breaks the "community's existing work is sacred" invariant. The answer is: **accept both, recommend modern.**

### Canonical Format Recommendations

| Asset Type      | Workshop Format (new content)     | Legacy Support (existing) | Runtime Decode         | Rationale                                                                                                                                                                                         |
| --------------- | --------------------------------- | ------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Music**       | OGG Vorbis (128–320kbps)          | .aud (ra-formats decode)  | PCM via rodio          | Bevy default feature, excellent quality/size ratio, open/patent-free, WASM-safe. OGG at 192kbps ≈ 1.4MB/min vs .aud at ~0.5MB/min but dramatically higher quality (stereo, 44.1kHz vs mono 22kHz) |
| **SFX**         | WAV (16-bit PCM) or OGG           | .aud (ra-formats decode)  | PCM via rodio          | WAV = zero decode latency for gameplay-critical sounds (weapon fire, explosions). OGG for larger ambient/UI sounds where decode latency is acceptable                                             |
| **Voice**       | OGG Vorbis (96–128kbps)           | .aud (ra-formats decode)  | PCM via rodio          | Speech compresses well. OGG at 96kbps is transparent for voice. EVA packs with 200+ lines stay under 30MB                                                                                         |
| **Sprites**     | PNG (RGBA, indexed, or truecolor) | .shp+.pal (ra-formats)    | GPU texture via Bevy   | Bevy-native via `image` crate. Lossless. Every art tool exports it. Palette-indexed PNG preserves classic aesthetic. HD packs use truecolor RGBA                                                  |
| **HD Textures** | KTX2 (GPU-compressed: BC7/ASTC)   | N/A                       | Zero-cost GPU upload   | Bevy-native. No decode — GPU reads directly. Best runtime performance. `ic mod build` can batch-convert PNG→KTX2 for release builds                                                               |
| **Terrain**     | PNG tiles (indexed or RGBA)       | .tmp+.pal (ra-formats)    | GPU texture            | Same as sprites. Theater tilesets are sprite sheets                                                                                                                                               |
| **Cutscenes**   | WebM (VP9, 720p–1080p)            | .vqa (ra-formats decode)  | Frame→texture (custom) | Open, royalty-free, browser-compatible (WASM target). VP9 achieves ~5MB/min at 720p. Neither WebM nor VQA is Bevy-native — both need custom decode, so no advantage to VQA here                   |
| **3D Models**   | GLTF/GLB                          | N/A (future: .vxl)        | Bevy mesh              | Bevy's native 3D format. Community 3D mods (D048) use this                                                                                                                                        |
| **Palettes**    | .pal (768 bytes) or PNG strip     | .pal (ra-formats)         | Palette texture        | .pal is already tiny and universal in the C&C community. No reason to change. PNG strip is an alternative for tools that don't understand .pal                                                    |
| **Maps**        | IC YAML (native)                  | .oramap (ZIP+MiniYAML)    | ECS world state        | Already designed (D025, D026)                                                                                                                                                                     |

### Why Modern Formats as Default

**Bevy integration:** OGG, WAV, PNG, KTX2, and GLTF load through Bevy's built-in asset pipeline with zero custom code. Every Bevy feature — hot-reload, asset dependencies, async loading, platform abstraction — works automatically. C&C formats require custom `AssetLoader` implementations in ra-formats with manual integration into Bevy's pipeline.

**Security:** OGG (lewton/rodio), PNG (image crate), and WebM decoders in the Rust ecosystem have been fuzz-tested and used in production by thousands of projects. Browser vendors (Chrome, Firefox, Safari) have security-audited these formats for decades. Our .aud/.shp/.vqa parsers in ra-formats are custom code that has never been independently security-audited. For Workshop content downloaded from untrusted sources, mature parsers with established security track records are strictly safer. C&C format parsers use `BoundedReader` (see `06-SECURITY.md`), but defense in depth favors formats with deeper audit history.

**Multi-game:** Non-C&C game modules (D039) won't use .shp or .aud at all. A tower defense mod, a naval RTS, a Dune-inspired game — these ship PNG sprites and OGG audio. The Workshop serves all game modules, not just the C&C family.

**Tooling:** Every image editor saves PNG. Every DAW exports WAV/OGG. Every video editor exports WebM/MP4. Nobody's toolchain outputs .aud or .shp. Requiring C&C formats forces creators through a conversion step before they can publish — unnecessary friction.

**WASM/browser:** OGG and PNG work in Bevy's WASM builds out of the box. C&C formats need custom WASM decoders compiled into the browser bundle.

**Storage efficiency comparison:**

| Content                        | C&C Format                      | Modern Format                        | Notes                                                                       |
| ------------------------------ | ------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| 3min music track               | .aud: ~1.5MB (22kHz mono ADPCM) | OGG: ~2.8MB (44.1kHz stereo 128kbps) | OGG is 2× larger but dramatically higher quality. At mono 22kHz OGG: ~0.7MB |
| Full soundtrack (30 tracks)    | .aud: ~45MB                     | OGG 128kbps: ~84MB                   | Acceptable for modern bandwidth/storage                                     |
| Unit sprite sheet (200 frames) | .shp+.pal: ~50KB                | PNG indexed: ~80KB                   | PNG slightly larger but universal tooling                                   |
| HD sprite sheet (200 frames)   | N/A (.shp can't do HD)          | PNG RGBA: ~500KB                     | Only modern format option for HD content                                    |
| 3min cutscene (720p)           | .vqa: ~15MB                     | WebM VP9: ~15MB                      | Comparable. WebM quality is higher at same bitrate                          |

Modern formats are somewhat larger for legacy-quality content but the difference is small relative to modern storage and bandwidth. For HD content, modern formats are the only option.

### The Conversion Escape Hatch

The Asset Studio (D040) converts in both directions:
- **Import:** .aud/.shp/.vqa/.pal → OGG/PNG/WebM/.pal (for modders working with legacy assets)
- **Export:** OGG/PNG/WebM → .aud/.shp/.vqa (for modders targeting OpenRA compatibility or classic aesthetic)
- **Batch convert:** `ic mod convert --to-modern` or `ic mod convert --to-classic` converts entire mod directories

The engine loads both format families at runtime. `ra-formats` decoders handle legacy formats; Bevy's built-in loaders handle modern formats. No manual conversion is ever required — only recommended for new Workshop publications.

### Workshop Package Format (.icpkg)

Workshop packages are **ZIP archives** with a standardized manifest — the same pattern as `.oramap` but generalized to any resource type:

```
my-hd-sprites-1.2.0.icpkg          # ZIP archive
├── manifest.yaml                    # Package metadata (required)
├── README.md                        # Long description (optional)
├── CHANGELOG.md                     # Version history (optional)
├── preview.png                      # Thumbnail, max 512×512 (required for Workshop listing)
└── assets/                          # Actual content files
    ├── sprites/
    │   ├── infantry-allied.png
    │   └── vehicles-soviet.png
    └── palettes/
        └── temperate-hd.pal
```

**manifest.yaml:**
```yaml
package:
  name: "hd-allied-sprites"
  publisher: "community-hd-project"
  version: "1.2.0"
  license: "CC-BY-SA-4.0"
  description: "HD sprite replacements for Allied infantry and vehicles"
  category: sprites
  game_module: ra1
  engine_version: "^0.3.0"

  # Per-file integrity (verified on install)
  files:
    sprites/infantry-allied.png:
      sha256: "a1b2c3d4..."
      size: 524288
    sprites/vehicles-soviet.png:
      sha256: "e5f6a7b8..."
      size: 1048576

  dependencies:
    - id: "community-hd-project/base-palettes"
      version: "^1.0"

  # P2P distribution metadata (added by Workshop server on publish)
  distribution:
    sha256: "full-package-hash..."        # Hash of entire .icpkg
    size: 1572864                          # Total package size in bytes
    infohash: "btih:abc123def..."          # BitTorrent info hash (for P2P)
```

ZIP was chosen over tar.gz because: random access to individual files (no full decompression to read manifest.yaml), universal tooling, `.oramap` precedent, and Rust's `zip` crate is mature.

**VPK-style indexed manifest (from Valve Source Engine):** The `.icpkg` manifest (manifest.yaml) is placed at the **start** of the archive, not at the end. This follows Valve's VPK (Valve Pak) format design, where the directory/index appears at the beginning of the file — allowing tools to read metadata, file listings, and dependencies without downloading or decompressing the entire package. For Workshop browsing, the tracker can serve just the first ~4KB of a package (the manifest) to populate search results, preview images, and dependency resolution without fetching the full archive. ZIP's central directory is at the *end* of the file, so ZIP-based `.icpkg` files include a redundant manifest at offset 0 (outside the ZIP structure, in a fixed-size header) for fast remote reads, with the canonical copy inside the ZIP for standard tooling compatibility. See `research/valve-github-analysis.md` § 6.4.

**Content-addressed asset deduplication (from Valve Fossilize):** Workshop asset storage uses **content-addressed hashing** for deduplication — each file is identified by `SHA-256(content)`, not by path or name. When a modder publishes a new version that changes only 2 of 50 files, only the 2 changed files are uploaded; the remaining 48 reference existing content hashes already in the Workshop. This reduces upload size, storage cost, and download time for updates. The pattern comes from Fossilize's content hashing (FOSS_BLOB_HASH = SHA-256 of serialized data, see `research/valve-github-analysis.md` § 3.2) and is also used by Git (content-addressed object store), Docker (layer deduplication), and IPFS (CID-based storage). The per-file SHA-256 hashes already present in manifest.yaml serve as content addresses — no additional metadata needed.

**Local cache CAS deduplication:** The same content-addressed pattern extends to the player's local `workshop/` directory. Instead of storing raw `.icpkg` ZIP files — where 10 mods bundling the same HD sprite pack each contain a separate copy — the Workshop client unpacks downloaded packages into a **content-addressed blob store** (`workshop/blobs/<sha256-prefix>/<sha256>`). Each installed package's manifest maps logical file paths to blob hashes; the package directory contains only symlinks or lightweight references to the shared blob store. Benefits:

- **Disk savings:** Popular shared resources (HD sprite packs, sound effect libraries, font packs) stored once regardless of how many mods depend on them. Ten mods using the same 200MB HD pack → 200MB stored, not 2GB.
- **Faster installs:** When installing a new mod, the client checks blob hashes against the local store before downloading. Files already present (from other mods) are skipped — only genuinely new content is fetched.
- **Atomic updates:** Updating a mod replaces only changed blob references. Unchanged files (same hash) are already in the store.
- **Garbage collection:** `ic mod gc` removes blobs no longer referenced by any installed package. Runs automatically during Workshop cleanup prompts (D030 budget system).

```
workshop/
├── cache.db              # Package metadata, manifests, dependency graph
├── blobs/                # Content-addressed blob store
│   ├── a1/a1b2c3...     # SHA-256 hash → file content
│   ├── d4/d4e5f6...
│   └── ...
└── packages/             # Per-package manifests (references into blobs/)
    ├── alice--hd-sprites-2.0.0/
    │   └── manifest.yaml # Maps logical paths → blob hashes
    └── bob--desert-map-1.1.0/
        └── manifest.yaml
```

The local CAS store is an optimization that ships alongside the full Workshop in Phase 6a. The initial Workshop (Phase 4–5) can use simpler `.icpkg`-on-disk storage and upgrade to CAS when the full Workshop matures — the manifest.yaml already contains per-file SHA-256 hashes, so the data model is forward-compatible.

### Workshop Player Configuration Profiles (Controls / Accessibility / HUD Presets)

Workshop packages also support an optional **player configuration profile** resource type for sharing non-authoritative client preferences — especially control layouts and accessibility presets.

**Examples:**
- `player-config` package with a `Modern RTS (KBM)` variant tuned for left-handed mouse users
- Steam Deck control profile (trackpad cursor + gyro precision + PTT on shoulder)
- accessibility preset bundle (larger UI targets, sticky modifiers, reduced motion, high-contrast HUD)
- touch HUD layout preset (handedness + command rail preferences + thresholds)

**Why this fits D049:** These profiles are tiny, versioned, reviewable manifests/data files distributed through the same Workshop identity, trust, and update systems as mods and media packs. Sharing them through Workshop reduces friction for community onboarding ("pro caster layout", "tournament observer profile", "new-player-friendly touch controls") without introducing a separate configuration-sharing platform.

**Hard safety boundaries (non-negotiable):**
- No secrets/credentials (tokens, API keys, account auth, recovery phrases)
- No absolute local file paths or device identifiers
- No executable code, scripts, macros, or automation payloads
- No hidden application on install — applying a config profile always requires user confirmation with a diff preview

**Manifest guidance (IC-specific package category):**
- `category: player-config`
- `game_module`: optional (many profiles are game-agnostic)
- `config_scope[]`: one or more of `controls`, `touch_layout`, `accessibility`, `ui_layout`, `camera_qol`
- `compatibility` metadata for controls profiles:
  - semantic action catalog version (D065)
  - target input class (`desktop_kbm`, `gamepad`, `deck`, `touch_phone`, `touch_tablet`)
  - optional `screen_class` hints and required features (gyro, rear buttons, command rail)

**Example `player-config` package (`manifest.yaml`):**
```yaml
package:
  name: "deck-gyro-competitive-profile"
  publisher: "community-deck-lab"
  version: "1.0.0"
  license: "CC-BY-4.0"
  description: "Steam Deck control profile: right-trackpad cursor, gyro precision, L1 push-to-talk, spectator-friendly quick controls"
  category: player-config
  # game_module is optional for generic profiles; omit unless module-specific
  engine_version: "^0.6.0"

  tags:
    - controls
    - steam-deck
    - accessibility-friendly
    - spectator

  config_scope:
    - controls
    - accessibility
    - camera_qol

  compatibility:
    semantic_action_catalog_version: "d065-input-actions-v1"
    target_input_class: "deck"
    screen_class: "Desktop"
    required_features:
      - right_trackpad
      - gyro
    optional_features:
      - rear_buttons
    tested_profiles:
      - "Steam Deck Default@v1"
    notes: "Falls back cleanly if gyro is disabled; keeps all actions reachable without gyro."

  # Per-file integrity (verified on install/apply download)
  files:
    profiles/controls.deck.yaml:
      sha256: "a1b2c3d4..."
      size: 8124
    profiles/accessibility.deck.yaml:
      sha256: "b2c3d4e5..."
      size: 1240
    profiles/camera_qol.yaml:
      sha256: "c3d4e5f6..."
      size: 512

  # Server-added on publish (same as other .icpkg categories)
  distribution:
    sha256: "full-package-hash..."
    size: 15642
    infohash: "btih:abc123def..."
```

**Example payload file (`profiles/controls.deck.yaml`, controls-only diff):**
```yaml
profile:
  base: "Steam Deck Default@v1"
  profile_name: "Deck Gyro Competitive"
  target_input_class: deck
  semantic_action_catalog_version: "d065-input-actions-v1"

bindings:
  voice_ptt:
    primary: { kind: gamepad_button, button: l1, mode: hold }
  controls_quick_reference:
    primary: { kind: gamepad_button, button: l5, mode: hold }
  camera_bookmark_overlay:
    primary: { kind: gamepad_button, button: r5, mode: hold }
  ping_wheel:
    primary: { kind: gamepad_button, button: r3, mode: hold }

axes:
  cursor:
    source: right_trackpad
    sensitivity: 1.1
    acceleration: 0.2
  gyro_precision:
    enabled: true
    activate_on: l2_hold
    sensitivity: 0.85

radials:
  command_radial:
    trigger: y_hold
    first_ring:
      - attack_move
      - guard
      - force_action
      - rally_point
      - stop
      - deploy
```

**Install/apply UX rules:**
- Installing a `player-config` package does **not** auto-apply it
- Player sees an **Apply Profile** sheet with:
  - target device/profile class
  - scopes included
  - changed actions/settings summary
  - conflicts with current bindings (if any)
- Apply can be partial (e.g., controls only, accessibility only) to avoid clobbering unrelated preferences
- `Reset to previous profile` / rollback snapshot is created before apply

**Competitive integrity note:** Player config profiles may change bindings and client UI preferences, but they may not include automation/macro behavior. D033 and D059 competitive rules remain unchanged.

**Lobby/ranked compatibility note (D068):** `player-config` packages are **local preference resources**, not gameplay/presentation compatibility content. They are excluded from lobby/ranked fingerprint checks and must never be treated as required room resources or auto-download prerequisites for joining a match.

**Storage / distribution note:** Config profiles are typically tiny (<100 KB), so HTTP delivery is sufficient; P2P remains supported by the generic `.icpkg` pipeline but is not required for good UX.

### P2P Distribution (BitTorrent/WebTorrent)

**The cost problem:** A popular 500MB mod downloaded 10,000 times generates 5TB of egress. At CDN rates ($0.01–0.09/GB), that's $50–450/month — per mod. For a community project sustained by donations, centralized hosting is financially unsustainable at scale. A BitTorrent tracker VPS costs $5–20/month regardless of popularity.

**The solution:** Workshop distribution uses the **BitTorrent protocol** for large packages, with HTTP direct download as fallback. The Workshop server acts as both metadata registry (SQLite, lightweight) and BitTorrent tracker (peer coordination, lightweight). Actual content transfer happens peer-to-peer between players who have the package.

**How it works:**

```
┌─────────────┐     1. Search/browse     ┌──────────────────┐
│  ic CLI /    │ ───────────────────────► │  Workshop Server │
│  In-Game     │ ◄─────────────────────── │  (metadata +     │
│  Browser     │  2. manifest.yaml +      │   tracker)       │
│              │     torrent info         │                  │
│              │                          └──────────────────┘
│              │     3. P2P download
│              │ ◄──────────────────────► Other players (peers/seeds)
│              │     (BitTorrent protocol)
│              │
│              │     4. Fallback: HTTP direct download
│              │ ◄─────────────────────── Workshop server / mirrors / seed box
└─────────────┘     5. Verify SHA-256
```

1. **Publish:** `ic mod publish` uploads .icpkg to Workshop server. Server computes SHA-256, generates torrent metadata (info hash), starts seeding the package alongside any initial seed infrastructure.
2. **Browse/Search:** Workshop server handles all metadata queries (search, dependency resolution, ratings) via the existing SQLite + FTS5 design. Lightweight.
3. **Install:** `ic mod install` fetches the manifest from the server, then downloads the .icpkg via BitTorrent from other players who have it. Falls back to HTTP direct download if no peers are available or if P2P is too slow.
4. **Seed:** Players who have downloaded a package automatically seed it to others (opt-out in settings). The more popular a resource, the faster it downloads — the opposite of CDN economics where popularity means higher cost.
5. **Verify:** SHA-256 checksum validation on the complete package, regardless of download method. BitTorrent's built-in piece-level hashing provides additional integrity during transfer.

**WebTorrent for browser builds (WASM):** Standard BitTorrent uses TCP/UDP, which browsers can't access. [WebTorrent](https://webtorrent.io/) extends the BitTorrent protocol over WebRTC, enabling browser-to-browser P2P. The Workshop server includes a WebTorrent tracker endpoint. Desktop clients and browser clients can interoperate — desktop seeds serve browser peers and vice versa through hybrid WebSocket/WebRTC bridges. **HTTP fallback is mandatory:** if WebTorrent signaling fails (signaling server down, WebRTC blocked), the client must fall back to direct HTTP download without user intervention. Multiple signaling servers are maintained for redundancy. Signaling servers only facilitate WebRTC negotiation — they never see package content, so even a compromised signaling server cannot serve tampered data (SHA-256 verification catches that).

**Tracker authentication & token rotation:** P2P tracker access uses per-session tokens tied to client authentication (Workshop credentials or anonymous session token), not static URL secrets. Tokens rotate every release cycle. Even unauthorized peers joining a swarm cannot serve corrupt data (SHA-256 + piece hashing), but token rotation limits unauthorized swarm observation and bandwidth waste. See `06-SECURITY.md` for the broader security model.

**Transport strategy by package size:**

| Package Size | Strategy                     | Rationale                                                                                   |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------------------- |
| < 5MB        | HTTP direct only             | P2P overhead exceeds benefit for small files. Maps, balance presets, palettes.              |
| 5–50MB       | P2P preferred, HTTP fallback | Small sprite packs, sound effect packs, script libraries. P2P helps but HTTP is acceptable. |
| > 50MB       | P2P strongly preferred       | HD resource packs, cutscene packs, full mods. P2P's cost advantage is decisive.             |

Thresholds are configurable in `settings.toml`. Players on connections where BitTorrent is throttled or blocked can force HTTP-only mode.

**Auto-download on lobby join (D030 interaction):** When joining a lobby with missing resources, the client first attempts P2P download (likely fast, since other players in the lobby are already seeding). If the lobby timer is short or P2P is slow, falls back to HTTP. The lobby UI shows download progress with source indicators (P2P/HTTP). See D052 § "In-Lobby P2P Resource Sharing" for the detailed lobby protocol, including host-as-tracker, verification against Workshop index, and security constraints.

**Gaming industry precedent:**
- **Blizzard (WoW, StarCraft 2, Diablo 3):** Used a custom P2P downloader ("Blizzard Downloader", later integrated into Battle.net) for game patches and updates from 2004–2016. Saved millions in CDN costs for multi-GB patches distributed to millions of players.
- **Wargaming (World of Tanks):** Used P2P distribution for game updates.
- **Linux distributions:** Ubuntu, Fedora, Arch all offer torrent downloads for ISOs — the standard solution for distributing large files from community infrastructure.
- **Steam Workshop:** Steam subsidizes centralized hosting from game sales revenue. We don't have that luxury — P2P is the community-sustainable alternative.

**Competitive landscape — game mod platforms:**

IC's Workshop exists in a space with several established modding platforms. None offer the combination of P2P distribution, federation, self-hosting, and in-engine integration that IC targets.

| Platform                                                              | Model                                                                                                                       | Scale                                                                           | In-game integration                                                                            | P2P | Federation / Self-host | Dependencies | Open source                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --- | ---------------------- | ------------ | ---------------------------------------------------- |
| **[Nexus Mods](https://www.nexusmods.com)**                           | Centralized web portal + Vortex mod manager. CDN distribution, throttled for free users. Revenue: premium membership + ads. | 70.7M users, 4,297 games, 21B downloads. Largest modding platform.              | None — external app (Vortex).                                                                  | ❌   | ❌                      | ❌            | Vortex client (GPL-3.0). Backend proprietary.        |
| **[mod.io](https://mod.io)**                                          | UGC middleware — embeddable SDKs (Unreal/Unity/C++), REST API, white-label UI. Revenue: B2B SaaS (free tier + enterprise).  | 2.5B downloads, 38M MAU, 332 live games. Backed by Tencent ($26M Series A).     | Yes — SDK provides in-game browsing, download, moderation. Console-certified (PS/Xbox/Switch). | ❌   | ❌                      | partial      | SDKs open (MIT/Apache). Backend/service proprietary. |
| **[Modrinth](https://modrinth.com)**                                  | Open-source mod registry. Centralized CDN. Revenue: ads + donations.                                                        | ~100K projects, millions of monthly downloads. Growing fast.                    | Through third-party launchers (Prism, etc).                                                    | ❌   | ❌                      | ✅            | Server (AGPL), API open.                             |
| **[CurseForge](https://www.curseforge.com)** (Overwolf)               | Centralized mod registry + CurseForge app. Revenue: Overwolf overlay ads.                                                   | Dominant for Minecraft, WoW, other Blizzard games.                              | CurseForge app, some launcher integrations.                                                    | ❌   | ❌                      | ✅            | ❌                                                    |
| **[Thunderstore](https://thunderstore.io)**                           | Open-source mod registry. Centralized CDN.                                                                                  | Popular for Risk of Rain 2, Lethal Company, Valheim.                            | Through r2modman manager.                                                                      | ❌   | ❌                      | ✅            | Server (AGPL-3.0).                                   |
| **Steam Workshop**                                                    | Integrated into Steam. Free hosting (subsidized by game sales revenue).                                                     | Thousands of games, billions of downloads.                                      | Deep Steam integration.                                                                        | ❌   | ❌                      | ❌            | ❌                                                    |
| **[ModDB](https://moddb.com) / [GameBanana](https://gamebanana.com)** | Web portals — manual upload/download, community features, editorial content. Legacy platforms (2001–2002).                  | ModDB: 12.5K+ mods, 108M+ downloads. GameBanana: strong in Source Engine games. | None.                                                                                          | ❌   | ❌                      | ❌            | ❌                                                    |

**Competitive landscape — P2P + Registry infrastructure:**

The game mod platforms above are all centralized. A separate set of projects tackle P2P distribution at the infrastructure level, but none target game modding specifically. See `research/p2p-federated-registry-analysis.md` for a comprehensive standalone analysis of this space and its applicability beyond IC.

| Project                                                                          | Architecture                                                                                                                                                                                                                                                                                                                                                           | Domain                                 | How it relates to IC Workshop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[Uber Kraken](https://github.com/uber/kraken)** (6.6k★)                        | P2P Docker registry — custom BitTorrent-like protocol, Agent/Origin/Tracker/Build-Index. Pluggable storage (S3/GCS/HDFS).                                                                                                                                                                                                                                              | Container images (datacenter)          | Closest architectural match. Kraken's Agent/Origin/Tracker/Build-Index maps to IC's Peer/Seed-box/Tracker/Workshop-Index. IC's P2P protocol design (peer selection policy, piece request strategy, connection state machine, announce cycle, bandwidth limiting) is directly informed by Kraken's production experience — see protocol details above and `research/p2p-federated-registry-analysis.md` § "Uber Kraken — Deep Dive" for the full analysis. Key difference: Kraken is intra-datacenter (3s announce, 10Gbps links), IC is internet-scale (30s announce, residential connections).                                                                                                                                                                                                                                                                   |
| **[Dragonfly](https://github.com/dragonflyoss/dragonfly)** (3k★, CNCF Graduated) | P2P content distribution — Manager/Scheduler/Seed-Peer/Peer. Centralized evaluator-based scheduling with 4-dimensional peer scoring (`LoadQuality×0.6 + IDCAffinity×0.2 + LocationAffinity×0.1 + HostType×0.1`). DAG-based peer graph, back-to-source fallback. Persistent cache with replica management. Client rewritten in Rust (v2). Trail of Bits audited (2023). | Container images, AI models, artifacts | Same P2P-with-fallback pattern. Dragonfly's hierarchical location affinity (`country\|province\|city\|zone`), statistical bad-peer detection (three-sigma rule), capacity-aware scoring, persistent replica count, and download priority tiers are all patterns IC adapts. Key differences: Dragonfly uses centralized scheduling (IC uses BitTorrent swarm — simpler, more resilient to churn), Dragonfly is single-cluster with no cross-cluster P2P (IC is federated), Dragonfly requires K8s+Redis+MySQL (IC requires only SQLite). Dragonfly's own RFC #3713 acknowledges piece-level selection is FCFS — BitTorrent's rarest-first is already better. See `research/p2p-federated-registry-analysis.md` § "Dragonfly — CNCF P2P Distribution (Deep Dive)" for full analysis.                                                                                |
| **JFrog Artifactory P2P** (proprietary)                                          | Enterprise P2P distribution — mesh of nodes sharing cached binary artifacts within corporate networks.                                                                                                                                                                                                                                                                 | Enterprise build artifacts             | The direct inspiration for IC's repository model. JFrog added P2P because CDN costs for large binaries at scale are unsustainable — same motivation as IC.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Blizzard NGDP/Agent** (proprietary)                                            | Custom P2P game patching — BitTorrent-based, CDN+P2P hybrid, integrated into Battle.net launcher.                                                                                                                                                                                                                                                                      | Game patches (WoW, SC2, Diablo)        | Closest gaming precedent. Proved P2P game content distribution works at massive scale. Proprietary, not a registry (no search/ratings/deps), not federated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Homebrew / crates.io-index**                                                   | Git-backed package indexes. CDN for actual downloads.                                                                                                                                                                                                                                                                                                                  | Software packages                      | IC's Phase 0–3 git-index is directly inspired by these. No P2P distribution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **IPFS**                                                                         | Content-addressed P2P storage — any content gets a CID, any node can pin and serve it. DHT-based discovery. Bitswap protocol for block exchange with Decision Engine and Score Ledger.                                                                                                                                                                                 | General-purpose decentralized storage  | Rejected as primary distribution protocol (too general, slow cold-content discovery, complex setup, poor game-quality UX). However, IPFS's Bitswap protocol contributes significant patterns IC adopts: EWMA peer scoring with time-decaying reputation (Score Ledger), per-peer fairness caps (`MaxOutstandingBytesPerPeer`), want-have/want-block two-phase discovery, broadcast control (target proven-useful peers), dual WAN/LAN discovery (validates IC's LAN party mode), delegated HTTP routing (validates IC's registry-as-router), server/client mode separation, and batch provider announcements (Sweep Provider). IPFS's 9-year-unresolved bandwidth limiting issue (#3065, 73 👍) proves bandwidth caps must ship day one. See `research/p2p-federated-registry-analysis.md` § "IPFS — Content-Addressed P2P Storage (Deep Dive)" for full analysis. |
| **Microsoft Delivery Optimization**                                              | Windows Update P2P — peers on the same network share update packages.                                                                                                                                                                                                                                                                                                  | OS updates                             | Proves P2P works for verified package distribution at billions-of-devices scale. Proprietary, no registry model.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**What's novel about IC's combination:** No existing system — modding platform or infrastructure — combines (1) federated registry with repository types, (2) P2P distribution via BitTorrent/WebTorrent, (3) zero-infrastructure git-hosted bootstrap, (4) browser-compatible P2P via WebTorrent, (5) in-engine integration with lobby auto-download, and (6) fully open-source with self-hosting as a first-class use case. The closest architectural comparison is mod.io (embeddable SDK approach, in-game integration) but mod.io is a proprietary centralized SaaS — no P2P, no federation, no self-hosting. The closest distribution comparison is Uber Kraken (P2P registry) but it has no modding features. Each piece has strong precedent; the combination is new. The Workshop architecture is game-agnostic and could serve as a standalone platform — see the research analysis for exploration of this possibility.

**Seeding infrastructure:**

The Workshop doesn't rely solely on player altruism for seeding:

- **Workshop seed server:** A dedicated seed box (modest: a VPS with good upload bandwidth) that permanently seeds all Workshop content. This ensures new/unpopular packages are always downloadable even with zero player peers. Cost: ~$20-50/month for a VPS with 1TB+ storage and unmetered bandwidth.
- **Community seed volunteers:** Players who opt in to extended seeding (beyond just while the game is running). Similar to how Linux mirror operators volunteer bandwidth. Could be incentivized with Workshop badges/reputation (D036/D037).
- **Mirror servers (federation):** Community-hosted Workshop servers (D030 federation) also seed the content they host. Regional community servers naturally become regional seeds.
- **Lobby-optimized seeding:** When a lobby host has required mods, the game client prioritizes seeding to joining players who are downloading. The "auto-download on lobby join" flow becomes: download from lobby peers first → swarm → HTTP fallback.

**Privacy and security:**

- **IP visibility:** Standard BitTorrent exposes peer IP addresses. This is the same exposure as any multiplayer game (players already see each other's IPs or relay IPs). For privacy-sensitive users, HTTP-only mode avoids P2P IP exposure.
- **Content integrity:** SHA-256 verification on complete packages catches any tampering. BitTorrent's piece-level hashing catches corruption during transfer. Double-verified.
- **No metadata leakage:** The tracker only knows which peers have which packages (by info hash). It doesn't inspect content. Package contents are just game assets — sprites, audio, maps.
- **ISP throttling mitigation:** BitTorrent traffic can be throttled by ISPs. Mitigations: protocol encryption (standard in modern BT clients), WebSocket transport (looks like web traffic), and HTTP fallback as ultimate escape. Settings allow forcing HTTP-only mode.
- **Resource exhaustion:** Rate-limited seeding (configurable upload cap in settings). Players control how much bandwidth they donate. Default: 1MB/s upload, adjustable to 0 (leech-only, no seeding — discouraged but available).

**P2P protocol design details:**

The Workshop's P2P engine is informed by production experience from Uber Kraken (Apache 2.0, 6.6k★) and Dragonfly (Apache 2.0, CNCF Graduated). Kraken distributes 1M+ container images/day across 15K+ hosts using a custom BitTorrent-inspired protocol; Dragonfly uses centralized evaluator-based scheduling at Alibaba scale. IC adapts Kraken's connection management and Dragonfly's scoring insights for internet-scale game mod distribution. See `research/p2p-federated-registry-analysis.md` for full architectural analyses of both systems.

> **Cross-pollination with IC netcode and community infrastructure.** The Workshop P2P engine and IC's netcode infrastructure (relay server, tracking server — `03-NETCODE.md`) share deep structural parallels: federation, heartbeat/TTL, rate control, connection state machines, observability, deployment model. Patterns flow both directions — netcode's three-layer rate control and token-based liveness improve Workshop; Workshop's EWMA scoring and multi-dimensional peer evaluation improve relay server quality tracking. A full cross-pollination analysis (including shared infrastructure opportunities: unified server binary, federation library, auth/identity layer) is in `research/p2p-federated-registry-analysis.md` § "Netcode ↔ Workshop Cross-Pollination." Additional cross-pollination with D052/D053 (community servers, player profiles, trust-based filtering) is catalogued in D052 § "Cross-Pollination" — highlights include: two-key architecture for index signing and publisher identity, trust-based source filtering, server-side validation as a shared invariant, and trust-verified peer selection scoring.

*Peer selection policy (tracker-side):* The tracker returns a sorted peer list on each announce response. The sorting policy is **pluggable** — inspired by Kraken's `assignmentPolicy` interface pattern. IC's default policy prioritizes:

1. **Seeders** (completed packages — highest priority, like Kraken's `completeness` policy)
2. **Lobby peers** (peers in the same multiplayer lobby — guaranteed to have the content, lowest latency)
3. **Geographically close peers** (same region/ASN — reduces cross-continent transfers)
4. **High-completion peers** (more pieces available — better utilization of each connection)
5. **Random** (fallback for ties — prevents herding)

Peer handout limit: 30 peers per announce response (Kraken uses 50, but IC has fewer total peers per package). Community-hosted trackers can implement custom policies via the server config.

*Planned evolution — weighted multi-dimensional scoring (Phase 5+):* Dragonfly's evaluator demonstrates that combining capacity, locality, and node type into a weighted score produces better peer selection than linear priority tiers. IC's Phase 5+ peer selection evolves to a weighted scoring model informed by Dragonfly's approach:

```
PeerScore = Capacity(0.4) + Locality(0.3) + SeedStatus(0.2) + LobbyContext(0.1)
```

- **Capacity (weight 0.4):** Spare bandwidth reported in announce (`1 - upload_bw_used / upload_bw_max`). Peers with more headroom score higher. Inspired by Dragonfly's `LoadQuality` metric (which sub-decomposes into peak bandwidth, sustained load, and concurrency). IC uses a single utilization ratio — simpler, captures the same core insight.
- **Locality (weight 0.3):** Hierarchical location matching. Clients self-report location as `continent|country|region|city` (4-level, pipe-delimited — adapted from Dragonfly's 5-level `country|province|city|zone|cluster`). Score = `matched_prefix_elements / 4`. Two peers in the same city score 0.75; same country but different region: 0.5; same continent: 0.25.
- **SeedStatus (weight 0.2):** Seed box = 1.0, completed seeder = 0.7, uploading leecher = 0.3. Inspired by Dragonfly's `HostType` score (seed peers = 1.0, normal = 0.5).
- **LobbyContext (weight 0.1):** Same lobby = 1.0, same game session = 0.5, no context = 0. IC-specific — Dragonfly has no equivalent (no lobby concept).

The initial 5-tier priority system (above) ships first and is adequate for community scale. Weighted scoring is additive — the same pluggable policy interface supports both approaches. Community servers can configure their own weights or contribute custom scoring policies.

*Piece request strategy (client-side):* The engine uses **rarest-first** piece selection by default — a priority queue sorted by fewest peers having each piece. This is standard BitTorrent behavior, well-validated for internet conditions. Kraken also implements this as `rarestFirstPolicy`.

- **Pipeline limit:** 3 concurrent piece requests per peer (matches Kraken's default). Prevents overwhelming slow peers.
- **Piece request timeout:** 8s base + 6s per MB of piece size (more generous than Kraken's 4s+4s/MB, compensating for residential internet variance).
- **Endgame mode:** When remaining pieces ≤ 5, the engine sends duplicate piece requests to multiple peers. This prevents the "last piece stall" — a well-known BitTorrent problem where the final piece's sole holder is slow. Kraken implements this as `EndgameThreshold` — it's essential.

*Connection state machine (client-side):*

```
pending ──connect──► active ──timeout/error──► blacklisted
   ▲                    │                          │
   │                    │                          │
   └──────────── cooldown (5min) ◄─────────────────┘
```

- `MaxConnectionsPerPackage: 8` (lower than Kraken's 10 — residential connections have less bandwidth to share)
- Blacklisting: peers that produce zero useful throughput over 30 seconds are temporarily blacklisted (5-minute cooldown). Catches both dead peers and ISP-throttled connections.
- *Sybil resistance:* Maximum 3 peers per /24 subnet in a single swarm. Prefer peers from diverse autonomous systems (ASNs) when possible. Sybil attacks can waste bandwidth but cannot serve corrupt data (SHA-256 integrity), so the risk ceiling is low.
- *Statistical degradation detection (Phase 5+):* Inspired by Dragonfly's `IsBadParent` algorithm — track per-peer piece transfer times. Peers whose last transfer exceeds `max(3 × mean, 2 × p95)` of observed transfer times are demoted in scoring (not hard-blacklisted — they may recover). For sparse data (< 50 samples per peer), fall back to the simpler "20× mean" ratio check. Hard blacklist remains only for zero-throughput (complete failure). This catches degrading peers before they fail completely.
- Connections have TTL — idle connections are closed after 60 seconds to free resources.

*Announce cycle (client → tracker):* Clients announce to the tracker every **30 seconds** (Kraken uses 3s for datacenter — far too aggressive for internet). The tracker can dynamically adjust: faster intervals (10s) during active downloads, slower (60s) when seeding idle content. Max interval cap (120s) prevents unbounded growth. Announce payload includes: PeerID, package info hash, bitfield (what pieces the client has), upload/download speed.

*Size-based piece length:* Different package sizes use different piece lengths to balance metadata overhead against download granularity (inspired by Kraken's `PieceLengths` config):

| Package Size | Piece Length    | Rationale                                                     |
| ------------ | --------------- | ------------------------------------------------------------- |
| < 5MB        | N/A — HTTP only | P2P overhead exceeds benefit                                  |
| 5–50MB       | 256KB           | Fine-grained. Good for partial recovery and slow connections. |
| 50–500MB     | 1MB             | Balanced. Reasonable metadata overhead.                       |
| > 500MB      | 4MB             | Reduced metadata overhead for large packages.                 |

*Bandwidth limiting:* Configurable per-client in `settings.toml`. Residential users cannot have their connection saturated by mod seeding — this is a hard requirement that Kraken solves with `egress_bits_per_sec`/`ingress_bits_per_sec` and IC must match.

```toml
# settings.toml — P2P bandwidth configuration
[workshop.p2p]
max_upload_speed = "1 MB/s"          # Default. 0 = unlimited, "0 B/s" = no seeding
max_download_speed = "unlimited"      # Default. Most users won't limit.
seed_after_download = true            # Keep seeding while game is running
seed_duration_after_exit = "30m"      # Background seeding after game closes (0 = none)
cache_size_limit = "2 GB"             # LRU eviction when exceeded
prefer_p2p = true                     # false = always use HTTP direct
```

*Health checks:* Seed boxes implement heartbeat health checks (30s interval, 3 failures → unhealthy, 2 passes → healthy again — matching Kraken's active health check parameters). The tracker marks peers as offline after 2× announce interval without contact. Unhealthy seed boxes are removed from the announce response until they recover.

*Content lifecycle:* Downloaded packages stay in the seeding pool for 30 minutes after the game exits (configurable via `seed_duration_after_exit`). This is longer than Kraken's 5-minute `seeder_tti` because IC has fewer peers per package — each seeder is more valuable. Disk cache uses LRU eviction when over `cache_size_limit`. Packages currently in use or being seeded are never evicted.

*Download priority tiers:* Inspired by Dragonfly's 7-level priority system (Level0–Level6), IC uses 3 priority tiers to enable QoS differentiation. Higher-priority downloads preempt lower-priority ones (pause background downloads, reallocate bandwidth and connection slots):

| Priority | Name             | When Used                                                | Behavior                                                   |
| -------- | ---------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| 1 (high) | `lobby-urgent`   | Player joining a lobby that requires missing mods        | Preempts all other downloads. Uses all available bandwidth |
| 2 (mid)  | `user-requested` | Player manually downloads from Workshop browser          | Normal bandwidth. Runs alongside background.               |
| 3 (low)  | `background`     | Cache warming, auto-updates, subscribed mod pre-download | Bandwidth-limited. Paused when higher-priority active.     |

*Preheat / prefetch:* Adapted from Dragonfly's preheat jobs (which pre-warm content on seed peers before demand). IC uses two prefetch patterns:

- **Lobby prefetch:** When a lobby host sets required mods, the Workshop server (Phase 5+) can pre-seed those mods to seed boxes before players join. The lobby creation event is the prefetch signal. This ensures seed infrastructure is warm when players start downloading.
- **Subscription prefetch:** Players can subscribe to Workshop publishers or resources. Subscribed content auto-downloads in the background at `background` priority. When a subscribed mod updates, the new version downloads automatically before the player next launches the game.

*Persistent replica count (Phase 5+):* Inspired by Dragonfly's `PersistentReplicaCount`, the Workshop server tracks how many seed boxes hold each resource. If the count drops below a configurable threshold (default: 2 for popular resources, 1 for all others), the server triggers automatic re-seeding from HTTP origin. This ensures the "always available" guarantee — even if all player peers are offline, seed infrastructure maintains minimum replica coverage.

**Early-phase bootstrap — Git-hosted package index:**

Before the full Workshop server is built (Phase 4-5), a **GitHub-hosted package index repository** serves as the Workshop's discovery and coordination layer. This is a well-proven pattern — Homebrew (`homebrew-core`), Rust (`crates.io-index`), Winget (`winget-pkgs`), and Nixpkgs all use a git repository as their canonical package index.

**How it works:**

A public GitHub repository (e.g., `iron-curtain/workshop-index`) contains YAML manifest files — one per package — that describe available resources, their versions, checksums, download locations, and dependencies. The repo itself contains NO asset files — only lightweight metadata.

```
workshop-index/                      # The git-hosted package index
├── index.yaml                       # Consolidated index (single-fetch for game client)
├── packages/
│   ├── alice/
│   │   └── soviet-march-music/
│   │       ├── 1.0.0.yaml           # Per-version manifests
│   │       └── 1.1.0.yaml
│   ├── community-hd-project/
│   │   └── allied-infantry-hd/
│   │       └── 2.0.0.yaml
│   └── ...
├── sources.yaml                     # List of storage servers, mirrors, seed boxes
└── .github/
    └── workflows/
        └── validate.yml             # CI: validates manifest format, checks SHA-256
```

**Per-package manifest (`packages/alice/soviet-march-music/1.1.0.yaml`):**

```yaml
name: soviet-march-music
publisher: alice
version: 1.1.0
license: CC-BY-4.0
description: "Soviet faction battle music pack"
size: 48_000_000  # 48MB
sha256: "a1b2c3d4..."

sources:
  - type: http
    url: "https://github.com/iron-curtain/workshop-packages/releases/download/alice-soviet-march-music-1.1.0/soviet-march-music-1.1.0.icpkg"
  - type: torrent
    info_hash: "e5f6a7b8..."
    trackers:
      - "wss://tracker.ironcurtain.gg/announce"   # WebTorrent tracker
      - "udp://tracker.ironcurtain.gg:6969/announce"

dependencies:
  community-hd-project/base-audio-lib: "^1.0"

game_modules: [ra]
tags: [music, soviet, battle]
```

**`sources.yaml` — storage server and tracker registry:**

```yaml
# Where to find actual .icpkg files and BitTorrent peers.
# The engine reads this to discover available download sources.
# Adding an official server later = adding a line here.
storage_servers:
  - url: "https://github.com/iron-curtain/workshop-packages/releases"  # GitHub Releases (Phase 0-3)
    type: github-releases
    priority: 1
  # - url: "https://cdn.ironcurtain.gg"   # Future: official CDN (Phase 5+)
  #   type: http
  #   priority: 1

torrent_trackers:
  - "wss://tracker.ironcurtain.gg/announce"      # WebTorrent (browser + desktop)
  - "udp://tracker.ironcurtain.gg:6969/announce"  # UDP (desktop only)

seed_boxes:
  - "https://seed1.ironcurtain.gg"  # Permanent seeder for all packages
```

**Two client access patterns:**

1. **HTTP fetch** (game client default): The engine fetches `index.yaml` via `raw.githubusercontent.com` — a single GET request returns the full package listing. Fast, no git dependency, CDN-backed globally by GitHub. Cached locally with ETag/Last-Modified for incremental updates.
2. **Git clone/pull** (SDK, power users, offline): `git clone` the entire index repo. `git pull` for incremental atomic updates. Full offline browsing. Better for the SDK/editor and users who want to script against the index.

The engine's Workshop source configuration (D030) treats this as a new source type:

```toml
# settings.toml — Phase 0-3 configuration
[[workshop.sources]]
url = "https://github.com/iron-curtain/workshop-index"   # git-index source
type = "git-index"
priority = 1

[[workshop.sources]]
path = "C:/my-local-workshop"    # local development
type = "local"
priority = 2
```

**Community contribution workflow (manual):**

1. Modder creates a `.icpkg` package and uploads it to GitHub Releases (or any HTTP host)
2. Modder submits a PR to `workshop-index` adding a manifest YAML with SHA-256 and download URL
3. GitHub Actions validates manifest format, checks SHA-256 against the download URL, verifies metadata
4. Maintainers review and merge → package is discoverable to all players on next index fetch
5. When the full Workshop server ships (Phase 4-5), published packages migrate automatically — the manifest format is the same

**Git-index security hardening** (see `06-SECURITY.md` § Vulnerabilities 20–21 and `research/workshop-registry-vulnerability-analysis.md` for full threat analysis):

- **Path-scoped PR validation:** CI rejects PRs that modify files outside the submitter's package directory. A PR adding `packages/alice/tanks/1.0.0.yaml` may ONLY modify files under `packages/alice/`. Modification of other paths → automatic CI failure.
- **CODEOWNERS:** Maps `packages/alice/** @alice-github`. GitHub enforces that only the package owner can approve changes to their manifests.
- **`manifest_hash` verification:** CI downloads the `.icpkg`, extracts `manifest.yaml`, computes its SHA-256, and verifies it matches the `manifest_hash` field in the index entry. Prevents manifest confusion (registry entry diverging from package contents).
- **Consolidated `index.yaml` is CI-generated:** Deterministically rebuilt from per-package manifests — never hand-edited. Any contributor can reproduce locally to verify integrity.
- **Index signing (Phase 3–4):** CI signs the consolidated `index.yaml` with an Ed25519 key stored outside GitHub. Clients verify the signature. Repository compromise without the signing key produces unsigned (rejected) indexes. Uses the **two-key architecture** from D052 (§ Key Lifecycle): the CI-held key is the Signing Key (SK); a Recovery Key (RK), held offline by ≥2 maintainers, enables key rotation on compromise without breaking client trust chains. See D052 § "Cross-Pollination" for the full rationale.
- **Actions pinned to commit SHAs:** All GitHub Actions referenced by SHA, not by mutable tag. Minimal `GITHUB_TOKEN` permissions. No secrets in the PR validation pipeline.
- **Branch protection on main:** Require signed commits, no force-push, require PR reviews, no single-person merge. Repository must have ≥3 maintainers.

**Automated publish via `ic` CLI (same UX as Phase 5+):**

The `ic mod publish` command works against the git-index backend in Phase 0–3:

1. `ic mod publish` packages content into `.icpkg`, computes SHA-256
2. Uploads `.icpkg` to GitHub Releases (via GitHub API, using a personal access token configured in `ic auth`)
3. Generates the index manifest YAML from `mod.yaml` metadata
4. Opens a PR to `workshop-index` with the manifest file
5. Modder reviews the PR and confirms; GitHub Actions validates; maintainers merge

The command is identical to Phase 5+ publishing (`ic mod publish`) — the only difference is the backend. When the Workshop server ships, `ic mod publish` targets the server instead. Modders don't change their workflow.

**Adding official storage servers later:**

When official infrastructure is ready (Phase 5+), adding it is a one-line change to `sources.yaml` — no architecture change, no client update. The `sources.yaml` in the index repo is the single place that lists where packages can be downloaded from. Community mirrors and CDN endpoints are added the same way.

**Phased progression:**

1. **Phase 0–3 — Git-hosted index + GitHub Releases:** The index repo is the Workshop. Players fetch `index.yaml` for discovery, download `.icpkg` files from GitHub Releases (2GB per file, free, CDN-backed). Community contributes via PR. Zero custom server code. Zero hosting cost.
2. **Phase 3–4 — Add BitTorrent tracker:** A minimal tracker binary goes live ($5-10/month VPS). Package manifests gain `torrent` source entries. P2P delivery begins for large packages. The index repo remains the discovery layer.
3. **Phase 4–5 — Full Workshop server:** Search, ratings, dependency resolution, FTS5, integrated P2P tracker. The Workshop server can either replace the git index or coexist alongside it (both are valid D030 sources). The git index remains available as a fallback and for community-hosted Workshop servers.

The progression is smooth because the federated source model (D030) already supports multiple source types — `git-index`, `local`, `remote` (Workshop server), and `steam` all coexist in `settings.toml`.

**Industry precedent:**

| Project                                | Index Mechanism                                          | Scale          |
| -------------------------------------- | -------------------------------------------------------- | -------------- |
| **Homebrew** (`homebrew-core`)         | Git repo of Ruby formulae; `brew update` = `git pull`    | ~7K packages   |
| **Rust crates.io** (`crates.io-index`) | Git repo of JSON metadata; sparse HTTP fetch added later | ~150K crates   |
| **Winget** (`winget-pkgs`)             | Git repo of YAML manifests; community PRs                | ~5K packages   |
| **Nixpkgs**                            | Git repo of Nix expressions                              | ~100K packages |
| **Scoop** (Windows)                    | Git repo ("buckets") of JSON manifests                   | ~5K packages   |

All of these started with git-as-index and some (crates.io) later augmented with sparse HTTP fetching for performance at scale. The same progression applies here — git index works perfectly for a community of hundreds to low thousands, and can be complemented (not replaced) by a Workshop API when scale demands it.

**Workshop server architecture with P2P:**

```
┌─────────────────────────────────────────────────────┐
│                  Workshop Server                     │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────┐ │
│  │  Metadata    │  │ Tracker  │  │  HTTP Fallback │ │
│  │  (SQLite +   │  │ (BT/WT   │  │  (S3/R2 or     │ │
│  │   FTS5)      │  │  peer     │  │   local disk)  │ │
│  │             │  │  coord)   │  │               │ │
│  └─────────────┘  └──────────┘  └────────────────┘ │
│        ▲               ▲               ▲            │
│        │ search/browse │ announce/     │ GET .icpkg  │
│        │ deps/ratings  │ scrape        │ (fallback)  │
└────────┼───────────────┼───────────────┼────────────┘
         │               │               │
    ┌────┴────┐    ┌─────┴─────┐   ┌─────┴─────┐
    │ ic CLI  │    │  Players  │   │ Seed Box  │
    │ Browser │    │  (seeds)  │   │ (always   │
    └─────────┘    └───────────┘   │  seeds)   │
                                   └───────────┘
```

All three components (metadata, tracker, HTTP fallback) run in the same binary — "just a Rust binary" deployment philosophy. Community self-hosters get the full stack with one executable.

### Rust Implementation

**BitTorrent client library:** The `ic` CLI and game client embed a BitTorrent client. Rust options:
- [`librqbit`](https://github.com/ikatson/rqbit) — pure Rust, async (tokio), actively maintained, supports WebTorrent
- [`cratetorrent`](https://github.com/mandreyel/cratetorrent) — pure Rust, educational focus
- Custom minimal client — only needs download + seed + tracker announce; no DHT, no PEX needed for a controlled Workshop ecosystem

**BitTorrent tracker:** Embeddable in the Workshop server binary. Rust options:
- [`aquatic`](https://github.com/greatest-ape/aquatic) — high-performance Rust tracker
- Custom minimal tracker — HTTP announce/scrape endpoints, peer list management. The Workshop server already has SQLite; peer lists are another table.

**WebTorrent:** `librqbit` has WebTorrent support. The WASM build would use the WebRTC transport.

### Rationale

- **Cost sustainability:** P2P reduces Workshop hosting costs by 90%+. A community project cannot afford CDN bills that scale with popularity. A tracker + seed box for $30-50/month serves unlimited download volume.
- **Fits federation (D030):** P2P is another source in the federated model. The virtual repository queries metadata from remote servers, then downloads content from the swarm — same user experience, different transport.
- **Fits "no single point of failure" (D037):** P2P is inherently resilient. If the Workshop server goes down, peers keep sharing. Content already downloaded is always available.
- **Fits SHA-256 integrity (D030):** P2P needs exactly the integrity verification already designed. Same `manifest.yaml` checksums, same `ic.lock` pinning, same verification on install.
- **Fits WASM target (invariant #10):** WebTorrent enables browser-to-browser P2P. Desktop and browser clients interoperate. No second-class platform.
- **Popular resources get faster:** More downloads → more seeders → faster downloads for everyone. The opposite of CDN economics where popularity increases cost.
- **Self-hosting scales:** Community Workshop servers (D030 federation) benefit from the same P2P economics. A small community server needs only a $5 VPS — the community's players provide the bandwidth.
- **Privacy-responsible:** IP exposure is equivalent to any multiplayer game. HTTP-only mode available for privacy-sensitive users. No additional surveillance beyond standard BitTorrent protocol.
- **Proven technology:** BitTorrent has been distributing large files reliably for 20+ years. Blizzard used it for WoW patches. The protocol is well-understood, well-documented, and well-implemented.

### Alternatives Considered

- **Centralized CDN only** (rejected — financially unsustainable for a donation-funded community project. A popular 500MB mod downloaded 10K times = 5TB = $50-450/month. P2P reduces this to near-zero marginal cost)
- **IPFS** (rejected as primary distribution protocol — slow cold-content discovery, complex setup, ecosystem declining, content pinning is expensive, poor game-quality UX. However, multiple Bitswap protocol design patterns adopted: EWMA peer scoring, per-peer fairness caps, want-have/want-block two-phase discovery, broadcast control, dual WAN/LAN discovery, delegated HTTP routing, batch provider announcements. See competitive landscape table above and research deep dive)
- **Custom P2P protocol** (rejected — massive engineering effort with no advantage over BitTorrent's 20-year-proven protocol)
- **Git LFS** (rejected — 1GB free then paid; designed for source code, not binary asset distribution; no P2P)
- **Steam Workshop only** (rejected — platform lock-in, Steam subsidizes hosting from game sales revenue we don't have, excludes non-Steam/WASM builds)
- **GitHub Releases only** (rejected — works for bootstrap but no search, ratings, dependency resolution, P2P, or lobby auto-download. Adequate interim solution, not long-term architecture)
- **HTTP-only with community mirrors** (rejected — still fragile. Mirrors are one operator away from going offline. P2P is inherently more resilient than any number of mirrors)
- **No git index / custom server from day one** (rejected — premature complexity. A git-hosted index costs $0 and ships with the first playable build. Custom server code can wait until Phase 4-5 when the community is large enough to need search/ratings)

### Phase

- **Phase 0–3:** Git-hosted package index (`workshop-index` repo) + GitHub Releases for `.icpkg` storage. Zero infrastructure cost. Community contributes via PR. Game client fetches `index.yaml` for discovery.
- **Phase 3–4:** Add BitTorrent tracker ($5-10/month VPS). Package manifests gain `torrent` source entries. P2P delivery begins for large packages. Git index remains the discovery layer.
- **Phase 4–5:** Full Workshop server with integrated BitTorrent/WebTorrent tracker, search, ratings, dependency resolution, P2P delivery, HTTP fallback via S3-compatible storage. Git index can coexist or be subsumed.
- **Phase 6a:** Federation (community servers join the P2P swarm), Steam Workshop as additional source, Publisher workflows
- **Format recommendations** apply from Phase 0 — all first-party content uses the recommended canonical formats

---

---

## D053 — Player Profile System

|                |                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                |
| **Driver**     | Players need a persistent identity, social presence, and reputation display across lobbies, game browser, and community participation   |
| **Depends on** | D034 (SQLite), D036 (Achievements), D042 (Behavioral Profiles), D046 (Premium Content), D050 (Workshop), D052 (Community Servers & SCR) |

### Problem

Players in multiplayer games are more than a text name. They need to express their identity, showcase achievements, verify reputation, and build social connections. Without a proper profile system, lobbies feel anonymous and impersonal — players can't distinguish veterans from newcomers, can't build persistent friendships, and can't verify who they're playing against. Every major gaming platform (Steam, Xbox Live, PlayStation Network, Battle.net, Riot Games, Discord) has learned this: **profiles are the social foundation of a gaming community.**

IC has a unique advantage: the Signed Credential Record (SCR) system from D052 means player reputation data (ratings, match counts, achievements) is **cryptographically verified and portable**. No other game has unforgeable, cross-community reputation badges. D053 builds the user-facing system that displays and manages this identity.

### Design Principles

Drawn from analysis of Steam, Xbox Live, PSN, Riot Games, Blizzard Battle.net, Discord, and OpenRA:

1. **Identity expression without vanity bloat.** Players should personalize their presence (avatar, name, bio) but the system shouldn't become a cosmetic storefront that distracts from gameplay. Keep it clean and functional.
2. **Reputation is earned, not claimed.** Ratings, achievements, and match counts come from signed SCRs — not self-reported. If a player claims to be 1800-rated, their profile proves (or disproves) it.
3. **Privacy by default.** Every profile field has visibility controls. Players choose exactly what they share and with whom. Local behavioral data (D042) is never exposed in profiles.
4. **Portable across communities.** A player's profile works on any community server they join. Community-specific data (ratings, achievements) is signed by that community. Cross-community viewing shows aggregated identity with per-community verification badges.
5. **Offline-first.** The profile is stored locally in SQLite (D034). Community-signed data is cached in the local credential store (D052). No server connection needed to view your own profile. Others' profiles are fetched and cached on first encounter.
6. **Platform-integrated where possible.** On Steam, friends lists and presence come from Steam's API via `PlatformServices`. On standalone builds, IC provides its own social graph backed by community servers. Both paths converge at the same profile UI.

### Profile Structure

A player profile contains these sections, each with its own visibility controls:

**1. Identity Core**

| Field         | Description                                                             | Source                                    | Max Size                |
| ------------- | ----------------------------------------------------------------------- | ----------------------------------------- | ----------------------- |
| Display Name  | Primary visible name                                                    | Player-set, locally stored                | 32 chars                |
| Avatar        | Profile image                                                           | Pre-built gallery or custom upload        | 128×128 PNG, max 64 KB  |
| Banner        | Profile background image                                                | Pre-built gallery or custom upload        | 600×200 PNG, max 128 KB |
| Bio           | Short self-description                                                  | Player-written                            | 500 chars               |
| Player Title  | Earned or selected title (e.g., "Iron Commander", "Mammoth Enthusiast") | Achievement reward or community grant     | 48 chars                |
| Faction Crest | Preferred faction emblem (displayed on profile card)                    | Player-selected from game module factions | Enum per game module    |

**Display names** are not globally unique. Uniqueness is per-community (the community server enforces its own name policy). In a lobby, players are identified by `display_name + community_badge` or `display_name + player_key_prefix` when no community is shared. This matches how Discord handles names post-2023 (display names are cosmetic, uniqueness is contextual).

**Avatar system:**

- **Pre-built gallery:** Ships with ~60 avatars extracted from C&C unit portraits, faction emblems, and structure icons (using game assets the player already owns — loaded by `ra-formats`, not distributed by IC). Each game module contributes its own set.
- **Custom upload:** Players can set any 128×128 PNG image (max 64 KB) as their avatar. The image is stored in the local profile. When joining a lobby, only the SHA-256 hash is transmitted (32 bytes). Other clients fetch the actual image on demand from the player (via the relay, same channel as P2P resource sharing from D052). Fetched avatars are cached locally.
- **Content moderation:** Custom avatars are not moderated by IC (no central server to moderate). Community servers can optionally enforce "gallery-only avatars" as a room policy. Players can report abusive avatars to community moderators via the same mechanism used for reporting cheaters (D052 revocation).
- **Hash-based deduplication:** Two players using the same custom avatar send the same hash. The image is fetched once and shared from cache. This also means pre-built gallery avatars never need network transfer — both clients have them locally.

```rust
pub struct PlayerAvatar {
    pub source: AvatarSource,
    pub hash: [u8; 32],          // SHA-256 of the PNG data
}

pub enum AvatarSource {
    Gallery { module: GameModuleId, index: u16 },  // Pre-built
    Custom,                                          // Player-uploaded PNG
}
```

**2. Achievement Showcase**

Players can **pin up to 6 achievements** to their profile from their D036 achievement collection. Pinned achievements appear prominently on the profile card and in lobby hover tooltips.

```
┌──────────────────────────────────────────────────────┐
│ ★ Achievements (3 pinned / 47 total)                 │
│  🏆 Iron Curtain           Survived 100 Ion Cannons  │
│  🎖️ Desert Fox             Win 50 Desert maps        │
│  ⚡ Blitz Commander         Win under 5 minutes       │
│                                                      │
│  [View All Achievements →]                           │
└──────────────────────────────────────────────────────┘
```

- Pinned achievements are verified: each has a backing SCR from the relevant community. Viewers can inspect the credential (signed by community X, earned on date Y).
- Achievement rarity is shown when viewing the full achievement list: "Earned by 12% of players on this community."
- Mod-defined achievements (D036) appear in the profile just like built-in ones — they're all SCRs.

**3. Statistics Card**

A summary of the player's competitive record, sourced from verified SCRs (D052). Statistics are **per-community, per-game-module** — a player might be 1800 in RA1 on Official IC but 1400 in TD on Clan Wolfpack.

```
┌──────────────────────────────────────────────────────┐
│ 📊 Statistics — Official IC Community (RA1)          │
│                                                      │
│  Rank:      ★ Colonel I                                 │
│  Rating:    1971 ± 45 (Glicko-2)     Peak: 2023     │
│  Season:    S3 2028  |  Peak Rank: Brigadier III    │
│  Matches:   342 played  |  W: 198  L: 131  D: 13    │
│  Win Rate:  57.9%                                    │
│  Streak:    W4 (current)  |  Best: W11               │
│  Playtime:  ~412 hours                               │
│  Faction:   67% Soviet  |  28% Allied  |  5% Random  │
│                                                      │
│  [Match History →]  [Rating Graph →]                 │
│  [Switch Community ▾]  [Switch Game Module ▾]        │
└──────────────────────────────────────────────────────┘
```

- **Rank tier badge (D055):** Resolved from the game module's `ranked-tiers.yaml` configuration. Shows current tier + division and peak tier this season. Icon and color from the tier definition.
- **Rating graph:** Visual chart showing rating over time (last 50 matches). Rendered client-side from match SCR timestamps and rating deltas.
- **Faction distribution:** Calculated from match SCRs. Displayed as a simple bar or pie.
- **Playtime:** Estimated from match durations in local match history. Approximate — not a verified claim.
- **Win streak:** Current and best, calculated client-side from match SCRs.
- All numbers come from signed credential records. If a player presents a 1800 rating badge, the viewer's client cryptographically verifies it against the community's public key. **Fake ratings are mathematically impossible.**
- **Verification badge:** Each stat line shows which community signed it and whether the viewer's client successfully verified the signature. A ✅ means "signature valid, community key recognized." A ⚠️ means "signature valid, but community key not in your trusted list." A ❌ means "signature verification failed — possible tampering." This is visible in the detailed stats view, not the compact tooltip (to avoid visual clutter).
- **Inspect credential:** Any SCR-backed number in the profile is clickable. Clicking opens a verification detail panel showing: signing community name + public key fingerprint, SCR sequence number, signature timestamp, raw signed payload (hex-encoded), and verification result. This is the blockchain-style "prove it" button — except it's just Ed25519 signatures, no blockchain needed.

**4. Match History**

Scrollable list of recent matches, each showing:

| Field                     | Source                                |
| ------------------------- | ------------------------------------- |
| Date & time               | Match SCR timestamp                   |
| Map name                  | Match SCR metadata                    |
| Players                   | Match SCR participant list            |
| Result (Win/Loss/Draw)    | Match SCR outcome                     |
| Rating change (+/- delta) | Computed from consecutive rating SCRs |
| Replay link               | Local replay file if available        |

Match history is stored locally (from the player's credential SQLite file). Community servers do not host full match histories — they only issue rating/match SCRs. This is consistent with the local-first principle.

**5. Friends & Social**

IC supports two complementary friend systems:

- **Platform friends (Steam, GOG, etc.):** Retrieved via `PlatformServices::friends_list()`. These are the player's existing social graph — no IC-specific action needed. Platform friends appear in the in-game friends list automatically. Presence information (online, in-game, in-lobby) is synced bidirectionally with the platform.
- **IC friends (community-based):** Players can add friends within a community by mutual friend request. Stored in the local credential file as a bidirectional relationship. Friend list is per-community (friend on Official IC ≠ friend on Clan Wolfpack), but the UI merges all community friends into one unified list with community labels.

```rust
/// Stored in local SQLite — not a signed credential.
/// Friendships are social bookmarks, not reputation data.
pub struct FriendEntry {
    pub player_key: [u8; 32],
    pub display_name: String,         // cached, may be stale
    pub community: CommunityId,       // where the friendship was made
    pub added_at: u64,
    pub notes: Option<String>,        // private label (e.g., "met in tournament")
}
```

**Friends list UI:**

```
┌──────────────────────────────────────────────────────┐
│ 👥 Friends (8 online / 23 total)                     │
│                                                      │
│  🟢 alice          In Lobby — Desert Arena    [Join] │
│  🟢 cmdrzod        In Game — RA1 1v1          [Spec] │
│  🟡 bob            Away (15m)                        │
│  🟢 carol          Online — Main Menu         [Inv]  │
│  ─── Offline ───                                     │
│  ⚫ dave           Last seen: 2 days ago             │
│  ⚫ eve            Last seen: 1 week ago             │
│                                                      │
│  [Add Friend]  [Pending (2)]  [Blocked (1)]          │
└──────────────────────────────────────────────────────┘
```

- **Presence states:** Online, In Game, In Lobby, Away, Invisible, Offline. Synced through the community server (lightweight heartbeat), or through `PlatformServices::set_presence()` on Steam/GOG/etc.
- **Join/Spectate/Invite:** One-click actions from the friends list. "Join" puts you in their lobby. "Spec" joins as spectator if the match is in progress and allows it. "Invite" sends a lobby invite.
- **Friend requests:** Mutual-consent only. Player A sends request, Player B accepts or declines. No one-sided "following" (this prevents stalking).
- **Block list:** Blocked players are hidden from the friends list, their chat messages are filtered client-side (see Lobby Communication in D052), and they cannot send friend requests. Blocks are local-only — the blocked player is not notified.
- **Notes:** Private per-friend notes visible only to you. Useful for remembering context ("great teammate", "met at tournament").

**6. Community Memberships**

Players can be members of multiple communities (D052). The profile displays which communities they belong to, with verification badges:

```
┌──────────────────────────────────────────────────────┐
│ 🏛️ Communities                                       │
│                                                      │
│  ✅ Official IC Community     Member since 2027-01   │
│     Rating: 1823 (RA1)  |  342 matches               │
│  ✅ Clan Wolfpack             Member since 2027-03   │
│     Rating: 1456 (TD)   |  87 matches                │
│  ✅ RA Competitive League     Member since 2027-06   │
│     Tournament rank: #12                              │
│                                                      │
│  [Join Community...]                                 │
└──────────────────────────────────────────────────────┘
```

Each community membership is backed by a signed credential — the ✅ badge means the viewer's client verified the SCR signature against the community's public key. This is IC's differentiator: **community memberships are cryptographically proven, not self-claimed.** When viewing another player's profile, you can see exactly which communities vouch for them and their verified standing in each.

**Signed Profile Summary ("proof sheet")**

When viewing another player's full profile, a **Verification Summary** panel shows every community that has signed data for this player, what they've signed, and whether the signatures check out:

```
┌──────────────────────────────────────────────────────────────────┐
│ 🔒 Profile Verification Summary                                 │
│                                                                  │
│  Community                Signed Data             Status         │
│  ─────────────────────────────────────────────────────────       │
│  Official IC Community    Rating (1823, RA1)      ✅ Verified    │
│                           342 matches             ✅ Verified    │
│                           23 achievements         ✅ Verified    │
│                           Member since 2027-01    ✅ Verified    │
│  Clan Wolfpack            Rating (1456, TD)       ✅ Verified    │
│                           87 matches              ✅ Verified    │
│                           Member since 2027-03    ✅ Verified    │
│  RA Competitive League    Tournament rank #12     ⚠️ Untrusted   │
│                           Member since 2027-06    ⚠️ Untrusted   │
│                                                                  │
│  ✅ = Signature verified, community in your trust list           │
│  ⚠️ = Signature valid, community NOT in your trust list          │
│  ❌ = Signature verification failed (possible tampering)         │
│                                                                  │
│  [Manage Trusted Communities...]                                 │
└──────────────────────────────────────────────────────────────────┘
```

This panel answers the question: **"Can I trust what this player's profile claims?"** The answer is always cryptographically grounded — not trust-me-bro, not server-side-only, but locally verified Ed25519 signatures against community public keys the viewer explicitly trusts.

**How verification works (viewer-side flow):**

1. Player B presents profile data to Player A.
2. Each SCR-backed field includes the raw SCR (payload + signature + community public key).
3. Player A's client verifies: `Ed25519::verify(community_public_key, payload, signature)`.
4. Player A's client checks: is `community_public_key` in my `trusted_communities` table?
5. If yes → ✅ Verified. If signature valid but community not trusted → ⚠️ Untrusted. If signature invalid → ❌ Failed.
6. All unsigned fields (bio, avatar, display name) are displayed as player-claimed — no verification badge.

This means **every number in the Statistics Card and every badge in Community Memberships is independently verifiable by any viewer** without contacting any server. The verification is offline-capable — if a player has the community's public key cached, they can verify another player's profile on a plane with no internet.

**7. Workshop Creator Profile**

For players who publish mods, maps, or assets to the Workshop (D030/D050), the profile shows a creator section:

```
┌──────────────────────────────────────────────────────┐
│ 🔧 Workshop Creator                                  │
│                                                      │
│  Published: 12 resources  |  Total downloads: 8,420  │
│  ★ Featured: alice/hd-sprites (4,200 downloads)      │
│  Latest: alice/desert-nights (uploaded 3 days ago)   │
│                                                      │
│  [View All Publications →]                           │
└──────────────────────────────────────────────────────┘
```

This section appears only for players who have published at least one Workshop resource. Download counts and publication metadata come from the Workshop registry index (D030). Creator tips (D035) link from here.

**8. Custom Profile Elements**

Optional fields that add personality without cluttering the default view:

| Element          | Description                                   | Source                             |
| ---------------- | --------------------------------------------- | ---------------------------------- |
| Favorite Quote   | One-liner (e.g., "Kirov reporting!")          | Player-written, 100 chars max      |
| Favorite Unit    | Displayed with unit portrait from game assets | Player-selected per game module    |
| Replay Highlight | Link to one pinned replay                     | Local replay file                  |
| Social Links     | External URLs (Twitch, YouTube, etc.)         | Player-set, max 3 links            |
| Country Flag     | Optional nationality display                  | Player-selected from ISO 3166 list |

These fields are optional and hidden by default. Players who want a minimal profile show only the identity core and statistics. Players who want a rich social presence can fill in everything.

### Profile Viewing Contexts

The profile appears in different contexts with different levels of detail:

| Context                              | What's shown                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| **Lobby player list**                | Avatar (32×32), display name, rating badge, voice status, ready state                       |
| **Lobby hover tooltip**              | Avatar (64×64), display name, bio (first line), top 3 pinned achievements, rating, win rate |
| **Profile card** (click player name) | Full profile: all sections respecting the viewed player's privacy settings                  |
| **Game browser** (room list)         | Host avatar + name, host rating badge                                                       |
| **In-game sidebar**                  | Player color, display name, faction crest                                                   |
| **Post-game scoreboard**             | Avatar, display name, rating change (+/-), match stats                                      |
| **Friends list**                     | Avatar, display name, presence state, community label                                       |

### Privacy Controls

Every profile section has a visibility setting:

| Visibility Level | Who can see it                                                      |
| ---------------- | ------------------------------------------------------------------- |
| **Public**       | Anyone who encounters your profile (lobby, game browser, post-game) |
| **Friends**      | Only players on your friends list                                   |
| **Community**    | Only players who share at least one community membership with you   |
| **Private**      | Only you                                                            |

Defaults:

| Section                   | Default Visibility                      |
| ------------------------- | --------------------------------------- |
| Display Name              | Public                                  |
| Avatar                    | Public                                  |
| Bio                       | Public                                  |
| Player Title              | Public                                  |
| Faction Crest             | Public                                  |
| Achievement Showcase      | Public                                  |
| Statistics Card           | Public                                  |
| Match History             | Friends                                 |
| Friends List              | Friends                                 |
| Community Memberships     | Public                                  |
| Workshop Creator          | Public                                  |
| Custom Elements           | Friends                                 |
| Behavioral Profile (D042) | **Private (immutable — never exposed)** |

The behavioral profile from D042 (`PlayerStyleProfile`) is **categorically excluded** from the player profile. It's local analytics data for AI training and self-improvement — not social data. This is a hard privacy boundary.

### Profile Storage

Local profile data is stored in the player's SQLite database (D034):

```sql
-- Core profile (locally authoritative)
CREATE TABLE profile (
    player_key      BLOB PRIMARY KEY,  -- own Ed25519 public key
    display_name    TEXT NOT NULL,
    bio             TEXT,
    title           TEXT,
    country_code    TEXT,              -- ISO 3166 alpha-2, nullable
    favorite_quote  TEXT,
    favorite_unit   TEXT,              -- "module:unit_id" format
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

-- Avatar and banner images (stored as blobs)
CREATE TABLE profile_images (
    image_hash      TEXT PRIMARY KEY,  -- SHA-256 hex
    image_type      TEXT NOT NULL,     -- 'avatar' or 'banner'
    image_data      BLOB NOT NULL,     -- PNG bytes
    width           INTEGER NOT NULL,
    height          INTEGER NOT NULL
);

-- Profile references (avatar, banner, highlight replay)
CREATE TABLE profile_refs (
    ref_type        TEXT PRIMARY KEY,  -- 'avatar', 'banner', 'highlight_replay'
    ref_value       TEXT NOT NULL      -- image_hash, or replay file path
);

-- Pinned achievements (up to 6)
CREATE TABLE pinned_achievements (
    slot            INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 6),
    achievement_id  TEXT NOT NULL,     -- references achievements table (D036)
    community_id    BLOB,             -- which community signed it (nullable for local)
    pinned_at       INTEGER NOT NULL
);

-- Friends list
CREATE TABLE friends (
    player_key      BLOB NOT NULL,
    community_id    BLOB NOT NULL,     -- community where friendship was established
    display_name    TEXT,              -- cached name (may be stale)
    notes           TEXT,
    added_at        INTEGER NOT NULL,
    PRIMARY KEY (player_key, community_id)
);

-- Block list
CREATE TABLE blocked_players (
    player_key      BLOB PRIMARY KEY,
    reason          TEXT,
    blocked_at      INTEGER NOT NULL
);

-- Privacy settings
CREATE TABLE privacy_settings (
    section         TEXT PRIMARY KEY,  -- 'bio', 'stats', 'match_history', etc.
    visibility      TEXT NOT NULL      -- 'public', 'friends', 'community', 'private'
);

-- Social links (max 3)
CREATE TABLE social_links (
    slot            INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 3),
    label           TEXT NOT NULL,     -- 'Twitch', 'YouTube', custom
    url             TEXT NOT NULL
);

-- Cached profiles of other players (fetched on encounter)
CREATE TABLE cached_profiles (
    player_key      BLOB PRIMARY KEY,
    display_name    TEXT,
    avatar_hash     TEXT,
    bio             TEXT,
    title           TEXT,
    last_seen       INTEGER,          -- timestamp of last encounter
    fetched_at      INTEGER NOT NULL
);

-- Trusted communities (for profile verification and matchmaking filtering)
CREATE TABLE trusted_communities (
    community_key   BLOB PRIMARY KEY,  -- Ed25519 public key of the community
    community_name  TEXT,              -- cached display name
    community_url   TEXT,              -- cached URL
    auto_trusted    INTEGER NOT NULL DEFAULT 0,  -- 1 if trusted because you're a member
    trusted_at      INTEGER NOT NULL
);

-- Cached community public keys (learned from encounters, not yet trusted)
CREATE TABLE known_communities (
    community_key   BLOB PRIMARY KEY,
    community_name  TEXT,
    community_url   TEXT,
    first_seen      INTEGER NOT NULL,  -- when we first encountered this key
    last_seen       INTEGER NOT NULL
);
```

**Cache eviction:** Cached profiles of other players are evicted LRU after 1000 entries or 30 days since last encounter. Avatar images in `profile_images` are evicted if they're not referenced by own profile or any cached profile.

### Profile Synchronization

Profiles are **not centrally hosted**. Each player owns their profile data locally. When a player enters a lobby or is viewed by another player, profile data is exchanged peer-to-peer (via the relay, same as resource sharing in D052).

**Flow when Player A views Player B's profile:**

1. Player A's client checks `cached_profiles` for Player B's key.
2. If cache miss or stale (>24 hours), request profile from Player B via relay.
3. Player B's client responds with profile data (respecting B's privacy settings — only fields visible to A's access level are included).
4. Player A's client verifies any SCR-backed fields (ratings, achievements, community memberships) against known community public keys.
5. Player A's client caches the profile.
6. If Player B's avatar hash is unknown, Player A requests the avatar image. Cached locally after fetch.

**Bandwidth:** A full profile response is ~2 KB (excluding avatar image). Avatar image is max 64 KB, fetched once and cached. For a typical lobby of 8 players, initial profile loading is ~16 KB text + up to 512 KB avatars — negligible, and avatars are fetched only once per unique player.

### Trusted Communities & Trust-Based Filtering

Players can configure a list of **trusted communities** — the communities whose signed credentials they consider authoritative. This is the trust anchor for everything in the profile system.

**Configuration:**

```toml
# settings.toml — communities section
[[communities.joined]]
name = "Official IC Community"
url = "https://official.ironcurtain.gg"
public_key = "ed25519:abc123..."   # cached on first join

[[communities.joined]]
name = "Clan Wolfpack"
url = "https://wolfpack.example.com"
public_key = "ed25519:def456..."

[communities]
# Communities whose signed credentials you trust for profile verification
# and matchmaking filtering. You don't need to be a member to trust a community.
trusted = [
    "ed25519:abc123...",    # Official IC Community
    "ed25519:def456...",    # Clan Wolfpack
    "ed25519:789ghi...",    # EU Competitive League (not a member, but trust their ratings)
]
```

Joined communities are automatically trusted (you trust the community you chose to join). Players can also trust communities they haven't joined — e.g., "I'm not a member of the EU Competitive League, but I trust their ratings as legitimate." Trust is granted by public key, so it survives community renames and URL changes.

**Trust levels displayed in profiles:**

When viewing another player's profile, stats from trusted vs. untrusted communities are visually distinct:

| Badge | Meaning                                            | Display                                           |
| ----- | -------------------------------------------------- | ------------------------------------------------- |
| ✅     | Signature valid + community in your trust list     | Full color, prominent                             |
| ⚠️     | Signature valid + community NOT in your trust list | Dimmed, italic, "Untrusted community" tooltip     |
| ❌     | Signature verification failed                      | Red, strikethrough, "Verification failed" warning |
| —     | No signed data (player-claimed)                    | Gray, no badge                                    |

This lets players immediately distinguish between "1800 rated on a community I trust" and "1800 rated on some random community I've never heard of." The profile doesn't hide untrusted data — it shows it clearly labeled so the viewer can make their own judgment.

**Trust-based matchmaking and lobby filtering:**

Players can require that opponents have verified credentials from their trusted communities. This is configured per-queue and per-room:

```rust
/// Matchmaking preferences — sent to the community server when queuing.
pub struct MatchmakingPreferences {
    pub game_module: GameModuleId,
    pub rating_range: Option<(i32, i32)>,             // min/max rating
    pub require_trusted_profile: TrustRequirement,     // NEW
}

pub enum TrustRequirement {
    /// Match with anyone — no credential check. Default for casual.
    None,
    /// Opponent must have a verified profile from any community
    /// the matchmaking server itself trusts (server-side check).
    AnyCommunityVerified,
    /// Opponent must have a verified profile from at least one of
    /// these specific communities (by public key). Client sends
    /// the list; server filters accordingly.
    SpecificCommunities(Vec<CommunityPublicKey>),
}
```

**How it works in practice:**

- **Casual play (default):** `TrustRequirement::None`. Anyone can join. Profile badges appear but aren't gatekeeping. Maximum player pool, minimum friction.
- **"Verified only" mode:** `TrustRequirement::AnyCommunityVerified`. The matchmaking server checks that the opponent has at least one valid SCR from a community the *server* trusts. This filters out completely anonymous players without requiring specific community membership. Good for semi-competitive play.
- **"Trusted community" mode:** `TrustRequirement::SpecificCommunities([official_ic_key, wolfpack_key])`. The server matches you only with players who have valid SCRs from at least one of those specific communities. This is the strongest filter — effectively "I only play with people vouched for by communities I trust."

**Room-level trust requirements:**

Room hosts can set a trust requirement when creating a room:

```
┌──────────────────────────────────────────────────────┐
│ Room Settings                                        │
│                                                      │
│  Trust Requirement: [Verified Only ▾]                │
│    ○ Anyone can join (no verification)               │
│    ● Verified profile required                       │
│    ○ Specific communities only:                      │
│      ☑ Official IC Community                         │
│      ☑ Clan Wolfpack                                 │
│      ☐ EU Competitive League                         │
│                                                      │
│  [Create Room]                                       │
└──────────────────────────────────────────────────────┘
```

When a player tries to join a room with a trust requirement they don't meet, they see a clear rejection: "This room requires a verified profile from: Official IC Community or Clan Wolfpack. [Join Official IC Community...] [Join Clan Wolfpack...]"

**Game browser filtering:**

The game browser (Tier 3 in D052) gains a trust filter column:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Game Browser                                              [Refresh]   │
├──────────┬──────┬─────────┬────────┬──────┬───────────────┬─────────────┤
│ Room     │ Host │ Players │ Map    │ Ping │ Trust         │ Mods        │
├──────────┼──────┼─────────┼────────┼──────┼───────────────┼─────────────┤
│ Ranked   │ cmdr │ 1/2     │ Arena  │ 23ms │ ✅ Official   │ none        │
│ HD Game  │ alice│ 3/4     │ Europe │ 45ms │ ⚠️ Any verified│ hd-pack 2.1 │
│ Open     │ bob  │ 2/6     │ Desert │ 67ms │ 🔓 Anyone     │ none        │
└──────────┴──────┴─────────┴────────┴──────┴───────────────┴─────────────┘
│  Filter: [☑ Show only rooms I can join]  [☑ Show trusted communities]   │
```

The `Show only rooms I can join` filter hides rooms whose trust requirements you don't meet — so you don't see rooms you'll be rejected from. The `Show trusted communities` filter shows only rooms hosted on communities in your trust list.

**Why this matters:**

This solves the smurf/alt-account problem that plagues every competitive game. A player can't create a fresh anonymous account and grief ranked lobbies — the room requires verified credentials from a trusted community, which means they need a real history of matches. It also solves the fake-rating problem: you can't claim to be 1800 unless a community you trust has signed an SCR proving it.

But it's **not authoritarian**. Players who want casual, open, unverified games can play freely. Trust requirements are opt-in per-room and per-matchmaking-queue. The default is open. The tools are there for communities that want stronger verification — they're not forced on anyone.

**Anti-abuse considerations:**

- **Community collusion:** A bad actor could create a community, sign fake credentials, and present them. But no one else would trust that community's key. Trust is explicitly granted by each player. This is a feature, not a bug — it's exactly how PGP/GPG web-of-trust works, minus the key-signing parties.
- **Community ban evasion:** If a player is banned from a community (D052 revocation), their SCRs from that community become unverifiable. They can't present banned credentials. They'd need to join a different community and rebuild reputation from scratch.
- **Privacy:** The trust requirement reveals which communities a player is a member of (since they must present SCRs). Players uncomfortable with this can stick to `TrustRequirement::None` rooms. The privacy controls from D053 still apply — you choose which community memberships are visible on your profile, but if a room *requires* membership proof, you must present it to join.

### Relationship to Existing Decisions

- **D034 (SQLite):** Profile storage is SQLite. Cached profiles, friends, block lists — all local SQLite tables.
- **D036 (Achievements):** Pinned achievements on the profile reference D036 achievement records. Achievement verification uses D052 SCRs.
- **D042 (Behavioral Profiles):** Categorically separate. D042 is local AI training data. D053 is social-facing identity. They never merge. This is a hard privacy boundary.
- **D046 (Premium Content):** Cosmetic purchases (if any) are displayed in the profile (e.g., custom profile borders, title unlocks). But the core profile is always free and full-featured.
- **D050 (Workshop):** Workshop creator statistics feed the creator profile section.
- **D052 (Community Servers & SCR):** The verification backbone. Every reputation claim in the profile (rating, achievements, community membership) is backed by a signed credential. D053 is the user-facing layer; D052 is the cryptographic foundation. Trusted Communities (D053) determine which SCR issuers the player considers authoritative — this feeds into profile display, lobby filtering, and matchmaking preferences.

### Alternatives Considered

- **Central profile server** (rejected — contradicts federation model, creates single point of failure, requires infrastructure IC doesn't want to operate)
- **Blockchain-based identity** (rejected — massively overcomplicated, no user benefit over Ed25519 SCR, environmental concerns)
- **Rich profile customization (themes, animations, music)** (deferred — too much scope for initial implementation. May be added as Workshop cosmetic packs in Phase 6+)
- **Full social network features (posts, feeds, groups)** (rejected — out of scope. IC is a game, not a social network. Communities, friends, and profiles are sufficient. Players who want social features use Discord)
- **Mandatory real name / identity verification** (rejected — privacy violation, hostile to the gaming community's norms, not IC's business)

### Phase

- **Phase 3:** Basic profile (display name, avatar, bio, local storage, lobby display). Friends list (platform-backed via `PlatformServices`).
- **Phase 5:** Community-backed profiles (SCR-verified ratings, achievements, memberships). IC friends (community-based mutual friend requests). Presence system. Profile cards in lobby. Trusted communities configuration. Trust-based matchmaking filtering. Profile verification UI (signed proof sheet). Game browser trust filters.
- **Phase 6a:** Workshop creator profiles. Full achievement showcase. Custom profile elements. Privacy controls UI. Profile viewing in game browser. Cross-community trust discovery.

---

---

## D061: Player Data Backup & Portability

|                |                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                          |
| **Driver**     | Players need to back up, restore, and migrate their game data — saves, replays, profiles, screenshots, statistics — across machines and over time |
| **Depends on** | D034 (SQLite), D053 (Player Profile), D052 (Community Servers & SCR), D036 (Achievements), D010 (Snapshottable Sim)                               |

### Problem

Every game that stores player data eventually faces the same question: "How do I move my stuff to a new computer?" The answer ranges from terrible (hunt for hidden AppData folders, hope you got the right files) to opaque (proprietary cloud sync that works until it doesn't). IC's local-first architecture (D034, D053) means all player data already lives on the player's machine — which is both the opportunity and the responsibility. If everything is local, losing that data means losing everything: campaign progress, competitive history, replay collection, social connections.

The design must satisfy three requirements:
1. **Backup:** A player can create a complete, restorable snapshot of all their IC data.
2. **Portability:** A player can move their data to another machine or a fresh install and resume exactly where they left off.
3. **Data export:** A player can extract their data in standard, human-readable formats (GDPR Article 20 compliance, and just good practice).

### Design Principles

1. **"Just copy the folder" must work.** The data directory is self-contained. No registry entries, no hidden temp folders, no external database connections. A manual copy of `<data_dir>/` is a valid (if crude) backup.
2. **Standard formats only.** ZIP for archives, SQLite for databases, PNG for images, YAML/JSON for configuration. No proprietary backup format. A player should be able to inspect their own data with standard tools (DB Browser for SQLite, any image viewer, any text editor).
3. **No IC-hosted cloud.** IC does not operate cloud storage. Cloud sync is opt-in through existing platform services (Steam Cloud, GOG Galaxy). This avoids infrastructure cost, liability, and the temptation to make player data hostage to a service.
4. **SCRs are inherently portable.** Signed Credential Records (D052) are self-verifying — they carry the community public key, payload, and Ed25519 signature. A player's verified ratings, achievements, and community memberships work on any IC install without re-earning or re-validating. This is IC's unique advantage over every competitor.
5. **Backup is a first-class CLI feature.** Not buried in a settings menu, not a third-party tool. `ic backup create` is a documented, supported command.

### Data Directory Layout

All player data lives under a single, stable, documented directory. The layout is defined at Phase 0 (directory structure), stabilized by Phase 2 (save/replay formats finalized), and fully populated by Phase 5 (multiplayer profile data).

```
<data_dir>/
├── config.toml                         # Engine + game settings (D033 toggles, keybinds, render quality)
├── profile.db                          # Player identity, friends, blocks, privacy settings (D053)
├── achievements.db                     # Achievement collection (D036)
├── gameplay.db                         # Event log, replay catalog, save game index, map catalog, asset index (D034)
├── telemetry.db                        # Unified telemetry events (D031) — pruned at 100 MB
├── keys/                               # Player Ed25519 keypair (D052) — THE critical file
│   └── identity.key                    # Private key — recoverable via mnemonic seed phrase
├── communities/                        # Per-community credential stores (D052)
│   ├── official-ic.db                  # SCRs: ratings, match results, achievements
│   └── clan-wolfpack.db
├── saves/                              # Save game files (.icsave)
│   ├── campaign-allied-mission5.icsave
│   ├── autosave-001.icsave
│   ├── autosave-002.icsave
│   └── autosave-003.icsave            # Rotating 3-slot autosave
├── replays/                            # Replay files (.icrep)
│   └── 2027-03-15-ranked-1v1.icrep
├── screenshots/                        # Screenshot images (PNG with metadata)
│   └── 2027-03-15-154532.png
├── workshop/                           # Downloaded Workshop content (D030)
│   ├── cache.db                        # Workshop metadata cache (D034)
│   ├── blobs/                          # Content-addressed blob store (D049, Phase 6a)
│   └── packages/                       # Per-package manifests (references into blobs/)
├── mods/                               # Locally installed mods
├── maps/                               # Locally installed maps
├── logs/                               # Engine log files (rotated)
└── backups/                            # Created by `ic backup create`
    └── ic-backup-2027-03-15.zip
```

**Platform-specific `<data_dir>` resolution:**

| Platform       | Default Location                                                         |
| -------------- | ------------------------------------------------------------------------ |
| Windows        | `%APPDATA%\IronCurtain\`                                                 |
| macOS          | `~/Library/Application Support/IronCurtain/`                             |
| Linux          | `$XDG_DATA_HOME/iron-curtain/` (default: `~/.local/share/iron-curtain/`) |
| Steam Deck     | Same as Linux                                                            |
| Browser (WASM) | OPFS virtual filesystem (see `05-FORMATS.md` § Browser Storage)          |
| Mobile         | App sandbox (platform-managed)                                           |

**Override:** `IC_DATA_DIR` environment variable or `--data-dir` CLI flag overrides the default. Useful for portable installs (USB drive), multi-account testing, or custom backup scripts.

### Backup System: `ic backup` CLI

The `ic backup` CLI provides safe, consistent backups. Following the Fossilize-inspired CLI philosophy (D020 — each subcommand does one focused thing well):

```
ic backup create                              # Full backup → <data_dir>/backups/ic-backup-<date>.zip
ic backup create --output ~/my-backup.zip     # Custom output path
ic backup create --exclude replays,workshop   # Smaller backup — skip large data
ic backup create --only keys,profile,saves    # Targeted backup — critical data only
ic backup restore ic-backup-2027-03-15.zip    # Restore from backup (prompts on conflict)
ic backup restore backup.zip --overwrite      # Restore without prompting
ic backup list                                # List available backups with size and date
ic backup verify ic-backup-2027-03-15.zip     # Verify archive integrity without restoring
```

**How `ic backup create` works:**

1. **SQLite databases:** Each `.db` file is backed up using `VACUUM INTO '<temp>.db'` — this creates a consistent, compacted copy without requiring the database to be closed. WAL checkpoints are folded in. No risk of copying a half-written WAL file.
2. **Binary files:** `.icsave`, `.icrep`, `.icpkg` files are copied as-is (they're self-contained).
3. **Image files:** PNG screenshots are copied as-is.
4. **Config files:** `config.toml` and other TOML configuration files are copied as-is.
5. **Key files:** `keys/identity.key` is included (the player's private key — also recoverable via mnemonic seed phrase, but a full backup preserves everything).
6. **Package:** Everything is bundled into a ZIP archive with the original directory structure preserved. No compression on already-compressed files (`.icsave`, `.icrep` are LZ4-compressed internally).

**Backup categories for `--exclude` and `--only`:**

| Category       | Contents                       | Typical Size   | Critical?                                      |
| -------------- | ------------------------------ | -------------- | ---------------------------------------------- |
| `keys`         | `keys/identity.key`            | < 1 KB         | **Yes** — recoverable via mnemonic seed phrase |
| `profile`      | `profile.db`                   | < 1 MB         | **Yes** — friends, settings, avatar            |
| `communities`  | `communities/*.db`             | 1–10 MB        | **Yes** — ratings, match history (SCRs)        |
| `achievements` | `achievements.db`              | < 1 MB         | **Yes** — SCR-backed achievement proofs        |
| `config`       | `config.toml`                  | < 100 KB       | Medium — preferences, easily recreated         |
| `saves`        | `saves/*.icsave`               | 10–100 MB      | High — campaign progress, in-progress games    |
| `replays`      | `replays/*.icrep`              | 100 MB – 10 GB | Low — sentimental, not functional              |
| `screenshots`  | `screenshots/*.png`            | 10 MB – 5 GB   | Low — sentimental, not functional              |
| `workshop`     | `workshop/` (cache + packages) | 100 MB – 50 GB | None — re-downloadable                         |
| `gameplay`     | `gameplay.db`                  | 10–100 MB      | Medium — event log, catalogs (rebuildable)     |
| `mods`         | `mods/`                        | Variable       | Low — re-downloadable or re-installable        |
| `maps`         | `maps/`                        | Variable       | Low — re-downloadable                          |

**Default `ic backup create`** includes: `keys`, `profile`, `communities`, `achievements`, `config`, `saves`, `replays`, `screenshots`, `gameplay`. Excludes `workshop`, `mods`, `maps` (re-downloadable). Total size for a typical player: 200 MB – 2 GB.

### Profile Export: JSON Data Portability

For GDPR Article 20 compliance and general good practice, IC provides a machine-readable profile export:

```
ic profile export                             # → <data_dir>/exports/profile-export-<date>.json
ic profile export --format json               # Explicit format (JSON is default)
```

**Export contents:**

```json
{
  "export_version": "1.0",
  "exported_at": "2027-03-15T14:30:00Z",
  "engine_version": "0.5.0",
  "identity": {
    "display_name": "CommanderZod",
    "public_key": "ed25519:abc123...",
    "bio": "Tank rush enthusiast since 1996",
    "title": "Iron Commander",
    "country": "DE",
    "created_at": "2027-01-15T10:00:00Z"
  },
  "communities": [
    {
      "name": "Official IC Community",
      "public_key": "ed25519:def456...",
      "joined_at": "2027-01-15",
      "rating": { "game_module": "ra1", "value": 1823, "rd": 45 },
      "matches_played": 342,
      "achievements": 23,
      "credentials": [
        {
          "type": "rating",
          "payload_hex": "...",
          "signature_hex": "...",
          "note": "Self-verifying — import on any IC install"
        }
      ]
    }
  ],
  "friends": [
    { "display_name": "alice", "community": "Official IC Community", "added_at": "2027-02-01" }
  ],
  "statistics_summary": {
    "total_matches": 429,
    "total_playtime_hours": 412,
    "win_rate": 0.579,
    "faction_distribution": { "soviet": 0.67, "allied": 0.28, "random": 0.05 }
  },
  "saves_count": 12,
  "replays_count": 287,
  "screenshots_count": 45
}
```

The key feature: **SCRs are included in the export and are self-verifying.** A player can import their profile JSON on a new machine, and their ratings and achievements are cryptographically proven without contacting any server. No other game offers this.

### Platform Cloud Sync (Optional)

For players who use Steam, GOG Galaxy, or other platforms with cloud save support, IC can optionally sync critical data via the `PlatformServices` trait:

```rust
/// Extension to PlatformServices (D053) for cloud backup.
pub trait PlatformCloudSync {
    /// Upload a small file to platform cloud storage.
    fn cloud_save(&self, key: &str, data: &[u8]) -> Result<()>;
    /// Download a file from platform cloud storage.
    fn cloud_load(&self, key: &str) -> Result<Option<Vec<u8>>>;
    /// List available cloud files.
    fn cloud_list(&self) -> Result<Vec<CloudEntry>>;
    /// Available cloud storage quota (bytes).
    fn cloud_quota(&self) -> Result<CloudQuota>;
}

pub struct CloudQuota {
    pub used: u64,
    pub total: u64,  // e.g., Steam Cloud: ~1 GB per game
}
```

**What syncs:**

| Data                | Sync?   | Rationale                                                                       |
| ------------------- | ------- | ------------------------------------------------------------------------------- |
| `keys/identity.key` | **Yes** | Critical — also recoverable via mnemonic seed phrase, but cloud sync is simpler |
| `profile.db`        | **Yes** | Small, essential                                                                |
| `communities/*.db`  | **Yes** | Small, contains verified reputation (SCRs)                                      |
| `achievements.db`   | **Yes** | Small, contains achievement proofs                                              |
| `config.toml`       | **Yes** | Small, preserves preferences across machines                                    |
| Latest autosave     | **Yes** | Resume campaign on another machine (one `.icsave` only)                         |
| `saves/*.icsave`    | No      | Too large for cloud quotas (user manages manually)                              |
| `replays/*.icrep`   | No      | Too large, not critical                                                         |
| `screenshots/*.png` | No      | Too large, not critical                                                         |
| `workshop/`         | No      | Re-downloadable                                                                 |

**Total cloud footprint:** ~5–20 MB. Well within Steam Cloud's ~1 GB per-game quota.

**Sync triggers:** Cloud sync happens at: game launch (download), game exit (upload), and after completing a match/mission (upload changed community DBs). Never during gameplay — no sync I/O on the hot path.

### Screenshots

Screenshots are standard PNG files with embedded metadata in the PNG `tEXt` chunks:

| Key                | Value                                           |
| ------------------ | ----------------------------------------------- |
| `IC:EngineVersion` | `"0.5.0"`                                       |
| `IC:GameModule`    | `"ra1"`                                         |
| `IC:MapName`       | `"Arena"`                                       |
| `IC:Timestamp`     | `"2027-03-15T15:45:32Z"`                        |
| `IC:Players`       | `"CommanderZod (Soviet) vs alice (Allied)"`     |
| `IC:GameTick`      | `"18432"`                                       |
| `IC:ReplayFile`    | `"2027-03-15-ranked-1v1.icrep"` (if applicable) |

Standard PNG viewers ignore these chunks; IC's screenshot browser reads them for filtering and organization. The screenshot hotkey (mapped in `config.toml`) captures the current frame, embeds metadata, and saves to `screenshots/` with a timestamped filename.

### Mnemonic Seed Recovery

The Ed25519 private key in `keys/identity.key` is the player's cryptographic identity. If lost without backup, ratings, achievements, and community memberships are gone. Cloud sync and auto-snapshots mitigate this, but both require the original machine to have been configured correctly. A player who never enabled cloud sync and whose hard drive dies loses everything.

**Mnemonic seed phrases** solve this with zero infrastructure. Inspired by BIP-39 (Bitcoin Improvement Proposal 39), the pattern derives a cryptographic keypair deterministically from a human-readable word sequence. The player writes the words on paper. On any machine, entering those words regenerates the identical keypair. The cheapest, most resilient "cloud backup" is a piece of paper in a drawer.

#### How It Works

1. **Key generation:** When IC creates a new identity, it generates 256 bits of entropy from the OS CSPRNG (`getrandom`).
2. **Mnemonic encoding:** The entropy maps to a 24-word phrase from the BIP-39 English wordlist (2048 words, 11 bits per word, 24 × 11 = 264 bits — 256 bits entropy + 8-bit checksum). The wordlist is curated for unambiguous reading: no similar-looking words, no offensive words, sorted alphabetically. Example: `abandon ability able about above absent absorb abstract absurd abuse access accident`.
3. **Key derivation:** The mnemonic phrase is run through PBKDF2-HMAC-SHA512 (2048 rounds, per BIP-39 spec) with an optional passphrase as salt (default: empty string). The 512-bit output is truncated to 32 bytes and used as the Ed25519 private key seed.
4. **Deterministic output:** Same 24 words + same passphrase → identical Ed25519 keypair on any platform. The derivation uses only standardized primitives (PBKDF2, HMAC, SHA-512, Ed25519) — no IC-specific code in the critical path.

```rust
/// Derives an Ed25519 keypair from a BIP-39 mnemonic phrase.
///
/// The derivation is deterministic: same words + same passphrase
/// always produce the same keypair on every platform.
pub fn keypair_from_mnemonic(
    words: &[&str; 24],
    passphrase: &str,
) -> Result<Ed25519Keypair, MnemonicError> {
    let entropy = mnemonic_to_entropy(words)?;  // validate checksum
    let salt = format!("mnemonic{}", passphrase);
    let mut seed = [0u8; 64];
    pbkdf2_hmac_sha512(
        &entropy_to_seed_input(words),
        salt.as_bytes(),
        2048,
        &mut seed,
    );
    let signing_key = Ed25519SigningKey::from_bytes(&seed[..32])?;
    Ok(Ed25519Keypair {
        signing_key,
        verifying_key: signing_key.verifying_key(),
    })
}
```

#### Optional Passphrase (Advanced)

The mnemonic can optionally be combined with a user-chosen passphrase during key derivation. This provides two-factor recovery: the 24 words (something you wrote down) + the passphrase (something you remember). Different passphrases produce different keypairs from the same words — useful for advanced users who want plausible deniability or multiple identities from one seed. The default is no passphrase (empty string). The UI does not promote this feature — it's accessible via CLI and the advanced section of the recovery flow.

#### CLI Commands

```
ic identity seed show          # Display the 24-word mnemonic for the current identity
                               # Requires interactive confirmation ("This is your recovery phrase.
                               # Anyone with these words can become you. Write them down and
                               # store them somewhere safe.")
ic identity seed verify        # Enter 24 words to verify they match the current identity
ic identity recover            # Enter 24 words (+ optional passphrase) to regenerate keypair
                               # If identity.key already exists, prompts for confirmation
                               # before overwriting
ic identity recover --passphrase  # Prompt for passphrase in addition to mnemonic
```

#### Security Properties

| Property                   | Detail                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entropy**                | 256 bits from OS CSPRNG — same as generating a key directly. The mnemonic is an encoding, not a weakening.                                    |
| **Brute-force resistance** | 2²⁵⁶ possible mnemonics. Infeasible to enumerate.                                                                                             |
| **Checksum**               | Last 8 bits are SHA-256 checksum of the entropy. Catches typos during recovery (1 word wrong → checksum fails).                               |
| **Offline**                | No network, no server, no cloud. The 24 words ARE the identity.                                                                               |
| **Standard**               | BIP-39 is used by every major cryptocurrency wallet. Millions of users have successfully recovered keys from mnemonic phrases. Battle-tested. |
| **Platform-independent**   | Same words produce the same key on Windows, macOS, Linux, WASM, mobile. The derivation uses only standardized cryptographic primitives.       |

#### What the Mnemonic Does NOT Replace

- **Cloud sync** — still the best option for seamless multi-device use. The mnemonic is the disaster recovery layer beneath cloud sync.
- **Regular backups** — the mnemonic recovers the *identity* (keypair). It does not recover save files, replays, screenshots, or settings. A full backup preserves everything.
- **Community server records** — after mnemonic recovery, the player's keypair is restored, but community servers still hold the match history and SCRs. No re-earning needed — the recovered keypair matches the old public key, so existing SCRs validate automatically.

#### Precedent

The BIP-39 mnemonic pattern has been used since 2013 by Bitcoin, Ethereum, and every major cryptocurrency wallet. Ledger, Trezor, MetaMask, and Phantom all use 24-word recovery phrases as the standard key backup mechanism. The pattern has survived a decade of adversarial conditions (billions of dollars at stake) and is understood by millions of non-technical users. IC adapts the encoding and derivation steps verbatim — the only IC-specific part is using the derived key for Ed25519 identity rather than cryptocurrency transactions.

### Player Experience

The mechanical design above (CLI, formats, directory layout) is the foundation. This section defines what the *player* actually sees and feels. The guiding principle: **players should never lose data without trying.** The system works in layers:

1. **Invisible layer (always-on):** Cloud sync for critical data, automatic daily snapshots
2. **Gentle nudge layer:** Milestone-based reminders, status indicators in settings
3. **Explicit action layer:** In-game Data & Backup panel, CLI for power users
4. **Emergency layer:** Disaster recovery, identity re-creation guidance

#### First Launch — New Player

Integrates with D032's "Day-one nostalgia choice." After the player picks their experience profile (Classic/Remastered/Modern), two additional steps:

**Step 1 — Identity creation + recovery phrase:**

```
┌─────────────────────────────────────────────────────────────┐
│                     WELCOME TO IRON CURTAIN                 │
│                                                             │
│  Your player identity has been created.                     │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  CommanderZod                                         │  │
│  │  ID: ed25519:7f3a...b2c1                              │  │
│  │  Created: 2027-03-15                                  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Your recovery phrase — write these 24 words down and       │
│  store them somewhere safe. They can restore your           │
│  identity on any machine.                                   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  1. abandon     7. absorb    13. acid     19. across  │  │
│  │  2. ability     8. abstract  14. acoustic  20. act    │  │
│  │  3. able        9. absurd    15. acquire  21. action  │  │
│  │  4. about      10. abuse     16. adapt    22. actor   │  │
│  │  5. above      11. access    17. add      23. actress │  │
│  │  6. absent     12. accident  18. addict   24. actual  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [I've written them down]            [Skip — I'll do later] │
│                                                             │
│  You can view this phrase anytime: Settings → Data & Backup │
│  or run `ic identity seed show` from the command line.      │
└─────────────────────────────────────────────────────────────┘
```

**Step 2 — Cloud sync offer:**

```
┌─────────────────────────────────────────────────────────────┐
│                     PROTECT YOUR DATA                       │
│                                                             │
│  Your recovery phrase protects your identity. Cloud sync    │
│  also protects your settings, ratings, and progress.        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ☁  Enable Cloud Sync                               │    │
│  │    Automatically backs up your profile,             │    │
│  │    ratings, and settings via Steam Cloud.           │    │
│  │    [Enable]                                         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [Continue]                     [Skip — I'll set up later]  │
│                                                             │
│  You can always manage backups in Settings → Data & Backup  │
└─────────────────────────────────────────────────────────────┘
```

**Rules:**
- Identity creation is automatic — no sign-up, no email, no password
- The recovery phrase is shown once during first launch, then always accessible via Settings or CLI
- Cloud sync is offered but not required — "Continue" without enabling works fine
- Skipping the recovery phrase is allowed (no forced engagement) — the first milestone nudge will remind
- If no platform cloud is available (non-Steam/non-GOG install), Step 2 instead shows: "We recommend creating a backup after your first few games. IC will remind you."
- The entire flow is skippable — no forced engagement

#### First Launch — Existing Player on New Machine

This is the critical UX flow. Detection logic on first launch:

```
                    ┌──────────────┐
                    │ First launch │
                    │  detected    │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐        ┌──────────────────┐
                    │ Platform     │  Yes   │ Offer automatic  │
                    │ cloud data   ├───────►│ cloud restore    │
                    │ available?   │        └──────────────────┘
                    └──────┬───────┘
                           │ No
                    ┌──────▼───────┐
                    │ Show restore │
                    │ options      │
                    └──────────────┘
```

**Cloud restore path (automatic detection):**

```
┌─────────────────────────────────────────────────────────────┐
│                  EXISTING PLAYER DETECTED                    │
│                                                             │
│  Found data from your other machine:                        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  CommanderZod                                         │  │
│  │  Rating: 1823 (Private First Class)                   │  │
│  │  342 matches played · 23 achievements                 │  │
│  │  Last played: March 14, 2027 on DESKTOP-HOME          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [Restore my data]              [Start fresh instead]       │
│                                                             │
│  Restores: identity, ratings, achievements, settings,       │
│  friends list, and latest campaign autosave.                │
│  Replays, screenshots, and full saves require a backup      │
│  file or manual folder copy.                                │
└─────────────────────────────────────────────────────────────┘
```

**Manual restore path (no cloud data):**

```
┌─────────────────────────────────────────────────────────────┐
│                     WELCOME TO IRON CURTAIN                 │
│                                                             │
│  Played before? Restore your data:                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  🔑  Recover from recovery phrase                   │    │
│  │      Enter your 24-word phrase to restore identity  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  📁  Restore from backup file                       │    │
│  │      Browse for a .zip backup created by IC         │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  📂  Copy from existing data folder                 │    │
│  │      Point to a copied <data_dir> from your old PC  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [Start fresh — create new identity]                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Mnemonic recovery flow (from "Recover from recovery phrase"):**

```
┌─────────────────────────────────────────────────────────────┐
│                   RECOVER YOUR IDENTITY                      │
│                                                             │
│  Enter your 24-word recovery phrase:                        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  1. [________]   7. [________]  13. [________]       │  │
│  │  2. [________]   8. [________]  14. [________]       │  │
│  │  3. [________]   9. [________]  15. [________]       │  │
│  │  4. [________]  10. [________]  16. [________]       │  │
│  │  5. [________]  11. [________]  17. [________]       │  │
│  │  6. [________]  12. [________]  18. [________]       │  │
│  │                                                       │  │
│  │  19. [________]  21. [________]  23. [________]      │  │
│  │  20. [________]  22. [________]  24. [________]      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [Advanced: I used a passphrase]                            │
│                                                             │
│  [Recover]                                       [Back]     │
│                                                             │
│  Autocomplete suggests words as you type. Only BIP-39       │
│  wordlist entries are accepted.                              │
└─────────────────────────────────────────────────────────────┘
```

On successful recovery, the flow shows the restored identity (display name, public key fingerprint) and continues to the normal first-launch experience. Community servers recognize the recovered identity by its public key — existing SCRs validate automatically.

**Note:** Mnemonic recovery restores the *identity only* (keypair). Save files, replays, screenshots, and settings are not recovered by the phrase — those require a full backup or folder copy. The restore options panel makes this clear: "Recover from recovery phrase" is listed alongside "Restore from backup file" because they solve different problems. A player who has both a phrase and a backup should use the backup (it includes everything); a player who only has the phrase gets their identity back and can re-earn or re-download the rest.

**Restore progress (both paths):**

```
┌─────────────────────────────────────────────────────────────┐
│                     RESTORING YOUR DATA                     │
│                                                             │
│  ████████████████████░░░░░░░░  68%                          │
│                                                             │
│  ✓ Identity key                                             │
│  ✓ Profile & friends                                        │
│  ✓ Community ratings (3 communities, 12 SCRs verified)      │
│  ✓ Achievements (23 achievement proofs verified)            │
│  ◎ Save games (4 of 12)...                                  │
│  ○ Replays                                                  │
│  ○ Screenshots                                              │
│  ○ Settings                                                 │
│                                                             │
│  SCR verification: all credentials cryptographically valid  │
└─────────────────────────────────────────────────────────────┘
```

Key UX detail: **SCRs are verified during restore and the player sees it.** The progress screen shows credentials being cryptographically validated. This is a trust-building moment — "your reputation is portable and provable" becomes tangible.

#### Automatic Behaviors (No Player Interaction Required)

Most players never open a settings screen for backup. These behaviors protect them silently:

**Auto cloud sync (if enabled):**
- **On game exit:** Upload changed `profile.db`, `communities/*.db`, `achievements.db`, `config.toml`, `keys/identity.key`, latest autosave. Silent — no UI prompt.
- **On game launch:** Download cloud data, merge if needed (last-write-wins for simple files; SCR merge for community DBs — SCRs are append-only with timestamps, so merge is deterministic).
- **After completing a match:** Upload updated community DB (new match result / rating change). Background, non-blocking.

**Automatic daily snapshots (always-on, even without cloud):**
- On first launch of the day, the engine writes a lightweight "critical data snapshot" to `<data_dir>/backups/auto-critical-N.zip` containing only `keys/`, `profile.db`, `communities/*.db`, `achievements.db`, `config.toml` (~5 MB total).
- Rotating 3-day retention: `auto-critical-1.zip`, `auto-critical-2.zip`, `auto-critical-3.zip`. Oldest overwritten.
- No user interaction, no prompt, no notification. Background I/O during asset loading — invisible.
- Even players who never touch backup settings have 3 rolling days of critical data protection.

**Post-milestone nudges (main menu toasts):**

After significant events, a non-intrusive toast appears on the main menu — same system as D030's Workshop cleanup toasts:

| Trigger                                | Toast (cloud sync active)                                                    | Toast (no cloud sync)                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| First ranked match                     | `Your competitive career has begun! Your rating is backed up automatically.` | `Your competitive career has begun! Protect your rating: [Back up now]  [Dismiss]`                       |
| First campaign mission                 | `Campaign progress saved.` (no toast — autosave handles it)                  | `Campaign progress saved. [Create backup]  [Dismiss]`                                                    |
| New ranked tier reached                | `Congratulations — Private First Class!`                                     | `Congratulations — Private First Class! [Back up now]  [Dismiss]`                                        |
| 30 days without full backup (no cloud) | —                                                                            | `It's been a month since your last backup. Your data folder is 1.4 GB. [Back up now]  [Remind me later]` |

**Nudge rules:**
- **Never during gameplay.** Only on main menu or post-game screen.
- **Maximum one nudge per session.** If multiple triggers fire, highest-priority wins.
- **Dismissable and respectful.** "Remind me later" delays by 7 days. Three consecutive dismissals for the same nudge type = never show that nudge again.
- **No nudges if cloud sync is active and healthy.** The player is already protected.
- **No nudges for the first 3 game sessions.** Let players enjoy the game before talking about data management.

#### Settings → Data & Backup Panel

In-game UI for players who want to manage their data visually. Accessible from Main Menu → Settings → Data & Backup. This is the GUI equivalent of the `ic backup` CLI — same operations, visual interface.

```
┌──────────────────────────────────────────────────────────────────┐
│  Settings > Data & Backup                                        │
│                                                                  │
│  ┌─ DATA HEALTH ──────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  Identity key          ✓ Backed up (Steam Cloud)           │  │
│  │  Profile & ratings     ✓ Synced 2 hours ago                │  │
│  │  Achievements          ✓ Synced 2 hours ago                │  │
│  │  Campaign progress     ✓ Latest autosave synced            │  │
│  │  Last full backup      March 10, 2027 (5 days ago)         │  │
│  │  Data folder size      1.4 GB                              │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ BACKUP ───────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  [Create full backup]     Saves everything to a .zip file  │  │
│  │  [Create critical only]   Keys, profile, ratings (< 5 MB)  │  │
│  │  [Restore from backup]    Load a .zip backup file          │  │
│  │                                                            │  │
│  │  Saved backups:                                            │  │
│  │    ic-backup-2027-03-10.zip     1.2 GB    [Open] [Delete]  │  │
│  │    ic-backup-2027-02-15.zip     980 MB    [Open] [Delete]  │  │
│  │    auto-critical-1.zip          4.8 MB    (today)          │  │
│  │    auto-critical-2.zip          4.7 MB    (yesterday)      │  │
│  │    auto-critical-3.zip          4.7 MB    (2 days ago)     │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ CLOUD SYNC ───────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  Status: Active (Steam Cloud)                              │  │
│  │  Last sync: March 15, 2027 14:32                           │  │
│  │  Cloud usage: 12 MB / 1 GB                                 │  │
│  │                                                            │  │
│  │  [Sync now]  [Disable cloud sync]                          │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ EXPORT & PORTABILITY ─────────────────────────────────────┐  │
│  │                                                            │  │
│  │  [Export profile (JSON)]   Machine-readable data export    │  │
│  │  [Open data folder]        Browse files directly           │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**When cloud sync is not available** (non-Steam/non-GOG install), the Cloud Sync section shows:

```
│  ┌─ CLOUD SYNC ───────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  Status: Not available                                     │  │
│  │  Cloud sync requires Steam or GOG Galaxy.                  │  │
│  │                                                            │  │
│  │  Your data is protected by automatic daily snapshots.      │  │
│  │  We recommend creating a full backup periodically.         │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
```

And Data Health adjusts severity indicators:

```
│  │  Identity key          ⚠ Local only — not cloud-backed     │  │
│  │  Profile & ratings     ⚠ Local only                        │  │
│  │  Last full backup      Never                               │  │
│  │  Last auto-snapshot    Today (keys + profile + ratings)    │  │
```

The ⚠ indicator is yellow, not red — it's a recommendation, not an error. "Local only" is a valid state, not a broken state.

**"Create full backup" flow:** Clicking the button opens a save-file dialog (pre-filled with `ic-backup-<date>.zip`). A progress bar shows backup creation. On completion: `Backup created: ic-backup-2027-03-15.zip (1.2 GB)` with [Open folder] button. The same categories as `ic backup create --exclude` are exposed via checkboxes in an "Advanced" expander (collapsed by default).

**"Restore from backup" flow:** Opens a file browser filtered to `.zip` files. After selection, shows the restore progress screen (see "First Launch — Existing Player" above). If existing data conflicts with backup data, prompts: `Your current data differs from the backup. [Overwrite with backup]  [Cancel]`.

#### Screenshot Gallery

The screenshot browser (Phase 3) uses PNG `tEXt` metadata to organize screenshots into a browsable gallery. Accessible from Main Menu → Screenshots:

```
┌──────────────────────────────────────────────────────────────────┐
│  Screenshots                                        [Take now ⌂] │
│                                                                  │
│  Filter: [All maps ▾]  [All modes ▾]  [Date range ▾]  [Search…] │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │            │  │            │  │            │  │            │ │
│  │  (thumb)   │  │  (thumb)   │  │  (thumb)   │  │  (thumb)   │ │
│  │            │  │            │  │            │  │            │ │
│  ├────────────┤  ├────────────┤  ├────────────┤  ├────────────┤ │
│  │ Arena      │  │ Fjord      │  │ Arena      │  │ Red Pass   │ │
│  │ 1v1 Ranked │  │ 2v2 Team   │  │ Skirmish   │  │ Campaign   │ │
│  │ Mar 15     │  │ Mar 14     │  │ Mar 12     │  │ Mar 10     │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘ │
│                                                                  │
│  Selected: Arena — 1v1 Ranked — Mar 15, 2027 15:45               │
│  CommanderZod (Soviet) vs alice (Allied) · Tick 18432            │
│  [Watch replay]  [Open file]  [Copy to clipboard]  [Delete]      │
│                                                                  │
│  Total: 45 screenshots (128 MB)                                  │
└──────────────────────────────────────────────────────────────────┘
```

Key feature: **"Watch replay" links directly to the replay file** via the `IC:ReplayFile` metadata. Screenshots become bookmarks into match history. A screenshot gallery doubles as a game history browser.

Filters use metadata: map name, game module, date, player names. Sorting by date (default), map, or file size.

#### Identity Loss — Disaster Recovery

If a player loses their machine with no backup and no cloud sync, the outcome depends on whether they saved their recovery phrase:

**Recoverable via mnemonic seed phrase:**
- Ed25519 private key (the identity itself) — enter 24 words on any machine to regenerate the identical keypair
- Community recognition — recovered key matches the old public key, so existing SCRs validate automatically
- Ratings and match history — community servers recognize the recovered identity without admin intervention

**Not recoverable via mnemonic (requires backup or re-creation):**
- Campaign save files, replay files, screenshots
- Local settings and preferences
- Achievement proofs signed by the old key (can be re-earned; or restored from backup if available)

**Re-downloadable:**
- Workshop content (mods, maps, resource packs)

**Partially recoverable via community (if mnemonic was also lost):**
- **Ratings and match history.** Community servers retain match records. A player creates a new identity, and a community admin can associate the new identity with the old record via a verified identity transfer (community-specific policy, not IC-mandated). The old SCRs prove the old identity held those ratings.
- **Friends.** Friends with the player in their list can re-add the new identity.

**Recovery hierarchy (best to worst):**
1. **Full backup** — everything restored, including saves, replays, screenshots
2. **Cloud sync** — identity, profile, ratings, settings, latest autosave restored
3. **Mnemonic seed phrase** — identity restored; saves, replays, settings lost
4. **Nothing saved** — fresh identity; community admin can transfer old records

**UX for total loss (no phrase, no backup, no cloud):** No special "recovery wizard." The player creates a fresh identity. The first-launch flow on the new identity presents the recovery phrase prominently. The system prevents the same mistake twice.

#### Console Commands (D058)

All Data & Backup panel operations have console equivalents:

| Command                     | Effect                                                       |
| --------------------------- | ------------------------------------------------------------ |
| `/backup create`            | Create full backup (interactive — shows progress)            |
| `/backup create --critical` | Create critical-only backup                                  |
| `/backup restore <path>`    | Restore from backup file                                     |
| `/backup list`              | List saved backups                                           |
| `/backup verify <path>`     | Verify archive integrity                                     |
| `/profile export`           | Export profile to JSON                                       |
| `/identity seed show`       | Display 24-word recovery phrase (requires confirmation)      |
| `/identity seed verify`     | Enter 24 words to verify they match current identity         |
| `/identity recover`         | Enter 24 words to regenerate keypair (overwrites if exists)  |
| `/data health`              | Show data health summary (identity, sync status, backup age) |
| `/data folder`              | Open data folder in system file manager                      |
| `/cloud sync`               | Trigger immediate cloud sync                                 |
| `/cloud status`             | Show cloud sync status and quota                             |

### Alternatives Considered

- **Proprietary backup format with encryption** (rejected — contradicts "standard formats only" principle; a ZIP file can be encrypted separately with standard tools if the player wants encryption)
- **IC-hosted cloud backup service** (rejected — creates infrastructure liability, ongoing cost, and makes player data dependent on IC's servers surviving; violates local-first philosophy)
- **Database-level replication** (rejected — over-engineered for the use case; SQLite `VACUUM INTO` is simpler, safer, and produces a self-contained file)
- **Steam Cloud as primary backup** (rejected — platform-specific, limited quota, opaque sync behavior; IC supports it as an *option*, not a requirement)
- **Incremental backup** (deferred — full backup via `VACUUM INTO` is sufficient for player-scale data; incremental adds complexity with minimal benefit unless someone has 50+ GB of replays)
- **Forced backup before first ranked match** (rejected — punishes players to solve a problem most won't have; auto-snapshots protect critical data without friction)
- **Scary "BACK UP YOUR KEY OR ELSE" warnings** (rejected — fear-based UX is hostile; the recovery phrase provides a genuine safety net, making fear unnecessary; factual presentation of options replaces warnings)
- **12-word mnemonic phrase** (rejected — 12 words = 128 bits of entropy; sufficient for most uses but 24 words = 256 bits matches Ed25519's full key strength; the BIP-39 ecosystem standardized on 24 words for high-security applications; the marginal cost of 12 extra words is negligible for a one-time operation)
- **Custom IC wordlist** (rejected — BIP-39's English wordlist is battle-tested, curated for unambiguous reading, and familiar to millions of cryptocurrency users; a custom list would need the same curation effort with no benefit)

### Integration with Existing Decisions

- **D010 (Snapshottable Sim):** Save files are sim snapshots — the backup system treats them as opaque binary files. No special handling needed beyond file copy.
- **D020 (Mod SDK & CLI):** The `ic backup` and `ic profile export` commands join the `ic` CLI family alongside `ic mod`, `ic replay`, `ic campaign`.
- **D030 (Workshop):** Post-milestone nudge toasts use the same toast system as Workshop cleanup prompts — consistent notification UX.
- **D032 (UI Themes):** First-launch identity creation integrates as the final step after theme selection. The Data & Backup panel is theme-aware.
- **D034 (SQLite):** SQLite is the backbone of player data storage. `VACUUM INTO` is the safe backup primitive — it handles WAL mode correctly and produces a compacted single-file copy.
- **D052 (Community Servers & SCR):** SCRs are the portable reputation unit. The backup system preserves them; the export system includes them. Because SCRs are cryptographically signed, they're self-verifying on import — no server round-trip needed. Restore progress screen visibly verifies SCRs.
- **D053 (Player Profile):** The profile export is D053's data portability implementation. All locally-authoritative profile fields export to JSON; all SCR-backed fields export with full credential data.
- **D036 (Achievements):** Achievement proofs are SCRs stored in `achievements.db`. Backup preserves them; export includes them in the JSON.
- **D058 (Console):** All backup/export operations have `/backup` and `/profile` console command equivalents.

### Phase

- **Phase 0:** Define and document the `<data_dir>` directory layout (this decision). Add `IC_DATA_DIR` / `--data-dir` override support.
- **Phase 2:** `ic backup create/restore` CLI ships alongside the save/load system. Screenshot capture with PNG metadata. Automatic daily critical snapshots (3-day rotating `auto-critical-N.zip`). Mnemonic seed generation integrated into identity creation — `ic identity seed show`, `ic identity seed verify`, `ic identity recover` CLI commands.
- **Phase 3:** Screenshot browser UI with metadata filtering and replay linking. Data & Backup settings panel (including "View recovery phrase" button). Post-milestone nudge toasts (first nudge reminds about recovery phrase if not yet confirmed). First-launch identity creation with recovery phrase display + cloud sync offer. Mnemonic recovery option in first-launch restore flow.
- **Phase 5:** `ic profile export` ships alongside multiplayer launch (GDPR compliance). Platform cloud sync via `PlatformServices` trait (Steam Cloud, GOG Galaxy). `ic backup verify` for archive integrity checking. First-launch restore flow (cloud detection + manual restore + mnemonic recovery). Console commands (`/backup`, `/profile`, `/identity`, `/data`, `/cloud`).


