## Vulnerability 26: Ranked Rating Manipulation via Win-Trading & Collusion

### The Problem

Two or more players coordinate to inflate one player's rating. Techniques include: queue sniping (entering queue simultaneously to match each other), intentional loss by the colluding partner, and repeated pairings where a low-rated smurf farms losses. D055's `min_distinct_opponents: 1` threshold is far too permissive — a player could reach the leaderboard by beating the same opponent repeatedly.

**Real-world precedent:** Every competitive game faces this. SC2's GM ladder was inflamed by win-trading on low-population servers (KR off-hours). CS2 requires a minimum of 100 wins before Premier rank display. Dota 2's Immortal leaderboard has been manipulated via region-hopping to low-population servers for easier matches.

### Defense

**Diminishing returns for repeated pairings:**

- When computing `update_rating()`, D041's `MatchQuality.information_content` is reduced for repeated pairings with the same opponent. The first match contributes full weight. Subsequent matches within a rolling 30-day window receive exponentially decaying weight: `weight = base_weight * 0.5^(n-1)` where n is the number of recent matches against the same opponent. By the 4th rematch, rating gain is ~12% of the first match.
- `min_distinct_opponents` raised from 1 to **5** for leaderboard eligibility and **10** for placement completion (soft requirement — if the population is too small for 10 distinct opponents within the placement window, the threshold degrades gracefully to `max(3, available_opponents * 0.5)`).

**Server-side collusion detection:**

- The ranking authority flags accounts where >50% of matches in a rolling 14-day window are against the same opponent (duo detection).
- Accounts that repeatedly enter queue within 3 seconds of each other AND match successfully >30% of the time are flagged for queue sniping investigation.
- Flagged accounts are placed in a review queue (D052 community moderation). Automated restriction requires both statistical pattern match AND manual confirmation.

**Phase:** Diminishing returns and distinct-opponent thresholds ship with D055's ranked system (Phase 5). Queue sniping detection Phase 5+.

**Storage specification for opponent-pair tracking (audit finding F17):**

The diminishing-returns system requires storing `(player_a, player_b, match_count, last_match_timestamp)` tuples in the ranking authority's SQLite database (D034). Storage model:

- **Representation:** Sparse — only pairs that have actually played are stored. No pre-allocated matrix.
- **Key:** `(min(player_a, player_b), max(player_a, player_b))` — symmetric, canonical ordering.
- **Rolling window:** 30 days. Entries older than 30 days are pruned by a scheduled `DELETE WHERE last_match_timestamp < now() - 30d` job (daily, off-peak).
- **Expected storage:** 10K active players × ~50 matches/season ÷ 2 (pairs) × 16 bytes/row ≈ **4 MB**. 100K players ≈ **40 MB** (sparse, not O(n²) because most players never face most others). Even pessimistic estimates stay within SQLite's operational range.
- **Index:** Composite index on `(player_a, player_b)` for O(log n) lookup during `update_rating()`. Secondary index on `last_match_timestamp` for efficient pruning.
- **Cleanup trigger:** The pruning job also runs after each season reset (D055), dropping all entries from the previous season.

This makes the storage cost proportional to *actual matches played*, not population size squared.

## Vulnerability 27: Queue Sniping & Dodge Exploitation

### The Problem

During D055's map veto sequence, both players alternate banning maps from the pool. Once the veto begins, the client knows the opponent's identity (visible in the veto UI). A player who recognizes a strong opponent or an unfavorable map pool state can disconnect before the veto completes, avoiding the match with no penalty.

Additionally, astute players can infer their opponent's identity from the matchmaking queue (based on timing, queue length display, or rating estimate) and dodge before the match begins.

### Defense

**Anonymous matchmaking until commitment point:**

- During the veto sequence, opponents are shown as "Opponent" (no username, no rating, no tier badge). Identity is revealed only after the final map is determined and both players confirm ready. This prevents identity-based queue dodging.
- The veto sequence itself is a commitment — once veto begins, both players have entered the match.

**Dodge penalties:**

- Leaving during the veto sequence counts as a loss (rating penalty applied). This is the same approach used by LoL (dodge = LP loss + cooldown) and Valorant (dodge = RR loss + escalating timeout).
- Escalating cooldown: 1st dodge = 5-minute queue timeout. 2nd dodge within 24 hours = 30 minutes. 3rd+ = 2 hours. Cooldown resets after 24 hours without dodging.
- The relay server records the dodge event; the ranking authority applies the penalty. The client cannot avoid the penalty by terminating the process — the relay-side timeout is authoritative.

