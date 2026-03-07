## Vulnerability 11: Speed Hack / Clock Manipulation

### The Problem
A cheating client runs the local simulation faster than real time—either by manipulating the system clock or by feeding artificial timing into the game loop.

### Mitigation: Relay Server Owns the Clock

In `RelayLockstepNetwork`, the relay server is the sole time authority. It advances the game by broadcasting canonical tick boundaries. The client's local clock is irrelevant—a client that "runs faster" just finishes processing sooner and waits for the next server tick. Orders submitted before the tick window opens are discarded.

```rust
impl RelayServer {
    fn tick_loop(&mut self) {
        loop {
            let tick_start = Instant::now();
            let tick_end = tick_start + self.tick_interval;

            // Collect orders only within the valid window
            let orders = self.collect_orders_until(tick_end);

            // Orders with timestamps outside the current tick window are rejected
            for order in &orders {
                if order.timestamp < self.current_tick_start
                    || order.timestamp > tick_end
                {
                    self.flag_suspicious(order.player, "out-of-window order");
                    continue;
                }
            }

            self.broadcast_tick_orders(self.current_tick, &orders);
            self.current_tick += 1;
            self.current_tick_start = tick_end;
        }
    }
}
```



## Vulnerability 12: Automation / Scripting (Botting)

### The Problem
External tools (macros, overlays, input injectors) automate micro-management with superhuman precision: perfect unit splitting, instant reaction to enemy attacks, pixel-perfect targeting at 10,000+ APM. This is indistinguishable from a skilled player at a protocol level — the client sends valid orders at valid times.

### Mitigation: Behavioral Analysis (Relay-Side)

The relay server observes order patterns without needing access to game state:

```rust
pub struct PlayerBehaviorProfile {
    pub orders_per_tick: RingBuffer<u32>,          // rolling APM
    pub reaction_times: RingBuffer<Duration>,       // time from event to order
    pub order_precision: f64,                       // how tightly clustered targeting is
    pub sustained_apm_peak: Duration,               // how long max APM sustained
    pub pattern_entropy: f64,                        // randomness of input timing
}

impl RelayServer {
    fn analyze_behavior(&self, player: PlayerId) -> SuspicionScore {
        let profile = &self.profiles[player];
        let mut score = 0.0;

        // Sustained inhuman APM (>600 for extended periods)
        if profile.sustained_apm_above(600, Duration::from_secs(30)) {
            score += 0.4;
        }

        // Perfectly periodic input (bots often have metronomic timing)
        if profile.pattern_entropy < HUMAN_ENTROPY_FLOOR {
            score += 0.3;
        }

        // Reaction times consistently under human minimum (~150ms)
        if profile.avg_reaction_time() < Duration::from_millis(100) {
            score += 0.3;
        }

        SuspicionScore(score)
    }
}
```

**Key design choices:**
- **Prevention first, then detection.** IC's architecture prevents the most damaging cheats before they reach the detection layer. The fog-authoritative server (V1–V8) makes maphack impossible in relay mode; deterministic order validation (V9) rejects invalid state mutations; transport encryption (V14) prevents eavesdropping. Detection handles what prevention cannot: automation that sends valid orders at superhuman rates. This hierarchy — prevention → detection → deterrence — matches industry consensus from Riot Games, Valve, and i3D (FairFight).
- **Relay-side only.** Analysis happens on the server — cheating clients can't detect or adapt to the analysis.
- **Replay-based post-hoc analysis.** Tournament replays can be analyzed after the fact with more sophisticated models (timing distribution analysis, reaction-to-fog-reveal correlation).
- **Community reporting.** Player reports feed into suspicion scoring — a player flagged by both the system and opponents warrants review.

**What we deliberately DON'T do:**
- No kernel-level anti-cheat (Vanguard, EAC-style). We're an open-source game — intrusive anti-cheat contradicts our values and doesn't work on Linux/WASM anyway.
- No input rate limiting. Capping APM punishes legitimate high-skill players. Detection, not restriction.

#### Dual-Model Detection (from Lichess)

Lichess, the world's largest open-source competitive gaming platform, runs two complementary anti-cheat systems. IC adapts this dual-model approach for RTS (see `research/minetest-lichess-analysis.md`):

1. **Statistical model ("Irwin" pattern):** Analyzes an entire match history statistically — compares a player's decision quality against engine-optimal play. In chess this means comparing moves against Stockfish; in IC, this means comparing orders against an AI advisor's recommended actions via **post-hoc replay analysis**. A player who consistently makes engine-optimal micro decisions (unit splitting, target selection, ability timing) at rates improbable for human performance is flagged. This requires running the replay through an AI evaluator, so it's inherently post-hoc and runs in batch on the ranking server, not real-time.

