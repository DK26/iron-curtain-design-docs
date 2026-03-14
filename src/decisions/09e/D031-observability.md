## D031: Observability & Telemetry — OTEL Across Engine, Servers, and AI Pipeline

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Multi-phase (instrumentation foundation + server ops + advanced analytics/AI training pipelines)
- **Canonical for:** Unified telemetry/observability architecture, local-first telemetry storage, and optional OTEL export policy
- **Scope:** game client, relay/tracking/workshop servers, telemetry schema/storage, tracing/export pipeline, debugging and analytics tooling
- **Decision:** All components record structured telemetry to **local SQLite** as the primary sink using a shared schema; **OpenTelemetry is optional** export infrastructure for operators who want dashboards/traces.
- **Why:** Works offline, supports both players and operators, enables cross-component debugging (including desync analysis), and unifies gameplay/debug/ops/AI data collection under one instrumentation model.
- **Non-goals:** Requiring external collectors (Prometheus/OTEL backends) for normal operation; separate incompatible telemetry formats per component.
- **Invariants preserved:** Local-first data philosophy (D034/D061), offline-capable components, and mod/game agnosticism at the schema level.
- **Defaults / UX behavior:** Telemetry is recorded locally with retention/rotation; operators may optionally enable OTEL export for live dashboards.
- **Security / Trust impact:** Structured telemetry is designed for analysis without making external infrastructure mandatory; privacy-sensitive usage depends on the telemetry policy and field discipline in event payloads.
- **Performance / Ops impact:** Unified schema simplifies tooling and reduces operational complexity; tracing/puffin stack is chosen for low disabled overhead and production viability.
- **Public interfaces / types / commands:** shared `telemetry.db` schema, `tracing` instrumentation, optional OTEL exporters, analytics export/query tooling (see body)
- **Affected docs:** `src/06-SECURITY.md`, `src/03-NETCODE.md`, `src/decisions/09e-community.md` (D034/D061), `src/15-SERVER-GUIDE.md`
- **Revision note summary:** None
- **Keywords:** telemetry, observability, OTEL, OpenTelemetry, SQLite telemetry.db, tracing, puffin, local-first analytics, desync debugging

**Decision:** All components — game client, relay server, tracking server, workshop server — record structured telemetry to local SQLite as the primary sink. Every component runs fully offline; no telemetry depends on external infrastructure. OTEL (OpenTelemetry) is an optional export layer for server operators who want Grafana dashboards — it is never a requirement. The instrumentation layer is unified across all components, enabling operational monitoring, gameplay debugging, GUI usage analysis, pattern discovery, and AI/LLM training data collection.

**Rationale:**
- Backend servers (relay, tracking, workshop) are production infrastructure — they need health metrics, latency histograms, error rates, and distributed traces, just like any microservice
- The game engine already has rich internal state (per-tick `state_hash()`, snapshots, system execution times) but no structured way to export it for analysis
- Replay files capture *what happened* but not *why* — telemetry captures the engine's decision-making process (pathfinding time, order validation outcomes, combat resolution details) that replays miss
- Behavioral analysis (V12 anti-cheat) already collects APM, reaction times, and input entropy on the relay — OTEL is the natural export format for this data
- AI/LLM development needs training data: game telemetry (unit movements, build orders, engagement outcomes) is exactly the training corpus for `ic-ai` and `ic-llm`
- Bevy already integrates with Rust's `tracing` crate — OTEL export is a natural extension, not a foreign addition
- **Stack validated by production Rust game infrastructure:** Embark Studios' Quilkin (production game relay) uses the exact `tracing` + `prometheus` + OTEL stack IC targets, confirming it handles real game traffic at scale. Puffin (Embark's frame-based profiler) complements OTEL for per-tick instrumentation with ~1ns disabled overhead. IC's "zero cost when disabled" requirement is satisfied by puffin's `AtomicBool` guard and tracing's compile-time level filtering. See `research/embark-studios-rust-gamedev-analysis.md`
- Desync debugging needs cross-client correlation — distributed tracing (trace IDs) lets you follow an order from input → network → sim → render across multiple clients and the relay server
- A single instrumentation approach (OTEL) avoids the mess of ad-hoc logging, custom metrics files, separate debug protocols, and incompatible formats

