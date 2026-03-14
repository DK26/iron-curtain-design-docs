### Product Analytics — Comprehensive Client Event Taxonomy

The telemetry categories above capture what happens *in the simulation* (gameplay events, system timing) and on the *servers* (relay metrics, game lifecycle). A third domain is equally critical: **how players interact with the game itself** — which features are used, which are ignored, how people navigate the UI, how they play matches, and where they get confused or drop off.

This is the data that turns guessing into knowing: "42% of players never opened the career stats page," "players who use control groups average 60% higher APM," "the recovery phrase screen has a 60% skip rate — we should redesign the prompt," "right-click ordering outnumbers sidebar ordering 8:1 — invest in right-click UX, not sidebar polish."

**Core principle: the game client never phones home.** IC is an independent project — the client has zero dependency on any IC-hosted backend, analytics service, or telemetry endpoint. Product analytics are recorded to the local `telemetry.db` (same unified schema as every other component), stored locally, and stay local unless the player deliberately exports them. This matches the project's local-first philosophy (D034, D061) and ensures IC remains fully functional with no internet connectivity whatsoever.

**Design principles:**

1. **Offline-only by design.** The client contains no transmission code, no HTTP endpoints, no phone-home logic. There is no analytics backend to depend on, no infrastructure to maintain, no service to go offline.
2. **Player-owned data.** The `telemetry.db` file lives on the player's machine — the same open SQLite format they can query themselves (D034). It's their data. They can inspect it, export it, or delete it anytime.
3. **Voluntary export for bug reports.** `/analytics export` produces a self-contained file (JSON or SQLite extract) the player can review and attach to bug reports, forum posts, GitHub issues, or community surveys. The player decides when, where, and to whom they send it.
4. **Transparent and inspectable.** `/analytics inspect` shows exactly what's recorded. No hidden fields, no device fingerprinting. Players can query the SQLite table directly.
5. **Zero impact.** The game is fully functional with analytics recording on or off. No nag screens. Recording can be disabled via `telemetry.product_analytics` cvar (default: on for local recording).

**What product analytics explicitly does NOT capture:**
- Chat messages, player names, opponent names (no PII)
- Keystroke logging, raw mouse coordinates, screen captures
- Hardware identifiers, MAC addresses, IP addresses
- Filesystem contents, installed software, browser history

#### GUI Interaction Events

These events capture how the player navigates the interface — which screens they visit, which buttons they click, which features they discover, and where they spend their time. This is the primary source for UX insights.

| Event                  | JSON `data` Fields                                                                  | What It Reveals                                                          |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `gui.screen.open`      | `screen_id`, `from_screen`, `method` (button/hotkey/back/auto)                      | Navigation patterns — which screens do players visit? In what order?     |
| `gui.screen.close`     | `screen_id`, `duration_ms`, `next_screen`                                           | Time on screen — do players read the settings page for 2 seconds or 30?  |
| `gui.click`            | `widget_id`, `widget_type` (button/tab/toggle/slider/list_item), `screen`           | Which widgets get used? Which are dead space?                            |
| `gui.hotkey`           | `key_combo`, `action`, `context_screen`                                             | Hotkey adoption — are players discovering keyboard shortcuts?            |
| `gui.tooltip.shown`    | `widget_id`, `duration_ms`                                                          | Which UI elements confuse players enough to hover for a tooltip?         |
| `gui.sidebar.interact` | `tab`, `item_id`, `action` (select/scroll/queue/cancel), `method` (click/hotkey)    | Sidebar usage patterns — build queue behavior, tab switching             |
| `gui.minimap.interact` | `action` (camera_move/ping/attack_move/rally_point), `position_normalized`          | Minimap as input device — how often, for what?                           |
| `gui.build_placement`  | `structure_type`, `outcome` (placed/cancelled/invalid_position), `time_to_place_ms` | Build placement UX — how long does it take? How often do players cancel? |
| `gui.context_menu`     | `items_shown`, `item_selected`, `screen`                                            | Right-click menu usage and discoverability                               |
| `gui.scroll`           | `container_id`, `direction`, `distance`, `screen`                                   | Scroll depth — do players scroll through long lists?                     |
| `gui.panel.resize`     | `panel_id`, `old_size`, `new_size`                                                  | UI layout preferences                                                    |
| `gui.search`           | `context` (workshop/map_browser/settings/console), `query_length`, `results_count`  | Search usage patterns — what are players looking for?                    |

