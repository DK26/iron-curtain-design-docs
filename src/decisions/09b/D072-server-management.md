## D072: Dedicated Server Management — Simple by Default, Scalable by Choice

|                |                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                                                          |
| **Phase**      | Phase 2 (`/health` + logging), Phase 5 (full CLI + web dashboard + in-game admin + scaling), Phase 6a (self-update + advanced monitoring)                                        |
| **Depends on** | D007 (relay server), D034 (SQLite), D052 (community servers), D058 (command console), D064 (server config), D071 (ICRP external tool API)                                       |
| **Driver**     | Community server operators need to set up, configure, monitor, and manage dedicated servers with minimal friction. The typical operator is a technically-savvy community member on a $5 VPS, not a professional sysadmin. |

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Multi-phase (health+logging → full management → advanced ops)
- **Canonical for:** Server lifecycle management, admin interfaces (CLI/web/in-game/remote), monitoring, scaling, deployment patterns
- **Decision:** IC's dedicated server is a **single binary** that handles everything — relay, matchmaking, workshop, administration — with five management interfaces: CLI, config file, built-in web dashboard, in-game admin, and ICRP remote commands. Complexity is opt-in. Scaling is horizontal (run more instances), not vertical (split one instance into containers).
- **Why:** Zero of ten studied games ship a built-in web admin panel. Most require third-party tools, external databases, or complex setups. IC's "$5 VPS operator" needs something that works in 60 seconds.
- **Non-goals:** Microservice architecture, container orchestration as a requirement, managed hosting platform, proprietary admin tools
- **Keywords:** dedicated server, server management, CLI, web dashboard, admin panel, monitoring, health endpoint, scaling, Docker, LAN party, deployment profiles

### Core Philosophy: Just a Binary

```
$ ./ic-relay
[INFO] Iron Curtain Relay Server v0.5.0
[INFO] Config: server_config.toml (created with defaults)
[INFO] Database: relay.db (created)
[INFO] ICRP: ws://127.0.0.1:19710 (password auto-generated: AxK7mP2q)
[INFO] Web dashboard: http://127.0.0.1:19710/dashboard
[INFO] Health: http://127.0.0.1:19710/health
[INFO] Game: udp://0.0.0.0:19711
[INFO] Ready. Waiting for players.
```

That's it. Download binary. Run it. Server is live. Config file created with sane defaults. Database created automatically. Dashboard accessible from a browser. No external dependencies. No database server. No container runtime. No package manager.

**The SQLite principle applied to game servers:** SQLite succeeded because it's "just a file" — no DBA, no server process, no configuration. IC's relay server succeeds because it's "just a binary" — no Docker, no cloud account, no infrastructure team.

### Five Management Interfaces

Every server operation is accessible through multiple interfaces. The operator picks whichever fits their workflow. All interfaces call the same underlying functions — they are views into the same system, not separate systems.

| Interface | Best for | Available from |
|-----------|----------|---------------|
| **Config file** (`server_config.toml`) | Initial setup, version-controlled infrastructure | Phase 0 (already designed, D064) |
| **CLI** (`ic server *`) | Automation, scripts, SSH sessions, CI/CD | Phase 5 |
| **Built-in Web Dashboard** | Visual monitoring, quick admin actions, LAN party management | Phase 5 |
| **In-Game Admin** | Playing admins who need to kick/pause/announce without alt-tabbing | Phase 5 |
| **ICRP Remote** (D071) | External tools, Discord bots, tournament software, custom dashboards | Phase 5 (via D071) |

#### 1. Config File (`server_config.toml`)

Already designed in D064. The single source of truth for server configuration. ~200 parameters across 14 subsystems. Key additions for server management:

**Hot-reload categories:**

| Category | Hot-reloadable? | Examples |
|----------|----------------|---------|
| **Gameplay** | Between matches only | max_players, map_pool, game_speed |
| **Administration** | Yes (immediate) | MOTD, rate limits, ban list, admin list |
| **Network** | Restart required | bind address, port, protocol version |
| **Database** | Restart required | database path, WAL settings |

The server watches `server_config.toml` for filesystem changes (via `notify` crate). When a hot-reloadable setting changes:
- Apply immediately
- Log: `[INFO] Config reloaded: motd changed, rate_limit_per_ip changed`
- Emit ICRP event: `admin.config_changed`
- If a restart-required setting changed: `[WARN] Setting 'bind' changed but requires restart`

