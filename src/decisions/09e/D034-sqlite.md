## D034: SQLite as Embedded Storage for Services and Client

**Decision:** Use SQLite (via `rusqlite`) as the embedded database for all backend services that need persistent state and for the game client's local metadata indices. No external database dependency required for any deployment.

**What this means:** Every service that persists data beyond a single process lifetime uses an embedded SQLite database file. The "just a binary" philosophy (see `03-NETCODE.md` § Backend Infrastructure) is preserved — an operator downloads a binary, runs it, and persistence is a `.db` file next to the executable. No PostgreSQL, no MySQL, no managed database service.

**Where SQLite is used:**

### Backend Services

| Service                | What it stores                                                                                                              | Why not in-memory                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Relay server**       | `CertifiedMatchResult` records, `DesyncReport` events, `PlayerBehaviorProfile` history, replay archive metadata             | Match results and behavioral data are valuable beyond the game session — operators need to query desync patterns, review suspicion scores, link replays to match records. A relay restart shouldn't erase match history. |
| **Workshop server**    | Resource metadata, versions, dependencies, download counts, ratings, search index (FTS5), license data, replication cursors | This is a package registry — functionally equivalent to crates.io's data layer. Search, dependency resolution, and version queries are relational workloads.                                                             |
| **Matchmaking server** | Player ratings (Glicko-2), match history, seasonal league data, leaderboards                                                | Ratings and match history must survive restarts. Leaderboard queries (`top N`, per-faction, per-map) are natural SQL.                                                                                                    |
| **Tournament server**  | Brackets, match results, map pool votes, community reports                                                                  | Tournament state spans hours/days; must survive restarts. Bracket queries and result reporting are relational.                                                                                                           |

### Game Client (local)

| Data                   | What it stores                                                                   | Benefit                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Replay catalog**     | Player names, map, factions, date, duration, result, file path, signature status | Browse and search local replays without scanning files on disk. Filter by map, opponent, date range.                                                                                                                                                                                                                                                                                                                                 |
| **Save game index**    | Save name, campaign, mission, timestamp, playtime, thumbnail path                | Fast save browser without deserializing every save file on launch.                                                                                                                                                                                                                                                                                                                                                                   |
| **Workshop cache**     | Downloaded resource metadata, versions, checksums, dependency graph              | Offline dependency resolution. Know what's installed without scanning the filesystem.                                                                                                                                                                                                                                                                                                                                                |
| **Map catalog**        | Map name, player count, size, author, source (local/workshop/OpenRA), tags       | Browse local maps from all sources with a single query.                                                                                                                                                                                                                                                                                                                                                                              |
| **Gameplay event log** | Structured `GameplayEvent` records (D031) per game session                       | Queryable post-game analysis without an OTEL stack. Frequently-aggregated fields (`event_type`, `unit_type_id`, `target_type_id`) are denormalized as indexed columns for fast `PlayerStyleProfile` building (D042). Full payloads remain in `data_json` for ad-hoc SQL: `SELECT json_extract(data_json, '$.weapon'), AVG(json_extract(data_json, '$.damage')) FROM gameplay_events WHERE event_type = 'combat' AND session_id = ?`. |
| **Asset index**        | `.mix` archive contents, MiniYAML conversion cache (keyed by file hash)          | Skip re-parsing on startup. Know which `.mix` contains which file without opening every archive.                                                                                                                                                                                                                                                                                                                                     |

### Where SQLite is NOT used

| Area                | Why not                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`ic-sim`**        | No I/O in the sim. Ever. Invariant #1.                                                                                                                 |
| **Tracking server** | Truly ephemeral data — game listings with TTL. In-memory is correct.                                                                                   |
| **Hot paths**       | No DB queries per tick. All SQLite access is at load time, between games, or on UI/background threads.                                                 |
| **Save game data**  | Save files are serde-serialized sim snapshots loaded as a whole unit. No partial queries needed. SQLite indexes their *metadata*, not their *content*. |
| **Campaign state**  | Loaded/saved as a unit inside save games. Fits in memory. No relational queries.                                                                       |

### Why SQLite specifically

**The strategic argument: SQLite is the world's most widely deployed database format.** Choosing SQLite means IC's player data isn't locked behind a proprietary format that only IC can read — it's stored in an open, standardized, universally-supported container that anything can query. Python scripts, R notebooks, Jupyter, Grafana, Excel (via ODBC), DB Browser for SQLite, the `sqlite3` CLI, Datasette, LLM agents, custom analytics tools, research projects, community stat trackers, third-party companion apps — all of them can open an IC `.db` file and run SQL against it with zero IC-specific tooling. This is a deliberate architectural choice: **player data is a platform, not a product feature.** The community can build things on top of IC's data that we never imagined, using tools we've never heard of, because the interface is SQL — not a custom binary format, not a REST API that requires our servers to be running, not a proprietary export.

Every use case the community might invent — balance analysis, AI training datasets, tournament statistics, replay research, performance benchmarking, meta-game tracking, coach feedback tools, stream overlays reading live stat data — is a SQL query away. No SDK required. No reverse engineering. No waiting for us to build an export feature. The `.db` file IS the export.

This is also why SQLite is chosen over flat files (JSON, CSV): structured data in a relational schema with SQL query support enables questions that flat files can't answer efficiently. "What's my win rate with Soviet on maps larger than 128×128 against players I've faced more than 3 times?" is a single SQL query against `matches` + `match_players`. With JSON files, it's a custom script.

**The practical arguments:**