#### RTS Input Events

These events capture how the player actually plays the game — selection patterns, ordering habits, control group usage, camera behavior. This is the primary source for gameplay pattern analysis and understanding how players interact with the core RTS mechanics.

| Event               | JSON `data` Fields                                                                                                                                                                 | What It Reveals                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `input.select`      | `unit_count`, `method` (box_drag/click/ctrl_group/double_click/tab_cycle/select_all), `unit_types[]`                                                                               | Selection habits — do players use box select or control groups?                                            |
| `input.ctrl_group`  | `group_number`, `action` (assign/recall/append/steal), `unit_count`, `unit_types[]`                                                                                                | Control group adoption — which groups, how many units, reassignment frequency                              |
| `input.order`       | `order_type` (move/attack/attack_move/guard/patrol/stop/force_fire/deploy), `target_type` (ground/unit/building/none), `unit_count`, `method` (right_click/hotkey/minimap/sidebar) | How players issue orders — right-click vs. hotkey vs. sidebar? What order types dominate?                  |
| `input.build_queue` | `item_type`, `action` (queue/cancel/hold/repeat), `method` (click/hotkey), `queue_depth`, `queue_position`                                                                         | Build queue management — do players queue in advance or build-on-demand?                                   |
| `input.camera`      | `method` (edge_scroll/keyboard/minimap_click/ctrl_group_recall/base_hotkey/zoom_scroll/zoom_keyboard/zoom_pinch), `distance`, `duration_ms`, `zoom_level`                          | Camera control habits — which method dominates? How far do players scroll? What zoom levels are preferred? |
| `input.rally_point` | `building_type`, `position_type` (ground/unit/building), `distance_from_building`                                                                                                  | Rally point usage and placement patterns                                                                   |
| `input.waypoint`    | `waypoint_count`, `order_type`, `total_distance`                                                                                                                                   | Shift-queue / waypoint usage frequency and complexity                                                      |

#### Match Flow Events

These capture the lifecycle and pacing of matches — when they start, how they progress, why they end. The `match.pace` snapshot emitted periodically is particularly powerful: it creates a time-series of the player's economic and military state, enabling pace analysis, build order reconstruction, and difficulty curve assessment.

| Event                   | JSON `data` Fields                                                                                                                                                    | What It Reveals                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `match.start`           | `mode`, `map`, `player_count`, `ai_count`, `ai_difficulty`, `balance_preset`, `render_mode`, `game_module`, `mod_profile_fingerprint`                                 | What people play — which modes, maps, mods, settings                              |
| `match.pace`            | Emitted every 60s: `tick`, `apm`, `credits`, `power_balance`, `unit_count`, `army_value`, `tech_tier`, `buildings_count`, `harvesters_active`                         | Economic/military time-series — pacing, build order tendencies, when players peak |
| `match.end`             | `duration_s`, `outcome` (win/loss/draw/disconnect/surrender), `units_built`, `units_lost`, `credits_harvested`, `credits_spent`, `peak_army_value`, `peak_unit_count` | Win/loss context, game length, economic efficiency                                |
| `match.first_build`     | `structure_type`, `time_s`                                                                                                                                            | Build order opening — first building timing (balance indicator)                   |
| `match.first_combat`    | `time_s`, `attacker_units`, `defender_units`, `outcome`                                                                                                               | When does first blood happen? (game pacing metric)                                |
| `match.surrender_point` | `time_s`, `army_value_ratio`, `tech_tier_diff`, `credits_diff`                                                                                                        | At what resource/army deficit do players give up?                                 |
| `match.pause`           | `reason` (player/desync/lag_stall), `duration_s`                                                                                                                      | Pause frequency — desync vs. deliberate pauses                                    |

