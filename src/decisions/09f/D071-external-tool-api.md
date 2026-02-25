## D071: External Tool API — IC Remote Protocol (ICRP)

|                |                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                                                                          |
| **Phase**      | Phase 2 (observer tier + HTTP), Phase 3 (WebSocket + auth + admin tier), Phase 5 (relay server API), Phase 6a (mod tier + MCP + LSP + Workshop tool packages)                                    |
| **Depends on** | D006 (pluggable networking), D010 (snapshottable state), D012 (order validation), D034 (SQLite), D058 (command console), D059 (communication)                                                   |
| **Driver**     | External tools (stream overlays, Discord bots, tournament software, coaching tools, AI training pipelines, accessibility aids, replay analyzers) need a safe, structured way to communicate with a running IC game without affecting simulation determinism or competitive integrity. |

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Multi-phase (observer → admin → mod → MCP/LSP)
- **Canonical for:** External tool communication protocol, plugin permission model, tool API security, MCP/LSP integration
- **Scope:** `ic-remote` crate (new), relay server API surface, tool permission tiers, Workshop tool packages
- **Decision:** IC exposes a **local JSON-RPC 2.0 API** (the IC Remote Protocol — ICRP) over WebSocket (primary) and HTTP (fallback), with four permission tiers (observer/admin/mod/debug), event subscriptions, and fog-of-war-filtered state access. External tools never touch live sim state — they read from post-tick snapshots and write through the order pipeline.
- **Why:** OpenRA has no external tool API, which severely limits its ecosystem. Every successful platform (Factorio RCON, Minecraft plugins, Source Engine SRCDS, Lichess API, OBS WebSocket) enables external tools. IC's "hackable but unbreakable" philosophy demands this.
- **Non-goals:** Replacing the in-process modding tiers (YAML/Lua/WASM). ICRP is for external processes, not in-game mods.
- **Invariants preserved:** Simulation purity (invariant #1 — no I/O in `ic-sim`), determinism (external reads from snapshots, writes through order pipeline), competitive integrity (ranked mode restricts tool access).
- **Keywords:** ICRP, JSON-RPC, WebSocket, external tools, plugin API, MCP, LSP, stream overlay, tournament tools, permission tiers, observer, admin

### Problem

IC has three in-process modding tiers (YAML, Lua, WASM) for gameplay modification, but no way for an **external process** to communicate with a running game. This means:

- Stream overlays cannot read live game state (army value, resources, APM)
- Discord bots cannot report match results in real time
- Tournament admin tools cannot manage matches programmatically
- AI training pipelines cannot observe games for reinforcement learning
- Coaching tools cannot provide real-time feedback
- Accessibility tools (screen readers, custom input devices) cannot integrate
- Community developers cannot build the ecosystem of tools that makes a platform thrive

**OpenRA is the cautionary example.** It has no external tool API. All tooling must either modify C# source and recompile, parse log files, or use the offline utility. This severely limits community innovation.

### Decision

IC exposes the **IC Remote Protocol (ICRP)** — a JSON-RPC 2.0 API accessible by external processes via local WebSocket and HTTP endpoints. The protocol is designed to be **safe by default** (fog-of-war filtered, rate-limited, permission-scoped) and **determinism-preserving** (reads from post-tick snapshots, writes through the order pipeline).

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  External Tools                                                 │
│  (OBS overlay, Discord bot, tournament admin, AI trainer, ...)  │
└────────┬──────────────┬──────────────┬──────────────────────────┘
         │ WebSocket    │ HTTP         │ stdio
         │ (primary)    │ (fallback)   │ (MCP/LSP)
         ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Transport + Auth                                      │
│  SHA-256 challenge (local) · OAuth 2.0 tokens (relay servers)  │
│  Localhost-only by default · Rate limiting per connection       │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: ICRP — JSON-RPC 2.0 Methods                          │
│  ic/state.* · ic/match.* · ic/admin.* · ic/chat.*              │
│  ic/replay.* · ic/mod.* · ic/debug.*                           │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: Application Protocols (built on ICRP)                 │
│  MCP server (LLM coaching) · LSP server (mod dev IDE)          │
│  Workshop tool hosting · Relay admin API                        │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: State Boundary                                        │
│  Reads: post-tick state snapshot (fog-filtered)                 │
│  Writes: order pipeline (same as player input / network)        │
│  ic-sim is NEVER accessed directly by ICRP                     │
└─────────────────────────────────────────────────────────────────┘
```

### Permission Tiers

| Tier | Capabilities | Ranked mode | Auth required | Use cases |
|------|-------------|-------------|---------------|-----------|
| **observer** | Read fog-filtered game state, subscribe to match events, query match metadata, read chat | Allowed (with optional configurable delay) | Challenge-response or none (localhost) | Stream overlays, stat trackers, spectator tools, Discord rich presence |
| **admin** | All observer capabilities + server management (kick, pause, map change, settings), match lifecycle control | Server operators only | Challenge-response + admin token | Tournament tools, server admin panels, automated match management |
| **mod** | All observer capabilities + execute mod-registered commands, inject sanctioned orders via mod API | Disabled in ranked | Challenge-response + mod permission approval | Workshop tools, custom game mode controllers, scenario triggers |
| **debug** | Full ECS access via Bevy Remote Protocol (BRP) passthrough — raw component queries, entity inspection, profiling data | Disabled, dev builds only | None (dev builds are trusted) | Bevy Inspector, IC Editor, performance profiling, `ic-lsp` |

### Transports

| Transport | When to use | Push support | Port |
|-----------|------------|-------------|------|
| **WebSocket** (primary) | Real-time tools, overlays, live dashboards | Yes — server pushes subscribed events | `ws://localhost:19710` (configurable) |
| **HTTP** (fallback) | Simple queries, `curl` scripting, CI pipelines | No — request/response only | Same port as WebSocket |
| **stdio** | MCP server mode (LLM tools), LSP server mode (IDE) | Yes — bidirectional pipe | N/A (launched as subprocess) |

**Why WebSocket over raw TCP:** Web-based tools (OBS browser sources, web dashboards) can connect directly without a proxy. Every programming language has WebSocket client libraries. The framing protocol handles message boundaries — no need for custom length-prefix parsing.

### Wire Format: JSON-RPC 2.0

Chosen for alignment with:
- **Bevy Remote Protocol (BRP)** — IC's engine already speaks JSON-RPC 2.0
- **Model Context Protocol (MCP)** — the emerging standard for LLM tool integration
- **Language Server Protocol (LSP)** — the standard for IDE tool communication

```json
// Request: query game state
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ic/state.query",
  "params": {
    "fields": ["players", "resources", "army_value", "game_time"],
    "player": "CommanderZod"
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "game_time_ticks": 18432,
    "players": [
      {
        "name": "CommanderZod",
        "faction": "soviet",
        "resources": 12450,
        "army_value": 34200,
        "units_alive": 87,
        "structures": 12
      }
    ]
  }
}

// Event subscription
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "ic/state.subscribe",
  "params": {
    "events": ["unit_destroyed", "building_placed", "match_end", "chat_message"],
    "interval_ticks": 30
  }
}

// Server-pushed event (notification — no id)
{
  "jsonrpc": "2.0",
  "method": "ic/event",
  "params": {
    "type": "unit_destroyed",
    "tick": 18433,
    "data": {
      "unit_type": "heavy_tank",
      "owner": "CommanderZod",
      "killed_by": "alice",
      "position": [1024, 768]
    }
  }
}
```

**Optional MessagePack encoding:** For performance-sensitive tools (AI training pipelines), clients can request MessagePack binary encoding instead of JSON by setting `Accept: application/msgpack` in the WebSocket handshake. Same JSON-RPC 2.0 semantics, binary encoding.

### Method Namespaces

```
ic/state.query          Read game state (fog-filtered for observer tier)
ic/state.subscribe      Subscribe to state change events (push via WebSocket)
ic/state.unsubscribe    Unsubscribe from events
ic/state.snapshot       Get a full state snapshot (for replay/analysis tools)

ic/match.info           Current match metadata (map, players, settings, trust label)
ic/match.events         Subscribe to match lifecycle events (start, end, pause, player join/leave)
ic/match.history        Query local match history (reads gameplay.db)

ic/player.profile       Query player profile data (ratings, awards, stats)
ic/player.style         Query player style profile (D042 behavioral data)

ic/chat.send            Send a chat message (routed through normal chat pipeline)
ic/chat.subscribe       Subscribe to chat messages

ic/replay.list          List available replays
ic/replay.load          Load a replay for analysis
ic/replay.seek          Seek to a specific tick
ic/replay.state         Query replay state at current tick

ic/admin.kick           Kick a player (admin tier)
ic/admin.pause          Pause/resume match (admin tier)
ic/admin.settings       Query/modify server settings (admin tier)
ic/admin.say            Send a server announcement (admin tier)

ic/mod.command          Execute a mod-registered command (mod tier)
ic/mod.order            Inject a sanctioned order via mod API (mod tier)

ic/db.query             Run a read-only SQL query against local databases (D034)
ic/db.schema            Get database schema information

ic/debug.ecs.query      Raw Bevy ECS query (debug tier, dev builds only)
ic/debug.ecs.get        Raw component access (debug tier)
ic/debug.ecs.list       List registered components (debug tier)
ic/debug.profile        Get profiling data (debug tier)
```

### Determinism Safety

**The fundamental constraint:** External tools MUST NOT affect simulation determinism. `ic-sim` has no I/O, no network awareness, and no floats. This is non-negotiable (invariant #1).

**Read path:** After each sim tick, the game extracts a serializable state snapshot (or diff) from `ic-sim` results. ICRP queries operate on this snapshot, never on live ECS components. This is the same data that feeds the replay system — the tool API is a different consumer of the same extraction.

**Write path (admin/mod tiers only):** Mutations do not directly modify ECS components. They are translated into **orders** that enter the normal input pipeline — the same pipeline that processes player commands and network messages. These orders are processed by the sim on the next tick, just like any other input. All clients process the same ordered set of inputs, preserving determinism.

**Debug tier exception:** In dev builds (never in multiplayer), the debug tier can directly query live ECS state via Bevy's BRP. This is useful for the Bevy Inspector, profiling tools, and IC's editor. Disabled by default; cannot be enabled in ranked matches.

### Security & Competitive Integrity

**Threat model for a competitive RTS with an external API:**

| Threat | Mitigation |
|--------|------------|
| **Maphack** (tool queries fog-hidden enemy state) | Observer tier only sees fog-of-war-filtered state — same view as the spectator stream. State snapshot explicitly excludes hidden enemy data for non-admin tiers. |
| **Order injection** (tool submits commands on behalf of a player) | Only admin and mod tiers can inject orders. In ranked matches, mod tier is disabled. Admin orders are logged and auditable. |
| **Information leak** (tool streams state to a coach during ranked) | Ranked mode: ICRP defaults to observer-with-delay (configurable, e.g., 2-minute spectator delay) or disabled entirely. Tournament organizers configure per-tournament. |
| **DoS** (tool floods API, degrades game performance) | Rate limiting: max requests per tick per connection (default: 10 for observer, 50 for admin). Max concurrent connections (default: 8). Request budget is per-tick, not per-second — tied to sim rate. |
| **Unauthorized access** (external process connects without permission) | Localhost-only binding by default. SHA-256 challenge-response auth (OBS WebSocket model). Remote connections (relay server) require OAuth 2.0 tokens. |

**Ranked mode policy:**

| Setting | Default | Configurable by |
|---------|---------|-----------------|
| ICRP enabled in ranked | Observer-only with delay | Tournament organizer via `server_config.toml` |
| Observer delay | 120 seconds (2 minutes) | Tournament organizer |
| Mod tier in ranked | Disabled | Cannot be overridden |
| Debug tier in ranked | Disabled | Cannot be overridden |
| Admin tier in ranked | Server operator only | N/A |

### Authentication

**Local connections (game client):** SHA-256 challenge-response during WebSocket handshake, modeled on OBS WebSocket protocol:
1. Server sends `Hello` with `challenge` (random bytes) and `salt` (random bytes)
2. Client computes `Base64(SHA256(Base64(SHA256(password + salt)) + challenge))`
3. Server verifies, grants requested permission tier
4. Password configured in `config.toml` → `[remote] password = "..."` or auto-generated on first enable

**Relay server connections:** OAuth 2.0 bearer tokens. Community servers issue tokens with scoped permissions (D052). Tokens are created via the community admin panel or CLI (`ic server token create --tier admin --expires 24h`).

**Localhost-only default:** ICRP binds to `127.0.0.1` only. To accept remote connections (for relay server admin API), the operator must explicitly set `[remote] bind = "0.0.0.0"` in `server_config.toml`. This prevents accidental exposure.

### Event Subscriptions

Clients subscribe to event categories during or after connection (inspired by OBS WebSocket's subscription bitmask):

| Category | Events | Observer | Admin | Mod | Debug |
|----------|--------|----------|-------|-----|-------|
| `match` | game_start, game_end, pause, resume, player_join, player_leave | Yes | Yes | Yes | Yes |
| `combat` | unit_destroyed, building_destroyed, engagement_start | Yes (fog-filtered) | Yes | Yes | Yes |
| `economy` | resource_harvested, building_placed, unit_produced | Yes (own player only) | Yes | Yes | Yes |
| `chat` | chat_message, ping, tactical_marker | Yes | Yes | Yes | Yes |
| `admin` | kick, ban, settings_change, server_status | No | Yes | No | Yes |
| `sim_state` | per-tick state diff (position, health, resources) | Yes (fog-filtered, throttled) | Yes | Yes | Yes |
| `telemetry` | fps, tick_time, network_latency, memory_usage | No | Yes | No | Yes |

### Application Protocols Built on ICRP

#### MCP Server (LLM Coaching & Analysis)

IC can run as an MCP (Model Context Protocol) server, exposing game data to LLM tools for coaching, analysis, and content generation. The MCP server uses stdio transport (IC launches as a subprocess of the LLM client, or vice versa).

**MCP Resources (data the LLM can read):**
- Match history, career stats, faction breakdown (from `gameplay.db`)
- Replay state at any tick (via `ic/replay.*` methods)
- Player style profile (D042 behavioral data)
- Build order patterns, economy trends

**MCP Tools (functions the LLM can call):**
- `analyze_replay` — analyze a completed replay for coaching insights
- `suggest_build_order` — suggest builds based on opponent tendencies
- `explain_unit_stats` — explain unit capabilities from YAML rules
- `query_match_history` — query career stats with natural language

**MCP Prompts (templated interactions):**
- "Coach me on this replay"
- "What went wrong in my last match?"
- "How do I counter [strategy]?"

This extends IC's existing BYOLLM design (D016/D047) with a standardized protocol that any MCP-compatible LLM client can use.

#### LSP Server (Mod Development IDE)

`ic-lsp` — a standalone binary providing Language Server Protocol support for IC mod development in VS Code, Neovim, Zed, and other LSP-compatible editors.

**YAML mod files:**
- Schema-driven validation (unit stats, weapon definitions, faction configs)
- Autocompletion of trait names, field names, enum values
- Hover documentation (pulling from IC's trait reference docs)
- Go-to-definition (jumping to parent templates in inheritance chains)
- Diagnostics (type errors, missing required fields, deprecated traits, out-of-range values)

**Lua scripts:**
- Built on existing Lua LSP (sumneko/lua-language-server) with IC-specific extensions
- IC API completions (Campaign.*, Utils.*, Unit.* globals)
- Type annotations for IC's Lua API

**WASM interface types:**
- WIT definition browsing and validation

**Implementation:** Runs as a separate process, does not communicate with a running game. Reads mod files and IC's schema definitions. Safe for determinism — purely static analysis.

#### Relay Server Admin API

Community relay servers expose a subset of ICRP for remote management:

```
relay/status              Server status (player count, games, version, uptime)
relay/games               List active games (same data as A2S/game browser)
relay/admin.kick          Kick a player from a game
relay/admin.ban           Ban by identity key
relay/admin.announce      Server-wide announcement
relay/admin.pause         Pause/resume a specific game
relay/match.events        Subscribe to match lifecycle events (for bracket tools)
relay/replay.download     Download a completed replay
relay/config.get          Query server configuration
relay/config.set          Modify runtime configuration (admin only)
```

Authenticated via OAuth 2.0 tokens (D052 community server credentials). Remote access requires explicit opt-in in `server_config.toml`.

### Workshop Tool Packages

External tools can be published to the Workshop as tool packages. A tool package contains:

```yaml
# tool.yaml — Workshop tool manifest
name: "Live Stats Overlay"
version: "1.2.0"
author: "OverlayDev"
description: "OBS browser source showing live army value, resources, and APM"
tier: "observer"                    # Required permission tier
transport: "websocket"              # How the tool connects
entry_point: "overlay/index.html"   # For browser-based tools: served locally
# — or —
entry_point: "bin/stats-tool.exe"   # For native tools: launched as subprocess
subscriptions:                      # Which event categories it needs
  - "match"
  - "economy"
  - "combat"
screenshots:
  - "screenshots/overlay-preview.png"
```

**User experience:** When installing a Workshop tool, the game shows its required permissions:

```
┌──────────────────────────────────────────────────────────────┐
│  INSTALL TOOL: Live Stats Overlay                            │
│                                                              │
│  This tool requests:                                         │
│    ✓ Observer access (read-only game state)                  │
│    ✓ Match events, Economy events, Combat events             │
│                                                              │
│  This tool does NOT have:                                    │
│    ✗ Admin access (cannot kick, pause, or manage server)     │
│    ✗ Mod access (cannot inject commands or modify gameplay)  │
│                                                              │
│  In ranked matches: active with 2-minute delay               │
│                                                              │
│  [Install]  [Cancel]  [View Source]                          │
└──────────────────────────────────────────────────────────────┘
```

### Configuration

```toml
[remote]
# Whether ICRP is enabled. Default: true (observer tier always available locally).
enabled = true

# Network bind address. "127.0.0.1" = localhost only (default).
# "0.0.0.0" = accept remote connections (relay servers only).
bind = "127.0.0.1"

# Port for WebSocket and HTTP endpoints.
port = 19710

# Authentication password for local connections.
# Auto-generated on first enable if not set. Empty string = no auth (dev only).
password = ""

# Maximum concurrent tool connections.
max_connections = 8

# Observer tier delay in ranked matches (seconds). 0 = real-time (unranked only).
ranked_observer_delay_seconds = 120

# Whether mod tier is available (disabled in ranked regardless).
mod_tier_enabled = true

# Whether debug tier is available (dev builds only, never in release).
debug_tier_enabled = false
```

### Console Commands (D058)

```
/remote status              Show ICRP status (enabled, port, connections, tiers)
/remote connections         List connected tools with tier and subscription info
/remote kick <id>           Disconnect a specific tool
/remote password reset      Generate a new auth password
/remote enable              Enable ICRP
/remote disable             Disable ICRP (disconnects all tools)
```

### Plugin Developer SDK & Libraries

Building a tool for IC should take minutes to start, not hours. The project ships client libraries, templates, a mock server, and documentation so that plugin developers can focus on their tool logic, not on JSON-RPC plumbing.

#### Official Client Libraries

IC maintains thin client libraries for the most common plugin development languages. Each library handles connection, authentication, method calls, and event subscription — the developer writes tool logic only.

| Language | Package | Why this language | Maintained by |
|----------|---------|-------------------|---------------|
| **Rust** | `ic-remote-client` (crate) | Engine language. Highest-performance tools, WASM plugin compilation. | IC core team |
| **Python** | `ic-remote` (PyPI) | Most popular scripting language. Discord bots, data analysis, AI/ML pipelines, quick prototyping. | IC core team |
| **TypeScript/JavaScript** | `@ironcurtain/remote` (npm) | Browser overlays (OBS sources), web dashboards, Electron apps. | IC core team |
| **C#** | `IronCurtain.Remote` (NuGet) | OpenRA community is C#-native. Lowers barrier for existing C&C modders. | Community-maintained, IC-endorsed |
| **Go** | `go-ic-remote` | Server-side tools, Discord bots, tournament admin backends. | Community-maintained |

**What each library provides:**
- `IcClient` — connect to ICRP (WebSocket or HTTP), handle auth handshake
- `IcClient.call(method, params)` — send a JSON-RPC request, get typed response
- `IcClient.subscribe(categories, callback)` — subscribe to event categories, receive push notifications
- `IcClient.on_disconnect(callback)` — handle reconnection
- Typed method helpers: `client.query_state(fields)`, `client.match_info()`, `client.subscribe_combat()`, etc.
- Error handling with ICRP error codes

**Example (Python):**

```python
from ic_remote import IcClient

client = IcClient("ws://localhost:19710", password="my-password")
client.connect()

# Query game state
state = client.query_state(fields=["players", "game_time"])
for player in state.players:
    print(f"{player.name}: {player.resources} credits, {player.army_value} army value")

# Subscribe to combat events
@client.on("unit_destroyed")
def on_kill(event):
    print(f"{event.killed_by} destroyed {event.owner}'s {event.unit_type}")

client.listen()  # Block and process events
```

**Example (TypeScript — OBS browser source):**

```typescript
import { IcClient } from '@ironcurtain/remote';

const client = new IcClient('ws://localhost:19710');
await client.connect();

client.subscribe(['combat', 'economy'], (event) => {
  document.getElementById('army-value').textContent =
    `Army: ${event.data.army_value}`;
});
```

#### Starter Templates

Pre-built project templates for common plugin types, available via `ic tool init` CLI or Workshop download:

```
ic tool init --template stream-overlay    # HTML/CSS/JS overlay for OBS
ic tool init --template discord-bot       # Python Discord bot reporting match results
ic tool init --template stats-dashboard   # Web dashboard with live charts
ic tool init --template replay-analyzer   # Python script processing .icrep files
ic tool init --template tournament-admin  # Go server for bracket management
ic tool init --template coaching-mcp      # Python MCP server for LLM coaching
ic tool init --template lsp-extension     # VS Code extension using ic-lsp
```

Each template includes:
- Working example code with comments explaining each ICRP method used
- `tool.yaml` manifest (pre-filled for the tool type)
- Build/run instructions
- Workshop publishing guide

#### Mock ICRP Server for Development

`ic-remote-mock` — a standalone binary that emulates a running IC game for plugin development. Developers can build and test tools without launching the full game.

```
ic-remote-mock --scenario skirmish-2v2    # Simulate a 2v2 skirmish with synthetic events
ic-remote-mock --replay my-match.icrep    # Replay a real match, exposing ICRP events
ic-remote-mock --static                   # Static state, no events (for UI development)
ic-remote-mock --port 19710               # Custom port
```

The mock server:
- Generates realistic game events (unit production, combat, economy ticks) on a configurable timeline
- Supports all permission tiers (developer can test admin/mod methods without a real server)
- Can replay `.icrep` files, emitting the same ICRP events a real game would
- Ships as part of the IC SDK (Phase 6a)

#### Plugin Developer Documentation

Shipped with the game and hosted online. Organized for different developer personas:

```
<install_dir>/docs/plugins/
├── quickstart.md              # "Your first plugin in 5 minutes" (Python)
├── api-reference/
│   ├── methods.md             # Full ICRP method reference with examples
│   ├── events.md              # Event types, payloads, and subscription categories
│   ├── errors.md              # Error codes and troubleshooting
│   ├── auth.md                # Authentication guide (local + relay)
│   └── permissions.md         # Permission tiers and ranked mode restrictions
├── guides/
│   ├── stream-overlay.md      # Step-by-step: build an OBS overlay
│   ├── discord-bot.md         # Step-by-step: build a Discord match reporter
│   ├── replay-analysis.md     # Step-by-step: analyze replays with Python
│   ├── tournament-tools.md    # Step-by-step: build tournament admin tools
│   ├── mcp-coaching.md        # Step-by-step: build an MCP coaching tool
│   ├── lsp-integration.md     # How to use ic-lsp in your editor
│   └── workshop-publishing.md # How to package and publish your tool
├── examples/
│   ├── python/                # Complete working examples
│   ├── typescript/
│   ├── rust/
│   └── csharp/
└── specification/
    ├── icrp-spec.md           # Formal ICRP protocol specification
    ├── json-rpc-2.0.md        # JSON-RPC 2.0 reference (linked, not duplicated)
    └── changelog.md           # Protocol version history and migration notes
```

**Key documentation principles:**
- **Every method has a working example** in at least Python and TypeScript
- **Copy-paste ready** — examples run as-is, not pseudo-code
- **Error-first** — docs show what happens when things go wrong, not just the happy path
- **Versioned** — docs are versioned alongside the engine. Each release notes protocol changes and migration steps. Breaking changes follow semver on the ICRP protocol version.

#### Validation & Testing Tools for Plugin Authors

```
ic tool validate tool.yaml               # Validate manifest (permissions, subscriptions, entry point)
ic tool test --mock skirmish-2v2         # Run tool against mock server, check for errors
ic tool test --replay my-match.icrep     # Run tool against a real replay
ic tool lint                             # Check for common mistakes (unhandled disconnects, missing error handling)
ic tool package                          # Build Workshop-ready .icpkg
ic tool publish                          # Publish to Workshop (requires account)
```

#### Protocol Versioning & Stability

ICRP uses semantic versioning on the protocol itself (independent of the engine version):

- **Major version bump** (e.g., v1 → v2): Breaking changes to method signatures or event payloads. Old clients may not work. Migration guide published.
- **Minor version bump** (e.g., v1.0 → v1.1): New methods or event types added. Existing clients continue to work.
- **Patch version bump** (e.g., v1.0.0 → v1.0.1): Bug fixes only. No API changes.

The ICRP version is negotiated during the WebSocket handshake. Clients declare their supported version range; the server selects the highest mutually supported version. If no overlap exists, the connection is rejected with a clear error: `"ICRP version mismatch: client supports v1.0-v1.2, server requires v2.0+. Please update your tool."`.

### Alternatives Considered

1. **Source RCON protocol** — Rejected. Unencrypted, binary format, no push support, no structured errors. Industry standard but outdated for modern tooling.
2. **gRPC + Protobuf** — Rejected. Excellent performance but poor browser compatibility (gRPC-web is clunky). JSON-RPC 2.0 is simpler, web-native, and aligns with BRP/MCP/LSP.
3. **REST-only (no WebSocket)** — Rejected. No push capability. Tools must poll, which wastes resources and adds latency. REST is the HTTP fallback, not the primary transport.
4. **Shared memory / mmap** — Rejected as primary protocol. Platform-specific, unsafe, hard to permission-scope. May be added as an opt-in high-performance channel for AI training in future phases.
5. **Custom binary protocol** — Rejected. No tooling ecosystem. Every tool author must write a custom parser. JSON-RPC 2.0 has libraries in every language.
6. **No external API (OpenRA approach)** — Rejected. This is the cautionary example. No API = no ecosystem = no community tools = platform stagnation.

### Cross-References

- **D006 (Pluggable Networking):** ICRP writes flow through the same order pipeline as network messages.
- **D010 (Snapshottable State):** ICRP reads from the same state snapshots used by replays and save games.
- **D012 (Order Validation):** ICRP-injected orders go through the same validation as player orders.
- **D016/D047 (LLM):** MCP server extends BYOLLM with standardized protocol.
- **D034 (SQLite):** `ic/db.query` exposes the same read-only query interface as `ic db` CLI.
- **D052 (Community Servers):** Relay admin API uses D052's OAuth token infrastructure.
- **D058 (Command Console):** ICRP is the external extension of the console — same commands, different transport.
- **D059 (Communication):** Chat messages sent via ICRP flow through the same pipeline as in-game chat.
- **06-SECURITY.md:** ICRP threat model documented here; fog-of-war filtering is the primary maphack defense.

### Execution Overlay Mapping

- **Milestone:** Phase 2 (observer + HTTP), Phase 3 (WebSocket + auth), Phase 5 (relay API), Phase 6a (MCP + LSP + Workshop tools)
- **Priority:** `P-Platform` (enables community ecosystem)
- **Feature Cluster:** `M5.PLATFORM.EXTERNAL_TOOL_API`
- **Depends on (hard):**
  - `ic-sim` state snapshot extraction (D010)
  - Order pipeline (D006, D012)
  - Console command system (D058)
- **Depends on (soft):**
  - Workshop infrastructure (D030) for tool package distribution
  - Community server OAuth (D052) for relay admin API
  - BYOLLM (D016/D047) for MCP server
