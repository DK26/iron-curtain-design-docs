## D069: Installation & First-Run Setup Wizard — Player-First, Offline-First, Cross-Platform

|                |                                                                                                                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                                                                                                                                                     |
| **Phase**      | Phase 4–5 (first-run setup flow + preset selection + repair entry points), Phase 6a (resume/checkpointing + full maintenance wizard + Deck polish), Phase 6b+ (platform variants expanded, smart recommendations, SDK parity)                                           |
| **Depends on** | D030/D049 (Workshop transport + package verification), D034 (SQLite for checkpoints/setup state), D061 (data/backup/restore UX), D065 (experience profile + controls walkthrough handoff), D068 (selective install profiles/content packs), D033 (no-dead-end UX rule) |
| **Driver**     | Players need a tactful, reversible, fast path from "installed binary" to "playable game" without being trapped by store-specific assumptions, online/account gates, or confusing mod/content prerequisites.                                                               |

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 4–5 (desktop/store baseline), Phase 6a (maintenance/resume maturity), Phase 6b+ (advanced variants)
- **Canonical for:** Installation/setup wizard UX, first-run setup sequencing, maintenance/repair wizard re-entry, platform-specific install responsibility split
- **Scope:** `ic-ui` setup wizard flow, `ic-game` platform capability integration, content source detection + install preset planning, transfer/verify UX, post-install maintenance/repair entry points
- **Decision:** IC uses a **two-layer installation model**: platform/store/native package handles **binary install/update**, and IC provides a **shared in-app First-Run Setup Wizard** (plus maintenance wizard) for identity, content sources, selective installs, verification, and onboarding handoff.
- **Why:** Avoids launcher bloat and duplicated patchers while giving players a consistent, no-dead-end setup experience across Steam/GOG/standalone and deferred browser/mobile platform variants.
- **Non-goals:** Replacing platform installers/patchers (Steam/GOG/Epic), mandatory online/account setup, monolithic irreversible install choices, full console certification install-flow detail at this phase.
- **Invariants preserved:** Platform-agnostic architecture (`InputSource`, `ScreenClass`), D068 selective installs and fingerprints, D049 verification/P2P transport, D061 offline-portable data ownership, D065 onboarding handoff.
- **Defaults / UX behavior:** `Full Install` preset is the default in the wizard (with visible alternatives and size estimates); offline-first optional setup; all choices reversible via Settings → Data maintenance flows.
- **Public interfaces / types:** `InstallWizardState`, `InstallWizardMode`, `InstallStepId`, `ContentSourceCandidate`, `ContentInstallPlan`, `InstallTransferProgress`, `RepairPlan`, `WizardCheckpoint`, `PlatformInstallerCapabilities`
- **Affected docs:** `src/17-PLAYER-FLOW.md`, `src/decisions/09c-modding.md` (D068), `src/decisions/09e-community.md` (D030/D049), `src/02-ARCHITECTURE.md`, `src/04-MODDING.md`, `src/decisions/09f-tools.md`
- **Revision note summary:** None
- **Keywords:** install wizard, first-run setup, setup assistant, repair verify, content detection, selective install presets, offline-first, platform installer, Steam Deck setup

### Problem

IC already has strong pieces of the setup experience — first-launch identity setup (D061), content detection, no-dead-end guidance (D033), and selective installs (D068) — but they are not yet formalized as a single, tactful **installation and setup wizard**.

Without a unified design, the project risks:

- duplicating platform installer functionality in-store builds
- inconsistent first-run behavior across Steam/GOG/standalone/browser builds
- confusing transitions between asset detection, content install prompts, and onboarding
- poor recovery/repair UX when sources move, files are corrupted, or content packs are removed

The wizard must fit IC's philosophy: **fast, reversible, offline-capable, and clear within one second**.

### Decision

Define a **two-layer install/setup model**:

1. **Distribution installer entry (platform/store/standalone specific)** — installs/updates the **binary**
2. **IC First-Run Setup Wizard (shared, platform-adaptive)** — configures the **playable experience**

The in-app wizard is the canonical IC-controlled setup UX and is re-enterable later as a **maintenance wizard** for modify/repair/reinstall-style operations.

