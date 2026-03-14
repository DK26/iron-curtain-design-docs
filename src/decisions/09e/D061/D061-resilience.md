### Resilience Philosophy: Hackable but Unbreakable

IC gives users power over their data — open `.db` files, shipped `.sql` queries (D034), full CLI access, external tool compatibility. This is the "hacky in the good way" philosophy: transparent, moddable, empowering. But power without safety is dangerous. The design must ensure that **no user action can permanently break the game**, and that recovery from mistakes is always possible.

**Principle:** Enable everything. Protect against everything. If a user destroys something, the path back is obvious and fast.

**What can a user break, and how do they recover?**

| What the user does | Impact | Recovery | Time to recover |
|---|---|---|---|
| Deletes `gameplay.db` | Lose match history, stats, event log, replay catalog | Engine recreates empty database on next launch. Historical data lost but game works. Backup restores everything. | Instant (empty DB) or minutes (restore from backup) |
| Deletes `profile.db` | Lose friends list, settings, avatar, privacy prefs | Engine recreates with defaults. Identity key is separate (`keys/identity.key`). Community ratings survive (SCRs on server). | Instant (defaults) or minutes (restore) |
| Deletes `communities/*.db` | Lose local copies of ratings, match history, achievement proofs | Re-sync from community servers on next connect. SCRs re-downloaded automatically. No data permanently lost — servers are authoritative. | Seconds (automatic re-sync) |
| Deletes `achievements.db` | Lose local achievement proofs | Re-sync from community servers (SCR-backed achievements). Locally-tracked achievements lost unless backed up. | Seconds (SCR re-sync) |
| Deletes `config.toml` | Lose all settings (video, audio, controls, gameplay) | Engine recreates with defaults. First-launch wizard does NOT re-trigger (identity still exists). Performance profile re-detected from hardware. | Instant |
| Deletes `keys/identity.key` | **Critical** — lose cryptographic identity | Recover via 24-word mnemonic seed phrase (regenerates identical keypair). If phrase was never saved: fresh identity, community admin can transfer records. | Minutes (mnemonic) or manual (admin transfer) |
| Deletes entire `<data_dir>/` | Lose everything local | Mnemonic phrase + community re-sync recovers identity + ratings + achievements. Backup file restores everything else. Without mnemonic or backup: fresh start, admin transfer possible. | Minutes to hours depending on method |
| Corrupts a `.db` file (partial write, manual edit gone wrong) | Database fails integrity check | Engine runs `PRAGMA integrity_check` on startup. If corruption detected: renames corrupt file to `.db.corrupt`, creates fresh empty database, logs a warning, and offers restore from auto-snapshot. | Instant (auto-recovery with data loss notification) |
| Modifies `.db` schema (adds/drops tables externally) | Schema migration detects mismatch | Migration system checks `user_version` pragma. If schema is ahead of engine version: refuse to open (data too new). If schema is behind or mangled: attempt migration. If migration fails: rename to `.db.damaged`, create fresh, offer restore. | Instant (auto-recovery) |
| Modifies SCR records in `communities/*.db` | Ed25519 signature verification fails on tampered records | Tampered SCRs are silently rejected. Community server re-sync replaces them with valid signed copies. No permanent damage — cryptographic signatures make tampering detectable and self-healing. | Seconds (automatic) |
| Runs custom SQL that inserts bad data into `gameplay.db` | Possible nonsense in stats, broken views | Engine validates data on read (unexpected values are skipped/logged). `ic db optimize` + schema migration can repair index corruption. Worst case: delete and recreate the file (loses history, game still works). | Seconds to minutes |
| Deletes save files (`.icsave`) | Lose campaign progress | Re-downloadable from cloud sync if enabled. Otherwise, lost. Campaign can be replayed. | N/A (data loss, but game works) |
| Deletes replay files (`.icrep`) | Lose match recordings | Non-critical. Game works fine. Not recoverable unless backed up. | N/A |

