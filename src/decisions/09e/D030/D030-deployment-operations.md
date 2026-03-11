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

```toml
# mod.toml for a script library resource
[mod]
name = "rts-ai-behaviors"
category = "script-library"
version = "1.0.0"
license = "MIT"
description = "Reusable AI behavior patterns for mission scripting"
exports = ["patrol_routes", "guard_behaviors", "retreat_logic"]
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

```toml
# In mod.toml or resource manifest
[mod]
license = "CC-BY-SA-4.0"    # SPDX identifier (required for publishing)
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
  7. Adds discovered resources as dependencies in generated mod.toml
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

### Post-Play Feedback Prompts & Helpful Review Recognition (Optional, Profile-Only Rewards)

IC may prompt players **after a match/session/campaign step** for lightweight feedback on the experience and, when relevant, the active mode/mod/campaign package. This is intended to improve creator iteration quality without becoming a nag loop.

**Prompt design rules (normative):**
- **Sampled, not every match.** Use cooldowns/sampling and minimum playtime thresholds before prompting.
- **Skippable and snoozeable.** Always provide `Skip`, `Snooze`, and `Don't ask for this mode/mod` options.
- **Non-blocking.** Feedback prompts must not delay replay save, re-queue, or returning to menu.
- **Scope-labeled.** The UI should clearly state what the feedback applies to (base mode, specific Workshop mod, campaign pack, etc.).

**Creator feedback inbox (Workshop / My Content / Publishing):**
- Resource authors can view submitted feedback for their own resources (subject to community/server policy and privacy settings).
- Authors can triage entries as `Helpful`, `Needs follow-up`, `Duplicate`, or `Not actionable`.
- Marking a review as **Helpful** is a creator-quality signal, not a moderation verdict and not a rating override.

**Helpful-review rewards (strictly profile/social only):**
- Allowed examples: profile badges, reviewer reputation progress, cosmetic titles, creator acknowledgements ("Thanks from <creator>")
- Disallowed examples: gameplay currency, ranked benefits, unlocks that affect matches, hidden matchmaking advantages
- Reward state must be revocable if abuse/fraud is later detected (D037 governance + D052 moderation support)

**Community contribution recognition tiers (optional, profile-only):**
- **Badges (M10)** — visible milestones (e.g., `Helpful Reviewer`, `Field Analyst I–III`, `Creator Favorite`, `Community Tester`)
- **Contribution reputation (M10)** — a profile/social signal summarizing sustained helpful feedback quality (separate from ranked rating and Workshop star ratings)
- **Contribution points (M11+, optional)** — non-tradable, non-cashable, revocable points usable only for approved **profile/cosmetic** rewards (for example profile frames, banners, titles, showcase cosmetics). This is not a gameplay economy.
- **Contribution achievements (M10/M11)** — achievement entries for feedback quality milestones and creator acknowledgements (can include rare/manual "Exceptional Contributor" style recognition under community governance policy)

**Points / redemption guardrails (if enabled in Phase 7+):**
- Points are earned from **helpful/actionable** recognition, not positivity or review volume alone
- Points and reputation are **non-transferable**, **non-tradable**, and **cannot** be exchanged for paid currency
- Redeemable rewards must be **profile/cosmetic-only** (no gameplay, no ranked, no matchmaking weight)
- Communities may cap accrual, delay grants pending abuse checks, and revoke points/redeemed cosmetics if fraud/collusion is confirmed (D037)
- UI wording should prefer "community contribution rewards" or "profile rewards" over ambiguous "bonuses"

**Anti-abuse guardrails (normative):**
- One helpful-mark reward per review (idempotent if toggled)
- Minimum account age / playtime requirements before a review is eligible for helpful-reward recognition
- No self-reviews, collaborator self-dealing, or same-identity reward loops
- Rate limits and anomaly detection for reciprocal helpful-mark rings / alt-account farming
- "Helpful" must not be synonymous with "positive" — negative-but-actionable feedback remains eligible
- Communities may audit or revoke abusive helpful marks; repeated abuse affects creator reputation/moderation standing

**Relationship to D053:** Helpful-review recognition appears on the player's profile as a **community contribution / feedback quality** signal, separate from ranked stats and separate from Workshop star ratings.

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