**Deployment profiles** (already in D064) switchable at runtime between matches:

```
ic server rcon 'profile tournament'
> Profile switched to 'tournament' (effective next match)
```

#### 2. CLI (`ic server *`)

The `ic server` subcommand family manages server lifecycle. Inspired by LinuxGSM's uniform interface, Docker CLI, and `systemctl`.

```
# Lifecycle
ic server start                        # Start relay (foreground, logs to stdout)
ic server start --daemon               # Start as background process (PID file)
ic server stop                         # Graceful shutdown (finish current tick, save state, flush DB)
ic server restart                      # Stop + start (waits for current match to reach a safe point)
ic server status                       # Print health summary (same data as /health)

# Configuration
ic server config validate              # Validate server_config.toml (check ranges, types, consistency)
ic server config diff                  # Show differences from default config
ic server config show                  # Print active config (including runtime overrides)

# Administration
ic server rcon "command"               # Send a single command to a running server via ICRP
ic server console                      # Attach interactive console to running server (like docker attach)
ic server token create --tier admin    # Create ICRP auth token for remote admin
ic server token list                   # List active tokens
ic server token revoke <id>            # Revoke a token

# Data
ic server backup create                # Snapshot SQLite DB + config to timestamped archive
ic server backup list                  # List available backups
ic server backup restore <file>        # Restore from backup
ic server db query "SELECT ..."        # Read-only SQL query against server databases

# Updates
ic server update check                 # Check if newer version available
ic server update apply                 # Download, verify signature, apply (backup current binary first)
```

**`ic server console`** attaches an interactive REPL to a running server process. The operator types server commands directly — same commands available via ICRP, same commands available in the in-game console. Tab completion, command history, colored output.

**`ic server rcon`** is a one-shot command sender. Connects via ICRP (WebSocket), sends the command, prints the response, disconnects. Reads the ICRP password from `server_config.toml` or `IC_RCON_PASSWORD` env var. This makes the CLI itself an ICRP client — no separate protocol.

#### 3. Built-in Web Dashboard

A minimal, zero-dependency web dashboard embedded in the relay binary. Served on the ICRP HTTP port (default `http://localhost:19710/dashboard`). No Node.js, no npm, no build pipeline — the HTML/CSS/JS is compiled into the binary via Rust's `include_str!`.

```
┌──────────────────────────────────────────────────────────────────┐
│  IRON CURTAIN SERVER DASHBOARD              [admin ▾] [Logout]  │
│                                                                  │
│  ┌─ STATUS ──────────────────────────────────────────────────┐  │
│  │  Server: My RA Server          Profile: competitive       │  │
│  │  Version: 0.5.0                Uptime: 3d 14h 22m        │  │
│  │  Players: 6/12                 Matches today: 47          │  │
│  │  Tick rate: 30/30 tps          CPU: 12%  RAM: 142 MB     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ ACTIVE MATCHES ─────────────────────────────────────────┐   │
│  │  #42  soviet_vs_allies  Coastal Fortress  12:34  6 players│  │
│  │       [Pause] [End Match] [Spectate]                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ PLAYERS ────────────────────────────────────────────────┐   │
│  │  CommanderZod     Soviet  Captain II   ping: 23ms [Kick] │  │
│  │  alice            Allied  Private I    ping: 45ms [Kick] │  │
│  │  TankRush99       Soviet  Corporal     ping: 67ms [Kick] │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [Server Log]  [Config]  [Bans]  [Backups]  [Matches History]   │
└──────────────────────────────────────────────────────────────────┘
```

**Dashboard pages:**

| Page | What it shows |
|------|--------------|
| **Status** (home) | Server health, active matches, player count, tick rate, CPU/RAM, uptime |
| **Players** | Connected players with ping, rating, kick/ban buttons, profile links |
| **Matches** | Active and recent matches with map, players, duration, result, replay download |
| **Server Log** | Live-tailing log viewer (last 500 lines, filterable by severity) |
| **Config** | Current `server_config.toml` with inline editing for hot-reloadable fields. Restart-required fields are grayed with a note. |
| **Bans** | Ban list management (add/remove/search) |
| **Backups** | List backups, create new, download, restore |

**Auth:** Same ICRP challenge-response password as the API. The dashboard is a web client of ICRP — it makes the same JSON-RPC calls that any external tool would. Login page prompts for the ICRP password.

