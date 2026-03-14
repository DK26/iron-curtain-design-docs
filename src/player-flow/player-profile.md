## Player Profile

```
Main Menu → Profile
  — or —
Lobby → click player name → Full Profile
  — or —
Post-Game → click player → Full Profile
```

```
┌──────────────────────────────────────────────────────────────┐
│  PLAYER PROFILE                                  [← Back]    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  [Avatar]  CommanderDK                                 │ │
│  │            Captain II (1623)  🎖🎖🎖                    │ │
│  │            "Fear the Tesla."                           │ │
│  │  [Edit Profile]                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [Stats] [Achievements] [Match History] [Friends] [Social]   │
│  ─────────────────────────────────────────────────────────── │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  (active tab content)                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Pinned Achievements: [🏆 First Blood] [🏆 500 Wins]        │
│  Communities: [IC Official ✓] [CnCNet ✓]                     │
└──────────────────────────────────────────────────────────────┘
```

### Profile Tabs

| Tab               | Contents                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stats**         | Per-game-module Glicko-2 ratings, rank tier badge, rating graph (last 50 matches), faction distribution pie chart, win streak, career totals, and a **Campaign Progress** card (local-first). Optional community campaign benchmarks are opt-in, spoiler-safe, and normalized by campaign version/difficulty/preset. Click rating → Rating Details Panel (D055). |
| **Achievements**  | All achievements by category (Campaign/Skirmish/Multiplayer/Community). Pin up to 6 to profile. Rarity percentages. Per-game-module.                                                      |
| **Match History** | Scrollable list: date, map, players, result, rating delta, [Replay] button. Filter by mode/date/result.                                                                                   |
| **Friends**       | Platform friends (Steam/GOG) + IC community friends. Presence states (Online/InGame/InLobby/Away/Invisible/Offline). [Join]/[Spectate]/[Invite] buttons. Block list. Private notes.       |
| **Social**        | Community memberships with verified/unverified badges. Workshop creator profile (published count, downloads, helpful reviews acknowledged). Community feedback contribution recognition (helpful-review badges / creator acknowledgements, non-competitive). Country flag. Social links. |

#### Community Contribution Rewards (Profile → Social, Optional D053/D049)

The profile may show a dedicated panel for community-feedback contribution recognition. This is a **social/profile system**, not a gameplay progression system.

```
┌──────────────────────────────────────────────────────┐
│ 🏅 Community Contribution Rewards                    │
│                                                      │
│  Helpful reviews: 14   Creator acknowledgements: 6   │
│  Contribution reputation: 412  (Trusted)             │
│  Badges: [Field Analyst II] [Creator Favorite]       │
│                                                      │
│  Contribution points: 120  (profile/cosmetic only)   │
│  Next reward: "Recon Frame" (150)                    │
│                                                      │
│  [Rewards Catalog →] [History →] [Privacy / Sharing] │
└──────────────────────────────────────────────────────┘
```

**UI rules:**
- always labeled as **profile/cosmetic-only** (no gameplay, ranked, or matchmaking effects)
- helpful/actionable contribution messaging (not "positive review" messaging)
- source/trust labels apply to synced reputation/points/badges
- rewards catalog (if enabled) only contains profile cosmetics/titles/showcase items
- communities may disable points while keeping badges/reputation enabled

### Rating Details Panel

```
Profile → Stats → click rating value
```

Deep-dive into Glicko-2 competitive data (D055):

- Current rating box: μ (mean), RD (rating deviation), σ (volatility), confidence interval, trend arrow
- Plain-language explainer: "Your rating is 1623, meaning you're roughly better than 72% of ranked players in this queue."
- Rating history graph: Bevy 2D line chart, confidence band shading, per-faction color overlay
- Recent matches: rating impact bars (+/- per match)
- Faction breakdown: win rate per faction with separate faction ratings
- Rating distribution histogram: "You are here" marker
- [Export CSV] button, [Leaderboard →] link

### Feature Smart Tips (D065 Layer 2)

First-visit and contextual tips appear on Player Profile screens via the `feature_discovery` hint category. Tips cover: what the profile shows (first visit), how to pin achievements for display, what the skill rating means, and how campaign progress benchmarks work. See D065 § Feature Smart Tips (`hints/feature-tips.yaml`) for the full hint catalog and trigger definitions.