#### Post-Play Feedback & Content Evaluation Events (Workshop / Modes / Campaigns)

These events measure whether IC's post-game / post-session feedback prompts are useful without becoming spam. They support UX tuning and creator-tooling iteration, but they are **not** moderation verdicts and they do **not** carry gameplay rewards.

| Event                           | JSON `data` Fields                                                                                                                                                                             | What It Reveals                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `feedback.prompt.shown`         | `surface` (post_game/campaign_end/workshop_detail), `target_kind` (match_mode/workshop_resource/campaign), `target_id` (optional), `session_number`, `sampling_reason`                         | Prompt frequency and where feedback is requested                              |
| `feedback.prompt.action`        | `surface`, `target_kind`, `action` (submitted/skipped/snoozed/disabled_for_target/disabled_global), `time_on_prompt_ms`                                                                        | Whether the prompt is helpful or intrusive                                    |
| `feedback.review.submit`        | `target_kind`, `target_id`, `rating` (optional 1-5), `text_length`, `playtime_s`, `community_submit` (bool), `contains_spoiler_opt_in` (bool)                                                  | Review quality and submission patterns across modes/mods/campaigns            |
| `feedback.review.helpful_mark`  | `resource_id`, `review_id`, `actor_role` (author/moderator), `outcome` (marked/unmarked/rejected), `reward_granted` (bool), `reward_type` (badge/title/acknowledgement/reputation/points/none) | Creator triage behavior and helpful-review recognition usage                  |
| `feedback.review.reward_grant`  | `review_id`, `resource_id`, `reward_type`, `recipient_scope` (local_profile/community_profile), `revocable` (bool), `points_amount` (optional)                                                 | How often profile-only rewards are granted and what types are used            |
| `feedback.review.reward_redeem` | `reward_catalog_id`, `cost_points`, `recipient_scope`, `outcome` (success/rejected/revoked/refunded), `reason`                                                                                 | Cosmetic/profile reward redemption usage and abuse/policy tuning (if enabled) |

**Privacy / reward boundary (normative):**
- These are **product/community UX analytics** events, not ranked, matchmaking, or anti-cheat signals.
- `helpful_mark` and reward events must never imply gameplay advantages (no credits, ranking bonuses, unlock power, or competitive matchmaking weight).
- Review text itself remains under Workshop/community review storage rules (D049/D037). D031 records event metadata for UX/ops tuning, not a second copy of user text by default.

#### Campaign Progress Events (D021, Local-First)

Campaign telemetry supports local campaign dashboards, branching progress summaries, and (if the player opts in) community benchmark aggregates. These events are **social/analytics-facing**, not ranked or anti-cheat signals.

| Event                        | JSON `data` Fields                                                                                                                                           | What It Reveals                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `campaign.run.start`         | `campaign_id`, `campaign_version`, `game_module`, `difficulty`, `balance_preset`, `save_slot`, `continued`                                                   | Which campaigns are being played and under what ruleset                    |
| `campaign.node.complete`     | `campaign_id`, `mission_id`, `outcome`, `path_depth`, `time_s`, `units_lost`, `score`, `branch_revealed_count`                                               | Mission outcomes, pacing, branching progress, friction points              |
| `campaign.progress_snapshot` | `campaign_id`, `campaign_version`, `unique_completed`, `total_missions`, `current_path_depth`, `best_path_depth`, `endings_unlocked`, `time_played_s`        | Branching-safe progress metrics for campaign browser/profile/dashboard UIs |
| `campaign.run.end`           | `campaign_id`, `reason` (completed/abandoned/defeat_branch/pause_for_later), `best_path_depth`, `unique_completed`, `ending_id` (optional), `session_time_s` | Campaign completion/abandonment rates and session outcomes                 |

**Privacy / sharing boundary (normative):**
- These events are always available for **local dashboards** (campaign browser, profile campaign card, career stats).
- Upload/export for **community benchmark comparisons** is opt-in and should default to aggregated summaries (`campaign.progress_snapshot`) rather than full mission-by-mission histories.
- Community comparisons must be normalized by campaign version + difficulty + balance preset and presented with spoiler-safe UI defaults (D021/D053).