**Why embed in the binary?** The "$5 VPS operator" should not need to install a web framework, configure a reverse proxy, or manage a separate application. One binary serves the game AND the dashboard. The embedded web UI is ~200 KB of HTML/CSS/JS — negligible compared to the relay binary size.

#### 4. In-Game Admin (Playing Admin)

An admin who is playing in a match can manage the server without alt-tabbing or opening a browser. This uses the existing D058 command console with admin-scoped commands.

**Admin identity:** Admin list in `server_config.toml` references player identity keys (D052 Ed25519 public keys), not passwords:

```toml
[admin]
# Players with admin privileges (by identity public key)
admins = [
    "ed25519:7f3a...b2c1",  # CommanderZod
    "ed25519:a1d4...e8f2",  # ops_guy
]

# Players with moderator privileges (kick/mute, no config changes)
moderators = [
    "ed25519:c3b7...9a12",  # trusted_player
]
```

**In-game admin commands** (via `/` in chat or F12 console):

```
/admin kick <player> [reason]         # Kick a player
/admin ban <player> <duration> [reason]  # Ban (1h, 1d, 7d, permanent)
/admin mute <player> [duration]       # Mute in chat
/admin pause                          # Pause match (all players see pause screen)
/admin unpause                        # Resume
/admin say "Server restarting in 5 minutes"  # Server-wide announcement
/admin map <name>                     # Change map (between matches)
/admin profile <name>                 # Switch deployment profile (between matches)
/admin status                         # Show server health in console
```

**Admin vs moderator:**

| Action | Moderator | Admin |
|--------|-----------|-------|
| Kick player | Yes | Yes |
| Mute player | Yes | Yes |
| Ban player | No | Yes |
| Pause/unpause | No | Yes |
| Change map | No | Yes |
| Change profile | No | Yes |
| Server announcements | No | Yes |
| View server status | Yes | Yes |
| Modify config | No | Yes |

**Visual indicator:** Admins see a subtle `[A]` badge next to their name in the player list. Moderators see `[M]`. This is visible to all players — transparent authority.

#### 5. ICRP Remote (D071)

Already designed in D071. The `admin` tier of ICRP provides all server management operations over WebSocket/HTTP. External tools (Discord bots, tournament software, mobile apps) connect via ICRP.

This interface is how the web dashboard, CLI `ic server rcon`, and third-party tools all communicate with the server. It is the canonical API — the other interfaces are UIs on top of it.

### Health Endpoint (`/health`)

A simple HTTP GET endpoint, zero-auth, rate-limited (1 req/sec). Returns server health as JSON:

```json
GET http://localhost:19710/health

{
  "status": "ok",
  "version": "0.5.0",
  "uptime_seconds": 307320,
  "tick_rate": 30,
  "tick_rate_target": 30,
  "player_count": 6,
  "player_max": 12,
  "active_matches": 1,
  "cpu_percent": 12.3,
  "memory_mb": 142,
  "db_size_mb": 8.2,
  "profile": "competitive",
  "game_module": "ra1"
}
```

Enables: Uptime Kuma, Prometheus blackbox exporter, Kubernetes liveness probes, Discord bot status, Grafana dashboards, custom monitoring scripts — all without ICRP authentication.

### Structured Logging

Using Rust's `tracing` crate with `tracing-subscriber` and `tracing-appender`:

```
2026-02-25T14:32:01.123Z INFO  [relay] Server started on 0.0.0.0:19710 (profile: competitive)
2026-02-25T14:32:05.456Z INFO  [match] Match #42 started: 2v2 on Coastal Fortress
2026-02-25T14:32:05.789Z INFO  [player] CommanderZod (key:7f3a..b2c1) joined match #42
2026-02-25T14:33:12.001Z WARN  [tick] Tick budget exceeded: 72ms (budget: 33ms) on tick 1847
2026-02-25T14:35:00.000Z INFO  [admin] CommanderZod (via:in-game) kicked griefer99 (reason: "griefing")
2026-02-25T14:35:00.001Z ERROR [db] SQLite write failed: disk full
```

**Format:** ISO 8601 timestamp, severity (TRACE/DEBUG/INFO/WARN/ERROR), module tag, message.

**Output targets (configurable in `server_config.toml`):**

