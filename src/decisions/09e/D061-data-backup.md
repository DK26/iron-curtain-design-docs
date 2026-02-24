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
├── profile.db                          # Player identity, friends, blocks, privacy settings (D053)
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

| Platform       | Default Location                                                         |
| -------------- | ------------------------------------------------------------------------ |
| Windows        | `%APPDATA%\IronCurtain\`                                                 |
| macOS          | `~/Library/Application Support/IronCurtain/`                             |
| Linux          | `$XDG_DATA_HOME/iron-curtain/` (default: `~/.local/share/iron-curtain/`) |
| Steam Deck     | Same as Linux                                                            |
| Browser (WASM) | OPFS virtual filesystem (see `05-FORMATS.md` § Browser Storage)          |
| Mobile         | App sandbox (platform-managed)                                           |
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

**Backup categories for `--exclude` and `--only`:**

| Category       | Contents                       | Typical Size   | Critical?                                      |
| -------------- | ------------------------------ | -------------- | ---------------------------------------------- |
| `keys`         | `keys/identity.key`            | < 1 KB         | **Yes** — recoverable via mnemonic seed phrase |
| `profile`      | `profile.db`                   | < 1 MB         | **Yes** — friends, settings, avatar            |
| `communities`  | `communities/*.db`             | 1–10 MB        | **Yes** — ratings, match history (SCRs)        |
| `achievements` | `achievements.db`              | < 1 MB         | **Yes** — SCR-backed achievement proofs        |
| `config`       | `config.toml`                  | < 100 KB       | Medium — preferences, easily recreated         |
| `saves`        | `saves/*.icsave`               | 10–100 MB      | High — campaign progress, in-progress games    |
| `replays`      | `replays/*.icrep`              | 100 MB – 10 GB | Low — sentimental, not functional              |
| `screenshots`  | `screenshots/*.png`            | 10 MB – 5 GB   | Low — sentimental, not functional              |
| `workshop`     | `workshop/` (cache + packages) | 100 MB – 50 GB | None — re-downloadable                         |
| `gameplay`     | `gameplay.db`                  | 10–100 MB      | Medium — event log, catalogs (rebuildable)     |
| `mods`         | `mods/`                        | Variable       | Low — re-downloadable or re-installable        |
| `maps`         | `maps/`                        | Variable       | Low — re-downloadable                          |

**Default `ic backup create`** includes: `keys`, `profile`, `communities`, `achievements`, `config`, `saves`, `replays`, `screenshots`, `gameplay`. Excludes `workshop`, `mods`, `maps` (re-downloadable). Total size for a typical player: 200 MB – 2 GB.

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

### Player Experience

The mechanical design above (CLI, formats, directory layout) is the foundation. This section defines what the *player* actually sees and feels. The guiding principle: **players should never lose data without trying.** The system works in layers:

1. **Invisible layer (always-on):** Cloud sync for critical data, automatic daily snapshots
2. **Gentle nudge layer:** Milestone-based reminders, status indicators in settings
3. **Explicit action layer:** In-game Data & Backup panel, CLI for power users
4. **Emergency layer:** Disaster recovery, identity re-creation guidance

#### First Launch — New Player

Integrates with D032's "Day-one nostalgia choice." After the player picks their experience profile (Classic/Remastered/Modern), two additional steps:

**Step 1 — Identity creation + recovery phrase:**

```
┌─────────────────────────────────────────────────────────────┐
│                     WELCOME TO IRON CURTAIN                 │
│                                                             │
│  Your player identity has been created.                     │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  CommanderZod                                         │  │
│  │  ID: ed25519:7f3a...b2c1                              │  │
│  │  Created: 2027-03-15                                  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Your recovery phrase — write these 24 words down and       │
│  store them somewhere safe. They can restore your           │
│  identity on any machine.                                   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  1. abandon     7. absorb    13. acid     19. across  │  │
│  │  2. ability     8. abstract  14. acoustic  20. act    │  │
│  │  3. able        9. absurd    15. acquire  21. action  │  │
│  │  4. about      10. abuse     16. adapt    22. actor   │  │
│  │  5. above      11. access    17. add      23. actress │  │
│  │  6. absent     12. accident  18. addict   24. actual  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [I've written them down]            [Skip — I'll do later] │
│                                                             │
│  You can view this phrase anytime: Settings → Data & Backup │
│  or run `ic identity seed show` from the command line.      │
└─────────────────────────────────────────────────────────────┘
```

**Step 2 — Cloud sync offer:**

```
┌─────────────────────────────────────────────────────────────┐
│                     PROTECT YOUR DATA                       │
│                                                             │
│  Your recovery phrase protects your identity. Cloud sync    │
│  also protects your settings, ratings, and progress.        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ☁  Enable Cloud Sync                               │    │
│  │    Automatically backs up your profile,             │    │
│  │    ratings, and settings via Steam Cloud.           │    │
│  │    [Enable]                                         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [Continue]                     [Skip — I'll set up later]  │
│                                                             │
│  You can always manage backups in Settings → Data & Backup  │
└─────────────────────────────────────────────────────────────┘
```

**Rules:**
- Identity creation is automatic — no sign-up, no email, no password
- The recovery phrase is shown once during first launch, then always accessible via Settings or CLI
- Cloud sync is offered but not required — "Continue" without enabling works fine
- Skipping the recovery phrase is allowed (no forced engagement) — the first milestone nudge will remind
- If no platform cloud is available (non-Steam/non-GOG install), Step 2 instead shows: "We recommend creating a backup after your first few games. IC will remind you."
- The entire flow is skippable — no forced engagement

#### First Launch — Existing Player on New Machine

This is the critical UX flow. Detection logic on first launch:

```
                    ┌──────────────┐
                    │ First launch │
                    │  detected    │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐        ┌──────────────────┐
                    │ Platform     │  Yes   │ Offer automatic  │
                    │ cloud data   ├───────►│ cloud restore    │
                    │ available?   │        └──────────────────┘
                    └──────┬───────┘
                           │ No
                    ┌──────▼───────┐
                    │ Show restore │
                    │ options      │
                    └──────────────┘
```

**Cloud restore path (automatic detection):**

```
┌─────────────────────────────────────────────────────────────┐
│                  EXISTING PLAYER DETECTED                    │
│                                                             │
│  Found data from your other machine:                        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  CommanderZod                                         │  │
│  │  Rating: 1823 (Private First Class)                   │  │
│  │  342 matches played · 23 achievements                 │  │
│  │  Last played: March 14, 2027 on DESKTOP-HOME          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [Restore my data]              [Start fresh instead]       │
│                                                             │
│  Restores: identity, ratings, achievements, settings,       │
│  friends list, and latest campaign autosave.                │
│  Replays, screenshots, and full saves require a backup      │
│  file or manual folder copy.                                │
└─────────────────────────────────────────────────────────────┘
```

**Manual restore path (no cloud data):**

```
┌─────────────────────────────────────────────────────────────┐
│                     WELCOME TO IRON CURTAIN                 │
│                                                             │
│  Played before? Restore your data:                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  🔑  Recover from recovery phrase                   │    │
│  │      Enter your 24-word phrase to restore identity  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  📁  Restore from backup file                       │    │
│  │      Browse for a .zip backup created by IC         │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  📂  Copy from existing data folder                 │    │
│  │      Point to a copied <data_dir> from your old PC  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [Start fresh — create new identity]                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Mnemonic recovery flow (from "Recover from recovery phrase"):**

```
┌─────────────────────────────────────────────────────────────┐
│                   RECOVER YOUR IDENTITY                      │
│                                                             │
│  Enter your 24-word recovery phrase:                        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  1. [________]   7. [________]  13. [________]       │  │
│  │  2. [________]   8. [________]  14. [________]       │  │
│  │  3. [________]   9. [________]  15. [________]       │  │
│  │  4. [________]  10. [________]  16. [________]       │  │
│  │  5. [________]  11. [________]  17. [________]       │  │
│  │  6. [________]  12. [________]  18. [________]       │  │
│  │                                                       │  │
│  │  19. [________]  21. [________]  23. [________]      │  │
│  │  20. [________]  22. [________]  24. [________]      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [Advanced: I used a passphrase]                            │
│                                                             │
│  [Recover]                                       [Back]     │
│                                                             │
│  Autocomplete suggests words as you type. Only BIP-39       │
│  wordlist entries are accepted.                              │
└─────────────────────────────────────────────────────────────┘
```

On successful recovery, the flow shows the restored identity (display name, public key fingerprint) and continues to the normal first-launch experience. Community servers recognize the recovered identity by its public key — existing SCRs validate automatically.

**Note:** Mnemonic recovery restores the *identity only* (keypair). Save files, replays, screenshots, and settings are not recovered by the phrase — those require a full backup or folder copy. The restore options panel makes this clear: "Recover from recovery phrase" is listed alongside "Restore from backup file" because they solve different problems. A player who has both a phrase and a backup should use the backup (it includes everything); a player who only has the phrase gets their identity back and can re-earn or re-download the rest.

**Restore progress (both paths):**

```
┌─────────────────────────────────────────────────────────────┐
│                     RESTORING YOUR DATA                     │
│                                                             │
│  ████████████████████░░░░░░░░  68%                          │
│                                                             │
│  ✓ Identity key                                             │
│  ✓ Profile & friends                                        │
│  ✓ Community ratings (3 communities, 12 SCRs verified)      │
│  ✓ Achievements (23 achievement proofs verified)            │
│  ◎ Save games (4 of 12)...                                  │
│  ○ Replays                                                  │
│  ○ Screenshots                                              │
│  ○ Settings                                                 │
│                                                             │
│  SCR verification: all credentials cryptographically valid  │
└─────────────────────────────────────────────────────────────┘
```

Key UX detail: **SCRs are verified during restore and the player sees it.** The progress screen shows credentials being cryptographically validated. This is a trust-building moment — "your reputation is portable and provable" becomes tangible.

#### Automatic Behaviors (No Player Interaction Required)

Most players never open a settings screen for backup. These behaviors protect them silently:

**Auto cloud sync (if enabled):**
- **On game exit:** Upload changed `profile.db`, `communities/*.db`, `achievements.db`, `config.toml`, `keys/identity.key`, latest autosave. Silent — no UI prompt.
- **On game launch:** Download cloud data, merge if needed (last-write-wins for simple files; SCR merge for community DBs — SCRs are append-only with timestamps, so merge is deterministic).
- **After completing a match:** Upload updated community DB (new match result / rating change). Background, non-blocking.

**Automatic daily snapshots (always-on, even without cloud):**
- On first launch of the day, the engine writes a lightweight "critical data snapshot" to `<data_dir>/backups/auto-critical-N.zip` containing only `keys/`, `profile.db`, `communities/*.db`, `achievements.db`, `config.toml` (~5 MB total).
- Rotating 3-day retention: `auto-critical-1.zip`, `auto-critical-2.zip`, `auto-critical-3.zip`. Oldest overwritten.
- No user interaction, no prompt, no notification. Background I/O during asset loading — invisible.
- Even players who never touch backup settings have 3 rolling days of critical data protection.

**Post-milestone nudges (main menu toasts):**

After significant events, a non-intrusive toast appears on the main menu — same system as D030's Workshop cleanup toasts:

| Trigger                                | Toast (cloud sync active)                                                    | Toast (no cloud sync)                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| First ranked match                     | `Your competitive career has begun! Your rating is backed up automatically.` | `Your competitive career has begun! Protect your rating: [Back up now]  [Dismiss]`                       |
| First campaign mission                 | `Campaign progress saved.` (no toast — autosave handles it)                  | `Campaign progress saved. [Create backup]  [Dismiss]`                                                    |
| New ranked tier reached                | `Congratulations — Private First Class!`                                     | `Congratulations — Private First Class! [Back up now]  [Dismiss]`                                        |
| 30 days without full backup (no cloud) | —                                                                            | `It's been a month since your last backup. Your data folder is 1.4 GB. [Back up now]  [Remind me later]` |

**Nudge rules:**
- **Never during gameplay.** Only on main menu or post-game screen.
- **Maximum one nudge per session.** If multiple triggers fire, highest-priority wins.
- **Dismissable and respectful.** "Remind me later" delays by 7 days. Three consecutive dismissals for the same nudge type = never show that nudge again.
- **No nudges if cloud sync is active and healthy.** The player is already protected.
- **No nudges for the first 3 game sessions.** Let players enjoy the game before talking about data management.

#### Settings → Data & Backup Panel

In-game UI for players who want to manage their data visually. Accessible from Main Menu → Settings → Data & Backup. This is the GUI equivalent of the `ic backup` CLI — same operations, visual interface.

```
┌──────────────────────────────────────────────────────────────────┐
│  Settings > Data & Backup                                        │
│                                                                  │
│  ┌─ DATA HEALTH ──────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  Identity key          ✓ Backed up (Steam Cloud)           │  │
│  │  Profile & ratings     ✓ Synced 2 hours ago                │  │
│  │  Achievements          ✓ Synced 2 hours ago                │  │
│  │  Campaign progress     ✓ Latest autosave synced            │  │
│  │  Last full backup      March 10, 2027 (5 days ago)         │  │
│  │  Data folder size      1.4 GB                              │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ BACKUP ───────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  [Create full backup]     Saves everything to a .zip file  │  │
│  │  [Create critical only]   Keys, profile, ratings (< 5 MB)  │  │
│  │  [Restore from backup]    Load a .zip backup file          │  │
│  │                                                            │  │
│  │  Saved backups:                                            │  │
│  │    ic-backup-2027-03-10.zip     1.2 GB    [Open] [Delete]  │  │
│  │    ic-backup-2027-02-15.zip     980 MB    [Open] [Delete]  │  │
│  │    auto-critical-1.zip          4.8 MB    (today)          │  │
│  │    auto-critical-2.zip          4.7 MB    (yesterday)      │  │
│  │    auto-critical-3.zip          4.7 MB    (2 days ago)     │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ CLOUD SYNC ───────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  Status: Active (Steam Cloud)                              │  │
│  │  Last sync: March 15, 2027 14:32                           │  │
│  │  Cloud usage: 12 MB / 1 GB                                 │  │
│  │                                                            │  │
│  │  [Sync now]  [Disable cloud sync]                          │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ EXPORT & PORTABILITY ─────────────────────────────────────┐  │
│  │                                                            │  │
│  │  [Export profile (JSON)]   Machine-readable data export    │  │
│  │  [Open data folder]        Browse files directly           │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**When cloud sync is not available** (non-Steam/non-GOG install), the Cloud Sync section shows:

```
│  ┌─ CLOUD SYNC ───────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  Status: Not available                                     │  │
│  │  Cloud sync requires Steam or GOG Galaxy.                  │  │
│  │                                                            │  │
│  │  Your data is protected by automatic daily snapshots.      │  │
│  │  We recommend creating a full backup periodically.         │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
```

And Data Health adjusts severity indicators:

```
│  │  Identity key          ⚠ Local only — not cloud-backed     │  │
│  │  Profile & ratings     ⚠ Local only                        │  │
│  │  Last full backup      Never                               │  │
│  │  Last auto-snapshot    Today (keys + profile + ratings)    │  │
```

The ⚠ indicator is yellow, not red — it's a recommendation, not an error. "Local only" is a valid state, not a broken state.

**"Create full backup" flow:** Clicking the button opens a save-file dialog (pre-filled with `ic-backup-<date>.zip`). A progress bar shows backup creation. On completion: `Backup created: ic-backup-2027-03-15.zip (1.2 GB)` with [Open folder] button. The same categories as `ic backup create --exclude` are exposed via checkboxes in an "Advanced" expander (collapsed by default).

**"Restore from backup" flow:** Opens a file browser filtered to `.zip` files. After selection, shows the restore progress screen (see "First Launch — Existing Player" above). If existing data conflicts with backup data, prompts: `Your current data differs from the backup. [Overwrite with backup]  [Cancel]`.

#### Screenshot Gallery

The screenshot browser (Phase 3) uses PNG `tEXt` metadata to organize screenshots into a browsable gallery. Accessible from Main Menu → Screenshots:

```
┌──────────────────────────────────────────────────────────────────┐
│  Screenshots                                        [Take now ⌂] │
│                                                                  │
│  Filter: [All maps ▾]  [All modes ▾]  [Date range ▾]  [Search…] │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │            │  │            │  │            │  │            │ │
│  │  (thumb)   │  │  (thumb)   │  │  (thumb)   │  │  (thumb)   │ │
│  │            │  │            │  │            │  │            │ │
│  ├────────────┤  ├────────────┤  ├────────────┤  ├────────────┤ │
│  │ Arena      │  │ Fjord      │  │ Arena      │  │ Red Pass   │ │
│  │ 1v1 Ranked │  │ 2v2 Team   │  │ Skirmish   │  │ Campaign   │ │
│  │ Mar 15     │  │ Mar 14     │  │ Mar 12     │  │ Mar 10     │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘ │
│                                                                  │
│  Selected: Arena — 1v1 Ranked — Mar 15, 2027 15:45               │
│  CommanderZod (Soviet) vs alice (Allied) · Tick 18432            │
│  [Watch replay]  [Open file]  [Copy to clipboard]  [Delete]      │
│                                                                  │
│  Total: 45 screenshots (128 MB)                                  │
└──────────────────────────────────────────────────────────────────┘
```

Key feature: **"Watch replay" links directly to the replay file** via the `IC:ReplayFile` metadata. Screenshots become bookmarks into match history. A screenshot gallery doubles as a game history browser.

Filters use metadata: map name, game module, date, player names. Sorting by date (default), map, or file size.

#### Identity Loss — Disaster Recovery

If a player loses their machine with no backup and no cloud sync, the outcome depends on whether they saved their recovery phrase:

**Recoverable via mnemonic seed phrase:**
- Ed25519 private key (the identity itself) — enter 24 words on any machine to regenerate the identical keypair
- Community recognition — recovered key matches the old public key, so existing SCRs validate automatically
- Ratings and match history — community servers recognize the recovered identity without admin intervention

**Not recoverable via mnemonic (requires backup or re-creation):**
- Campaign save files, replay files, screenshots
- Local settings and preferences
- Achievement proofs signed by the old key (can be re-earned; or restored from backup if available)

**Re-downloadable:**
- Workshop content (mods, maps, resource packs)

**Partially recoverable via community (if mnemonic was also lost):**
- **Ratings and match history.** Community servers retain match records. A player creates a new identity, and a community admin can associate the new identity with the old record via a verified identity transfer (community-specific policy, not IC-mandated). The old SCRs prove the old identity held those ratings.
- **Friends.** Friends with the player in their list can re-add the new identity.

**Recovery hierarchy (best to worst):**
1. **Full backup** — everything restored, including saves, replays, screenshots
2. **Cloud sync** — identity, profile, ratings, settings, latest autosave restored
3. **Mnemonic seed phrase** — identity restored; saves, replays, settings lost
4. **Nothing saved** — fresh identity; community admin can transfer old records

**UX for total loss (no phrase, no backup, no cloud):** No special "recovery wizard." The player creates a fresh identity. The first-launch flow on the new identity presents the recovery phrase prominently. The system prevents the same mistake twice.

#### Console Commands (D058)

All Data & Backup panel operations have console equivalents:

| Command                     | Effect                                                       |
| --------------------------- | ------------------------------------------------------------ |
| `/backup create`            | Create full backup (interactive — shows progress)            |
| `/backup create --critical` | Create critical-only backup                                  |
| `/backup restore <path>`    | Restore from backup file                                     |
| `/backup list`              | List saved backups                                           |
| `/backup verify <path>`     | Verify archive integrity                                     |
| `/profile export`           | Export profile to JSON                                       |
| `/identity seed show`       | Display 24-word recovery phrase (requires confirmation)      |
| `/identity seed verify`     | Enter 24 words to verify they match current identity         |
| `/identity recover`         | Enter 24 words to regenerate keypair (overwrites if exists)  |
| `/data health`              | Show data health summary (identity, sync status, backup age) |
| `/data folder`              | Open data folder in system file manager                      |
| `/cloud sync`               | Trigger immediate cloud sync                                 |
| `/cloud status`             | Show cloud sync status and quota                             |

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


