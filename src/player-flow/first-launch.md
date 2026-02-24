## First Launch Flow

The first time a player launches Iron Curtain, the game runs the **D069 First-Run Setup Wizard** (player-facing, in-app). The wizard's job is to establish identity, locate content sources, apply an install preset, and get the player into a playable main menu state — in that order, as fast as possible, with an offline-first path and no dead ends.

### Setup Wizard Entry (D069)

```
┌─────────────────────────────────────────────────────┐
│  SET UP IRON CURTAIN                               │
│                                                     │
│  Get playable in a few steps. You can change       │
│  everything later in Settings → Data / Controls.   │
│                                                     │
│  [Quick Setup]     (default: Full Install preset)   │
│  [Advanced Setup]  (paths, presets, bandwidth, etc.)│
│                                                     │
│  [Restore from Backup / Recovery Phrase]            │
│  [Exit]                                             │
└─────────────────────────────────────────────────────┘
```

- **Quick Setup** uses the fastest path with visible "Change" actions later
- **Advanced Setup** exposes data dir, custom install preset, source priority, and verification options
- **Restore** jumps to D061 restore/recovery flows before continuing wizard steps
- The wizard is **re-enterable later** as a maintenance flow (`Settings → Data → Modify Installation` / `Repair & Verify`)

#### Quick Setup Screen (D069, default path)

Quick Setup is optimized for "get me playing" while still showing the choices being made and offering a clear path to change them.

```
┌─────────────────────────────────────────────────────────────────┐
│  QUICK SETUP                                      [Advanced ▸]  │
│                                                                 │
│  We'll use the fastest path. You can change any choice later.   │
│                                                                 │
│  Content Source        Steam Remastered ✓         [Change]       │
│  Install Preset        Full Install (default)     [Change]       │
│  Data Location         Default data folder        [Change]       │
│  Cloud Sync            Ask me after identity step [Change]       │
│                                                                 │
│  Estimated download    1.8 GB                                   │
│  Estimated disk use    8.4 GB                                   │
│                                                                 │
│  [Start Setup]                              [Back]               │
│                                                                 │
│  Need less storage? [Campaign Core] [Minimal Multiplayer]       │
└─────────────────────────────────────────────────────────────────┘
```

- Defaults are visible, not hidden
- "Change" links avoid forcing Advanced mode for one-off tweaks
- Smaller preset shortcuts are available inline (no dead ends)

#### Advanced Setup Screen (D069, optional)

Advanced Setup exposes install and transport controls for storage-constrained, bandwidth-constrained, or power users without slowing down the Quick path.

```
┌─────────────────────────────────────────────────────────────────┐
│  ADVANCED SETUP                                   [Quick ▸]     │
│                                                                 │
│  [Sources] [Content] [Storage] [Network] [Accessibility]        │
│  ──────────────────────────────────────────────────────────────  │
│                                                                 │
│  Sources (priority order):                                      │
│   1. Steam Remastered      ✓ found       [Move] [Disable]       │
│   2. OpenRA (RA mod)       ✓ found       [Move] [Disable]       │
│   3. Manual folder         (not set)     [Browse…]              │
│                                                                 │
│  Install preset:  [Custom ▾]                                    │
│  Included packs:                                                │
│   ☑ Campaign Core       ☑ Multiplayer Maps                      │
│   ☑ Tutorial            ☑ Classic Music                         │
│   ☐ Cutscenes (FMV)     ☐ AI Enhanced Cutscenes                 │
│   ☑ Original Cutscenes  ☐ HD Art Pack                           │
│                                                                 │
│  Verification:   [Basic Probe ▾] (Basic / Full Hash Scan)       │
│  Download mode:   P2P preferred + HTTP fallback   [Change]      │
│  Data folder:     ~/.local/share/iron-curtain     [Change]      │
│                                                                 │
│  Download now: 0.9 GB      Est. disk: 5.7 GB                    │
│                                                                 │
│  [Apply & Continue]                      [Back]                 │
└─────────────────────────────────────────────────────────────────┘
```

- Advanced options are grouped by purpose, not dumped on one page
- Verification and transport are explicit (but still use sane defaults)
- Optional media remains clearly optional

### Identity Setup

```
┌──────────────────┐     ┌────────────────────┐     ┌──────────────────┐
│ First Launch │────▸│ Recovery Phrase     │────▸│ Cloud Sync Offer │
│              │     │ (24-word mnemonic)  │     │ (optional)       │
└──────────────┘     └────────────────────┘     └──────────────────┘
                           │                           │
                    "Write this down"           "Skip" or "Enable"
                           │                           │
                           ▼                           ▼
                     ┌─────────────────────────────────────┐
                     │ Content Detection                   │
                     └─────────────────────────────────────┘
```

1. **Recovery phrase** — A 24-word mnemonic (BIP-39 inspired) is generated and displayed. This is the player's portable identity — it derives their Ed25519 keypair deterministically. The screen explains in plain language: "This phrase is your identity. Write it down. If you lose your computer, these 24 words restore everything." A "Copy to clipboard" button and "I've saved this" confirmation.

2. **Cloud sync offer** — If a platform service is detected (Steam Cloud, GOG Galaxy), offer to enable automatic backup of critical data. "Skip" is prominent — this is optional, not a gate.