### Design Principles (Normative)

#### Lean Toward

- platform-native binary installation/update (Steam/GOG/Epic/OS package managers)
- quick vs advanced setup split
- preset/component selection with size estimates
- resumable/checkpointed setup operations
- source detection with confidence/status and merge guidance
- repair/verify/re-scan as first-class actions
- no-dead-end guidance panels and direct remediation paths

#### Avoid

- launcher bloat (always-on heavyweight patcher/launcher for normal play)
- redundant binary updaters on store builds
- mandatory online/account setup before local play
- dark patterns or irreversible setup choices
- raw filesystem path workflows as the primary path on touch/mobile platforms

### Two-Layer Install Model

#### Layer 1 — Distribution Install Entry (Platform/Store/Standalone)

Purpose: place/update the **IC binary** on the device.

Profiles:
- **Store builds (Steam/GOG/Epic):** platform installs/updates/uninstalls binaries
- **Standalone desktop:** IC-provided bootstrap package/installer handles binary placement and shortcuts
- **Browser / mobile / console:** no traditional installer; jump to a setup-assistant variant

Rules:
- IC does **not** duplicate store patch/update UX
- IC may offer **guidance links** to platform verify/repair actions
- IC may independently verify and repair **IC-side content/setup state** (packages, cache, source mappings, indexes)

#### Layer 2 — IC First-Run Setup Wizard (Shared, Platform-Adaptive)

Purpose: reach a **playable configured state**.

Primary outcomes:
- identity initialized (or recovered)
- optional cloud sync decision captured
- content sources detected and selected
- install preset/content plan applied (D068)
- transfer/copy/download/verify/index steps completed
- D065 onboarding handoff offered (experience profile + controls walkthrough)
- player reaches the main menu in a ready state

### Wizard Modes

#### Quick Setup (Default Path)

Uses the fastest path with visible "Change" affordances:
- best detected content source (or prompts if ambiguous)
- `Full Install` preset preselected (default in D069)
- offline-first path (online features optional)
- default data directory

#### Advanced Setup (Optional)

Adds advanced controls without blocking the quick path:
- data directory override / portable-style data placement guidance
- content preset / custom pack selection (D068)
- source priority ordering (Steam vs GOG vs OpenRA vs manual)
- bandwidth/background download behavior
- optional verification depth (basic vs full hash scan)
- accessibility setup before gameplay (text size, high contrast, reduced motion)

### Wizard Step Sequence (Desktop/Store Baseline)

The setup wizard is a UI flow inside `InMenus` (menu/UI-only state). It does not instantiate the sim.

#### 0. Mode Detection & Profile Selection (Pre-Wizard, Standalone Only)

Before the setup wizard starts, the engine checks the launch context and presents the right dialog. This step is **skipped entirely** for store builds (Steam/GOG — always system mode) and when a `portable.marker` already exists (choice already made).

**Detection logic:**

```
                    ┌──────────────┐
                    │ Game launched │
                    └──────┬───────┘
                           │
                    ┌──────▼───────────┐
                    │ portable.marker   │  Yes → Portable mode, skip dialog
                    │ exists?           ├──────────────────────────────┐
                    └──────┬───────────┘                              │
                           │ No                                       │
                    ┌──────▼───────────┐                              │
                    │ Store build?      │  Yes → System mode, skip    │
                    │ (Steam/GOG/Epic)  ├────────────────────────┐    │
                    └──────┬───────────┘                         │    │
                           │ No (standalone)                     │    │
                    ┌──────▼───────────┐                         │    │
                    │ System profile    │                         │    │
                    │ exists?           │                         │    │
                    │ (%APPDATA%/IC)    │                         │    │
                    └──────┬───────────┘                         │    │
                       ┌───┴───┐                                 │    │
                      Yes      No                                │    │
                       │        │                                │    │
                ┌──────▼──┐  ┌──▼────────┐                      │    │
                │ Dialog A │  │ Dialog B  │                      │    │
                │ (both    │  │ (fresh    │                      │    │
                │  exist)  │  │  install) │                      │    │
                └─────────┘  └──────────┘                       │    │
                                                                ▼    ▼
                                                          → Setup Wizard
```

