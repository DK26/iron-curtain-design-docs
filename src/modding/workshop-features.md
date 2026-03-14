### LLM-Driven Resource Discovery (D030)

The `ic-llm` crate can search the Workshop programmatically and incorporate discovered resources into generated content:

**Discovery pipeline:**

```
  ┌─────────────────────────────────────────────────────────────────┐
  │ LLM generates mission concept                                  │
  │ ("Soviet ambush in snowy forest with dramatic briefing")        │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Identify needed assets                                          │
  │ → winter terrain textures                                       │
  │ → Soviet voice lines                                            │
  │ → ambush/tension music                                          │
  │ → briefing video (optional)                                     │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Search Workshop via WorkshopClient                              │
  │ → query="winter terrain", tags=["snow", "forest"]              │
  │ → query="Soviet voice lines", tags=["soviet", "military"]     │
  │ → query="tension music", tags=["ambush", "suspense"]          │
  │ → Filter: ai_usage != Deny (exclude resources authors          │
  │   have marked as off-limits to LLM agents)                     │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Evaluate candidates via llm_meta                                │
  │ → Read summary, purpose, composition_hints,                     │
  │   content_description, related_resources                        │
  │ → Filter by license compatibility                               │
  │ → Rank by gameplay_tags match score                             │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Partition by ai_usage permission                                │
  │ → ai_usage: Allow  → auto-add as dependency (no human needed)  │
  │ → ai_usage: MetadataOnly → recommend to human for confirmation │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Add discovered resources as dependencies in generated mod.toml │
  │ → Allow resources added directly                                │
  │ → MetadataOnly resources shown as suggestions in editor UI     │
  │ → Dependencies resolved at install time via `ic mod install`   │
  └─────────────────────────────────────────────────────────────────┘
```

The LLM sees workshop resources through their `llm_meta` fields. A music track tagged `summary: "Military march, Soviet theme, orchestral, 2:30"` and `composition_hints: "Pairs well with Soviet faction voice lines"` lets the LLM intelligently select and compose assets for a coherent mission experience.