2. **Pattern-matching model ("Kaladin" pattern):** Identifies cheat signatures from input timing characteristics — the relay-side `PlayerBehaviorProfile` from above. Specific patterns: metronomic input spacing (coefficient of variation < 0.05), reaction times clustering below human physiological limits, order precision that never degrades over a multi-hour session (fatigue-free play). This runs in real-time on the relay. **Cross-engine note:** Kaladin runs identically on foreign client input streams when IC hosts a cross-engine match. Per-engine baseline calibration (`EngineBaselineProfile`) accounts for differing input buffering and jitter characteristics across engines — see `07-CROSS-ENGINE.md` § "IC-Hosted Cross-Engine Relay: Security Architecture".

```rust
/// Combined suspicion assessment — both models must agree
/// before automated action is taken. Reduces false positives.
pub struct DualModelAssessment {
    pub behavioral_score: f64,  // Real-time relay analysis (0.0–1.0)
    pub statistical_score: f64, // Post-hoc replay analysis (0.0–1.0)
    pub combined: f64,          // Weighted combination
    pub action: AntiCheatAction,
}

pub enum AntiCheatAction {
    Clear,             // Both models see no issue
    Monitor,           // One model flags, other doesn't — continue watching
    FlagForReview,     // Both models flag — human review queue
    ShadowRestrict,    // High confidence — restrict from ranked silently
}
```

**Key insight from Lichess:** Neither model alone is sufficient. Statistical analysis catches sophisticated bots that mimic human timing but play at superhuman decision quality. Behavioral analysis catches crude automation that makes human-quality decisions but with inhuman input patterns. Together, false positive rates are dramatically reduced — Lichess processes millions of games with very few false bans.

#### Population-Baseline Statistical Comparison (from FairFight)

The hardcoded thresholds in the relay-side analysis above (`sustained_apm_above(600)`, `avg_reaction_time() < 100ms`, `pattern_entropy < HUMAN_ENTROPY_FLOOR`) are a starting point, not the final design. Fixed thresholds have a fundamental flaw: they don't adapt as the player population evolves with new hardware, game patches, and meta shifts. A legitimate player on a high-polling-rate mouse with mechanical switches may register reaction times that would have been flagged as inhuman five years ago.

IC adapts the **population-average comparison approach** proven by i3D's FairFight (Algorithmic Analysis of Player Statistics — AAPS). Instead of comparing against absolute constants, each metric is compared against rolling population percentiles computed from the ranking server's match database:

```rust
pub struct PopulationBaseline {
    pub apm_p99: f64,                       // 99th percentile APM across rated matches
    pub reaction_time_p1: Duration,          // 1st percentile reaction time (fastest)
    pub entropy_p5: f64,                     // 5th percentile pattern entropy
    pub sustained_peak_p99: Duration,        // 99th percentile sustained APM duration
    pub last_recalculated: Timestamp,        // when this baseline was computed
    pub sample_size: u64,                    // number of matches in the sample
}
```

**How population baselines improve detection:**
- **Outlier detection is relative:** A player performing at p99.9 in a population of 50,000 is a stronger signal than one exceeding a hardcoded number.
- **Baselines auto-adjust:** When the population's mean APM rises due to the game's meta favoring micro-heavy strategies, the thresholds shift naturally.
- **Per-tier baselines:** A Diamond-tier player having APM at Bronze-tier p99 is not suspicious. Baselines are computed per rating tier to avoid penalizing high-skill players.

The fixed thresholds remain as **hard floors** — emergency trip-wires for extreme outliers (e.g., APM > 2000, reaction < 40ms) that no population shift would normalize. Population baselines are the primary detection signal; fixed thresholds are the safety net.

**Recalculation cadence:** Population baselines are recomputed weekly from the most recent rolling window of rated matches (configurable, default 30 days). Recomputation is a batch job on the ranking server, not a real-time operation.

#### Enforcement Timing Strategy (Wave Bans)

IC does not act on every detection event immediately. Drawing from Valve's VAC wave ban strategy (which deliberately delays enforcement to maximize intelligence gathering), IC uses a **batched enforcement cadence** for non-urgent cases:

- **Immediate action:** `AntiCheatAction::ShadowRestrict` (high-confidence automation) and `AntiCheatAction::FlagForReview` (dual-model agreement) are processed in real-time. Immediate action stops the harm.
- **Batched enforcement:** Points accumulated from individual auto-flags (V54) are evaluated against suspension/ban thresholds on a **weekly enforcement cycle** rather than continuously. This serves two purposes:
  1. **Intelligence gathering:** Delayed enforcement prevents cheat developers from correlating detection with specific tool updates. If a cheat is detected on Monday but the ban wave runs on Friday, the developer cannot determine which session triggered detection.
  2. **False-positive buffering:** A player who triggers two auto-flags in one week due to an unusual session has time for point decay (V54) to soften the impact before it crosses a threshold.

**Transparency:** Quarterly anti-cheat transparency reports (V54) publish aggregate enforcement statistics (total flags, bans, appeals, false-positive rate) without disclosing detection internals or enforcement timing details.

#### Smart Analysis Triggers

Not every match warrants post-hoc statistical analysis — running replays through an AI evaluator is computationally expensive. IC adapts Lichess's smart game selection heuristics (see `research/minetest-lichess-analysis.md` § "Smart Game Selection for Anti-Cheat Analysis") to determine which matches to prioritize:

**Always analyze:**
- **Ranked upset:** Winner's rating is 250+ points below the loser's stable rating. Large upsets are the highest-value target for cheat detection.
- **Tournament matches:** All matches in community tournaments (D052) and season-end ladder stages (D055). Stakes justify the compute cost.
- **Titled / top-tier players:** Any match involving a player in the top tier (D055) or holding a community recognition title. High-visibility matches must be trustworthy.
- **Community reports:** Any match flagged by an opponent via the in-game reporting system. Player reports feed into suspicion scoring even when behavioral metrics alone wouldn't trigger analysis.

**Analyze with probability:**
- **New player wins** (< 40 rated games, 75% chance): A new account beating established players is a classic smurf/cheat signal. Analyzing most — but not all — conserves resources while catching the majority of alt accounts.
- **Rapid rating climb** (80+ rating gain in a session, 90% chance): Sudden improvement beyond normal learning curve.
- **Relay behavioral flag** (100% if `behavioral_score > 0.4`): When the real-time relay-side analysis (Kaladin pattern) flags suspicious input timing, always follow up with post-hoc statistical analysis.

**Skip (do not analyze):**
- **Unrated / custom games:** No competitive impact. Players can do whatever they want in casual matches.
- **Games shorter than 2 minutes:** Too little data for meaningful statistical analysis. Quick surrenders and rushes produce noisy results.
- **Games older than 6 months:** Stale data isn't worth the compute. Behavioral patterns may have changed.
- **Games from non-assessable sources:** Friend matches, private lobbies (unless tournament-flagged), AI-only matches.

**Resource budgeting:** The ranking server maintains an analysis queue with configurable throughput. During high-load periods (season resets, tournament days), the "analyze with probability" triggers can have their percentages reduced to maintain queue depth. The "always analyze" triggers are never throttled.

```yaml
# analysis-triggers.yaml (ranking authority configuration)
analysis_triggers:
  always:
    ranked_upset_threshold: 250     # rating difference
    tournament_matches: true
    top_tier_matches: true
    community_reports: true
  probabilistic:
    new_player_win: { max_games: 40, chance: 0.75 }
    rapid_rating_climb: { min_gain: 80, chance: 0.90 }
    relay_behavioral_flag: { min_score: 0.4, chance: 1.0 }
  skip:
    unrated: true
    min_duration_secs: 120
    max_age_months: 6
    non_assessable_sources: [friend, private, ai_only]
  budget:
    max_queue_depth: 1000
    degrade_probabilistic_at: 800   # reduce probabilities when queue exceeds this
```

#### Open-Source Anti-Cheat Reference Projects

IC's behavioral analysis draws from the most successful open-source competitive platforms. This is the consolidated reference list for implementers — each project demonstrates a technique IC adapts.

