## Settings

```
Main Menu → Settings
```

Settings are organized in a tabbed layout. Each tab covers one domain. Changes auto-save.

```
┌──────────────────────────────────────────────────────────────┐
│  SETTINGS                                        [← Back]    │
│                                                              │
│  [Video] [Audio] [Controls] [Gameplay] [Social] [LLM] [Data]│
│  ─────────────────────────────────────────────────────────── │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  (active tab content)                                  │ │
│  │                                                        │ │
│  │                                                        │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Experience Profile: [IC Default ▾]   [Reset to Defaults]    │
└──────────────────────────────────────────────────────────────┘
```

### Settings Tabs

| Tab          | Contents                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Video**    | Resolution, fullscreen/windowed/borderless, render mode (Classic/HD/3D), zoom limits, UI scale, shroud style (hard/smooth edges), FPS limit, VSync. Theme selection (Classic/Remastered/Modern/community). Cutscene playback preference (`Auto` / `Original` / `Clean Remaster` / `AI Enhanced` / `Briefing Fallback`). Display language / subtitle language selection and UI text direction (`Auto`, `LTR`, `RTL`) test override for localization QA/creators. Cutscene subtitle/CC fallback policy (primary + secondary language chain, original-audio fallback behavior). Optional `Allow Machine-Translated Subtitles/CC Fallback` toggle (clearly labeled, trust-tagged, off by default unless user opts in). |
| **Audio**    | Master / Music / SFX / Voice / Ambient volume sliders. Music mode (Jukebox/Dynamic/Off). EVA voice. Spatial audio toggle. Voice-over preferences (D068): per-category selection/fallback for `EVA`, `Unit Responses`, and campaign/cutscene dialogue dubs where installed (`Auto` / specific language or style pack / `Off` where subtitle/CC fallback exists). |
| **Controls** | Official input profiles by device: `Classic RA (KBM)`, `OpenRA (KBM)`, `Modern RTS (KBM)`, `Gamepad Default`, `Steam Deck Default`, plus `Custom` (profile diff). Full rebinding UI with category filters (Unit Commands, Production, Control Groups, Camera, Communication, UI/System, Debug). Mouse settings: edge scroll speed, scroll inversion, drag selection shape. Controller/Deck settings: deadzones, stick curves, cursor acceleration, radial behavior, gyro sensitivity (when available). Touch settings: handedness (mirror layout), touch target size, hold/drag thresholds, command rail behavior, camera bookmark dock preferences. Includes `Import`, `Export`, and `Share on Workshop` (config-profile packages with scope/diff preview), plus `View Controls Quick Reference` and `What's Changed in Controls` replay entry. |
| **Gameplay** | Experience profile (one-click preset). Balance preset. Pathfinding preset. AI behavior preset. Full D033 QoL toggle list organized by category: Production, Commands, UI Feedback, Selection, Gameplay. Tutorial hint frequency, Controls Walkthrough prompts, and mobile Tempo Advisor warnings (client-only) also live here. |
| **Social**   | Voice settings: PTT key, input/output device, voice effect preset, mic test. Chat settings: profanity filter, emojis, auto-translated phrases. Privacy: who can spectate, who can friend-request, online status visibility, and **campaign progress / benchmark sharing** controls (D021/D052/D053).                                         |
| **LLM**      | Provider cards (add/edit/remove LLM providers). Task routing table (which provider handles which task). Connection test. Community config import/export (D047).                                                                                                     |
| **Data**     | Content sources (detected game installations, manual paths, re-scan). **Installed Content Manager** (install profiles like `Minimal Multiplayer` / `Campaign Core` / `Full`, optional media packs, media variant groups such as cutscenes `Original` / `Clean Remaster` / `AI Enhanced` and voice-over variants by language/style, language capability badges for media packs (`Audio`, `Subs`, `CC`), translation source/trust labels, size estimates, reclaimable space). **Modify Installation / Repair & Verify** (D069 maintenance wizard re-entry). Data health summary. Backup/Restore buttons. Cloud sync toggle. Mod profile manager link. Storage usage. Export profile data (GDPR, D061). Recovery phrase viewer ("Show my 24-word phrase"). |

---

### Localization Directionality & RTL Display Behavior (Settings → Video / Accessibility)

IC supports RTL languages (e.g., Arabic/Hebrew) as a **text + layout** feature, not only a font feature.

- **Default behavior:** UI direction follows the selected display language (`Auto`).
- **Testing/QA override:** `LTR` / `RTL` override is available for creators/QA without changing the language pack.
- **Selective mirroring:** menus, settings panels, profile cards, chat panes, and other list/detail UI generally mirror in RTL; battlefield/world-space semantics (map orientation, minimap world mapping, marker coordinates) do not blindly mirror.
- **Directional icons/images:** icons and UI art follow their declared RTL policy (`mirror_in_rtl` or fixed-orientation). Baked-text images require localized variants when used.
- **Communication text:** chat, ping labels, and tactical marker labels render legitimate RTL text correctly while D059 still filters dangerous spoofing controls.

