# Server Administration Guide

> **Audience:** Server operators, tournament organizers, competitive league administrators, and content creators / casters.
>
> **Prerequisites:** Familiarity with TOML (for server configuration — if you know INI files, you know TOML), command-line tools, and basic server administration. For design rationale behind the configuration system, see D064 in `decisions/09a-foundation.md` and D067 for the TOML/YAML format split.
>
> **Status:** This guide describes the *planned* configuration system. Iron Curtain is in the design phase — no implementation exists yet. All examples show intended behavior.

---

## Who This Guide Is For

Iron Curtain's configuration system serves four professional roles. Each role has different needs, and this guide is structured so you can skip to the sections relevant to yours.

| Role                         | Typical Tasks                                                                                           | Key Sections                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Tournament organizer**     | Set up bracket matches, control pauses, configure spectator feeds, disable surrender votes              | Quick Start, Match Lifecycle, Spectator, Vote Framework, Tournament Operations    |
| **Community server admin**   | Run a persistent relay for a clan or region, manage connections, tune anti-cheat, monitor server health | Quick Start, Relay Server, Anti-Cheat, Telemetry & Monitoring, Security Hardening |
| **Competitive league admin** | Configure rating parameters, define seasons, tune matchmaking for population size                       | Ranking & Seasons, Matchmaking, Deployment Profiles                               |
| **Content creator / caster** | Set spectator delay, configure VoIP, maximize observer count                                            | Spectator, Communication, Training & Practice                                     |

Regular players do not need this guide. Player-facing settings (game speed, graphics, audio, keybinds) are configured through the in-game settings menu and `settings.toml` — see `02-ARCHITECTURE.md` for those.

---

## Quick Start

### Running a Relay Server with Defaults

Every parameter has a sane default. A bare relay server works without any configuration file:

```bash
./relay-server
```

This starts a relay on the default port with:
- Up to 1,000 simultaneous connections
- Up to 100 concurrent games
- 16 players per game maximum
- All default match rules, ranking, and anti-cheat settings

### Creating Your First Configuration

To customize, create a `server_config.toml` in the server's working directory:

```toml
# server_config.toml — only override what you need to change
[relay]
max_connections = 200
max_games = 50
```

Any parameter you omit uses its compiled default. You never need to specify the full schema — only your overrides.

Start the server with a specific config file:

```bash
./relay-server --config /path/to/server_config.toml
```

### Validating a Configuration

Before deploying a new config, validate it without starting the server:

```bash
ic server validate-config /path/to/server_config.toml
```

This checks for:
- TOML syntax errors
- Unknown keys (with suggestions for typos)
- Out-of-range values (reports which values will be clamped)
- Cross-parameter inconsistencies (e.g., `matchmaking.initial_range` > `matchmaking.max_range`)

---

## Configuration System

### Three-Layer Architecture

Configuration uses three layers with clear precedence:

```
Priority (highest → lowest):
┌────────────────────────────────────────┐
│ Layer 3: Runtime Cvars                 │  /set relay.tick_deadline_ms 100
│ Live changes via console commands.     │  Persist until restart only.
├────────────────────────────────────────┤
│ Layer 2: Environment Variables         │  IC_RELAY_TICK_DEADLINE_MS=100
│ Override config file per-value.        │  Docker-friendly.
├────────────────────────────────────────┤
│ Layer 1: server_config.toml            │  [relay]
│ Single file, all subsystems.           │  tick_deadline_ms = 100
├────────────────────────────────────────┤
│ Layer 0: Compiled Defaults             │  (built into the binary)
└────────────────────────────────────────┘
```

**Rule:** Each layer overrides the one below it. A runtime cvar always wins. An environment variable overrides the TOML file. The TOML file overrides compiled defaults.

### Environment Variable Naming

Every cvar maps to an environment variable by:
1. Uppercasing the cvar name
2. Replacing dots (`.`) with underscores (`_`)
3. Prefixing with `IC_`

| Cvar                         | Environment Variable            |
| ---------------------------- | ------------------------------- |
| `relay.tick_deadline_ms`     | `IC_RELAY_TICK_DEADLINE_MS`     |
| `match.pause.max_per_player` | `IC_MATCH_PAUSE_MAX_PER_PLAYER` |
| `rank.system_tau`            | `IC_RANK_SYSTEM_TAU`            |
| `spectator.delay_ticks`      | `IC_SPECTATOR_DELAY_TICKS`      |

### Runtime Cvars

Server operators with Host or Admin permission can change parameters live:

```
/set relay.max_games 50
/get relay.max_games
/list relay.*
```

Runtime changes persist until the server restarts — they are not written back to the TOML file. This is intentional: runtime adjustments are for in-the-moment tuning, not permanent policy changes.

### Hot Reload

Reload `server_config.toml` without restarting:

- **Unix:** Send `SIGHUP` to the relay process
- **Any platform:** Use the `/reload_config` admin console command

**Hot-reloadable parameters** (changes take effect for new matches, not in-progress ones):
- All match lifecycle parameters (`match.*`)
- All vote parameters (`vote.*`)
- All spectator parameters (`spectator.*`)
- All communication parameters (`chat.*`)
- Anti-cheat thresholds (`anticheat.*`)
- Telemetry settings (`telemetry.*`)

**Restart-required parameters** (require stopping and restarting the server):
- Relay connection limits (`relay.max_connections`, `relay.max_connections_per_ip`)
- Database PRAGMA tuning (`db.*`)
- Workshop P2P transport settings (`workshop.p2p.*`)

### Validation Behavior

The configuration system enforces correctness at every layer:

| Check               | Behavior                                                           | Example                                                                                    |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **Range clamping**  | Out-of-range values are clamped; a warning is logged               | `relay.tick_deadline_ms: 10` → clamped to 50, logs `WARN`                                  |
| **Type safety**     | Wrong types (string where int expected) produce a startup error    | `relay.max_games: "fifty"` → error, server won't start                                     |
| **Unknown keys**    | Typos produce a warning with the closest valid key (edit distance) | `rleay.max_games` → `WARN: unknown key 'rleay.max_games', did you mean 'relay.max_games'?` |
| **Cross-parameter** | Inconsistent pairs are automatically corrected                     | `rank.rd_floor: 400, rank.rd_ceiling: 350` → floor set to 300 (ceiling - 50)               |

