## D055: Ranked Tiers, Seasons & Matchmaking Queue

**Status:** Settled
**Phase:** Phase 5 (Multiplayer & Competitive)
**Depends on:** D041 (RankingProvider), D052 (Community Servers), D053 (Player Profile), D037 (Competitive Governance), D034 (SQLite Storage), D019 (Balance Presets)

### Decision Capsule (LLM/RAG Summary)

- **Status:** Settled
- **Phase:** Phase 5 (Multiplayer & Competitive)
- **Canonical for:** Ranked player experience design (tiers, seasons, placement flow, queue behavior) built on the D052/D053 competitive infrastructure
- **Scope:** ranked ladders/tiers/seasons, matchmaking queue behavior, player-facing competitive UX, ranked-specific policies and displays
- **Decision:** IC defines a full ranked experience with **named tiers**, **season structure**, **placement flow**, **small-population matchmaking degradation**, and **faction-aware rating presentation**, layered on top of D041/D052/D053 foundations.
- **Why:** Raw ratings alone are poor motivation/UX, RTS populations are small and need graceful queue behavior, and competitive retention depends on seasonal structure and clear milestones.
- **Non-goals:** A raw-number-only ladder UX; assuming FPS/MOBA-scale populations; one-size-fits-all ranked rules across all communities/balance presets.
- **Invariants preserved:** Rating authority remains community-server based (D052); rating algorithms remain trait-backed (`RankingProvider`, D041); ranked flow reuses generic netcode/match lifecycle mechanisms where possible.
- **Defaults / UX behavior:** Tier names/badges are YAML-driven per game module; seasons are explicit; ranked queue constraints and degradation behavior are product-defined rather than ad hoc.
- **Security / Trust impact:** Ranked relies on the existing relay + signed credential trust chain and integrates with governance/moderation decisions rather than bypassing them.
- **Performance / Ops impact:** Queue degradation rules and small-population design reduce matchmaking failures and waiting dead-ends in niche RTS communities.
- **Public interfaces / types / commands:** tier configuration YAML, `RankingProvider` display integration, ranked queue/lobby settings and vote constraints (see body)
- **Affected docs:** `src/03-NETCODE.md`, `src/decisions/09e-community.md` (D052/D053/D037), `src/17-PLAYER-FLOW.md`, `src/decisions/09g-interaction.md`
- **Revision note summary:** None
- **Keywords:** ranked tiers, seasons, matchmaking queue, placement matches, faction rating, small population matchmaking, competitive ladder

### Problem

The existing competitive infrastructure (D041's `RankingProvider`, D052's signed credentials, D053's profile) provides the *foundational layer* — a pluggable rating algorithm, cryptographic verification, and display system. But it doesn't define the *player-facing competitive experience*:

1. **No rank tiers.** `display_rating()` outputs "1500 ± 200" — useful for analytically-minded players but lacking the motivational milestones that named ranks provide. CS2's transition from hidden MMR to visible CS Rating (with color bands) was universally praised but showed that even visible numbers benefit from tier mapping for casual engagement. SC2's league system proved this for RTS specifically.
2. **No season structure.** Without seasons, leaderboards stagnate — top players stop playing and retain positions indefinitely, exactly the problem C&C Remastered experienced (see `research/ranked-matchmaking-analysis.md` § 3.3).
3. **No placement flow.** D041 defines new-player seeding formula but doesn't specify the user-facing placement match experience.
4. **No small-population matchmaking degradation.** RTS communities are 10–100× smaller than FPS/MOBA populations. The matchmaking queue must handle 100-player populations gracefully, not just 100,000-player populations.
5. **No faction-specific rating.** IC has asymmetric factions. A player who is strong with Allies may be weak with Soviets — one rating doesn't capture this.
6. **No map selection for ranked.** Competitive map pool curation is mentioned in Phase 5 and D037 but the in-queue selection mechanism (veto/ban) isn't defined.

### Solution

#### Tier Configuration (YAML-Driven, Per Game Module)

Rank tier names, thresholds, and visual assets are defined in the game module's YAML configuration — not in engine code. The engine provides the tier resolution logic; the game module provides the theme.

```yaml
# ra/rules/ranked-tiers.yaml
# Red Alert game module — Cold War military rank theme
ranked_tiers:
  format_version: "1.0.0"
  divisions_per_tier: 3          # III → II → I within each tier
  division_labels: ["III", "II", "I"]  # lowest to highest

  tiers:
    - name: Cadet
      min_rating: 0
      icon: "icons/ranks/cadet.png"
      color: "#8B7355"            # Brown — officer trainee

    - name: Lieutenant
      min_rating: 1000
      icon: "icons/ranks/lieutenant.png"
      color: "#A0A0A0"            # Silver-grey — junior officer

    - name: Captain
      min_rating: 1250
      icon: "icons/ranks/captain.png"
      color: "#FFD700"            # Gold — company commander

    - name: Major
      min_rating: 1425
      icon: "icons/ranks/major.png"
      color: "#4169E1"            # Royal blue — battalion level

    - name: Lt. Colonel
      min_rating: 1575
      icon: "icons/ranks/lt_colonel.png"
      color: "#9370DB"            # Purple — senior field officer

    - name: Colonel
      min_rating: 1750
      icon: "icons/ranks/colonel.png"
      color: "#DC143C"            # Crimson — regimental command

    - name: Brigadier
      min_rating: 1975
      icon: "icons/ranks/brigadier.png"
      color: "#FF4500"            # Red-orange — brigade command

  elite_tiers:
    - name: General
      min_rating: 2250
      icon: "icons/ranks/general.png"
      color: "#FFD700"            # Gold — general staff
      show_rating: true           # Display actual rating number alongside tier

    - name: Supreme Commander
      type: top_n                 # Fixed top-N, not rating threshold
      count: 200                  # Top 200 players per community server
      icon: "icons/ranks/supreme-commander.png"
      color: "#FFFFFF"            # White/platinum — pinnacle
      show_rating: true
      show_leaderboard_position: true
```

**Why military ranks for Red Alert:**
- Players command armies — military rank progression IS the core fantasy
- All ranks are officer-grade (Cadet through General) because the player is always commanding, never a foot soldier
- Proper military hierarchy — every rank is real and in correct sequential order: Cadet → Lieutenant → Captain → Major → Lt. Colonel → Colonel → Brigadier → General
- "Supreme Commander" crowns the hierarchy — a title earned, not a rank given. It carries the weight of Cold War authority (STAVKA, NATO Supreme Allied Commander) and the unmistakable identity of the RTS genre itself

**Why 7 + 2 = 9 tiers (23 ranked positions):**
- SC2 proved 7+2 works for RTS community sizes (~100K peak, ~10K sustained)
- Fewer than LoL's 10 tiers (designed for 100M+ players — IC won't have that)
- More than AoE4's 6 tiers (too few for meaningful progression)
- 3 divisions per tier (matching SC2/AoE4/Valorant convention) provides intra-tier goals
- Lt. Colonel fills the gap between Major and Colonel — the most natural compound rank, universally understood
- Elite tiers (General, Supreme Commander) create aspirational targets even with small populations

