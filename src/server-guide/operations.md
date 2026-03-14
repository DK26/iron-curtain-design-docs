### Ranking & Glicko-2 (`rank.*`)

Iron Curtain uses the Glicko-2 rating system. These parameters let league administrators tune it for their community's size and activity level.

| Parameter                      | Default | What It Controls                                                                                    |
| ------------------------------ | ------- | --------------------------------------------------------------------------------------------------- |
| `rank.default_rating`          | 1500    | Starting rating for new players                                                                     |
| `rank.default_deviation`       | 350     | Starting rating deviation (uncertainty)                                                             |
| `rank.system_tau`              | 0.5     | Volatility sensitivity — how quickly ratings respond to unexpected results                          |
| `rank.rd_floor`                | 45      | Minimum deviation (maximum confidence)                                                              |
| `rank.rd_ceiling`              | 350     | Maximum deviation (maximum uncertainty)                                                             |
| `rank.inactivity_c`            | 34.6    | How fast deviation grows during inactivity                                                          |
| `rank.match_min_ticks`         | 3600    | Minimum ticks for any rating weight (game progression, not wall time — see note below)              |
| `rank.match_full_weight_ticks` | 18000   | Ticks at which the match gets full rating weight (game progression, not wall time — see note below) |
| `rank.match_short_game_factor` | 300     | Short-game duration weighting factor                                                                |

**Understanding `system_tau`:**

- **Lower tau (0.2–0.4):** Ratings change slowly. Good for stable, large communities where the skill distribution is well-established.
- **Default (0.5):** Balanced. Works well for most deployments.
- **Higher tau (0.6–1.0):** Ratings change quickly. Good for new communities where players are still finding their level, or for communities with high player turnover.

**Match duration weighting:** Short games (e.g., an early GG) contribute less to rating changes than full-length matches. `match_min_ticks` is the minimum game length for any rating influence. Below that, the match does not affect ratings at all. `match_full_weight_ticks` is the length at which the match counts fully.

**Why ticks, not seconds:** These thresholds measure game progression — the number of sim updates (orders processed, economy cycles, combat ticks) — not wall time. A 3,600-tick game has the same strategic depth at any speed preset. Wall-clock equivalents depend on the server's ranked game speed (D060: server-enforced, not player-configurable): at Normal ~20 tps that's ~3 min / ~15 min; at Slower ~15 tps it's ~4 min / ~20 min. Since ranked speed is fixed per server, operators know the exact wall-time mapping for their community.

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

| Parameter                              | Default | What It Controls                                                                                      |
| -------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `matchmaking.initial_range`            | 100     | Starting rating search window (± this value)                                                          |
| `matchmaking.widen_step`               | 50      | Rating range expansion per interval                                                                   |
| `matchmaking.widen_interval_secs`      | 30      | Time between range expansions                                                                         |
| `matchmaking.max_range`                | 500     | Maximum rating search range                                                                           |
| `matchmaking.desperation_timeout_secs` | 300     | Time before relaxing range to max (requires ≥3 in queue, V31; `min_match_quality` still applies, V30) |
| `matchmaking.min_match_quality`        | 0.3     | Minimum match quality score (0.0–1.0)                                                                 |

**How matchmaking expands:**

```
Time = 0s:   Search ±100 of player's rating
Time = 30s:  Search ±150
Time = 60s:  Search ±200
Time = 90s:  Search ±250
...
Time = 240s: Search ±500 (max_range reached)
Time = 300s: Desperation mode (relaxes range, but requires ≥3 in queue and min_match_quality still blocks; see D055 V30/V31)
```

**Small community tuning:** The most common issue is long queue times due to low population. Address this by:

```toml
[matchmaking]
initial_range = 200           # Wider initial search
widen_step = 100              # Expand faster
widen_interval_secs = 15      # Expand more often
max_range = 1000              # Search much wider
desperation_timeout_secs = 120   # Relax range ceiling sooner (still requires ≥3 in queue, V31)
min_match_quality = 0.1       # Accept lower quality matches (still enforced at desperation, V30)
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
- Tournament-mode spectator delay (180 seconds for ranked — the security floor is non-negotiable even on LAN; see `security/vulns-edge-cases-infra.md` § Tiered delay policy. For unranked exhibition matches, set `spectator.delay_ticks: 0`)
- Large spectator count (audience)
- Surrender and remake votes disabled (admin decides)
- Sensitive anti-cheat (review all upsets)

```bash
./ic-server --config profiles/tournament-lan.toml
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
./ic-server --config profiles/casual-community.toml
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
./ic-server --config profiles/competitive-league.toml
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
./ic-server --config profiles/training.toml
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
    image: ghcr.io/ironcurtain/ic-server:latest
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
      IC_SPECTATOR_DELAY_TICKS: "3600"  # 180s at Normal ~20 tps; relay clamps upward at faster speeds to enforce V59's 180s wall-time floor
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
      image: ghcr.io/ironcurtain/ic-server:latest
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
| VoIP abuse          | `protocol.max_voice_packets_per_second: 50`                            |

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

| Metric                     | Healthy Range                                            | Action If Exceeded                               |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| Relay tick processing time | < tick interval (67ms at Slower default, 50ms at Normal) | Reduce `max_games` or add hardware               |
| Connection count           | < 80% of `max_connections`                               | Raise limit or add relay instances               |
| Order rate per player      | < `order_hard_ceiling`                                   | Check for bot/macro abuse                        |
| Desync rate                | 0 per 10,000 ticks                                       | Investigate mod compatibility                    |
| Anti-cheat queue depth     | < `degrade_at_depth`                                     | Raise `queue_depth` or add review capacity       |
| telemetry.db size          | < `max_db_size_mb`                                       | Lower `retention_days` or raise `max_db_size_mb` |

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
tick_deadline_ms = 160     # casual/community baseline inside 120–220ms envelope
```

The adaptive run-ahead system handles most latency, but a tight tick deadline can cause unnecessary order drops for high-ping players. If this is a ranked environment, do not exceed ~140ms without evidence; if casual/community, 180–220ms is acceptable.

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
| `./ic-server`                      | Start with defaults                     |
| `./ic-server --config <path>`      | Start with a specific config file       |
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

| Constant                 | Value                           | Why It's Not Configurable                                                            |
| ------------------------ | ------------------------------- | ------------------------------------------------------------------------------------ |
| Sim tick rate            | Set by game speed preset (D060) | Slower ~15 tps (default), Normal ~20 tps, Fastest 50 tps. Not independently tunable. |
| Sub-tick ordering        | Always on                       | Zero-cost fairness improvement (D008). No legitimate reason to disable.              |
| Adaptive run-ahead       | Always on                       | Proven over 20+ years (Generals). Automatically adapts to latency.                   |
| Anti-lag-switch          | Always on                       | Non-negotiable for competitive integrity.                                            |
| Deterministic simulation | Always                          | Breaking determinism breaks replays, spectating, and multiplayer sync.               |
| Fixed-point math         | Always                          | Floats in sim = cross-platform desync.                                               |
| Order validation in sim  | Always                          | Validation IS anti-cheat (D012). Disabling it enables cheating.                      |
| SQLite synchronous mode  | Per D034                        | FULL for credentials, NORMAL for telemetry. Data integrity over performance.         |

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