#### Cross-Parameter Consistency Rules

These relationships are enforced automatically:

- `catchup_sim_budget_pct + catchup_render_budget_pct` = 100. If not, render budget adjusts to `100 - sim_budget`.
- `rank.rd_floor` < `rank.rd_ceiling`. If violated, floor is set to `ceiling - 50`.
- `matchmaking.initial_range` ≤ `matchmaking.max_range`. If violated, initial is set to max.
- `match.penalty.abandon_cooldown_1st_secs` ≤ `2nd` ≤ `3rd`. If violated, higher tiers are raised to match lower.
- `anticheat.degrade_at_depth` ≤ `anticheat.queue_depth`. If violated, degrade is set to `queue_depth × 0.8`.

---

## Subsystem Reference

Each subsystem section below explains: what the parameters control, when you would change them, and recommended values for common scenarios. For the complete parameter registry with types and ranges, see D064 in `decisions/09f-tools.md`.

### Relay Server (`relay.*`)

The relay server accepts player connections, orders and forwards game data between players, and enforces protocol-level rules. These parameters control the relay's resource limits and timing behavior.

#### Connection Management

| Parameter                        | Default | What It Controls                                     |
| -------------------------------- | ------- | ---------------------------------------------------- |
| `relay.max_connections`          | 1000    | Total simultaneous TCP connections the relay accepts |
| `relay.max_connections_per_ip`   | 5       | Connections from a single IP address                 |
| `relay.connect_rate_per_sec`     | 10      | New connections accepted per second (rate limit)     |
| `relay.idle_timeout_unauth_secs` | 60      | Seconds before kicking an unauthenticated connection |
| `relay.idle_timeout_auth_secs`   | 300     | Seconds before kicking an idle authenticated player  |
| `relay.max_games`                | 100     | Maximum concurrent game sessions                     |

**When to change these:**

- **LAN tournament:** Raise `max_connections_per_ip` to 10–20 (many players behind one NAT). Lower `max_games` to match your bracket size.
- **Small community server:** Lower `max_connections` to 200 and `max_games` to 50 to match your hardware.
- **Large public server:** Raise `max_connections` toward 5000–10000 and `max_games` toward 1000, but ensure your hardware can sustain it (see Capacity Planning).
- **Under DDoS / connection spam:** Lower `connect_rate_per_sec` to 3–5 and `idle_timeout_unauth_secs` to 15–30.

#### Timing & Reconnection

| Parameter                        | Default | What It Controls                                                                    |
| -------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `relay.tick_deadline_ms`         | 120     | Maximum milliseconds the relay waits for a player's orders before marking them late |
| `relay.reconnect_timeout_secs`   | 60      | Window for a disconnected player to rejoin a game in progress                       |
| `relay.timing_feedback_interval` | 30      | Ticks between timing feedback messages sent to clients                              |

**When to change these:**

- **Competitive league (low latency):** Lower `tick_deadline_ms` to 100 for tighter timing. Only do this if your player base has reliably good connections.
- **Casual / high-latency regions:** Raise `tick_deadline_ms` to 150–200 to tolerate higher ping.
- **Training / debugging:** Raise `tick_deadline_ms` to 500 and `reconnect_timeout_secs` to 300 for generous timeouts.

**Recommendation:** Leave `tick_deadline_ms` at 120 unless you have specific latency data for your player base. The adaptive run-ahead system handles most cases automatically.

#### Catchup (Reconnection Behavior)

| Parameter                           | Default | What It Controls                                             |
| ----------------------------------- | ------- | ------------------------------------------------------------ |
| `relay.catchup.sim_budget_pct`      | 80      | % of frame budget for simulation during reconnection catchup |
| `relay.catchup.render_budget_pct`   | 20      | % of frame budget for rendering during reconnection catchup  |
| `relay.catchup.max_ticks_per_frame` | 30      | Maximum sim ticks processed per render frame during catchup  |

**When to change these:** These control how aggressively a reconnecting client catches up to the live game state. Higher `max_ticks_per_frame` means faster catchup but more stutter during reconnection. The defaults work well for most deployments. Only increase `max_ticks_per_frame` (to 60–120) if you need sub-10-second reconnections and your players have powerful hardware.

---

### Match Lifecycle (`match.*`)

These parameters control the lifecycle of individual games, from lobby acceptance through post-game.