**Game-module replaceability:** Tiberian Dawn could use GDI/Nod themed rank names. A fantasy RTS mod can define completely different tier sets. Community mods define their own via YAML. The engine resolves `PlayerRating.rating → tier name + division` using whatever tier configuration the active game module provides.

#### Dual Display: Tier + Rating

Every ranked player sees BOTH:
- **Tier badge:** "Captain II" with icon and color — milestone-driven motivation
- **Rating number:** "1847 ± 45" — transparency, eliminates "why didn't I rank up?" frustration

This follows the industry trend toward transparency: CS2's shift from hidden MMR to visible CS Rating was universally praised, SC2 made MMR visible in 2020 to positive reception, and Dota 2 shows raw MMR at Immortal tier. IC does this from day one — no hidden intermediary layers (unlike LoL's LP system, which creates MMR/LP disconnects that frustrate players).

```rust
/// Tier resolution — lives in ic-ui, reads from game module YAML config.
/// NOT in ic-sim (tiers are display-only, not gameplay).
pub struct RankedTierDisplay {
    pub tier_name: String,         // e.g., "Captain"
    pub division: u8,              // e.g., 2 (for "Captain II")
    pub division_label: String,    // e.g., "II"
    pub icon_path: String,
    pub color: [u8; 3],            // RGB
    pub rating: i64,               // actual rating number (always shown)
    pub deviation: i64,            // uncertainty (shown as ±)
    pub is_elite: bool,            // General/Supreme Commander
    pub leaderboard_position: Option<u32>,  // only for elite tiers
    pub peak_tier: Option<String>, // highest tier this season (e.g., "Colonel I")
}
```

#### Rating Details Panel (Expanded Stats)

The compact display ("Captain II — 1847 ± 45") covers most players' needs. But analytically-minded players — and anyone who watched a "What is Glicko-2?" explainer — want to inspect their full rating parameters. The **Rating Details** panel expands from the Statistics Card's `[Rating Graph →]` link and provides complete transparency into every number the system tracks.

```
┌──────────────────────────────────────────────────────────────────┐
│ 📈 Rating Details — Official IC Community (RA1)                  │
│                                                                  │
│  ┌─ Current Rating ────────────────────────────────────────┐     │
│  │  ★ Colonel I                                           │     │
│  │  Rating (μ):     1971          Peak: 2023 (S3 Week 5)  │     │
│  │  Deviation (RD):   45          Range: 1881 – 2061       │     │
│  │  Volatility (σ): 0.041         Trend: Stable ──         │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌─ What These Numbers Mean ───────────────────────────────┐     │
│  │  Rating: Your estimated skill. Higher = stronger.       │     │
│  │  Deviation: How certain the system is. Lower = more     │     │
│  │    confident. Increases if you don't play for a while.  │     │
│  │  Volatility: How consistent your results are. Low means │     │
│  │    you perform predictably. High means recent upsets.   │     │
│  │  Range: 95% confidence interval — your true skill is    │     │
│  │    almost certainly between 1881 and 2061.              │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌─ Rating History (last 50 matches) ──────────────────────┐     │
│  │  2050 ┤                                                 │     │
│  │       │        ╭──╮                    ╭──╮             │     │
│  │  2000 ┤   ╭──╮╯    ╰╮  ╭╮       ╭──╮╯    ╰──●         │     │
│  │       │╭─╯           ╰──╯╰──╮╭─╯                       │     │
│  │  1950 ┤                      ╰╯                         │     │
│  │       │                                                 │     │
│  │  1900 ┤─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │     │
│  │       └──────────────────────────────────────── Match #  │     │
│  │  [Confidence band] [Per-faction] [Deviation overlay]    │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌─ Recent Matches (rating impact) ────────────────────────┐     │
│  │  #342  W  vs alice (1834)    Allies   +14  RD -1  │▓▓▓ │     │
│  │  #341  W  vs bob (2103)      Soviet   +31  RD -2  │▓▓▓▓│     │
│  │  #340  L  vs carol (1956)    Soviet   -18  RD -1  │▓▓  │     │
│  │  #339  W  vs dave (1712)     Allies    +8  RD -1  │▓   │     │
│  │  #338  L  vs eve (2201)      Soviet    -6  RD -2  │▓   │     │
│  │                                                         │     │
│  │  Rating impact depends on opponent strength:            │     │
│  │    Beat alice (lower rated):  small gain (+14)          │     │
│  │    Beat bob (higher rated):   large gain (+31)          │     │
│  │    Lose to carol (similar):   moderate loss (-18)       │     │
│  │    Lose to eve (much higher): small loss (-6)           │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌─ Faction Breakdown ─────────────────────────────────────┐     │
│  │  ☭ Soviet:   1983 ± 52   (168 matches, 59% win rate)   │     │
│  │  ★ Allied:   1944 ± 61   (154 matches, 56% win rate)   │     │
│  │  ? Random:   ─            (20 matches, 55% win rate)    │     │
│  │                                                         │     │
│  │  (Faction ratings shown only if faction tracking is on) │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌─ Rating Distribution (your position) ───────────────────┐     │
│  │  Players                                                │     │
│  │  ▓▓▓                                                    │     │
│  │  ▓▓▓▓▓▓                                                 │     │
│  │  ▓▓▓▓▓▓▓▓▓▓▓                                            │     │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                                     │     │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                             │     │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓△▓▓▓▓▓                 │     │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓          │     │
│  │  └──────────────────────────────────────────── Rating    │     │
│  │  800   1000  1200  1400  1600  1800  △YOU  2200  2400   │     │
│  │                                                         │     │
│  │  You are in the top 5% of rated players.                │     │
│  │  122 players are rated higher than you.                 │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  [Export Rating History (CSV)]  [View Leaderboard]               │
└──────────────────────────────────────────────────────────────────┘
```

