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

  # Match quality weighting (tick-based: measures game progression, not wall time)
  match_duration_weight:
    min_ticks: 3600               # ~3 min at Normal ~20 tps — below this, reduced weight
    full_weight_ticks: 18000      # ~15 min at Normal ~20 tps — at or above this, full weight
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


---

## Sub-Pages

| Section               | Topic                                                                                                                                                                                                                       | File                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Seasons & Matchmaking | Season structure, soft reset, placement matches, inactivity decay, faction-specific ratings, small-population degradation, matchmaking queue, rating details panel, community customization, rationale, alternatives, phase | [D055-seasons-matchmaking.md](D055/D055-seasons-matchmaking.md) |