| Parameter                     | Default | What It Controls                                                                    |
| ----------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `match.accept_timeout_secs`   | 30      | Time for players to accept a matchmade game                                         |
| `match.loading_timeout_secs`  | 120     | Maximum map loading time before a player is dropped                                 |
| `match.countdown_secs`        | 3       | Pre-game countdown (after everyone loads)                                           |
| `match.postgame_active_secs`  | 30      | Post-game lobby active period (chat, stats visible)                                 |
| `match.postgame_timeout_secs` | 300     | Auto-close the post-game lobby after this many seconds                              |
| `match.grace_period_secs`     | 120     | Grace period — abandoning during this window doesn't penalize as harshly            |
| `match.grace_completion_pct`  | 5       | Maximum game completion % for grace void (abandoned games during grace don't count) |

**When to change these:**

- **Tournament:** Raise `countdown_secs` to 5–10 for dramatic effect. Lower `loading_timeout_secs` only if you've verified all participants have fast hardware.
- **Casual community:** Lower `postgame_timeout_secs` to 120 — players want to re-queue quickly.
- **Mod development:** Raise `loading_timeout_secs` to 600 for large total conversion mods.

#### Pause Configuration (`match.pause.*`)

| Parameter                        | Default (ranked) | Default (casual) | What It Controls                                    |
| -------------------------------- | ---------------- | ---------------- | --------------------------------------------------- |
| `match.pause.max_per_player`     | 2                | -1 (unlimited)   | Pauses allowed per player per game (-1 = unlimited) |
| `match.pause.max_duration_secs`  | 120              | 300              | Maximum single pause duration before auto-unpause   |
| `match.pause.unpause_grace_secs` | 30               | 30               | Warning countdown before auto-unpause               |
| `match.pause.min_game_time_secs` | 30               | 0                | Minimum game time before pausing is allowed         |
| `match.pause.spectator_visible`  | true             | true             | Whether spectators see the pause screen             |

**Recommendations per deployment:**

| Deployment          | `max_per_player` | `max_duration_secs` | Rationale                              |
| ------------------- | ---------------- | ------------------- | -------------------------------------- |
| Tournament LAN      | 5                | 300                 | Admin-mediated; allow equipment issues |
| Competitive league  | 1                | 60                  | Strict; minimize stalling              |
| Casual community    | -1               | 600                 | Fun-first; let friends pause freely    |
| Training / practice | -1               | 3600                | 1-hour pauses for debugging            |

#### Disconnect Penalties (`match.penalty.*`)

| Parameter                                   | Default      | What It Controls                                   |
| ------------------------------------------- | ------------ | -------------------------------------------------- |
| `match.penalty.abandon_cooldown_1st_secs`   | 300          | First abandon: 5-minute queue cooldown             |
| `match.penalty.abandon_cooldown_2nd_secs`   | 1800         | Second abandon (within 24 hrs): 30-minute cooldown |
| `match.penalty.abandon_cooldown_3rd_secs`   | 7200         | Third+ abandon: 2-hour cooldown                    |
| `match.penalty.habitual_abandon_count`      | 3            | Abandons in 7 days to trigger habitual penalty     |
| `match.penalty.habitual_cooldown_secs`      | 86400        | Habitual abandon cooldown (24 hours)               |
| `match.penalty.decline_cooldown_escalation` | "60,300,900" | Escalating cooldowns for declining match accepts   |

**When to change these:**

- **Tournament:** Set `abandon_cooldown_1st_secs` to 0 — admin handles penalties manually.
- **Casual:** Lower all penalties (e.g., 60/300/600) to keep the mood light.
- **Competitive league:** Keep defaults or increase for stricter enforcement.

---

### Spectator Configuration (`spectator.*`)

| Parameter                        | Default (casual) | Default (ranked) | What It Controls                               |
| -------------------------------- | ---------------- | ---------------- | ---------------------------------------------- |
| `spectator.allow_live`           | true             | true             | Whether live spectating is enabled at all      |
| `spectator.delay_ticks`          | 90 (3s)          | 3600 (2min)      | Feed delay in ticks (at 30 tps)                |
| `spectator.max_per_match`        | 50               | 50               | Maximum spectators per match                   |
| `spectator.full_visibility`      | true             | false            | Whether spectators see both teams              |
| `spectator.allow_player_disable` | true             | false            | Whether players can opt out of being spectated |

**Common delay values** (at 30 ticks per second):

| Ticks | Real Time  | Use Case                                   |
| ----- | ---------- | ------------------------------------------ |
| 0     | No delay   | LAN tournaments (no stream sniping risk)   |
| 90    | 3 seconds  | Casual viewing                             |
| 3600  | 2 minutes  | Ranked default (anti-stream-sniping)       |
| 9000  | 5 minutes  | Competitive league (stricter anti-sniping) |
| 18000 | 10 minutes | Maximum supported delay                    |

**For casters / content creators:**
- Set `full_visibility: true` so casters can see entire battlefield
- Set `max_per_match: 200` or higher for large audiences
- Delay depends on whether stream sniping is a concern in your context

---

### Vote Framework (`vote.*`)

The vote system allows players to initiate and resolve team votes during matches.

#### Global Settings

| Parameter                      | Default | What It Controls                             |
| ------------------------------ | ------- | -------------------------------------------- |
| `vote.max_concurrent_per_team` | 1       | Active votes allowed simultaneously per team |

#### Per-Vote-Type Parameters

Each vote type (surrender, kick, remake, draw) follows the same parameter schema:

| Parameter Pattern                | Surrender | Kick | Remake | Draw |
| -------------------------------- | --------- | ---- | ------ | ---- |
| `vote.<type>.enabled`            | true      | true | true   | true |
| `vote.<type>.duration_secs`      | 30        | 30   | 45     | 60   |
| `vote.<type>.cooldown_secs`      | 180       | 300  | 0      | 300  |
| `vote.<type>.min_game_time_secs` | 300       | 120  | 0      | 600  |
| `vote.<type>.max_per_player`     | -1        | 2    | 1      | 2    |

**Kick-specific protections:**

| Parameter                             | Default | What It Controls                                          |
| ------------------------------------- | ------- | --------------------------------------------------------- |
| `vote.kick.army_value_protection_pct` | 40      | Can't kick a player controlling >40% of team's army value |
| `vote.kick.premade_consolidation`     | true    | Premade group members' kicks count as a single vote       |
| `vote.kick.protect_last_player`       | true    | Can't kick the last remaining teammate                    |

**Remake-specific:**

| Parameter                        | Default | What It Controls                                 |
| -------------------------------- | ------- | ------------------------------------------------ |
| `vote.remake.max_game_time_secs` | 300     | Latest point (5 min) a remake vote can be called |

**Recommendations:**

- **Tournament:** Disable surrender and remake entirely (`vote.surrender.enabled: false`, `vote.remake.enabled: false`). The tournament admin decides match outcomes.
- **Casual community:** Consider disabling kick (`vote.kick.enabled: false`) in small communities — handle disputes personally.
- **Competitive league:** Keep defaults. Consider lowering `vote.surrender.min_game_time_secs` to 180 for faster concession.

---

### Protocol Limits (`protocol.*`)

These parameters define hard limits on what players can send through the relay. They are the first line of defense against abuse.

| Parameter                            | Default | What It Controls                           |
| ------------------------------------ | ------- | ------------------------------------------ |
| `protocol.max_order_size`            | 4096    | Maximum single order size (bytes)          |
| `protocol.max_orders_per_tick`       | 256     | Hard ceiling on orders per tick per player |
| `protocol.max_chat_length`           | 512     | Maximum chat message characters            |
| `protocol.max_file_transfer_size`    | 65536   | Maximum file transfer size (bytes)         |
| `protocol.max_pending_per_peer`      | 262144  | Maximum buffered data per peer (bytes)     |
| `protocol.max_voice_packets_per_sec` | 50      | VoIP packet rate limit                     |
| `protocol.max_voice_packet_size`     | 256     | VoIP packet size limit (bytes)             |
| `protocol.max_pings_per_interval`    | 3       | Contextual pings per 5-second window       |
| `protocol.max_minimap_draw_points`   | 32      | Points per minimap drawing                 |
| `protocol.max_markers_per_player`    | 10      | Tactical markers per player                |
| `protocol.max_markers_per_team`      | 30      | Tactical markers per team                  |

> **Warning:** Raising protocol limits above defaults increases the abuse surface. The defaults are tuned for competitive play. Only increase them if you have a specific need and understand the anti-cheat implications.

**When to change these:**

- **Large team games (8v8):** You may want to raise `max_markers_per_team` to 50–60 for more tactical coordination.
- **VoIP quality:** Raising `max_voice_packets_per_sec` beyond 50 is unlikely to improve quality — the Opus codec is efficient. Consider raising `chat.voip_bitrate_kbps` instead.
- **Mod development:** Mods that use very large orders might need `max_order_size` raised to 8192 or 16384.

---

### Communication (`chat.*`)

| Parameter                        | Default | What It Controls                      |
| -------------------------------- | ------- | ------------------------------------- |
| `chat.rate_limit_messages`       | 5       | Messages allowed per rate window      |
| `chat.rate_limit_window_secs`    | 3       | Rate limit window duration            |
| `chat.voip_bitrate_kbps`         | 32      | Opus VoIP encoding bitrate per player |
| `chat.voip_enabled`              | true    | Enable relay-forwarded VoIP           |
| `chat.tactical_poll_expiry_secs` | 15      | Tactical poll voting window           |

**VoIP bitrate guidance:**

| Bitrate  | Quality        | Bandwidth per Player | Recommended For                       |
| -------- | -------------- | -------------------- | ------------------------------------- |
| 16 kbps  | Acceptable     | ~2 KB/s              | Low-bandwidth environments            |
| 32 kbps  | Good (default) | ~4 KB/s              | Most deployments                      |
| 64 kbps  | Excellent      | ~8 KB/s              | Tournament casting (clear commentary) |
| 128 kbps | Studio         | ~16 KB/s             | Rarely needed; diminishing returns    |

**When to change these:**

- **Tournament with casters:** Raise `voip_bitrate_kbps` to 64 for clearer casting audio.
- **Persistent chat trolling:** Lower `rate_limit_messages` to 3 and raise `rate_limit_window_secs` to 5.
- **Disable VoIP entirely:** Set `chat.voip_enabled: false` if your community uses a separate voice platform (Discord, TeamSpeak).

---

### Anti-Cheat / Behavioral Analysis (`anticheat.*`)

These parameters tune the automated anti-cheat system. The system analyzes match outcomes and in-game behavioral patterns to flag suspicious activity for review.

| Parameter                          | Default | What It Controls                                                                  |
| ---------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `anticheat.ranked_upset_threshold` | 250     | Rating difference that triggers automatic review when the lower-rated player wins |
| `anticheat.new_player_max_games`   | 40      | Games below which new-player heuristics apply                                     |
| `anticheat.new_player_win_chance`  | 0.75    | Win probability that triggers review for new accounts                             |
| `anticheat.rapid_climb_min_gain`   | 80      | Rating gain that triggers rapid-climb review                                      |
| `anticheat.rapid_climb_chance`     | 0.90    | Trigger probability for rapid rating climb                                        |
| `anticheat.behavioral_flag_score`  | 0.4     | Relay behavioral score that triggers review                                       |
| `anticheat.min_duration_secs`      | 120     | Minimum match duration for analysis                                               |
| `anticheat.max_age_months`         | 6       | Oldest match data considered                                                      |
| `anticheat.queue_depth`            | 1000    | Maximum analysis queue depth                                                      |
| `anticheat.degrade_at_depth`       | 800     | Queue depth at which probabilistic triggers degrade                               |

**Tuning philosophy:**

- **Lower thresholds = more sensitive = more false positives.** Appropriate for high-stakes competitive environments.
- **Higher thresholds = less sensitive = fewer false positives.** Appropriate for casual communities where false positives are more disruptive than cheating.

**Recommendations:**

| Deployment         | `ranked_upset_threshold` | `behavioral_flag_score` | Rationale                          |
| ------------------ | ------------------------ | ----------------------- | ---------------------------------- |
| Tournament         | 50                       | 0.3                     | Review every notable upset; strict |
| Competitive league | 150                      | 0.35                    | Moderately strict                  |
| Casual community   | 400                      | 0.6                     | Relaxed; trust the community       |

---

### Ranking & Glicko-2 (`rank.*`)

Iron Curtain uses the Glicko-2 rating system. These parameters let league administrators tune it for their community's size and activity level.

| Parameter                      | Default | What It Controls                                                           |
| ------------------------------ | ------- | -------------------------------------------------------------------------- |
| `rank.default_rating`          | 1500    | Starting rating for new players                                            |
| `rank.default_deviation`       | 350     | Starting rating deviation (uncertainty)                                    |
| `rank.system_tau`              | 0.5     | Volatility sensitivity — how quickly ratings respond to unexpected results |
| `rank.rd_floor`                | 45      | Minimum deviation (maximum confidence)                                     |
| `rank.rd_ceiling`              | 350     | Maximum deviation (maximum uncertainty)                                    |
| `rank.inactivity_c`            | 34.6    | How fast deviation grows during inactivity                                 |
| `rank.match_min_ticks`         | 3600    | Minimum ticks (2 min) for any rating weight                                |
| `rank.match_full_weight_ticks` | 18000   | Ticks (10 min) at which the match gets full rating weight                  |
| `rank.match_short_game_factor` | 300     | Short-game duration weighting factor                                       |

**Understanding `system_tau`:**

- **Lower tau (0.2–0.4):** Ratings change slowly. Good for stable, large communities where the skill distribution is well-established.
- **Default (0.5):** Balanced. Works well for most deployments.
- **Higher tau (0.6–1.0):** Ratings change quickly. Good for new communities where players are still finding their level, or for communities with high player turnover.

**Match duration weighting:** Short games (e.g., an early GG at 3 minutes) contribute less to rating changes than full-length matches. `match_min_ticks` is the minimum game length for any rating influence. Below that, the match does not affect ratings at all. `match_full_weight_ticks` is the length at which the match counts fully.

**Recommendation for small communities (< 200 active players):** Raise `system_tau` to 0.7 and lower `rank.rd_floor` to 60. This lets ratings converge faster and better reflects the smaller, more volatile skill pool.

#### Season Configuration (`rank.season.*`)

| Parameter                               | Default | What It Controls                                                           |
| --------------------------------------- | ------- | -------------------------------------------------------------------------- |
| `rank.season.duration_days`             | 91      | Season length (default: ~3 months)                                         |
| `rank.season.placement_matches`         | 10      | Matches required for rank placement                                        |
| `rank.season.soft_reset_factor`         | 0.7     | Compression toward mean at season reset (0.0 = hard reset, 1.0 = no reset) |
| `rank.season.placement_deviation`       | 350     | Deviation assigned during placement                                        |
| `rank.season.leaderboard_min_matches`   | 5       | Minimum matches for leaderboard eligibility                                |
| `rank.season.leaderboard_min_opponents` | 5       | Minimum distinct opponents for leaderboard                                 |

**Season length guidance:**

| Community Size  | Recommended Duration | Placement Matches | Rationale                                                    |
| --------------- | -------------------- | ----------------- | ------------------------------------------------------------ |
| < 100 active    | 180 days             | 5                 | Small pool needs more time to generate enough games          |
| 100–500 active  | 91 days (default)    | 10                | Standard 3-month seasons                                     |
| 500–2000 active | 60 days              | 15                | More frequent resets keep things fresh                       |
| 2000+ active    | 60 days              | 15–20             | Larger population supports shorter, more competitive seasons |

**Soft reset factor:** At season end, each player's rating is compressed toward the global mean. A factor of 0.7 means: `new_rating = mean + 0.7 × (old_rating - mean)`. A factor of 0.0 resets everyone to the default rating. A factor of 1.0 carries ratings forward unchanged.

---

### Matchmaking (`matchmaking.*`)

| Parameter                              | Default | What It Controls                             |
| -------------------------------------- | ------- | -------------------------------------------- |
| `matchmaking.initial_range`            | 100     | Starting rating search window (± this value) |
| `matchmaking.widen_step`               | 50      | Rating range expansion per interval          |
| `matchmaking.widen_interval_secs`      | 30      | Time between range expansions                |
| `matchmaking.max_range`                | 500     | Maximum rating search range                  |
| `matchmaking.desperation_timeout_secs` | 300     | Time before accepting any available match    |
| `matchmaking.min_match_quality`        | 0.3     | Minimum match quality score (0.0–1.0)        |

**How matchmaking expands:**

```
Time = 0s:   Search ±100 of player's rating
Time = 30s:  Search ±150
Time = 60s:  Search ±200
Time = 90s:  Search ±250
...
Time = 240s: Search ±500 (max_range reached)
Time = 300s: Accept any match (desperation)
```

**Small community tuning:** The most common issue is long queue times due to low population. Address this by:

```toml
[matchmaking]
initial_range = 200           # Wider initial search
widen_step = 100              # Expand faster
widen_interval_secs = 15      # Expand more often
max_range = 1000              # Search much wider
desperation_timeout_secs = 120   # Accept any match after 2 min
min_match_quality = 0.1       # Accept lower quality matches
```

**Competitive league tuning:** Prioritize match quality over queue time:

```toml
[matchmaking]
initial_range = 75
widen_step = 25
widen_interval_secs = 45
max_range = 300
desperation_timeout_secs = 600   # Wait up to 10 min
min_match_quality = 0.5          # Require higher quality
```

---

### AI Engine Tuning (`ai.*`)

The AI personality system (aggression, expansion, build orders) is configured through YAML files in the game module, not through `server_config.toml`. D064 exposes only the engine-level AI performance budget and evaluation frequencies, which sit below the behavioral layer.

| Parameter                     | Default | What It Controls                                       |
| ----------------------------- | ------- | ------------------------------------------------------ |
| `ai.tick_budget_us`           | 500     | Microseconds of CPU time the AI is allowed per tick    |
| `ai.lanchester_exponent`      | 0.7     | Army power scaling exponent for AI strength assessment |
| `ai.strategic_eval_interval`  | 60      | Ticks between full strategic reassessments             |
| `ai.attack_eval_interval`     | 30      | Ticks between attack planning cycles                   |
| `ai.production_eval_interval` | 8       | Ticks between production priority evaluation           |

**When to change these:**

- **AI training / analysis server:** Raise `tick_budget_us` to 5000 and lower all eval intervals for maximum AI quality. This trades server CPU for smarter AI.
- **Large-scale server with many AI games:** Lower `tick_budget_us` to 200–300 to reduce CPU usage when many AI games run simultaneously.
- **Tournament with AI opponents:** Default values are fine; AI personality presets (from YAML) are the primary tuning lever for difficulty.

Custom difficulty tiers are added by placing YAML files in the server's `ai/difficulties/` directory. The engine discovers and loads them alongside built-in tiers. See `04-MODDING.md` and D043 for the AI personality YAML schema.

---

### Telemetry & Monitoring (`telemetry.*`)

| Parameter                  | Default (client) | Default (server) | What It Controls                            |
| -------------------------- | ---------------- | ---------------- | ------------------------------------------- |
| `telemetry.max_db_size_mb` | 100              | 500              | Maximum telemetry.db size before pruning    |
| `telemetry.retention_days` | -1 (no limit)    | 30               | Time-based retention (-1 = size-based only) |
| `telemetry.otel_export`    | false            | false            | Enable OpenTelemetry export                 |
| `telemetry.otel_endpoint`  | ""               | ""               | OTEL collector endpoint URL                 |
| `telemetry.sampling_rate`  | 1.0              | 1.0              | Event sampling rate (1.0 = 100%)            |

**Enabling Grafana dashboards:**

Iron Curtain supports optional OTEL (OpenTelemetry) export for professional monitoring. To enable:

```toml
[telemetry]
otel_export = true
otel_endpoint = "http://otel-collector:4317"
sampling_rate = 1.0
```

This sends metrics and traces to an OTEL collector, which can forward to Prometheus (metrics), Jaeger (traces), and Loki (logs) for visualization in Grafana.

**For high-traffic servers:** Lower `sampling_rate` to 0.1–0.5 to reduce telemetry volume. This samples only a percentage of events while maintaining statistical accuracy.

**For long-running analysis servers:**

```toml
[telemetry]
max_db_size_mb = 5000      # 5 GB
retention_days = -1        # Size-based pruning only
```

---

### Database Tuning (`db.*`)

SQLite PRAGMA values tuned per database. Most operators never need to touch these — they exist for large-scale deployments and edge cases.

| Parameter                         | Default | What It Controls                     |
| --------------------------------- | ------- | ------------------------------------ |
| `db.gameplay.cache_size_kb`       | 16384   | Gameplay database page cache (16 MB) |
| `db.gameplay.mmap_size_mb`        | 64      | Gameplay database memory-mapped I/O  |
| `db.telemetry.wal_autocheckpoint` | 4000    | Telemetry WAL checkpoint interval    |
| `db.telemetry.cache_size_kb`      | 4096    | Telemetry page cache (4 MB)          |
| `db.relay.cache_size_kb`          | 8192    | Relay data cache (8 MB)              |
| `db.relay.busy_timeout_ms`        | 5000    | Relay busy timeout                   |
| `db.matchmaking.mmap_size_mb`     | 128     | Matchmaking memory-mapped I/O        |

**When to tune:**

- **High-concurrency matchmaking server:** Raise `db.matchmaking.mmap_size_mb` to 256–512 if you observe database contention under load.
- **Heavy telemetry write load:** Raise `db.telemetry.wal_autocheckpoint` to 8000–16000 to batch more writes and reduce I/O overhead.
- **Memory-constrained server:** Lower all cache sizes by 50%.

> **Note:** The `synchronous` PRAGMA mode is NOT configurable. D034 sets FULL synchronous mode for credential databases and NORMAL for telemetry. This protects data integrity and is not negotiable.

---

### Workshop / P2P (`workshop.*`)

Parameters for the peer-to-peer content distribution system.

| Parameter                                | Default     | What It Controls                           |
| ---------------------------------------- | ----------- | ------------------------------------------ |
| `workshop.p2p.max_upload_speed`          | "1 MB/s"    | Upload bandwidth limit per server          |
| `workshop.p2p.max_download_speed`        | "unlimited" | Download bandwidth limit                   |
| `workshop.p2p.seed_duration_after_exit`  | "30m"       | Background seeding after game closes       |
| `workshop.p2p.cache_size_limit`          | "2 GB"      | Local content cache LRU eviction threshold |
| `workshop.p2p.max_connections_per_pkg`   | 8           | Peer connections per package               |
| `workshop.p2p.announce_interval_secs`    | 30          | Tracker announce cycle                     |
| `workshop.p2p.blacklist_timeout_secs`    | 300         | Dead peer blacklist cooldown               |
| `workshop.p2p.seed_health_interval_secs` | 30          | Seed box health check interval             |
| `workshop.p2p.min_replica_count`         | 2           | Minimum replicas per popular resource      |

**For dedicated seed boxes:** Raise `max_upload_speed` to "10 MB/s" or "unlimited", `max_connections_per_pkg` to 30–50, and `min_replica_count` to 3–5 to serve as high-availability content mirrors.

**For bandwidth-constrained servers:** Lower `max_upload_speed` to "256 KB/s" and reduce `max_connections_per_pkg` to 3–4.

---

### Compression (`compression.*`)

Iron Curtain uses LZ4 compression by default for saves, replays, and snapshots. Server operators can tune compression levels and, for advanced use cases, the individual algorithm parameters.

**Basic configuration** (compression levels per context):

```toml
[compression]
save_level = "balanced"        # balanced, fastest, compact
replay_level = "fastest"       # fastest for low latency during recording
autosave_level = "fastest"
snapshot_level = "fastest"     # reconnection snapshots
workshop_level = "compact"     # maximize compression for distribution
```

**Advanced configuration:** The 21 parameters in `compression.advanced.*` are documented in D063 in `decisions/09f-tools.md`. Most operators never need to touch these. The compression level presets (fastest/balanced/compact) set appropriate values automatically.

**When to use advanced compression tuning:**

- You operate a large-scale replay archive and need to minimize storage
- You host Workshop content and want optimal distribution efficiency
- You've profiled and identified compression as a bottleneck

---

## Deployment Profiles

Iron Curtain ships four pre-built profiles as starting points. Copy and modify them for your needs.

### Tournament LAN

**Purpose:** Strict competitive rules for bracket events. Admin-controlled. No player autonomy over match outcomes.

**Key overrides:**
- High `max_connections_per_ip` (LAN: many players behind one router)
- Generous pauses (admin-mediated equipment issues)
- Zero spectator delay (no stream-sniping on LAN)
- Large spectator count (audience)
- Surrender and remake votes disabled (admin decides)
- Sensitive anti-cheat (review all upsets)

```bash
./relay-server --config profiles/tournament-lan.toml
```

### Casual Community

**Purpose:** Relaxed rules for a friendly community. Fun-first. Generous timeouts.

**Key overrides:**
- Unlimited pauses with long duration
- Light disconnect penalties
- Short spectator delay
- Kick votes disabled (small community — resolve disputes personally)
- Longer seasons with fewer placement matches
- Wide matchmaking range (small population)

```bash
./relay-server --config profiles/casual-community.toml
```

### Competitive League

**Purpose:** Strict ranked play with custom rating parameters for the league's skill distribution.

**Key overrides:**
- Tight tick deadline for low latency
- Minimal pauses (1 per player, 60 seconds)
- Long spectator delay (5 minutes, anti-stream-sniping)
- Lower Glicko-2 tau (ratings change slowly — stable ladder)
- Shorter seasons with more placement matches
- Tight matchmaking with high quality floor
- Sensitive anti-cheat

```bash
./relay-server --config profiles/competitive-league.toml
```

### Training / Practice

**Purpose:** For practice rooms, AI training, mod development, and debugging.

**Key overrides:**
- Very generous tick deadline (500ms — tolerates debugging breakpoints)
- Unlimited pauses up to 1 hour
- Extended loading timeout (large mods)
- Zero spectator delay, full visibility
- Generous AI budget
- Large telemetry database, no auto-pruning

```bash
./relay-server --config profiles/training.toml
```

---

## Docker & Container Deployment

### Docker Compose

Environment variables are the primary way to override configuration in containerized deployments:

```yaml
# docker-compose.yaml
version: "3.8"
services:
  relay:
    image: ghcr.io/iron-curtain/relay-server:latest
    ports:
      - "7000:7000/udp"
      - "7001:7001/tcp"
    volumes:
      - ./server_config.toml:/etc/ic/server_config.toml:ro
      - relay-data:/var/lib/ic
    environment:
      IC_RELAY_MAX_CONNECTIONS: "2000"
      IC_RELAY_MAX_GAMES: "200"
      IC_TELEMETRY_OTEL_EXPORT: "true"
      IC_TELEMETRY_OTEL_ENDPOINT: "http://otel-collector:4317"
    command: ["--config", "/etc/ic/server_config.toml"]

  otel-collector:
    image: otel/opentelemetry-collector:latest
    ports:
      - "4317:4317"
    volumes:
      - ./otel-config.yaml:/etc/otel/config.yaml:ro

volumes:
  relay-data:
```

### Docker Compose — Tournament Override

Layer a tournament-specific compose file over the base:

```yaml
# docker-compose.tournament.yaml
# Usage: docker compose -f docker-compose.yaml -f docker-compose.tournament.yaml up
services:
  relay:
    environment:
      IC_MATCH_PAUSE_MAX_PER_PLAYER: "5"
      IC_MATCH_PAUSE_MAX_DURATION_SECS: "300"
      IC_SPECTATOR_DELAY_TICKS: "0"
      IC_SPECTATOR_MAX_PER_MATCH: "200"
      IC_SPECTATOR_FULL_VISIBILITY: "true"
      IC_VOTE_SURRENDER_ENABLED: "false"
      IC_VOTE_REMAKE_ENABLED: "false"
      IC_RELAY_MAX_GAMES: "20"
      IC_RELAY_MAX_CONNECTIONS_PER_IP: "10"
```

### Kubernetes / Helm

For Kubernetes deployments, mount `server_config.toml` as a ConfigMap and use environment variables for per-pod overrides:

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ic-relay-config
data:
  server_config.toml: |
    [relay]
    max_connections = 5000
    max_games = 1000

    [telemetry]
    otel_export = true
    otel_endpoint = "http://otel-collector.monitoring:4317"
```

```yaml
# deployment.yaml (abbreviated)
spec:
  containers:
    - name: relay
      image: ghcr.io/iron-curtain/relay-server:latest
      args: ["--config", "/etc/ic/server_config.toml"]
      volumeMounts:
        - name: config
          mountPath: /etc/ic
      env:
        - name: IC_RELAY_MAX_CONNECTIONS
          value: "5000"
  volumes:
    - name: config
      configMap:
        name: ic-relay-config
```

---

## Tournament Operations

### Pre-Tournament Checklist

1. **Validate your config:**
   ```bash
   ic server validate-config tournament-config.toml
   ```

2. **Test spectator feed:** Connect as a spectator and verify delay, visibility, and observer count before the event.

3. **Dry-run a match:** Run a test game with tournament settings. Verify pause limits, vote restrictions, and penalty behavior.

4. **Confirm anti-cheat sensitivity:** For important matches, lower `anticheat.ranked_upset_threshold` to catch all notable upsets.

5. **Set appropriate `max_games`:** Match your bracket size — no need to allow 100 games for a 16-player bracket.

6. **Prepare observer/caster slots:** Ensure `spectator.max_per_match` is high enough. For broadcast events, set `spectator.full_visibility: true`.

### During the Tournament

- **Emergency pause:** If a player has technical issues mid-game, use admin commands to extend pause duration:
  ```
  /set match.pause.max_duration_secs 600
  ```
  This takes effect for the current match (hot-reloadable).

- **Adjusting between rounds:** Hot-reload configuration between matches using `/reload_config` or `SIGHUP`.

- **Match disputes:** With `vote.surrender.enabled: false`, the admin must manually handle forfeits via admin commands.

### Post-Tournament

- **Export telemetry:** All match data is in the local `telemetry.db`. Export it for post-event analysis:
  ```bash
  ic analytics export --since "2026-03-01" --output tournament-results.json
  ```

- **Replay signing:** Replays recorded during the tournament are signed with the relay's Ed25519 key, providing tamper-evident records for dispute resolution.

---

## Security Hardening

### Configuration File Protection

```bash
# Restrict access to the config file
chmod 600 server_config.toml
chown icrelay:icrelay server_config.toml
```

The config file may contain OTEL endpoints or other infrastructure details. Treat it as sensitive.

### Connection Limits

For public-facing servers, the defaults provide reasonable protection:

| Threat              | Mitigation Parameters                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| Connection flooding | `relay.connect_rate_per_sec: 10`, `relay.idle_timeout_unauth_secs: 60` |
| IP abuse            | `relay.max_connections_per_ip: 5`                                      |
| Protocol abuse      | `protocol.max_orders_per_tick: 256`, all `protocol.*` limits           |
| Chat spam           | `chat.rate_limit_messages: 5`, `chat.rate_limit_window_secs: 3`        |
| VoIP abuse          | `protocol.max_voice_packets_per_sec: 50`                               |

**For high-risk environments** (public server, competitive stakes):
- Lower `relay.connect_rate_per_sec` to 5
- Lower `relay.idle_timeout_unauth_secs` to 15
- Lower `relay.max_connections_per_ip` to 3

### Protocol Limit Warnings

> Raising `protocol.max_orders_per_tick` or `protocol.max_order_size` above defaults weakens anti-cheat protection. The order validation system (D012) depends on these limits to reject order-flooding attacks. Increase them only with a specific, documented reason.

### Rating Isolation

Community servers with custom `rank.*` parameters produce community-scoped SCRs (Signed Cryptographic Records, D052). A community that sets `rank.default_rating: 9999` cannot inflate their players' ratings on other communities — SCRs carry the originating community ID and are evaluated in context.

---

## Capacity Planning

### Hardware Sizing

The relay server's resource usage scales primarily with concurrent games and players:

| Load                     | CPU      | RAM    | Bandwidth | Notes            |
| ------------------------ | -------- | ------ | --------- | ---------------- |
| 10 games, 40 players     | 1 core   | 256 MB | ~5 Mbps   | Community server |
| 50 games, 200 players    | 2 cores  | 512 MB | ~25 Mbps  | Medium community |
| 200 games, 800 players   | 4 cores  | 2 GB   | ~100 Mbps | Large community  |
| 1000 games, 4000 players | 8+ cores | 8 GB   | ~500 Mbps | Major service    |

These are estimates based on design targets. Actual usage will depend on game complexity, AI load, spectator count, and VoIP usage. Profile your deployment.

### Monitoring Key Metrics

When OTEL export is enabled, monitor these metrics:

| Metric                     | Healthy Range              | Action If Exceeded                               |
| -------------------------- | -------------------------- | ------------------------------------------------ |
| Relay tick processing time | < 33ms (at 30 tps)         | Reduce `max_games` or add hardware               |
| Connection count           | < 80% of `max_connections` | Raise limit or add relay instances               |
| Order rate per player      | < `order_hard_ceiling`     | Check for bot/macro abuse                        |
| Desync rate                | 0 per 10,000 ticks         | Investigate mod compatibility                    |
| Anti-cheat queue depth     | < `degrade_at_depth`       | Raise `queue_depth` or add review capacity       |
| telemetry.db size          | < `max_db_size_mb`         | Lower `retention_days` or raise `max_db_size_mb` |

---

## Troubleshooting

### Common Issues

#### "Server won't start — TOML parse error"

A syntax error in `server_config.toml`. Run validation first:

```bash
ic server validate-config server_config.toml
```

Common causes:
- Missing `=` between key and value
- Unclosed string quotes
- Duplicate section headers

#### "Unknown key warning at startup"

```
WARN: unknown key 'rleay.max_games', did you mean 'relay.max_games'?
```

A typo in a cvar name. The server starts anyway (unknown keys don't prevent startup), but the misspelled parameter uses its default value. Fix the spelling.

#### "Value clamped" warnings

```
WARN: relay.tick_deadline_ms=10 clamped to minimum 50
```

A parameter is outside its valid range. The server starts with the clamped value. Check D064's parameter registry for the valid range and adjust your config.

#### "Players experiencing lag with default settings"

Check your player base's typical latency. If most players have > 80ms ping:

```toml
[relay]
tick_deadline_ms = 150     # or even 200 for high-latency regions
```

The adaptive run-ahead system handles most latency, but a tight tick deadline can cause unnecessary order drops for high-ping players.

#### "Matchmaking queues are too long"

Small population problem. Widen the search parameters:

```toml
[matchmaking]
initial_range = 200
widen_step = 100
max_range = 1000
desperation_timeout_secs = 120
min_match_quality = 0.1
```

#### "Anti-cheat flagging too many legitimate players"

Raise thresholds:

```toml
[anticheat]
ranked_upset_threshold = 400
behavioral_flag_score = 0.6
new_player_win_chance = 0.85
```

#### "telemetry.db growing too large"

```toml
[telemetry]
max_db_size_mb = 200        # Lower the cap
retention_days = 14         # Prune older data
sampling_rate = 0.5         # Sample only 50% of events
```

#### "Reconnecting players take too long to catch up"

Increase catchup aggressiveness (at the cost of more stutter during reconnection):

```toml
[relay.catchup]
max_ticks_per_frame = 60    # Double default
sim_budget_pct = 90
render_budget_pct = 10
```

---

## CLI Reference

### Server Commands

| Command                            | Description                             |
| ---------------------------------- | --------------------------------------- |
| `./relay-server`                   | Start with defaults                     |
| `./relay-server --config <path>`   | Start with a specific config file       |
| `ic server validate-config <path>` | Validate a config file without starting |

### Runtime Console Commands (Admin)

| Command               | Description                        |
| --------------------- | ---------------------------------- |
| `/set <cvar> <value>` | Set a cvar value at runtime        |
| `/get <cvar>`         | Get current cvar value             |
| `/list <pattern>`     | List cvars matching a glob pattern |
| `/reload_config`      | Hot-reload `server_config.toml`    |

### Analytics / Telemetry

| Command                              | Description                                   |
| ------------------------------------ | --------------------------------------------- |
| `ic analytics export`                | Export telemetry data to JSON                 |
| `ic analytics export --since <date>` | Export data since a specific date             |
| `ic backup create`                   | Create a full server backup (SQLite + config) |
| `ic backup restore <archive>`        | Restore from backup                           |

---

## Engine Constants (Not Configurable)

These values are always-on, universally correct, and not exposed as configuration parameters. They exist here so operators understand what is NOT tunable and why.

| Constant                 | Value     | Why It's Not Configurable                                                         |
| ------------------------ | --------- | --------------------------------------------------------------------------------- |
| Sim tick rate            | 30 tps    | Affects CPU cost, bandwidth, and sync timing. Game speed adjusts perceived speed. |
| Sub-tick ordering        | Always on | Zero-cost fairness improvement (D008). No legitimate reason to disable.           |
| Adaptive run-ahead       | Always on | Proven over 20+ years (Generals). Automatically adapts to latency.                |
| Anti-lag-switch          | Always on | Non-negotiable for competitive integrity.                                         |
| Deterministic simulation | Always    | Breaking determinism breaks replays, spectating, and multiplayer sync.            |
| Fixed-point math         | Always    | Floats in sim = cross-platform desync.                                            |
| Order validation in sim  | Always    | Validation IS anti-cheat (D012). Disabling it enables cheating.                   |
| SQLite synchronous mode  | Per D034  | FULL for credentials, NORMAL for telemetry. Data integrity over performance.      |

---

## Reference

### Related Design Documents

| Topic                                                                      | Document                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------- |
| Full parameter registry with types, ranges, defaults                       | D064 in `decisions/09f-tools.md`                          |
| Console / cvar system design                                               | D058 in `decisions/09g-interaction.md`                    |
| Relay server architecture                                                  | D007 in `decisions/09b-networking.md` and `03-NETCODE.md` |
| Netcode parameter philosophy (why most things are not player-configurable) | D060 in `decisions/09b-networking.md`                     |
| Compression tuning                                                         | D063 in `decisions/09f-tools.md`                          |
| Ranked matchmaking & Glicko-2                                              | D055 in `decisions/09b-networking.md`                     |
| Community server architecture & SCRs                                       | D052 in `decisions/09b-networking.md`                     |
| Telemetry & observability                                                  | D031 in `decisions/09e-community.md`                      |
| AI behavior presets                                                        | D043 in `decisions/09d-gameplay.md`                       |
| SQLite per-database PRAGMA configuration                                   | D034 in `decisions/09e-community.md`                      |
| Workshop & P2P distribution                                                | D049 in `decisions/09e-community.md`                      |
| Security & threat model                                                    | `06-SECURITY.md`                                          |

### Complete Parameter Audit

The `research/parameter-audit.md` file catalogs every numeric constant, threshold, and tunable parameter across all design documents (~530+ parameters across 21 categories). It serves as an exhaustive cross-reference between the designed values and their sources.