**Author consent (ai_usage):** Every Workshop resource carries an `ai_usage` permission that is SEPARATE from the SPDX license. A CC-BY music track can be ai_usage: Deny (author is fine with human redistribution but doesn't want LLMs auto-incorporating it). Conversely, an all-rights-reserved cutscene could be ai_usage: Allow (author wants the resource to be discoverable and composable by LLM agents even though the license is restrictive). The license governs human legal rights; `ai_usage` governs automated agent behavior. See the `AiUsagePermission` enum above for the three tiers.

**Default: `MetadataOnly`.** When an author publishes without explicitly setting `ai_usage`, the default is `MetadataOnly` — LLMs can find and recommend the resource, but a human must confirm adding it. This respects authors who haven't thought about AI usage while still making their content discoverable. Authors who want full LLM integration set `ai_usage: allow` explicitly. `ic mod publish` prompts for this choice on first publish and remembers it as a user-level default.

**License-aware generation:** The LLM also filters by license compatibility — if generating content for a CC-BY mod, it only pulls CC-BY-compatible resources (`CC0-1.0`, `CC-BY-4.0`), excluding `CC-BY-NC-4.0` or `CC-BY-SA-4.0` unless the mod's own license is compatible. Both ai_usage AND license must pass for a resource to be auto-added.

### Steam Workshop Integration (D030)

Steam Workshop is an **optional distribution source**, not a replacement for the IC Workshop. Resources published to Steam Workshop appear in the virtual repository alongside IC Workshop and local resources. Priority ordering determines which source wins when the same resource exists in multiple places.

```toml
# settings.toml — Steam Workshop as an additional source
[[workshop.sources]]
url = "https://workshop.ironcurtain.gg"      # official IC Workshop
priority = 1

[[workshop.sources]]
type = "steam_workshop"                      # Steam Workshop source
app_id = 0000000                             # IC's Steam app ID
priority = 2

[[workshop.sources]]
path = "C:/my-local-workshop"
priority = 3
```

**Key design constraints:**
- IC Workshop is always the primary source — Steam is additive, never required
- Resources can be published to both IC Workshop and Steam Workshop simultaneously via `ic mod publish --also-steam`
- Steam Workshop subscriptions sync to local cache automatically
- No Steam lock-in — the game is fully functional without Steam

### In-Game Workshop Browser (D030)

The in-game browser is how most players interact with the Workshop. It queries the merged view of all configured repository sources — whether that's a git-hosted index (Phase 0–3), a full Workshop server (Phase 5+), or both. UX inspired by CS:GO/Steam Workshop browser:

- **Search:** Full-text search across names, descriptions, tags, and `llm_meta` fields. Phase 0–3: local search over cached `index.yaml`. Phase 5+: FTS5-powered server-side search.
- **Filter:** By category (map, mod, music, sprites, etc.), game module (RA1, TD, RA2), author, license. Rating and download count filters available when Workshop server is live (Phase 5+).
- **Sort:** By newest, alphabetical, author. Phase 5+ adds: popularity, highest rated, most downloaded, trending.
- **Preview:** Screenshot, description, dependency list, license info, author name.
- **One-click install:** Downloads to local cache, resolves dependencies automatically. Works identically regardless of backend.
- **Collections:** Curated bundles ("Best Soviet mods", "Tournament map pool Season 5"). Phase 5+ feature.
- **Creator profiles:** Author page showing all published content, reputation score, tip links (D035). Phase 5+ feature.

### Modpacks as First-Class Workshop Resources (D030)

A **modpack** is a Workshop resource that bundles a curated set of mods with pinned versions, load order, and configuration — published as a single installable resource. This is the lesson from Minecraft's CurseForge and Modrinth: modpacks solve the three hardest problems in modding ecosystems — discovery ("what mods should I use?"), compatibility ("do these mods work together?"), and onboarding ("how do I install all of this?").

**Modpacks are published snapshots of mod profiles (D062).** Curators build and test mod profiles locally (`ic profile save`, `ic profile inspect`, `ic profile diff`), then publish the working result via `ic mod publish-profile`. Workshop modpacks import as local profiles via `ic profile import`. This makes the curator workflow reproducible — no manual reconstruction of the mod configuration each session.

```toml
# mod.toml for a modpack
[mod]
id = "alice/red-apocalypse-pack"
title = "Red Apocalypse Complete Experience"
version = "2.1.0"
authors = ["alice"]
description = "A curated collection of 12 mods for an enhanced RA1 experience"
license = "CC0-1.0"
category = "Modpack"    # distinct category from Mod

[engine]
version = "^0.5.0"
game_module = "ra1"

# Modpack-specific: list of mods with pinned versions and load order
[[modpack.mods]]
id = "bob/hd-sprites"
version = "=2.1.0"    # exact pin — tested with this version

[[modpack.mods]]
id = "carol/economy-overhaul"
version = "=1.4.2"

[[modpack.mods]]
id = "dave/ai-improvements"
version = "=3.0.1"

[[modpack.mods]]
id = "alice/tank-rebalance"
version = "=1.1.0"

# Explicit conflict resolutions (if any)
[[modpack.conflicts]]
unit = "heavy_tank"
field = "health.max"
use_mod = "alice/tank-rebalance"

# Configuration overrides applied after all mods load
[modpack.config]
balance_preset = "classic"
qol_preset = "iron_curtain"
```

**Why modpacks matter:**
- **For players:** One-click install of a tested, working mod combination. No manual dependency chasing, no version mismatch debugging.
- **For modpack curators:** A creative role that doesn't require writing any mod code. Curators test combinations, resolve conflicts, and publish a known-good experience.
- **For mod authors:** Inclusion in popular modpacks drives discovery and downloads. Modpacks reference mods by Workshop ID — the original mod author keeps full credit and control.

**Modpack lifecycle:**
- `ic mod init modpack` — scaffolds a modpack manifest
- `ic mod check` — validates all mods in the pack are compatible (version resolution, conflict detection)
- `ic mod test --headless` — loads all mods in sequence, runs smoke tests
- `ic mod publish` — publishes the modpack to Workshop. Installing the modpack auto-installs all referenced mods.

**Phase:** Modpack support in Phase 6a (alongside full Workshop registry).

### Auto-Download on Lobby Join (D030)

When a player joins a multiplayer lobby, the client checks `GameListing.required_mods` (see `03-NETCODE.md` § `GameListing`) against the local cache. Missing resources trigger automatic download:

1. **Diff:** Compare `required_mods` against local cache
2. **Prompt:** Show missing resources with total download size and estimated time
3. **Download:** Fetch via P2P (BitTorrent/WebTorrent — D049) from lobby peers and the wider swarm, with HTTP fallback from Workshop server. Lobby peers are prioritized as download sources since they already have the required content.
4. **Verify:** SHA-256 checksum validation for every downloaded resource
5. **Install:** Place in local cache, update dependency graph
6. **Ready:** Player joins game with all required content

Players can cancel at any time. Auto-download respects bandwidth limits configured in settings. Resources downloaded this way are tagged as **transient** — they remain in the local cache and are fully functional, but are subject to auto-cleanup after a configurable period of non-use (default: 30 days). After the session, a non-intrusive toast offers the player the choice to pin (keep forever), let auto-clean run its course, or remove immediately. Frequently-used transient resources (3+ sessions) are automatically promoted to pinned. See `../decisions/09e/D030-workshop-registry.md` "Local Resource Management" for the full lifecycle, storage budget, and cleanup UX.

### Creator Reputation System (D030)

Creators earn reputation through community signals:

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

Reputation is displayed but not gatekeeping — any registered user can publish. Badges appear on resource listings, in-game browser, and author profiles. See `../decisions/09e/D030-workshop-registry.md` for full design.

### Content Moderation & DMCA/Takedown Policy (D030)

The Workshop must be a safe, legal distribution platform. Content moderation is a combination of automated scanning, community reporting, and moderator review.

**Prohibited content:** Malware, hate speech, illegal content, impersonation of other creators.

**DMCA/IP takedown process (due process, not shoot-first):**

1. **Reporter files takedown request** via Workshop UI or email, specifying the resource and the claim (DMCA, license violation, policy violation)
2. **Resource is flagged** — not immediately removed — and the author is notified with a 72-hour response window
3. **Author can counter-claim** (e.g., they hold the rights, the reporter is mistaken)
4. **Workshop moderators review** — if the claim is valid, the resource is delisted (not deleted — remains in local caches of existing users)
5. **Repeat offenders** accumulate strikes. Three strikes → account publishing privileges suspended. Appeals process available.
6. **DMCA safe harbor:** The Workshop server operator (official or community-hosted) follows standard DMCA safe harbor procedures

**Lessons applied:** ArmA's heavy-handed approach (IP bans for mod redistribution) chilled creativity. Skyrim's paid mods debacle showed mandatory paywalls destroy goodwill. Our policy: due process, transparency, no mandatory monetization.

### Creator Recognition — Voluntary Tipping (D035)

Creators can optionally include tip/sponsorship links in their resource metadata. Iron Curtain **never processes payments** — we simply display links.

```yaml
# In resource manifest
creator:
  name: "alice"
  tip_links:
    - platform: ko-fi
      url: "https://ko-fi.com/alice"
    - platform: github-sponsors
      url: "https://github.com/sponsors/alice"
```

Tip links appear on resource pages, author profiles, and in the in-game browser. No mandatory paywalls — all Workshop content is free to download. This is a deliberate design choice informed by the Skyrim paid mods controversy and ArmA's gray-zone monetization issues.

### Achievement System Integration (D036)

Mod-defined achievements are publishable as Workshop resources. A mod can ship an achievement pack that defines achievements triggered by Lua scripts:

```yaml
# achievements/my-mod-achievements.yaml
achievements:
  - id: "my_mod.nuclear_winter"
    title: "Nuclear Winter"
    description: "Win a match using only nuclear weapons"
    icon: "icons/nuclear_winter.png"
    game_module: ra1
    category: competitive
    trigger: lua
    script: "triggers/nuclear_winter.lua"
```

Achievement packs are versioned, dependency-tracked, and license-required like all Workshop resources. Engine-defined achievements (campaign completion, competitive milestones) ship with the game and cannot be overridden by mods.

See `../decisions/09e/D036-achievements.md` for the full achievement system design including SQL schema and category taxonomy.

### Workshop API

The Workshop server stores all resource metadata, versions, dependencies, ratings, and search indices in an embedded SQLite database (D034). No external database required — the server is a single Rust binary that creates its `.db` file on first run. FTS5 provides full-text search over resource names, descriptions, and `llm_meta` tags. WAL mode handles concurrent reads from browse/search endpoints.

```rust
pub trait WorkshopClient: Send + Sync {
    fn browse(&self, filter: &ResourceFilter) -> Result<Vec<ResourceListing>>;
    fn download(&self, id: &ResourceId, version: &VersionReq) -> Result<ResourcePackage>;
    fn publish(&self, package: &ResourcePackage) -> Result<ResourceId>;
    fn rate(&self, id: &ResourceId, rating: Rating) -> Result<()>;
    fn search(&self, query: &str, category: ResourceCategory) -> Result<Vec<ResourceListing>>;
    fn resolve(&self, deps: &[Dependency]) -> Result<DependencyGraph>;   // D030: dep resolution
    fn audit_licenses(&self, graph: &DependencyGraph) -> Result<LicenseReport>; // D030: license check
    fn promote(&self, id: &ResourceId, to_channel: Channel) -> Result<()>; // D030: channel promotion
    fn replicate(&self, filter: &ResourceFilter, target: &str) -> Result<ReplicationReport>; // D030: pull replication
    fn create_token(&self, name: &str, scopes: &[TokenScope], expires: Duration) -> Result<ApiToken>; // CI/CD auth
    fn revoke_token(&self, token_id: &str) -> Result<()>; // CI/CD: revoke compromised tokens
    fn report_content(&self, id: &ResourceId, reason: ContentReport) -> Result<()>; // D030: content moderation
    fn get_creator_profile(&self, publisher: &str) -> Result<CreatorProfile>; // D030: creator reputation
}

/// Globally unique resource identifier: "publisher/name@version"
pub struct ResourceId {
    pub publisher: String,
    pub name: String,
    pub version: Version,             // semver
}

pub struct Dependency {
    pub id: String,                   // "publisher/name"
    pub version: VersionReq,          // semver range
    pub source: DependencySource,     // Workshop, Local, Url
    pub optional: bool,
}

pub struct ResourcePackage {
    pub id: ResourceId,               // globally unique identifier
    pub meta: ResourceMeta,           // title, author, description, tags
    pub license: String,              // SPDX identifier (REQUIRED)
    pub eula: Option<Eula>,           // optional additional terms (URL + summary)
    pub ai_usage: AiUsagePermission,  // author's consent for LLM/AI access (REQUIRED)
    pub llm_meta: Option<LlmResourceMeta>, // LLM-readable description
    pub category: ResourceCategory,   // Music, Sprites, Map, Mod, etc.
    pub files: Vec<PackageFile>,      // the actual content
    pub checksum: Sha256Hash,         // package integrity (computed on publish)
    pub channel: Channel,             // dev | beta | release
    pub dependencies: Vec<Dependency>,// other workshop items this requires
    pub compatibility: VersionInfo,   // engine version + game module this targets
}

/// Optional End User License Agreement for additional terms beyond the SPDX license.
pub struct Eula {
    pub url: String,                  // link to full EULA text (REQUIRED if eula present)
    pub summary: Option<String>,      // one-line human-readable summary
}

/// Author's explicit consent for how LLM/AI agents may interact with this resource.
/// This is SEPARATE from the SPDX license — a resource can be CC-BY (humans may
/// redistribute) but ai_usage: Deny (author doesn't want automated AI incorporation).
/// The license governs human use; ai_usage governs automated agent use.
pub enum AiUsagePermission {
    /// LLMs can discover, evaluate, pull, and incorporate this resource into
    /// generated content (missions, mods, campaigns) without per-use approval.
    /// The resource appears in LLM search results and can be auto-added as a
    /// dependency by ic-llm's discovery pipeline (D030).
    Allow,

    /// LLMs can read this resource's metadata (llm_meta, tags, description) for
    /// discovery and recommendation, but cannot auto-pull it as a dependency.
    /// A human must explicitly confirm adding this resource. This is the DEFAULT —
    /// it lets LLMs recommend the resource to modders while keeping the author's
    /// content behind a human decision gate.
    MetadataOnly,

    /// Resource is excluded from LLM agent queries entirely. Human users can still
    /// browse, search, and install it normally. The resource is invisible to ic-llm's
    /// automated discovery pipeline. Use this for resources where the author does not
    /// want any AI-mediated discovery or incorporation.
    Deny,
}

/// LLM-readable metadata for workshop resources.
/// Enables intelligent browsing, selection, and composition by ic-llm.
pub struct LlmResourceMeta {
    pub summary: String,              // one-line: "A 4-player desert skirmish map with limited ore"
    pub purpose: String,              // when/why to use this: "Best for competitive 2v2 with scarce resources"
    pub gameplay_tags: Vec<String>,   // semantic: ["desert", "2v2", "competitive", "scarce_resources"]
    pub difficulty: Option<String>,   // for missions/campaigns: "hard", "beginner-friendly"
    pub composition_hints: Option<String>, // how this combines with other resources
    pub content_description: Option<ContentDescription>, // rich structured description for complex resources
    pub related_resources: Vec<String>, // resource IDs that compose well with this one
}

/// Rich structured description for complex multi-file resources (cutscene packs,
/// campaign bundles, sound libraries). Gives LLMs enough context to evaluate
/// relevance without downloading and parsing the full resource.
pub struct ContentDescription {
    pub contents: Vec<String>,        // what's inside: ["5 briefing videos", "3 radar comm clips"]
    pub themes: Vec<String>,          // mood/tone: ["military", "suspense", "soviet_propaganda"]
    pub style: Option<String>,        // visual/audio style: "Retro FMV with live actors"
    pub duration: Option<String>,     // for temporal media: "12 minutes total"
    pub resolution: Option<String>,   // for visual media: "320x200 palette-indexed"
    pub technical_notes: Option<String>, // format-specific info an LLM needs to know
}

pub struct DependencyGraph {
    pub resolved: Vec<ResolvedDependency>, // all deps with exact versions
    pub conflicts: Vec<DependencyConflict>, // incompatible version requirements
}

pub struct LicenseReport {
    pub compatible: bool,
    pub issues: Vec<LicenseIssue>,    // e.g., "CC-BY-NC dep in CC-BY mod"
}
```