**Panel components:**

1. **Current Rating box:** All three Glicko-2 parameters displayed with plain names. The "Range" line shows the 95% confidence interval ($\mu \pm 2 \times RD$). The "Trend" indicator compares current volatility to the player's 20-match average: ↑ Rising (recent upsets), ── Stable, ↓ Settling (consistent results).

2. **Plain-language explainer:** Collapsible on repeat visits (state stored in `preferences.db`). Uses no jargon — "how certain the system is" instead of "rating deviation." Players who watch Glicko-2 explainer videos will recognize the terms; players who don't will understand the meaning.

3. **Rating history graph:** Client-side chart (Bevy 2D line renderer) from match SCR data. Toggle overlays: confidence band (±2·RD as shaded region around the rating line), per-faction line split, deviation history. Hoverable data points show match details.

4. **Recent matches with rating impact:** Each match shows the rating delta, deviation change, and a bar indicating relative impact magnitude. Explanatory text contextualizes why gains/losses vary — teaching the player how Glicko-2 works through their own data.

5. **Faction breakdown:** Per-faction rating (if faction tracking is enabled, D055 § Faction-Specific Ratings). Shows each faction's independent rating, deviation, match count, and win rate. Random-faction matches contribute to all faction ratings equally.

6. **Rating distribution histogram:** Shows where the player falls in the community's population. The △ marker shows "you are here." Population percentile and count of higher-rated players give concrete context. Data sourced from the community server's leaderboard endpoint (cached locally, refreshed hourly).

7. **CSV export:** Exports full rating history (match date, opponent rating, result, rating change, deviation change, volatility) as a CSV file — consistent with the "player data is a platform" philosophy (D034). Community stat tools, spreadsheet analysts, and researchers can work with the raw data.

**Where this lives in the UI:**

- **In-game path:** Main Menu → Profile → Statistics Card → `[Rating Graph →]` → Rating Details Panel
- **Post-game:** The match result screen includes a compact rating change widget ("1957 → 1971, +14") that links to the full panel
- **Tooltip:** Hovering over anyone's rank badge in lobbies, match results, or friends list shows a compact version (rating ± deviation, tier, percentile)
- **Console command:** `/rating` or `/stats rating` opens the panel. `/rating <player>` shows another player's public rating details.

```rust
/// Data backing the Rating Details panel. Computed in ic-ui from local SQLite.
/// NOT in ic-sim (display-only).
pub struct RatingDetailsView {
    pub current: RankedTierDisplay,
    pub confidence_interval: (i64, i64),      // (lower, upper) = μ ± 2·RD
    pub volatility: i64,                       // fixed-point Glicko-2 σ
    pub volatility_trend: VolatilityTrend,
    pub history: Vec<RatingHistoryPoint>,      // last N matches
    pub faction_ratings: Option<Vec<FactionRating>>,
    pub population_percentile: Option<f32>,    // 0.0–100.0, from cached leaderboard
    pub players_above: Option<u32>,            // count of higher-rated players
    pub season_peak: PeakRecord,
    pub all_time_peak: PeakRecord,
}

pub struct RatingHistoryPoint {
    pub match_id: String,
    pub timestamp: u64,
    pub opponent_rating: i64,
    pub result: MatchResult,                   // Win, Loss, Draw
    pub rating_before: i64,
    pub rating_after: i64,
    pub deviation_before: i64,
    pub deviation_after: i64,
    pub faction_played: String,
    pub opponent_faction: String,
    pub match_duration_ticks: u64,
    pub information_content: i32,              // 0-1000, how much this match "counted"
}

pub struct FactionRating {
    pub faction_id: String,
    pub faction_name: String,
    pub rating: i64,
    pub deviation: i64,
    pub matches_played: u32,
    pub win_rate: i32,                         // 0-1000 fixed-point
}

pub struct PeakRecord {
    pub rating: i64,
    pub tier_name: String,
    pub division: u8,
    pub achieved_at: u64,                      // timestamp
    pub match_id: Option<String>,              // the match where peak was reached
}

pub enum VolatilityTrend {
    Rising,     // σ increased over last 20 matches — inconsistent results
    Stable,     // σ roughly unchanged
    Settling,   // σ decreased — consistent performance
}
```

#### Glicko-2 RTS Adaptations

Standard Glicko-2 was designed for chess: symmetric, no map variance, no faction asymmetry, large populations, frequent play. IC's competitive environment differs on every axis. The `Glicko2Provider` (D041) implements standard Glicko-2 with the following RTS-specific parameter tuning:

**Parameter configuration (YAML-driven, per community server):**

```yaml
# Server-side Glicko-2 configuration
glicko2:
  # Standard Glicko-2 parameters
  default_rating: 1500            # New player starting rating
  default_deviation: 350          # New player RD (high = fast convergence)
  system_constant_tau: 0.5        # Volatility constraint (standard range: 0.3–1.2)

  # IC RTS adaptations
  rd_floor: 45                    # Minimum RD — prevents rating "freezing"
  rd_ceiling: 350                 # Maximum RD (equals placement-level uncertainty)
  inactivity_c: 34.6              # RD growth constant for inactive players
  rating_period_days: 0           # 0 = per-match updates (no batch periods)

  # Match quality weighting
  match_duration_weight:
    min_ticks: 3600               # 2 minutes at 30 tps — below this, reduced weight
    full_weight_ticks: 18000      # 10 minutes — at or above this, full weight
    short_game_factor: 300        # 0-1000 fixed-point weight for games < min_ticks

  # Team game handling (2v2, 3v3)
  team_rating_method: "weighted_average"  # or "max_rating", "trueskill"
  team_individual_share: true     # distribute rating change by contribution weight
```