#### Session & Lifecycle Events

| Event                    | JSON `data` Fields                                                                                                                                     | What It Reveals                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `session.start`          | `engine_version`, `os`, `display_resolution`, `game_module`, `mod_profile_fingerprint`, `session_number` (incrementing per install)                    | Environment context — OS distribution, screen sizes, how many times they've launched                  |
| `session.mod_manifest`   | `game_module`, `mod_profile_fingerprint`, `unit_types[]`, `building_types[]`, `weapon_types[]`, `resource_types[]`, `faction_names[]`, `mod_sources[]` | Self-describing type vocabulary — makes exported telemetry interpretable without the mod's YAML files |
| `session.profile_switch` | `old_fingerprint`, `new_fingerprint`, `old_game_module`, `new_game_module`, `profile_name`                                                             | Mid-session mod profile changes — boundary marker for analytics segmentation                          |
| `session.end`            | `duration_s`, `reason` (quit/crash/update/system_sleep), `screens_visited[]`, `matches_played`, `features_used[]`                                      | Session shape — how long, what did they do, clean exit or crash?                                      |
| `session.idle`           | `screen_id`, `duration_s`                                                                                                                              | Idle detection — was the player AFK on the main menu for 20 minutes?                                  |

**`session.mod_manifest` rationale:** When telemetry records `unit_type: "HARV"` or `weapon: "Vulcan"`, these strings are meaningful only if you know the mod's type catalog. Without context, exported `telemetry.db` files require the original mod's YAML files to interpret event payloads. The `session.mod_manifest` event, emitted once per session (and again on `session.profile_switch`), captures the active mod's full type vocabulary — every unit, building, weapon, resource, and faction name defined in the loaded YAML rules. This makes exported telemetry **self-describing**: an analyst receiving a community-submitted `telemetry.db` can identify what `"HARV"` means without installing the mod. The manifest is typically 2–10 KB of JSON — negligible overhead for one event per session.

#### Settings & Configuration Events

| Event                  | JSON `data` Fields                                                           | What It Reveals                                               |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `settings.changed`     | `setting_path`, `old_value`, `new_value`, `screen`                           | Which defaults are wrong? What do players immediately change? |
| `settings.preset`      | `preset_type` (balance/theme/qol/render/experience), `preset_name`           | Preset popularity — Classic vs. Remastered vs. Modern         |
| `settings.mod_profile` | `action` (activate/create/delete/import/export), `profile_name`, `mod_count` | Mod profile adoption and management patterns                  |
| `settings.keybind`     | `action`, `old_key`, `new_key`                                               | Which keybinds do players remap? (ergonomics insight)         |

#### Onboarding Events

| Event                        | JSON `data` Fields                                                               | What It Reveals                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `onboarding.step`            | `step_id`, `step_name`, `action` (completed/skipped/abandoned), `time_on_step_s` | Where do new players drop off? Is the flow too long?                                         |
| `onboarding.tutorial`        | `tutorial_id`, `progress_pct`, `completed`, `time_spent_s`, `deaths`             | Tutorial completion and difficulty                                                           |
| `onboarding.first_use`       | `feature_id`, `session_number`, `time_since_install_s`                           | Feature discovery timeline — when do players first find the console? Career stats? Workshop? |
| `onboarding.recovery_phrase` | `action` (shown/written_confirmed/skipped), `time_on_screen_s`                   | Recovery phrase adoption — critical for D061 backup design                                   |

#### Error & Diagnostic Events

| Event            | JSON `data` Fields                                                     | What It Reveals                                                    |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `error.crash`    | `panic_message_hash`, `backtrace_hash`, `context` (screen/system/tick) | Crash frequency, clustering by context                             |
| `error.mod_load` | `mod_id`, `error_type`, `file_path_hash`                               | Which mods break? Which errors?                                    |
| `error.asset`    | `asset_path_hash`, `format`, `error_type`                              | Asset loading failures in the wild                                 |
| `error.desync`   | `tick`, `expected_hash`, `actual_hash`, `divergent_system_hint`        | Client-side desync evidence (correlates with relay `relay.desync`) |
| `error.network`  | `error_type`, `context` (connect/relay/workshop/tracking)              | Network failures by category                                       |
| `error.ui`       | `widget_id`, `error_type`, `screen`                                    | UI rendering/interaction bugs                                      |