**Phase:** Anonymous veto and dodge penalties ship with D055's matchmaking system (Phase 5).

## Vulnerability 28: CommunityBridge Phishing & Redirect

### The Problem

D055's tracking server configuration (`tracking_servers:` in settings YAML) accepts arbitrary URLs. A social engineering attack directs players to add a malicious tracking server URL. The malicious server returns `GameListing` entries with `host: ConnectionInfo` pointing to attacker-controlled IPs. Players who join these games connect to a hostile server that could:
- Harvest IP addresses (combine with D053 profile to de-anonymize players)
- Attempt relay protocol exploits against the connecting client
- Display fake games that never start (griefing/confusion)

### Defense

**Protocol handshake verification:**

- When connecting to any address from a tracking server listing, the IC client performs a full protocol handshake (version check, encryption negotiation, identity verification) before revealing any user data. A non-IC server fails the handshake → connection aborted with a clear error message.
- The relay server's Ed25519 identity key must be presented during handshake. Unknown relay keys trigger a trust-on-first-use (TOFU) prompt: "This relay server is not recognized. Connect anyway?" with the relay's fingerprint displayed.

**Trust indicators in the game browser UI:**

- **Verified sources:** Tracking servers bundled with the game client (official, OpenRA, CnCNet) display a verified badge. User-added tracking servers display "Community" or "Unverified" labels.
- **Relay trust:** Games hosted on relays with known Ed25519 keys (from previously trusted sessions) show "Trusted relay." Games on unknown relays show "Unknown relay — first connection."
- **IP exposure warning:** When connecting directly to a player-hosted relay (direct IP), the UI warns: "Direct connection — your IP address may be visible to the host."

**Tracking server URL validation:**

- URLs must use HTTPS (not HTTP). Plain HTTP tracking servers are rejected.
- The client validates TLS certificates. Self-signed certificates trigger a warning.
- Rate limiting on tracking server additions: maximum 10 configured tracking servers to prevent configuration bloat from social engineering ("add these 50 servers for more games!").

**Phase:** Protocol handshake verification and trust indicators ship with tracking server integration (Phase 5). HTTPS enforcement from Day 1.

## Vulnerability 29: SCR Cross-Community Rating Misrepresentation

### The Problem

D052's SCR (Signed Credential Record) format enables portable credentials across community servers. A player who earned "Supreme Commander" on a low-population, low-skill community server can present that credential in the lobby of a high-skill community server. The lobby displays the impressive tier badge, but the rating behind it was earned against much weaker competition. This creates misleading expectations and undermines trust in the tier system.

### Defense

**Community-scoped rating display:**

