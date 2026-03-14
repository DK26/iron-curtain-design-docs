## Vulnerability 18: Workshop Supply Chain Compromise

### The Problem

A trusted mod author's account is compromised (or goes rogue), and a malicious update is pushed to a widely-depended-upon Workshop resource. Thousands of players auto-update and receive the compromised package.

**Precedent:** The Minecraft **fractureiser** incident (June 2023). A malware campaign compromised CurseForge and Bukkit accounts, injecting a multi-stage downloader into popular mods. The malware stole browser credentials, Discord tokens, and cryptocurrency wallets. It propagated through the dependency chain — mods depending on compromised libraries inherited the payload. The incident affected millions of potential downloads before detection. CurseForge had SHA-256 checksums and author verification, but neither helped because the attacker *was* the authenticated author pushing a "legitimate" update.

IC's WASM sandbox (Vulnerability 5) prevents runtime exploits — a malicious WASM mod cannot access the filesystem or network without explicit capabilities. But the supply chain threat is broader than WASM: YAML rules can reference malicious asset URLs, Lua scripts execute within the Lua sandbox, and even non-code resources (sprites, audio) could exploit parser vulnerabilities.

**Console script coverage (F8 closure):** Workshop-shareable `.iccmd` console scripts (D058) are executable content distributed through the Workshop. They are explicitly subject to the same supply chain security as all other Workshop content: SHA-256 integrity verification, author Ed25519 signing (V49), quarantine for popular packages (V51), and anomaly detection. Console scripts execute through the command parser — they can only invoke registered commands, never arbitrary code. Each command within an `.iccmd` script respects D058's permission model: `DEV_ONLY`, `SERVER`, achievement/ranked flags apply per-command. A script containing a forbidden command (e.g., a `DEV_ONLY` command in a non-dev context) is rejected at parse time, not silently skipped.

> **Lua sandbox surface:** Lua scripts are sandboxed via selective standard library loading (see `04-MODDING.md` § "Lua Sandbox Rules" for the full inclusion/exclusion table). The `io`, `os`, `package`, and `debug` modules are never loaded. Dangerous `base` functions (`dofile`, `loadfile`, `load`) are removed. `math.random` is redirected to the engine's deterministic PRNG (not removed — OpenRA compat requires it). This approach follows the precedent set by Stratagus, which excludes `io` and `package` in release builds — IC is stricter, also excluding `os` and `debug` entirely. Execution is bounded by `LuaExecutionLimits` (instruction count, memory, host call budget). The primary defense against malicious Lua is the sandbox + capability model, not code review.

### Mitigation: Defense-in-Depth Supply Chain Security

**Layer 1 — Reproducible builds and build provenance:**

- Workshop server records build metadata: source repository URL, commit hash, build environment, and builder identity.
- `ic mod publish --provenance` attaches a signed build attestation (inspired by SLSA/Sigstore). Consumers can verify that the published artifact was built from a specific commit in a public repository.
- Provenance is encouraged, not required — solo modders without CI/CD can still publish directly. But provenance-verified resources get a visible badge in the Workshop browser.

**Layer 2 — Update anomaly detection (Workshop server-side):**

- **Size delta alerts:** If a mod update changes package size by >50%, flag for review before making it available as `release`. Small balance tweaks don't triple in size.
- **New capability requests:** If a WASM module's declared capabilities change between versions (e.g., suddenly requests `network: AllowList`), flag for moderator review.
- **Dependency injection:** If an update adds new transitive dependencies that didn't exist before, flag. This was fractureiser's propagation vector.
- **Rapid-fire updates:** Multiple publishes within minutes to the same resource trigger rate limiting and moderator notification.

**Layer 3 — Author identity and account security:**

- **Two-factor authentication** required for Workshop publishing accounts (TOTP or WebAuthn).
- **Scoped API tokens** (D030) — CI/CD tokens can publish but not change account settings or transfer namespace ownership. A compromised CI token cannot escalate to full account control.
- **Namespace transfer requires manual moderator approval** — prevents silent account takeover.
- **Verified author badge** — linked GitHub/GitLab identity provides a second factor of trust. If a Workshop account is compromised but the linked Git identity is not, the community has a signal.

**Layer 4 — Client-side verification:**

