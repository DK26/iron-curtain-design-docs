# Cloud-Native Lessons for IC Platform Design

> **Purpose:** Reverse analysis — what hard-won operational lessons from Kubernetes, cloud-native infrastructure, and private cloud operations are directly applicable to IC's content distribution platform, federation layer, server administration, and P2P architecture? This is the "vice-versa" companion to `research/p2p-decentralized-compute-cloud-exploration.md`.
>
> **Status:** Research artifact (March 2026). Identifies concrete design improvements the IC project should consider adopting from cloud-native operational experience. Some improvements are actionable now; others inform future phase design.
>
> **Date:** 2026-03-05
>
> **Referenced decisions:** D007 (relay), D030 (Workshop), D031 (telemetry), D034 (SQLite), D049 (P2P), D052 (community servers), D064 (server config), D071 (ICRP), D072 (server management), D074 (unified binary)
>
> **References:** `src/15-SERVER-GUIDE.md`, `src/decisions/09e/D074-community-server-unified-binary.md`, `src/decisions/09b/D064-server-tournament-configuration.md`, `src/decisions/09e/D052-community-servers-signed-credentials.md`, `src/modding/workshop.md`

---

## 0. The Observation

Kubernetes has been running production infrastructure at planet scale for over a decade. Its design is over-engineered for most use cases — but the *problems it solves* are universal. Every distributed system eventually encounters: "How do I know this node is healthy? How do I upgrade without downtime? What happens when storage fills up? How do I express what 'ready' means?"

IC's `ic-server` binary (D074) is a distributed system. It has multiple nodes (community servers), federation (cross-server trust), stateful storage (SQLite), long-running sessions (matches), and operators who need to upgrade without destroying in-flight work. The fact that it's a game server doesn't exempt it from the operational lessons that cloud infrastructure learned the hard way.

This document catalogs those lessons, maps each to a specific IC design surface, and proposes concrete improvements. None require adopting Kubernetes itself — these are **patterns**, not dependencies.

---

## 1. Readiness vs. Liveness — The Probe Distinction

### The K8s Lesson

Kubernetes distinguishes three probe types, and conflating them is one of the most common operational mistakes:

- **Startup probe:** "Has the process finished initializing?" (checked once, with generous timeout)
- **Liveness probe:** "Is the process alive and not deadlocked?" (checked continuously; failure = kill and restart)
- **Readiness probe:** "Is the process able to serve traffic *right now*?" (checked continuously; failure = remove from load balancer, but don't kill)

The critical insight: **a process can be alive but not ready.** A server that's running but whose database is locked, or that's mid-migration, or that's saturated with connections — it's alive (don't kill it) but not ready (don't send it new traffic).

### IC's Current State

IC has a single `/health` endpoint (D072) that returns HTTP 200 with a JSON body including status, version, uptime, player count, etc. This endpoint serves as a liveness check. There is no readiness or startup probe.

### What IC Should Adopt

**Add a `/ready` endpoint** that checks conditions beyond "process is running":

```json
GET /ready
{
  "ready": true,
  "checks": {
    "relay":     { "ok": true },
    "database":  { "ok": true, "writable": true },
    "tracker":   { "ok": true },
    "workshop":  { "ok": true, "seeding": true },
    "disk_space": { "ok": true, "free_gb": 12.4 }
  }
}
```

HTTP 200 if all checks pass. HTTP 503 if any critical check fails.

**Per-capability health** (aligned with D074's capability flags): each enabled capability reports its own readiness. If `[capabilities] workshop = true` but the Workshop seeder failed to initialize, the server should report itself as not ready for Workshop traffic — but still ready for relay traffic. This enables load balancers (or federation routing) to direct traffic only to nodes capable of serving it.

**Startup grace period:** After process start, the `/ready` endpoint should return 503 until all capabilities have completed initialization (DB opened, P2P engine listening, tracker announced). The `/health` endpoint should return 200 immediately (the process is alive). This prevents federation peers from routing traffic to a server that hasn't finished starting up.

**Where this matters for IC specifically:** When a community server restarts (binary update, crash recovery), other federation peers should stop routing new players/matchmaking to it until it reports ready. Currently, there's no mechanism for this — peers discover servers via federation and have no signal for "server is up but not ready."

**Phase:** This is a small addition to D072. The `/health` endpoint already exists — adding `/ready` is additive. No architectural changes needed. Implementable in Phase 5 alongside the relay server.

---

## 2. Graceful Shutdown with Drain Semantics

### The K8s Lesson

When Kubernetes wants to shut down a pod (upgrade, node drain, scaling down), it follows a strict protocol:

1. Pod is marked as "terminating" — it's immediately removed from all service endpoints (no new traffic arrives)
2. `preStop` hook executes (optional custom logic)
3. SIGTERM is sent to the main process
4. The process has `terminationGracePeriodSeconds` to shut down cleanly
5. If the process hasn't exited by then, SIGKILL

The lesson: **graceful shutdown is not "the process handles SIGTERM."** It's a coordinated drain where the ecosystem stops sending traffic *before* the process starts shutting down. The process itself should:
- Stop accepting new work
- Finish in-flight work (with a time budget)
- Flush persistent state
- Exit

### IC's Current State

D072 describes `ic server stop` as "graceful shutdown (finish current tick, save state, flush DB)." But there is no:
- Drain period (how long to wait for in-flight matches)
- Federation notification (other servers don't know this one is going down)
- Matchmaking removal (the matchmaking service may still route players here)
- Configurable grace period

### What IC Should Adopt

**Match-aware drain protocol:**

```
Phase 1: DRAIN ANNOUNCED
  - Server stops accepting new match creation requests
  - Server announces "draining" status to federation peers
  - Matchmaking service stops routing players to this server
  - Active matches continue unaffected

Phase 2: DRAIN ACTIVE (configurable: default 30 minutes)
  - In-flight matches run to completion (or timeout)
  - Players in lobby are notified: "This server is restarting. Your match will not be affected, but no new matches will be created."
  - Idle connections time out normally

Phase 3: FORCE DRAIN (after grace period)
  - Remaining matches are saved (snapshot) and players are disconnected with reason "server_restart"
  - Players receive a suggested alternative server (from federation)

Phase 4: SHUTDOWN
  - Flush all SQLite databases
  - Close P2P connections cleanly (BT disconnect messages)
  - Exit
```

The grace period should be configurable in `server_config.toml`:

```toml
[server]
shutdown_grace_period_secs = 1800    # 30 minutes — enough for most matches
shutdown_force_disconnect_reason = "server_restart"
shutdown_suggest_alternative = true   # tell disconnected players about federated alternatives
```

**The drain announcement should be a federation protocol message.** Other servers in the trust network learn that this server is draining and stop including it in server listings and matchmaking routing. This is analogous to K8s removing a terminating pod from service endpoints.

**Phase:** Design the drain protocol in Phase 5 alongside the relay server. The federation notification is a small addition to the federation sync protocol.

---

## 3. Configuration Versioning and Migration

### The K8s Lesson

Every K8s release includes automatic migration for its stored state (etcd). When you upgrade from K8s 1.28 to 1.29, the API server transparently handles schema differences. Resources created with old API versions are served with the current version, with automated conversion.

The broader cloud-native lesson: **every piece of persisted schema must be versioned, and every version bump must have a migration path.** This applies to:
- Database schemas (the obvious one)
- Configuration file formats (when fields are renamed, moved, or deprecated)
- Wire protocol versions (when message formats change)
- Serialized state formats (replay files, snapshots, credential files)

### IC's Current State

IC uses SQLite for persistent state (D034), TOML for configuration (D067), and custom binary formats for replays and credentials. Current design gaps:

- **No database schema versioning.** No `_meta` table, no migration scripts, no documented upgrade path when a column is added or a table restructured.
- **No configuration migration.** If a TOML field is renamed between versions (`relay.max_connections` → `relay.connection_limit`), the old config silently uses the default instead of the renamed value. D072 mentions "unknown key detection with typo suggestions" — but this only catches typos, not intentional renames from a previous version.
- **No wire protocol version negotiation.** The BEP 10 extension handshake includes `ic_version` but there's no documented policy for what happens when two peers disagree on version (reject? negotiate down?).

### What IC Should Adopt

**Database schema versioning:**

```sql
-- First migration (v1)
CREATE TABLE IF NOT EXISTS _schema_meta (
    version INTEGER NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    description TEXT
);
INSERT INTO _schema_meta (version, description) VALUES (1, 'Initial schema');
```

Every database (`relay.db`, `ranking.db`, `telemetry.db`, `workshop.db`) gets a `_schema_meta` table. On startup, the server checks the version, applies any pending migrations in order, and records the result. Migrations are embedded in the binary (not external SQL files — this preserves the "single binary, zero deps" philosophy of D072).

**Configuration migration with deprecation warnings:**

```toml
# server_config.toml — version field
[meta]
config_version = 3

# When the server encounters config_version < current:
# 1. Parse the old format
# 2. Apply migration rules (rename X→Y, move section A.B→C.B, etc.)
# 3. Log warnings: "[WARN] Config field 'relay.max_connections' is deprecated, use 'relay.connection_limit'"
# 4. Write the migrated config to server_config.toml (preserving comments via toml_edit)
# 5. Continue with the migrated values
```

This is not speculative — Minecraft's DataFixerUpper (referenced in AGENTS.md as a study target) exists precisely because versioned state migration is a problem every long-lived project faces. Better to design it in now (Phase 2, when the first SQLite schemas are defined) than retrofit it in Phase 5 when there are already community servers with production databases.

**Wire protocol version negotiation policy:**

```
Handshake:
  Client sends ic_version = 5
  Server supports [4, 5, 6]
  → Negotiate to min(client, max(server_supported)) = 5

  Client sends ic_version = 3
  Server supports [4, 5, 6]
  → Reject with reason: "protocol_version_too_old", minimum: 4

  Client sends ic_version = 7
  Server supports [4, 5, 6]
  → Negotiate to 6 (server's max), client must handle gracefully
```

Document the N-1 compatibility guarantee: the current server version must accept connections from the previous client version. This gives operators a one-version upgrade window.

**Phase:** Schema versioning should be established in Phase 2 (when SQLite schemas are first created). Config migration in Phase 5 (when community servers exist and upgrades become a real operational concern). Wire protocol versioning in Phase 5 (multiplayer launch).

---

## 4. Declarative Desired State vs. Imperative Commands

### The K8s Lesson

Kubernetes' most influential design decision: you declare *what you want* (desired state), not *how to get there* (imperative commands). You say "I want 3 replicas of this container" and the system continuously reconciles reality with your declaration. If a replica dies, the system creates a new one. If there are too many, it kills one. You never say "start a container" — you declare the desired state and the system converges.

This is why K8s is resilient: the desired state survives crashes, restarts, and network partitions. The system always knows where it's trying to get to.

### IC's Current State

IC's server administration is primarily imperative: `ic server start`, `ic server stop`, `ic server update apply`, `/set relay.max_games 50`. The operator issues commands and the system executes them. If the server crashes, the system doesn't know what state the operator wanted — it just restarts with whatever config is on disk.

The Workshop is more declarative: a mod's `manifest.yaml` declares dependencies, and the system resolves them. The `ic.lock` lockfile declares the exact resolved state. This is good — it's the reason Cargo, npm, and Go modules work well.

### What IC Should Adopt

**Declarative server state for federation:**

The federation layer should support a declarative desired state for the community:

```yaml
# community-desired-state.yaml
# "What our community should look like"
community:
  name: "RA Competitive League"

  # Relay capacity — at least 2 relays, each handling up to 50 games
  relays:
    min_replicas: 2
    max_replicas: 5
    per_relay:
      max_games: 50
      profile: competitive

  # Workshop seeding — content always available
  workshop:
    min_seeders: 1
    seed_packages:
      - "league/official-maps@^2.0"
      - "league/balance-patch@=3.1.0"

  # Ranking — exactly one authority
  ranking:
    replicas: 1
    season: "2026-Q1"
```

When an operator joins their node to the federation, the node pulls the desired state and self-configures. If a relay goes down, the remaining nodes know the community wants `min_replicas: 2` and can emit alerts ("Community RA Competitive League has 1/2 desired relays").

This doesn't require automated provisioning (that's the compute cloud from the companion doc). It just requires the federation to carry desired state alongside current state, so that operators and monitoring tools can see the gap.

**Declarative mod profiles (already close):**

D062 already describes mod profiles as declarative: "Source → Profile → Namespace." This is the right pattern. The lesson from K8s is to push this pattern further:

- The lockfile (`ic.lock`) is the resolved desired state
- The resolution system continuously reconciles: if a dependency is no longer available (revoked, server down), the system reports the divergence rather than silently using a stale cache
- Auto-update policies can be declarative: "keep `community/base-palettes` at `^1.0`, auto-update patch versions, ask before minor bumps"

**Phase:** Declarative community desired state is a Phase 5–6a design consideration. It's a federation protocol extension, not a core architecture change.

---

## 5. Resource Limits, Quotas, and Back-Pressure

### The K8s Lesson

K8s enforces resource limits at three levels:

1. **Container level:** CPU and memory limits per container. Exceeding memory → OOM kill. Exceeding CPU → throttled.
2. **Namespace level:** Resource quotas per team/project. Total CPU+memory across all containers in a namespace.
3. **Cluster level:** Limit ranges defining min/max per container.

The lesson isn't "add cgroups to IC." It's that **every shared resource needs an explicit budget, and exceeding the budget must have defined consequences.** Unbounded resource consumption is the root cause of most production incidents.

### IC's Current State

IC has bandwidth limits for P2P (`max_upload_speed`, `max_download_speed`) and connection limits for the relay (`max_connections`, `max_connections_per_ip`). These are good. But several resources lack explicit budgets:

| Resource                  | Budget Defined?                        | What Happens on Exhaustion?                         |
| ------------------------- | -------------------------------------- | --------------------------------------------------- |
| P2P bandwidth             | Yes (`RatePolicy`)                     | Throttled — peers choked                            |
| Relay connections         | Yes (`max_connections`)                | New connections rejected                            |
| SQLite disk space         | Partial (`telemetry` has `max_size`)   | `relay.db` and `ranking.db` grow unbounded          |
| Memory per match          | Not explicit                           | Unknown — no per-match memory budget                |
| CPU per tick              | Not explicit                           | Tick overrun → deadline miss → gameplay degradation |
| Workshop cache            | Yes (`cache_size_limit`, LRU eviction) | Evicted — correct                                   |
| Replay storage            | Not explicit                           | Grows unbounded                                     |
| Federation sync bandwidth | Not explicit                           | Could saturate during large federated updates       |

### What IC Should Adopt

**Explicit disk budgets for all SQLite databases:**

```toml
[db.relay]
max_size_mb = 500          # relay.db — match metadata, player stats
on_limit = "prune_oldest"  # or "reject_new" or "alert_only"

[db.ranking]
max_size_mb = 200          # ranking.db — Glicko-2 state
on_limit = "archive_old_seasons"  # move completed seasons to archive.db

[db.telemetry]
max_size_mb = 100          # already defined — good
on_limit = "prune_oldest"  # already defined — good

[db.workshop]
max_size_mb = 1000         # workshop.db — content metadata
on_limit = "alert_only"    # metadata is small; if this fills, something is wrong
```

The `on_limit` behavior is the key lesson: don't just define the limit — define what the system *does* when the limit is hit. K8s kills pods that exceed memory limits. IC should have equally deterministic behavior.

**Back-pressure for federation sync:**

When a server joins the federation after extended downtime, it needs to sync potentially large volumes of manifest data, revocation records, and trust signals. Without rate limiting, this sync storm can saturate the network.

```toml
[federation]
sync_bandwidth_limit = "5 MB/s"         # cap sync throughput
sync_batch_size = 100                    # manifests per sync batch
sync_backoff_on_failure = "exponential"  # 1s → 2s → 4s → max 60s
```

This is the same principle as K8s `--kube-api-burst` and `--kube-api-qps` — limit the rate at which a component talks to shared infrastructure.

**Phase:** Disk budgets are a Phase 2 concern (when SQLite schemas are first created). Federation rate limiting is Phase 5.

---

## 6. Controller / Reconciliation Loop Pattern

### The K8s Lesson

A K8s controller is a loop:

```
while true:
    desired = read_desired_state()
    actual  = observe_actual_state()
    diff    = desired - actual
    if diff:
        take_action(diff)
    sleep(interval)
```

This "observe → diff → act" pattern is extraordinarily robust. It's self-healing (recovers from any deviation without operator intervention), idempotent (running the loop twice with same state has no effect), and transparent (the diff is inspectable).

### What IC Should Adopt

**Workshop content reconciliation loop:**

The Workshop client already downloads dependencies. But the reconciliation model could be made explicit:

```
Every 5 minutes (configurable):
    desired = resolve(manifest.yaml + ic.lock)
    actual  = scan(local_cache)
    missing = desired - actual
    extra   = actual - desired (unused cached packages)
    revoked = actual ∩ revocation_list

    for pkg in missing:
        download(pkg)     # P2P preferred
    for pkg in revoked:
        quarantine(pkg)   # move to quarantine dir, stop seeding
    for pkg in extra:
        if cache_pressure:
            evict(pkg)    # LRU eviction
```

This isn't new functionality — IC already does most of this. The change is making the reconciliation loop *explicit and periodic*, rather than triggered only on user action. Benefits:
- Revoked packages are quarantined even if the player doesn't manually check for updates
- Missing dependencies are detected before the player tries to join a game (no surprise "downloading mods" delay in lobby)
- Cache pressure is managed continuously, not only on next download

**Federation trust reconciliation loop:**

```
Every 10 minutes:
    desired = trust_anchors consensus document
    actual  = local trust state (trusted/untrusted/revoked servers)
    diff    = desired - actual

    for server in diff.newly_trusted:
        add_to_federation(server)
    for server in diff.newly_revoked:
        stop_federation(server)
        purge_content_from(server)  # if malicious
```

**Server health self-reconciliation:**

```
Every 30 seconds:
    desired = capabilities from server_config.toml
    actual  = running capability status

    if desired.relay && !actual.relay_ready:
        restart_relay_subsystem()
    if desired.workshop && !actual.workshop_seeding:
        reinitialize_workshop_seeder()
    # etc.
```

This is the self-healing property that makes K8s operators so powerful. If a subsystem crashes (Workshop seeder dies due to transient I/O error), the reconciliation loop restarts it without the operator noticing. Currently, IC would require the operator to notice the failure and restart the entire server.

**Phase:** Content reconciliation loop in Phase 4 (when the Workshop client is built). Federation reconciliation in Phase 5. Server health reconciliation in Phase 5.

---

## 7. Labels, Selectors, and Metadata-Driven Routing

### The K8s Lesson

Everything in K8s carries arbitrary key-value labels. A Pod might have `app=relay`, `tier=production`, `region=eu-west`, `game=ra1`. Services select pods by label match. This decouples identity from topology — you don't address a pod by name, you address it by what it *is*.

### What IC Should Adopt

**Server capability labels for federation routing:**

Federation servers currently identify by URL and trust tier. Adding structured labels enables intelligent routing:

```toml
# server_config.toml
[server.labels]
region = "eu-west"
game_module = "ra1"
tier = "competitive"
provider = "community-guild-xyz"
capabilities = ["relay", "tracker", "workshop", "ranking"]
bandwidth_class = "high"      # gigabit, high, medium, low
```

The matchmaking system can then route players to servers by label selector: "find a relay in `region=eu-west` with `tier=competitive` and `game_module=ra1`." This is more expressive than the current priority-based source ordering and enables:

- **Geographic routing:** Players connect to the nearest relay (lower latency)
- **Game-module routing:** RA1 players go to RA1 servers, TD players go to TD servers
- **Tier routing:** Ranked games go to `tier=competitive` servers, casual games to `tier=casual`
- **Capability routing:** A player who needs Workshop content is routed to a server with `workshop` capability

**Workshop content labels for discovery:**

Content already has tags, but tags are flat strings. Structured labels enable more powerful queries:

```yaml
# manifest.yaml
labels:
  game_module: ra1
  category: map
  terrain: snow
  player_count: "2-8"
  balance_patch: "3.1"
  competitive: "true"
```

Combined with schema-based discovery (Platform Evolution § 3.2), labels become the standard mechanism for browsing and filtering content. The existing FTS5 text search handles freeform queries; labels handle structured faceted search.

**Phase:** Server labels are a small addition to D074's capability flags — extend from boolean capabilities to key-value metadata. Implementable when the federation protocol is designed (Phase 5). Content labels are a small manifest extension — implementable when the Workshop is built (Phase 4).

---

## 8. Observability as a First-Class Design Concern

### The K8s Lesson

The cloud-native observability stack has converged on three pillars:
- **Metrics:** Numeric time series (Prometheus). "What is happening right now?"
- **Logs:** Structured event records (Loki, ELK). "What happened?"
- **Traces:** Request-scoped causality chains (Jaeger, Zipkin). "Why did it happen?"

K8s doesn't mandate specific tools, but the ecosystem has standardized on OpenTelemetry (OTEL) as the collection layer. The lesson: **design for observability from the start, not as an afterthought.** Instrument first, decide where to send the data later.

### IC's Current State

IC's observability design (D031) is actually ahead of most projects: local-first SQLite telemetry, optional OTEL export, structured logging via `tracing`, per-component metrics. This is good.

The gaps are in *operational* observability — the things an operator needs to debug a production issue in real time:

### What IC Should Improve

**Structured events for operator-critical paths:**

The following events should be first-class structured telemetry events with dedicated metric counters (not just log lines):

| Event                                        | Why It Matters         | Proposed Metric                                          |
| -------------------------------------------- | ---------------------- | -------------------------------------------------------- |
| Match start                                  | Capacity tracking      | `ic_match_started_total{game_module, player_count}`      |
| Match end (normal)                           | Utilization tracking   | `ic_match_completed_total{game_module, duration_bucket}` |
| Match end (abnormal: desync, abandon, crash) | Reliability tracking   | `ic_match_failed_total{reason}`                          |
| Player join                                  | Growth tracking        | `ic_player_connected_total{source}`                      |
| Player disconnect                            | Churn tracking         | `ic_player_disconnected_total{reason}`                   |
| Config reload                                | Operational audit      | `ic_config_reload_total{result}`                         |
| Federation sync                              | Health of federation   | `ic_federation_sync_total{peer, result}`                 |
| Workshop content revoked                     | Security               | `ic_content_revoked_total{reason}`                       |
| DB size checkpoint                           | Capacity planning      | `ic_db_size_bytes{database}`                             |
| Tick deadline miss                           | Performance regression | `ic_tick_overrun_total`                                  |

These should be queryable from the existing OTEL export (Prometheus scrape at `/metrics`), from ICRP event subscriptions (for external tools — D071), and from the built-in web dashboard (D072).

**Request tracing for order pipeline:**

An order's journey — player input → client validation → network serialization → relay receipt → relay validation → relay broadcast → client receipt → sim execution — should carry a trace ID. When a desync occurs, the operator pulls the trace for the divergent tick and can see:
- What orders were issued by each player
- When the relay received and rebroadcast each order
- Whether any order was dropped, reordered, or delayed
- Which player's state diverged first

This directly enables the "desync forensics" capability D072 mentions but doesn't detail.

**Phase:** Metric counters are implementable from Phase 2 (sim) onward. Order tracing is a Phase 5 (multiplayer) concern. Both are small additions to existing `tracing` instrumentation.

---

## 9. Immutable Infrastructure and Reproducible Deployments

### The K8s Lesson

Cloud-native infrastructure treats servers as cattle, not pets. A production server should be reproducible from its configuration — if you lose the server, you recreate it from the same config, the same image, the same data. Nothing is hand-tuned on the running instance.

The consequence: **configuration that is only in the running process's memory is configuration that will be lost.** Every setting must be persisted, versioned, and reproducible.

### IC's Current State

D072 describes runtime cvars (`/set relay.max_games 50`) as "persist only for process lifetime (not written back to TOML)." This means:
- An operator tunes a parameter during a tournament
- The server restarts (crash, update, maintenance)
- The tuning is lost
- The operator must remember to re-apply it — or, more likely, doesn't, and wonders why the next tournament behaves differently

### What IC Should Adopt

**Persist-on-request for runtime cvars:**

```
/set relay.max_games 50               # transient — lost on restart
/set relay.max_games 50 --persist     # written to server_config.toml via toml_edit
```

The `--persist` flag writes the value to the TOML file while preserving comments and formatting (using the `toml_edit` crate already specified in D067). This gives operators the choice: temporary adjustments for a specific event, or permanent configuration changes, using the same command.

**Server state snapshot for reproducibility:**

```
ic server snapshot > server-state-2026-03-05.json
```

Dumps the complete current state: config (including runtime overrides), database sizes, running matches, connected players, federation peers, Workshop content inventory. This snapshot enables:
- Debugging: "Here's exactly what the server looked like when the problem occurred"
- Reproducibility: "Deploy a new server with this exact state"
- Auditing: "Here's what changed between Tuesday and Wednesday"

This is the equivalent of `kubectl get all -o yaml` — a complete serialization of the system's current state.

**Phase:** `--persist` for cvars is a small addition to the `/set` command handler — implementable whenever the admin console is built (Phase 5). State snapshot is a nice-to-have for Phase 6.

---

## 10. Health-Based Routing and Circuit Breakers

### The K8s Lesson

A K8s Service load-balances traffic to healthy pods and removes unhealthy pods from the rotation. If a pod fails its readiness probe, it stops receiving traffic — immediately, automatically, no operator intervention.

The circuit breaker pattern (popularized by Hystrix, now standard) extends this: if a downstream dependency is failing, stop calling it. Wait for it to recover. Don't cascade the failure.

### What IC Should Adopt

**Health-based federation routing:**

When a community server is degraded (high latency, saturated connections, failing health checks), the federation should automatically deprioritize it:

```
Federation peer health scoring:
  - Last health check response time
  - Success rate of recent health checks
  - Self-reported capacity (from /health: player_count vs player_max)
  - P2P peer score (existing EWMA, extends naturally to federation)

Score < threshold → server is "degraded" → matchmaking routes away from it
Score < critical → server is "unavailable" → removed from server listings
Score recovers → server re-enters rotation (with hysteresis to prevent flapping)
```

This reuses the EWMA peer scoring infrastructure that already exists for P2P. The extension is applying peer scoring to federation servers, not just individual P2P peers.

**Circuit breaker for external dependencies:**

When the Workshop server that a community server uses as a content source is down, the community server should not hammer it with retries:

```
State: CLOSED (normal)
  → Requests go through normally
  → On failure: increment failure counter

State: OPEN (tripped)
  → After N failures in M seconds: stop sending requests
  → Return cached data / fallback
  → Start timer for half-open probe

State: HALF-OPEN (testing)
  → Send a single probe request
  → Success → CLOSED
  → Failure → OPEN (reset timer)
```

The P2P engine already has exponential backoff for tracker announces and peer reconnections. The circuit breaker pattern generalizes this to all external dependencies (federation peers, Workshop sources, OTEL exporters).

**Phase:** Federation health scoring is Phase 5. Circuit breaker for external dependencies is Phase 4–5.

---

## 11. Secrets Management

### The K8s Lesson

K8s Secrets are a separate resource type from ConfigMaps. They're base64-encoded (not encrypted at rest by default — this is a known weakness), mounted as files or environment variables, and have restricted RBAC. The lesson: **treat secrets as a distinct category of configuration, not a field in a general-purpose config file.**

### IC's Current State

D072 mentions ICRP passwords in `server_config.toml` and admin identity keys. These are secrets stored in a plaintext TOML file alongside non-sensitive configuration. Environment variables (`IC_*`) can override TOML values — this is the standard Docker/K8s pattern for injecting secrets.

### What IC Should Adopt

**Separate secrets from configuration:**

```toml
# server_config.toml — no secrets here
[admin]
identity_key_file = "secrets/admin.key"    # reference, not inline

[icrp]
# password not stored here — injected via env var or secrets file
```

```toml
# secrets.toml — separate file, stricter permissions (0600)
[icrp]
password_hash = "$argon2id$..."    # hashed, not plaintext

[admin]
# Or: identity key loaded from a separate keyfile
```

The `ic server validate-config` command should warn if it detects plaintext secrets in `server_config.toml`:

```
[WARN] server_config.toml contains 'icrp.password' in plaintext.
       Move to secrets.toml or use env var IC_ICRP_PASSWORD.
```

**Phase:** This is a security hygiene item. Can be addressed in Phase 5 alongside the server management CLI.

---

## 12. Summary — Priority-Ordered Catalog

The lessons are ordered by impact-to-effort ratio and mapped to IC's development phases:

| #   | Lesson                                  | IC Improvement                                                         | Phase | Effort |
| --- | --------------------------------------- | ---------------------------------------------------------------------- | ----- | ------ |
| 1   | **Readiness vs. liveness probes**       | Add `/ready` endpoint with per-capability health                       | 5     | Small  |
| 2   | **Graceful shutdown drain**             | Match-aware drain protocol with federation notification                | 5     | Medium |
| 3   | **Schema versioning**                   | `_schema_meta` table in all SQLite DBs + embedded migrations           | 2     | Small  |
| 4   | **Config migration**                    | `config_version` field + deprecation warnings + auto-migration         | 5     | Medium |
| 5   | **Wire protocol version negotiation**   | N-1 compatibility guarantee + documented negotiation                   | 5     | Small  |
| 6   | **Resource limits for all storage**     | Explicit disk budgets for all SQLite DBs with `on_limit` behavior      | 2     | Small  |
| 7   | **Reconciliation loops**                | Explicit periodic reconciliation for content, federation, health       | 4–5   | Medium |
| 8   | **Server labels for routing**           | Key-value metadata on federation servers for intelligent routing       | 5     | Small  |
| 9   | **Operational metrics**                 | First-class counters for match lifecycle, player flow, federation sync | 2+    | Small  |
| 10  | **Order pipeline tracing**              | Trace IDs on orders for desync forensics                               | 5     | Medium |
| 11  | **Cvar persistence**                    | `--persist` flag for `/set` command                                    | 5     | Small  |
| 12  | **Health-based federation routing**     | EWMA scoring for federation servers with automatic deprioritization    | 5     | Medium |
| 13  | **Circuit breakers**                    | State machine for external dependency failure handling                 | 4–5   | Small  |
| 14  | **Secrets separation**                  | `secrets.toml` + warning for plaintext secrets in config               | 5     | Small  |
| 15  | **Declarative community desired state** | Federation carries desired state for monitoring and alerting           | 5–6a  | Medium |

**Key takeaway:** Most of these improvements are small additions to existing designs, not architectural changes. The reason: IC's design already has the right primitives (EWMA scoring, federation, Content Channels, layered config). The cloud-native lessons are about *operational discipline* — explicit budgets, versioned schemas, defined degradation behavior, separation of concerns — not new architecture.

---

## 13. Anti-Lessons — What NOT to Adopt from K8s

Not every K8s pattern is beneficial. Some are solutions to problems IC doesn't have, or introduce complexity that isn't justified:

| K8s Pattern                            | Why IC Should NOT Adopt It                                                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **etcd / Raft consensus**              | IC's federation model is eventually consistent by design. Linearizable consensus adds latency, operational complexity, and a single point of failure. CRDTs + negotiation are the right choice for federation. |
| **Per-pod IP addressing**              | IC's relay model is order-routing, not simulation hosting. No per-match IP address is needed. Direct peer connections + relay mediation is sufficient.                                                         |
| **Custom Resource Definitions (CRDs)** | IC's extension model is YAML→Lua→WASM (D004/D005). CRDs solve extensibility for API-server-centric systems; IC's extension points are trait-based, not schema-based.                                           |
| **Sidecar injection**                  | IC's single-binary philosophy (D074) is correct. Sidecars solve "compose capabilities from independent containers" — a container-orchestration problem IC doesn't have.                                        |
| **Helm / Kustomize templating**        | IC already has a simpler answer: deployment profiles (D064). TOML sections are enough. Helm's template-of-template complexity is a cure worse than the disease for IC's deployment model.                      |
| **Service mesh (Istio, Linkerd)**      | IC's federation protocol handles server-to-server communication. A service mesh adds mTLS, retries, and traffic shaping — valuable at 1000+ microservices, overkill for 2–20 community servers.                |
| **Namespace isolation**                | IC uses trust tiers for multi-tenancy. K8s namespaces are a coarser tool for a different problem (team isolation within an org).                                                                               |

The general principle: **adopt the lessons, not the machinery.** K8s's insights about readiness probes, graceful shutdown, schema versioning, and reconciliation loops are universal. K8s's implementation machinery (etcd, CRDs, sidecars, service mesh) solves problems at a scale and in an execution context that doesn't match IC.
