# RAM Mode

### What It Is

**RAM Mode** is the engine's default runtime behavior: load everything into RAM before gameplay, perform zero disk I/O during gameplay, and flush to disk only at safe points (match end, pause, exit). The player never needs to enable it — it's on by default for everyone.

The name is user-facing. Settings, console, and documentation all call it "RAM Mode." Internally, the I/O subsystem uses `IoPolicy::RamMode` as the default enum variant.

### Problem: Disk I/O Is the Silent Performance Killer

The engine targets a 2012 laptop with a slow 5400 RPM HDD. Flash drives (USB 2.0/3.0) are even worse for random I/O — sequential reads are acceptable, but random writes and fsyncs are catastrophic. Even on modern SSDs, unnecessary disk I/O during gameplay introduces variance that deterministic lockstep cannot tolerate.

The existing design already isolates I/O from the game thread (background writers, ring buffers, deferred WAL checkpoints). RAM Mode extends that principle into a **unified strategy**: load everything into RAM before gameplay, perform zero disk writes during gameplay, and flush to disk at safe points.

### I/O Moment Map

Every disk I/O operation in the engine lifecycle, categorized by when it happens and how to minimize it:

| Phase            | I/O Operation                                    | Current Design                                | RAM-First Optimization                                                                                                          |
| ---------------- | ------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **First launch** | Content detection & asset indexing               | Scans known install paths                     | Index cached in SQLite after first scan; subsequent launches skip detection                                                     |
| **Game start**   | Asset loading (sprites, audio, maps, YAML rules) | Bevy async asset pipeline                     | **Load all game-session assets into RAM before match starts.** Loading screen waits for full load. No streaming during gameplay |
| **Game start**   | Mod loading (YAML + Lua + WASM)                  | Parsed and compiled at load time              | Keep compiled mod state in RAM for entire session                                                                               |
| **Game start**   | SQLite databases (gameplay.db, profile)          | On-disk with WAL mode                         | **Open in-memory (`:memory:`) by default; populate from on-disk file at load.** Serialize back to disk at safe points           |
| **Gameplay**     | Autosave (delta snapshot)                        | Background I/O thread, Fossilize pattern      | Configurable: hold in RAM ring buffer, flush on configurable cycle or at match end                                              |
| **Gameplay**     | Replay recording (.icrep)                        | Background writer via crossbeam channel       | Configurable: buffer in RAM (default), flush periodically or at match end                                                       |
| **Gameplay**     | SQLite event writes (gameplay_events, telemetry) | Ring buffer → batch transaction on I/O thread | **In-memory SQLite by default during gameplay.** Batch flush to on-disk file at configurable intervals or at match end          |
| **Gameplay**     | WAL checkpoint                                   | Suppressed during gameplay on HDD (existing)  | Extend: suppress on all storage during gameplay; checkpoint at match end or during pauses                                       |
| **Gameplay**     | Screenshot capture                               | PNG encode + write                            | Queue to background thread; buffer if I/O is slow                                                                               |
| **Match end**    | Final replay flush                               | Writer flushes remaining frames + header      | Synchronous flush at match end (acceptable — player sees post-game screen)                                                      |
| **Match end**    | SQLite serialize to disk                         | Not yet designed                              | **Mandatory dump: all in-memory SQLite databases serialized to on-disk files at match end**                                     |
| **Match end**    | Autosave final                                   | Fossilize pattern                             | Final save at match end is mandatory regardless of I/O mode                                                                     |
| **Post-game**    | Stats computation, rating update                 | Reads from gameplay.db                        | Already in RAM if using in-memory SQLite                                                                                        |
| **Menu / Lobby** | Workshop downloads, mod installs                 | Background P2P download                       | No gameplay impact — full disk I/O acceptable                                                                                   |
| **Menu / Lobby** | Config saves, profile updates                    | SQLite + TOML writes                          | No gameplay impact — direct disk writes acceptable                                                                              |

### Default I/O Policy: RAM-First

The default behavior is: **load everything you can into RAM, and only write to disk when the system is not actively running a match.**

```
┌─────────────────────────────────────────────────────────────────┐
│  LOADING SCREEN (pre-match)                                     │
│                                                                 │
│  ✓ Map loaded (2.1 MB)                                          │
│  ✓ Sprites loaded (18.4 MB)                                     │
│  ✓ Audio loaded (12.7 MB)                                       │
│  ✓ Rules compiled (0.3 MB)                                      │
│  ✓ SQLite databases cached to RAM (1.2 MB)                      │
│  ✓ Replay buffer pre-allocated (4 MB ring)                      │
│                                                                 │
│  Total session RAM: 38.7 MB / Budget: 200 MB                   │
│  Ready to start — zero disk I/O during gameplay                  │
└─────────────────────────────────────────────────────────────────┘
```

