## D061: Player Data Backup & Portability

|                |                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                          |
| **Driver**     | Players need to back up, restore, and migrate their game data — saves, replays, profiles, screenshots, statistics — across machines and over time |
| **Depends on** | D034 (SQLite), D053 (Player Profile), D052 (Community Servers & SCR), D036 (Achievements), D010 (Snapshottable Sim)                               |

### Problem

Every game that stores player data eventually faces the same question: "How do I move my stuff to a new computer?" The answer ranges from terrible (hunt for hidden AppData folders, hope you got the right files) to opaque (proprietary cloud sync that works until it doesn't). IC's local-first architecture (D034, D053) means all player data already lives on the player's machine — which is both the opportunity and the responsibility. If everything is local, losing that data means losing everything: campaign progress, competitive history, replay collection, social connections.

The design must satisfy three requirements:
1. **Backup:** A player can create a complete, restorable snapshot of all their IC data.
2. **Portability:** A player can move their data to another machine or a fresh install and resume exactly where they left off.
3. **Data export:** A player can extract their data in standard, human-readable formats (GDPR Article 20 compliance, and just good practice).

### Design Principles

1. **"Just copy the folder" must work.** The data directory is self-contained. No registry entries, no hidden temp folders, no external database connections. A manual copy of `<data_dir>/` is a valid (if crude) backup.
2. **Standard formats only.** ZIP for archives, SQLite for databases, PNG for images, YAML/JSON for configuration. No proprietary backup format. A player should be able to inspect their own data with standard tools (DB Browser for SQLite, any image viewer, any text editor).
3. **No IC-hosted cloud.** IC does not operate cloud storage. Cloud sync is opt-in through existing platform services (Steam Cloud, GOG Galaxy). This avoids infrastructure cost, liability, and the temptation to make player data hostage to a service.
4. **SCRs are inherently portable.** Signed Credential Records (D052) are self-verifying — they carry the community public key, payload, and Ed25519 signature. A player's verified ratings, achievements, and community memberships work on any IC install without re-earning or re-validating. This is IC's unique advantage over every competitor.
5. **Backup is a first-class CLI feature.** Not buried in a settings menu, not a third-party tool. `ic backup create` is a documented, supported command.

### Data Directory Layout

All player data lives under a single, stable, documented directory. The layout is defined at Phase 0 (directory structure), stabilized by Phase 2 (save/replay formats finalized), and fully populated by Phase 5 (multiplayer profile data).

```
<data_dir>/
├── config.toml                         # Engine + game settings (D033 toggles, keybinds, render quality)
├── profile.db                          # Player identity, friends, blocks, privacy settings (D053), LLM provider config (D047)
├── achievements.db                     # Achievement collection (D036)
├── gameplay.db                         # Event log, replay catalog, save game index, map catalog, asset index (D034)
├── telemetry.db                        # Unified telemetry events (D031) — pruned at 100 MB
├── keys/                               # Player Ed25519 keypair (D052) — THE critical file
│   └── identity.key                    # Private key — recoverable via mnemonic seed phrase
├── communities/                        # Per-community credential stores (D052)
│   ├── official-ic.db                  # SCRs: ratings, match results, achievements
│   └── clan-wolfpack.db
├── saves/                              # Save game files (.icsave)
│   ├── campaign-allied-mission5.icsave
│   ├── autosave-001.icsave
│   ├── autosave-002.icsave
│   └── autosave-003.icsave            # Rotating 3-slot autosave
├── replays/                            # Replay files (.icrep)
│   └── 2027-03-15-ranked-1v1.icrep
├── screenshots/                        # Screenshot images (PNG with metadata)
│   └── 2027-03-15-154532.png
├── workshop/                           # Downloaded Workshop content (D030)
│   ├── cache.db                        # Workshop metadata cache (D034)
│   ├── blobs/                          # Content-addressed blob store (D049, Phase 6a)
│   └── packages/                       # Per-package manifests (references into blobs/)
├── mods/                               # Locally installed mods
├── maps/                               # Locally installed maps
├── logs/                               # Engine log files (rotated)
└── backups/                            # Created by `ic backup create`
    └── ic-backup-2027-03-15.zip
```

**Platform-specific `<data_dir>` resolution:**

| Platform       | Default Location                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Windows        | `%APPDATA%\IronCurtain\`                                                                         |
| macOS          | `~/Library/Application Support/IronCurtain/`                                                     |
| Linux          | `$XDG_DATA_HOME/iron-curtain/` (default: `~/.local/share/iron-curtain/`)                         |
| Steam Deck     | Same as Linux                                                                                    |
| Browser (WASM) | OPFS virtual filesystem (see `05-FORMATS.md` § Browser Storage)                                  |
| Mobile         | App sandbox (platform-managed)                                                                   |
| Portable mode  | `<exe_dir>/data/` (activated by `IC_PORTABLE=1`, `--portable`, or `portable.marker` next to exe) |

**Override:** `IC_DATA_DIR` environment variable or `--data-dir` CLI flag overrides the default. Portable mode (`IC_PORTABLE=1`, `--portable` flag, or `portable.marker` file next to the executable) resolves all paths relative to the executable via the [`app-path`](https://github.com/DK26/app-path-rs) crate — useful for USB-stick deployments, Steam Deck SD cards, and self-contained distributions. All path resolution is centralized in the `ic-paths` crate (see `02-ARCHITECTURE.md` § Crate Design Notes).

### Backup System: `ic backup` CLI

The `ic backup` CLI provides safe, consistent backups. Following the Fossilize-inspired CLI philosophy (D020 — each subcommand does one focused thing well):

```
ic backup create                              # Full backup → <data_dir>/backups/ic-backup-<date>.zip
ic backup create --output ~/my-backup.zip     # Custom output path
ic backup create --exclude replays,workshop   # Smaller backup — skip large data
ic backup create --only keys,profile,saves    # Targeted backup — critical data only
ic backup restore ic-backup-2027-03-15.zip    # Restore from backup (prompts on conflict)
ic backup restore backup.zip --overwrite      # Restore without prompting
ic backup list                                # List available backups with size and date
ic backup verify ic-backup-2027-03-15.zip     # Verify archive integrity without restoring
```

**How `ic backup create` works:**

1. **SQLite databases:** Each `.db` file is backed up using `VACUUM INTO '<temp>.db'` — this creates a consistent, compacted copy without requiring the database to be closed. WAL checkpoints are folded in. No risk of copying a half-written WAL file.
2. **Binary files:** `.icsave`, `.icrep`, `.icpkg` files are copied as-is (they're self-contained).
3. **Image files:** PNG screenshots are copied as-is.
4. **Config files:** `config.toml` and other TOML configuration files are copied as-is.
5. **Key files:** `keys/identity.key` is included (the player's private key — also recoverable via mnemonic seed phrase, but a full backup preserves everything).
6. **Package:** Everything is bundled into a ZIP archive with the original directory structure preserved. No compression on already-compressed files (`.icsave`, `.icrep` are LZ4-compressed internally).

**Credential safety in backups:** `profile.db` contains AES-256-GCM encrypted credential columns (OAuth tokens, API keys — see V61 in `06-SECURITY.md`, D047). The encrypted BLOBs are included in the backup as-is — still encrypted. The Data Encryption Key (DEK) is **not** in the backup (it lives in the OS keyring or is derived from the user's vault passphrase). This means a stolen backup archive does not expose LLM provider credentials. On restore, the user must unlock the `CredentialStore` on the new machine (OS keyring auto-unlocks on login; Tier 2 vault passphrase is prompted). If the DEK is lost (new machine, no keyring migration), the encrypted columns are unreadable — the user re-enters their API keys. This is the intended behavior: credentials fail-safe to "re-enter" rather than fail-open to "exposed."

**How `ic backup restore` works:**

`ic backup restore` extracts a backup ZIP into `<data_dir>`. Because backup archives may come from untrusted sources (shared online, downloaded from a forum, received from another player), extraction uses `strict-path` `PathBoundary` scoped to `<data_dir>` — the same Zip Slip defense used for `.oramap` and `.icpkg` extraction (see `06-SECURITY.md` § Path Security Infrastructure). A crafted backup ZIP with entries like `../../.config/autostart/malware.sh` is rejected before any file is written.

**Backup categories for `--exclude` and `--only`:**

| Category       | Contents                       | Typical Size   | Critical?                                                    |
| -------------- | ------------------------------ | -------------- | ------------------------------------------------------------ |
| `keys`         | `keys/identity.key`            | < 1 KB         | **Yes** — recoverable via mnemonic seed phrase               |
| `profile`      | `profile.db`                   | < 1 MB         | **Yes** — friends, settings, avatar, LLM provider config     |
| `communities`  | `communities/*.db`             | 1–10 MB        | **Yes** — ratings, match history (SCRs)                      |
| `achievements` | `achievements.db`              | < 1 MB         | **Yes** — local achievement progress and unlock state (D036) |
| `config`       | `config.toml`                  | < 100 KB       | Medium — preferences, easily recreated                       |
| `saves`        | `saves/*.icsave`               | 10–100 MB      | High — campaign progress, in-progress games                  |
| `replays`      | `replays/*.icrep`              | 100 MB – 10 GB | Low — sentimental, not functional                            |
| `screenshots`  | `screenshots/*.png`            | 10 MB – 5 GB   | Low — sentimental, not functional                            |
| `workshop`     | `workshop/` (cache + packages) | 100 MB – 50 GB | None — re-downloadable                                       |
| `gameplay`     | `gameplay.db`                  | 10–100 MB      | Medium — event log, catalogs (rebuildable)                   |
| `mods`         | `mods/`                        | Variable       | Low — re-downloadable or re-installable                      |
| `maps`         | `maps/`                        | Variable       | Low — re-downloadable                                        |

**Default `ic backup create`** includes: `keys`, `profile`, `communities`, `achievements`, `config`, `saves`, `replays`, `screenshots`, `gameplay`. Excludes `workshop`, `mods`, `maps` (re-downloadable). Total size for a typical player: 200 MB – 2 GB.

### Database Query & Export: `ic db` CLI

Beyond backup/restore, players and community tool developers can query, export, and optimize local SQLite databases directly. See D034 § "User-Facing Database Access" for the full design.

```
ic db list                                         # List all local .db files with sizes
ic db query gameplay "SELECT * FROM v_win_rate_by_faction"  # Read-only SQL query
ic db export gameplay matches --format csv > matches.csv    # Export table/view to CSV or JSON
ic db schema gameplay                              # Print full schema
ic db optimize                                     # VACUUM + ANALYZE all databases (reclaim space)
ic db open gameplay                                # Open in system SQLite browser
ic db size                                         # Show disk usage per database
```

All queries are **read-only** (`SQLITE_OPEN_READONLY`). Pre-built SQL views (`v_win_rate_by_faction`, `v_recent_matches`, `v_economy_trends`, `v_unit_kd_ratio`, `v_apm_per_match`) ship with the schema and are available to both the CLI and external tools.

`ic db optimize` is particularly useful for portable mode / flash drive users — it runs `VACUUM` (defragment, reclaim space) + `ANALYZE` (rebuild index statistics) on all local databases. Also accessible from `Settings → Data → Optimize Databases` in the UI.

### Profile Export: JSON Data Portability

For GDPR Article 20 compliance and general good practice, IC provides a machine-readable profile export:

```
ic profile export                             # → <data_dir>/exports/profile-export-<date>.json
ic profile export --format json               # Explicit format (JSON is default)
```

**Export contents:**

```json
{
  "export_version": "1.0",
  "exported_at": "2027-03-15T14:30:00Z",
  "engine_version": "0.5.0",
  "identity": {
    "display_name": "CommanderZod",
    "public_key": "ed25519:abc123...",
    "bio": "Tank rush enthusiast since 1996",
    "title": "Iron Commander",
    "country": "DE",
    "created_at": "2027-01-15T10:00:00Z"
  },
  "communities": [
    {
      "name": "Official IC Community",
      "public_key": "ed25519:def456...",
      "joined_at": "2027-01-15",
      "rating": { "game_module": "ra1", "value": 1823, "rd": 45 },
      "matches_played": 342,
      "achievements": 23,
      "credentials": [
        {
          "type": "rating",
          "payload_hex": "...",
          "signature_hex": "...",
          "note": "Self-verifying — import on any IC install"
        }
      ]
    }
  ],
  "friends": [
    { "display_name": "alice", "community": "Official IC Community", "added_at": "2027-02-01" }
  ],
  "statistics_summary": {
    "total_matches": 429,
    "total_playtime_hours": 412,
    "win_rate": 0.579,
    "faction_distribution": { "soviet": 0.67, "allied": 0.28, "random": 0.05 }
  },
  "saves_count": 12,
  "replays_count": 287,
  "screenshots_count": 45
}
```

The key feature: **SCRs are included in the export and are self-verifying.** A player can import their profile JSON on a new machine, and their ratings and achievements are cryptographically proven without contacting any server. No other game offers this.

### Platform Cloud Sync (Optional)

For players who use Steam, GOG Galaxy, or other platforms with cloud save support, IC can optionally sync critical data via the `PlatformServices` trait:

```rust
/// Extension to PlatformServices (D053) for cloud backup.
pub trait PlatformCloudSync {
    /// Upload a small file to platform cloud storage.
    fn cloud_save(&self, key: &str, data: &[u8]) -> Result<()>;
    /// Download a file from platform cloud storage.
    fn cloud_load(&self, key: &str) -> Result<Option<Vec<u8>>>;
    /// List available cloud files.
    fn cloud_list(&self) -> Result<Vec<CloudEntry>>;
    /// Available cloud storage quota (bytes).
    fn cloud_quota(&self) -> Result<CloudQuota>;
}

pub struct CloudQuota {
    pub used: u64,
    pub total: u64,  // e.g., Steam Cloud: ~1 GB per game
}
```

**What syncs:**

| Data                | Sync?   | Rationale                                                                       |
| ------------------- | ------- | ------------------------------------------------------------------------------- |
| `keys/identity.key` | **Yes** | Critical — also recoverable via mnemonic seed phrase, but cloud sync is simpler |
| `profile.db`        | **Yes** | Small, essential                                                                |
| `communities/*.db`  | **Yes** | Small, contains verified reputation (SCRs)                                      |
| `achievements.db`   | **Yes** | Small, contains achievement proofs                                              |
| `config.toml`       | **Yes** | Small, preserves preferences across machines                                    |
| Latest autosave     | **Yes** | Resume campaign on another machine (one `.icsave` only)                         |
| `saves/*.icsave`    | No      | Too large for cloud quotas (user manages manually)                              |
| `replays/*.icrep`   | No      | Too large, not critical                                                         |
| `screenshots/*.png` | No      | Too large, not critical                                                         |
| `workshop/`         | No      | Re-downloadable                                                                 |

**Total cloud footprint:** ~5–20 MB. Well within Steam Cloud's ~1 GB per-game quota.

**Sync triggers:** Cloud sync happens at: game launch (download), game exit (upload), and after completing a match/mission (upload changed community DBs). Never during gameplay — no sync I/O on the hot path.

### Screenshots

Screenshots are standard PNG files with embedded metadata in the PNG `tEXt` chunks:

| Key                | Value                                           |
| ------------------ | ----------------------------------------------- |
| `IC:EngineVersion` | `"0.5.0"`                                       |
| `IC:GameModule`    | `"ra1"`                                         |
| `IC:MapName`       | `"Arena"`                                       |
| `IC:Timestamp`     | `"2027-03-15T15:45:32Z"`                        |
| `IC:Players`       | `"CommanderZod (Soviet) vs alice (Allied)"`     |
| `IC:GameTick`      | `"18432"`                                       |
| `IC:ReplayFile`    | `"2027-03-15-ranked-1v1.icrep"` (if applicable) |

Standard PNG viewers ignore these chunks; IC's screenshot browser reads them for filtering and organization. The screenshot hotkey (mapped in `config.toml`) captures the current frame, embeds metadata, and saves to `screenshots/` with a timestamped filename.

### Mnemonic Seed Recovery

The Ed25519 private key in `keys/identity.key` is the player's cryptographic identity. If lost without backup, ratings, achievements, and community memberships are gone. Cloud sync and auto-snapshots mitigate this, but both require the original machine to have been configured correctly. A player who never enabled cloud sync and whose hard drive dies loses everything.

**Mnemonic seed phrases** solve this with zero infrastructure. Inspired by BIP-39 (Bitcoin Improvement Proposal 39), the pattern derives a cryptographic keypair deterministically from a human-readable word sequence. The player writes the words on paper. On any machine, entering those words regenerates the identical keypair. The cheapest, most resilient "cloud backup" is a piece of paper in a drawer.

#### How It Works

1. **Key generation:** When IC creates a new identity, it generates 256 bits of entropy from the OS CSPRNG (`getrandom`).
2. **Mnemonic encoding:** The entropy maps to a 24-word phrase from the BIP-39 English wordlist (2048 words, 11 bits per word, 24 × 11 = 264 bits — 256 bits entropy + 8-bit checksum). The wordlist is curated for unambiguous reading: no similar-looking words, no offensive words, sorted alphabetically. Example: `abandon ability able about above absent absorb abstract absurd abuse access accident`.
3. **Key derivation:** The mnemonic phrase is run through PBKDF2-HMAC-SHA512 (2048 rounds, per BIP-39 spec) with an optional passphrase as salt (default: empty string). The 512-bit output is truncated to 32 bytes and used as the Ed25519 private key seed.
4. **Deterministic output:** Same 24 words + same passphrase → identical Ed25519 keypair on any platform. The derivation uses only standardized primitives (PBKDF2, HMAC, SHA-512, Ed25519) — no IC-specific code in the critical path.

```rust
/// Derives an Ed25519 keypair from a BIP-39 mnemonic phrase.
///
/// The derivation is deterministic: same words + same passphrase
/// always produce the same keypair on every platform.
pub fn keypair_from_mnemonic(
    words: &[&str; 24],
    passphrase: &str,
) -> Result<Ed25519Keypair, MnemonicError> {
    let entropy = mnemonic_to_entropy(words)?;  // validate checksum
    let salt = format!("mnemonic{}", passphrase);
    let mut seed = [0u8; 64];
    pbkdf2_hmac_sha512(
        &entropy_to_seed_input(words),
        salt.as_bytes(),
        2048,
        &mut seed,
    );
    let signing_key = Ed25519SigningKey::from_bytes(&seed[..32])?;
    Ok(Ed25519Keypair {
        signing_key,
        verifying_key: signing_key.verifying_key(),
    })
}
```

#### Optional Passphrase (Advanced)

The mnemonic can optionally be combined with a user-chosen passphrase during key derivation. This provides two-factor recovery: the 24 words (something you wrote down) + the passphrase (something you remember). Different passphrases produce different keypairs from the same words — useful for advanced users who want plausible deniability or multiple identities from one seed. The default is no passphrase (empty string). The UI does not promote this feature — it's accessible via CLI and the advanced section of the recovery flow.

#### CLI Commands

```
ic identity seed show          # Display the 24-word mnemonic for the current identity
                               # Requires interactive confirmation ("This is your recovery phrase.
                               # Anyone with these words can become you. Write them down and
                               # store them somewhere safe.")
ic identity seed verify        # Enter 24 words to verify they match the current identity
ic identity recover            # Enter 24 words (+ optional passphrase) to regenerate keypair
                               # If identity.key already exists, prompts for confirmation
                               # before overwriting
ic identity recover --passphrase  # Prompt for passphrase in addition to mnemonic
```

#### Security Properties

| Property                   | Detail                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entropy**                | 256 bits from OS CSPRNG — same as generating a key directly. The mnemonic is an encoding, not a weakening.                                    |
| **Brute-force resistance** | 2²⁵⁶ possible mnemonics. Infeasible to enumerate.                                                                                             |
| **Checksum**               | Last 8 bits are SHA-256 checksum of the entropy. Catches typos during recovery (1 word wrong → checksum fails).                               |
| **Offline**                | No network, no server, no cloud. The 24 words ARE the identity.                                                                               |
| **Standard**               | BIP-39 is used by every major cryptocurrency wallet. Millions of users have successfully recovered keys from mnemonic phrases. Battle-tested. |
| **Platform-independent**   | Same words produce the same key on Windows, macOS, Linux, WASM, mobile. The derivation uses only standardized cryptographic primitives.       |

#### What the Mnemonic Does NOT Replace

- **Cloud sync** — still the best option for seamless multi-device use. The mnemonic is the disaster recovery layer beneath cloud sync.
- **Regular backups** — the mnemonic recovers the *identity* (keypair). It does not recover save files, replays, screenshots, or settings. A full backup preserves everything.
- **Community server records** — after mnemonic recovery, the player's keypair is restored, but community servers still hold the match history and SCRs. No re-earning needed — the recovered keypair matches the old public key, so existing SCRs validate automatically.

#### Precedent

The BIP-39 mnemonic pattern has been used since 2013 by Bitcoin, Ethereum, and every major cryptocurrency wallet. Ledger, Trezor, MetaMask, and Phantom all use 24-word recovery phrases as the standard key backup mechanism. The pattern has survived a decade of adversarial conditions (billions of dollars at stake) and is understood by millions of non-technical users. IC adapts the encoding and derivation steps verbatim — the only IC-specific part is using the derived key for Ed25519 identity rather than cryptocurrency transactions.


---

## Sub-Pages

| Section                  | Topic                                                                                                                                 | File                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Player Experience        | First launch (new/existing player), automatic behaviors, Settings data panel, screenshot gallery, identity recovery, console commands | [D061-player-experience.md](D061/D061-player-experience.md) |
| Resilience & Integration | Resilience philosophy (hackable but unbreakable), alternatives considered, integration with existing decisions, phase                 | [D061-resilience.md](D061/D061-resilience.md)               |