```toml
[logging]
# Console output (stdout)
console_level = "info"           # trace, debug, info, warn, error
console_format = "human"         # "human" (colored, readable) or "json" (machine-parseable)

# File output
file_enabled = true
file_path = "logs/relay.log"
file_level = "debug"
file_format = "json"             # JSON-lines for Loki/Datadog/Elasticsearch
file_rotation = "daily"          # "daily", "hourly", or "size:100mb"
file_retention_days = 30

# ICRP subscription (live log tailing for web dashboard and tools)
icrp_log_level = "info"
```

**Every admin action is logged with identity and interface:**

```json
{"timestamp":"2026-02-25T14:35:00.000Z","level":"INFO","module":"admin","message":"Player kicked","admin":"CommanderZod","admin_key":"7f3a..b2c1","interface":"in-game","target":"griefer99","reason":"griefing"}
```

This provides a complete audit trail regardless of which management interface was used.

### Scaling: Run More Instances

IC does not split a single server into microservices. A dedicated server is one process that handles everything. Scaling is horizontal — run more instances.

**Why not microservices?**

| Approach | Complexity | Benefit | IC verdict |
|----------|-----------|---------|------------|
| **Single binary** (IC default) | Minimal — one process, one config, one database | Handles 99% of community server use cases | Default. The $5 VPS path. |
| **Multiple instances** (horizontal scaling) | Low — same binary, different ports/configs | Handles high player counts by running more servers | Supported. Just run more copies. |
| **Container per instance** (Docker) | Medium — Dockerfile, volume mounts | Isolation, resource limits, easy deployment on cloud | Optional. Official Dockerfile provided. |
| **Microservice split** (relay + matchmaking + workshop as separate services) | High — service discovery, inter-service auth, distributed state | Only needed at massive scale (thousands of concurrent players) | Not designed for. If IC reaches this scale, it's a future architecture decision. |

**How operators scale:**

```
# LAN party (1 server, 12 players)
./ic-relay

# Small community (2-3 servers, 50 players)
./ic-relay --config server1.toml --port 19711
./ic-relay --config server2.toml --port 19712

# Larger community (cloud, auto-scaling)
# Use Docker Compose or Kubernetes with the official image
docker compose up --scale relay=5
```

**Multiple instances share nothing.** Each instance has its own `server_config.toml`, its own SQLite database, its own ICRP port. They do not communicate with each other directly. The community server infrastructure (D052) handles player routing — the matchmaking service knows which relay instances are available and directs players to ones with capacity.

**Auto-scaling is the community's responsibility, not the engine's.** IC provides the building blocks (health endpoint for load balancers, Docker image for orchestration, stateless-enough design for horizontal scaling). Kubernetes autoscaling, cloud VM provisioning, or manual `./ic-relay` launches are all valid — IC does not mandate an approach.

### Docker Support (Optional, First-Party)

An official Dockerfile and Docker Compose example are provided. They are maintained alongside the engine, not by the community.

**Two image variants** — operators choose based on their needs:

| Variant | Base | Size | Use case |
|---------|------|------|----------|
| **`relay:latest`** (scratch + musl) | `scratch` | ~8-12 MB | Production. Minimum attack surface. No shell, no OS, no package manager. Just the binary. |
| **`relay:debug`** | `debian:bookworm-slim` | ~80 MB | Debugging. Includes shell, curl, sqlite3 CLI for troubleshooting. |

**Production Dockerfile (scratch + musl static):**

```dockerfile
# Build stage — compile a fully static binary via musl
FROM rust:latest AS builder
RUN rustup target add x86_64-unknown-linux-musl
RUN apt-get update && apt-get install -y musl-tools
WORKDIR /build
COPY . .
RUN cargo build --release --target x86_64-unknown-linux-musl --bin ic-relay
# Strip debug symbols — saves ~50% binary size
RUN strip target/x86_64-unknown-linux-musl/release/ic-relay

# Runtime stage — scratch = empty container, just the binary
FROM scratch
COPY --from=builder /build/target/x86_64-unknown-linux-musl/release/ic-relay /ic-relay
# Copy CA certificates for HTTPS (update checks, Workshop downloads)
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
# Non-root user (numeric UID since scratch has no /etc/passwd)
USER 1000:1000
VOLUME ["/data"]
EXPOSE 19710/tcp 19711/udp
ENTRYPOINT ["/ic-relay", "--data-dir", "/data"]
```

**Why scratch + musl:**

