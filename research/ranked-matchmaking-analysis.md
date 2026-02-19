# Ranked Matchmaking Systems — Cross-Game Analysis

> **Purpose:** Analyze competitive ranked matchmaking systems across major titles to inform Iron Curtain's ranked mode design (D055). Focus on ranking algorithms, tier structures, season mechanics, small-population challenges, and RTS-specific considerations.
>
> **Sources:** Wikipedia (CS2, CSGO, C&C Remastered Collection articles), official game documentation, Valve CS Regional Standings research (see `research/valve-github-analysis.md`), community wikis, direct gameplay experience documentation.

---

## Part 1: Counter-Strike 2 / CSGO Competitive Ranking

### 1.1 CSGO's 18 Skill Groups (2012–2023)

CSGO used a modified Glicko-2 rating system internally but displayed ranks as 18 named skill groups:

| Tier | Rank Name                     | Abbrev |
| ---- | ----------------------------- | ------ |
| 1    | Silver I                      | S1     |
| 2    | Silver II                     | S2     |
| 3    | Silver III                    | S3     |
| 4    | Silver IV                     | S4     |
| 5    | Silver Elite                  | SE     |
| 6    | Silver Elite Master           | SEM    |
| 7    | Gold Nova I                   | GN1    |
| 8    | Gold Nova II                  | GN2    |
| 9    | Gold Nova III                 | GN3    |
| 10   | Gold Nova Master              | GNM    |
| 11   | Master Guardian I             | MG1    |
| 12   | Master Guardian II            | MG2    |
| 13   | Master Guardian Elite         | MGE    |
| 14   | Distinguished Master Guardian | DMG    |
| 15   | Legendary Eagle               | LE     |
| 16   | Legendary Eagle Master        | LEM    |
| 17   | Supreme Master First Class    | SMFC   |
| 18   | The Global Elite              | GE     |

**Key characteristics:**
- Internal rating (MMR) was completely hidden — players saw only the skill group icon
- Rank mapping thresholds were never published by Valve and adjusted over time
- Rank changes could happen mid-match or after a single game — no LP/RR intermediary
- The system used a modified Glicko-2 with additional factors (round wins, MVP stars, score)
- "Rank decay" occurred after 28+ days of inactivity — rank would reset and require a placement win to restore
- 10 competitive wins required before receiving initial rank placement
- Maximum 2 wins per day for unranked accounts (anti-smurf measure removed later)

**Problems with CSGO's system:**
- Opaque rating frustrated players — "I won 5 in a row, why didn't I rank up?"
- The mapping from continuous rating to 18 discrete groups created perverse threshold effects
- Rank distribution was heavily concentrated in Gold Nova (the median), with Silver and Global Elite being thin tails
- No seasonal resets — ranks stagnated, inactive players kept high ranks until decay kicked in

### 1.2 CS2's Dual System (2023–Present)

CS2 launched with two parallel competitive modes:

**Competitive Mode (per-map ranks):**
- Same 18 skill groups as CSGO
- Ranks are now tracked **per map** — a player might be Gold Nova III on Mirage but Silver Elite Master on Ancient
- This acknowledged that skill varies by map, a frequent community complaint in CSGO
- Per-map ranking spreads the player population thinner — more rank uncertainty per map

**Premier Mode (numerical CS Rating):**
- Replaced CSGO's opaque system with a visible numerical rating: the CS Rating (CSR)
- Range: 0–35,000+ (no fixed ceiling, but practical ceiling is ~35,000)
- Color-coded bands for visual feedback:
  - 0–4,999: Grey
  - 5,000–9,999: Light Blue
  - 10,000–14,999: Blue
  - 15,000–19,999: Purple
  - 20,000–24,999: Pink
  - 25,000–29,999: Red
  - 30,000+: Gold/Yellow
- Uses a 7-map pool with pick/ban system (players alternate removing maps)
- Seasonal resets: rating carries over with some compression toward the mean
- 10 placement matches to establish initial rating
- Required Prime status (paid) to access Premier, reducing smurf accounts

**Key insight from CS2's dual approach:**
Valve recognized that both opaque skill groups AND raw numbers have advantages:
- **Skill groups** are meaningful milestones that provide clear ranks to chase — "I want to reach Eagle"
- **Numerical ratings** are transparent and prevent frustration about hidden thresholds
- The dual system lets both player preferences coexist
- However, managing two parallel systems creates community fragmentation — many players gravitate almost exclusively to Premier mode

