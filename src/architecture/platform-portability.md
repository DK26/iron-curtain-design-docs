## Platform Portability

The engine must not create obstacles for any platform. Desktop is the primary dev target, but every architectural choice must be portable to browser (WASM), mobile (Android/iOS), and consoles without rework.

### Player Data Directory (D061)

All player data lives under a single, self-contained directory. The structure is stable and documented — a manual copy of this directory is a valid (if crude) backup. The `ic backup` CLI provides a safer alternative using SQLite `VACUUM INTO` for consistent database copies. See `decisions/09e/D061-data-backup.md` for full rationale, backup categories, and cloud sync design.

```
<data_dir>/
├── config.toml              # Settings (D033 toggles, keybinds, render quality)
├── profile.db               # Identity, friends, blocks, privacy (D053)
├── achievements.db          # Achievement collection (D036)
├── gameplay.db              # Event log, replay catalog, save index, map catalog (D034)
├── telemetry.db             # Unified telemetry events (D031) — pruned at 100 MB
├── keys/
│   └── identity.key         # Ed25519 private key (D052) — recoverable via mnemonic seed phrase (D061)
├── communities/             # Per-community credential stores (D052)
│   ├── official-ic.db
│   └── clan-wolfpack.db
├── saves/                   # Save game files (.icsave)
├── replays/                 # Replay files (.icrep)
├── screenshots/             # PNG with IC metadata in tEXt chunks
├── workshop/                # Downloaded Workshop content (D030)
├── mods/                    # Locally installed mods
├── maps/                    # Locally installed maps
├── logs/                    # Engine log files (rotated)
└── backups/                 # Created by `ic backup create`
```

**Platform-specific `<data_dir>` resolution:**

| Platform       | Default Location                                                         |
| -------------- | ------------------------------------------------------------------------ |
| Windows        | `%APPDATA%\IronCurtain\`                                                 |
| macOS          | `~/Library/Application Support/IronCurtain/`                             |
| Linux          | `$XDG_DATA_HOME/iron-curtain/` (default: `~/.local/share/iron-curtain/`) |
| Browser (WASM) | OPFS virtual filesystem (see `05-FORMATS.md` § Browser Storage)          |
| Mobile         | App sandbox (platform-managed)                                           |
| Portable mode  | `<exe_dir>/data/` (activated by `IC_PORTABLE=1`, `--portable`, or `portable.marker` next to exe) |

Override with `IC_DATA_DIR` environment variable or `--data-dir` CLI flag. All path resolution is centralized in `ic-paths` (see § Crate Design Notes). All asset loading goes through Bevy's asset system (rule 5 below) — the data directory is for player-generated content, not game assets.

### Data & Backup UI (D061)

The in-game **Settings → Data & Backup** panel exposes backup, restore, cloud sync, and profile export — the GUI equivalent of the `ic backup` CLI. A **Data Health** summary shows identity key status, sync recency, backup age, and data folder size. Critical data is automatically protected by rotating daily snapshots (`auto-critical-N.zip`, 3-day retention) and optional platform cloud sync (Steam Cloud / GOG Galaxy).

**First-launch flow** integrates with D032's experience profile selection:
1. New player: identity created automatically → 24-word recovery phrase displayed → cloud sync offer → backup reminder prompt
2. Returning player on new machine: cloud data detected → restore offer showing identity, rating, match count; or mnemonic seed recovery (enter 24 words); or manual restore from backup ZIP / data folder copy

Post-milestone toasts (same system as D030's Workshop cleanup prompts) nudge players without cloud sync to back up after ranked matches, campaign completion, or tier promotions. See `decisions/09e/D061-data-backup.md` "Player Experience" for full UX mockups and scenario walkthroughs.

### Portability Design Rules

1. **Input is abstracted behind a trait.** `InputSource` produces `PlayerOrder`s — it knows nothing about mice, keyboards, touchscreens, or gamepads. The game loop consumes orders, not raw input events. Each platform provides its own `InputSource` implementation.

2. **UI layout is responsive.** No hardcoded pixel positions. The sidebar, minimap, and build queue use constraint-based layout that adapts to screen size and aspect ratio. Mobile/tablet may use a completely different layout (bottom bar instead of sidebar). `ic-ui` provides layout *profiles*, not a single fixed layout.

3. **Click-to-world is abstracted behind a trait.** Isometric screen→world (desktop), touch→world (mobile), and raycast→world (3D mod) all implement the same `ScreenToWorld` trait, producing a `WorldPos`. Grid-based game modules convert to `CellPos` as needed. No isometric math or grid assumption hardcoded in the game loop.

4. **Render quality is configurable per device.** FPS cap, particle density, post-FX toggles, resolution scaling, shadow quality — all runtime-configurable. Mobile caps at 30fps; desktop targets 60-240fps. The renderer reads a `RenderSettings` resource, not compile-time constants. Four render quality tiers (Baseline → Standard → Enhanced → Ultra) are auto-detected from `wgpu::Adapter` capabilities at startup. Tier 0 (Baseline) targets GL 3.3 / WebGL2 hardware — no compute shaders, no post-FX, CPU particle fallback, palette tinting for weather. **Advanced Bevy rendering features (3D render modes, heavy post-FX, dynamic lighting) are optional layers, not baseline requirements; the classic 2D game must remain fully playable on no-dedicated-GPU systems that meet the downlevel hardware floor.** See `10-PERFORMANCE.md` § "GPU & Hardware Compatibility" for tier definitions and hardware floor analysis.

5. **No raw filesystem I/O.** All asset loading goes through Bevy's asset system, never `std::fs` directly. Mobile and browser have sandboxed filesystems; WASM has no filesystem at all. Save games use platform-appropriate storage (e.g., `localStorage` on web, app sandbox on mobile).

6. **App lifecycle is handled.** Mobile and consoles require suspend/resume/save-on-background. The snapshottable sim makes this trivial — `snapshot()` on suspend, `restore()` on resume. This must be an engine-level lifecycle hook, not an afterthought.

7. **Audio backend is abstracted.** Bevy handles this, but no code should assume a specific audio API. Platform-specific audio routing (e.g., phone speaker vs headphones, console audio mixing policies) is Bevy's concern.

### Platform Target Matrix

| Platform                | Graphics API              | Input Model                | Key Challenge                            | Phase  |
| ----------------------- | ------------------------- | -------------------------- | ---------------------------------------- | ------ |
| Windows / macOS / Linux | Vulkan / Metal / DX12     | Mouse + keyboard           | Primary target                           | 1      |
| Steam Deck              | Vulkan (native Linux)     | Gamepad + touchpad         | Gamepad UI controls                      | 3      |
| Browser (WASM)          | WebGPU / WebGL2           | Mouse + keyboard + touch   | Download size, no filesystem             | 7      |
| Android / iOS           | Vulkan / Metal (via wgpu) | Touch + on-screen controls | Touch RTS controls, battery, screen size | 8+     |
| Xbox                    | DX12 (via GDK)            | Gamepad                    | NDA SDK, certification                   | 8+     |
| PlayStation             | AGC (proprietary)         | Gamepad                    | wgpu doesn't support AGC yet, NDA SDK    | Future |
| Nintendo Switch         | NVN / Vulkan              | Gamepad + touch (handheld) | NDA SDK, limited GPU                     | Future |

### Input Abstraction

```rust
/// Platform-agnostic input source. Each platform implements this.
pub trait InputSource {
    /// Drain pending player orders from whatever input device is active.
    fn drain_orders(&mut self, buf: &mut Vec<TimestampedOrder>);
    // Caller provides the buffer (reused across ticks — zero allocation on hot path)