- **~8-12 MB image** — the relay binary is the only file in the container. Compare: `debian:bookworm-slim` is ~80 MB before the binary. Most game server Docker images are 500 MB+.
- **Zero attack surface** — no shell (`/bin/sh`), no package manager, no OS utilities. If an attacker compromises the relay process, there is nothing else in the container to exploit. No `curl`, no `wget`, no `apt-get`. This is the strongest possible container security posture.
- **Rust makes this possible** — the musl target (`x86_64-unknown-linux-musl`) produces a fully statically-linked binary with no runtime dependencies. No glibc, no libssl, no shared libraries. The binary runs on any Linux kernel 3.2+.
- **SQLite works with musl** — `rusqlite` compiles SQLite from source (bundled feature), so it links statically into the musl binary. No system SQLite dependency.
- **Fast startup** — no OS init, no systemd, no shell parsing. Process 1 is the relay binary. Startup time is measured in milliseconds, not seconds.

**Health check note:** The `scratch` image has no `curl`, so the Dockerfile does not include a `HEALTHCHECK` command. Kubernetes and Docker Compose use the `/health` HTTP endpoint directly via their own health check mechanisms (Kubernetes `httpGet` probe, Docker Compose `test: ["CMD-SHELL", "wget -qO- http://localhost:19710/health || exit 1"]` if using the debug variant, or external monitoring).

**Debug Dockerfile (for troubleshooting):**

```dockerfile
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl sqlite3 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY ic-relay /usr/local/bin/ic-relay
RUN useradd -m icserver
USER icserver
WORKDIR /data
VOLUME ["/data"]
EXPOSE 19710/tcp 19711/udp
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:19710/health || exit 1
ENTRYPOINT ["ic-relay", "--data-dir", "/data"]
```

The debug image includes `curl` (for manual health checks), `sqlite3` (for inspecting the relay database), and a shell (for `docker exec -it` troubleshooting). Use it when diagnosing issues; switch to `relay:latest` (scratch) for production.

**Multi-arch builds:** CI produces images for `linux/amd64` and `linux/arm64` (ARM servers, Raspberry Pi 5, Oracle Cloud free tier ARM instances). The musl target supports both architectures. Both are published as a multi-arch manifest under the same tag.

```yaml
# docker-compose.yml — single server
services:
  relay:
    image: ghcr.io/ironcurtain/relay:latest
    ports:
      - "19710:19710/tcp"    # ICRP + Web Dashboard
      - "19711:19711/udp"    # Game traffic
    volumes:
      - ./data:/data         # Config + DB + logs + backups
    environment:
      - IC_RCON_PASSWORD=changeme
    restart: unless-stopped
```

**Key design choices:**
- Non-root user inside container
- Single volume mount (`/data`) for all persistent state — config, database, logs, backups
- Environment variables override config file values (secrets via env, not in committed files)
- Built-in health check via `/health` endpoint
- No sidecar containers — one container = one server instance

**Scaling with Docker Compose:**

```yaml
# docker-compose.yml — multiple servers
services:
  relay-1:
    image: ghcr.io/ironcurtain/relay:latest
    ports: ["19710:19710/tcp", "19711:19711/udp"]
    volumes: ["./data/server1:/data"]
    environment: { IC_RCON_PASSWORD: "pass1" }

  relay-2:
    image: ghcr.io/ironcurtain/relay:latest
    ports: ["19720:19710/tcp", "19721:19711/udp"]
    volumes: ["./data/server2:/data"]
    environment: { IC_RCON_PASSWORD: "pass2" }
```

Each instance is independent. No service discovery, no inter-container networking, no shared state.

### Self-Update (Phase 6a)

The relay binary can check for and apply updates to itself. No external package manager needed.

```
ic server update check
> Current: v0.5.0  Latest: v0.5.2
> Changelog: https://ironcurtain.gg/releases/v0.5.2
> Type: patch (bug fixes only, no config changes)

ic server update apply
> Downloading v0.5.2 (8 MB)...
> Verifying Ed25519 signature... OK
> Backing up current binary to ic-relay.v0.5.0.bak...
> Replacing binary...
> Update complete. Restart to activate: ic server restart
```

- **Signed updates:** Release binaries are signed with the project's Ed25519 key. The relay verifies the signature before applying.
- **Backup before update:** Current binary is renamed to `.bak` before replacement. If the new version fails to start, the operator can revert manually.
- **No forced updates:** The operator decides when to update. `auto_update = true` in config checks on startup only — never mid-match.
- **Channel selection:** `update_channel = "stable"` (default), `"beta"`, or `"nightly"` in config.
- **No auto-restart:** Update downloads the binary but does not restart. The operator chooses when to restart (e.g., between matches, during maintenance window).