**Adaptation 1 — RD floor (min deviation = 45):**

Standard Glicko-2 allows RD to approach zero for highly active players, making their rating nearly immovable. This is problematic for competitive games where skill fluctuates with meta shifts, patch changes, and life circumstances. An RD floor of 45 ensures that even the most active player's rating responds meaningfully to results.

Why 45: Valve's CS Regional Standings uses RD = 75 for 5v5 team play. In 1v1 RTS, each match provides more information per player (no teammates to attribute results to), so a lower floor is appropriate. At RD = 45, the 95% confidence interval is ±90 rating points — enough precision to distinguish skill while remaining responsive.

The RD floor is enforced after each rating update: `rd = max(rd_floor, computed_rd)`. This is the simplest adaptation and has the largest impact on player experience.

**Adaptation 2 — Per-match rating periods:**

Standard Glicko-2 groups matches into "rating periods" (typically a fixed time window) and updates ratings once per period. This made sense for postal chess where you complete a few games per month. RTS players play 2–5 games per session and want immediate feedback.

IC updates ratings after every individual match — each match is its own rating period with $m = 1$. This is mathematically equivalent to running Glicko-2 Step 1–8 with a single game per period. The deviation update (Step 3) and rating update (Step 7) reflect one result, then the new rating becomes the input for the next match.

This means the post-game screen shows the exact rating change from that match, not a batched update. Players see "+14" or "-18" and understand immediately what happened.

**Adaptation 3 — Information content weighting by match duration:**

A 90-second game where one player disconnects during load provides almost no skill information. A 20-minute game with multiple engagements provides rich skill signal. Standard Glicko-2 treats all results equally.