#### Performance Sampling Events

Emitted periodically (not every frame — sampled to avoid overhead). These answer: "Are players hitting performance problems we don't see in development?"

| Event              | JSON `data` Fields                                                                   | Sampling Rate | What It Reveals                                                  |
| ------------------ | ------------------------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------- |
| `perf.frame`       | `p50_ms`, `p95_ms`, `p99_ms`, `max_ms`, `entity_count`, `draw_calls`, `gpu_time_ms`  | Every 10s     | Frame time distribution — who's struggling?                      |
| `perf.sim`         | `p50_us`, `p95_us`, `p99_us`, per-system `{system: us}` breakdown                    | Every 30s     | Sim tick budget — which systems are expensive for which players? |
| `perf.load`        | `what` (map/mod/assets/game_launch/screen), `duration_ms`, `size_bytes`              | On event      | Load times — how long does game startup take on real hardware?   |
| `perf.memory`      | `heap_bytes`, `component_storage_bytes`, `scratch_buffer_bytes`, `asset_cache_bytes` | Every 60s     | Memory pressure on real machines                                 |
| `perf.pathfinding` | `requests`, `cache_hits`, `cache_hit_rate`, `p95_compute_us`                         | Every 30s     | Pathfinding load in real matches                                 |

### Analytical Power: What Questions the Data Answers

The telemetry design above is intentionally structured for SQL queryability. Here are representative queries against the unified `telemetry_events` table that demonstrate the kind of insights this data enables — these queries work identically on client exports, server `telemetry.db` files, or aggregated community datasets:

**GUI & UX Insights:**

```sql
-- Which screens do players never visit?
SELECT json_extract(data, '$.screen_id') AS screen, COUNT(*) AS visits
FROM telemetry_events WHERE event = 'gui.screen.open'
GROUP BY screen ORDER BY visits ASC LIMIT 20;

-- How do players issue orders: right-click, hotkey, or sidebar?
SELECT json_extract(data, '$.method') AS method, COUNT(*) AS orders
FROM telemetry_events WHERE event = 'input.order'
GROUP BY method ORDER BY orders DESC;

-- Which settings do players change within the first session?
SELECT json_extract(data, '$.setting_path') AS setting,
       json_extract(data, '$.old_value') AS default_val,
       json_extract(data, '$.new_value') AS changed_to,
       COUNT(*) AS changes
FROM telemetry_events e
JOIN (SELECT DISTINCT session_id FROM telemetry_events
      WHERE event = 'session.start'
      AND json_extract(data, '$.session_number') = 1) first
  ON e.session_id = first.session_id
WHERE e.event = 'settings.changed'
GROUP BY setting ORDER BY changes DESC;

-- Control group adoption: what percentage of matches use ctrl groups?
SELECT
  COUNT(DISTINCT CASE WHEN event = 'input.ctrl_group' THEN session_id END) * 100.0 /
  COUNT(DISTINCT CASE WHEN event = 'match.start' THEN session_id END) AS pct_matches_with_ctrl_groups
FROM telemetry_events WHERE event IN ('input.ctrl_group', 'match.start');
```

**Gameplay Pattern Insights:**