3. **Returning player shortcut** — "Already have an account?" link jumps to recovery: enter 24 words or restore from backup file.

### Content Detection

```
┌──────────────────┐     ┌──────────────────────────────────────────┐
│ Content Detection │────▸│ Scanning for Red Alert game files...     │
│                  │     │                                          │
│ Probes:          │     │ ✓ Steam: C&C Remastered Collection found │
│ 1. Steam         │     │ ✓ OpenRA: Red Alert mod assets found     │
│ 2. GOG Galaxy    │     │ ✗ GOG: not installed                     │
│ 3. Origin/EA App │     │ ✗ Origin: not installed                  │
│ 4. OpenRA        │     │                                          │
│ 5. Manual folder │     │ [Use Steam assets]  [Use OpenRA assets]  │
└──────────────────┘     │ [Browse for folder...]                   │
                         └──────────────────────────────────────────┘
```

- Auto-probes known install locations (Steam, GOG, Origin/EA, OpenRA directories)
- Shows what was found with checkmarks
- **Steam C&C Remastered Collection is a first-class out-of-the-box path**: if found, `Use Steam assets` imports/extracts playable Red Alert assets into IC-managed storage with no manual file hunting
- If nothing found: "Iron Curtain needs Red Alert game files to play. [How to get them →]" with links to purchase options (Steam Remastered Collection, etc.) and a manual folder browser
- If multiple sources found: player picks preferred source (or uses all — assets merge)
- Detection results are saved; re-scan available from Settings
- Import/extract operations do **not** modify the original detected installation; IC indexes/copied assets live under the IC data directory and can be repaired/rebuilt independently

### Content Install Plan (D069 + D068)

After sources are selected, the wizard shows an install-preset step with size estimates and feature summaries:

```
┌─────────────────────────────────────────────────────┐
│ Install Content                                     │
│                                                     │
│ Source: Steam Remastered assets  ✓                  │
│                                                     │
│ ► Full Install (default)            8.4 GB disk     │
│   Campaign + Multiplayer + Media packs              │
│                                                     │
│   Campaign Core                     3.1 GB disk     │
│   Minimal Multiplayer               2.2 GB disk     │
│   Custom…                           [Choose packs]  │
│                                                     │
│ Download now: 1.8 GB   Est. disk: 8.4 GB            │
│ Can change later: Settings → Data                   │
│                                                     │
│ [Continue]   [Back]                                 │
└─────────────────────────────────────────────────────┘
```

- Default is **`Full Install`** (this wizard's default posture), with visible alternatives
- D068 install presets remain reversible in `Settings → Data`
- Optional media variants/language packs appear in `Custom` (and can be added later)
- The plan may combine local owned-source imports (e.g., Remastered assets) with downloaded official/Workshop packs; the wizard shows both in the transfer/verify summary.

### Transfer / Copy / Verify (D069)

The wizard then performs local imports/copies and package downloads in a unified progress screen:

```
┌─────────────────────────────────────────────────────┐
│ Setting Up Content                                  │
│                                                     │
│ Step 2/4: Verify package checksums                  │
│ [███████████████░░░░░] 73%                          │
│                                                     │
│ Current item: official/ra1-campaign-core@1.0        │
│ Source: HTTP fallback (P2P unavailable)             │
│                                                     │
│ [Pause] [Cancel]                                    │
│                                                     │
│ Need help? [Repair options]                         │
└─────────────────────────────────────────────────────┘
```

- Handles local asset import, package download, verification, and indexing
- Proprietary/owned install imports (e.g., Remastered) are treated as explicit import/extract steps with progress and verify stages, not hidden side effects
- Resumable/checkpointed (restart continues safely)
- Cancelable with clear consequences
- Errors are actionable (retry source, change preset, repair, inspect details)

### New Player Gate

After content detection, first-time players see a brief self-identification screen (D065):

```
┌─────────────────────────────────────────────────────┐
│ Welcome, Commander.                                 │
│                                                     │
│ How familiar are you with Red Alert?                │
│                                                     │
│ [New to Red Alert]     → Tutorial recommendation    │
│ [Played the original]  → Classic experience profile │
│ [OpenRA veteran]       → OpenRA experience profile  │
│ [Remastered player]    → Remastered profile         │
│ [Just let me play]     → IC Default, skip tutorial  │
└─────────────────────────────────────────────────────┘
```

This sets the initial experience profile (D033) and determines whether the tutorial is suggested. It's skippable and changeable later in Settings.

### Transition to Main Menu

After identity + source detection + content install plan + transfer/verify + profile gate (or "Just let me play"), the player lands on the main menu with the shellmap running behind it.

**Ready screen (D069) summary before main menu entry may include:**
- install preset selected (`Full` / `Campaign Core` / `Minimal Multiplayer` / `Custom`)
- content sources in use (Steam/GOG/OpenRA/manual)
- import summary when applicable (e.g., `Steam Remastered imported to local IC content store; original install untouched`)
- cloud sync state (enabled / skipped)
- quick actions: `Play Campaign`, `Play Skirmish`, `Multiplayer`, `Settings → Data / Controls`, `Modify Installation`

Target: under 30 seconds for a "Just let me play" player with auto-detected assets and minimal/no downloads; longer paths remain clear and resumable.