- **`rusqlite`** is a mature, well-maintained Rust crate with no unsafe surprises
- **Single-file database** — fits the "just a binary" deployment model. No connection strings, no separate database process, no credentials to manage
- **Self-hosting alignment** — a community relay operator on a €5 VPS gets persistent match history without installing or operating a database server
- **FTS5 full-text search** — covers workshop resource search and replay text search without Elasticsearch or a separate search service
- **WAL mode** — handles concurrent reads from web endpoints while a single writer persists new records. Sufficient for community-scale deployments (hundreds of concurrent users, not millions)
- **WASM-compatible** — `sql.js` (Emscripten build of SQLite) or `sqlite-wasm` for the browser target. The client-side replay catalog and gameplay event log work in the browser build
- **Ad-hoc investigation** — any operator can open the `.db` file in DB Browser for SQLite, DBeaver, or the `sqlite3` CLI and run queries immediately. No Grafana dashboards required. This fills the gap between "just stdout logs" and "full OTEL stack" for community self-hosters
- **Backup-friendly** — `VACUUM INTO` produces a self-contained, compacted copy safe to take while the database is in use (D061). A backup is just a file copy. No dump/restore ceremony
- **Immune to bitrot** — The Library of Congress recommends SQLite as a storage format for datasets. IC player data from 2027 will still be readable in 2047 — the format is that stable
- **Deterministic and testable** — in CI, gameplay event assertions are SQL queries against a test fixture database. No mock infrastructure needed

### Relationship to D031 (OTEL Telemetry)

D031 (OTEL) and D034 (SQLite) are complementary, not competing:

| Concern                   | D031 (OTEL)                                  | D034 (SQLite)                                                          |
| ------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| **Real-time monitoring**  | Yes — Prometheus metrics, Grafana dashboards | No                                                                     |
| **Distributed tracing**   | Yes — Jaeger traces across clients and relay | No                                                                     |
| **Persistent records**    | No — metrics are time-windowed, logs rotate  | Yes — match history, ratings, replays are permanent                    |
| **Ad-hoc investigation**  | Requires OTEL stack running                  | Just open the `.db` file                                               |
| **Offline operation**     | No — needs collector + backends              | Yes — works standalone                                                 |
| **Client-side debugging** | Requires exporting to a collector            | Local `.db` file, queryable immediately                                |
| **AI training pipeline**  | Yes — Parquet/Arrow export for ML            | Source data — gameplay events could be exported from SQLite to Parquet |

OTEL is for operational monitoring and distributed debugging. SQLite is for persistent records, metadata indices, and standalone investigation. Tournament servers and relay servers use both — OTEL for dashboards, SQLite for match history.

### Consumers of Player Data

SQLite isn't just infrastructure — it's a UX pillar. Multiple crates read the client-side database to deliver features no other RTS offers:

| Consumer                         | Crate             | What it reads                                                                          | What it produces                                                                                                  | Required?                                                 |
| -------------------------------- | ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Player-facing analytics**      | `ic-ui`           | `gameplay_events`, `matches`, `match_players`, `campaign_missions`, `roster_snapshots` | Post-game stats screen, career stats page, campaign dashboard with roster/veterancy graphs, mod balance dashboard | Always on                                                 |
| **Adaptive AI**                  | `ic-ai`           | `matches`, `match_players`, `gameplay_events`                                          | Difficulty adjustment, build order variety, counter-strategy selection based on player tendencies                 | Always on                                                 |
| **LLM personalization**          | `ic-llm`          | `matches`, `gameplay_events`, `campaign_missions`, `roster_snapshots`                  | Personalized missions, adaptive briefings, post-match commentary, coaching suggestions, rivalry narratives        | **Optional** — requires BYOLLM provider configured (D016) |
| **Player style profiles** (D042) | `ic-ai`           | `gameplay_events`, `match_players`, `matches`                                          | `player_profiles` table — aggregated behavioral models for local player + opponents                               | Always on (profile building)                              |
| **Training system** (D042)       | `ic-ai` + `ic-ui` | `player_profiles`, `training_sessions`, `gameplay_events`                              | Quick training scenarios, weakness analysis, progress tracking                                                    | Always on (training UI)                                   |

Player analytics, adaptive AI, player style profiles, and the training system are always available. LLM personalization and coaching activate only when the player has configured an LLM provider — the game is fully functional without it.