```sql
-- Average match duration by mode and map
SELECT json_extract(data, '$.mode') AS mode,
       json_extract(data, '$.map') AS map,
       AVG(json_extract(data, '$.duration_s')) AS avg_duration_s,
       COUNT(*) AS matches
FROM telemetry_events WHERE event = 'match.end'
GROUP BY mode, map ORDER BY matches DESC;

-- Build order openings: what do players build first?
SELECT json_extract(data, '$.structure_type') AS first_building,
       COUNT(*) AS frequency,
       AVG(json_extract(data, '$.time_s')) AS avg_time_s
FROM telemetry_events WHERE event = 'match.first_build'
GROUP BY first_building ORDER BY frequency DESC;

-- APM distribution across the player base
SELECT
  CASE WHEN apm < 30 THEN 'casual (<30)'
       WHEN apm < 80 THEN 'intermediate (30-80)'
       WHEN apm < 150 THEN 'advanced (80-150)'
       ELSE 'expert (150+)' END AS skill_bucket,
  COUNT(*) AS snapshots
FROM (SELECT CAST(json_extract(data, '$.apm') AS INTEGER) AS apm
      FROM telemetry_events WHERE event = 'match.pace')
GROUP BY skill_bucket;

-- At what deficit do players surrender?
SELECT AVG(json_extract(data, '$.army_value_ratio')) AS avg_army_ratio,
       AVG(json_extract(data, '$.credits_diff')) AS avg_credit_diff,
       COUNT(*) AS surrenders
FROM telemetry_events WHERE event = 'match.surrender_point';
```

**Troubleshooting Insights:**

```sql
-- Crash frequency by context (which screen/system crashes most?)
SELECT json_extract(data, '$.context') AS context,
       json_extract(data, '$.backtrace_hash') AS stack,
       COUNT(*) AS occurrences
FROM telemetry_events WHERE event = 'error.crash'
GROUP BY context, stack ORDER BY occurrences DESC LIMIT 20;

-- Desync correlation: which maps/mods trigger desyncs?
-- (run across aggregated relay + client exports)
SELECT json_extract(data, '$.map') AS map,
       COUNT(CASE WHEN event = 'relay.desync' THEN 1 END) AS desyncs,
       COUNT(CASE WHEN event = 'relay.game.end' THEN 1 END) AS total_games,
       ROUND(COUNT(CASE WHEN event = 'relay.desync' THEN 1 END) * 100.0 /
             NULLIF(COUNT(CASE WHEN event = 'relay.game.end' THEN 1 END), 0), 1) AS desync_pct
FROM telemetry_events
WHERE event IN ('relay.desync', 'relay.game.end')
GROUP BY map ORDER BY desync_pct DESC;

-- Performance: which players have sustained frame drops?
SELECT session_id,
       AVG(json_extract(data, '$.p95_ms')) AS avg_p95_frame_ms,
       MAX(json_extract(data, '$.entity_count')) AS peak_entities
FROM telemetry_events WHERE event = 'perf.frame'
GROUP BY session_id
HAVING avg_p95_frame_ms > 33.3  -- below 30 FPS sustained
ORDER BY avg_p95_frame_ms DESC;
```

**Aggregation happens in the open, not in a backend.** If the project team wants to analyze telemetry across many players (e.g., for a usability study, balance patch, or release retrospective), they ask the community to voluntarily submit exports — the same model as open-source projects collecting crash dumps on GitHub. Community members run `/analytics export`, review the file, and attach it. Aggregation scripts live in the repository and run locally — anyone can reproduce the analysis.

**Console commands (D058) — identical on client and server:**

| Command                                                        | Action                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/analytics status`                                            | Show recording status, event count, `telemetry.db` size, retention settings       |
| `/analytics inspect [category] [--last N]`                     | Display recent events, optionally filtered by category                            |
| `/analytics export [--from DATE] [--to DATE] [--category CAT]` | Export to JSON/SQLite in `<data_dir>/exports/` with optional date/category filter |
| `/analytics clear [--before DATE]`                             | Delete events, optionally only before a date                                      |
| `/analytics on/off`                                            | Toggle local recording (`telemetry.product_analytics` cvar)                       |
| `/analytics query SQL`                                         | Run ad-hoc SQL against `telemetry.db` (dev console only, `DEV_ONLY` flag)         |

### Architecture: Where Telemetry Lives

**Primary path (always-on): local SQLite.** Every component writes to its own `telemetry.db`. This is the ground truth. No network, no infrastructure, no dependencies.

```
  ┌─────────────────────────────────────────────────────────────────┐
  │ Every component (client, relay, tracking, workshop)             │
  │                                                                 │
  │  Instrumentation    ──►  telemetry.db (local SQLite)            │
  │  (tracing + events)      ├── always written                     │
  │                          ├── /analytics inspect                 │
  │                          ├── /analytics export ──► .json file   │
  │                          │   (voluntary: bug report, feedback)  │
  │                          └── retention: max size / max age      │
  └─────────────────────────────────────────────────────────────────┘