**Why this is safe:** The target is <200 MB RAM for 1000 units ([01-VISION](01-VISION.md)). Game assets for a Red Alert match are typically 30–50 MB total. Even on the 4 GB min-spec machine, loading everything into RAM leaves >3.5 GB free for the OS and other applications.

**When RAM is insufficient:** If the system reports low available memory at load time (below a configurable threshold, default: 512 MB free after loading), the engine falls back to Bevy's standard async asset streaming — loading assets on demand from disk. This is automatic, not a user setting. A one-time console warning is logged: `"Low memory: falling back to disk-streaming mode. Expect longer asset access times."`

### I/O Modes

RAM Mode is the default. Alternative modes exist for edge cases where RAM Mode is not ideal.

| Mode                   | Behavior                                                                                                          | Default for                                   | When to use                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RAM Mode** (default) | All gameplay data buffered in RAM. Zero disk I/O during matches. Flush at safe points.                            | All players (desktop, portable, store builds) | Normal gameplay. Works for everyone unless RAM is critically low.                                                                                        |
| **Streaming Mode**     | Write to disk continuously via background I/O threads. Existing behavior from the background-writer architecture. | Automatic fallback if RAM is insufficient     | Systems with <4 GB RAM and large mods where RAM budget is exhausted. Also useful for relay servers (long-running processes that need persistent writes). |
| **Minimal Mode**       | Like RAM Mode but also suppresses autosave during gameplay. Replay buffer is the only recovery mechanism.         | Never auto-selected                           | Extreme low-RAM scenarios or when the player explicitly wants maximum RAM savings.                                                                       |

**Edge cases where RAM Mode falls back to Streaming Mode automatically:**
- Available RAM after loading is below 512 MB free (configurable threshold)
- I/O RAM budget (`io_ram_budget_mb`, default 64 MB) is exhausted during gameplay
- Relay server / dedicated server processes (long-running, need persistent writes — these use Streaming Mode by default)

**The player does not need to choose.** RAM Mode is always the default. The engine falls back to Streaming Mode automatically when needed, with a one-time console log. No user action required. Advanced users can override via config or console.

### Configurable I/O Parameters

These parameters are exposed via `config.toml` (D067) and console cvars (D058). They control disk write behavior **during gameplay only** — menu/lobby I/O is always direct-to-disk.

```toml
[io]
# I/O mode during active gameplay.
# "ram" (default): buffer all writes in RAM, flush at match end and safe points
# "streaming": write to disk continuously via background threads
# "minimal": like ram but also suppresses autosave during gameplay (replay-only recovery)
mode = "ram"

# How often in-RAM data is flushed to disk during gameplay (seconds).
# 0 = only at match end and pause. Higher = more frequent but more I/O.
# Only applies when mode = "ram".
flush_interval_seconds = 0

# Maximum RAM budget (MB) for buffered I/O (replay buffer + in-memory SQLite + autosave queue).
# If exceeded, falls back to streaming mode. 0 = no limit (use available RAM).
ram_budget_mb = 64

# SQLite in-memory mode during gameplay.
# true (default): gameplay.db runs as :memory: during match, serialized to disk at flush points.
# false: standard WAL mode with background I/O thread.
sqlite_in_memory = true

# Replay write buffering.
# true (default): replay frames buffered in RAM ring buffer, flushed at match end.
# false: background writer streams to disk continuously.
replay_buffer_in_ram = true

# Autosave write policy during gameplay.
# "deferred" (default): delta snapshots held in RAM, written to disk at flush points.
# "immediate": written to disk immediately via background I/O thread.
# "disabled": no autosave during gameplay (replay is the recovery mechanism).
autosave_policy = "deferred"
```

### Flush Points (Safe Moments to Write to Disk)

Disk writes during gameplay are batched and flushed only at **safe points** — moments where a brief I/O stall is invisible to the player:

| Safe Point                | When                                                     | What Gets Flushed                                                                                  |
| ------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Match end** (mandatory) | Victory/defeat screen                                    | Everything: replay, SQLite, autosave, screenshots                                                  |
| **Player pause**          | When any player pauses (multiplayer: all clients paused) | Autosave, SQLite events                                                                            |
| **Flush interval**        | Every N seconds if `flush_interval_seconds > 0`          | SQLite events, autosave (on background thread)                                                     |
| **Lobby return**          | When returning to menu/lobby                             | Full SQLite serialize, config saves                                                                |
| **Application exit**      | Normal shutdown                                          | Everything — mandatory                                                                             |
| **Crash recovery**        | On next launch                                           | Detect incomplete in-memory state via replay; replay file is always valid up to last flushed frame |