- The lobby and profile always display which community server issued the rating. "Supreme Commander (ClanX Server)" vs. "Supreme Commander (Official IC)". Community name is embedded in the SCR and cannot be forged (signed by the issuing community's Ed25519 key).
- Matchmaking uses only the **current community's** rating, never imported ratings. When a player first joins a new community, they start at the default rating with placement deviation — regardless of credentials from other communities.

**Visual distinction for foreign credentials:**

- Credentials from the current community show the full-color tier badge.
- Credentials from other communities show a desaturated/outlined badge with the community name in small text. This is immediately visually distinct — no one mistakes a foreign credential for a local one.

**Optional credential weighting for seeding:**

- When a player with foreign credentials enters placement on a new community, the ranking authority MAY use the foreign rating as a seeding hint (weighted at 30% — a "Supreme Commander" from another server starts placement at ~1650 instead of 1500, not at 2400). This is configurable per community operator and disabled by default.

**Phase:** Community-scoped display ships with D052/D053 profile system (Phase 5). Foreign credential seeding is a Phase 5+ enhancement.

## Vulnerability 30: Soft Reset Placement Disruption

### The Problem

At season start, D055's soft reset compresses all ratings toward the default (1500). With `compression_factor: 700` (keep 70%), a 2400-rated player becomes ~2130, and a 1000-rated player becomes ~1150. Both now have placement-level deviation (350), meaning their ratings move fast. During placement, these players are matched based on their compressed ratings — a compressed 2130 can match against a compressed 1500, creating a massive skill mismatch. The first few days of each season become "placement carnage" where experienced players stomp newcomers.

**Real-world precedent:** This is a known problem in every game with seasonal resets. OW2's season starts are notorious for one-sided matches. LoL's placement period sees the highest player frustration.

### Defense

**Hidden matchmaking rating (HMR) during placement:**

- During the placement period (first 10 matches), matchmaking uses the player's **pre-reset rating** as the search center, not the compressed rating. The compressed rating is used for rating updates (the Glicko-2 calculation), but the matchmaking search range is centered on where the player was last season.
- This means a former 2400 player searches for opponents near 2400 during placement (finding other former high-rated players also in placement), while a former 1200 player searches near 1200. Both converge to their true rating quickly without creating cross-skill matches.
- Brand-new players (no prior season) use the default 1500 center — unchanged from current design.

**Minimum match quality threshold:**

- `MatchmakingConfig` gains a new field: `min_match_quality: i64` (default: 200). A match is only created if `|player_a_rating - player_b_rating| < max_range` AND the predicted match quality (from D041's `MatchQuality.fairness`) exceeds a minimum threshold. During placement, the threshold is relaxed by 20% to account for high deviation.
- This prevents the desperation timeout from creating wildly unfair matches. At worst, a player waits the full `desperation_timeout_secs` and gets no match — which is better than a guaranteed stomp.

**Phase:** HMR during placement and min match quality ship with D055's season system (Phase 5).

## Vulnerability 31: Desperation Timeout Exploitation

### The Problem

D055's `desperation_timeout_secs: 300` (5 minutes) means that after 5 minutes in queue, a player is matched with anyone available regardless of rating difference. On low-population servers or during off-peak hours, a smurf can deliberately queue at unusual times, wait 5 minutes, and get matched against much weaker players. Each win earns full rating points because `MatchQuality.information_content` isn't reduced for skill mismatches — only for repeated pairings (V26).

### Defense

**Reduced `information_content` for skill-mismatched games:**

- When matchmaking creates a match with a rating difference exceeding `initial_range * 2` (i.e., the match was created after significant search widening), the `information_content` of the match is scaled down proportionally: `ic_scale = 1.0 - ((rating_diff - initial_range) / max_range).clamp(0.0, 0.7)`. A 500-point mismatch at `initial_range: 100` → `ic_scale ≈ 0.2` → the winner gains ~20% of normal points, the loser loses ~20% of normal points.
- The desperation match still happens (better than no match), but the rating impact is proportional to the match's competitive validity.

**Minimum players for desperation activation:**

- Desperation mode only activates if ≥3 players are in the queue. If only 1-2 players are queued at wildly different ratings, the queue continues searching without matching. This prevents a lone smurf from exploiting empty queues.
- The UI displays "Waiting for more players in your rating range" instead of silently widening.

**Phase:** Information content scaling and minimum desperation population ship with D055's matchmaking (Phase 5).

## Vulnerability 32: Relay SPOF for Ranked Match Certification

### The Problem

Ranked matches require relay-signed `CertifiedMatchResult` (V13). If the relay server crashes or loses connectivity during a mid-game, the match has no certified result. Both players' time is wasted. In tournament scenarios, this can be exploited by targeting the relay with DDoS to prevent an opponent's win from being recorded.

### Defense

**Client-side checkpoint hashes:**

- Both clients exchange periodic state hashes (every 120 ticks, existing desync detection) and the relay records these. If the relay fails, the last confirmed checkpoint hash establishes game state consensus up to that point.
- When the relay recovers (or the game is reassigned to a backup relay), the checkpoint data enables resumption or adjudication.

**Degraded certification fallback:**

- If the relay dies and both clients detect connection loss within the same 10-second window, the game enters "unranked continuation" mode. Players can finish the game for completion (replay is saved locally), and the partial result is submitted to the ranking authority with a `degraded_certification` flag. The ranking authority MAY apply rating changes at reduced `information_content` (50%) based on the last checkpoint state, or MAY void the match entirely (no rating change).
- The choice between partial rating and void is a community operator configuration. Default: void (no rating change on relay failure). Competitive communities may prefer partial to prevent DDoS-as-dodge.

**Relay health monitoring:**

- The ranking authority monitors relay health. If a relay instance has >5% match failure rate within a 1-hour window, new ranked matches are not assigned to it. Ongoing matches continue on the failing relay (migration mid-game is not feasible), but the next matches go elsewhere.
- Multiple relay instances per region (K8s deployment — see `03-NETCODE.md`) provide redundancy. No single relay instance is a single point of failure for the region as a whole.

**Phase:** Degraded certification and relay health monitoring ship with ranked matchmaking (Phase 5).