```

**Optional path (server operators only): OTEL export.** Server operators who want real-time dashboards can enable OTEL export alongside the SQLite sink. This is a deployment choice for sophisticated operators — never a requirement.

```
  Servers with OTEL enabled:

  telemetry.db ◄── Instrumentation ──► OTEL Collector (optional)
  (always)         (tracing + events)       │
                                     ┌──────┴──────────────────┐
                                     │          │              │
                              ┌──────▼──┐ ┌────▼────┐ ┌───────▼───┐
                              │Prometheus│ │ Jaeger  │ │   Loki    │
                              │(metrics) │ │(traces) │ │(logs)     │
                              └──────────┘ └─────────┘ └─────┬─────┘
                                                             │
                                                      ┌──────▼──────┐
                                                      │ AI Training  │
                                                      │ (Parquet→ML) │
                                                      └─────────────┘
```

The dual-write approach means:
- **Every deployment** gets full telemetry in SQLite — zero setup required
- **Sophisticated deployments** can additionally route to Grafana/Prometheus/Jaeger for real-time dashboards
- Self-hosters can route OTEL to whatever they want (Grafana Cloud, Datadog, or just stdout)
- If the OTEL collector goes down, telemetry continues in SQLite uninterrupted — no data loss

### Implementation Approach

**Rust ecosystem:**
- `tracing` crate — Bevy already uses this; add structured fields and span instrumentation
- `opentelemetry` + `opentelemetry-otlp` crates — OTEL SDK for Rust
- `tracing-opentelemetry` — bridges `tracing` spans to OTEL traces
- `metrics` crate — lightweight counters/histograms, exported via OTEL

**Zero-cost engine instrumentation when disabled:** The `telemetry` feature flag gates **engine-level** instrumentation (per-system tick timing, `GameplayEvent` stream, OTEL export) behind `#[cfg(feature = "telemetry")]`. When disabled, all engine telemetry calls compile to no-ops. No runtime cost, no allocations, no branches. This respects invariant #5 (efficiency-first performance).

**Product analytics (GUI interaction, session, settings, onboarding, errors, perf sampling) always record to SQLite** — they are lightweight structured event inserts, not per-tick instrumentation. The overhead is negligible (one SQLite INSERT per user action, batched in WAL mode). Players who want to disable even this can set `telemetry.product_analytics false`.

**Transaction batching:** All SQLite INSERTs — both telemetry events and gameplay events — are explicitly batched in transactions to avoid per-INSERT fsync overhead:

| Event source      | Batch strategy                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Product analytics | Buffered in memory; flushed in a single `BEGIN`/`COMMIT` every 1 second or 50 events, whichever first   |
| Gameplay events   | Buffered per tick; flushed in a single `BEGIN`/`COMMIT` at end of tick (typically 1-20 events per tick) |
| Server telemetry  | Ring buffer; flushed in a single `BEGIN`/`COMMIT` every 100 ms or 200 events, whichever first           |

All writes happen on a dedicated I/O thread (or `spawn_blocking` task) — never on the game loop thread. The game loop thread only appends to a lock-free ring buffer; the I/O thread drains and commits. This guarantees that SQLite contention (including `busy_timeout` waits and WAL checkpoints) cannot cause frame drops.

