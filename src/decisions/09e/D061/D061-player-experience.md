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