**Crash safety under RAM-first mode:** If the game crashes during a match with `gameplay_write_policy = "ram_first"`, in-memory SQLite data (gameplay events, telemetry) from that match is lost. However:
- The replay file is always valid up to the last buffered frame (replay buffer flushed periodically even in RAM-first mode, at a minimum every 60 seconds)
- Autosave (if `deferred`, not `disabled`) is flushed at the same intervals
- Player profile, keys, and config are never held only in RAM — they are always on disk
- This trade-off is acceptable: gameplay event telemetry from a crashed match is low-value compared to smooth gameplay

### Portable Mode Integration & Storage Resilience

Portable mode (defined in `architecture/crate-graph.md` § `ic-paths`) stores all data relative to the executable. When combined with RAM Mode, the engine runs smoothly from a USB flash drive — and survives the flash drive being temporarily removed.

**The design test:** If a player is running from a USB flash drive, momentarily removes it during gameplay, and plugs it back in, the game should keep running the entire time and correctly save state when the drive returns. If the drive has a problem, the game should offer to save state somewhere else.

**Why this works:** RAM Mode means the engine has zero dependency on the storage device during gameplay. All assets are in RAM. All databases are in-memory. All replay/autosave data is buffered. The flash drive is only needed at two moments: loading (before gameplay) and flushing (after gameplay). Between those two moments, the drive can be on the moon.

**Lifecycle with storage resilience:**

| Phase                              | Storage needed?           | What happens if storage is unavailable                                                                         |
| ---------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Loading screen**                 | Yes — sequential reads    | Cannot proceed. If storage disappears mid-load: pause loading, show reconnection dialog.                       |
| **Gameplay**                       | No                        | Game runs entirely from RAM. Storage status is irrelevant. No I/O errors possible because no I/O is attempted. |
| **Flush point** (match end, pause) | Yes — sequential writes   | Attempt flush. If storage unavailable → Storage Recovery Dialog (see below).                                   |
| **Menu / Lobby**                   | Yes — direct reads/writes | If storage unavailable → Storage Recovery Dialog.                                                              |

**Storage Recovery Dialog** (shown when a flush or menu I/O fails):

