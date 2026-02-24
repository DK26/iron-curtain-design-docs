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

**Campaign Progress & PvE Progress Card (local-first, optional community comparison):**

Campaign progress is valuable social and motivational context (especially for D021 branching campaigns), but it is **not** the same kind of data as ranked SCR-backed statistics. D053 therefore treats campaign progress as a separate profile card with explicit source/trust labeling.

```
┌──────────────────────────────────────────────────────┐
│ 🗺️ Campaign Progress — Allied Campaign (RA1)         │
│                                                      │
│  Progress:        5 / 14 missions (36%)             │
│  Current Path:    Depth 6                           │
│  Best Path:       Depth 9                           │
│  Endings:         1 / 3 unlocked                    │
│  Last Played:     2 days ago                        │
│                                                      │
│  Community Benchmarks (Normal / IC Default):        │
│  • Ahead of 62% of players        [Community ✓]     │
│  • Avg completion: 41%            [Community]       │
│  • Most common branch after M3: Hidden until seen   │
│                                                      │
│  [View Campaign Details →]  [Privacy / Sharing...]  │
└──────────────────────────────────────────────────────┘
```

**Rules (normative):**
- **Local-first by default.** Your own campaign progress card works offline from local save/history data (D021 + D034/D031).
- **Branching-safe metrics.** Show `unique missions completed`, `current path depth`, and `best path depth` separately; do not collapse them into a single ambiguous "farthest mission" number.
- **Spoiler-safe defaults.** Locked mission names, hidden endings, and unreached branch labels are redacted unless the player has discovered them (or the campaign author explicitly allows full reveal).
- **Opt-in social sharing.** Community comparison metrics require player opt-in and are scoped per campaign version + difficulty + balance preset.
- **Trust/source labeling.** Campaign benchmark lines must show whether they are local-only, unsigned community aggregates, or community-verified signed snapshots (if the community provides signed aggregate exports).
- **No competitive implications.** Campaign progress comparison data must not affect ranked eligibility, matchmaking, or anti-cheat scoring.

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

**Creator feedback inbox / review triage integration (optional):**
- Authors may access a feedback inbox for their own Workshop resources (D049) from the creator profile or Workshop publishing surfaces.
- Helpful-review marks granted by the author are displayed as creator activity (e.g., "Helpful reviews acknowledged"), but the profile UI must distinguish this from moderation powers.
- Communities may expose trust labels for creator-side helpful marks (e.g., local-only vs. community-synced metadata).

**Community Feedback Contribution Recognition (profile-only, non-competitive):**

Players who leave reviews that creators mark as helpful can receive **profile/social recognition** (not gameplay rewards). This is presented as a separate contributor signal:

```
┌──────────────────────────────────────────────────────┐
│ 📝 Community Feedback Contributions                  │
│                                                      │
│  Helpful reviews marked by creators: 14             │
│  Creator acknowledgements: 6                        │
│  Badge: Field Analyst II                            │
│                                                      │
│  [View Feedback History →]  [Privacy / Sharing...]  │
└──────────────────────────────────────────────────────┘
```

**Rules (normative):**
- Profile-only recognition (badges/titles/acknowledgements) — no gameplay or ranked impact
- Source/trust labeling applies (local profile state vs. community-synced recognition metadata)
- Visibility is privacy-controlled like other profile sections (default managed by D053 privacy settings)
- Helpful-review recognition is optional and may be disabled per community policy (D037)

**Contribution reputation + points (optional extension, Phase 7+ hardening):**
- Communities may expose a **feedback contribution reputation** signal (quality-focused, not positivity/volume-only)
- Communities may optionally enable **Community Contribution Points** redeemable for **profile/cosmetic-only** items
- Point balances and redemption history must be clearly labeled as **non-gameplay / non-ranked**
- Rare/manual badges (e.g., `Exceptional Contributor`) should be policy-governed and auditable, not arbitrary hidden grants
- All grants and redemptions remain subject to revocation if abuse/collusion is confirmed (D037/D052)

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
| Community Feedback Contributions | Public                           |
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