    /// Optional: hint about input capabilities for UI adaptation.
    fn capabilities(&self) -> InputCapabilities;
}

pub struct InputCapabilities {
    pub has_mouse: bool,
    pub has_keyboard: bool,
    pub has_touch: bool,
    pub has_gamepad: bool,
    pub screen_size: ScreenClass,  // Phone, Tablet, Desktop, TV
}

pub enum ScreenClass {
    Phone,    // < 7" — bottom bar UI, large touch targets
    Tablet,   // 7-13" — sidebar OK, touch targets
    Desktop,  // 13"+ — full sidebar, mouse precision
    TV,       // 40"+ — large text, gamepad radial menus
}
```

`ic-ui` reads `InputCapabilities` to choose the appropriate layout profile. The sim never sees any of this.

### Platform Installer / Setup Capability Split (D069)

The first-run setup wizard (D069) needs a **platform capability view** that is separate from raw input capabilities. This captures what the **distribution channel / platform shell** already handles (binary install/update/verify, cloud availability, file browsing constraints) so IC can avoid duplicating responsibilities.

```rust
pub enum PlatformInstallChannel {
    StoreSteam,
    StoreGog,
    StoreEpic,
    StandaloneDesktop,
    Browser,
    Mobile,
    Console,
}

pub struct PlatformInstallerCapabilities {
    pub channel: PlatformInstallChannel,
    pub platform_handles_binary_install: bool,
    pub platform_handles_binary_updates: bool,
    pub platform_exposes_verify_action: bool, // Steam/GOG-style "verify files"
    pub supports_cloud_sync_offer: bool,      // via PlatformServices or platform API
    pub supports_manual_folder_browse: bool,  // browser/mobile often restricted
    pub supports_background_downloads: bool,  // policy/OS dependent
}
```

`ic-game` (platform integration layer) populates `PlatformInstallerCapabilities` and injects it into `ic-ui`. The D069 setup wizard and maintenance flows use it to decide:
- whether to show platform verify guidance vs IC-side content repair only
- whether to offer manual folder browsing as a primary or fallback path
- whether to present a browser/mobile "setup assistant" variant instead of a desktop-style installer narrative

This preserves the platform-agnostic engine core while making setup UX platform-aware in a principled way.
