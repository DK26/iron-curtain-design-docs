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

| Mod Category                                                               | Ranked Status                                                                                                                          | Examples                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Sim-affecting mods** (custom pathfinders, balance changes, WASM modules) | **Blocked** unless hash-whitelisted and certified (D045)                                                                               | Custom pathfinder, new unit types                          |
| **Client-only cosmetic** (UI themes, sound packs, palette swaps)           | **Allowed** — no gameplay impact                                                                                                       | D032 UI themes, announcer packs                            |
| **Client-only informational** (overlays, analytics, automation helpers)    | **Restricted** — official IC client provides the baseline feature set; third-party informational widgets are disabled in ranked queues | Custom damage indicators, APM overlays, auto-queue helpers |

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
- Spectator delay: 120 seconds wall-time floor (2,400 ticks at Normal ~20 tps; relay computes ticks from speed preset, V59). Players cannot disable spectating in ranked (needed for anti-cheat review).
- Post-game: 5-minute lobby with stats, rating change display, report button, instant re-queue option.

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
- **formats/save-replay-formats.md (Analysis Event Stream):** `PauseEvent`, `MatchEnded`, and `VoteEvent` analysis events record match lifecycle moments in the replay for tooling without re-simulation.

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