**What IC can learn from CS2:**
1. **Transparency matters** — the shift from hidden MMR to visible CS Rating was universally praised
2. **Per-map ranking** is interesting but fragments the population (problematic for smaller RTS communities)
3. **Seasonal structure** creates engagement hooks — players have reason to return each season
4. **Pick/ban in map selection** adds strategic depth to the competitive queue
5. **Prime/pay barrier** for ranked reduces smurfing but gates competitive play behind payment (IC should avoid paywalls per philosophy)

### 1.3 Valve's Trust Factor and Anti-Smurf

Beyond the ranking system, CSGO/CS2 implemented behavioral-layer systems:
- **Trust Factor:** Composite score based on Steam account age, playtime across games, reports, commendations, VAC history. High Trust Factor players match with other high-trust players. Low trust players end up in a "shadow pool" of suspected cheaters/toxic players.
- **Anti-smurf:** CS2 requires phone number verification and Prime status. CSGO had 2-win daily caps for new accounts (later removed). The relay server's behavioral analysis (D031/Phase 5) can implement similar protections.

---

## Part 2: Other Major Ranked Systems

### 2.1 StarCraft 2 (Most Relevant RTS Comparison)

SC2's ranked ladder is the closest RTS reference for IC:

| Tier        | Divisions | Population         |
| ----------- | --------- | ------------------ |
| Bronze      | 3         | ~8%                |
| Silver      | 3         | ~12%               |
| Gold        | 3         | ~20%               |
| Platinum    | 3         | ~20%               |
| Diamond     | 3         | ~20%               |
| Master      | 1         | ~2%                |
| Grandmaster | 1         | Top 200 per region |

**Key characteristics:**
- 7 leagues with 3 tiers each (except Master/GM) = 17 positions
- Internal MMR (later made visible in 2020) drives matchmaking; league/tier is a display layer
- Separate ladders per mode: 1v1, 2v2, 3v3, 4v4, Archon (2v2 shared control)
- **Seasonal structure:** ~3-month seasons with soft MMR reset. Players play 5 placement matches at season start.
- **Provisional period:** New accounts play ~25 games before getting a stable MMR estimate
- **Bonus pool:** Accumulates points over time; incentivizes regular play to "spend" bonus pool. Primarily affects league point progression rather than actual matchmaking.
- **Separate race-specific MMR (off-race):** When playing a non-main race, a separate MMR is used. Prevents the "I'm Diamond Zerg but Silver Terran" mismatch problem.

**Lessons for IC:**
1. **7 main tiers works well for smaller RTS populations** — enough granularity without fragmentation
2. **Revealing MMR was positive** — community appreciated transparency, same as CS2's shift
3. **Race-specific ratings** map directly to IC's faction system — faction-specific ratings prevent the same imbalance
4. **Fixed top-200 GM** creates a meaningful aspirational target even with small player bases
5. **Seasonal structure** keeps the ladder fresh — seasonal resets prevent years-long stagnation
6. **Multiple queue modes** (1v1, team) need separate ratings — a player's 1v1 skill doesn't predict team skill

**Problems:**
- Small regional populations (especially in later years) caused long queue times at extreme ranks
- GM being "top 200 per region" meant quality varied dramatically between regions
- Bonus pool system was confusing and didn't clearly communicate skill

### 2.2 League of Legends

| Tier        | Divisions | Population         |
| ----------- | --------- | ------------------ |
| Iron        | IV–I      | ~3%                |
| Bronze      | IV–I      | ~15%               |
| Silver      | IV–I      | ~25%               |
| Gold        | IV–I      | ~25%               |
| Platinum    | IV–I      | ~15%               |
| Emerald     | IV–I      | ~10%               |
| Diamond     | IV–I      | ~5%                |
| Master      | —         | ~1.5%              |
| Grandmaster | —         | Top 700 per region |
| Challenger  | —         | Top 300 per region |

**Key characteristics:**
- 10 tiers total — IV→I progression within each tier (IV lowest, I highest)
- Uses internal MMR + visible LP (League Points). Players earn/lose LP per game; at 100 LP, they promote.
- Promotion series removed in 2024 — crossing division boundaries is now automatic at 100 LP
- **Seasonal resets:** Full reset every ~12 months, with 10 placement matches. Placement typically drops players 1-2 full tiers.
- **LP gains are MMR-adjusted** — winning against higher-MMR opponents gives more LP; stomping lower-MMR opponents gives less
- **Duo queue restrictions:** Higher-ranked players can't duo with much lower-ranked friends (smurf prevention)

