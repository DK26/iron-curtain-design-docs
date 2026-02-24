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
