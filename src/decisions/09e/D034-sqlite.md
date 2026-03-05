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

| Database            | Read            | Write                                                                               | Optimize | Notes                                                     |
| ------------------- | --------------- | ----------------------------------------------------------------------------------- | -------- | --------------------------------------------------------- |
| `gameplay.db`       | Full SQL access | External tools only (user's file)                                                   | Yes      | Main analytics surface — stats, events, match history     |
| `profile.db`        | Full SQL access | External tools only                                                                 | Yes      | Friends, settings, avatar, privacy                        |
| `communities/*.db`  | Full SQL access | **Tamper-evident** — SCRs are signed, modifying them invalidates Ed25519 signatures | Yes      | Ratings, match results, achievements                      |
| `achievements.db`   | Full SQL access | **Tamper-evident** — SCR-backed                                                     | Yes      | Achievement proofs                                        |
| `telemetry.db`      | Full SQL access | External tools only                                                                 | Yes      | Frame times, tick durations, I/O latency — self-diagnosis |
| `workshop/cache.db` | Full SQL access | External tools only                                                                 | Yes      | Mod metadata, dependency trees, download history          |

**Community tool use cases enabled by this access:**

- **Stream overlays** reading live stats from `gameplay.db` (via file polling or SQLite `PRAGMA data_version` change detection)
- **Discord bots** reporting match results from `communities/*.db`
- **Coaching tools** querying `gameplay_events` for weakness analysis
- **Balance analysis scripts** aggregating unit performance across matches
- **Tournament tools** auditing match results from signed SCRs
- **Player dashboard websites** importing data via `ic db export`
- **Spreadsheet analysis** via CSV export (`ic db export gameplay v_win_rate_by_faction --format csv`)

### Schema Migration

Each service manages its own schema using embedded SQL migrations (numbered, applied on startup). Forward-only migrations — the binary upgrades the database file automatically on first launch after an update.

**Schema version tracking:** Every IC database includes a `_schema_meta` table alongside the `user_version` PRAGMA:

```sql
CREATE TABLE IF NOT EXISTS _schema_meta (
    version     INTEGER NOT NULL,
    applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    description TEXT
);
INSERT INTO _schema_meta (version, description) VALUES (1, 'Initial schema');
```

The `user_version` PRAGMA provides the fast integer check (O(1) read, no SQL parse). The `_schema_meta` table provides an audit trail — what was applied, when, and why. On startup, the server reads `PRAGMA user_version`, applies any pending migrations in sequence, records each in `_schema_meta`, and updates `user_version` to the final version. This pattern applies to every database: `gameplay.db`, `relay.db`, `ranking.db`, `telemetry.db`, `workshop.db`, `profile.db`, `achievements.db`, `communities/*.db`.

**Migrations are embedded in the binary** (not external SQL files) — this preserves the "single binary, zero deps" philosophy (D072). The shipped `.sql` files under `<install_dir>/sql/migrations/` are human-readable copies for operator transparency, not runtime dependencies.

**Phase:** Schema versioning is established in Phase 2 when SQLite schemas are first created. Designing it early avoids retrofitting migration infrastructure in Phase 5 when community servers have production databases.

### Disk Budgets and Growth Limits

Every SQLite database has an explicit disk budget and a defined behavior when the budget is exceeded. Unbounded storage growth is a common operational failure — the budget makes growth deterministic and the server's behavior predictable.

**Server-side disk budgets** (configurable in `server_config.toml`):

```toml
[db.relay]
max_size_mb = 500               # relay.db — match metadata, player stats
on_limit = "prune_oldest"       # delete oldest completed match records

[db.ranking]
max_size_mb = 200               # ranking.db — Glicko-2 state
on_limit = "archive_old_seasons"  # move completed seasons to archive.db

[db.telemetry]
max_size_mb = 100               # already has pruning — this makes the budget explicit
on_limit = "prune_oldest"

[db.workshop]
max_size_mb = 1000              # workshop.db — content metadata
on_limit = "alert_only"         # metadata is small; if this fills, something is wrong
```

**Client-side disk budgets** (configurable in `settings.toml`):

| Database            | Default Budget | `on_limit` Behavior     | Rationale                                                  |
| ------------------- | -------------- | ----------------------- | ---------------------------------------------------------- |
| `gameplay.db`       | 500 MB         | `prune_oldest_sessions` | Keep recent history; old sessions can be exported first    |
| `telemetry.db`      | 100 MB         | `prune_oldest`          | Low-value, recreatable                                     |
| `profile.db`        | 10 MB          | `alert_only`            | Should never approach this; if it does, something is wrong |
| `achievements.db`   | 10 MB          | `alert_only`            | Tiny dataset                                               |
| `workshop/cache.db` | 50 MB          | `lru_evict`             | Metadata cache, fully rebuildable                          |

The `on_limit` behavior is the critical design element: don't just define the limit — define what the system *does* when the limit is hit. The server periodically checks database sizes against budgets and takes the configured action. `ic db size` reports current usage vs. budget for operator visibility.

**Phase:** Disk budgets are a Phase 2 concern (when SQLite schemas are first created). See `research/cloud-native-lessons-for-ic-platform.md` § 5 for the rationale.


---

## Sub-Pages

| Section             | Topic                                                                                                                                           | File                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| PRAGMA & Operations | Per-database PRAGMA configuration, migration strategy, backup operations, WASM platform adjustments, monitoring, rationale, alternatives, phase | [D034-pragma-operations.md](D034/D034-pragma-operations.md) |