**Dialog B — Fresh install (no system profile, no portable marker):**

```
┌──────────────────────────────────────────────────────────┐
│  IRON CURTAIN                                            │
│                                                          │
│  How would you like to run the game?                     │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Install on this system                            │  │
│  │  Data stored in your user profile.                 │  │
│  │  Best for your main gaming PC.                     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Run portable                                      │  │
│  │  Everything stays in this folder.                  │  │
│  │  Best for USB drives and shared computers.         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  You can change this later in Settings → Data.           │
└──────────────────────────────────────────────────────────┘
```

- "Install on this system" → system mode, data in `%APPDATA%\IronCurtain\` (or XDG/Library equivalent)
- "Run portable" → creates `portable.marker` next to exe, data in `<exe_dir>\data\`

**Dialog A — System profile already exists (launched from a different location, e.g., USB drive):**

```
┌──────────────────────────────────────────────────────────┐
│  IRON CURTAIN                                            │
│                                                          │
│  Found an existing profile on this system:               │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  CommanderZod                                      │  │
│  │  Captain II (1623) · 342 matches · 23 achievements │  │
│  │  Last played: March 14, 2027                       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Use my existing profile                           │  │
│  │  Play using your system-installed data.            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Run portable (fresh)                              │  │
│  │  Start fresh in this folder. System profile         │  │
│  │  is not modified.                                  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Run portable (import my profile)                  │  │
│  │  Copy your identity and settings into this folder. │  │
│  │  Play anywhere with your existing profile.         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- "Use my existing profile" → system mode, uses existing `%APPDATA%\IronCurtain\` data
- "Run portable (fresh)" → creates `portable.marker`, creates empty `data/`, enters setup wizard as new player
- "Run portable (import my profile)" → creates `portable.marker`, copies `keys/`, `config.toml`, `profile.db`, `communities/*.db` from system profile into `<exe_dir>\data\`. Player has their identity, ratings, and settings on the USB drive. System profile is not modified.

**Returning to portable with existing portable data:**

If `portable.marker` exists AND `<exe_dir>\data\` has a profile AND a system profile also exists, the game does NOT show a dialog — it uses the portable profile (the marker file is the authoritative choice). If the player wants to switch, they can do so in Settings → Data.

**UX rules for this dialog:**
- Shown once per location. After the player makes a choice, the dialog never appears again from that location (the choice is remembered via `portable.marker` presence or absence + `data/` directory existence).
- Store builds (Steam/GOG) skip this entirely — they always use system mode. Portable mode for store builds is still available via `IC_PORTABLE=1` env var or `--portable` flag for power users, but the dialog does not appear.
- The dialog is a minimal, clean window — no background shellmap, no loading. It appears before any heavy initialization, so it's instant even on slow hardware.
- "You can change this later" is true: Settings → Data shows the current mode and allows switching (with data migration guidance).

#### 1. Welcome / Setup Intent

Actions:
- `Quick Setup`
- `Advanced Setup`
- `Restore from Backup / Recovery Phrase`
- `Exit`

Purpose: set expectations and mode, not collect technical settings.

#### 2. Identity Setup (Preserves Existing First-Launch Order)

Uses the current D061-first flow:
- recovery phrase creation (or restore path)
- cloud sync offer (optional, if platform service exists)

UX requirements:
- concise copy
- explicit skip for cloud sync
- "Already have an account?" visible
- deeper explanations behind "Learn more"

#### 3. Content Source Detection

Builds on the existing `17-PLAYER-FLOW` content detection:
- probe Steam, GOG, EA/Origin, OpenRA, manual folder
- show found/not found status
- allow source selection or merge when valid
- if none found, provide guidance to acquisition options and manual browse

Additions in D069:
- **Out-of-the-box Remastered import path:** if the C&C Remastered Collection is detected, the wizard offers a one-click `Use Steam Remastered assets` path as a first-class source option (not an advanced/manual flow).
- source verification status (basic compatibility/probe confidence)
- per-source hint ("why use this source")
- saved source preferences and re-scan hooks
- owned/proprietary source handling is explicit: D069 imports/extracts playable assets into IC-managed content storage/indexes (`D068`/`D049`) while leaving the original installation untouched.
- imported proprietary sources (Steam/GOG/EA/manual owned installs) can be combined with OpenRA and Workshop content under the same D062/D068 namespace/install-profile rules, with provenance labels preserved.

#### 4. Content Install Plan (D068 Integration)

Defaults:
- `Full Install` preselected
- alternatives visible with size estimates:
  - `Campaign Core`
  - `Minimal Multiplayer`
  - `Custom`

Wizard must show:
- estimated download size
- estimated disk usage (CAS-aware if available; conservative otherwise)
- feature summary for each preset
- optional media/language variants
- explicit note: changeable later in `Settings → Data`

#### 5. Transfer / Copy / Verify Progress

Unified progress UI for:
- local asset import/copy/extract (including owned proprietary installs such as Remastered)
- Workshop/base package downloads
- checksum verification
- optional indexing/decompression/conversion

Rules:
- resumable
- cancelable (with clear consequences)
- step-level and overall progress
- actionable error messages
- original detected installs remain read-only from IC's perspective; repair/re-scan actions rebuild IC-managed caches/indexes rather than mutating the source installation.
- format-by-format importer behavior, importer artifacts (source manifests/provenance/verify results), and milestone sequencing are specified in `05-FORMATS.md` § "Owned-Source Import & Extraction Pipeline (D069/D068/D049, Format-by-Format)".

#### 6. Experience Profile & Controls Walkthrough Offer (D065 Handoff)

After content is playable:
- D065 self-identification gate
- optional controls walkthrough
- `Just let me play` remains prominent

#### 7. Ready Screen

Summary:
- install preset
- selected content sources
- cloud sync state (if any)

Actions:
- `Play Campaign`
- `Play Skirmish`
- `Multiplayer`
- `Settings → Data / Controls`
- `Modify Installation`

### Maintenance Wizard (Modify / Repair / Reinstall UX)

The setup wizard is re-enterable after install as a **maintenance wizard**.

Entry points:
- `Settings → Data → Modify Installation`
- `Settings → Data → Repair / Verify`
- no-dead-end guidance panels when missing content or configuration is detected

Supported operations:
- switch install presets (`Full` ↔ `Campaign Core` ↔ `Minimal Multiplayer` ↔ `Custom`)
- add/remove optional media and language packs
- switch or repair cutscene variant packs (D068)
- re-scan content sources
- verify package checksums / repair metadata/indexes
- reclaim disk space (`ic mod gc` / D049 CAS cleanup)
- reset setup checkpoints / re-run setup assistant

### Platform Variants (Concept Complete)

#### Steam / GOG / Epic (Desktop)

- platform manages binary install/update
- IC launches directly into D069 setup wizard when setup is incomplete
- cloud sync step uses `PlatformServices` when available
- "Verify binary files" surfaces platform guidance where supported
- IC still owns content packs, source detection, optional media, and setup repair

#### Standalone Desktop Installer (Windows/macOS/Linux)

For non-store distribution, IC ships a **platform-native installer** that handles binary placement, shortcuts, file associations, and uninstallation. The installer is minimal — it places files and gets out of the way. All content setup, identity creation, and game configuration happen in the IC First-Run Setup Wizard (Layer 2) on first launch.

**Per-platform installer format:**

| Platform | Format | Tool | Why |
|----------|--------|------|-----|
| **Windows** | `.exe` (NSIS) or `.msi` (WiX) | NSIS (primary), WiX (enterprise/GPO) | NSIS is the standard for open-source game installers (OpenRA, Godot, Wesnoth). WiX for managed deployments. Both produce single-file installers with no runtime dependencies. |
| **macOS** | `.dmg` with drag-to-Applications | `create-dmg` or `hdiutil` | Standard macOS distribution. Drag `Iron Curtain.app` to `/Applications/`. No pkg installer needed — the app bundle is self-contained. |
| **Linux** | `.AppImage` (primary), `.deb`, `.rpm`, Flatpak | `appimagetool`, `cargo-deb`, `cargo-rpm`, Flatpak manifest | AppImage is the universal "just run it" format. `.deb`/`.rpm` for distro package managers. Flatpak for sandboxed distribution (Flathub). |

**Windows installer flow (NSIS):**

```
┌──────────────────────────────────────────────────────────┐
│  IRON CURTAIN SETUP                                      │
│                                                          │
│  Welcome to Iron Curtain.                                │
│                                                          │
│  Install location:                                       │
│  [C:\Games\IronCurtain\               ] [Browse...]      │
│                                                          │
│  ☑ Create desktop shortcut                               │
│  ☑ Create Start Menu entry                               │
│  ☑ Associate .icrep files (replays)                      │
│  ☑ Associate .icsave files (save games)                  │
│  ☐ Portable mode (all data stored next to the game)      │
│                                                          │
│  Space required: ~120 MB (engine only, no game assets)   │
│  Game assets are set up on first launch.                 │
│                                                          │
│  [Install]                              [Cancel]         │
└──────────────────────────────────────────────────────────┘
```

**What the installer does:**
1. Copies game binaries, shipped YAML/Lua rules, `.sql` files, and docs to the install directory
2. Creates Start Menu / desktop shortcuts
3. Registers file associations (`.icrep`, `.icsave`, `ironcurtain://` URI scheme for deep links)
4. Registers uninstaller in Add/Remove Programs
5. If "Portable mode" is checked: creates `portable.marker` in the install directory (triggers `ic-paths` portable mode on first launch — see `architecture/crate-graph.md`)
6. Launches Iron Curtain (optional checkbox: "Launch Iron Curtain after install")

**What the installer does NOT do:**
- Download or install game assets (that's the in-app wizard's job)
- Create user accounts or require online connectivity
- Install background services, auto-updaters, or system tray agents
- Modify system PATH or install global libraries
- Require administrator privileges (installs to user-writable directory by default; admin only needed for `Program Files` or system-wide file associations)

**Uninstaller:**
- Removes game binaries, shipped content, shortcuts, file associations, and registry entries
- **Does not delete the data directory** (`%APPDATA%\IronCurtain\` or `<exe_dir>\data\` in portable mode). Player data (saves, replays, keys, config) is preserved. The uninstaller shows: `"Your saves, replays, and settings are preserved in [path]. Delete this folder manually if you want to remove all data."`
- This matches the pattern used by Steam (game files removed, save data preserved) and is critical for the "your data is yours" philosophy

**macOS installer flow:**
- `.dmg` opens with a background image showing `Iron Curtain.app` → drag to `Applications` folder
- First launch triggers Gatekeeper dialog (app is signed with a developer certificate or notarized; unsigned builds show the standard "open anyway" workflow)
- No separate uninstaller — drag app to Trash. Data in `~/Library/Application Support/IronCurtain/` persists (same principle as Windows)

**Linux distribution:**
- **AppImage:** Single file, no install. `chmod +x IronCurtain.AppImage && ./IronCurtain.AppImage`. Desktop integration via `appimaged` or manual `.desktop` file. Ideal for portable / USB use.
- **Flatpak (Flathub):** Sandboxed, auto-updated, desktop integration. `flatpak install flathub gg.ironcurtain.IronCurtain`. Data directory follows XDG within the Flatpak sandbox.
- **`.deb` / `.rpm`:** Traditional package manager install. Installs to `/usr/share/ironcurtain/`, creates `/usr/bin/ironcurtain` symlink, installs `.desktop` file and icons. Uninstall via `apt remove` / `dnf remove` — data directory preserved.

**Auto-updater (standalone builds only):**
- Store builds (Steam/GOG) use platform auto-update — IC does not duplicate this
- Standalone builds check for updates on launch (HTTP GET to a version manifest endpoint, no background service)
- If a new version is available: non-intrusive main menu notification: `"Iron Curtain v0.6.0 is available. [Download] [Release Notes] [Later]"`
- Download is a full installer package (not a delta patcher — keeps complexity low)
- No forced updates. No auto-restart. No nag screens. The player decides when to update.
- Update check can be disabled: `config.toml` → `[updates] check_on_launch = false`

**CI/CD integration:**
- Installers are built automatically in the CI pipeline for each release
- Windows: NSIS script in `installer/windows/ironcurtain.nsi`
- macOS: `create-dmg` script in `installer/macos/build-dmg.sh`
- Linux: AppImage recipe in `installer/linux/AppImageBuilder.yml`, Flatpak manifest in `installer/linux/gg.ironcurtain.IronCurtain.yml`
- All installer scripts are in the repository and version-controlled

**Relationship to D069 Layer 2:** The standalone installer's only job is to place files on disk. Everything else — identity, content sources, install presets, onboarding — is handled by the D069 First-Run Setup Wizard on first launch. The installer can optionally launch the game after installation, which immediately enters the wizard.

- no mandatory background service

#### Steam Deck

- same D069 semantics as desktop
- Deck-first navigation and larger targets
- avoid keyboard-heavy steps in the primary flow
- source detection and install presets unchanged in meaning

#### Browser (WASM)

No traditional installer; use a **Setup Assistant** variant:
- storage permission/capacity checks (OPFS)
- asset import/source selection
- optional offline caching prompts
- same D065 onboarding handoff once playable

#### Mobile / Console (Deferred Concept, `M11+`)

- store install + in-app setup assistant
- guided content package choices, not raw filesystem paths as the primary flow
- optional online/account setup, never hidden command-console requirements

### Player-First SDK Extension (Shared Components)

D069 is player-first, but its components are reusable for the SDK (`ic-editor`) setup path.

Shared components:
- data directory selection and health checks
- content source detection (reused for asset import/reference workflows)
- optional pack install/repair/reclaim UI patterns
- transfer/progress/error presentation patterns

SDK-specific additions (deferred shared-flow variant; `M9+` after player-first D069 baseline):
- Git availability check (guidance only, no hard gate)
- optional creator components/toolchains/templates
- no forced installation of heavy creator packs by default

### Shared Interfaces / Types (Spec-Level Sketches)

```rust
pub enum InstallWizardMode {
    Quick,
    Advanced,
    Maintenance,
}

pub enum InstallStepId {
    Welcome,
    IdentitySetup,
    CloudSyncOffer,
    ContentSourceDetection,
    ContentInstallPlan,
    TransferAndVerify,
    ExperienceProfileGate,
    Ready,
}

pub struct InstallWizardState {
    pub mode: InstallWizardMode,
    pub current_step: InstallStepId,
    pub checkpoints: Vec<WizardCheckpoint>,
    pub selected_sources: Vec<ContentSourceSelection>,
    pub install_plan: Option<ContentInstallPlan>,
    pub platform_capabilities: PlatformInstallerCapabilities,
    pub network_mode: SetupNetworkMode, // offline / online-optional / online-active
    pub resume_token: Option<String>,
}

/// How content is brought into the Iron Curtain content directory.
pub enum ContentSourceImportMode {
    /// Deep-copy files into managed content directory. Full isolation.
    Copy,
    /// Extract from archive (ZIP, .oramap, etc.) into managed directory.
    Extract,
    /// Reference files in-place via symlink/path. No copy. Used for very
    /// large proprietary assets the user already owns on disk.
    ReferenceOnly,
}

/// Legal/licensing classification for a content source.
pub enum SourceRightsClass {
    /// Proprietary content the user owns (e.g., purchased C&C disc/Steam).
    OwnedProprietary,
    /// Open-source or freely redistributable content (OpenRA assets, CC-BY mods).
    OpenContent,
    /// User-created local content with no external distribution rights implications.
    LocalCustom,
}

pub struct ContentSourceCandidate {
    pub source_kind: ContentSourceKind, // steam/gog/openra/manual
    pub path: String,
    pub probe_status: ProbeStatus,
    pub detected_assets: Vec<DetectedAssetSet>,
    pub notes: Vec<String>,
    pub import_mode: ContentSourceImportMode,
    pub rights_class: SourceRightsClass,
}

pub struct ContentInstallPlan {
    pub preset: InstallPresetId, // full / campaign_core / minimal_mp / custom
    pub required_packs: Vec<ResourceId>,
    pub optional_packs: Vec<ResourceId>,
    pub estimated_download_bytes: u64,
    pub estimated_disk_bytes: u64,
    pub feature_summary: Vec<String>,
}

pub struct InstallTransferProgress {
    pub phase: TransferPhase, // copy / download / verify / index
    pub current_item: Option<String>,
    pub completed_bytes: u64,
    pub total_bytes: Option<u64>,
    pub warnings: Vec<InstallWarning>,
}

pub struct RepairPlan {
    pub verify_binary_via_platform: bool,
    pub verify_workshop_packages: bool,
    pub rescan_content_sources: bool,
    pub rebuild_indexes: bool,
    pub reclaim_space: bool,
}

pub struct WizardCheckpoint {
    pub step: InstallStepId,
    pub completed_at_unix: i64,
    pub status: StepStatus, // complete / partial / failed / skipped
    pub data_hash: Option<String>,
}
```

### Optional CLI / Support Tooling (Future Capability Targets)

- `ic setup doctor` — inspect setup state, sources, and missing prerequisites
- `ic setup reset` — reset setup checkpoints while preserving content/data
- `ic content verify` — verify installed content packs/checksums
- `ic content repair` — guided repair (rebuild metadata/indexes + re-fetch as needed)

Command names can change; the capability set is the requirement.

### UX Rules (Normative)

- **No dead-end buttons** applies to setup and maintenance flows
- **Offline-first optional:** no account/community/cloud step blocks local play
- **`Full Install` default** with visible alternatives and clear sizes
- **Always reversible:** setup choices can be changed later in `Settings → Data` / `Settings → Controls`
- **No surprise background behavior:** seeding/background downloads/autostart choices must be explicit
- **One-screen purpose:** each step has one primary CTA and a clear back/skip path where safe
- **Accessibility from step 1:** text size, high contrast, reduced motion, and device-appropriate navigation supported in the wizard itself

### Research / Benchmark Workstream (Pre-Copy / UX Polish)

Create a methodology-compliant research note (e.g., `research/install-setup-wizard-ux-analysis.md`) covering:
- game/store installers and repair flows (Steam, GOG Galaxy, Battle.net, EA App)
- RTS/community examples (OpenRA, C&C Remastered launcher/workshop-adjacent flows, mod managers)
- cross-platform app installers/updaters (VS Code, Firefox, Discord)

Use the standard **Fit / Risk / IC Action** format and explicitly record:
- lean toward / avoid patterns
- repair/verify UX examples
- progress/error-handling examples
- dark-pattern warnings

### Alternatives Considered

1. **Platform/store installer only, no IC setup wizard** — Rejected. Leaves content detection, selective installs, and repair UX fragmented and inconsistent.
2. **Custom launcher/updater for all builds** — Rejected. Duplicates platform patching, adds bloat, and conflicts with offline-first simplicity.
3. **Mandatory online account setup during install** — Rejected. Violates portability/offline goals and creates unnecessary friction.
4. **Monolithic install with no maintenance wizard** — Rejected. Conflicts with D068 selective installs and tactful no-dead-end UX.

### Cross-References

- **D061 (Player Data Backup & Portability):** Recovery phrase, cloud sync offer, and restore UX are preserved as the early setup steps.
- **D065 (Tutorial & New Player Experience):** D069 hands off to the D065 self-identification gate and controls walkthrough after content is playable.
- **D068 (Selective Installation):** Install presets, content packs, optional media, and the Installed Content Manager are the core content-planning model used by D069.
- **D030/D049 (Workshop):** Setup uses Workshop transport and checksum verification for content downloads; maintenance wizard reuses the same verification and cache-management primitives.
- **D033 (QoL / No Dead Ends):** Installation/setup adopts the same no-dead-end button rule and reversible UX philosophy.
- **`17-PLAYER-FLOW.md`:** First-launch and maintenance wizard screen flows/mocks.
- **`02-ARCHITECTURE.md`:** Platform capability split (store/standalone/browser setup responsibilities) and UI/platform adaptation hooks.