### Portable Server Mode

For LAN parties and temporary setups. Same `portable.marker` mechanism as the game client (see `ic-paths` in `architecture/crate-graph.md`):

1. Copy the `ic-relay` binary to a USB drive or any folder
2. Create an empty `portable.marker` file next to it
3. Run `./ic-relay` — config, database, and logs are created in the same folder

**LAN party enhancements:**
- **Auto-generated password:** On first portable launch, ICRP password is generated and printed to console. The LAN admin types it into their browser to access the dashboard.
- **mDNS/Zeroconf:** The server announces itself on the local network as `_ironcurtain._tcp.local`. Game clients on the same LAN discover it automatically in the server browser (Direct Connect → LAN tab).

### Kubernetes Operator (Optional, Phase 6a)

For communities that run on Kubernetes, IC provides a first-party **Kubernetes Operator** (`ic-operator`) that automates relay server lifecycle, scaling, and match routing. The operator is optional — it exists for cloud-native communities, not as a requirement.

**What the operator manages:**

```yaml
# ironcurtain-cluster.yaml — Custom Resource Definition
apiVersion: ironcurtain.gg/v1
kind: IronCurtainCluster
metadata:
  name: my-community
spec:
  # How many relay instances to run
  replicas:
    min: 1
    max: 10
    # Scale based on player count across all instances
    targetPlayersPerRelay: 16

  # Which IC relay image to use
  image: ghcr.io/ironcurtain/relay:0.5.0

  # Deployment profile applied to all instances
  profile: competitive

  # Shared config (mounted as ConfigMap)
  config:
    server_name: "My Community"
    game_module: ra1
    max_players_per_instance: 16

  # Persistent storage for each relay's SQLite DB
  storage:
    size: 1Gi
    storageClass: standard

  # Auto-update policy
  update:
    strategy: RollingUpdate
    # Wait for active matches to end before draining a pod
    drainPolicy: WaitForMatchEnd
    # Maximum time to wait for a match to end before force-draining
    drainTimeoutSeconds: 3600
```

**What the operator does:**

| Responsibility | How |
|---------------|-----|
| **Scaling** | Watches `/health` endpoint on each relay pod. If `player_count / player_max > 0.8` across all instances → spin up a new pod. If instances are idle → scale down (respecting `min`). |
| **Match-aware draining** | Before terminating a pod (scale-down, update, node maintenance), the operator sends a `drain` signal via ICRP (`ic/admin.drain`). The relay stops accepting new matches but lets current matches finish. Only after all matches end (or drain timeout) does the pod terminate. No mid-match disconnects. |
| **Rolling updates** | When the image tag changes, the operator updates pods one at a time. Each pod is drained (match-aware) before replacement. Zero-downtime updates. |
| **Health monitoring** | Polls `/health` on each pod. Unhealthy pods (failed health check 3x) are restarted automatically. ICRP `admin.config_changed` events are watched for config drift detection. |
| **Config distribution** | `server_config.toml` stored as a Kubernetes ConfigMap, mounted into each pod. Config changes trigger hot-reload (the relay watches the mounted file). Secrets (RCON password, OAuth tokens) stored as Kubernetes Secrets. |
| **Service discovery** | Creates a Kubernetes Service that load-balances game traffic across relay pods. The matchmaking service (D052) discovers available relays via the Service endpoint. |
| **Observability** | Exposes Prometheus metrics from each relay's `/health` data. ServiceMonitor CRD for automatic Prometheus scraping. Optional PodMonitor for per-pod metrics. |

**Custom Resource status:**

```yaml
status:
  readyReplicas: 3
  totalPlayers: 28
  totalMatches: 4
  availableSlots: 20
  conditions:
    - type: Available
      status: "True"
    - type: Scaling
      status: "False"
    - type: Updating
      status: "False"
```

**Match-aware pod lifecycle:**

```
Normal operation:
  Pod receives players → hosts matches → reports health

Scale-down / Update:
  Operator marks pod for drain
  → Pod stops accepting new matches (ICRP: ic/admin.drain)
  → Existing matches continue normally
  → Players in lobby are redirected to other pods
  → All matches end naturally
  → Pod terminates gracefully
  → New pod starts (if update) or not (if scale-down)

Emergency (pod crash):
  Pod restarts automatically (Kubernetes)
  → Players in active matches lose connection
  → Clients auto-reconnect to another relay (if match was early enough for rejoin)
  → Replay data up to last flush is preserved in PersistentVolume
```