- `ic.lock` pins exact versions AND SHA-256 checksums. `ic mod install` refuses mismatches. A supply chain attacker who replaces a package on the server cannot affect users who have already locked their dependencies.
- **Update review mode:** `ic mod update --review` shows a diff of what changed in each dependency before applying updates. Human review of changes before accepting is the last line of defense.
- **Rollback:** `ic mod rollback [resource] [version]` instantly reverts a dependency to a known-good version.

**Layer 5 — Incident response:**

- Workshop moderators can **yank** a specific version (remove from download but not from existing `ic.lock` files — users who already have it keep it, new installs get the previous version).
- **Security advisory system:** Workshop server can push advisories for specific resource versions. `ic mod audit` checks for advisories. The in-game mod manager displays warnings for affected resources.
- Community-hosted Workshop servers replicate advisories from the official server (opt-in).

**What this does NOT include:**
- Bytecode analysis or static analysis of WASM modules — too complex, too many false positives, and the capability sandbox is the real defense.
- Mandatory code review for all updates — doesn't scale. Anomaly detection targets the high-risk cases.
- Blocking updates entirely — that fragments the ecosystem. The goal is detection and fast response, not prevention of all possible attacks.

**Phase:** Basic SHA-256 verification and scoped tokens ship with initial Workshop (Phase 4–5). Anomaly detection and provenance attestation in Phase 6a. Security advisory system in Phase 6a. 2FA requirement for publishing accounts from Phase 5 onward.

## Vulnerability 19: Workshop Package Name Confusion (Typosquatting)

### The Problem

An attacker registers a Workshop package with a name confusingly similar to a popular one — hyphen/underscore swap (`tanks-mod` vs `tanks_mod`), letter substitution (`l`/`1`/`I`), added/removed prefix. Users install the malicious package by mistake. Unlike traditional package registries, game mod platforms attract users who are less likely to scrutinize exact package names.

**Real-world precedent:** npm `crossenv` (2017, typosquat of `cross-env`, stole CI tokens), crates.io `rustdecimal` (2022, typosquat of `rust_decimal`, exfiltrated environment variables), PyPI mass campaigns (2023–2024, thousands of auto-generated typosquats).

### Defense

**Publisher-scoped naming** is the structural defense: all packages use `publisher/package` format. Typosquatting `alice/tanks` requires spoofing the `alice` publisher identity — which means compromising authentication, not just picking a similar name. This converts a name-confusion attack into an account-takeover attack, which is guarded by V18's 5-layer defense.

**Additional mitigations:**

- **Name similarity check at publish time:** Levenshtein distance + common substitution patterns checked against existing packages within the same category. Flag for manual review if edit distance ≤ 2 from an existing package with >100 downloads. Automated rejection for exact homoglyph substitution.
- **Git-index CI enforcement:** Workshop-index CI rejects new package manifests whose names trigger the similarity checker. Manual override by moderator if it's a false positive.
- **Display warnings in mod manager:** When a user searches for `tanks-mod` and `tanks_mod` both exist, show a disambiguation notice with download counts and publisher reputation.

**Phase:** Publisher-scoped naming ships with Workshop Phase 0–3 (git-index). Similarity detection Phase 4+.

## Vulnerability 20: Manifest Confusion (Registry/Package Metadata Mismatch)

### The Problem

The git-hosted Workshop index stores a manifest summary per package. The actual `.icpkg` archive contains its own `manifest.yaml`. If these can diverge, an attacker submits a clean manifest to the git-index (passes review) while the actual `.icpkg` contains a different manifest with malicious dependencies or undeclared files. Auditors see the clean index entry; installers get the real (malicious) contents.

**Real-world precedent:** npm manifest confusion (2023) — JFrog discovered 800+ npm packages where registry metadata diverged from the actual `package.json` inside tarballs. 18 packages actively exploited this to hide malicious dependencies. Root cause: npm's publish API accepted manifest metadata separately from the tarball and never cross-verified them.

### Defense

**Canonical manifest is inside the `.icpkg`.** The git-index entry is a derived summary, not a replacement. The package's `manifest.yaml` inside the archive is the source of truth.

**Verification chain:**