IC scales the rating impact of each match by an `information_content` factor (already defined in D041's `MatchQuality`). Match duration is one input:

- Games shorter than `min_ticks` (2 minutes): weight = `short_game_factor` (default 0.3×)
- Games between `min_ticks` and `full_weight_ticks` (2–10 minutes): linearly interpolated
- Games at or above `full_weight_ticks` (10+ minutes): full weight (1.0×)

Implementation: the `g(RD)` function in Glicko-2 Step 3 is not modified. Instead, the expected outcome $E$ is scaled by the information content factor before computing the rating update. This preserves the mathematical properties of Glicko-2 while reducing the impact of low-quality matches.

Other `information_content` inputs (from D041): game mode weight (ranked = 1.0, casual = 0.5), player count balance (1v1 = 1.0, 1v2 = 0.3), and opponent rematching penalty (V26: `weight = base × 0.5^(n-1)` for repeated opponents).

**Adaptation 4 — Inactivity RD growth targeting seasonal cadence:**

Standard Glicko-2 increases RD over time when a player is inactive: $RD_{new} = \sqrt{RD^2 + c^2 \cdot t}$ where $c$ is calibrated and $t$ is the number of rating periods elapsed. IC tunes $c$ so that a player who is inactive for one full season (91 days) reaches RD ≈ 250 — high enough that their first few matches back converge quickly, but not reset to placement level (350).

With `c = 34.6` and daily periods: after 91 days, $RD = \sqrt{45^2 + 34.6^2 \times 91} \approx 250$. This means returning players re-stabilize in ~5–10 matches rather than the 25+ that a full reset would require.

**Adaptation 5 — Team game rating distribution:**

Glicko-2 is designed for 1v1. For team games (2v2, 3v3), IC uses a weighted-average team rating for matchmaking quality assessment, then distributes rating changes individually based on the result:

- Team rating for matchmaking: weighted average of member ratings (weights = 1/RD, so more-certain players count more)
- Post-match: each player's rating updates as if they played a 1v1 against the opposing team's weighted average
- Deviation updates independently per player

This is a pragmatic adaptation, not a theoretically optimal one. For communities that want better team rating, D041's `RankingProvider` trait allows substituting TrueSkill (designed specifically for team games) or any custom algorithm.

**What IC does NOT modify:**

- **Glicko-2 Steps 1–8 core algorithm:** The mathematical update procedure is standard. No custom "performance bonus" adjustments for APM, eco score, or unit efficiency. Win/loss/draw is the only result input. This prevents metric-gaming (players optimizing for stats instead of winning) and keeps the system simple and auditable.
- **Volatility calculation:** The iterative Illinois algorithm for computing new σ is unmodified. The `system_constant_tau` parameter controls sensitivity — community servers can tune this, but the formula is standard.
- **Rating scale:** Standard Glicko-2 rating range (~800–2400, centered at 1500). No artificial scaling or normalization.

#### Why Ranks, Not Leagues

IC uses **military ranks** (Cadet → Supreme Commander), not **leagues** (Bronze → Grandmaster). This is a deliberate thematic and structural choice.

**Thematic alignment:** Players command armies. Military rank progression *is* the fantasy — you're not "placed in Gold league," you *earned the rank of Colonel*. The Cold War military theme matches IC's identity (the engine is named "Iron Curtain"). Every rank implies command authority: even Cadet (officer trainee) is on the path to leading troops, not a foot soldier following orders. The hierarchy follows actual military rank order through General — then transcends it: "Supreme Commander" isn't a rank you're promoted to, it's a title you *earn* by being one of the top 200. Real military parallels exist (STAVKA's Supreme Commander-in-Chief, NATO's Supreme Allied Commander), and the name carries instant genre recognition.

**Structural reasons:**

| Dimension                   | Ranks (IC approach)                                     | Leagues (SC2 approach)                                               |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| Assignment                  | Rating threshold → rank label                           | Placement → league group of ~100 players                             |
| Population requirement      | Works at any scale (50 or 50,000 players)               | Needs thousands to fill meaningful groups                            |
| Progression feel            | Continuous — every match moves you toward the next rank | Grouped — you're placed once per season, then grind within the group |
| Identity language           | "I'm a Colonel" (personal achievement)                  | "I'm in Diamond" (group membership)                                  |
| Demotion                    | Immediate if rating drops below threshold (honest)      | Often delayed or hidden to avoid frustration (dishonest)             |
| Cross-community portability | Rating → rank mapping is deterministic from YAML config | League placement requires server-side group management               |

**The naming decision:** The tier names themselves carry weight. "Cadet" is where everyone starts — you're an officer-in-training, unproven. "Major" means you've earned mid-level command authority. "Supreme Commander" is the pinnacle — a title that evokes both Cold War gravitas (the Supreme Commander-in-Chief of the Soviet Armed Forces was the head of STAVKA) and the RTS genre itself. These names are IC's brand, not generic color bands.

For other game modules, the rank names change to match the theme — Tiberian Dawn might use GDI/Nod military ranks, a fantasy mod might use feudal titles — but the *structure* (rating thresholds → named ranks × divisions) stays the same. The YAML configuration in `ranked-tiers.yaml` makes this trivially customizable.

**Why not both?** SC2's system was technically a hybrid: leagues (groups of players) with tier labels (Bronze, Silver, Gold). IC's approach is simpler: there are no player groups or league divisions. Your rank is a pure function of your rating — deterministic, portable, and verifiable from the YAML config alone. If you know the tier thresholds and your rating, you know your rank. No server-side group assignment needed. This is critical for D052's federated model, where community servers may have different populations but should be able to resolve the same rating to the same rank label.

#### Season Structure

```yaml
# Server configuration (community server operators can customize)
season:
  duration_days: 91              # ~3 months (matching SC2, CS2, AoE4)
  placement_matches: 10          # Required before rank is assigned
  soft_reset:
    # At season start, compress all ratings toward default:
    # new_rating = default + (old_rating - default) * compression_factor
    compression_factor: 700       # 0-1000 fixed-point (0.7 = keep 70% of distance from default)
    default_rating: 1500          # Center point
    reset_deviation: true         # Set deviation to placement level (fast convergence)
    placement_deviation: 350      # High deviation during placement (ratings move fast)
  rewards:
    # Per-tier season-end rewards (cosmetic only — no gameplay advantage)
    enabled: true
    # Specific rewards defined per-season by competitive committee (D037)
  leaderboard:
    min_matches: 5                # Minimum matches to appear on leaderboard
    min_distinct_opponents: 5     # Must have played at least 5 different opponents (V26)
```

**Season lifecycle:**
1. **Season start:** All player ratings compressed toward 1500 (soft reset). Deviation set to placement level (350). Players lose their tier badge until placement completes.
2. **Placement (10 matches):** High deviation means rating moves fast. Uses D041's seeding formula for brand-new players. Returning players converge quickly because their pre-reset rating provides a strong prior. **Hidden matchmaking rating (V30):** during placement, matchmaking searches near the player's pre-reset rating (not the compressed value), preventing cross-skill mismatches in the first few days of each season. Placement also requires **10 distinct opponents** (soft requirement — degrades gracefully to `max(3, available * 0.5)` on small servers) to prevent win-trading (V26).
3. **Active season:** Normal Glicko-2 rating updates. Deviation decreases with more matches (rating stabilizes). Tier badge updates immediately after every match (no delayed batches — avoiding OW2's mistake).
4. **Season end:** Peak tier badge saved to profile (D053). Season statistics archived. Season rewards distributed. Leaderboard frozen for display.
5. **Inter-season:** Short transition period (~1 week) with unranked competitive practice queue.

**Why 3-month seasons:**
- Matches SC2's proven cadence for RTS
- Long enough for ratings to stabilize and leaderboards to mature
- Short enough to prevent stagnation (the C&C Remastered problem)
- Aligns naturally with quarterly balance patches and competitive map pool rotations

#### Faction-Specific Ratings (Optional)

```yaml
# Player opted into faction tracking:
faction_ratings:
  enabled: true                  # Player's choice — optional
  # Separate rating tracked per faction played
  # Matchmaking uses the rating for the selected faction
  # Profile shows all faction ratings
```

Inspired by SC2's per-race MMR. When enabled:
- Each faction (e.g., Allies, Soviets) has a separate `PlayerRating`
- Matchmaking uses the rating for the faction the player queues with
- Profile displays all faction ratings (D053 statistics card)
- If disabled, one unified rating is used regardless of faction choice

**Why optional:** Some players want one rating that represents their overall skill. Others want per-faction tracking because they're "Diamond Allies but Gold Soviets." Making it opt-in respects both preferences without splitting the matchmaking pool (matchmaking always uses the relevant rating — either faction-specific or unified).

#### Matchmaking Queue Design

**Queue modes:**
- **Ranked 1v1:** Primary competitive mode. Map veto from seasonal pool.
- **Ranked Team:** 2v2, 3v3 (match size defined by game module). Separate team rating. Party restrictions: maximum 1 tier difference between party members (anti-boosting, same as LoL's duo restrictions).
- **Unranked Competitive:** Same rules as ranked but no rating impact. For practice, warm-up, or playing with friends across wide skill gaps.

**Map selection (ranked 1v1):**
Both players alternately ban maps from the competitive map pool (curated per-season by competitive committee, D037). The remaining map is played — similar to CS2 Premier's pick/ban system but adapted for 1v1 RTS.

**Map pool curation guidelines:** The competitive committee should evaluate maps for competitive suitability beyond layout and balance. Relevant considerations include:
- **Weather sim effects (D022):** Maps with `sim_effects: true` introduce movement variance from dynamic weather (snow slowing units, ice enabling water crossing, mud bogging vehicles). The committee may include weather-active maps if the weather schedule is deterministic and strategically interesting, or exclude them if the variance is deemed unfair. Tournament organizers can override this via lobby settings.
- **Map symmetry and spawn fairness:** Standard competitive map criteria — positional balance, resource distribution, rush distance equity.
- **Performance impact:** Maps with extreme cell counts, excessive weather particles, or complex terrain should be tested against the 500-unit performance target (10-PERFORMANCE.md) before inclusion.

**Anonymous veto (V27):** During the veto sequence, opponents are shown as "Opponent" — no username, rating, or tier badge. Identity is revealed only after the final map is determined and both players confirm ready. Leaving during the veto sequence counts as a loss (escalating cooldown: 5min → 30min → 2hr). This prevents identity-based queue dodging while preserving strategic map bans.

```
Seasonal pool: 7 maps
Player A bans 1 → 6 remain
Player B bans 1 → 5 remain
Player A bans 1 → 4 remain
Player B bans 1 → 3 remain
Player A bans 1 → 2 remain
Player B bans 1 → 1 remains → this map is played
```

**Player Avoid Preferences (ranked-safe, best-effort):**

Players need a way to avoid repeat bad experiences (toxicity, griefing, suspected cheating) without turning ranked into a dodge-by-name system. IC supports **`Avoid Player`** as a **soft matchmaking preference**, not a hard opponent-ban feature.

**Design split (do not merge these):**
- **Mute / Block** (D059): personal communication controls, immediate and local
- **Report** (D059 + D052): moderation signal with evidence and review path
- **Avoid Player** (D055): queue matching preference, **best-effort only**

**Ranked defaults:**
- No permanent "never match me with this opponent again" guarantees
- Avoid entries are **limited** (community-configurable slot count)
- Avoid entries **expire automatically** (recommended 7-30 days)
- Avoid preferences are **community-scoped**, not global across all communities
- Matchmaking may ignore avoid preferences under queue pressure / low population
- UI must label the feature as **best-effort**, not guaranteed

**Team queue policy (recommended):**
- Prefer supporting **avoid as teammate** first (higher priority)
- Treat **avoid as opponent** as lower priority or disable it in small populations / high MMR brackets (this should be the **default policy** given IC's expected RTS population size; operators can loosen in larger communities)

This addresses griefing/harassment pain in team games without creating a strong queue-dodging tool in 1v1.

**Matchmaking behavior:** Avoid preferences should be implemented as a **candidate-scoring penalty**, not a hard filter:
- prefer non-avoided pairings when multiple acceptable matches exist
- relax the penalty as queue time widens
- never violate `min_match_quality` just to satisfy avoid preferences
- do not bypass dodge penalties (leaving ready-check/veto remains penalized)

**Small-population matchmaking degradation:**

Critical for RTS communities. The queue must work with 50 players as well as 5,000.

```rust
/// Matchmaking search parameters — widen over time.
/// These are server-configurable defaults.
pub struct MatchmakingConfig {
    /// Initial rating search range (one-sided).
    /// A player at 1500 searches 1500 ± initial_range.
    pub initial_range: i64,           // default: 100

    /// Range widens by this amount every `widen_interval` seconds.
    pub widen_step: i64,              // default: 50

    /// How often (seconds) to widen the search range.
    pub widen_interval_secs: u32,     // default: 30

    /// Maximum search range before matching with anyone available.
    pub max_range: i64,               // default: 500

    /// After this many seconds, match with any available player.
    /// Only activates if ≥3 players are in queue (V31).
    pub desperation_timeout_secs: u32, // default: 300 (5 minutes)

    /// Minimum match quality (fairness score from D041).
    /// Matches below this threshold are not created even at desperation (V30).
    pub min_match_quality: f64,       // default: 0.3
}
```

The UI displays estimated queue time based on current population and the player's rating position. At low population, the UI shows "~2 min (12 players in queue)" transparently rather than hiding the reality.

**New account anti-smurf measures:**
- First 10 ranked matches have high deviation (fast convergence to true skill)
- New accounts with extremely high win rates in placement are fast-tracked to higher ratings (D041 seeding formula)
- Relay server behavioral analysis (Phase 5 anti-cheat) detects mechanical skill inconsistent with account age
- Optional: phone verification for ranked queue access (configurable by community server operator)
- Diminishing `information_content` for repeated pairings: `weight = base * 0.5^(n-1)` where n = recent rematches within 30 days (V26)
- Desperation matches (created after search widening) earn reduced rating change proportional to skill gap (V31)
- Collusion detection: accounts with >50% matches against the same opponent in a 14-day window are flagged for review (V26)

#### Peak Rank Display

Each player's profile (D053) shows:
- **Current rank:** The tier + division where the player stands right now
- **Peak rank (this season):** The highest tier achieved this season — never decreases within a season

This is inspired by Valorant's act rank and Dota 2's medal system. It answers "what's the best I reached?" without the full one-way-medal problem (Dota 2's medals never drop, making them meaningless by season end). IC's approach: current rank is always accurate, but peak rank is preserved as an achievement.

### Ranked Client-Mod Policy

BAR's experience with 291 client-side widgets demonstrates that UI extensions are a killer feature — but also a competitive integrity challenge. Some widgets provide automation advantages (auto-reclaim, camera helpers, analytics overlays) that create a grey area in ranked play.

IC addresses this with a three-tier policy:

| Mod Category | Ranked Status | Examples |
|---|---|---|
| **Sim-affecting mods** (custom pathfinders, balance changes, WASM modules) | **Blocked** unless hash-whitelisted and certified (D045) | Custom pathfinder, new unit types |
| **Client-only cosmetic** (UI themes, sound packs, palette swaps) | **Allowed** — no gameplay impact | D032 UI themes, announcer packs |
| **Client-only informational** (overlays, analytics, automation helpers) | **Restricted** — official IC client provides the baseline feature set; third-party informational widgets are disabled in ranked queues | Custom damage indicators, APM overlays, auto-queue helpers |

**Rationale:** The "restricted informational" tier prevents an arms race where competitive players must install community widgets to remain competitive. The official client includes the features that matter (production hotkeys, control groups, minimap pings, rally points). Community widgets remain fully available in casual, custom, and single-player modes.

**Enforcement:** The relay server validates the client's active mod manifest hash at match start. Ranked lobbies reject clients with non-whitelisted mods loaded. This is lightweight — the manifest hash is a single SHA-256 transmitted during lobby setup, not a full client integrity check.

**Community server override:** Per D052, community servers can define their own ranked mod policies. A community that wants to allow specific informational widgets in their ranked queue can whitelist those widget hashes. The official IC ranked queue uses the restrictive default.

### Rating Edge Cases & Bounds

**Rating floor:** Glicko-2 ratings are unbounded below in the standard algorithm. IC enforces a minimum rating of **100** — below this, the rating is clamped. This prevents confusing negative or near-zero display values (a problem BAR encountered with OpenSkill). The floor is enforced after each rating update: `rating = max(100, computed_rating)`.

**Rating ceiling:** No hard ceiling. The top of the rated population naturally compresses around 2200–2400 with standard Glicko-2. Supreme Commander tier (top 200) is defined by relative standing, not an absolute rating threshold, so ceiling effects don't distort it.

**Small-population convergence:** When the active ranked population is small (< 100), the same players match repeatedly. Glicko-2 naturally handles this — repeated opponents provide diminishing information as RD stabilizes. However, the `information_content` rematch penalty (V26: `weight = base × 0.5^(n-1)` for the n-th match against the same opponent in a 24-hour window) prevents farming rating from a single opponent.

**Placement match tier assignment:** After 10 placement matches, the player's computed rating maps to a tier via the standard threshold table. No rounding or special logic — if the rating after placement is 1523, the player lands in whichever tier contains 1523. There is no "placement boost" or "benefit of the doubt" — the system is the same for placement matches and regular matches.

**Volatility bounds:** The Glicko-2 volatility parameter σ is bounded: `σ_min = 0.01`, `σ_max = 0.15` (standard recommended range). The iterative Illinois algorithm convergence is capped at 100 iterations — if convergence hasn't occurred, the algorithm uses the last approximation. In practice, convergence occurs in 5–15 iterations.

**Zero-game seasons:** A player who is ranked but plays zero games in a season still has their RD grow via inactivity (Adaptation 4). At season end, they receive no seasonal reward but their rating persists into the next season. They are not "unranked" — they simply have high uncertainty.

### Community Replaceability

Per D052's federated model, ranked matchmaking is **community-owned:**

| Component                | Official IC default                    | Community can customize?                  |
| ------------------------ | -------------------------------------- | ----------------------------------------- |
| Rating algorithm         | Glicko-2 (`Glicko2Provider`)           | Yes — `RankingProvider` trait (D041)      |
| Tier names & icons       | Cold War military (RA module)          | Yes — YAML per game module/mod            |
| Tier thresholds          | Defined in `ranked-tiers.yaml`         | Yes — YAML per game module/community      |
| Number of tiers          | 7 + 2 elite = 9                        | Yes — YAML-configurable                   |
| Season duration          | 91 days                                | Yes — server configuration                |
| Placement match count    | 10                                     | Yes — server configuration                |
| Map pool                 | Curated by competitive committee       | Yes — per-community                       |
| Queue modes              | 1v1, team                              | Yes — game module defines available modes |
| Anti-smurf measures      | Behavioral analysis + fast convergence | Yes — server operator toggles             |
| Balance preset per queue | Classic RA (D019)                      | Yes — community chooses per-queue         |

**What is NOT community-customizable** (hard requirements):
- Match certification must use relay-signed `CertifiedMatchResult` (D007) — no self-reported results
- Rating records must use D052's SCR format — portable credentials require standardized format
- Tier resolution logic is engine-provided — communities customize the YAML data, not the resolution code

### Alternatives Considered

- **Raw rating only, no tiers** (rejected — C&C Remastered showed that numbers alone lack motivational hooks. The research clearly shows that named milestones drive engagement in every successful ranked system)
- **LoL-style LP system with promotion series** (rejected — LP/MMR disconnect is the most complained-about feature in LoL. Promotion series were so unpopular that Riot removed them in 2024. IC should not repeat this error)
- **Dota 2-style one-way medals** (rejected — medals that never decrease within a season become meaningless by season end. A "Divine" player who dropped to "Archon" MMR still shows Divine — misleading, not motivating)
- **OW2-style delayed rank updates** (rejected — rank updating only after 5 wins or 15 losses was universally criticized. Players want immediate feedback after every match)
- **CS2-style per-map ranking** (rejected for launch — fragments an already-small RTS population. Per-map statistics can be tracked without separate per-map ratings. Could be reconsidered if IC's population is large enough)
- **Elo instead of Glicko-2** (rejected as default — Glicko-2 handles uncertainty better, which is critical for players who play infrequently. D041's `RankingProvider` trait allows communities to use Elo if they prefer)
- **10+ named tiers** (rejected — too many tiers for expected RTS population size. Adjacent tiers become meaningless when population is small. 7+2 matches SC2's proven structure)
- **Single global ranking across all community servers** (rejected — violates D052's federated model. Each community owns its rankings. Cross-community credential verification via SCR ensures portability without centralization)
- **Mandatory phone verification for ranked** (rejected as mandatory — makes ranked inaccessible in regions without phone access, on WASM builds, and for privacy-conscious users. Available as opt-in toggle for community operators)
- **Performance-based rating adjustments** (deferred to `M11`, `P-Optional` — Valorant uses individual stats to adjust RR gains. For RTS this would be complex: which metrics predict skill beyond win/loss? Economy score, APM, unit efficiency? Risks encouraging stat-chasing over winning. If the community wants it, this would be a `RankingProvider` extension with a separate fairness review and explicit opt-in policy, not part of launch ranked.)
- **SC2-style leagues with player groups** (rejected — SC2's league system places players into divisions of ~100 who compete against each other within a tier. This requires thousands of concurrent players to fill meaningful groups. IC's expected population — hundreds to low thousands — can't sustain this. Ranks are pure rating thresholds: deterministic, portable across federated communities (D052), and functional with 50 players or 50,000. See § "Why Ranks, Not Leagues" above)
- **Color bands instead of named ranks** (rejected — CS2 Premier uses color bands (Grey → Gold) which are universal but generic. Military rank names are IC's thematic identity: "Colonel" means something in an RTS where you command armies. Color bands could be a community-provided alternative via YAML, but the default should carry the Cold War fantasy)
- **Enlisted ranks as lower tiers** (rejected — having "Private" or "Corporal" as the lowest ranks breaks the RTS fantasy: the player is always commanding armies, not following orders as a foot soldier. All tiers are officer-grade because the player is always in a command role. "Cadet" as the lowest tier signals "unproven officer" rather than "infantry grunt")
- **Naval rank names** (rejected — "Commander" is a naval rank, not army. "Commodore" and "Admiral" belong at sea. IC's default is an army hierarchy: Lieutenant → Captain → Major → Colonel → General. A naval mod could define its own tier names via YAML)
- **Modified Glicko-2 with performance bonuses** (rejected — some systems (Valorant, CS2) adjust rating gains based on individual performance metrics like K/D or round impact. For RTS this creates perverse incentives: optimizing eco score or APM instead of winning. The result (Win/Loss/Draw) is the only input to Glicko-2. Match duration weighting through `information_content` is the extent of non-result adjustment)

#### Ranked Match Lifecycle

D055 defines the rating system and matchmaking queue. The full competitive match lifecycle — ready-check, game pause, surrender, disconnect penalties, spectator delay, and post-game flow — is specified in `03-NETCODE.md` § "Match Lifecycle." This separation is deliberate: the match lifecycle is a network protocol concern that applies to all game modes (with ranked-specific constraints), while D055 is specifically about the rating and tier system.

**Key ranked-specific constraints** (enforced by the relay server based on lobby mode):
- Ready-check accept timeout: 30 seconds. Declining = escalating queue cooldown.
- Pause: 2 per player, 120 seconds max total per player, 30-second grace before opponent can unpause.
- Surrender: Immediate in 1v1 (`/gg` or surrender button). Vote in team games. No surrender before 5 minutes.
- Kick: Kicked player receives full loss + queue cooldown (same as abandon). Team's units redistributed.
- Remake: Voided match, no rating change. Only available in first 5 minutes.
- Draw: Treated as Glicko-2 draw (0.5 result). Both players' deviations decrease.
- Disconnect: Full loss + escalating queue cooldown (5min → 30min → 2hr). Reconnection within 60s = no penalty. Grace period voiding for early abandons (<2 min, <5% game progress).
- Spectator delay: 2 minutes (3,600 ticks). Players cannot disable spectating in ranked (needed for anti-cheat review).
- Post-game: 30-second lobby with stats, rating change display, report button, instant re-queue option.

See `03-NETCODE.md` § "Match Lifecycle" for the full protocol, data structures, rationale, and the In-Match Vote Framework that generalizes surrender/kick/remake/draw into a unified callvote system.

### Integration with Existing Decisions

- **D041 (RankingProvider):** `display_rating()` method implementations use the tier configuration YAML to resolve rating → tier name. The trait's existing interface supports D055 without modification — tier resolution is a display concern in `ic-ui`, not a trait responsibility.
- **D052 (Community Servers):** Each community server's ranking authority stores tier configuration alongside its `RankingProvider` implementation. SCR records store the raw rating; tier resolution is display-side.
- **D053 (Player Profile):** The statistics card (rating ± deviation, peak rating, match count, win rate, streak, faction distribution) now includes tier badge, peak tier this season, and season history. The `[Rating Graph →]` link opens the Rating Details panel — full Glicko-2 parameter visibility, rating history chart, faction breakdown, confidence interval, and population distribution.
- **D037 (Competitive Governance):** The competitive committee curates the seasonal map pool, recommends tier threshold adjustments based on population distribution, and proposes balance preset selections for ranked queues.
- **D019 (Balance Presets):** Ranked queues can be tied to specific balance presets — e.g., "Classic RA" ranked vs. "IC Balance" ranked as separate queues with separate ratings.
- **D036 (Achievements):** Seasonal achievements: "Reach Captain," "Place in top 100," "Win 50 ranked matches this season," etc.
- **D034 (SQLite Storage):** `MatchmakingStorage` trait's existing methods (`update_rating()`, `record_match()`, `get_leaderboard()`) handle all ranked data persistence. Season history added as new tables.
- **03-NETCODE.md (Match Lifecycle):** Ready-check, pause, surrender, disconnect penalties, spectator delay, and post-game flow. D055 sets ranked-specific parameters; the match lifecycle protocol is game-mode-agnostic. The **In-Match Vote Framework** (`03-NETCODE.md` § "In-Match Vote Framework") generalizes the surrender vote into a generic callvote system (surrender, kick, remake, draw, mod-defined) with per-vote-type ranked constraints.
- **05-FORMATS.md (Analysis Event Stream):** `PauseEvent`, `MatchEnded`, and `VoteEvent` analysis events record match lifecycle moments in the replay for tooling without re-simulation.

### Relationship to `research/ranked-matchmaking-analysis.md`

This decision is informed by cross-game analysis of CS2/CSGO, StarCraft 2, League of Legends, Valorant, Dota 2, Overwatch 2, Age of Empires IV, and C&C Remastered Collection's competitive systems. Key takeaways incorporated:

1. **Transparency trend** (§ 4.2): dual display of tier + rating from day one
2. **Tier count sweet spot** (§ 4.3): 7+2 = 9 tiers for RTS population sizes
3. **3-month seasons** (§ 4.4): RTS community standard (SC2), prevents stagnation
4. **Small-population design** (§ 4.5): graceful matchmaking degradation, configurable widening
5. **C&C Remastered lessons** (§ 3.4): community server ownership, named milestones > raw numbers, seasonal structure prevents stagnation
6. **Faction-specific ratings** (§ 2.1): SC2's per-race MMR adapted for IC's faction system
---

---