**Automatic protection layers (always-on, no user action required):**

1. **Auto-snapshot (daily):** 3-day rotating critical backup (`keys/`, `profile.db`, `communities/*.db`, `achievements.db`, `config.toml`). ~5 MB. Runs silently during asset loading.
2. **Database integrity check on startup:** `PRAGMA integrity_check` on all databases. Corrupt files renamed, fresh databases created, user notified with restore offer.
3. **Schema version validation:** Forward-only migrations. Engine refuses to downgrade a database, preventing silent data loss from running an older version.
4. **SCR tamper detection:** Ed25519 signatures on all credential records. Tampered records automatically rejected and replaced on next community sync.
5. **Fossilize-pattern writes:** All database and save file writes use the append-safe pattern (temp file → fsync → atomic rename). A crash mid-write never corrupts the previous valid state.
6. **Cloud sync (opt-in):** Critical data uploaded on game exit and after matches. Restores automatically on new machine.

**Beyond file deletion — other ways users can break things, and how the engine recovers:**

| What the user does | Impact | Auto-Recovery |
|---|---|---|
| **Sets invalid config values** (e.g., `volume = -50`, `relay.max_games = 999999`) | Parameter out of range | Engine clamps all config values to documented min/max ranges on load. Invalid values → clamped + console warning: `"relay.max_games clamped to 100 (was 999999)"`. Config file not rewritten — clamped value used in memory only. `ic server validate-config` reports all out-of-range values before launch. |
| **Sets invalid cvar at runtime** (`/set net.tick_rate -1`) | Cvar type/range mismatch | Each cvar has a typed schema (int with range, enum, bool, string with max length). Invalid `/set` commands → console error: `"net.tick_rate: value -1 out of range [1, 120]"`. Sim state never affected — rejected cvars are no-ops. |
| **Edits YAML rules with invalid values** (`health: -1000`, `cost: 0`) | Balance broken, potential panics | YAML deserialization validates numeric fields against per-field min/max constraints. Out-of-range → clamped + warning: `"HeavyTank.health clamped to 1 (was -1000)"`. Missing required fields use defaults. Malformed YAML (syntax error) → mod fails to load entirely, error shown in lobby with [Disable Mod] option. |
| **Installs mod with circular dependencies** (A→B→C→A) | Mod loading hangs | Dependency resolver runs cycle detection (DFS with visited set) before loading. Cycle detected → mod fails to load with clear error. Game continues without affected mods. |
| **Installs corrupt `.icpkg` mod** (truncated zip, missing manifest) | Mod fails to load | SHA-256 verification on download. Failed → auto-retry (up to 3 attempts from different P2P sources). Still corrupt → `"package corrupt, re-download required"` + [Re-Download]. `ic mod repair <package>` forces re-download + re-verification. |
| **Modifies file during hot-reload** (partial write) | Asset load reads garbage | Hot-reload debounces (200ms after last change). File fails to parse → previous version retained, console warning. SDK uses atomic temp-file-then-rename. |
| **Changes balance rules mid-match via hot-reload** | Desync risk, fairness violation | Balance-affecting YAML rules locked at match start in multiplayer. Hot-reload of balance rules during a match rejected: `"Cannot hot-reload balance rules during active match."` Single-player allows it. |
| **LLM returns garbage** (invalid JSON, malformed YAML) | Mission generation fails | Validation pipeline: JSON parse error → retry with clarification (up to 3 attempts). YAML validation → reject + log. Numeric out-of-range → clamp. All retries fail → fallback to pre-generated template. Timeout (30s) → fallback. No LLM → pre-generated content only. |
| **Removes USB flash drive mid-game** | No impact during gameplay | RAM Mode = zero disk dependency during gameplay. Game keeps running. At next flush point (match end/pause): if storage unavailable → Storage Recovery Dialog offers five options: reconnect + retry, save to different local location, save to cloud (if configured), save to community server (if available, encrypted, TTL-based), or continue without saving. See `10-PERFORMANCE.md` § Portable Mode Integration & Storage Resilience. |
| **Downgrades engine version** (v0.5 DB opened by v0.3) | Schema mismatch | `PRAGMA user_version` check on open. If schema > engine version → refuse: `"gameplay.db was created by IC v0.5 (schema 12). This engine (v0.3, schema 8) cannot read it. Upgrade or restore from compatible backup."` Forward migrations automatic. |
| **Restores backup from newer engine** | Schema mismatch | `ic backup restore` checks `export_version` metadata. Backup version > engine version → refuse with upgrade guidance. Same/older version → restore + forward migration. |
| **Restore fails mid-way** (disk full, power loss) | Partial restore | Restore is atomic: (1) backup current state to `.pre-restore/`, (2) extract to temp, (3) verify, (4) swap. Failure → original data untouched. Power loss during swap → next launch detects both dirs, offers: `"Restore interrupted. [Resume] [Keep current]"`. |
| **Partial game asset install** (missing .mix files) | Missing sprites/audio | Content readiness check at launch. Missing critical assets → error with resolution: `"Missing: redalert.mix. [Re-scan] [Browse] [Download]"`. Missing optional → warning, fallback (no voice lines, subtitle-only). `ic asset validate` checks all imports. |
| **Decompression bomb** (.shp/.vqa claiming huge size) | Memory exhaustion | `ra-formats` parsers enforce caps: max sprite = 64 MB, max video frame = 16 MB, max .mix = 2 GB. Exceeds cap → parse error, file skipped. |
| **Command injection via chat/cvar** (player name with command syntax) | Possible command execution | All player-supplied strings are escaped before substitution into any command context. Chat messages are plain text only (D059). Cvar values are type-checked, never evaluated as commands. |
| **WAL file orphaned after crash** | .db-wal/.db-shm files remain | On startup, engine opens all databases (triggering SQLite's automatic WAL recovery). Orphaned WAL files are replayed and checkpointed. No user action needed — SQLite handles this natively. |

**CLI recovery commands:**

```
ic data health                    # Check integrity of all databases + critical files
ic data repair                    # Run integrity_check + repair on all databases
ic data repair gameplay           # Repair a specific database
ic data reset gameplay            # Delete and recreate gameplay.db (fresh, empty)
ic data reset config              # Reset config.toml to defaults
ic data reset --all               # Reset everything except identity key (nuclear option)
ic asset validate                 # Check all imported assets for corruption
ic mod repair <package>           # Re-download and re-verify a corrupt mod package
ic server validate-config <path>  # Validate server config ranges before launch
```

**Design principle:** The game should never fail to launch. If any data file is missing, corrupt, or incompatible, the engine creates fresh defaults and continues. The only file whose loss requires user action is `keys/identity.key`, and that's recoverable via the mnemonic phrase. Everything else is either re-downloadable, re-syncable, or recreatable with defaults.

**The broader principle: hackable but unbreakable.** IC gives users open `.db` files, shipped `.sql` queries (D034), full CLI access, hot-reload, console commands, moddable YAML/Lua/WASM, and direct filesystem access. Every exposed surface is designed so that: (1) invalid input is clamped, rejected, or replaced with defaults — never crashes the engine, (2) corrupted state is detected on startup and auto-recovered, (3) the path from "I broke something" to "everything works again" is at most one command or one click.

### Alternatives Considered

- **Proprietary backup format with encryption** (rejected — contradicts "standard formats only" principle; a ZIP file can be encrypted separately with standard tools if the player wants encryption)
- **IC-hosted cloud backup service** (rejected — creates infrastructure liability, ongoing cost, and makes player data dependent on IC's servers surviving; violates local-first philosophy)
- **Database-level replication** (rejected — over-engineered for the use case; SQLite `VACUUM INTO` is simpler, safer, and produces a self-contained file)
- **Steam Cloud as primary backup** (rejected — platform-specific, limited quota, opaque sync behavior; IC supports it as an *option*, not a requirement)
- **Incremental backup** (deferred — full backup via `VACUUM INTO` is sufficient for player-scale data; incremental adds complexity with minimal benefit unless someone has 50+ GB of replays)
- **Forced backup before first ranked match** (rejected — punishes players to solve a problem most won't have; auto-snapshots protect critical data without friction)
- **Scary "BACK UP YOUR KEY OR ELSE" warnings** (rejected — fear-based UX is hostile; the recovery phrase provides a genuine safety net, making fear unnecessary; factual presentation of options replaces warnings)
- **12-word mnemonic phrase** (rejected — 12 words = 128 bits of entropy; sufficient for most uses but 24 words = 256 bits matches Ed25519's full key strength; the BIP-39 ecosystem standardized on 24 words for high-security applications; the marginal cost of 12 extra words is negligible for a one-time operation)
- **Custom IC wordlist** (rejected — BIP-39's English wordlist is battle-tested, curated for unambiguous reading, and familiar to millions of cryptocurrency users; a custom list would need the same curation effort with no benefit)

### Integration with Existing Decisions

- **D010 (Snapshottable Sim):** Save files are sim snapshots — the backup system treats them as opaque binary files. No special handling needed beyond file copy.
- **D020 (Mod SDK & CLI):** The `ic backup` and `ic profile export` commands join the `ic` CLI family alongside `ic mod`, `ic replay`, `ic campaign`.
- **D030 (Workshop):** Post-milestone nudge toasts use the same toast system as Workshop cleanup prompts — consistent notification UX.
- **D032 (UI Themes):** First-launch identity creation integrates as the final step after theme selection. The Data & Backup panel is theme-aware.
- **D034 (SQLite):** SQLite is the backbone of player data storage. `VACUUM INTO` is the safe backup primitive — it handles WAL mode correctly and produces a compacted single-file copy.
- **D052 (Community Servers & SCR):** SCRs are the portable reputation unit. The backup system preserves them; the export system includes them. Because SCRs are cryptographically signed, they're self-verifying on import — no server round-trip needed. Restore progress screen visibly verifies SCRs.
- **D053 (Player Profile):** The profile export is D053's data portability implementation. All locally-authoritative profile fields export to JSON; all SCR-backed fields export with full credential data.
- **D036 (Achievements):** Achievement proofs are SCRs stored in `achievements.db`. Backup preserves them; export includes them in the JSON.
- **D058 (Console):** All backup/export operations have `/backup` and `/profile` console command equivalents.

### Phase

- **Phase 0:** Define and document the `<data_dir>` directory layout (this decision). Add `IC_DATA_DIR` / `--data-dir` override support.
- **Phase 2:** `ic backup create/restore` CLI ships alongside the save/load system. Screenshot capture with PNG metadata. Automatic daily critical snapshots (3-day rotating `auto-critical-N.zip`). Mnemonic seed generation integrated into identity creation — `ic identity seed show`, `ic identity seed verify`, `ic identity recover` CLI commands.
- **Phase 3:** Screenshot browser UI with metadata filtering and replay linking. Data & Backup settings panel (including "View recovery phrase" button). Post-milestone nudge toasts (first nudge reminds about recovery phrase if not yet confirmed). First-launch identity creation with recovery phrase display + cloud sync offer. Mnemonic recovery option in first-launch restore flow.
- **Phase 5:** `ic profile export` ships alongside multiplayer launch (GDPR compliance). Platform cloud sync via `PlatformServices` trait (Steam Cloud, GOG Galaxy). `ic backup verify` for archive integrity checking. First-launch restore flow (cloud detection + manual restore + mnemonic recovery). Console commands (`/backup`, `/profile`, `/identity`, `/data`, `/cloud`).