1. **At publish time (CI validation):** CI downloads the `.icpkg` from the declared URL, extracts the internal `manifest.yaml`, computes `manifest_hash = SHA-256(manifest.yaml)`, and verifies it matches the `manifest_hash` field in the git-index entry. Mismatch → PR rejected.
2. **New field: `manifest_hash`** in the git-index entry — SHA-256 of the `manifest.yaml` file itself, separate from the full-package SHA-256. This lets clients verify manifest integrity independently of full package integrity.
3. **Client-side verification:** After downloading and extracting `.icpkg`, `ic mod install` verifies that the internal `manifest.yaml` matches the index's `manifest_hash` before processing any mod content. Mismatch → abort with clear error.
4. **Immutable publish pipeline:** No API accepts manifest metadata separately from the package archive. The index entry is always derived from the archive contents, never independently submitted.

**Phase:** Ships with initial Workshop (Phase 0–3 git-index includes manifest_hash validation).

## Vulnerability 21: Git-Index Poisoning via Cross-Scope PR

### The Problem

IC's git-hosted Workshop index (`workshop-index` repository) accepts package manifests via pull request. An attacker submits a PR that, in addition to adding their own package, subtly modifies another package's manifest — changing SHA-256 hashes to redirect downloads to malicious versions, altering dependency declarations, or modifying version metadata.

**Real-world precedent:** This is a novel attack surface specific to git-hosted package indexes (used by Cargo/crates.io's index, Homebrew, and IC). The closest analogs are Homebrew formula PR attacks and npm registry cache poisoning. GitHub Actions supply chain compromises (2023–2024, `tj-actions/changed-files` affecting 23,000+ repos, Codecov bash uploader affecting 29,000+ customers) demonstrate that CI trust boundaries are actively exploited.

### Defense

**Path-scoped PR validation:** CI must reject PRs that modify files outside the submitter's own package directory. If a PR adds `packages/alice/tanks/1.0.0.yaml`, it may ONLY modify files under `packages/alice/`. Any modification to other paths → automatic CI failure with detailed explanation.

**Additional mitigations:**

- **CODEOWNERS file:** Maps package paths to GitHub usernames (`packages/alice/** @alice-github`). GitHub enforces that only the owner can approve changes to their packages.
- **Consolidated index is CI-generated.** The aggregated `index.yaml` is deterministically rebuilt from per-package manifests by CI — never hand-edited. Any contributor can reproduce the build locally to verify.
- **Index signing:** CI generates the consolidated index and signs it with an Ed25519 key. Clients verify this signature. Even if the repository is compromised, the attacker cannot produce a valid signature without the signing key (stored outside GitHub — hardware security module or separate signing service).
- **CI hardening:** Pin all GitHub Actions to commit SHAs (tags are mutable). Minimal `GITHUB_TOKEN` permissions. No secrets in the PR validation pipeline — it only reads the diff, downloads a package from a public URL, and verifies hashes.
- **Two-maintainer rule for popular packages:** Packages with >500 downloads require approval from both the package author AND a Workshop index maintainer for manifest changes.

**Phase:** Path-scoped validation and CODEOWNERS ship with Workshop Phase 0 (git-index creation). Index signing Phase 3–4. CI hardening from Day 1.

## Vulnerability 22: Dependency Confusion in Federated Workshop

### The Problem

IC's Workshop supports federation — multiple package sources via `sources.yaml` (D050). A package `core/utils` could exist on both a local/private source and the official Workshop server with different content. Build resolution that checks public sources first (or doesn't distinguish sources) installs the attacker's public version instead of the intended private one.

**Real-world precedent:** Alex Birsan's dependency confusion research (2021) demonstrated this against 35+ companies including Apple, Microsoft, PayPal, and Uber — earning $130,000+ in bug bounties. npm, PyPI, and RubyGems were all vulnerable. The attack exploits the assumption that package names are globally unique across all sources.

### Defense

**Fully-qualified identifiers in lockfiles:** `ic.lock` records `source:publisher/package@version`, not just `publisher/package@version`. Resolution uses exact source match first, falls back to source priority order only for new (unlocked) dependencies.

**Additional mitigations:**