**Key Design Elements:**

### Unified Local-First Storage

**Every component records telemetry to a local SQLite file. No exceptions.** This is the same principle as D034 (SQLite as embedded storage) and D061 (local-first data) applied to telemetry. The game client, relay server, tracking server, and workshop server all write to their own `telemetry.db` using an identical schema. No component depends on an external collector, dashboard, or aggregation service to function.

```sql
-- Identical schema on every component (client, relay, tracking, workshop)
CREATE TABLE telemetry_events (
    id            INTEGER PRIMARY KEY,
    timestamp     TEXT    NOT NULL,        -- ISO 8601 with microsecond precision
    session_id    TEXT    NOT NULL,        -- random per-process-lifetime
    component     TEXT    NOT NULL,        -- 'client', 'relay', 'tracking', 'workshop'
    game_module   TEXT,                    -- 'ra1', 'td', 'ra2', custom — set once per session (NULL on servers)
    mod_fingerprint TEXT,                  -- D062 SHA-256 mod profile fingerprint — updated on profile switch
    category      TEXT    NOT NULL,        -- event domain (see taxonomy below)
    event         TEXT    NOT NULL,        -- specific event name
    severity      TEXT    NOT NULL DEFAULT 'info',  -- 'trace','debug','info','warn','error'
    data          TEXT,                    -- JSON payload (structured, no PII)
    duration_us   INTEGER,                -- for events with measurable duration
    tick          INTEGER,                -- sim tick (gameplay/sim events only)
    correlation   TEXT                     -- trace ID for cross-component correlation
);

CREATE INDEX idx_telemetry_ts          ON telemetry_events(timestamp);
CREATE INDEX idx_telemetry_cat_event   ON telemetry_events(category, event);
CREATE INDEX idx_telemetry_session     ON telemetry_events(session_id);
CREATE INDEX idx_telemetry_game_module ON telemetry_events(game_module) WHERE game_module IS NOT NULL;
CREATE INDEX idx_telemetry_mod_fp      ON telemetry_events(mod_fingerprint) WHERE mod_fingerprint IS NOT NULL;
CREATE INDEX idx_telemetry_severity    ON telemetry_events(severity) WHERE severity IN ('warn', 'error');
CREATE INDEX idx_telemetry_correlation ON telemetry_events(correlation) WHERE correlation IS NOT NULL;
```

**Why one schema everywhere?** Aggregation scripts, debugging tools, and community analysis all work identically regardless of source. A relay operator can run the same `/analytics export` command as a player. Exported files from different components can be imported into a single SQLite database for cross-component analysis (desync debugging across client + relay). The aggregation tooling is a handful of SQL queries, not a specialized backend.

**Mod-agnostic by design, mod-aware by context.** The telemetry schema contains zero game-specific or mod-specific columns. Unit types, weapon names, building names, and resource types flow through as opaque strings — whatever the active mod's YAML defines. A total conversion mod's custom vocabulary (e.g., `unit_type: "Mammoth Mk.III"`) passes through unchanged without schema modification. The two denormalized context columns — `game_module` and `mod_fingerprint` — are set once per session on the client (updated on `ic profile activate` if the player switches mod profiles mid-session). On servers, these columns are populated per-game from lobby metadata. This means **every analytical query can be trivially filtered by game module or mod combination** without JOINing through `session.start`'s JSON payload:

```sql
-- Direct mod filtering — no JOINs needed
SELECT event, COUNT(*) FROM telemetry_events
WHERE game_module = 'ra1' AND category = 'input'
GROUP BY event ORDER BY COUNT(*) DESC;

-- Compare behavior across mod profiles
SELECT mod_fingerprint, AVG(json_extract(data, '$.apm')) AS avg_apm
FROM telemetry_events WHERE event = 'match.pace'
GROUP BY mod_fingerprint;
```

**Relay servers** set `game_module` and `mod_fingerprint` per-game from the lobby's negotiated settings — all events for that game inherit the context. When the relay hosts multiple concurrent games with different mods, each game's events carry the correct mod context independently.