**Operator implementation:**

- Written in Rust using [`kube-rs`](https://github.com/kube-rs/kube) (the standard Rust Kubernetes client)
- Ships as a single binary (`ic-operator`) + Helm chart
- CRD: `IronCurtainCluster` (manages relay fleet) + `IronCurtainRelay` (per-instance status, auto-generated)
- The operator itself is stateless — all state is in the CRDs and the relay pods' SQLite databases
- RBAC: operator needs permissions to manage pods, services, configmaps, and the IC CRDs — nothing else

**Helm chart:**

```
helm repo add ironcurtain https://charts.ironcurtain.gg
helm install my-community ironcurtain/relay-cluster \
  --set replicas.min=2 \
  --set replicas.max=8 \
  --set profile=competitive \
  --set config.server_name="My Community"
```

**What the operator does NOT do:**

- **Does not manage game clients** — only relay server pods
- **Does not replace the single-binary experience** — operators who don't use Kubernetes ignore it entirely
- **Does not introduce distributed state** — each relay pod is independent with its own SQLite. The operator is a lifecycle manager, not a data coordinator
- **Does not require the operator for basic Kubernetes deployment** — a plain Deployment + Service YAML works fine for static setups. The operator adds auto-scaling, match-aware draining, and rolling updates.

**Why build a custom operator instead of using HPA?**

Kubernetes HorizontalPodAutoscaler (HPA) can scale based on CPU/memory, but game servers need **match-aware scaling**:
- HPA would kill a pod mid-match during scale-down. The IC operator waits for matches to end.
- HPA doesn't understand "players per relay." The IC operator scales based on game-specific metrics.
- HPA can't drain gracefully with lobby redirection. The IC operator uses ICRP to coordinate.

Standard HPA still works for basic setups (scale on CPU). The operator is for communities that want zero-downtime, match-aware operations.

### Alternatives Considered

1. **Require Docker for all deployments** — Rejected. Adds unnecessary complexity for the single-binary use case. Docker is an option, not a requirement.
2. **Separate admin web application** — Rejected. Requires installing a web framework, database connector, and reverse proxy. The embedded dashboard serves 90% of use cases with zero additional dependencies.
3. **Microservice architecture** (separate relay, matchmaking, workshop processes) — Rejected for default deployment. One binary handles everything. If IC reaches massive scale, a microservice split can be designed then — but it should not burden the 99% of operators who run one server for their community.
4. **Custom admin protocol** (not ICRP) — Rejected. The web dashboard, CLI, and third-party tools all speak ICRP. One protocol, one auth model, one audit trail.
5. **Linux-only server** — Rejected. The relay binary builds for Windows, macOS, and Linux. LAN party hosts may be on any OS.

### Cross-References

- **D007 (Relay Server):** The relay binary is the dedicated server. D072 defines how it's managed.
- **D034 (SQLite):** Server state lives in SQLite. Backup, query, and health operations use the same database.
- **D052 (Community Servers):** Federation, OAuth tokens, and matchmaking are D052 concerns. D072 covers the single-instance management layer.
- **D058 (Command Console):** In-game admin commands are D058 commands with admin permission flags.
- **D064 (Server Config):** `server_config.toml` schema and deployment profiles are D064. D072 adds hot-reload, CLI, and web editing.
- **D071 (ICRP):** The web dashboard, CLI, and remote admin all communicate via ICRP. D072 is the UX layer on top of D071.
- **15-SERVER-GUIDE.md:** Operational best practices, deployment examples, and troubleshooting reference D072's management interfaces.

### Execution Overlay Mapping

- **Milestone:** Phase 2 (`/health` + structured logging), Phase 5 (full CLI + web dashboard + in-game admin), Phase 6a (self-update + advanced monitoring)
- **Priority:** `P-Core` (server management is required for multiplayer)
- **Feature Cluster:** `M5.INFRA.SERVER_MANAGEMENT`
- **Depends on (hard):**
  - D007 relay server binary
  - D064 server config schema
  - D071 ICRP protocol
- **Depends on (soft):**
  - D052 community server federation (for multi-instance routing)
  - D058 command console (for in-game admin)