All consumers are read-only. The sim writes nothing (invariant #1) — `gameplay_events` are recorded by a Bevy observer system outside `ic-sim`, and `matches`/`campaign_missions` are written at session boundaries.

### Player-Facing Analytics (`ic-ui`)

No other RTS surfaces your own match data this way. SQLite makes it trivial — queries run on a background thread, results drive a lightweight chart component in `ic-ui` (Bevy 2D: line, bar, pie, heatmap, stacked area).

**Post-game stats screen** (after every match):
- Unit production timeline (stacked area: units built per minute by type)
- Resource income/expenditure curves
- Combat engagement heatmap (where fights happened on the map)
- APM over time, army value graph, tech tree timing
- Head-to-head comparison table vs opponent
- All data: `SELECT ... FROM gameplay_events WHERE session_id = ?`

**Career stats page** (main menu):
- Win rate by faction, map, opponent, game mode — over time and lifetime
- Rating history graph (Glicko-2 from matchmaking, synced to local DB)
- Most-used units, highest kill-count units, signature strategies
- Session history: date, map, opponent, result, duration — clickable → replay
- All data: `SELECT ... FROM matches JOIN match_players ...`

**Campaign dashboard** (D021 integration):
- Roster composition graph per mission (how your army evolves across the campaign)
- Veterancy progression: track named units across missions (the tank that survived from mission 1)
- Campaign path visualization: which branches you took, which missions you replayed
- Performance trends: completion time, casualties, resource efficiency per mission
- All data: `SELECT ... FROM campaign_missions JOIN roster_snapshots ...`

**Mod balance dashboard** (Phase 7, for mod developers):
- Unit win-rate contribution, cost-efficiency scatter plots, engagement outcome distributions
- Compare across balance presets (D019) or mod versions
- `ic mod stats` CLI command reads the same SQLite database
- All data: `SELECT ... FROM gameplay_events WHERE mod_id = ?`

### LLM Personalization (`ic-llm`) — Optional, BYOLLM

When a player has configured an LLM provider (see BYOLLM in D016), `ic-llm` reads the local SQLite database (read-only) and injects player context into generation prompts. This is entirely optional — every game feature works without it. No data leaves the device unless the user's chosen LLM provider is cloud-based.

**Personalized mission generation:**
- "You've been playing Soviet heavy armor for 12 games. Here's a mission that forces infantry-first tactics."
- "Your win rate drops against Allied naval. This coastal defense mission trains that weakness."
- Prompt includes: faction preferences, unit usage patterns, win/loss streaks, map size preferences — all from SQLite aggregates.

**Adaptive briefings:**
- Campaign briefings reference your actual roster: "Commander, your veteran Tesla Tank squad from Vladivostok is available for this operation."
- Difficulty framing adapts to performance: struggling player gets "intel reports suggest light resistance"; dominant player gets "expect fierce opposition."
- Queries `roster_snapshots` and `campaign_missions` tables.

**Post-match commentary:**
- LLM generates a narrative summary of the match from `gameplay_events`: "The turning point was at 8:42 when your MiG strike destroyed the Allied War Factory, halting tank production for 3 minutes."
- Highlights unusual events: first-ever use of a unit type, personal records, close calls.
- Optional — disabled by default, requires LLM provider configured.

**Coaching suggestions:**
- "You built 40 Rifle Infantry across 5 games but they had a 12% survival rate. Consider mixing in APCs for transport."
- "Your average expansion timing is 6:30. Top players expand at 4:00-5:00."
- Queries aggregate statistics from `gameplay_events` across multiple sessions.

**Rivalry narratives:**
- Track frequent opponents from `matches` table: "You're 3-7 against PlayerX. They favor Allied air rushes — here's a counter-strategy mission."
- Generate rivalry-themed campaign missions featuring opponent tendencies.

### Adaptive AI (`ic-ai`)

`ic-ai` reads the player's match history to calibrate skirmish and campaign AI behavior. No learning during the match — all adaptation happens between games by querying SQLite.

- **Difficulty scaling:** AI selects from difficulty presets based on player win rate over recent N games. Avoids both stomps and frustration.
- **Build order variety:** AI avoids repeating the same strategy the player has already beaten. Queries `gameplay_events` for AI build patterns the player countered successfully.
- **Counter-strategy selection:** If the player's last 5 games show heavy tank play, AI is more likely to choose anti-armor compositions.
- **Campaign-specific:** In branching campaigns (D021), AI reads the player's roster strength from `roster_snapshots` and adjusts reinforcement timing accordingly.

This is designer-authored adaptation (the AI author sets the rules for how history influences behavior), not machine learning. The SQLite queries are simple aggregates run at mission load time.

**Fallback:** When no match history is available (first launch, empty database, WASM/headless builds without SQLite), `ic-ai` falls back to default difficulty presets and random strategy selection. All SQLite reads are behind an `Option<impl AiHistorySource>` — the AI is fully functional without it, just not personalized.

### Client-Side Schema (Key Tables)

```sql
-- Match history (synced from matchmaking server when online, always written locally)
CREATE TABLE matches (
    id              INTEGER PRIMARY KEY,
    session_id      TEXT NOT NULL UNIQUE,
    map_name        TEXT NOT NULL,
    game_mode       TEXT NOT NULL,
    balance_preset  TEXT NOT NULL,
    mod_id          TEXT,
    duration_ticks  INTEGER NOT NULL,
    started_at      TEXT NOT NULL,
    replay_path     TEXT,
    replay_hash     BLOB
);

CREATE TABLE match_players (
    match_id    INTEGER REFERENCES matches(id),
    player_name TEXT NOT NULL,
    faction     TEXT NOT NULL,
    team        INTEGER,
    result      TEXT NOT NULL,  -- 'victory', 'defeat', 'disconnect', 'draw'
    is_local    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (match_id, player_name)
);

-- Gameplay events (D031 structured events, written per session)
-- Top fields denormalized as indexed columns to avoid json_extract() scans
-- during PlayerStyleProfile aggregation (D042). The full payload remains in
-- data_json for ad-hoc SQL queries and mod developer analytics.
CREATE TABLE gameplay_events (
    id              INTEGER PRIMARY KEY,
    session_id      TEXT NOT NULL,
    tick            INTEGER NOT NULL,
    event_type      TEXT NOT NULL,       -- 'unit_built', 'unit_killed', 'building_placed', ...
    player          TEXT,
    game_module     TEXT,                -- denormalized: 'ra1', 'td', 'ra2', custom (set once per session)
    mod_fingerprint TEXT,                -- denormalized: D062 SHA-256 (updated on profile switch)
    unit_type_id    INTEGER,             -- denormalized: interned unit type (nullable for non-unit events)
    target_type_id  INTEGER,             -- denormalized: interned target type (nullable)
    data_json       TEXT NOT NULL        -- event-specific payload (full detail)
);
CREATE INDEX idx_ge_session_event ON gameplay_events(session_id, event_type);
CREATE INDEX idx_ge_game_module ON gameplay_events(game_module) WHERE game_module IS NOT NULL;
CREATE INDEX idx_ge_unit_type ON gameplay_events(unit_type_id) WHERE unit_type_id IS NOT NULL;

-- Campaign state (D021 branching campaigns)
CREATE TABLE campaign_missions (
    id              INTEGER PRIMARY KEY,
    campaign_id     TEXT NOT NULL,
    mission_id      TEXT NOT NULL,
    outcome         TEXT NOT NULL,
    duration_ticks  INTEGER NOT NULL,
    completed_at    TEXT NOT NULL,
    casualties      INTEGER,
    resources_spent INTEGER
);

CREATE TABLE roster_snapshots (
    id          INTEGER PRIMARY KEY,
    mission_id  INTEGER REFERENCES campaign_missions(id),
    snapshot_at TEXT NOT NULL,   -- 'mission_start' or 'mission_end'
    roster_json TEXT NOT NULL    -- serialized unit list with veterancy, equipment
);

-- FTS5 for replay and map search (contentless — populated via triggers on matches + match_players)
CREATE VIRTUAL TABLE replay_search USING fts5(
    player_names, map_name, factions, content=''
);
-- Triggers on INSERT into matches/match_players aggregate player_names and factions
-- into the FTS index. Contentless means FTS stores its own copy — no content= source mismatch.
```

### User-Facing Database Access

The `.db` files are not hidden infrastructure — they are a user-facing feature. IC explicitly exposes SQLite databases to players, modders, community tool developers, and server operators as a queryable, exportable, optimizable data surface.

**Philosophy:** The `.db` file IS the export. No SDK required. No reverse engineering. No waiting for us to build an API. A player's data is theirs, stored in the most widely-supported database format in the world. Every tool that reads SQLite — DB Browser, DBeaver, `sqlite3` CLI, Python's `sqlite3` module, Datasette, spreadsheet import — works with IC data out of the box.

**`ic db` CLI subcommand** — unified entry point for all local database operations:

```
ic db list                              # List all local .db files with sizes and last-modified
ic db query gameplay "SELECT ..."       # Run a read-only SQL query against gameplay.db
ic db query profile "SELECT ..."        # Run a read-only SQL query against profile.db
ic db query community <name> "SELECT ..." # Query a specific community's credential store
ic db query telemetry "SELECT ..."      # Query telemetry.db (frame times, tick durations, I/O latency)
ic db export gameplay matches --format csv > matches.csv  # Export a table or view to CSV
ic db export gameplay v_win_rate_by_faction --format json  # Export a pre-built view to JSON
ic db schema gameplay                   # Print the full schema of gameplay.db
ic db schema gameplay matches           # Print the schema of a specific table
ic db optimize                          # VACUUM + ANALYZE all local databases (reclaim space, rebuild indexes)
ic db optimize gameplay                 # Optimize a specific database
ic db size                              # Show disk usage per database
ic db open gameplay                     # Open gameplay.db in the system's default SQLite browser (if installed)
```

**All queries are read-only by default.** `ic db query` opens the database in `SQLITE_OPEN_READONLY` mode. There is no `ic db write` command — the engine owns the schema and write paths. Users who want to modify their data can do so with external tools (it's their file), but IC does not provide write helpers that could corrupt internal state.

**Shipped `.sql` files** — the SQL queries that the engine uses internally are shipped as readable `.sql` files alongside the game. This is not just documentation — these are the actual queries the engine executes, extracted into standalone files that users can inspect, learn from, adapt, and use as templates for their own tooling.

```
<install_dir>/sql/
├── schema/
│   ├── gameplay.sql              # CREATE TABLE/INDEX/VIEW for gameplay.db
│   ├── profile.sql               # CREATE TABLE/INDEX/VIEW for profile.db
│   ├── achievements.sql          # CREATE TABLE/INDEX/VIEW for achievements.db
│   ├── telemetry.sql             # CREATE TABLE/INDEX/VIEW for telemetry.db
│   └── community.sql             # CREATE TABLE/INDEX/VIEW for community credential stores
├── queries/
│   ├── career-stats.sql          # Win rate, faction breakdown, rating history
│   ├── post-game-stats.sql       # Per-match stats shown on the post-game screen
│   ├── campaign-dashboard.sql    # Roster progression, branch visualization
│   ├── ai-adaptation.sql         # Queries ic-ai uses for difficulty scaling and counter-strategy
│   ├── player-style-profile.sql  # D042 behavioral aggregation queries
│   ├── replay-search.sql         # FTS5 queries for replay catalog search
│   ├── mod-balance.sql           # Unit win-rate contribution, cost-efficiency analysis
│   ├── economy-trends.sql        # Harvesting, spending, efficiency over time
│   ├── mvp-awards.sql            # Post-game award computation queries
│   └── matchmaking-rating.sql    # Glicko-2 update queries (community server)
├── views/
│   ├── v_win_rate_by_faction.sql
│   ├── v_recent_matches.sql
│   ├── v_economy_trends.sql
│   ├── v_unit_kd_ratio.sql
│   └── v_apm_per_match.sql
├── examples/
│   ├── stream-overlay.sql        # Example: live stats for OBS/streaming overlays
│   ├── discord-bot.sql           # Example: match result posting for Discord bots
│   ├── coaching-report.sql       # Example: weakness analysis for coaching tools
│   ├── balance-spreadsheet.sql   # Example: export data for spreadsheet analysis
│   └── tournament-audit.sql      # Example: verify signed match results
└── migrations/
    ├── 001-initial.sql
    ├── 002-add-mod-fingerprint.sql
    └── ...                       # Numbered, forward-only migrations
```

**Why ship `.sql` files:**

- **Transparency.** Players can see exactly what queries the AI uses to adapt, what stats the post-game screen computes, how matchmaking ratings are calculated. No black boxes. This is the "hacky in the good way" philosophy — the game trusts its users with knowledge.
- **Templates.** Community tool developers don't start from scratch. They copy `queries/career-stats.sql`, modify it for their Discord bot, and it works because it's the same query the engine uses.
- **Education.** New SQL users learn by reading real, production queries with comments explaining the logic. The `examples/` directory provides copy-paste starting points for common community tools.
- **Moddable queries.** Modders can ship custom `.sql` files in their Workshop packages — for example, a total conversion mod might ship `queries/mod-balance.sql` tuned to its custom unit types. The `ic db query --file` flag runs any `.sql` file against the local databases.
- **Auditability.** Tournament organizers and competitive players can verify that the matchmaking and rating queries are fair by reading the actual SQL.

**`ic db` integration with `.sql` files:**

```
ic db query gameplay --file sql/queries/career-stats.sql     # Run a shipped query file
ic db query gameplay --file my-custom-query.sql               # Run a user's custom query file
ic db query gameplay --file sql/examples/stream-overlay.sql   # Run an example query
```

**Pre-built SQL views for common queries** — shipped as part of the schema (and as standalone `.sql` files in `sql/views/`), queryable by users without writing complex SQL:

```sql
-- Pre-built views created during schema migration, available to external tools
CREATE VIEW v_win_rate_by_faction AS
    SELECT faction, COUNT(*) as games,
           SUM(CASE WHEN result = 'victory' THEN 1 ELSE 0 END) as wins,
           ROUND(100.0 * SUM(CASE WHEN result = 'victory' THEN 1 ELSE 0 END) / COUNT(*), 1) as win_pct
    FROM match_players WHERE is_local = 1
    GROUP BY faction;

CREATE VIEW v_recent_matches AS
    SELECT m.started_at, m.map_name, m.game_mode, m.duration_ticks,
           mp.faction, mp.result, mp.player_name
    FROM matches m JOIN match_players mp ON m.id = mp.match_id
    WHERE mp.is_local = 1
    ORDER BY m.started_at DESC LIMIT 50;

CREATE VIEW v_economy_trends AS
    SELECT session_id, tick,
           json_extract(data_json, '$.total_harvested') as harvested,
           json_extract(data_json, '$.total_spent') as spent
    FROM gameplay_events
    WHERE event_type = 'economy_snapshot';

CREATE VIEW v_unit_kd_ratio AS
    SELECT unit_type_id, COUNT(*) FILTER (WHERE event_type = 'unit_killed') as kills,
           COUNT(*) FILTER (WHERE event_type = 'unit_lost') as deaths
    FROM gameplay_events
    WHERE event_type IN ('unit_killed', 'unit_lost') AND player = (SELECT name FROM local_identity)
    GROUP BY unit_type_id;

CREATE VIEW v_apm_per_match AS
    SELECT session_id,
           COUNT(*) FILTER (WHERE event_type LIKE 'order_%') as total_orders,
           MAX(tick) as total_ticks,
           ROUND(COUNT(*) FILTER (WHERE event_type LIKE 'order_%') * 1800.0 / MAX(tick), 1) as apm
    FROM gameplay_events
    GROUP BY session_id;
```

**Schema documentation** is published as part of the IC SDK and bundled with the game installation:
- `<install_dir>/docs/db-schema/gameplay.md` — full table/view/index reference with example queries
- `<install_dir>/docs/db-schema/profile.md`
- `<install_dir>/docs/db-schema/community.md`
- Also available in the SDK's embedded manual (`F1` → Database Schema Reference)
- Schema docs are versioned alongside the engine — each release notes schema changes

**`ic db optimize`** — maintenance command for players on constrained storage:
- Runs `VACUUM` (defragment and reclaim space) + `ANALYZE` (rebuild index statistics) on all local databases
- Safe to run while the game is closed
- Particularly useful for portable mode / flash drive users where fragmented databases waste limited space
- Can be triggered from `Settings → Data → Optimize Databases` in the UI

**Access policy by database:**

| Database | Read | Write | Optimize | Notes |
|----------|------|-------|----------|-------|
| `gameplay.db` | Full SQL access | External tools only (user's file) | Yes | Main analytics surface — stats, events, match history |
| `profile.db` | Full SQL access | External tools only | Yes | Friends, settings, avatar, privacy |
| `communities/*.db` | Full SQL access | **Tamper-evident** — SCRs are signed, modifying them invalidates Ed25519 signatures | Yes | Ratings, match results, achievements |
| `achievements.db` | Full SQL access | **Tamper-evident** — SCR-backed | Yes | Achievement proofs |
| `telemetry.db` | Full SQL access | External tools only | Yes | Frame times, tick durations, I/O latency — self-diagnosis |
| `workshop/cache.db` | Full SQL access | External tools only | Yes | Mod metadata, dependency trees, download history |

**Community tool use cases enabled by this access:**

- **Stream overlays** reading live stats from `gameplay.db` (via file polling or SQLite `PRAGMA data_version` change detection)
- **Discord bots** reporting match results from `communities/*.db`
- **Coaching tools** querying `gameplay_events` for weakness analysis
- **Balance analysis scripts** aggregating unit performance across matches
- **Tournament tools** auditing match results from signed SCRs
- **Player dashboard websites** importing data via `ic db export`
- **Spreadsheet analysis** via CSV export (`ic db export gameplay v_win_rate_by_faction --format csv`)

### Schema Migration

Each service manages its own schema using embedded SQL migrations (numbered, applied on startup). The `rusqlite` `user_version` pragma tracks the current schema version. Forward-only migrations — the binary upgrades the database file automatically on first launch after an update.

### Per-Database PRAGMA Configuration

Every SQLite database in IC gets a purpose-tuned PRAGMA configuration applied at connection open time. The correct settings depend on the database's access pattern (write-heavy vs. read-heavy), data criticality (irreplaceable credentials vs. recreatable cache), expected size, and concurrency requirements. A single "one size fits all" configuration would either sacrifice durability for databases that need it (credentials, achievements) or sacrifice throughput for databases that need speed (telemetry, gameplay events).

**All databases share these baseline PRAGMAs:**

```sql
PRAGMA journal_mode = WAL;          -- all databases use WAL (concurrent readers, non-blocking writes)
PRAGMA foreign_keys = ON;           -- enforced everywhere (except single-table telemetry)
PRAGMA encoding = 'UTF-8';         -- consistent text encoding
PRAGMA trusted_schema = OFF;        -- defense-in-depth: disable untrusted SQL functions in schema
```

`page_size` must be set **before** the first write to a new database (it cannot be changed after creation without `VACUUM`). All other PRAGMAs are applied on every connection open.

**Connection initialization pattern (Rust):**

```rust
/// Apply purpose-specific PRAGMAs to a freshly opened rusqlite::Connection.
/// Called immediately after Connection::open(), before any application queries.
fn configure_connection(conn: &Connection, config: &DbConfig) -> rusqlite::Result<()> {
    // page_size only effective on new databases (before first table creation)
    conn.pragma_update(None, "page_size", config.page_size)?;
    conn.pragma_update(None, "journal_mode", "wal")?;
    conn.pragma_update(None, "synchronous", config.synchronous)?;
    conn.pragma_update(None, "cache_size", config.cache_size)?;
    conn.pragma_update(None, "foreign_keys", config.foreign_keys)?;
    conn.pragma_update(None, "busy_timeout", config.busy_timeout_ms)?;
    conn.pragma_update(None, "temp_store", config.temp_store)?;
    conn.pragma_update(None, "wal_autocheckpoint", config.wal_autocheckpoint)?;
    conn.pragma_update(None, "trusted_schema", "off")?;
    if config.mmap_size > 0 {
        conn.pragma_update(None, "mmap_size", config.mmap_size)?;
    }
    if config.auto_vacuum != AutoVacuum::None {
        conn.pragma_update(None, "auto_vacuum", config.auto_vacuum.as_str())?;
    }
    Ok(())
}
```

#### Client-Side Databases

| PRAGMA / Database      | `gameplay.db`                                                 | `telemetry.db`         | `profile.db`              | `achievements.db`           | `communities/*.db`    | `workshop/cache.db`     |
| ---------------------- | ------------------------------------------------------------- | ---------------------- | ------------------------- | --------------------------- | --------------------- | ----------------------- |
| **Purpose**            | Match history, events, campaigns, replays, profiles, training | Telemetry event stream | Identity, friends, images | Achievement defs & progress | Signed credentials    | Workshop metadata cache |
| **synchronous**        | `NORMAL`                                                      | `NORMAL`               | `FULL`                    | `FULL`                      | `FULL`                | `NORMAL`                |
| **cache_size**         | `-16384` (16 MB)                                              | `-4096` (4 MB)         | `-2048` (2 MB)            | `-1024` (1 MB)              | `-512` (512 KB)       | `-4096` (4 MB)          |
| **page_size**          | `4096`                                                        | `4096`                 | `4096`                    | `4096`                      | `4096`                | `4096`                  |
| **mmap_size**          | `67108864` (64 MB)                                            | `0`                    | `0`                       | `0`                         | `0`                   | `0`                     |
| **busy_timeout**       | `2000` (2 s)                                                  | `1000` (1 s)           | `3000` (3 s)              | `3000` (3 s)                | `3000` (3 s)          | `3000` (3 s)            |
| **temp_store**         | `MEMORY`                                                      | `MEMORY`               | `DEFAULT`                 | `DEFAULT`                   | `DEFAULT`             | `MEMORY`                |
| **auto_vacuum**        | `NONE`                                                        | `NONE`                 | `INCREMENTAL`             | `NONE`                      | `NONE`                | `INCREMENTAL`           |
| **wal_autocheckpoint** | `2000` (≈8 MB WAL)                                            | `4000` (≈16 MB WAL)    | `500` (≈2 MB WAL)         | `100`                       | `100`                 | `1000`                  |
| **foreign_keys**       | `ON`                                                          | `OFF`                  | `ON`                      | `ON`                        | `ON`                  | `ON`                    |
| **Expected size**      | 10–500 MB                                                     | ≤100 MB (pruned)       | 1–10 MB                   | <1 MB                       | <1 MB each            | 1–50 MB                 |
| **Data criticality**   | Valuable (history)                                            | Low (recreatable)      | **Critical** (identity)   | High (player investment)    | **Critical** (signed) | Low (recreatable)       |

#### Server-Side Databases

| PRAGMA / Database      | Server `telemetry.db`        | Relay data                               | Workshop server                      | Matchmaking server             |
| ---------------------- | ---------------------------- | ---------------------------------------- | ------------------------------------ | ------------------------------ |
| **Purpose**            | High-throughput event stream | Match results, desync, behavior profiles | Resource registry, FTS5 search       | Ratings, leaderboards, history |
| **synchronous**        | `NORMAL`                     | `FULL`                                   | `NORMAL`                             | `FULL`                         |
| **cache_size**         | `-8192` (8 MB)               | `-8192` (8 MB)                           | `-16384` (16 MB)                     | `-8192` (8 MB)                 |
| **page_size**          | `4096`                       | `4096`                                   | `4096`                               | `4096`                         |
| **mmap_size**          | `0`                          | `0`                                      | `268435456` (256 MB)                 | `134217728` (128 MB)           |
| **busy_timeout**       | `5000` (5 s)                 | `5000` (5 s)                             | `10000` (10 s)                       | `10000` (10 s)                 |
| **temp_store**         | `MEMORY`                     | `MEMORY`                                 | `MEMORY`                             | `MEMORY`                       |
| **auto_vacuum**        | `NONE`                       | `NONE`                                   | `INCREMENTAL`                        | `NONE`                         |
| **wal_autocheckpoint** | `8000` (≈32 MB WAL)          | `1000` (≈4 MB WAL)                       | `1000` (≈4 MB WAL)                   | `1000` (≈4 MB WAL)             |
| **foreign_keys**       | `OFF`                        | `ON`                                     | `ON`                                 | `ON`                           |
| **Expected size**      | ≤500 MB (pruned)             | 10 MB–10 GB                              | 10 MB–10 GB                          | 1 MB–1 GB                      |
| **Data criticality**   | Low (operational)            | **Critical** (signed records)            | Moderate (rebuildable from packages) | **Critical** (player ratings)  |

**Tournament server** uses the same configuration as relay data — brackets, match results, and map pool votes are signed records with identical durability requirements (`synchronous=FULL`, 8 MB cache, append-only growth).

#### Table-to-File Assignments for D047 and D057

Not every table set warrants its own `.db` file. Two decision areas have SQLite tables that live inside existing databases:

- **D047 LLM provider config** (`llm_providers`, `llm_task_routing`) → stored in **`profile.db`**. These are small config tables (~dozen rows) containing encrypted API keys — they inherit `profile.db`'s `synchronous=FULL` durability, which is appropriate for data that includes secrets. Co-locating with identity data keeps all "who am I and what are my settings" data in one backup-critical file.
- **D057 Skill Library** (`skills`, `skills_fts`, `skill_embeddings`, `skill_compositions`) → stored in **`gameplay.db`**. Skills are analytical data produced from gameplay — they benefit from `gameplay.db`'s 16 MB cache and 64 MB mmap (FTS5 keyword search and embedding similarity scans over potentially thousands of skills). A mature skill library with embeddings may reach 10–50 MB, well within `gameplay.db`'s 10–500 MB expected range. Co-locating with `gameplay_events` and `player_profiles` keeps all AI/LLM-consumed data queryable in one file.

#### Configuration Rationale

**`synchronous` — the most impactful setting:**

- **`FULL`** for databases storing irreplaceable data: `profile.db` (player identity), `achievements.db` (player investment), `communities/*.db` (signed credentials that require server contact to re-obtain), relay match data (signed `CertifiedMatchResult` records), and matchmaking ratings (player ELO/Glicko-2 history). `FULL` guarantees that a committed transaction survives even an OS crash or power failure — the fsync penalty is acceptable because these databases have low write frequency.
- **`NORMAL`** for everything else. In WAL mode, `NORMAL` still guarantees durability against application crashes (the WAL is synced before committing). Only an OS-level crash during a checkpoint could theoretically lose a transaction — an acceptable risk for telemetry events, gameplay analytics, and recreatable caches.

**`cache_size` — scaled to query complexity:**

- `gameplay.db` gets 16 MB because it runs the most complex queries: multi-table JOINs for career stats, aggregate functions over thousands of gameplay_events, FTS5 replay search. The large cache keeps hot index pages in memory across analytical queries.
- Server Workshop gets 16 MB for the same reason — FTS5 search over the entire resource registry benefits from a large page cache.
- `telemetry.db` (client and server) gets a moderate cache because writes dominate reads. The write path doesn't benefit from large caches — it's all sequential inserts.
- Small databases (`achievements.db`, `communities/*.db`) need minimal cache because their entire content fits in a few hundred pages.

**`mmap_size` — for read-heavy databases that grow large:**

- `gameplay.db` at 64 MB: after months of play, this database may contain hundreds of thousands of gameplay_events rows. Memory-mapping avoids repeated read syscalls during analytical queries like `PlayerStyleProfile` aggregation (D042). The 64 MB limit keeps memory pressure manageable on the minimum-spec 4 GB machine — just 1.6% of total RAM. If the database exceeds 64 MB, the remainder uses standard reads. On systems with ≥8 GB RAM, this could be scaled up at runtime.
- Server Workshop and Matchmaking at 128–256 MB: large registries and leaderboard scans benefit from mmap. Workshop search scans FTS5 index pages; matchmaking scans rating tables for top-N queries. Server hardware typically has ≥16 GB RAM.
- Write-dominated databases (`telemetry.db`) skip mmap entirely — the write path doesn't benefit, and mmap can actually hinder WAL performance by creating contention between mapped reads and WAL writes.

**`wal_autocheckpoint` — tuned to write cadence, with gameplay override:**

- Client `telemetry.db` at 4000 pages (≈16 MB WAL): telemetry writes are bursty during gameplay (potentially hundreds of events per second during intense combat). A large autocheckpoint threshold batches writes and defers the expensive checkpoint operation, preventing frame drops. The WAL file may grow to 16 MB during a match and get checkpointed during the post-game transition.
- Server `telemetry.db` at 8000 pages (≈32 MB WAL): relay servers handling multiple concurrent games need even larger write batches. The 32 MB WAL absorbs write bursts without checkpoint contention blocking game event recording.
- `gameplay.db` at 2000 pages (≈8 MB WAL): moderate — gameplay_events arrive faster than profile updates but slower than telemetry. The 8 MB buffer handles end-of-match write bursts.
- Small databases at 100–500 pages: writes are rare; keep the WAL file small and tidy.

**HDD-safe WAL checkpoint strategy:** The `wal_autocheckpoint` thresholds above are tuned for SSDs. On a 5400 RPM HDD (common on the 2012 min-spec laptop), a WAL checkpoint transfers dirty pages back to the main database file at scattered offsets — **random I/O**. A 16 MB checkpoint can produce 4000 random 4 KB writes, taking 200–500+ ms on a spinning disk. If this triggers during gameplay, the I/O thread stalls, the ring buffer fills, and events are silently lost.

**Mitigation: disable autocheckpoint during active gameplay, checkpoint at safe points.**

```rust
/// During match load, disable automatic checkpointing on gameplay-active databases.
/// The I/O thread calls this after opening connections.
fn enter_gameplay_mode(conn: &Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "wal_autocheckpoint", 0)?; // 0 = disable auto
    Ok(())
}

/// At safe points (loading screen, post-game stats, main menu, single-player pause),
/// trigger a passive checkpoint that yields if it encounters contention.
fn checkpoint_at_safe_point(conn: &Connection) -> rusqlite::Result<()> {
    // PASSIVE: checkpoint pages that don't require blocking readers.
    // Does not block, does not stall. May leave some pages un-checkpointed.
    conn.pragma_update(None, "wal_checkpoint", "PASSIVE")?;
    Ok(())
}

/// On match end or app exit, restore normal autocheckpoint thresholds.
fn leave_gameplay_mode(conn: &Connection, normal_threshold: u32) -> rusqlite::Result<()> {
    conn.pragma_update(None, "wal_autocheckpoint", normal_threshold)?;
    // Full checkpoint now — we're in a loading/menu screen, stall is acceptable.
    conn.pragma_update(None, "wal_checkpoint", "TRUNCATE")?;
    Ok(())
}
```

**Safe checkpoint points** (I/O thread triggers these, never the game thread):
- Match loading screen (before gameplay starts)
- Post-game stats screen (results displayed, no sim running)
- Main menu / lobby (no active sim)
- Single-player pause menu (sim is frozen — user is already waiting)
- App exit / minimize / suspend

**WAL file growth during gameplay:** With autocheckpoint disabled, the WAL grows unbounded during a match. Worst case for a 60-minute match at peak event rates: telemetry.db WAL may reach ~50–100 MB, gameplay.db WAL ~20–40 MB. On a 4 GB min-spec machine, this is ~2–3% of RAM — acceptable. The WAL is truncated on the post-game `TRUNCATE` checkpoint. Players on SSDs experience no difference — checkpoint takes <50 ms regardless of timing.

**Detection:** The I/O thread queries storage type at startup via Bevy's platform detection (or heuristic: sequential read bandwidth vs. random IOPS ratio). If HDD is detected (or cannot be determined — conservative default), gameplay WAL checkpoint suppression activates automatically. SSD users keep the normal `wal_autocheckpoint` thresholds. The `storage.assume_ssd` cvar overrides detection.

**`auto_vacuum` — only where deletions create waste:**

- `INCREMENTAL` for `profile.db` (avatar/banner image replacements leave pages of dead BLOB data), `workshop/cache.db` (mod uninstalls remove metadata rows), and server Workshop (resource unpublish). Incremental mode marks freed pages for reuse without the full-table rewrite cost of `FULL` auto_vacuum. Reclamation happens via periodic `PRAGMA incremental_vacuum(N)` calls on background threads.
- `NONE` everywhere else. Telemetry uses DELETE-based pruning but full VACUUM is only warranted on export (compaction). Achievements, community credentials, and match history grow monotonically — no deletions means no wasted space. Relay match data is append-only.

**`busy_timeout` — preventing SQLITE_BUSY errors:**

- 1 second for client `telemetry.db`: telemetry writes must never cause visible gameplay lag. If the database is locked for over 1 second, something is seriously wrong — better to drop the event than stall the game loop.
- 2 seconds for `gameplay.db`: UI queries (career stats page) occasionally overlap with background event writes. All `gameplay.db` writes happen on a dedicated I/O thread (see "Transaction batching" above), so `busy_timeout` waits occur on the I/O thread — never on the game loop thread. 2 seconds is sufficient for typical contention.
- 5 seconds for server telemetry: high-throughput event recording on servers can create brief WAL contention during checkpoints. Server hardware and dedicated I/O threads make a 5-second timeout acceptable.
- 10 seconds for server Workshop and Matchmaking: web API requests may queue behind write transactions during peak load. A generous timeout prevents spurious failures.

**`temp_store = MEMORY` — for databases that run complex queries:**

- `gameplay.db`, `telemetry.db`, Workshop, Matchmaking: complex analytical queries (GROUP BY, ORDER BY, JOIN) may create temporary tables or sort buffers. Storing these in RAM avoids disk I/O overhead for intermediate results.
- Profile, achievements, community databases: queries are simple key lookups and small result sets — `DEFAULT` (disk-backed temp) is fine and avoids unnecessary memory pressure.

**`foreign_keys = OFF` for `telemetry.db` only:**

- The unified telemetry schema is a single table with no foreign keys. Disabling the pragma avoids the per-statement FK check overhead on every INSERT — measurable savings at high event rates.
- All other databases have proper FK relationships and enforce them.

#### WASM Platform Adjustments

Browser builds (via `sql.js` or `sqlite-wasm` on OPFS) operate under different constraints:

- **`mmap_size = 0`** always — mmap is not available in WASM environments
- **`cache_size`** reduced by 50% — browser memory budgets are tighter
- **`synchronous = NORMAL`** for all databases — OPFS provides its own durability guarantees and the browser may not honor fsync semantics
- **`wal_autocheckpoint`** kept at default (1000) — OPFS handles sequential I/O differently than native filesystems; large WAL files offer less benefit

These adjustments are applied automatically by the `DbConfig` builder when it detects the WASM target at compile time (`#[cfg(target_arch = "wasm32")]`).

### Scaling Path

SQLite is the default and the right choice for 95% of deployments. For the official infrastructure at high scale, individual services can optionally be configured to use PostgreSQL by swapping the storage backend trait implementation. The schema is designed to be portable (standard SQL, no SQLite-specific syntax). FTS5 is used for full-text search on Workshop and replay catalogs — a PostgreSQL backend would substitute `tsvector`/`tsquery` for the same queries. This is a planned scale optimization deferred to `M11` (`P-Scale`) unless production scale evidence pulls it forward, and it is not a launch requirement.

Each service defines its own storage trait — no god-trait mixing unrelated concerns:

```rust
/// Relay server storage — match results, desync reports, behavioral profiles.
pub trait RelayStorage: Send + Sync {
    fn store_match_result(&self, result: &CertifiedMatchResult) -> Result<()>;
    fn query_matches(&self, filter: &MatchFilter) -> Result<Vec<MatchRecord>>;
    fn store_desync_report(&self, report: &DesyncReport) -> Result<()>;
    fn update_behavior_profile(&self, player: PlayerId, profile: &BehaviorProfile) -> Result<()>;
}

/// Matchmaking server storage — ratings, match history, leaderboards.
pub trait MatchmakingStorage: Send + Sync {
    fn update_rating(&self, player: PlayerId, rating: &Glicko2Rating) -> Result<()>;
    fn leaderboard(&self, scope: &LeaderboardScope, limit: u32) -> Result<Vec<LeaderboardEntry>>;
    fn match_history(&self, player: PlayerId, limit: u32) -> Result<Vec<MatchRecord>>;
}

/// Workshop server storage — resource metadata, versions, dependencies, search.
pub trait WorkshopStorage: Send + Sync {
    fn publish_resource(&self, meta: &ResourceMetadata) -> Result<()>;
    fn search(&self, query: &str, filter: &ResourceFilter) -> Result<Vec<ResourceListing>>;
    fn resolve_deps(&self, root: &ResourceId, range: &VersionRange) -> Result<DependencyGraph>;
}

/// SQLite implementation — each service gets its own SqliteXxxStorage struct
/// wrapping a rusqlite::Connection (WAL mode, foreign keys on, journal_size_limit set).
/// PostgreSQL implementations are optional, behind `#[cfg(feature = "postgres")]`.
```

### Alternatives Considered

- **JSON / TOML flat files** (rejected — no query capability; "what's my win rate on this map?" requires loading every match file and filtering in code; no indexing, no FTS, no joins; scales poorly past hundreds of records; the user's data is opaque to external tools unless we also build export scripts)
- **RocksDB / sled / redb** (rejected — key-value stores require application-level query logic for everything; no SQL means no ad-hoc investigation, no external tool compatibility, no community reuse; the data is locked behind IC-specific access patterns)
- **PostgreSQL as default** (rejected — destroys the "just a binary" deployment model; community relay operators shouldn't need to install and maintain a database server; adds operational complexity for zero benefit at community scale)
- **Redis** (rejected — in-memory only by default; no persistence guarantees without configuration; no SQL; wrong tool for durable structured records)
- **Custom binary format** (rejected — maximum vendor lock-in; the community can't build anything on top of it without reverse engineering; contradicts the open-standard philosophy)
- **No persistent storage; compute everything from replay files** (rejected — replays are large, parsing is expensive, and many queries span multiple sessions; pre-computed aggregates in SQLite make career stats and AI adaptation instant)

**Phase:** SQLite storage for relay and client lands in Phase 2 (replay catalog, save game index, gameplay event log). Workshop server storage lands in Phase 6a (D030). Matchmaking and tournament storage land in Phase 5 (competitive infrastructure). The `StorageBackend` trait is defined early but PostgreSQL implementation is a planned `M11` (`P-Scale`) deferral unless scale evidence requires earlier promotion through the execution overlay.

---

---