**Lessons for IC:**
1. **LP/MMR disconnect creates frustration** — players feel "stuck" when their MMR settles but LP gains are small. IC should avoid this by making the rating visible.  
2. **10 tiers may be too many** for an RTS with smaller populations — the "Emerald" tier was added later to address population clustering, which wouldn't be IC's problem
3. **Promotion series** (before removal) were universally hated — don't add gatekeeping matches at tier boundaries
4. **Duo queue restrictions** are important for competitive integrity

### 2.3 Valorant

| Tier      | Divisions | Population |
| --------- | --------- | ---------- |
| Iron      | 3 (1-3)   | ~5%        |
| Bronze    | 3         | ~12%       |
| Silver    | 3         | ~20%       |
| Gold      | 3         | ~20%       |
| Platinum  | 3         | ~18%       |
| Diamond   | 3         | ~12%       |
| Ascendant | 3         | ~8%        |
| Immortal  | 3         | ~4%        |
| Radiant   | —         | Top 500    |

**Key characteristics:**
- 9 tiers × 3 divisions + Radiant = 25 positions
- Uses hidden MMR + visible RR (Rank Rating, 0-100 per division)
- **Performance-based RR:** Individual combat stats (kills, first bloods, damage) adjust RR gains/losses. Performing well in a loss reduces RR loss; performing poorly in a win reduces RR gain.
- **Win streaks/loss streaks** amplify RR changes — creates momentum
- **Seasonal acts:** ~2-month acts within ~6-month episodes. Act rank shows peak performance, not current.

**Lessons for IC:**
1. **Performance-based adjustments** are controversial — in RTS they'd need careful design (economy score? build order diversity? unit efficiency?) but are possible
2. **Act/episode structure** is more complex than necessary for RTS — simpler 3-month seasons suffice
3. **Peak rank display** is a nice touch — shows "best achievement this season" alongside current rating

### 2.4 Dota 2

| Tier     | Stars | Population              |
| -------- | ----- | ----------------------- |
| Herald   | 1-5   | ~5%                     |
| Guardian | 1-5   | ~10%                    |
| Crusader | 1-5   | ~15%                    |
| Archon   | 1-5   | ~20%                    |
| Legend   | 1-5   | ~20%                    |
| Ancient  | 1-5   | ~15%                    |
| Divine   | 1-5   | ~10%                    |
| Immortal | —     | Top ~0.5% (visible MMR) |

**Key characteristics:**
- 8 tiers × 5 stars + Immortal = 36 positions
- **Medals can only go UP within a season** — you can never derank your displayed medal
- Internal MMR can drop, but the medal stays at peak until season reset
- Immortal players see their actual MMR number and global leaderboard position
- **Seasonal recalibration:** 10 matches to re-establish rank each season
- **Behavior score:** 0-10,000, affects matchmaking pool. Low behavior = matched with other low-behavior players.

**Lessons for IC:**
1. **One-way medals** reduce tilt anxiety but make the medal less meaningful over time — a player who peaked at Ancient but dropped to Archon MMR still shows Ancient
2. **Visible MMR at top tier** is good — elite players want precision, not tiers
3. **Behavior score** is essentially Trust Factor — IC's relay behavioral analysis covers this

### 2.5 Overwatch 2

| Tier        | Divisions |
| ----------- | --------- |
| Bronze      | 5 (5-1)   |
| Silver      | 5         |
| Gold        | 5         |
| Platinum    | 5         |
| Diamond     | 5         |
| Master      | 5         |
| Grandmaster | 5         |
| Champion    | —         |

**Key characteristics:**
- 7 tiers × 5 divisions + Champion = 36 positions
- **Delayed rank updates:** Rank only updates after 5 wins or 15 losses — not after every match
- **Role queue:** Separate ranks for Tank, DPS, Support (less relevant for RTS but conceptually similar to faction-specific ratings)
- **Open queue:** Single rank for all roles

**Lessons for IC:**
1. **Delayed rank updates were unpopular** — players want immediate feedback. IC should update after every match.
2. **Role-specific ranking** validates the concept of faction-specific ratings for RTS

### 2.6 Age of Empires IV

| Tier      | Divisions |
| --------- | --------- |
| Bronze    | 3 (III-I) |
| Silver    | 3         |
| Gold      | 3         |
| Platinum  | 3         |
| Diamond   | 3         |
| Conqueror | 3         |