| Project                           | License                  | Repo                                                                       | What It Teaches IC                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lichess / lila**                | AGPL-3.0                 | [lichess-org/lila](https://github.com/lichess-org/lila)                    | Full anti-cheat pipeline at scale: auto-analysis triggers, `SuspCoefVariation` timing analysis, player flagging workflow, moderator review queue, appeal process, `lame` player segregation in matchmaking. Proves server-side-only detection works for 100M+ games.                                                                                                                                                                                                                                                                                                                                |
| **Lichess / irwin**               | AGPL-3.0                 | [lichess-org/irwin](https://github.com/lichess-org/irwin)                  | Neural network cheat detection ("Irwin" model). Compares player decisions against engine-optimal play. IC adapts this for post-hoc replay analysis — comparing player orders against AI advisor recommendations.                                                                                                                                                                                                                                                                                                                                                                                    |
| **DDNet antibot**                 | Closed plugin / open ABI | [ddnet/ddnet](https://github.com/ddnet/ddnet) — `IEngineAntibot` interface | Swappable server-side behavioral analysis plugin with a stable ABI. IC's relay server should support a similar pluggable analysis architecture — the ABI is public, implementations can be private per community server.                                                                                                                                                                                                                                                                                                                                                                            |
| **Minetest**                      | LGPL-2.1                 | [minetest/minetest](https://github.com/minetest/minetest)                  | Two relevant patterns: (1) **LagPool** time-budget rate limiting — server grants each player a time budget that recharges at a fixed rate, preventing burst automation without hard APM caps. (2) **CSM restriction flags** — server tells client which client-side mod capabilities are allowed, enforced server-side.                                                                                                                                                                                                                                                                             |
| **Mindustry**                     | GPL-3.0                  | [Anuken/Mindustry](https://github.com/Anuken/Mindustry)                    | Open-source game with server-side validation and admin tools. Demonstrates community-governed anti-cheat at moderate scale — server operators choose enforcement policy. Validates the D037 community governance model.                                                                                                                                                                                                                                                                                                                                                                             |
| **0 A.D. / Pyrogenesis**          | GPL-2.0+                 | [0ad/0ad](https://github.com/0ad/0ad)                                      | Out-of-sync (OOS) detection with state hash comparison. IC already uses hash-based desync detection, but 0 A.D.'s approach to per-component hashing for desync attribution is worth studying for V36's trust boundary implementation.                                                                                                                                                                                                                                                                                                                                                               |
| **Spring Engine**                 | GPL-2.0+                 | [spring/spring](https://github.com/spring/spring)                          | Minimal order validation with community-enforced norms. Cautionary example — Spring's lack of server-side behavioral analysis means competitive integrity relies entirely on player reporting and replays. IC's relay-side analysis is the architectural improvement.                                                                                                                                                                                                                                                                                                                               |
| **FAF (Forged Alliance Forever)** | Various                  | [FAForever](https://github.com/FAForever)                                  | Community-managed competitive platform for SupCom. Lobby-visible mod lists, community trust system, replay-based dispute resolution. Demonstrates that **transparency + community governance** scales for competitive RTS without any client-side anti-cheat.                                                                                                                                                                                                                                                                                                                                       |
| **uBlock Origin**                 | GPL-3.0                  | [gorhill/uBlock](https://github.com/gorhill/uBlock)                        | Not a game — but the best-in-class example of real-time **pattern matching at scale with community-maintained rule sets**. Token-dispatch fast-path matching, flat-array struct-of-arrays data layout (validates ECS/D015), BidiTrie compact trie, three-layer cheapest-first evaluation, allow/block/block-important priority realms. uBO uses WASM because browsers can't run native code — IC compiles Rust directly to native machine code (faster than WASM), but the data structures and architectural patterns transfer directly. See `research/ublock-origin-pattern-matching-analysis.md`. |

**Key pattern across all projects:** No successful open-source competitive platform uses client-side anti-cheat. Every one converges on the same architecture: server-side behavioral analysis + replay evidence + community governance + transparent tooling. IC's four-part strategy (D058 § Competitive Integrity) is this consensus, formalized.

#### Industry Anti-Cheat Patterns (Commercial References)

IC's open-source reference projects (above) are the primary design inputs, but several proprietary systems demonstrate patterns worth acknowledging. These are not code references — their architectures are inferred from public documentation, GDC talks, and observable behavior:

- **VACNet / VAC Live (Valve, CS2):** Server-side deep learning that claims to detect new cheat behaviors within hours via continuous retraining. Demonstrates the value of a model retraining pipeline — IC adapts this as the continuous calibration loop (V54). VAC's wave ban strategy (deliberately deferred enforcement) is adapted as IC's enforcement timing cadence (above).
- **FairFight AAPS (i3D):** Algorithmic Analysis of Player Statistics — compares individual player metrics against population averages rather than fixed thresholds. Entirely server-side, non-invasive. IC adapts this as population-baseline statistical comparison (above). FairFight's graduated penalty model (warning → restriction → suspension) validates IC's graduated response (V54).
- **CS2 Trust Factor (Valve):** Multi-signal behavioral score (hours played, account age, report frequency, other games played) that affects matchmaking quality as a continuous value, not a binary restriction. IC adapts this as behavioral matchmaking integration (below).
- **Dota 2 Behavior Score (Valve):** Behavior grades (Normal through F) from abandons, reports, and commends. Scores below 3000 trigger auto-mute; extremely low scores trigger bans without notice. Low Priority matchmaking pool requires winning games to exit (not just playing). IC adapts the continuous-score-as-matchmaking-input pattern and the tiered behavioral consequences.
- **GTA Online Bad Sport (Rockstar):** Separate matchmaking pool for disruptive players with escalating timeout durations (2 → 4 → 8 days) and visible dunce hat. Cautionary example: controversial because the system doesn't distinguish intentional griefing from self-defense actions. IC's behavioral analysis must account for context (see V55's classification heuristic approach).

**What IC does NOT adopt from commercial systems:**
- No kernel-level anti-cheat (Riot Vanguard, Activision RICOCHET kernel driver, EAC). Open-source + cross-platform + Linux/WASM = incompatible with ring-0 drivers.
- No memory encryption or code obfuscation (Riot's `.text` section encryption, anti-debugging checks). IC is open-source — the source code is public. Obfuscation is meaningless.
- No creative in-game punishments (RICOCHET "Damage Shield" reducing cheater damage, "Cloaking" making cheaters invisible). Entertaining but architecturally complex and creates unpredictable game states. IC's relay-side enforcement is at the matchmaking and access-control layer, not the simulation layer.

#### Behavioral Matchmaking Integration (Trust Score)

IC's `AntiCheatAction::ShadowRestrict` is a binary state — a player is either restricted or not. Industry experience from CS2 Trust Factor, Dota 2 Behavior Score, and Lichess's `lame` player segregation converges on a more nuanced approach: a **continuous behavioral trust score** that influences matchmaking quality.

```rust
/// Per-player trust score — influences matchmaking pool quality.
/// Computed by the ranking server, stored in player's SCR (D052).
pub struct TrustScore {
    pub score: u16,                          // 0–12000 (Dota 2 scale is 0–12000)
    pub factors: TrustFactors,
    pub last_updated: Timestamp,
}

pub struct TrustFactors {
    pub account_age_days: u32,               // older accounts → higher trust
    pub rated_games_played: u32,             // more history → more signal
    pub anti_cheat_points: u8,               // from V54 graduated response (inverse)
    pub report_rate: f64,                    // reports received per 100 games
    pub commend_rate: f64,                   // commendations received per 100 games
    pub abandon_rate: f64,                   // abandons per 100 games
    pub season_participation: u8,            // seasons with placement (D055)
}
```

**How trust score affects matchmaking (D055 integration):**
- Matchmaking preferentially groups players with similar trust scores. A high-trust player should encounter other high-trust players.
- Trust score is NOT visible to the player (unlike Dota 2, which shows the number). Opacity prevents gaming the system.
- Trust score cannot override MMR for match quality — it is a secondary signal after skill rating.
- Community server operators (D052) can configure minimum trust score thresholds for their servers via `server_config.toml` (D064).

**Behavioral consequences (graduated, from Dota 2 model):**

| Trust Score Range | Consequence                                                     |
| ----------------- | --------------------------------------------------------------- |
| 10000–12000       | Default — no restrictions                                       |
| 7000–9999         | Normal matchmaking, no restrictions                             |
| 4000–6999         | Slower matchmaking (pool restriction), warning displayed        |
| 2000–3999         | Voice chat disabled; text chat rate-limited; ranked queue delay |
| 0–1999            | Ranked queue disabled; review triggered; ban imminent           |

**Trust score recovery:** Trust score recovers passively through clean play — completing rated games without reports, earning commendations, and not triggering anti-cheat flags. Recovery is slow and intentional: it takes longer to rebuild trust than to lose it (asymmetric by design, matching Dota 2's model).

**Federated trust:** In IC's federated community server model (D052), trust scores are community-scoped. A player's trust score on Community Server A is independent of their score on Community Server B (matching the cross-community reputation design in D052). Each community server — including the official IC community — computes and maintains its own trust scores. No single community's score is privileged or canonical (D052: "not a privileged singleton"). Players who move between communities start from the default score on each; SCR-portable trust factors (D052) allow communities to consider imported evidence, but the final score is always locally computed.

**Default weighting algorithm (F11 closure):** The weighting formula converting `TrustFactors` to `TrustScore.score` must be specified to prevent divergent community server implementations from undermining trust score's purpose. The default algorithm:

```rust
fn compute_trust_score(f: &TrustFactors) -> u16 {
    // Each factor contributes a weighted component (0.0–1.0 normalized)
    let age = (f.account_age_days.min(365) as f64 / 365.0) * 1500.0;
    let games = (f.rated_games_played.saturating_sub(20).min(500) as f64 / 500.0) * 3000.0;
    let seasons = (f.season_participation.min(8) as f64 / 8.0) * 1000.0;
    let commends = (f.commend_rate.clamp(0.0, 0.5) / 0.5) * 1500.0;
    let reports = -(f.report_rate.clamp(0.0, 0.3) / 0.3) * 2000.0;
    let abandons = -(f.abandon_rate.clamp(0.0, 0.1) / 0.1) * 2000.0;
    
    // Anti-cheat points are the dominant negative factor —
    // no positive factor can override active anti-cheat flags
    let anti_cheat = -(f.anti_cheat_points as f64 / 25.0) * 6000.0;
    
    let raw = 6000.0 + age + games + seasons + commends + reports + abandons + anti_cheat;
    raw.clamp(0.0, 12000.0) as u16
}
```

Key design choices:
- `account_age_days` saturates at 365 days — sitting idle longer doesn't help
- `rated_games_played` has a dead zone: the first 20 games contribute nothing (prevents idle account trust inflation)
- `anti_cheat_points` can drive the score to zero alone — no combination of positive factors overrides an active anti-cheat flag (5+ points = maximum penalty regardless of age/games/commends)
- All factors apply NaN guards (F1 pipeline-wide NaN protection) before weighting
- Community servers may adjust weights via `server_config.toml` (D064) but the default algorithm above is the reference implementation shipped with `ic-server`

**Phase:** Trust score system ships with ranked matchmaking (Phase 5). Trust score factors are computed from the same match database as population baselines. Integration with D055's matchmaking queue is a Phase 5 exit criterion.

## Vulnerability 13: Match Result Fraud

### The Problem
In competitive/ranked play, match results determine ratings. A dishonest client could claim a false result, or colluding players could submit fake results to manipulate rankings.

### Mitigation: Relay-Certified Match Results

```rust
pub struct CertifiedMatchResult {
    pub match_id: MatchId,
    pub players: Vec<PlayerId>,
    pub result: MatchOutcome,
    pub final_tick: u64,
    pub duration: Duration,
    pub final_state_hash: StateHash,   // Full SHA-256 of terminal tick (matches final TickSignature)
    pub order_stream_hash: [u8; 32],  // SHA-256 of deterministic order stream (for certification)
    pub replay_hash: [u8; 32],        // SHA-256 of relay's replay file (for per-file integrity)
    pub server_signature: Ed25519Signature,
}

impl RankingService {
    fn submit_result(&mut self, result: &CertifiedMatchResult) -> Result<()> {
        // Only accept results signed by a trusted relay server
        if !self.verify_relay_signature(result) {
            return Err(UntrustedSource);
        }
        // order_stream_hash is the relay's hash of the full pre-filtering order
        // stream — clients cannot recompute it (they see filtered chat subsets),
        // but the relay's Ed25519 signature guarantees its integrity.
        self.update_ratings(result);
        Ok(())
    }
}
```

**Key:** Only relay-server-signed results update rankings.

**Order-stream certification hash (F9 closure):** `replay_hash` alone would be unsuitable as a certification primitive because `BackgroundReplayWriter` can lose frames during I/O spikes (V45), meaning two clients recording the same match may produce different replay files. The struct therefore separates `order_stream_hash` (SHA-256 of the relay's canonical, pre-filtering order stream — orders + ticks for all channels) from `replay_hash` (SHA-256 of the relay's specific replay file, for per-file integrity). Match certification uses `order_stream_hash`; replay file verification uses `replay_hash`.

**What the order stream covers:** The `order_stream_hash` is computed by the relay over the full *pre-filtering* order stream — including all `ChatMessage` orders for all channels. Per-recipient chat filtering (D059) happens *after* hashing. Clients cannot independently recompute this hash because they only see their filtered chat subset (relay-architecture.md § Per-recipient TickOrders). Instead, integrity is guaranteed by the relay's Ed25519 signature on `CertifiedMatchResult` — clients verify the signature, not the hash. The ranking service trusts the hash because it trusts the relay's signing key.