**OTEL is an optional export layer, not the primary sink.** Server operators who want real-time dashboards (Grafana, Prometheus, Jaeger) can enable OTEL export — but this is a planned optional operations enhancement (`M7` operator usability baseline with deeper `M11` scale hardening), not a deployment dependency. A community member running a relay server on a spare machine doesn't need to set up Prometheus. They get full telemetry in a SQLite file they can query with any SQL tool.

**Retention and rotation:** Each component's `telemetry.db` has a configurable max size (default: 100 MB for client, 500 MB for servers). When the limit is reached, the oldest events are pruned. `/analytics export` exports a date range to a separate file before pruning. Servers can also configure time-based retention (e.g., `telemetry.retention_days = 30`).

### Three Telemetry Signals (OTEL Standard)

| Signal  | What It Captures                                                  | Export Format        |
| ------- | ----------------------------------------------------------------- | -------------------- |
| Metrics | Counters, histograms, gauges — numeric time series                | OTLP → Prometheus    |
| Traces  | Distributed request flows — an order's journey through the system | OTLP → Jaeger/Zipkin |
| Logs    | Structured events with severity, context, correlation IDs         | OTLP → Loki/stdout   |

### Backend Server Telemetry (Relay, Tracking, Workshop)

Standard operational observability — same patterns used by any production Rust service. **All servers record to local SQLite** (`telemetry.db`) using the unified schema above. The OTEL metric names below double as the `event` field in the SQLite table — operators can query locally via SQL or optionally export to Prometheus/Grafana.

**Relay server metrics:**
```
relay.games.active                    # gauge: concurrent games
relay.games.total                     # counter: total games hosted
relay.orders.received                 # counter: orders received per tick
relay.orders.forwarded                # counter: orders broadcast
relay.orders.dropped                  # counter: orders missed (lag switch)
relay.tick.latency_ms                 # histogram: tick processing time
relay.player.rtt_ms                   # histogram: per-player round-trip time
relay.player.suspicion_score          # gauge: behavioral analysis score (V12)
relay.desync.detected                 # counter: desync events
relay.match.completed                 # counter: matches finished
relay.match.duration_s                # histogram: match duration
```

**Tracking server metrics:**
```
tracking.listings.active              # gauge: current game listings
tracking.heartbeats.received          # counter: heartbeats processed
tracking.heartbeats.expired           # counter: listings expired (TTL)
tracking.queries.total                # counter: browse/search requests
tracking.queries.latency_ms           # histogram: query latency
```

**Workshop server metrics:**
```
workshop.resources.total              # gauge: total published resources
workshop.resources.downloads          # counter: download events
workshop.resources.publishes          # counter: publish events
workshop.resolve.latency_ms           # histogram: dependency resolution time
workshop.resolve.conflicts            # counter: version conflicts detected
workshop.search.latency_ms            # histogram: search query time
```

#### Server-Side Structured Events (SQLite)

Beyond counters and gauges, each server records detailed structured events to `telemetry.db`. These are the events that actually enable troubleshooting and pattern analysis:

**Relay server events:**

| Event                 | JSON `data` Fields                                                                                            | Troubleshooting Value                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `relay.game.start`    | `game_id`, `map`, `player_count`, `settings_hash`, `balance_preset`, `game_module`, `mod_profile_fingerprint` | Which maps/settings/mods are popular?                       |
| `relay.game.end`      | `game_id`, `duration_s`, `ticks`, `outcome`, `player_count`                                                   | Match length distribution, completion vs. abandonment rates |
| `relay.player.join`   | `game_id`, `slot`, `rtt_ms`, `mod_profile_fingerprint`                                                        | Connection quality at join time, mod compatibility          |
| `relay.player.leave`  | `game_id`, `slot`, `reason` (quit/disconnect/kicked/timeout), `match_time_s`                                  | Why and when players leave — early ragequit vs. end-of-game |
| `relay.tick.process`  | `game_id`, `tick`, `order_count`, `process_us`, `stall_detected`                                              | Per-tick performance, stall diagnosis                       |
| `relay.order.forward` | `game_id`, `player`, `tick`, `order_type`, `sub_tick_us`, `size_bytes`                                        | Order volume, sub-tick fairness verification                |
| `relay.desync`        | `game_id`, `tick`, `diverged_players[]`, `hash_expected`, `hash_actual`                                       | Desync diagnosis — which tick, which players                |
| `relay.lag_switch`    | `game_id`, `player`, `gap_ms`, `orders_during_gap`                                                            | Cheating detection audit trail                              |
| `relay.suspicion`     | `game_id`, `player`, `score`, `contributing_factors{}`                                                        | Behavioral analysis transparency                            |

