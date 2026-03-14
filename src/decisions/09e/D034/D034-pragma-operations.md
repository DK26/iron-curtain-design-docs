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

- **D047 LLM provider config** (`llm_providers`, `llm_task_routing`, `llm_model_packs`, `llm_prompt_profiles`, `llm_task_prompt_strategy`, `llm_provider_capability_probe`) → stored in **`profile.db`**. These are small config tables (~dozen rows each) containing encrypted credentials and user preferences — they inherit `profile.db`’s `synchronous=FULL` durability, which is appropriate for data that includes secrets. Co-locating with identity data keeps all “who am I and what are my settings” data in one backup-critical file.
  **Credential encryption:** The `api_key`, `oauth_token`, and `oauth_refresh_token` columns in `llm_providers` are stored as AES-256-GCM encrypted BLOBs, never plaintext. The Data Encryption Key (DEK) is held in the OS credential store (Windows DPAPI / macOS Keychain / Linux Secret Service via the `keyring` crate), or derived from a user-provided vault passphrase (Argon2id). A `vault_meta` table in `profile.db` stores the backend type, DEK salt, verification HMAC, and Argon2 parameters. See `research/credential-protection-design.md` for the full three-tier `CredentialStore` design and V61 in `security/vulns-edge-cases-infra.md` for the threat model.
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