```
┌──────────────────────────────────────────────────────────────┐
│  STORAGE UNAVAILABLE                                         │
│                                                              │
│  Your game data is safe in memory.                           │
│  The storage device is not accessible.                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Reconnect storage                                     │  │
│  │  Plug your USB drive back in and click Retry.          │  │
│  │  [Retry]                                               │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Save to a different location                          │  │
│  │  Choose another drive or folder on this computer.      │  │
│  │  [Browse...]                                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Save to cloud                                (if configured)
│  │  Upload to Steam Cloud / configured provider.          │  │
│  │  [Upload]                                              │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Save to community server                     (if available)
│  │  Temporarily store on Official IC Community.           │  │
│  │  Data expires in 7 days. [Upload]                      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Continue without saving                               │  │
│  │  Your data stays in memory. You can save later.        │  │
│  │  If you close the game, unsaved data will be lost.     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The dialog shows options based on what's available — cloud and community options only appear if configured/connected.

**"Save to a different location"** behavior:
- Opens a folder browser. Player picks any writable location (another USB drive, the host PC's desktop, a network drive).
- Engine writes all buffered data (replay, autosave, SQLite databases) to the chosen location as a self-contained `<folder>/ic-emergency-save/` directory.
- The emergency save includes everything needed to resume: `gameplay.db`, replay buffer, autosave snapshot, config, and keys.
- On next launch from the original portable location (when the drive is back), the engine detects the emergency save and offers: `"Found unsaved data from a previous session at [path]. [Import and merge] [Ignore]"`.

**"Save to cloud"** behavior (only shown if a cloud provider is configured — Steam Cloud, GOG Galaxy, or a custom provider via D061's `PlatformCloudSync` trait):
- Uploads the emergency save package to the configured cloud provider.
- On next launch from any location, the engine detects the cloud emergency save during D061's cloud sync step and offers to restore.
- Size limit: cloud emergency saves are capped at the critical-data set (~5–20 MB: keys, profile, community credentials, config, latest autosave). Full replay buffers are excluded from cloud upload due to size constraints.

**"Save to community server"** behavior (only shown if the player is connected to a community server that supports temporary storage):
- Uploads the emergency save package to the community server using the player's Ed25519 identity for authentication.
- Community servers can optionally offer temporary personal storage for emergency saves. This is configured per-community in `server_config.toml`:

```toml
[emergency_storage]
# Whether this community server accepts emergency save uploads from members.
enabled = false
# Maximum storage per player (bytes). Default: 20 MB.
max_per_player_bytes = 20_971_520
# How long emergency saves are retained before automatic cleanup (seconds).
# Default: 7 days (604800 seconds).
retention_seconds = 604800
# Maximum total storage for all emergency saves (bytes). Default: 1 GB.
max_total_bytes = 1_073_741_824
```

- The player's emergency save is encrypted with their Ed25519 public key before upload — only they can decrypt it. The community server stores opaque blobs, not readable player data.
- On next launch, if the player connects to the same community, the server offers: `"You have an emergency save from [date]. [Restore] [Delete]"`.
- After the retention period, the emergency save is automatically deleted. The player is notified on next connect if their save expired.
- This is an optional community service — communities choose to enable it. Official IC community servers will enable it by default with the standard limits.

**"Retry" after reconnection:**
- Engine re-probes the original `data_dir` path.
- If accessible: runs `PRAGMA integrity_check` on all databases (WAL files may be stale), checkpoints WAL, then performs the normal flush. If integrity check fails on any database: uses the in-memory version (which is authoritative — the on-disk copy is stale) and rewrites the database via `VACUUM INTO`.
- If still inaccessible: dialog remains.

**"Continue without saving":**
- Game continues. Buffered data stays in RAM. Player can trigger a save later via Settings → Data or by exiting the game normally.
- A persistent status indicator appears in the corner: `"Unsaved — storage unavailable"` (dismissable but re-appears on next flush attempt).
- If the player exits the game with unsaved data: final confirmation dialog: `"You have unsaved game data. Exit anyway? [Save first (browse location)] [Exit without saving] [Cancel]"`.

**Implementation notes:**
- Storage availability is checked only at flush points, not polled continuously. No background thread probing the USB drive every second.
- The check is a simple file operation (attempt to open a known file for writing). If it fails with an I/O error, the Storage Recovery Dialog appears.
- All of this is transparent to the sim — `ic-sim` never sees storage state. The storage resilience logic lives in `ic-game`'s I/O management layer.

**Portable mode does not require separate I/O parameters.** The default `ram_first` policy already handles slow/absent storage correctly. The storage recovery dialog is the same for all storage types — it just happens to be most useful for portable/USB users.

### Pre-Match Heap Allocation Discipline

All heap-allocated memory for gameplay should be allocated **before the match starts**, during the loading screen. This complements the existing zero-allocation hot path principle (Efficiency Pyramid Layer 5) with an explicit pre-allocation phase:

| Resource                                         | When Allocated                                    | Lifetime                                              |
| ------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------- |
| ECS component storage                            | Loading screen (Bevy `World` setup)               | Entire match                                          |
| Scratch buffers (`TickScratch`)                  | Loading screen                                    | Entire match (`.clear()` per tick, never deallocated) |
| Pathfinding caches (flowfield, JPS open list)    | Loading screen (sized to map dimensions)          | Entire match                                          |
| Spatial index (`SpatialHash`)                    | Loading screen (sized to map dimensions)          | Entire match                                          |
| String intern table                              | Loading screen (populated during YAML parse)      | Entire session                                        |
| Replay write buffer                              | Loading screen (pre-sized ring buffer)            | Entire match                                          |
| In-memory SQLite                                 | Loading screen (populated from on-disk file)      | Entire match                                          |
| Autosave buffer                                  | Loading screen (pre-sized for max delta snapshot) | Entire match                                          |
| Audio decode buffers                             | Loading screen                                    | Entire match                                          |
| Render buffers (sprite batches, etc.)            | Loading screen (Bevy renderer init)               | Entire match                                          |
| Fog of war / influence map (`DoubleBuffered<T>`) | Loading screen (sized to map grid)                | Entire match                                          |

**Rule:** If `malloc` is called during `tick_system()` or any system that runs between tick start and tick end, it is a performance bug. The only acceptable runtime allocations during gameplay are:
- Player chat messages (rare, small, outside sim)
- Network packet buffers (managed by `ic-net`, outside sim)
- Console command parsing (rare, user-initiated)
- Screenshot PNG encoding (background thread)

This list is finite and auditable. A CI benchmark that tracks per-tick allocation count (via a custom allocator in test builds) will catch regressions.