**Tracking server events:**

| Event                     | JSON `data` Fields                                                           | Troubleshooting Value                 |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| `tracking.listing.create` | `game_id`, `map`, `host_hash`, `settings_summary`                            | Game creation patterns                |
| `tracking.listing.expire` | `game_id`, `age_s`, `reason` (TTL/host_departed)                             | Why games disappear from the browser  |
| `tracking.query`          | `query_type` (browse/search/filter), `params`, `results_count`, `latency_ms` | Search effectiveness, popular filters |

**Workshop server events:**

| Event               | JSON `data` Fields                                          | Troubleshooting Value                             |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| `workshop.publish`  | `resource_id`, `type`, `version`, `size_bytes`, `dep_count` | Publishing patterns, resource sizes               |
| `workshop.download` | `resource_id`, `version`, `requester_hash`, `latency_ms`    | Download volume, popular resources                |
| `workshop.resolve`  | `root_resource`, `dep_count`, `conflicts`, `latency_ms`     | Dependency hell frequency, resolution performance |
| `workshop.search`   | `query`, `filters`, `results_count`, `latency_ms`           | What people are looking for, search quality       |

**Server export and analysis:** Every server supports the same commands as the client — `ic-server analytics export`, `ic-server analytics inspect`, `ic-server analytics clear`. A relay operator troubleshooting laggy matches runs a SQL query against their local `telemetry.db` — no Grafana required. The exported SQLite file can be attached to a bug report or shared with the project team, identical workflow to the client.

**Distributed traces:** A multiplayer game session gets a trace ID (the `correlation` field). Every order, tick, and desync event references this trace ID. Debug a desync by searching for the game's trace ID across the relay's `telemetry.db` and the affected clients' exported `telemetry.db` files — correlate events that crossed component boundaries. For operators with OTEL enabled, the same trace ID routes to Jaeger for visual timeline inspection.

**Health endpoints:** Every server exposes `/healthz` (already designed) and `/readyz`. Prometheus scrape endpoint at `/metrics` (when OTEL export is enabled). These are standard and compose with existing k8s deployment (Helm charts already designed in `03-NETCODE.md`).

### Game Engine Telemetry (Client-Side)

The engine emits structured telemetry for debugging, profiling, and AI training — but only when enabled. **Hot paths remain zero-cost when telemetry is disabled** (compile-time feature flag `telemetry`).

#### Performance Instrumentation

Per-tick system timing, already needed for the benchmark suite (`10-PERFORMANCE.md`), exported as OTEL metrics when enabled:

```
sim.tick.duration_us                  # histogram: total tick time
sim.system.apply_orders_us            # histogram: per-system time
sim.system.production_us
sim.system.harvesting_us
sim.system.movement_us
sim.system.combat_us
sim.system.death_us
sim.system.triggers_us
sim.system.fog_us
sim.entities.total                    # gauge: entity count
sim.entities.by_type                  # gauge: per-component-type count
sim.memory.scratch_bytes              # gauge: TickScratch buffer usage
sim.pathfinding.requests              # counter: pathfinding queries per tick
sim.pathfinding.cache_hits            # counter: flowfield cache reuse
sim.pathfinding.duration_us           # histogram: pathfinding computation time
```

#### Gameplay Event Stream

Structured events emitted during simulation — the raw material for AI training and replay enrichment:

```rust
/// Gameplay events emitted by the sim when telemetry is enabled.
/// These are structured, not printf-style — each field is queryable.
pub enum GameplayEvent {
    UnitCreated { tick: u64, entity: EntityId, unit_type: String, owner: PlayerId },
    UnitDestroyed { tick: u64, entity: EntityId, killer: Option<EntityId>, cause: DeathCause },
    CombatEngagement { tick: u64, attacker: EntityId, target: EntityId, weapon: String, damage: i32, remaining_hp: i32 },
    BuildingPlaced { tick: u64, entity: EntityId, structure_type: String, owner: PlayerId, position: WorldPos },
    HarvestDelivered { tick: u64, harvester: EntityId, resource_type: String, amount: i32, total_credits: i32 },
    OrderIssued { tick: u64, player: PlayerId, order: PlayerOrder, validated: bool, rejection_reason: Option<String> },
    PathfindingCompleted { tick: u64, entity: EntityId, from: WorldPos, to: WorldPos, path_length: u32, compute_time_us: u32 },
    DesyncDetected { tick: u64, expected_hash: u64, actual_hash: u64, player: PlayerId },
    StateSnapshot { tick: u64, state_hash: u64, entity_count: u32 },
}
```

These events are:
- **Emitted as OTEL log records** with structured attributes (not free-text — every field is filterable)
- **Collected locally** into a SQLite gameplay event log alongside replays (D034) — queryable with ad-hoc SQL without an OTEL stack
- **Optionally exported** to a collector for batch analysis (tournament servers, AI training pipelines)

#### State Inspection (Development & Debugging)

A debug overlay (via `bevy_egui`, already in the architecture) that reads live telemetry:

- Per-system tick time breakdown (bar chart)
- Entity count by type
- Network: RTT, order latency, jitter
- Memory: scratch buffer usage, component storage
- Pathfinding: active flowfields, cache hit rate
- Fog: cells updated this tick, stagger bucket
- Sim state hash (for manual desync comparison)

This is the "game engine equivalent of a Kubernetes dashboard" — operators of tournament servers or mod developers can inspect the engine's internal state in real-time.

### AI / LLM Training Data Pipeline

The primary ML training pipeline is **replay-first** — deterministic replay files are the source of truth. Telemetry enriches replay-derived data with contextual signals not present in the order stream (see `research/ml-training-pipeline-design.md`):

| Consumer                      | Data Source                                          | Purpose                                                                   |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| `ic-ai` (skirmish AI)         | Replay-derived training pairs + telemetry enrichment | Learn build orders, engagement timing, micro patterns                     |
| `ic-llm` (missions)           | Replay-derived training pairs + telemetry enrichment | Learn what makes missions fun (engagement density, pacing, flow)          |
| `ic-editor` (replay→scenario) | Replay event log (SQLite)                            | Direct extraction of waypoints, combat zones, build timelines into editor |
| `ic-llm` (replay→scenario)    | Replay event log + context                           | Generate narrative, briefings, dialogue for replay-to-scenario pipeline   |
| Behavioral analysis           | Relay-side player profiles                           | APM, reaction time, input entropy → suspicion scoring (V12)               |
| Balance analysis              | Aggregated match outcomes                            | Win rates by faction/map/preset → balance tuning                          |
| Adaptive difficulty           | Per-player gameplay patterns                         | Build speed, APM, unit composition → difficulty calibration               |
| Community analytics           | Workshop + match metadata                            | Popular resources, play patterns, mod adoption → recommendations          |

**Privacy:** Gameplay events are associated with anonymized player IDs (hashed). No PII in telemetry. Players opt in to telemetry export (default: local-only for debugging). Tournament/ranked play may require telemetry for anti-cheat and certified results. See `06-SECURITY.md`.

**Data format:** Gameplay events export as structured OTEL log records → can be collected into Parquet/Arrow columnar format for operational analytics and balance analysis. The primary ML training pipeline is **replay-first** — deterministic replay files are the source of truth for training pairs (fog-filtered state + orders + outcome labels). Telemetry enriches replay-derived training data with contextual signals (camera attention, input habits, pacing snapshots) not present in the order stream. See `research/ml-training-pipeline-design.md` and `D031/D031-analytics.md` § "AI Training Data Export."


---

## Sub-Pages

| Section                  | Topic                                                                                                                                        | File                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Analytics & Architecture | Product analytics client event taxonomy (10 categories), analytical power, architecture, implementation approach, self-hosting observability | [D031-analytics.md](D031/D031-analytics.md) |