- **Explicit source priority:** `sources.yaml` defines strict priority order. Well-documented default resolution behavior: lockfile source → highest-priority source → error (never silently falls through to lower-priority).
- **Shadow package warnings:** If a dependency exists on multiple configured sources with different content (different SHA-256), `ic mod install` warns: "Package X exists on SOURCE_A and SOURCE_B with different content. Lockfile pins SOURCE_A."
- **Reserved namespace prefixes:** The official Workshop allows publishers to reserve namespace prefixes. `ic-core/*` packages can only be published by the IC team. Prevents squatting on engine-related namespaces.
- **`ic mod audit` source check:** Reports any dependency where the lockfile source differs from the highest-priority source — potential sign of confusion.

**Phase:** Lockfile source pinning ships with initial multi-source support (Phase 4–5). Shadow warnings Phase 5. Reserved namespaces Phase 4.

## Vulnerability 23: Version Immutability Violation

### The Problem

A package author (or compromised account) re-publishes the same version number with different content. Users who install "version 1.0.0" get different code depending on when they installed.

**Real-world precedent:** npm pre-2022 allowed version overwrites within 24 hours. The `left-pad` incident (2016) exposed that npm had no immutability guarantees and led to `npm unpublish` restrictions.

### Defense

**Explicit immutability rule:** Once version X.Y.Z is published, its content CANNOT be modified or overwritten. The SHA-256 hash recorded at publish time is permanent and immutable.

- **Yanking ≠ deletion:** Yanked versions are hidden from new `ic mod install` searches but remain downloadable for existing lockfiles that reference them. Their SHA-256 remains valid.
- **Git-index enforcement:** CI rejects PRs that modify fields in existing version manifest files (only additions of new version files are accepted). Checksum fields are append-only.
- **Registry enforcement (Phase 4+):** The Workshop server API rejects publish requests for existing version numbers with HTTP 409 Conflict. No override flag. No admin backdoor.

**Phase:** Immutability enforcement from Workshop Day 1 (git-index CI rule). Registry enforcement Phase 4.

## Vulnerability 24: Relay Connection Exhaustion

### The Problem

An attacker opens many connections to the relay server, exhausting its connection pool and memory, preventing legitimate players from connecting. Unlike bandwidth-based DDoS (mitigated by upstream providers), connection exhaustion targets application-level resources.

### Defense

**Layered connection limits at the relay:**

- **Max total connections per relay instance:** configurable, default 1000. Relay returns 503 when at capacity.
- **Max connections per IP address:** configurable, default 5.
- **New connection rate per IP:** max 10/sec, implemented as token bucket.
- **Memory budget per connection:** bounded; connection torn down if buffer allocations exceed limit.
- **Idle connection timeout:** connections with no game activity for >60 seconds are closed. Authenticated connections get a longer timeout (5 minutes).
- **Half-open connection defense** (existing, from Minetest): prevents UDP amplification. Combined with these limits, prevents both amplification and exhaustion.

These limits are in addition to the order rate control (V15) and bandwidth throttle, which handle abuse from established connections.

**Phase:** Ships with relay server implementation (Phase 5).

## Vulnerability 25: Desync-as-Denial-of-Service

### The Problem

A player with a modified client intentionally causes desyncs to disrupt games. Since desync detection requires investigation (state hash comparison, desync reports), repeated intentional desyncs can effectively grief matches — forcing game restarts or frustrating other players into leaving.

### Defense

**Per-player desync attribution:** The existing dual-mode state hashing (RNG comparison + periodic full hash) already identifies WHICH player's state diverges. Build on this:

- **Desync scoring:** Track which player's hash diverges in each desync event. If one player consistently diverges while all others agree, that player is the source.
- **Automatic disconnect:** If a single player causes the hash mismatch in 3 consecutive desync checks within one game, disconnect that player (not the entire game). Remaining players continue.
- **Cross-game strike system:** Parallel to anti-lag-switch strikes. Players who cause desyncs in 3+ games within a 24-hour window receive a temporary matchmaking cooldown (1 hour → 24 hours → 7 days escalation).
- **Replay evidence:** The desync report is attached to the match replay, allowing post-game review by moderators for ranked/competitive matches.

**Phase:** Per-player attribution ships with desync detection (Phase 5). Strike system Phase 5. Cross-game tracking requires account system.