**Ring buffer sizing:** The ring buffer must absorb all events generated during the worst-case I/O thread stall (WAL checkpoint on HDD: 200–500 ms). At peak event rates (~600 events/s during intense combat — gameplay events + telemetry + product analytics combined), a 500 ms stall generates ~300 events. **Minimum ring buffer capacity: 1024 entries** (3.4× headroom over worst-case). Each entry is a lightweight enum (~64–128 bytes), so the buffer occupies ~64–128 KB — negligible. If the buffer fills despite this sizing, events are dropped with a counter increment (same pattern as the replay writer's `frames_lost` tracking in V45). The I/O thread logs a warning on drain if drops occurred. This is a last-resort safety net, not an expected operating condition.

**Build configurations:**
| Build               | Engine Telemetry | Product Analytics (SQLite) | OTEL Export | Use case                                   |
| ------------------- | ---------------- | -------------------------- | ----------- | ------------------------------------------ |
| `release`           | Off              | On (local SQLite)          | Off         | Player-facing builds — minimal overhead    |
| `release-telemetry` | On               | On (local SQLite)          | Optional    | Tournament servers, AI training, debugging |
| `debug`             | On               | On (local SQLite)          | Optional    | Development — full instrumentation         |

### Self-Hosting Observability

Community server operators get observability for free. The docker-compose.yaml (already designed in `03-NETCODE.md`) can optionally include a Grafana + Prometheus + Loki stack:

```yaml
# docker-compose.observability.yaml (optional overlay)
services:
  otel-collector:
    image: otel/opentelemetry-collector:latest
    ports:
      - "4317:4317"    # OTLP gRPC
  prometheus:
    image: prom/prometheus:latest
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"    # dashboards
  loki:
    image: grafana/loki:latest
```

Pre-built Grafana dashboards ship with the project:
- **Relay Dashboard:** active games, player RTT, orders/sec, desync events, suspicion scores
- **Tracking Dashboard:** listings, heartbeats, query rates
- **Workshop Dashboard:** downloads, publishes, dependency resolution times
- **Engine Dashboard:** tick times, entity counts, system breakdown, pathfinding stats

**Alternatives considered:**
- Custom metrics format (less work initially, but no ecosystem — no Grafana, no alerting, no community tooling)
- StatsD (simpler but metrics-only — no traces, no structured logs, no distributed correlation)
- No telemetry (leaves operators blind and AI training without data)
- Always-on telemetry (violates performance invariant — must be zero-cost when disabled)

**Phase:** Unified `telemetry_events` SQLite schema + `/analytics` console commands in Phase 2 (shared across all components from day one). Engine telemetry (per-system timing, `GameplayEvent` stream) in Phase 2 (sim). Product analytics (GUI interaction, session, settings, onboarding, errors, performance sampling) in Phase 3 (alongside UI chrome). Server-side SQLite telemetry recording (relay, tracking, workshop) in Phase 5 (multiplayer). Optional OTEL export layer for server operators in Phase 5. Pre-built Grafana dashboards in Phase 5. AI training pipeline in Phase 7 (LLM).

### AI Training Data Export

The telemetry and gameplay event data captured above is a secondary data source for AI model training — enriching the primary source (replay files) with contextual signals not present in the replay order stream.

**What telemetry adds to training data:**

| Telemetry Event                           | Training Data Value                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `match.pace` (every 60s)                  | Economic time-series — credits, power, army value, tech tier over time       |
| `input.ctrl_group`                        | Micro skill indicator — control group adoption and reassignment frequency    |
| `input.order` (method breakdown)          | Input habit fingerprint — right-click vs. hotkey vs. sidebar ordering        |
| `match.surrender_point`                   | Reward shaping signal — at what deficit do players perceive the game as lost |
| `input.camera`                            | Attention model — what the player was looking at when making decisions       |
| `match.first_build`, `match.first_combat` | Build order and aggression timing markers                                    |

**Export for ML:**

```
ic analytics export-training \
  --categories match,input,campaign \
  --from 2026-01-01 \
  --format parquet \
  --output ./telemetry_training/
```

Exports selected telemetry event categories as Parquet files, joined to replay metadata where available. This supplements the replay-derived training pairs (see `research/ml-training-pipeline-design.md`) with player behavior signals that aren't captured in the deterministic order stream.

**Privacy boundary:** Training exports apply the same anonymization as `/analytics export` — hashed session IDs, no PII, no hardware identifiers. Players who disable product analytics (`telemetry.product_analytics false`) produce no telemetry-enriched training data; replay-derived training pairs remain unaffected.

---

---