```
┌─────────────────────────────────────────────────────────────────┐
│  SETTINGS → VIDEO / ACCESSIBILITY (LOCALIZATION DIRECTION)     │
│                                                                 │
│  Display language:        [Hebrew ▾]                            │
│  Subtitle language:       [Hebrew ▾]                            │
│  UI text direction:       [Auto (RTL) ▾]                        │
│                          (Auto / LTR / RTL - test override)     │
│                                                                 │
│  Directional icon policy preview: [Show Samples ✓]              │
│  Baked-text asset warnings:        [Show in QA overlay ✓]       │
│                                                                 │
│  [Preview Settings Screen]  [Preview Briefing Panel]            │
│  [Preview Chat + Marker Labels]                                 │
│                                                                 │
│  Note: World/minimap orientation is not globally mirrored.      │
│  D059 anti-spoof filtering protects chat/marker labels while    │
│  preserving legitimate RTL script rendering.                    │
└─────────────────────────────────────────────────────────────────┘
```

---

### Campaign Progress Sharing & Privacy (Settings → Social)

Campaign progress cards and community benchmarks are **local-first** and **opt-in**. The player controls whether campaign progress leaves the machine, which communities may receive aggregated snapshots, and how spoiler-sensitive comparisons are displayed.

```
┌─────────────────────────────────────────────────────────────────┐
│  SETTINGS → SOCIAL → PRIVACY (CAMPAIGN PROGRESS)               │
│                                                                 │
│  Campaign Progress (local UI)                                   │
│  ☑ Show campaign progress on profile stats card                 │
│  ☑ Show campaign progress in campaign browser cards             │
│                                                                 │
│  Community Benchmarks (optional)                                │
│  ☐ Share campaign progress for community benchmarks             │
│     Sends aggregated progress snapshots only (not full mission  │
│     history) when enabled. Works per campaign version /         │
│     difficulty / balance preset.                                │
│                                                                 │
│  If sharing is enabled:                                         │
│  Scope: [Trusted Communities Only ▾]                            │
│         (Trusted Only / Selected Communities / All Joined)      │
│  [Select Communities…]  (Official IC ✓, Clan Wolfpack ✗, ...)   │
│                                                                 │
│  Spoiler handling for benchmark UI: [Spoiler-Safe (Default) ▾]  │
│     Spoiler-Safe / Reveal Reached Branches / Full Reveal*       │
│     *If campaign author permits full reveal metadata            │
│                                                                 │
│  Benchmark source labels: [Always Show ✓]                       │
│  Benchmark trust labels:  [Always Show ✓]                       │
│                                                                 │
│  [Preview My Shared Snapshot →]                                 │
│  [Reset benchmark sharing for this device]                      │
│                                                                 │
│  Note: Campaign benchmarks are social/comparison features only. │
│  They do not affect matchmaking, ranked, or anti-cheat systems. │
└─────────────────────────────────────────────────────────────────┘
```

**Defaults (normative):**
- Community benchmark sharing is **off** by default.
- Spoiler mode defaults to **Spoiler-Safe**.
- Source/trust labels are visible by default when benchmark data is shown.
- Disabling sharing does **not** disable local campaign progress UI.

---

### Installation Maintenance Wizard (D069, Settings → Data)

The D069 wizard is re-enterable after first launch for guided maintenance and recovery tasks. It complements (not replaces) the Installed Content Manager.

#### Maintenance Hub (Modify / Repair / Verify)

```
┌─────────────────────────────────────────────────────────────────┐
│  MODIFY INSTALLATION / REPAIR                                  │
│                                                                 │
│  Status: Playable ✓   Last verify: 14 days ago                  │
│  Active preset: Full Install                                    │
│  Sources: Steam Remastered + OpenRA (fallback)                  │
│                                                                 │
│  What do you want to do?                                        │
│                                                                 │
│  [Change Install Preset / Packs]                                │
│     Add/remove media packs, switch variants, reclaim space      │
│                                                                 │
│  [Repair & Verify Content]                                      │
│     Check hashes, re-download corrupt files, rebuild indexes     │
│                                                                 │
│  [Re-Scan Content Sources]                                      │
│     Re-detect Steam/GOG/OpenRA/manual folders                    │
│                                                                 │
│  [Reset Setup Assistant]                                        │
│     Re-run D069 setup flow (keeps installed content)            │
│                                                                 │
│  [Close]                                                        │
└─────────────────────────────────────────────────────────────────┘
```

#### Repair & Verify Flow (Guided)

```
┌─────────────────────────────────────────────────────────────────┐
│  REPAIR & VERIFY CONTENT                          Step 1/3      │
│                                                                 │
│  Select repair actions:                                         │
│   ☑ Verify installed packages (checksums)                       │
│   ☑ Rebuild content indexes / metadata                          │
│   ☑ Re-scan content source mappings                             │
│   ☐ Reclaim unreferenced blobs (GC)                             │
│                                                                 │
│  Binary files (Steam build):                                    │
│   [Open Steam "Verify integrity" guide]                         │
│                                                                 │
│  [Start Repair]                              [Back]             │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│  REPAIR & VERIFY CONTENT                          Step 2/3      │
│                                                                 │
│  Verifying installed packages…                                  │
│  [██████████████████░░░░░░░░] 61%                               │
│                                                                 │
│  ✓ official/ra1-campaign-core@1.0                               │
│  ! official/ra1-cutscenes-original@1.0  (1 file corrupted)      │
│                                                                 │
│  Recommended fix: Re-download 1 corrupted file (42 MB)          │
│  Source: P2P preferred / HTTP fallback                          │
│                                                                 │
│  [Apply Fix] [Skip Optional Pack] [Show Details]                │
└─────────────────────────────────────────────────────────────────┘
```

- Repair separates **platform binary verification** from **IC content/setup verification**
- Optional packs can be skipped without breaking campaign core (D068 fallback rules)
- The same flow is reachable from no-dead-end guidance panels when missing/corrupt content is detected