**Key characteristics:**
- 6 tiers × 3 divisions = 18 positions
- Elo-based matchmaking
- Quick Match 1v1 and team ranked modes
- Relatively simple system suited for the RTS community size
- No elaborate season structure initially — added seasons later

**Lessons for IC:**
1. **Simple is better for smaller communities** — AoE4's straightforward system works for its population
2. **18 positions** is close to CSGO's 18 groups — a proven count
3. **The RTS community accepts simpler ranking** — no need for Valorant-level complexity

---

## Part 3: C&C Remastered Collection Competitive

### 3.1 Overview

The C&C Remastered Collection (2020) had its multiplayer rebuilt from scratch by Petroglyph Games. The competitive infrastructure included:

- **Quick Match:** Automated 1v1 matchmaking using Elo-based rating
- **Custom Games:** Lobby-based multiplayer for organized matches
- **Leaderboards:** Global rankings displayed on EA's online services
- **CnCNet Integration:** The community platform CnCNet provided additional multiplayer infrastructure

### 3.2 What Worked

- **Elo-based simplicity:** Players had a single visible number — no tiers, no named ranks, just a rating. This was transparent and easy to understand.
- **Quick Match automation:** One-click competitive play reduced friction versus manual lobby creation.
- **Community ladder integration:** CnCNet's existing competitive community (which had maintained ladders for classic C&C games for decades) provided a ready-made competitive ecosystem.

### 3.3 What Didn't Work

