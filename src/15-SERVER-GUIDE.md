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
./ic-server
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
./ic-server --config /path/to/server_config.toml
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

- **Competitive league (low latency):** Keep effective deadline behavior inside `90–140ms` envelope (D060). If running a fixed value, start around `110ms`.
- **Casual / high-latency regions:** Keep effective deadline behavior inside `120–220ms` envelope (D060). If running a fixed value, start around `160ms`.
- **Training / debugging:** Raise `tick_deadline_ms` to 500 and `reconnect_timeout_secs` to 300 for generous timeouts.

**Recommendation:** Leave `tick_deadline_ms` at 120 unless you have specific latency data for your player base. The adaptive run-ahead system handles most cases automatically.

#### QoS Envelope Alignment (D060)

The relay's match QoS auto-profile should stay within these envelopes:

| Queue Type           | Deadline Envelope | Shared Run-Ahead Envelope | Suggested Fixed Baseline (if auto-profile unavailable) |
| -------------------- | ----------------- | ------------------------- | ------------------------------------------------------ |
| Ranked / Competitive | 90–140 ms         | 3–5 ticks                 | 110 ms                                                 |
| Casual / Community   | 120–220 ms        | 4–7 ticks                 | 160 ms                                                 |
| Training / Debug     | 200–500 ms        | 6–15 ticks                | 300 ms                                                 |

If your runtime currently supports only a fixed `relay.tick_deadline_ms`, choose the baseline above and tune by observed late-order rate. If match auto-profile envelopes are available, prefer those and keep fixed overrides minimal.

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

| Parameter                        | Default (casual) | Default (ranked) | What It Controls                                                                                                                                                                |
| -------------------------------- | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spectator.allow_live`           | true             | true             | Whether live spectating is enabled at all                                                                                                                                       |
| `spectator.delay_ticks`          | 60 (3s†)         | 2400 (120s†)     | Feed delay in ticks (†at Normal ~20 tps). For ranked/tournament, the relay clamps this upward to enforce V59's wall-time floor (120s/180s) regardless of game speed — see below |
| `spectator.max_per_match`        | 50               | 50               | Maximum spectators per match                                                                                                                                                    |
| `spectator.full_visibility`      | true             | false            | Whether spectators see both teams                                                                                                                                               |
| `spectator.allow_player_disable` | true             | false            | Whether players can opt out of being spectated                                                                                                                                  |

**V59 wall-time floor enforcement:** The security floor for ranked (120s) and tournament (180s) is defined in wall-clock seconds, not ticks. The relay computes the minimum tick count at match start: `min_delay_ticks = floor_secs × tps_for_speed_preset`. If `spectator.delay_ticks` falls below this computed minimum, the relay clamps it upward. This ensures the floor holds at any game speed (D060). The tick values below assume Normal (~20 tps); at other speeds the relay adjusts automatically.

| Ticks (Normal ~20 tps) | Real Time | Use Case                                                                 |
| ---------------------- | --------- | ------------------------------------------------------------------------ |
| 0                      | No delay  | Unranked practice / training (not ranked or tournament — see V59 floors) |
| 60                     | 3 seconds | Casual viewing                                                           |
| 2400                   | 2 minutes | Ranked minimum (V59 floor — relay enforces 120s at any speed)            |
| 3600                   | 3 minutes | Tournament minimum (V59 floor — relay enforces 180s at any speed)        |
| 9000                   | 7.5 min   | Competitive league (stricter anti-sniping)                               |
| 18000                  | 15 min    | Maximum supported delay                                                  |

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

| Parameter                               | Default | What It Controls                           |
| --------------------------------------- | ------- | ------------------------------------------ |
| `protocol.max_order_size`               | 4096    | Maximum single order size (bytes)          |
| `protocol.max_orders_per_tick`          | 256     | Hard ceiling on orders per tick per player |
| `protocol.max_chat_length`              | 512     | Maximum chat message characters            |
| `protocol.max_file_transfer_size`       | 65536   | Maximum file transfer size (bytes)         |
| `protocol.max_pending_per_peer`         | 262144  | Maximum buffered data per peer (bytes)     |
| `protocol.max_voice_packets_per_second` | 50      | VoIP packet rate limit                     |
| `protocol.max_voice_packet_size`        | 256     | VoIP packet size limit (bytes)             |
| `protocol.max_pings_per_interval`       | 3       | Contextual pings per 5-second window       |
| `protocol.max_minimap_draw_points`      | 32      | Points per minimap drawing                 |
| `protocol.max_markers_per_player`       | 10      | Tactical markers per player                |
| `protocol.max_markers_per_team`         | 30      | Tactical markers per team                  |

> **Warning:** Raising protocol limits above defaults increases the abuse surface. The defaults are tuned for competitive play. Only increase them if you have a specific need and understand the anti-cheat implications.

**When to change these:**

- **Large team games (8v8):** You may want to raise `max_markers_per_team` to 50–60 for more tactical coordination.
- **VoIP quality:** Raising `max_voice_packets_per_second` beyond 50 is unlikely to improve quality — the Opus codec is efficient. Consider raising `chat.voip_bitrate_kbps` instead.
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


---

## Sub-Pages

| Section                 | Topic                                                                                                                                                                                                                                                                       | File                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Operations & Deployment | Subsystem reference continued (ranking/Glicko-2, matchmaking, AI, telemetry, DB, Workshop/P2P, compression) + deployment profiles + Docker/Kubernetes + tournament operations + security hardening + capacity planning + troubleshooting + CLI reference + engine constants | [operations.md](server-guide/operations.md) |