- **Small player base:** C&C's competitive community is passionate but small. At peak, the Remastered Collection had a few thousand concurrent players. Ranked queue times were often 5-15+ minutes, sometimes much longer at extreme ratings.
- **No ranked tiers or milestones:** The raw Elo number lacked the motivational hooks that named ranks provide. There was no "I just reached Gold" moment — just a number going up or down.
- **No seasonal structure:** Without seasons, the leaderboard stagnated. Top players who stopped playing retained their positions indefinitely.
- **Server shutdown:** EA eventually reduced online service support, pushing competitive play to community-maintained infrastructure (CnCNet). This validates IC's federated community server model (D052).
- **No anti-smurf protection:** With a small population, smurf accounts could dominate lower ratings with impunity.
- **Balance concerns:** Red Alert and Tiberian Dawn have known balance issues that competitive play exposes. Without balance presets (IC's D019), the competitive mode was locked to one balance set.

### 3.4 Lessons for IC

1. **IC must design for small populations from day one** — the C&C competitive community is hundreds to low thousands, not millions. Queue times and matchmaking quality at small scale are critical.
2. **Named ranks provide motivation that raw numbers don't** — even with a transparent rating, milestone tiers give players goals.
3. **Seasons prevent stagnation** — seasonal resets keep the ladder alive.
4. **Community server ownership is essential** — EA's server shutdown validates D052's federated approach. When the official servers die, competitive play must survive.
5. **Balance presets per queue** (D019) can enable different competitive metas simultaneously.
6. **CnCNet proves community-run competitive infrastructure works** — the community will maintain ladders if given the tools. IC's community server model is exactly right.

---

## Part 4: Cross-Cutting Analysis

### 4.1 Common Patterns

Every successful ranked system shares these elements:

| Pattern                               | Examples                        | IC Implication                                                  |
| ------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| Named rank tiers with visual identity | All games                       | Tier names + icons in YAML, community-themeable                 |
| Placement matches for initial seeding | SC2, LoL, Valorant, CS2         | 10 placement matches, weighted by opponent quality              |
| Seasonal structure with soft resets   | All games (except old CSGO)     | 3-month seasons, rating compressed toward mean                  |
| Separate ratings per mode             | SC2, OW2, LoL                   | 1v1 vs. team ratings; faction-specific optional                 |
| Anti-smurf measures                   | CS2 Prime, LoL duo restrictions | Phone verification, behavioral analysis, new account throttling |
| Visible rating at top tier            | SC2 GM, Dota 2 Immortal         | Top tier shows actual rating number + leaderboard position      |
| Leaderboards                          | All games                       | Per-season, per-faction, per-map, global                        |

### 4.2 The Transparency Trend

The clear industry direction is toward **more transparency** in ranking:
- CSGO → CS2: hidden skill groups → visible CS Rating
- SC2: hidden MMR → visible MMR (2020 patch)
- Dota 2: medals + visible MMR at Immortal
- LoL: removed promotion series (2024)

IC should follow this trend: **show the actual rating number** alongside the tier name. Players who want the milestone experience see "Major III → Major II!" while analytically-minded players see "1847 → 1902."

### 4.3 Tier Count Sweet Spot

| Game        | Named Tiers | Total Positions | Population              |
| ----------- | ----------- | --------------- | ----------------------- |
| CSGO        | 18 (flat)   | 18              | ~1M concurrent          |
| CS2 Premier | 7 colors    | 7 bands         | ~1M concurrent          |
| SC2         | 7+2         | 17              | ~100K concurrent (peak) |
| LoL         | 10          | 38+             | ~100M monthly           |
| Valorant    | 9           | 25              | ~20M monthly            |
| Dota 2      | 8           | 36              | ~500K concurrent        |
| OW2         | 8           | 36              | ~25M monthly            |
| AoE4        | 6           | 18              | ~20K concurrent         |

**Observation:** Games with smaller populations (SC2, AoE4) use fewer tiers. Games with massive populations (LoL, Valorant) can afford more. IC's expected population is closer to SC2/AoE4 territory.

**Recommendation for IC:** 7 main tiers × 3 divisions + 2 elite tiers = 23 positions. This matches SC2's proven structure for RTS communities while providing enough granularity for competitive progression.

### 4.4 Season Length

| Game     | Season Length    | Reset Type                            |
| -------- | ---------------- | ------------------------------------- |
| CS2      | ~3 months        | Soft (rating compressed)              |
| SC2      | ~3 months        | Soft (5 placement matches)            |
| LoL      | ~12 months       | Hard (10 placements, drops 1-2 tiers) |
| Valorant | ~2 months (acts) | Soft within 6-month episodes          |
| Dota 2   | ~6 months        | Recalibration (10 matches)            |
| AoE4     | ~3 months        | Soft                                  |

**Recommendation for IC:** 3-month seasons (matching existing Phase 5 plan). This is the RTS community standard (SC2) and prevents stagnation without being disruptively frequent.

### 4.5 RTS-Specific Challenges

RTS ranked play has unique properties that FPS-derived systems don't address:

1. **Long match duration:** FPS matches are 30-45 minutes. RTS matches can be 10 minutes (rush) to 90+ minutes (late-game macro). The rating impact shouldn't penalize/reward game length, but the information content should account for very short games (early disconnects ≠ skill measurement).

2. **Asymmetric factions:** Unlike FPS where all players have the same tools, RTS factions are deliberately asymmetric. Faction-specific ratings (like SC2's per-race MMR) prevent the "Diamond Allied but Silver Soviet" problem.

3. **Smaller player pools:** The RTS genre typically has 10-100× fewer players than top FPS/MOBA titles. Matchmaking must gracefully degrade: widen skill range after timeout rather than fail to find matches.

4. **Map asymmetry:** Unlike symmetrical FPS maps, many RTS maps have starting position advantages. Map veto/ban systems and per-map statistics help, but map balance is a persistent challenge.

5. **Fewer games per session:** RTS players typically play 2-5 games per session (due to match length) vs. 10-20 in FPS. Rating convergence is slower — the system needs fewer games to reach stable rating.

6. **Balance patches have larger impact:** FPS balance changes are incremental. RTS balance patches (unit cost changes, damage tweaks) can shift the meta dramatically. Seasons should align with major balance patches.

---

## Part 5: Replaceability & Community Ownership

### 5.1 What Should Be Replaceable?

| Component             | Replaceable By                | Mechanism                      |
| --------------------- | ----------------------------- | ------------------------------ |
| Rating algorithm      | Community server operator     | `RankingProvider` trait (D041) |
| Tier names & icons    | Game module / mod             | YAML configuration             |
| Tier thresholds       | Game module / mod / community | YAML configuration             |
| Season length         | Community server operator     | Server configuration           |
| Placement match count | Community server operator     | Server configuration           |
| Map pool              | Competitive committee (D037)  | Per-season curation            |
| Queue modes           | Game module                   | Game module registration       |
| Leaderboard format    | Community server operator     | UI templates                   |

### 5.2 What Should NOT Be Replaceable?

- **Match certification:** All ranked matches MUST be relay-certified (D007) with signed `CertifiedMatchResult`. No self-reporting.
- **SCR credential format:** Rating records use D052's Signed Credential Record format. The binary format is standardized.
- **Anti-cheat minimum:** Behavioral analysis on the relay server is mandatory for ranked queues. Can't be disabled by community operators.
- **Minimum match count for leaderboards:** Configurable threshold, but must be ≥ 1 (can't appear with zero games).

### 5.3 Community-Specific vs. Global

Per D052, each community server federation operates independent rankings. There is no single "global IC ranking" — each community has its own leaderboard, its own seasonal schedule, and potentially its own `RankingProvider` implementation.

**However,** the official IC servers should provide a reference implementation of the full ranked experience, including:
- Default tier names and thresholds
- Default Glicko-2 algorithm
- Default 3-month season structure
- Default 10-placement-match flow
- Default leaderboards

Community servers then choose to replicate this experience or customize it. D052's SCR system ensures that any community can cryptographically prove a player's rating — portable credentials work across communities.

---

## Part 6: Implications for Iron Curtain

### 6.1 Recommended Tier Structure

For the Red Alert game module, Cold War military officer ranks provide thematic rank names. All ranks are officer-grade because the player is always in a command role:

| Tier                | Rating Range (Glicko-2 equivalent) | Distribution Target |
| ------------------- | ---------------------------------- | ------------------- |
| Cadet (III–I)       | 0–999                              | ~5%                 |
| Lieutenant (III–I)  | 1000–1249                          | ~10%                |
| Captain (III–I)     | 1250–1424                          | ~13%                |
| Major (III–I)       | 1425–1574                          | ~17%                |
| Lt. Colonel (III–I) | 1575–1749                          | ~17%                |
| Colonel (III–I)     | 1750–1974                          | ~16%                |
| Brigadier (III–I)   | 1975–2249                          | ~12%                |
| General             | 2250+                              | ~7%                 |
| Supreme Commander   | Top 200                            | ~3%                 |

This gives: 7 main tiers × 3 divisions + 2 elite tiers = **23 ranked positions.**

**Why military ranks:**
- All officer-grade — the player commands armies, not follows orders as a foot soldier
- Proper military hierarchy — every rank is real and in correct sequential order
- Cold War theme matches IC's identity — "Supreme Commander" crowns the hierarchy with genre-defining gravitas
- Lt. Colonel fills the natural gap between Major and Colonel

**Why this count:**
- Matches SC2's proven structure for RTS communities
- Enough granularity for meaningful progression (23 positions)
- Not so many that adjacent tiers are meaningless (unlike LoL's 38+)
- Elite tiers (General, Supreme Commander) create aspirational targets

### 6.2 What IC Already Has (Existing Infrastructure)

The existing design already covers the foundational layer:
- `RankingProvider` trait (D041) with `Glicko2Provider` default
- `PlayerRating` struct with rating/deviation/volatility/games_played
- `MatchQuality` with information content weighting
- D052 SCR system for cryptographically signed ratings
- D053 Player Profile with statistics card and rating display
- D037 competitive committee for map pool curation
- D034 `MatchmakingStorage` with `update_rating()`, `record_match()`, `get_leaderboard()`
- Phase 5 roadmap: "Ranked matchmaking: Glicko-2 rating system, placement matches, league tiers, 3-month seasons"

**What's missing** and what a new decision (D055) should define:
1. Specific tier names, thresholds, and distribution targets
2. Season lifecycle (start, placement, active, end, rewards)
3. Placement match flow details
4. Queue modes and restrictions
5. Matchmaking degradation for small populations
6. Faction-specific rating support
7. Rank display configuration (YAML-driven, game-module-specific)
8. Integration with `RankingProvider::display_rating()` for tier name mapping

### 6.3 Key Design Recommendations

1. **Dual display:** Show both tier name AND numerical rating. Tier for motivation, number for transparency.
2. **3-month seasons** with soft reset (compress rating toward 1500, preserve deviation).
3. **10 placement matches** per season, using existing seeding formula (D041).
4. **Faction-specific optional ratings** — players can opt into per-faction tracking (like SC2's per-race MMR).
5. **Rating updates after every match** — no delayed batches (avoid OW2's mistake).
6. **Graceful queue degradation:** Widen skill range by 50 points every 30 seconds of queue time. After 5 minutes, significantly wider range. After 10 minutes, match with anyone available. Display estimated wait time.
7. **Tier names are YAML-configurable per game module** — RA uses military ranks; TD could use different names; community mods define their own.
8. **Community servers own their rankings** per D052 — no single "global" IC ranking.
9. **Peak rank badge:** Show the highest tier achieved this season alongside current rank (like Valorant's act rank).
10. **Map veto system** for ranked 1v1: both players ban maps from the seasonal pool, remaining map is played (like CS2 Premier's pick/ban).

---

*Analysis completed February 2026. To be used as input for D055 (Ranked Tiers, Seasons & Matchmaking Queue).*
